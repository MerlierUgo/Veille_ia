"""Outils partagés : config, HTTP, logs, Gemini, normalisation de texte."""
from __future__ import annotations

import json
import logging
import os
import re
import time
from datetime import datetime, timezone
from pathlib import Path

import requests
import yaml

ROOT = Path(__file__).resolve().parent
OUT_DIR = Path(os.environ.get("OUT_DIR", ROOT.parent / "out")).resolve()

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)-7s %(message)s", datefmt="%H:%M:%S")
log = logging.getLogger("veille")

UA = "veille-ia/1.0 (personal research digest; +https://github.com)"
SESSION = requests.Session()
SESSION.headers.update({"User-Agent": UA})


def load_config() -> dict:
    with open(ROOT / "config.yaml", encoding="utf-8") as f:
        return yaml.safe_load(f)


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def http_get(url: str, *, params=None, timeout=25, retries=2, backoff=3.0, **kw) -> requests.Response | None:
    """GET tolérant : renvoie None au lieu de lever une exception."""
    for attempt in range(retries + 1):
        try:
            r = SESSION.get(url, params=params, timeout=timeout, **kw)
            if r.status_code == 429 and attempt < retries:
                time.sleep(backoff * (attempt + 2))
                continue
            if r.ok:
                return r
            log.warning("HTTP %s sur %s", r.status_code, url)
            return None
        except requests.RequestException as e:
            if attempt < retries:
                time.sleep(backoff)
                continue
            log.warning("Échec réseau sur %s : %s", url, e)
    return None


def clean_html(text: str | None, limit: int | None = None) -> str:
    if not text:
        return ""
    text = re.sub(r"<[^>]+>", " ", text)
    text = re.sub(r"&nbsp;|&#160;", " ", text)
    text = re.sub(r"&amp;", "&", text)
    text = re.sub(r"&quot;|&#34;", '"', text)
    text = re.sub(r"&#39;|&apos;", "'", text)
    text = re.sub(r"&lt;", "<", text)
    text = re.sub(r"&gt;", ">", text)
    text = re.sub(r"\s+", " ", text).strip()
    if limit and len(text) > limit:
        text = text[: limit].rsplit(" ", 1)[0] + "…"
    return text


def keyword_score(text: str, keywords: list[str]) -> int:
    t = text.lower()
    return sum(1 for k in keywords if re.search(r"\b" + re.escape(k.lower()) + r"\b", t))


def write_json(path: Path, data) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding="utf-8")


# ── Gemini ───────────────────────────────────────────────────
GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"


def gemini(prompt: str, *, model: str, json_mode: bool = False, temperature: float = 0.4,
           max_tokens: int = 8192, timeout: int = 180) -> str | None:
    """Appel simple à l'API Gemini. Renvoie le texte, ou None si indisponible."""
    key = os.environ.get("GEMINI_API_KEY")
    if not key:
        log.warning("GEMINI_API_KEY absente : étape LLM ignorée")
        return None
    body = {
        "contents": [{"role": "user", "parts": [{"text": prompt}]}],
        "generationConfig": {"temperature": temperature, "maxOutputTokens": max_tokens},
    }
    if json_mode:
        body["generationConfig"]["responseMimeType"] = "application/json"
    for attempt in range(3):
        try:
            r = SESSION.post(GEMINI_URL.format(model=model), json=body, timeout=timeout,
                             headers={"x-goog-api-key": key, "Content-Type": "application/json"})
            if r.status_code in (429, 500, 503) and attempt < 2:
                log.info("Gemini %s, nouvel essai dans %ss", r.status_code, 15 * (attempt + 1))
                time.sleep(15 * (attempt + 1))
                continue
            if not r.ok:
                log.warning("Gemini HTTP %s : %s", r.status_code, r.text[:300])
                return None
            data = r.json()
            parts = data["candidates"][0]["content"]["parts"]
            return "".join(p.get("text", "") for p in parts).strip()
        except (requests.RequestException, KeyError, IndexError, ValueError) as e:
            log.warning("Gemini erreur : %s", e)
            if attempt < 2:
                time.sleep(10)
    return None
