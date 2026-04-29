export const onRequest: PagesFunction = async (context) => {
  const url = new URL(context.request.url);
  if (url.hostname.endsWith(".pages.dev")) {
    const newUrl = new URL(url.pathname + url.search, "https://www.rausgucken.de");
    return Response.redirect(newUrl.toString(), 301);
  }
  return context.next();
};
