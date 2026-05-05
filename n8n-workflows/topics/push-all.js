// =========================================================================
// push-all.js
// -------------------------------------------------------------------------
// Synchronise tous les workflows topics/<slug>.json dans la base n8n.
//
// Pour chaque fichier :
//   - si un workflow_entity existe déjà avec le même `name`, on l'UPDATE
//     (préserve son ID, son historique, ses schedules, son état actif),
//   - sinon on l'INSERT en désactivé (l'utilisateur active manuellement).
//
// Le passage par dollar-quoting psql ($qN$...$qN$::json) évite tout problème
// d'échappement de JSON. Aucun port postgres n'a besoin d'être exposé sur
// l'host : on passe par `docker compose exec`.
//
// Usage : node n8n-workflows/topics/push-all.js
//
// Suggestion : après ce script, fais `docker compose restart n8n` pour que
// le cache de n8n se rafraîchisse, puis active les workflows dans l'UI.
// =========================================================================

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { randomUUID } = require('node:crypto');

const TOPICS_DIR = __dirname;

function quote(name) {
  return `'${String(name).replace(/'/g, "''")}'`;
}

function exec(sql) {
  const r = spawnSync(
    'docker',
    ['compose', 'exec', '-T', 'postgres', 'psql', '-U', 'patchnotes', '-d', 'n8n', '-tA'],
    { input: sql, encoding: 'utf8' }
  );
  if (r.status !== 0) {
    throw new Error(`psql failed (status ${r.status}) : ${r.stderr || r.stdout}`);
  }
  return r.stdout.trim();
}

function buildJsonLiteral(tag, value) {
  const json = JSON.stringify(value);
  if (json.includes(`$${tag}$`)) {
    throw new Error(`Le contenu JSON contient déjà le délimiteur $${tag}$`);
  }
  return `$${tag}$${json}$${tag}$::json`;
}

function findExistingId(name) {
  const out = exec(`SELECT id FROM workflow_entity WHERE name = ${quote(name)} LIMIT 1;`);
  return out || null;
}

// n8n nécessite une entrée shared_workflow pour qu'un workflow soit visible
// dans l'UI. On le rattache au premier projet personnel trouvé (= l'utilisateur
// qui a setup le compte). Si plusieurs comptes existent, on prend le plus
// ancien.
function getDefaultProjectId() {
  const out = exec(
    "SELECT id FROM project WHERE type = 'personal' ORDER BY \"createdAt\" ASC LIMIT 1;"
  );
  if (!out) {
    throw new Error(
      "Aucun projet personnel trouvé. Connecte-toi au moins une fois à n8n (http://localhost:5678) pour initialiser ton compte, puis relance ce script."
    );
  }
  return out;
}

function ensureSharedWorkflow(workflowId, projectId) {
  exec(`INSERT INTO shared_workflow ("workflowId", "projectId", role, "createdAt", "updatedAt")
    VALUES ('${workflowId}', '${projectId}', 'workflow:owner', NOW(), NOW())
    ON CONFLICT ("workflowId", "projectId") DO NOTHING;`);
}

// n8n exige une ligne workflow_history dont le versionId correspond à
// workflow_entity.versionId, sinon il refuse d'activer/publier le workflow
// avec l'erreur "Version not found". On en crée une à chaque upsert.
function recordHistory({ workflowId, versionId, name, nodesLit, connsLit }) {
  exec(`INSERT INTO workflow_history (
    "versionId", "workflowId", authors, "createdAt", "updatedAt",
    nodes, connections, name, autosaved
  ) VALUES (
    '${versionId}', '${workflowId}', 'patch-notes builder',
    NOW(), NOW(),
    ${nodesLit}, ${connsLit}, ${quote(name)}, false
  ) ON CONFLICT ("versionId") DO NOTHING;`);
}

function upsertWorkflow(workflow, projectId) {
  const name = workflow.name;
  const nodesLit = buildJsonLiteral('nodes', workflow.nodes);
  const connsLit = buildJsonLiteral('conns', workflow.connections);
  const settLit = buildJsonLiteral('sett', workflow.settings || {});
  const metaLit = buildJsonLiteral('meta', workflow.meta || {});
  const pinLit = buildJsonLiteral('pin', workflow.pinData || {});
  const versionId = randomUUID();

  const existingId = findExistingId(name);
  let id;
  let action;

  if (existingId) {
    exec(`UPDATE workflow_entity SET
      nodes = ${nodesLit},
      connections = ${connsLit},
      settings = ${settLit},
      meta = ${metaLit},
      "pinData" = ${pinLit},
      "updatedAt" = NOW(),
      "versionId" = '${versionId}',
      "versionCounter" = "versionCounter" + 1
    WHERE id = '${existingId}';`);
    id = existingId;
    action = 'updated';
  } else {
    id = randomUUID().replace(/-/g, '').slice(0, 16);
    exec(`INSERT INTO workflow_entity (
      id, name, active, nodes, connections, settings, meta, "pinData",
      "createdAt", "updatedAt", "versionId", "triggerCount", "versionCounter", "isArchived"
    ) VALUES (
      '${id}', ${quote(name)}, false,
      ${nodesLit}, ${connsLit}, ${settLit}, ${metaLit}, ${pinLit},
      NOW(), NOW(), '${versionId}', 0, 1, false
    );`);
    action = 'inserted';
  }

  ensureSharedWorkflow(id, projectId);
  recordHistory({
    workflowId: id,
    versionId,
    name,
    nodesLit,
    connsLit
  });
  return { action, id, name };
}

function main() {
  const files = fs.readdirSync(TOPICS_DIR).filter((f) => f.endsWith('.json')).sort();
  if (files.length === 0) {
    console.error('Aucun .json trouvé dans topics/. Lance build.js d\'abord.');
    process.exit(1);
  }

  const projectId = getDefaultProjectId();
  console.log(`Projet cible : ${projectId}\n`);

  const results = [];
  for (const file of files) {
    const wf = JSON.parse(fs.readFileSync(path.join(TOPICS_DIR, file), 'utf8'));
    try {
      const r = upsertWorkflow(wf, projectId);
      console.log(`${r.action.padEnd(8)} ${r.name.padEnd(28)} (${r.id})`);
      results.push(r);
    } catch (err) {
      console.error(`ERREUR sur ${file} :`, err.message);
      results.push({ action: 'error', name: wf.name, error: err.message });
    }
  }

  const errors = results.filter((r) => r.action === 'error');
  console.log(`\nTotal : ${results.length - errors.length}/${results.length} OK.`);

  if (errors.length === 0) {
    console.log('\nProchaines étapes :');
    console.log('  docker compose restart n8n');
    console.log('  Puis dans n8n : active chaque workflow, pas le TEMPLATE.');
  }

  process.exit(errors.length > 0 ? 1 : 0);
}

main();
