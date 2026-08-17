/**
 * Chemins publics SEO pour les articles individuels.
 * Format: /{topic}/actu/{slug-titre}-{id}
 */

function slugifyTitle(title, maxLen = 80) {
  const slug = String(title || "actu")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, maxLen)
    .replace(/-+$/g, "");
  return slug || "actu";
}

function articlePublicSlug(article) {
  const id = article.id ?? article.articleId;
  return `${slugifyTitle(article.title)}-${String(id)}`;
}

function articlePublicPath(topicSlug, article) {
  return `/${topicSlug}/actu/${encodeURIComponent(articlePublicSlug(article))}`;
}

function parseArticlePublicSlug(slugParam) {
  const decoded = decodeURIComponent(String(slugParam || ""));
  const match = decoded.match(/-(\d+)$/);
  if (!match) return null;
  return match[1];
}

module.exports = {
  slugifyTitle,
  articlePublicSlug,
  articlePublicPath,
  parseArticlePublicSlug,
};
