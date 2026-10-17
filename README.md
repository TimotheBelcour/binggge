# binggge

Un suivi de séries : chercher une série, l'ajouter à sa liste, cocher les épisodes vus.
Une série est « vue » quand tous ses épisodes le sont — cet état se déduit, il n'est jamais stocké.

## Démarrer

```
cp .env.example .env   # puis choisir un mot de passe DB_PASS
docker compose up -d --build
docker compose exec -T db psql -U postgres binggge < api/db/schema.sql   # une seule fois
```

Deux conteneurs démarrent : `api` (image construite depuis `api/Dockerfile`) et `db` (PostgreSQL 16).
Les données survivent à un `docker compose down` / `up` grâce au volume nommé `pgdata` ; le schéma
n'est à appliquer qu'une fois par volume (`relation already exists` ensuite, c'est normal).

Ouvrez ensuite **http://localhost:3000** pour utiliser l'interface.

Le mot de passe de la base vient du fichier `.env` (`DB_PASS`), **jamais versionné**.
Ce même `.env` contient `COMPOSE_FILE`, qui ajoute `docker-compose.local.yml` au fichier principal :
c'est lui qui publie l'API sur le port `3000` et la base sur le port `5433` (pour les tests).
Sur le serveur, le `.env` ne contient que `DB_PASS`, donc **aucun port n'est publié** : Traefik joint
le conteneur directement sur le réseau Docker.

## Interface

La page `web/index.html` est servie par l'API elle-même, à la racine (`/`) : on entre un login,
la liste occupe le haut de la page et la recherche s'ouvre dans un panneau, qui se referme dès
qu'une série est ajoutée. On déplie une série pour lire sa fiche (année, genres, statut, note,
synopsis) et cocher les épisodes vus, on suit sa progression (« 7/26 épisodes »), on la retire.
Chaque série annonce son prochain épisode (« 0/12 épisodes · S01E01 · Glorious Purpose ») et le
bouton « Reprendre » le coche sans avoir à déplier la série.
Les fiches viennent de `GET /shows/:id`, chargées à la demande et gardées en mémoire.

Les séries en cours occupent le haut de la liste ; les terminées sont regroupées dans une section
repliée. Toute la carte d'une série est cliquable pour la déplier, pas seulement la flèche.

L'interface suit le thème clair ou sombre du système, s'adapte au mobile, désactive les boutons
pendant les envois et respecte `prefers-reduced-motion`.
Elle est écrite en React chargé depuis un CDN, sans étape de build — le fichier HTML est le
livrable, l'image Docker l'embarque.

Le login saisi est gardé dans le `localStorage` du navigateur et renvoyé à chaque appel dans
l'en-tête `X-User` (voir la section Authentification).

## Routes existantes

- `GET /health` — renvoie `{ "status": "ok" }`
- `GET /shows?q=<recherche>` — cherche des séries via l'API TVMaze et renvoie une liste allégée (`id`, `title`, `year`, `image`)
- `GET /shows/:id` — fiche d'une série : affiche (vignette et grand format), genres, note et synopsis **débarrassé de son HTML**
- `POST /register` — crée un utilisateur à partir d'un `login` (`409` s'il existe déjà)
- `GET /watchlist` — renvoie la liste de suivi de l'utilisateur, chaque série portant sa progression et son prochain épisode non vu (`401` sans en-tête `X-User`)
- `POST /watchlist` — ajoute une série (`show_id`, `title`) à la liste de l'utilisateur
- `PATCH /watchlist/:id` — coche ou décoche **tous** les épisodes d'un coup (`seen`, booléen)
- `GET /watchlist/:id/episodes` — les épisodes de la série (via TVMaze), chacun marqué vu ou non
- `PUT /watchlist/:id/episodes/:episodeId` — coche ou décoche un épisode (`seen`, booléen)
- `POST /watchlist/:id/episodes/next` — coche le prochain épisode non vu et le renvoie (`409` si la série est terminée)
- `DELETE /watchlist/:id` — retire une série de la liste (`404` si elle appartient à quelqu'un d'autre)

Les routes `/watchlist/:id/...` filtrent toujours sur l'utilisateur : viser l'identifiant d'un autre
renvoie `404`, jamais le contenu de sa liste.

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

**Aucun test n'appelle TVMaze.** Tous les échanges avec l'API tierce passent par
`api/src/tvmaze.js`, un module unique que les tests remplacent par des données fixes. Un test
rouge signale donc un problème dans le code, jamais une panne de réseau ou de service tiers.

Ce module garde aussi les listes d'épisodes **en cache dix minutes** : afficher sa watchlist
ne déclenche pas un appel à TVMaze par série à chaque chargement. Si TVMaze est injoignable,
la liste s'affiche quand même, simplement sans le prochain épisode.

## Pipeline

À chaque pull request et à chaque push sur `main`, GitHub Actions (`.github/workflows/ci.yml`) enchaîne :

1. **test** — PostgreSQL en service, schéma appliqué, `npm ci` puis `npm test`
2. **build** — construit l'image `binggge-api:<sha>` et vérifie qu'elle répond sur `/health`
3. **deploy** — sur `main` uniquement : se connecte en SSH au serveur, fait un `git pull`, relance
   les conteneurs avec `sudo binggge up -d --build`, puis vérifie que l'URL publique répond sur
   `/health` avant de déclarer le déploiement réussi.

`main` est protégée : une PR dont les checks `test` ou `build` sont rouges ne peut pas être mergée
(preuve : `PIPELINE_BLOQUE.jpeg`).

## En ligne

L'application tourne sur `iut.cafeclaudie.fr` : **https://iut.cafeclaudie.fr/TimotheBelcour/**
(état de l'API : `/TimotheBelcour/health`). La barre oblique finale est obligatoire : Traefik
route sur le préfixe `/TimotheBelcour/` et le retire avant de transmettre à l'API.

Le serveur n'autorise pas `docker` directement : les conteneurs se pilotent avec le wrapper
`sudo binggge` (`up`, `down`, `ps`, `logs`, `exec`…). Les montages de dossiers de l'hôte y sont
interdits, d'où le volume nommé et le schéma appliqué à la main :

```
ssh -i ~/.ssh/id_binggge TimotheBelcour@iut.cafeclaudie.fr
sudo binggge ps
sudo binggge logs --tail 50 api
sudo binggge exec -T db psql -U postgres binggge < api/db/schema.sql   # une seule fois
```

## Définition de « fini »

Un ticket est fini quand les quatre conditions sont réunies :

1. Le pipeline est vert.
2. L'URL répond depuis une autre machine que la mienne.
3. Le README dit comment la joindre.
4. Le ticket est fermé par une MR (`Closes #n`).

## Ce qui n'existe pas encore

- Pas de vraie authentification (voir ci-dessus)
- Le déploiement ne gère pas les migrations : un changement de schéma s'applique à la main
