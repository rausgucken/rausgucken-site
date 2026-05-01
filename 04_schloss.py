"""
04_schloss.py
Source  : https://www.schloss-ludwigsburg.de/besuchsinformation/fuehrungen-veranstaltungen
Method  : requests — TYPO3 session cookie + filter form pagination + per-card detail fetch
Output  : list of event dicts matching rausgucken schema

Design decisions:
  - The listing page shows each tour OCCURRENCE as its own dated card.
    "Blick hinter die Kulissen" running 20 times = 20 cards = 20 separate
    events in our output, each with its own date_start. This is correct —
    each occurrence is independently bookable and independently useful.
  - Each card links to its own detail page URL (occurrence-specific). We fetch
    that detail page per card to get the full description, price breakdown,
    and accessibility info. Simple, robust — one fetch per event.
  - The form action URL has a TYPO3 cHash baked in for the DEFAULT date range.
    Submitting new from/to via the action URL corrupts the cHash → 404.
    Fix: submit new date windows to START_URL instead — TYPO3 recomputes
    the cHash and redirects automatically.
  - No Playwright. Session cookie from the first GET carries through all requests.

fetch_detail() changes (v2):
  - Description: now collects ALL content blocks (subtitle, Veranstaltung mit,
    Termin, Dauer, body paragraph) and joins them into one readable string,
    rather than stopping at the first <p>. Meta lines like "Veranstaltung mit:"
    are kept — they are useful context — but the real body paragraph is always
    included too.
  - Schedule table: parsed BEFORE stripping tables. Returns a `schedule` list
    of dicts with date_from, date_to, weekdays (JS day numbers 0=Sun…6=Sat),
    weekday_labels, time_start, time_end. This covers:
      * Ranged exhibitions (Image 1: Mo–Fr 11–16, Sa/So/Feiertag 10–17)
      * Standing tours on specific weekdays (Image 2: Thu/Fri/Sat only)
  - date_end: set to the latest date_to found in the schedule table.
"""

import re
import html as html_module
import time
import requests
from bs4 import BeautifulSoup
from datetime import datetime, timedelta, timezone

# ── Config ────────────────────────────────────────────────────────────────────

BASE_URL  = "https://www.schloss-ludwigsburg.de"
START_URL = f"{BASE_URL}/besuchsinformation/fuehrungen-veranstaltungen"
SOURCE    = "schloss"
CITY      = "ludwigsburg"
END_DATE  = datetime(2027, 12, 31)

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "de-DE,de;q=0.9,en;q=0.8",
}

# Only safe filter params — no HMAC tokens (they corrupt the TYPO3 cHash)
FIXED_FILTER = {
    "tx_ssgmonument_eventfilterlist[filter][monument]":            "8",
    "tx_ssgmonument_eventfilterlist[filter][category]":            "0",
    "tx_ssgmonument_eventfilterlist[filter][resultnumber]":        "-1",
    "tx_ssgmonument_eventfilterlist[filter][resultnumbervalue]":   "16",
    "tx_ssgmonument_eventfilterlist[filter][sysLanguageUid]":      "0",
    "tx_ssgmonument_eventfilterlist[filter][themeyear]":           "0",
    "tx_ssgmonument_eventfilterlist[filter][forfamily]":           "0",
    "tx_ssgmonument_eventfilterlist[filter][eventDateTypeRefuse]": "9",
}

# ── German weekday → JS day number (0=Sun, 1=Mon … 6=Sat) ────────────────────
DE_WEEKDAY_TO_JS = {
    "mo": 1, "di": 2, "mi": 3, "do": 4, "fr": 5, "sa": 6, "so": 0,
    "mon": 1, "die": 2, "mit": 3, "don": 4, "fre": 5, "sam": 6, "son": 0,
    # English (English-language pages of the same site)
    "mon": 1, "tue": 2, "wed": 3, "thu": 4, "fri": 5, "sat": 6, "sun": 0,
}


# ── Helpers ───────────────────────────────────────────────────────────────────

def clean(text: str) -> str:
    return re.sub(r"\s+", " ", str(text or "")).strip()


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


def get_page(session: requests.Session, url: str,
             params: dict = None) -> BeautifulSoup:
    time.sleep(0.4)
    resp = session.get(
        url, headers=HEADERS, params=params,
        timeout=15, allow_redirects=True
    )
    resp.raise_for_status()
    return BeautifulSoup(resp.text, "html.parser")


# ── Form & pagination ─────────────────────────────────────────────────────────

def get_form_info(soup: BeautifulSoup) -> dict:
    form = soup.find("form", action=re.compile("eventfilterlist"))
    if not form:
        raise RuntimeError(
            "Filter form not found — page structure may have changed."
        )
    action = form["action"].strip()
    if not action.startswith("http"):
        action = BASE_URL + action

    to_input = form.find(
        "input", {"name": "tx_ssgmonument_eventfilterlist[filter][to]"}
    )
    default_to = None
    if to_input and to_input.get("value"):
        try:
            default_to = datetime.strptime(to_input["value"].strip(), "%d.%m.%Y")
        except ValueError:
            pass

    return {"action": action, "default_to": default_to}


def get_next_page_url(soup: BeautifulSoup) -> str | None:
    nav = soup.find("nav", {"aria-label": "Pagination"})
    if not nav:
        return None
    li = nav.find("li", class_="next")
    if not li:
        return None
    a = li.find("a", href=True)
    if not a:
        return None
    href = a["href"]
    return href if href.startswith("http") else BASE_URL + href


def get_last_page_url(soup: BeautifulSoup) -> str | None:
    nav = soup.find("nav", {"aria-label": "Pagination"})
    if not nav:
        return None
    li = nav.find("li", class_="last")
    if not li:
        return None
    a = li.find("a", href=True)
    if not a:
        return None
    href = a["href"]
    return href if href.startswith("http") else BASE_URL + href


def window_end_from_url(url: str) -> datetime | None:
    m = re.search(r"filter%5D%5Bto%5D=(\d{2}\.\d{2}\.\d{4})", url)
    if not m:
        m = re.search(r"filter\[to\]=(\d{2}\.\d{2}\.\d{4})", url)
    if m:
        try:
            return datetime.strptime(m.group(1), "%d.%m.%Y")
        except ValueError:
            pass
    return None


# ── Schedule table parser ─────────────────────────────────────────────────────

def parse_schedule_tables(soup: BeautifulSoup) -> list[dict]:
    """
    Parse all schedule tables on a detail page.

    The site uses two table layouts:

    Layout A — ranged exhibitions (Image 1: "Weil menschlich so viel möglich ist"):
        Row 1 (header): "08. Mai bis 31. August"  (date range, spans both columns)
        Row 2:          "Mo , Di , Mi , Do , Fr"  |  "11.00 bis 16.00 Uhr"
        Row 3:          "Sa , So , Feiertag"       |  "10.00 bis 17.00 Uhr"

    Layout B — standing tours on specific weekends (Image 2: "Freier Rundgang"):
        Row 1 (header): "Ascension Day weekend - May 14th to May 16th"
        Row 2:          "Thu, Fri, Sat"            |  "10:00 to 17:00"

    Returns a list of schedule dicts:
        {
          "date_from":      "YYYY-MM-DD" or null,
          "date_to":        "YYYY-MM-DD" or null,
          "weekdays":       [1, 5, 6],          # JS day numbers
          "weekday_labels": ["Mo", "Fr", "Sa"],  # human readable
          "time_start":     "11:00" or null,
          "time_end":       "16:00" or null,
        }
    """
    schedule = []

    for table in soup.find_all("table"):
        rows = table.find_all("tr")
        if not rows:
            continue

        current_date_from = None
        current_date_to   = None

        for row in rows:
            cells = [clean(td.get_text(" ")) for td in row.find_all(["td", "th"])]
            if not cells:
                continue

            # ── Single-cell row: date range header ────────────────────────────
            # e.g. "08. Mai bis 31. August" or "14. Mai bis 16. Mai"
            if len(cells) == 1:
                text = cells[0]
                date_range = _parse_date_range(text)
                if date_range:
                    current_date_from, current_date_to = date_range
                continue

            # ── Two-cell row: weekdays | time ─────────────────────────────────
            if len(cells) >= 2:
                weekday_text = cells[0]
                time_text    = cells[1]

                weekday_nums, weekday_labels = _parse_weekdays(weekday_text)
                time_start, time_end = _parse_time_range(time_text)

                if weekday_nums or time_start:
                    entry = {
                        "date_from":      current_date_from,
                        "date_to":        current_date_to,
                        "weekdays":       weekday_nums,
                        "weekday_labels": weekday_labels,
                        "time_start":     time_start,
                        "time_end":       time_end,
                    }
                    schedule.append(entry)

    return schedule


def _parse_date_range(text: str) -> tuple[str | None, str | None] | None:
    """
    Parse a German date range string like:
      "08. Mai bis 31. August"
      "14. Mai bis 16. Mai"
      "08. Mai bis 31. August 2026"
    Returns (date_from_iso, date_to_iso) or None if not a date range.
    """
    DE_MONTHS = {
        "jan": 1, "feb": 2, "mär": 3, "mar": 3, "apr": 4,
        "mai": 5, "jun": 6, "jul": 7, "aug": 8, "sep": 9,
        "okt": 10, "oct": 10, "nov": 11, "dez": 12, "dec": 12,
    }

    # Pattern: "DD. MonthName [bis DD. MonthName [YYYY]]"
    pattern = re.compile(
        r"(\d{1,2})\.\s*([A-Za-zä]+)"
        r"(?:\s+\d{4})?"
        r"\s+bis\s+"
        r"(\d{1,2})\.\s*([A-Za-zä]+)"
        r"(?:\s+(\d{4}))?",
        re.I
    )
    m = pattern.search(text)
    if not m:
        return None

    day1, mon1_raw, day2, mon2_raw, year_raw = m.groups()
    year = int(year_raw) if year_raw else datetime.today().year

    mon1 = DE_MONTHS.get(mon1_raw[:3].lower())
    mon2 = DE_MONTHS.get(mon2_raw[:3].lower())
    if not mon1 or not mon2:
        return None

    try:
        d_from = datetime(year, mon1, int(day1)).strftime("%Y-%m-%d")
        d_to   = datetime(year, mon2, int(day2)).strftime("%Y-%m-%d")
        return d_from, d_to
    except ValueError:
        return None


def _parse_weekdays(text: str) -> tuple[list[int], list[str]]:
    """
    Parse a weekday cell like:
      "Mo , Di , Mi , Do , Fr"
      "Sa , So , Feiertag"
      "Thu, Fri, Sat"
    Returns ([JS_day_numbers], [display_labels]).
    "Feiertag" is ignored (public holidays — can't be represented as a weekday number).
    """
    # Split on common separators
    parts = re.split(r"[,/\s]+", text)
    nums   = []
    labels = []
    for part in parts:
        part = part.strip().rstrip(".")
        key  = part[:3].lower()
        js_day = DE_WEEKDAY_TO_JS.get(key)
        if js_day is not None:
            if js_day not in nums:
                nums.append(js_day)
                labels.append(part)
    return nums, labels


def _parse_time_range(text: str) -> tuple[str | None, str | None]:
    """
    Parse a time cell like:
      "11.00 bis 16.00 Uhr"
      "10:00 to 17:00"
      "11:00 - 16:00 Uhr"
    Returns ("11:00", "16:00") or (None, None).
    """
    # Normalise decimal separator
    text = text.replace(".", ":")
    times = re.findall(r"\b(\d{1,2}:\d{2})\b", text)
    if len(times) >= 2:
        return times[0], times[1]
    if len(times) == 1:
        return times[0], None
    return None, None


# ── Detail page fetch ─────────────────────────────────────────────────────────

def fetch_detail(session: requests.Session, url: str) -> dict:
    """
    Fetch the detail page for one event occurrence and extract:

      full_description : ALL relevant content blocks joined as one string:
                         subtitle + "Veranstaltung mit" + "Termin" + "Dauer"
                         + the actual body paragraph.
                         Previously only the first <p> was taken, which
                         often landed on "Veranstaltung mit: X" and missed
                         the real description entirely.
      price_detail     : adult / reduced / family prices as one string
      location_detail  : meeting point / address line
      accessibility    : "Barrierefrei" / "Nicht barrierefrei" / None
      age_hint         : raw age text for pipeline to map to age_min/age_max
      schedule         : list of schedule dicts from the schedule table
                         (see parse_schedule_tables for structure)
      date_end         : latest date_to across all schedule entries, or None
    """
    result = {
        "full_description": None,
        "price_detail":     None,
        "location_detail":  None,
        "accessibility":    None,
        "age_hint":         None,
        "schedule":         [],
        "date_end":         None,
    }
    try:
        time.sleep(0.5)
        resp = session.get(url, headers=HEADERS, timeout=15, allow_redirects=True)
        resp.raise_for_status()
        soup = BeautifulSoup(resp.text, "html.parser")

        # ── Step 1: Parse schedule table BEFORE stripping it ─────────────────
        result["schedule"] = parse_schedule_tables(soup)

        # Derive date_end from latest date_to in schedule
        date_tos = [
            s["date_to"] for s in result["schedule"] if s.get("date_to")
        ]
        if date_tos:
            result["date_end"] = max(date_tos)

        # ── Step 2: Strip boilerplate (nav, header, footer, scripts, tables) ─
        for tag in soup(["nav", "header", "footer", "script",
                         "style", "noscript", "table"]):
            tag.decompose()

        # ── Step 3: Build the full description ───────────────────────────────
        #
        # The detail page structure (from screenshots) is:
        #
        #   <h1> or <h2>  — tour/exhibition title (already in ev.title, skip)
        #   <p> or <div>  — subtitle  e.g. "Sonderführung: Perücke & Kostüm"
        #   <p>            — "Veranstaltung mit: Laura Imprescia"
        #   <p>            — "Termin: Freitag, 01.05.2026, 14:00"
        #   <p>            — "Dauer: circa 75 Minuten"
        #   <p>            — actual body paragraph (the real description)
        #
        # Old code: took only the FIRST <p> → got "Veranstaltung mit: X"
        # New code: collect ALL non-boilerplate blocks, join them.
        # We keep meta lines (Veranstaltung mit, Termin, Dauer) because
        # they add useful context. The body paragraph is always included.

        SKIP_PHRASES = {
            "cookie", "datenschutz", "impressum", "javascript",
            "anmeldung ist erforderlich", "folgenden terminen",
            "nicht zu besichtigen",
        }

        content_blocks = []

        # Collect from all text-bearing tags in document order
        for tag in soup.find_all(["h2", "h3", "h4", "p", "li"]):
            t = clean(tag.get_text(" "))
            if len(t) < 10:
                continue
            t_lower = t.lower()
            if any(phrase in t_lower for phrase in SKIP_PHRASES):
                continue
            # Skip pure date strings like "01.05.2026"
            if re.match(r"^\d{1,2}\.\d{1,2}\.\d{4}$", t):
                continue
            # Skip navigation / footer remnants
            if re.match(r"^(zurück|weiter|seite \d|home|start)\b", t_lower):
                continue
            content_blocks.append(t)

        if content_blocks:
            # Join all blocks with a newline so the UI can split them if needed
            result["full_description"] = "\n".join(content_blocks)

        # ── Step 4: remaining fields (unchanged logic) ────────────────────────
        full_text = soup.get_text("\n")

        # Price block
        price_m = re.search(
            r"(Erwachsene\s+[\d,]+\s*€.{0,300}?)(?=Gruppen|Anmeldung|\Z)",
            full_text, re.S
        )
        if price_m:
            result["price_detail"] = clean(
                price_m.group(1).replace("\n", " ")
            )[:250]

        # Meeting point / venue
        loc_m = re.search(r"(Residenzschloss[^\n]{0,120})", full_text)
        if loc_m:
            result["location_detail"] = clean(loc_m.group(1))

        # Accessibility
        text_lower = full_text.lower()
        if "nicht barrierefrei" in text_lower:
            result["accessibility"] = "Nicht barrierefrei"
        elif "barrierefrei" in text_lower:
            result["accessibility"] = "Barrierefrei"

        # Age hint
        age_m = re.search(
            r"(ab\s*\d+\s*Jahr|für\s*\d[\d\s\-]*[Jj]ährige"
            r"|Kinder|Familien|geeignet für[^\n]{0,40})",
            full_text
        )
        if age_m:
            result["age_hint"] = clean(age_m.group(0))

    except Exception as e:
        print(f"    [detail] {url[:70]}: {e}")

    return result


# ── Listing page parsing ──────────────────────────────────────────────────────

def parse_aria_label(label: str) -> tuple:
    """
    Extract (date_iso, time_str) from aria-label on the detail anchor.
    e.g. "Weitere Informationen zu Tour X (25.04.2026, 11:00)"
    Returns (None, None) for standing tours with no fixed date.
    """
    label = html_module.unescape(label)
    date_m = re.search(r"(\d{2}\.\d{2}\.\d{4})", label)
    time_m = re.search(r",\s*(\d{2}:\d{2})\s*\)?$", label)

    date_iso = None
    if date_m:
        try:
            date_iso = datetime.strptime(
                date_m.group(1), "%d.%m.%Y"
            ).strftime("%Y-%m-%d")
        except ValueError:
            pass

    return date_iso, (time_m.group(1) if time_m else None)


def parse_and_enrich_card(
    item: BeautifulSoup,
    session: requests.Session,
) -> dict | None:
    """
    Parse one listing card and immediately fetch its detail page.
    Returns a complete event dict, or None if the card has no title.
    """
    ev = make_base()

    # Title
    h5 = item.find("span", class_="h5")
    title = clean(h5.get_text()) if h5 else ""
    if not title:
        return None
    ev["title"] = title

    # Date, time, and link from the "Weitere Informationen" anchor
    info_link = item.find(
        "a", href=True,
        attrs={"aria-label": re.compile("Weitere Informationen")}
    )
    if info_link:
        href = info_link["href"]
        link = href if href.startswith("http") else BASE_URL + href
        ev["link"]         = link
        ev["original_url"] = link
        date_iso, time_str = parse_aria_label(info_link.get("aria-label", ""))
        ev["date_start"]   = date_iso   # None for standing/ranged tours
        ev["time"]         = time_str   # None if not in aria-label
    else:
        ev["date_start"]   = None
        ev["time"]         = None
        ev["link"]         = START_URL
        ev["original_url"] = START_URL

    ev["tags"]     = []
    ev["slug"]     = ""
    ev["location"] = "Residenzschloss Ludwigsburg"

    # Fetch detail page
    detail = fetch_detail(session, ev["link"])

    ev["description"]   = detail["full_description"]
    ev["price"]         = detail["price_detail"]
    ev["accessibility"] = detail["accessibility"]
    ev["schedule"]      = detail["schedule"]       # NEW: schedule entries

    # date_end: use schedule-derived date_end for standing/ranged events
    ev["date_end"] = detail["date_end"]

    # For standing tours with no aria-label time, use first schedule entry's time
    if not ev["time"] and detail["schedule"]:
        ev["time"] = detail["schedule"][0].get("time_start")

    if detail["location_detail"]:
        ev["location"] = detail["location_detail"]

    if detail["age_hint"]:
        ev["_age_hint"] = detail["age_hint"]

    return ev


# ── Window scraping ───────────────────────────────────────────────────────────

def scrape_window(
    session: requests.Session,
    soup: BeautifulSoup,
    all_events: list,
    seen_keys: set,
) -> datetime | None:
    """
    Paginate through all pages of one date window.
    For each card: parse + fetch detail page inline.
    Deduplicates by (title, date_start, time).
    """
    page_num = 1
    discovered_end = None

    last_url = get_last_page_url(soup)
    if last_url:
        discovered_end = window_end_from_url(last_url)
    if not discovered_end:
        next_check = get_next_page_url(soup)
        if next_check:
            discovered_end = window_end_from_url(next_check)

    while True:
        results = soup.find_all(
            "div",
            class_=lambda c: c and "result" in c
                              and "result-count" not in c
                              and "results-list" not in c
        )

        new_count = 0
        for item in results:
            # Peek at title and date for dedup check before fetching detail
            h5 = item.find("span", class_="h5")
            title = clean(h5.get_text()) if h5 else ""
            if not title:
                continue

            info_link = item.find(
                "a", href=True,
                attrs={"aria-label": re.compile("Weitere Informationen")}
            )
            aria = info_link.get("aria-label", "") if info_link else ""
            date_iso, time_str = parse_aria_label(aria)
            key = (title, date_iso, time_str)

            if key in seen_keys:
                continue
            seen_keys.add(key)

            ev = parse_and_enrich_card(item, session)
            if ev:
                all_events.append(ev)
                new_count += 1

        print(f"    Page {page_num}: {len(results)} cards, {new_count} new "
              f"(total: {len(all_events)})")

        next_url = get_next_page_url(soup)
        if not next_url:
            break
        try:
            soup = get_page(session, next_url)
        except Exception as e:
            print(f"    Page {page_num + 1} fetch failed: {e}")
            break
        page_num += 1

    return discovered_end


# ── Main ──────────────────────────────────────────────────────────────────────

def scrape() -> list[dict]:
    """
    Entry point called by the pipeline runner.
    Returns list of event dicts matching rausgucken schema.
    """
    session = requests.Session()
    all_events: list[dict] = []
    seen_keys: set = set()

    print(f"[schloss] Loading: {START_URL}")
    try:
        soup = get_page(session, START_URL)
    except Exception as e:
        raise RuntimeError(f"[schloss] Start page failed: {e}") from e

    form_info  = get_form_info(soup)
    default_to = form_info["default_to"]

    today        = datetime.today().replace(hour=0, minute=0, second=0, microsecond=0)
    window_start = today
    window_end   = default_to or (today + timedelta(days=140))

    print(f"[schloss] Server window end: {window_end.strftime('%d.%m.%Y')}")

    # Window 1 — reuse the already-loaded page
    print(f"[schloss] Window 1: "
          f"{window_start.strftime('%d.%m.%Y')} – {window_end.strftime('%d.%m.%Y')}")
    discovered_end = scrape_window(session, soup, all_events, seen_keys)
    if discovered_end:
        window_end = discovered_end

    # Subsequent windows — submit to START_URL, not the stale action URL.
    window_start = window_end + timedelta(days=1)

    while window_start <= END_DATE:
        window_end = min(window_start + timedelta(days=140), END_DATE)
        print(f"[schloss] Window: "
              f"{window_start.strftime('%d.%m.%Y')} – {window_end.strftime('%d.%m.%Y')}")
        try:
            params = {
                **FIXED_FILTER,
                "tx_ssgmonument_eventfilterlist[filter][from]":
                    window_start.strftime("%d.%m.%Y"),
                "tx_ssgmonument_eventfilterlist[filter][to]":
                    window_end.strftime("%d.%m.%Y"),
            }
            soup = get_page(session, START_URL, params=params)
        except Exception as e:
            print(f"[schloss] Window failed: {e} — skipping")
            window_start = window_end + timedelta(days=1)
            continue

        discovered_end = scrape_window(session, soup, all_events, seen_keys)
        if discovered_end and discovered_end > window_end:
            window_end = discovered_end

        window_start = window_end + timedelta(days=1)

    print(f"[schloss] Done — {len(all_events)} events")
    return all_events


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
            sched = ev.get("schedule") or []
            print(f"  {str(ev.get('date_start','?')):12}  "
                  f"{str(ev.get('time') or '–'):8}  "
                  f"{ev.get('title','?')[:38]:38}")
            print(f"    desc : {desc}")
            if sched:
                print(f"    sched: {sched[0]}")

        os.makedirs("output/ludwigsburg", exist_ok=True)
        out = "output/ludwigsburg/04_schloss_raw.json"
        with open(out, "w", encoding="utf-8") as f:
            json.dump(events, f, ensure_ascii=False, indent=2)
        print(f"\nSaved {len(events)} events → {out}")

        missing_url  = [e for e in events if not e.get("original_url")]
        missing_ts   = [e for e in events if not e.get("scraped_at")]
        no_desc      = [e for e in events if not e.get("description")]
        with_sched   = [e for e in events if e.get("schedule")]
        with_date_end = [e for e in events if e.get("date_end")]

        print(f"Audit trail   : {len(missing_url)} missing original_url, "
              f"{len(missing_ts)} missing scraped_at")
        print(f"Descriptions  : {len(events) - len(no_desc)}/{len(events)} filled")
        print(f"With schedule : {len(with_sched)}/{len(events)}")
        print(f"With date_end : {len(with_date_end)}/{len(events)}")