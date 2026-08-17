// =========================================================================
// 🎌 Anime & Manga — sorties, adaptations, industrie, actu Japon pop culture.
// Édite ce fichier puis `docker compose restart blog` pour recharger.
// =========================================================================

module.exports = {
  slug: 'anime-manga',
  label: 'Anime & Manga',
  description: 'Sorties d’animes et de mangas, adaptations, industrie et actu Japon pop culture.',
  mode: 'fr-intl',

  searchTerms:
    '(anime OR manga OR mangaka OR "saison 2" OR adaptation OR Crunchyroll OR "Shonen Jump" OR Studio Ghibli)',

  positiveKeywords: [
    'anime', 'manga', 'mangaka', 'scan', 'chapitre', 'tome', 'light novel',
    'saison ', 'épisode', 'adaptation', 'live-action', 'ova', 'film anime',
    'crunchyroll', 'shonen jump', 'weekly shonen', 'shueisha', 'kodansha',
    'studio ghibli', 'mappa', 'ufotable', 'toei animation', 'production i.g',
    'one piece', 'naruto', 'dragon ball', 'attack on titan', "l'attaque des titans",
    'jujutsu kaisen', 'demon slayer', 'kimetsu no yaiba', 'my hero academia',
    'doublage', 'vf ', 'vostfr', 'simulcast', 'sortie manga', 'sortie anime'
  ],

  negativeKeywords: [
    'horoscope', 'meilleur prix', 'bons plans', 'code promo', 'comparatif',
    'top 10 des', "guide d'achat", 'figurine pas cher', 'goodies', 'cosplay pas cher',
    'jeu vidéo gacha'
  ],

  maxAgeDays: { google: 3, rss: 6 },
  caps: { fr: 10, intl: 16, total: 26 },

  editorialHints: [
    "- Précise toujours la licence concernée (ex. 'saison 3 de Jujutsu Kaisen'), pas juste 'un nouvel anime'.",
    "- Distingue annonce / date de sortie confirmée / diffusion effective.",
    "- Priorise sorties officielles, adaptations et actu industrie ; évite les leaks/scans piratés non officiels."
  ].join('\n'),

  sources: [
    { name: 'Journal du Japon',      region: 'fr',   method: 'rss',    url: 'https://www.journaldujapon.com/feed/', max: 5 },
    { name: 'Otakia',                region: 'fr',   method: 'rss',    url: 'https://www.otakia.com/feed/', max: 4 },
    { name: 'Manga-News',            region: 'fr',   method: 'google', siteDomain: 'manga-news.com', max: 5 },
    { name: 'Anime News Network',    region: 'intl', method: 'rss',    url: 'https://www.animenewsnetwork.com/all/rss.xml', max: 6 },
    { name: 'MyAnimeList News',      region: 'intl', method: 'rss',    url: 'https://myanimelist.net/rss/news.xml', max: 5 },
    { name: 'SoraNews24',            region: 'intl', method: 'rss',    url: 'https://soranews24.com/feed/', max: 3 }
  ]
};
