const test = require("node:test");
const assert = require("node:assert/strict");
const {
  TOPIC_THEMES,
  getTopicTheme,
  familyIdForSlug,
  buildWheelSlices,
  renderTopicWheel,
  buildThemeCss,
  topicBodyClass,
} = require("./topic-themes");

test("should return a distinct theme for known topic slugs", () => {
  const esport = getTopicTheme("esport");
  const gaming = getTopicTheme("gaming");
  assert.notEqual(esport.accent, gaming.accent);
  assert.match(esport.accent, /^#[0-9a-f]{6}$/i);
});

test("should fall back to general theme for unknown slugs", () => {
  assert.equal(getTopicTheme("unknown-slug").accent, getTopicTheme("general").accent);
});

test("should emit css variables for every configured slug", () => {
  const css = buildThemeCss();
  assert.match(css, /\[data-topic="esport"\]/);
  assert.match(css, /\[data-topic="tech-ia"\]/);
});

test("should keep every topic accent visually distinct from the others", () => {
  const hexToRgb = (hex) => {
    const value = Number.parseInt(hex.slice(1), 16);
    return { r: (value >> 16) & 255, g: (value >> 8) & 255, b: value & 255 };
  };
  const distance = (a, b) => Math.hypot(a.r - b.r, a.g - b.g, a.b - b.b);

  const entries = Object.entries(TOPIC_THEMES);
  for (let i = 0; i < entries.length; i += 1) {
    for (let j = i + 1; j < entries.length; j += 1) {
      const [slugA, themeA] = entries[i];
      const [slugB, themeB] = entries[j];
      const gap = distance(hexToRgb(themeA.accent), hexToRgb(themeB.accent));
      assert.ok(
        gap >= 70,
        `${slugA} (${themeA.accent}) too close to ${slugB} (${themeB.accent}): ${gap.toFixed(1)}`,
      );
    }
  }
});


test("should map a slug to its trivial-pursuit family", () => {
  assert.equal(familyIdForSlug("f1"), "competition");
  assert.equal(familyIdForSlug("esport"), "arene");
  assert.equal(familyIdForSlug("unknown"), "");
});

test("should split the wheel into family wedges that cover 360 degrees", () => {
  const topics = [
    { slug: "sport", label: "Sport" },
    { slug: "f1", label: "F1" },
    { slug: "esport", label: "Esport" },
    { slug: "gaming", label: "Gaming" },
    { slug: "cinema-series", label: "Cinéma" },
    { slug: "anime-manga", label: "Anime" },
    { slug: "musique", label: "Musique" },
    { slug: "automobile", label: "Auto" },
    { slug: "tech-ia", label: "Tech" },
    { slug: "crypto", label: "Crypto" },
    { slug: "general", label: "Général" },
    { slug: "espace-sciences", label: "Espace" },
  ];
  const slices = buildWheelSlices(topics);
  assert.equal(slices.length, 12);
  assert.equal(slices[0].startAngle, 0);
  assert.equal(slices.at(-1).endAngle, 360);
  const esport = slices.find((slice) => slice.slug === "esport");
  const gaming = slices.find((slice) => slice.slug === "gaming");
  assert.equal(esport.familyId, gaming.familyId);
});

test("should omit missing topics from the wheel", () => {
  const slices = buildWheelSlices([{ slug: "esport", label: "Esport" }]);
  assert.ok(slices.every((slice) => slice.slug === "esport"));
  assert.equal(slices[0].endAngle - slices[0].startAngle, 360);
});

test("should render a wheel with family data and a reset hub", () => {
  const html = renderTopicWheel([{ slug: "f1", label: "Formule 1" }]);
  assert.match(html, /data-family="competition"/);
  assert.match(html, /Tire une couleur/);
  assert.match(html, /Tous les sujets/);
  assert.match(html, /data-families="/);
});

test("should build body attributes with slug", () => {
  assert.equal(topicBodyClass("f1"), ' class="topic-themed" data-topic="f1"');
  assert.equal(topicBodyClass(""), "");
});
