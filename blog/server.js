/**
 * Serveur HTTP du hub patch-notes.fr.
 *
 * Sert:
 *   - Les pages SSR (hub, sujet, recap, pages légales).
 *   - L'API JSON consommée par le frontend et n8n.
 *   - Le sitemap, les flux RSS et le robots.txt pour le SEO.
 *
 * Persistance: PostgreSQL via blog/db.js (cf. docker-compose).
 *
 * Note: les fichiers statiques sont servis depuis blog/public/.
 * Le style visuel (CSS, layout) n'est pas modifié par cette refonte:
 * seules la couche données et la couche SEO/HTML sont enrichies.
 */

const http = require("node:http");
const fs = require("node:fs/promises");
const path = require("node:path");

const db = require("./db");

const PORT = Number(process.env.PORT || 3001);
const BLOG_SECRET = process.env.BLOG_SECRET || "dev-change-me";
const SITE_URL = (process.env.SITE_URL || "http://localhost:3001").replace(/\/$/, "");
const SITE_NAME = process.env.SITE_NAME || "patch-notes.fr";
const SITE_DESCRIPTION =
  process.env.SITE_DESCRIPTION ||
  "Hub d'actualité par sujet : récaps courts, sources et liens utiles, mis à jour plusieurs fois par jour.";
const SITE_LOCALE = process.env.SITE_LOCALE || "fr_FR";
const SITE_OG_IMAGE = process.env.SITE_OG_IMAGE || `${SITE_URL}/favicon.svg`;

const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, "public");
const TOPIC_PAGE_SIZE = 8;

const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".xml": "application/xml; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
};

const reservedPublicPaths = new Set([
  "a-propos",
  "conditions",
  "confidentialite",
  "mentions-legales",
]);

async function readJsonBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw) return {};
  return JSON.parse(raw);
}

function send(res, status, body, type = "application/json; charset=utf-8", extraHeaders = {}) {
  res.writeHead(status, {
    "content-type": type,
    "cache-control": extraHeaders["cache-control"] || "no-store",
    ...extraHeaders,
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
  const acronyms = new Set(["ai", "api", "ia", "seo", "tv", "vr"]);
  return String(topic || "")
    .split("-")
    .filter(Boolean)
    .map((part) => {
      const lower = part.toLowerCase();
      if (acronyms.has(lower)) return lower.toUpperCase();
      return `${lower.charAt(0).toUpperCase()}${lower.slice(1)}`;
    })
    .join(" / ");
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

function isPublicTopicPath(pathname) {
  const slug = pathname.replace(/^\/|\/$/g, "");
  return /^\/[a-z0-9-]+\/?$/.test(pathname) && !pathname.startsWith("/api") && !reservedPublicPaths.has(slug);
}

function postMode(post) {
  if (post.mode === "fr" || post.mode === "intl" || post.mode === "fr-intl") return post.mode;
  return "fr-intl";
}

function partitionArticles(post) {
  const visible = (post.articles || []).filter(isDisplayableArticle);
  const fr = visible.filter((article) => article.region === "fr");
  const intl = visible.filter((article) => article.region !== "fr");
  return { visible, fr, intl };
}

function articleCountLabel(frArticles, intlArticles) {
  if (frArticles.length && intlArticles.length) return `${frArticles.length} FR / ${intlArticles.length} INT`;
  const total = frArticles.length + intlArticles.length;
  return `${total} article${total > 1 ? "s" : ""}`;
}

function renderArticleList(articles, limit = Infinity) {
  const visibleArticles = articles.slice(0, limit);
  if (!visibleArticles.length) return '<li class="muted-row">Aucun article.</li>';

  return visibleArticles
    .map((article) => {
      const snippet = article.snippet ? `<p class="article-snippet">${escapeHtml(article.snippet)}</p>` : "";
      return `<li>
      <span class="article-meta">${escapeHtml(articleLabel(article))}</span>
      <a href="${escapeHtml(article.url)}" target="_blank" rel="noreferrer">${escapeHtml(article.title)}</a>
      ${snippet}
    </li>`;
    })
    .join("\n");
}

function renderArticleSections(post, limit = Infinity) {
  const mode = postMode(post);
  const { fr, intl } = partitionArticles(post);

  if (mode === "fr-intl" && fr.length && intl.length) {
    return `<div class="split">
      <section>
        <h3>France</h3>
        <ol class="articles fr-articles">${renderArticleList(fr, limit)}</ol>
      </section>
      <section>
        <h3>International</h3>
        <ol class="articles intl-articles">${renderArticleList(intl, limit)}</ol>
      </section>
    </div>`;
  }

  const articles = mode === "intl" ? intl : mode === "fr" ? fr : [...fr, ...intl];
  return `<section>
    <h3>Articles</h3>
    <ol class="articles">${renderArticleList(articles, limit)}</ol>
  </section>`;
}

function renderTopicPostCard(post, topic) {
  const { fr, intl } = partitionArticles(post);
  const createdAt = new Date(post.createdAt || Date.now());

  return `<article class="post">
    <div class="post-meta">${escapeHtml(postSlot(post))} - ${escapeHtml(
      new Intl.DateTimeFormat("fr-FR", { dateStyle: "full", timeStyle: "short" }).format(createdAt),
    )} - ${escapeHtml(articleCountLabel(fr, intl))}</div>
    <h2>${escapeHtml(post.title)}</h2>
    <p class="summary">${escapeHtml(post.summary)}</p>
    ${renderArticleSections(post, 8)}
    <a class="read-more" href="/${encodeURIComponent(topic)}/recap/${encodeURIComponent(post.id)}">Voir le recap complet</a>
  </article>`;
}

function metaTags({ title, description, canonical, ogType = "website", ogImage = SITE_OG_IMAGE, publishedTime, modifiedTime }) {
  const tags = [
    `<meta name="description" content="${escapeHtml(description)}" />`,
    `<meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1" />`,
    `<meta name="theme-color" content="#0a7a68" />`,
    `<link rel="canonical" href="${escapeHtml(canonical)}" />`,
    `<meta property="og:type" content="${escapeHtml(ogType)}" />`,
    `<meta property="og:locale" content="${escapeHtml(SITE_LOCALE)}" />`,
    `<meta property="og:site_name" content="${escapeHtml(SITE_NAME)}" />`,
    `<meta property="og:title" content="${escapeHtml(title)}" />`,
    `<meta property="og:description" content="${escapeHtml(description)}" />`,
    `<meta property="og:url" content="${escapeHtml(canonical)}" />`,
    `<meta property="og:image" content="${escapeHtml(ogImage)}" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${escapeHtml(title)}" />`,
    `<meta name="twitter:description" content="${escapeHtml(description)}" />`,
    `<meta name="twitter:image" content="${escapeHtml(ogImage)}" />`,
  ];
  if (publishedTime) tags.push(`<meta property="article:published_time" content="${escapeHtml(publishedTime)}" />`);
  if (modifiedTime) tags.push(`<meta property="article:modified_time" content="${escapeHtml(modifiedTime)}" />`);
  return tags.join("\n    ");
}

async function renderHubPage() {
  const topics = await db.listTopics();
  const listed = topics.filter((topic) => topic.is_listed);
  const totalPosts = listed.reduce((acc, topic) => acc + (topic.post_count || 0), 0);
  const cards = listed
    .map((topic) => {
      const label = topic.label || topicLabel(topic.slug);
      const description = topic.description
        ? truncate(topic.description, 120)
        : `${topic.post_count || 0} recap${topic.post_count > 1 ? "s" : ""} publie${topic.post_count > 1 ? "s" : ""}.`;
      return `<a class="topic-card" href="/${escapeHtml(topic.slug)}" data-search="${escapeHtml(`${topic.slug} ${label}`)}">
      <span>${topic.post_count > 0 ? "Actif" : "Bientot"}</span>
      <strong>${escapeHtml(label)}</strong>
      <p>${escapeHtml(description)}</p>
    </a>`;
    })
    .join("\n");

  const description = `${SITE_DESCRIPTION} ${listed.length} sujet${listed.length > 1 ? "s" : ""}, ${totalPosts} recap${totalPosts > 1 ? "s" : ""} publié${totalPosts > 1 ? "s" : ""}.`;
  const canonical = `${SITE_URL}/`;

  const websiteJsonLd = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: SITE_NAME,
    url: SITE_URL,
    description: SITE_DESCRIPTION,
    potentialAction: {
      "@type": "SearchAction",
      target: `${SITE_URL}/{topic}?q={search_term_string}`,
      "query-input": "required name=search_term_string",
    },
  };

  const itemListJsonLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    itemListElement: listed.map((topic, index) => ({
      "@type": "ListItem",
      position: index + 1,
      url: `${SITE_URL}/${topic.slug}`,
      name: topic.label || topicLabel(topic.slug),
    })),
  };

  return `<!doctype html>
<html lang="fr">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(SITE_NAME)} - hub d'actualité multi-sujets</title>
    ${metaTags({ title: `${SITE_NAME} - hub d'actualité multi-sujets`, description: truncate(description), canonical })}
    <link rel="icon" href="/favicon.ico" sizes="any" />
    <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
    <link rel="alternate" type="application/rss+xml" title="Sitemap" href="/sitemap.xml" />
    <link rel="stylesheet" href="/styles.css" />
    <script type="application/ld+json">${escapeJson(websiteJsonLd)}</script>
    <script type="application/ld+json">${escapeJson(itemListJsonLd)}</script>
  </head>
  <body>
    <header class="site-header">
      <div>
        <h1 class="site-wordmark">PATCH-NOTES.FR</h1>
      </div>
      <nav class="site-header-actions" aria-label="Navigation">
        <a class="header-about-link" href="/a-propos">Mais c'est quoi ce site&nbsp;?</a>
        <span id="status">${listed.length} sujet${listed.length > 1 ? "s" : ""}</span>
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
        ${cards || '<p class="empty">Aucun sujet pour le moment.</p>'}
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

async function renderTopicPage(topicSlug) {
  const topic = await db.getTopic(topicSlug);
  const label = topic?.label || topicLabel(topicSlug);
  const description = topic?.description || `Récaps courts, sources et liens utiles pour suivre l'actualité ${label}.`;
  const page = await db.getTopicPostsPage(topicSlug, { limit: TOPIC_PAGE_SIZE });

  let currentDay = "";
  const postsHtml = page.posts.length
    ? page.posts
        .map((post) => {
          const key = dayKey(post);
          const heading = key !== currentDay ? `<h2 class="day-heading">${escapeHtml(dayLabel(post))}</h2>` : "";
          currentDay = key;
          return `${heading}${renderTopicPostCard(post, topicSlug)}`;
        })
        .join("\n")
    : '<p class="empty">Aucun recap pour le moment. Lance le workflow n8n pour publier le premier.</p>';

  const canonical = `${SITE_URL}/${topicSlug}`;
  const seoTitle = `${SITE_NAME}/${topicSlug} - veille ${label}`;
  const seoDescription = page.posts[0]?.summary ? truncate(page.posts[0].summary) : truncate(description);

  const collectionJsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: seoTitle,
    description: seoDescription,
    url: canonical,
    isPartOf: { "@type": "WebSite", name: SITE_NAME, url: SITE_URL },
    inLanguage: "fr-FR",
    about: { "@type": "Thing", name: label },
  };

  const itemListJsonLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    itemListElement: page.posts.slice(0, 10).map((post, index) => ({
      "@type": "ListItem",
      position: index + 1,
      url: `${SITE_URL}/${topicSlug}/recap/${encodeURIComponent(post.id)}`,
      name: post.title,
    })),
  };

  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Accueil", item: SITE_URL },
      { "@type": "ListItem", position: 2, name: label, item: canonical },
    ],
  };

  return `<!doctype html>
<html lang="fr">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(seoTitle)}</title>
    ${metaTags({ title: seoTitle, description: seoDescription, canonical })}
    <link rel="alternate" type="application/rss+xml" title="${escapeHtml(SITE_NAME)} / ${escapeHtml(label)}" href="/${escapeHtml(topicSlug)}/feed.xml" />
    <link rel="icon" href="/favicon.ico" sizes="any" />
    <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
    <link rel="stylesheet" href="/styles.css" />
    <script type="application/ld+json">${escapeJson(collectionJsonLd)}</script>
    <script type="application/ld+json">${escapeJson(itemListJsonLd)}</script>
    <script type="application/ld+json">${escapeJson(breadcrumbJsonLd)}</script>
  </head>
  <body>
    <header class="site-header">
      <div>
        <p class="eyebrow"><a class="subtle-link" href="/">${escapeHtml(SITE_NAME)}</a> / ${escapeHtml(topicSlug)}</p>
        <h1>${escapeHtml(topicSlug)}</h1>
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

function renderRecapPage(post, topicSlug) {
  const createdAt = new Date(post.createdAt || Date.now());
  const description = truncate(post.summary || post.title);
  const canonicalUrl = `${SITE_URL}/${topicSlug}/recap/${encodeURIComponent(post.id)}`;
  const title = `${post.title} | ${SITE_NAME}`;
  const { visible } = partitionArticles(post);
  const keywords = [
    topicSlug,
    ...new Set(visible.map((article) => article.source).filter(Boolean)),
  ]
    .slice(0, 12)
    .join(", ");

  const newsArticleJsonLd = {
    "@context": "https://schema.org",
    "@type": "NewsArticle",
    headline: post.title,
    description,
    datePublished: createdAt.toISOString(),
    dateModified: createdAt.toISOString(),
    mainEntityOfPage: canonicalUrl,
    url: canonicalUrl,
    inLanguage: "fr-FR",
    articleSection: topicLabel(topicSlug),
    keywords,
    author: { "@type": "Organization", name: SITE_NAME, url: SITE_URL },
    publisher: {
      "@type": "Organization",
      name: SITE_NAME,
      url: SITE_URL,
      logo: { "@type": "ImageObject", url: SITE_OG_IMAGE },
    },
    isPartOf: { "@type": "WebSite", name: SITE_NAME, url: SITE_URL },
    about: { "@type": "Thing", name: topicLabel(topicSlug) },
    citation: visible.slice(0, 10).map((article) => ({
      "@type": "CreativeWork",
      headline: article.title,
      url: article.url,
      author: { "@type": "Organization", name: article.source || "" },
    })),
  };

  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Accueil", item: SITE_URL },
      { "@type": "ListItem", position: 2, name: topicLabel(topicSlug), item: `${SITE_URL}/${topicSlug}` },
      { "@type": "ListItem", position: 3, name: post.title, item: canonicalUrl },
    ],
  };

  return `<!doctype html>
<html lang="fr">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)}</title>
    ${metaTags({
      title,
      description,
      canonical: canonicalUrl,
      ogType: "article",
      publishedTime: createdAt.toISOString(),
      modifiedTime: createdAt.toISOString(),
    })}
    <meta name="news_keywords" content="${escapeHtml(keywords)}" />
    <link rel="icon" href="/favicon.ico" sizes="any" />
    <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
    <link rel="stylesheet" href="/styles.css" />
    <script type="application/ld+json">${escapeJson(newsArticleJsonLd)}</script>
    <script type="application/ld+json">${escapeJson(breadcrumbJsonLd)}</script>
  </head>
  <body>
    <header class="site-header">
      <div>
        <p class="eyebrow"><a class="subtle-link" href="/">${escapeHtml(SITE_NAME)}</a> / <a class="subtle-link" href="/${escapeHtml(topicSlug)}">${escapeHtml(topicSlug)}</a> / recap</p>
        <h1><a class="brand-link" href="/${escapeHtml(topicSlug)}">${escapeHtml(topicSlug)}</a></h1>
      </div>
      <nav class="site-header-actions" aria-label="Navigation">
        <a class="header-about-link" href="/a-propos">Mais c'est quoi ce site&nbsp;?</a>
        <span id="status">${visible.length} article${visible.length > 1 ? "s" : ""}</span>
      </nav>
    </header>

    <main class="posts">
      <label class="search-box">
        <span>Rechercher dans ce recap</span>
        <input id="search" type="search" placeholder="Jeu, source, titre, date..." />
      </label>
      <section id="detail">
        <article class="post">
          <div class="post-meta">${escapeHtml(topicSlug)} - ${escapeHtml(
            new Intl.DateTimeFormat("fr-FR", { dateStyle: "full", timeStyle: "short" }).format(createdAt),
          )}</div>
          <h2>${escapeHtml(post.title)}</h2>
          <p class="summary">${escapeHtml(post.summary || "")}</p>
          ${renderArticleSections(post)}
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

async function renderFeed(topicSlug) {
  const posts = await db.getRecentPostsForTopic(topicSlug, 30);
  const topic = await db.getTopic(topicSlug);
  const label = topic?.label || topicLabel(topicSlug);
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${escapeXml(SITE_NAME)} / ${escapeXml(label)}</title>
    <link>${escapeXml(`${SITE_URL}/${topicSlug}`)}</link>
    <atom:link href="${escapeXml(`${SITE_URL}/${topicSlug}/feed.xml`)}" rel="self" type="application/rss+xml" />
    <description>Recaps courts et sources pour ${escapeXml(label)}.</description>
    <language>fr-FR</language>
${posts
  .map(
    (post) => `    <item>
      <title>${escapeXml(post.title)}</title>
      <link>${escapeXml(`${SITE_URL}/${topicSlug}/recap/${encodeURIComponent(post.id)}`)}</link>
      <guid isPermaLink="true">${escapeXml(`${SITE_URL}/${topicSlug}/recap/${encodeURIComponent(post.id)}`)}</guid>
      <pubDate>${new Date(post.createdAt || Date.now()).toUTCString()}</pubDate>
      <description>${escapeXml(post.summary || "")}</description>
    </item>`,
  )
  .join("\n")}
  </channel>
</rss>
`;
}

async function renderSitemapIndex() {
  const topics = await db.listTopics();
  const listed = topics.filter((topic) => topic.is_listed);
  const entries = [
    { loc: `${SITE_URL}/sitemap-core.xml`, lastmod: new Date().toISOString() },
    ...listed.map((topic) => ({
      loc: `${SITE_URL}/sitemap-${topic.slug}.xml`,
      lastmod: (topic.last_post_at instanceof Date ? topic.last_post_at : new Date()).toISOString(),
    })),
  ];

  return `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries
  .map(
    (entry) => `  <sitemap>
    <loc>${escapeXml(entry.loc)}</loc>
    <lastmod>${entry.lastmod}</lastmod>
  </sitemap>`,
  )
  .join("\n")}
</sitemapindex>
`;
}

async function renderCoreSitemap() {
  const topics = (await db.listTopics()).filter((topic) => topic.is_listed);
  const urls = [
    { loc: `${SITE_URL}/`, changefreq: "hourly", priority: "1.0" },
    { loc: `${SITE_URL}/a-propos`, changefreq: "monthly", priority: "0.4" },
    { loc: `${SITE_URL}/mentions-legales`, changefreq: "yearly", priority: "0.2" },
    { loc: `${SITE_URL}/confidentialite`, changefreq: "yearly", priority: "0.2" },
    { loc: `${SITE_URL}/conditions`, changefreq: "yearly", priority: "0.2" },
    ...topics.map((topic) => ({
      loc: `${SITE_URL}/${topic.slug}`,
      changefreq: "hourly",
      priority: "0.9",
      lastmod: topic.last_post_at instanceof Date ? topic.last_post_at.toISOString() : null,
    })),
  ];

  return urlSetXml(urls);
}

async function renderTopicSitemap(topicSlug) {
  const topic = await db.getTopic(topicSlug);
  if (!topic) return null;
  const posts = await db.getRecentPostsForTopic(topicSlug, 5000);
  const urls = [
    { loc: `${SITE_URL}/${topicSlug}`, changefreq: "hourly", priority: "0.9" },
    ...posts.map((post) => ({
      loc: `${SITE_URL}/${topicSlug}/recap/${encodeURIComponent(post.id)}`,
      lastmod: new Date(post.createdAt || Date.now()).toISOString(),
      changefreq: "weekly",
      priority: "0.7",
    })),
  ];
  return urlSetXml(urls);
}

function urlSetXml(urls) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls
  .map(
    (url) => `  <url>
    <loc>${escapeXml(url.loc)}</loc>${url.lastmod ? `\n    <lastmod>${url.lastmod}</lastmod>` : ""}
    <changefreq>${url.changefreq}</changefreq>
    <priority>${url.priority}</priority>
  </url>`,
  )
  .join("\n")}
</urlset>
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
    const ext = path.extname(filePath);
    send(res, 200, body, contentTypes[ext] || "application/octet-stream", {
      "cache-control": "public, max-age=300, s-maxage=600",
    });
  } catch {
    send(res, 404, "Not found", "text/plain; charset=utf-8");
  }
}

async function handleRequest(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (req.method === "GET" && url.pathname === "/health") {
    try {
      await db.pingDb();
      send(res, 200, JSON.stringify({ ok: true }));
    } catch (error) {
      send(res, 503, JSON.stringify({ ok: false, error: error.message }));
    }
    return;
  }

  if (req.method === "GET" && url.pathname === "/") {
    send(res, 200, await renderHubPage(), contentTypes[".html"], {
      "cache-control": "public, max-age=60, s-maxage=120",
    });
    return;
  }

  if (req.method === "GET" && url.pathname === "/robots.txt") {
    send(
      res,
      200,
      `User-agent: *\nAllow: /\nSitemap: ${SITE_URL}/sitemap.xml\n`,
      contentTypes[".txt"],
      { "cache-control": "public, max-age=86400" },
    );
    return;
  }

  if (req.method === "GET" && url.pathname === "/sitemap.xml") {
    send(res, 200, await renderSitemapIndex(), contentTypes[".xml"], {
      "cache-control": "public, max-age=600",
    });
    return;
  }

  if (req.method === "GET" && url.pathname === "/sitemap-core.xml") {
    send(res, 200, await renderCoreSitemap(), contentTypes[".xml"], {
      "cache-control": "public, max-age=600",
    });
    return;
  }

  const sitemapTopicMatch = url.pathname.match(/^\/sitemap-([a-z0-9-]+)\.xml$/);
  if (req.method === "GET" && sitemapTopicMatch) {
    const xml = await renderTopicSitemap(sitemapTopicMatch[1]);
    if (!xml) {
      send(res, 404, "Sitemap inconnu.", contentTypes[".txt"]);
      return;
    }
    send(res, 200, xml, contentTypes[".xml"], { "cache-control": "public, max-age=600" });
    return;
  }

  if (req.method === "GET" && url.pathname.startsWith("/api/posts/")) {
    const id = decodeURIComponent(url.pathname.replace("/api/posts/", ""));
    const post = await db.getPostById(id);
    send(res, post ? 200 : 404, JSON.stringify(post || { error: "Post not found" }));
    return;
  }

  const topicPostsMatch = url.pathname.match(/^\/api\/topics\/([a-z0-9-]+)\/posts$/);
  if (req.method === "GET" && topicPostsMatch) {
    const result = await db.getTopicPostsPage(topicPostsMatch[1], {
      offset: url.searchParams.get("offset"),
      limit: url.searchParams.get("limit"),
      query: url.searchParams.get("q") || "",
    });
    send(res, 200, JSON.stringify(result));
    return;
  }

  const sameDayMatch = url.pathname.match(/^\/api\/topics\/([a-z0-9-]+)\/same-day-urls$/);
  if (req.method === "GET" && sameDayMatch) {
    const day = url.searchParams.get("date") || new Date().toISOString().slice(0, 10);
    const urls = await db.getSameDayUrlKeys(sameDayMatch[1], day);
    send(res, 200, JSON.stringify({ topic: sameDayMatch[1], date: day, urls }));
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/topics") {
    const topics = await db.listTopics();
    send(res, 200, JSON.stringify({ topics }));
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/gemini/reserve") {
    if (req.headers["x-blog-secret"] !== BLOG_SECRET) {
      send(res, 401, JSON.stringify({ error: "Invalid blog secret" }));
      return;
    }
    const body = await readJsonBody(req);
    const result = await db.reserveGeminiSlot({
      topicSlug: body.topicSlug || null,
      maxPerMinute: body.maxPerMinute,
      maxWaitSeconds: body.maxWaitSeconds,
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
    send(res, 200, body, contentTypes[".html"], {
      "cache-control": "public, max-age=600, s-maxage=1200",
    });
    return;
  }

  const feedMatch = url.pathname.match(/^\/([a-z0-9-]+)\/feed\.xml$/);
  if (req.method === "GET" && feedMatch) {
    send(res, 200, await renderFeed(feedMatch[1]), contentTypes[".xml"], {
      "cache-control": "public, max-age=300",
    });
    return;
  }

  if (req.method === "GET" && (url.pathname.startsWith("/recap/") || /^\/[a-z0-9-]+\/recap\//.test(url.pathname))) {
    const match = url.pathname.match(/^\/(?:(?<topic>[a-z0-9-]+)\/)?recap\/(?<id>[^/]+)\/?$/);
    const topicSlug = match?.groups?.topic || "esport";
    const id = decodeURIComponent(match?.groups?.id || "");
    const post = await db.getPostById(id);
    if (!post || (post.topic || "esport") !== topicSlug) {
      send(res, 404, "Recap introuvable.", contentTypes[".txt"]);
      return;
    }
    send(res, 200, renderRecapPage(post, topicSlug), contentTypes[".html"], {
      "cache-control": "public, max-age=300, s-maxage=600",
    });
    return;
  }

  if (req.method === "GET" && isPublicTopicPath(url.pathname)) {
    const topicSlug = url.pathname.replace(/^\/|\/$/g, "");
    send(res, 200, await renderTopicPage(topicSlug), contentTypes[".html"], {
      "cache-control": "public, max-age=120, s-maxage=240",
    });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/posts") {
    if (req.headers["x-blog-secret"] !== BLOG_SECRET) {
      send(res, 401, JSON.stringify({ error: "Invalid blog secret" }));
      return;
    }

    const body = await readJsonBody(req);
    const result = await db.createPost(body);
    if (result.skipped) {
      send(res, 200, JSON.stringify({ ok: true, skipped: true, reason: result.reason }));
      return;
    }
    send(res, 201, JSON.stringify({ ok: true, post: result.post }));
    return;
  }

  if (req.method === "PUT" && url.pathname === "/api/topics") {
    if (req.headers["x-blog-secret"] !== BLOG_SECRET) {
      send(res, 401, JSON.stringify({ error: "Invalid blog secret" }));
      return;
    }
    const body = await readJsonBody(req);
    const topic = await db.upsertTopic(body);
    send(res, 200, JSON.stringify({ ok: true, topic }));
    return;
  }

  if (req.method === "GET") {
    await serveStatic(req, res);
    return;
  }

  send(res, 405, "Method not allowed", contentTypes[".txt"]);
}

const server = http.createServer(async (req, res) => {
  try {
    await handleRequest(req, res);
  } catch (error) {
    console.error("[server] error", error);
    send(res, 500, JSON.stringify({ error: error.message || "internal error" }));
  }
});

async function start() {
  await db.ensureSchema();

  // Auto-déclare les sujets de référence pour que la home affiche les cartes
  // même avant la première publication n8n. Le script n8n peut surcharger.
  const seeds = [
    { slug: "esport", label: "Esport", description: "Compétitions, rosters, tournois et scènes FR / internationales.", mode: "fr-intl" },
  ];
  for (const seed of seeds) {
    try {
      await db.upsertTopic(seed);
    } catch (error) {
      console.warn("[seed] topic", seed.slug, error.message);
    }
  }

  server.listen(PORT, () => {
    console.log(`[blog] listening on http://0.0.0.0:${PORT}`);
  });
}

function shutdown(signal) {
  console.log(`[blog] received ${signal}, shutting down`);
  server.close(async () => {
    await db.close().catch((error) => console.error("[blog] close error", error));
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

start().catch((error) => {
  console.error("[blog] startup failed", error);
  process.exit(1);
});
