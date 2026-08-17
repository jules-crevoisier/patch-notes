// =========================================================================
// 🔭 Espace & Sciences — découvertes, lancements, recherche.
// Édite ce fichier puis `docker compose restart blog` pour recharger.
// =========================================================================

module.exports = {
  slug: 'espace-sciences',
  label: 'Espace & Sciences',
  description: 'Découvertes scientifiques, exploration spatiale, lancements et recherche.',
  mode: 'fr-intl',

  searchTerms:
    '(NASA OR ESA OR SpaceX OR fusée OR lancement OR exoplanète OR télescope OR découverte scientifique OR astronomie OR physique)',

  positiveKeywords: [
    'nasa', 'esa', 'spacex', 'cnes', 'roscosmos', 'fusée', 'lanceur', 'lancement',
    'satellite', 'starlink', 'starship', 'falcon 9', 'iss', 'station spatiale',
    'exoplanète', 'télescope', 'james webb', 'hubble', 'astronomie', 'astrophysique',
    'découverte', 'étude publiée', 'recherche', 'chercheurs', 'laboratoire',
    'cnrs', 'inserm', 'physique', 'biologie', 'génétique', 'climat', 'espèce',
    'fossile', 'archéologie', 'vaccin', 'essai clinique', 'mission spatiale',
    'astronaute', 'spationaute', 'sonde', 'rover', 'mars', 'lune', 'artemis'
  ],

  negativeKeywords: [
    'horoscope', 'astrologie', 'signe astrologique', 'meilleur prix', 'bons plans',
    'code promo', 'comparatif', 'top 10 des', "guide d'achat"
  ],

  maxAgeDays: { google: 3, rss: 6 },
  caps: { fr: 10, intl: 16, total: 26 },

  editorialHints: [
    "- Précise toujours l'agence, la mission ou l'étude concernée, pas juste 'une découverte scientifique'.",
    "- Distingue hypothèse / étude préliminaire / étude confirmée et évaluée par les pairs.",
    "- Évite l'astrologie/horoscope et les théories non scientifiques présentées comme faits."
  ].join('\n'),

  sources: [
    { name: 'Futura Sciences',      region: 'fr',   method: 'rss', url: 'https://www.futura-sciences.com/rss/actualites.xml', max: 6 },
    { name: 'Sciences et Avenir',   region: 'fr',   method: 'rss', url: 'https://www.sciencesetavenir.fr/rss.xml', max: 5 },
    { name: 'CNRS Le Journal',      region: 'fr',   method: 'rss', url: 'https://lejournal.cnrs.fr/rss', max: 4 },
    { name: 'Space.com',            region: 'intl', method: 'rss', url: 'https://www.space.com/feeds.xml', max: 6 },
    { name: 'NASA',                 region: 'intl', method: 'rss', url: 'https://www.nasa.gov/feed/', max: 4 },
    { name: 'Ars Technica Science', region: 'intl', method: 'rss', url: 'https://arstechnica.com/science/feed/', max: 5 }
  ]
};
