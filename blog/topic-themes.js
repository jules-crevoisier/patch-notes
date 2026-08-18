/**
 * Accents de section, calés sur la DA papier (encre + filets).
 * Une teinte par sujet, écartées sur le cercle chromatique.
 */

/** @type {Record<string, { accent: string, ink: string, soft: string, dark: { accent: string, ink: string, soft: string } }>} */
const TOPIC_THEMES = {
  general: {
    accent: "#0a7a68",
    ink: "#06473d",
    soft: "rgba(10, 122, 104, 0.08)",
    dark: { accent: "#3dbaa4", ink: "#8fd9c8", soft: "rgba(61, 186, 164, 0.16)" },
  },
  gaming: {
    accent: "#5b8c00",
    ink: "#3d5e00",
    soft: "rgba(91, 140, 0, 0.09)",
    dark: { accent: "#9ccc33", ink: "#c5e56a", soft: "rgba(156, 204, 51, 0.16)" },
  },
  esport: {
    accent: "#6b21a8",
    ink: "#4c1578",
    soft: "rgba(107, 33, 168, 0.08)",
    dark: { accent: "#c084fc", ink: "#e9d5ff", soft: "rgba(192, 132, 252, 0.16)" },
  },
  "tech-ia": {
    accent: "#1f4ea8",
    ink: "#163678",
    soft: "rgba(31, 78, 168, 0.08)",
    dark: { accent: "#7aa2ff", ink: "#c5d6ff", soft: "rgba(122, 162, 255, 0.16)" },
  },
  "espace-sciences": {
    accent: "#00a0c8",
    ink: "#00708c",
    soft: "rgba(0, 160, 200, 0.09)",
    dark: { accent: "#4dd0e8", ink: "#b3ecf6", soft: "rgba(77, 208, 232, 0.16)" },
  },
  automobile: {
    accent: "#1a2744",
    ink: "#121a2e",
    soft: "rgba(26, 39, 68, 0.08)",
    dark: { accent: "#8aa0d4", ink: "#c9d4ee", soft: "rgba(138, 160, 212, 0.16)" },
  },
  sport: {
    accent: "#e05a00",
    ink: "#9c3e00",
    soft: "rgba(224, 90, 0, 0.09)",
    dark: { accent: "#ff8a3d", ink: "#ffd0b0", soft: "rgba(255, 138, 61, 0.16)" },
  },
  f1: {
    accent: "#d01c1f",
    ink: "#8e1215",
    soft: "rgba(208, 28, 31, 0.09)",
    dark: { accent: "#ff5a5f", ink: "#ffc4c6", soft: "rgba(255, 90, 95, 0.16)" },
  },
  "cinema-series": {
    accent: "#9a4a18",
    ink: "#6c3310",
    soft: "rgba(154, 74, 24, 0.1)",
    dark: { accent: "#e09a55", ink: "#f3d2b0", soft: "rgba(224, 154, 85, 0.16)" },
  },
  crypto: {
    accent: "#e6b800",
    ink: "#9a7c00",
    soft: "rgba(230, 184, 0, 0.12)",
    dark: { accent: "#f0c93a", ink: "#ffe99a", soft: "rgba(240, 201, 58, 0.16)" },
  },
  musique: {
    accent: "#c2186a",
    ink: "#8a114c",
    soft: "rgba(194, 24, 106, 0.08)",
    dark: { accent: "#f472b6", ink: "#fbcfe8", soft: "rgba(244, 114, 182, 0.16)" },
  },
  "anime-manga": {
    accent: "#e85d4c",
    ink: "#b33d30",
    soft: "rgba(232, 93, 76, 0.09)",
    dark: { accent: "#ff8a7a", ink: "#ffd0c9", soft: "rgba(255, 138, 122, 0.16)" },
  },
};

const FALLBACK_THEME = TOPIC_THEMES.general;

/** Six parts façon Trivial Pursuit — un clic isole les sujets du même type. */
const TOPIC_FAMILIES = [
  { id: "competition", label: "Compétition", slugs: ["sport", "f1"] },
  { id: "arene", label: "Arène", slugs: ["esport", "gaming"] },
  { id: "ecrans", label: "Écrans", slugs: ["cinema-series", "anime-manga"] },
  { id: "scene", label: "Scène", slugs: ["musique", "automobile"] },
  { id: "signal", label: "Signal", slugs: ["tech-ia", "crypto"] },
  { id: "monde", label: "Monde", slugs: ["general", "espace-sciences"] },
];

function familyById(id) {
  return TOPIC_FAMILIES.find((family) => family.id === id) || null;
}

function familyIdForSlug(slug) {
  const key = String(slug || "").trim().toLowerCase();
  const family = TOPIC_FAMILIES.find((item) => item.slugs.includes(key));
  return family ? family.id : "";
}

/**
 * @param {Array<{ slug: string, label?: string }>} topics
 */
function familiesPresent(topics) {
  const listed = new Set((topics || []).map((topic) => String(topic.slug || "").toLowerCase()));
  return TOPIC_FAMILIES.map((family) => {
    const members = family.slugs
      .filter((slug) => listed.has(slug))
      .map((slug) => {
        const topic = (topics || []).find((item) => item.slug === slug);
        return {
          slug,
          label: topic?.label || slug,
          color: getTopicTheme(slug).accent,
        };
      });
    return { ...family, members };
  }).filter((family) => family.members.length > 0);
}

function polarPoint(cx, cy, radius, angleDeg) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return {
    x: Number((cx + radius * Math.cos(rad)).toFixed(3)),
    y: Number((cy + radius * Math.sin(rad)).toFixed(3)),
  };
}

function donutSlicePath(cx, cy, outerR, innerR, startAngle, endAngle) {
  const sweep = endAngle - startAngle;
  const largeArc = sweep > 180 ? 1 : 0;
  const outerStart = polarPoint(cx, cy, outerR, startAngle);
  const outerEnd = polarPoint(cx, cy, outerR, endAngle);
  const innerEnd = polarPoint(cx, cy, innerR, endAngle);
  const innerStart = polarPoint(cx, cy, innerR, startAngle);
  return `M${outerStart.x} ${outerStart.y} A${outerR} ${outerR} 0 ${largeArc} 1 ${outerEnd.x} ${outerEnd.y} L${innerEnd.x} ${innerEnd.y} A${innerR} ${innerR} 0 ${largeArc} 0 ${innerStart.x} ${innerStart.y} Z`;
}

/**
 * @param {Array<{ slug: string, label?: string }>} topics
 */
function buildWheelSlices(topics) {
  const families = familiesPresent(topics);
  if (!families.length) return [];
  const familySweep = 360 / families.length;
  const slices = [];
  families.forEach((family, familyIndex) => {
    const familyStart = familyIndex * familySweep;
    const memberSweep = familySweep / family.members.length;
    family.members.forEach((member, memberIndex) => {
      const startAngle = familyStart + memberIndex * memberSweep;
      slices.push({
        familyId: family.id,
        familyLabel: family.label,
        slug: member.slug,
        label: member.label,
        color: member.color,
        startAngle,
        endAngle: startAngle + memberSweep,
      });
    });
  });
  return slices;
}

function escapeXml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

/**
 * Rotation clockwise (deg) that puts a family wedge at the top of the wheel.
 * @param {number} familyCount
 * @param {number} familyIndex
 */
function familyLandingDegrees(familyCount, familyIndex) {
  const count = Number(familyCount);
  const index = Number(familyIndex);
  if (!Number.isFinite(count) || count <= 0) return 0;
  const sweep = 360 / count;
  const center = index * sweep + sweep / 2;
  return (360 - center) % 360;
}

/**
 * @param {number} current
 * @param {number} landing
 * @param {number} [extraTurns]
 */
function nextSpinAngle(current, landing, extraTurns = 6) {
  const from = Number(current) || 0;
  const normalized = ((from % 360) + 360) % 360;
  const target = ((Number(landing) || 0) % 360 + 360) % 360;
  let delta = (target - normalized + 360) % 360;
  if (delta < 45) delta += 360;
  return from + extraTurns * 360 + delta;
}

/**
 * @param {string[]} ids
 * @param {string} [excludeId]
 * @param {() => number} [random]
 */
function pickRandomFamilyId(ids, excludeId = "", random = Math.random) {
  const list = Array.isArray(ids) ? ids.filter(Boolean) : [];
  const pool = list.filter((id) => id !== excludeId);
  const source = pool.length ? pool : list;
  if (!source.length) return "";
  const roll = typeof random === "function" ? random() : Math.random();
  const index = Math.min(source.length - 1, Math.floor(roll * source.length));
  return source[index] || "";
}

/**
 * @param {Array<{ slug: string, label?: string }>} topics
 */
function renderTopicWheel(topics) {
  const slices = buildWheelSlices(topics);
  if (!slices.length) return "";
  const families = familiesPresent(topics);
  const paths = slices
    .map((slice) => {
      const d = donutSlicePath(50, 50, 48, 22, slice.startAngle, slice.endAngle);
      const title = `${slice.familyLabel} — ${slice.label}`;
      return `<path d="${d}" fill="${escapeXml(slice.color)}" data-family="${escapeXml(slice.familyId)}" data-slug="${escapeXml(slice.slug)}" tabindex="0" role="button" aria-pressed="false" aria-label="${escapeXml(title)}"><title>${escapeXml(title)}</title></path>`;
    })
    .join("");
  const familyMap = Object.fromEntries(families.map((family) => [family.id, family.members.map((member) => member.slug)]));
  const landings = Object.fromEntries(
    families.map((family, index) => [family.id, familyLandingDegrees(families.length, index)]),
  );
  return `<div class="topic-wheel" data-families="${escapeXml(JSON.stringify(familyMap))}" data-landings="${escapeXml(JSON.stringify(landings))}">
      <p class="topic-wheel__label">Tire une couleur</p>
      <svg class="topic-wheel__svg" viewBox="0 0 100 100" aria-label="Tire une couleur pour filtrer les sujets">
        <g class="topic-wheel__dial">${paths}</g>
        <circle class="topic-wheel__hub" cx="50" cy="50" r="20" data-random="true" role="button" tabindex="0" aria-label="Tirage au sort"></circle>
        <text class="topic-wheel__hub-label" x="50" y="55.8" text-anchor="middle">?</text>
      </svg>
    </div>`;
}

/**
 * @param {string | undefined | null} slug
 */
function getTopicTheme(slug) {
  const key = String(slug || "").trim().toLowerCase();
  return TOPIC_THEMES[key] || FALLBACK_THEME;
}

function themeVars(theme) {
  return `--topic-accent:${theme.accent};--topic-accent-ink:${theme.ink};--topic-accent-soft:${theme.soft};`;
}

function buildThemeCss() {
  const light = Object.entries(TOPIC_THEMES)
    .map(([slug, theme]) => `[data-topic="${slug}"]{${themeVars(theme)}}`)
    .join("");
  const dark = Object.entries(TOPIC_THEMES)
    .map(([slug, theme]) => `[data-topic="${slug}"]{${themeVars(theme.dark)}}`)
    .join("");
  return `${light}@media (prefers-color-scheme: dark){${dark}}`;
}

function renderTopicThemeStyleBlock() {
  return `<style id="topic-themes">${buildThemeCss()}</style>`;
}

/**
 * @param {string | undefined | null} slug
 */
function topicBodyClass(slug) {
  const key = String(slug || "").trim().toLowerCase();
  if (!key) return "";
  return ` class="topic-themed" data-topic="${key}"`;
}

module.exports = {
  TOPIC_THEMES,
  TOPIC_FAMILIES,
  FALLBACK_THEME,
  getTopicTheme,
  familyById,
  familyIdForSlug,
  familiesPresent,
  buildWheelSlices,
  donutSlicePath,
  familyLandingDegrees,
  nextSpinAngle,
  pickRandomFamilyId,
  renderTopicWheel,
  buildThemeCss,
  renderTopicThemeStyleBlock,
  topicBodyClass,
};
