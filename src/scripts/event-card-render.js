// event-card-render.js: client twin of EventCard.astro markup (used by "Weitere laden").
// Keep in sync with EventCard.astro. Known gap: no FreshnessStamp line on client-built cards.
import tagGroups from '../data/tag-groups.json';

const GROUP_OF = {};
for (const g of Object.values(tagGroups.groups)) for (const t of g.tags) GROUP_OF[t] = g.chip;
const LABELS = { Fuehrung: 'Führung' };
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ico = (d) => '<svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">' + d + '</svg>';
const I_CLOCK = ico('<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>');
const I_CAL = ico('<rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>');
const I_PIN = ico('<path d="M21 10c0 7-9 13-9 13S3 17 3 10a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/>');
const I_EUR = ico('<line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/>');
const HEART = '<svg class="merken-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/></svg>';

export function renderCard(ev) {
  const city = ev.city || 'ludwigsburg';
  const tags = Array.isArray(ev.tags) ? ev.tags : [];
  const d = ev.date_start ? new Date(ev.date_start + 'T12:00:00') : null;
  const standing = !d;
  const sponsored = ev.sponsored === true;
  const full = d ? d.toLocaleDateString('de-DE', { day: 'numeric', month: 'long', year: 'numeric' }) : '';
  let endDay = null;
  if (d && ev.date_end && ev.date_end !== ev.date_start && ev.date_end.slice(0, 7) === ev.date_start.slice(0, 7)) {
    endDay = new Date(ev.date_end + 'T12:00:00').getDate();
  }
  const dayText = d ? (endDay ? d.getDate() + '.–' + endDay + '.' : String(d.getDate())) : '';
  const badge = d
    ? '<div class="date-badge" aria-hidden="true"><span class="date-weekday">' + esc(d.toLocaleDateString('de-DE', { weekday: 'short' })) +
      '</span><span class="date-day' + (endDay ? ' date-day--range' : '') + '">' + dayText + '</span><span class="date-month">' +
      esc(d.toLocaleDateString('de-DE', { month: 'short' })) + '</span></div>'
    : '<div class="date-badge date-badge--standing" aria-hidden="true"><span class="date-infinity">∞</span><span class="date-month">immer</span></div>';
  const loc = ev.location ? String(ev.location).replace('Residenzschloss Ludwigsburg', 'Residenzschloss LB') : '';
  let meta = '';
  if (ev.time) meta += '<span class="meta-item">' + I_CLOCK + esc(ev.time) + '</span>';
  if (standing && !ev.time) meta += '<span class="meta-item">' + I_CAL + 'Regelmäßig</span>';
  if (loc) meta += '<span class="meta-item">' + I_PIN + esc(loc) + '</span>';
  if (ev.price) meta += '<span class="meta-item">' + I_EUR + esc(String(ev.price).split(' ').slice(0, 3).join(' ')) + '</span>';
  const desc = ev.description ? esc(ev.description.length > 110 ? ev.description.slice(0, 110) + '…' : ev.description) : '';
  let chips = '';
  if (sponsored) chips += '<span class="badge-sponsored" aria-label="Anzeige">Anzeige</span>';
  if (ev.is_new && !sponsored) chips += '<span class="badge-new">Neu</span>';
  if (ev.is_booked_out) chips += '<span class="badge-booked">Ausgebucht</span>';
  tags.slice(0, 3).forEach((t) => { chips += '<span class="tag tag--' + (GROUP_OF[t] || 'outline') + '">' + esc(LABELS[t] || t) + '</span>'; });
  if (ev.age_min != null) chips += '<span class="tag tag--age">' + esc('ab ' + ev.age_min + ' J.' + (ev.age_max ? '–' + ev.age_max : '+')) + '</span>';
  const src = ev.source_label
    ? '<a href="' + esc(ev.original_url) + '" target="_blank" rel="noopener noreferrer" class="source-attribution" onclick="event.stopPropagation()">Quelle: ' +
      esc(ev.source_label) + '<span class="source-more">&nbsp;— Originalseite prüfen</span></a>'
    : '';
  return '<article class="event-card' + (standing ? ' event-card--standing' : '') + (ev.is_new ? ' event-card--new' : '') + (sponsored ? ' event-card--sponsored' : '') +
    '" data-tags="' + esc(tags.join(',')) + '" data-source="' + esc(ev.source) + '" data-age-min="' + esc(ev.age_min ?? '') + '" data-age-max="' + esc(ev.age_max ?? '') +
    '" data-date="' + esc(ev.date_start ?? '') + '" data-weekdays="' + esc(ev.weekdays ? ev.weekdays.join(',') : '') + '" data-location="' + esc(ev.location ?? '') + '">' +
    '<a href="/' + esc(city) + '/events/' + esc(ev.slug) + '" class="card-link">' + (full ? '<span class="rg-sr-only">' + esc(full) + '. </span>' : '') + badge +
    '<div class="card-body"><h3 class="card-title">' + esc(ev.title) + '</h3><div class="card-meta">' + meta + '</div>' +
    (desc ? '<p class="card-desc">' + desc + '</p>' : '') + (chips ? '<div class="card-tags">' + chips + '</div>' : '') + '</div></a>' +
    '<div class="card-footer"><div class="footer-line1"><button class="merken-btn" data-slug="' + esc(ev.slug) + '" aria-label="Veranstaltung merken: ' + esc(ev.title) +
    '" aria-pressed="false" title="Merken" onclick="event.stopPropagation()">' + HEART + '<span class="merken-label">Merken</span></button>' + src + '</div></div></article>';
}
if (typeof window !== 'undefined') window.rgRenderCard = renderCard;
