"""Génère un notebook POC Colab pour un papier arXiv, à la demande.

Usage : OUT_DIR=./out GEMINI_API_KEY=... python pipeline/generate_poc.py 2510.12345
Écrit notebooks/<id>.ipynb (ou notebooks/<id>.error.json en cas d'échec,
pour que la page arrête d'attendre et affiche l'erreur).
"""
from __future__ import annotations

import ast
import json
import re
import sys

import feedparser

from common import OUT_DIR, clean_html, gemini, http_get, load_config, log, now_utc, write_json
from extract_fulltext import extract

PROMPT = """Tu es un ingénieur ML senior. Écris un notebook Jupyter de preuve de concept (POC) pour le papier ci-dessous.

Objectif : qu'un data scientist comprenne et voie fonctionner l'idée centrale du papier en moins de 30 minutes,
sur un Google Colab gratuit (GPU T4, 15 Go de RAM). Ce n'est PAS une reproduction complète.

Structure attendue :
1. Titre, référence du papier, et en 5 lignes : le problème, l'idée clé, pourquoi ça marche.
2. Cellule d'installation (`!pip install -q ...`) avec uniquement les paquets nécessaires.
3. Imports + seed + détection du device (cuda/cpu).
4. Implémentation from scratch (PyTorch de préférence) du composant central du papier, commentée,
   avec les équations du papier rappelées en Markdown (LaTeX) juste avant le code correspondant.
5. Données : un petit jeu synthétique ou un petit dataset public (Hugging Face datasets / torchvision), téléchargement rapide.
6. Une expérience à petite échelle (< 10 min sur T4) comparant la méthode à une baseline simple.
7. Visualisations (matplotlib) des résultats.
8. Section « Ce que ce POC ne reproduit pas » : écarts d'échelle, hypothèses simplificatrices, pistes pour aller plus loin.
{code_hint}
Contraintes :
- Le notebook doit s'exécuter de haut en bas sans erreur, sans clé API ni compte.
- Texte Markdown en français, code et commentaires en anglais.
- Pas de cellule vide, pas de placeholder du type « à compléter ».

Réponds uniquement avec ce JSON :
{{"cells": [{{"cell_type": "markdown" | "code", "source": "contenu de la cellule"}}]}}

PAPIER
{paper}
"""


def _paper_meta(pid: str) -> dict:
    r = http_get("https://export.arxiv.org/api/query", params={"id_list": pid})
    e = feedparser.parse(r.content).entries[0] if r is not None else {}
    authors = [a.get("name") for a in e.get("authors", [])] if e else []
    return {"id": pid, "title": clean_html(e.get("title", pid)) if e else pid,
            "authors": ", ".join(authors[:4]), "abstract": clean_html(e.get("summary", "")) if e else "",
            "url": f"https://arxiv.org/abs/{pid}"}


def _syntax_ok(src: str) -> bool:
    py = "\n".join("pass" if l.lstrip().startswith(("!", "%")) else l for l in src.splitlines())
    try:
        ast.parse(py)
        return True
    except SyntaxError:
        return False


def _to_ipynb(cells: list[dict], pid: str) -> dict:
    nb_cells = [{
        "cell_type": "markdown", "metadata": {},
        "source": [f"Papier : https://arxiv.org/abs/{pid} · "
                   f"_Notebook généré automatiquement le {now_utc().date()} — à relire avec un œil critique._"],
    }]
    for c in cells:
        kind = "code" if c.get("cell_type") == "code" else "markdown"
        src = str(c.get("source", "")).strip("\n")
        if not src:
            continue
        cell = {"cell_type": kind, "metadata": {}, "source": src.splitlines(keepends=True)}
        if kind == "code":
            cell.update({"execution_count": None, "outputs": []})
        nb_cells.append(cell)
    return {
        "nbformat": 4, "nbformat_minor": 5, "cells": nb_cells,
        "metadata": {"accelerator": "GPU", "colab": {"provenance": [], "gpuType": "T4"},
                     "kernelspec": {"name": "python3", "display_name": "Python 3"},
                     "language_info": {"name": "python"}},
    }


def main(pid: str) -> int:
    if not re.fullmatch(r"\d{4}\.\d{4,5}", pid):
        log.error("Identifiant arXiv invalide : %s", pid)
        return 2
    cfg = load_config()
    nb_path = OUT_DIR / "notebooks" / f"{pid}.ipynb"
    err_path = OUT_DIR / "notebooks" / f"{pid}.error.json"
    if nb_path.exists():
        log.info("Notebook déjà présent")
        return 0

    md_path = OUT_DIR / "data" / "papers" / f"{pid}.md"
    if not md_path.exists():
        extract(_paper_meta(pid), OUT_DIR)
    paper_text = md_path.read_text(encoding="utf-8")[:120_000]
    gh = re.search(r"\*\*Code\*\* : (\S+)", paper_text)
    code_hint = (f"\nUn dépôt de code officiel existe ({gh.group(1)}) : signale-le en introduction, "
                 "mais garde une implémentation pédagogique autonome.\n") if gh else ""

    cells = None
    for attempt in range(2):
        raw = gemini(PROMPT.format(paper=paper_text, code_hint=code_hint), model=cfg["gemini_model"],
                     json_mode=True, temperature=0.2, max_tokens=32768, timeout=300)
        try:
            cells = json.loads(raw)["cells"] if raw else None
        except (ValueError, KeyError, TypeError):
            cells = None
        if cells:
            bad = [i for i, c in enumerate(cells) if c.get("cell_type") == "code" and not _syntax_ok(c.get("source", ""))]
            if not bad:
                break
            log.warning("Essai %d : %d cellule(s) avec erreur de syntaxe", attempt + 1, len(bad))
            if attempt == 1:
                break  # on garde quand même le notebook, Colab signalera l'erreur
    if not cells:
        write_json(err_path, {"id": pid, "error": "La génération a échoué (quota Gemini ou réponse invalide). Réessaie plus tard.",
                              "at": now_utc().isoformat()})
        return 1

    write_json(nb_path, _to_ipynb(cells, pid))
    if err_path.exists():
        err_path.unlink()
    log.info("Notebook écrit : %s (%d cellules)", nb_path, len(cells))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1].strip() if len(sys.argv) > 1 else ""))
