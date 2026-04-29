// src/pages/sitemap-tags.xml.ts
// SEO §11: Tag / category hub pages.
// Add new tag pages here as they are created (e.g. /ludwigsburg/kostenlos/, /ludwigsburg/musik/).

export async function GET() {
  const siteUrl = "https://rausgucken.de";
  const today   = new Date().toISOString().slice(0, 10);

  const tagPages = [
    { loc: `${siteUrl}/ludwigsburg/kinder/`, priority: "0.9", changefreq: "weekly" },
    // Future: add /ludwigsburg/kostenlos/, /ludwigsburg/ausstellungen/, etc.
  ];

  const urls = tagPages
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
