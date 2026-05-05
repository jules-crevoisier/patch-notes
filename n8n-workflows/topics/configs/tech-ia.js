// =========================================================================
// 🤖 Tech & IA — IA, plateformes, produits, régulation, signaux faibles.
// Édite ce fichier puis lance `node n8n-workflows/topics/build.js`.
// =========================================================================

module.exports = {
  slug: 'tech-ia',
  label: 'Tech & IA',
  description: 'IA, plateformes, produits, régulation et signaux faibles côté tech.',
  mode: 'fr-intl',

  searchTerms:
    '(IA OR "intelligence artificielle" OR LLM OR OpenAI OR ChatGPT OR Claude OR Anthropic OR Gemini OR Apple OR Microsoft OR Meta OR Nvidia OR AWS OR Azure OR cloud OR cybersécurité OR cybersecurity OR startup OR "levée de fonds" OR fundraise OR IPO OR acquisition)',

  positiveKeywords: [
    'ia ', 'intelligence artificielle', 'llm', 'openai', 'chatgpt', 'gpt-', 'claude',
    'anthropic', 'gemini', 'mistral', 'apple intelligence', 'meta ai', 'llama',
    'nvidia', 'h100', 'b200', 'blackwell', 'rubin', 'tsmc', 'arm holdings',
    'cloud', 'aws', 'azure', 'gcp', 'oracle cloud', 'kubernetes',
    'cybersécurité', 'cybersecurity', 'data breach', 'fuite de données', 'ransomware',
    'startup', 'levée', 'fundraise', 'fundraising', 'ipo', 'acquisition', 'merger', 'rachat',
    'régulation', 'eu ai act', 'dma', 'dsa', 'rgpd', 'gdpr', 'cnil', 'ftc',
    'iphone', 'android', 'pixel', 'galaxy', 'macbook', 'apple silicon', 'm4', 'm5',
    'snapdragon', 'mediatek', 'samsung', 'huawei',
    'tesla', 'spacex', 'starlink', 'rivian', 'byd',
    'open source', 'github', 'gitlab', 'huggingface', 'hugging face',
    'agent', 'agentic', 'browser', 'navigateur', 'wearable', 'casque vr', 'vision pro'
  ],

  negativeKeywords: [
    'black friday', 'cyber monday', 'soldes', 'meilleur prix', 'comparatif des', 'top 10 des',
    'tier list', 'walkthrough', "guide d'achat", 'bons plans', 'code promo', 'amazon prime day',
    'horoscope', 'goodies', 'figurine', 'tapis de souris', 't-shirt', 'maillot', 'merch'
  ],

  maxAgeDays: { google: 3, rss: 5 },
  caps: { fr: 12, intl: 18, total: 30 },

  editorialHints: [
    "- Priorise produits effectivement disponibles, déploiements, levées de fonds confirmées et changements réglementaires.",
    "- Distingue annonce / preview / disponibilité générale (GA) / lancement commercial.",
    "- Pour l'IA, précise toujours le modèle ou le produit (ex. 'GPT-5', 'Claude 4.5 Opus'), pas juste 'l'IA'."
  ].join('\n'),

  sources: [
    { name: 'Numerama',        region: 'fr',   method: 'rss',    url: 'https://www.numerama.com/feed/', max: 6 },
    { name: 'Frandroid',       region: 'fr',   method: 'rss',    url: 'https://www.frandroid.com/feed', max: 5 },
    { name: '01net',           region: 'fr',   method: 'rss',    url: 'https://www.01net.com/actualites/feed/', max: 5 },
    { name: 'Korben',          region: 'fr',   method: 'rss',    url: 'https://korben.info/feed', max: 3 },
    { name: 'Les Numériques',  region: 'fr',   method: 'google', siteDomain: 'lesnumeriques.com', max: 4 },
    { name: 'Clubic',          region: 'fr',   method: 'google', siteDomain: 'clubic.com',        max: 4 },
    { name: 'Le Monde Pixels', region: 'fr',   method: 'google', siteDomain: 'lemonde.fr',        max: 3 },
    { name: 'The Verge',       region: 'intl', method: 'rss',    url: 'https://www.theverge.com/rss/index.xml', max: 6 },
    { name: 'TechCrunch',      region: 'intl', method: 'rss',    url: 'https://techcrunch.com/feed/', max: 6 },
    { name: 'Ars Technica',    region: 'intl', method: 'rss',    url: 'https://feeds.arstechnica.com/arstechnica/index', max: 5 },
    { name: 'Wired',           region: 'intl', method: 'rss',    url: 'https://www.wired.com/feed/rss', max: 5 },
    { name: 'Engadget',        region: 'intl', method: 'rss',    url: 'https://www.engadget.com/rss.xml', max: 4 },
    { name: 'The Information', region: 'intl', method: 'google', siteDomain: 'theinformation.com', max: 3 }
  ]
};
