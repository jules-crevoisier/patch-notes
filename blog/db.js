/**
 * Couche d'accès données pour le blog patch-notes.fr.
 *
 * Construite sur Prisma Client. Les migrations vivent dans prisma/migrations/
 * et sont appliquées par `prisma migrate deploy` au démarrage du conteneur.
 *
 * L'API exportée garde la même signature que la version pg brute, pour ne pas
 * impacter blog/server.js et les workflows n8n consommateurs.
 */

const { PrismaClient, Prisma } = require("@prisma/client");

const VALID_MODES = new Set(["fr", "intl", "fr-intl"]);
const TOPIC_PAGE_LIMIT_MAX = 30;

const prisma = new PrismaClient({
  log: ["warn", "error"],
});

function normalizeUrlKey(value) {
  try {
    const url = new URL(value);
    url.hash = "";
    url.search = "";
    return url.toString().replace(/\/$/, "").toLowerCase();
  } catch {
    return "";
  }
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

function buildPostSearchText(post) {
  const articles = Array.isArray(post.articles) ? post.articles : [];
  const articleTokens = articles.flatMap((article) => [
    article.title,
    article.source,
    article.region,
    article.url,
    article.snippet,
    article.publishedAt,
  ]);
  return normalizeSearch(
    [post.title, post.summary, post.topic, post.id, post.createdAt, ...articleTokens]
      .filter(Boolean)
      .join(" "),
  );
}

function topicRowToObject(row) {
  return {
    slug: row.slug,
    label: row.label,
    description: row.description,
    mode: row.mode,
    is_listed: row.isListed ?? row.is_listed,
    created_at: row.createdAt ?? row.created_at,
    updated_at: row.updatedAt ?? row.updated_at,
  };
}

function postModelToApi(post) {
  return {
    id: post.id,
    topic: post.topicSlug,
    title: post.title,
    summary: post.summary,
    slot: post.slot,
    mode: post.mode,
    sourceGroups: post.sourceGroups || {},
    errors: post.errors || [],
    debug: post.debug || {},
    articles: (post.articles || []).map((article) => ({
      title: article.title,
      url: article.url,
      source: article.source,
      region: article.region,
      method: article.method,
      snippet: article.snippet,
      publishedAt:
        article.publishedAt instanceof Date
          ? article.publishedAt.toISOString()
          : article.publishedAt,
    })),
    createdAt:
      post.createdAt instanceof Date ? post.createdAt.toISOString() : post.createdAt,
  };
}

async function ensureSchema() {
  // Le schéma est appliqué par `prisma migrate deploy` (cf. Dockerfile).
  // Ici on ne fait qu'un ping pour fail fast si la connexion est cassée.
  await prisma.$queryRawUnsafe("SELECT 1;");
}

async function upsertTopic({ slug, label, description = null, mode = "fr-intl", isListed = true }) {
  if (!slug) throw new Error("topic slug required");
  const safeMode = VALID_MODES.has(mode) ? mode : "fr-intl";
  const topic = await prisma.topic.upsert({
    where: { slug },
    create: {
      slug,
      label: label || slug,
      description,
      mode: safeMode,
      isListed: Boolean(isListed),
    },
    update: {
      label: label || slug,
      description: description ?? undefined,
      mode: safeMode,
      isListed: Boolean(isListed),
    },
  });
  return topicRowToObject(topic);
}

async function getTopic(slug) {
  const topic = await prisma.topic.findUnique({ where: { slug } });
  return topic ? topicRowToObject(topic) : null;
}

async function listTopics() {
  // On a besoin de COUNT(posts) et MAX(posts.created_at) - simpler en raw SQL.
  const rows = await prisma.$queryRaw`
    SELECT t.slug, t.label, t.description, t.mode, t.is_listed,
           COALESCE(COUNT(p.id), 0)::int AS post_count,
           MAX(p.created_at) AS last_post_at
    FROM topics t
    LEFT JOIN posts p ON p.topic_slug = t.slug
    GROUP BY t.slug
    ORDER BY t.is_listed DESC, last_post_at DESC NULLS LAST, t.slug ASC;
  `;
  return rows.map((row) => ({
    slug: row.slug,
    label: row.label,
    description: row.description,
    mode: row.mode,
    is_listed: row.is_listed,
    post_count: Number(row.post_count || 0),
    last_post_at: row.last_post_at,
  }));
}

async function getSameDayUrlKeys(topicSlug, dayIsoDate) {
  const date = dayIsoDate ? new Date(dayIsoDate) : new Date();
  const dayStart = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
  const rows = await prisma.article.findMany({
    where: {
      post: {
        topicSlug,
        createdAt: { gte: dayStart, lt: dayEnd },
      },
    },
    select: { urlKey: true },
  });
  return rows.map((row) => row.urlKey).filter(Boolean);
}

/**
 * Insère un nouveau post avec ses articles, en filtrant les doublons d'URL
 * déjà publiés le même jour pour le même sujet.
 */
async function createPost(rawPost) {
  const topicSlug = String(rawPost.topic || "esport").trim().toLowerCase();
  const articles = Array.isArray(rawPost.articles) ? rawPost.articles : [];
  const createdAt = rawPost.createdAt ? new Date(rawPost.createdAt) : new Date();
  if (Number.isNaN(createdAt.getTime())) {
    throw new Error("invalid createdAt");
  }

  const topic = await getTopic(topicSlug);
  const mode = (() => {
    if (rawPost.mode && VALID_MODES.has(rawPost.mode)) return rawPost.mode;
    if (topic?.mode && VALID_MODES.has(topic.mode)) return topic.mode;
    return "fr-intl";
  })();

  const sameDayKeys = new Set(await getSameDayUrlKeys(topicSlug, createdAt.toISOString().slice(0, 10)));

  const seen = new Set();
  const uniqueArticles = [];
  for (const article of articles) {
    const key = normalizeUrlKey(article.url);
    if (!key || seen.has(key) || sameDayKeys.has(key)) continue;
    seen.add(key);
    uniqueArticles.push({ ...article, urlKey: key });
  }

  if (!uniqueArticles.length) {
    return { post: null, skipped: true, reason: "no-new-article-today" };
  }

  const postId = rawPost.id || createdAt.toISOString();
  const postTitle = String(rawPost.title || "").trim() || `Recap ${topicSlug}`;
  const postSummary = String(rawPost.summary || "").trim();
  const sourceGroups = rawPost.sourceGroups || {};
  const errors = Array.isArray(rawPost.errors) ? rawPost.errors : [];
  const debug = rawPost.debug || {};

  const searchText = buildPostSearchText({
    title: postTitle,
    summary: postSummary,
    topic: topicSlug,
    id: postId,
    createdAt: createdAt.toISOString(),
    articles: uniqueArticles,
  });

  // Auto-déclare le sujet si absent (auto-discovery depuis n8n) et synchronise
  // la description si n8n en envoie une (la config n8n est la source de vérité).
  const incomingDescription =
    typeof rawPost.topicDescription === "string" && rawPost.topicDescription.trim()
      ? rawPost.topicDescription.trim()
      : null;
  await upsertTopic({
    slug: topicSlug,
    label: topic?.label || rawPost.topicLabel || topicSlug,
    description: incomingDescription || topic?.description || null,
    mode,
    isListed: topic?.is_listed ?? true,
  });

  const articleData = uniqueArticles.map((article, index) => {
    const publishedAt = article.publishedAt ? new Date(article.publishedAt) : null;
    const safePublishedAt =
      publishedAt && !Number.isNaN(publishedAt.getTime()) ? publishedAt : null;
    return {
      title: String(article.title || "").trim(),
      url: String(article.url || "").trim(),
      urlKey: article.urlKey,
      source: article.source || null,
      region: article.region === "fr" ? "fr" : "intl",
      method: article.method || null,
      snippet: article.snippet || null,
      publishedAt: safePublishedAt,
      position: index,
    };
  });

  const persisted = await prisma.$transaction(async (tx) => {
    return tx.post.upsert({
      where: { id: postId },
      create: {
        id: postId,
        topicSlug,
        title: postTitle,
        summary: postSummary,
        slot: rawPost.slot || null,
        mode,
        sourceGroups,
        errors,
        debug,
        searchText,
        createdAt,
        articles: { create: articleData },
      },
      update: {
        topicSlug,
        title: postTitle,
        summary: postSummary,
        slot: rawPost.slot || null,
        mode,
        sourceGroups,
        errors,
        debug,
        searchText,
        createdAt,
        articles: {
          deleteMany: {},
          create: articleData,
        },
      },
      include: { articles: { orderBy: { position: "asc" } } },
    });
  });

  return {
    post: postModelToApi(persisted),
    skipped: false,
  };
}

async function getPostById(id) {
  const post = await prisma.post.findUnique({
    where: { id },
    include: { articles: { orderBy: { position: "asc" } } },
  });
  return post ? postModelToApi(post) : null;
}

async function getTopicPostsPage(topicSlug, { offset = 0, limit = 8, query = "" } = {}) {
  const safeOffset = Math.max(0, Number(offset) || 0);
  const safeLimit = Math.min(TOPIC_PAGE_LIMIT_MAX, Math.max(1, Number(limit) || 8));
  const tokens = normalizeSearch(query).split(" ").filter(Boolean);

  // Construit la clause where: chaque token doit être contenu dans search_text.
  const whereClause = {
    topicSlug,
    ...(tokens.length
      ? {
          AND: tokens.map((token) => ({
            searchText: { contains: token, mode: "insensitive" },
          })),
        }
      : {}),
  };

  const [posts, total] = await prisma.$transaction([
    prisma.post.findMany({
      where: whereClause,
      include: { articles: { orderBy: { position: "asc" } } },
      orderBy: { createdAt: "desc" },
      take: safeLimit,
      skip: safeOffset,
    }),
    prisma.post.count({ where: whereClause }),
  ]);

  return {
    posts: posts.map(postModelToApi),
    total,
    offset: safeOffset,
    limit: safeLimit,
    nextOffset: safeOffset + safeLimit,
    hasMore: safeOffset + safeLimit < total,
  };
}

async function getRecentPostsForTopic(topicSlug, limit = 20) {
  const safeLimit = Math.min(5000, Math.max(1, Number(limit) || 20));
  const posts = await prisma.post.findMany({
    where: { topicSlug },
    include: { articles: { orderBy: { position: "asc" } } },
    orderBy: { createdAt: "desc" },
    take: safeLimit,
  });
  return posts.map(postModelToApi);
}

async function getSitemapEntries() {
  const topics = await listTopics();
  const posts = await prisma.post.findMany({
    select: { id: true, topicSlug: true, createdAt: true, title: true },
    orderBy: { createdAt: "desc" },
    take: 5000,
  });
  return {
    topics: topics.filter((topic) => topic.is_listed),
    posts: posts.map((post) => ({
      id: post.id,
      topic_slug: post.topicSlug,
      created_at: post.createdAt,
      title: post.title,
    })),
  };
}

/**
 * Token bucket Gemini partagé entre tous les workflows n8n.
 *
 * Sémantique de quota: "max appels par minute glissante", soit au plus
 * `maxPerMinute` slots dans n'importe quelle fenêtre de 60 secondes.
 *
 * Algorithme de planification:
 *   1. Prend un verrou Postgres (pg_advisory_xact_lock) pour sérialiser les
 *      réservations concurrentes des workflows lancés sur le même cron tick.
 *   2. Lit toutes les réservations encore "vivantes" (called_at > NOW - 60s).
 *      Cela inclut les réservations futures déjà programmées.
 *   3. Si moins de `maxPerMinute` réservations sont vivantes, on insère
 *      immédiatement et on retourne waitMs = 0.
 *   4. Sinon on calcule le prochain slot libre: trier ASC, prendre l'élément
 *      d'index `len - maxPerMinute`, et programmer le nouvel appel à
 *      `cet_element.called_at + 60s + 200ms`. À ce moment-là, exactement
 *      (maxPerMinute - 1) appels seront encore dans la fenêtre.
 *
 * Conséquence: avec maxPerMinute=5 et 12 workflows lancés en même temps,
 * les 5 premiers passent immédiatement, les 5 suivants attendent ~60s,
 * les 2 derniers attendent ~120s. La file d'attente progresse minute par
 * minute sans jamais dépasser le quota Gemini.
 *
 * `maxWaitSeconds` est un garde-fou de sécurité: si le calcul donne un délai
 * supérieur (ex: bucket corrompu), on refuse la réservation pour éviter une
 * attente de plusieurs heures.
 */
async function reserveGeminiSlot({ topicSlug = null, maxPerMinute = 5, maxWaitSeconds = 1800 }) {
  const safeMax = Math.max(1, Math.min(60, Number(maxPerMinute) || 5));
  const safeMaxWait = Math.max(0, Math.min(86_400, Number(maxWaitSeconds) || 1800));

  return prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe("SELECT pg_advisory_xact_lock(424242);");
    await tx.$executeRawUnsafe(
      `DELETE FROM gemini_calls WHERE called_at < NOW() - INTERVAL '10 minutes';`,
    );
    const upcoming = await tx.$queryRawUnsafe(
      `SELECT called_at FROM gemini_calls
       WHERE called_at > NOW() - INTERVAL '60 seconds'
       ORDER BY called_at ASC;`,
    );

    if (upcoming.length < safeMax) {
      await tx.geminiCall.create({ data: { topicSlug } });
      return {
        ok: true,
        waitMs: 0,
        reserved: true,
        used: upcoming.length + 1,
        max: safeMax,
        scheduledMinute: 0,
      };
    }

    // Bucket plein dans la fenêtre courante. Le prochain slot libre est juste
    // après que l'élément (len - maxPerMinute) sorte de la fenêtre 60s.
    const cursor = upcoming[upcoming.length - safeMax].called_at;
    const releaseAt = new Date(cursor.getTime() + 60_000 + 200);
    const waitMs = Math.max(0, releaseAt.getTime() - Date.now());
    const scheduledMinute = Math.max(1, Math.round(waitMs / 60_000));

    if (waitMs > safeMaxWait * 1000) {
      return {
        ok: false,
        waitMs,
        reserved: false,
        reason: "rate-limit-cap-exceeded",
        used: upcoming.length,
        max: safeMax,
        scheduledMinute,
      };
    }

    // Réservation différée: on enregistre l'appel au moment programmé pour
    // que les workflows suivants voient ce slot comme déjà occupé.
    await tx.geminiCall.create({ data: { topicSlug, calledAt: releaseAt } });
    return {
      ok: true,
      waitMs,
      reserved: true,
      used: upcoming.length + 1,
      max: safeMax,
      scheduledMinute,
    };
  });
}

async function pingDb() {
  await prisma.$queryRawUnsafe("SELECT 1;");
}

async function close() {
  await prisma.$disconnect();
}

module.exports = {
  prisma,
  Prisma,
  ensureSchema,
  upsertTopic,
  getTopic,
  listTopics,
  createPost,
  getPostById,
  getTopicPostsPage,
  getSameDayUrlKeys,
  getSitemapEntries,
  getRecentPostsForTopic,
  reserveGeminiSlot,
  pingDb,
  close,
};
