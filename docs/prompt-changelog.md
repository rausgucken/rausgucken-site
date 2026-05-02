# Prompt Changelog
**pipeline/prompts/ — human-readable change history**

Commit prompt files and a changelog entry together.
Record regression test results before and after every change.

---

## v1.0 — 2026-05-03 — Initial version

**Files:** `extract_system.txt`, `rewrite_system.txt`

**Changes:**
- Initial prompts extracted from hardcoded strings in `extract.py`
- Age extraction examples added for `X–Y-Jährige` pattern (Bindestrich-Kompositum)
- Chain-of-thought instruction added for age extraction: "analysiere zuerst die Formulierung"
- Three few-shot examples in `extract_system.txt` (complete, age compound, sparse)
- `{TODAY}` placeholder injection documented

**Regression baseline:**
- Tests: 18/20 pass
- Known failures: `age_min` on "ab X-Jährige" compound (distinct from "ab X Jahren")
- Avg runtime: 52 min (qwen2.5:7b, sequential)

---

## Template for future entries

```markdown
## vX.Y — YYYY-MM-DD — Short description

**Files changed:** extract_system.txt / rewrite_system.txt

**Trigger:** [What failure or metric triggered this change]
- e.g. flagged.json showed age_min null on all Stabi events

**Change:**
- [What was added/removed/modified]

**Regression result:**
- Before: XX/20 pass
- After:  XX/20 pass
- No regressions on: [field names]
- New test cases added: [yes/no — count]
```

---

*rausgucken.de · docs/prompt-changelog.md · v1.0 · May 2026*
