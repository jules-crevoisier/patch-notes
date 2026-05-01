const postsEl = document.querySelector("#posts");
const statusEl = document.querySelector("#status");
const searchEl = document.querySelector("#search");
const template = document.querySelector("#post-template");
let allPosts = [];
const currentTopic = location.pathname.split("/").filter(Boolean)[0] || "esport";

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

function isDisplayableEsportArticle(article) {
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

function searchableText(post) {
  return normalize([
    post.title,
    post.summary,
    post.topic,
    post.id,
    post.createdAt,
    formatter.format(new Date(post.createdAt || Date.now())),
    ...(post.articles || []).flatMap((article) => [
      article.title,
      article.source,
      article.region,
      article.url,
      article.snippet,
      article.publishedAt,
      articleTime(article),
    ]),
  ]
    .join(" "));
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

function matchesTokens(text, tokens) {
  return tokens.every((token) => text.includes(token));
}

function appendArticle(target, article) {
  const item = document.createElement("li");
  const meta = document.createElement("span");
  const link = document.createElement("a");

  meta.className = "article-meta";
  meta.textContent = articleLabel(article);

  link.href = article.url;
  link.target = "_blank";
  link.rel = "noreferrer";
  link.textContent = article.title;

  item.append(meta, link);
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

function renderPosts() {
  const tokens = queryTokens(searchEl.value);
  const posts = tokens.length ? allPosts.filter((post) => matchesTokens(searchableText(post), tokens)) : allPosts;
  postsEl.textContent = "";

  if (!posts.length) {
    const empty = document.createElement("p");
    empty.className = "empty";
    empty.textContent = tokens.length ? "Aucun recap ne correspond a cette recherche." : "Aucun recap pour le moment. Lance le workflow n8n pour publier le premier.";
    postsEl.append(empty);
    statusEl.textContent = "0 recap";
    return;
  }

  let currentDay = "";
  for (const post of posts) {
    const key = dayKey(post);
    if (key !== currentDay) {
      currentDay = key;
      const sectionTitle = document.createElement("h2");
      sectionTitle.className = "day-heading";
      sectionTitle.textContent = dayLabel(post);
      postsEl.append(sectionTitle);
    }

    const node = template.content.cloneNode(true);
    const createdAt = post.createdAt ? new Date(post.createdAt) : new Date();
    const visibleArticles = (post.articles || []).filter(isDisplayableEsportArticle);
    const matchingArticles = tokens.length
      ? visibleArticles.filter((article) => matchesTokens(articleSearchText(article), tokens))
      : visibleArticles;
    const articlesToShow = tokens.length && !matchingArticles.length ? visibleArticles : matchingArticles;
    const frArticles = articlesToShow.filter((article) => article.region === "fr");
    const intlArticles = articlesToShow.filter((article) => article.region !== "fr");

    node.querySelector(".post-meta").textContent = `${postSlot(post)} - ${formatter.format(createdAt)} - ${frArticles.length} FR / ${intlArticles.length} INT`;
    node.querySelector("h2").textContent = post.title;
    node.querySelector(".summary").textContent = post.summary;
    node.querySelector(".read-more").href = `/esport/recap/${encodeURIComponent(post.id)}`;

    appendLimited(node.querySelector(".fr-articles"), frArticles);
    appendLimited(node.querySelector(".intl-articles"), intlArticles);
    postsEl.append(node);
  }

  if (tokens.length) {
    const visibleMatches = posts.reduce((count, post) => {
      const visibleArticles = (post.articles || []).filter(isDisplayableEsportArticle);
      return count + visibleArticles.filter((article) => matchesTokens(articleSearchText(article), tokens)).length;
    }, 0);
    statusEl.textContent = `${visibleMatches} article${visibleMatches > 1 ? "s" : ""}`;
  } else {
    statusEl.textContent = `${posts.length} recap${posts.length > 1 ? "s" : ""}`;
  }
}

fetch("/posts.json", { cache: "no-store" })
  .then((response) => response.json())
  .then((posts) => {
    allPosts = posts.filter((post) => (post.topic || "esport") === currentTopic && (post.articles || []).length > 0);
    document.title = `patch-notes.fr/${currentTopic}`;
    const title = document.querySelector("h1");
    const eyebrow = document.querySelector(".eyebrow");
    if (title) title.textContent = currentTopic;
    if (eyebrow) eyebrow.innerHTML = `<a class="subtle-link" href="/">patch-notes.fr</a> / ${currentTopic}`;
    renderPosts();
  })
  .catch(() => {
    statusEl.textContent = "erreur";
    postsEl.innerHTML = '<p class="empty">Impossible de charger les recaps.</p>';
  });

searchEl.addEventListener("input", renderPosts);
