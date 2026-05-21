export const onRequest: PagesFunction = async (context) => {
  const url = new URL(context.request.url);

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
