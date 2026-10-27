#!/usr/bin/env bash
# Publie ./out sur la branche « data » en un seul commit (l'historique ne grossit jamais).
set -euo pipefail
cd out
SNAP="snapshot-$(date +%s)-$$"
git checkout -q --orphan "$SNAP"
git add -A
if git diff --cached --quiet; then echo "Rien à publier"; exit 0; fi
git commit -q -m "${1:-Mise à jour}"
git push -q -f origin "$SNAP":data
echo "Publié sur la branche data"
