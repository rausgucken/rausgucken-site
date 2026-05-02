# pipeline/prompts/README.md
# Prompt versioning for rausgucken.de
#
# Prompts live here as separate files so their history is tracked
# independently from Python logic in extract.py.
#
# Git history for these files is your prompt changelog.
# See: docs/prompt-changelog.md for human-readable change notes.
#
# extract.py loads these at startup:
#   EXTRACT_SYSTEM = open("pipeline/prompts/extract_system.txt").read()
#   REWRITE_SYSTEM = open("pipeline/prompts/rewrite_system.txt").read()
#
# After any prompt change:
#   1. Run: python -m pytest tests/test_extract_regression.py -v
#   2. Record result in docs/prompt-changelog.md
#   3. Commit both the prompt file and the changelog entry together
