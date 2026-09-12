const test = require("node:test");
const assert = require("node:assert");
const request = require("supertest");
const app = require("../src/server");

test("GET /health renvoie status ok", async () => {
  const res = await request(app).get("/health");
  assert.strictEqual(res.status, 200);
  assert.deepStrictEqual(res.body, { status: "ok" });
});

test("GET /watchlist renvoie une liste vide au demarrage", async () => {
  const res = await request(app).get("/watchlist");
  assert.strictEqual(res.status, 200);
  assert.deepStrictEqual(res.body, []);
});

// Squelette des tests de la seance 2 : en attente tant que les fonctionnalites n'existent pas
test.todo("inscription puis connexion");
test.todo("watchlist sans en-tête : 401");
test.todo("un titre vide est refusé");
