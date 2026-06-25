/**
 * Cloudflare Pages Function — TEMPLATE
 * Copy to functions/ingersheim/events/[[slug]].js when adding a new city.
 * Replace all tokens before use:
 *   ingersheim        → URL slug, e.g. kornwestheim
 *   Ingersheim → display name, e.g. Kornwestheim
 *
 * Route: /ingersheim/events/*.ics
 *
 * Only activates for .ics requests. All other /ingersheim/events/* requests
 * fall through to the static Astro-generated HTML page.
 *
 * Reads events-current.json via ASSETS binding — no external fetch, no build step.
 *
 * NOTE: The leading underscore in _ICS_TEMPLATE/ does NOT suppress Cloudflare
 * Pages Function routing. This directory must be kept outside the functions/
 * root or excluded via _routes.json if Cloudflare starts routing it as a live
 * path. Verify after any Cloudflare Pages runtime update.
 */

export async function onRequest(context) {
  const url = new URL(context.request.url);

  // Pass all non-.ics requests to the static Astro page
  if (!url.pathname.endsWith('.ics')) {
    return context.next();
  }

  // /ingersheim/events/some-event-slug.ics -> some-event-slug
  const slug = url.pathname.replace(/\.ics$/, '').split('/').filter(Boolean).pop();
  if (!slug) {
    return new Response('Not found', { status: 404 });
  }

  // Load events via ASSETS binding
  let events;
  try {
    const dataUrl = new URL('/data/ingersheim/events-current.json', url.origin);
    const res = await context.env.ASSETS.fetch(new Request(dataUrl.toString()));
    if (!res.ok) throw new Error(`ASSETS fetch ${res.status}`);
    events = await res.json();
  } catch (err) {
    return new Response(`Failed to load events: ${err.message}`, { status: 500 });
  }

  const event = events.find(e => e.slug === slug);
  if (!event) {
    return new Response('Event not found', {
      status: 404,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }

  const ics = buildICS(event);

  return new Response(ics, {
    status: 200,
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': `attachment; filename="${slug}.ics"`,
      'Cache-Control': 'public, max-age=3600',
    },
  });
}

/**
 * Build RFC 5545 iCalendar string for a single event.
 *
 * Handles:
 *   - All-day events (no time field)
 *   - Timed events  (parses "HH:MM - HH:MM Uhr" from ev.time)
 *   - Multi-day     (date_end present)
 *   - Line folding at 75 octets per RFC 5545 §3.1
 *   - Special char escaping per RFC 5545 §3.3.11
 */
function buildICS(ev) {
  const now   = utcStamp(new Date());
  const uid   = `${ev.slug}@rausgucken.de`;
  const site  = 'https://www.rausgucken.de';

  let dtstart, dtend, allDay = false;

  if (ev.time) {
    const startM = ev.time.match(/(\d{1,2}):(\d{2})/);
    if (startM) {
      const sh = startM[1].padStart(2, '0');
      const sm = startM[2];
      dtstart  = `${ev.date_start.replace(/-/g, '')}T${sh}${sm}00`;

      const endM = ev.time.match(/\d{1,2}:\d{2}\s*[-\u2013]\s*(\d{1,2}):(\d{2})/);
      if (endM) {
        const eh      = endM[1].padStart(2, '0');
        const em      = endM[2];
        const endDate = ev.date_end ? ev.date_end.replace(/-/g, '') : ev.date_start.replace(/-/g, '');
        dtend = `${endDate}T${eh}${em}00`;
      } else {
        dtend = addHours(dtstart, 1);
      }
    } else {
      allDay = true;
    }
  } else {
    allDay = true;
  }

  if (allDay) {
    dtstart = ev.date_start.replace(/-/g, '');
    const endBase = ev.date_end || ev.date_start;
    dtend = isoDatePlusDays(endBase, 1).replace(/-/g, '');
  }

  const descParts = [];
  if (ev.description)   descParts.push(ev.description);
  if (ev.price)         descParts.push(`Preis: ${ev.price}`);
  if (ev.location)      descParts.push(`Adresse: ${ev.location}\nIngersheim, Baden-Württemberg`);
  if (ev.original_url)  descParts.push(`Originalseite (bitte vor Teilnahme prüfen): ${ev.original_url}`);
  descParts.push('Alle Angaben ohne Gewähr – Infos können sich ändern. Bitte Originalseite prüfen.');
  const description = descParts.join('\n\n');

  const orgName = ev.source_label || ev.location || 'rausgucken.de';

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//rausgucken.de//Event Calendar//DE',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escICS(ev.title || 'Veranstaltung')}`,
    'X-WR-TIMEZONE:Europe/Berlin',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${now}Z`,
    allDay
      ? `DTSTART;VALUE=DATE:${dtstart}`
      : `DTSTART;TZID=Europe/Berlin:${dtstart}`,
    allDay
      ? `DTEND;VALUE=DATE:${dtend}`
      : `DTEND;TZID=Europe/Berlin:${dtend}`,
    fold(`SUMMARY:${escICS(ev.title || '')}`),
  ];

  if (description) lines.push(fold(`DESCRIPTION:${escICS(description)}`));
  if (ev.location)  lines.push(fold(`LOCATION:${escICS(ev.location)}`));
  // URL: points to rausgucken.de deep link (canonical_url set by manifest.py)
  // Original source URL is already in DESCRIPTION for user reference
  const eventUrl = ev.canonical_url || `https://www.rausgucken.de/ingersheim/events/${ev.slug}`;
  lines.push(`URL:${eventUrl}`);

  lines.push(`ORGANIZER;CN=${escICS(orgName)}:mailto:noreply@rausgucken.de`);
  lines.push(
    `X-ALT-DESC;FMTTYPE=text/html:<a href="${site}/ingersheim/events/${ev.slug}">` +
    `Auf rausgucken.de ansehen</a>`
  );

  lines.push('END:VEVENT');
  lines.push('END:VCALENDAR');

  return lines.join('\r\n') + '\r\n';
}

function escICS(str) {
  return String(str)
    .replace(/\\/g, '\\\\')
    .replace(/;/g,  '\\;')
    .replace(/,/g,  '\\\,')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '');
}

function fold(line) {
  if (line.length <= 75) return line;
  let out = '';
  let pos = 0;
  while (pos < line.length) {
    if (pos === 0) { out += line.slice(0, 75); pos = 75; }
    else           { out += '\r\n ' + line.slice(pos, pos + 74); pos += 74; }
  }
  return out;
}

function utcStamp(d) {
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

function addHours(dt, h) {
  const y = +dt.slice(0,4), mo = +dt.slice(4,6)-1, d = +dt.slice(6,8);
  const hr = +dt.slice(9,11), mi = +dt.slice(11,13);
  const nd = new Date(Date.UTC(y, mo, d, hr + h, mi));
  const p  = n => String(n).padStart(2,'0');
  return `${nd.getUTCFullYear()}${p(nd.getUTCMonth()+1)}${p(nd.getUTCDate())}T${p(nd.getUTCHours())}${p(nd.getUTCMinutes())}00`;
}

function isoDatePlusDays(iso, n) {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
