// src/pages/asperg/feed.xml.ts
import eventsRaw from "../../../public/data/asperg/events-current.json";

const SITE = "https://www.rausgucken.de";
const FEED_URL = `${SITE}/asperg/feed.xml`;
const CITY_URL = `${SITE}/asperg/`;

function esc(str: string): string {
  if (!str) return "";
  return str.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&apos;");
}
function toAtomDate(isoStr: string): string {
  if (!isoStr) return new Date().toISOString();
  try { return new Date(isoStr).toISOString(); } catch { return new Date().toISOString(); }
}

export async function GET() {
  const events = [...(eventsRaw as any[])].filter(ev => ev.date_start && ev.slug).sort((a,b) => a.date_start > b.date_start ? 1 : -1).slice(0, 100);
  const updated = events.length > 0 ? toAtomDate(events[events.length-1].scraped_at || events[events.length-1].date_start) : new Date().toISOString();
  const entries = events.map(ev => {
    const url = `${SITE}/asperg/events/${esc(ev.slug)}/`;
    const title = esc(ev.title || "Veranstaltung");
    const summary = esc(ev.description || "");
    const published = toAtomDate(ev.date_start);
    const updated_ev = toAtomDate(ev.scraped_at || ev.date_start);
    const dateLabel = ev.date_start ? new Date(ev.date_start).toLocaleDateString("de-DE",{weekday:"long",day:"numeric",month:"long",year:"numeric"}) : "";
    const timeLine = ev.time ? `\nUhrzeit: ${ev.time}` : "";
    const locationLine = ev.location ? `\nOrt: ${ev.location}` : "";
    const priceLine = ev.price ? `\nEintritt: ${ev.price}` : "";
    const content = esc([dateLabel+timeLine+locationLine+priceLine, ev.description||""].filter(Boolean).join("\n\n"));
    const sourceLabel = esc(ev.source_label || ev.source || "");
    const originalUrl = esc(ev.original_url || ev.link || "");
    return `  <entry>\n    <id>${url}</id>\n    <title>${title}</title>\n    <link rel="alternate" type="text/html" href="${url}"/>\n    <published>${published}</published>\n    <updated>${updated_ev}</updated>\n    <summary type="text">${summary}</summary>\n    <content type="text">${content}</content>\n    <author><name>${sourceLabel}</name></author>\n    ${originalUrl ? `<link rel="via" href="${originalUrl}"/>` : ""}\n    ${(ev.tags||[]).map((t:string)=>`<category term="${esc(t)}"/>`).join("\n    ")}\n  </entry>`;
  }).join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<feed xmlns="http://www.w3.org/2005/Atom" xml:lang="de-DE">\n  <id>${FEED_URL}</id>\n  <title>Veranstaltungen in Asperg | rausgucken.de</title>\n  <subtitle>Aktuelle Events und Veranstaltungen in Asperg – wöchentlich aktualisiert.</subtitle>\n  <link rel="self" type="application/atom+xml" href="${FEED_URL}"/>\n  <link rel="alternate" type="text/html" href="${CITY_URL}"/>\n  <updated>${updated}</updated>\n  <author><name>rausgucken.de</name><uri>${SITE}</uri></author>\n  <rights>Alle Angaben ohne Gewähr. Quellen: Originalseiten der Veranstalter.</rights>\n  <generator uri="${SITE}">rausgucken.de Astro Pipeline</generator>\n${entries}\n</feed>`;

  return new Response(xml, { headers: { "Content-Type": "application/atom+xml; charset=utf-8", "Cache-Control": "public, max-age=3600" } });
}
