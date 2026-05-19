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
  const activeBadge    = document.getElementById("filter-active-badge");
  const cards          = Array.from(document.querySelectorAll(".event-card"));

  // ── Populate location dropdown dynamically from card data ─────────────────
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

  // Pre-select location from ?ort= URL param
  if (locationFilter) {
    const _ortParam = new URLSearchParams(window.location.search).get('ort');
    if (_ortParam) {
      const _decoded = _ortParam.replace(/[+]/g, ' ');
      const _match = Array.from(locationFilter.options).find(o => o.value === _decoded);
      if (_match) locationFilter.value = _match.value;
    }
  }

  // ── Count active filters (excluding default date-from=today) ──────────────
  function countActiveFilters() {
    let count = 0;
    if (tagFilter      && tagFilter.value)                                count++;
    if (locationFilter && locationFilter.value)                           count++;
    if (ageFilter      && ageFilter.value !== "0-99")                     count++;
    if (dateFrom       && dateFrom.value && dateFrom.value !== todayStr)  count++;
    if (dateTo         && dateTo.value)                                   count++;
    return count;
  }

  // ── Update the active badge on the toggle button ──────────────────────────
  function updateBadge() {
    if (!activeBadge) return;
    const n = countActiveFilters();
    if (n > 0) {
      activeBadge.textContent = n;
      activeBadge.removeAttribute("hidden");
    } else {
      activeBadge.setAttribute("hidden", "");
    }
  }

  // ── Main filter function ──────────────────────────────────────────────────
  function applyFilters() {
    const tag      = tagFilter      ? tagFilter.value      : "";
    const location = locationFilter ? locationFilter.value : "";
    const fromVal  = dateFrom       ? dateFrom.value       : "";
    const toVal    = dateTo         ? dateTo.value         : "";

    let ageMin = 0, ageMax = 99;
    if (ageFilter && ageFilter.value && ageFilter.value !== "0-99") {
      const parts = ageFilter.value.split("-").map(Number);
      ageMin = parts[0];
      ageMax = parts[1];
    }

    let visible = 0;

    cards.forEach(card => {
      // 1. Date filter
      const cardDate     = card.dataset.date || "";
      const cardWeekdays = (card.dataset.weekdays || "").split(",").filter(Boolean);
      const isStanding   = !cardDate;

      if (!isStanding && (fromVal || toVal)) {
        if (fromVal && cardDate < fromVal) { card.style.display = "none"; return; }
        if (toVal   && cardDate > toVal)   { card.style.display = "none"; return; }
        if (cardWeekdays.length > 0) {
          const jsDay = String(new Date(cardDate + "T12:00:00").getDay());
          if (!cardWeekdays.includes(jsDay)) { card.style.display = "none"; return; }
        }
      }

      // 2. Location filter
      if (location) {
        const cardLoc = (card.dataset.location || "").trim();
        if (!cardLoc.includes(location)) { card.style.display = "none"; return; }
      }

      // 3. Category / tag filter
      if (tag) {
        const cardTags = (card.dataset.tags || "").split(",").filter(Boolean);
        if (!cardTags.includes(tag)) { card.style.display = "none"; return; }
      }

      // 4. Age filter
      if (ageFilter && ageFilter.value !== "0-99" && card.dataset.ageMin !== "") {
        const cardAgeMin = parseInt(card.dataset.ageMin) || 0;
        const cardAgeMax = card.dataset.ageMax !== "" ? parseInt(card.dataset.ageMax) : 99;
        if (cardAgeMin > ageMax || cardAgeMax < ageMin) { card.style.display = "none"; return; }
      }

      card.style.display = "";
      visible++;
    });

    if (countEl) {
      countEl.textContent = `${visible} von ${cards.length} Angeboten`;
    }

    if (emptyState) {
      if (visible === 0 && cards.length > 0) {
        emptyState.removeAttribute("hidden");
      } else {
        emptyState.setAttribute("hidden", "");
      }
    }

    updateBadge();
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
  if (emptyResetBtn) emptyResetBtn.addEventListener("click", resetFilters);

  applyFilters();
})();

// ── Filter bar toggle — collapsed by default on all screen sizes ─────────────
(function () {
  const btn = document.getElementById('filter-toggle-btn');
  const bar = document.getElementById('filter-bar');
  if (!btn || !bar) return;

  // bar starts [hidden] via HTML attribute — toggle removes/adds it
  btn.addEventListener('click', () => {
    const isOpen = bar.hasAttribute('hidden');
    if (isOpen) {
      bar.removeAttribute('hidden');
      btn.setAttribute('aria-expanded', 'true');
    } else {
      bar.setAttribute('hidden', '');
      btn.setAttribute('aria-expanded', 'false');
    }
  });
})();

// ── ?source= URL param filter ─────────────────────────────────────────────────
// Applied on page load. Enables deep-links from /erleben/ venue CTAs.
// Example: /ludwigsburg/?source=stabi

// ── Plausible custom event tracking ──────────────────────────────────────────
// Goals tracked: Age Filter Used · Source Link Clicked · Empty State Exit
// Requires: script.outbound-links.js already loaded in Base.astro (it is).
// window.plausible() is injected by that script. All calls are silent no-ops
// if Plausible hasn't loaded (adblocker, dev environment, etc).
(function () {
  function track(goal, props) {
    try {
      if (typeof window.plausible === 'function') {
        window.plausible(goal, { props: props || {} });
      }
    } catch (e) {}
  }

  // 1. Age filter — fire on every non-default age selection
  var ageEl = document.getElementById('age-filter');
  if (ageEl) {
    ageEl.addEventListener('change', function () {
      var val = ageEl.value;
      if (val && val !== '0-99') {
        track('Age Filter Used', { range: val });
      }
    });
  }

  // 2. Source link clicks — delegated listener on document
  // data-source on parent .event-card provides the scraper source ID
  document.addEventListener('click', function (e) {
    var el = e.target.closest('.source-link, .source-attribution a');
    if (!el) return;
    var card = el.closest('.event-card');
    var source = (card && card.dataset.source) ? card.dataset.source : 'unknown';
    track('Source Link Clicked', { source: source });
  });

  // 3. Empty state exit — user clicks a CTA link out of the no-results block
  document.addEventListener('click', function (e) {
    var cta = e.target.closest('.empty-cta');
    if (!cta) return;
    track('Empty State Exit', {});
  });
})();
