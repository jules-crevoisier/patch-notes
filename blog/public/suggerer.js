const form = document.querySelector("#suggest-form");
const statusEl = document.querySelector("#suggest-status");
const listEl = document.querySelector("#suggest-list");
const submitButton = form.querySelector(".suggest-submit");

function setStatus(message, state) {
  statusEl.textContent = message;
  if (state) {
    statusEl.dataset.state = state;
  } else {
    delete statusEl.dataset.state;
  }
}

function formatDate(iso) {
  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium" }).format(new Date(iso));
}

function buildSuggestionRow(suggestion) {
  const likedByMe = Boolean(suggestion.likedByMe);
  const action = likedByMe ? "Retirer votre j'aime" : "J'aime cette proposition";
  const article = document.createElement("article");
  article.className = "suggest-item";
  article.dataset.suggestionId = suggestion.id;
  article.innerHTML = `
    <div class="suggest-item-body">
      <p class="suggest-item-text"></p>
      <p class="suggest-item-meta"></p>
    </div>
    <button type="button" class="suggest-like" data-suggestion-id="" aria-pressed="${likedByMe ? "true" : "false"}" aria-label="${action}" title="${action}">
      <span class="suggest-like-icon" aria-hidden="true">♥</span>
      <span class="suggest-like-count">${Number(suggestion.likeCount) || 0}</span>
    </button>`;
  article.querySelector(".suggest-item-text").textContent = suggestion.text;
  article.querySelector(".suggest-item-meta").textContent = formatDate(suggestion.createdAt || Date.now());
  const button = article.querySelector(".suggest-like");
  button.dataset.suggestionId = suggestion.id;
  wireLikeButton(button);
  return article;
}

function wireLikeButton(button) {
  button.addEventListener("click", async () => {
    if (button.disabled) return;
    const suggestionId = button.dataset.suggestionId;
    if (!suggestionId) return;

    button.disabled = true;
    try {
      const response = await fetch(`/api/suggestions/${encodeURIComponent(suggestionId)}/like`, {
        method: "POST",
      });
      if (!response.ok) throw new Error("like failed");
      const data = await response.json();
      const liked = Boolean(data.liked);
      const action = liked ? "Retirer votre j'aime" : "J'aime cette proposition";
      button.setAttribute("aria-pressed", liked ? "true" : "false");
      button.setAttribute("aria-label", action);
      button.title = action;
      button.querySelector(".suggest-like-count").textContent = String(data.likeCount ?? 0);
      reorderSuggestions();
    } catch {
      setStatus("Impossible d'enregistrer votre j'aime pour le moment.", "error");
    } finally {
      button.disabled = false;
    }
  });
}

function reorderSuggestions() {
  const items = [...listEl.querySelectorAll(".suggest-item")];
  if (items.length < 2) return;
  items.sort((a, b) => {
    const likesA = Number(a.querySelector(".suggest-like-count")?.textContent || 0);
    const likesB = Number(b.querySelector(".suggest-like-count")?.textContent || 0);
    return likesB - likesA;
  });
  for (const item of items) listEl.appendChild(item);
}

function prependSuggestion(suggestion) {
  const empty = listEl.querySelector(".empty");
  if (empty) empty.remove();
  listEl.prepend(buildSuggestionRow({ ...suggestion, likedByMe: false, likeCount: 0 }));
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (submitButton.disabled) return;

  const text = form.elements.text.value;
  const hp = form.elements.hp.value;

  submitButton.disabled = true;
  setStatus("Envoi...", "pending");

  try {
    const response = await fetch("/api/suggestions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text, hp }),
    });

    if (response.status === 429) {
      setStatus("Trop de suggestions envoyées récemment. Réessayez plus tard.", "error");
      return;
    }

    if (response.status === 400) {
      const data = await response.json().catch(() => ({}));
      setStatus(data.error || "Merci de décrire votre suggestion.", "error");
      return;
    }

    if (!response.ok) throw new Error("suggestion request failed");

    const data = await response.json();
    setStatus("Merci, on regarde ça !", "success");
    form.reset();
    if (data.suggestion) prependSuggestion(data.suggestion);
  } catch {
    setStatus("Impossible d'envoyer la suggestion pour le moment.", "error");
  } finally {
    submitButton.disabled = false;
  }
});

document.querySelectorAll(".suggest-like").forEach(wireLikeButton);
