// functions/moeglingen/events/[[slug]].js
//
// Cloudflare Pages Function — ICS calendar export for Möglingen events.
// Intercepts only requests ending in .ics; all other requests fall through
// to the static Astro page (standard CF Pages passthrough behaviour).
//
// Usage: GET /moeglingen/events/{slug}.ics
// Rollback: remove this file — static Astro pages are unaffected.

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);

  // Only handle .ics requests — pass everything else to static Astro
  if (!url.pathname.endsWith(".ics")) {
    return context.next();  // pass through to static Astro page
  }

  // Extract slug: strip /moeglingen/events/ prefix and .ics suffix
  const slug = url.pathname
    .replace(/^\/moeglingen\/events\//, "")
    .replace(/\.ics$/, "");

  if (!slug) {
    return new Response("Not found", { status: 404 });
  }

  // Fetch current event data from the static JSON in the site
  const dataUrl = new URL("/data/moeglingen/events-current.json", url.origin);
  let events;
  try {
    const res = await fetch(dataUrl.toString());
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    events = await res.json();
  } catch (err) {
    return new Response("Could not load event data", { status: 502 });
  }

  const ev = events.find((e) => e.slug === slug);
  if (!ev) {
    return new Response("Event not found", { status: 404 });
  }

  // Build ICS content
  const now = new Date().toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
  const uid = `${slug}@rausgucken.de`;

  const dtstart = ev.date_start
    ? ev.date_start.replace(/-/g, "") // YYYYMMDD
    : null;
  const dtend = ev.date_end
    ? ev.date_end.replace(/-/g, "")
    : dtstart;

  // Prepend time if available: parse first HH:MM from ev.time
  let dtStartVal = dtstart ? `DTSTART;VALUE=DATE:${dtstart}` : null;
  let dtEndVal   = dtend   ? `DTEND;VALUE=DATE:${dtend}`     : null;

  if (dtstart && ev.time) {
    const timeMatch = ev.time.match(/(\d{1,2}):(\d{2})/);
    if (timeMatch) {
      const hh = timeMatch[1].padStart(2, "0");
      const mm = timeMatch[2];
      dtStartVal = `DTSTART:${dtstart}T${hh}${mm}00`;
      // End time: look for second HH:MM
      const allTimes = [...ev.time.matchAll(/(\d{1,2}):(\d{2})/g)];
      if (allTimes.length >= 2) {
        const eh = allTimes[allTimes.length - 1][1].padStart(2, "0");
        const em = allTimes[allTimes.length - 1][2];
        dtEndVal = `DTEND:${dtend}T${eh}${em}00`;
      } else {
        dtEndVal = `DTEND:${dtend}T${hh}${mm}00`;
      }
    }
  }

  const escICS = (s) =>
    (s ?? "").toString().replace(/\\/g, "\\\\").replace(/;/g, "\\;")
             .replace(/,/g, "\\,").replace(/\n/g, "\\n");

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//rausgucken.de//DE",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${now}`,
    dtStartVal ?? "DTSTART;VALUE=DATE:19700101",
    dtEndVal   ?? "DTEND;VALUE=DATE:19700101",
    `SUMMARY:${escICS(ev.title)}`,
    ev.location ? `LOCATION:${escICS(ev.location)}` : null,
    ev.description ? `DESCRIPTION:${escICS(ev.description)}` : null,
    ev.price ? `COMMENT:Preis: ${escICS(ev.price)}` : null,
    // URL: points to rausgucken.de deep link (canonical_url set by manifest.py)
    // Original source URL is already in DESCRIPTION for user reference
    `URL:${ev.canonical_url || 'https://www.rausgucken.de/moeglingen/events/' + ev.slug}`,
    `ORGANIZER;CN=${escICS(ev.source_label ?? "Gemeinde Möglingen")}:MAILTO:info@moeglingen.de`,
    "END:VEVENT",
    "END:VCALENDAR",
  ]
    .filter(Boolean)
    .join("\r\n");

  return new Response(lines, {
    status: 200,
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="${slug}.ics"`,
      "Cache-Control": "public, max-age=3600",
    },
  });
}
