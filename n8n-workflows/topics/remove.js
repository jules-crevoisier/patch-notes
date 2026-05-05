// =========================================================================
// remove.js — supprime proprement un sujet partout
// -------------------------------------------------------------------------
// Cible :
//   - configs/<slug>.js                 (fichier supprimé)
//   - topics/<slug>.json                (fichier supprimé)
//   - workflow_entity dans la BDD n8n   (ON DELETE CASCADE → shared_workflow,
//                                        workflow_history, executions)
//   - topics + posts + articles dans la BDD blog (cascade déjà câblé)
//
// Usage :
//   node n8n-workflows/topics/remove.js <slug>
//   node n8n-workflows/topics/remove.js <slug> --yes   (sans confirmation)
//
// Tu peux toujours ré-importer le sujet plus tard avec new.js puis sync.js.
// =========================================================================

const fs = require('node:fs');
const path = require('node:path');
const readline = require('node:readline');
const { spawnSync } = require('node:child_process');

const args = process.argv.slice(2).filter((a) => a !== '--yes');
const skipConfirm = process.argv.includes('--yes');
const slug = args[0];

if (!slug) {
  console.error('Usage : node n8n-workflows/topics/remove.js <slug> [--yes]');
  process.exit(1);
}

const configPath = path.join(__dirname, 'configs', `${slug}.js`);
const jsonPath = path.join(__dirname, `${slug}.json`);

function quote(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function exec(db, sql) {
  const r = spawnSync(
    'docker',
    ['compose', 'exec', '-T', 'postgres', 'psql', '-U', 'patchnotes', '-d', db, '-tA'],
    { input: sql, encoding: 'utf8' }
  );
  if (r.status !== 0) {
    throw new Error(`psql failed (${r.status}) sur ${db} : ${r.stderr || r.stdout}`);
  }
  return r.stdout.trim();
}

async function confirm(prompt) {
  if (skipConfirm) return true;
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(`${prompt} [y/N] `, (ans) => {
      rl.close();
      resolve(/^y(es)?$/i.test(ans.trim()));
    });
  });
}

async function main() {
  const candidateLabels = (() => {
    if (fs.existsSync(configPath)) {
      try {
        const cfg = require(configPath);
        return cfg.label ? [cfg.label] : [];
      } catch {
        return [];
      }
    }
    return [];
  })();

  const workflowName = `Recap ${candidateLabels[0] || slug}`;
  const wfRow = exec('n8n', `SELECT id, name FROM workflow_entity WHERE name = ${quote(workflowName)} LIMIT 1;`);
  const postCount = exec('patch_notes', `SELECT COUNT(*)::int FROM posts WHERE topic_slug = ${quote(slug)};`);

  console.log(`\nSujet à supprimer : ${slug}`);
  console.log(`  configs/${slug}.js : ${fs.existsSync(configPath) ? 'présent' : 'absent'}`);
  console.log(`  topics/${slug}.json : ${fs.existsSync(jsonPath) ? 'présent' : 'absent'}`);
  console.log(`  workflow n8n      : ${wfRow ? `présent (${wfRow.split('|')[1]})` : 'absent'}`);
  console.log(`  posts en BDD blog : ${postCount}\n`);

  const ok = await confirm(`Confirmer la suppression définitive de "${slug}" (workflow + posts + articles) ?`);
  if (!ok) {
    console.log('Annulé.');
    return;
  }

  if (fs.existsSync(configPath)) {
    fs.unlinkSync(configPath);
    console.log(`✓ configs/${slug}.js supprimé`);
  }
  if (fs.existsSync(jsonPath)) {
    fs.unlinkSync(jsonPath);
    console.log(`✓ topics/${slug}.json supprimé`);
  }
  if (wfRow) {
    const id = wfRow.split('|')[0];
    exec('n8n', `DELETE FROM workflow_entity WHERE id = '${id}';`);
    console.log(`✓ workflow n8n ${id} supprimé (cascade history + shared)`);
  }

  exec('patch_notes', `DELETE FROM topics WHERE slug = ${quote(slug)};`);
  console.log(`✓ topic blog ${slug} supprimé (cascade posts + articles)`);

  console.log('\nFini. Relance docker compose restart n8n si tu veux rafraîchir le cache n8n.');
}

main().catch((err) => {
  console.error('Erreur :', err.message);
  process.exit(1);
});
