# binggge

Un suivi de séries : chercher une série, l'ajouter à sa liste, cocher les épisodes vus.

## Démarrer

```
cd api && npm install
npm start
```

L'API écoute sur `http://localhost:3000`.

## Routes existantes

- `GET /health` — renvoie `{ "status": "ok" }`
- `GET /shows?q=<recherche>` — cherche des séries via l'API TVMaze et renvoie une liste allégée (`id`, `title`, `year`, `image`)
- `GET /watchlist` — renvoie la liste de suivi (vide pour l'instant)

## Ce qui n'existe pas encore

- Pas d'authentification (inscription / connexion)
- Pas de base de données : rien n'est persisté, `/watchlist` renvoie toujours un tableau vide
- Pas d'interface web (page React)
- Pas de déploiement automatisé
