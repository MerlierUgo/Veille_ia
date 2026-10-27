"""Déduplication et classement des news.

Une même annonce reprise par plusieurs sources devient une seule « story »,
avec la liste des sources qui en parlent. Le nombre de sources est un très bon
signal d'importance, il compte donc beaucoup dans le score.
"""
from __future__ import annotations

import math
from datetime import datetime

from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity

from common import keyword_score, now_utc

SIM_THRESHOLD = 0.42


def _find(parent, i):
    while parent[i] != i:
        parent[i] = parent[parent[i]]
        i = parent[i]
    return i


def cluster(items: list[dict]) -> list[list[dict]]:
    # Doublons d'URL exacts d'abord
    seen, uniq = {}, []
    for it in items:
        if it["url"] in seen:  # même lien vu ailleurs (souvent via HN) : on garde le signal et la discussion
            kept = seen[it["url"]]
            kept["signal"] = max(kept.get("signal", 0), it.get("signal", 0))
            if it.get("discussion"):
                kept.setdefault("discussion", it["discussion"])
            continue
        seen[it["url"]] = it
        uniq.append(it)
    if len(uniq) < 2:
        return [[it] for it in uniq]

    texts = [f"{it['title']} {it['title']} {it.get('summary', '')}" for it in uniq]
    vec = TfidfVectorizer(stop_words="english", ngram_range=(1, 2), min_df=1, sublinear_tf=True)
    sim = cosine_similarity(vec.fit_transform(texts))

    parent = list(range(len(uniq)))
    for i in range(len(uniq)):
        for j in range(i + 1, len(uniq)):
            if sim[i, j] >= SIM_THRESHOLD and uniq[i]["source"] != uniq[j]["source"]:
                parent[_find(parent, i)] = _find(parent, j)

    groups: dict[int, list[dict]] = {}
    for i, it in enumerate(uniq):
        groups.setdefault(_find(parent, i), []).append(it)
    return list(groups.values())


def rank(items: list[dict], keywords: list[str], limit: int = 30) -> list[dict]:
    stories = []
    now = now_utc()
    for group in cluster(items):
        sources = {it["source"] for it in group}
        # La « tête » : de préférence un article avec résumé et image, hors Hacker News
        lead = sorted(group, key=lambda it: (it["source"] == "Hacker News", not it.get("image"),
                                             -len(it.get("summary") or "")))[0]
        age_h = max(0.0, (now - datetime.fromisoformat(lead["published"])).total_seconds() / 3600)
        text = " ".join(f"{it['title']} {it.get('summary', '')}" for it in group)
        signal = max(it.get("signal", 0) for it in group)
        score = (3.0 * (len(sources) - 1)
                 + 1.5 * min(keyword_score(text, keywords), 4)
                 + 0.8 * math.log1p(signal)
                 - 0.05 * age_h)
        story = dict(lead)
        story["score"] = round(score, 2)
        story["also"] = [{"source": it["source"], "url": it["url"]} for it in group if it is not lead]
        hn = next((it.get("discussion") for it in group if it.get("discussion")), None)
        if hn:
            story["discussion"] = hn
        stories.append(story)
    stories.sort(key=lambda s: s["score"], reverse=True)
    return stories[:limit]
