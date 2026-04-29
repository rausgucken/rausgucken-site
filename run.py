"""
pipeline/run.py
───────────────
Schloss PoC pipeline runner — executes all stages in order.
Run from the project root: python pipeline/run.py

Stages:
  1. transform.py  — enrich raw → transformed
  2. validate.py   — schema + business rules check
  3. diff.py       — is_new flags + changelog
  4. manifest.py   — events-current.json, flagged.json, meta.json

On any stage failure the pipeline halts immediately.
"""

import subprocess
import sys
from pathlib import Path

PIPELINE = Path(__file__).parent

STAGES = [
    ("transform", PIPELINE / "transform.py"),
    ("validate",  PIPELINE / "validate.py"),
    ("diff",      PIPELINE / "diff.py"),
    ("manifest",      PIPELINE / "manifest.py"),
    ("filter_subsets", PIPELINE / "filter_subsets.py"),
]


def main():
    print("=" * 60)
    print("  rausgucken — Schloss PoC pipeline")
    print("=" * 60)

    for name, script in STAGES:
        print(f"\n── Stage: {name} ──")
        result = subprocess.run(
            [sys.executable, str(script)],
            cwd=PIPELINE.parent,
        )
        if result.returncode != 0:
            print(f"\n[run] ABORT — stage '{name}' failed (exit {result.returncode})")
            sys.exit(result.returncode)

    print("\n" + "=" * 60)
    print("  Pipeline complete ✓")
    print("  Site files ready in output/ludwigsburg/")
    print("  → events-current.json")
    print("  → flagged.json")
    print("  → changelog.json")
    print("  → meta.json")
    print("=" * 60)


if __name__ == "__main__":
    main()
