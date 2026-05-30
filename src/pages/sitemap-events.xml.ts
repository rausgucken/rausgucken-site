// src/pages/sitemap-events.xml.ts
// SEO §11: All active per-event pages across all cities with lastmod from scraped_at.
// Expired events (date_start > 30 days ago) are excluded.
// Cities derived dynamically from public/data/cities.json — do not hardcode imports.
import { readFileSync } from "fs";
import { join } from "path";

export async function GET() {
  const siteUrl = "https://www.rausgucken.de";
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 30);
  const cutoffStr = cutoff.toISOString().slice(0, 10);

  // Load covered cities from registry at build time
  const citiesPath = join(process.cwd(), "public", "data", "cities.json");
  const citiesData: Array<{ id: string; covered: boolean }> =
    JSON.parse(readFileSync(citiesPath, "utf-8"));
  const coveredCities = citiesData.filter(c => c.covered).map(c => c.id);

  // Load events for each city — skip cities whose events file doesn't exist yet
  const cityEvents: Array<{ city: string; events: any[] }> = [];
  for (const city of coveredCities) {
    const eventsPath = join(process.cwd(), "public", "data", city, "events-current.json");
    try {
      const raw = JSON.parse(readFileSync(eventsPath, "utf-8"));
      const events = Array.isArray(raw) ? raw : (raw.events || []);
      cityEvents.push({ city, events });
    } catch {
      // City in cities.json but events file not yet present — skip silently
    }
  }

  const urls = cityEvents.flatMap(({ city, events }) =>
    events
      .filter((ev) => !ev.date_start || ev.date_start >= cutoffStr)
      .map((ev) => {
        const lastmod = ev.scraped_at
          ? ev.scraped_at.slice(0, 10)
          : new Date().toISOString().slice(0, 10);
        const priority = ev.is_new ? "0.9" : "0.7";
        return `
  <url>
    <loc>${siteUrl}/${city}/events/${ev.slug}/</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>${priority}</priority>
  </url>`;
      })
  ).join("");

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
