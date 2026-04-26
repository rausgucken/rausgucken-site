#!/usr/bin/env bash
# /opt/rausgucken/deploy.sh
# Full pipeline: scrape → transform → validate → diff → manifest → push → health check
# Run manually or via cron (Saturday 02:00).
# Requires: .env with all secrets sourced before pipeline stages.

set -uo pipefail

SCRAPER="/opt/rausgucken"
SITE="/opt/rausgucken-site"
LOG_DIR="/var/log/rausgucken"
LOG="$LOG_DIR/deploy-$(date +%Y-%m-%d).log"
CITY="ludwigsburg"

mkdir -p "$LOG_DIR"
exec >> "$LOG" 2>&1

echo "===== $(date -Iseconds) START ====="

cd "$SCRAPER"
source .venv/bin/activate

# Load secrets — AI_BACKEND, ANTHROPIC_API_KEY, TELEGRAM_BOT_TOKEN, etc.
set -a; source .env; set +a

# ── 1. Scrape ──────────────────────────────────────────────────────────────────
echo "[deploy] Stage: scrape"
python scrapers/ludwigsburg/04_schloss.py || {
    python -c "
import os, requests
token, chat = os.environ.get('TELEGRAM_BOT_TOKEN'), os.environ.get('TELEGRAM_CHAT_ID')
if token and chat:
    requests.post(f'https://api.telegram.org/bot{token}/sendMessage',
        json={'chat_id': chat, 'text': '🔴 DEPLOY ABORTED [ludwigsburg]\n  Reason: Schloss scraper failed', 'parse_mode': 'HTML'}, timeout=10)
"
    echo "[deploy] ABORT: scraper failed"
    exit 1
}

# ── 2. Pipeline ────────────────────────────────────────────────────────────────
echo "[deploy] Stage: pipeline"

python pipeline/transform.py --city "$CITY" 2>/dev/null || python pipeline/transform.py
python pipeline/validate.py  --city "$CITY" 2>/dev/null || python pipeline/validate.py || {
    python -c "
import os, requests
token, chat = os.environ.get('TELEGRAM_BOT_TOKEN'), os.environ.get('TELEGRAM_CHAT_ID')
if token and chat:
    requests.post(f'https://api.telegram.org/bot{token}/sendMessage',
        json={'chat_id': chat, 'text': '🔴 DEPLOY ABORTED [ludwigsburg]\n  Reason: Schema validation failed', 'parse_mode': 'HTML'}, timeout=10)
"
    echo "[deploy] ABORT: validation failed"
    exit 1
}

python pipeline/diff.py     --city "$CITY" 2>/dev/null || python pipeline/diff.py
python pipeline/manifest.py --city "$CITY" 2>/dev/null || python pipeline/manifest.py

# ── 3. Low-confidence alert ────────────────────────────────────────────────────
FLAGGED=$(python3 -c "
import json, sys
try:
    data = json.load(open('output/$CITY/flagged.json'))
    print(len(data))
except:
    print(0)
")

if [ "$FLAGGED" -gt 0 ]; then
    python3 -c "
import os, requests
token, chat = os.environ.get('TELEGRAM_BOT_TOKEN'), os.environ.get('TELEGRAM_CHAT_ID')
if token and chat:
    requests.post(f'https://api.telegram.org/bot{token}/sendMessage',
        json={'chat_id': chat, 'text': f'⚠️ [ludwigsburg] ${FLAGGED} events below confidence threshold\n  Review: output/ludwigsburg/flagged.json', 'parse_mode': 'HTML'}, timeout=10)
"
fi

# ── 4. Hash check — skip push if data unchanged ────────────────────────────────
NEW_HASH=$(python3 -c "import json; print(json.load(open('output/$CITY/meta.json'))['data_hash'])")
LIVE_HASH=$(curl -sf "https://rausgucken.de/data/$CITY/meta.json" \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['data_hash'])" 2>/dev/null) \
  || { echo "[deploy] Hash check failed — pushing anyway"; LIVE_HASH=""; }

if [ "${LIVE_HASH}" = "$NEW_HASH" ] && [ -n "$LIVE_HASH" ]; then
    echo "[deploy] Data unchanged (hash $NEW_HASH) — skipping push"
    # Still notify: confirms cron ran OK
    python3 -c "
import os, requests
token, chat = os.environ.get('TELEGRAM_BOT_TOKEN'), os.environ.get('TELEGRAM_CHAT_ID')
if token and chat:
    requests.post(f'https://api.telegram.org/bot{token}/sendMessage',
        json={'chat_id': chat, 'text': '✅ rausgucken.de [ludwigsburg] — data unchanged, no push needed', 'parse_mode': 'HTML'}, timeout=10)
"
    echo "===== $(date -Iseconds) END ====="
    exit 0
fi

# ── 5. Push to site repo ───────────────────────────────────────────────────────
echo "[deploy] Stage: push"

EVENT_COUNT=$(python3 -c "import json; print(len(json.load(open('output/$CITY/events-current.json'))))")
NEW_COUNT=$(python3 -c "import json; print(json.load(open('output/$CITY/changelog.json'))['count_added'])")

cp "output/$CITY/events-current.json" "$SITE/public/data/$CITY/"
cp "output/$CITY/meta.json"           "$SITE/public/data/$CITY/"
cp "output/$CITY/changelog.json"      "$SITE/public/data/$CITY/"

cd "$SITE"
git add -A
git commit -m "data: $CITY $(date +%Y-%m-%d) — $EVENT_COUNT events, $NEW_COUNT new"
git push origin main

echo "[deploy] PUSH_SUCCESS"

# ── 6. Health check (wait for Cloudflare build) ────────────────────────────────
echo "[deploy] Waiting 120s for Cloudflare build..."
sleep 120

LIVE_AFTER=$(curl -sf "https://rausgucken.de/data/$CITY/meta.json" \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['data_hash'])" 2>/dev/null) || LIVE_AFTER=""

if [ "$LIVE_AFTER" = "$NEW_HASH" ]; then
    STATUS="✅ rausgucken.de [ludwigsburg] updated\n  $EVENT_COUNT events · $NEW_COUNT new · Health check PASSED"
else
    STATUS="🔴 HEALTH CHECK FAILED [ludwigsburg]\n  Live hash does not match pushed hash. Check Cloudflare build log."
fi

python3 -c "
import os, requests
token, chat = os.environ.get('TELEGRAM_BOT_TOKEN'), os.environ.get('TELEGRAM_CHAT_ID')
msg = '''$STATUS'''
if token and chat:
    requests.post(f'https://api.telegram.org/bot{token}/sendMessage',
        json={'chat_id': chat, 'text': msg, 'parse_mode': 'HTML'}, timeout=10)
print(msg)
"

echo "===== $(date -Iseconds) END ====="
