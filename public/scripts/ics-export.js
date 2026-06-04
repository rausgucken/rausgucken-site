/**
 * ics-export.js
 * Client-side ICS / iCalendar generation for rausgucken.de
 * Exports: generateCollectionICS(events, label)
 *
 * Usage:
 *   import { generateCollectionICS } from '/scripts/ics-export.js';
 *   generateCollectionICS(events, 'Heute in Ludwigsburg');
 *
 * Triggers a browser download — no server round-trip.
 */

/**
 * Pad a number to 2 digits.
 */
function pad(n) { return String(n).padStart(2, '0'); }

/**
 * Convert ISO date string (YYYY-MM-DD) to iCal DATE value (YYYYMMDD).
 * Returns null if input is falsy.
 */
function toIcalDate(iso) {
  if (!iso) return null;
  return iso.replace(/-/g, '');
}

/**
 * Fold long iCal lines at 75 octets per RFC 5545.
 */
function foldLine(line) {
  if (line.length <= 75) return line;
  const chunks = [];
  let i = 0;
  while (i < line.length) {
    chunks.push(line.slice(i, i + (i === 0 ? 75 : 74)));
    i += (i === 0 ? 75 : 74);
  }
  return chunks.join('\r\n ');
}

/**
 * Escape iCal TEXT values (commas, semicolons, backslashes, newlines).
 */
function escapeText(str) {
  if (!str) return '';
  return String(str)
    .replace(/\\/g, '\\\\')
    .replace(/;/g,  '\\;')
    .replace(/,/g,  '\\,')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '');
}

/**
 * Build a VEVENT block from a rausgucken event object.
 */
function buildVEvent(ev) {
  const lines = [];

  lines.push('BEGIN:VEVENT');

  // UID — stable across exports
  lines.push(`UID:rg-${ev.slug || ev.id || Math.random().toString(36).slice(2)}@rausgucken.de`);

  // Timestamps
  const now = new Date();
  const dtstamp = `${now.getUTCFullYear()}${pad(now.getUTCMonth()+1)}${pad(now.getUTCDate())}T${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}Z`;
  lines.push(`DTSTAMP:${dtstamp}`);

  // Date handling — DATE-only (no timezone) for all-day events
  const dtstart = toIcalDate(ev.date_start);
  const dtend   = toIcalDate(ev.date_end || ev.date_start);

  if (dtstart) {
    lines.push(`DTSTART;VALUE=DATE:${dtstart}`);
    // DTEND in iCal is exclusive — add one day for single-day events
    if (dtend) {
      const endDate = new Date(dtend.slice(0,4) + '-' + dtend.slice(4,6) + '-' + dtend.slice(6,8));
      endDate.setDate(endDate.getDate() + 1);
      const dtendExcl = `${endDate.getFullYear()}${pad(endDate.getMonth()+1)}${pad(endDate.getDate())}`;
      lines.push(`DTEND;VALUE=DATE:${dtendExcl}`);
    }
  }

  // Summary
  if (ev.title) lines.push(foldLine(`SUMMARY:${escapeText(ev.title)}`));

  // Location
  if (ev.location) lines.push(foldLine(`LOCATION:${escapeText(ev.location)}`));

  // Description — combine time, description, price, source
  const descParts = [];
  if (ev.time)        descParts.push(ev.time);
  if (ev.description) descParts.push(ev.description);
  if (ev.price)       descParts.push(`Preis: ${ev.price}`);
  if (ev.source_label) descParts.push(`Quelle: ${ev.source_label}`);
  if (descParts.length > 0) {
    lines.push(foldLine(`DESCRIPTION:${escapeText(descParts.join('\\n'))}`));
  }

  // URL — canonical rausgucken.de link
  const url = ev.canonical_url || ev.url || (ev.slug && ev.city ? `https://www.rausgucken.de/${ev.city}/events/${ev.slug}` : null);
  if (url) lines.push(foldLine(`URL:${url}`));

  // X-COST custom field
  if (ev.price) lines.push(foldLine(`X-COST:${escapeText(ev.price)}`));

  lines.push('END:VEVENT');
  return lines.join('\r\n');
}

/**
 * Generate and trigger download of a .ics file for a collection of events.
 *
 * @param {object[]} events  - Array of rausgucken event objects
 * @param {string}   label   - Calendar name + filename base (e.g. "Heute in Ludwigsburg")
 */
export function generateCollectionICS(events, label) {
  if (!events || events.length === 0) {
    alert('Keine Veranstaltungen zum Exportieren.');
    return;
  }

  // Filter out events without a date (standing events without dates are skipped)
  const exportable = events.filter(ev => ev.date_start);

  if (exportable.length === 0) {
    alert('Keine datierten Veranstaltungen zum Exportieren.');
    return;
  }

  const calLines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    `PRODID:-//rausgucken.de//Events//DE`,
    `X-WR-CALNAME:${escapeText(label)}`,
    'X-WR-TIMEZONE:Europe/Berlin',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    ...exportable.map(buildVEvent),
    'END:VCALENDAR',
  ];

  const blob = new Blob([calLines.join('\r\n')], { type: 'text/calendar;charset=utf-8' });
  const url  = URL.createObjectURL(blob);

  // Filename: sanitise label for filesystem
  const filename = label.replace(/[^a-zA-Z0-9äöüÄÖÜß\s-]/g, '').replace(/\s+/g, '-').toLowerCase();

  const a   = document.createElement('a');
  a.href    = url;
  a.download = `${filename}.ics`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
