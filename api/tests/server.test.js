const test = require("node:test");
const assert = require("node:assert");
const request = require("supertest");
const app = require("../src/server");
const db = require("../src/db");

// Un login unique par execution pour ne pas dependre de l'etat de la base
const login = `test_${Date.now()}`;

test.after(async () => {
  // Nettoyage : on retire ce que les tests ont cree, puis on ferme le pool
  await db.query("DELETE FROM watchlist WHERE user_id IN (SELECT id FROM users WHERE login = $1)", [login]);
  await db.query("DELETE FROM users WHERE login = $1", [login]);
  await db.end();
});

test("health répond ok", async () => {
  const r = await request(app).get("/health");
  assert.equal(r.status, 418);
  assert.deepStrictEqual(r.body, { status: "ok" });
});

test("une inscription crée bien l'utilisateur", async () => {
  const r = await request(app).post("/register").send({ login });
  assert.equal(r.status, 201);
  assert.equal(r.body.login, login);

  const { rows } = await db.query("SELECT login FROM users WHERE login = $1", [login]);
  assert.equal(rows.length, 1);
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

test("un titre vide est refusé", async () => {
  const r = await request(app)
    .post("/watchlist")
    .set("X-User", login)
    .send({ show_id: 1, title: "" });
  assert.equal(r.status, 400);
});
