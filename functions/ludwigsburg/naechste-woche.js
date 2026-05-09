import { renderTemporalPage } from "./_temporal.js";
export async function onRequest(context) {
  return renderTemporalPage(context, {
    dataFile: "next-week.json",
    pageTitle: "Veranstaltungen Ludwigsburg nächste Woche | rausgucken.de",
    h1: "Events in Ludwigsburg nächste Woche",
    metaDesc: "Alle Veranstaltungen in Ludwigsburg nächste Woche – Ausstellungen, Workshops, Familienevents und mehr. Täglich aktuell.",
    canonical: "/ludwigsburg/naechste-woche/",
    ogImage: "/og/ludwigsburg/naechste-woche.jpg",
    breadcrumbLabel: "Nächste Woche",
    schemaName: "Veranstaltungen in Ludwigsburg nächste Woche",
    emptyHeadline: "Nächste Woche noch keine Veranstaltungen eingetragen.",
    emptyLink: { href: "/ludwigsburg", label: "Alle Veranstaltungen →" },
  });
}
