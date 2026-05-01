"""
pipeline/diff.py
────────────────
Stage 3 — compares current transformed events against the previous
events-current.json (if it exists) to:
  - Set is_new = True/False per event
  - Generate changelog.json (added / removed event summaries)

Takes  : output/ludwigsburg/transformed.json
         public/data/ludwigsburg/events-current.json  (previous run — may not exist)
Writes : output/ludwigsburg/diffed.json   (with is_new corrected)
         output/ludwigsburg/changelog.json
"""

import json
from datetime import datetime, timezone
from pathlib import Path

ROOT      = Path(__file__).parent
INCOMING  = ROOT / "output" / "ludwigsburg" / "transformed.json"
PREVIOUS  = ROOT / "public" / "data" / "ludwigsburg" / "events-current.json"
DIFFED    = ROOT / "output" / "ludwigsburg" / "diffed.json"
CHANGELOG = ROOT / "output" / "ludwigsburg" / "changelog.json"


def main():
    if not INCOMING.exists():
        print(f"[diff] ERROR — {INCOMING} not found. Run transform.py first.")
        import sys; sys.exit(1)

    print(f"[diff] Loading incoming: {INCOMING}")
    incoming: list[dict] = json.loads(INCOMING.read_text(encoding="utf-8"))

    # Build set of IDs from the previous run
    prev_ids: set[str] = set()
    prev_data: list[dict] = []
    prev_run_at = None

    if PREVIOUS.exists():
        prev_data = json.loads(PREVIOUS.read_text(encoding="utf-8"))
        prev_ids  = {e["id"] for e in prev_data}
        meta_path = ROOT / "output" / "ludwigsburg" / "meta.json"
        if meta_path.exists():
            meta = json.loads(meta_path.read_text(encoding="utf-8"))
            prev_run_at = meta.get("scraped_at")
        print(f"[diff] Previous run: {len(prev_ids)} events")
    else:
        print("[diff] No previous events-current.json — all events marked is_new=True")

    incoming_ids = {e["id"] for e in incoming}

    added   = []
    removed = []

    for ev in incoming:
        ev["is_new"] = ev["id"] not in prev_ids
        if ev["is_new"]:
            added.append({
                "id":         ev["id"],
                "title":      ev["title"],
                "date_start": ev.get("date_start"),
                "source":     ev.get("source"),
            })

    # Removed = in previous but not in incoming
    for ev in prev_data:
        if ev["id"] not in incoming_ids:
            removed.append({
                "id":         ev["id"],
                "title":      ev["title"],
                "date_start": ev.get("date_start"),
                "source":     ev.get("source"),
            })

    DIFFED.parent.mkdir(parents=True, exist_ok=True)
    DIFFED.write_text(json.dumps(incoming, ensure_ascii=False, indent=2), encoding="utf-8")

    # Source breakdown in changelog
    sources_in_run = list({e.get("source", "unknown") for e in incoming})

    changelog = {
        "generated_at":  datetime.now(timezone.utc).astimezone().isoformat(),
        "city":          "ludwigsburg",
        "sources":       sources_in_run,
        "previous_run":  prev_run_at,
        "count_added":   len(added),
        "count_removed": len(removed),
        "added":         added,
        "removed":       removed,
    }
    CHANGELOG.write_text(json.dumps(changelog, ensure_ascii=False, indent=2), encoding="utf-8")

    new_count = sum(1 for e in incoming if e["is_new"])
    print(f"[diff] {new_count} new / {len(removed)} removed")
    print(f"[diff] Written → {DIFFED}")
    print(f"[diff] Written → {CHANGELOG}")


if __name__ == "__main__":
    main()
