"""
05_karlskaserne_ausstellungen.py
Source  : https://karlskaserne.ludwigsburg.de/start/ausstellungen.html
Method  : requests + BS4 — scrape static HTML listing page, then detail pages
Output  : list of event dicts matching rausgucken schema

WHY NOT THE JSON API:
  The Komm.ONE ZM VXC loadData.json endpoint is date-windowed — it silently
  returns only a rolling near-future window of events. Exhibitions scheduled
  months ahead are omitted. The ausstellungen.html page renders ALL current
  and upcoming exhibitions as static HTML server-side, so BS4 is both simpler
  and complete.

  Scraper 06 (Veranstaltungen) continues to use the JSON API — short-lived
  events (workshops, concerts) fit within the rolling window. Multi-month
  exhibitions do not.
"""

import re
import time
import requests
from bs4 import BeautifulSoup
from datetime import datetime, timezone

# ── Config ────────────────────────────────────────────────────────────────────

SOURCE   = "karlskaserne_ausstellungen"
CITY     = "ludwigsburg"

BASE_URL    = "https://karlskaserne.ludwigsburg.de"
LISTING_URL = f"{BASE_URL}/start/ausstellungen.html"

DEFAULT_LOCATION = "Kunstzentrum Karlskaserne, Hindenburgstraße 29, 71638 Ludwigsburg"

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept-Language": "de-DE,de;q=0.9,en;q=0.8",
}


# ── Helpers ───────────────────────────────────────────────────────────────────

def get(url: str, delay: float = 0.5) -> BeautifulSoup:
    time.sleep(delay)
    r = requests.get(url, headers=HEADERS, timeout=15)
    r.raise_for_status()
    return BeautifulSoup(r.text, "html.parser")


def clean(text) -> str:
    return re.sub(r"\s+", " ", str(text or "")).strip()


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
    Parse German date strings from the listing page.
    Formats seen: "8.5.2026", "28.6.2026", "25.9.2026", "9.10.2026"
    Also handles ISO "2026-05-08" if ever returned by detail page.
    """
    if not raw:
        return None
    raw = raw.strip()
    # Already ISO
    if re.match(r"^\d{4}-\d{2}-\d{2}$", raw):
        return raw
    # German D.M.YYYY or DD.MM.YYYY
    m = re.match(r"^(\d{1,2})\.(\d{1,2})\.(\d{4})$", raw)
    if m:
        return f"{m.group(3)}-{int(m.group(2)):02d}-{int(m.group(1)):02d}"
    return None


def parse_date_range(text: str) -> tuple[str | None, str | None]:
    """
    Parse date range string from listing cards.
    Examples:
      "Fr, 8.5.2026 - So, 31.5.2026"
      "So, 28.6.2026 - So, 19.7.2026"
      "Fr, 25.9.2026 - So, 4.10.2026"
    Returns (date_start, date_end).
    """
    # Strip weekday prefixes and split on " - "
    parts = re.split(r"\s*[-–]\s*", text)
    dates = []
    for part in parts:
        # Remove weekday abbreviation "Fr, " / "So, " etc.
        part = re.sub(r"^[A-Za-zÄÖÜäöü]{2,3},\s*", "", part.strip())
        d = normalise_date(part)
        if d:
            dates.append(d)
    if len(dates) == 2:
        return dates[0], dates[1]
    if len(dates) == 1:
        return dates[0], None
    return None, None


# ── Listing page scrape ───────────────────────────────────────────────────────

def scrape_listing() -> list[dict]:
    """
    Scrape ausstellungen.html and return a list of partial event dicts,
    each with title, date_start, date_end, original_url, and link.
    Detail pages are fetched separately to fill description, price, etc.
    """
    print(f"[{SOURCE}] Fetching listing: {LISTING_URL}")
    soup = get(LISTING_URL)

    # Each exhibition is an <h3> with an <a> inside, preceded by a date paragraph.
    # Structure (from live HTML):
    #   <p>Fr, 8.5.2026 - So, 31.5.2026</p>
    #   <h3><a href="...zmdetail_NNN/index.html?nodeID=NNN">Title</a></h3>
    #   <p>Veranstaltungsort Kunstzentrum Karlskaserne</p>
    #
    # We iterate over all <a> tags whose href contains "zmdetail_" — this
    # is the most robust selector regardless of surrounding markup changes.

    seen: set[str] = set()
    events: list[dict] = []

    for a in soup.find_all("a", href=lambda h: h and "zmdetail_" in h):
        href = a["href"]
        # Normalise: strip query params for canonical URL
        canonical = href.split("?")[0]
        if not canonical.startswith("http"):
            canonical = BASE_URL + canonical
        if canonical in seen:
            continue
        seen.add(canonical)

        title = clean(a.get_text())
        if not title:
            continue

        # Walk backwards from the <a> to find the nearest date text.
        # The date is in a <p> or plain text node above the heading.
        date_start, date_end = None, None
        h3 = a.find_parent("h3") or a.find_parent("h2") or a.find_parent("h4")
        if h3:
            # Look at all preceding siblings of the heading's parent
            for sib in h3.find_previous_siblings():
                text = clean(sib.get_text())
                # Date strings contain a dot-separated number like "8.5.2026"
                if re.search(r"\d{1,2}\.\d{1,2}\.\d{4}", text):
                    date_start, date_end = parse_date_range(text)
                    break

        ev = make_base()
        ev.update({
            "title":        title,
            "date_start":   date_start,
            "date_end":     date_end,
            "original_url": canonical,
            "link":         canonical,
        })
        events.append(ev)

    print(f"[{SOURCE}] Found {len(events)} exhibitions on listing page")
    return events


# ── Detail page enrichment ────────────────────────────────────────────────────

def enrich_from_detail(ev: dict) -> None:
    """
    Fetch the detail page and add description, location, price, time, age fields.
    Modifies ev in place. Silently skips on HTTP error.
    """
    url = ev["original_url"]
    try:
        soup = get(url, delay=0.5)
    except Exception as e:
        print(f"[{SOURCE}] Detail fetch failed for {url}: {e}")
        return

    # Description — look for the main content div
    # ZM VXC detail pages typically have a div with class containing "beschreibung"
    # or a <div class="zmDetail..."> block. We try several selectors.
    description = ""
    for sel in [
        "[class*='beschreibung']",
        "[class*='zmDetail']",
        "[class*='detail']",
        "article",
        "main",
    ]:
        block = soup.select_one(sel)
        if block:
            # Remove nav, header, footer, scripts
            for tag in block.find_all(["nav", "header", "footer", "script",
                                        "style", "noscript"]):
                tag.decompose()
            description = re.sub(r"\s+", " ", block.get_text(" ", strip=True))
            if len(description) > 100:
                break

    if description:
        ev["description"] = description

    # Location — look for vCard or Veranstaltungsort text
    location = DEFAULT_LOCATION
    for p in soup.find_all(["p", "div", "span"]):
        t = clean(p.get_text())
        if "Veranstaltungsort" in t or "Karlskaserne" in t:
            loc_candidate = t.replace("Veranstaltungsort", "").strip()
            if loc_candidate:
                location = loc_candidate
                break
    ev["location"] = location

    # Price — look for "Eintritt" or "€" or "Euro"
    price = None
    for p in soup.find_all(["p", "li", "div", "span"]):
        t = clean(p.get_text())
        if re.search(r"(eintritt|€|euro|\bfrei\b)", t, re.I) and len(t) < 200:
            price = t
            break
    ev["price"] = price

    # Age — look for "ab \d+ Jahren" patterns in all text
    full_text = soup.get_text(" ")
    age_min, age_max = None, None
    m = re.search(r"ab\s+(\d+)\s+(?:bis\s+(\d+)\s+)?Jahren", full_text, re.I)
    if m:
        age_min = int(m.group(1))
        if m.group(2):
            age_max = int(m.group(2))
    ev["age_min"] = age_min
    ev["age_max"] = age_max

    # Time — exhibitions rarely have a single "zeit"; skip unless found
    ev.setdefault("time", None)
    ev.setdefault("tags", [])
    ev.setdefault("slug", "")


# ── Main ──────────────────────────────────────────────────────────────────────

def scrape() -> list[dict]:
    """
    Entry point called by the pipeline runner.
    Returns list of exhibition event dicts matching rausgucken schema.
    """
    events = scrape_listing()

    for ev in events:
        enrich_from_detail(ev)

    # Final audit
    missing_url  = [e for e in events if not e.get("original_url")]
    missing_date = [e for e in events if not e.get("date_start")]
    print(f"[{SOURCE}] Done — {len(events)} exhibitions "
          f"({len(missing_url)} missing URL, {len(missing_date)} missing date_start)")
    return events


# ── Standalone run ────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import json, os

    events = scrape()

    if not events:
        print("No events returned.")
    else:
        print(f"\nAll exhibitions:")
        for ev in events:
            print(
                f"  {str(ev.get('date_start', '?')):12}  "
                f"{'→ ' + str(ev.get('date_end', '')):16}  "
                f"{ev.get('title', '?')[:50]}"
            )
            if ev.get("description"):
                print(f"    desc : {ev['description'][:80]}")
            print(f"    price: {ev.get('price')}")
            print(f"    age  : {ev.get('age_min')} – {ev.get('age_max')}")

        os.makedirs("output/ludwigsburg", exist_ok=True)
        out = "output/ludwigsburg/05_karlskaserne_ausstellungen_raw.json"
        with open(out, "w", encoding="utf-8") as f:
            json.dump(events, f, ensure_ascii=False, indent=2)
        print(f"\nSaved {len(events)} events → {out}")
