// src/pages/sitemap-cities.xml.ts
// City landing pages, homepage, static editorial pages.
// Venue hub pages are in sitemap-venues.xml — not duplicated here.
// /ludwigsburg/ is the Landkreis umbrella — temporal pages in sitemap-temporal.xml.

export async function GET() {
  const siteUrl = "https://www.rausgucken.de";
  const today   = new Date().toISOString().slice(0, 10);

  const pages = [
    { loc: `${siteUrl}/`,                              priority: "1.0", changefreq: "weekly"  },
    // Landkreis Ludwigsburg umbrella
    { loc: `${siteUrl}/ludwigsburg/`,                  priority: "1.0", changefreq: "weekly"  },
    { loc: `${siteUrl}/ludwigsburg/stadt/`,            priority: "0.8", changefreq: "weekly"  },
    { loc: `${siteUrl}/ludwigsburg/umkreis/`,          priority: "0.8", changefreq: "weekly"  },
    { loc: `${siteUrl}/ludwigsburg/erleben/`,          priority: "0.7", changefreq: "weekly"  },
    // Stadt-level city pages (flat URLs — canonical SEO)
    { loc: `${siteUrl}/tamm/`,                         priority: "0.9", changefreq: "weekly"  },
    { loc: `${siteUrl}/remseck/`,                       priority: "0.9", changefreq: "weekly"  },
    { loc: `${siteUrl}/bietigheim/`,                   priority: "0.9", changefreq: "weekly"  },
    { loc: `${siteUrl}/asperg/`,                          priority: "0.9", changefreq: "weekly"  },
    { loc: `${siteUrl}/freiberg/`,                       priority: "0.9", changefreq: "weekly"  },
    { loc: `${siteUrl}/markgroeningen/`,                   priority: "0.9", changefreq: "weekly"  },
    { loc: `${siteUrl}/moeglingen/`,                       priority: "0.9", changefreq: "weekly"  },
    { loc: `${siteUrl}/kornwestheim/`,                     priority: "0.9", changefreq: "weekly"  },
    // Static pages
    { loc: `${siteUrl}/about`,                         priority: "0.5", changefreq: "monthly" },
    { loc: `${siteUrl}/impressum`,                     priority: "0.3", changefreq: "monthly" },
    { loc: `${siteUrl}/datenschutz`,                   priority: "0.3", changefreq: "monthly" },
  ];

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
