// Tout ce qui sort vers l'API TVMaze passe par ici.
// Un seul point de sortie, donc un seul endroit a remplacer dans les tests.
const BASE = "https://api.tvmaze.com";
const DUREE_CACHE = 10 * 60 * 1000; // 10 minutes
const cache = new Map();

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

  // Les episodes d'une serie ne changent pas d'une minute a l'autre :
  // on garde la reponse en memoire pour ne pas rappeler TVMaze a chaque
  // affichage de la liste. Passe par tvmaze.episodes, donc testable.
  async episodesEnCache(id) {
    const entree = cache.get(id);
    if (entree && Date.now() - entree.date < DUREE_CACHE) {
      return entree.episodes;
    }
    const episodes = await tvmaze.episodes(id);
    cache.set(id, { episodes, date: Date.now() });
    return episodes;
  },

  viderCache() {
    cache.clear();
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
