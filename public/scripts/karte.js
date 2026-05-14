/**
 * karte.js — Homepage Landkreis map
 * - Loads distances.json
 * - Slider filters cities by distance from Ludwigsburg center
 * - Map highlights covered cities (coral), dims out-of-range
 * - City list below map shows in-range cities with distance + link
 * - Click map path OR city list item → navigate to city page
 */

const DISTANCES_URL = "/data/landkreis-ludwigsburg/distances.json";
const SLIDER_DEFAULT = 30;

document.addEventListener("DOMContentLoaded", init);

async function init() {
  let distData;
  try {
    const r = await fetch(DISTANCES_URL);
    distData = await r.json();
  } catch (e) {
    console.error("[karte] distances.json load failed", e);
    return;
  }

  const municipalities = distData.municipalities;

  // Wire slider
  const slider = document.getElementById("radius-slider");
  const sliderLabel = document.getElementById("radius-label");
  slider.value = SLIDER_DEFAULT;

  function update() {
    const radius = parseInt(slider.value, 10);
    sliderLabel.textContent = `${radius} km`;
    updateMap(municipalities, radius);
    updateCityList(municipalities, radius);
    updateCounter(municipalities, radius);
  }

  slider.addEventListener("input", () => update());

  // Wire map clicks
  const svg = document.getElementById("landkreis-map");
  if (svg) {
    svg.addEventListener("click", e => {
      const path = e.target.closest(".muni");
      if (!path) return;
      const cityId = path.dataset.cityId;
      const m = municipalities.find(x => x.id === cityId);
      if (m?.url) window.location.href = m.url;
    });

    // Tooltip on hover
    const tooltip = document.getElementById("map-tooltip");
    const dataMap = Object.fromEntries(municipalities.map(m => [m.id, m]));

    svg.addEventListener("mousemove", e => {
      const path = e.target.closest(".muni");
      if (!path || !tooltip) return;
      const m = dataMap[path.dataset.cityId];
      if (!m) { tooltip.hidden = true; return; }
      tooltip.innerHTML = m.covered
        ? `<strong>${m.name}</strong><br>${m.event_count} Veranstaltungen`
        : `<strong>${m.name}</strong><br><em>Demnächst</em>`;
      tooltip.hidden = false;
      const rect = svg.closest(".map-container").getBoundingClientRect();
      tooltip.style.left = (e.clientX - rect.left + 14) + "px";
      tooltip.style.top  = (e.clientY - rect.top  + 14) + "px";
    });
    svg.addEventListener("mouseleave", () => { if (tooltip) tooltip.hidden = true; });
  }

  // Initial render
  update();
}

function updateMap(municipalities, radius) {
  const svg = document.getElementById("landkreis-map");
  if (!svg) return;
  const distMap = Object.fromEntries(municipalities.map(m => [m.id, m]));

  svg.querySelectorAll(".muni").forEach(path => {
    const m = distMap[path.dataset.cityId];
    if (!m) return;
    const inRange = m.distance_km <= radius;
    path.classList.toggle("in-range",    inRange);
    path.classList.toggle("out-of-range", !inRange);
    // covered class is set at build time in SVG
    path.style.cursor = (m.covered && inRange) ? "pointer" : "default";
  });
}

function updateCityList(municipalities, radius) {
  const container = document.getElementById("city-list");
  if (!container) return;

  const inRange = municipalities
    .filter(m => m.distance_km <= radius)
    .sort((a, b) => a.distance_km - b.distance_km);

  container.innerHTML = "";

  inRange.forEach(m => {
    const item = document.createElement("div");
    item.className = "city-item" + (m.covered ? " city-item--covered" : " city-item--coming");

    if (m.covered && m.url) {
      item.innerHTML = `
        <a href="${m.url}" class="city-item-link">
          <span class="city-item-name">${esc(m.name)}</span>
          <span class="city-item-meta">${m.distance_km} km · ${m.event_count} Events</span>
        </a>`;
    } else {
      item.innerHTML = `
        <span class="city-item-name">${esc(m.name)}</span>
        <span class="city-item-meta">${m.distance_km} km · demnächst</span>`;
    }
    container.appendChild(item);
  });
}

function updateCounter(municipalities, radius) {
  const el = document.getElementById("karte-counter");
  if (!el) return;
  const inRange = municipalities.filter(m => m.distance_km <= radius);
  const covered = inRange.filter(m => m.covered);
  const totalEvents = covered.reduce((s, m) => s + m.event_count, 0);
  const stadtText = inRange.length === 1 ? "Stadt" : "Städte";
  el.textContent = `${inRange.length} ${stadtText} · ${totalEvents} Veranstaltungen im Umkreis`;
}

function esc(s) {
  return String(s ?? "")
    .replace(/&/g,"&amp;").replace(/</g,"&lt;")
    .replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}
