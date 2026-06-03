/**
 * Cloudflare Pages Function
 * Route: /asperg/events/*.ics
 * Only activates for .ics requests.
 */
export async function onRequest(context) {
  const url = new URL(context.request.url);
  if (!url.pathname.endsWith('.ics')) return context.next();
  const slug = url.pathname.replace(/\.ics$/, '').split('/').filter(Boolean).pop();
  if (!slug) return new Response('Not found', { status: 404 });
  let events;
  try {
    const dataUrl = new URL('/data/asperg/events-current.json', url.origin);
    const res = await context.env.ASSETS.fetch(new Request(dataUrl.toString()));
    if (!res.ok) throw new Error(`ASSETS fetch ${res.status}`);
    events = await res.json();
  } catch (err) {
    return new Response(`Failed to load events: ${err.message}`, { status: 500 });
  }
  const event = events.find(e => e.slug === slug);
  if (!event) return new Response('Event not found', { status: 404, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
  return new Response(buildICS(event), { status: 200, headers: { 'Content-Type': 'text/calendar; charset=utf-8', 'Content-Disposition': `attachment; filename="${slug}.ics"`, 'Cache-Control': 'public, max-age=3600' } });
}

function buildICS(ev) {
  const now = utcStamp(new Date());
  const uid = `${ev.slug}@rausgucken.de`;
  const site = 'https://www.rausgucken.de';
  let dtstart, dtend, allDay = false;
  if (ev.time) {
    const startM = ev.time.match(/(\d{1,2}):(\d{2})/);
    if (startM) {
      dtstart = `${ev.date_start.replace(/-/g,'')}T${startM[1].padStart(2,'0')}${startM[2]}00`;
      const endM = ev.time.match(/\d{1,2}:\d{2}\s*[-\u2013]\s*(\d{1,2}):(\d{2})/);
      dtend = endM ? `${(ev.date_end||ev.date_start).replace(/-/g,'')}T${endM[1].padStart(2,'0')}${endM[2]}00` : addHours(dtstart, 1);
    } else { allDay = true; }
  } else { allDay = true; }
  if (allDay) { dtstart = ev.date_start.replace(/-/g,''); dtend = isoDatePlusDays(ev.date_end||ev.date_start,1).replace(/-/g,''); }
  const descParts = [];
  if (ev.description) descParts.push(ev.description);
  if (ev.price) descParts.push(`Preis: ${ev.price}`);
  if (ev.location) descParts.push(`Adresse: ${ev.location}\\nAsperg, Baden-Württemberg`);
  if (ev.original_url) descParts.push(`Originalseite: ${ev.original_url}`);
  descParts.push('Alle Angaben ohne Gewähr.');
  const description = descParts.join('\\n\\n');
  const orgName = ev.source_label || ev.location || 'rausgucken.de';
  const lines = ['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//rausgucken.de//Event Calendar//DE','CALSCALE:GREGORIAN','METHOD:PUBLISH',`X-WR-CALNAME:${escICS(ev.title||'Veranstaltung')}`,'X-WR-TIMEZONE:Europe/Berlin','BEGIN:VEVENT',`UID:${uid}`,`DTSTAMP:${now}Z`,allDay?`DTSTART;VALUE=DATE:${dtstart}`:`DTSTART;TZID=Europe/Berlin:${dtstart}`,allDay?`DTEND;VALUE=DATE:${dtend}`:`DTEND;TZID=Europe/Berlin:${dtend}`,fold(`SUMMARY:${escICS(ev.title||'')}`)];
  if (description) lines.push(fold(`DESCRIPTION:${escICS(description)}`));
  if (ev.location) lines.push(fold(`LOCATION:${escICS(ev.location)}`));
  // URL: points to rausgucken.de deep link (canonical_url set by manifest.py)
  // Original source URL is already in DESCRIPTION for user reference
  const eventUrl = ev.canonical_url || `https://www.rausgucken.de/asperg/events/${ev.slug}`;
  lines.push(`URL:${eventUrl}`);
  lines.push(`ORGANIZER;CN=${escICS(orgName)}:mailto:noreply@rausgucken.de`);
  lines.push(`X-ALT-DESC;FMTTYPE=text/html:<a href="${site}/asperg/events/${ev.slug}">Auf rausgucken.de ansehen</a>`);
  lines.push('END:VEVENT','END:VCALENDAR');
  return lines.join('\r\n') + '\r\n';
}
function escICS(str) { return String(str).replace(/\\/g,'\\\\').replace(/;/g,'\\;').replace(/,/g,'\\,').replace(/\n/g,'\\n').replace(/\r/g,''); }
function fold(line) { if (line.length<=75) return line; let out='',pos=0; while(pos<line.length){if(pos===0){out+=line.slice(0,75);pos=75;}else{out+='\r\n '+line.slice(pos,pos+74);pos+=74;}} return out; }
function utcStamp(d) { return d.toISOString().replace(/[-:]/g,'').replace(/\.\d{3}/,''); }
function addHours(dt,h) { const y=+dt.slice(0,4),mo=+dt.slice(4,6)-1,d=+dt.slice(6,8),hr=+dt.slice(9,11),mi=+dt.slice(11,13); const nd=new Date(Date.UTC(y,mo,d,hr+h,mi)); const p=n=>String(n).padStart(2,'0'); return `${nd.getUTCFullYear()}${p(nd.getUTCMonth()+1)}${p(nd.getUTCDate())}T${p(nd.getUTCHours())}${p(nd.getUTCMinutes())}00`; }
function isoDatePlusDays(iso,n) { const d=new Date(iso+'T00:00:00Z'); d.setUTCDate(d.getUTCDate()+n); return d.toISOString().slice(0,10); }
