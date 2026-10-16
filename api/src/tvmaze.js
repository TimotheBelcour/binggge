// Tout ce qui sort vers l'API TVMaze passe par ici.
// Un seul point de sortie, donc un seul endroit a remplacer dans les tests.
const BASE = "https://api.tvmaze.com";

// Le synopsis de TVMaze arrive en HTML : on le reduit a du texte avant de le
// transmettre. On ne renvoie jamais tel quel ce qu'une API tierce nous donne.
function texteBrut(html) {
  if (!html) return null;
  return html
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim();
}

async function recuperer(chemin) {
  const reponse = await fetch(`${BASE}${chemin}`);
  if (!reponse.ok) {
    throw Object.assign(new Error("TVMaze ne repond pas"), { statut: reponse.status });
  }
  return reponse.json();
}

const tvmaze = {
  // Recherche : on ne garde que les champs utiles au front
  async rechercher(q) {
    const resultats = await recuperer(`/search/shows?q=${encodeURIComponent(q)}`);
    return resultats.map(({ show }) => tvmaze.resumerSerie(show));
  },

  async fiche(id) {
    const show = await recuperer(`/shows/${encodeURIComponent(id)}`);
    return {
      ...tvmaze.resumerSerie(show),
      summary: texteBrut(show.summary),
      genres: show.genres || [],
      status: show.status || null,
      rating: show.rating ? show.rating.average : null,
    };
  },

  async episodes(id) {
    const episodes = await recuperer(`/shows/${encodeURIComponent(id)}/episodes`);
    return episodes.map((e) => ({
      id: e.id,
      season: e.season,
      number: e.number,
      name: e.name,
    }));
  },

  resumerSerie(show) {
    return {
      id: show.id,
      title: show.name,
      year: show.premiered ? show.premiered.slice(0, 4) : null,
      image: show.image ? show.image.medium : null,
    };
  },
};

module.exports = tvmaze;
module.exports.texteBrut = texteBrut;
