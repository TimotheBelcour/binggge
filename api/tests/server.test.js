const test = require("node:test");
const assert = require("node:assert");
const request = require("supertest");
const app = require("../src/server");
const db = require("../src/db");
const tvmaze = require("../src/tvmaze");

// Aucun test ne doit sortir sur le reseau : on remplace le seul point de
// sortie vers TVMaze par des donnees fixes. Les tests mesurent alors notre
// code, pas la disponibilite d'un service tiers.
const EPISODES = [
  { id: 901, season: 1, number: 1, name: "Le début" },
  { id: 902, season: 1, number: 2, name: "La suite" },
  { id: 903, season: 2, number: 1, name: "La reprise" },
];

let appelsEpisodes = 0;
tvmaze.episodes = async () => {
  appelsEpisodes += 1;
  return EPISODES;
};
tvmaze.fiche = async (id) => {
  if (String(id) === "999999999") {
    throw Object.assign(new Error("inconnue"), { statut: 404 });
  }
  return {
    id: Number(id),
    title: "Série d'essai",
    year: "2022",
    image: null,
    imageLarge: null,
    summary: tvmaze.texteBrut("<p>Un <b>synopsis</b> avec des balises.</p>"),
    genres: ["Drama"],
    status: "Running",
    rating: 7.7,
  };
};

// Un login unique par execution pour ne pas dependre de l'etat de la base
const login = `test_${Date.now()}`;

test.beforeEach(() => {
  // Chaque test part d'un cache vide : sinon l'ordre des tests change le resultat
  tvmaze.viderCache();
  appelsEpisodes = 0;
});

test.after(async () => {
  // Nettoyage : on retire ce que les tests ont cree, puis on ferme le pool
  const logins = [login, `${login}_autre`];
  await db.query("DELETE FROM watchlist WHERE user_id IN (SELECT id FROM users WHERE login = ANY($1))", [logins]);
  await db.query("DELETE FROM users WHERE login = ANY($1)", [logins]);
  await db.end();
});

test("health répond ok", async () => {
  const r = await request(app).get("/health");
  assert.equal(r.status, 200);
  assert.deepStrictEqual(r.body, { status: "ok" });
});

test("la page d'accueil est servie", async () => {
  const r = await request(app).get("/");
  assert.equal(r.status, 200);
  assert.match(r.headers["content-type"], /html/);
  assert.match(r.text, /binggge/);
});

test("une inscription crée bien l'utilisateur", async () => {
  const r = await request(app).post("/register").send({ login });
  assert.equal(r.status, 201);
  assert.equal(r.body.login, login);

  const { rows } = await db.query("SELECT login FROM users WHERE login = $1", [login]);
  assert.equal(rows.length, 1);
});

test("réinscrire un login existant renvoie 409", async () => {
  const r = await request(app).post("/register").send({ login });
  assert.equal(r.status, 409);
});

test("ajouter une série la fait apparaître dans /watchlist", async () => {
  const ajout = await request(app)
    .post("/watchlist")
    .set("X-User", login)
    .send({ show_id: 44778, title: "Severance" });
  assert.equal(ajout.status, 201);

  const liste = await request(app).get("/watchlist").set("X-User", login);
  assert.equal(liste.status, 200);
  assert.equal(liste.body.length, 1);
  assert.equal(liste.body[0].title, "Severance");
  assert.equal(liste.body[0].show_id, 44778);
  assert.equal(liste.body[0].vus, 0);
  assert.equal(liste.body[0].seen, false);
});

test("le synopsis est débarrassé de son HTML", () => {
  const propre = tvmaze.texteBrut("<p>Un <b>synopsis</b> &amp; ses balises.</p>");
  assert.equal(propre, "Un synopsis & ses balises.");
  assert.equal(tvmaze.texteBrut(null), null);
});

test("la fiche d'une série est servie sans balises", async () => {
  const r = await request(app).get("/shows/44778");
  assert.equal(r.status, 200);
  assert.equal(r.body.id, 44778);
  assert.ok(!/<[a-z]/i.test(r.body.summary), "le synopsis ne doit plus contenir de balises");
  assert.ok(Array.isArray(r.body.genres));
});

test("une série inconnue renvoie 404", async () => {
  const r = await request(app).get("/shows/999999999");
  assert.equal(r.status, 404);
});

test("watchlist sans en-tête : 401", async () => {
  const r = await request(app).get("/watchlist");
  assert.equal(r.status, 401);
});

test("cocher un épisode fait avancer la progression", async () => {
  const ajout = await request(app)
    .post("/watchlist")
    .set("X-User", login)
    .send({ show_id: 1371, title: "The Bear" });

  const coche = await request(app)
    .put(`/watchlist/${ajout.body.id}/episodes/999001`)
    .set("X-User", login)
    .send({ seen: true });
  assert.equal(coche.status, 204);

  let liste = await request(app).get("/watchlist").set("X-User", login);
  assert.equal(liste.body.find((s) => s.id === ajout.body.id).vus, 1);

  // Decocher le ramene a zero, et recocher deux fois ne compte qu'une
  await request(app)
    .put(`/watchlist/${ajout.body.id}/episodes/999001`)
    .set("X-User", login)
    .send({ seen: true });
  liste = await request(app).get("/watchlist").set("X-User", login);
  assert.equal(liste.body.find((s) => s.id === ajout.body.id).vus, 1);

  await request(app)
    .put(`/watchlist/${ajout.body.id}/episodes/999001`)
    .set("X-User", login)
    .send({ seen: false });
  liste = await request(app).get("/watchlist").set("X-User", login);
  assert.equal(liste.body.find((s) => s.id === ajout.body.id).vus, 0);
});

test("une série dont tous les épisodes sont vus est marquée vue", async () => {
  const ajout = await request(app)
    .post("/watchlist")
    .set("X-User", login)
    .send({ show_id: 44778, title: "House of the Dragon" });

  const tout = await request(app)
    .patch(`/watchlist/${ajout.body.id}`)
    .set("X-User", login)
    .send({ seen: true });
  assert.equal(tout.status, 200);
  assert.equal(tout.body.seen, true);
  assert.equal(tout.body.vus, tout.body.total);
  assert.equal(tout.body.total, EPISODES.length);

  // Decocher un seul episode suffit a ce que la serie ne soit plus vue
  const episodes = await request(app)
    .get(`/watchlist/${ajout.body.id}/episodes`)
    .set("X-User", login);
  assert.equal(episodes.status, 200);
  assert.equal(episodes.body.length, EPISODES.length);
  assert.equal(episodes.body[0].seen, true);
  assert.equal(episodes.body[0].name, "Le début");

  await request(app)
    .put(`/watchlist/${ajout.body.id}/episodes/${episodes.body[0].id}`)
    .set("X-User", login)
    .send({ seen: false });

  const liste = await request(app).get("/watchlist").set("X-User", login);
  assert.equal(liste.body.find((s) => s.id === ajout.body.id).seen, false);
});

test("la liste annonce le prochain épisode à regarder", async () => {
  const ajout = await request(app)
    .post("/watchlist")
    .set("X-User", login)
    .send({ show_id: 777, title: "Série du prochain" });

  let liste = await request(app).get("/watchlist").set("X-User", login);
  let serie = liste.body.find((s) => s.id === ajout.body.id);
  assert.deepStrictEqual(serie.next, EPISODES[0]);

  // Apres en avoir vu un, le prochain avance
  await request(app)
    .post(`/watchlist/${ajout.body.id}/episodes/next`)
    .set("X-User", login);

  liste = await request(app).get("/watchlist").set("X-User", login);
  serie = liste.body.find((s) => s.id === ajout.body.id);
  assert.deepStrictEqual(serie.next, EPISODES[1]);

  // Une serie terminee n'a plus de prochain episode
  await request(app)
    .patch(`/watchlist/${ajout.body.id}`)
    .set("X-User", login)
    .send({ seen: true });

  liste = await request(app).get("/watchlist").set("X-User", login);
  serie = liste.body.find((s) => s.id === ajout.body.id);
  assert.equal(serie.seen, true);
  assert.equal(serie.next, null);
});

test("le cache évite de redemander les épisodes à TVMaze", async () => {
  await request(app)
    .post("/watchlist")
    .set("X-User", login)
    .send({ show_id: 778, title: "Série en cache" });

  await request(app).get("/watchlist").set("X-User", login);
  const apresPremier = appelsEpisodes;
  assert.ok(apresPremier > 0, "le premier affichage doit interroger TVMaze");

  await request(app).get("/watchlist").set("X-User", login);
  assert.equal(appelsEpisodes, apresPremier, "le second affichage doit lire le cache");
});

test("une panne de TVMaze n'empêche pas la liste de s'afficher", async () => {
  const vrai = tvmaze.episodes;
  tvmaze.episodes = async () => {
    throw new Error("TVMaze est injoignable");
  };
  tvmaze.viderCache();

  try {
    const ajout = await request(app)
      .post("/watchlist")
      .set("X-User", login)
      .send({ show_id: 779, title: "Série sans réseau" });

    const liste = await request(app).get("/watchlist").set("X-User", login);
    assert.equal(liste.status, 200);
    const serie = liste.body.find((s) => s.id === ajout.body.id);
    assert.equal(serie.next, null);
    assert.equal(serie.title, "Série sans réseau");
  } finally {
    tvmaze.episodes = vrai;
  }
});

test("reprendre coche le prochain épisode non vu", async () => {
  const ajout = await request(app)
    .post("/watchlist")
    .set("X-User", login)
    .send({ show_id: 44778, title: "House of the Dragon" });

  const premier = await request(app)
    .post(`/watchlist/${ajout.body.id}/episodes/next`)
    .set("X-User", login);
  assert.equal(premier.status, 201);
  assert.deepStrictEqual(premier.body, EPISODES[0]);

  // Le suivant est bien le deuxieme, pas a nouveau le premier
  const second = await request(app)
    .post(`/watchlist/${ajout.body.id}/episodes/next`)
    .set("X-User", login);
  assert.equal(second.status, 201);
  assert.deepStrictEqual(second.body, EPISODES[1]);

  const liste = await request(app).get("/watchlist").set("X-User", login);
  assert.equal(liste.body.find((s) => s.id === ajout.body.id).vus, 2);
});

test("reprendre une série terminée est refusé", async () => {
  const ajout = await request(app)
    .post("/watchlist")
    .set("X-User", login)
    .send({ show_id: 44778, title: "House of the Dragon" });

  await request(app)
    .patch(`/watchlist/${ajout.body.id}`)
    .set("X-User", login)
    .send({ seen: true });

  const r = await request(app)
    .post(`/watchlist/${ajout.body.id}/episodes/next`)
    .set("X-User", login);
  assert.equal(r.status, 409);
});

test("on ne peut pas reprendre la série de quelqu'un d'autre", async () => {
  const autre = `${login}_autre`;
  await request(app).post("/register").send({ login: autre });
  const sienne = await request(app)
    .post("/watchlist")
    .set("X-User", autre)
    .send({ show_id: 3, title: "Sa série" });

  const r = await request(app)
    .post(`/watchlist/${sienne.body.id}/episodes/next`)
    .set("X-User", login);
  assert.equal(r.status, 404);
});

test("on ne peut pas cocher un épisode chez quelqu'un d'autre", async () => {
  const autre = `${login}_autre`;
  await request(app).post("/register").send({ login: autre });
  const sienne = await request(app)
    .post("/watchlist")
    .set("X-User", autre)
    .send({ show_id: 2, title: "Sa série" });

  const r = await request(app)
    .put(`/watchlist/${sienne.body.id}/episodes/999002`)
    .set("X-User", login)
    .send({ seen: true });
  assert.equal(r.status, 404);
});

test("seen doit être un booléen", async () => {
  const ajout = await request(app)
    .post("/watchlist")
    .set("X-User", login)
    .send({ show_id: 1372, title: "Fringe" });

  const r = await request(app)
    .patch(`/watchlist/${ajout.body.id}`)
    .set("X-User", login)
    .send({ seen: "oui" });
  assert.equal(r.status, 400);
});

test("retirer une série la fait disparaître de /watchlist", async () => {
  const ajout = await request(app)
    .post("/watchlist")
    .set("X-User", login)
    .send({ show_id: 82, title: "Game of Thrones" });

  const suppression = await request(app)
    .delete(`/watchlist/${ajout.body.id}`)
    .set("X-User", login);
  assert.equal(suppression.status, 204);

  const liste = await request(app).get("/watchlist").set("X-User", login);
  assert.equal(liste.body.some((s) => s.id === ajout.body.id), false);
});

test("on ne peut pas retirer la série de quelqu'un d'autre", async () => {
  // Une serie appartenant a un autre utilisateur
  const autre = `${login}_autre`;
  await request(app).post("/register").send({ login: autre });
  const sienne = await request(app)
    .post("/watchlist")
    .set("X-User", autre)
    .send({ show_id: 1, title: "Sa série" });

  const r = await request(app).delete(`/watchlist/${sienne.body.id}`).set("X-User", login);
  assert.equal(r.status, 404);

  // Elle est toujours dans la liste de son proprietaire
  const liste = await request(app).get("/watchlist").set("X-User", autre);
  assert.ok(liste.body.some((s) => s.id === sienne.body.id));
});

test("un titre vide est refusé", async () => {
  const r = await request(app)
    .post("/watchlist")
    .set("X-User", login)
    .send({ show_id: 1, title: "" });
  assert.equal(r.status, 400);
});
