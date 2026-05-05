// =========================================================================
// 🏆 Sport — football, rugby, tennis, F1, NBA, JO, Top 14...
// Édite ce fichier puis lance `node n8n-workflows/topics/build.js`.
// =========================================================================

module.exports = {
  slug: 'sport',
  label: 'Sport',
  description: 'Football, rugby, tennis, F1, NBA, Top 14 et autres compétitions majeures.',
  mode: 'fr-intl',

  searchTerms:
    '(football OR rugby OR tennis OR basket OR F1 OR "Formule 1" OR NBA OR "Ligue 1" OR "Premier League" OR "Champions League" OR "Roland-Garros" OR Wimbledon OR "Tour de France" OR JO OR Olympics OR "Top 14" OR "World Cup" OR "Coupe du Monde" OR mercato OR transfert)',

  positiveKeywords: [
    'football', 'rugby', 'tennis', 'basketball', 'basket', 'f1', 'formula 1', 'formule 1', 'nba',
    'ligue 1', 'ligue 2', 'premier league', 'champions league', 'liga', 'bundesliga', 'serie a',
    'roland-garros', 'wimbledon', 'us open', 'australian open', 'tour de france', 'paris-roubaix',
    'jo ', 'olympics', 'jeux olympiques', 'top 14', 'pro d2', 'coupe du monde', 'world cup',
    'mercato', 'transfert', 'transfer', 'finale', 'demi-finale', 'quart de finale', 'qualification',
    'classement', 'standings', 'champion du monde', 'champion d europe', 'record du monde',
    'sélection', 'coach', 'entraîneur', 'manager', 'capitaine', 'arbitre', 'fia', 'fifa', 'uefa',
    'cio', 'world athletics', 'atp', 'wta', 'wnba', 'nhl', 'mlb', 'nfl'
  ],

  negativeKeywords: [
    'e-sport', 'esport', 'esports', 'compétition de jeux', 'tournoi gaming', 'jeu vidéo',
    'paris sportifs', 'parions', 'cote ', 'pronostic', 'pronostique', 'meilleur bookmaker',
    'streaming live', 'horoscope', 'top 10 des plus', 'classement people', 'wags', 'compagne de'
  ],

  maxAgeDays: { google: 2, rss: 4 },
  caps: { fr: 14, intl: 14, total: 28 },

  editorialHints: [
    "- Privilégie résultats, blessures, sanctions, transferts confirmés et déclarations officielles.",
    "- Précise systématiquement la compétition (ex. 'demi-finale Champions League', pas 'demi-finale').",
    "- Évite les rumeurs de mercato non sourcées et les contenus paris sportifs / pronostics."
  ].join('\n'),

  sources: [
    { name: "L'Équipe",           region: 'fr',   method: 'rss',    url: 'https://dwh.lequipe.fr/api/edito/rss', max: 8 },
    { name: 'RMC Sport Foot',     region: 'fr',   method: 'rss',    url: 'https://rmcsport.bfmtv.com/rss/football/', max: 5 },
    { name: 'Eurosport FR',       region: 'fr',   method: 'google', siteDomain: 'eurosport.fr',     max: 5 },
    { name: 'Le Figaro Sport',    region: 'fr',   method: 'google', siteDomain: 'lefigaro.fr',      max: 4 },
    { name: 'France Info Sport',  region: 'fr',   method: 'google', siteDomain: 'francetvinfo.fr',  max: 4 },
    { name: '20 Minutes Sport',   region: 'fr',   method: 'google', siteDomain: '20minutes.fr',     max: 3 },
    { name: 'ESPN',               region: 'intl', method: 'rss',    url: 'https://www.espn.com/espn/rss/news', max: 6 },
    { name: 'BBC Sport',          region: 'intl', method: 'rss',    url: 'http://feeds.bbci.co.uk/sport/rss.xml', max: 6 },
    { name: 'The Guardian Sport', region: 'intl', method: 'google', siteDomain: 'theguardian.com',  max: 5 },
    { name: 'Sky Sports',         region: 'intl', method: 'google', siteDomain: 'skysports.com',    max: 4 },
    { name: 'The Athletic',       region: 'intl', method: 'google', siteDomain: 'nytimes.com',      max: 3 }
  ]
};
