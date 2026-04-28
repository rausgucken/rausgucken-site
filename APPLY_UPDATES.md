# Repo Update Bundle

Copy every file in this bundle into your repo root, preserving paths. Then:

```
git add -A
git commit -m "feat: temporal pages, updated Base/FilterBar/EventCard/slug, sitemaps, about"
git push
```

## What's included

| Dest path | Source | Notes |
|---|---|---|
| src/layouts/Base.astro | Base__1_.astro | lang=de-DE, hreflang, schema slot, noindex prop |
| src/components/FilterBar.astro | FilterBar__1_.astro | Temporal shortcut pills |
| src/components/EventCard.astro | files7/EventCard.astro | Updated card |
| src/scripts/ → public/scripts/app.js | files7/app.js | Filter logic |
| src/pages/ludwigsburg/index.astro | files7/index.astro | Main city hub |
| src/pages/ludwigsburg/events/[slug].astro | _slug___1_.astro | RelatedPages, better schema |
| src/pages/ludwigsburg/heute/index.astro | index.astro (upload) | Temporal page |
| src/pages/ludwigsburg/morgen/index.astro | morgen-index.astro | Temporal page |
| src/pages/ludwigsburg/dieses-wochenende/index.astro | dieses-wochenende-index.astro | Temporal page |
| src/pages/ludwigsburg/naechste-woche/index.astro | naechste-woche-index.astro | Temporal page |
| src/pages/ludwigsburg/kinder/index.astro | kinder-index.astro | Kinder/Familie page |
| src/pages/about.astro | files8/about.astro | Full E-E-A-T about page |
| src/pages/sitemap.xml.ts | sitemap_xml.ts | Sitemap index |
| src/pages/sitemap-temporal.xml.ts | sitemap-temporal_xml.ts | Temporal sitemap |
| src/pages/sitemap-{cities,events,tags,archive}.xml.ts | generated | Stubs, expand later |
| public/robots.txt | robots.txt | |
| public/images/logo.png | files8/logo.png | |
| public/scripts/app.js | files7/app.js | |
| public/data/ludwigsburg/{today,tomorrow,this-weekend,next-week,kinder}.json | generated | **Placeholder** — overwritten by data-swap cron |

## Next step
Build the daily data-swap cron that reads events-current.json and writes today/tomorrow/this-weekend/next-week/kinder.json.
