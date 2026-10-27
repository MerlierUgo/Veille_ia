# La Veille — ma revue IA du matin

Page personnelle style journal, mise à jour chaque matin automatiquement :

- **L'essentiel en cinq minutes** : 5 points rédigés par Gemini à partir du contenu du jour
- **Actualités** : flux RSS + Hacker News, dédoublonnés (une story = toutes les sources qui en parlent)
- **À regarder** : nouvelles vidéos des chaînes YouTube suivies
- **Prépublications du jour** : tendances Hugging Face Daily Papers + nouveautés arXiv proches de tes sujets
- **Les classiques** : papiers fondateurs cités par les papiers tendance du jour (Semantic Scholar)
- Sur chaque papier : **Discuter dans Claude** (copie l'article complet et ouvre claude.ai) et **Notebook POC** (généré à la demande, ouvert dans Colab)

Coût : 0 €/mois.

## Comment ça marche

```
GitHub Actions (cron 5h)  ──►  branche « data » (JSON + textes + notebooks)  ◄──  page Netlify (lit les JSON)
        ▲                                                                              │
        └──────────  workflow « Générer un POC »  ◄──  fonction Netlify  ◄──  bouton « Notebook POC »
```

- La branche `main` contient le code. La branche `data` est réécrite à chaque run en un seul commit,
  elle ne grossit donc jamais.
- Netlify ne redéploie que quand `site/` ou `netlify/` changent : le plan gratuit (300 crédits/mois) suffit largement.

## Mise en route (≈ 20 minutes)

### 1. Créer le dépôt GitHub

1. Sur GitHub, crée un dépôt **public** nommé `veille-ia` (sans README).
2. Dans ce dossier :
   ```bash
   git remote add origin https://github.com/<ton-utilisateur>/veille-ia.git
   git push -u origin main
   ```
3. Dans `site/config.js`, remplace `TON_UTILISATEUR/veille-ia` par ton dépôt, puis commit et push.

### 2. Clé Gemini (gratuite)

1. Va sur https://aistudio.google.com/apikey et crée une clé (pas de carte bancaire).
2. Dans le dépôt GitHub : **Settings → Secrets and variables → Actions → New repository secret**
   - `GEMINI_API_KEY` = ta clé
   - (optionnel) `S2_API_KEY` = clé Semantic Scholar gratuite, demandée sur https://www.semanticscholar.org/product/api. Sans elle ça marche, mais les classiques peuvent être moins complets les jours chargés.

### 3. Premier lancement

**Actions → Veille quotidienne → Run workflow**. Compte 3 à 6 minutes.
Une branche `data` apparaît. Ensuite, le run se fait seul chaque matin vers 5h (heure de Paris).

### 4. Netlify

1. Sur https://app.netlify.com : **Add new project → Import an existing project → GitHub → veille-ia**.
   Branche `main`, les autres réglages sont lus dans `netlify.toml`.
2. Crée un token GitHub pour les POC : https://github.com/settings/personal-access-tokens/new
   - *Repository access* : uniquement `veille-ia`
   - *Permissions → Actions* : **Read and write** (rien d'autre)
3. Dans Netlify : **Project configuration → Environment variables**, ajoute :
   - `GITHUB_TOKEN` = le token
   - `GITHUB_REPO` = `<ton-utilisateur>/veille-ia`
   - `POC_SECRET` = un code de ton choix (la page te le demandera une fois)
4. **Deploys → Trigger deploy** pour prendre en compte les variables. Ta page est en ligne.

## Personnaliser

Tout se règle dans `pipeline/config.yaml` : sujets d'intérêt, flux RSS, chaînes YouTube, catégories arXiv,
nombre d'éléments par section, modèle Gemini. Un flux cassé n'arrête jamais le pipeline : il apparaît
simplement en avertissement dans les logs de l'Action.

Pour ajouter une chaîne YouTube : sur la chaîne, **Partager la chaîne → Copier l'ID de la chaîne**.

## Tester en local

```bash
pip install -r pipeline/requirements.txt
OUT_DIR=./out GEMINI_API_KEY=ta_cle python pipeline/main.py
python -m http.server 8000
# puis ouvre http://localhost:8000/site/index.html?base=/out
```

Générer un POC en local : `OUT_DIR=./out GEMINI_API_KEY=ta_cle python pipeline/generate_poc.py 1706.03762`

## Bon à savoir

- **Heure du cron** : GitHub peut retarder les crons de quelques minutes à une heure les jours chargés.
- **Modèle Gemini** : si Google renomme ou retire `gemini_model` du free tier, le TL;DR se replie sur les
  5 premiers titres et les logs l'indiquent. Change alors le nom dans `config.yaml`.
- **Données publiques** : le dépôt est public, la page Netlify aussi (non indexée par les moteurs de recherche).
  La génération de POC est protégée par `POC_SECRET`.
- **Free tier Gemini** : Google peut utiliser les contenus envoyés pour améliorer ses produits.
  Ici ce ne sont que des articles arXiv publics.
- **Notebooks** : générés par un LLM, ce sont des points de départ pédagogiques, pas des reproductions fidèles.
