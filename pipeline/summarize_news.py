"""Résumé en français de chaque actualité, affiché sous son titre.

On récupère le texte de l'article (trafilatura), puis un seul appel Gemini résume toutes les
actualités d'un coup pour ménager le quota gratuit. Si une page est bloquée, on résume l'extrait
RSS ; si Gemini ne répond pas, la page affiche l'extrait RSS comme avant.
"""
from __future__ import annotations

import json
import time

import trafilatura

from common import gemini, http_get, log

ARTICLE_CHARS = 3000  # par article : assez pour un résumé, et 10 articles tiennent dans un appel

PROMPT = """Tu résumes des actualités IA pour un data scientist francophone.
Pour chaque article ci-dessous, écris un résumé en français de 2 à 3 phrases factuelles :
ce qui s'est passé, puis pourquoi ça compte pour un praticien. Pas de superlatifs creux,
garde les termes techniques anglais usuels, et n'invente rien qui ne soit pas dans le texte.
Si le texte est trop pauvre pour résumer, résume simplement ce que dit le titre en une phrase.

Réponds uniquement avec ce JSON : {{"<id>": "<résumé>", ...}}

ARTICLES
{items}
"""


def _article_text(n: dict) -> str:
    r = http_get(n["url"], timeout=20, retries=0)
    text = trafilatura.extract(r.text, include_comments=False, include_tables=False) if r is not None else None
    if not text and n["source"] != "Hacker News":  # l'extrait HN n'est qu'un compteur de points
        text = n.get("summary", "")
    return (text or "")[:ARTICLE_CHARS]


def summarize(news: list[dict], cfg: dict) -> list[dict]:
    if not news:
        return news
    blocks = []
    for n in news:
        blocks.append(f"[{n['id']}] {n['title']} — {n['source']}\n{_article_text(n)}")
        time.sleep(1)
    raw = gemini(PROMPT.format(items="\n\n".join(blocks)), model=cfg.get("gemini_model_news", cfg["gemini_model"]),
                 json_mode=True, temperature=0.2, max_tokens=4096)
    if not raw:
        return news
    try:
        summaries = json.loads(raw)
    except ValueError as e:
        log.warning("Résumés des actualités illisibles (%s)", e)
        return news
    for n in news:
        s = summaries.get(n["id"]) if isinstance(summaries, dict) else None
        if isinstance(s, str) and s.strip():
            n["ai_summary"] = s.strip()
    log.info("Actualités résumées : %d/%d", sum("ai_summary" in n for n in news), len(news))
    return news
