#!/usr/bin/env bash
# /opt/rausgucken-site/deploy.sh
set -uo pipefail

SITE="/opt/rausgucken-site"
LOG_DIR="/var/log/rausgucken"
LOG="$LOG_DIR/deploy-$(date +%Y-%m-%d).log"
CITY="ludwigsburg"

mkdir -p "$LOG_DIR"
exec >> "$LOG" 2>&1

echo "===== $(date -Iseconds) START ====="

cd "$SITE"
source .venv/bin/activate
set -a; source .env; set +a

tg_send() {
    local msg="$1"
    python3 -c "
import os, requests
token = os.environ.get('TELEGRAM_BOT_TOKEN')
chat  = os.environ.get('TELEGRAM_CHAT_ID')
if token and chat:
    requests.post(f'https://api.telegram.org/bot{token}/sendMessage',
        json={'chat_id': chat, 'text': '$msg', 'parse_mode': 'HTML'}, timeout=10)
" 2>/dev/null || true
}

echo "[deploy] Stage: scrape"
python scrape.py || { tg_send "🔴 DEPLOY ABORTED [ludwigsburg] — scrape failed"; exit 1; }

echo "[deploy] Stage: transform"
python transform.py || { tg_send "🔴 DEPLOY ABORTED [ludwigsburg] — transform failed"; exit 1; }

echo "[deploy] Stage: validate"
python validate.py || { tg_send "🔴 DEPLOY ABORTED [ludwigsburg] — validation failed"; exit 1; }

echo "[deploy] Stage: diff"
python diff.py || { tg_send "🔴 DEPLOY ABORTED [ludwigsburg] — diff failed"; exit 1; }

echo "[deploy] Stage: manifest"
python manifest.py || { tg_send "🔴 DEPLOY ABORTED [ludwigsburg] — manifest failed"; exit 1; }

FLAGGED=$(python3 -c "import json; print(len(json.load(open('output/$CITY/flagged.json'))))" 2>/dev/null || echo 0)
[ "$FLAGGED" -gt 0 ] && tg_send "⚠️ [ludwigsburg] $FLAGGED events flagged low confidence"

NEW_HASH=$(python3 -c "import json; print(json.load(open('output/$CITY/meta.json'))['data_hash'])")
LIVE_HASH=$(curl -sf "https://www.rausgucken.de/data/$CITY/meta.json" \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['data_hash'])" 2>/dev/null) || LIVE_HASH=""

if [ "${LIVE_HASH}" = "$NEW_HASH" ] && [ -n "$LIVE_HASH" ]; then
    echo "[deploy] Data unchanged — skipping push"
    tg_send "✅ rausgucken.de [ludwigsburg] — data unchanged, no push needed"
    echo "===== $(date -Iseconds) END ====="; exit 0
fi

EVENT_COUNT=$(python3 -c "import json; print(len(json.load(open('output/$CITY/events-current.json'))))")
NEW_COUNT=$(python3 -c "import json; print(json.load(open('output/$CITY/changelog.json'))['count_added'])")

cp "output/$CITY/events-current.json" "$SITE/public/data/$CITY/"
cp "output/$CITY/meta.json"           "$SITE/public/data/$CITY/"
cp "output/$CITY/changelog.json"      "$SITE/public/data/$CITY/"
cp "output/$CITY/flagged.json"        "$SITE/public/data/$CITY/" 2>/dev/null || true

git add -A
git commit -m "data: $CITY $(date +%Y-%m-%d) — $EVENT_COUNT events, $NEW_COUNT new" || {
    echo "[deploy] Nothing to commit"; exit 0
}
git push origin main
echo "[deploy] PUSH_SUCCESS"

INDEXNOW_KEY="18bbf0b3986e4372beac4e82b7585a6a"
curl -s -o /dev/null -w "[deploy] IndexNow HTTP: %{http_code}\n" \
  -X POST "https://api.indexnow.org/indexnow" \
  -H "Content-Type: application/json; charset=utf-8" \
  -d "{\"host\":\"www.rausgucken.de\",\"key\":\"$INDEXNOW_KEY\",\"keyLocation\":\"https://www.rausgucken.de/$INDEXNOW_KEY.txt\",\"urlList\":[\"https://www.rausgucken.de/\",\"https://www.rausgucken.de/ludwigsburg/\",\"https://www.rausgucken.de/ludwigsburg/heute/\",\"https://www.rausgucken.de/ludwigsburg/kinder/\"]}"

echo "[deploy] Waiting 120s for Cloudflare build..."
sleep 120

LIVE_AFTER=$(curl -sf "https://www.rausgucken.de/data/$CITY/meta.json" \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['data_hash'])" 2>/dev/null) || LIVE_AFTER=""

if [ "$LIVE_AFTER" = "$NEW_HASH" ]; then
    tg_send "✅ rausgucken.de [ludwigsburg] updated — $EVENT_COUNT events, $NEW_COUNT new. Health check PASSED"
    echo "[deploy] Health check PASSED"
else
    tg_send "🔴 HEALTH CHECK FAILED [ludwigsburg] — check Cloudflare build log"
    echo "[deploy] Health check FAILED"
fi

echo "===== $(date -Iseconds) END ====="
