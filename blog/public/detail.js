const detailEl = document.querySelector("#detail");
const statusEl = document.querySelector("#status");
const searchEl = document.querySelector("#search");
let currentPost = null;
const pathParts = location.pathname.split("/").filter(Boolean);
const currentTopic = pathParts[0] === "recap" ? "esport" : pathParts[0];

const formatter = new Intl.DateTimeFormat("fr-FR", {
  dateStyle: "full",
  timeStyle: "short",
});

function decodeHtml(value = "") {
  const textarea = document.createElement("textarea");
  textarea.innerHTML = String(value);
  return textarea.value;
}

function normalize(value = "") {
  return decodeHtml(value)
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

function queryTokens(query) {
  return normalize(query).split(" ").filter(Boolean);
}

function articleTime(article) {
  const date = new Date(article.publishedAt);
  if (Number.isNaN(date.getTime())) return "";
  return formatter.format(date);
}

function matches(article, query) {
  const tokens = queryTokens(query);
  const haystack = normalize([
    article.title,
    article.source,
    article.region,
    article.url,
    article.snippet,
    article.publishedAt,
    articleTime(article),
  ].join(" "));
  return tokens.every((token) => haystack.includes(token));
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

function renderPost() {
  if (!currentPost) return;
  const query = searchEl.value.trim();
  const articles = (currentPost.articles || [])
    .filter(isDisplayableArticle)
    .filter((article) => !query || matches(article, query));
  const frArticles = articles.filter((article) => article.region === "fr");
  const intlArticles = articles.filter((article) => article.region !== "fr");
  const sectionHtml = frArticles.length && intlArticles.length
    ? `
      <h3>France</h3>
      <ol class="articles fr-articles"></ol>
      <h3>International</h3>
      <ol class="articles intl-articles"></ol>
    `
    : `
      <h3>Articles</h3>
      <ol class="articles all-articles"></ol>
    `;

  detailEl.textContent = "";
  const article = document.createElement("article");
  article.className = "post";
  article.innerHTML = `
    <div class="post-meta">${currentPost.topic || "esport"} - ${formatter.format(new Date(currentPost.createdAt))}</div>
    <h2>${currentPost.title}</h2>
    <p class="summary">${currentPost.summary}</p>
    ${sectionHtml}
  `;

  if (frArticles.length && intlArticles.length) {
    appendArticles(article.querySelector(".fr-articles"), frArticles);
    appendArticles(article.querySelector(".intl-articles"), intlArticles);
  } else {
    appendArticles(article.querySelector(".all-articles"), frArticles.length ? frArticles : intlArticles);
  }
  detailEl.append(article);
  statusEl.textContent = `${articles.length} article${articles.length > 1 ? "s" : ""}`;
}

function appendArticles(target, articles) {
  if (!articles.length) {
    target.innerHTML = '<li class="muted-row">Aucun article.</li>';
    return;
  }

  for (const article of articles) {
    const item = document.createElement("li");
    const meta = document.createElement("span");
    const link = document.createElement("a");
    const snippet = document.createElement("p");
    const sourceLink = document.createElement("a");
    meta.className = "article-meta";
    meta.textContent = [article.source, article.region === "fr" ? "FR" : "INT", articleTime(article)].filter(Boolean).join(" - ");
    link.href = article.landingPath || article.url;
    if (!article.landingPath) {
      link.target = "_blank";
      link.rel = "noreferrer";
    }
    link.textContent = article.title;
    snippet.className = "article-snippet";
    snippet.textContent = article.snippet || "";
    item.append(meta, link);
    if (snippet.textContent) item.append(snippet);
    if (article.url) {
      sourceLink.className = "article-source-link";
      sourceLink.href = article.url;
      sourceLink.target = "_blank";
      sourceLink.rel = "noopener noreferrer";
      sourceLink.textContent = `Lire sur ${article.source || "la source"} ↗`;
      item.append(sourceLink);
    }
    target.append(item);
  }
}

const id = decodeURIComponent(location.pathname.replace(/^\/(?:[a-z0-9-]+\/)?recap\//, ""));
fetch(`/api/posts/${encodeURIComponent(id)}`, { cache: "no-store" })
  .then((response) => {
    if (!response.ok) throw new Error("not found");
    return response.json();
  })
  .then((post) => {
    currentPost = post;
    renderPost();
  })
  .catch(() => {
    statusEl.textContent = "erreur";
    detailEl.innerHTML = '<p class="empty">Recap introuvable.</p>';
  });

searchEl.addEventListener("input", renderPost);
