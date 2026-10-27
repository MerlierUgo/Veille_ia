"""Texte intégral des papiers en Markdown, pour le bouton « Discuter dans Claude »
et pour la génération de notebooks POC.

Ordre de préférence : version HTML d'arXiv (propre, maths en LaTeX) → PDF → résumé.
"""
from __future__ import annotations

import io
import re
import time
from pathlib import Path

from bs4 import BeautifulSoup

from common import http_get, log

MAX_CHARS = 150_000  # ~40k tokens : largement assez, et reste collable dans Claude


def _from_html(pid: str) -> str | None:
    r = http_get(f"https://arxiv.org/html/{pid}", timeout=40, retries=1)
    if r is None or "ltx_document" not in r.text:
        return None
    soup = BeautifulSoup(r.text, "html.parser")
    doc = soup.find("article") or soup.find(class_="ltx_document")
    if doc is None:
        return None
    for m in doc.find_all("math"):
        tex = m.get("alttext") or m.get_text(" ", strip=True)
        display = m.get("display") == "block"
        m.replace_with(f"$${tex}$$" if display else f"${tex}$")
    for tag in doc.select("figure img, .ltx_page_footer, nav, .ltx_role_footnote .ltx_tag, button"):
        tag.decompose()

    lines = []
    for el in doc.find_all(["h1", "h2", "h3", "h4", "p", "figcaption", "li", "table"]):
        if el.find_parent(["p", "li", "figcaption", "table"]) is not None:
            continue  # évite les doublons d'éléments imbriqués
        text = re.sub(r"\s+", " ", el.get_text(" ", strip=True))
        if not text:
            continue
        if el.name in ("h1", "h2", "h3", "h4"):
            lines.append("\n" + "#" * (int(el.name[1]) + 1) + " " + text)
        elif el.name == "figcaption":
            lines.append(f"> {text}")
        elif el.name == "li":
            lines.append(f"- {text}")
        elif el.name == "table":
            lines.append(f"[Tableau] {text[:1500]}")
        else:
            lines.append(text)
    out = "\n\n".join(lines)
    return out if len(out) > 3000 else None


def _from_pdf(pid: str) -> str | None:
    from pypdf import PdfReader

    r = http_get(f"https://arxiv.org/pdf/{pid}", timeout=60, retries=1)
    if r is None:
        return None
    try:
        reader = PdfReader(io.BytesIO(r.content))
        text = "\n\n".join((page.extract_text() or "") for page in reader.pages[:40])
    except Exception as e:  # PDF exotique
        log.warning("PDF illisible %s : %s", pid, e)
        return None
    text = re.sub(r"[ \t]+", " ", text)
    return text if len(text) > 3000 else None


def extract(paper: dict, out_dir: Path) -> bool:
    """Écrit data/papers/<id>.md. Renvoie True si le texte intégral a été obtenu."""
    path = out_dir / "data" / "papers" / f"{paper['id']}.md"
    if path.exists() and path.stat().st_size > 5000:
        return True  # déjà extrait un jour précédent
    body, kind = _from_html(paper["id"]), "html"
    time.sleep(1)
    if not body:
        body, kind = _from_pdf(paper["id"]), "pdf"
        time.sleep(1)
    full = bool(body)
    if not body:
        body, kind = paper.get("abstract", ""), "abstract"
    if len(body) > MAX_CHARS:
        body = body[:MAX_CHARS] + "\n\n[…texte tronqué…]"

    header = (f"# {paper['title']}\n\n"
              f"- **arXiv** : {paper['id']} — {paper.get('url', '')}\n"
              f"- **Auteurs** : {paper.get('authors', '')}\n"
              + (f"- **Code** : {paper['github']}\n" if paper.get("github") else "")
              + f"- **Source du texte** : {kind}\n\n## Résumé\n\n{paper.get('abstract', '')}\n\n---\n\n")
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(header + body, encoding="utf-8")
    log.info("Texte %-12s %-8s %6d caractères", paper["id"], kind, len(body))
    return full
