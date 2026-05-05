// =========================================================================
// sync-meta.js
// -------------------------------------------------------------------------
// Synchronise label / description / mode des topics dans la base patch_notes
// (BDD du blog) à partir des configs/<slug>.js.
//
// À utiliser quand tu modifies une config existante mais que tu ne veux pas
// attendre la prochaine publication n8n pour voir la description mise à jour
// dans le hub. À usage one-shot (les futures publications synchronisent
// automatiquement, voir blog/db.js > createPost).
//
// Usage : node n8n-workflows/topics/sync-meta.js
// =========================================================================

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const CONFIGS_DIR = path.join(__dirname, 'configs');

function quote(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function exec(sql) {
  const r = spawnSync(
    'docker',
    ['compose', 'exec', '-T', 'postgres', 'psql', '-U', 'patchnotes', '-d', 'patch_notes', '-tA'],
    { input: sql, encoding: 'utf8' }
  );
  if (r.status !== 0) {
    throw new Error(`psql failed (${r.status}) : ${r.stderr || r.stdout}`);
  }
  return r.stdout.trim();
}

function syncTopic({ slug, label, description, mode }) {
  const safeMode = ['fr', 'intl', 'fr-intl'].includes(mode) ? mode : 'fr-intl';
  exec(`INSERT INTO topics (slug, label, description, mode, is_listed, created_at, updated_at)
    VALUES (${quote(slug)}, ${quote(label)}, ${quote(description)}, ${quote(safeMode)}, TRUE, NOW(), NOW())
    ON CONFLICT (slug) DO UPDATE SET
      label = EXCLUDED.label,
      description = EXCLUDED.description,
      mode = EXCLUDED.mode,
      updated_at = NOW();`);
}

function main() {
  const files = fs.readdirSync(CONFIGS_DIR).filter((f) => f.endsWith('.js')).sort();
  for (const file of files) {
    const fullPath = path.join(CONFIGS_DIR, file);
    delete require.cache[require.resolve(fullPath)];
    const config = require(fullPath);
    if (!config.slug || !config.label) {
      console.warn(`! ${file} : slug ou label manquant, skip`);
      continue;
    }
    syncTopic({
      slug: config.slug,
      label: config.label,
      description: config.description || '',
      mode: config.mode
    });
    console.log(`✓ ${config.slug.padEnd(15)} ${config.label}`);
  }
  console.log(`\n${files.length} sujet(s) synchronisé(s).`);
}

main();
