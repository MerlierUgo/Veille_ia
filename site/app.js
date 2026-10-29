(() => {
  "use strict";

  const CFG = window.VEILLE_CONFIG || {};
  const params = new URLSearchParams(location.search);
  // ?base=... permet de tester en local avec un dossier de données (ex. ?base=/out)
  const BASE = params.get("base") || `https://raw.githubusercontent.com/${CFG.repo}/${CFG.dataBranch || "data"}`;
  const API = `https://api.github.com/repos/${CFG.repo}/contents`;
  const COLAB = (id) => `https://colab.research.google.com/github/${CFG.repo}/blob/${CFG.dataBranch || "data"}/notebooks/${id}.ipynb`;
  const $ = (s) => document.querySelector(s);

  // ── Utilitaires ──────────────────────────────────────
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const safeUrl = (u) => (/^https?:\/\//i.test(u || "") ? esc(u) : "#");
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch { /* stockage indisponible */ } },
  };

  function ago(iso) {
    const d = new Date(iso);
    if (isNaN(d)) return "";
    const h = Math.round((Date.now() - d) / 36e5);
    if (h < 1) return "à l'instant";
    if (h < 24) return `il y a ${h} h`;
    const j = Math.round(h / 24);
    return `il y a ${j} j`;
  }
  const longDate = (iso) => new Intl.DateTimeFormat("fr-FR",
    { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(new Date(iso));
  const shortDate = (iso) => new Intl.DateTimeFormat("fr-FR",
    { weekday: "short", day: "numeric", month: "short" }).format(new Date(iso + "T12:00:00"));
  const fmtViews = (n) => n >= 1e6 ? `${(n / 1e6).toFixed(1).replace(".", ",")} M de vues`
    : n >= 1e3 ? `${Math.round(n / 1e3)} k vues` : n ? `${n} vues` : "";

  let toastTimer;
  function toast(html, ms = 4500) {
    const el = $("#toast");
    el.innerHTML = html;
    el.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove("show"), ms);
  }

  async function getJSON(path) {
    const r = await fetch(`${BASE}/${path}`, { cache: "no-cache" });
    if (!r.ok) throw new Error(`${r.status} sur ${path}`);
    return r.json();
  }

  // ── Rendu ────────────────────────────────────────────
  let DATA = null;
  const byRef = {};

  function indexRefs(d) {
    for (const n of d.news) byRef[`news:${n.id}`] = { url: n.url };
    for (const p of d.papers) byRef[`paper:${p.id}`] = { url: `#paper-${p.id}`, local: true };
    for (const v of d.videos) byRef[`video:${v.id}`] = { url: v.url };
  }

  function renderMasthead(d) {
    $("#edition-date").textContent = `Édition du ${longDate(d.generated_at)}`;
    const s = d.stats || {};
    $("#edition-stats").textContent =
      `${s.stories ?? d.news.length} sujets tirés de ${s.raw_news ?? "?"} articles · ` +
      `${d.papers.length} prépublications · ${d.videos.length} vidéos · ` +
      `mise à jour ${new Date(d.generated_at).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}`;
    document.title = `La Veille — ${shortDate(d.date)}`;
  }

  function renderTldr(t) {
    $("#tldr-headline").textContent = t.headline || "";
    const pts = t.points || [];
    $("#tldr-list").innerHTML = pts.length ? pts.map((p) => {
      const ref = p.ref && byRef[p.ref];
      const inner = `<div><h3>${esc(p.title)}</h3><p>${esc(p.text)}</p></div>`;
      const link = ref ? `<a href="${ref.local ? ref.url : safeUrl(ref.url)}"${ref.local ? "" : ' target="_blank" rel="noopener"'}>${inner}</a>` : inner;
      return `<li>${link}</li>`;
    }).join("") : `<li><p class="empty">Le résumé du jour n'a pas pu être généré. Les sections ci-dessous sont à jour.</p></li>`;
  }

  function sourcesLine(n) {
    const parts = [];
    if (n.also?.length) parts.push("Aussi chez " + n.also.map((a) => `<a href="${safeUrl(a.url)}" target="_blank" rel="noopener">${esc(a.source)}</a>`).join(", "));
    if (n.discussion) parts.push(`<a href="${safeUrl(n.discussion)}" target="_blank" rel="noopener">Discussion Hacker News</a>`);
    return parts.length ? `<div class="sources">${parts.join(" · ")}</div>` : "";
  }
  const byline = (n) => `<div class="byline"><strong>${esc(n.source)}</strong> · ${ago(n.published)}` +
    (n.also?.length ? `<span class="badge">${n.also.length + 1} sources</span>` : "") + `</div>`;

  // Résumé IA s'il existe, sinon l'extrait RSS (éditions plus anciennes ou Gemini indisponible).
  const newsSummary = (n) => n.ai_summary
    ? `<p class="summary">${esc(n.ai_summary)}</p>`
    : n.summary ? `<p class="summary">${esc(n.summary)}</p>` : "";

  function renderNews(list) {
    if (!list.length) {
      $("#news-lead").innerHTML = "";
      $("#news-grid").innerHTML = `<p class="empty">Aucune actualité récupérée ce matin. Vérifie les logs de la GitHub Action.</p>`;
      return;
    }
    const [lead, ...rest] = list;
    const lc = $("#news-lead");
    lc.classList.toggle("no-image", !lead.image);
    lc.innerHTML = `<div>${byline(lead)}
        <h3><a href="${safeUrl(lead.url)}" target="_blank" rel="noopener">${esc(lead.title)}</a></h3>
        ${newsSummary(lead)}${sourcesLine(lead)}</div>` +
      (lead.image ? `<figure><img src="${safeUrl(lead.image)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.closest('figure').remove();document.querySelector('#news-lead').classList.add('no-image')"></figure>` : "");
    $("#news-grid").innerHTML = rest.map((n) => `<article class="story">${byline(n)}
        <h3><a href="${safeUrl(n.url)}" target="_blank" rel="noopener">${esc(n.title)}</a></h3>
        ${newsSummary(n)}${sourcesLine(n)}</article>`).join("");
  }

  function renderVideos(list) {
    $("#video-grid").innerHTML = list.length ? list.map((v) => `<article class="video">
        <a href="${safeUrl(v.url)}" target="_blank" rel="noopener">
          <div class="thumb"><img src="${safeUrl(v.thumbnail)}" alt="" loading="lazy" onerror="this.remove()"></div>
          <h3>${esc(v.title)}</h3></a>
        <div class="byline"><strong>${esc(v.channel)}</strong> · ${ago(v.published)}${v.views ? " · " + fmtViews(v.views) : ""}</div>
      </article>`).join("") : `<p class="empty">Pas de nouvelle vidéo sur tes chaînes depuis quelques jours.</p>`;
  }

  function paperActions(p) {
    const claude = p.fulltext !== undefined
      ? `<button class="btn primary" data-act="claude" data-id="${esc(p.id)}">Discuter dans Claude</button>` : "";
    return `<div class="actions">
        ${claude}
        <button class="btn" data-act="poc" data-id="${esc(p.id)}">${p.notebook ? "Ouvrir le notebook" : "Notebook POC"}</button>
        <a class="btn ghost" href="${safeUrl(p.url)}" target="_blank" rel="noopener">arXiv</a>
        <a class="btn ghost" href="https://arxiv.org/pdf/${esc(p.id)}" target="_blank" rel="noopener">PDF</a>
        ${p.github ? `<a class="btn ghost" href="${safeUrl(p.github)}" target="_blank" rel="noopener">Code officiel</a>` : ""}
      </div><p class="poc-status" id="poc-${esc(p.id)}" hidden></p>`;
  }

  function renderPapers(list) {
    $("#paper-list").innerHTML = list.length ? list.map((p) => `<article class="paper" id="paper-${esc(p.id)}">
        <div class="byline"><strong>${p.origin === "hf" ? "Tendance Hugging Face" : "Nouveau sur arXiv"}</strong> · ${esc(p.id)}
          ${p.upvotes ? `<span class="badge">${p.upvotes} votes</span>` : ""}</div>
        <h3>${esc(p.title)}</h3>
        <p class="authors">${esc(p.authors)}</p>
        ${p.ai_summary ? `<p class="ai-summary">${esc(p.ai_summary)}</p>` : ""}
        <details><summary>Résumé de l'article</summary><p>${esc(p.abstract)}</p></details>
        ${paperActions(p)}
      </article>`).join("") : `<p class="empty">Aucun papier récupéré ce matin.</p>`;
  }

  function renderClassics(list) {
    $("#classic-list").innerHTML = list.length ? list.map((c) => `<article class="classic" id="paper-${esc(c.id)}">
        <p class="why">${esc(c.why)}</p>
        <h3>${esc(c.title)}</h3>
        <div class="byline">${esc(c.authors)} · ${esc(c.year)}${c.citations ? ` · ${Number(c.citations).toLocaleString("fr-FR")} citations` : ""}</div>
        ${c.cited_by?.length ? `<p class="cited">Cité par « ${c.cited_by.map(esc).join(" », « ")} »</p>` : ""}
        ${paperActions(c)}
      </article>`).join("") : `<p class="empty">Pas de recommandation aujourd'hui.</p>`;
  }

  // ── Discuter dans Claude ─────────────────────────────
  // claude.ai/new?q=... pré-remplit le message : il suffit d'appuyer sur Entrée. L'URL a une taille
  // limitée, donc l'article n'y est inclus en entier que s'il est court ; sinon le prompt pointe vers
  // le texte intégral sur GitHub (dépôt public, lisible par Claude) et l'article reste dans le presse-papiers.
  const CLAUDE_URL_MAX = 12000;
  const RAW = `https://raw.githubusercontent.com/${CFG.repo}/${CFG.dataBranch || "data"}`;

  const CLAUDE_PROMPT = (p, source) =>
`Tu es un chercheur senior en machine learning et un excellent pédagogue. Tu m'accompagnes dans la lecture d'un article scientifique.

## Qui je suis
Data scientist medior (3-4 ans d'expérience). À l'aise avec Python, PyTorch, scikit-learn, les statistiques et les bases du deep learning (backprop, CNN, transformers, attention, fine-tuning). Moins à l'aise avec les preuves très formelles et les sous-domaines pointus. Je lis pour comprendre en profondeur et savoir si je peux m'en servir, pas pour survoler.

## L'article
« ${p.title} »${p.authors ? ` — ${p.authors}` : ""}
arXiv : https://arxiv.org/abs/${p.id}
${source}

## Ce que j'attends de ta première réponse
1. **En une phrase** : le problème attaqué et la réponse apportée.
2. **L'intuition** : l'idée centrale expliquée simplement, avec une analogie ou un petit exemple si ça aide. Pas de jargon gratuit.
3. **Le contexte** : ce qui existait avant, ce qui coinçait, et les 2-3 travaux sur lesquels l'article s'appuie.
4. **La méthode pas à pas** : l'architecture ou l'algorithme, en reprenant les équations clés. Pour chaque équation, dis ce que représente chaque terme et pourquoi elle a cette forme. Si un pseudo-code PyTorch rend les choses plus claires, mets-en un court.
5. **Les résultats** : chiffres clés, baselines, datasets. Sont-ils convaincants ?
6. **Regard critique** : limites, hypothèses fortes, ce qui n'est pas testé, risques de surinterprétation.
7. **Pour moi en pratique** : dans quels cas l'utiliser, coût de mise en œuvre, code ou modèles disponibles, et une petite expérience que je pourrais reproduire en une après-midi.
8. **Pour aller plus loin** : 3 questions à me poser pour vérifier que j'ai compris, et 2-3 lectures complémentaires.

## Règles
- Réponds en français, garde les termes techniques anglais usuels (loss, embedding, attention…).
- Appuie-toi sur le texte de l'article. Distingue clairement ce que dit l'article de ton propre avis, et dis-le si une information n'y figure pas plutôt que de l'inventer.
- Utilise des titres et du LaTeX pour les maths.
- Ensuite, attends mes questions. Si je te demande du code, écris-le en PyTorch, commenté.`;

  const claudeUrl = (q) => `https://claude.ai/new?q=${encodeURIComponent(q)}`;

  async function copyText(textPromise) {
    // ClipboardItem accepte une promesse : la copie reste liée au clic même si le fetch prend du temps.
    if (window.ClipboardItem && navigator.clipboard?.write) {
      const blob = textPromise.then((t) => new Blob([t], { type: "text/plain" }));
      await navigator.clipboard.write([new ClipboardItem({ "text/plain": blob })]);
      return textPromise;
    }
    const t = await textPromise;
    await navigator.clipboard.writeText(t);
    return t;
  }

  async function discussInClaude(id, btn) {
    const all = [...DATA.papers, ...DATA.classics];
    const p = all.find((x) => x.id === id);
    btn.disabled = true;
    let hasFull = false;
    const bodyPromise = fetch(`${BASE}/data/papers/${id}.md`)
      .then((r) => { hasFull = r.ok; return r.ok ? r.text() : `${p.title}\n\n${p.abstract}`; });
    const textPromise = bodyPromise.then((body) =>
      CLAUDE_PROMPT(p, `\n=== TEXTE DE L'ARTICLE ===\n${body}\n=== FIN DU TEXTE ===`));
    try {
      const text = await copyText(textPromise);
      const linked = CLAUDE_PROMPT(p, hasFull
        ? `Texte intégral (Markdown) : ${RAW}/data/papers/${id}.md\nCommence par lire ce texte intégral (à défaut, le PDF : https://arxiv.org/pdf/${id}).`
        : `Commence par lire l'article : https://arxiv.org/pdf/${id}`);
      const inline = claudeUrl(text);
      const url = inline.length <= CLAUDE_URL_MAX ? inline : claudeUrl(linked);
      const win = window.open(url, "_blank"); // « noopener » renverrait toujours null
      if (win) win.opener = null;
      const k = Math.round(text.length / 1000);
      toast(!win
        ? `Article copié (${k} k caractères). <a href="${esc(url)}" target="_blank" rel="noopener">Ouvrir Claude</a> puis appuie sur Entrée.`
        : url === inline
          ? "Prompt et article pré-remplis dans Claude : appuie sur Entrée."
          : `Prompt pré-rempli avec le lien vers l'article : appuie sur Entrée. L'article complet (${k} k caractères) est aussi copié, au cas où Claude ne pourrait pas lire le lien.`, 9000);
    } catch (e) {
      console.error(e);
      toast("Copie impossible : ton navigateur a refusé l'accès au presse-papiers. Réessaie en restant sur cet onglet.");
    } finally {
      btn.disabled = false;
    }
  }

  // ── Notebook POC ─────────────────────────────────────
  async function exists(path) {
    try {
      const r = await fetch(`${API}/${path}?ref=${CFG.dataBranch || "data"}`, { cache: "no-store" });
      return r.ok ? r : null;
    } catch { return null; }
  }

  function askSecret() {
    return new Promise((resolve) => {
      const dlg = $("#secret-dialog");
      const input = $("#secret-input");
      const err = $("#secret-error");
      input.value = "";
      err.hidden = true;
      input.oninput = () => { err.hidden = true; };
      $("#secret-ok").onclick = (e) => {
        if (!input.value.trim()) { e.preventDefault(); err.hidden = false; input.focus(); }
      };
      dlg.onclose = () => resolve(dlg.returnValue === "ok" ? input.value.trim() : null);
      dlg.showModal();
    });
  }

  function setStatus(id, text, isError = false) {
    const el = document.getElementById(`poc-${id}`);
    if (!el) return;
    el.hidden = !text;
    el.classList.toggle("error", isError);
    el.innerHTML = text;
  }

  async function poc(id, btn) {
    btn.disabled = true;
    setStatus(id, "Vérification d'un notebook existant…");
    if (await exists(`notebooks/${id}.ipynb`)) {
      setStatus(id, "");
      btn.disabled = false;
      btn.textContent = "Ouvrir le notebook";
      window.open(COLAB(id), "_blank", "noopener");
      return;
    }
    let secret = store.get("veille-poc-secret");
    if (!secret) {
      secret = await askSecret();
      if (!secret) { setStatus(id, ""); btn.disabled = false; return; }
      store.set("veille-poc-secret", secret);
    }
    setStatus(id, "Lancement de la génération…");
    let r;
    try {
      r = await fetch("/.netlify/functions/generate-poc", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, secret }),
      });
    } catch {
      r = null;
    }
    if (!r || !r.ok) {
      const msg = r ? (await r.json().catch(() => ({}))).error : null;
      if (r?.status === 401) store.set("veille-poc-secret", "");
      setStatus(id, msg || "Impossible de joindre la fonction Netlify. Vérifie qu'elle est déployée.", true);
      btn.disabled = false;
      return;
    }
    setStatus(id, "Génération en cours sur GitHub Actions, compte 2 à 5 minutes. Tu peux continuer ta lecture.");
    const started = Date.now();
    const tick = async () => {
      if (await exists(`notebooks/${id}.ipynb`)) {
        setStatus(id, `Notebook prêt. <a href="${COLAB(id)}" target="_blank" rel="noopener">L'ouvrir dans Colab</a>`);
        btn.disabled = false;
        btn.textContent = "Ouvrir le notebook";
        toast(`Le notebook POC est prêt. <a href="${COLAB(id)}" target="_blank" rel="noopener">Ouvrir dans Colab</a>`, 10000);
        return;
      }
      const err = await exists(`notebooks/${id}.error.json`);
      if (err) {
        let info = null;
        try {
          const b64 = (await err.json()).content.replace(/\n/g, "");
          info = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))));
        } catch { /* fichier illisible */ }
        // On ignore une erreur laissée par une tentative précédente.
        if (info && new Date(info.at).getTime() > started) {
          setStatus(id, `${esc(info.error || "La génération a échoué.")} Tu peux relancer.`, true);
          btn.disabled = false;
          return;
        }
      }
      if (Date.now() - started > 9 * 60e3) {
        setStatus(id, `Toujours en cours après 9 minutes. Consulte l'onglet Actions de ton dépôt GitHub.`, true);
        btn.disabled = false;
        return;
      }
      setTimeout(tick, 20000);
    };
    setTimeout(tick, 45000);
  }

  document.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-act]");
    if (!btn) return;
    if (btn.dataset.act === "claude") discussInClaude(btn.dataset.id, btn);
    if (btn.dataset.act === "poc") poc(btn.dataset.id, btn);
  });

  // ── Chargement ───────────────────────────────────────
  async function load(date) {
    const d = await getJSON(date ? `data/archive/${date}.json` : "data/latest.json");
    DATA = d;
    indexRefs(d);
    renderMasthead(d);
    renderTldr(d.tldr || {});
    renderNews(d.news || []);
    renderVideos(d.videos || []);
    renderPapers(d.papers || []);
    renderClassics(d.classics || []);
    $("#colophon-text").textContent =
      `Édition générée automatiquement le ${longDate(d.generated_at)} par GitHub Actions` +
      (d.tldr?.generated ? ", résumé rédigé par Gemini." : ".");
  }

  async function init() {
    if (!params.get("base") && (!CFG.repo || CFG.repo.startsWith("TON_UTILISATEUR"))) {
      $("#edition-date").textContent = "Configuration manquante : renseigne ton dépôt dans site/config.js.";
      return;
    }
    try {
      await load(params.get("date"));
    } catch (e) {
      console.error(e);
      $("#edition-date").textContent =
        "Aucune édition trouvée. Lance la GitHub Action « Veille quotidienne » une première fois.";
      return;
    }
    try {
      const { dates } = await getJSON("data/index.json");
      const sel = $("#archive-select");
      sel.innerHTML = dates.map((d) => `<option value="${esc(d)}"${d === DATA.date ? " selected" : ""}>${esc(shortDate(d))}</option>`).join("");
      sel.onchange = () => {
        const url = new URL(location.href);
        url.searchParams.set("date", sel.value);
        location.href = url.toString();
      };
    } catch { $(".archive").hidden = true; }
  }

  init();
})();
