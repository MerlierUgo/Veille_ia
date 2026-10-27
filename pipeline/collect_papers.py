"""Papiers : Hugging Face Daily Papers (popularité) + API arXiv (fraîcheur)."""
from __future__ import annotations

import re
import time
from datetime import timedelta

import feedparser

from common import clean_html, http_get, keyword_score, log, now_utc

ARXIV_API = "https://export.arxiv.org/api/query"
HF_API = "https://huggingface.co/api/daily_papers"
GITHUB_RE = re.compile(r"https?://github\.com/[\w.-]+/[\w.-]+")
ARXIV_ID_RE = re.compile(r"(\d{4}\.\d{4,5})")


def _paper(pid, title, authors, abstract, published, **extra) -> dict:
    authors = [a for a in authors if a]
    p = {
        "id": pid,
        "title": clean_html(title),
        "authors": ", ".join(authors[:4]) + (" et al." if len(authors) > 4 else ""),
        "abstract": clean_html(abstract, 1100),
        "published": published,
        "url": f"https://arxiv.org/abs/{pid}",
        "pdf": f"https://arxiv.org/pdf/{pid}",
        "upvotes": 0,
        "github": None,
        "origin": "arxiv",
    }
    p.update({k: v for k, v in extra.items() if v is not None})
    return p


def collect_hf() -> list[dict]:
    papers: dict[str, dict] = {}
    today = now_utc().date()
    for params in ({"limit": 100}, {"date": str(today - timedelta(days=1)), "limit": 100}):
        r = http_get(HF_API, params=params)
        if r is None:
            continue
        try:
            rows = r.json()
        except ValueError:
            continue
        for row in rows if isinstance(rows, list) else []:
            p = row.get("paper") or row
            pid = p.get("id") or ""
            if not ARXIV_ID_RE.fullmatch(pid):
                continue
            authors = [a.get("name") if isinstance(a, dict) else str(a) for a in p.get("authors", [])]
            item = _paper(pid, p.get("title") or row.get("title", ""), authors,
                          p.get("summary", ""), p.get("publishedAt") or row.get("publishedAt"),
                          upvotes=int(p.get("upvotes", 0) or 0), github=p.get("githubRepo"),
                          ai_summary=p.get("ai_summary"), origin="hf")
            if pid not in papers or item["upvotes"] > papers[pid]["upvotes"]:
                papers[pid] = item
    log.info("HF Daily Papers     %d papiers", len(papers))
    return list(papers.values())


def collect_arxiv(cfg: dict) -> list[dict]:
    query = " OR ".join(f"cat:{c}" for c in cfg["arxiv_categories"])
    r = http_get(ARXIV_API, params={"search_query": query, "sortBy": "submittedDate",
                                    "sortOrder": "descending", "max_results": cfg.get("arxiv_max_results", 150)},
                 timeout=60)
    time.sleep(3)  # règle de politesse arXiv : 3 s entre deux appels
    if r is None:
        return []
    papers = []
    for e in feedparser.parse(r.content).entries:
        m = ARXIV_ID_RE.search(e.get("id", ""))
        if not m:
            continue
        text = f"{e.get('summary', '')} {e.get('arxiv_comment', '')}"
        gh = GITHUB_RE.search(text)
        papers.append(_paper(m.group(1), e.get("title", ""), [a.get("name") for a in e.get("authors", [])],
                             e.get("summary", ""), e.get("published"),
                             github=gh.group(0).rstrip(".") if gh else None,
                             categories=[t.get("term") for t in e.get("tags", [])][:4]))
    log.info("arXiv               %d papiers récents", len(papers))
    return papers


def collect(cfg: dict) -> list[dict]:
    """Mélange : ~2/3 tendance HF (votes), ~1/3 arXiv frais le plus proche de tes sujets."""
    n = cfg.get("papers_max", 15)
    kw = cfg["keywords"]
    hf = sorted(collect_hf(), key=lambda p: p["upvotes"], reverse=True)
    arxiv = collect_arxiv(cfg)
    for p in hf + arxiv:
        p["relevance"] = keyword_score(f"{p['title']} {p['abstract']}", kw)

    chosen, ids = [], set()
    for p in hf[: max(1, (2 * n) // 3)]:
        chosen.append(p)
        ids.add(p["id"])
    for p in sorted(arxiv, key=lambda p: p["relevance"], reverse=True):
        if len(chosen) >= n:
            break
        if p["id"] not in ids and p["relevance"] > 0:
            chosen.append(p)
            ids.add(p["id"])
    for p in hf:  # complète si arXiv n'a pas suffi
        if len(chosen) >= n:
            break
        if p["id"] not in ids:
            chosen.append(p)
            ids.add(p["id"])
    return chosen
