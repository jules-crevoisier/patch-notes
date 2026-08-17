// =========================================================================
// 🎵 Musique — sorties, tournées, industrie, charts FR et international.
// Édite ce fichier puis `docker compose restart blog` pour recharger.
// =========================================================================

module.exports = {
  slug: 'musique',
  label: 'Musique',
  description: 'Sorties d’albums, tournées, industrie musicale et charts FR / international.',
  mode: 'fr-intl',

  searchTerms:
    '(album OR single OR tournée OR concert OR festival OR "sortie musicale" OR clip OR streaming musical OR charts)',

  // Termes courts volontairement évités ("titre", "pop", "rock", "label", "écoutes"
  // seuls) : ce sont des mots français trop courants, ils laissent passer des
  // articles hors-sujet dès qu'une source généraliste (Konbini) en contient un
  // dans un tout autre contexte. On ne garde que des termes composés ou des
  // noms propres/marques suffisamment spécifiques à la musique.
  positiveKeywords: [
    'album', 'single ', 'ep ', 'mixtape', 'tournée', 'concert', 'festival de musique',
    'clip musical', 'nouveau clip', 'chanson', 'nouveau titre', 'featuring', 'collab',
    'maison de disques', 'label musical', 'signe chez',
    'billboard', 'charts', 'classement des ventes', 'certifié disque', 'disque de platine',
    'grammy', 'victoires de la musique', 'brit awards', 'mtv awards',
    'rappeur', 'rappeuse', 'rap français', 'hip-hop', 'musique pop', 'pop français',
    'rock indé', 'scène rock', 'musique électronique', 'variété française', 'r&b',
    'spotify', 'apple music', 'deezer', "nombre d'écoutes", 'écoutes en streaming',
    'nouvel album', 'sort son nouvel album', 'sort un album', 'annonce une tournée', 'annonce sa tournée'
  ],

  negativeKeywords: [
    'horoscope', 'meilleur prix', 'bons plans', 'code promo', 'comparatif',
    'top 10 des', "guide d'achat", 'billetterie pas cher', 'casque audio pas cher',
    'enceinte connectée', 'soldes'
  ],

  maxAgeDays: { google: 3, rss: 6 },
  caps: { fr: 12, intl: 16, total: 28 },

  editorialHints: [
    "- Précise toujours l'artiste et le projet concerné (ex. 'nouvel album de X'), pas juste 'sortie musicale'.",
    "- Distingue annonce / sortie effective / tournée confirmée avec dates.",
    "- Priorise les sorties, annonces de tournée et récompenses ; évite les rumeurs de couple ou de clash non confirmées."
  ].join('\n'),

  sources: [
    { name: 'Les Inrocks',   region: 'fr',   method: 'rss', url: 'https://www.lesinrocks.com/feed/', max: 5 },
    { name: 'Konbini',       region: 'fr',   method: 'rss', url: 'https://www.konbini.com/feed/', max: 4 },
    { name: 'Booska-P',      region: 'fr',   method: 'rss', url: 'https://www.booska-p.com/feed/', max: 4 },
    { name: 'Adala News',    region: 'fr',   method: 'rss', url: 'https://adala-news.fr/feed/', max: 3 },
    { name: 'Pitchfork',     region: 'intl', method: 'rss', url: 'https://pitchfork.com/feed/feed-news/rss', max: 5 },
    { name: 'NME',           region: 'intl', method: 'rss', url: 'https://www.nme.com/feed', max: 5 },
    { name: 'Billboard',     region: 'intl', method: 'rss', url: 'https://www.billboard.com/feed/', max: 5 },
    { name: 'Rolling Stone', region: 'intl', method: 'rss', url: 'https://www.rollingstone.com/music/music-news/feed/', max: 4 }
  ]
};
