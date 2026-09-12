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
- `GET /watchlist` — renvoie la liste de suivi (vide pour l'instant)

## Ce qui n'existe pas encore

- Pas d'authentification (inscription / connexion)
- `/watchlist` n'est pas encore branchée sur la base : elle renvoie toujours un tableau vide
- Pas d'interface web (page React)
- Pas de déploiement automatisé
