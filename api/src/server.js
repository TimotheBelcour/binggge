// API de suivi de series - support de cours Git & deploiement
const express = require("express");
const db = require("./db");

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

// Inscription : un login, et rien de plus (pas de mot de passe, volontairement)
app.post("/register", async (req, res) => {
  const { login } = req.body || {};
  if (!login) {
    return res.status(400).json({ error: "login manquant" });
  }
  try {
    const { rows } = await db.query(
      "INSERT INTO users(login) VALUES($1) RETURNING id, login",
      [login]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === "23505") {
      // violation de contrainte UNIQUE : le login existe deja
      return res.status(409).json({ error: "login deja pris" });
    }
    throw err;
  }
});

// Le garde des routes privees : l'en-tete X-User tient lieu d'identite
const user = async (req, res, next) => {
  const login = req.get("X-User");
  if (!login) {
    return res.status(401).json({ error: "non authentifié" });
  }
  const { rows } = await db.query("SELECT id, login FROM users WHERE login = $1", [login]);
  if (rows.length === 0) {
    return res.status(401).json({ error: "utilisateur inconnu" });
  }
  req.user = rows[0];
  next();
};

// Liste de suivi de l'utilisateur courant
app.get("/watchlist", user, async (req, res) => {
  const { rows } = await db.query(
    "SELECT id, show_id, title, seen FROM watchlist WHERE user_id = $1 ORDER BY id",
    [req.user.id]
  );
  res.json(rows);
});

// Ajout d'une serie a la liste de suivi
app.post("/watchlist", user, async (req, res) => {
  const { show_id, title } = req.body || {};
  if (!title || !title.trim()) {
    return res.status(400).json({ error: "titre vide" });
  }
  const { rows } = await db.query(
    "INSERT INTO watchlist(user_id, show_id, title) VALUES($1, $2, $3) RETURNING id, show_id, title, seen",
    [req.user.id, show_id, title]
  );
  res.status(201).json(rows[0]);
});

// Demarrage du serveur (ignore quand le fichier est importe par les tests)
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`binggge-api demarre sur le port ${PORT}`);
  });
}

module.exports = app;
