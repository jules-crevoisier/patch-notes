const search = document.querySelector("#topic-search");
const topicShells = [...document.querySelectorAll(".topic-card-shell")];
const statusEl = document.querySelector("#status");
const pinStore = window.PatchNotesPinStore;

function normalize(value = "") {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function topicLabel(button) {
  return button.closest(".topic-card-shell")?.querySelector("strong")?.textContent?.trim() || button.dataset.topicSlug || "sujet";
}

function setTopicPinState(button, { pinned } = {}) {
  if (pinned === undefined) return;
  button.setAttribute("aria-pressed", pinned ? "true" : "false");
  const label = topicLabel(button);
  const action = pinned ? "Retirer" : "Épingler";
  const text = `${action} ${label}`;
  button.setAttribute("aria-label", text);
  button.setAttribute("title", text);
  const shell = button.closest(".topic-card-shell");
  if (shell) shell.classList.toggle("is-pinned", pinned);
}

function reorderPinnedTopics() {
  const grid = document.querySelector("#topics");
  if (!grid) return;

  const shells = [...grid.querySelectorAll(".topic-card-shell")];
  shells.sort((a, b) => {
    const aPinned = a.classList.contains("is-pinned") ? 0 : 1;
    const bPinned = b.classList.contains("is-pinned") ? 0 : 1;
    if (aPinned !== bPinned) return aPinned - bPinned;
    const aLabel = a.querySelector("strong")?.textContent || "";
    const bLabel = b.querySelector("strong")?.textContent || "";
    return aLabel.localeCompare(bLabel, "fr");
  });

  for (const shell of shells) grid.append(shell);
}

function applyPinnedSlugs(slugs) {
  const pinned = new Set(slugs);
  document.querySelectorAll(".pin-toggle--topic").forEach((button) => {
    const slug = button.dataset.topicSlug;
    if (!slug) return;
    setTopicPinState(button, { pinned: pinned.has(slug) });
  });
  reorderPinnedTopics();
}

async function refreshPinnedTopics() {
  if (!pinStore) return;
  const slugs = await pinStore.syncPins();
  applyPinnedSlugs(slugs);
}

function wireTopicPinButton(button) {
  if (!button || button.dataset.wired === "true") return;
  button.dataset.wired = "true";

  button.addEventListener("click", async (event) => {
    event.preventDefault();
    event.stopPropagation();

    const topicSlug = button.dataset.topicSlug;
    if (!topicSlug || button.disabled) return;

    const nextPinned = button.getAttribute("aria-pressed") !== "true";
    if (pinStore) pinStore.setLocalPin(topicSlug, nextPinned);
    setTopicPinState(button, { pinned: nextPinned });
    reorderPinnedTopics();

    button.disabled = true;
    try {
      const headers = pinStore ? pinStore.pinHeaders() : {};
      const response = await fetch(`/api/topics/${encodeURIComponent(topicSlug)}/pin`, {
        method: "POST",
        headers,
      });
      if (!response.ok) throw new Error("topic pin request failed");
      const result = await response.json();
      if (pinStore) pinStore.setLocalPin(topicSlug, Boolean(result.pinned));
      setTopicPinState(button, result);
      reorderPinnedTopics();
    } catch {
      // Keep optimistic local state when offline — localStorage is the fallback.
    } finally {
      button.disabled = false;
    }
  });
}

function renderTopics() {
  const query = search ? normalize(search.value.trim()) : "";
  const familySlugs = activeFamilySlugs();
  let visible = 0;

  for (const shell of topicShells) {
    const card = shell.querySelector(".topic-card");
    const text = normalize(`${card?.textContent || ""} ${card?.dataset.search || ""}`);
    const slug = shell.getAttribute("data-topic") || "";
    const textMatch = !query || text.includes(query);
    const familyMatch = !familySlugs || familySlugs.includes(slug);
    const match = textMatch && familyMatch;
    shell.hidden = !match;
    if (match) visible += 1;
  }

  if (statusEl) statusEl.textContent = `${visible} sujet${visible > 1 ? "s" : ""}`;
}

const wheel = document.querySelector(".topic-wheel");
let selectedFamily = "";
let spinning = false;
let spinToken = 0;

function familyMap() {
  if (!wheel?.dataset.families) return {};
  try {
    return JSON.parse(wheel.dataset.families);
  } catch {
    return {};
  }
}

function landingMap() {
  if (!wheel?.dataset.landings) return {};
  try {
    return JSON.parse(wheel.dataset.landings);
  } catch {
    return {};
  }
}

function activeFamilySlugs() {
  if (!selectedFamily) return null;
  const slugs = familyMap()[selectedFamily];
  return Array.isArray(slugs) ? slugs : null;
}

function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function pickRandomFamilyId(ids, excludeId = "") {
  const list = Array.isArray(ids) ? ids.filter(Boolean) : [];
  const pool = list.filter((id) => id !== excludeId);
  const source = pool.length ? pool : list;
  if (!source.length) return "";
  return source[Math.floor(Math.random() * source.length)];
}

function nextSpinAngle(current, landing, extraTurns = 6) {
  const from = Number(current) || 0;
  const normalized = ((from % 360) + 360) % 360;
  const target = ((Number(landing) || 0) % 360 + 360) % 360;
  let delta = (target - normalized + 360) % 360;
  if (delta < 45) delta += 360;
  return from + extraTurns * 360 + delta;
}

function currentDialRotation(dial) {
  if (!dial) return 0;
  const value = getComputedStyle(dial).transform;
  if (!value || value === "none") return 0;
  const match = value.match(/matrix3d\(([^)]+)\)/) || value.match(/matrix\(([^)]+)\)/);
  if (!match) return 0;
  const parts = match[1].split(",").map(Number);
  if (value.includes("matrix3d")) {
    return (Math.atan2(parts[1], parts[0]) * 180) / Math.PI;
  }
  return (Math.atan2(parts[1], parts[0]) * 180) / Math.PI;
}

function dialEl() {
  return wheel?.querySelector(".topic-wheel__dial");
}

function clearSpinStyles() {
  const dial = dialEl();
  wheel?.classList.remove("is-spinning");
  wheel?.removeAttribute("aria-busy");
  if (!dial) return;
  dial.style.animation = "";
  dial.style.transition = "";
  dial.style.transform = "";
}

function clearWheelFilter() {
  spinToken += 1;
  spinning = false;
  clearSpinStyles();
  setWheelFamily("");
}

function isKeepFilterTarget(node) {
  if (!node || typeof node.closest !== "function") return false;
  return Boolean(
    node.closest(".topic-wheel") ||
    node.closest(".topic-grid") ||
    node.closest(".search-box")
  );
}

function setWheelFamily(familyId) {
  selectedFamily = familyId || "";
  if (wheel) wheel.classList.toggle("is-filtered", Boolean(selectedFamily));
  document.querySelectorAll(".topic-wheel [data-family]").forEach((node) => {
    const isActive = Boolean(selectedFamily) && node.getAttribute("data-family") === selectedFamily;
    node.classList.toggle("is-active", isActive);
    if (node.getAttribute("role") === "button") {
      node.setAttribute("aria-pressed", isActive ? "true" : "false");
    }
  });
  renderTopics();
}

function spinRandom() {
  if (!wheel || spinning) return;
  const ids = Object.keys(familyMap());
  const familyId = pickRandomFamilyId(ids, selectedFamily);
  if (!familyId) return;
  const landing = Number(landingMap()[familyId]) || 0;

  if (prefersReducedMotion()) {
    clearSpinStyles();
    setWheelFamily(familyId);
    return;
  }

  const dial = dialEl();
  if (!dial) {
    setWheelFamily(familyId);
    return;
  }

  const token = spinToken + 1;
  spinToken = token;
  spinning = true;
  wheel.classList.add("is-spinning");
  wheel.setAttribute("aria-busy", "true");
  const from = currentDialRotation(dial);
  dial.style.animation = "none";
  dial.style.transition = "none";
  dial.style.transform = `rotate(${from}deg)`;
  void dial.getBoundingClientRect();
  const target = nextSpinAngle(from, landing, 6);
  dial.style.transition = "transform 2.6s cubic-bezier(0.12, 0.72, 0.08, 1)";
  dial.style.transform = `rotate(${target}deg)`;

  let settled = false;
  const finish = (event) => {
    if (settled || token !== spinToken) return;
    if (event?.propertyName && event.propertyName !== "transform") return;
    settled = true;
    spinning = false;
    wheel.classList.remove("is-spinning");
    wheel.removeAttribute("aria-busy");
    dial.style.animation = "none";
    dial.style.transition = "none";
    setWheelFamily(familyId);
  };
  dial.addEventListener("transitionend", finish);
  window.setTimeout(finish, 2800);
}

function wireWheel() {
  if (!wheel) return;
  wheel.addEventListener("click", (event) => {
    if (event.target.closest("[data-random]")) {
      spinRandom();
      return;
    }
    if (spinning) return;
    const target = event.target.closest("[data-family]");
    if (!target || !wheel.contains(target)) return;
    const familyId = target.getAttribute("data-family") || "";
    const next = familyId && familyId === selectedFamily ? "" : familyId;
    if (!next) clearSpinStyles();
    setWheelFamily(next);
  });
  wheel.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    if (event.target.closest("[data-random]")) {
      event.preventDefault();
      spinRandom();
      return;
    }
    if (spinning) return;
    const target = event.target.closest("[data-family]");
    if (!target) return;
    event.preventDefault();
    const familyId = target.getAttribute("data-family") || "";
    const next = familyId && familyId === selectedFamily ? "" : familyId;
    if (!next) clearSpinStyles();
    setWheelFamily(next);
  });
}

function wireWheelDismiss() {
  document.addEventListener("click", (event) => {
    if (!selectedFamily && !spinning) return;
    if (isKeepFilterTarget(event.target)) return;
    clearWheelFilter();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    if (!selectedFamily && !spinning) return;
    clearWheelFilter();
  });
}

if (search) search.addEventListener("input", renderTopics);
wireWheel();
wireWheelDismiss();
document.querySelectorAll(".pin-toggle--topic").forEach(wireTopicPinButton);
renderTopics();
refreshPinnedTopics();

window.addEventListener("pageshow", (event) => {
  if (event.persisted) refreshPinnedTopics();
});

window.addEventListener("patch-notes:pins-synced", (event) => {
  if (Array.isArray(event.detail?.slugs)) applyPinnedSlugs(event.detail.slugs);
});
