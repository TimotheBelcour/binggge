// API de suivi de series - support de cours Git & deploiement
const path = require("node:path");
const express = require("express");
const db = require("./db");
const tvmaze = require("./tvmaze");

const app = express();
app.use(express.json());

// L'interface est servie par le meme serveur que l'API : une seule image, une seule origine
app.use(express.static(path.join(__dirname, "..", "..", "web")));

// Le port est configurable via l'environnement (utile en Docker / CI)
const PORT = process.env.PORT || 3000;

// Verification de sante, utilisee par le pipeline et par Docker
app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

// Recherche des series via l'API TVMaze
// On ne renvoie jamais la reponse brute de l'API tierce : on filtre les champs utiles
app.get("/shows", async (req, res) => {
  res.json(await tvmaze.rechercher(req.query.q || ""));
});

// Fiche d'une serie : affiche, synopsis, genres
app.get("/shows/:id", async (req, res) => {
  try {
    res.json(await tvmaze.fiche(req.params.id));
  } catch (err) {
    if (err.statut === 404) {
      return res.status(404).json({ error: "série introuvable" });
    }
    throw err;
  }
});

// L'etat d'une serie se deduit de ses episodes vus : il n'est jamais stocke.
const REQUETE_LISTE = `
  SELECT w.id,
         w.show_id,
         w.title,
         w.episodes_total AS total,
         COUNT(ev.episode_id)::int AS vus,
         (w.episodes_total IS NOT NULL
          AND w.episodes_total > 0
          AND COUNT(ev.episode_id) = w.episodes_total) AS seen
    FROM watchlist w
    LEFT JOIN episodes_vus ev ON ev.watchlist_id = w.id
   WHERE w.user_id = $1`;

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
    `${REQUETE_LISTE} GROUP BY w.id ORDER BY w.id`,
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
    "INSERT INTO watchlist(user_id, show_id, title) VALUES($1, $2, $3) RETURNING id, show_id, title",
    [req.user.id, show_id, title]
  );
  res.status(201).json({ ...rows[0], total: null, vus: 0, seen: false });
});

// Une serie de MA liste, ou rien : c'est ce filtre qui empeche de toucher
// a la ligne d'un autre utilisateur, quel que soit l'id demande
async function serieDeLUtilisateur(req) {
  const { rows } = await db.query(
    "SELECT id, show_id FROM watchlist WHERE id = $1 AND user_id = $2",
    [req.params.id, req.user.id]
  );
  return rows[0] || null;
}

// Retire une serie de la liste de suivi
// Le user_id dans la clause WHERE garantit qu'on ne supprime jamais la ligne d'un autre
app.delete("/watchlist/:id", user, async (req, res) => {
  const { rowCount } = await db.query(
    "DELETE FROM watchlist WHERE id = $1 AND user_id = $2",
    [req.params.id, req.user.id]
  );
  if (rowCount === 0) {
    return res.status(404).json({ error: "série introuvable" });
  }
  res.status(204).end();
});

// Coche ou decoche tous les episodes d'un coup
app.patch("/watchlist/:id", user, async (req, res) => {
  const { seen } = req.body || {};
  if (typeof seen !== "boolean") {
    return res.status(400).json({ error: "seen doit être un booléen" });
  }

  const serie = await serieDeLUtilisateur(req);
  if (!serie) {
    return res.status(404).json({ error: "série introuvable" });
  }

  if (seen) {
    const episodes = await tvmaze.episodes(serie.show_id);
    await db.query("UPDATE watchlist SET episodes_total = $1 WHERE id = $2", [
      episodes.length,
      serie.id,
    ]);
    // ON CONFLICT : recocher un episode deja vu ne doit pas echouer
    await db.query(
      `INSERT INTO episodes_vus(watchlist_id, episode_id)
       SELECT $1, UNNEST($2::int[])
       ON CONFLICT DO NOTHING`,
      [serie.id, episodes.map((e) => e.id)]
    );
  } else {
    await db.query("DELETE FROM episodes_vus WHERE watchlist_id = $1", [serie.id]);
  }

  const { rows } = await db.query(`${REQUETE_LISTE} AND w.id = $2 GROUP BY w.id`, [
    req.user.id,
    serie.id,
  ]);
  res.json(rows[0]);
});

// Les episodes d'une serie de ma liste, marques vus ou non
app.get("/watchlist/:id/episodes", user, async (req, res) => {
  const serie = await serieDeLUtilisateur(req);
  if (!serie) {
    return res.status(404).json({ error: "série introuvable" });
  }

  const episodes = await tvmaze.episodes(serie.show_id);
  // On en profite pour memoriser le total : c'est lui qui rend l'etat deductible
  await db.query("UPDATE watchlist SET episodes_total = $1 WHERE id = $2", [
    episodes.length,
    serie.id,
  ]);

  const { rows } = await db.query(
    "SELECT episode_id FROM episodes_vus WHERE watchlist_id = $1",
    [serie.id]
  );
  const vus = new Set(rows.map((r) => r.episode_id));

  res.json(episodes.map((e) => ({ ...e, seen: vus.has(e.id) })));
});

// Coche le prochain episode non vu : c'est l'API qui sait ce que
// « prochain » veut dire, pas l'interface
app.post("/watchlist/:id/episodes/next", user, async (req, res) => {
  const serie = await serieDeLUtilisateur(req);
  if (!serie) {
    return res.status(404).json({ error: "série introuvable" });
  }

  const episodes = await tvmaze.episodes(serie.show_id);
  await db.query("UPDATE watchlist SET episodes_total = $1 WHERE id = $2", [
    episodes.length,
    serie.id,
  ]);

  const { rows } = await db.query(
    "SELECT episode_id FROM episodes_vus WHERE watchlist_id = $1",
    [serie.id]
  );
  const vus = new Set(rows.map((r) => r.episode_id));
  const prochain = episodes.find((e) => !vus.has(e.id));

  if (!prochain) {
    return res.status(409).json({ error: "tous les épisodes sont déjà vus" });
  }

  await db.query(
    `INSERT INTO episodes_vus(watchlist_id, episode_id) VALUES($1, $2)
     ON CONFLICT DO NOTHING`,
    [serie.id, prochain.id]
  );
  res.status(201).json(prochain);
});

// Coche ou decoche un episode
app.put("/watchlist/:id/episodes/:episodeId", user, async (req, res) => {
  const { seen } = req.body || {};
  if (typeof seen !== "boolean") {
    return res.status(400).json({ error: "seen doit être un booléen" });
  }

  const serie = await serieDeLUtilisateur(req);
  if (!serie) {
    return res.status(404).json({ error: "série introuvable" });
  }

  if (seen) {
    await db.query(
      `INSERT INTO episodes_vus(watchlist_id, episode_id) VALUES($1, $2)
       ON CONFLICT DO NOTHING`,
      [serie.id, req.params.episodeId]
    );
  } else {
    await db.query(
      "DELETE FROM episodes_vus WHERE watchlist_id = $1 AND episode_id = $2",
      [serie.id, req.params.episodeId]
    );
  }
  res.status(204).end();
});

// Demarrage du serveur (ignore quand le fichier est importe par les tests)
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`binggge-api demarre sur le port ${PORT}`);
  });
}

module.exports = app;
