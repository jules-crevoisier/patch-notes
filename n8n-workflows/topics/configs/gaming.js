// =========================================================================
// 🎮 Gaming — sorties, business du jeu vidéo, signaux de fond.
// Édite ce fichier puis lance `node n8n-workflows/topics/build.js`.
// =========================================================================

module.exports = {
  slug: 'gaming',
  label: 'Gaming',
  description: "Sorties, mises à jour majeures, business et signaux de fond du jeu vidéo.",
  mode: 'fr-intl',

  searchTerms:
    '(jeu OR jeux OR gaming OR videogame OR "video game" OR studio OR éditeur OR sortie OR PS5 OR Xbox OR Switch OR "Game Pass" OR Steam OR "Epic Games" OR Nintendo OR Sony OR Microsoft OR Activision OR Ubisoft OR "Square Enix" OR remake OR remaster OR release)',

  positiveKeywords: [
    'jeu vidéo', 'jeux vidéo', 'gaming', 'video game', 'videogame', 'studio', 'éditeur', 'publisher',
    'ps5', 'playstation', 'xbox', 'series x', 'series s', 'switch', 'switch 2', 'steam', 'steam deck',
    'epic games', 'nintendo', 'sony', 'microsoft', 'activision', 'ubisoft', 'ea ', 'electronic arts',
    'square enix', 'capcom', 'bethesda', 'bandai', 'sega', 'rockstar', "take-two", 'cd projekt',
    'remake', 'remaster', 'sortie', 'release', 'launch', 'date de sortie', 'release date',
    'game pass', 'ps plus', 'epic store', 'développeur', 'developer', 'rachat', 'acquisition',
    'fermeture studio', 'layoffs', 'licenciement', 'gameplay', 'trailer', 'reveal', 'showcase',
    'state of play', 'nintendo direct', 'xbox showcase', 'summer game fest', 'gamescom', 'tokyo game show'
  ],

  negativeKeywords: [
    'how to complete', 'questline', 'where to find', 'unlock ', 'walkthrough', 'loadout',
    'guide ', 'soluce', 'patch notes', 'notes de patch', 'tier list', 'best build',
    'codes ', 'redeem', 'speedrun', 'streamer', 'cosplay', 'merch', 'tapis de souris',
    't-shirt', 'figurine', 'collector', 'manette pour', 'meilleur prix', 'bons plans',
    'code promo', 'soldes', 'black friday', 'comparatif des'
  ],

  maxAgeDays: { google: 3, rss: 7 },
  caps: { fr: 14, intl: 18, total: 36 },

  editorialHints: [
    "- Distingue clairement annonce, sortie effective, mise à jour majeure et patch correctif.",
    "- Mets en avant les mouvements industriels (rachats, fermetures de studio, layoffs) plutôt que les guides ou astuces.",
    "- Cite toujours le studio développeur ET l'éditeur quand c'est pertinent (ex. 'développé par Larian, édité par...')."
  ].join('\n'),

  sources: [
    { name: 'Gamekult',          region: 'fr',   method: 'rss',    url: 'https://www.gamekult.com/feed.xml', max: 6 },
    { name: 'Jeuxvideo.com',     region: 'fr',   method: 'rss',    url: 'https://www.jeuxvideo.com/rss/rss-news.xml', max: 6 },
    { name: 'Numerama Gaming',   region: 'fr',   method: 'google', siteDomain: 'numerama.com',  max: 4 },
    { name: 'Frandroid Gaming',  region: 'fr',   method: 'google', siteDomain: 'frandroid.com', max: 4 },
    { name: 'JV Le Mag',         region: 'fr',   method: 'google', siteDomain: 'jvlemag.com',   max: 3 },
    { name: 'Le Monde Pixels',   region: 'fr',   method: 'google', siteDomain: 'lemonde.fr',    max: 3 },
    { name: 'Polygon',           region: 'intl', method: 'rss',    url: 'https://www.polygon.com/rss/index.xml', max: 6 },
    { name: 'Eurogamer',         region: 'intl', method: 'rss',    url: 'https://www.eurogamer.net/?format=rss', max: 6 },
    { name: 'PC Gamer',          region: 'intl', method: 'rss',    url: 'https://www.pcgamer.com/rss/', max: 5 },
    { name: 'The Verge',         region: 'intl', method: 'rss',    url: 'https://www.theverge.com/rss/index.xml', max: 4 },
    { name: 'Kotaku',            region: 'intl', method: 'rss',    url: 'https://kotaku.com/rss', max: 4 },
    { name: 'IGN',               region: 'intl', method: 'rss',    url: 'https://feeds.feedburner.com/ign/news', max: 5 },
    { name: 'GameSpot',          region: 'intl', method: 'google', siteDomain: 'gamespot.com',  max: 3 },
    { name: 'VGC',               region: 'intl', method: 'google', siteDomain: 'videogameschronicle.com', max: 3 }
  ]
};
