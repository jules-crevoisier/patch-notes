const search = document.querySelector("#topic-search");
const topics = [...document.querySelectorAll(".topic-card")];
const statusEl = document.querySelector("#status");

function normalize(value = "") {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function renderTopics() {
  const query = normalize(search.value.trim());
  let visible = 0;

  for (const topic of topics) {
    const text = normalize(`${topic.textContent} ${topic.dataset.search || ""}`);
    const match = !query || text.includes(query);
    topic.hidden = !match;
    if (match) visible += 1;
  }

  statusEl.textContent = `${visible} sujet${visible > 1 ? "s" : ""}`;
}

search.addEventListener("input", renderTopics);
renderTopics();
