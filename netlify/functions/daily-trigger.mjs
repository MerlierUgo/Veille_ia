// Fonction planifiée Netlify : déclenche la « Veille quotidienne » chaque matin.
// Plus fiable que le cron de GitHub, qui peut être retardé de plusieurs heures ou sauté.
// Si l'édition du jour existe déjà, le workflow s'arrête de lui-même en quelques secondes.
//
// Utilise les mêmes variables que generate-poc : GITHUB_TOKEN (Actions : Read and write) et GITHUB_REPO.

export default async () => {
  const { GITHUB_TOKEN, GITHUB_REPO } = process.env;
  if (!GITHUB_TOKEN || !GITHUB_REPO) {
    console.error("GITHUB_TOKEN ou GITHUB_REPO manquant dans les variables Netlify");
    return;
  }
  const r = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/actions/workflows/daily.yml/dispatches`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${GITHUB_TOKEN}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "veille-ia",
    },
    body: JSON.stringify({ ref: "main", inputs: { force: "false" } }), // l'API n'accepte que des chaînes
  });
  if (r.status === 204 || r.status === 200) {
    console.log(`Veille quotidienne déclenchée sur ${GITHUB_REPO}`);
  } else {
    console.error(`GitHub a refusé le déclenchement (HTTP ${r.status}) : ${await r.text()}`);
  }
};

// Heure UTC : 4h05 = 5h05 à Bruxelles en hiver, 6h05 en été.
export const config = { schedule: "5 4 * * *" };