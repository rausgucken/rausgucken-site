/**
 * rausgucken.de Embeddable Event Widget v1.0
 *
 * Usage: <div data-rausgucken-city="ludwigsburg"></div>
 *        <script src="https://www.rausgucken.de/widget.js" async></script>
 *
 * Attributes:
 *   data-rausgucken-city    required. e.g. "ludwigsburg", "tamm", "bietigheim", "landkreis-ludwigsburg"
 *   data-rausgucken-limit   max events (default 5, max 20)
 *   data-rausgucken-tags    comma-separated e.g. "Kinder,Familie"
 *   data-rausgucken-theme   "light" (default) or "dark"
 */
(function () {
  'use strict';
  const BASE = 'https://www.rausgucken.de';
  const FONT_URL = 'https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800&display=swap';
  const TAG_LABELS = {
    Ausstellung:'Ausstellung',Entertainment:'Entertainment',Familie:'Familie',
    Fest:'Fest',Fuehrung:'F\u00fchrung',Jugend:'Jugend',Kinder:'Kinder',
    Kulinarik:'Kulinarik',Lesung:'Lesung',Messe:'Messe',Musik:'Musik',
    Outdoor:'Outdoor',Sport:'Sport',Sprache:'Sprache',Tanz:'Tanz',
    Theater:'Theater',Vortrag:'Vortrag',Workshop:'Workshop'
  };
  const DE_MONTHS = ['Jan','Feb','M\u00e4r','Apr','Mai','Jun','Jul','Aug','Sep','Okt','Nov','Dez'];

  function injectStyles() {
    if (document.getElementById('rg-widget-styles')) return;
    const style = document.createElement('style');
    style.id = 'rg-widget-styles';
    style.textContent = `
@import url('${FONT_URL}');
.rg-widget{--rg-coral:#FF6F61;--rg-coral-dark:#e55a4d;--rg-text:#373F51;--rg-text-60:rgba(55,63,81,0.60);--rg-border:rgba(55,63,81,0.10);--rg-bg:#FFFDF9;--rg-card:#ffffff;--rg-tag-bg:rgba(55,63,81,0.07);font-family:'Nunito',sans-serif;color:var(--rg-text);background:var(--rg-bg);border:1px solid var(--rg-border);border-radius:12px;overflow:hidden;max-width:520px;width:100%;box-sizing:border-box;}
.rg-widget[data-rausgucken-theme="dark"]{--rg-text:#f0ede8;--rg-text-60:rgba(240,237,232,0.60);--rg-border:rgba(240,237,232,0.12);--rg-bg:#1e2030;--rg-card:#252837;--rg-tag-bg:rgba(240,237,232,0.08);}
.rg-widget *{box-sizing:border-box;}
.rg-header{display:flex;align-items:center;gap:8px;padding:14px 16px 10px;border-bottom:1px solid var(--rg-border);background:var(--rg-bg);}
.rg-logo-mark{width:22px;height:22px;flex-shrink:0;}
.rg-header-city{font-size:13px;font-weight:700;color:var(--rg-text);flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.rg-header-count{font-size:12px;color:var(--rg-text-60);font-weight:600;}
.rg-list{list-style:none;margin:0;padding:0;}
.rg-item{display:grid;grid-template-columns:52px 1fr;gap:0 12px;padding:12px 16px;border-bottom:1px solid var(--rg-border);text-decoration:none;color:inherit;transition:background 0.15s;cursor:pointer;}
.rg-item:last-child{border-bottom:none;}
.rg-item:hover{background:var(--rg-tag-bg);}
.rg-date-col{display:flex;flex-direction:column;align-items:center;justify-content:flex-start;padding-top:2px;}
.rg-date-day{font-size:20px;font-weight:800;line-height:1;color:var(--rg-coral);}
.rg-date-mon{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:var(--rg-text-60);margin-top:2px;}
.rg-date-range{font-size:9px;color:var(--rg-text-60);font-weight:600;margin-top:4px;text-align:center;line-height:1.3;}
.rg-content{}
.rg-title{font-size:13px;font-weight:700;line-height:1.35;color:var(--rg-text);margin:0 0 4px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;}
.rg-meta{font-size:11px;color:var(--rg-text-60);font-weight:600;margin:0 0 5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.rg-tags{display:flex;flex-wrap:wrap;gap:3px;}
.rg-tag{font-size:10px;font-weight:700;color:var(--rg-text-60);background:var(--rg-tag-bg);border-radius:4px;padding:1px 5px;}
.rg-tag-new{background:var(--rg-coral);color:#fff;}
.rg-footer{display:flex;align-items:center;justify-content:space-between;padding:8px 16px;background:var(--rg-bg);border-top:1px solid var(--rg-border);}
.rg-powered{font-size:11px;color:var(--rg-text-60);font-weight:600;}
.rg-powered a{color:var(--rg-coral);text-decoration:none;font-weight:800;}
.rg-powered a:hover{text-decoration:underline;}
.rg-all-link{font-size:11px;font-weight:700;color:var(--rg-coral);text-decoration:none;display:flex;align-items:center;gap:3px;}
.rg-all-link:hover{text-decoration:underline;}
.rg-state{padding:28px 16px;text-align:center;font-size:13px;color:var(--rg-text-60);font-weight:600;}
.rg-state-dot{display:inline-block;width:6px;height:6px;border-radius:50%;background:var(--rg-coral);margin-right:6px;animation:rg-pulse 1.2s ease-in-out infinite;}
@keyframes rg-pulse{0%,100%{opacity:1;}50%{opacity:0.3;}}
    `;
    document.head.appendChild(style);
  }

  function logoSVG(color) {
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 160" class="rg-logo-mark">'
      + '<circle cx="62" cy="98" r="32" fill="' + color + '"/>'
      + '<circle cx="114" cy="114" r="16" fill="' + color + '"/>'
      + '<path d="M75 36 L124 36 L124 85" fill="none" stroke="' + color + '" stroke-width="12" stroke-linecap="round" stroke-linejoin="round"/>'
      + '</svg>';
  }

  function formatDate(dateStr) {
    if (!dateStr) return { day: '\u221e', mon: 'immer' };
    const d = new Date(dateStr + 'T00:00:00');
    return { day: d.getDate(), mon: DE_MONTHS[d.getMonth()] };
  }

  function todayISO() { return new Date().toISOString().slice(0, 10); }

  function isUpcoming(ev) {
    const today = todayISO();
    if (!ev.date_start) return true;
    if (ev.date_end) return ev.date_end >= today;
    return ev.date_start >= today;
  }

  function escapeHtml(s) {
    return String(s || '')
      .replace(/&/g,'&amp;').replace(/</g,'&lt;')
      .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  function renderEvent(ev, city) {
    const d = formatDate(ev.date_start);
    const ongoing = ev.date_end && ev.date_end !== ev.date_start;
    const metaParts = [];
    if (ev.time) metaParts.push(ev.time.replace(' Uhr','') + ' Uhr');
    if (ev.location) metaParts.push(ev.location);
    const meta = metaParts.join(' \u00b7 ');
    const tags = (ev.tags || []).slice(0,3).map(t =>
      '<span class="rg-tag">' + (TAG_LABELS[t] || t) + '</span>'
    ).join('');
    const newBadge = ev.is_new ? '<span class="rg-tag rg-tag-new">Neu</span>' : '';
    const url = BASE + '/' + (ev.city || city) + '/events/' + ev.slug;
    const dateRange = ongoing
      ? '<span class="rg-date-range">bis<br>' + formatDate(ev.date_end).day + '. ' + formatDate(ev.date_end).mon + '</span>'
      : '';
    return '<a class="rg-item" href="' + url + '" target="_blank" rel="noopener">'
      + '<div class="rg-date-col">'
      + '<span class="rg-date-day">' + d.day + '</span>'
      + '<span class="rg-date-mon">' + d.mon + '</span>'
      + dateRange
      + '</div>'
      + '<div class="rg-content">'
      + '<p class="rg-title">' + escapeHtml(ev.title) + '</p>'
      + (meta ? '<p class="rg-meta">' + escapeHtml(meta) + '</p>' : '')
      + '<div class="rg-tags">' + newBadge + tags + '</div>'
      + '</div></a>';
  }

  const _cityNameCache = {};
  function cityDisplayName(id) { return _cityNameCache[id] || id; }

  function headerHTML(city, count) {
    const label = cityDisplayName(city) || city;
    const countStr = count !== null ? '<span class="rg-header-count">' + count + ' Events</span>' : '';
    return '<div class="rg-header">' + logoSVG('#FF6F61')
      + '<span class="rg-header-city">Veranstaltungen in ' + escapeHtml(label) + '</span>'
      + countStr + '</div>';
  }

  function footerHTML(city) {
    const href = BASE + '/' + city + '/';
    const utm = '?utm_source=widget&utm_medium=embed&utm_campaign=' + city;
    return '<div class="rg-footer">'
      + '<span class="rg-powered">Powered by <a href="' + BASE + '/' + utm + '" target="_blank" rel="noopener">rausgucken.de</a></span>'
      + '<a class="rg-all-link" href="' + href + utm + '" target="_blank" rel="noopener">Alle ansehen \u2192</a>'
      + '</div>';
  }

  function initWidget(container) {
    const city      = container.getAttribute('data-rausgucken-city') || 'ludwigsburg';
    const limit     = Math.min(parseInt(container.getAttribute('data-rausgucken-limit') || '5', 10), 20);
    const rawTags   = container.getAttribute('data-rausgucken-tags') || '';
    const filterTags = rawTags ? rawTags.split(',').map(t => t.trim()).filter(Boolean) : [];

    container.classList.add('rg-widget');
    container.innerHTML = headerHTML(city, null)
      + '<div class="rg-state"><span class="rg-state-dot"></span>Lade Veranstaltungen\u2026</div>'
      + footerHTML(city);

    fetch(BASE + '/data/' + city + '/events-current.json')
      .then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(data => {
        let events = Array.isArray(data) ? data : (data.events || []);
        events = events.filter(isUpcoming);
        if (filterTags.length) {
          events = events.filter(ev => (ev.tags || []).some(t => filterTags.includes(t)));
        }
        events.sort((a,b) => {
          if (!a.date_start) return 1;
          if (!b.date_start) return -1;
          return a.date_start.localeCompare(b.date_start);
        });
        const shown = events.slice(0, limit);
        if (shown.length === 0) {
          container.innerHTML = headerHTML(city, 0)
            + '<div class="rg-state">Keine Veranstaltungen gefunden.</div>'
            + footerHTML(city);
          return;
        }
        container.innerHTML = headerHTML(city, events.length)
          + '<ul class="rg-list">' + shown.map(ev => renderEvent(ev, city)).join('') + '</ul>'
          + footerHTML(city);
      })
      .catch(() => {
        container.innerHTML = headerHTML(city, null)
          + '<div class="rg-state">Veranstaltungen konnten nicht geladen werden.</div>'
          + footerHTML(city);
      });
  }

  function loadCityNames(cb) {
    fetch(BASE + '/data/cities.json')
      .then(r => r.json())
      .then(list => {
        const arr = Array.isArray(list) ? list : (list.cities || []);
        arr.forEach(c => { _cityNameCache[c.id] = c.name; });
        cb();
      })
      .catch(() => cb());
  }

  function boot() {
    injectStyles();
    const containers = document.querySelectorAll('[data-rausgucken-city]');
    if (!containers.length) return;
    loadCityNames(() => {
      containers.forEach(c => {
        if (c.hasAttribute('data-rg-init')) return;
        c.setAttribute('data-rg-init', '1');
        initWidget(c);
      });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
