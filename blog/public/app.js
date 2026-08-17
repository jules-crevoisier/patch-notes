const postsEl = document.querySelector("#posts");
const statusEl = document.querySelector("#status");
const searchEl = document.querySelector("#search");
const template = document.querySelector("#post-template");
const sentinelEl = document.querySelector("#load-more-sentinel");
const currentTopic = location.pathname.split("/").filter(Boolean)[0] || "esport";
const pageSize = 8;

let allPosts = [];
let offset = 0;
let total = 0;
let hasMore = true;
let isLoading = false;
let currentQuery = "";
let renderDay = "";

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

function articleLabel(article) {
  return [article.source, article.region === "fr" ? "FR" : "INT", articleTime(article)].filter(Boolean).join(" - ");
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

function articleSearchText(article) {
  return normalize([
    article.title,
    article.source,
    article.region,
    article.url,
    article.snippet,
    article.publishedAt,
    articleTime(article),
  ].join(" "));
}

function appendArticle(target, article) {
  const item = document.createElement("li");
  const meta = document.createElement("span");
  const link = document.createElement("a");
  const sourceLink = document.createElement("a");

  meta.className = "article-meta";
  meta.textContent = articleLabel(article);

  link.href = article.landingPath || article.url;
  if (!article.landingPath) {
    link.target = "_blank";
    link.rel = "noreferrer";
  }
  link.textContent = article.title;

  item.append(meta, link);
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

function appendLimited(target, articles) {
  if (!articles.length) {
    target.innerHTML = '<li class="muted-row">Aucun article.</li>';
    return;
  }

  for (const article of articles.slice(0, 8)) {
    appendArticle(target, article);
  }

  if (articles.length > 8) {
    const item = document.createElement("li");
    item.className = "muted-row";
    item.textContent = `+ ${articles.length - 8} autres liens dans la page detail.`;
    target.append(item);
  }
}

function articleCountLabel(frArticles, intlArticles) {
  if (frArticles.length && intlArticles.length) return `${frArticles.length} FR / ${intlArticles.length} INT`;
  const total = frArticles.length + intlArticles.length;
  return `${total} article${total > 1 ? "s" : ""}`;
}

function fillArticleSections(node, frArticles, intlArticles) {
  const split = node.querySelector(".split");

  if (frArticles.length && intlArticles.length) {
    appendLimited(node.querySelector(".fr-articles"), frArticles);
    appendLimited(node.querySelector(".intl-articles"), intlArticles);
    return;
  }

  const articles = frArticles.length ? frArticles : intlArticles;
  split.innerHTML = `
    <section>
      <h3>Articles</h3>
      <ol class="articles all-articles"></ol>
    </section>
  `;
  appendLimited(split.querySelector(".all-articles"), articles);
}

function appendPost(post) {
  const key = dayKey(post);
  if (key !== renderDay) {
    renderDay = key;
    const sectionTitle = document.createElement("h2");
    sectionTitle.className = "day-heading";
    sectionTitle.textContent = dayLabel(post);
    postsEl.append(sectionTitle);
  }

  const node = template.content.cloneNode(true);
  const createdAt = post.createdAt ? new Date(post.createdAt) : new Date();
  const visibleArticles = (post.articles || []).filter(isDisplayableArticle);
  const queryTokens = normalize(currentQuery).split(" ").filter(Boolean);
  const matchingArticles = queryTokens.length
    ? visibleArticles.filter((article) => queryTokens.every((token) => articleSearchText(article).includes(token)))
    : visibleArticles;
  const articlesToShow = queryTokens.length && !matchingArticles.length ? visibleArticles : matchingArticles;
  const frArticles = articlesToShow.filter((article) => article.region === "fr");
  const intlArticles = articlesToShow.filter((article) => article.region !== "fr");

  node.querySelector(".post-meta-text").textContent = `${postSlot(post)} - ${formatter.format(createdAt)} - ${articleCountLabel(frArticles, intlArticles)}`;
  node.querySelector("h2").textContent = post.title;
  node.querySelector(".summary").textContent = post.summary;
  node.querySelector(".read-more").href = `/${currentTopic}/recap/${encodeURIComponent(post.id)}`;

  fillArticleSections(node, frArticles, intlArticles);
  postsEl.append(node);
}

function updateStatus() {
  if (isLoading) {
    statusEl.textContent = "chargement";
    if (sentinelEl) sentinelEl.textContent = "Chargement...";
    return;
  }

  statusEl.textContent = `${total} recap${total > 1 ? "s" : ""}`;
  if (sentinelEl) {
    sentinelEl.textContent = hasMore ? "Chargement..." : "";
    sentinelEl.dataset.hasMore = hasMore ? "true" : "false";
  }
}

function resetList() {
  allPosts = [];
  offset = 0;
  total = 0;
  hasMore = true;
  renderDay = "";
  postsEl.textContent = "";
}

function renderEmptyIfNeeded() {
  if (allPosts.length || isLoading) return;
  const empty = document.createElement("p");
  empty.className = "empty";
  empty.textContent = currentQuery ? "Aucun recap ne correspond a cette recherche." : "Aucun recap pour le moment. Le prochain passage automatique est a 6h, 11h, 18h ou 23h.";
  postsEl.append(empty);
}

async function loadMore({ reset = false } = {}) {
  if (isLoading || (!hasMore && !reset)) return;
  if (reset) resetList();

  isLoading = true;
  updateStatus();

  try {
    const params = new URLSearchParams({
      offset: String(offset),
      limit: String(pageSize),
    });
    if (currentQuery) params.set("q", currentQuery);

    const response = await fetch(`/api/topics/${currentTopic}/posts?${params}`, { cache: "no-store" });
    if (!response.ok) throw new Error("load failed");

    const page = await response.json();
    total = page.total || 0;
    hasMore = Boolean(page.hasMore);
    offset = page.nextOffset || offset + pageSize;
    allPosts.push(...page.posts);

    for (const post of page.posts) appendPost(post);
    renderEmptyIfNeeded();
  } catch {
    if (!allPosts.length) {
      postsEl.innerHTML = '<p class="empty">Impossible de charger les recaps.</p>';
    }
    hasMore = false;
  } finally {
    isLoading = false;
    updateStatus();
  }
}

function debounce(fn, delay = 250) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

const onSearch = debounce(() => {
  currentQuery = searchEl.value.trim();
  loadMore({ reset: true });
});

searchEl.addEventListener("input", onSearch);

if ("IntersectionObserver" in window && sentinelEl) {
  const observer = new IntersectionObserver((entries) => {
    if (entries.some((entry) => entry.isIntersecting)) loadMore();
  }, { rootMargin: "500px 0px" });
  observer.observe(sentinelEl);
} else {
  window.addEventListener("scroll", () => {
    const nearBottom = window.innerHeight + window.scrollY >= document.body.offsetHeight - 600;
    if (nearBottom) loadMore();
  }, { passive: true });
}

loadMore({ reset: true });
