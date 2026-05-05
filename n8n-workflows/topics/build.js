// =========================================================================
// build.js
// -------------------------------------------------------------------------
// Génère un workflow n8n par sujet, à partir des configs/<slug>.js.
//
// Pour chaque config, on prend le template parent topic-recap-template.json,
// on remplace le code du nœud "Configurer le sujet" par :
//   - un en-tête généré (auto, "ne pas éditer ici"),
//   - l'objet TOPIC sérialisé depuis la config,
//   - la logique partagée (filtres, normalisation des sources)
//     extraite de code/01-configure-topic.js.
//
// Sortie : topics/<slug>.json prêt à être importé dans n8n (ou poussé en
// base via push-all.js).
//
// Usage : node n8n-workflows/topics/build.js
// =========================================================================

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const CONFIGS_DIR = path.join(__dirname, 'configs');
const TEMPLATE_PATH = path.join(ROOT, 'topic-recap-template.json');
const SHARED_LOGIC_FILE = path.join(ROOT, 'code', '01-configure-topic.js');

const SHARED_MARKER = '// ❌ NE PAS MODIFIER CE QUI SUIT';

function loadSharedLogic() {
  const file = fs.readFileSync(SHARED_LOGIC_FILE, 'utf8');
  const idx = file.indexOf(SHARED_MARKER);
  if (idx === -1) {
    throw new Error(`Marqueur "${SHARED_MARKER}" introuvable dans 01-configure-topic.js`);
  }
  const before = file.slice(0, idx);
  const boxStart = before.lastIndexOf('// =');
  if (boxStart === -1) {
    throw new Error('Boîte de séparation introuvable avant le marqueur partagé.');
  }
  return file.slice(boxStart);
}

function buildJsCode(config, sharedLogic) {
  const header = `// ============================================================================
// 📝 CONFIGURER LE SUJET — ${config.label}
// ----------------------------------------------------------------------------
// 👉 Ce nœud est GÉNÉRÉ depuis n8n-workflows/topics/configs/${config.slug}.js.
//    Pour modifier ce sujet : édite ce fichier, puis lance :
//      node n8n-workflows/topics/build.js
//      node n8n-workflows/topics/push-all.js   (synchronise n8n)
// ============================================================================

const TOPIC = ${JSON.stringify(config, null, 2)};

`;
  return header + sharedLogic;
}

function buildWorkflow(template, config, sharedLogic) {
  const wf = JSON.parse(JSON.stringify(template));
  wf.name = `Recap ${config.label}`;
  for (const node of wf.nodes) {
    if (node.name === 'Configurer le sujet') {
      node.parameters.jsCode = buildJsCode(config, sharedLogic);
    }
  }
  return wf;
}

function main() {
  if (!fs.existsSync(CONFIGS_DIR)) {
    console.error(`Dossier configs/ introuvable : ${CONFIGS_DIR}`);
    process.exit(1);
  }

  const template = JSON.parse(fs.readFileSync(TEMPLATE_PATH, 'utf8'));
  const sharedLogic = loadSharedLogic();
  const files = fs.readdirSync(CONFIGS_DIR).filter((f) => f.endsWith('.js'));

  if (files.length === 0) {
    console.error('Aucune config trouvée dans configs/.');
    process.exit(1);
  }

  let generated = 0;
  for (const file of files.sort()) {
    const fullPath = path.join(CONFIGS_DIR, file);
    delete require.cache[require.resolve(fullPath)];
    const config = require(fullPath);
    const expected = path.basename(file, '.js');
    if (!config.slug || config.slug !== expected) {
      console.warn(`! ${file} : slug "${config.slug}" ne correspond pas au nom de fichier "${expected}", skip`);
      continue;
    }
    const wf = buildWorkflow(template, config, sharedLogic);
    const outPath = path.join(__dirname, `${config.slug}.json`);
    fs.writeFileSync(outPath, JSON.stringify(wf, null, 2) + '\n');
    console.log(`+ topics/${config.slug}.json (Recap ${config.label})`);
    generated++;
  }

  console.log(`\n${generated} workflow(s) généré(s).`);
  console.log('Prochaine étape : node n8n-workflows/topics/push-all.js');
}

main();
