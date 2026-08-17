// =========================================================================
// ₿ Crypto & Web3 — marché, régulation, projets, blockchain.
// Édite ce fichier puis `docker compose restart blog` pour recharger.
// =========================================================================

module.exports = {
  slug: 'crypto',
  label: 'Crypto & Web3',
  description: 'Marché crypto, régulation, projets blockchain et Web3.',
  mode: 'fr-intl',

  searchTerms:
    '(bitcoin OR ethereum OR crypto OR blockchain OR Web3 OR stablecoin OR "actif numérique" OR DeFi OR NFT)',

  positiveKeywords: [
    'bitcoin', 'btc', 'ethereum', 'eth', 'crypto', 'cryptomonnaie', 'blockchain',
    'web3', 'defi', 'stablecoin', 'altcoin', 'token', 'wallet', 'portefeuille crypto',
    'exchange', 'binance', 'coinbase', 'kraken', 'minage', 'mining', 'halving',
    'régulation', 'mica', 'sec ', 'amf', 'esma', 'stable coin',
    'levée de fonds', 'protocole', 'smart contract', 'layer 2', 'staking',
    'cours du bitcoin', 'capitalisation', 'ath ', 'krach crypto', 'hack', 'piratage exchange'
  ],

  negativeKeywords: [
    'horoscope', 'meilleur prix', 'bons plans', 'code promo parrainage', 'comparatif',
    'top 10 des', "guide d'achat", 'arnaque pyramidale sponsorisé', 'casino en ligne',
    'bonus de bienvenue'
  ],

  maxAgeDays: { google: 2, rss: 4 },
  caps: { fr: 10, intl: 14, total: 22 },

  editorialHints: [
    "- Précise toujours l'actif ou le protocole concerné (ex. 'le cours de l'ETH'), pas juste 'la crypto'.",
    "- Distingue mouvement de marché ponctuel et évolution réglementaire structurelle.",
    "- Évite le contenu promotionnel de plateformes et les signaux de trading non sourcés."
  ].join('\n'),

  sources: [
    { name: 'Journal du Coin', region: 'fr',   method: 'rss', url: 'https://journalducoin.com/feed/', max: 5 },
    { name: 'Cryptoast',       region: 'fr',   method: 'rss', url: 'https://cryptoast.fr/feed/', max: 5 },
    { name: 'CoinDesk',        region: 'intl', method: 'rss', url: 'https://www.coindesk.com/arc/outboundfeeds/rss', max: 6 },
    { name: 'Cointelegraph',   region: 'intl', method: 'rss', url: 'https://cointelegraph.com/rss', max: 6 },
    { name: 'Decrypt',         region: 'intl', method: 'rss', url: 'https://decrypt.co/feed', max: 4 }
  ]
};
