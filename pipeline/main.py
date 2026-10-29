"""Orchestrateur du matin : collecte → dédup → résumés des news → reco → texte intégral → TL;DR → JSON.

Usage local :  OUT_DIR=./out GEMINI_API_KEY=... python pipeline/main.py
"""
from __future__ import annotations

import json
import sys
import time
import traceback

import collect_news
import collect_papers
import collect_videos
import dedup
import extract_fulltext
import recommend
import summarize_news
import tldr
from common import OUT_DIR, load_config, log, now_utc, write_json


def safe(label, fn, *args, default=None):
    try:
        return fn(*args)
    except Exception:
        log.error("Étape « %s » en échec :\n%s", label, traceback.format_exc())
        return default if default is not None else []


def prune(data_dir, keep_days: int = 90, keep_text_days: int = 30) -> list[str]:
    """Garde la branche data légère : 90 jours d'archives, textes intégraux des 30 derniers jours."""
    archives = sorted((data_dir / "archive").glob("*.json"), reverse=True)
    for f in archives[keep_days:]:
        f.unlink()
    archives = archives[:keep_days]
    keep = {f.stem for f in (OUT_DIR / "notebooks").glob("*.ipynb")}
    for f in archives[:keep_text_days]:
        try:
            day = json.loads(f.read_text(encoding="utf-8"))
            keep |= {p["id"] for p in day.get("papers", []) + day.get("classics", [])}
        except ValueError:
            pass
    for f in (data_dir / "papers").glob("*.md"):
        if f.stem not in keep:
            f.unlink()
    return [f.stem for f in archives]


def main() -> int:
    t0 = time.time()
    cfg = load_config()
    log.info("Sortie : %s", OUT_DIR)

    raw_news = safe("news", collect_news.collect, cfg)
    news = safe("dédup", dedup.rank, raw_news, cfg["keywords"], cfg.get("news_max", 10))
    news.sort(key=lambda n: n["published"], reverse=True)  # les plus importantes, affichées de la plus récente à la plus ancienne
    news = safe("résumés news", summarize_news.summarize, news, cfg, default=news)
    videos = safe("vidéos", collect_videos.collect, cfg)
    papers = safe("papiers", collect_papers.collect, cfg)
    classics = safe("classiques", recommend.recommend, papers, cfg)

    for p in papers[: cfg.get("fulltext_max", 15)] + classics:
        p["fulltext"] = safe(f"texte {p['id']}", extract_fulltext.extract, p, OUT_DIR, default=False)
    for p in papers + classics:
        p["notebook"] = (OUT_DIR / "notebooks" / f"{p['id']}.ipynb").exists()

    brief = safe("tldr", tldr.build, news, papers, videos, cfg, default={"headline": "", "points": []})

    now = now_utc()
    payload = {
        "generated_at": now.isoformat(),
        "date": now.date().isoformat(),
        "tldr": brief,
        "news": news,
        "videos": videos,
        "papers": papers,
        "classics": classics,
        "stats": {"raw_news": len(raw_news), "stories": len(news), "videos": len(videos),
                  "papers": len(papers), "classics": len(classics), "seconds": round(time.time() - t0)},
    }
    data_dir = OUT_DIR / "data"
    write_json(data_dir / "latest.json", payload)
    write_json(data_dir / "archive" / f"{payload['date']}.json", payload)
    dates = prune(data_dir)
    write_json(data_dir / "index.json", {"dates": dates})

    log.info("Terminé en %ss : %s", payload["stats"]["seconds"], payload["stats"])
    # Échec du job seulement si on n'a vraiment rien récupéré (sinon on publie ce qu'on a).
    return 0 if (news or papers or videos) else 1


if __name__ == "__main__":
    sys.exit(main())
