"""
02_museum.py
Source  : https://ludwigsburgmuseum.ludwigsburg.de/veranstaltungen
Method  : requests — Komm.ONE ZM VXC JSON API, single call
Output  : list of event dicts matching rausgucken schema

Design decisions:
  - Node ID confirmed from HTML source: 23792569
  - Site slug confirmed from HTML source: Ludwigsburg-Museum-2025
  - Detail URL pattern: zmdetail/index.html?nodeID={eid}
    (different from Labyrinth which uses zmdetail_{eid}/index.html)
  - The API ignores von/bis and start= params — it returns ALL events
    in a single call regardless. Confirmed from live testing: every
    windowed/paginated call returns the same 50 items.
    Strategy: one call, no date params, filter client-side by date_start.
  - Session warming required: the JSON API returns 403 without the
    JSESSIONID cookie set by visiting the events page first.
  - extraction_confidence: 1.0 — structured JSON API, no AI needed.
  - No Playwright. No Selenium. No headless browser.
"""

import re
import time
import requests
from bs4 import BeautifulSoup
from datetime import datetime, date, timezone

# ── Config ────────────────────────────────────────────────────────────────────

SOURCE = "museum"
CITY   = "ludwigsburg"

BASE_URL    = "https://ludwigsburgmuseum.ludwigsburg.de"
EVENTS_PAGE = f"{BASE_URL}/veranstaltungen"

# Confirmed from HTML source (data-load-url attribute on #zmresult div):
SITE_SLUG = "Ludwigsburg-Museum-2025"
NODE_ID   = "23792569"

API_URL = f"{BASE_URL}/site/{SITE_SLUG}/VXC/{NODE_ID}/loadData/loadData.json"

# Confirmed from JS: xurl + "?nodeID=" + e.id
# NOT zmdetail_{eid}/index.html like Labyrinth — museum uses a query param.
DETAIL_BASE = f"{BASE_URL}/site/{SITE_SLUG}/node/{NODE_ID}/zmdetail/index.html"

MIN_EVENTS = 3

DEFAULT_LOCATION = "Ludwigsburg Museum im MIK, Ludwigsburg"

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "de-DE,de;q=0.9,en;q=0.8",
    "Referer": EVENTS_PAGE,
    "X-Requested-With": "XMLHttpRequest",
}

_SESSION: requests.Session | None = None


# ── Session ───────────────────────────────────────────────────────────────────

def warm_session() -> requests.Session:
    """
    Visit the events page to collect the Komm.ONE JSESSIONID cookie.
    Without this the JSON API returns 403. Called once — cached after that.
    """
    global _SESSION
    if _SESSION is not None:
        return _SESSION

    sess = requests.Session()
    sess.headers.update({
        "User-Agent": HEADERS["User-Agent"],
        "Accept-Language": HEADERS["Accept-Language"],
    })

    print(f"[museum] Warming session via {EVENTS_PAGE}")
    time.sleep(0.5)
    resp = sess.get(
        EVENTS_PAGE,
        headers={"Accept": "text/html,application/xhtml+xml,*/*"},
        timeout=15,
        allow_redirects=True,
    )
    resp.raise_for_status()
    print(f"[museum] Session cookies: {dict(sess.cookies)}")

    sess.headers.update(HEADERS)
    _SESSION = sess
    return sess


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
    """
    Normalise date strings to YYYY-MM-DD.

    Handles:
      "03.05.2026"           -> German DD.MM.YYYY  (museum API format)
      "2026-05-03"           -> already ISO
      "2026-05-03T00:00:00"  -> ISO datetime, strip time part
      "Di, 03.05.2026"       -> weekday prefix
      "14. April 2026"       -> long month name
    Returns None if unparseable or empty.
    """
    if not raw:
        return None
    raw = raw.strip()

    # Strip leading weekday abbreviation e.g. "Di, " or "Di 14. April 2026"
    raw = re.sub(r"^[A-Za-z\xc4\xd6\xdc\xe4\xf6\xfc\xdf]{2,3}[,.]?\s*", "", raw)

    # Already ISO date
    if re.match(r"^\d{4}-\d{2}-\d{2}$", raw):
        return raw

    # ISO datetime
    m = re.match(r"^(\d{4}-\d{2}-\d{2})T", raw)
    if m:
        return m.group(1)

    # German DD.MM.YYYY
    m = re.match(r"^(\d{1,2})\.(\d{1,2})\.(\d{4})$", raw)
    if m:
        return f"{m.group(3)}-{m.group(2).zfill(2)}-{m.group(1).zfill(2)}"

    # German "14. April 2026" long month name
    MONTHS = {
        "januar": "01", "februar": "02", "april": "04",
        "mai": "05", "juni": "06", "juli": "07", "august": "08",
        "september": "09", "oktober": "10", "november": "11", "dezember": "12",
        "m\xe4rz": "03",
    }
    m = re.match(r"^(\d{1,2})\.\s*(\w+)\s+(\d{4})$", raw, re.IGNORECASE)
    if m:
        month = MONTHS.get(m.group(2).lower())
        if month:
            return f"{m.group(3)}-{month}-{m.group(1).zfill(2)}"

    return None


def build_detail_url(eid) -> str:
    return f"{DETAIL_BASE}?nodeID={eid}"


# ── API fetch ─────────────────────────────────────────────────────────────────

def fetch_all_raw() -> list[dict]:
    """
    Single call to the ZM VXC API — no date params needed.

    The museum API returns ALL upcoming events in one response and ignores
    von/bis and start= params (confirmed live: every windowed/paginated
    call returns the same set). One clean call is correct.
    """
    sess = warm_session()
    time.sleep(0.5)
    resp = sess.get(API_URL, timeout=15)
    resp.raise_for_status()

    data = resp.json()
    print(f"[museum] Raw API response: {type(data).__name__}, "
          f"length={len(data) if isinstance(data, (list, dict)) else '?'}")

    if isinstance(data, list):
        return data

    if isinstance(data, dict):
        for key in ("items", "events", "data", "results", "termine"):
            if key in data and isinstance(data[key], list):
                return data[key]
        for v in data.values():
            if isinstance(v, list):
                return v

    return []


# ── Event parsing ─────────────────────────────────────────────────────────────

def parse_item(item: dict) -> dict | None:
    title = clean(item.get("titel") or item.get("title") or "")
    if not title:
        return None

    eid        = item.get("id", "")
    detail_url = build_detail_url(eid)

    kurz = strip_html(item.get("kurzbeschreibung", ""))
    lang = strip_html(item.get("beschreibung", ""))
    if kurz and lang and kurz in lang:
        description = lang
    else:
        description = "\n\n".join(filter(None, [kurz, lang]))

    date_start = normalise_date(item.get("von", ""))
    date_end   = normalise_date(item.get("bis", ""))
    if date_end == date_start:
        date_end = None

    time_str = clean(item.get("zeit", "")) or None

    loc_name   = clean(item.get("location") or item.get("ort") or "")
    loc_street = clean(item.get("location_strasse") or "")
    loc_city   = clean(item.get("location_ortsname") or "")
    if loc_name and loc_street:
        location = ", ".join(filter(None, [loc_name, loc_street, loc_city]))
    elif loc_name:
        location = loc_name
    else:
        location = DEFAULT_LOCATION

    price_raw = item.get("preis") or item.get("eintritt") or ""
    price     = clean(str(price_raw)) if price_raw else None

    def _int_or_none(val):
        try:
            return int(val) if val is not None else None
        except (ValueError, TypeError):
            return None

    age_min = _int_or_none(item.get("alter_von") or item.get("age_min"))
    age_max = _int_or_none(item.get("alter_bis") or item.get("age_max"))

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
    Single API call, client-side past-event filter.
    """
    today_str = date.today().isoformat()

    raw_items = fetch_all_raw()
    print(f"[museum] {len(raw_items)} raw items from API")

    events           = []
    skipped_no_title = 0
    skipped_past     = 0
    skipped_no_date  = 0

    for item in raw_items:
        ev = parse_item(item)
        if ev is None:
            skipped_no_title += 1
            continue

        ds = ev.get("date_start")
        if not ds:
            skipped_no_date += 1
            events.append(ev)   # include — validate.py will flag if needed
            continue

        # Drop events that have fully passed
        end_for_check = ev.get("date_end") or ds
        if end_for_check < today_str:
            skipped_past += 1
            continue

        events.append(ev)

    print(
        f"[museum] {len(events)} kept, "
        f"{skipped_past} past (dropped), "
        f"{skipped_no_title} no title (dropped), "
        f"{skipped_no_date} no date (kept)"
    )

    if len(events) < MIN_EVENTS:
        print(f"[museum] WARNING: only {len(events)} events — below MIN_EVENTS={MIN_EVENTS}")

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
                f"{str(ev.get('time') or '-'):20}  "
                f"{ev.get('title', '?')[:38]:38}"
            )
            print(f"    desc    : {desc}")
            print(f"    location: {ev.get('location')}")
            print(f"    price   : {ev.get('price')}")
            print(f"    url     : {ev.get('original_url')}")
            if ev.get("age_min") is not None or ev.get("age_max") is not None:
                print(f"    age     : {ev.get('age_min')}-{ev.get('age_max')}")

        os.makedirs("output/ludwigsburg", exist_ok=True)
        out = "output/ludwigsburg/02_museum_raw.json"
        with open(out, "w", encoding="utf-8") as f:
            json.dump(events, f, ensure_ascii=False, indent=2)
        print(f"\nSaved {len(events)} events -> {out}")

        missing_url   = [e for e in events if not e.get("original_url")]
        missing_ts    = [e for e in events if not e.get("scraped_at")]
        no_desc       = [e for e in events if not e.get("description")]
        with_age      = [e for e in events if e.get("age_min") is not None or e.get("age_max") is not None]
        with_price    = [e for e in events if e.get("price")]
        with_date_end = [e for e in events if e.get("date_end")]

        print(f"\nAudit trail   : {len(missing_url)} missing original_url, {len(missing_ts)} missing scraped_at")
        print(f"Descriptions  : {len(events) - len(no_desc)}/{len(events)} filled")
        print(f"With date_end : {len(with_date_end)}/{len(events)}")
        print(f"With price    : {len(with_price)}/{len(events)}")
        print(f"With age range: {len(with_age)}/{len(events)}")
