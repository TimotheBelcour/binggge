CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  login TEXT UNIQUE NOT NULL
);

CREATE TABLE IF NOT EXISTS watchlist (
  id SERIAL PRIMARY KEY,
  user_id INT REFERENCES users(id),
  show_id INT NOT NULL,
  title TEXT NOT NULL
);

-- Un episode vu = une ligne presente. Decocher supprime la ligne.
-- ON DELETE CASCADE : retirer une serie de la liste efface son suivi.
CREATE TABLE IF NOT EXISTS episodes_vus (
  watchlist_id INT NOT NULL REFERENCES watchlist(id) ON DELETE CASCADE,
  episode_id INT NOT NULL,
  PRIMARY KEY (watchlist_id, episode_id)
);

-- Le suivi se fait desormais episode par episode : l'etat de la serie
-- se deduit des episodes vus, il n'est plus stocke.
ALTER TABLE watchlist DROP COLUMN IF EXISTS seen;
-- Nombre total d'episodes connu chez TVMaze, rempli a la premiere consultation.
ALTER TABLE watchlist ADD COLUMN IF NOT EXISTS episodes_total INT;
