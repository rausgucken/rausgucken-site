/**
 * public/scripts/karte.js
 * rausgucken.de — Homepage interactive Landkreis map
 *
 * Responsibilities:
 *  1. Fetch distances.json + all covered city events-current.json in parallel
 *  2. Build slider — filter municipalities by distance from Ludwigsburg
 *  3. Update SVG map classes based on slider value
 *  4. Render city blocks (top 3 events each) sorted by distance
 *  5. Update counter "X Städte · Y Veranstaltungen im Umkreis"
 *  6. Tooltip on SVG hover
 */

import { renderEventCard, injectEventCardStyles } from "/scripts/renderEventCard.js";

const DISTANCES_URL = "/data/landkreis-ludwigsburg/distances.json";
const SLIDER_DEFAULT = 30;

// ── Boot ───────────────────────────────────────────────────────────────────────

document.addEventListener("DOMContentLoaded", () => {
  injectEventCardStyles();
  init();
});

async function init() {
  // 1. Load distances manifest
  let distData;
  try {
    const r = await fetch(DISTANCES_URL);
    distData = await r.json();
  } catch (e) {
    console.error("[karte] Failed to load distances.json", e);
    showError();
    return;
  }

  const municipalities = distData.municipalities;
  const covered = municipalities.filter(m => m.covered);

  // 2. Load events for all covered cities in parallel
  const eventsByCity = {};
  await Promise.all(
    covered.map(async m => {
      try {
        const r = await fetch(`/data/${m.id}/events-current.json`);
        const events = await r.json();
        // Sort by date_start ascending, nulls last
        events.sort((a, b) => {
          if (!a.date_start) return 1;
          if (!b.date_start) return -1;
          return a.date_start.localeCompare(b.date_start);
        });
        eventsByCity[m.id] = events;
      } catch (e) {
        console.warn(`[karte] Failed to load events for ${m.id}`, e);
        eventsByCity[m.id] = [];
      }
    })
  );

  // 3. Wire up slider
  const slider = document.getElementById("radius-slider");
  const sliderLabel = document.getElementById("radius-label");

  function getRadius() {
    return parseInt(slider.value, 10);
  }

  function update() {
    const radius = getRadius();
    sliderLabel.textContent = `${radius} km`;
    updateMap(municipalities, radius);
    updateCityBlocks(municipalities, eventsByCity, radius);
    updateCounter(municipalities, eventsByCity, radius);
  }

  slider.value = SLIDER_DEFAULT;
  slider.addEventListener("input", debounce(update, 50));

  // 4. Wire SVG tooltip
  initTooltip(municipalities);

  // 5. Wire SVG city click → scroll to city block
  initMapClicks();

  // 6. Initial render
  hideLoading();
  update();
}

// ── Map ────────────────────────────────────────────────────────────────────────

function updateMap(municipalities, radius) {
  const svg = document.getElementById("landkreis-map");
  if (!svg) return;

  // Build lookup: city_id → distance
  const distMap = {};
  municipalities.forEach(m => { distMap[m.id] = m.distance_km; });

  svg.querySelectorAll(".muni").forEach(path => {
    const cityId = path.dataset.cityId;
    const dist = distMap[cityId] ?? 999;
    const inRange = dist <= radius;

    path.classList.toggle("in-range", inRange);
    path.classList.toggle("out-of-range", !inRange);
  });
}

function initTooltip(municipalities) {
  const svg = document.getElementById("landkreis-map");
  if (!svg) return;

  const tooltip = document.getElementById("map-tooltip");
  if (!tooltip) return;

  // Build lookup: city_id → municipality data
  const dataMap = {};
  municipalities.forEach(m => { dataMap[m.id] = m; });

  svg.addEventListener("mousemove", e => {
    const path = e.target.closest(".muni");
    if (!path) {
      tooltip.hidden = true;
      return;
    }
    const m = dataMap[path.dataset.cityId];
    if (!m) {
      tooltip.hidden = true;
      return;
    }

    const label = m.covered
      ? `<strong>${m.name}</strong><br>${m.event_count} Veranstaltungen`
      : `<strong>${m.name}</strong><br><span style="opacity:0.6">Demnächst</span>`;

    tooltip.innerHTML = label;
    tooltip.hidden = false;

    // Position relative to map container
    const container = svg.closest(".map-container");
    const rect = container.getBoundingClientRect();
    const x = e.clientX - rect.left + 12;
    const y = e.clientY - rect.top + 12;
    tooltip.style.left = `${x}px`;
    tooltip.style.top  = `${y}px`;
  });

  svg.addEventListener("mouseleave", () => {
    tooltip.hidden = true;
  });
}

function initMapClicks() {
  const svg = document.getElementById("landkreis-map");
  if (!svg) return;

  svg.addEventListener("click", e => {
    const path = e.target.closest(".muni");
    if (!path) return;
    const cityId = path.dataset.cityId;
    const block = document.getElementById(`city-block-${cityId}`);
    if (block) {
      block.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  });
}

// ── City blocks ────────────────────────────────────────────────────────────────

function updateCityBlocks(municipalities, eventsByCity, radius) {
  const container = document.getElementById("city-blocks");
  if (!container) return;

  // Only municipalities within radius, sorted by distance
  const inRange = municipalities
    .filter(m => m.distance_km <= radius)
    .sort((a, b) => a.distance_km - b.distance_km);

  container.innerHTML = "";

  if (inRange.length === 0) {
    container.innerHTML = `<p class="karte-empty">Keine Städte im gewählten Umkreis.</p>`;
    return;
  }

  inRange.forEach(m => {
    const block = buildCityBlock(m, eventsByCity[m.id] || []);
    container.appendChild(block);
  });
}

function buildCityBlock(m, events) {
  const section = document.createElement("section");
  section.className = `city-block${m.covered ? " city-block--covered" : " city-block--coming"}`;
  section.id = `city-block-${m.id}`;

  // Header
  const header = document.createElement("div");
  header.className = "city-block-header";
  header.innerHTML = `
    <div class="city-block-meta">
      <h2 class="city-block-name">
        ${m.covered
          ? `<a href="${m.url}">${esc(m.name)}</a>`
          : esc(m.name)
        }
      </h2>
      <span class="city-block-distance">${m.distance_km} km</span>
    </div>
    ${m.covered
      ? `<span class="city-block-count">${m.event_count} Veranstaltungen</span>`
      : `<span class="city-block-soon">Demnächst verfügbar</span>`
    }
  `;
  section.appendChild(header);

  if (!m.covered || events.length === 0) {
    return section;
  }

  // Top 3 event cards
  const grid = document.createElement("div");
  grid.className = "city-block-grid";
  events.slice(0, 3).forEach(ev => {
    grid.appendChild(renderEventCard(ev));
  });
  section.appendChild(grid);

  // "Alle X Events" link
  const footer = document.createElement("div");
  footer.className = "city-block-footer";
  footer.innerHTML = `
    <a href="${m.url}" class="city-block-all">
      Alle ${m.event_count} Events in ${esc(m.name)} →
    </a>
  `;
  section.appendChild(footer);

  return section;
}

// ── Counter ────────────────────────────────────────────────────────────────────

function updateCounter(municipalities, eventsByCity, radius) {
  const el = document.getElementById("karte-counter");
  if (!el) return;

  const inRange = municipalities.filter(m => m.distance_km <= radius);
  const coveredInRange = inRange.filter(m => m.covered);
  const totalEvents = coveredInRange.reduce((sum, m) => {
    return sum + (eventsByCity[m.id]?.length || 0);
  }, 0);

  const stadtText = inRange.length === 1 ? "Stadt" : "Städte";
  el.textContent = `${inRange.length} ${stadtText} · ${totalEvents} Veranstaltungen im Umkreis`;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function hideLoading() {
  const el = document.getElementById("karte-loading");
  if (el) el.hidden = true;
  const content = document.getElementById("karte-content");
  if (content) content.hidden = false;
}

function showError() {
  const el = document.getElementById("karte-loading");
  if (el) el.textContent = "Karte konnte nicht geladen werden.";
}

function esc(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function debounce(fn, ms) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}
