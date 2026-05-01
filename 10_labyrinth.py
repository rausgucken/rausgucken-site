"""
10_labyrinth.py
Source  : https://kunstschule-labyrinth.ludwigsburg.de/
Method  : requests — Komm.ONE ZM VXC JSON API (single call)
Output  : list of event dicts matching rausgucken schema

Design decisions:
  - The ZM VXC API returns all events in one JSON payload — no pagination,
    no sessions, no form submission. One GET, done.
  - The API endpoint is embedded in the page source as a loadData.json URL.
    It is a stable Komm.ONE pattern used across all municipalities running
    this CMS (Museum, Karlskaserne use the same pattern with different node IDs).
  - date_start / date_end come from "von" / "bis" fields. Both are already
    ISO-ish strings (e.g. "2026-05-03"). We normalise to YYYY-MM-DD.
  - "zeit" is a free-text German time string — kept as-is (e.g. "10:00 Uhr").
  - description is built from kurzbeschreibung + beschreibung, HTML-stripped.
  - original_url and link both point to the per-event detail page, constructed
    from the base URL + node path + item id.
  - extraction_confidence: 1.0 — structured JSON API, no AI extraction needed.
  - No Playwright. No Selenium. No headless browser.
"""

import re
import time
import requests
from bs4 import BeautifulSoup
from datetime import datetime, timezone

# ── Config ────────────────────────────────────────────────────────────────────

SOURCE   = "labyrinth"
CITY     = "ludwigsburg"

# Base URL of the Labyrinth site
BASE_URL  = "https://kunstschule-labyrinth.ludwigsburg.de"

# Komm.ONE ZM VXC JSON API endpoint — returns all events in one call
API_URL   = (
    f"{BASE_URL}"
    "/site/Ludwigsburg-Labyrinth-2019/VXC/16172667/loadData/loadData.json"
)

# Per-event detail page URL template — {eid} is item["id"]
DETAIL_URL_TEMPLATE = (
    "{base}"
    "/site/Ludwigsburg-Labyrinth-2019"
    "/node/16172667/zmdetail_{eid}/index.html"
)

# Location shown when the API returns no location string
DEFAULT_LOCATION = "Kunstschule Labyrinth, Ludwigsburg"

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "de-DE,de;q=0.9,en;q=0.8",
    "Referer": BASE_URL,
}


# ── Helpers ───────────────────────────────────────────────────────────────────

def clean(text: str) -> str:
    """Collapse whitespace."""
    return re.sub(r"\s+", " ", str(text or "")).strip()


def strip_html(html_str: str) -> str:
    """Strip HTML tags and collapse whitespace."""
    return BeautifulSoup(str(html_str or ""), "html.parser").get_text(" ", strip=True)


def now_iso() -> str:
    return datetime.now(timezone.utc).astimezone().isoformat()


def make_base() -> dict:
    """Base event dict — guarantees audit trail fields are always present."""
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
    Normalise API date strings to YYYY-MM-DD.

    The API returns dates in several formats observed in the wild:
      "2026-05-03"           → already ISO, return as-is
      "03.05.2026"           → German DD.MM.YYYY
      "2026-05-03T00:00:00"  → ISO datetime, strip time part
    Returns None if unparseable.
    """
    if not raw:
        return None
    raw = raw.strip()
    # Already ISO date
    if re.match(r"^\d{4}-\d{2}-\d{2}$", raw):
        return raw
    # ISO datetime — strip time
    m = re.match(r"^(\d{4}-\d{2}-\d{2})T", raw)
    if m:
        return m.group(1)
    # German DD.MM.YYYY
    m = re.match(r"^(\d{2})\.(\d{2})\.(\d{4})$", raw)
    if m:
        return f"{m.group(3)}-{m.group(2)}-{m.group(1)}"
    return None


def build_detail_url(eid) -> str:
    return DETAIL_URL_TEMPLATE.format(base=BASE_URL, eid=eid)


# ── API fetch ─────────────────────────────────────────────────────────────────

def fetch_api() -> list[dict]:
    """
    Fetch the ZM VXC JSON API. Returns the raw list of item dicts.
    Raises on HTTP error or malformed response.
    """
    time.sleep(0.4)
    resp = requests.get(API_URL, headers=HEADERS, timeout=15)
    resp.raise_for_status()

    data = resp.json()

    # The API sometimes wraps results in a top-level key — handle both shapes
    if isinstance(data, list):
        return data
    if isinstance(data, dict):
        # Common wrapper keys seen in Komm.ONE APIs
        for key in ("items", "events", "data", "results"):
            if key in data and isinstance(data[key], list):
                return data[key]
    raise ValueError(
        f"[labyrinth] Unexpected API response shape: {type(data).__name__}"
    )


# ── Event parsing ─────────────────────────────────────────────────────────────

def parse_item(item: dict) -> dict | None:
    """
    Convert one API item dict into a rausgucken event dict.
    Returns None if the item has no usable title (skip silently).
    """
    title = clean(item.get("titel") or item.get("title") or "")
    if not title:
        return None

    eid = item.get("id", "")
    detail_url = build_detail_url(eid)

    # Description: short blurb + full description, HTML-stripped, joined
    kurz  = strip_html(item.get("kurzbeschreibung", ""))
    lang  = strip_html(item.get("beschreibung", ""))
    # Avoid duplicating content when kurzbeschreibung ⊂ beschreibung
    if kurz and lang and kurz in lang:
        description = lang
    else:
        description = "\n\n".join(filter(None, [kurz, lang]))

    # Dates
    date_start = normalise_date(item.get("von", ""))
    date_end   = normalise_date(item.get("bis", ""))
    # If bis == von (single-day), leave date_end as None
    if date_end == date_start:
        date_end = None

    # Time: "zeit" is free-text, e.g. "10:00 Uhr", "10:00–12:00 Uhr"
    time_str = clean(item.get("zeit", "")) or None

    # Location
    raw_loc  = item.get("location") or item.get("ort") or ""
    location = clean(str(raw_loc)) if raw_loc else DEFAULT_LOCATION

    # Price
    price_raw = item.get("preis") or item.get("eintritt") or ""
    price     = clean(str(price_raw)) if price_raw else None

    # Age hints — Labyrinth is a Kunstschule, many events are for children
    age_min = item.get("alter_von") or item.get("age_min") or None
    age_max = item.get("alter_bis") or item.get("age_max") or None
    # Coerce to int if present
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
        "tags":         [],          # pipeline extract.py will populate from description
        "slug":         "",          # pipeline slugify.py will populate
        "original_url": detail_url,
        "link":         detail_url,
    })
    return ev


# ── Main ──────────────────────────────────────────────────────────────────────

def scrape() -> list[dict]:
    """
    Entry point called by the pipeline runner.
    Returns list of event dicts matching rausgucken schema.
    """
    print(f"[labyrinth] Fetching API: {API_URL}")
    items = fetch_api()
    print(f"[labyrinth] API returned {len(items)} items")

    events = []
    skipped = 0

    for item in items:
        ev = parse_item(item)
        if ev is None:
            skipped += 1
            continue
        events.append(ev)

    if skipped:
        print(f"[labyrinth] Skipped {skipped} items (no title)")

    print(f"[labyrinth] Done — {len(events)} events")
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
                f"{ev.get('title', '?')[:38]:38}"
            )
            print(f"    desc    : {desc}")
            print(f"    location: {ev.get('location')}")
            print(f"    price   : {ev.get('price')}")
            if ev.get("age_min") is not None or ev.get("age_max") is not None:
                print(f"    age     : {ev.get('age_min')}–{ev.get('age_max')}")

        os.makedirs("output/ludwigsburg", exist_ok=True)
        out = "output/ludwigsburg/10_labyrinth_raw.json"
        with open(out, "w", encoding="utf-8") as f:
            json.dump(events, f, ensure_ascii=False, indent=2)
        print(f"\nSaved {len(events)} events → {out}")

        # Audit trail checks — same pattern as 04_schloss.py
        missing_url  = [e for e in events if not e.get("original_url")]
        missing_ts   = [e for e in events if not e.get("scraped_at")]
        no_desc      = [e for e in events if not e.get("description")]
        with_age     = [e for e in events if e.get("age_min") is not None
                                           or e.get("age_max") is not None]
        with_price   = [e for e in events if e.get("price")]
        with_date_end = [e for e in events if e.get("date_end")]

        print(f"\nAudit trail   : {len(missing_url)} missing original_url, "
              f"{len(missing_ts)} missing scraped_at")
        print(f"Descriptions  : {len(events) - len(no_desc)}/{len(events)} filled")
        print(f"With date_end : {len(with_date_end)}/{len(events)}")
        print(f"With price    : {len(with_price)}/{len(events)}")
        print(f"With age range: {len(with_age)}/{len(events)}")
