// =========================================================================
// 📰 Actu générale — info à intérêt général, France et monde.
// Sujet sans positiveKeywords (les sources elles-mêmes sont déjà ciblées),
// le filtrage négatif fait le ménage du bruit (horoscope, soldes, etc.).
// Édite ce fichier puis lance `node n8n-workflows/topics/build.js`.
// =========================================================================

module.exports = {
  slug: 'general',
  label: 'Actu générale',
  description: "L'essentiel de l'info du jour, en France et dans le monde.",
  mode: 'fr-intl',

  // L'actualité généraliste se rafraîchit vite : on ne garde que les pièces
  // récentes pour éviter de republier des articles déjà consommés.
  searchTerms:
    '(actualité OR breaking OR politique OR société OR justice OR économie OR international OR diplomatie)',

  // Pas de filtre positif : les sources sont toutes des médias d'info générale,
  // on accepte tout ce qui n'est pas écarté par les négatifs ci-dessous.
  positiveKeywords: [],

  negativeKeywords: [
    'horoscope', 'météo', 'recette', 'jeux concours', 'sponsorisé', 'partenariat avec',
    'bons plans', 'shopping', 'soldes', 'promo', 'code promo', 'meilleur prix', 'comparatif',
    'mots-mêlés', 'mots-fléchés', 'mots croisés', 'sudoku', 'quiz du jour', 'quiz de la',
    'biographie', 'people', 'star ', 'amour de', 'romance', 'paparazzi', 'mariage de',
    'décolleté', 'fashion week', 'défilé', 'top 10 des', 'classement des', 'feu de la st',
    'fait du jour', 'sondage', 'jeux à gratter', 'loto'
  ],

  maxAgeDays: { google: 1, rss: 2 },
  caps: { fr: 12, intl: 12, total: 24 },

  editorialHints: [
    "- Privilégie les angles politiques, économiques, sociaux et internationaux concrets.",
    "- Évite les sujets people, mode, lifestyle, faits divers anecdotiques.",
    "- Cite toujours le contexte (pays, institution, date) quand l'article le fournit."
  ].join('\n'),

  sources: [
    { name: 'Le Monde',          region: 'fr',   method: 'rss',    url: 'https://www.lemonde.fr/rss/une.xml', max: 8 },
    { name: 'Le Figaro',         region: 'fr',   method: 'rss',    url: 'https://www.lefigaro.fr/rss/figaro_actualites.xml', max: 6 },
    { name: 'France Info',       region: 'fr',   method: 'rss',    url: 'https://www.francetvinfo.fr/titres.rss', max: 6 },
    { name: '20 Minutes',        region: 'fr',   method: 'rss',    url: 'https://www.20minutes.fr/feeds/rss-une.xml', max: 4 },
    { name: 'Libération',        region: 'fr',   method: 'google', siteDomain: 'liberation.fr',  max: 4 },
    { name: 'Le Parisien',       region: 'fr',   method: 'google', siteDomain: 'leparisien.fr',  max: 4 },
    { name: 'Mediapart',         region: 'fr',   method: 'google', siteDomain: 'mediapart.fr',   max: 3 },
    { name: 'BBC News',          region: 'intl', method: 'rss',    url: 'http://feeds.bbci.co.uk/news/world/rss.xml', max: 6 },
    { name: 'The Guardian',      region: 'intl', method: 'rss',    url: 'https://www.theguardian.com/world/rss', max: 6 },
    { name: 'CNN',               region: 'intl', method: 'rss',    url: 'http://rss.cnn.com/rss/edition.rss', max: 4 },
    { name: 'Reuters',           region: 'intl', method: 'google', siteDomain: 'reuters.com',    max: 4 },
    { name: 'AP News',           region: 'intl', method: 'google', siteDomain: 'apnews.com',     max: 3 }
  ]
};
