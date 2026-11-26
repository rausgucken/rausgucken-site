#!/usr/bin/env python3
"""
Render functions/{city}/events/[[slug]].js from functions/_ICS_TEMPLATE/events/[[slug]].js.
  python3 scripts/render_ics_functions.py           # write all existing city functions
  python3 scripts/render_ics_functions.py --check   # exit 1 if any city function differs from the template (drift check)
Tokens: CITY_ID (folder name), CITY_NAME_FULL (public/data/cities.json "name"). Never hand-edit a generated function: change the template, re-run.
"""
import json, pathlib, sys
ROOT = pathlib.Path(__file__).resolve().parent.parent
TPL = (ROOT / "functions/_ICS_TEMPLATE/events/[[slug]].js").read_text()
NAMES = {c["id"]: c["name"] for c in json.loads((ROOT / "public/data/cities.json").read_text())}
body = TPL[TPL.index("*/") + 2:]            # drop the template's own header comment
def render(city):
    name = NAMES.get(city)
    if not name: raise SystemExit(f"no cities.json entry for functions/{city}")
    head = (f"/**\n * Cloudflare Pages Function — {name} (GENERATED from functions/_ICS_TEMPLATE; do not hand-edit)\n"
            f" * Change the template and run: python3 scripts/render_ics_functions.py\n"
            f" * Route: /{city}/events/*.ics — only .ics requests; everything else falls through to the static page.\n */")
    return (head + body).replace("CITY_NAME_FULL", name).replace("CITY_ID", city)
bad = []
for d in sorted((ROOT / "functions").iterdir()):
    f = d / "events/[[slug]].js"
    if d.name.startswith("_") or not f.exists(): continue
    new = render(d.name)
    if f.read_text() != new:
        bad.append(d.name)
        if "--check" not in sys.argv: f.write_text(new)
print(("DRIFT: " if "--check" in sys.argv else "rewritten: ") + (", ".join(bad) if bad else "none"))
sys.exit(1 if bad and "--check" in sys.argv else 0)
