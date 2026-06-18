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

  // Block crawlers on *.pages.dev + redirect to www
  if (url.hostname.endsWith(".pages.dev")) {
    // Serve noindex header before redirecting — prevents crawlers indexing pages.dev
    if (context.request.headers.get("user-agent")?.match(/googlebot|bingbot|slurp|duckduckbot|baiduspider|yandexbot/i)) {
      return new Response("Moved", {
        status: 301,
        headers: {
          "Location": new URL(url.pathname + url.search, "https://www.rausgucken.de").toString(),
          "X-Robots-Tag": "noindex, nofollow",
        }
      });
    }
    const newUrl = new URL(url.pathname + url.search, "https://www.rausgucken.de");
    return Response.redirect(newUrl.toString(), 301);
  }

  // Redirect bare domain → www
  if (url.hostname === "rausgucken.de") {
    const newUrl = new URL(url.pathname + url.search, "https://www.rausgucken.de");
    return Response.redirect(newUrl.toString(), 301);
  }

  // Enforce trailing slash on all paths (except files with extensions)
  if (!url.pathname.endsWith('/') && !url.pathname.match(/\.[a-zA-Z0-9]+$/)) {
    const newUrl = new URL(url.pathname + '/' + url.search, url.origin);
    return Response.redirect(newUrl.toString(), 301);
  }
  return context.next();
};
