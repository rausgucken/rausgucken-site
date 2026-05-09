import { renderTemporalPage } from "./_temporal.js";
export async function onRequest(context) {
  return renderTemporalPage(context, {
    dataFile: "this-weekend.json",
    pageTitle: "Veranstaltungen Ludwigsburg dieses Wochenende | rausgucken.de",
    h1: "Events in Ludwigsburg dieses Wochenende",
    metaDesc: "Was ist los in Ludwigsburg dieses Wochenende? Ausstellungen, Kinder-Events, Führungen und mehr – aktuell & übersichtlich.",
    canonical: "/ludwigsburg/dieses-wochenende/",
    ogImage: "/og/ludwigsburg/dieses-wochenende.jpg",
    breadcrumbLabel: "Dieses Wochenende",
    schemaName: "Veranstaltungen in Ludwigsburg dieses Wochenende",
    emptyHeadline: "Dieses Wochenende keine eingetragenen Veranstaltungen.",
    emptyLink: { href: "/ludwigsburg/naechste-woche", label: "Nächste Woche →" },
  });
}
