#!/usr/bin/env node
"use strict";

// =========================================================================
// new.js — scaffolder pour un nouveau sujet
// -------------------------------------------------------------------------
// Crée un nouveau fichier configs/<slug>.js pré-rempli avec un squelette
// que tu n'as plus qu'à compléter (sources et mots-clés).
//
// Usage :
//   node blog/automation/topics/new.js <slug> "<label>" "<description>" [mode]
//
// Exemples :
//   node blog/automation/topics/new.js f1 "Formule 1" "Grand Prix, écuries, paddock, FIA." fr-intl
//   node blog/automation/topics/new.js musique "Musique" "Sorties, concerts, charts FR et international." fr-intl
//   node blog/automation/topics/new.js politique "Politique FR" "Vie politique française." fr
//
// Une fois créé :
//   1. Édite configs/<slug>.js (sources, mots-clés, hints).
//   2. Lance : docker compose restart blog
// =========================================================================

const fs = require("node:fs");
const path = require("node:path");

const [, , slugArg, labelArg, descArg, modeArg] = process.argv;

if (!slugArg || !labelArg) {
  console.error('Usage : node blog/automation/topics/new.js <slug> "<label>" "<description>" [mode]');
  console.error("       slug : minuscules, chiffres, tirets uniquement (sera l'URL /<slug>)");
  console.error("       mode : fr | intl | fr-intl  (défaut : fr-intl)");
  process.exit(1);
}

const slug = String(slugArg).trim().toLowerCase();
if (!/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(slug)) {
  console.error(`Slug invalide "${slug}" : minuscules, chiffres, tirets seulement, sans tiret en début/fin.`);
  process.exit(1);
}

const label = String(labelArg).trim();
const description = String(descArg || "").trim();
const mode = ["fr", "intl", "fr-intl"].includes(modeArg) ? modeArg : "fr-intl";

const targetPath = path.join(__dirname, "configs", `${slug}.js`);
if (fs.existsSync(targetPath)) {
  console.error(`Le fichier ${targetPath} existe déjà. Modifie-le directement, ou supprime-le pour recommencer.`);
  process.exit(1);
}

const content = `// =========================================================================
// 📌 ${label}
// Squelette généré par new.js. Complète sources, mots-clés et hints, puis :
//   docker compose restart blog
// =========================================================================

module.exports = {
  slug: ${JSON.stringify(slug)},
  label: ${JSON.stringify(label)},
  description: ${JSON.stringify(description)},
  mode: ${JSON.stringify(mode)},

  // Termes de recherche pour les sources Google News (méthode 'google').
  // Concatène les mots-clés clés avec OR et garde-les entre parenthèses.
  searchTerms: '(${label} OR mot-clé-1 OR "expression exacte")',

  // Mots-clés que les articles DOIVENT contenir (au moins un). Lower-case.
  // Vide = on accepte tout ce qui passe les filtres négatifs (utile uniquement
  // si tes sources sont déjà très ciblées).
  positiveKeywords: [
    // 'mot-cle-1',
    // 'mot-cle-2'
  ],

  // Mots-clés qui éliminent immédiatement un article (priorité sur le positif).
  negativeKeywords: [
    'horoscope', 'soldes', 'meilleur prix', 'bons plans', 'code promo',
    'top 10 des', 'walkthrough', 'tier list'
  ],

  // Âge max d'un article pour être retenu, en jours.
  maxAgeDays: { google: 3, rss: 7 },

  // Caps de sélection finale (FR / INT / total).
  caps: { fr: 14, intl: 18, total: 36 },

  // Indications éditoriales transmises à Gemini, en plus du prompt général.
  editorialHints: [
    "- Précise toujours <quelque chose de spécifique au sujet>.",
    "- Évite <ce que tu ne veux pas voir>."
  ].join('\\n'),

  // Liste des sources. Pour chaque source :
  //   name        : libellé affiché.
  //   region      : 'fr' | 'intl'.
  //   method      : 'rss' (lit le flux) | 'google' (Google News par site).
  //   url         : URL du flux RSS (si method = 'rss').
  //   siteDomain  : domaine cherché par Google News (si method = 'google').
  //   max         : nombre max d'articles à conserver pour cette source.
  sources: [
    // { name: 'Source RSS',     region: 'fr',   method: 'rss',    url: 'https://example.fr/feed', max: 5 },
    // { name: 'Source Google',  region: 'intl', method: 'google', siteDomain: 'example.com',      max: 4 }
  ]
};
`;

fs.writeFileSync(targetPath, content);
console.log(`✓ Créé : ${path.relative(process.cwd(), targetPath)}`);
console.log("\nProchaines étapes :");
console.log(`  1. Édite ${path.relative(process.cwd(), targetPath)} (ajoute tes sources et mots-clés).`);
console.log("  2. Lance : docker compose restart blog");
console.log(`  3. Vérifie avec : docker compose exec blog node automation/run-now.js ${slug}`);
