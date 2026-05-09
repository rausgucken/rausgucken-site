// functions/ludwigsburg/_temporal.js
const SITE_URL = "https://www.rausgucken.de";

const TAG_LABELS = {
  Ausstellung:"Ausstellung",Entertainment:"Entertainment",Familie:"Familie",
  Fest:"Fest",Fuehrung:"Führung",Jugend:"Jugend",Kinder:"Kinder",
  Kulinarik:"Kulinarik",Lesung:"Lesung",Messe:"Messe",Musik:"Musik",
  Outdoor:"Outdoor",Sport:"Sport",Sprache:"Sprache",Tanz:"Tanz",
  Theater:"Theater",Vortrag:"Vortrag",Workshop:"Workshop",
};

function esc(str){
  return String(str??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}

function fmtDE(iso){
  if(!iso)return null;
  const d=new Date(iso+"T12:00:00");
  return{
    day:d.getDate(),
    month:d.toLocaleDateString("de-DE",{month:"short"}),
    weekday:d.toLocaleDateString("de-DE",{weekday:"short"}),
    full:d.toLocaleDateString("de-DE",{day:"numeric",month:"long",year:"numeric"}),
  };
}

function card(ev){
  const dt=fmtDE(ev.date_start);
  const tags=(ev.tags||[]);
  const desc=ev.description||"";
  const short=desc.length>110?desc.slice(0,110)+"\u2026":desc;
  const loc=(ev.location||"").replace("Residenzschloss Ludwigsburg","Residenzschloss LB");
  const freshness=ev.scraped_at?new Date(ev.scraped_at).toLocaleDateString("de-DE",{day:"numeric",month:"short"}):"";

  const dateBadge=dt
    ?`<div class="date-badge" aria-hidden="true"><span class="date-weekday">${esc(dt.weekday)}</span><span class="date-day">${esc(dt.day)}</span><span class="date-month">${esc(dt.month)}</span></div>`
    :`<div class="date-badge date-badge--standing" aria-hidden="true"><span class="date-infinity">\u221e</span><span class="date-month">immer</span></div>`;

  const tagsHtml=tags.slice(0,3).map(t=>`<span class="tag">${esc(TAG_LABELS[t]??t)}</span>`).join("");
  const ageBadge=ev.age_min!=null?`<span class="tag tag--age">ab ${esc(ev.age_min)} J.${ev.age_max?`\u2013${esc(ev.age_max)}`:"+"}</span>`:"";
  const newBadge=ev.is_new?`<span class="badge-new">Neu</span>`:"";

  const meta=[];
  if(ev.time)meta.push(`<span class="meta-item">${esc(ev.time)} Uhr</span>`);
  if(loc)meta.push(`<span class="meta-item">${esc(loc)}</span>`);
  if(ev.price)meta.push(`<span class="meta-item">${esc(ev.price.split(" ").slice(0,3).join(" "))}</span>`);

  const cls=["event-card",!ev.date_start?"event-card--standing":"",ev.is_new?"event-card--new":""].filter(Boolean).join(" ");
  const aria=`${ev.title}${dt?`, ${dt.full}`:""}`;

  return `<article class="${cls}" data-tags="${esc(tags.join(","))}" data-age-min="${esc(ev.age_min??"")}" data-age-max="${esc(ev.age_max??"")}" data-date="${esc(ev.date_start??"")}">
  <a href="/ludwigsburg/events/${esc(ev.slug||"")}" class="card-link" aria-label="${esc(aria)}">
    ${dateBadge}
    <div class="card-body">
      <div class="card-tags">${newBadge}${tagsHtml}${ageBadge}</div>
      <h3 class="card-title">${esc(ev.title)}</h3>
      <div class="card-meta">${meta.join("")}</div>
      ${short?`<p class="card-desc">${esc(short)}</p>`:""}
    </div>
  </a>
  <div class="card-footer">
    <a href="${esc(ev.original_url||ev.link||"#")}" target="_blank" rel="noopener noreferrer" class="source-link" onclick="event.stopPropagation()">Originalseite \u2197</a>
    ${freshness?`<span class="freshness-stamp">Gepr\u00fcft: ${esc(freshness)}</span>`:""}
  </div>
</article>`;
}

export async function renderTemporalPage(context,{dataFile,pageTitle,h1,metaDesc,canonical,ogImage,breadcrumbLabel,schemaName,emptyHeadline,emptyLink}){
  let events=[];
  try{
    const url=new URL(`/data/ludwigsburg/${dataFile}`,SITE_URL);
    const res=await context.env.ASSETS.fetch(new Request(url.toString()));
    if(res.ok){const raw=await res.json();events=Array.isArray(raw)?raw:(raw.events??[]);}
  }catch(e){}

  const now=new Date();
  const todayDE=now.toLocaleDateString("de-DE",{day:"numeric",month:"long",year:"numeric"});
  const count=events.length;
  const title=pageTitle.replace("{date}",todayDE).replace("{count}",String(count));
  const desc=metaDesc.replace("{date}",todayDE).replace("{count}",String(count));

  const collSchema=JSON.stringify({"@context":"https://schema.org","@type":"CollectionPage","name":schemaName,"description":desc,"url":`${SITE_URL}${canonical}`,"inLanguage":"de-DE","numberOfItems":count});
  const bcSchema=JSON.stringify({"@context":"https://schema.org","@type":"BreadcrumbList","itemListElement":[{"@type":"ListItem","position":1,"name":"rausgucken.de","item":SITE_URL},{"@type":"ListItem","position":2,"name":"Ludwigsburg","item":`${SITE_URL}/ludwigsburg/`},{"@type":"ListItem","position":3,"name":breadcrumbLabel,"item":`${SITE_URL}${canonical}`}]});

  const cardsHtml=count>0
    ?`<div class="event-list" id="event-list">${events.map(card).join("")}</div>`
    :`<div class="empty-today"><div class="empty-inner"><p class="empty-headline">${esc(emptyHeadline)}</p><p class="empty-body">Trotzdem lohnt sich ein Ausflug nach Ludwigsburg!</p><div class="empty-ctas"><a href="${esc(emptyLink.href)}" class="btn-cta">${esc(emptyLink.label)}</a><a href="/ludwigsburg" class="btn-cta btn-cta--ghost">Alle Veranstaltungen</a></div></div></div>`;

  const html=`<!DOCTYPE html>
<html lang="de-DE">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${SITE_URL}${canonical}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:image" content="${SITE_URL}${ogImage}">
<meta property="og:url" content="${SITE_URL}${canonical}">
<meta property="og:type" content="website">
<meta property="og:locale" content="de_DE">
<meta name="twitter:card" content="summary_large_image">
<link rel="alternate" hreflang="de" href="${SITE_URL}${canonical}">
<script type="application/ld+json">${collSchema}</script>
<script type="application/ld+json">${bcSchema}</script>
<script>(function(){try{var s=localStorage.getItem('rausgucken-color-scheme');var p=window.matchMedia('(prefers-color-scheme: dark)').matches;if(s==='dark'||(!s&&p)){document.documentElement.classList.add('dark');}}catch(e){}})();</script>
<link rel="stylesheet" href="/styles/global.css">
<link rel="icon" href="/favicon.ico">
</head>
<body>
<header class="site-header">
  <a href="/" class="site-logo" aria-label="rausgucken.de Startseite"><img src="/images/logo.png" alt="rausgucken.de" width="140" height="36" loading="eager"></a>
  <nav class="header-nav" aria-label="Hauptnavigation"><a href="/ludwigsburg">Ludwigsburg</a><a href="/about">Über uns</a></nav>
</header>
<main class="main-content" id="main-content">
  <nav class="breadcrumb" aria-label="Brotkrumennavigation"><a href="/">rausgucken.de</a> › <a href="/ludwigsburg">Ludwigsburg</a> › <span aria-current="page">${esc(breadcrumbLabel)}</span></nav>
  <div class="page-header"><h1>${esc(h1)}</h1><p class="page-subtitle">${count>0?`${count} Veranstaltungen · `:""}${todayDE}</p></div>
  <div id="events-container" aria-live="polite">${cardsHtml}</div>
  <nav class="temporal-nav" aria-label="Andere Zeiträume">
    <p class="temporal-label">Andere Zeiträume</p>
    <div class="temporal-links">
      <a href="/ludwigsburg/heute">Heute</a>
      <a href="/ludwigsburg/morgen">Morgen</a>
      <a href="/ludwigsburg/dieses-wochenende">Dieses Wochenende</a>
      <a href="/ludwigsburg/naechste-woche">Nächste Woche</a>
      <a href="/ludwigsburg/kinder">Kinder &amp; Familie</a>
      <a href="/ludwigsburg">Alle Veranstaltungen</a>
    </div>
  </nav>
</main>
<footer class="site-footer">
  <p>Alle Angaben ohne Gewähr. Quellen: Originalseiten der Veranstalter.</p>
  <nav aria-label="Footer-Navigation"><a href="/impressum">Impressum</a> · <a href="/datenschutz">Datenschutz</a> · <a href="/about">Über rausgucken.de</a></nav>
</footer>
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
:root{--coral:#FF6F61;--coral-dark:#e55a4c;--coral-light:#fff0ee;--sage:#90BE6D;--sage-light:#f0f7ea;--surface:#FFFDF9;--surface-card:#FFFFFF;--border:rgba(55,63,81,0.1);--text:#373F51;--text-60:rgba(55,63,81,0.6);--tag-bg:rgba(55,63,81,0.07);--radius:12px;--radius-sm:8px;--shadow-card:0 4px 6px -1px rgba(0,0,0,0.05),0 2px 4px -1px rgba(0,0,0,0.03);--shadow-hover:0 10px 15px -3px rgba(0,0,0,0.1),0 4px 6px -2px rgba(0,0,0,0.05);--font-heading:'Nunito',sans-serif;--font-body:'Inter',sans-serif}
html.dark{--surface:#373F51;--surface-card:#444857;--border:rgba(255,255,255,0.06);--text:#FFFDF9;--text-60:rgba(255,253,249,0.6);--coral-light:rgba(255,111,97,0.12);--sage-light:rgba(144,190,109,0.12);--tag-bg:rgba(255,255,255,0.09);--shadow-card:0 2px 8px rgba(0,0,0,0.22)}
body{font-family:var(--font-body);background:var(--surface);color:var(--text);line-height:1.6}
a{color:inherit}
.site-header{display:flex;align-items:center;justify-content:space-between;padding:0.75rem 1.5rem;border-bottom:1px solid var(--border);max-width:1100px;margin:0 auto;width:100%}
.site-logo img{display:block}
.header-nav{display:flex;gap:1.5rem;font-size:0.875rem;font-weight:500}
.header-nav a{text-decoration:none;color:var(--text-60)}
.header-nav a:hover{color:var(--coral)}
.main-content{max-width:720px;margin:0 auto;padding:1.5rem 1rem 3rem}
.breadcrumb{font-size:0.8rem;color:var(--text-60);margin-bottom:1.5rem}
.breadcrumb a{text-decoration:none;color:var(--text-60)}
.breadcrumb a:hover{color:var(--coral)}
.page-header{margin-bottom:1.5rem}
.page-header h1{font-family:var(--font-heading);font-weight:800;font-size:1.75rem;line-height:1.2}
.page-subtitle{color:var(--text-60);font-size:0.9rem;margin-top:0.4rem}
.event-list{display:flex;flex-direction:column;gap:0.75rem}
.event-card{background:var(--surface-card);border:1px solid var(--border);border-radius:var(--radius);overflow:hidden;display:flex;flex-direction:column;box-shadow:var(--shadow-card);position:relative;transition:transform 200ms cubic-bezier(0.4,0,0.2,1),box-shadow 200ms}
@media(prefers-reduced-motion:no-preference){.event-card:hover{transform:translateY(-4px);box-shadow:var(--shadow-hover)}}
.event-card:focus-within{outline:2px solid var(--coral);outline-offset:0}
.event-card--standing{border-left:3px solid var(--coral)}
.event-card--new{border-left:3px solid var(--sage)}
.card-link{display:flex;flex:1;text-decoration:none;color:inherit;outline:none}
.date-badge{background:var(--coral);color:var(--text);display:flex;flex-direction:column;align-items:center;justify-content:center;min-width:58px;flex-shrink:0;padding:0.75rem 0.4rem}
.date-badge--standing{background:var(--tag-bg);color:var(--text-60)}
.date-weekday{font-size:0.6rem;font-weight:700;text-transform:uppercase;letter-spacing:0.07em;opacity:0.75}
.date-day{font-family:var(--font-heading);font-weight:800;font-size:1.5rem;line-height:1}
.date-month{font-size:0.65rem;font-weight:700;text-transform:uppercase;letter-spacing:0.07em;opacity:0.8}
.date-infinity{font-size:1.4rem;line-height:1;opacity:0.5}
.card-body{padding:0.85rem 1rem 0.75rem;flex:1;display:flex;flex-direction:column;gap:0.4rem;min-width:0}
.card-tags{display:flex;flex-wrap:wrap;gap:0.3rem;align-items:center}
.tag{background:var(--tag-bg);color:var(--text-60);font-size:0.7rem;font-weight:500;padding:2px 8px;border-radius:20px;white-space:nowrap}
.tag--age{background:var(--sage-light);color:var(--text);font-weight:600}
.badge-new{background:var(--sage);color:var(--text);font-size:0.65rem;font-weight:700;padding:2px 7px;border-radius:20px;text-transform:uppercase;letter-spacing:0.06em}
.card-title{font-family:var(--font-heading);font-weight:700;font-size:0.97rem;color:var(--text);line-height:1.3;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.card-meta{display:flex;flex-direction:column;gap:0.2rem}
.meta-item{font-size:0.78rem;font-weight:500;color:var(--text-60)}
.card-desc{font-size:0.8rem;color:var(--text-60);line-height:1.5;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;margin-top:0.1rem}
.card-footer{display:flex;justify-content:space-between;align-items:center;padding:0.5rem 1rem;border-top:1px solid var(--border);background:rgba(0,0,0,0.02)}
html.dark .card-footer{background:rgba(255,255,255,0.03)}
.source-link{display:inline-flex;align-items:center;gap:0.3rem;font-size:0.75rem;font-weight:600;color:var(--text-60);text-decoration:none;min-height:44px}
.source-link:hover{color:var(--coral)}
.freshness-stamp{font-size:0.67rem;color:var(--text);opacity:0.70}
.empty-today{padding:2rem 0}
.empty-inner{background:var(--surface-card);border:1px solid var(--border);border-radius:var(--radius);padding:2.5rem 2rem;text-align:center}
.empty-headline{font-family:var(--font-heading);font-weight:700;font-size:1.1rem;margin-bottom:0.5rem}
.empty-body{color:var(--text-60);margin-bottom:1.5rem}
.empty-ctas{display:flex;gap:0.75rem;justify-content:center;flex-wrap:wrap}
.btn-cta{display:inline-flex;align-items:center;height:44px;padding:0 1.25rem;background:var(--coral);color:var(--text);border-radius:var(--radius-sm);font-weight:600;font-size:0.875rem;text-decoration:none}
.btn-cta:hover{background:var(--coral-dark)}
.btn-cta--ghost{background:var(--tag-bg);color:var(--text-60)}
.temporal-nav{margin-top:3rem;padding-top:1.5rem;border-top:1px solid var(--border)}
.temporal-label{font-size:0.78rem;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:var(--text-60);margin-bottom:0.65rem}
.temporal-links{display:flex;flex-wrap:wrap;gap:0.5rem}
.temporal-links a{display:inline-flex;align-items:center;height:36px;padding:0 0.85rem;background:var(--tag-bg);color:var(--text-60);border-radius:20px;font-size:0.82rem;font-weight:500;text-decoration:none}
.temporal-links a:hover{background:var(--coral-light);color:var(--coral)}
.site-footer{border-top:1px solid var(--border);padding:1.5rem 1rem;text-align:center;font-size:0.8rem;color:var(--text-60);max-width:720px;margin:0 auto}
.site-footer nav{margin-top:0.5rem}
.site-footer a{color:var(--text-60);text-decoration:none}
.site-footer a:hover{color:var(--coral)}
</style>
</body>
</html>`;

  return new Response(html,{status:200,headers:{"Content-Type":"text/html;charset=UTF-8","Cache-Control":"public, max-age=3600, stale-while-revalidate=86400","X-Robots-Tag":"index, follow"}});
}
