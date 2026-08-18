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

function familyMap() {
  if (!wheel?.dataset.families) return {};
  try {
    return JSON.parse(wheel.dataset.families);
  } catch {
    return {};
  }
}

function activeFamilySlugs() {
  if (!selectedFamily) return null;
  const slugs = familyMap()[selectedFamily];
  return Array.isArray(slugs) ? slugs : null;
}

function setWheelFamily(familyId) {
  selectedFamily = familyId || "";
  if (wheel) wheel.classList.toggle("is-filtered", Boolean(selectedFamily));
  document.querySelectorAll(".topic-wheel [data-family]").forEach((node) => {
    const isActive = selectedFamily ? node.getAttribute("data-family") === selectedFamily : node.getAttribute("data-family") === "";
    node.classList.toggle("is-active", Boolean(selectedFamily) && node.getAttribute("data-family") === selectedFamily);
    if (node.getAttribute("role") === "button") {
      node.setAttribute("aria-pressed", isActive ? "true" : "false");
    }
  });
  renderTopics();
}

function wireWheel() {
  if (!wheel) return;
  wheel.addEventListener("click", (event) => {
    const target = event.target.closest("[data-family]");
    if (!target || !wheel.contains(target)) return;
    const familyId = target.getAttribute("data-family") || "";
    setWheelFamily(familyId && familyId === selectedFamily ? "" : familyId);
  });
  wheel.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    const target = event.target.closest("[data-family]");
    if (!target) return;
    event.preventDefault();
    const familyId = target.getAttribute("data-family") || "";
    setWheelFamily(familyId && familyId === selectedFamily ? "" : familyId);
  });
}

if (search) search.addEventListener("input", renderTopics);
wireWheel();
document.querySelectorAll(".pin-toggle--topic").forEach(wireTopicPinButton);
renderTopics();
refreshPinnedTopics();

window.addEventListener("pageshow", (event) => {
  if (event.persisted) refreshPinnedTopics();
});

window.addEventListener("patch-notes:pins-synced", (event) => {
  if (Array.isArray(event.detail?.slugs)) applyPinnedSlugs(event.detail.slugs);
});
