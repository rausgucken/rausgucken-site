// src/pages/sitemap-events.xml.ts
// SEO §11: All active per-event pages across all cities with lastmod from scraped_at.
// Expired events (date_start > 30 days ago) are excluded.

import ludwigsburgEvents from "../../public/data/ludwigsburg/events-current.json";
import tammEvents from "../../public/data/tamm/events-current.json";
import bietigheimEvents from "../../public/data/bietigheim/events-current.json";
import aspergEvents from "../../public/data/asperg/events-current.json";
import kornwestheimEvents from "../../public/data/kornwestheim/events-current.json";
import markgroeningenEvents from "../../public/data/markgroeningen/events-current.json";
import moegligenEvents from "../../public/data/moeglingen/events-current.json";
import freibergEvents from "../../public/data/freiberg/events-current.json";

export async function GET() {
  const siteUrl = "https://www.rausgucken.de";

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 30);
  const cutoffStr = cutoff.toISOString().slice(0, 10);

  const cityEvents = [
    { city: "ludwigsburg", events: ludwigsburgEvents as any[] },
    { city: "tamm",        events: tammEvents as any[]        },
    { city: "bietigheim",  events: bietigheimEvents as any[]  },
    { city: "asperg",      events: aspergEvents as any[]      },
    { city: "kornwestheim", events: kornwestheimEvents as any[] },
    { city: "markgroeningen", events: markgroeningenEvents as any[] },
    { city: "moeglingen",     events: moegligenEvents as any[]     },
    { city: "freiberg",       events: freibergEvents as any[]      },
  ];

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
