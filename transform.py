"""
pipeline/transform.py
─────────────────────
Stage 1 of the rausgucken pipeline.

Takes  : output/ludwigsburg/raw_combined.json   (merged scraper output)
Writes : output/ludwigsburg/transformed.json

Responsibilities
  - Generate stable event ID (hash of source + original_url + date_start)
  - Generate URL slug
  - Map tags from title/description/age keywords
  - Map age hints → age_min / age_max
  - Normalise price string (including extraction from description text)
  - Strip [AUSGEBUCHT] prefix and flag booked-out events
  - Handle standing events (date_start=null) — kept but flagged
  - Compute weekday coverage for frontend filtering
"""

import hashlib
import json
import re
import sys
import unicodedata
from pathlib import Path

ROOT = Path(__file__).parent
RAW  = ROOT / "output" / "ludwigsburg" / "raw_combined.json"
OUT  = ROOT / "output" / "ludwigsburg" / "transformed.json"

VALID_TAGS = {
    "Ausstellung", "Entertainment", "Familie", "Fest", "Fuehrung",
    "Jugend", "Kinder", "Kulinarik", "Lesung", "Messe", "Musik",
    "Outdoor", "Sport", "Sprache", "Tanz", "Theater", "Vortrag", "Workshop",
}

# ── Tag inference rules ───────────────────────────────────────────────────────
# Each rule: (tag, [keyword patterns]) — matched case-insensitively against
# title + description combined. All matching tags are applied.

TAG_RULES = [
    ("Fuehrung",      [r"führung", r"\btour\b", r"rundgang", r"rundfahrt"]),
    ("Kinder",        [r"\bkinder\b", r"\bkids\b", r"familienführung.*kinder",
                       r"ab\s*[3-9]\s*jahr", r"für\s*[3-9]\s*[-–]\s*\d+\s*j",
                       r"\bjugendliche\b"]),
    ("Familie",       [r"\bfamili", r"familien", r"mütter.*kind", r"eltern.*kind"]),
    ("Musik",         [r"\bkonzert\b", r"\bmusik\b", r"\borchester\b",
                       r"\bsinfon", r"\boper\b", r"\brecital\b"]),
    ("Theater",       [r"\btheater\b", r"\bschauspiel\b", r"\bstück\b"]),
    ("Tanz",          [r"\btanz\b", r"\bballett\b", r"\bperformanc",
                       r"\bzirkus\b", r"\bakrobatik\b", r"stelzenlauf"]),
    ("Lesung",        [r"\blesung\b", r"\bvorlese", r"\bliteratur"]),
    ("Vortrag",       [r"\bvortrag\b", r"\bgespräch\b", r"\bdiskussion\b"]),
    ("Workshop",      [r"\bworkshop\b", r"\bkurs\b", r"\bateliers\b",
                       r"\bwerkstatt\b", r"\batelier\b"]),
    ("Kulinarik",     [r"\bdiner\b", r"\bessen\b", r"\bgemüse", r"\bkulinar",
                       r"\bbuffet\b", r"\bwein\b"]),
    ("Outdoor",       [r"\bgarten\b", r"\bpark\b", r"\bfreiluft\b",
                       r"\baußen\b", r"\boutdoor"]),
    ("Fest",          [r"\bfest\b", r"\bfeier\b", r"\bgala\b"]),
    ("Ausstellung",   [r"\bausstellung\b", r"\bexposition\b"]),
    ("Entertainment", [r"\bzauber\b", r"\bmagie\b", r"\bshow\b",
                       r"\bcomedy\b", r"\bkabar", r"\bjonglage\b",
                       r"\btrapez\b", r"vertikaltuch"]),
    ("Sport",         [r"\bsport\b", r"\bturnen\b", r"\byoga\b",
                       r"\bfitness\b"]),
]

# ── Age mapping ───────────────────────────────────────────────────────────────
# Patterns matched against title + description. First match wins per event.
# (pattern, age_min, age_max)

AGE_MAP = [
    # Explicit age ranges — specific first
    (r"ab\s*3\s*jahr",        3,  None),
    (r"ab\s*5\s*jahr",        5,  None),
    (r"ab\s*6\s*jahr",        6,  None),
    (r"ab\s*7\s*jahr",        7,  None),
    (r"ab\s*8\s*jahr",        8,  None),
    (r"ab\s*10\s*jahr",       10, None),
    (r"ab\s*12\s*jahr",       12, None),
    (r"ab\s*13\s*jahr",       13, None),
    (r"ab\s*14\s*jahr",       14, None),
    # Banded ranges in title e.g. "8-12 Jährige"
    (r"(\d+)\s*[-–]\s*\d+\s*j[äa]hrige",  None, None),  # handled separately
    # Generic labels
    (r"\bkinder\b",           4,  12),
    (r"\bfamili",             4,  None),
    (r"\bjugendliche\b",      12, 18),
]

# ── Price extraction from description ─────────────────────────────────────────
# Labyrinth embeds price in description as "Gebühr: 45,50 Euro"

PRICE_IN_DESC_RE = re.compile(
    r"Geb[üu]hr[:\s]+(\d[\d\s.,]*\s*Euro)",
    re.IGNORECASE,
)


# ── Helpers ───────────────────────────────────────────────────────────────────

def slugify(text: str) -> str:
    """ASCII slug: lowercase, umlaut-safe, hyphens, max 80 chars."""
    replacements = {"ä": "ae", "ö": "oe", "ü": "ue", "ß": "ss",
                    "Ä": "Ae", "Ö": "Oe", "Ü": "Ue"}
    for k, v in replacements.items():
        text = text.replace(k, v)
    text = unicodedata.normalize("NFKD", text)
    text = text.encode("ascii", "ignore").decode("ascii")
    text = re.sub(r"[^\w\s-]", "", text).lower()
    text = re.sub(r"[\s_]+", "-", text).strip("-")
    return text[:80]


def stable_id(source: str, original_url: str, date_start) -> str:
    key = f"{source}|{original_url}|{date_start or 'standing'}"
    return hashlib.sha256(key.encode()).hexdigest()[:16]


def infer_tags(title: str, description: str) -> list[str]:
    haystack = f"{title} {description or ''}".lower()
    tags = []
    seen: set[str] = set()
    for tag, patterns in TAG_RULES:
        if any(re.search(p, haystack) for p in patterns):
            if tag not in seen:
                tags.append(tag)
                seen.add(tag)
    return tags


def infer_age(title: str, description: str, existing_min=None, existing_max=None):
    """
    Returns (age_min, age_max).
    Prefers existing values from the scraper if already set.
    Falls back to pattern matching on title + description.
    """
    if existing_min is not None:
        return existing_min, existing_max

    haystack = f"{title} {description or ''}".lower()

    # Special case: banded range like "8-12 Jährige" → extract min
    m = re.search(r"(\d+)\s*[-–]\s*(\d+)\s*j[äa]hrige", haystack)
    if m:
        return int(m.group(1)), int(m.group(2))

    for pattern, age_min, age_max in AGE_MAP:
        if pattern.startswith(r"(\d+)"):
            continue  # already handled above
        if re.search(pattern, haystack):
            return age_min, age_max

    return None, None


def extract_price_from_desc(description: str | None) -> str | None:
    """Pull 'Gebühr: X Euro' from description if present."""
    if not description:
        return None
    m = PRICE_IN_DESC_RE.search(description)
    if m:
        raw = m.group(1).strip()
        return re.sub(r"\s+", " ", raw)
    return None


def normalise_price(raw: str | None, description: str | None = None) -> str | None:
    # Try explicit price field first
    if raw:
        p = re.sub(r"\s+Information und.*$", "", raw, flags=re.I).strip()
        p = re.sub(r"\s+", " ", p)
        if p:
            return p
    # Fall back to description extraction
    return extract_price_from_desc(description)


def strip_ausgebucht(title: str) -> tuple[str, bool]:
    """Remove [AUSGEBUCHT] prefix, return (cleaned_title, is_booked_out)."""
    m = re.match(r"^\[AUSGEBUCHT\]\s*", title, re.IGNORECASE)
    if m:
        return title[m.end():].strip(), True
    return title, False


def compute_weekdays(date_start: str | None, date_end: str | None) -> list[int]:
    """Return JS weekday numbers (0=Sun…6=Sat) covered by the event."""
    if not date_start:
        return []
    try:
        from datetime import date, timedelta
        d_start = date.fromisoformat(date_start)
        d_end   = date.fromisoformat(date_end) if date_end else d_start
        days    = min((d_end - d_start).days + 1, 7)
        weekdays: list[int] = []
        for i in range(days):
            wd = (d_start + timedelta(days=i)).isoweekday() % 7
            if wd not in weekdays:
                weekdays.append(wd)
        return sorted(weekdays)
    except Exception:
        return []


# ── Transform ─────────────────────────────────────────────────────────────────

def transform(events: list[dict]) -> list[dict]:
    out = []
    for ev in events:
        raw_title   = ev.get("title", "")
        title, is_booked_out = strip_ausgebucht(raw_title)
        description = ev.get("description") or ""
        date_start  = ev.get("date_start")

        tags = infer_tags(title, description)

        age_min, age_max = infer_age(
            title, description,
            existing_min=ev.get("age_min"),
            existing_max=ev.get("age_max"),
        )

        # Ensure Familie present when age implies family-relevant content
        if age_min is not None and age_min <= 6 and "Familie" not in tags:
            tags.append("Familie")

        is_standing = date_start is None

        slug_input = f"{title} {date_start or 'standing'}"
        slug = slugify(slug_input)

        price = normalise_price(ev.get("price"), description)

        transformed = {
            "id":                    stable_id(ev["source"], ev["original_url"], date_start),
            "title":                 title,
            "date_start":            date_start,
            "date_end":              ev.get("date_end"),
            "time":                  ev.get("time") if ev.get("time") not in ("–", "") else None,
            "description":           description or None,
            "location":              ev.get("location"),
            "price":                 price,
            "age_min":               age_min,
            "age_max":               age_max,
            "tags":                  tags,
            "link":                  ev.get("link", ""),
            "original_url":          ev.get("original_url", ""),
            "source":                ev.get("source", ""),
            "city":                  ev.get("city", "ludwigsburg"),
            "slug":                  slug,
            "weekdays":              compute_weekdays(date_start, ev.get("date_end")),
            "scraped_at":            ev.get("scraped_at", ""),
            "extraction_confidence": ev.get("extraction_confidence", 1.0),
            "is_new":                True,       # diff.py will correct this
            "is_booked_out":         is_booked_out,
            "sponsored":             False,
            "_is_standing_tour":     is_standing,
        }
        out.append(transformed)
    return out


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    if not RAW.exists():
        print(f"[transform] ERROR — {RAW} not found. Run scrape.py first.")
        sys.exit(1)

    print(f"[transform] Reading {RAW}")
    raw = json.loads(RAW.read_text(encoding="utf-8"))
    print(f"[transform] {len(raw)} raw events")

    # Source breakdown
    sources: dict[str, int] = {}
    for ev in raw:
        s = ev.get("source", "unknown")
        sources[s] = sources.get(s, 0) + 1
    print(f"[transform] Sources: {sources}")

    transformed = transform(raw)

    # Summary
    standing     = sum(1 for e in transformed if e["_is_standing_tour"])
    tagged       = sum(1 for e in transformed if e["tags"])
    with_age     = sum(1 for e in transformed if e["age_min"] is not None)
    with_price   = sum(1 for e in transformed if e["price"])
    booked_out   = sum(1 for e in transformed if e["is_booked_out"])
    tag_counts: dict[str, int] = {}
    for e in transformed:
        for t in e["tags"]:
            tag_counts[t] = tag_counts.get(t, 0) + 1

    print(f"[transform] {len(transformed)} transformed")
    print(f"  standing tours : {standing}")
    print(f"  booked out     : {booked_out}")
    print(f"  with tags      : {tagged}/{len(transformed)}")
    print(f"  with age data  : {with_age}/{len(transformed)}")
    print(f"  with price     : {with_price}/{len(transformed)}")
    print(f"  tag breakdown  : {dict(sorted(tag_counts.items(), key=lambda x: -x[1]))}")

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(transformed, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"[transform] Written → {OUT}")


if __name__ == "__main__":
    main()
