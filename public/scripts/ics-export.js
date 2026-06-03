// public/scripts/ics-export.js
// Client-side ICS generation for collection/temporal pages.
// Call: generateCollectionICS(events, label)

function icsEscape(str) {
  if (!str) return "";
  return String(str)
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "");
}

function icsFold(line) {
  if (line.length <= 75) return line;
  let out = "";
  while (line.length > 75) {
    out += line.slice(0, 75) + "\r\n ";
    line = line.slice(75);
  }
  out += line;
  return out;
}

function buildDt(dateStr, timeStr) {
  if (!dateStr) return null;
  const datePart = dateStr.replace(/-/g, "");
  const timeMatch = timeStr ? timeStr.match(/(\d{1,2}):(\d{2})/) : null;
  if (!timeMatch) {
    return { dtstart: "DTSTART;VALUE=DATE:" + datePart, dtend: "DTEND;VALUE=DATE:" + datePart };
  }
  const hh = String(timeMatch[1]).padStart(2, "0");
  const mm = timeMatch[2];
  const endMatch = timeStr.match(/[-\u2013]\s*(\d{1,2}):(\d{2})/);
  let dtend;
  if (endMatch) {
    dtend = "DTEND:" + datePart + "T" + String(endMatch[1]).padStart(2,"0") + endMatch[2] + "00";
  } else {
    dtend = "DTEND:" + datePart + "T" + String(parseInt(hh,10)+1).padStart(2,"0") + mm + "00";
  }
  return { dtstart: "DTSTART:" + datePart + "T" + hh + mm + "00", dtend };
}

function buildUID(ev) {
  const base = ev.canonical_url || ev.slug || ev.title || Math.random().toString(36);
  return base.replace(/^https?:\/\/(www\.)?/, "").replace(/\//g, "-") + "@rausgucken.de";
}

function dtstamp() {
  return new Date().toISOString().replace(/[-:]/g,"").split(".")[0] + "Z";
}

function toVevent(ev) {
  const dt = buildDt(ev.date_start, ev.time);
  if (!dt) return null;
  const lines = [
    "BEGIN:VEVENT",
    icsFold("UID:" + buildUID(ev)),
    "DTSTAMP:" + dtstamp(),
    icsFold(dt.dtstart),
    icsFold(dt.dtend),
    icsFold("SUMMARY:" + icsEscape(ev.title)),
  ];
  if (ev.location)      lines.push(icsFold("LOCATION:"    + icsEscape(ev.location)));
  if (ev.description)   lines.push(icsFold("DESCRIPTION:" + icsEscape(ev.description)));
  if (ev.canonical_url) lines.push(icsFold("URL:"         + ev.canonical_url));
  if (ev.price && ev.price !== "Kostenlos") lines.push(icsFold("X-COST:" + icsEscape(ev.price)));
  lines.push("END:VEVENT");
  return lines.join("\r\n");
}

export function generateCollectionICS(events, label) {
  if (!events || events.length === 0) {
    alert("Keine Veranstaltungen zum Exportieren.");
    return;
  }
  const vevents = events.map(toVevent).filter(Boolean).join("\r\n");
  const cal = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//rausgucken.de//Collection Export//DE",
    icsFold("X-WR-CALNAME:" + icsEscape(label)),
    "X-WR-TIMEZONE:Europe/Berlin",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    vevents,
    "END:VCALENDAR",
  ].join("\r\n");
  const blob = new Blob([cal], { type: "text/calendar;charset=utf-8" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href     = url;
  a.download = label.toLowerCase().replace(/\s+/g,"-").replace(/[^a-z0-9-]/g,"") + ".ics";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
