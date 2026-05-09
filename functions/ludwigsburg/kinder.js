import { renderTemporalPage } from "./_temporal.js";
export async function onRequest(context) {
  return renderTemporalPage(context, {
    dataFile: "kinder.json",
    pageTitle: "Kinderveranstaltungen Ludwigsburg – Events für Kinder & Familien | rausgucken.de",
    h1: "Kinderveranstaltungen in Ludwigsburg",
    metaDesc: "Workshops, Mitmach-Aktionen und Ausflüge für Familien in Ludwigsburg. Täglich aktuell, direkt zur Originalseite.",
    canonical: "/ludwigsburg/kinder/",
    ogImage: "/og/ludwigsburg/kinder.jpg",
    breadcrumbLabel: "Kinder & Familie",
    schemaName: "Kinderveranstaltungen in Ludwigsburg",
    emptyHeadline: "Aktuell keine Kinderveranstaltungen eingetragen.",
    emptyLink: { href: "/ludwigsburg", label: "Alle Veranstaltungen →" },
  });
}
