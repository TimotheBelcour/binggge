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

L'API ne publie aucun port : en production, Traefik la joint directement sur le réseau Docker.
Pour la tester en local :

```
docker compose exec api wget -qO- localhost:3000/health
```

Le mot de passe de la base vient du fichier `.env` (`DB_PASS`), **jamais versionné**.
`docker-compose.override.yml` est chargé automatiquement en local et publie la base sur le port
`5433` pour pouvoir lancer les tests depuis la machine ; il n'est pas utilisé sur le serveur.

## Routes existantes

- `GET /health` — renvoie `{ "status": "ok" }`
- `GET /shows?q=<recherche>` — cherche des séries via l'API TVMaze et renvoie une liste allégée (`id`, `title`, `year`, `image`)
- `POST /register` — crée un utilisateur à partir d'un `login` (`409` s'il existe déjà)
- `GET /watchlist` — renvoie la liste de suivi de l'utilisateur (`401` sans en-tête `X-User`)
- `POST /watchlist` — ajoute une série (`show_id`, `title`) à la liste de l'utilisateur

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

## Ce qui n'existe pas encore

- Pas de vraie authentification (voir ci-dessus)
- Pas d'interface web (page React)
- Pas de déploiement automatisé
