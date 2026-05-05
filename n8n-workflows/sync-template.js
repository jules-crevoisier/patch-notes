// Synchronise le code des nœuds Code de topic-recap-template.json
// avec les fichiers .js de référence dans n8n-workflows/code/.
// À lancer après chaque édition d'un fichier .js : `node n8n-workflows/sync-template.js`.

const fs = require('node:fs');
const path = require('node:path');

const root = __dirname;
const templatePath = path.join(root, 'topic-recap-template.json');
const codeDir = path.join(root, 'code');

const NODE_TO_FILE = {
  'Configurer le sujet': '01-configure-topic.js',
  'Preparer les sources': '02-prepare-sources.js',
  'Assembler recap': '03-assemble-recap.js',
  'Finaliser le post': '04-finalize-post.js'
};

const template = JSON.parse(fs.readFileSync(templatePath, 'utf8'));

let updated = 0;
for (const node of template.nodes) {
  const file = NODE_TO_FILE[node.name];
  if (!file) continue;
  const fullPath = path.join(codeDir, file);
  if (!fs.existsSync(fullPath)) {
    console.warn(`! ${file} introuvable, skip`);
    continue;
  }
  const code = fs.readFileSync(fullPath, 'utf8');
  if (node.parameters.jsCode !== code) {
    node.parameters.jsCode = code;
    updated++;
    console.log(`+ ${node.name} <- ${file}`);
  } else {
    console.log(`= ${node.name} (déjà à jour)`);
  }
}

if (updated > 0) {
  fs.writeFileSync(templatePath, JSON.stringify(template, null, 2) + '\n');
  console.log(`\n${updated} nœud(s) mis à jour dans topic-recap-template.json.`);
} else {
  console.log('\nAucun changement.');
}
