/**
 * renderEventCard.js
 * Renders an event object as the same HTML structure as EventCard.astro.
 * Used by all client-side temporal pages (heute, morgen, dieses-wochenende,
 * naechste-woche, kinder) so they match the main Ludwigsburg card layout.
 *
 * Usage:
 *   <script type="module">
 *     import { renderEventCard, injectEventCardStyles } from '/scripts/renderEventCard.js';
 *     injectEventCardStyles();
 *     data.forEach(ev => listEl.appendChild(renderEventCard(ev)));
 *   </script>
 */

const TAG_LABELS = {
  Ausstellung: "Ausstellung",   Entertainment: "Entertainment",
  Familie:     "Familie",       Fest:          "Fest",
  Fuehrung:    "Führung",       Jugend:        "Jugend",
  Kinder:      "Kinder",        Kulinarik:     "Kulinarik",
  Lesung:      "Lesung",        Messe:         "Messe",
  Musik:       "Musik",         Outdoor:       "Outdoor",
  Sport:       "Sport",         Sprache:       "Sprache",
  Tanz:        "Tanz",          Theater:       "Theater",
  Vortrag:     "Vortrag",       Workshop:      "Workshop",
};

function esc(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatDate(iso) {
  if (!iso) return null;
  const d = new Date(iso + "T12:00:00");
  return {
    day:     d.getDate(),
    month:   d.toLocaleDateString("de-DE", { month: "short" }),
    weekday: d.toLocaleDateString("de-DE", { weekday: "short" }),
    full:    d.toLocaleDateString("de-DE", { day: "numeric", month: "long", year: "numeric" }),
  };
}

function freshnessLabel(isoTs) {
  if (!isoTs) return "";
  try {
    return new Date(isoTs).toLocaleDateString("de-DE", { day: "numeric", month: "short" });
  } catch { return ""; }
}

/**
 * Returns an <article> DOM element styled as an EventCard.
 * @param {Object} ev  — event object from the JSON pipeline
 * @returns {HTMLElement}
 */
export function renderEventCard(ev) {
  const dateObj    = formatDate(ev.date_start);
  const isStanding = !ev.date_start;
  const isSponsored = ev.sponsored === true;
  const tags       = ev.tags || [];
  const desc       = ev.description || "";
  const descShort  = desc.length > 110 ? desc.slice(0, 110) + "\u2026" : desc;
  const freshness  = freshnessLabel(ev.scraped_at);
  const slug       = ev.slug || "";
  const loc        = (ev.location || "").replace("Residenzschloss Ludwigsburg", "Residenzschloss LB");

  // Date badge HTML
  let dateBadgeHtml;
  if (dateObj) {
    dateBadgeHtml = `
      <div class="date-badge" aria-hidden="true">
        <span class="date-weekday">${esc(dateObj.weekday)}</span>
        <span class="date-day">${esc(dateObj.day)}</span>
        <span class="date-month">${esc(dateObj.month)}</span>
      </div>`;
  } else {
    dateBadgeHtml = `
      <div class="date-badge date-badge--standing" aria-hidden="true">
        <span class="date-infinity">\u221e</span>
        <span class="date-month">immer</span>
      </div>`;
  }

  // Tags row
  const tagsHtml = tags.slice(0, 3).map(t =>
    `<span class="tag">${esc(TAG_LABELS[t] ?? t)}</span>`
  ).join("");

  const ageBadge = ev.age_min != null
    ? `<span class="tag tag--age">ab ${esc(ev.age_min)} J.${ev.age_max ? `\u2013${esc(ev.age_max)}` : "+"}</span>`
    : "";

  let badgesHtml = "";
  if (isSponsored) badgesHtml = `<span class="badge-sponsored" aria-label="Anzeige">Anzeige</span>`;
  else if (ev.is_new) badgesHtml = `<span class="badge-new">Neu</span>`;

  // Meta row (time / location / price)
  const clockSvg = `<svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`;
  const pinSvg   = `<svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 10c0 7-9 13-9 13S3 17 3 10a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>`;
  const euroSvg  = `<svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>`;
  const calSvg   = `<svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>`;
  const extSvg   = `<svg aria-hidden="true" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>`;

  const metaItems = [];
  if (ev.time) metaItems.push(`<span class="meta-item">${clockSvg} ${esc(ev.time)} Uhr</span>`);
  else if (isStanding) metaItems.push(`<span class="meta-item">${calSvg} Regelm\u00e4\u00dfig</span>`);
  if (loc) metaItems.push(`<span class="meta-item">${pinSvg} ${esc(loc)}</span>`);
  if (ev.price) {
    const priceShort = ev.price.split(" ").slice(0, 3).join(" ");
    metaItems.push(`<span class="meta-item">${euroSvg} ${esc(priceShort)}</span>`);
  }

  const ariaLabel = `${ev.title}${dateObj ? `, ${dateObj.full}` : ""}`;

  const article = document.createElement("article");
  article.className = [
    "event-card",
    isStanding  ? "event-card--standing"  : "",
    ev.is_new   ? "event-card--new"       : "",
    isSponsored ? "event-card--sponsored" : "",
  ].filter(Boolean).join(" ");

  article.dataset.tags     = tags.join(",");
  article.dataset.ageMin   = ev.age_min ?? "";
  article.dataset.ageMax   = ev.age_max ?? "";
  article.dataset.date     = ev.date_start ?? "";

  article.innerHTML = `
    <a href="/ludwigsburg/events/${esc(slug)}"
       class="card-link"
       aria-label="${esc(ariaLabel)}">

      ${dateBadgeHtml}

      <div class="card-body">
        <div class="card-tags">
          ${badgesHtml}
          ${tagsHtml}
          ${ageBadge}
        </div>
        <h3 class="card-title">${esc(ev.title)}</h3>
        <div class="card-meta">
          ${metaItems.join("")}
        </div>
        ${descShort ? `<p class="card-desc">${esc(descShort)}</p>` : ""}
      </div>
    </a>

    <div class="card-footer">
      <a href="${esc(ev.original_url || ev.link || "#")}"
         target="_blank"
         rel="noopener noreferrer"
         class="source-link"
         aria-label="Originalseite f\u00fcr ${esc(ev.title)} \u00f6ffnen (\u00f6ffnet in neuem Tab)"
         onclick="event.stopPropagation()">
        Originalseite ${extSvg}
      </a>
      ${freshness ? `<span class="freshness-stamp">Gepr\u00fcft: ${esc(freshness)}</span>` : ""}
    </div>
  `;

  return article;
}

/**
 * The CSS that matches EventCard.astro's <style> block.
 * Injected once per page via injectEventCardStyles().
 */
const EVENT_CARD_CSS = `
  .event-card {
    background: var(--surface-card, var(--surface));
    border: 1px solid var(--border);
    border-radius: var(--radius);
    overflow: hidden;
    display: flex;
    flex-direction: column;
    box-shadow: var(--shadow-card);
    position: relative;
    transition: transform 200ms cubic-bezier(0.4,0,0.2,1),
                box-shadow 200ms cubic-bezier(0.4,0,0.2,1),
                background 250ms ease;
  }
  @media (prefers-reduced-motion: no-preference) {
    .event-card:hover { transform: translateY(-4px); box-shadow: var(--shadow-hover); }
  }
  .event-card:focus-within { outline: 2px solid var(--coral); outline-offset: 0px; }
  .event-card--standing  { border-left: 3px solid var(--coral); }
  .event-card--sponsored { border-left: 3px solid var(--sage); background: var(--sage-light); }

  .card-link { display: flex; flex: 1; text-decoration: none; color: inherit; min-height: 0; outline: none; }
  .card-link:hover { text-decoration: none; }

  .date-badge {
    background: var(--coral);
    color: var(--text);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    min-width: 58px;
    flex-shrink: 0;
    padding: 0.75rem 0.4rem;
    gap: 0;
  }
  .date-badge--standing { background: var(--tag-bg); color: var(--text-60); }
  .date-weekday { font-size: 0.6rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.07em; opacity: 0.75; margin-bottom: 1px; }
  .date-day { font-family: var(--font-heading); font-weight: 800; font-size: 1.5rem; line-height: 1; }
  .date-month { font-size: 0.65rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.07em; opacity: 0.80; }
  .date-infinity { font-size: 1.4rem; line-height: 1; opacity: 0.5; }

  .card-body { padding: 0.85rem 1rem 0.75rem; flex: 1; display: flex; flex-direction: column; gap: 0.4rem; min-width: 0; }

  .card-tags { display: flex; flex-wrap: wrap; gap: 0.3rem; align-items: center; }
  .tag { background: var(--tag-bg); color: var(--text-60); font-size: 0.7rem; font-weight: 500; padding: 2px 8px; border-radius: 20px; white-space: nowrap; }
  .tag--age { background: var(--sage-light); color: var(--text); font-weight: 600; }
  .badge-new { background: var(--sage); color: var(--text); font-size: 0.65rem; font-weight: 700; padding: 2px 7px; border-radius: 20px; text-transform: uppercase; letter-spacing: 0.06em; }
  .badge-sponsored { background: var(--tag-bg); color: var(--text-60); font-size: 0.65rem; font-weight: 600; padding: 2px 7px; border-radius: 4px; text-transform: uppercase; letter-spacing: 0.08em; border: 1px solid var(--border); }

  .card-title { font-family: var(--font-heading); font-weight: 700; font-size: 0.97rem; color: var(--text); line-height: 1.3; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }

  .card-meta { display: flex; flex-direction: column; gap: 0.2rem; }
  .meta-item { display: flex; align-items: center; gap: 0.35rem; font-size: 0.78rem; font-weight: 500; color: var(--text-60); }
  .meta-item svg { flex-shrink: 0; stroke: var(--coral); }

  .card-desc { font-size: 0.8rem; color: var(--text-60); line-height: 1.5; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; margin-top: 0.1rem; }

  .card-footer { display: flex; justify-content: space-between; align-items: center; padding: 0.5rem 1rem; border-top: 1px solid var(--border); background: rgba(0,0,0,0.02); }
  html.dark .card-footer { background: rgba(255,255,255,0.03); }

  .source-link { display: inline-flex; align-items: center; gap: 0.3rem; font-size: 0.75rem; font-weight: 600; color: var(--text-60); text-decoration: underline; text-decoration-color: transparent; transition: color 150ms, text-decoration-color 150ms; min-height: 44px; }
  .source-link:hover { color: var(--coral); text-decoration-color: var(--coral); }
  .source-link:focus-visible { outline: 2px solid var(--coral); outline-offset: 2px; border-radius: 2px; }
  html.dark .source-link       { color: var(--text-60); }
  html.dark .source-link:hover { color: var(--coral); }

  .freshness-stamp { font-size: 0.67rem; color: var(--text); opacity: 0.70; }
`;

let stylesInjected = false;

/**
 * Injects EventCard CSS into the page <head> once.
 * Call before the first renderEventCard() call.
 */
export function injectEventCardStyles() {
  if (stylesInjected) return;
  const style = document.createElement("style");
  style.textContent = EVENT_CARD_CSS;
  document.head.appendChild(style);
  stylesInjected = true;
}
