function decodeHtml(value = '') {
  return String(value)
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#038;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

function pick(block, tag) {
  const escapedTag = tag.replace(':', '\\:');
  const match = block.match(new RegExp(`<${escapedTag}[^>]*>([\\s\\S]*?)<\\/${escapedTag}>`, 'i'));
  return decodeHtml(match?.[1] || '');
}

function stripGoogleSuffix(title, sourceName) {
  return title
    .replace(new RegExp(`\\s+-\\s+${sourceName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'), '')
    .replace(/\s+-\s+Google News$/i, '')
    .trim();
}

function isEsportArticle(article) {
  const text = `${article.title} ${article.snippet} ${article.source}`.toLowerCase();
  const publishedAt = new Date(article.publishedAt);
  if (!Number.isNaN(publishedAt.getTime())) {
    const maxAgeDays = article.method === 'google' ? 3 : 7;
    if (Date.now() - publishedAt.getTime() > maxAgeDays * 24 * 60 * 60 * 1000) return false;
  }

  const positive = [
    'esport', 'e-sport', 'esports', 'league of legends', 'valorant', 'counter-strike', 'cs2',
    'rocket league', 'dota 2', 'overwatch', 'lec', 'lck', 'lfl', 'lcs', 'vct', 'rlcs', 'blast',
    'iem', 'pgl', 'ewc', 'esports world cup', 'playoffs', 'qualifier', 'qualifications',
    'tournament', 'tournoi', 'roster', 'mercato', 'transfer', 'bench', 'team vitality',
    'karmine', 'fnatic', 'g2 esports', 'hltv', 'stage 1', 'bracket', 'worlds', 'msi'
  ];
  const negative = [
    'how to complete', 'questline', 'quest line', 'week ', 'challenges', 'challenge guide',
    'where to find', 'how to solve', 'how to earn', 'unlock ', 'walkthrough', 'loadout',
    'build guide', 'codes ', 'camos', 'weapon prestige', 'night market', 'far far west',
    'battlefield 6 season', 'tier list', 'patch notes', 'notes de patch', 'carte interactive', 'soluce',
    'planning des patchs', 'mises a jour', 'mises à jour', 'boutique officielle', 'nos partenaires',
    'nos ambassadeurs', 'maillot ', 'tapis de souris', 't-shirt', 'accueil - mandatory',
    'les agents de valorant', 'agent sentinelle', 'nouvel agent'
  ];

  if (negative.some((term) => text.includes(term))) return false;
  return positive.some((term) => text.includes(term));
}

function parseItems(xml, source) {
  return [...String(xml || '').matchAll(/<item[\s\S]*?>([\s\S]*?)<\/item>/gi)]
    .map((match) => {
      const block = match[1];
      const rawTitle = pick(block, 'title');
      return {
        title: stripGoogleSuffix(rawTitle, source.name),
        url: pick(block, 'link') || pick(block, 'guid'),
        source: source.name,
        region: source.region,
        method: source.method,
        publishedAt: pick(block, 'pubDate') || pick(block, 'updated') || pick(block, 'published'),
        snippet: decodeHtml(pick(block, 'description') || pick(block, 'content:encoded')),
      };
    })
    .filter((article) => article.title && article.url && isEsportArticle(article))
    .slice(0, source.max);
}

function countBySource(list) {
  return list.reduce((acc, article) => {
    acc[article.source] = (acc[article.source] || 0) + 1;
    return acc;
  }, {});
}

function normalizeUrl(value) {
  try {
    const url = new URL(value);
    url.hash = '';
    url.search = '';
    return url.toString().replace(/\/$/, '').toLowerCase();
  } catch {
    return '';
  }
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
  const source = { ...(preparedSources[index]?.json || {}), ...item.json };
  const xml = source.rss || source.data || source.body || '';
  if (!xml || String(xml).length < 20) {
    errors.push(`${source.name}: reponse vide`);
    continue;
  }
  const parsed = parseItems(xml, source);
  if (!parsed.length) errors.push(`${source.name}: aucun article esport filtre`);
  loadedArticles.push(...parsed);
}

const seen = new Set();
const articles = loadedArticles
  .sort((a, b) => new Date(b.publishedAt || 0) - new Date(a.publishedAt || 0))
  .filter((article) => {
    const key = normalizeUrl(article.url);
    if (!key || seen.has(key) || sameDayUrls.has(key)) return false;
    seen.add(key);
    return true;
  })
  .slice(0, 36);

const frArticles = articles.filter((article) => article.region === 'fr').slice(0, 14);
const intlArticles = articles.filter((article) => article.region !== 'fr').slice(0, 18);
const selectedArticles = [...frArticles, ...intlArticles];
const sourceGroups = { fr: countBySource(frArticles), intl: countBySource(intlArticles) };
const frLead = frArticles.slice(0, 3).map((article) => article.title).join('; ');
const intlLead = intlArticles.slice(0, 3).map((article) => article.title).join('; ');
const errorLine = errors.length ? ` Sources a verifier: ${errors.join('; ')}.` : '';
const now = new Date();
const recapDate = now.toLocaleDateString('fr-FR', { dateStyle: 'long' });
const slot = recapSlot(now);
const fallbackTitle = `${slot} - ${topic.label} FR + international - ${recapDate}`;
const fallbackSummary = selectedArticles.length
  ? `France: ${frArticles.length} articles retenus. International: ${intlArticles.length} articles retenus. A suivre cote FR: ${frLead || 'pas de signal fort'}. Cote international: ${intlLead || 'pas de signal fort'}.${errorLine}`
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
- Le titre ne doit pas commencer par "Veille Esport" ni par "Radar esport".
- summary: 3 phrases maximum, taille similaire a ce format: "France: ... International: ... A suivre: ...".
- Resume uniquement les articles listes ci-dessous. Si un sujet n'est pas dans cette liste, tu n'en parles pas.
- Si la liste Articles est vide, retourne exactement le titre "${fallbackTitle}" et le summary "${fallbackSummary}", sans ajouter de sujet.
- Ne parle que du sujet "${topic.label}".
- Ignore guides, quetes, patch notes generiques, culture gaming hors competition.
- Mentionne France et International separement.
- Reste factuel, sans inventer.
- Attention aux qualifications: si un article parle de qualifications EMEA pour l'Esports World Cup, ecris "qualifications EMEA pour l'EWC", jamais "a l'EWC" ou "lors de l'EWC".
- Ne deforme pas le niveau de competition: qualifier, playoffs, phase de groupes, ligue regionale, tournoi principal doivent rester distincts.

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
      id: `esport-fr-intl-${now.toISOString().slice(0, 13)}`,
      topic: topic.slug,
      slot,
      title: fallbackTitle,
      summary: fallbackSummary,
      sourceGroups,
      errors,
      articles: selectedArticles,
      createdAt: now.toISOString(),
    },
  },
}];
