// =========================================================================
// 🎬 Cinéma & Séries — sorties, plateformes, casting, festivals, industrie.
// Édite ce fichier puis `docker compose restart blog` pour recharger.
// =========================================================================

module.exports = {
  slug: 'cinema-series',
  label: 'Cinéma & Séries',
  description: 'Sorties ciné, plateformes streaming, casting, festivals et industrie audiovisuelle.',
  mode: 'fr-intl',

  searchTerms:
    '(film OR cinéma OR série OR streaming OR Netflix OR "Prime Video" OR Disney+ OR HBO OR "Apple TV" OR Max OR Paramount+ OR sortie OR casting OR réalisateur OR director OR showrunner OR festival OR Cannes OR Venise OR Sundance OR Oscars OR Emmys OR "Golden Globes" OR "box office")',

  positiveKeywords: [
    'film', 'cinéma', 'série', 'streaming', 'netflix', 'prime video', 'disney+', 'disney plus',
    'hbo', 'max', 'apple tv', 'paramount+', 'arte', 'canal+', 'mubi',
    'sortie', 'release', 'casting', 'réalisateur', 'director', 'showrunner', 'producteur', 'producer',
    'festival', 'cannes', 'venise', 'mostra', 'sundance', 'oscars', 'césars', 'emmys', 'golden globes',
    'box office', 'trailer', 'bande-annonce', 'teaser', 'saison', 'season', 'season finale',
    'pilot', 'spin-off', 'reboot', 'préquel', 'sequel', 'remake', 'studio', 'a24', 'a-24',
    'warner bros', 'universal', 'paramount', 'sony pictures', 'lionsgate', 'pathé', 'gaumont'
  ],

  negativeKeywords: [
    'critique de jeu', 'walkthrough', 'soluce', 'tier list', 'codes ', 'redeem',
    'collectionner', 'merchandising', 'fanart', 'cosplay', 'maillot', 't-shirt',
    'horoscope', 'bons plans', 'meilleur prix', 'soldes', 'black friday', 'amazon prime day',
    'goodies', 'figurine', 'ebook gratuit', 'pdf gratuit'
  ],

  maxAgeDays: { google: 4, rss: 7 },
  caps: { fr: 14, intl: 18, total: 36 },

  editorialHints: [
    "- Distingue annonce, tournage, sortie en salle et arrivée sur plateforme : ce sont 4 jalons différents.",
    "- Cite la plateforme ou le distributeur (Netflix, Apple TV, Pathé...) quand l'info en parle.",
    "- Pour les festivals, précise la sélection : compétition officielle, Un Certain Regard, hors-compétition, etc."
  ].join('\n'),

  sources: [
    { name: 'AlloCiné',           region: 'fr',   method: 'rss',    url: 'https://www.allocine.fr/rss/news.xml', max: 6 },
    { name: 'Première',           region: 'fr',   method: 'google', siteDomain: 'premiere.fr',     max: 5 },
    { name: 'Écran Large',        region: 'fr',   method: 'google', siteDomain: 'ecranlarge.com',  max: 5 },
    { name: 'Télérama',           region: 'fr',   method: 'google', siteDomain: 'telerama.fr',     max: 4 },
    { name: 'Numerama Pop',       region: 'fr',   method: 'google', siteDomain: 'numerama.com',    max: 3 },
    { name: 'Le Monde Culture',   region: 'fr',   method: 'google', siteDomain: 'lemonde.fr',      max: 3 },
    { name: 'Variety',            region: 'intl', method: 'rss',    url: 'https://variety.com/feed/', max: 6 },
    { name: 'Hollywood Reporter', region: 'intl', method: 'rss',    url: 'https://www.hollywoodreporter.com/feed', max: 6 },
    { name: 'Deadline',           region: 'intl', method: 'rss',    url: 'https://deadline.com/feed/', max: 5 },
    { name: 'IndieWire',          region: 'intl', method: 'rss',    url: 'https://www.indiewire.com/feed', max: 4 },
    { name: 'Collider',           region: 'intl', method: 'rss',    url: 'https://collider.com/feed/', max: 4 },
    { name: 'The Wrap',           region: 'intl', method: 'google', siteDomain: 'thewrap.com',     max: 3 }
  ]
};
