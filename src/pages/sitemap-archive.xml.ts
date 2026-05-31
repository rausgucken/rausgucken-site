// src/pages/sitemap-archive.xml.ts
// Date archive sitemap — rolling 30-day window across all covered cities.
// Cities read from cities.json — no hardcoding. Landkreis hub excluded.
// Only dates with ≥1 event are included (mirrors getStaticPaths logic).
import { readFileSync } from "fs";
import { join }         from "path";

const SKIP_IDS = new Set(["landkreis-ludwigsburg"]);

export async function GET() {
  const siteUrl = "https://www.rausgucken.de";
  const now     = new Date().toISOString().slice(0, 10);

  // Rolling 30-day window
  const today = new Date();
  const window: string[] = [];
  for (let i = 0; i < 30; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    window.push(d.toISOString().split("T")[0]);
  }

  // Covered cities from registry
  const citiesPath = join(process.cwd(), "public", "data", "cities.json");
  const citiesRaw: any[] = JSON.parse(readFileSync(citiesPath, "utf-8"));
  const cities = (Array.isArray(citiesRaw) ? citiesRaw : (citiesRaw as any).cities ?? [])
    .filter((c: any) => c.covered && !SKIP_IDS.has(c.id));

  const urls: string[] = [];

  for (const city of cities) {
    const eventsPath = join(process.cwd(), "public", "data", city.id, "events-current.json");
    let events: any[] = [];
    try {
      const raw = JSON.parse(readFileSync(eventsPath, "utf-8"));
      events = Array.isArray(raw) ? raw : ((raw as any).events ?? []);
    } catch {
      continue;
    }

    for (const dateStr of window) {
      const hasEvents = events.some((ev: any) => {
        if (!ev.date_start) return false;
        const end = ev.date_end ?? ev.date_start;
        return ev.date_start <= dateStr && dateStr <= end;
      });
      if (!hasEvents) continue;

      // Priority: today highest, decay over window
      const idx      = window.indexOf(dateStr);
      const priority = idx === 0 ? "0.8" : idx < 7 ? "0.7" : "0.5";

      urls.push(`  <url>
    <loc>${siteUrl}/${city.id}/${dateStr}/</loc>
    <lastmod>${now}</lastmod>
    <changefreq>daily</changefreq>
    <priority>${priority}</priority>
  </url>`);
    }
  }

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join("\n")}
</urlset>`;

  return new Response(xml, {
    headers: { "Content-Type": "application/xml; charset=utf-8" },
  });
}
