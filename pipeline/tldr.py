"""TL;DR du matin : 5 points à retenir, générés par Gemini en français et en anglais (un seul appel)."""
from __future__ import annotations

import json

from common import gemini, log

PROMPT = """Tu es le rédacteur en chef d'une revue de presse IA destinée à un data scientist.
À partir des éléments du jour ci-dessous, écris le TL;DR du matin, lisible en 5 minutes maximum, en français ("fr") puis sa version anglaise naturelle ("en").

Règles :
- Exactement 5 points, du plus important au moins important.
- Privilégie ce qui change concrètement quelque chose pour un praticien (nouveaux modèles, méthodes, résultats, outils).
- Une story reprise par plusieurs sources est probablement importante.
- Chaque point : un titre court et percutant (8 mots max) et 2 à 3 phrases factuelles, sans superlatifs creux.
- N'invente rien qui ne soit pas dans les éléments fournis.
- "ref" doit reprendre exactement l'identifiant entre crochets de l'élément principal du point.
- "headline" : une phrase d'accroche qui résume l'ambiance du jour.
- La version "en" reprend exactement les mêmes points, dans le même ordre, avec les mêmes "ref".

Réponds uniquement avec ce JSON :
{{"fr": {{"headline": "...", "points": [{{"title": "...", "text": "...", "ref": "news:xxx"}}]}},
  "en": {{"headline": "...", "points": [{{"title": "...", "text": "...", "ref": "news:xxx"}}]}}}}

ÉLÉMENTS DU JOUR
{items}
"""


def _context(news, papers, videos) -> str:
    lines = ["## News"]
    for n in news[:14]:
        extra = f" (+{len(n['also'])} autres sources)" if n.get("also") else ""
        lines.append(f"[news:{n['id']}] {n['title']} — {n['source']}{extra}. {n.get('summary', '')[:300]}")
    lines.append("\n## Papiers")
    for p in papers[:7]:
        votes = f" ({p['upvotes']} votes HF)" if p.get("upvotes") else ""
        lines.append(f"[paper:{p['id']}] {p['title']}{votes}. {p['abstract'][:350]}")
    lines.append("\n## Vidéos")
    for v in videos[:5]:
        lines.append(f"[video:{v['id']}] {v['title']} — {v['channel']}")
    return "\n".join(lines)


def _fallback(news, lang: str = "fr") -> dict:
    return {
        "headline": "Les titres du jour" if lang == "fr" else "Today's headlines",
        "points": [{"title": n["title"], "text": n.get("summary", ""), "ref": f"news:{n['id']}"} for n in news[:5]],
        "generated": False,
    }


def _parse(data, valid: set[str]) -> dict:
    points = [p for p in data.get("points", []) if p.get("title") and p.get("text")][:5]
    for p in points:
        if p.get("ref") not in valid:
            p["ref"] = None
    if len(points) < 3:
        raise ValueError("trop peu de points")
    return {"headline": data.get("headline", ""), "points": points, "generated": True}


def build(news, papers, videos, cfg) -> dict:
    """Renvoie {"fr": tldr, "en": tldr}."""
    if not news and not papers:
        return {"fr": {"headline": "Rien de neuf ce matin", "points": [], "generated": False},
                "en": {"headline": "Nothing new this morning", "points": [], "generated": False}}
    raw = gemini(PROMPT.format(items=_context(news, papers, videos)), model=cfg["gemini_model"],
                 json_mode=True, temperature=0.3, max_tokens=4096)
    out = {"fr": _fallback(news, "fr"), "en": _fallback(news, "en")}
    if not raw:
        return out
    try:
        data = json.loads(raw)
    except ValueError as e:
        log.warning("TL;DR illisible (%s), repli sur les titres", e)
        return out
    valid = {f"news:{n['id']}" for n in news} | {f"paper:{p['id']}" for p in papers} |             {f"video:{v['id']}" for v in videos}
    for lang in ("fr", "en"):
        try:
            out[lang] = _parse(data[lang], valid)
            log.info("TL;DR %s généré (%d points)", lang, len(out[lang]["points"]))
        except (KeyError, ValueError, TypeError, AttributeError) as e:
            log.warning("TL;DR %s illisible (%s), repli sur les titres", lang, e)
    return out
