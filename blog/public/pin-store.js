/**
 * Client-side pin persistence for homepage topic favorites (localStorage only).
 */
(function initPinStore(global) {
  const VISITOR_KEY = "patch-notes.visitorId";
  const PINS_KEY = "patch-notes.topicPins.v1";

  function createVisitorId() {
    if (global.crypto?.randomUUID) return global.crypto.randomUUID().replace(/-/g, "");
    return `${Date.now().toString(16)}${Math.random().toString(16).slice(2)}`.slice(0, 32);
  }

  function getVisitorId() {
    let id = "";
    try {
      id = global.localStorage.getItem(VISITOR_KEY) || "";
    } catch {
      // localStorage blocked
    }
    if (!id) id = createVisitorId();
    try {
      global.localStorage.setItem(VISITOR_KEY, id);
    } catch {
      // ignore quota / privacy mode
    }
    return id;
  }

  function readLocalPins() {
    try {
      const raw = global.localStorage.getItem(PINS_KEY);
      const parsed = JSON.parse(raw || "[]");
      return Array.isArray(parsed) ? parsed.filter(Boolean) : [];
    } catch {
      return [];
    }
  }

  function writeLocalPins(slugs) {
    const unique = [...new Set(slugs.filter(Boolean))];
    try {
      global.localStorage.setItem(PINS_KEY, JSON.stringify(unique));
    } catch {
      // ignore quota / privacy mode
    }
    return unique;
  }

  function isPinnedLocally(slug) {
    return readLocalPins().includes(slug);
  }

  function setLocalPin(slug, pinned) {
    const next = new Set(readLocalPins());
    if (pinned) next.add(slug);
    else next.delete(slug);
    return writeLocalPins([...next]);
  }

  function pinHeaders(extra = {}) {
    const headers = { ...extra };
    const visitorId = getVisitorId();
    if (visitorId) headers["X-Visitor-Id"] = visitorId;
    return headers;
  }

  async function fetchServerPins() {
    const response = await fetch("/api/topics/pinned", {
      headers: pinHeaders(),
      cache: "no-store",
    });
    if (!response.ok) throw new Error("pinned topics fetch failed");
    const body = await response.json();
    return Array.isArray(body.slugs) ? body.slugs : [];
  }

  async function syncPins() {
    getVisitorId();
    const local = readLocalPins();
    try {
      const remote = await fetchServerPins();
      return writeLocalPins([...new Set([...remote, ...local])]);
    } catch {
      return local;
    }
  }

  global.PatchNotesPinStore = {
    getVisitorId,
    readLocalPins,
    writeLocalPins,
    isPinnedLocally,
    setLocalPin,
    pinHeaders,
    fetchServerPins,
    syncPins,
  };
})(window);
