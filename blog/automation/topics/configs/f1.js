// =========================================================================
// 🏎️ Formule 1 / Sport auto — F1, endurance, rallye, paddock, FIA.
// Édite ce fichier puis `docker compose restart blog` pour recharger.
// =========================================================================

module.exports = {
  slug: 'f1',
  label: 'Formule 1',
  description: 'Grands Prix, écuries, paddock, FIA, endurance et rallye.',
  mode: 'fr-intl',

  searchTerms:
    '(F1 OR "Formule 1" OR "Grand Prix" OR paddock OR FIA OR "24 Heures du Mans" OR WEC OR WRC OR rallye OR MotoGP)',

  positiveKeywords: [
    'f1', 'formule 1', 'formula 1', 'grand prix', 'gp de', 'paddock', 'pole position',
    'qualifications', 'écurie', 'team principal', 'pilote', 'fia', 'pirelli',
    'verstappen', 'hamilton', 'leclerc', 'norris', 'russell', 'piastri', 'alonso',
    'ferrari', 'red bull', 'mercedes', 'mclaren', 'aston martin', 'alpine', 'williams',
    'cadillac f1', 'sauber', 'rb f1',
    'wec', '24 heures du mans', 'endurance', 'hypercar',
    'wrc', 'rallye', 'motogp', 'moto gp', 'indycar', 'nascar',
    'safety car', 'drapeau', 'disqualification', 'pénalité', 'podium', 'classement pilotes',
    'championnat du monde', "essais libres", 'sprint'
  ],

  negativeKeywords: [
    'jeu vidéo', 'f1 24', 'f1 25', 'esport', 'simracing', 'sim racing',
    'meilleur prix', 'bons plans', 'code promo', 'horoscope', "guide d'achat",
    'billetterie pas cher', 'meilleures places'
  ],

  maxAgeDays: { google: 2, rss: 4 },
  caps: { fr: 12, intl: 14, total: 26 },

  editorialHints: [
    "- Précise toujours le Grand Prix ou la course concernée (ex. 'GP de Monza', pas 'la course').",
    "- Distingue essais libres / qualifications / course / résultat officiel.",
    "- Évite les rumeurs de transfert de pilote non confirmées par l'écurie ou le pilote."
  ].join('\n'),

  sources: [
    { name: "L'Équipe F1",       region: 'fr',   method: 'rss',    url: 'https://dwh.lequipe.fr/api/edito/rss?path=/Formule-1', max: 7 },
    { name: 'Motorsport.com FR', region: 'fr',   method: 'rss',    url: 'https://fr.motorsport.com/rss/f1/news/', max: 5 },
    { name: 'Motorsport.com',    region: 'intl', method: 'rss',    url: 'https://www.motorsport.com/rss/f1/news/', max: 6 },
    { name: 'Autosport',         region: 'intl', method: 'rss',    url: 'https://www.autosport.com/rss/f1/news/', max: 5 },
    { name: 'RaceFans',          region: 'intl', method: 'rss',    url: 'https://www.racefans.net/feed/', max: 4 }
  ]
};
