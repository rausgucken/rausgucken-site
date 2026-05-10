// src/pages/sitemap-venues.xml.ts
// SEO §11: Venue hub pages — topical authority per institution.
// Add new venue pages here as they are created.
export async function GET() {
  const siteUrl = "https://rausgucken.de";
  const today   = new Date().toISOString().slice(0, 10);
  const venuePages = [
    { loc: `${siteUrl}/ludwigsburg/residenzschloss/`, priority: "0.8", changefreq: "weekly" },
    { loc: `${siteUrl}/ludwigsburg/karlskaserne/`,    priority: "0.8", changefreq: "weekly" },
    { loc: `${siteUrl}/ludwigsburg/stadtbibliothek/`, priority: "0.8", changefreq: "weekly" },
    { loc: `${siteUrl}/ludwigsburg/labyrinth/`,       priority: "0.8", changefreq: "weekly" },
  ];
  const urls = venuePages
    .map(
      (p) => `
  <url>
    <loc>${p.loc}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>${p.changefreq}</changefreq>
    <priority>${p.priority}</priority>
  </url>`
    )
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
