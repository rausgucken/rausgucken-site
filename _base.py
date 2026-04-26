# scrapers/ludwigsburg/_base.py
import time, re, requests
from bs4 import BeautifulSoup
from datetime import datetime, timezone

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept-Language": "de-DE,de;q=0.9,en;q=0.8",
}


def get(url, session=None, delay=0.4, **kwargs):
    time.sleep(delay)
    r = (session or requests).get(url, headers=HEADERS, timeout=15, **kwargs)
    r.raise_for_status()
    return BeautifulSoup(r.text, "html.parser")


def get_json(url, session=None, delay=0.4, **kwargs):
    time.sleep(delay)
    r = (session or requests).get(url, headers=HEADERS, timeout=15, **kwargs)
    r.raise_for_status()
    return r.json()


def clean_text(text):
    return re.sub(r"\s+", " ", str(text or "")).strip()


def strip_html(html_str):
    return BeautifulSoup(str(html_str or ""), "html.parser").get_text(" ", strip=True)


def now_iso():
    return datetime.now(timezone.utc).astimezone().isoformat()


def make_event_base(source, city="ludwigsburg"):
    """Base dict every scraper extends. Guarantees audit trail fields."""
    return {
        "source":                source,
        "city":                  city,
        "scraped_at":            now_iso(),
        "original_url":          "",   # set by each scraper
        "extraction_confidence": 1.0,  # JSON-API sources = 1.0, AI = varies
    }
