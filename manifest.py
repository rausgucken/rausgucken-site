"""
pipeline/manifest.py
────────────────────
Stage 4 — produces the files the Astro site consumes.

Takes  : output/ludwigsburg/diffed.json
Writes : output/ludwigsburg/events-current.json   ← all non-expired events
         output/ludwigsburg/flagged.json           ← confidence < threshold
         output/ludwigsburg/meta.json              ← scrape metadata + disclaimer
"""

import hashlib
import json
from datetime import datetime, date, timezone
from pathlib import Path

ROOT    = Path(__file__).parent
DIFFED  = ROOT / "output" / "ludwigsburg" / "diffed.json"
OUT_DIR = ROOT / "output" / "ludwigsburg"
CURRENT = OUT_DIR / "events-current.json"
FLAGGED = OUT_DIR / "flagged.json"
META    = OUT_DIR / "meta.json"

CONFIDENCE_THRESHOLD = 0.6

DISCLAIMER_DE = (
    "Die auf rausgucken.de angezeigten Veranstaltungsinformationen werden "
    "automatisch von öffentlich zugänglichen Webseiten gesammelt. "
    "Trotz größtmöglicher Sorgfalt übernehmen wir keine Gewähr für die "
    "Richtigkeit, Vollständigkeit oder Aktualität der Daten. "
    "Bitte überprüfen Sie alle Angaben auf der jeweiligen Originalseite "
    "(siehe original_url jedes Eintrags) bevor Sie teilnehmen."
)


def main():
    if not DIFFED.exists():
        print(f"[manifest] ERROR — {DIFFED} not found. Run diff.py first.")
        import sys; sys.exit(1)

    print(f"[manifest] Loading {DIFFED}")
    events: list[dict] = json.loads(DIFFED.read_text(encoding="utf-8"))

    today_str = date.today().isoformat()

    current = []
    flagged = []
    expired = []

    for ev in events:
        ds = ev.get("date_start")
        de = ev.get("date_end")
        # Standing tours (date_start=null) are always current
        if ds is not None and (de or ds) < today_str:
            expired.append(ev)
            continue

        conf = ev.get("extraction_confidence") or 1.0
        if conf < CONFIDENCE_THRESHOLD:
            flagged.append(ev)
        else:
            current.append(ev)

    # Strip internal pipeline fields (prefixed with _) before writing site files
    def strip_internal(ev: dict) -> dict:
        return {k: v for k, v in ev.items() if not k.startswith("_")}

    current_clean = [strip_internal(e) for e in current]
    flagged_clean = [strip_internal(e) for e in flagged]

    # Sort: dated events ascending, standing tours at the end
    def sort_key(e):
        ds = e.get("date_start")
        return (0, ds, e.get("time") or "") if ds else (1, "", "")

    current_clean.sort(key=sort_key)

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    CURRENT.write_text(json.dumps(current_clean, ensure_ascii=False, indent=2), encoding="utf-8")
    FLAGGED.write_text(json.dumps(flagged_clean, ensure_ascii=False, indent=2), encoding="utf-8")

    # Source breakdown for meta
    sources_present = sorted({e.get("source", "unknown") for e in current_clean})
    source_counts: dict[str, int] = {}
    for ev in current_clean:
        s = ev.get("source", "unknown")
        source_counts[s] = source_counts.get(s, 0) + 1

    data_hash = hashlib.sha256(
        json.dumps(current_clean, sort_keys=True).encode()
    ).hexdigest()[:16]

    now_iso = datetime.now(timezone.utc).astimezone().isoformat()

    meta = {
        "scraped_at":       now_iso,
        "city":             "ludwigsburg",
        "event_count":      len(current_clean),
        "flagged_count":    len(flagged_clean),
        "expired_count":    len(expired),
        "sources_scraped":  sources_present,
        "source_counts":    source_counts,
        "sources_failed":   [],          # scrape.py populates this in future
        "data_hash":        data_hash,
        "disclaimer":       DISCLAIMER_DE,
        "disclaimer_note":  (
            f"Alle Angaben ohne Gewähr. "
            f"Stand: {datetime.now().strftime('%d.%m.%Y')}. "
            "Bitte Originalseite prüfen."
        ),
        "pipeline_version": "multi-source-v1",
    }
    META.write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8")

    print(f"[manifest] {len(current_clean)} current events  "
          f"({len(flagged_clean)} flagged, {len(expired)} expired)")
    print(f"[manifest] Sources: {source_counts}")
    print(f"[manifest] data_hash = {data_hash}")
    print(f"[manifest] Written → {CURRENT}")
    print(f"[manifest] Written → {FLAGGED}")
    print(f"[manifest] Written → {META}")


if __name__ == "__main__":
    main()
