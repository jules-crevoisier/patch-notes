/**
 * Serveur HTTP du hub patch-notes.fr.
 *
 * Sert:
 *   - Les pages SSR (hub, sujet, recap, pages légales).
 *   - L'API JSON consommée par le frontend.
 *   - Le sitemap, les flux RSS et le robots.txt pour le SEO.
 *
 * Le pipeline de récap (fetch RSS/Google News -> Gemini -> publication) tourne
 * en interne via blog/automation/ (cron scheduler + appel direct à db.js,
 * plus de service n8n séparé). Cf. blog/automation/scheduler.js.
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
const automation = require("./automation/scheduler");
const pins = require("./pins");
const seoUrls = require("./seo-urls");
const topicThemes = require("./topic-themes");

const PORT = Number(process.env.PORT || 3001);
const BLOG_SECRET = process.env.BLOG_SECRET || "dev-change-me";
const IP_HASH_SECRET = process.env.IP_HASH_SECRET || "dev-change-me-ip-hash";
const SITE_URL = (process.env.SITE_URL || "http://localhost:3001").replace(/\/$/, "");
const SITE_NAME = process.env.SITE_NAME || "patch-notes.fr";
const SITE_DESCRIPTION =
  process.env.SITE_DESCRIPTION ||
  "Hub d'actualité par sujet : récaps courts, sources et liens utiles, mis à jour plusieurs fois par jour.";
const SITE_LOCALE = process.env.SITE_LOCALE || "fr_FR";
const SITE_OG_IMAGE = process.env.SITE_OG_IMAGE || `${SITE_URL}/og.jpg`;
const SITE_OG_IMAGE_WIDTH = Number(process.env.SITE_OG_IMAGE_WIDTH || 1424);
const SITE_OG_IMAGE_HEIGHT = Number(process.env.SITE_OG_IMAGE_HEIGHT || 752);
const SITE_OG_IMAGE_ALT =
  process.env.SITE_OG_IMAGE_ALT || `${SITE_NAME} — hub d'actualité multi-sujets`;
const GOOGLE_SITE_VERIFICATION = process.env.GOOGLE_SITE_VERIFICATION || "";

const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, "public");
const TOPIC_PAGE_SIZE = 8;

const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".ico": "image/x-icon",
  ".xml": "application/xml; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
};

const reservedPublicPaths = new Set([
  "a-propos",
  "confidentialite",
  "mentions-legales",
  "suggerer",
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

function getClientIp(req) {
  // Dev has no reverse proxy in front of it, so x-real-ip is absent locally -
  // remoteAddress is the fallback. Never logged, never stored raw: only
  // pins.hashIp(...)'s output ever touches the database.
  return req.headers["x-real-ip"] || req.socket.remoteAddress || "";
}

function readCookie(req, name) {
  const header = String(req.headers.cookie || "");
  const match = header.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  return match ? decodeURIComponent(match[1]) : "";
}

function resolvePinIdentity(req) {
  const visitorId = String(req.headers["x-visitor-id"] || readCookie(req, "pn_vid") || "").trim();
  if (pins.isValidVisitorId(visitorId)) {
    return pins.hashVisitorId(IP_HASH_SECRET, visitorId);
  }
  return pins.hashIp(IP_HASH_SECRET, getClientIp(req));
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

function sendRedirect(res, location, status = 301) {
  res.writeHead(status, { Location: location, "cache-control": "public, max-age=3600" });
  res.end();
}

function renderArticleList(articles, { topicSlug, limit = Infinity } = {}) {
  const visibleArticles = articles.slice(0, limit);
  if (!visibleArticles.length) return '<li class="muted-row">Aucun article.</li>';

  return visibleArticles
    .map((article) => {
      const landingPath = article.landingPath || seoUrls.articlePublicPath(topicSlug, article);
      const snippet = article.snippet ? `<p class="article-snippet">${escapeHtml(article.snippet)}</p>` : "";
      const sourceLink = article.url
        ? `<a class="article-source-link" href="${escapeHtml(article.url)}" target="_blank" rel="noopener noreferrer">Lire sur ${escapeHtml(article.source || "la source")} ↗</a>`
        : "";
      return `<li>
      <span class="article-meta">${escapeHtml(articleLabel(article))}</span>
      <a href="${escapeHtml(landingPath)}">${escapeHtml(article.title)}</a>
      ${snippet}
      ${sourceLink}
    </li>`;
    })
    .join("\n");
}

function renderArticleSections(post, { topicSlug, limit = Infinity } = {}) {
  const slug = topicSlug || post.topic;
  const mode = postMode(post);
  const { fr, intl } = partitionArticles(post);

  if (mode === "fr-intl" && fr.length && intl.length) {
    return `<div class="split">
      <section>
        <h3>France</h3>
        <ol class="articles fr-articles">${renderArticleList(fr, { topicSlug: slug, limit })}</ol>
      </section>
      <section>
        <h3>International</h3>
        <ol class="articles intl-articles">${renderArticleList(intl, { topicSlug: slug, limit })}</ol>
      </section>
    </div>`;
  }

  const articles = mode === "intl" ? intl : mode === "fr" ? fr : [...fr, ...intl];
  return `<section>
    <h3>Articles</h3>
    <ol class="articles">${renderArticleList(articles, { topicSlug: slug, limit })}</ol>
  </section>`;
}

const PIN_GLYPH_SVG = `<svg class="pin-toggle-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M16 9V4h1c.55 0 1-.45 1-1s-.45-1-1-1H7c-.55 0-1 .45-1 1s.45 1 1 1h1v5c0 1.66-1.34 3-3 3v2h5.97v7l1.03 1 1.03-1v-7H19v-2c-1.66 0-3-1.34-3-3z"/></svg>`;

function renderSiteHeaderNav({ statusHtml = "" } = {}) {
  const status = statusHtml ? `\n        ${statusHtml}` : "";
  return `<nav class="site-header-actions" aria-label="Navigation">
        <a class="header-nav-link" href="/suggerer">Suggérer un sujet</a>
        <a class="header-nav-link" href="/a-propos">Mais c'est quoi ce site&nbsp;?</a>${status}
      </nav>`;
}

function renderFaviconLinks() {
  return `<link rel="icon" href="/favicon.svg" type="image/svg+xml" />
    <link rel="icon" href="/favicon.png" type="image/png" sizes="512x512" />
    <link rel="apple-touch-icon" href="/apple-touch-icon.png" sizes="180x180" />`;
}

function renderSiteFooter({ isHome = false } = {}) {
  const links = [];
  if (!isHome) links.push('<a href="/">Accueil</a>');
  links.push(
    '<a href="/a-propos">Mais c\'est quoi ce site&nbsp;?</a>',
    '<a href="/mentions-legales">Mentions légales</a>',
    '<a href="/confidentialite">Confidentialité</a>',
    '<a href="/suggerer">Suggérer un sujet</a>',
  );
  return `<footer class="site-footer">\n      ${links.join("\n      ")}\n    </footer>`;
}

function renderBodyScripts(extraScripts = []) {
  return extraScripts.join("\n    ");
}

function renderTopicPinButton(topic, { pinnedByMe = false } = {}) {
  const label = topic.label || topicLabel(topic.slug);
  const action = pinnedByMe ? "Retirer" : "Épingler";
  return `<button type="button" class="pin-toggle pin-toggle--topic" data-topic-slug="${escapeHtml(topic.slug)}" aria-pressed="${pinnedByMe ? "true" : "false"}" aria-label="${action} ${escapeHtml(label)}" title="${action} ${escapeHtml(label)}">
      ${PIN_GLYPH_SVG}
    </button>`;
}

function renderTopicPostCard(post, topic) {
  const { fr, intl } = partitionArticles(post);
  const createdAt = new Date(post.createdAt || Date.now());

  return `<article class="post">
    <div class="post-meta">
      <span class="post-meta-text">${escapeHtml(postSlot(post))} - ${escapeHtml(
        new Intl.DateTimeFormat("fr-FR", { dateStyle: "full", timeStyle: "short" }).format(createdAt),
      )} - ${escapeHtml(articleCountLabel(fr, intl))}</span>
    </div>
    <h2>${escapeHtml(post.title)}</h2>
    <p class="summary">${escapeHtml(post.summary)}</p>
    ${renderArticleSections(post, { topicSlug: topic, limit: 8 })}
    <a class="read-more" href="/${encodeURIComponent(topic)}/recap/${encodeURIComponent(post.id)}">Voir le recap complet</a>
  </article>`;
}

function metaTags({ title, description, canonical, ogType = "website", ogImage = SITE_OG_IMAGE, publishedTime, modifiedTime, themeColor = "#0a7a68" }) {
  const tags = [
    `<meta name="description" content="${escapeHtml(description)}" />`,
    `<meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1" />`,
    `<meta name="theme-color" content="${escapeHtml(themeColor)}" />`,
    `<link rel="canonical" href="${escapeHtml(canonical)}" />`,
    `<meta property="og:type" content="${escapeHtml(ogType)}" />`,
    `<meta property="og:locale" content="${escapeHtml(SITE_LOCALE)}" />`,
    `<meta property="og:site_name" content="${escapeHtml(SITE_NAME)}" />`,
    `<meta property="og:title" content="${escapeHtml(title)}" />`,
    `<meta property="og:description" content="${escapeHtml(description)}" />`,
    `<meta property="og:url" content="${escapeHtml(canonical)}" />`,
    `<meta property="og:image" content="${escapeHtml(ogImage)}" />`,
    `<meta property="og:image:secure_url" content="${escapeHtml(ogImage)}" />`,
    `<meta property="og:image:width" content="${SITE_OG_IMAGE_WIDTH}" />`,
    `<meta property="og:image:height" content="${SITE_OG_IMAGE_HEIGHT}" />`,
    `<meta property="og:image:alt" content="${escapeHtml(SITE_OG_IMAGE_ALT)}" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${escapeHtml(title)}" />`,
    `<meta name="twitter:description" content="${escapeHtml(description)}" />`,
    `<meta name="twitter:image" content="${escapeHtml(ogImage)}" />`,
    `<meta name="twitter:image:alt" content="${escapeHtml(SITE_OG_IMAGE_ALT)}" />`,
  ];
  if (GOOGLE_SITE_VERIFICATION) {
    tags.push(`<meta name="google-site-verification" content="${escapeHtml(GOOGLE_SITE_VERIFICATION)}" />`);
  }
  if (publishedTime) tags.push(`<meta property="article:published_time" content="${escapeHtml(publishedTime)}" />`);
  if (modifiedTime) tags.push(`<meta property="article:modified_time" content="${escapeHtml(modifiedTime)}" />`);
  return tags.join("\n    ");
}

async function renderHubPage({ ipHash } = {}) {
  const topics = await db.listTopics();
  const listed = topics.filter((topic) => topic.is_listed);
  const pinnedSlugs = new Set(await db.getVisitorPinnedTopicSlugs(ipHash));
  const sorted = [...listed].sort((a, b) => {
    const aPinned = pinnedSlugs.has(a.slug) ? 0 : 1;
    const bPinned = pinnedSlugs.has(b.slug) ? 0 : 1;
    if (aPinned !== bPinned) return aPinned - bPinned;
    return (b.label || topicLabel(b.slug)).localeCompare(a.label || topicLabel(a.slug), "fr");
  });
  const totalPosts = listed.reduce((acc, topic) => acc + (topic.post_count || 0), 0);
  const cards = sorted
    .map((topic) => {
      const label = topic.label || topicLabel(topic.slug);
      const description = topic.description
        ? truncate(topic.description, 120)
        : `${topic.post_count || 0} recap${topic.post_count > 1 ? "s" : ""} publié${topic.post_count > 1 ? "s" : ""}.`;
      const pinnedByMe = pinnedSlugs.has(topic.slug);
      return `<div class="topic-card-shell${pinnedByMe ? " is-pinned" : ""}" data-topic="${escapeHtml(topic.slug)}">
      <a class="topic-card" href="/${escapeHtml(topic.slug)}" data-search="${escapeHtml(`${topic.slug} ${label}`)}">
      <span>${topic.post_count > 0 ? "Actif" : "Bientôt"}</span>
      <strong>${escapeHtml(label)}</strong>
      <p>${escapeHtml(description)}</p>
    </a>
      ${renderTopicPinButton(topic, { pinnedByMe })}
    </div>`;
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
    inLanguage: "fr-FR",
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
    ${renderFaviconLinks()}
    ${topicThemes.renderTopicThemeStyleBlock()}
    <link rel="stylesheet" href="/styles.css" />
    <script type="application/ld+json">${escapeJson(websiteJsonLd)}</script>
    <script type="application/ld+json">${escapeJson(itemListJsonLd)}</script>
  </head>
  <body>
    <header class="site-header">
      <div>
        <h1 class="site-wordmark">PATCH-NOTES.FR</h1>
      </div>
      ${renderSiteHeaderNav({ statusHtml: `<span id="status">${listed.length} sujet${listed.length > 1 ? "s" : ""}</span>` })}
    </header>

    <main class="posts">
      <section class="hub-intro">
        <p class="summary"><strong>Ceci est un hub d'actualités</strong> | <em>Récaps générés par IA — des erreurs sont possibles, nous nous en excusons.</em></p><br>
        <p>Pour chaque sujet, un patch automatique est publié à 6&nbsp;h, 11&nbsp;h, 18&nbsp;h et 23&nbsp;h.</p>
        <p class="hub-pin-hint">Épinglez vos sujets favoris pour les retrouver en haut de la liste.</p>
      </section>

      <div class="hub-tools">
        ${topicThemes.renderTopicWheel(listed)}
        <label class="search-box hub-search">
          <span>Rechercher un sujet</span>
          <input id="topic-search" type="search" placeholder="Esport, gaming, tech IA, F1…" autocomplete="off" />
        </label>
      </div>

      <section class="topic-grid" id="topics" aria-label="Sujets">
        ${cards || '<p class="empty">Aucun sujet pour le moment.</p>'}
      </section>
    </main>

    ${renderSiteFooter({ isHome: true })}

    ${renderBodyScripts([
      '<script src="/pin-store.js"></script>',
      '<script src="/hub.js"></script>',
    ])}
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
    : '<p class="empty">Aucun recap pour le moment. Le prochain passage automatique est à 6h, 11h, 18h ou 23h - ou lance `node automation/run-now.js &lt;slug&gt;` pour publier le premier.</p>';

  const canonical = `${SITE_URL}/${topicSlug}`;
  const seoTitle = `${label} — actualités et récaps | ${SITE_NAME}`;
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

  const theme = topicThemes.getTopicTheme(topicSlug);

  return `<!doctype html>
<html lang="fr">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(seoTitle)}</title>
    ${metaTags({ title: seoTitle, description: seoDescription, canonical, themeColor: theme.accent })}
    <link rel="alternate" type="application/rss+xml" title="${escapeHtml(SITE_NAME)} / ${escapeHtml(label)}" href="/${escapeHtml(topicSlug)}/feed.xml" />
    ${renderFaviconLinks()}
    ${topicThemes.renderTopicThemeStyleBlock()}
    <link rel="stylesheet" href="/styles.css" />
    <script type="application/ld+json">${escapeJson(collectionJsonLd)}</script>
    <script type="application/ld+json">${escapeJson(itemListJsonLd)}</script>
    <script type="application/ld+json">${escapeJson(breadcrumbJsonLd)}</script>
  </head>
  <body${topicThemes.topicBodyClass(topicSlug)}>
    <header class="site-header site-header--topic">
      <div>
        <p class="eyebrow"><a class="subtle-link" href="/">${escapeHtml(SITE_NAME)}</a> / ${escapeHtml(label)}</p>
        <h1>${escapeHtml(label)}</h1>
      </div>
      ${renderSiteHeaderNav({ statusHtml: `<span id="status">${page.total} recap${page.total > 1 ? "s" : ""}</span>` })}
    </header>

    <main class="posts">
      <label class="search-box">
        <span>Filtrer les récaps</span>
        <input id="search" type="search" placeholder="Titre, source, date, mot-clé…" autocomplete="off" />
      </label>
      <section id="posts">${postsHtml}</section>
      <div id="load-more-sentinel" class="load-more-sentinel" data-has-more="${page.hasMore ? "true" : "false"}">
        ${page.hasMore ? "Chargement..." : ""}
      </div>
    </main>

    <template id="post-template">
      <article class="post">
        <div class="post-meta">
          <span class="post-meta-text"></span>
        </div>
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

    ${renderSiteFooter()}
    ${renderBodyScripts(['<script src="/app.js"></script>'])}
  </body>
</html>
`;
}

function renderRecapPage(post, topicSlug, topicLabelText) {
  const label = topicLabelText || topicLabel(topicSlug);
  const createdAt = new Date(post.createdAt || Date.now());
  const description = truncate(post.summary || post.title);
  const canonicalUrl = `${SITE_URL}/${topicSlug}/recap/${encodeURIComponent(post.id)}`;
  const title = `${post.title} | ${SITE_NAME}`;
  const { visible } = partitionArticles(post);
  const keywords = [
    label,
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
    mainEntityOfPage: { "@type": "WebPage", "@id": canonicalUrl },
    url: canonicalUrl,
    inLanguage: "fr-FR",
    articleSection: label,
    keywords,
    author: { "@type": "Organization", name: SITE_NAME, url: SITE_URL },
    publisher: {
      "@type": "Organization",
      name: SITE_NAME,
      url: SITE_URL,
      logo: { "@type": "ImageObject", url: SITE_OG_IMAGE },
    },
    isPartOf: { "@type": "WebSite", name: SITE_NAME, url: SITE_URL },
    about: { "@type": "Thing", name: label },
    citation: visible.slice(0, 10).map((article) => ({
      "@type": "NewsArticle",
      headline: article.title,
      url: article.landingPath
        ? `${SITE_URL}${article.landingPath}`
        : `${SITE_URL}${seoUrls.articlePublicPath(topicSlug, article)}`,
      sameAs: article.url,
      author: { "@type": "Organization", name: article.source || "" },
    })),
  };

  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Accueil", item: SITE_URL },
      { "@type": "ListItem", position: 2, name: label, item: `${SITE_URL}/${topicSlug}` },
      { "@type": "ListItem", position: 3, name: post.title, item: canonicalUrl },
    ],
  };

  const theme = topicThemes.getTopicTheme(topicSlug);

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
      themeColor: theme.accent,
    })}
    <meta name="news_keywords" content="${escapeHtml(keywords)}" />
    ${renderFaviconLinks()}
    ${topicThemes.renderTopicThemeStyleBlock()}
    <link rel="stylesheet" href="/styles.css" />
    <script type="application/ld+json">${escapeJson(newsArticleJsonLd)}</script>
    <script type="application/ld+json">${escapeJson(breadcrumbJsonLd)}</script>
  </head>
  <body${topicThemes.topicBodyClass(topicSlug)}>
    <header class="site-header site-header--topic">
      <div>
        <p class="eyebrow"><a class="subtle-link" href="/">${escapeHtml(SITE_NAME)}</a> / <a class="subtle-link" href="/${escapeHtml(topicSlug)}">${escapeHtml(label)}</a> / recap</p>
        <h1>${escapeHtml(post.title)}</h1>
      </div>
      ${renderSiteHeaderNav({ statusHtml: `<span id="status">${visible.length} article${visible.length > 1 ? "s" : ""}</span>` })}
    </header>

    <main class="posts">
      <label class="search-box">
        <span>Rechercher dans ce recap</span>
        <input id="search" type="search" placeholder="Source, titre, mot-clé…" autocomplete="off" />
      </label>
      <section id="detail">
        <article class="post">
          <div class="post-meta">${escapeHtml(label)} - ${escapeHtml(
            new Intl.DateTimeFormat("fr-FR", { dateStyle: "full", timeStyle: "short" }).format(createdAt),
          )}</div>
          <h2 class="visually-hidden">${escapeHtml(post.title)}</h2>
          <p class="summary">${escapeHtml(post.summary || "")}</p>
          ${renderArticleSections(post, { topicSlug })}
        </article>
      </section>
    </main>

    ${renderSiteFooter()}
    ${renderBodyScripts(['<script src="/detail.js" defer></script>'])}
  </body>
</html>
`;
}

function renderArticleLandingPage({ article, post, topicSlug, topicLabelText }) {
  const label = topicLabelText || topicLabel(topicSlug);
  const publishedAt = article.publishedAt ? new Date(article.publishedAt) : new Date(post.createdAt || Date.now());
  const recapCreatedAt = new Date(post.createdAt || Date.now());
  const canonicalUrl = `${SITE_URL}${article.landingPath || seoUrls.articlePublicPath(topicSlug, article)}`;
  const description = truncate(article.snippet || `${article.title} — ${label} sur ${SITE_NAME}`);
  const pageTitle = `${article.title} | ${SITE_NAME}`;
  const recapUrl = `/${encodeURIComponent(topicSlug)}/recap/${encodeURIComponent(post.id)}`;

  const newsArticleJsonLd = {
    "@context": "https://schema.org",
    "@type": "NewsArticle",
    headline: article.title,
    description,
    datePublished: publishedAt.toISOString(),
    dateModified: recapCreatedAt.toISOString(),
    mainEntityOfPage: { "@type": "WebPage", "@id": canonicalUrl },
    url: canonicalUrl,
    inLanguage: "fr-FR",
    articleSection: label,
    author: article.source
      ? { "@type": "Organization", name: article.source }
      : { "@type": "Organization", name: SITE_NAME, url: SITE_URL },
    publisher: {
      "@type": "Organization",
      name: SITE_NAME,
      url: SITE_URL,
      logo: { "@type": "ImageObject", url: SITE_OG_IMAGE },
    },
    isBasedOn: {
      "@type": "WebPage",
      url: article.url,
      name: article.title,
    },
    isPartOf: {
      "@type": "NewsArticle",
      headline: post.title,
      url: `${SITE_URL}${recapUrl}`,
    },
  };

  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Accueil", item: SITE_URL },
      { "@type": "ListItem", position: 2, name: label, item: `${SITE_URL}/${topicSlug}` },
      { "@type": "ListItem", position: 3, name: post.title, item: `${SITE_URL}${recapUrl}` },
      { "@type": "ListItem", position: 4, name: article.title, item: canonicalUrl },
    ],
  };

  const publishedLabel = Number.isNaN(publishedAt.getTime())
    ? ""
    : new Intl.DateTimeFormat("fr-FR", { dateStyle: "full", timeStyle: "short" }).format(publishedAt);

  return `<!doctype html>
<html lang="fr">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(pageTitle)}</title>
    ${metaTags({
      title: pageTitle,
      description,
      canonical: canonicalUrl,
      ogType: "article",
      publishedTime: publishedAt.toISOString(),
      modifiedTime: recapCreatedAt.toISOString(),
    })}
    ${renderFaviconLinks()}
    ${topicThemes.renderTopicThemeStyleBlock()}
    <link rel="stylesheet" href="/styles.css" />
    <script type="application/ld+json">${escapeJson(newsArticleJsonLd)}</script>
    <script type="application/ld+json">${escapeJson(breadcrumbJsonLd)}</script>
  </head>
  <body>
    <header class="site-header">
      <div>
        <p class="eyebrow"><a class="subtle-link" href="/">${escapeHtml(SITE_NAME)}</a> / <a class="subtle-link" href="/${escapeHtml(topicSlug)}">${escapeHtml(label)}</a> / actu</p>
        <h1>${escapeHtml(article.title)}</h1>
      </div>
      ${renderSiteHeaderNav()}
    </header>

    <main class="posts article-landing">
      <article class="post article-page">
        <p class="article-meta">${escapeHtml(articleLabel(article))}${publishedLabel ? ` — ${escapeHtml(publishedLabel)}` : ""}</p>
        ${article.snippet ? `<p class="summary">${escapeHtml(article.snippet)}</p>` : ""}
        <p class="article-context">Cette actu est référencée dans le recap «&nbsp;${escapeHtml(post.title)}&nbsp;» publié le ${escapeHtml(
          new Intl.DateTimeFormat("fr-FR", { dateStyle: "long" }).format(recapCreatedAt),
        )}.</p>
        <div class="article-actions">
          <a class="read-more" href="${escapeHtml(recapUrl)}">Voir le recap complet</a>
          ${
            article.url
              ? `<a class="article-source-link article-source-link--primary" href="${escapeHtml(article.url)}" target="_blank" rel="noopener noreferrer">Lire sur ${escapeHtml(article.source || "la source")} ↗</a>`
              : ""
          }
        </div>
      </article>
    </main>

    ${renderSiteFooter()}
    ${renderBodyScripts()}
  </body>
</html>
`;
}

function renderPublicSuggestionRow(suggestion) {
  const createdAt = new Date(suggestion.createdAt || Date.now());
  const likedByMe = Boolean(suggestion.likedByMe);
  const action = likedByMe ? "Retirer votre j'aime" : "J'aime cette proposition";
  return `<article class="suggest-item" data-suggestion-id="${escapeHtml(suggestion.id)}">
    <div class="suggest-item-body">
      <p class="suggest-item-text">${escapeHtml(suggestion.text)}</p>
      <p class="suggest-item-meta">${escapeHtml(
        new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium" }).format(createdAt),
      )}</p>
    </div>
    <button type="button" class="suggest-like" data-suggestion-id="${escapeHtml(suggestion.id)}" aria-pressed="${likedByMe ? "true" : "false"}" aria-label="${action}" title="${action}">
      <span class="suggest-like-icon" aria-hidden="true">♥</span>
      <span class="suggest-like-count">${Number(suggestion.likeCount) || 0}</span>
    </button>
  </article>`;
}

async function renderSuggestPage(ipHash) {
  const page = await db.listPublicSuggestions({ ipHash, limit: 100 });
  const listHtml = page.suggestions.length
    ? page.suggestions.map(renderPublicSuggestionRow).join("\n")
    : '<p class="empty">Aucune proposition pour le moment. Soyez le premier à en envoyer une&nbsp;!</p>';

  return `<!doctype html>
<html lang="fr">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Suggérer un sujet - ${escapeHtml(SITE_NAME)}</title>
    <meta name="description" content="Proposez un sujet à suivre sur ${escapeHtml(SITE_NAME)} et soutenez les idées des autres visiteurs." />
    ${renderFaviconLinks()}
    ${topicThemes.renderTopicThemeStyleBlock()}
    <link rel="stylesheet" href="/styles.css" />
  </head>
  <body>
    <header class="site-header">
      <div>
        <p class="eyebrow"><a class="subtle-link" href="/">${escapeHtml(SITE_NAME)}</a></p>
        <h1>Suggérer un sujet</h1>
      </div>
      ${renderSiteHeaderNav()}
    </header>
    <main class="legal-page suggest-page">
      <p class="suggest-intro">Proposez un sujet à suivre. Les visiteurs peuvent voter pour les idées qui leur plaisent.</p>

      <form class="suggest-form" id="suggest-form" novalidate>
        <label class="suggest-field">
          <span>Suggestion</span>
          <textarea id="suggest-text" name="text" rows="2" required maxlength="2000" placeholder="Ex. Formule E…"></textarea>
        </label>

        <div class="visually-hidden" aria-hidden="true">
          <label for="suggest-hp">Laissez ce champ vide</label>
          <input id="suggest-hp" name="hp" type="text" tabindex="-1" autocomplete="off" />
        </div>

        <button type="submit" class="read-more suggest-submit">Envoyer</button>

        <p class="suggest-status" id="suggest-status" role="status" aria-live="polite"></p>
      </form>

      <section class="suggest-board" aria-labelledby="suggest-board-title">
        <h2 id="suggest-board-title">Propositions des visiteurs</h2>
        <p class="suggest-board-hint">Cliquez sur ♥ si une idée vous plaît — les plus soutenues remontent en haut.</p>
        <div class="suggest-list" id="suggest-list">${listHtml}</div>
      </section>
    </main>

    ${renderSiteFooter()}
    ${renderBodyScripts(['<script src="/suggerer.js"></script>'])}
  </body>
</html>`;
}

async function renderFeed(topicSlug) {
  const posts = await db.getRecentPostsForTopic(topicSlug, 30);
  const topic = await db.getTopic(topicSlug);
  const label = topic?.label || topicLabel(topicSlug);
  const recapItems = posts
    .map(
      (post) => `    <item>
      <title>${escapeXml(post.title)}</title>
      <link>${escapeXml(`${SITE_URL}/${topicSlug}/recap/${encodeURIComponent(post.id)}`)}</link>
      <guid isPermaLink="true">${escapeXml(`${SITE_URL}/${topicSlug}/recap/${encodeURIComponent(post.id)}`)}</guid>
      <pubDate>${new Date(post.createdAt || Date.now()).toUTCString()}</pubDate>
      <description>${escapeXml(post.summary || "")}</description>
    </item>`,
    )
    .join("\n");

  const articleItems = posts
    .flatMap((post) => (post.articles || []).filter(isDisplayableArticle).slice(0, 12))
    .map(
      (article) => `    <item>
      <title>${escapeXml(article.title)}</title>
      <link>${escapeXml(`${SITE_URL}${article.landingPath || seoUrls.articlePublicPath(topicSlug, article)}`)}</link>
      <guid isPermaLink="true">${escapeXml(`${SITE_URL}${article.landingPath || seoUrls.articlePublicPath(topicSlug, article)}`)}</guid>
      <pubDate>${new Date(article.publishedAt || Date.now()).toUTCString()}</pubDate>
      <description>${escapeXml(article.snippet || "")}</description>
    </item>`,
    )
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${escapeXml(SITE_NAME)} / ${escapeXml(label)}</title>
    <link>${escapeXml(`${SITE_URL}/${topicSlug}`)}</link>
    <atom:link href="${escapeXml(`${SITE_URL}/${topicSlug}/feed.xml`)}" rel="self" type="application/rss+xml" />
    <description>Recaps courts et sources pour ${escapeXml(label)}.</description>
    <language>fr-FR</language>
${articleItems}
${recapItems}
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
    { loc: `${SITE_URL}/suggerer`, changefreq: "daily", priority: "0.5" },
    { loc: `${SITE_URL}/mentions-legales`, changefreq: "yearly", priority: "0.2" },
    { loc: `${SITE_URL}/confidentialite`, changefreq: "yearly", priority: "0.2" },
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
  const [posts, articles] = await Promise.all([
    db.getRecentPostsForTopic(topicSlug, 5000),
    db.listArticlesForTopicSitemap(topicSlug),
  ]);
  const urls = [
    { loc: `${SITE_URL}/${topicSlug}`, changefreq: "hourly", priority: "0.9" },
    ...articles.map((article) => ({
      loc: `${SITE_URL}${article.landingPath}`,
      lastmod: article.lastmod,
      changefreq: "daily",
      priority: "0.85",
    })),
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
    const ipHash = resolvePinIdentity(req);
    send(res, 200, await renderHubPage({ ipHash }), contentTypes[".html"], {
      "cache-control": "private, max-age=60",
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

  if (req.method === "GET" && url.pathname === "/api/topics/pinned") {
    const ipHash = resolvePinIdentity(req);
    const slugs = await db.getVisitorPinnedTopicSlugs(ipHash);
    send(res, 200, JSON.stringify({ slugs }));
    return;
  }

  const topicPinMatch = url.pathname.match(/^\/api\/topics\/([a-z0-9-]+)\/pin$/);
  if (req.method === "POST" && topicPinMatch) {
    const topicSlug = decodeURIComponent(topicPinMatch[1]);
    const ipHash = resolvePinIdentity(req);
    const result = await db.pinTopic(topicSlug, ipHash);
    if (!result) {
      send(res, 404, JSON.stringify({ error: "Topic not found" }));
      return;
    }
    send(res, 200, JSON.stringify(result));
    return;
  }

  if (req.method === "GET" && url.pathname === "/suggerer") {
    const ipHash = pins.hashIp(IP_HASH_SECRET, getClientIp(req));
    send(res, 200, await renderSuggestPage(ipHash), contentTypes[".html"], {
      "cache-control": "private, max-age=60",
    });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/suggestions") {
    const body = await readJsonBody(req);
    const ipHash = pins.hashIp(IP_HASH_SECRET, getClientIp(req));
    const result = await db.createSuggestion({
      text: body.text,
      email: body.email,
      honeypot: body.hp,
      ipHash,
    });

    if (result.outcome === "honeypot") {
      // Fake-success shape: never reveal to a bot that it tripped the trap.
      send(res, 200, JSON.stringify({ ok: true }));
      return;
    }
    if (result.outcome === "invalid") {
      send(res, 400, JSON.stringify({ error: result.reason }));
      return;
    }
    if (result.outcome === "rate-limited") {
      send(res, 429, JSON.stringify({ error: "Trop de suggestions envoyées récemment. Réessayez plus tard." }));
      return;
    }
    send(res, 201, JSON.stringify({ ok: true, suggestion: result.suggestion }));
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/suggestions") {
    const ipHash = pins.hashIp(IP_HASH_SECRET, getClientIp(req));
    const result = await db.listPublicSuggestions({
      ipHash,
      offset: url.searchParams.get("offset"),
      limit: url.searchParams.get("limit"),
    });
    send(res, 200, JSON.stringify(result));
    return;
  }

  const suggestionLikeMatch = url.pathname.match(/^\/api\/suggestions\/(\d+)\/like$/);
  if (req.method === "POST" && suggestionLikeMatch) {
    const ipHash = pins.hashIp(IP_HASH_SECRET, getClientIp(req));
    try {
      const result = await db.likeSuggestion(suggestionLikeMatch[1], ipHash);
      if (!result) {
        send(res, 404, JSON.stringify({ error: "Suggestion introuvable." }));
        return;
      }
      send(res, 200, JSON.stringify(result));
    } catch {
      send(res, 400, JSON.stringify({ error: "Identifiant de suggestion invalide." }));
    }
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

  const staticPages = {
    "/mentions-legales": "mentions-legales.html",
    "/confidentialite": "confidentialite.html",
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

  const actuMatch = url.pathname.match(/^\/([a-z0-9-]+)\/actu\/([^/]+)\/?$/);
  if (req.method === "GET" && actuMatch) {
    const topicSlug = actuMatch[1];
    const articleId = seoUrls.parseArticlePublicSlug(actuMatch[2]);
    if (!articleId) {
      send(res, 404, "Article introuvable.", contentTypes[".txt"]);
      return;
    }
    const landing = await db.getArticleForLanding(topicSlug, articleId);
    if (!landing) {
      send(res, 404, "Article introuvable.", contentTypes[".txt"]);
      return;
    }
    const canonicalSlug = seoUrls.articlePublicSlug({
      id: landing.article.id,
      title: landing.article.title,
    });
    const requestSlug = decodeURIComponent(actuMatch[2]);
    if (requestSlug !== canonicalSlug) {
      sendRedirect(res, `${SITE_URL}/${topicSlug}/actu/${encodeURIComponent(canonicalSlug)}`);
      return;
    }
    send(res, 200, renderArticleLandingPage({ ...landing, topicSlug, topicLabelText: landing.topic.label }), contentTypes[".html"], {
      "cache-control": "public, max-age=3600, s-maxage=7200",
    });
    return;
  }

  if (req.method === "GET" && /^\/recap\/[^/]+\/?$/.test(url.pathname)) {
    const id = decodeURIComponent(url.pathname.replace(/^\/recap\/|\/$/g, ""));
    const post = await db.getPostById(id);
    if (!post) {
      send(res, 404, "Recap introuvable.", contentTypes[".txt"]);
      return;
    }
    const topicSlug = post.topic || "esport";
    sendRedirect(res, `${SITE_URL}/${topicSlug}/recap/${encodeURIComponent(id)}`);
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
    const topic = await db.getTopic(topicSlug);
    send(res, 200, renderRecapPage(post, topicSlug, topic?.label), contentTypes[".html"], {
      "cache-control": "public, max-age=300, s-maxage=600",
    });
    return;
  }

  if (req.method === "GET" && isPublicTopicPath(url.pathname)) {
    const topicSlug = url.pathname.replace(/^\/|\/$/g, "");
    send(res, 200, await renderTopicPage(topicSlug), contentTypes[".html"], {
      "cache-control": "public, max-age=60, s-maxage=120",
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

let schedulerTasks = [];

async function start() {
  await db.ensureSchema();

  // Les sujets (label, description, mode) sont upsertés par le scheduler lui
  // même, depuis blog/automation/topics/configs/*.js, avant d'enregistrer
  // leurs jobs cron - pas de seed statique ici.
  schedulerTasks = await automation.startScheduler();

  server.listen(PORT, () => {
    console.log(`[blog] listening on http://0.0.0.0:${PORT}`);
  });
}

function shutdown(signal) {
  console.log(`[blog] received ${signal}, shutting down`);
  automation.stopScheduler(schedulerTasks);
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
