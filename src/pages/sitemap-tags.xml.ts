// src/pages/sitemap-tags.xml.ts
// Tag landing pages for all 18 approved tags — /ludwigsburg/tags/{tag}/

export async function GET() {
  const siteUrl = "https://www.rausgucken.de";
  const today   = new Date().toISOString().slice(0, 10);

  const TAGS = [
    "Ausstellung", "Entertainment", "Familie", "Fest", "Fuehrung",
    "Jugend", "Kinder", "Kulinarik", "Lesung", "Messe", "Musik",
    "Outdoor", "Sport", "Sprache", "Tanz", "Theater", "Vortrag", "Workshop",
  ];

  const urls = TAGS.map(tag => `
  <url>
    <loc>${siteUrl}/ludwigsburg/tags/${tag}/</loc>
    <lastmod>${today}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.7</priority>
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
