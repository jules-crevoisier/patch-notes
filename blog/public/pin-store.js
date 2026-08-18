/**
 * Client-side pin persistence for homepage topic favorites.
 * Ne s'active qu'après consentement cookies (cf. cookie-consent.js).
 */
(function initPinStore(global) {
  const VISITOR_KEY = "patch-notes.visitorId";
  const PINS_KEY = "patch-notes.topicPins.v1";
  const COOKIE_NAME = "pn_vid";

  function hasPreferenceConsent() {
    return Boolean(global.PatchNotesCookieConsent?.hasPreferenceConsent?.());
  }

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

  function clearPreferenceStorage() {
    try {
      global.localStorage.removeItem(VISITOR_KEY);
      global.localStorage.removeItem(PINS_KEY);
    } catch {
      // ignore
    }
    document.cookie = `${COOKIE_NAME}=; Max-Age=0; Path=/; SameSite=Lax`;
  }

  function getVisitorId() {
    if (!hasPreferenceConsent()) return "";
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
    if (!hasPreferenceConsent()) return [];
    try {
      const raw = global.localStorage.getItem(PINS_KEY);
      const parsed = JSON.parse(raw || "[]");
      return Array.isArray(parsed) ? parsed.filter(Boolean) : [];
    } catch {
      return [];
    }
  }

  function writeLocalPins(slugs) {
    if (!hasPreferenceConsent()) return [];
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
    if (!hasPreferenceConsent()) return [];
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
    if (!hasPreferenceConsent()) return [];
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

  global.addEventListener("patch-notes:cookie-consent", (event) => {
    if (event.detail?.status === "refused") {
      clearPreferenceStorage();
      return;
    }
    if (event.detail?.status === "accepted") {
      syncPins().then((slugs) => {
        global.dispatchEvent(new CustomEvent("patch-notes:pins-synced", { detail: { slugs } }));
      });
    }
  });

  global.PatchNotesPinStore = {
    hasPreferenceConsent,
    getVisitorId,
    readLocalPins,
    writeLocalPins,
    isPinnedLocally,
    setLocalPin,
    pinHeaders,
    fetchServerPins,
    syncPins,
    clearPreferenceStorage,
  };
})(window);
