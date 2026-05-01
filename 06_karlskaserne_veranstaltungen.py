"""
06_karlskaserne_veranstaltungen.py
Source  : https://karlskaserne.ludwigsburg.de/start/veranstaltungen.html
Method  : requests — Komm.ONE ZM VXC JSON API with pagination fallback
Output  : list of event dicts matching rausgucken schema

FIX v2:  The ZM VXC API returns a default maximum of ~50 records when called
         without a count parameter. The website shows 12 pages of events
         (events through at least Nov 2026 were visible in testing). This
         version fixes that in two ways:

         Strategy A — ?anzahl=500 query param (preferred, single call)
           The ZM VXC API accepts an 'anzahl' (count) param. Requesting 500
           should return all events in one call. If the response count equals
           the default 50, strategy B kicks in as a safety net.

         Strategy B — HTML pagination fallback (robust, always correct)
           The website paginates results at a known URL pattern:
           /node/23666757/page{N}/page{N}?zm.sid={session}
           We detect the total page count from page 1 and iterate all pages,
           extracting event links. Then fetch each detail page for full data.
           Slower (N+1 requests), but guaranteed complete.

Design decisions (unchanged from v1):
  - This scraper keeps entries that are NOT purely exhibitions (those belong
    to scraper 05). Mixed-category entries are included here; deduplicate.py
    handles any cross-scraper overlap.
  - extraction_confidence: 1.0 — structured JSON API or HTML parse, no AI.
  - No Playwright. No Selenium. No headless browser.
"""

import re
import time
import requests
from bs4 import BeautifulSoup
from datetime import datetime, timezone
from urllib.parse import urljoin, urlparse, parse_qs, urlencode, urlunparse

# ── Config ────────────────────────────────────────────────────────────────────

SOURCE   = "karlskaserne_veranstaltungen"
CITY     = "ludwigsburg"

BASE_URL = "https://karlskaserne.ludwigsburg.de"

# ZM VXC JSON API — single call with anzahl param
API_URL  = (
    f"{BASE_URL}"
    "/site/Ludwigsburg-Karlskaserne-2025/VXC/23666757/loadData/loadData.json"
)

# HTML listing page — used for pagination fallback
LISTING_URL = f"{BASE_URL}/start/veranstaltungen.html"

# HTML page pattern for subsequent pages (session ID injected at runtime)
# Page 1: /start/veranstaltungen.html
# Page 2+: /site/.../node/23666757/page{N}/page{N}?zm.sid={sid}
HTML_PAGE_PATTERN = (
    BASE_URL
    + "/site/Ludwigsburg-Karlskaserne-2025/node/23666757"
    "/page{n}/page{n}"
)

DETAIL_URL_TEMPLATE = (
    "{base}"
    "/site/Ludwigsburg-Karlskaserne-2025"
    "/node/23666757/zmdetail_{eid}/index.html"
)

DEFAULT_LOCATION = "Kunstzentrum Karlskaserne, Hindenburgstraße 29, 71638 Ludwigsburg"

# API default limit — if response count <= this, suspect truncation
API_DEFAULT_LIMIT = 50

# How many records to request from the API
API_REQUESTED_COUNT = 1000

# Entries whose sole category is "Ausstellung" belong to scraper 05
EXHIBITION_ONLY_KEYWORDS = {"ausstellung"}

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "de-DE,de;q=0.9,en;q=0.8",
    "Referer": f"{BASE_URL}/start/veranstaltungen.html",
}

HEADERS_HTML = {
    **HEADERS,
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
}


# ── Helpers ───────────────────────────────────────────────────────────────────

def clean(text: str) -> str:
    return re.sub(r"\s+", " ", str(text or "")).strip()


def strip_html(html_str: str) -> str:
    return BeautifulSoup(str(html_str or ""), "html.parser").get_text(" ", strip=True)


def now_iso() -> str:
    return datetime.now(timezone.utc).astimezone().isoformat()


def make_base() -> dict:
    return {
        "source":                SOURCE,
        "city":                  CITY,
        "scraped_at":            now_iso(),
        "original_url":          "",
        "link":                  "",
        "extraction_confidence": 1.0,
    }


def normalise_date(raw: str) -> str | None:
    if not raw:
        return None
    raw = raw.strip()
    if re.match(r"^\d{4}-\d{2}-\d{2}$", raw):
        return raw
    m = re.match(r"^(\d{4}-\d{2}-\d{2})T", raw)
    if m:
        return m.group(1)
    m = re.match(r"^(\d{2})\.(\d{2})\.(\d{4})$", raw)
    if m:
        return f"{m.group(3)}-{m.group(2)}-{m.group(1)}"
    return None


def build_detail_url(eid) -> str:
    return DETAIL_URL_TEMPLATE.format(base=BASE_URL, eid=eid)


def is_event_not_exhibition_only(item: dict) -> bool:
    """
    Return True if this item should be captured by this scraper.
    Exhibition-only entries belong to scraper 05.
    """
    kat = item.get("kategorien") or item.get("kategorie") or item.get("klassen") or ""
    cat_parts: list[str] = []
    if isinstance(kat, list):
        cat_parts.extend(str(k) for k in kat)
    elif isinstance(kat, str) and kat:
        cat_parts.append(kat)

    if not cat_parts:
        return True  # No metadata — conservative: include

    all_cats_lower = " ".join(cat_parts).lower()
    tokens = re.split(r"[\s,|]+", all_cats_lower)
    meaningful = [t for t in tokens if t and t not in {"lb", "kk_startseite",
                                                        "karlskaserne",
                                                        "kunstzentrum_karlskaserne"}]

    if not meaningful:
        return True

    all_exhibition = all(
        any(kw in tok for kw in EXHIBITION_ONLY_KEYWORDS)
        for tok in meaningful
    )
    return not all_exhibition


# ── Strategy A: JSON API with anzahl param ────────────────────────────────────

def fetch_api_with_count(count: int) -> list[dict]:
    """Call the ZM VXC JSON API requesting `count` results."""
    params = {"anzahl": count}
    time.sleep(0.4)
    resp = requests.get(API_URL, headers=HEADERS, params=params, timeout=15)
    resp.raise_for_status()

    data = resp.json()

    if isinstance(data, list):
        return data
    if isinstance(data, dict):
        for key in ("items", "events", "data", "results"):
            if key in data and isinstance(data[key], list):
                return data[key]
    raise ValueError(
        f"[{SOURCE}] Unexpected API response shape: {type(data).__name__}"
    )


# ── Strategy B: HTML pagination scrape ───────────────────────────────────────

def get_session_id_and_page_count(soup: BeautifulSoup, page1_url: str) -> tuple[str, int]:
    """
    Extract zm.sid session cookie and total page count from page 1 HTML.
    Returns (session_id, total_pages).
    """
    session_id = ""

    # Look for zm.sid in pagination links
    for a in soup.find_all("a", href=True):
        m = re.search(r"zm\.sid=([a-zA-Z0-9]+)", a["href"])
        if m:
            session_id = m.group(1)
            break

    # Count pages from pagination nav
    # Pagination typically renders numbered links 1..N
    max_page = 1
    for a in soup.find_all("a", href=True):
        href = a.get("href", "")
        # Pattern: /page12/page12 or page12?zm.sid=...
        m = re.search(r"/page(\d+)/page\1", href)
        if m:
            max_page = max(max_page, int(m.group(1)))
        # Also check link text for page numbers
        text = a.get_text(strip=True)
        if text.isdigit():
            max_page = max(max_page, int(text))

    return session_id, max_page


def extract_event_links_from_listing(soup: BeautifulSoup, debug: bool = False) -> list[str]:
    """
    Extract all event detail page links from a listing page.

    Real href pattern (confirmed from HTML):
      /site/Ludwigsburg-Karlskaserne-2025/node/23666757/zmdetail_NNNNN/SomeSlug.html
      (NOT index.html — each event has its own slug filename)
    """
    links = []
    seen: set[str] = set()

    all_hrefs = []
    for a in soup.find_all("a", href=True):
        href = a["href"].strip()
        if not href:
            continue
        all_hrefs.append(href)

        # The real pattern: zmdetail_<id>/<slug>.html
        if "zmdetail_" in href:
            full = urljoin(BASE_URL, href.split("?")[0])  # strip ?zm.sid=... query params
            if full not in seen:
                seen.add(full)
                links.append(full)

    if debug or not links:
        unique_hrefs = list(dict.fromkeys(all_hrefs))
        print(f"[{SOURCE}]   DEBUG: {len(unique_hrefs)} unique hrefs found, "
              f"{len(links)} matched zmdetail_ pattern. Sample hrefs:")
        for h in unique_hrefs[:20]:
            print(f"[{SOURCE}]     {h}")

    return links


def fetch_html_page(url: str, session: requests.Session) -> BeautifulSoup:
    time.sleep(0.5)
    resp = session.get(url, headers=HEADERS_HTML, timeout=15)
    resp.raise_for_status()
    return BeautifulSoup(resp.text, "html.parser")


def parse_detail_page(soup: BeautifulSoup, detail_url: str) -> dict | None:
    """
    Parse a full event detail page into a rausgucken event dict.

    Confirmed HTML structure (from real page inspection):
      Title    : <h2> inside <div class="zmitem ...">
      Dates    : <time class="dtstart" datetime="YYYY-MM-DD">
                 <time class="dtend"   datetime="YYYY-MM-DD">
      Time     : <span class="dtTimeInfo">14.00-17.00 Uhr</span>
      Short desc: <div class="zmkurzbeschreibung">
      Long desc : <div class="zmbeschreibung">
      Location  : <h3 class="titel"> inside location block
      Categories: <a class="zmkatLink">
    """
    # ── Title ──────────────────────────────────────────────────────────────────
    # The <h2> inside the zmitem detail block is the event title
    zmitem = soup.find("div", class_=re.compile(r"\bzmitem\b"))
    title_el = zmitem.find("h2") if zmitem else soup.find("h2")
    title = clean(title_el.get_text()) if title_el else ""
    # Strip [AUSGEBUCHT] prefix for cleaner titles (keep it in description)
    title_clean = re.sub(r"^\[AUSGEBUCHT\]\s*", "", title).strip()
    if not title_clean:
        return None

    ev = make_base()
    ev["original_url"] = detail_url
    ev["link"] = detail_url
    ev["title"] = title_clean

    # ── Dates ──────────────────────────────────────────────────────────────────
    dtstart_el = soup.find("time", class_="dtstart")
    dtend_el   = soup.find("time", class_="dtend")
    date_start = dtstart_el["datetime"] if dtstart_el and dtstart_el.get("datetime") else None
    date_end   = dtend_el["datetime"]   if dtend_el   and dtend_el.get("datetime")   else None
    if date_end == date_start:
        date_end = None

    ev["date_start"] = date_start
    ev["date_end"]   = date_end

    # ── Time ───────────────────────────────────────────────────────────────────
    time_el = soup.find("span", class_="dtTimeInfo")
    ev["time"] = clean(time_el.get_text()) if time_el else None

    # ── Description ────────────────────────────────────────────────────────────
    kurz_el = soup.find("div", class_="zmkurzbeschreibung")
    lang_el = soup.find("div", class_="zmbeschreibung")
    kurz = clean(kurz_el.get_text("\n")) if kurz_el else ""
    lang = clean(lang_el.get_text("\n")) if lang_el else ""

    # Note if event is booked out
    sold_out_note = "[AUSGEBUCHT] " if "[AUSGEBUCHT]" in title else ""

    if kurz and lang and kurz in lang:
        description = sold_out_note + lang
    else:
        description = sold_out_note + "\n\n".join(filter(None, [kurz, lang]))
    ev["description"] = description.strip() or None

    # ── Location ───────────────────────────────────────────────────────────────
    # Location block: first <h3 class="titel"> inside the location column
    loc_col = soup.find("div", class_=re.compile(r"col-md"))
    loc_h3 = loc_col.find("h3", class_="titel") if loc_col else None
    ev["location"] = clean(loc_h3.get_text()) if loc_h3 else DEFAULT_LOCATION
    if not ev["location"]:
        ev["location"] = DEFAULT_LOCATION

    # ── Price ──────────────────────────────────────────────────────────────────
    page_text = soup.get_text(" ")
    price_m = re.search(
        r"(Eintritt frei|kostenlos|\d+[,.]\d{2}\s*(?:Euro|€)|\d+\s*€)",
        page_text, re.I
    )
    ev["price"] = price_m.group(0).strip() if price_m else None

    # ── Age ────────────────────────────────────────────────────────────────────
    # Categories like "für Kinder ab 8 Jahren" or "ab 7 Jahren"
    age_m = re.search(r"ab\s+(\d+)\s+Jahr", page_text, re.I)
    ev["age_min"] = int(age_m.group(1)) if age_m else None
    ev["age_max"] = None

    # ── Tags from zmkatLink ────────────────────────────────────────────────────
    tags = []
    for a in soup.find_all("a", class_="zmkatLink"):
        t = clean(a.get_text())
        if t:
            tags.append(t)
    ev["tags"] = tags

    ev["slug"] = ""
    return ev


def scrape_html_all_pages() -> list[str]:
    """
    Strategy B: Walk all listing pages and collect every detail URL.
    Returns a deduplicated list of detail page URLs.
    """
    session = requests.Session()

    print(f"[{SOURCE}] Strategy B: fetching HTML listing page 1")
    # The /start/veranstaltungen.html page IS page 1 of the listing.
    # It contains both event zmdetail_ links and the zm.sid session token
    # in its pagination nav. Pages 2-N use the /node/.../page{N}/page{N} pattern.
    soup1 = fetch_html_page(LISTING_URL, session)

    session_id, total_pages = get_session_id_and_page_count(soup1, LISTING_URL)
    print(f"[{SOURCE}] Found {total_pages} pages, session_id={session_id!r}")

    all_links: list[str] = []

    # Page 1 — debug=True prints all hrefs so we can verify the real link pattern
    all_links.extend(extract_event_links_from_listing(soup1, debug=True))

    # Pages 2..N
    for n in range(2, total_pages + 1):
        url = HTML_PAGE_PATTERN.format(n=n)
        if session_id:
            url += f"?zm.sid={session_id}"
        print(f"[{SOURCE}]   Fetching page {n}/{total_pages}: {url}")
        try:
            soup = fetch_html_page(url, session)
            links = extract_event_links_from_listing(soup)
            all_links.extend(links)
        except Exception as e:
            print(f"[{SOURCE}]   WARNING: page {n} failed: {e}")

    # Deduplicate preserving order
    seen: set[str] = set()
    unique_links = []
    for l in all_links:
        if l not in seen:
            seen.add(l)
            unique_links.append(l)

    print(f"[{SOURCE}] Strategy B collected {len(unique_links)} unique detail URLs")
    return unique_links


def fetch_events_via_html() -> list[dict]:
    """
    Full HTML fallback: collect all detail URLs then fetch each detail page.
    """
    session = requests.Session()
    detail_urls = scrape_html_all_pages()

    events = []
    failed = 0
    for i, url in enumerate(detail_urls, 1):
        print(f"[{SOURCE}]   Detail {i}/{len(detail_urls)}: {url}")
        try:
            soup = fetch_html_page(url, session)
            ev = parse_detail_page(soup, url)
            if ev:
                events.append(ev)
        except Exception as e:
            print(f"[{SOURCE}]   WARNING: detail page failed: {e}")
            failed += 1

    if failed:
        print(f"[{SOURCE}] Strategy B: {failed} detail pages failed")
    return events


# ── Event parsing from API response ──────────────────────────────────────────

def parse_api_item(item: dict) -> dict | None:
    title = clean(item.get("titel") or item.get("title") or "")
    if not title:
        return None

    eid = item.get("id", "")
    detail_url = build_detail_url(eid)

    kurz = strip_html(item.get("kurzbeschreibung", ""))
    lang = strip_html(item.get("beschreibung", ""))
    if kurz and lang and kurz in lang:
        description = lang
    else:
        description = "\n\n".join(filter(None, [kurz, lang]))

    zusatz = clean(item.get("zusatz") or item.get("untertitel") or "")
    if zusatz and description and zusatz not in description:
        description = zusatz + "\n\n" + description
    elif zusatz and not description:
        description = zusatz

    date_start = normalise_date(item.get("von", ""))
    date_end   = normalise_date(item.get("bis", ""))
    if date_end == date_start:
        date_end = None

    time_str = clean(item.get("zeit", "")) or None

    raw_loc  = item.get("location") or item.get("ort") or ""
    location = clean(str(raw_loc)) if raw_loc else DEFAULT_LOCATION

    price_raw = item.get("preis") or item.get("eintritt") or ""
    price     = clean(str(price_raw)) if price_raw else None

    age_min = item.get("alter_von") or item.get("age_min") or None
    age_max = item.get("alter_bis") or item.get("age_max") or None
    try:
        age_min = int(age_min) if age_min is not None else None
    except (ValueError, TypeError):
        age_min = None
    try:
        age_max = int(age_max) if age_max is not None else None
    except (ValueError, TypeError):
        age_max = None

    ev = make_base()
    ev.update({
        "title":        title,
        "date_start":   date_start,
        "date_end":     date_end,
        "time":         time_str,
        "description":  description or None,
        "location":     location,
        "price":        price,
        "age_min":      age_min,
        "age_max":      age_max,
        "tags":         [],
        "slug":         "",
        "original_url": detail_url,
        "link":         detail_url,
    })
    return ev


# ── Main ──────────────────────────────────────────────────────────────────────

def scrape() -> list[dict]:
    """
    Entry point called by the pipeline runner.

    Execution order:
    1. Try API with ?anzahl=1000 (Strategy A — fast, single call)
    2. If API result count == default limit (50), the API is ignoring our
       param and truncating. Fall back to HTML pagination (Strategy B).
    3. Strategy B is always slower but guaranteed complete.

    Returns list of non-exhibition event dicts matching rausgucken schema.
    """

    # ── Strategy A: API with high count ───────────────────────────────────────
    api_items = []
    api_ok = False
    try:
        print(f"[{SOURCE}] Strategy A: calling API with anzahl={API_REQUESTED_COUNT}")
        api_items = fetch_api_with_count(API_REQUESTED_COUNT)
        print(f"[{SOURCE}] API returned {len(api_items)} items")

        if len(api_items) <= API_DEFAULT_LIMIT:
            print(
                f"[{SOURCE}] WARNING: API returned only {len(api_items)} items — "
                f"suspect default limit hit. Falling back to Strategy B (HTML pagination)."
            )
            api_ok = False
        else:
            api_ok = True
            print(f"[{SOURCE}] Strategy A succeeded: {len(api_items)} items")

    except Exception as e:
        print(f"[{SOURCE}] Strategy A failed: {e}. Falling back to Strategy B.")
        api_ok = False

    # ── Strategy B: HTML pagination fallback ──────────────────────────────────
    if not api_ok:
        print(f"[{SOURCE}] Strategy B: scraping HTML pagination")
        html_events = fetch_events_via_html()
        print(f"[{SOURCE}] Strategy B done — {len(html_events)} events")
        return html_events

    # ── Parse API results ─────────────────────────────────────────────────────
    events = []
    skipped_no_title        = 0
    skipped_exhibition_only = 0

    for item in api_items:
        if not is_event_not_exhibition_only(item):
            skipped_exhibition_only += 1
            continue
        ev = parse_api_item(item)
        if ev is None:
            skipped_no_title += 1
            continue
        events.append(ev)

    if skipped_no_title:
        print(f"[{SOURCE}] Skipped {skipped_no_title} items (no title)")
    if skipped_exhibition_only:
        print(f"[{SOURCE}] Skipped {skipped_exhibition_only} exhibition-only items "
              f"(handled by scraper 05)")

    print(f"[{SOURCE}] Done — {len(events)} events")
    return events


# ── Standalone run ────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import json
    import os

    events = scrape()

    if not events:
        print("No events returned.")
    else:
        print(f"\nSample (first 5):")
        for ev in events[:5]:
            desc = (ev.get("description") or "")[:80]
            print(
                f"  {str(ev.get('date_start', '?')):12}  "
                f"{str(ev.get('time') or '–'):18}  "
                f"{ev.get('title', '?')[:40]:40}"
            )
            print(f"    desc    : {desc}")
            print(f"    location: {ev.get('location')}")
            print(f"    price   : {ev.get('price')}")

        print(f"\nDate range: {events[0].get('date_start')} → {events[-1].get('date_start')}")
        print(f"Total events: {len(events)}")

        os.makedirs("output/ludwigsburg", exist_ok=True)
        out = "output/ludwigsburg/06_karlskaserne_veranstaltungen_raw.json"
        with open(out, "w", encoding="utf-8") as f:
            json.dump(events, f, ensure_ascii=False, indent=2)
        print(f"\nSaved {len(events)} events → {out}")

        # Audit trail checks
        missing_url = [e for e in events if not e.get("original_url")]
        missing_ts  = [e for e in events if not e.get("scraped_at")]
        no_desc     = [e for e in events if not e.get("description")]
        with_time   = [e for e in events if e.get("time")]
        with_price  = [e for e in events if e.get("price")]
        with_age    = [e for e in events if e.get("age_min") is not None
                                          or e.get("age_max") is not None]

        print(f"\nAudit trail  : {len(missing_url)} missing original_url, "
              f"{len(missing_ts)} missing scraped_at")
        print(f"Descriptions : {len(events) - len(no_desc)}/{len(events)} filled")
        print(f"With time    : {len(with_time)}/{len(events)}")
        print(f"With price   : {len(with_price)}/{len(events)}")
        print(f"With age     : {len(with_age)}/{len(events)}")
