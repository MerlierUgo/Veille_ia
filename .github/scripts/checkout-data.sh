#!/usr/bin/env bash
# Récupère la branche « data » dans ./out (ou la crée au premier lancement).
set -euo pipefail
git config --global user.name "veille-bot"
git config --global user.email "41898282+github-actions[bot]@users.noreply.github.com"
if git ls-remote --exit-code --heads origin data >/dev/null 2>&1; then
  git fetch -q origin data:refs/remotes/origin/data
  git worktree add -q -B data out origin/data
else
  echo "Branche data absente : création"
  git worktree add -q --orphan -b data out
fi
