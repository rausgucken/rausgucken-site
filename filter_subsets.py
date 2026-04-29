"""
pipeline/filter_subsets.py
──────────────────────────
Stage 5 of the pipeline (runs after manifest.py).

Reads  : output/ludwigsburg/events-current.json
Writes :
  public/data/ludwigsburg/kinder.json          — Kinder + Familie tagged events
  public/data/ludwigsburg/today.json           — events whose date_start == today
  public/data/ludwigsburg/tomorrow.json        — events whose date_start == tomorrow
  public/data/ludwigsburg/this-weekend.json    — events spanning Sat/Sun this week
  public/data/ludwigsburg/next-week.json       — events in the next 7 days

Run manually:
  python filter_subsets.py

Or add to run.py STAGES after manifest:
  ("filter_subsets", PIPELINE / "filter_subsets.py"),

Also call from the daily data-swap cron (no Cloudflare build needed):
  python filter_subsets.py && git -C /opt/rausgucken-site add -A && ...
"""

import json
from datetime import date, timedelta
from pathlib import Path

ROOT    = Path(__file__).parent.parent
EVENTS  = ROOT / "output/ludwigsburg/events-current.json"
OUT_DIR = ROOT / "public/data/ludwigsburg"

FAMILY_TAGS = {"Kinder", "Familie"}


def load_events() -> list[dict]:
    return json.loads(EVENTS.read_text(encoding="utf-8"))


def write(name: str, events: list[dict]) -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    path = OUT_DIR / name
    path.write_text(
        json.dumps(events, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    print(f"[filter_subsets] {name}: {len(events)} events")


def filter_kinder(events: list[dict]) -> list[dict]:
    return [
        e for e in events
        if set(e.get("tags", [])) & FAMILY_TAGS
    ]


def filter_date(events: list[dict], target_date: str) -> list[dict]:
    """Events that start on or span through target_date."""
    return [
        e for e in events
        if e.get("date_start") == target_date
        or (
            e.get("date_start")
            and e.get("date_end")
            and e["date_start"] <= target_date <= e["date_end"]
        )
    ]


def filter_weekend(events: list[dict], today: date) -> list[dict]:
    """Events occurring on the coming Saturday or Sunday."""
    # Find next Saturday (weekday 5)
    days_to_sat = (5 - today.weekday()) % 7
    if days_to_sat == 0 and today.weekday() == 5:
        days_to_sat = 0
    sat = today + timedelta(days=days_to_sat)
    sun = sat + timedelta(days=1)

    result = []
    seen = set()
    for target in (sat, sun):
        target_str = target.isoformat()
        for e in events:
            eid = e.get("id", e.get("slug", ""))
            if eid in seen:
                continue
            if e.get("date_start") == target_str or (
                e.get("date_start")
                and e.get("date_end")
                and e["date_start"] <= target_str <= e["date_end"]
            ):
                result.append(e)
                seen.add(eid)
    return result


def filter_next_week(events: list[dict], today: date) -> list[dict]:
    """Events with date_start within the next 7 days (inclusive of today)."""
    end = today + timedelta(days=6)
    today_str = today.isoformat()
    end_str   = end.isoformat()
    return [
        e for e in events
        if e.get("date_start") and today_str <= e["date_start"] <= end_str
    ]


def main():
    print(f"[filter_subsets] Reading {EVENTS}")
    events = load_events()
    print(f"[filter_subsets] {len(events)} total events")

    today    = date.today()
    tomorrow = today + timedelta(days=1)

    write("kinder.json",        filter_kinder(events))
    write("today.json",         filter_date(events, today.isoformat()))
    write("tomorrow.json",      filter_date(events, tomorrow.isoformat()))
    write("this-weekend.json",  filter_weekend(events, today))
    write("next-week.json",     filter_next_week(events, today))

    print("[filter_subsets] Done.")


if __name__ == "__main__":
    main()
