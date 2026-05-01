const BLOG_SECRET = String($env.BLOG_SECRET || 'dev-change-me').trim();
const TOPIC = {
  slug: 'esport',
  label: 'Esport',
  searchTerms: '(esport OR esports OR e-sport OR VCT OR LEC OR LCK OR LFL OR LCS OR EWC OR "Esports World Cup" OR CS2 OR "Counter-Strike" OR BLAST OR IEM OR PGL OR RLCS OR roster OR mercato OR playoffs OR qualifiers)',
};

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

function parseExistingPosts() {
  const raw = $input.first()?.json?.postsRaw || '[]';
  try {
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

const siteSearch = (domain) => {
  const query = [
    `site:${domain}`,
    TOPIC.searchTerms,
    '-guide',
    '-walkthrough',
    '-quest',
    '-questline',
    '-challenges',
    '-unlock',
    '-loadout',
  ].join(' ');
  return `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=fr&gl=FR&ceid=FR:fr`;
};

const sources = [
  { name: 'Mandatory.gg', region: 'fr', method: 'google', url: siteSearch('mandatory.gg'), max: 5 },
  { name: 'Millenium', region: 'fr', method: 'google', url: siteSearch('millenium.org'), max: 5 },
  { name: 'Team-aAa', region: 'fr', method: 'rss', url: 'https://www.team-aaa.com/rss/full.xml', max: 7 },
  { name: 'Breakflip', region: 'fr', method: 'google', url: siteSearch('breakflip.com'), max: 5 },
  { name: 'Dot Esports', region: 'intl', method: 'rss', url: 'https://dotesports.com/feed', max: 6 },
  { name: 'Dexerto Esports', region: 'intl', method: 'rss', url: 'https://www.dexerto.com/esports/feed/', max: 6 },
  { name: 'Esports Insider', region: 'intl', method: 'rss', url: 'https://esportsinsider.com/feed', max: 6 },
  { name: 'Esports.net', region: 'intl', method: 'google', url: siteSearch('esports.net'), max: 4 },
  { name: 'Sheep Esports', region: 'intl', method: 'google', url: siteSearch('sheepesports.com'), max: 4 },
  { name: 'Win.gg', region: 'intl', method: 'google', url: siteSearch('win.gg'), max: 4 },
  { name: 'Esports Charts', region: 'intl', method: 'google', url: siteSearch('escharts.com'), max: 4 },
  { name: 'The Esports Advocate', region: 'intl', method: 'rss', url: 'https://esportsadvocate.net/feed', max: 4 },
  { name: 'HLTV', region: 'intl', method: 'rss', url: 'https://www.hltv.org/rss/news', max: 4 },
];

const today = new Date().toISOString().slice(0, 10);
const sameDayUrls = parseExistingPosts()
  .filter((post) => new Date(post.createdAt || 0).toISOString().slice(0, 10) === today)
  .flatMap((post) => post.articles || [])
  .map((article) => normalizeUrl(article.url))
  .filter(Boolean);

return sources.map((source) => ({ json: { ...source, topic: TOPIC, secret: BLOG_SECRET, sameDayUrls } }));
