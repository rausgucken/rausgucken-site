"""
pipeline/scrape.py
──────────────────
Stage 0 of the rausgucken pipeline.

Discovers every scraper matching the pattern NN_<name>.py in the same
directory, imports each one, calls scrape(), and merges all results into:

  output/ludwigsburg/raw_combined.json

Adding a new source = drop a new NN_<name>.py file. No pipeline changes.

Each scraper must expose:
  def scrape() -> list[dict]

Exit codes:
  0 — success (≥1 event collected)
  1 — all scrapers failed or returned zero events
"""

import importlib.util
import json
import re
import sys
import traceback
from pathlib import Path

ROOT    = Path(__file__).parent
OUT_DIR = ROOT / "output" / "ludwigsburg"
OUT     = OUT_DIR / "raw_combined.json"

# Pattern: one or more digits, underscore, name, .py
SCRAPER_RE = re.compile(r"^\d+_.+\.py$")

# Scrapers to skip (the pipeline stages themselves)
SKIP = {
    "scrape.py", "transform.py", "validate.py",
    "diff.py", "manifest.py", "filter_subsets.py",
    "run.py", "diff.py", "_base.py",
}


def discover_scrapers() -> list[Path]:
    scrapers = sorted(
        p for p in ROOT.glob("*.py")
        if SCRAPER_RE.match(p.name) and p.name not in SKIP
    )
    return scrapers


def load_and_run(path: Path) -> list[dict]:
    """Dynamically import a scraper module and call its scrape() function."""
    spec   = importlib.util.spec_from_file_location(path.stem, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)

    if not hasattr(module, "scrape"):
        raise AttributeError(f"{path.name} has no scrape() function")

    return module.scrape()


def main():
    scrapers = discover_scrapers()
    if not scrapers:
        print("[scrape] No scrapers found matching NN_<name>.py")
        sys.exit(1)

    print(f"[scrape] Found {len(scrapers)} scraper(s):")
    for s in scrapers:
        print(f"  {s.name}")

    combined: list[dict] = []
    results: dict[str, dict] = {}

    for scraper_path in scrapers:
        name = scraper_path.stem
        print(f"\n── Running: {scraper_path.name} ──")
        try:
            events = load_and_run(scraper_path)
            combined.extend(events)
            results[name] = {"status": "ok", "count": len(events)}
            print(f"[scrape] {name}: {len(events)} events")
        except Exception as exc:
            results[name] = {"status": "error", "error": str(exc)}
            print(f"[scrape] {name}: FAILED — {exc}")
            traceback.print_exc()

    # Summarise
    print(f"\n── Scrape summary ──")
    ok_count = 0
    for name, r in results.items():
        status = "✓" if r["status"] == "ok" else "✗"
        detail = f"{r['count']} events" if r["status"] == "ok" else r["error"]
        print(f"  {status} {name}: {detail}")
        if r["status"] == "ok":
            ok_count += 1

    failed = [n for n, r in results.items() if r["status"] == "error"]
    if failed:
        print(f"\n[scrape] WARNING — {len(failed)} scraper(s) failed: {failed}")
        print("[scrape] Continuing with events from successful scrapers.")

    if not combined:
        print("[scrape] ABORT — no events collected from any scraper.")
        sys.exit(1)

    print(f"\n[scrape] Total: {len(combined)} events from {ok_count} source(s)")

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(combined, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"[scrape] Written → {OUT}")


if __name__ == "__main__":
    main()
