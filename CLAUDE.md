# Veille IA — contexte du projet

Page personnelle de veille IA style journal, mise à jour chaque matin. Utilisateur : data scientist,
francophone. Toute l'interface et les textes générés sont en français.

## Contrainte principale : budget 0 €/mois
Chaque choix d'architecture découle de ça. Ne pas proposer de service payant sans le signaler clairement.
- **Netlify gratuit = 300 crédits/mois, ~15 crédits par déploiement en production.** La page n'est donc
  jamais redéployée chaque jour : elle lit ses données depuis GitHub. Regrouper les modifications de
  `site/` et `netlify/` avant de pousser sur `main`.
- **LLM = Gemini free tier** (modèle dans `pipeline/config.yaml`). Pas d'API Claude (payante).
  L'intégration Claude passe par le bouton « Discuter dans Claude » : ouvre claude.ai/new?q=… avec le
  prompt pré-rempli (article inclus s'il est court, sinon lien vers le Markdown sur la branche `data`)
  et copie aussi l'article complet dans le presse-papiers (gratuit avec l'abonnement).

## Architecture
- `pipeline/` (Python) — lancé par `.github/workflows/daily.yml` vers 5h (Paris) :
  collecte RSS + Hacker News → dédup TF-IDF (`dedup.py`) → vidéos (RSS YouTube, sans clé)
  → papiers (HF Daily Papers + API arXiv) → classiques (références des papiers tendance via
  Semantic Scholar, `recommend.py`) → texte intégral en Markdown (`extract_fulltext.py`)
  → TL;DR 5 points via Gemini (`tldr.py`) → `data/latest.json`, `data/archive/AAAA-MM-JJ.json`.
- Les sorties vont dans `$OUT_DIR` puis sur la **branche `data`**, réécrite en un seul commit à chaque
  run (`.github/scripts/push-data.sh`). Ne jamais travailler sur `data` en local.
- `site/` — page statique sans build (HTML/CSS/JS vanilla). Lit les JSON via raw.githubusercontent.com.
  Dépôt configuré dans `site/config.js`. Polices : Newsreader + IBM Plex Sans Condensed. Accent bleu encre.
- Notebooks POC à la demande : bouton → `netlify/functions/generate-poc.mjs` (vérifie `POC_SECRET`)
  → déclenche `.github/workflows/poc.yml` → `pipeline/generate_poc.py` (Gemini) → `notebooks/<id>.ipynb`
  sur `data` → la page interroge l'API GitHub toutes les 20 s puis ouvre Colab. La génération se fait
  dans Actions et non dans la fonction, car elle dépasse la limite de durée des fonctions Netlify gratuites.
- Les deux workflows partagent le groupe `concurrency: data-branch` pour ne jamais écrire en même temps.

## Principes de code
- Un flux ou une API en panne ne doit jamais faire échouer le run : `http_get` renvoie `None`,
  chaque étape est enveloppée dans `safe()` dans `main.py`, et le TL;DR se replie sur les titres.
- Respecter arXiv (3 s entre appels) et Semantic Scholar (~1 req/s sans clé).
- Le dépôt est public : aucune clé dans le code. Secrets GitHub : `GEMINI_API_KEY`, `S2_API_KEY`
  (optionnel). Variables Netlify : `GITHUB_TOKEN`, `GITHUB_REPO`, `POC_SECRET`. En local : `.env` (ignoré).

## Tester en local
```bash
pip install -r pipeline/requirements.txt
OUT_DIR=./out GEMINI_API_KEY=... python pipeline/main.py
python -m http.server 8000   # puis http://localhost:8000/site/index.html?base=/out
OUT_DIR=./out GEMINI_API_KEY=... python pipeline/generate_poc.py 1706.03762
```

## Idées en attente
- Boutons 👍/👎 par article et scoring personnalisé par embeddings.
- Section releases (modèles/repos tendance Hugging Face et GitHub, leaderboards).
- Version audio du TL;DR, export Zotero/Notion, digest hebdo.
