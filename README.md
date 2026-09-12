# binggge

Un suivi de séries : chercher une série, l'ajouter à sa liste, cocher les épisodes vus.

## Démarrer

```
docker compose up -d && docker compose exec -T db psql -U postgres binggge < api/db/schema.sql
cd api && npm install && npm start
```

L'API écoute sur `http://localhost:3000`. PostgreSQL tourne dans un conteneur (port hôte `5433`),
les données sont conservées dans le volume `pgdata` entre deux `docker compose down` / `up`.

Copier `.env.example` en `.env` pour modifier `DATABASE_URL` ou `PORT` (`.env` n'est pas versionné).

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
cd api && npm test
```

Les tests utilisent la base PostgreSQL du conteneur (`DATABASE_URL`).

## Ce qui n'existe pas encore

- Pas de vraie authentification (voir ci-dessus)
- Pas d'interface web (page React)
- Pas de déploiement automatisé
