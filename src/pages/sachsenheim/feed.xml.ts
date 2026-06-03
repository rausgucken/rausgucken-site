// src/pages/sachsenheim/feed.xml.ts
// Atom 1.0 feed for Sachsenheim events — app-backbone ready.
// Namespaces: media (Yahoo MRSS), rg (rausgucken custom fields)
// SEO strategy §21: Atom preferred over RSS 2.0.
// Generated at build time from events-current.json.
// ARCHITECTURE §16: entry <link> points to rausgucken.de canonical URL (not original_url).

import eventsRaw from "../../../public/data/sachsenheim/events-current.json";

const SITE     = "https://www.rausgucken.de";
const CITY_ID  = "sachsenheim";
const FEED_URL = `${SITE}/${CITY_ID}/feed.xml`;
const CITY_URL = `${SITE}/${CITY_ID}/`;

function esc(str: string): string {
  if (!str) return "";
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function toAtomDate(isoStr: string): string {
  if (!isoStr) return new Date().toISOString();
  try { return new Date(isoStr).toISOString(); }
  catch { return new Date().toISOString(); }
}

export async function GET() {
  const events = [...(eventsRaw as any[])]
    .filter((ev) => ev.date_start && ev.slug)
    .sort((a, b) => (a.date_start > b.date_start ? 1 : -1))
    .slice(0, 100);

  const updated = events.length > 0
    ? toAtomDate(events[events.length - 1].scraped_at || events[events.length - 1].date_start)
    : new Date().toISOString();

  const entries = events.map((ev) => {
    const url        = `${SITE}/${CITY_ID}/events/${esc(ev.slug)}/`;
    const title      = esc(ev.title || "Veranstaltung");
    const summary    = esc(ev.description || "");
    const published  = toAtomDate(ev.date_start);
    const updated_ev = toAtomDate(ev.scraped_at || ev.date_start);
    const ogImage    = `${SITE}/og/${CITY_ID}/${esc(ev.slug)}.jpg`;

    const dateLabel    = ev.date_start
      ? new Date(ev.date_start).toLocaleDateString("de-DE", {
          weekday: "long", day: "numeric", month: "long", year: "numeric",
        })
      : "";
    const timeLine     = ev.time     ? `\nUhrzeit: ${ev.time}`     : "";
    const locationLine = ev.location ? `\nOrt: ${ev.location}`     : "";
    const priceLine    = ev.price    ? `\nEintritt: ${ev.price}`   : "";
    const content = esc(
      [dateLabel + timeLine + locationLine + priceLine, ev.description || ""]
        .filter(Boolean).join("\n\n")
    );

    const sourceLabel = esc(ev.source_label || ev.source || "");
    const originalUrl = esc(ev.original_url || ev.link || "");

    const categoryTags = (ev.tags || [])
      .map((t: string) => `<category term="${esc(t)}"/>`)
      .join("\n    ");

    const rgPrice  = ev.price   != null ? `<rg:price>${esc(String(ev.price))}</rg:price>`   : "";
    const rgAgeMin = ev.age_min != null ? `<rg:age_min>${ev.age_min}</rg:age_min>`           : "";
    const rgAgeMax = ev.age_max != null ? `<rg:age_max>${ev.age_max}</rg:age_max>`           : "";

    return `  <entry>
    <id>${url}</id>
    <title>${title}</title>
    <link rel="alternate" type="text/html" href="${url}"/>
    <published>${published}</published>
    <updated>${updated_ev}</updated>
    <summary type="text">${summary}</summary>
    <content type="text">${content}</content>
    <author><name>${sourceLabel}</name></author>
    ${originalUrl ? `<link rel="via" href="${originalUrl}"/>` : ""}
    <media:thumbnail url="${ogImage}"/>
    ${categoryTags}
    <rg:city>${CITY_ID}</rg:city>
    ${rgPrice}
    ${rgAgeMin}
    ${rgAgeMax}
    ${originalUrl ? `<rg:original_url>${originalUrl}</rg:original_url>` : ""}
  </entry>`;
  }).join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom"
      xmlns:media="http://search.yahoo.com/mrss/"
      xmlns:rg="https://www.rausgucken.de/feed-schema/1.0"
      xml:lang="de-DE">
  <id>${FEED_URL}</id>
  <title>Veranstaltungen in Sachsenheim | rausgucken.de</title>
  <subtitle>Aktuelle Events, Workshops und Ausstellungen in Sachsenheim – täglich aktualisiert.</subtitle>
  <link rel="self" type="application/atom+xml" href="${FEED_URL}"/>
  <link rel="alternate" type="text/html" href="${CITY_URL}"/>
  <updated>${updated}</updated>
  <author>
    <name>rausgucken.de</name>
    <uri>https://www.rausgucken.de</uri>
  </author>
  <rights>Alle Angaben ohne Gewähr. Quellen: Originalseiten der Veranstalter.</rights>
  <generator uri="https://www.rausgucken.de">rausgucken.de Astro Pipeline</generator>
${entries}
</feed>`;

  return new Response(xml, {
    headers: {
      "Content-Type": "application/atom+xml; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
