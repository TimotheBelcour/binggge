// API de suivi de series - support de cours Git & deploiement
const express = require("express");

const app = express();
app.use(express.json());

// Le port est configurable via l'environnement (utile en Docker / CI)
const PORT = process.env.PORT || 3000;

// Verification de sante, utilisee par le pipeline et par Docker
app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

// Recherche des series via l'API TVMaze
// On ne renvoie jamais la reponse brute de l'API tierce : on filtre les champs utiles
app.get("/shows", async (req, res) => {
  const q = req.query.q || "";
  const reponse = await fetch(`https://api.tvmaze.com/search/shows?q=${encodeURIComponent(q)}`);
  const resultats = await reponse.json();

  const series = resultats.map(({ show }) => ({
    id: show.id,
    title: show.name,
    year: show.premiered ? show.premiered.slice(0, 4) : null,
    image: show.image ? show.image.medium : null,
  }));

  res.json(series);
});

// Liste de suivi : vide pour l'instant, la base arrive en seance 2
app.get("/watchlist", (req, res) => {
  res.json([]);
});

// Demarrage du serveur (ignore quand le fichier est importe par les tests)
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`binggge-api demarre sur le port ${PORT}`);
  });
}

module.exports = app;
