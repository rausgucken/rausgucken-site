// Legacy page redirects — 301 permanent
const LEGACY_REDIRECTS: Record<string, string> = {
  "/ludwigsburg/kinder":    "/ludwigsburg/",
  "/ludwigsburg/kinder/":   "/ludwigsburg/",
  "/ludwigsburg/kostenlos": "/ludwigsburg/",
  "/ludwigsburg/kostenlos/":"/ludwigsburg/",
};

export const onRequest: PagesFunction = async (context) => {
  const url = new URL(context.request.url);

  // Legacy page 301 redirects
  const redirect = LEGACY_REDIRECTS[url.pathname];
  if (redirect) {
    return Response.redirect("https://www.rausgucken.de" + redirect, 301);
  }

  // Redirect *.pages.dev → www.rausgucken.de
  if (url.hostname.endsWith(".pages.dev")) {
    const newUrl = new URL(url.pathname + url.search, "https://www.rausgucken.de");
    return Response.redirect(newUrl.toString(), 301);
  }

  // Redirect bare domain → www
  if (url.hostname === "rausgucken.de") {
    const newUrl = new URL(url.pathname + url.search, "https://www.rausgucken.de");
    return Response.redirect(newUrl.toString(), 301);
  }

  return context.next();
};
