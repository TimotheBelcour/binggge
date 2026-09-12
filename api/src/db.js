// Connexion PostgreSQL : un pool partage par toute l'API
const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || "postgres://postgres:binggge@localhost:5433/binggge",
});

module.exports = pool;
