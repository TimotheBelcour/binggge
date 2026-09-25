# binggge

Un suivi de séries : chercher une série, l'ajouter à sa liste, cocher les épisodes vus.

## Démarrer

```
cp .env.example .env   # puis choisir un mot de passe DB_PASS
docker compose up -d --build
```

Deux conteneurs démarrent : `api` (image construite depuis `api/Dockerfile`) et `db` (PostgreSQL 16).
Le schéma `api/db/schema.sql` est appliqué automatiquement à la création du volume `pgdata`,
et les données survivent à un `docker compose down` / `up`.

En production l'API ne publie aucun port : Traefik la joint directement sur le réseau Docker.
En local, `docker-compose.override.yml` la publie sur le port 3000 : ouvrez
**http://localhost:3000** dans un navigateur pour utiliser l'interface.

Le mot de passe de la base vient du fichier `.env` (`DB_PASS`), **jamais versionné**.
`docker-compose.override.yml` est chargé automatiquement en local : il publie l'API sur le port
`3000` et la base sur le port `5433` (pour lancer les tests depuis la machine). Il n'est pas
utilisé sur le serveur, où les commandes précisent `-f docker-compose.yml`.

## Interface

La page `web/index.html` est servie par l'API elle-même, à la racine (`/`) : on entre un login,
on cherche une série, on l'ajoute à sa liste, on la coche quand on l'a vue, on la retire.
Elle est écrite en React chargé depuis un CDN, sans étape de build — le fichier HTML est le
livrable, l'image Docker l'embarque.

Le login saisi est gardé dans le `localStorage` du navigateur et renvoyé à chaque appel dans
l'en-tête `X-User` (voir la section Authentification).

## Routes existantes

- `GET /health` — renvoie `{ "status": "ok" }`
- `GET /shows?q=<recherche>` — cherche des séries via l'API TVMaze et renvoie une liste allégée (`id`, `title`, `year`, `image`)
- `POST /register` — crée un utilisateur à partir d'un `login` (`409` s'il existe déjà)
- `GET /watchlist` — renvoie la liste de suivi de l'utilisateur (`401` sans en-tête `X-User`)
- `POST /watchlist` — ajoute une série (`show_id`, `title`) à la liste de l'utilisateur
- `PATCH /watchlist/:id` — marque une série vue ou non vue (`seen`, booléen)
- `DELETE /watchlist/:id` — retire une série de la liste (`404` si elle appartient à quelqu'un d'autre)

## Authentification

**Il n'y a pas d'authentification réelle** : ni mot de passe, ni hash, ni jeton. L'en-tête `X-User: <login>`
tient lieu d'identité. C'est un choix volontaire pour ce cours : ce qui est travaillé ici est la chaîne
de livraison (Git, tests, déploiement), pas la sécurité. Le seul rôle de cet en-tête est de permettre à
`/watchlist` de **refuser** une requête, et donc d'avoir un cas de refus à tester.

```
curl -X POST localhost:3000/register -H 'content-type: application/json' -d '{"login":"olivia"}'
curl -X POST localhost:3000/watchlist -H 'X-User: olivia' -H 'content-type: application/json' -d '{"show_id":44778,"title":"Severance"}'
curl localhost:3000/watchlist -H 'X-User: olivia'
```

## Tests

```
docker compose up -d
cd api && npm install && npm test
```

Les tests s'exécutent sur la machine et joignent la base du conteneur via `DATABASE_URL`
(défini dans `.env`, port `5433`).

## Pipeline

À chaque pull request et à chaque push sur `main`, GitHub Actions (`.github/workflows/ci.yml`) enchaîne :

1. **test** — PostgreSQL en service, schéma appliqué, `npm ci` puis `npm test`
2. **build** — construit l'image `binggge-api:<sha>` et vérifie qu'elle répond sur `/health`
3. **deploy** — *pas encore en place* : sur `main` uniquement, se connectera en SSH au serveur
   pour lancer `docker compose up -d --build`. En attente des droits Docker sur le serveur.

`main` est protégée : une PR dont les checks `test` ou `build` sont rouges ne peut pas être mergée
(preuve : `PIPELINE_BLOQUE.jpeg`).

## Définition de « fini »

Un ticket est fini quand les quatre conditions sont réunies :

1. Le pipeline est vert.
2. L'URL répond depuis une autre machine que la mienne.
3. Le README dit comment la joindre.
4. Le ticket est fermé par une MR (`Closes #n`).

## Ce qui n'existe pas encore

- Pas de vraie authentification (voir ci-dessus)
- Le suivi se fait série par série, pas épisode par épisode
- Pas de déploiement automatisé : le job `deploy` attend les droits Docker sur le serveur
