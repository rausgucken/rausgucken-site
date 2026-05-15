// src/pages/sitemap-archive.xml.ts
// Archive sitemap — placeholder until date archive pages are built.
// Returns a valid minimal sitemap rather than an empty urlset.
// Google accepts this without error.

export async function GET() {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
</sitemapindex>`;
  return new Response(xml, {
    headers: { "Content-Type": "application/xml; charset=utf-8" },
  });
}
