const test = require("node:test");
const assert = require("node:assert");
const request = require("supertest");
const app = require("../src/server");
const db = require("../src/db");

// Un login unique par execution pour ne pas dependre de l'etat de la base
const login = `test_${Date.now()}`;

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
});

test("watchlist sans en-tête : 401", async () => {
  const r = await request(app).get("/watchlist");
  assert.equal(r.status, 401);
});

test("marquer une série vue met à jour seen", async () => {
  const ajout = await request(app)
    .post("/watchlist")
    .set("X-User", login)
    .send({ show_id: 1371, title: "The Bear" });

  const vu = await request(app)
    .patch(`/watchlist/${ajout.body.id}`)
    .set("X-User", login)
    .send({ seen: true });
  assert.equal(vu.status, 200);
  assert.equal(vu.body.seen, true);

  const liste = await request(app).get("/watchlist").set("X-User", login);
  assert.equal(liste.body.find((s) => s.id === ajout.body.id).seen, true);
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
  assert.equal(liste.body.length, 1);
});

test("un titre vide est refusé", async () => {
  const r = await request(app)
    .post("/watchlist")
    .set("X-User", login)
    .send({ show_id: 1, title: "" });
  assert.equal(r.status, 400);
});
