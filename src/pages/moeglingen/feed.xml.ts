// src/pages/moeglingen/feed.xml.ts
// Atom 1.0 feed — built at Cloudflare Pages build time.
// Mirrors the pattern of src/pages/tamm/feed.xml.ts

import type { APIRoute } from "astro";

export const GET: APIRoute = async () => {
  const events: any[] = await import(
    "../../../public/data/moeglingen/events-current.json",
    { assert: { type: "json" } }
  ).then((m) => m.default).catch(() => []);

  const siteUrl  = "https://www.rausgucken.de";
  const city     = "moeglingen";
  const cityName = "Möglingen";
  const feedUrl  = `${siteUrl}/${city}/feed.xml`;
  const selfUrl  = `${siteUrl}/${city}/`;
  const updated  = new Date().toISOString();

  const escXml = (s: string) =>
    (s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;")
             .replace(/>/g, "&gt;").replace(/"/g, "&quot;");

  const entries = events
    .filter((ev) => ev.date_start)
    .slice(0, 50)                       // cap feed at 50 items
    .map((ev) => {
      const url  = `${siteUrl}/${city}/events/${ev.slug}/`;
      const date = ev.date_start ?? updated;
      return `
  <entry>
    <id>${url}</id>
    <title>${escXml(ev.title)}</title>
    <link href="${url}" />
    <updated>${new Date(date).toISOString()}</updated>
    <author><name>${escXml(ev.source_label ?? "Gemeinde Möglingen")}</name></author>
    ${ev.location ? `<summary>${escXml(ev.location)}</summary>` : ""}
    ${ev.description ? `<content type="text">${escXml(ev.description)}</content>` : ""}
  </entry>`;
    })
    .join("\n");

  const xml = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <id>${feedUrl}</id>
  <title>rausgucken.de – Veranstaltungen in ${cityName}</title>
  <subtitle>Täglich aktuelle Veranstaltungen in ${cityName} und Umgebung.</subtitle>
  <link href="${feedUrl}" rel="self" type="application/atom+xml" />
  <link href="${selfUrl}" rel="alternate" type="text/html" />
  <updated>${updated}</updated>
  <author><name>rausgucken.de</name><uri>${siteUrl}</uri></author>
  <rights>Alle Angaben ohne Gewähr – Quellen: Originalseiten der Veranstalter.</rights>
${entries}
</feed>`;

  return new Response(xml, {
    headers: {
      "Content-Type": "application/atom+xml; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
};
