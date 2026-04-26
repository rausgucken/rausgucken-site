// src/scripts/app.js
// Client-side filtering for the Ludwigsburg event grid.
// Reads data-tags, data-age-min, data-age-max, data-date from each .event-card.

(function () {
  const tagFilter   = document.getElementById("tag-filter");
  const ageFilter   = document.getElementById("age-filter");
  const dateFilter  = document.getElementById("date-filter");
  const resetBtn    = document.getElementById("filter-reset");
  const countEl     = document.getElementById("filter-count");
  const cards       = Array.from(document.querySelectorAll(".event-card"));

  function isoToDate(iso) {
    if (!iso) return null;
    return new Date(iso + "T00:00:00");
  }

  function applyFilters() {
    const tag = tagFilter.value;

    const [ageMin, ageMax] = ageFilter.value
      ? ageFilter.value.split("-").map(Number)
      : [0, 99];

    const dateVal = dateFilter.value;
    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);

    let weekEnd = new Date(now);
    weekEnd.setDate(weekEnd.getDate() + 7);
    const weekEndStr = weekEnd.toISOString().slice(0, 10);

    const monthEndStr = new Date(now.getFullYear(), now.getMonth() + 1, 0)
      .toISOString().slice(0, 10);

    let visible = 0;

    cards.forEach(card => {
      const cardTags    = (card.dataset.tags || "").split(",").filter(Boolean);
      const cardAgeMin  = card.dataset.ageMin !== "" ? parseInt(card.dataset.ageMin) : 0;
      const cardAgeMax  = card.dataset.ageMax !== "" ? parseInt(card.dataset.ageMax) : 99;
      const cardDate    = card.dataset.date || "";  // YYYY-MM-DD or "" for standing

      // Tag filter
      if (tag && !cardTags.includes(tag)) {
        card.style.display = "none";
        return;
      }

      // Age filter — only apply if card has age data
      if (ageFilter.value !== "0-99" && card.dataset.ageMin !== "") {
        const overlap = cardAgeMin <= ageMax && cardAgeMax >= ageMin;
        if (!overlap) {
          card.style.display = "none";
          return;
        }
      }

      // Date filter — standing tours always pass
      if (dateVal && cardDate) {
        if (dateVal === "today"  && cardDate !== todayStr)     { card.style.display = "none"; return; }
        if (dateVal === "week"   && cardDate > weekEndStr)     { card.style.display = "none"; return; }
        if (dateVal === "month"  && cardDate > monthEndStr)    { card.style.display = "none"; return; }
      }

      card.style.display = "";
      visible++;
    });

    countEl.textContent = `${visible} von ${cards.length} Veranstaltungen`;
  }

  function resetFilters() {
    tagFilter.value  = "";
    ageFilter.value  = "0-99";
    dateFilter.value = "";
    applyFilters();
  }

  tagFilter.addEventListener("change", applyFilters);
  ageFilter.addEventListener("change", applyFilters);
  dateFilter.addEventListener("change", applyFilters);
  resetBtn.addEventListener("click", resetFilters);

  // Initial count
  applyFilters();
})();
