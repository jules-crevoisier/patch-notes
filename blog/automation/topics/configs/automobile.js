// =========================================================================
// 🚗 Automobile — nouveautés, électrique, marché, industrie auto.
// Édite ce fichier puis `docker compose restart blog` pour recharger.
// =========================================================================

module.exports = {
  slug: 'automobile',
  label: 'Automobile',
  description: 'Nouveautés constructeurs, voiture électrique, marché et industrie automobile.',
  mode: 'fr-intl',

  searchTerms:
    '(voiture OR automobile OR constructeur OR "voiture électrique" OR SUV OR Tesla OR "salon automobile" OR homologation)',

  positiveKeywords: [
    'voiture', 'automobile', 'constructeur', 'modèle', 'gamme', 'restylage',
    'voiture électrique', 'hybride', 'thermique', 'autonomie', 'batterie',
    'borne de recharge', 'recharge rapide', 'tesla', 'renault', 'peugeot', 'citroën',
    'stellantis', 'volkswagen', 'byd', 'toyota', 'ford', 'bmw', 'mercedes-benz',
    'salon automobile', 'mondial de l’auto', 'homologation', 'rappel de véhicules',
    'immatriculation', 'malus écologique', 'bonus écologique', 'prix de vente',
    'essai routier', 'lancement commercial', 'prototype', 'concept car'
  ],

  negativeKeywords: [
    'horoscope', 'meilleur prix', 'bons plans', 'code promo', 'comparatif des prix',
    'top 10 des', "guide d'achat", 'occasion pas cher', 'assurance auto pas cher'
  ],

  maxAgeDays: { google: 3, rss: 6 },
  caps: { fr: 12, intl: 12, total: 24 },

  editorialHints: [
    "- Précise toujours le constructeur et le modèle concerné, pas juste 'une nouvelle voiture'.",
    "- Distingue concept/prototype, annonce officielle et commercialisation effective.",
    "- Priorise nouveautés produit, rappels officiels et chiffres de marché ; évite les essais promotionnels déguisés."
  ].join('\n'),

  sources: [
    { name: 'Caradisiac',        region: 'fr',   method: 'rss', url: 'https://www.caradisiac.com/rss.xml', max: 6 },
    { name: 'Automobile Propre', region: 'fr',   method: 'rss', url: 'https://www.automobile-propre.com/feed/', max: 5 },
    { name: "L'Internaute Auto", region: 'fr',   method: 'rss', url: 'https://www.linternaute.com/auto/rss/', max: 4 },
    { name: 'Motor1',            region: 'intl', method: 'rss', url: 'https://www.motor1.com/rss/news/all/', max: 6 },
    { name: 'Electrek',          region: 'intl', method: 'rss', url: 'https://electrek.co/feed/', max: 5 }
  ]
};
