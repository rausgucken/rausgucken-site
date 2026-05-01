import sys, os, requests
from dotenv import load_dotenv
load_dotenv()
TOKEN   = os.getenv("TELEGRAM_BOT_TOKEN")
CHAT_ID = os.getenv("TELEGRAM_CHAT_ID")
def send(msg):
    if not TOKEN or not CHAT_ID:
        print("No token/chat_id in .env"); return
    r = requests.post(f"https://api.telegram.org/bot{TOKEN}/sendMessage",
        json={"chat_id": CHAT_ID, "text": msg, "parse_mode": "HTML"}, timeout=10)
    print(f"HTTP {r.status_code}: {r.text}")
if __name__ == "__main__":
    send(" ".join(sys.argv[1:]) or "✅ rausgucken test OK")
