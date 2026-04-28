// src/pages/sitemap-temporal.xml.ts
// SEO §11: Temporal intent pages — never expire, always in main sitemap.
// §2: /heute/, /morgen/ etc. are permanent keyword landing pages.
// lastmod = today's date (these pages update daily via data swap).

export async function GET() {
  const siteUrl = "https://rausgucken.de";
  const today   = new Date().toISOString().slice(0, 10);

  const temporalPages = [
    { loc: `${siteUrl}/ludwigsburg/heute/`,              changefreq: "daily",   priority: "1.0" },
    { loc: `${siteUrl}/ludwigsburg/morgen/`,             changefreq: "daily",   priority: "0.9" },
    { loc: `${siteUrl}/ludwigsburg/dieses-wochenende/`,  changefreq: "daily",   priority: "0.9" },
    { loc: `${siteUrl}/ludwigsburg/naechste-woche/`,     changefreq: "weekly",  priority: "0.8" },
  ];

  const urls = temporalPages.map(p => `
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
