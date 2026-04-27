// public/scripts/app.js
(function () {
  const tagFilter      = document.getElementById("tag-filter");
  const ageFilter      = document.getElementById("age-filter");
  const locationFilter = document.getElementById("location-filter");
  const dateFrom       = document.getElementById("date-from");
  const dateTo         = document.getElementById("date-to");
  const resetBtn       = document.getElementById("filter-reset");
  const countEl        = document.getElementById("filter-count");
  const cards          = Array.from(document.querySelectorAll(".event-card"));

  // ── Populate location dropdown from card data ────────────────────────────
  if (locationFilter) {
    const locs = new Set();
    cards.forEach(c => { if (c.dataset.location) locs.add(c.dataset.location); });
    Array.from(locs).sort().forEach(loc => {
      const opt = document.createElement("option");
      opt.value = loc;
      opt.textContent = loc.replace("Residenzschloss Ludwigsburg", "Residenzschloss Ludwigsburg");
      locationFilter.appendChild(opt);
    });
  }

  // ── Default date-from = today ────────────────────────────────────────────
  const todayISO = new Date().toISOString().slice(0, 10);
  if (dateFrom && !dateFrom.value) {
    dateFrom.value = todayISO;
    dateFrom.min   = todayISO;
  }

  // ── Filter logic ─────────────────────────────────────────────────────────
  function applyFilters() {
    const tag      = tagFilter      ? tagFilter.value      : "";
    const location = locationFilter ? locationFilter.value : "";
    const fromVal  = dateFrom       ? dateFrom.value       : "";
    const toVal    = dateTo         ? dateTo.value         : "";
    const [ageMin, ageMax] = ageFilter && ageFilter.value
      ? ageFilter.value.split("-").map(Number) : [0, 99];

    let visible = 0;

    cards.forEach(card => {
      const cardTags   = (card.dataset.tags || "").split(",").filter(Boolean);
      const cardAgeMin = card.dataset.ageMin !== "" ? parseInt(card.dataset.ageMin) : 0;
      const cardAgeMax = card.dataset.ageMax !== "" ? parseInt(card.dataset.ageMax) : 99;
      const cardDate   = card.dataset.date   || "";
      const cardLoc    = card.dataset.location || "";

      // Tag
      if (tag && !cardTags.includes(tag)) { hide(card); return; }

      // Age — only when card has age data
      if (ageFilter && ageFilter.value !== "0-99" && card.dataset.ageMin !== "") {
        if (!(cardAgeMin <= ageMax && cardAgeMax >= ageMin)) { hide(card); return; }
      }

      // Location
      if (location && cardLoc !== location) { hide(card); return; }

      // Date range — standing tours (no date) always pass
      if (cardDate) {
        if (fromVal && cardDate < fromVal) { hide(card); return; }
        if (toVal   && cardDate > toVal)   { hide(card); return; }
      }

      show(card);
      visible++;
    });

    updateCount(visible);
  }

  function hide(card) { card.style.display = "none"; }
  function show(card) { card.style.display = ""; }

  function updateCount(visible) {
    if (!countEl) return;
    const isEn = document.getElementById("html-root")?.classList.contains("lang-en");
    countEl.textContent = isEn
      ? `${visible} of ${cards.length} events`
      : `${visible} von ${cards.length} Veranstaltungen`;
  }

  // ── Reset ────────────────────────────────────────────────────────────────
  function resetFilters() {
    if (tagFilter)      tagFilter.value      = "";
    if (ageFilter)      ageFilter.value      = "0-99";
    if (locationFilter) locationFilter.value = "";
    if (dateTo)         dateTo.value         = "";
    if (dateFrom)       dateFrom.value       = todayISO;
    applyFilters();
  }

  // ── Listeners ────────────────────────────────────────────────────────────
  [tagFilter, ageFilter, locationFilter, dateFrom, dateTo].forEach(el => {
    if (el) el.addEventListener("change", applyFilters);
  });
  if (resetBtn) resetBtn.addEventListener("click", resetFilters);

  // Re-count when language switches
  document.addEventListener("langchange", () => setTimeout(applyFilters, 30));

  // Run on load
  applyFilters();
})();
