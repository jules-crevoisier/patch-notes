/**
 * Bandeau cookies RGPD — choix mémorisé localement (exempt CNIL : preuve du consentement).
 * Les cookies de préférence (épingle, identifiant visiteur) ne sont déposés qu'après acceptation.
 */
(function initCookieConsent(global) {
  const CONSENT_KEY = "patch-notes.cookieConsent.v1";
  const CONSENT_EVENT = "patch-notes:cookie-consent";

  function readChoice() {
    try {
      const value = global.localStorage.getItem(CONSENT_KEY);
      return value === "accepted" || value === "refused" ? value : "";
    } catch {
      return "";
    }
  }

  function writeChoice(value) {
    try {
      global.localStorage.setItem(CONSENT_KEY, value);
    } catch {
      // Si localStorage est indisponible, on ne dépose pas de cookies de préférence.
    }
  }

  function hasPreferenceConsent() {
    return readChoice() === "accepted";
  }

  function notifyChoice(status) {
    global.dispatchEvent(new CustomEvent(CONSENT_EVENT, { detail: { status } }));
  }

  function removeBanner() {
    const node = global.document.getElementById("cookie-consent");
    if (node) node.remove();
  }

  function applyChoice(status) {
    writeChoice(status);
    removeBanner();
    notifyChoice(status);
  }

  function renderBanner() {
    if (global.document.getElementById("cookie-consent")) return;

    const banner = global.document.createElement("aside");
    banner.id = "cookie-consent";
    banner.className = "cookie-consent";
    banner.setAttribute("role", "dialog");
    banner.setAttribute("aria-labelledby", "cookie-consent-title");
    banner.setAttribute("aria-describedby", "cookie-consent-desc");
    banner.innerHTML = `
      <div class="cookie-consent__inner">
        <p id="cookie-consent-title" class="cookie-consent__title">Cookies et stockage local</p>
        <p id="cookie-consent-desc" class="cookie-consent__text">
          Nous n'utilisons pas de cookies publicitaires. En acceptant, vous autorisez un cookie technique
          (<code>pn_vid</code>) et le stockage local pour mémoriser vos sujets épinglés.
          <a href="/confidentialite">En savoir plus</a>
        </p>
        <div class="cookie-consent__actions">
          <button type="button" class="cookie-consent__btn cookie-consent__btn--ghost" data-choice="refused">Refuser</button>
          <button type="button" class="cookie-consent__btn cookie-consent__btn--primary" data-choice="accepted">Accepter</button>
        </div>
      </div>
    `;

    banner.addEventListener("click", (event) => {
      const button = event.target.closest("[data-choice]");
      if (!button) return;
      applyChoice(button.dataset.choice);
    });

    global.document.body.append(banner);
  }

  function openBanner() {
    renderBanner();
  }

  function boot() {
    const choice = readChoice();
    if (!choice) renderBanner();
    else notifyChoice(choice);
  }

  global.PatchNotesCookieConsent = {
    hasPreferenceConsent,
    readChoice,
    openBanner,
  };

  if (global.document.readyState === "loading") {
    global.document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})(window);
