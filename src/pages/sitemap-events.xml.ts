// src/pages/sitemap-events.xml.ts
// SEO §11: All active per-event pages with lastmod from scraped_at.
// Expired events (date_start > 30 days ago) are excluded — moved to sitemap-archive.xml.

import eventsData from "../../public/data/ludwigsburg/events-current.json";

export async function GET() {
  const siteUrl = "https://rausgucken.de";

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 30);
  const cutoffStr = cutoff.toISOString().slice(0, 10);

  // Active events only (no date = standing/permanent, always included)
  const activeEvents = (eventsData as any[]).filter(
    (ev) => !ev.date_start || ev.date_start >= cutoffStr
  );

  const urls = activeEvents
    .map((ev) => {
      const lastmod = ev.scraped_at
        ? ev.scraped_at.slice(0, 10)
        : new Date().toISOString().slice(0, 10);
      const priority = ev.is_new ? "0.9" : "0.7";
      return `
  <url>
    <loc>${siteUrl}/ludwigsburg/events/${ev.slug}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>${priority}</priority>
  </url>`;
    })
    .join("");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>`;

  return new Response(xml, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
