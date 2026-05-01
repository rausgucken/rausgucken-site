// public/scripts/app.js — rausgucken.de
// Filter hierarchy per design spec Part III §1: Date > Location > Category > Age

(function () {
  const tagFilter      = document.getElementById("tag-filter");
  const ageFilter      = document.getElementById("age-filter");
  const locationFilter = document.getElementById("location-filter");
  const dateFrom       = document.getElementById("date-from");
  const dateTo         = document.getElementById("date-to");
  const resetBtn       = document.getElementById("filter-reset");
  const emptyResetBtn  = document.getElementById("empty-reset-btn");
  const countEl        = document.getElementById("filter-count");
  const emptyState     = document.getElementById("empty-state");
  const cards          = Array.from(document.querySelectorAll(".event-card"));

  // ── Populate location dropdown dynamically from card data ─────────────────
  // Keeps the dropdown always in sync with whatever is in events-current.json
  // without needing to manually maintain a hardcoded list.
  if (locationFilter) {
    const locations = [...new Set(
      cards
        .map(c => (c.dataset.location || "").trim())
        .filter(Boolean)
    )].sort();

    locations.forEach(loc => {
      const opt = document.createElement("option");
      opt.value = loc;
      opt.textContent = loc;
      locationFilter.appendChild(opt);
    });
  }

  // ── Default: show from today ──────────────────────────────────────────────
  const todayStr = new Date().toISOString().slice(0, 10);
  if (dateFrom && !dateFrom.value) dateFrom.value = todayStr;

  // ── Main filter function ──────────────────────────────────────────────────
  function applyFilters() {
    const tag      = tagFilter      ? tagFilter.value      : "";
    const location = locationFilter ? locationFilter.value : "";
    const fromVal  = dateFrom       ? dateFrom.value       : "";
    const toVal    = dateTo         ? dateTo.value         : "";

    // Age filter: parse "min-max" range string
    let ageMin = 0, ageMax = 99;
    if (ageFilter && ageFilter.value && ageFilter.value !== "0-99") {
      const parts = ageFilter.value.split("-").map(Number);
      ageMin = parts[0];
      ageMax = parts[1];
    }

    let visible = 0;

    cards.forEach(card => {

      // ── 1. Date filter ────────────────────────────────────────────────────
      // Standing tours (date="") always pass — they have no fixed date.
      const cardDate     = card.dataset.date || "";
      const cardWeekdays = (card.dataset.weekdays || "").split(",").filter(Boolean);
      const isStanding   = !cardDate;

      if (!isStanding && (fromVal || toVal)) {
        if (fromVal && cardDate < fromVal) { card.style.display = "none"; return; }
        if (toVal   && cardDate > toVal)   { card.style.display = "none"; return; }

        // Weekday check: only show if the event's date falls on an operating weekday
        // JS getDay(): 0=Sun,1=Mon,2=Tue,3=Wed,4=Thu,5=Fri,6=Sat
        if (cardWeekdays.length > 0) {
          const jsDay = String(new Date(cardDate + "T12:00:00").getDay());
          if (!cardWeekdays.includes(jsDay)) {
            card.style.display = "none";
            return;
          }
        }
      }

      // ── 2. Location filter ────────────────────────────────────────────────
      if (location) {
        const cardLoc = (card.dataset.location || "").trim();
        if (!cardLoc.includes(location)) {
          card.style.display = "none";
          return;
        }
      }

      // ── 3. Category / tag filter ──────────────────────────────────────────
      if (tag) {
        const cardTags = (card.dataset.tags || "").split(",").filter(Boolean);
        if (!cardTags.includes(tag)) {
          card.style.display = "none";
          return;
        }
      }

      // ── 4. Age filter — only applied when card has explicit age data ───────
      if (ageFilter && ageFilter.value !== "0-99" && card.dataset.ageMin !== "") {
        const cardAgeMin = parseInt(card.dataset.ageMin) || 0;
        const cardAgeMax = card.dataset.ageMax !== "" ? parseInt(card.dataset.ageMax) : 99;
        if (cardAgeMin > ageMax || cardAgeMax < ageMin) {
          card.style.display = "none";
          return;
        }
      }

      card.style.display = "";
      visible++;
    });

    // ── Update count label ────────────────────────────────────────────────────
    if (countEl) {
      countEl.textContent = `${visible} von ${cards.length} Angeboten`;
    }

    // ── Empty state — design spec Part III §1 ─────────────────────────────────
    // Show when filters are active but return zero results.
    // Hide when results exist or no filters are set at all.
    if (emptyState) {
      const filtersActive = tag || location ||
        (ageFilter && ageFilter.value !== "0-99") ||
        (fromVal && fromVal !== todayStr) || toVal;

      if (visible === 0 && (cards.length > 0)) {
        emptyState.removeAttribute("hidden");
      } else {
        emptyState.setAttribute("hidden", "");
      }
    }
  }

  // ── Reset ─────────────────────────────────────────────────────────────────
  function resetFilters() {
    if (tagFilter)      tagFilter.value      = "";
    if (ageFilter)      ageFilter.value      = "0-99";
    if (locationFilter) locationFilter.value = "";
    if (dateFrom)       dateFrom.value       = todayStr;
    if (dateTo)         dateTo.value         = "";
    applyFilters();
  }

  // ── Event listeners ───────────────────────────────────────────────────────
  [tagFilter, ageFilter, locationFilter, dateFrom, dateTo].forEach(el => {
    if (el) el.addEventListener("change", applyFilters);
  });
  if (resetBtn)      resetBtn.addEventListener("click", resetFilters);
  // Empty state reset button wired to same function
  if (emptyResetBtn) emptyResetBtn.addEventListener("click", resetFilters);

  // Initial render
  applyFilters();
})();

// ── Mobile filter toggle ────────────────────────────────────────────────────
(function () {
  const btn = document.getElementById('filter-toggle-btn');
  const bar = document.getElementById('filter-bar');
  if (!btn || !bar) return;

  // On mobile, start collapsed. On desktop, always open (CSS handles display).
  function isMobile() { return window.innerWidth <= 700; }

  function syncState() {
    if (!isMobile()) {
      bar.classList.remove('is-open');
      bar.style.display = '';      // let CSS control desktop
      btn.setAttribute('aria-expanded', 'false');
    }
  }

  btn.addEventListener('click', () => {
    const open = bar.classList.toggle('is-open');
    btn.setAttribute('aria-expanded', String(open));
  });

  window.addEventListener('resize', syncState);
  syncState();
})();
