"""
pipeline/manifest.py
────────────────────
Stage 4 — produces the two files the Astro site actually consumes.

Takes  : output/ludwigsburg/04_schloss_diffed.json
Writes : output/ludwigsburg/events-current.json   ← all non-expired events
         output/ludwigsburg/flagged.json           ← confidence < threshold
         output/ludwigsburg/meta.json              ← scrape metadata + disclaimer
"""

import hashlib
import json
from datetime import datetime, date, timezone
from pathlib import Path

ROOT      = Path(__file__).parent.parent
DIFFED    = ROOT / "output/ludwigsburg/04_schloss_diffed.json"
CURRENT   = ROOT / "output/ludwigsburg/events-current.json"
FLAGGED   = ROOT / "output/ludwigsburg/flagged.json"
META      = ROOT / "output/ludwigsburg/meta.json"

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
    print(f"[manifest] Loading {DIFFED}")
    events: list[dict] = json.loads(DIFFED.read_text(encoding="utf-8"))

    today_str = date.today().isoformat()   # YYYY-MM-DD

    # Split: expired vs current, flagged vs confident
    current  = []
    flagged  = []
    expired  = []

    for ev in events:
        # Standing tours (date_start=null) are always current
        ds = ev.get("date_start")
        de = ev.get("date_end")
        if ds is not None and (de or ds) < today_str:
            expired.append(ev)
            continue

        conf = ev.get("extraction_confidence") or 1.0
        if conf < CONFIDENCE_THRESHOLD:
            flagged.append(ev)
        else:
            current.append(ev)

    # Remove internal pipeline fields before writing site files
    def strip_internal(ev: dict) -> dict:
        return {k: v for k, v in ev.items() if not k.startswith("_")}

    current_clean = [strip_internal(e) for e in current]
    flagged_clean = [strip_internal(e) for e in flagged]

    # Sort: dated events ascending, standing tours at the end
    def sort_key(e):
        ds = e.get("date_start")
        return (0, ds, e.get("time") or "") if ds else (1, "", "")

    current_clean.sort(key=sort_key)

    # Write events-current.json
    CURRENT.write_text(json.dumps(current_clean, ensure_ascii=False, indent=2), encoding="utf-8")

    # Write flagged.json
    FLAGGED.write_text(json.dumps(flagged_clean, ensure_ascii=False, indent=2), encoding="utf-8")

    # Compute data hash
    data_hash = hashlib.sha256(
        json.dumps(current_clean, sort_keys=True).encode()
    ).hexdigest()[:16]

    now_iso = datetime.now(timezone.utc).astimezone().isoformat()

    meta = {
        "scraped_at":      now_iso,
        "city":            "ludwigsburg",
        "source":          "schloss",
        "event_count":     len(current_clean),
        "flagged_count":   len(flagged_clean),
        "expired_count":   len(expired),
        "sources_scraped": ["04_schloss"],
        "sources_failed":  [],
        "data_hash":       data_hash,
        "disclaimer":      DISCLAIMER_DE,
        "disclaimer_note": (
            f"Alle Angaben ohne Gewähr. "
            f"Stand: {datetime.now().strftime('%d.%m.%Y')}. "
            "Bitte Originalseite prüfen."
        ),
        "pipeline_version": "schloss-poc-v1",
    }
    META.write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8")

    print(f"[manifest] {len(current_clean)} current events  "
          f"({len(flagged_clean)} flagged, {len(expired)} expired)")
    print(f"[manifest] data_hash = {data_hash}")
    print(f"[manifest] Written → {CURRENT}")
    print(f"[manifest] Written → {FLAGGED}")
    print(f"[manifest] Written → {META}")


if __name__ == "__main__":
    main()
