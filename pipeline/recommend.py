"""Classiques recommandés : les papiers fondateurs sur lesquels s'appuie l'actualité.

Pour chaque papier tendance, on récupère ses références via Semantic Scholar.
Un papier ancien cité par plusieurs papiers tendance du jour est, par construction,
un classique lié à l'actualité. Score = (nb de papiers tendance qui le citent) × log(citations).
"""
from __future__ import annotations

import json
import math
import os
import time
from collections import defaultdict

import feedparser

from common import OUT_DIR, clean_html, http_get, log, now_utc

S2 = "https://api.semanticscholar.org/graph/v1/paper/arXiv:{id}/references"
FIELDS = "title,year,citationCount,externalIds,abstract,authors"
MIN_AGE_YEARS = 2


def _recently_shown(days: int = 6) -> set[str]:
    shown = set()
    archive = OUT_DIR / "data" / "archive"
    for f in sorted(archive.glob("*.json"))[-days:] if archive.exists() else []:
        try:
            shown |= {c["id"] for c in json.loads(f.read_text(encoding="utf-8")).get("classics", [])}
        except (ValueError, KeyError):
            pass
    return shown


def _fallback(ids: list[str]) -> list[dict]:
    r = http_get("https://export.arxiv.org/api/query", params={"id_list": ",".join(ids), "max_results": len(ids)})
    if r is None:
        return []
    out = []
    for e in feedparser.parse(r.content).entries:
        pid = e.get("id", "").rsplit("/", 1)[-1].split("v")[0]
        authors = [a.get("name") for a in e.get("authors", [])]
        out.append({
            "id": pid, "title": clean_html(e.get("title")), "year": int(e.get("published", "0000")[:4]),
            "authors": ", ".join(authors[:3]) + (" et al." if len(authors) > 3 else ""),
            "abstract": clean_html(e.get("summary"), 700), "citations": None,
            "url": f"https://arxiv.org/abs/{pid}", "cited_by": [], "why": "Papier fondateur",
        })
    return out


def recommend(trending: list[dict], cfg: dict) -> list[dict]:
    headers = {"x-api-key": os.environ["S2_API_KEY"]} if os.environ.get("S2_API_KEY") else {}
    max_year = now_utc().year - MIN_AGE_YEARS
    refs: dict[str, dict] = {}
    cited_by: dict[str, list[str]] = defaultdict(list)

    for p in trending[:10]:
        r = http_get(S2.format(id=p["id"]), params={"fields": FIELDS, "limit": 300}, headers=headers, retries=3)
        time.sleep(1.2)  # limite publique de Semantic Scholar
        if r is None:
            continue
        for row in r.json().get("data") or []:
            c = row.get("citedPaper") or {}
            arxiv_id = (c.get("externalIds") or {}).get("ArXiv")
            if not arxiv_id or not c.get("year") or c["year"] > max_year:
                continue
            authors = [a.get("name") for a in c.get("authors") or []]
            refs[arxiv_id] = {
                "id": arxiv_id, "title": c.get("title", ""), "year": c["year"],
                "authors": ", ".join(authors[:3]) + (" et al." if len(authors) > 3 else ""),
                "abstract": clean_html(c.get("abstract"), 700), "citations": c.get("citationCount") or 0,
                "url": f"https://arxiv.org/abs/{arxiv_id}",
            }
            if p["title"] not in cited_by[arxiv_id]:
                cited_by[arxiv_id].append(p["title"])

    recent = _recently_shown()
    scored = []
    for pid, ref in refs.items():
        score = len(cited_by[pid]) * math.log1p(ref["citations"])
        if pid in recent:
            score *= 0.4  # varie les recommandations d'un jour à l'autre
        n = len(cited_by[pid])
        ref["cited_by"] = cited_by[pid][:3]
        ref["why"] = f"Cité par {n} papier{'s' if n > 1 else ''} tendance du jour"
        scored.append((score, ref))
    scored.sort(key=lambda x: x[0], reverse=True)
    classics = [ref for s, ref in scored if len(cited_by[ref["id"]]) >= 1][: cfg.get("classics_max", 8)]
    log.info("Semantic Scholar    %d classiques trouvés", len(classics))

    if len(classics) < cfg.get("classics_max", 8):
        have = {c["id"] for c in classics}
        pool = [i for i in cfg.get("classics_fallback", []) if i not in have and i not in recent] or \
               [i for i in cfg.get("classics_fallback", []) if i not in have]
        classics += _fallback(pool[: cfg.get("classics_max", 8) - len(classics)])
    return classics
