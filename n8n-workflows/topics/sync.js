// =========================================================================
// sync.js — commande tout-en-un
// -------------------------------------------------------------------------
// Enchaîne dans le bon ordre, avec arrêt au premier échec :
//   1. build.js       configs/*.js   → topics/<slug>.json
//   2. push-all.js    topics/*.json  → BDD n8n (workflow_entity + history + shared)
//   3. sync-meta.js   configs/*.js   → BDD blog (label / description / mode)
//   4. docker compose restart n8n    (rafraîchit le cache n8n)
//
// Usage :
//   node n8n-workflows/topics/sync.js
//
// Options :
//   --no-restart     ne redémarre pas n8n (si tu enchaînes plusieurs syncs)
// =========================================================================

const path = require('node:path');
const { spawnSync } = require('node:child_process');

const SCRIPT_DIR = __dirname;
const noRestart = process.argv.includes('--no-restart');

function run(label, command, args, options = {}) {
  const banner = `\n────── ${label} ──────`;
  console.log(banner);
  const r = spawnSync(command, args, {
    stdio: 'inherit',
    shell: process.platform === 'win32',
    ...options
  });
  if (r.status !== 0) {
    console.error(`\n✗ ${label} a échoué (code ${r.status}). Sync interrompu.`);
    process.exit(r.status || 1);
  }
}

run('1/4  build (configs → topics/*.json)',         'node', [path.join(SCRIPT_DIR, 'build.js')]);
run('2/4  push-all (topics/*.json → BDD n8n)',      'node', [path.join(SCRIPT_DIR, 'push-all.js')]);
run('3/4  sync-meta (configs → BDD blog)',          'node', [path.join(SCRIPT_DIR, 'sync-meta.js')]);

if (noRestart) {
  console.log('\n--no-restart : on saute le redémarrage de n8n.');
} else {
  run('4/4  docker compose restart n8n',            'docker', ['compose', 'restart', 'n8n']);
}

console.log('\n✓ Sync complet. Tes sujets sont prêts dans n8n et dans le hub.');
