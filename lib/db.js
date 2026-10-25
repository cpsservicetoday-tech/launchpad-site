// Neon (Postgres) connection. DATABASE_URL is set by the Vercel <-> Neon integration.
// The articles table is created automatically on first use (safe to run repeatedly).
const { neon } = require('@neondatabase/serverless');

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS articles (
    id               SERIAL PRIMARY KEY,
    external_id      TEXT NOT NULL UNIQUE,
    title            TEXT,
    slug             TEXT UNIQUE,
    content_html     TEXT,
    content_markdown TEXT,
    meta_title       TEXT,
    meta_description TEXT,
    subtitle         TEXT,
    category         TEXT,
    author_name      TEXT,
    image_url        TEXT,
    read_time        TEXT,
    word_count       INTEGER,
    tags             JSONB,
    faqs             JSONB,
    json_ld_schema   JSONB,
    language_code    TEXT,
    published_at     TIMESTAMPTZ,
    updated_at       TIMESTAMPTZ DEFAULT now()
  )`,
  'CREATE INDEX IF NOT EXISTS articles_published_at_idx ON articles (published_at DESC)',
];

let sql;
let ready;
async function query(text, params = []) {
  if (!sql) sql = neon(process.env.DATABASE_URL);
  if (!ready) ready = (async () => { for (const s of SCHEMA) await sql.query(s); })().catch((e) => { ready = null; throw e; });
  await ready;
  return sql.query(text, params); // returns rows array
}

module.exports = { query };
