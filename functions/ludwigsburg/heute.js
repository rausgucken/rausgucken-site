import { renderTemporalPage } from "./_temporal.js";
export async function onRequest(context) {
  const now = new Date();
  const todayDE = now.toLocaleDateString("de-DE", { day: "numeric", month: "long", year: "numeric" });
  return renderTemporalPage(context, {
    dataFile: "today.json",
    pageTitle: `Veranstaltungen in Ludwigsburg heute (${todayDE}) | rausgucken.de`,
    h1: "Events in Ludwigsburg heute",
    metaDesc: `Alle Events in Ludwigsburg heute, ${todayDE}. Führungen, Ausstellungen, Kinder, Kultur – täglich aktuell.`,
    canonical: "/ludwigsburg/heute/",
    ogImage: "/og/ludwigsburg/heute.jpg",
    breadcrumbLabel: "Heute",
    schemaName: `Veranstaltungen in Ludwigsburg heute – ${todayDE}`,
    emptyHeadline: "Heute keine eingetragenen Veranstaltungen.",
    emptyLink: { href: "/ludwigsburg/dieses-wochenende", label: "Wochenende →" },
  });
}
