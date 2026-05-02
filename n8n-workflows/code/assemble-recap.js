function decodeHtml(value = '') {
  return String(value)
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#038;/g, '&')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function pickRaw(block, tag) {
  const escapedTag = tag.replace(':', '\\:');
  const match = String(block || '').match(new RegExp(`<${escapedTag}[^>]*>([\\s\\S]*?)<\\/${escapedTag}>`, 'i'));
  return match?.[1] || '';
}

function pick(block, tag) {
  return decodeHtml(pickRaw(block, tag));
}

function cleanUrl(value) {
  const text = decodeHtml(value)
    .replace(/^url:\s*/i, '')
    .replace(/^link:\s*/i, '')
    .replace(/^guid:\s*/i, '')
    .replace(/^[\s"'<>]+|[\s"'<>]+$/g, '')
    .trim();
  const match = text.match(/https?:\/\/[^\s"'<>]+/i);
  return match ? match[0] : text;
}

function pickLink(block) {
  const href = String(block || '').match(/<link\b[^>]*\bhref=["']([^"']+)["'][^>]*\/?>/i)?.[1];
  return cleanUrl(href || pickRaw(block, 'link') || pickRaw(block, 'guid') || pickRaw(block, 'id'));
}

function stripSourceSuffix(title, sourceName) {
  return String(title || '')
    .replace(new RegExp(`\\s+-\\s+${String(sourceName || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'), '')
    .replace(/\s+-\s+Google News$/i, '')
    .trim();
}

const FILTERS = {
  esport: {
    maxAgeDays: { google: 3, rss: 7 },
    positive: [
      'esport', 'e-sport', 'esports', 'league of legends', 'valorant', 'counter-strike', 'cs2',
      'rocket league', 'dota 2', 'overwatch', 'lec', 'lck', 'lfl', 'lcs', 'vct', 'rlcs', 'blast',
      'iem', 'pgl', 'ewc', 'esports world cup', 'playoffs', 'qualifier', 'qualifications',
      'tournament', 'tournoi', 'roster', 'mercato', 'transfer', 'bench', 'team vitality',
      'karmine', 'fnatic', 'g2 esports', 'hltv', 'stage 1', 'bracket', 'worlds', 'msi'
    ],
    negative: [
      'how to complete', 'questline', 'quest line', 'week ', 'challenges', 'challenge guide',
      'where to find', 'how to solve', 'how to earn', 'unlock ', 'walkthrough', 'loadout',
      'build guide', 'codes ', 'camos', 'weapon prestige', 'night market', 'far far west',
      'tier list', 'patch notes', 'notes de patch', 'carte interactive', 'soluce',
      'planning des patchs', 'boutique officielle', 'nos partenaires', 'nos ambassadeurs',
      'maillot ', 'tapis de souris', 't-shirt', 'accueil - mandatory'
    ],
    promptExtra: '- Ignore guides, quetes, patch notes generiques, culture gaming hors competition.\n- Ne deforme pas le niveau de competition: qualifier, playoffs, phase de groupes, ligue regionale, tournoi principal doivent rester distincts.'
  },
  gaming: {
    maxAgeDays: { google: 5, rss: 7 },
    positive: [
      'gaming', 'jeu video', 'jeux video', 'video game', 'videogame', 'playstation', 'ps5',
      'xbox', 'game pass', 'nintendo', 'switch', 'steam', 'pc gaming', 'trailer', 'bande-annonce',
      'sortie', 'date de sortie', 'report', 'delay', 'dlc', 'extension', 'studio', 'ubisoft',
      'ea', 'electronic arts', 'bethesda', 'rockstar', 'capcom', 'sega', 'square enix',
      'konami', 'bandai namco', 'fromsoftware', 'state of play', 'nintendo direct'
    ],
    negative: [
      'guide', 'soluce', 'walkthrough', 'cheat', 'codes ', 'code ', 'tier list', 'build',
      'meilleur build', 'where to find', 'how to', 'comment obtenir', 'comment trouver',
      'astuce', 'quête', 'quete', 'quest', 'emplacement', 'localisation'
    ],
    promptExtra: '- Ignore guides, soluces, astuces, codes promo, tier lists et contenus purement pratiques.\n- Garde seulement les annonces, sorties, reports, studios, plateformes, tendances et mises a jour majeures.'
  },
  'tech-ia': {
    maxAgeDays: { google: 4, rss: 7 },
    positive: [
      'ia', 'intelligence artificielle', 'ai', 'artificial intelligence', 'openai', 'chatgpt',
      'google', 'gemini', 'anthropic', 'claude', 'microsoft', 'copilot', 'apple', 'nvidia',
      'startup', 'start-up', 'cybersecurite', 'cybersécurité', 'cybersecurity', 'cloud',
      'saas', 'robotique', 'robotics', 'modele', 'model', 'llm', 'application', 'app',
      'smartphone', 'android', 'ios', 'regulation', 'régulation', 'puce', 'chip'
    ],
    negative: [
      'bon plan', 'promo', 'promotion', 'code promo', 'black friday', 'soldes', 'deal',
      'meilleur prix', 'comparatif', 'guide d achat', "guide d'achat", 'test complet',
      'notre test', 'prise en main', 'wallpaper'
    ],
    promptExtra: '- Ignore bons plans, promotions, comparatifs shopping et tests produits trop commerciaux.\n- Priorise IA, plateformes, cybersecurite, entreprises tech, regulation et usages grand public.'
  },
  sport: {
    maxAgeDays: { google: 3, rss: 5 },
    positive: [
      'sport', 'football', 'ligue 1', 'champions league', 'ligue des champions', 'mercato',
      'transfert', 'nba', 'tennis', 'roland-garros', 'wimbledon', 'formule 1', 'f1',
      'motogp', 'rugby', 'top 14', 'cyclisme', 'tour de france', 'jo ', 'jeux olympiques',
      'playoffs', 'classement', 'resultat', 'résultat', 'match', 'finale', 'demi-finale',
      'selection', 'équipe de france', 'equipe de france'
    ],
    negative: [
      'pronostic', 'pronostics', 'paris sportifs', 'betting', 'cote ', 'cotes ', 'streaming',
      'en direct gratuit', 'programme tv', 'chaine tv', 'chaîne tv', 'calendrier complet',
      'quiz', 'notes des joueurs', 'les notes'
    ],
    promptExtra: '- Ignore pronostics, paris sportifs, programmes TV purs et notes de joueurs.\n- Priorise resultats majeurs, blessures importantes, mercato, titres, selections et evenements internationaux.'
  },
  'cinema-series': {
    maxAgeDays: { google: 5, rss: 7 },
    positive: [
      'cinema', 'cinéma', 'film', 'films', 'serie', 'série', 'series', 'streaming',
      'netflix', 'disney+', 'prime video', 'hbo', 'max', 'apple tv', 'canal+', 'box-office',
      'trailer', 'bande-annonce', 'casting', 'acteur', 'actrice', 'realisateur', 'réalisateur',
      'festival de cannes', 'cannes', 'oscar', 'emmy', 'sortie', 'saison ', 'renouvele',
      'renouvelé', 'annule', 'annulé'
    ],
    negative: [
      'programme tv', 'ce soir a la tv', 'horoscope', 'quiz', 'top 10 netflix', 'meilleurs films',
      'fin expliquee', 'fin expliquée', 'explication de la fin', 'spoiler', 'streaming gratuit',
      'illegal', 'illégal', 'telecharger', 'télécharger'
    ],
    promptExtra: '- Ignore programmes TV, tops generiques, spoilers/explications de fin et streaming illegal.\n- Priorise sorties, annonces plateformes, casting, box-office, festivals et decisions de production.'
  },
  science: {
    maxAgeDays: { google: 7, rss: 10 },
    positive: [
      'science', 'recherche', 'chercheurs', 'etude', 'étude', 'decouverte', 'découverte',
      'espace', 'spatial', 'nasa', 'esa', 'spacex', 'astronomie', 'planete', 'planète',
      'climat', 'energie', 'énergie', 'sante', 'santé', 'medecine', 'médecine', 'biologie',
      'physique', 'environnement', 'vaccin', 'maladie', 'cerveau', 'archéologie', 'archeologie'
    ],
    negative: [
      'astrologie', 'horoscope', 'bien-etre', 'bien-être', 'remede miracle', 'remède miracle',
      'perdre du poids', 'mincir', 'complement alimentaire', 'complément alimentaire',
      'signe du zodiaque', 'theorie du complot', 'théorie du complot'
    ],
    promptExtra: '- Ignore astrologie, bien-etre marketing, pseudo-science et conseils medicaux individuels.\n- Reste prudent sur les resultats de recherche: mentionne etude, observation ou annonce sans surestimer.'
  },
  internet: {
    maxAgeDays: { google: 4, rss: 7 },
    positive: [
      'internet', 'web', 'reseaux sociaux', 'réseaux sociaux', 'social media', 'tiktok',
      'youtube', 'twitch', 'instagram', 'meta', 'facebook', 'x ', 'twitter', 'reddit',
      'discord', 'influenceur', 'influenceurs', 'createur', 'créateur', 'createurs',
      'créateurs', 'moderation', 'modération', 'regulation', 'régulation', 'plateforme',
      'plateformes', 'algorithme', 'viral', 'contenu', 'creator economy'
    ],
    negative: [
      'buzz anecdotique', 'people', 'clash', 'drama', 'rumeur', 'rumeurs', 'leak non verifie',
      'leak non vérifié', 'astuce', 'guide', 'comment supprimer', 'comment telecharger',
      'comment télécharger', 'meilleur moment pour poster'
    ],
    promptExtra: '- Ignore dramas mineurs, rumeurs non verifiees, guides pratiques et contenus people.\n- Priorise plateformes, regulation, moderation, economie des createurs et changements d usages.'
  }
};

function topicFilter(topicSlug) {
  return FILTERS[topicSlug] || FILTERS.esport;
}

function isTopicArticle(article, topicSlug) {
  const filter = topicFilter(topicSlug);
  const text = `${article.title} ${article.snippet} ${article.source}`.toLowerCase();
  const publishedAt = new Date(article.publishedAt);
  if (!Number.isNaN(publishedAt.getTime())) {
    const maxAgeDays = article.method === 'google'
      ? filter.maxAgeDays.google
      : filter.maxAgeDays.rss;
    if (Date.now() - publishedAt.getTime() > maxAgeDays * 24 * 60 * 60 * 1000) return false;
  }
  if (filter.negative.some((term) => text.includes(term))) return false;
  return filter.positive.some((term) => text.includes(term));
}

function parseItems(xml, source, topicSlug) {
  const text = String(xml || '');
  const matches = [
    ...text.matchAll(/<item[\s\S]*?>([\s\S]*?)<\/item>/gi),
    ...text.matchAll(/<entry[\s\S]*?>([\s\S]*?)<\/entry>/gi),
  ];

  return matches
    .map((match) => {
      const block = match[1];
      const rawTitle = pick(block, 'title');
      return {
        title: stripSourceSuffix(rawTitle, source.name),
        url: pickLink(block),
        source: source.name,
        region: source.region,
        method: source.method,
        publishedAt: pick(block, 'pubDate') || pick(block, 'updated') || pick(block, 'published'),
        snippet: decodeHtml(pickRaw(block, 'description') || pickRaw(block, 'content:encoded') || pickRaw(block, 'summary')),
      };
    })
    .filter((article) => article.title && article.url && isTopicArticle(article, topicSlug))
    .slice(0, source.max || 10);
}

function resolveSource(item, index, preparedSources) {
  const pairedIndex = Array.isArray(item.pairedItem)
    ? item.pairedItem[0]?.item
    : item.pairedItem?.item;
  const prepared = preparedSources[pairedIndex ?? index]?.json || {};
  return { ...prepared, ...item.json };
}

function extractXml(json) {
  const candidates = [json.rss, json.data, json.body, json.response, json.text];
  const value = candidates.find((candidate) => typeof candidate === 'string' && candidate.trim());
  if (value) return value;
  if (typeof json === 'string') return json;
  return '';
}

function countBySource(list) {
  return list.reduce((acc, article) => {
    acc[article.source] = (acc[article.source] || 0) + 1;
    return acc;
  }, {});
}

function normalizeUrl(value) {
  const raw = cleanUrl(value);
  const match = String(raw || '').match(/^https?:\/\/[^\s"'<>]+/i);
  if (!match) return '';
  return match[0].replace(/[?#].*$/, '').replace(/\/$/, '').toLowerCase();
}

function recapSlot(date) {
  const hour = date.getHours();
  if (hour < 8) return 'Dans la nuit';
  if (hour < 13) return 'Matinal';
  if (hour < 21) return 'Cet aprem';
  return 'Soir';
}

const items = $input.all();
const preparedSources = $items('Preparer les sources');
const errors = [];
const loadedArticles = [];
const sameDayUrls = new Set(preparedSources[0]?.json?.sameDayUrls || []);
const topic = preparedSources[0]?.json?.topic || { slug: 'esport', label: 'Esport' };

for (const [index, item] of items.entries()) {
  const source = resolveSource(item, index, preparedSources);
  const xml = extractXml(item.json);
  if (!xml || String(xml).length < 20) {
    errors.push(`${source.name || `Source ${index + 1}`}: reponse vide`);
    continue;
  }
  const parsed = parseItems(xml, source, topic.slug);
  if (!parsed.length) errors.push(`${source.name}: aucun article ${topic.label} filtre`);
  loadedArticles.push(...parsed);
}

const seen = new Set();
let skippedInvalidUrl = 0;
let skippedDuplicate = 0;
let skippedSameDay = 0;
const articles = [];

for (const article of loadedArticles.sort((a, b) => new Date(b.publishedAt || 0) - new Date(a.publishedAt || 0))) {
  const key = normalizeUrl(article.url);
  if (!key) {
    skippedInvalidUrl++;
    continue;
  }
  if (seen.has(key)) {
    skippedDuplicate++;
    continue;
  }
  seen.add(key);
  if (sameDayUrls.has(key)) {
    skippedSameDay++;
    continue;
  }
  articles.push(article);
  if (articles.length >= 36) break;
}

const frArticles = articles.filter((article) => article.region === 'fr').slice(0, 14);
const intlArticles = articles.filter((article) => article.region !== 'fr').slice(0, 18);
const selectedArticles = [...frArticles, ...intlArticles];
const sourceGroups = { fr: countBySource(frArticles), intl: countBySource(intlArticles) };
const frLead = frArticles.slice(0, 3).map((article) => article.title).join('; ');
const intlLead = intlArticles.slice(0, 3).map((article) => article.title).join('; ');
const hasBothRegions = frArticles.length > 0 && intlArticles.length > 0;
const singleLead = selectedArticles.slice(0, 4).map((article) => article.title).join('; ');
const regionTitleSuffix = hasBothRegions ? 'FR + international' : 'articles';
const regionInstruction = hasBothRegions
  ? '- Mentionne France et International separement.'
  : '- Ne force pas une separation France/International si une categorie est vide; utilise une formulation globale "Articles: ...".';
const errorLine = errors.length ? ` Sources a verifier: ${errors.join('; ')}.` : '';
const now = new Date();
const recapDate = now.toLocaleDateString('fr-FR', { dateStyle: 'long' });
const slot = recapSlot(now);
const fallbackTitle = `${slot} - ${topic.label} ${regionTitleSuffix} - ${recapDate}`;
const fallbackSummary = selectedArticles.length
  ? hasBothRegions
    ? `France: ${frArticles.length} articles retenus. International: ${intlArticles.length} articles retenus. A suivre cote FR: ${frLead || 'pas de signal fort'}. Cote international: ${intlLead || 'pas de signal fort'}.${errorLine}`
    : `Articles: ${selectedArticles.length} articles retenus. A suivre: ${singleLead || 'pas de signal fort'}.${errorLine}`
  : loadedArticles.length
    ? `${loadedArticles.length} articles ${topic.label} trouves dans les flux, mais aucun nouvel article a publier: ${skippedSameDay} deja publies aujourd'hui, ${skippedDuplicate} doublons internes, ${skippedInvalidUrl} URL invalides.${errorLine}`
    : `Aucun nouvel article ${topic.label} a publier sur ce creneau.${errorLine}`;

const articleLines = selectedArticles
  .slice(0, 28)
  .map((article, index) => {
    const snippet = article.snippet ? ` | contexte: ${article.snippet.slice(0, 260)}` : '';
    return `${index + 1}. [${article.region === 'fr' ? 'FR' : 'INT'}] ${article.source} - ${article.title}${snippet}`;
  })
  .join('\n');

const prompt = `Tu es un redacteur de veille ${topic.label}. Genere un titre et un mini-recap en francais.
Contraintes:
- Reponds uniquement en JSON valide avec les cles "title" et "summary".
- title: court, editorial, avec la date "${recapDate}", maximum 95 caracteres.
- title: commence par "${slot} - ".
- Le titre ne doit pas commencer par "Veille ${topic.label}" ni par "Radar ${topic.label}".
- summary: 3 phrases maximum, taille similaire a ce format: "France: ... International: ... A suivre: ...".
- Resume uniquement les articles listes ci-dessous. Si un sujet n'est pas dans cette liste, tu n'en parles pas.
- Si la liste Articles est vide, retourne exactement le titre "${fallbackTitle}" et le summary "${fallbackSummary}", sans ajouter de sujet.
- Ne parle que du sujet "${topic.label}".
${regionInstruction}
- Reste factuel, sans inventer.
${topicFilter(topic.slug).promptExtra}

Date du recap: ${recapDate}
Articles:
${articleLines}`;

return [{
  json: {
    secret: preparedSources[0]?.json?.secret,
    fallbackTitle,
    fallbackSummary,
    recapDate,
    geminiModel: String($env.GEMINI_MODEL || 'gemini-2.5-flash').trim(),
    geminiApiKey: String($env.GEMINI_API_KEY || '').trim(),
    geminiRequest: {
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: 360,
        responseMimeType: 'application/json',
        thinkingConfig: { thinkingBudget: 0 },
      },
    },
    postBase: {
      id: `${topic.slug}-fr-intl-${now.toISOString().slice(0, 13)}`,
      topic: topic.slug,
      slot,
      title: fallbackTitle,
      summary: fallbackSummary,
      sourceGroups,
      errors,
      debug: {
        loadedArticlesCount: loadedArticles.length,
        uniqueArticlesBeforeSameDayFilter: seen.size,
        skippedInvalidUrl,
        skippedDuplicate,
        skippedSameDay,
        selectedArticlesCount: selectedArticles.length,
      },
      articles: selectedArticles,
      createdAt: now.toISOString(),
    },
  },
}];
