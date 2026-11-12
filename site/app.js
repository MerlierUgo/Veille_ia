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

  // ── Langue (FR / EN) ─────────────────────────────────
  // ?lang=en force la langue ; sinon le dernier choix mémorisé ; sinon le français.
  let LANG = ["fr", "en"].includes(params.get("lang")) ? params.get("lang")
    : store.get("veille-lang") === "en" ? "en" : "fr";
  const LOCALE = () => (LANG === "en" ? "en-GB" : "fr-FR");

  const I18N = {
    fr: {
      loading: "Chargement de l'édition…",
      edition: "Édition",
      archiveAria: "Choisir une édition précédente",
      tagline: "Intelligence artificielle, recherche et outils — l'édition du matin",
      tldrH: "L'essentiel en cinq minutes",
      newsH: "Actualités",
      videosH: "À regarder",
      papersH: "Prépublications du jour",
      papersNote: "Tendances Hugging Face et nouveautés arXiv proches de tes sujets.",
      classicsH: "Les classiques",
      classicsNote: "Les papiers fondateurs sur lesquels s'appuie la recherche du jour.",
      secretH: "Code d'accès aux POC",
      secretP: "La génération de notebooks est réservée à toi. Saisis le code défini dans la variable <code>POC_SECRET</code> sur Netlify. Il sera mémorisé dans ce navigateur.",
      secretErr: "Saisis le code avant de continuer.",
      cancel: "Annuler",
      save: "Enregistrer",
      toggle: "EN",
      toggleAria: "Switch to English",
      justNow: "à l'instant",
      hoursAgo: (h) => `il y a ${h} h`,
      daysAgo: (j) => `il y a ${j} j`,
      views: (n) => n >= 1e6 ? `${(n / 1e6).toFixed(1).replace(".", ",")} M de vues`
        : n >= 1e3 ? `${Math.round(n / 1e3)} k vues` : n ? `${n} vues` : "",
      editionOf: (d) => `Édition du ${d}`,
      stats: (s, rawN, p, v, time) => `${s} sujets tirés de ${rawN} articles · ${p} prépublications · ${v} vidéos · mise à jour ${time}`,
      tldrEmpty: "Le résumé du jour n'a pas pu être généré. Les sections ci-dessous sont à jour.",
      alsoAt: "Aussi chez ",
      hnDiscussion: "Discussion Hacker News",
      nSources: (n) => `${n} sources`,
      newsEmpty: "Aucune actualité récupérée ce matin. Vérifie les logs de la GitHub Action.",
      videosEmpty: "Pas de nouvelle vidéo sur tes chaînes depuis quelques jours.",
      discuss: "Discuter dans Claude",
      openNotebook: "Ouvrir le notebook",
      pocNotebook: "Notebook POC",
      officialCode: "Code officiel",
      hfTrend: "Tendance Hugging Face",
      newArxiv: "Nouveau sur arXiv",
      votes: (n) => `${n} votes`,
      abstract: "Résumé de l'article",
      papersEmpty: "Aucun papier récupéré ce matin.",
      why: (c) => c.cited_by?.length
        ? `Cité par ${c.cited_by.length} papier${c.cited_by.length > 1 ? "s" : ""} tendance du jour` : "Papier fondateur",
      citations: (n) => `${n} citations`,
      citedBy: (titles) => `Cité par « ${titles.join(" », « ")} »`,
      classicsEmpty: "Pas de recommandation aujourd'hui.",
      copied: (k, url) => `Article copié (${k} k caractères). <a href="${url}" target="_blank" rel="noopener">Ouvrir Claude</a> puis appuie sur Entrée.`,
      prefilledInline: "Prompt et article pré-remplis dans Claude : appuie sur Entrée.",
      prefilledLink: (k) => `Prompt pré-rempli avec le lien vers l'article : appuie sur Entrée. L'article complet (${k} k caractères) est aussi copié, au cas où Claude ne pourrait pas lire le lien.`,
      copyFailed: "Copie impossible : ton navigateur a refusé l'accès au presse-papiers. Réessaie en restant sur cet onglet.",
      pocChecking: "Vérification d'un notebook existant…",
      pocLaunching: "Lancement de la génération…",
      pocNoFunction: "Impossible de joindre la fonction Netlify. Vérifie qu'elle est déployée.",
      pocRunning: "Génération en cours sur GitHub Actions, compte 2 à 5 minutes. Tu peux continuer ta lecture.",
      pocReady: (url) => `Notebook prêt. <a href="${url}" target="_blank" rel="noopener">L'ouvrir dans Colab</a>`,
      pocReadyToast: (url) => `Le notebook POC est prêt. <a href="${url}" target="_blank" rel="noopener">Ouvrir dans Colab</a>`,
      pocFailed: "La génération a échoué.",
      pocRetry: " Tu peux relancer.",
      pocTimeout: "Toujours en cours après 9 minutes. Consulte l'onglet Actions de ton dépôt GitHub.",
      colophon: (d, gen) => `Édition générée automatiquement le ${d} par GitHub Actions` + (gen ? ", résumé rédigé par Gemini." : "."),
      noConfig: "Configuration manquante : renseigne ton dépôt dans site/config.js.",
      noEdition: "Aucune édition trouvée. Lance la GitHub Action « Veille quotidienne » une première fois.",
    },
    en: {
      loading: "Loading edition…",
      edition: "Edition",
      archiveAria: "Choose a previous edition",
      tagline: "Artificial intelligence, research and tools — the morning edition",
      tldrH: "The essentials in five minutes",
      newsH: "News",
      videosH: "Worth watching",
      papersH: "Today's preprints",
      papersNote: "Hugging Face trends and new arXiv papers close to your topics.",
      classicsH: "The classics",
      classicsNote: "The foundational papers today's research builds on.",
      secretH: "POC access code",
      secretP: "Notebook generation is reserved for you. Enter the code set in the <code>POC_SECRET</code> variable on Netlify. It will be remembered in this browser.",
      secretErr: "Enter the code before continuing.",
      cancel: "Cancel",
      save: "Save",
      toggle: "FR",
      toggleAria: "Passer en français",
      justNow: "just now",
      hoursAgo: (h) => `${h}h ago`,
      daysAgo: (j) => `${j}d ago`,
      views: (n) => n >= 1e6 ? `${(n / 1e6).toFixed(1)}M views`
        : n >= 1e3 ? `${Math.round(n / 1e3)}k views` : n ? `${n} views` : "",
      editionOf: (d) => `Edition of ${d}`,
      stats: (s, rawN, p, v, time) => `${s} stories from ${rawN} articles · ${p} preprints · ${v} videos · updated ${time}`,
      tldrEmpty: "Today's summary could not be generated. The sections below are up to date.",
      alsoAt: "Also at ",
      hnDiscussion: "Hacker News discussion",
      nSources: (n) => `${n} sources`,
      newsEmpty: "No news fetched this morning. Check the GitHub Action logs.",
      videosEmpty: "No new video on your channels in the last few days.",
      discuss: "Discuss in Claude",
      openNotebook: "Open notebook",
      pocNotebook: "POC notebook",
      officialCode: "Official code",
      hfTrend: "Trending on Hugging Face",
      newArxiv: "New on arXiv",
      votes: (n) => `${n} votes`,
      abstract: "Abstract",
      papersEmpty: "No papers fetched this morning.",
      why: (c) => c.cited_by?.length
        ? `Cited by ${c.cited_by.length} of today's trending paper${c.cited_by.length > 1 ? "s" : ""}` : "Foundational paper",
      citations: (n) => `${n} citations`,
      citedBy: (titles) => `Cited by “${titles.join("”, “")}”`,
      classicsEmpty: "No recommendations today.",
      copied: (k, url) => `Paper copied (${k}k characters). <a href="${url}" target="_blank" rel="noopener">Open Claude</a> then press Enter.`,
      prefilledInline: "Prompt and paper pre-filled in Claude: press Enter.",
      prefilledLink: (k) => `Prompt pre-filled with a link to the paper: press Enter. The full paper (${k}k characters) is also copied, in case Claude can't read the link.`,
      copyFailed: "Copy failed: your browser denied clipboard access. Try again while staying on this tab.",
      pocChecking: "Checking for an existing notebook…",
      pocLaunching: "Starting generation…",
      pocNoFunction: "Could not reach the Netlify function. Check that it is deployed.",
      pocRunning: "Generating on GitHub Actions, allow 2 to 5 minutes. You can keep reading.",
      pocReady: (url) => `Notebook ready. <a href="${url}" target="_blank" rel="noopener">Open it in Colab</a>`,
      pocReadyToast: (url) => `The POC notebook is ready. <a href="${url}" target="_blank" rel="noopener">Open in Colab</a>`,
      pocFailed: "Generation failed.",
      pocRetry: " You can try again.",
      pocTimeout: "Still running after 9 minutes. Check the Actions tab of your GitHub repository.",
      colophon: (d, gen) => `Edition generated automatically on ${d} by GitHub Actions` + (gen ? ", summary written by Gemini." : "."),
      noConfig: "Missing configuration: set your repository in site/config.js.",
      noEdition: "No edition found. Run the “Veille quotidienne” GitHub Action once.",
    },
  };
  const t = (k) => I18N[LANG][k];

  function applyStatic() {
    document.documentElement.lang = LANG;
    document.querySelectorAll("[data-i18n]").forEach((el) => { el.textContent = t(el.dataset.i18n); });
    document.querySelectorAll("[data-i18n-html]").forEach((el) => { el.innerHTML = t(el.dataset.i18nHtml); });
    document.querySelectorAll("[data-i18n-aria]").forEach((el) => el.setAttribute("aria-label", t(el.dataset.i18nAria)));
    const btn = $("#lang-toggle");
    btn.textContent = t("toggle");
    btn.setAttribute("aria-label", t("toggleAria"));
    btn.title = t("toggleAria");
  }

  function ago(iso) {
    const d = new Date(iso);
    if (isNaN(d)) return "";
    const h = Math.round((Date.now() - d) / 36e5);
    if (h < 1) return t("justNow");
    if (h < 24) return t("hoursAgo")(h);
    return t("daysAgo")(Math.round(h / 24));
  }
  const longDate = (iso) => new Intl.DateTimeFormat(LOCALE(),
    { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(new Date(iso));
  const shortDate = (iso) => new Intl.DateTimeFormat(LOCALE(),
    { weekday: "short", day: "numeric", month: "short" }).format(new Date(iso + "T12:00:00"));

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
  let DATES = null;
  const byRef = {};

  function indexRefs(d) {
    for (const n of d.news) byRef[`news:${n.id}`] = { url: n.url };
    for (const p of d.papers) byRef[`paper:${p.id}`] = { url: `#paper-${p.id}`, local: true };
    for (const v of d.videos) byRef[`video:${v.id}`] = { url: v.url };
  }

  function renderMasthead(d) {
    $("#edition-date").textContent = t("editionOf")(longDate(d.generated_at));
    const s = d.stats || {};
    $("#edition-stats").textContent = t("stats")(
      s.stories ?? d.news.length, s.raw_news ?? "?", d.papers.length, d.videos.length,
      new Date(d.generated_at).toLocaleTimeString(LOCALE(), { hour: "2-digit", minute: "2-digit" }));
    document.title = `La Veille — ${shortDate(d.date)}`;
  }

  // Les éditions antérieures au bilingue n'ont pas de TL;DR anglais : on retombe sur le français.
  const tldrFor = (d) => (LANG === "en" && d.tldr_en) || d.tldr || {};

  function renderTldr(tl) {
    $("#tldr-headline").textContent = tl.headline || "";
    const pts = tl.points || [];
    $("#tldr-list").innerHTML = pts.length ? pts.map((p) => {
      const ref = p.ref && byRef[p.ref];
      const inner = `<div><h3>${esc(p.title)}</h3><p>${esc(p.text)}</p></div>`;
      const link = ref ? `<a href="${ref.local ? ref.url : safeUrl(ref.url)}"${ref.local ? "" : ' target="_blank" rel="noopener"'}>${inner}</a>` : inner;
      return `<li>${link}</li>`;
    }).join("") : `<li><p class="empty">${esc(t("tldrEmpty"))}</p></li>`;
  }

  function sourcesLine(n) {
    const parts = [];
    if (n.also?.length) parts.push(t("alsoAt") + n.also.map((a) => `<a href="${safeUrl(a.url)}" target="_blank" rel="noopener">${esc(a.source)}</a>`).join(", "));
    if (n.discussion) parts.push(`<a href="${safeUrl(n.discussion)}" target="_blank" rel="noopener">${esc(t("hnDiscussion"))}</a>`);
    return parts.length ? `<div class="sources">${parts.join(" · ")}</div>` : "";
  }
  const byline = (n) => `<div class="byline"><strong>${esc(n.source)}</strong> · ${ago(n.published)}` +
    (n.also?.length ? `<span class="badge">${esc(t("nSources")(n.also.length + 1))}</span>` : "") + `</div>`;

  // Résumé IA dans la langue choisie, sinon l'extrait RSS (éditions plus anciennes ou Gemini indisponible).
  // En anglais, l'extrait RSS (souvent en anglais) passe avant le résumé français.
  const newsSummary = (n) => {
    const s = LANG === "en" ? (n.ai_summary_en || n.summary || n.ai_summary) : (n.ai_summary || n.summary);
    return s ? `<p class="summary">${esc(s)}</p>` : "";
  };

  function renderNews(list) {
    if (!list.length) {
      $("#news-lead").innerHTML = "";
      $("#news-grid").innerHTML = `<p class="empty">${esc(t("newsEmpty"))}</p>`;
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
        <div class="byline"><strong>${esc(v.channel)}</strong> · ${ago(v.published)}${v.views ? " · " + t("views")(v.views) : ""}</div>
      </article>`).join("") : `<p class="empty">${esc(t("videosEmpty"))}</p>`;
  }

  function paperActions(p) {
    const claude = p.fulltext !== undefined
      ? `<button class="btn primary" data-act="claude" data-id="${esc(p.id)}">${esc(t("discuss"))}</button>` : "";
    return `<div class="actions">
        ${claude}
        <button class="btn" data-act="poc" data-id="${esc(p.id)}">${esc(p.notebook ? t("openNotebook") : t("pocNotebook"))}</button>
        <a class="btn ghost" href="${safeUrl(p.url)}" target="_blank" rel="noopener">arXiv</a>
        <a class="btn ghost" href="https://arxiv.org/pdf/${esc(p.id)}" target="_blank" rel="noopener">PDF</a>
        ${p.github ? `<a class="btn ghost" href="${safeUrl(p.github)}" target="_blank" rel="noopener">${esc(t("officialCode"))}</a>` : ""}
      </div><p class="poc-status" id="poc-${esc(p.id)}" hidden></p>`;
  }

  function renderPapers(list) {
    $("#paper-list").innerHTML = list.length ? list.map((p) => `<article class="paper" id="paper-${esc(p.id)}">
        <div class="byline"><strong>${esc(p.origin === "hf" ? t("hfTrend") : t("newArxiv"))}</strong> · ${esc(p.id)}
          ${p.upvotes ? `<span class="badge">${esc(t("votes")(p.upvotes))}</span>` : ""}</div>
        <h3>${esc(p.title)}</h3>
        <p class="authors">${esc(p.authors)}</p>
        ${p.ai_summary ? `<p class="ai-summary">${esc(p.ai_summary)}</p>` : ""}
        <details><summary>${esc(t("abstract"))}</summary><p>${esc(p.abstract)}</p></details>
        ${paperActions(p)}
      </article>`).join("") : `<p class="empty">${esc(t("papersEmpty"))}</p>`;
  }

  function renderClassics(list) {
    $("#classic-list").innerHTML = list.length ? list.map((c) => `<article class="classic" id="paper-${esc(c.id)}">
        <p class="why">${esc(t("why")(c))}</p>
        <h3>${esc(c.title)}</h3>
        <div class="byline">${esc(c.authors)} · ${esc(c.year)}${c.citations ? ` · ${esc(t("citations")(Number(c.citations).toLocaleString(LOCALE())))}` : ""}</div>
        ${c.cited_by?.length ? `<p class="cited">${esc(t("citedBy")(c.cited_by))}</p>` : ""}
        ${paperActions(c)}
      </article>`).join("") : `<p class="empty">${esc(t("classicsEmpty"))}</p>`;
  }

  // ── Discuter dans Claude ─────────────────────────────
  // claude.ai/new?q=... pré-remplit le message : il suffit d'appuyer sur Entrée. L'URL a une taille
  // limitée, donc l'article n'y est inclus en entier que s'il est court ; sinon le prompt pointe vers
  // le texte intégral sur GitHub (dépôt public, lisible par Claude) et l'article reste dans le presse-papiers.
  const CLAUDE_URL_MAX = 12000;
  const RAW = `https://raw.githubusercontent.com/${CFG.repo}/${CFG.dataBranch || "data"}`;

  const CLAUDE_PROMPT_FR = (p, source) =>
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

  const CLAUDE_PROMPT_EN = (p, source) =>
`You are a senior machine learning researcher and an excellent teacher. You are guiding me through reading a scientific paper.

## Who I am
Mid-level data scientist (3-4 years of experience). Comfortable with Python, PyTorch, scikit-learn, statistics and deep learning fundamentals (backprop, CNNs, transformers, attention, fine-tuning). Less comfortable with very formal proofs and niche subfields. I read to understand in depth and to know whether I can use it, not to skim.

## The paper
"${p.title}"${p.authors ? ` — ${p.authors}` : ""}
arXiv: https://arxiv.org/abs/${p.id}
${source}

## What I expect from your first answer
1. **In one sentence**: the problem tackled and the answer provided.
2. **The intuition**: the core idea explained simply, with an analogy or a small example if it helps. No gratuitous jargon.
3. **The context**: what existed before, what was falling short, and the 2-3 works the paper builds on.
4. **The method step by step**: the architecture or algorithm, going through the key equations. For each equation, explain what each term represents and why it has this form. If short PyTorch pseudo-code makes things clearer, include it.
5. **The results**: key numbers, baselines, datasets. Are they convincing?
6. **Critical view**: limitations, strong assumptions, what isn't tested, risks of over-interpretation.
7. **For me in practice**: when to use it, implementation cost, available code or models, and a small experiment I could reproduce in an afternoon.
8. **Going further**: 3 questions to check that I understood, and 2-3 complementary readings.

## Rules
- Answer in English.
- Ground your answer in the paper's text. Clearly separate what the paper says from your own opinion, and say so when information isn't in it rather than making it up.
- Use headings, and LaTeX for maths.
- Then wait for my questions. If I ask for code, write it in PyTorch, with comments.`;

  const claudePrompt = (p, source) => (LANG === "en" ? CLAUDE_PROMPT_EN : CLAUDE_PROMPT_FR)(p, source);
  const claudeUrl = (q) => `https://claude.ai/new?q=${encodeURIComponent(q)}`;

  async function copyText(textPromise) {
    // ClipboardItem accepte une promesse : la copie reste liée au clic même si le fetch prend du temps.
    if (window.ClipboardItem && navigator.clipboard?.write) {
      const blob = textPromise.then((x) => new Blob([x], { type: "text/plain" }));
      await navigator.clipboard.write([new ClipboardItem({ "text/plain": blob })]);
      return textPromise;
    }
    const x = await textPromise;
    await navigator.clipboard.writeText(x);
    return x;
  }

  async function discussInClaude(id, btn) {
    const all = [...DATA.papers, ...DATA.classics];
    const p = all.find((x) => x.id === id);
    btn.disabled = true;
    let hasFull = false;
    const en = LANG === "en";
    const bodyPromise = fetch(`${BASE}/data/papers/${id}.md`)
      .then((r) => { hasFull = r.ok; return r.ok ? r.text() : `${p.title}\n\n${p.abstract}`; });
    const textPromise = bodyPromise.then((body) => claudePrompt(p, en
      ? `\n=== PAPER TEXT ===\n${body}\n=== END OF TEXT ===`
      : `\n=== TEXTE DE L'ARTICLE ===\n${body}\n=== FIN DU TEXTE ===`));
    try {
      const text = await copyText(textPromise);
      const linked = claudePrompt(p, hasFull
        ? (en
          ? `Full text (Markdown): ${RAW}/data/papers/${id}.md\nStart by reading this full text (otherwise, the PDF: https://arxiv.org/pdf/${id}).`
          : `Texte intégral (Markdown) : ${RAW}/data/papers/${id}.md\nCommence par lire ce texte intégral (à défaut, le PDF : https://arxiv.org/pdf/${id}).`)
        : (en ? `Start by reading the paper: https://arxiv.org/pdf/${id}` : `Commence par lire l'article : https://arxiv.org/pdf/${id}`));
      const inline = claudeUrl(text);
      const url = inline.length <= CLAUDE_URL_MAX ? inline : claudeUrl(linked);
      const win = window.open(url, "_blank"); // « noopener » renverrait toujours null
      if (win) win.opener = null;
      const k = Math.round(text.length / 1000);
      toast(!win ? t("copied")(k, esc(url))
        : url === inline ? t("prefilledInline") : t("prefilledLink")(k), 9000);
    } catch (e) {
      console.error(e);
      toast(t("copyFailed"));
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
    setStatus(id, t("pocChecking"));
    if (await exists(`notebooks/${id}.ipynb`)) {
      setStatus(id, "");
      btn.disabled = false;
      btn.textContent = t("openNotebook");
      window.open(COLAB(id), "_blank", "noopener");
      return;
    }
    let secret = store.get("veille-poc-secret");
    if (!secret) {
      secret = await askSecret();
      if (!secret) { setStatus(id, ""); btn.disabled = false; return; }
      store.set("veille-poc-secret", secret);
    }
    setStatus(id, t("pocLaunching"));
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
      setStatus(id, msg ? esc(msg) : t("pocNoFunction"), true);
      btn.disabled = false;
      return;
    }
    setStatus(id, t("pocRunning"));
    const started = Date.now();
    // Le bouton peut avoir été recréé entre-temps (changement de langue) : on le retrouve par son id.
    const pocBtn = () => document.querySelector(`button[data-act="poc"][data-id="${CSS.escape(id)}"]`) || btn;
    const tick = async () => {
      if (await exists(`notebooks/${id}.ipynb`)) {
        setStatus(id, t("pocReady")(COLAB(id)));
        const b = pocBtn();
        b.disabled = false;
        b.textContent = t("openNotebook");
        toast(t("pocReadyToast")(COLAB(id)), 10000);
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
          setStatus(id, `${esc(info.error || t("pocFailed"))}${t("pocRetry")}`, true);
          pocBtn().disabled = false;
          return;
        }
      }
      if (Date.now() - started > 9 * 60e3) {
        setStatus(id, t("pocTimeout"), true);
        pocBtn().disabled = false;
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
  function render(d) {
    renderMasthead(d);
    renderTldr(tldrFor(d));
    renderNews(d.news || []);
    renderVideos(d.videos || []);
    renderPapers(d.papers || []);
    renderClassics(d.classics || []);
    $("#colophon-text").textContent = t("colophon")(longDate(d.generated_at), tldrFor(d).generated);
  }

  function renderArchive() {
    if (!DATES) return;
    const sel = $("#archive-select");
    sel.innerHTML = DATES.map((d) => `<option value="${esc(d)}"${d === DATA.date ? " selected" : ""}>${esc(shortDate(d))}</option>`).join("");
  }

  async function load(date) {
    const d = await getJSON(date ? `data/archive/${date}.json` : "data/latest.json");
    DATA = d;
    indexRefs(d);
    render(d);
  }

  $("#lang-toggle").addEventListener("click", () => {
    LANG = LANG === "fr" ? "en" : "fr";
    store.set("veille-lang", LANG);
    const url = new URL(location.href);
    if (url.searchParams.has("lang")) { url.searchParams.set("lang", LANG); history.replaceState(null, "", url); }
    applyStatic();
    if (DATA) { render(DATA); renderArchive(); }
  });

  async function init() {
    applyStatic();
    if (!params.get("base") && (!CFG.repo || CFG.repo.startsWith("TON_UTILISATEUR"))) {
      $("#edition-date").textContent = t("noConfig");
      return;
    }
    try {
      await load(params.get("date"));
    } catch (e) {
      console.error(e);
      $("#edition-date").textContent = t("noEdition");
      return;
    }
    try {
      DATES = (await getJSON("data/index.json")).dates;
      renderArchive();
      const sel = $("#archive-select");
      sel.onchange = () => {
        const url = new URL(location.href);
        url.searchParams.set("date", sel.value);
        location.href = url.toString();
      };
    } catch { $(".archive").hidden = true; }
  }

  init();
})();
