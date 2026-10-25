// Neon (Postgres) connection. DATABASE_URL is set by the Vercel <-> Neon integration.
const { neon } = require('@neondatabase/serverless');

let sql;
async function query(text, params = []) {
  if (!sql) sql = neon(process.env.DATABASE_URL);
  return sql.query(text, params); // returns rows array
}

module.exports = { query };
