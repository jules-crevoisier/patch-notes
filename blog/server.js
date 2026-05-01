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

const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".xml": "application/xml; charset=utf-8",
};

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

function escapeHtml(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
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

function isPublicTopicPath(pathname) {
  return /^\/[a-z0-9-]+\/?$/.test(pathname) && !pathname.startsWith("/api");
}

async function renderSitemap() {
  const posts = await readPosts();
  const topics = [...new Set(["esport", ...posts.map((post) => post.topic || "esport")])];
  const urls = [
    { loc: `${SITE_URL}/`, changefreq: "daily", priority: "1.0" },
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

async function serveStatic(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const requestedPath = url.pathname === "/" ? "/hub.html" : url.pathname;
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

    const legalPages = {
      "/mentions-legales": "mentions-legales.html",
      "/confidentialite": "confidentialite.html",
      "/conditions": "conditions.html",
    };

    if (req.method === "GET" && legalPages[url.pathname]) {
      const body = await fs.readFile(path.join(PUBLIC_DIR, legalPages[url.pathname]));
      send(res, 200, body, contentTypes[".html"]);
      return;
    }

    const feedMatch = url.pathname.match(/^\/([a-z0-9-]+)\/feed\.xml$/);
    if (req.method === "GET" && feedMatch) {
      send(res, 200, await renderFeed(feedMatch[1]), contentTypes[".xml"]);
      return;
    }

    if (req.method === "GET" && isPublicTopicPath(url.pathname)) {
      const body = await fs.readFile(path.join(PUBLIC_DIR, "esport.html"));
      send(res, 200, body, contentTypes[".html"]);
      return;
    }

    if (req.method === "GET" && (url.pathname.startsWith("/recap/") || /^\/[a-z0-9-]+\/recap\//.test(url.pathname))) {
      const body = await fs.readFile(path.join(PUBLIC_DIR, "detail.html"));
      send(res, 200, body, contentTypes[".html"]);
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
