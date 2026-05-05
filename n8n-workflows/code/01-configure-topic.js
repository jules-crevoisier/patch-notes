// ============================================================================
// 📝 CONFIGURER LE SUJET
// ----------------------------------------------------------------------------
// 👉 C'EST LE SEUL NŒUD QUE TU MODIFIES POUR AJOUTER UN NOUVEAU SUJET 👈
//
// Pour créer un nouveau sujet :
//   1. Dans n8n → clic droit sur ce workflow → "Duplicate".
//   2. Renomme la copie : "Recap <ton sujet>".
//   3. Ouvre ce nœud "📝 Configurer le sujet" dans la copie.
//   4. Modifie SEULEMENT l'objet TOPIC ci-dessous.
//   5. Active le workflow. C'est tout.
// ============================================================================

const TOPIC = {
  // 🔑 Identifiant URL du sujet. Lettres minuscules, chiffres et tirets uniquement.
  //    Exemples : 'esport', 'gaming', 'tech-ia', 'cinema-series'.
  slug: 'esport',

  // 🏷️ Nom affiché dans le hub et les titres.
  label: 'Esport',

  // ✨ Description courte affichée sur la home (1 phrase, max ~120 caractères).
  description: 'Compétitions, rosters, tournois et scènes FR / internationales.',

  // 🌍 Mode de couverture :
  //    'fr-intl' → garde les sources FR ET internationales.
  //    'fr'      → garde uniquement les sources FR.
  //    'intl'    → garde uniquement les sources internationales (anglais).
  mode: 'fr-intl',

  // 🔎 Termes de recherche pour Google News (utilisé pour les sources `method: 'google'`).
  //    Mets ici les mots-clés qui définissent ton sujet, séparés par OR.
  searchTerms:
    '(esport OR esports OR e-sport OR VCT OR LEC OR LCK OR LFL OR LCS OR EWC OR "Esports World Cup" OR CS2 OR "Counter-Strike" OR BLAST OR IEM OR PGL OR RLCS OR roster OR mercato OR playoffs OR qualifiers)',

  // ✅ Mots-clés que les articles DOIVENT contenir (au moins un).
  positiveKeywords: [
    'esport', 'e-sport', 'esports', 'league of legends', 'valorant', 'counter-strike', 'cs2',
    'rocket league', 'dota 2', 'overwatch', 'lec', 'lck', 'lfl', 'lcs', 'vct', 'rlcs', 'blast',
    'iem', 'pgl', 'ewc', 'esports world cup', 'playoffs', 'qualifier', 'qualifications',
    'tournament', 'tournoi', 'roster', 'mercato', 'transfer', 'bench', 'team vitality',
    'karmine', 'fnatic', 'g2 esports', 'hltv', 'stage 1', 'bracket', 'worlds', 'msi'
  ],

  // 🚫 Mots-clés qui éliminent immédiatement un article (priorité sur le positive).
  negativeKeywords: [
    'how to complete', 'questline', 'quest line', 'week ', 'challenges', 'challenge guide',
    'where to find', 'how to solve', 'how to earn', 'unlock ', 'walkthrough', 'loadout',
    'build guide', 'codes ', 'camos', 'weapon prestige', 'night market', 'far far west',
    'tier list', 'patch notes', 'notes de patch', 'carte interactive', 'soluce',
    'planning des patchs', 'boutique officielle', 'nos partenaires', 'nos ambassadeurs',
    'maillot ', 'tapis de souris', 't-shirt', 'accueil - mandatory'
  ],

  // ⏳ Âge maximum d'un article pour être retenu, en jours.
  maxAgeDays: { google: 3, rss: 7 },

  // 🎯 Caps de sélection finale (FR / INT). Sert à équilibrer l'affichage.
  caps: { fr: 14, intl: 18, total: 36 },

  // 🧠 Indications éditoriales données à l'IA, en complément du prompt général.
  //    Une ligne par règle. Style : "- ...".
  editorialHints: [
    "- Ignore guides, quêtes, patch notes génériques, culture gaming hors compétition.",
    "- Ne déforme pas le niveau de compétition : qualifier, playoffs, phase de groupes, ligue régionale, tournoi principal restent distincts.",
    "- Si un article parle de qualifications EMEA pour un tournoi, écris 'qualifications EMEA pour <tournoi>', jamais 'au <tournoi>'."
  ].join('\n'),

  // 📡 Liste des sources. Pour chaque source :
  //   - name   : libellé affiché dans le récap
  //   - region : 'fr' ou 'intl'
  //   - method : 'rss' (lit directement le flux) ou 'google' (cherche via Google News RSS)
  //   - url    : lien du flux (pour 'rss') OU domaine cherché (pour 'google', utilise siteSearch())
  //   - max    : nombre max d'articles à conserver pour cette source
  //
  // Note : si tu mets `mode: 'fr'` plus haut, les sources `region: 'intl'` sont
  // automatiquement ignorées. Tu peux donc laisser TOUTES les sources ici.
  sources: [
    { name: 'Mandatory.gg', region: 'fr', method: 'google', siteDomain: 'mandatory.gg', max: 5 },
    { name: 'Millenium', region: 'fr', method: 'google', siteDomain: 'millenium.org', max: 5 },
    { name: 'Team-aAa', region: 'fr', method: 'rss', url: 'https://www.team-aaa.com/rss/full.xml', max: 7 },
    { name: 'Breakflip', region: 'fr', method: 'google', siteDomain: 'breakflip.com', max: 5 },
    { name: 'Dot Esports', region: 'intl', method: 'rss', url: 'https://dotesports.com/feed', max: 6 },
    { name: 'Dexerto Esports', region: 'intl', method: 'rss', url: 'https://www.dexerto.com/esports/feed/', max: 6 },
    { name: 'Esports Insider', region: 'intl', method: 'rss', url: 'https://esportsinsider.com/feed', max: 6 },
    { name: 'Esports.net', region: 'intl', method: 'google', siteDomain: 'esports.net', max: 4 },
    { name: 'Sheep Esports', region: 'intl', method: 'google', siteDomain: 'sheepesports.com', max: 4 },
    { name: 'Win.gg', region: 'intl', method: 'google', siteDomain: 'win.gg', max: 4 },
    { name: 'Esports Charts', region: 'intl', method: 'google', siteDomain: 'escharts.com', max: 4 },
    { name: 'The Esports Advocate', region: 'intl', method: 'rss', url: 'https://esportsadvocate.net/feed', max: 4 },
    { name: 'HLTV', region: 'intl', method: 'rss', url: 'https://www.hltv.org/rss/news', max: 4 }
  ]
};

// ============================================================================
// ❌ NE PAS MODIFIER CE QUI SUIT - Logique partagée entre tous les sujets.
// ============================================================================

const VALID_MODES = new Set(['fr', 'intl', 'fr-intl']);
const mode = VALID_MODES.has(TOPIC.mode) ? TOPIC.mode : 'fr-intl';

// Normalise les sources Google en URL Google News RSS (sans toucher au reste).
function buildGoogleNewsUrl(siteDomain, searchTerms) {
  const query = [
    `site:${siteDomain}`,
    searchTerms,
    '-guide',
    '-walkthrough',
    '-soluce',
    '-questline',
    '-challenges',
    '-unlock',
    '-loadout'
  ].join(' ');
  return `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=fr&gl=FR&ceid=FR:fr`;
}

const sources = (TOPIC.sources || [])
  .filter((source) => {
    if (mode === 'fr') return source.region === 'fr';
    if (mode === 'intl') return source.region === 'intl';
    return true;
  })
  .map((source) => ({
    name: source.name,
    region: source.region,
    method: source.method,
    max: Number(source.max || 5),
    url:
      source.method === 'google'
        ? buildGoogleNewsUrl(source.siteDomain || source.url, TOPIC.searchTerms || '')
        : source.url
  }));

const config = {
  topic: {
    slug: String(TOPIC.slug || 'unknown').trim().toLowerCase(),
    label: String(TOPIC.label || TOPIC.slug || 'Sujet').trim(),
    description: String(TOPIC.description || '').trim(),
    mode,
    searchTerms: String(TOPIC.searchTerms || '').trim(),
    positiveKeywords: TOPIC.positiveKeywords || [],
    negativeKeywords: TOPIC.negativeKeywords || [],
    maxAgeDays: {
      google: Number(TOPIC.maxAgeDays?.google ?? 3),
      rss: Number(TOPIC.maxAgeDays?.rss ?? 7)
    },
    caps: {
      fr: Number(TOPIC.caps?.fr ?? 14),
      intl: Number(TOPIC.caps?.intl ?? 18),
      total: Number(TOPIC.caps?.total ?? 36)
    },
    editorialHints: String(TOPIC.editorialHints || '').trim()
  },
  sources,
  blog: {
    secret: String($env.BLOG_SECRET || 'dev-change-me').trim(),
    internalUrl: String($env.BLOG_INTERNAL_URL || 'http://blog:3001').replace(/\/$/, '')
  },
  gemini: {
    apiKey: String($env.GEMINI_API_KEY || '').trim(),
    model: String($env.GEMINI_MODEL || 'gemini-2.5-flash').trim(),
    maxPerMinute: Number($env.GEMINI_MAX_PER_MINUTE || 5),
    maxWaitSeconds: Number($env.GEMINI_MAX_WAIT_SECONDS || 1800)
  },
  runDate: new Date().toISOString().slice(0, 10)
};

return [{ json: config }];
