const http = require("node:http");
const fs = require("node:fs/promises");
const path = require("node:path");

const PORT = Number(process.env.PORT || 3001);
const BLOG_SECRET = process.env.BLOG_SECRET || "dev-change-me";
const SITE_URL = (process.env.SITE_URL || "http://localhost:3001").replace(/\/$/, "");
const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, "public");
const DATA_DIR = path.join(ROOT, "data");
const POSTS_FILE = path.join(DATA_DIR, "posts.json");
const TOPIC_PAGE_SIZE = 8;

const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".xml": "application/xml; charset=utf-8",
};

const reservedPublicPaths = new Set([
  "a-propos",
  "conditions",
  "confidentialite",
  "mentions-legales",
]);

async function ensurePostsFile() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  try {
    await fs.access(POSTS_FILE);
  } catch {
    await fs.writeFile(POSTS_FILE, "[]\n", "utf8");
  }
}

async function readJsonBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw) return {};
  return JSON.parse(raw);
}

async function readPosts() {
  await ensurePostsFile();
  return JSON.parse(await fs.readFile(POSTS_FILE, "utf8"));
}

async function writePost(post) {
  const posts = await readPosts();
  const postDate = new Date(post.createdAt || Date.now()).toISOString().slice(0, 10);
  const sameDayUrls = new Set(
    posts
      .filter((item) => item.id !== post.id && new Date(item.createdAt || 0).toISOString().slice(0, 10) === postDate)
      .flatMap((item) => item.articles || [])
      .map((article) => normalizeUrl(article.url)),
  );
  const uniqueArticles = [];
  const seen = new Set();

  for (const article of Array.isArray(post.articles) ? post.articles : []) {
    const key = normalizeUrl(article.url);
    if (!key || seen.has(key) || sameDayUrls.has(key)) continue;
    seen.add(key);
    uniqueArticles.push(article);
  }

  if (uniqueArticles.length === 0) {
    return null;
  }

  const nextPost = {
    id: post.id || new Date().toISOString(),
    topic: post.topic || "esport",
    title: post.title || "Recap esport",
    summary: post.summary || "",
    slot: post.slot || "",
    articles: uniqueArticles,
    sourceGroups: post.sourceGroups || {},
    errors: Array.isArray(post.errors) ? post.errors : [],
    createdAt: post.createdAt || new Date().toISOString(),
  };

  const withoutDuplicate = posts.filter((item) => item.id !== nextPost.id);
  withoutDuplicate.unshift(nextPost);
  await fs.writeFile(POSTS_FILE, `${JSON.stringify(withoutDuplicate.slice(0, 50), null, 2)}\n`, "utf8");
  return nextPost;
}

function normalizeUrl(value) {
  try {
    const url = new URL(value);
    url.hash = "";
    url.search = "";
    return url.toString().replace(/\/$/, "").toLowerCase();
  } catch {
    return "";
  }
}

function send(res, status, body, type = "application/json; charset=utf-8") {
  res.writeHead(status, {
    "content-type": type,
    "cache-control": "no-store",
  });
  res.end(body);
}

function truncate(value = "", max = 155) {
  const text = String(value).replace(/\s+/g, " ").trim();
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1).replace(/\s+\S*$/, "")}…`;
}

function escapeHtml(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeJson(value) {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

function escapeXml(value = "") {
  return escapeHtml(value).replace(/'/g, "&apos;");
}

function topicLabel(topic) {
  const labels = {
    esport: "Esport",
    gaming: "Gaming",
    tech: "Tech",
  };
  return labels[topic] || topic.replace(/-/g, " ");
}

function articleTime(article) {
  const date = new Date(article.publishedAt);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function postSlot(post) {
  if (post.slot) return post.slot;
  const date = new Date(post.createdAt || Date.now());
  const hour = date.getHours();
  if (hour < 8) return "Dans la nuit";
  if (hour < 13) return "Matinal";
  if (hour < 21) return "Cet aprem";
  return "Soir";
}

function dayKey(post) {
  return new Date(post.createdAt || Date.now()).toISOString().slice(0, 10);
}

function dayLabel(post) {
  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "full" }).format(new Date(post.createdAt || Date.now()));
}

function articleLabel(article) {
  return [article.source, article.region === "fr" ? "FR" : "INT", articleTime(article)].filter(Boolean).join(" - ");
}

function isDisplayableArticle(article) {
  const text = `${article.title || ""} ${article.snippet || ""}`.toLowerCase();
  const negative = [
    "how to complete",
    "where to find",
    "how to solve",
    "how to earn",
    "questline",
    "challenges",
    "unlock ",
    "walkthrough",
    "loadout",
    "weapon prestige",
    "night market",
    "far far west",
    "battlefield 6 season",
  ];
  return !negative.some((term) => text.includes(term));
}

function normalizeSearch(value = "") {
  return String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[’‘]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function topicSearchText(post) {
  return normalizeSearch([
    post.title,
    post.summary,
    post.topic,
    post.id,
    post.createdAt,
    ...(post.articles || []).flatMap((article) => [
      article.title,
      article.source,
      article.region,
      article.url,
      article.snippet,
      article.publishedAt,
    ]),
  ].join(" "));
}

async function getTopicPosts(topic, { offset = 0, limit = TOPIC_PAGE_SIZE, query = "" } = {}) {
  const tokens = normalizeSearch(query).split(" ").filter(Boolean);
  const all = (await readPosts())
    .filter((post) => (post.topic || "esport") === topic && (post.articles || []).length > 0);
  const filtered = tokens.length
    ? all.filter((post) => {
        const text = topicSearchText(post);
        return tokens.every((token) => text.includes(token));
      })
    : all;
  const safeOffset = Math.max(0, Number(offset) || 0);
  const safeLimit = Math.min(30, Math.max(1, Number(limit) || TOPIC_PAGE_SIZE));

  return {
    posts: filtered.slice(safeOffset, safeOffset + safeLimit),
    total: filtered.length,
    offset: safeOffset,
    limit: safeLimit,
    nextOffset: safeOffset + safeLimit,
    hasMore: safeOffset + safeLimit < filtered.length,
  };
}

function isPublicTopicPath(pathname) {
  const slug = pathname.replace(/^\/|\/$/g, "");
  return /^\/[a-z0-9-]+\/?$/.test(pathname) && !pathname.startsWith("/api") && !reservedPublicPaths.has(slug);
}

async function renderSitemap() {
  const posts = await readPosts();
  const topics = [...new Set(["esport", ...posts.map((post) => post.topic || "esport")])];
  const urls = [
    { loc: `${SITE_URL}/`, changefreq: "daily", priority: "1.0" },
    { loc: `${SITE_URL}/a-propos`, changefreq: "monthly", priority: "0.4" },
    { loc: `${SITE_URL}/mentions-legales`, changefreq: "yearly", priority: "0.2" },
    { loc: `${SITE_URL}/confidentialite`, changefreq: "yearly", priority: "0.2" },
    { loc: `${SITE_URL}/conditions`, changefreq: "yearly", priority: "0.2" },
    ...topics.map((topic) => ({ loc: `${SITE_URL}/${topic}`, changefreq: "hourly", priority: "0.9" })),
    ...posts.map((post) => ({
      loc: `${SITE_URL}/${post.topic || "esport"}/recap/${encodeURIComponent(post.id)}`,
      lastmod: new Date(post.createdAt || Date.now()).toISOString(),
      changefreq: "weekly",
      priority: "0.7",
    })),
  ];

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((url) => `  <url>
    <loc>${escapeXml(url.loc)}</loc>${url.lastmod ? `
    <lastmod>${url.lastmod}</lastmod>` : ""}
    <changefreq>${url.changefreq}</changefreq>
    <priority>${url.priority}</priority>
  </url>`).join("\n")}
</urlset>
`;
}

async function renderHubPage() {
  const posts = await readPosts();
  const topicCounts = posts.reduce((acc, post) => {
    const topic = post.topic || "esport";
    acc[topic] = (acc[topic] || 0) + 1;
    return acc;
  }, {});
  const activeTopics = [...new Set(["esport", ...posts.map((post) => post.topic || "esport")])];
  const cards = activeTopics.map((topic) => {
    const label = topicLabel(topic);
    return `<a class="topic-card" href="/${escapeHtml(topic)}" data-search="${escapeHtml(`${topic} ${label}`)}">
      <span>Actif</span>
      <strong>${escapeHtml(label)}</strong>
      <p>${topicCounts[topic] || 0} recap${topicCounts[topic] > 1 ? "s" : ""} publie${topicCounts[topic] > 1 ? "s" : ""}.</p>
    </a>`;
  }).join("\n");
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "patch-notes.fr",
    url: SITE_URL,
    description: "Hub de veille par sujet avec recaps courts et sources.",
  };

  return `<!doctype html>
<html lang="fr">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>patch-notes.fr</title>
    <meta name="description" content="Hub de veille par sujet avec recaps courts, sources et liens utiles." />
    <link rel="canonical" href="/" />
    <link rel="icon" href="/favicon.ico" sizes="any" />
    <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
    <link rel="stylesheet" href="/styles.css" />
    <script type="application/ld+json">${escapeJson(jsonLd)}</script>
  </head>
  <body>
    <header class="site-header">
      <div>
        <h1 class="site-wordmark">PATCH-NOTES.FR</h1>
      </div>
      <nav class="site-header-actions" aria-label="Navigation">
        <a class="header-about-link" href="/a-propos">Mais c'est quoi ce site&nbsp;?</a>
        <span id="status">${activeTopics.length} sujet${activeTopics.length > 1 ? "s" : ""}</span>
      </nav>
    </header>

    <main class="posts">
      <section class="hub-intro">
        <p class="summary"><strong>Ceci est un hub d'actualites</strong> | <em>Recaps generes par IA - des erreurs sont possibles, nous nous en excusons.</em></p><br>
        <p>Pour chaque sujet, un patch automatique est publie a 6&nbsp;h, 11&nbsp;h, 18&nbsp;h et 23&nbsp;h.</p>
      </section>

      <label class="search-box hub-search">
        <span>Rechercher un sujet</span>
        <input id="topic-search" type="search" placeholder="esport, gaming, tech..." />
      </label>

      <section class="topic-grid" id="topics" aria-label="Sujets">
        ${cards}
      </section>
    </main>

    <footer class="site-footer">
      <a href="/mentions-legales">Mentions legales</a>
      <a href="/confidentialite">Confidentialite</a>
      <a href="/conditions">Conditions</a>
    </footer>

    <script src="/hub.js"></script>
  </body>
</html>
`;
}

async function renderFeed(topic) {
  const posts = (await readPosts()).filter((post) => (post.topic || "esport") === topic).slice(0, 20);
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>patch-notes.fr / ${escapeXml(topicLabel(topic))}</title>
    <link>${escapeXml(`${SITE_URL}/${topic}`)}</link>
    <description>Recaps courts et sources pour ${escapeXml(topicLabel(topic))}.</description>
    <language>fr</language>
${posts.map((post) => `    <item>
      <title>${escapeXml(post.title)}</title>
      <link>${escapeXml(`${SITE_URL}/${topic}/recap/${encodeURIComponent(post.id)}`)}</link>
      <guid>${escapeXml(`${SITE_URL}/${topic}/recap/${encodeURIComponent(post.id)}`)}</guid>
      <pubDate>${new Date(post.createdAt || Date.now()).toUTCString()}</pubDate>
      <description>${escapeXml(post.summary)}</description>
    </item>`).join("\n")}
  </channel>
</rss>
`;
}

function renderArticleList(articles, limit = Infinity) {
  const visibleArticles = articles.filter(isDisplayableArticle).slice(0, limit);
  if (!visibleArticles.length) return '<li class="muted-row">Aucun article.</li>';

  return visibleArticles.map((article) => {
    const snippet = article.snippet ? `<p class="article-snippet">${escapeHtml(article.snippet)}</p>` : "";
    return `<li>
      <span class="article-meta">${escapeHtml(articleLabel(article))}</span>
      <a href="${escapeHtml(article.url)}" target="_blank" rel="noreferrer">${escapeHtml(article.title)}</a>
      ${snippet}
    </li>`;
  }).join("\n");
}

function renderTopicPostCard(post, topic) {
  const visibleArticles = (post.articles || []).filter(isDisplayableArticle);
  const frArticles = visibleArticles.filter((article) => article.region === "fr");
  const intlArticles = visibleArticles.filter((article) => article.region !== "fr");
  const createdAt = new Date(post.createdAt || Date.now());

  return `<article class="post">
    <div class="post-meta">${escapeHtml(postSlot(post))} - ${escapeHtml(new Intl.DateTimeFormat("fr-FR", { dateStyle: "full", timeStyle: "short" }).format(createdAt))} - ${frArticles.length} FR / ${intlArticles.length} INT</div>
    <h2>${escapeHtml(post.title)}</h2>
    <p class="summary">${escapeHtml(post.summary)}</p>
    <div class="split">
      <section>
        <h3>France</h3>
        <ol class="articles fr-articles">${renderArticleList(frArticles, 8)}</ol>
      </section>
      <section>
        <h3>International</h3>
        <ol class="articles intl-articles">${renderArticleList(intlArticles, 8)}</ol>
      </section>
    </div>
    <a class="read-more" href="/${encodeURIComponent(topic)}/recap/${encodeURIComponent(post.id)}">Voir le recap complet</a>
  </article>`;
}

async function renderTopicPage(topic) {
  const label = topicLabel(topic);
  const page = await getTopicPosts(topic);
  const posts = page.posts;
  const title = `patch-notes.fr/${topic}`;
  const description = posts[0]?.summary
    ? truncate(posts[0].summary)
    : `Recaps courts, sources et liens utiles pour suivre l'actualite ${label}.`;

  let currentDay = "";
  const postsHtml = posts.length ? posts.map((post) => {
    const key = dayKey(post);
    const heading = key !== currentDay ? `<h2 class="day-heading">${escapeHtml(dayLabel(post))}</h2>` : "";
    currentDay = key;
    return `${heading}${renderTopicPostCard(post, topic)}`;
  }).join("\n") : '<p class="empty">Aucun recap pour le moment. Lance le workflow n8n pour publier le premier.</p>';

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: title,
    description,
    url: `${SITE_URL}/${topic}`,
    isPartOf: { "@type": "WebSite", name: "patch-notes.fr", url: SITE_URL },
  };

  return `<!doctype html>
<html lang="fr">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)}</title>
    <meta name="description" content="${escapeHtml(description)}" />
    <link rel="canonical" href="/${escapeHtml(topic)}" />
    <link rel="alternate" type="application/rss+xml" title="patch-notes.fr / ${escapeHtml(topic)}" href="/${escapeHtml(topic)}/feed.xml" />
    <link rel="icon" href="/favicon.ico" sizes="any" />
    <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
    <link rel="stylesheet" href="/styles.css" />
    <script type="application/ld+json">${escapeJson(jsonLd)}</script>
  </head>
  <body>
    <header class="site-header">
      <div>
        <p class="eyebrow"><a class="subtle-link" href="/">patch-notes.fr</a> / ${escapeHtml(topic)}</p>
        <h1>${escapeHtml(topic)}</h1>
      </div>
      <nav class="site-header-actions" aria-label="Navigation">
        <a class="header-about-link" href="/a-propos">Mais c'est quoi ce site&nbsp;?</a>
        <span id="status">${page.total} recap${page.total > 1 ? "s" : ""}</span>
      </nav>
    </header>

    <main class="posts">
      <label class="search-box">
        <span>Recherche globale</span>
        <input id="search" type="search" placeholder="Jeu, source, date, titre..." />
      </label>
      <section id="posts">${postsHtml}</section>
      <div id="load-more-sentinel" class="load-more-sentinel" data-has-more="${page.hasMore ? "true" : "false"}">
        ${page.hasMore ? "Chargement..." : ""}
      </div>
    </main>

    <template id="post-template">
      <article class="post">
        <div class="post-meta"></div>
        <h2></h2>
        <p class="summary"></p>
        <div class="split">
          <section>
            <h3>France</h3>
            <ol class="articles fr-articles"></ol>
          </section>
          <section>
            <h3>International</h3>
            <ol class="articles intl-articles"></ol>
          </section>
        </div>
        <a class="read-more" href="#">Voir le recap complet</a>
      </article>
    </template>

    <script src="/app.js"></script>
    <footer class="site-footer">
      <a href="/mentions-legales">Mentions legales</a>
      <a href="/confidentialite">Confidentialite</a>
      <a href="/conditions">Conditions</a>
    </footer>
  </body>
</html>
`;
}

function renderRecapPage(post, topic) {
  const visibleArticles = (post.articles || []).filter(isDisplayableArticle);
  const frArticles = visibleArticles.filter((article) => article.region === "fr");
  const intlArticles = visibleArticles.filter((article) => article.region !== "fr");
  const createdAt = new Date(post.createdAt || Date.now());
  const description = truncate(post.summary || post.title);
  const canonicalUrl = `${SITE_URL}/${topic}/recap/${encodeURIComponent(post.id)}`;
  const title = `${post.title} | patch-notes.fr`;
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: post.title,
    description,
    datePublished: createdAt.toISOString(),
    dateModified: createdAt.toISOString(),
    mainEntityOfPage: canonicalUrl,
    url: canonicalUrl,
    author: { "@type": "Organization", name: "patch-notes.fr" },
    publisher: { "@type": "Organization", name: "patch-notes.fr" },
    isPartOf: { "@type": "WebSite", name: "patch-notes.fr", url: SITE_URL },
  };
  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Accueil", item: SITE_URL },
      { "@type": "ListItem", position: 2, name: topic, item: `${SITE_URL}/${topic}` },
      { "@type": "ListItem", position: 3, name: post.title, item: canonicalUrl },
    ],
  };

  return `<!doctype html>
<html lang="fr">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)}</title>
    <meta name="description" content="${escapeHtml(description)}" />
    <link rel="canonical" href="/${escapeHtml(topic)}/recap/${escapeHtml(encodeURIComponent(post.id))}" />
    <link rel="icon" href="/favicon.ico" sizes="any" />
    <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
    <link rel="stylesheet" href="/styles.css" />
    <script type="application/ld+json">${escapeJson(jsonLd)}</script>
    <script type="application/ld+json">${escapeJson(breadcrumbJsonLd)}</script>
  </head>
  <body>
    <header class="site-header">
      <div>
        <p class="eyebrow"><a class="subtle-link" href="/">patch-notes.fr</a> / <a class="subtle-link" href="/${escapeHtml(topic)}">${escapeHtml(topic)}</a> / recap</p>
        <h1><a class="brand-link" href="/${escapeHtml(topic)}">${escapeHtml(topic)}</a></h1>
      </div>
      <nav class="site-header-actions" aria-label="Navigation">
        <a class="header-about-link" href="/a-propos">Mais c'est quoi ce site&nbsp;?</a>
        <span id="status">${visibleArticles.length} article${visibleArticles.length > 1 ? "s" : ""}</span>
      </nav>
    </header>

    <main class="posts">
      <label class="search-box">
        <span>Rechercher dans ce recap</span>
        <input id="search" type="search" placeholder="Jeu, source, titre, date..." />
      </label>
      <section id="detail">
        <article class="post">
          <div class="post-meta">${escapeHtml(topic)} - ${escapeHtml(new Intl.DateTimeFormat("fr-FR", { dateStyle: "full", timeStyle: "short" }).format(createdAt))}</div>
          <h2>${escapeHtml(post.title)}</h2>
          <p class="summary">${escapeHtml(post.summary || "")}</p>
          <h3>France</h3>
          <ol class="articles fr-articles">${renderArticleList(frArticles)}</ol>
          <h3>International</h3>
          <ol class="articles intl-articles">${renderArticleList(intlArticles)}</ol>
        </article>
      </section>
    </main>

    <script src="/detail.js"></script>
    <footer class="site-footer">
      <a href="/mentions-legales">Mentions legales</a>
      <a href="/confidentialite">Confidentialite</a>
      <a href="/conditions">Conditions</a>
    </footer>
  </body>
</html>
`;
}

async function serveStatic(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const requestedPath = url.pathname === "/" ? "/index.html" : url.pathname;
  const filePath = path.normalize(path.join(PUBLIC_DIR, requestedPath));

  if (!filePath.startsWith(PUBLIC_DIR)) {
    send(res, 403, "Forbidden", "text/plain; charset=utf-8");
    return;
  }

  try {
    const body = await fs.readFile(filePath);
    send(res, 200, body, contentTypes[path.extname(filePath)] || "application/octet-stream");
  } catch {
    send(res, 404, "Not found", "text/plain; charset=utf-8");
  }
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);

    if (req.method === "GET" && url.pathname === "/") {
      send(res, 200, await renderHubPage(), contentTypes[".html"]);
      return;
    }

    if (req.method === "GET" && url.pathname === "/posts.json") {
      send(res, 200, JSON.stringify(await readPosts()));
      return;
    }

    if (req.method === "GET" && url.pathname === "/robots.txt") {
      send(res, 200, `User-agent: *
Allow: /
Sitemap: ${SITE_URL}/sitemap.xml
`, "text/plain; charset=utf-8");
      return;
    }

    if (req.method === "GET" && url.pathname === "/sitemap.xml") {
      send(res, 200, await renderSitemap(), contentTypes[".xml"]);
      return;
    }

    if (req.method === "GET" && url.pathname.startsWith("/api/posts/")) {
      const id = decodeURIComponent(url.pathname.replace("/api/posts/", ""));
      const post = (await readPosts()).find((item) => item.id === id);
      send(res, post ? 200 : 404, JSON.stringify(post || { error: "Post not found" }));
      return;
    }

    const topicPostsMatch = url.pathname.match(/^\/api\/topics\/([a-z0-9-]+)\/posts$/);
    if (req.method === "GET" && topicPostsMatch) {
      const result = await getTopicPosts(topicPostsMatch[1], {
        offset: url.searchParams.get("offset"),
        limit: url.searchParams.get("limit"),
        query: url.searchParams.get("q") || "",
      });
      send(res, 200, JSON.stringify(result));
      return;
    }

    const staticPages = {
      "/mentions-legales": "mentions-legales.html",
      "/confidentialite": "confidentialite.html",
      "/conditions": "conditions.html",
      "/a-propos": "a-propos.html",
    };
    const staticPagePath = url.pathname.replace(/\/$/, "") || "/";

    if (req.method === "GET" && staticPages[staticPagePath]) {
      const body = await fs.readFile(path.join(PUBLIC_DIR, staticPages[staticPagePath]));
      send(res, 200, body, contentTypes[".html"]);
      return;
    }

    const feedMatch = url.pathname.match(/^\/([a-z0-9-]+)\/feed\.xml$/);
    if (req.method === "GET" && feedMatch) {
      send(res, 200, await renderFeed(feedMatch[1]), contentTypes[".xml"]);
      return;
    }

    if (req.method === "GET" && (url.pathname.startsWith("/recap/") || /^\/[a-z0-9-]+\/recap\//.test(url.pathname))) {
      const match = url.pathname.match(/^\/(?:(?<topic>[a-z0-9-]+)\/)?recap\/(?<id>[^/]+)\/?$/);
      const topic = match?.groups?.topic || "esport";
      const id = decodeURIComponent(match?.groups?.id || "");
      const post = (await readPosts()).find((item) => item.id === id && (item.topic || "esport") === topic);
      if (!post) {
        send(res, 404, "Recap introuvable.", "text/plain; charset=utf-8");
        return;
      }
      send(res, 200, renderRecapPage(post, topic), contentTypes[".html"]);
      return;
    }

    if (req.method === "GET" && isPublicTopicPath(url.pathname)) {
      const topic = url.pathname.replace(/^\/|\/$/g, "");
      send(res, 200, await renderTopicPage(topic), contentTypes[".html"]);
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/posts") {
      if (req.headers["x-blog-secret"] !== BLOG_SECRET) {
        send(res, 401, JSON.stringify({ error: "Invalid blog secret" }));
        return;
      }

      const saved = await writePost(await readJsonBody(req));
      if (!saved) {
        send(res, 200, JSON.stringify({ ok: true, skipped: true, reason: "No new article for this day" }));
        return;
      }
      send(res, 201, JSON.stringify({ ok: true, post: saved }));
      return;
    }

    if (req.method === "GET") {
      await serveStatic(req, res);
      return;
    }

    send(res, 405, "Method not allowed", "text/plain; charset=utf-8");
  } catch (error) {
    send(res, 500, JSON.stringify({ error: error.message }));
  }
});

ensurePostsFile()
  .then(() => {
    server.listen(PORT, () => {
      console.log(`Blog esport listening on http://localhost:${PORT}`);
    });
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
