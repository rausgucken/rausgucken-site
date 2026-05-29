// src/pages/sitemap-cities.xml.ts
// City landing pages, homepage, static editorial pages.
// Venue hub pages are in sitemap-venues.xml — not duplicated here.
// /ludwigsburg/ is the Landkreis umbrella — temporal pages in sitemap-temporal.xml.
// Member city URLs are derived dynamically from public/data/cities.json — do not hardcode.
import { readFileSync } from "fs";
import { join } from "path";

export async function GET() {
  const siteUrl = "https://www.rausgucken.de";
  const today   = new Date().toISOString().slice(0, 10);

  // Load covered member cities from cities.json at build time
  const citiesPath = join(process.cwd(), "public", "data", "cities.json");
  const citiesData: Array<{ id: string; url: string; covered: boolean; type: string }> =
    JSON.parse(readFileSync(citiesPath, "utf-8"));
  const memberCities = citiesData.filter(
    c => c.covered && c.type !== "Landkreis" && c.id !== "ludwigsburg"
  );

  const staticPages = [
    { loc: `${siteUrl}/`,                              priority: "1.0", changefreq: "weekly"  },
    // Landkreis Ludwigsburg umbrella
    { loc: `${siteUrl}/ludwigsburg/`,                  priority: "1.0", changefreq: "weekly"  },
    { loc: `${siteUrl}/ludwigsburg/stadt/`,            priority: "0.8", changefreq: "weekly"  },
    { loc: `${siteUrl}/ludwigsburg/umkreis/`,          priority: "0.8", changefreq: "weekly"  },
    { loc: `${siteUrl}/ludwigsburg/erleben/`,          priority: "0.7", changefreq: "weekly"  },
  ];

  const cityPages = memberCities.map(c => ({
    loc: `${siteUrl}${c.url}`,
    priority: "0.9",
    changefreq: "weekly",
  }));

  const staticFooter = [
    { loc: `${siteUrl}/about`,                         priority: "0.5", changefreq: "monthly" },
    { loc: `${siteUrl}/impressum`,                     priority: "0.3", changefreq: "monthly" },
    { loc: `${siteUrl}/datenschutz`,                   priority: "0.3", changefreq: "monthly" },
  ];

  const pages = [...staticPages, ...cityPages, ...staticFooter];

  const urls = pages.map(p => `
  <url>
    <loc>${p.loc}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>${p.changefreq}</changefreq>
    <priority>${p.priority}</priority>
  </url>`).join("");

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
