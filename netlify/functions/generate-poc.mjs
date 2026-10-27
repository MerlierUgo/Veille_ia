// Netlify Function : déclenche le workflow GitHub « Générer un POC » pour un papier arXiv.
// La génération elle-même tourne dans GitHub Actions (pas de limite de durée, gratuit).
//
// Variables d'environnement à définir sur Netlify :
//   GITHUB_TOKEN  token « fine-grained » limité à ce dépôt, permission « Actions : Read and write »
//   GITHUB_REPO   ex. "ton-utilisateur/veille-ia"
//   POC_SECRET    un code de ton choix, demandé une fois par la page

const json = (status, body) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

export default async (req) => {
  if (req.method !== "POST") return json(405, { error: "Méthode non autorisée." });

  const { GITHUB_TOKEN, GITHUB_REPO, POC_SECRET } = process.env;
  if (!GITHUB_TOKEN || !GITHUB_REPO || !POC_SECRET) {
    return json(500, { error: "Variables GITHUB_TOKEN, GITHUB_REPO ou POC_SECRET manquantes sur Netlify." });
  }

  let body;
  try { body = await req.json(); } catch { return json(400, { error: "Requête invalide." }); }
  const id = String(body.id || "").trim();
  if (body.secret !== POC_SECRET) return json(401, { error: "Code d'accès incorrect. Il te sera redemandé au prochain essai." });
  if (!/^\d{4}\.\d{4,5}$/.test(id)) return json(400, { error: "Identifiant arXiv invalide." });

  const r = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/actions/workflows/poc.yml/dispatches`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${GITHUB_TOKEN}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "veille-ia",
    },
    body: JSON.stringify({ ref: "main", inputs: { arxiv_id: id } }),
  });

  if (r.status === 204 || r.status === 200) return json(202, { ok: true, id });
  const detail = await r.text();
  console.error("GitHub", r.status, detail);
  return json(502, { error: `GitHub a refusé le lancement (HTTP ${r.status}). Vérifie le token et le nom du dépôt.` });
};
