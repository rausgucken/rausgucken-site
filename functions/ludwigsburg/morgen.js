import { renderTemporalPage } from "./_temporal.js";
export async function onRequest(context) {
  const d = new Date(); d.setDate(d.getDate() + 1);
  const morgenDE = d.toLocaleDateString("de-DE", { day: "numeric", month: "long", year: "numeric" });
  return renderTemporalPage(context, {
    dataFile: "tomorrow.json",
    pageTitle: `Veranstaltungen in Ludwigsburg morgen (${morgenDE}) | rausgucken.de`,
    h1: "Events in Ludwigsburg morgen",
    metaDesc: `Alle Events in Ludwigsburg morgen, ${morgenDE}. Ausstellungen, Kinder-Events und mehr – täglich aktuell.`,
    canonical: "/ludwigsburg/morgen/",
    ogImage: "/og/ludwigsburg/morgen.jpg",
    breadcrumbLabel: "Morgen",
    schemaName: `Veranstaltungen in Ludwigsburg morgen – ${morgenDE}`,
    emptyHeadline: "Morgen keine eingetragenen Veranstaltungen.",
    emptyLink: { href: "/ludwigsburg/dieses-wochenende", label: "Wochenende →" },
  });
}
