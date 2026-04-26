"""
pipeline/validate.py
────────────────────
Stage 2 — validates the transformed event list against config/schema.json.
Hard aborts (sys.exit 1) on any violation — no partial data reaches the site.

Takes  : output/ludwigsburg/04_schloss_transformed.json
Writes : nothing — validation only, prints report and exits 0 or 1
"""

import json
import sys
from pathlib import Path

ROOT      = Path(__file__).parent.parent
DATA      = ROOT / "output/ludwigsburg/04_schloss_transformed.json"
SCHEMA    = ROOT / "config/schema.json"
TAGS_FILE = ROOT / "config/tags.json"

try:
    import jsonschema
except ImportError:
    print("[validate] jsonschema not installed — pip install jsonschema")
    sys.exit(1)


def main():
    print(f"[validate] Loading {DATA}")
    events = json.loads(DATA.read_text(encoding="utf-8"))
    schema = json.loads(SCHEMA.read_text(encoding="utf-8"))
    valid_tags = set(json.loads(TAGS_FILE.read_text(encoding="utf-8")).keys())

    errors = []

    # 1. JSON-schema structural validation
    try:
        jsonschema.validate(instance=events, schema=schema)
    except jsonschema.ValidationError as e:
        errors.append(f"Schema error: {e.message} (path: {list(e.absolute_path)})")

    # 2. Business rules
    ids = [e["id"] for e in events]
    if len(ids) != len(set(ids)):
        dupes = [i for i in ids if ids.count(i) > 1]
        errors.append(f"Duplicate IDs: {list(set(dupes))}")

    for i, ev in enumerate(events):
        prefix = f"Event[{i}] '{ev.get('title','?')[:40]}'"

        # required audit trail fields
        if not ev.get("original_url"):
            errors.append(f"{prefix}: missing original_url")
        if not ev.get("scraped_at"):
            errors.append(f"{prefix}: missing scraped_at")
        if not ev.get("slug"):
            errors.append(f"{prefix}: missing slug")

        # tag vocabulary check
        for tag in ev.get("tags", []):
            if tag not in valid_tags:
                errors.append(f"{prefix}: unknown tag '{tag}'")

        # date format
        for field in ("date_start", "date_end"):
            val = ev.get(field)
            if val is not None:
                import re
                if not re.match(r"^\d{4}-\d{2}-\d{2}$", str(val)):
                    errors.append(f"{prefix}: {field} not YYYY-MM-DD: '{val}'")

        # age consistency
        age_min = ev.get("age_min")
        age_max = ev.get("age_max")
        if age_min is not None and age_max is not None and age_min > age_max:
            errors.append(f"{prefix}: age_min {age_min} > age_max {age_max}")

    if errors:
        print(f"\n[validate] FAILED — {len(errors)} error(s):")
        for e in errors:
            print(f"  ✗ {e}")
        sys.exit(1)

    print(f"[validate] PASSED — {len(events)} events, all checks OK")


if __name__ == "__main__":
    main()
