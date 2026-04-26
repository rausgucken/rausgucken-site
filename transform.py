"""
pipeline/transform.py
─────────────────────
Stage 1 of the Schloss pipeline.

Takes  : output/ludwigsburg/04_schloss_raw.json   (scraper output)
Writes : output/ludwigsburg/04_schloss_transformed.json

Responsibilities
  - Generate stable event ID (hash of source + original_url + date_start)
  - Generate URL slug
  - Map tags from title/description/age_hint keywords
  - Map _age_hint → age_min / age_max
  - Normalise price string
  - Promote accessibility field to tags where applicable
  - Remove internal-only fields (_age_hint)
  - Handle the 6 standing tours (date_start=null) — kept but flagged
"""

import hashlib
import json
import re
import sys
import unicodedata
from pathlib import Path

ROOT = Path(__file__).parent.parent
RAW  = ROOT / "output/ludwigsburg/04_schloss_raw.json"
OUT  = ROOT / "output/ludwigsburg/04_schloss_transformed.json"

VALID_TAGS = {
    "Ausstellung", "Entertainment", "Familie", "Fest", "Fuehrung",
    "Jugend", "Kinder", "Kulinarik", "Lesung", "Messe", "Musik",
    "Outdoor", "Sport", "Sprache", "Tanz", "Theater", "Vortrag", "Workshop",
}

# ── Tag inference rules ───────────────────────────────────────────────────────
# Each rule: (tag, [keyword patterns]) — matched case-insensitively against
# title + description combined.  First match wins per tag (all tags applied).

TAG_RULES = [
    ("Fuehrung",      [r"führung", r"tour", r"rundgang", r"rundfahrt"]),
    ("Kinder",        [r"\bkinder\b", r"\bkids\b", r"familienführung.*kinder",
                       r"ab\s*[3-9]\s*jahr"]),
    ("Familie",       [r"\bfamili", r"familien"]),
    ("Musik",         [r"\bkonzert\b", r"\bmusik\b", r"\borchester\b",
                       r"\bsinfon", r"\boper\b", r"\brecital\b"]),
    ("Theater",       [r"\btheater\b", r"\bschauspiel\b", r"\bstück\b"]),
    ("Tanz",          [r"\btanz\b", r"\bballett\b", r"\bperformanc"]),
    ("Lesung",        [r"\blesung\b", r"\bvorlese", r"\bliteratur"]),
    ("Vortrag",       [r"\bvortrag\b", r"\bgespräch\b", r"\bdiskussion\b"]),
    ("Workshop",      [r"\bworkshop\b", r"\bkurs\b", r"\bateliers\b"]),
    ("Kulinarik",     [r"\bdiner\b", r"\bessen\b", r"\bgemüse", r"\bkulinar",
                       r"\bbuffet\b", r"\bwein\b"]),
    ("Outdoor",       [r"\bgarten\b", r"\bpark\b", r"\bfreiluft\b",
                       r"\baußen\b", r"\boutdoor"]),
    ("Fest",          [r"\bfest\b", r"\bfeier\b", r"\bgala\b"]),
    ("Ausstellung",   [r"\bausstellung\b", r"\bexposition\b"]),
    ("Entertainment", [r"\bzauber\b", r"\bmagie\b", r"\bshow\b",
                       r"\bcomedy\b", r"\bkabar"]),
]

# ── Age mapping ───────────────────────────────────────────────────────────────
# Maps _age_hint values from the scraper + title keywords → (age_min, age_max)

AGE_MAP = [
    # explicit age ranges in title
    (r"ab\s*3\s*jahr",   3,  None),
    (r"ab\s*5\s*jahr",   5,  None),
    (r"ab\s*6\s*jahr",   6,  None),
    (r"ab\s*8\s*jahr",   8,  None),
    (r"ab\s*10\s*jahr",  10, None),
    (r"ab\s*12\s*jahr",  12, None),
    (r"ab\s*14\s*jahr",  14, None),
    # generic labels
    (r"\bkinder\b",      4,  12),
    (r"\bfamili",        4,  None),
]

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
    for tag, patterns in TAG_RULES:
        if any(re.search(p, haystack) for p in patterns):
            tags.append(tag)
    # Deduplicate preserving order
    seen = set()
    return [t for t in tags if not (t in seen or seen.add(t))]


def infer_age(title: str, age_hint: str | None) -> tuple[int | None, int | None]:
    haystack = f"{title} {age_hint or ''}".lower()
    for pattern, age_min, age_max in AGE_MAP:
        if re.search(pattern, haystack):
            return age_min, age_max
    return None, None


def normalise_price(raw: str | None) -> str | None:
    if not raw:
        return None
    # Trim trailing noise ("Information und …")
    p = re.sub(r"\s+Information und.*$", "", raw, flags=re.I).strip()
    # Collapse whitespace
    p = re.sub(r"\s+", " ", p)
    return p or None


# ── Transform ─────────────────────────────────────────────────────────────────

def transform(events: list[dict]) -> list[dict]:
    out = []
    for ev in events:
        title       = ev.get("title", "")
        description = ev.get("description") or ""
        age_hint    = ev.get("_age_hint")
        date_start  = ev.get("date_start")

        tags          = infer_tags(title, description)
        age_min, age_max = infer_age(title, age_hint)

        # Ensure Familie tag present when age data implies family
        if age_min is not None and age_min <= 6 and "Familie" not in tags:
            tags.append("Familie")

        # Standing tours (no fixed date) — keep but mark
        is_standing = date_start is None

        slug_input = f"{title} {date_start or 'standing'}"
        slug = slugify(slug_input)

        transformed = {
            "id":                    stable_id(ev["source"], ev["original_url"], date_start),
            "title":                 title,
            "date_start":            date_start,
            "date_end":              ev.get("date_end"),
            "time":                  ev.get("time") if ev.get("time") != "–" else None,
            "description":           description or None,
            "location":              ev.get("location"),
            "price":                 normalise_price(ev.get("price")),
            "age_min":               age_min,
            "age_max":               age_max,
            "tags":                  tags,
            "link":                  ev.get("link", ""),
            "original_url":          ev.get("original_url", ""),
            "source":                ev.get("source", "schloss"),
            "city":                  ev.get("city", "ludwigsburg"),
            "slug":                  slug,
            "scraped_at":            ev.get("scraped_at", ""),
            "extraction_confidence": ev.get("extraction_confidence", 1.0),
            "is_new":                True,       # diff.py will correct this
            "sponsored":             False,
            # Keep standing flag for downstream use
            "_is_standing_tour":     is_standing,
        }
        out.append(transformed)
    return out


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    print(f"[transform] Reading {RAW}")
    raw = json.loads(RAW.read_text(encoding="utf-8"))
    print(f"[transform] {len(raw)} raw events")

    transformed = transform(raw)

    # Summary
    standing  = sum(1 for e in transformed if e["_is_standing_tour"])
    tagged    = sum(1 for e in transformed if e["tags"])
    with_age  = sum(1 for e in transformed if e["age_min"] is not None)
    tag_counts: dict[str, int] = {}
    for e in transformed:
        for t in e["tags"]:
            tag_counts[t] = tag_counts.get(t, 0) + 1

    print(f"[transform] {len(transformed)} transformed")
    print(f"  standing tours : {standing}")
    print(f"  with tags      : {tagged}/{len(transformed)}")
    print(f"  with age data  : {with_age}/{len(transformed)}")
    print(f"  tag breakdown  : {dict(sorted(tag_counts.items(), key=lambda x: -x[1]))}")

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(transformed, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"[transform] Written → {OUT}")


if __name__ == "__main__":
    main()
