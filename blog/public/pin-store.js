/**
 * Client-side pin persistence for homepage topic favorites.
 *
 * Layers (most reliable first for UI):
 *   1. localStorage — survives back/forward and bfcache instantly
 *   2. visitor cookie + X-Visitor-Id — stable server identity (not IP-only)
 *   3. server API — source of truth when reachable
 */
(function initPinStore(global) {
  const VISITOR_KEY = "patch-notes.visitorId";
  const PINS_KEY = "patch-notes.topicPins.v1";
  const COOKIE_NAME = "pn_vid";

  function createVisitorId() {
    if (global.crypto?.randomUUID) return global.crypto.randomUUID().replace(/-/g, "");
    return `${Date.now().toString(16)}${Math.random().toString(16).slice(2)}`.slice(0, 32);
  }

  function readCookie(name) {
    const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
    return match ? decodeURIComponent(match[1]) : "";
  }

  function writeCookie(name, value) {
    document.cookie = `${name}=${encodeURIComponent(value)}; Max-Age=31536000; Path=/; SameSite=Lax`;
  }

  function getVisitorId() {
    let id = "";
    try {
      id = global.localStorage.getItem(VISITOR_KEY) || readCookie(COOKIE_NAME);
    } catch {
      id = readCookie(COOKIE_NAME);
    }
    if (!id) id = createVisitorId();
    try {
      global.localStorage.setItem(VISITOR_KEY, id);
    } catch {
      // localStorage blocked — cookie only
    }
    writeCookie(COOKIE_NAME, id);
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
    return {
      ...extra,
      "X-Visitor-Id": getVisitorId(),
    };
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
      const merged = writeLocalPins([...new Set([...remote, ...local])]);
      return merged;
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
