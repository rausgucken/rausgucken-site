// src/pages/sitemap-cities.xml.ts
// SEO §11: City landing pages + homepage + about.
// Add new cities here as they are added to the platform.

export async function GET() {
  const siteUrl = "https://rausgucken.de";
  const today   = new Date().toISOString().slice(0, 10);

  const pages = [
    { loc: `${siteUrl}/`,              priority: "1.0", changefreq: "weekly"  },
    { loc: `${siteUrl}/ludwigsburg/`,  priority: "1.0", changefreq: "weekly"  },
    { loc: `${siteUrl}/about`,         priority: "0.5", changefreq: "monthly" },
  ];

  const urls = pages
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
