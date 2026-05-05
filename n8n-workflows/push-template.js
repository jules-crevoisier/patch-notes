// Pousse le contenu de topic-recap-template.json dans la BDD n8n existante,
// pour mettre à jour le workflow déjà importé (préserve l'ID donc les
// références d'historique / executions).
//
// Usage : node n8n-workflows/push-template.js
//
// Le script écrit un fichier SQL temporaire avec le contenu JSON en
// dollar-quoting ($nodes$...$nodes$) pour éviter tout souci d'échappement,
// puis l'envoie à `docker compose exec postgres psql` via stdin.

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync, execSync } = require('node:child_process');
const { randomUUID } = require('node:crypto');

const TEMPLATE_PATH = path.join(__dirname, 'topic-recap-template.json');
const WORKFLOW_NAME = 'Recap topic - TEMPLATE (duplique-moi)';

const template = JSON.parse(fs.readFileSync(TEMPLATE_PATH, 'utf8'));
const nodes = JSON.stringify(template.nodes);
const connections = JSON.stringify(template.connections);
const settings = JSON.stringify(template.settings || {});
const meta = JSON.stringify(template.meta || {});
const pinData = JSON.stringify(template.pinData || {});

for (const blob of [nodes, connections, settings, meta, pinData]) {
  if (blob.includes('$nodes$') || blob.includes('$conns$')) {
    console.error('Le contenu contient un délimiteur réservé. Refus de continuer.');
    process.exit(1);
  }
}

const versionId = randomUUID();
const sql = `UPDATE workflow_entity SET
  nodes = $nodes$${nodes}$nodes$::json,
  connections = $conns$${connections}$conns$::json,
  settings = $sett$${settings}$sett$::json,
  meta = $meta$${meta}$meta$::json,
  "pinData" = $pin$${pinData}$pin$::json,
  "updatedAt" = NOW(),
  "versionId" = '${versionId}',
  "versionCounter" = "versionCounter" + 1
WHERE name = '${WORKFLOW_NAME.replace(/'/g, "''")}'
RETURNING id, name, active, "updatedAt";
`;

const result = spawnSync(
  'docker',
  ['compose', 'exec', '-T', 'postgres', 'psql', '-U', 'patchnotes', '-d', 'n8n'],
  { input: sql, encoding: 'utf8' }
);

if (result.status !== 0) {
  console.error('PSQL a échoué :', result.stderr);
  process.exit(result.status || 1);
}

const out = result.stdout.trim();
if (!out.includes('UPDATE 1')) {
  console.warn(out);
  console.warn('\n!! Le workflow', JSON.stringify(WORKFLOW_NAME), 'n\'a pas été trouvé dans la BDD.');
  console.warn('   → Importe topic-recap-template.json dans n8n une première fois,');
  console.warn('     puis relance ce script.');
  process.exit(2);
}

console.log(out);
console.log('\nWorkflow mis à jour avec succès. Redémarre n8n pour que le cache se rafraîchisse :');
console.log('  docker compose restart n8n');
