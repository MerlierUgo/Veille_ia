"""News : flux RSS + Hacker News (API Algolia)."""
from __future__ import annotations

import hashlib
import time
from calendar import timegm
from datetime import datetime, timedelta, timezone

import feedparser

from common import clean_html, http_get, keyword_score, log, now_utc

AI_TERMS = ["ai", "a.i.", "llm", "llms", "gpt", "claude", "gemini", "openai", "anthropic", "deepmind",
            "mistral", "llama", "machine learning", "deep learning", "neural", "model", "models",
            "chatbot", "agent", "agents", "transformer", "hugging face", "nvidia", "inference"]


def _uid(url: str) -> str:
    return hashlib.sha1(url.encode()).hexdigest()[:12]


def _entry_date(e) -> datetime | None:
    for k in ("published_parsed", "updated_parsed"):
        t = e.get(k)
        if t:
            return datetime.fromtimestamp(timegm(t), tz=timezone.utc)
    return None


def _entry_image(e) -> str | None:
    for k in ("media_content", "media_thumbnail"):
        for m in e.get(k) or []:
            if m.get("url"):
                return m["url"]
    for l in e.get("links") or []:
        if l.get("rel") == "enclosure" and str(l.get("type", "")).startswith("image"):
            return l.get("href")
    return None


def collect_rss(cfg: dict) -> list[dict]:
    cutoff = now_utc() - timedelta(hours=cfg.get("news_max_age_hours", 36))
    items = []
    for feed in cfg["news_feeds"]:
        r = http_get(feed["url"])
        if r is None:
            continue
        parsed = feedparser.parse(r.content)
        n = 0
        for e in parsed.entries[:40]:
            url = e.get("link")
            date = _entry_date(e)
            if not url or not e.get("title") or (date and date < cutoff):
                continue
            summary = clean_html(e.get("summary") or e.get("description"), 400)
            items.append({
                "id": _uid(url),
                "title": clean_html(e.title),
                "url": url,
                "source": feed["name"],
                "published": (date or now_utc()).isoformat(),
                "summary": summary,
                "image": _entry_image(e),
                "signal": 0,
            })
            n += 1
        log.info("RSS %-18s %d articles", feed["name"], n)
    return items


def collect_hackernews(cfg: dict) -> list[dict]:
    since = int(time.time()) - cfg.get("news_max_age_hours", 36) * 3600
    r = http_get("https://hn.algolia.com/api/v1/search_by_date", params={
        "tags": "story",
        "numericFilters": f"created_at_i>{since},points>={cfg.get('hackernews_min_points', 60)}",
        "hitsPerPage": 200,
    })
    if r is None:
        return []
    items = []
    for h in r.json().get("hits", []):
        title = h.get("title") or ""
        if keyword_score(title, AI_TERMS + cfg["keywords"]) == 0:
            continue
        hn_url = f"https://news.ycombinator.com/item?id={h['objectID']}"
        url = h.get("url") or hn_url
        items.append({
            "id": _uid(url),
            "title": title,
            "url": url,
            "source": "Hacker News",
            "published": datetime.fromtimestamp(h["created_at_i"], tz=timezone.utc).isoformat(),
            "summary": f"{h.get('points', 0)} points · {h.get('num_comments', 0)} commentaires",
            "image": None,
            "signal": int(h.get("points", 0)),
            "discussion": hn_url,
        })
    log.info("Hacker News         %d articles IA", len(items))
    return items


def collect(cfg: dict) -> list[dict]:
    return collect_rss(cfg) + collect_hackernews(cfg)
