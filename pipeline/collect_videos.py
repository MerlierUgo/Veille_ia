"""Vidéos : flux RSS publics des chaînes YouTube (gratuit, sans clé, sans quota)."""
from __future__ import annotations

from calendar import timegm
from datetime import datetime, timedelta, timezone

import feedparser

from common import clean_html, http_get, keyword_score, log, now_utc

FEED = "https://www.youtube.com/feeds/videos.xml"


def collect(cfg: dict) -> list[dict]:
    cutoff = now_utc() - timedelta(days=cfg.get("videos_max_age_days", 4))
    videos = []
    for ch in cfg["youtube_channels"]:
        r = http_get(FEED, params={"channel_id": ch["id"]})
        if r is None:
            continue
        n = 0
        for e in feedparser.parse(r.content).entries:
            link = e.get("link", "")
            if "/shorts/" in link:
                continue
            t = e.get("published_parsed")
            date = datetime.fromtimestamp(timegm(t), tz=timezone.utc) if t else None
            if not date or date < cutoff:
                continue
            vid = e.get("yt_videoid") or link.rsplit("=", 1)[-1]
            thumbs = e.get("media_thumbnail") or []
            stats = e.get("media_statistics") or {}
            desc = clean_html(e.get("summary") or "", 220)
            videos.append({
                "id": vid,
                "title": clean_html(e.get("title")),
                "url": f"https://www.youtube.com/watch?v={vid}",
                "channel": ch["name"],
                "published": date.isoformat(),
                "thumbnail": thumbs[0]["url"] if thumbs else f"https://i.ytimg.com/vi/{vid}/hqdefault.jpg",
                "views": int(stats.get("views", 0) or 0),
                "description": desc,
                "relevance": keyword_score(f"{e.get('title', '')} {desc}", cfg["keywords"]),
            })
            n += 1
        log.info("YouTube %-22s %d vidéos", ch["name"], n)
    videos.sort(key=lambda v: (v["published"], v["relevance"]), reverse=True)
    return videos[: cfg.get("videos_max", 12)]
