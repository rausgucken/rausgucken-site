"""
pipeline/validate.py
────────────────────
Stage 2 — validates the transformed event list.
Hard aborts (sys.exit 1) on any violation — no partial data reaches the site.

Takes  : output/ludwigsburg/transformed.json
Writes : nothing — validation only, prints report and exits 0 or 1
"""

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).parent
DATA = ROOT / "output" / "ludwigsburg" / "transformed.json"

VALID_TAGS = {
    "Ausstellung", "Entertainment", "Familie", "Fest", "Fuehrung",
    "Jugend", "Kinder", "Kulinarik", "Lesung", "Messe", "Musik",
    "Outdoor", "Sport", "Sprache", "Tanz", "Theater", "Vortrag", "Workshop",
}

DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")


def main():
    if not DATA.exists():
        print(f"[validate] ERROR — {DATA} not found. Run transform.py first.")
        sys.exit(1)

    print(f"[validate] Loading {DATA}")
    events = json.loads(DATA.read_text(encoding="utf-8"))
    errors = []

    # 1. Duplicate IDs
    ids = [e["id"] for e in events]
    if len(ids) != len(set(ids)):
        dupes = [i for i in ids if ids.count(i) > 1]
        errors.append(f"Duplicate IDs: {list(set(dupes))}")

    for i, ev in enumerate(events):
        prefix = f"Event[{i}] '{ev.get('title', '?')[:40]}'"

        # Required audit trail fields
        if not ev.get("original_url"):
            errors.append(f"{prefix}: missing original_url")
        if not ev.get("scraped_at"):
            errors.append(f"{prefix}: missing scraped_at")
        if not ev.get("slug"):
            errors.append(f"{prefix}: missing slug")
        if not ev.get("source"):
            errors.append(f"{prefix}: missing source")

        # Tag vocabulary check
        for tag in ev.get("tags", []):
            if tag not in VALID_TAGS:
                errors.append(f"{prefix}: unknown tag '{tag}'")

        # Date format
        for field in ("date_start", "date_end"):
            val = ev.get(field)
            if val is not None and not DATE_RE.match(str(val)):
                errors.append(f"{prefix}: {field} not YYYY-MM-DD: '{val}'")

        # Age consistency
        age_min = ev.get("age_min")
        age_max = ev.get("age_max")
        if age_min is not None and age_max is not None and age_min > age_max:
            errors.append(f"{prefix}: age_min {age_min} > age_max {age_max}")

        # Confidence range
        conf = ev.get("extraction_confidence")
        if conf is not None and not (0.0 <= conf <= 1.0):
            errors.append(f"{prefix}: extraction_confidence out of range: {conf}")

    # Source breakdown
    sources: dict[str, int] = {}
    for ev in events:
        s = ev.get("source", "unknown")
        sources[s] = sources.get(s, 0) + 1
    print(f"[validate] Sources present: {sources}")

    if errors:
        print(f"\n[validate] FAILED — {len(errors)} error(s):")
        for e in errors:
            print(f"  ✗ {e}")
        sys.exit(1)

    print(f"[validate] PASSED — {len(events)} events, all checks OK")


if __name__ == "__main__":
    main()
