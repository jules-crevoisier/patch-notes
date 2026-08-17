/**
 * Couche d'accès données pour le blog patch-notes.fr.
 *
 * Construite sur Prisma Client. Les migrations vivent dans prisma/migrations/
 * et sont appliquées par `prisma migrate deploy` au démarrage du conteneur.
 *
 * L'API exportée garde la même signature que la version pg brute, pour ne pas
 * impacter blog/server.js et blog/automation/ (scheduler + pipeline de recap).
 */

const { PrismaClient, Prisma } = require("@prisma/client");

const pinsLib = require("./pins");
const pinnedShelfLib = require("./pinned-shelf");
const suggestionsLib = require("./suggestions");
const seoUrls = require("./seo-urls");

const VALID_MODES = new Set(["fr", "intl", "fr-intl"]);
const TOPIC_PAGE_LIMIT_MAX = 30;
const PINNED_SHELF_LIMIT_MAX = 6;
const SUGGESTIONS_PAGE_LIMIT_MAX = 50;
const SUGGESTION_RATE_WINDOW_MS = 24 * 60 * 60 * 1000;

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
    pinCount: post.pinCount ?? 0,
    sourceGroups: post.sourceGroups || {},
    errors: post.errors || [],
    debug: post.debug || {},
    articles: (post.articles || []).map((article) => ({
      id: article.id.toString(),
      title: article.title,
      url: article.url,
      landingPath: seoUrls.articlePublicPath(post.topicSlug, {
        id: article.id,
        title: article.title,
      }),
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

/**
 * Fixed order-by shape for the normal paginated/day-grouped post list.
 *
 * Deliberately ignores every argument: the normal list's ordering must never
 * be influenced by pin state (ipHash, pinned flags, etc). The pinned shelf is
 * a fully separate query (getPinnedTopicPosts) with its own ordering.
 */
function buildTopicPostsOrderBy() {
  return [{ createdAt: "desc" }];
}

/**
 * Looks up which of the given postIds the viewer behind `ipHash` has
 * already pinned. Returns a Set for O(1) membership checks. No-ops (empty
 * set) when ipHash isn't provided or there's nothing to check.
 */
async function findPinnedPostIds(ipHash, postIds) {
  if (!ipHash || !postIds.length) return new Set();
  const rows = await prisma.postPin.findMany({
    where: { ipHash, postId: { in: postIds } },
    select: { postId: true },
  });
  return new Set(rows.map((row) => row.postId));
}

async function getTopicPostsPage(topicSlug, { offset = 0, limit = 8, query = "", ipHash } = {}) {
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

  const [rows, total] = await prisma.$transaction([
    prisma.post.findMany({
      where: whereClause,
      include: { articles: { orderBy: { position: "asc" } } },
      orderBy: buildTopicPostsOrderBy(),
      take: safeLimit,
      skip: safeOffset,
    }),
    prisma.post.count({ where: whereClause }),
  ]);

  const posts = rows.map(postModelToApi);
  const pinnedIds = await findPinnedPostIds(ipHash, posts.map((post) => post.id));
  for (const post of posts) post.pinnedByMe = pinnedIds.has(post.id);

  return {
    posts,
    total,
    offset: safeOffset,
    limit: safeLimit,
    nextOffset: safeOffset + safeLimit,
    hasMore: safeOffset + safeLimit < total,
  };
}

/**
 * Separate query for the pinned-posts shelf on a topic page. Never shares
 * the normal list's orderBy/pagination - see buildTopicPostsOrderBy above.
 *
 * The DB query only filters to candidates (pinCount > 0 for this topic);
 * the actual sort+cap rule is delegated to selectPinnedShelf (pinned-shelf.js)
 * so that rule has exactly one implementation, tested in isolation, instead
 * of being re-expressed a second time as separate Prisma query options.
 */
async function getPinnedTopicPosts(topicSlug, { limit = 6, ipHash } = {}) {
  const safeLimit = Math.min(PINNED_SHELF_LIMIT_MAX, Math.max(1, Number(limit) || 6));

  const candidates = await prisma.post.findMany({
    where: { topicSlug, pinCount: { gt: 0 } },
    select: { id: true, title: true, topicSlug: true, pinCount: true, createdAt: true },
  });

  const shelf = pinnedShelfLib.selectPinnedShelf(candidates, { limit: safeLimit });
  const pinnedIds = await findPinnedPostIds(ipHash, shelf.map((post) => post.id));

  return shelf.map((post) => ({
    id: post.id,
    title: post.title,
    topic: post.topicSlug,
    pinCount: post.pinCount,
    pinnedByMe: pinnedIds.has(post.id),
    createdAt: post.createdAt instanceof Date ? post.createdAt.toISOString() : post.createdAt,
  }));
}

/**
 * Toggles a (postId, ipHash) pin. Wraps the pure pins.pinToggle decision
 * with the real Prisma read/write.
 *
 * Race-safety note: a plain findUnique-then-create/delete has a window where
 * two concurrent requests for the same (postId, ipHash) both read the
 * pre-write state, then one write fails against the unique index. Postgres
 * aborts the WHOLE transaction on any statement error (25P02, "current
 * transaction is aborted"), so recovering by issuing another query inside
 * that same poisoned transaction just throws again - it doesn't help.
 *
 * Instead, the actual write is done as a single atomic raw statement that
 * cannot throw on a concurrent duplicate in the first place:
 *   - pin:   INSERT ... ON CONFLICT (post_id, ip_hash) DO NOTHING RETURNING id
 *   - unpin: DELETE ... RETURNING id
 * Both return zero rows (not an error) when a concurrent request already
 * did the same thing first. The row count tells us whether *this* call
 * actually changed anything, so pinCount is only ever incremented/
 * decremented by whichever call truly won - no error path to catch, no
 * poisoned transaction, and the toggle is idempotent under a race.
 */
/**
 * Returns topic slugs pinned by this visitor (homepage favorites).
 */
async function getVisitorPinnedTopicSlugs(ipHash) {
  if (!ipHash) return [];
  const rows = await prisma.topicPin.findMany({
    where: { ipHash },
    orderBy: { createdAt: "desc" },
    select: { topicSlug: true },
  });
  return rows.map((row) => row.topicSlug);
}

/**
 * Toggles a (topicSlug, ipHash) pin for the homepage category shelf.
 * Same atomic insert/delete pattern as pinPost (no public counter).
 */
async function pinTopic(topicSlug, ipHash) {
  return prisma.$transaction(async (tx) => {
    const topic = await tx.topic.findUnique({
      where: { slug: topicSlug },
      select: { slug: true, isListed: true },
    });
    if (!topic || !topic.isListed) return null;

    const existingPin = await tx.topicPin.findUnique({
      where: { topicSlug_ipHash: { topicSlug, ipHash } },
    });

    if (existingPin) {
      await tx.$queryRaw`
        DELETE FROM topic_pins WHERE topic_slug = ${topicSlug} AND ip_hash = ${ipHash}
        RETURNING id
      `;
      return { pinned: false, slug: topicSlug };
    }

    await tx.$queryRaw`
      INSERT INTO topic_pins (topic_slug, ip_hash)
      VALUES (${topicSlug}, ${ipHash})
      ON CONFLICT (topic_slug, ip_hash) DO NOTHING
      RETURNING id
    `;
    return { pinned: true, slug: topicSlug };
  });
}

async function pinPost(postId, ipHash) {
  return prisma.$transaction(async (tx) => {
    const post = await tx.post.findUnique({
      where: { id: postId },
      select: { id: true, pinCount: true },
    });
    if (!post) return null;

    const existingPin = await tx.postPin.findUnique({
      where: { postId_ipHash: { postId, ipHash } },
    });

    const decision = pinsLib.pinToggle({
      postId,
      ipHash,
      existingPin,
      currentPinCount: post.pinCount,
    });

    if (decision.action === "pinned") {
      const inserted = await tx.$queryRaw`
        INSERT INTO post_pins (post_id, ip_hash)
        VALUES (${postId}, ${ipHash})
        ON CONFLICT (post_id, ip_hash) DO NOTHING
        RETURNING id
      `;
      if (inserted.length === 0) {
        // A concurrent request already won the insert - no second increment.
        const current = await tx.post.findUnique({ where: { id: postId }, select: { pinCount: true } });
        return { pinned: true, pinCount: current?.pinCount ?? post.pinCount };
      }
      const updated = await tx.post.update({
        where: { id: postId },
        data: { pinCount: { increment: 1 } },
        select: { pinCount: true },
      });
      return { pinned: true, pinCount: updated.pinCount };
    }

    const deleted = await tx.$queryRaw`
      DELETE FROM post_pins WHERE post_id = ${postId} AND ip_hash = ${ipHash}
      RETURNING id
    `;
    if (deleted.length === 0) {
      // A concurrent request already unpinned it - idempotent no-op, matches
      // the toggle's intended semantics instead of surfacing as an error.
      const current = await tx.post.findUnique({ where: { id: postId }, select: { pinCount: true } });
      return { pinned: false, pinCount: current?.pinCount ?? post.pinCount };
    }
    const updated = await tx.post.update({
      where: { id: postId },
      data: { pinCount: { decrement: 1 } },
      select: { pinCount: true },
    });
    return { pinned: false, pinCount: updated.pinCount };
  });
}

/**
 * Evaluates + (maybe) persists a "/suggerer" submission.
 *  - honeypot: fake-success shape, no DB write at all.
 *  - invalid: returns the reason, nothing written.
 *  - accept: rate-limit check against that ipHash's last-24h timestamps
 *    BEFORE inserting.
 */
async function createSuggestion({ text, email, honeypot, ipHash }) {
  const evaluation = suggestionsLib.evaluateSuggestionSubmission({ text, email, honeypot });

  if (evaluation.outcome === "honeypot") {
    return { outcome: "honeypot" };
  }

  if (evaluation.outcome === "invalid") {
    return { outcome: "invalid", reason: evaluation.reason };
  }

  const since = new Date(Date.now() - SUGGESTION_RATE_WINDOW_MS);
  const recent = await prisma.suggestion.findMany({
    where: { ipHash, createdAt: { gte: since } },
    select: { createdAt: true },
  });

  const rateCheck = suggestionsLib.checkSuggestionRateLimit(recent.map((row) => row.createdAt));
  if (!rateCheck.allowed) {
    return { outcome: "rate-limited" };
  }

  const created = await prisma.suggestion.create({
    data: {
      text: evaluation.text,
      email: evaluation.email ?? null,
      ipHash,
    },
  });

  return {
    outcome: "created",
    suggestion: {
      id: created.id.toString(),
      text: created.text,
      email: created.email,
      likeCount: 0,
      createdAt: created.createdAt.toISOString(),
    },
  };
}

async function listPublicSuggestions({ ipHash, offset = 0, limit = 50 } = {}) {
  const safeOffset = Math.max(0, Number(offset) || 0);
  const safeLimit = Math.min(100, Math.max(1, Number(limit) || 50));

  const [rows, total] = await prisma.$transaction([
    prisma.suggestion.findMany({
      orderBy: [{ likeCount: "desc" }, { createdAt: "desc" }],
      take: safeLimit,
      skip: safeOffset,
      select: {
        id: true,
        text: true,
        likeCount: true,
        createdAt: true,
        likes: ipHash
          ? {
              where: { ipHash },
              select: { id: true },
              take: 1,
            }
          : false,
      },
    }),
    prisma.suggestion.count(),
  ]);

  return {
    suggestions: rows.map((row) => ({
      id: row.id.toString(),
      text: row.text,
      likeCount: row.likeCount,
      createdAt: row.createdAt.toISOString(),
      likedByMe: ipHash ? row.likes.length > 0 : false,
    })),
    total,
    offset: safeOffset,
    limit: safeLimit,
    nextOffset: safeOffset + safeLimit,
    hasMore: safeOffset + safeLimit < total,
  };
}

async function likeSuggestion(suggestionId, ipHash) {
  return prisma.$transaction(async (tx) => {
    const suggestion = await tx.suggestion.findUnique({
      where: { id: BigInt(suggestionId) },
      select: { id: true, likeCount: true },
    });
    if (!suggestion) return null;

    const existingLike = await tx.suggestionLike.findUnique({
      where: { suggestionId_ipHash: { suggestionId: suggestion.id, ipHash } },
    });

    const decision = pinsLib.pinToggle({
      postId: suggestionId,
      ipHash,
      existingPin: existingLike,
      currentPinCount: suggestion.likeCount,
    });

    if (decision.action === "pinned") {
      const inserted = await tx.$queryRaw`
        INSERT INTO suggestion_likes (suggestion_id, ip_hash)
        VALUES (${suggestion.id}, ${ipHash})
        ON CONFLICT (suggestion_id, ip_hash) DO NOTHING
        RETURNING id
      `;
      if (inserted.length === 0) {
        const current = await tx.suggestion.findUnique({
          where: { id: suggestion.id },
          select: { likeCount: true },
        });
        return { liked: true, likeCount: current?.likeCount ?? suggestion.likeCount };
      }
      const updated = await tx.suggestion.update({
        where: { id: suggestion.id },
        data: { likeCount: { increment: 1 } },
        select: { likeCount: true },
      });
      return { liked: true, likeCount: updated.likeCount };
    }

    const deleted = await tx.$queryRaw`
      DELETE FROM suggestion_likes WHERE suggestion_id = ${suggestion.id} AND ip_hash = ${ipHash}
      RETURNING id
    `;
    if (deleted.length === 0) {
      const current = await tx.suggestion.findUnique({
        where: { id: suggestion.id },
        select: { likeCount: true },
      });
      return { liked: false, likeCount: current?.likeCount ?? suggestion.likeCount };
    }
    const updated = await tx.suggestion.update({
      where: { id: suggestion.id },
      data: { likeCount: { decrement: 1 } },
      select: { likeCount: true },
    });
    return { liked: false, likeCount: updated.likeCount };
  });
}

async function getArticleForLanding(topicSlug, articleId) {
  let id;
  try {
    id = BigInt(articleId);
  } catch {
    return null;
  }

  const row = await prisma.article.findFirst({
    where: { id, post: { topicSlug } },
    include: {
      post: {
        include: {
          topic: true,
          articles: { orderBy: { position: "asc" } },
        },
      },
    },
  });

  if (!row) return null;

  return {
    article: {
      id: row.id.toString(),
      title: row.title,
      url: row.url,
      urlKey: row.urlKey,
      source: row.source,
      region: row.region,
      method: row.method,
      snippet: row.snippet,
      publishedAt:
        row.publishedAt instanceof Date ? row.publishedAt.toISOString() : row.publishedAt,
      landingPath: seoUrls.articlePublicPath(topicSlug, { id: row.id, title: row.title }),
    },
    post: postModelToApi(row.post),
    topic: topicRowToObject(row.post.topic),
  };
}

async function listArticlesForTopicSitemap(topicSlug, limit = 50000) {
  const safeLimit = Math.min(50000, Math.max(1, Number(limit) || 50000));
  const rows = await prisma.article.findMany({
    where: { post: { topicSlug } },
    orderBy: [{ publishedAt: "desc" }, { id: "desc" }],
    take: safeLimit,
    select: {
      id: true,
      title: true,
      publishedAt: true,
      post: { select: { createdAt: true } },
    },
  });

  return rows.map((row) => ({
    id: row.id.toString(),
    title: row.title,
    landingPath: seoUrls.articlePublicPath(topicSlug, { id: row.id, title: row.title }),
    lastmod: (row.publishedAt || row.post.createdAt).toISOString(),
  }));
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
  buildTopicPostsOrderBy,
  getTopicPostsPage,
  getPinnedTopicPosts,
  getVisitorPinnedTopicSlugs,
  pinTopic,
  pinPost,
  createSuggestion,
  listPublicSuggestions,
  likeSuggestion,
  getSameDayUrlKeys,
  getSitemapEntries,
  getRecentPostsForTopic,
  getArticleForLanding,
  listArticlesForTopicSitemap,
  pingDb,
  close,
};
