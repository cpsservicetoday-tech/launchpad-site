// Blog logic. Every function takes `query(text, params) => rows` so it runs against Neon in
// production and an in-memory Postgres in tests.

const COLUMNS = [
  'external_id', 'title', 'slug', 'content_html', 'content_markdown', 'meta_title',
  'meta_description', 'subtitle', 'category', 'author_name', 'image_url', 'read_time',
  'word_count', 'tags', 'faqs', 'json_ld_schema', 'language_code', 'published_at', 'updated_at',
];
const JSON_COLS = new Set(['tags', 'faqs', 'json_ld_schema']);

// Build a row from ONLY the allowed columns; any other payload field is ignored.
function toRow(item) {
  const row = {};
  for (const col of COLUMNS) {
    let v;
    if (col === 'external_id') v = item.id;
    else if (col === 'published_at') v = item.publish_date;
    else v = item[col];
    if (v === undefined || v === '') v = null;
    if (col === 'external_id' && v !== null) v = String(v);
    if (col === 'word_count' && v !== null) v = Number.isFinite(Number(v)) ? Math.round(Number(v)) : null;
    if (JSON_COLS.has(col) && v !== null) v = JSON.stringify(v);
    if (col === 'updated_at' && v === null) v = new Date().toISOString();
    row[col] = v;
  }
  return row;
}

async function upsertArticle(query, item) {
  const row = toRow(item);
  if (!row.external_id) throw new Error('article missing id');
  const vals = COLUMNS.map((c) => row[c]);
  const ph = COLUMNS.map((c, i) => (JSON_COLS.has(c) ? `$${i + 1}::jsonb` : `$${i + 1}`));
  const updates = COLUMNS.filter((c) => c !== 'external_id').map((c) => `${c} = EXCLUDED.${c}`);
  await query(
    `INSERT INTO articles (${COLUMNS.join(', ')}) VALUES (${ph.join(', ')})
     ON CONFLICT (external_id) DO UPDATE SET ${updates.join(', ')}`,
    vals,
  );
}

async function handleWebhook(query, { method, headers, body, secret }) {
  if (method === 'GET' || method === 'HEAD') return { status: 200, json: { ok: true } };
  if (method !== 'POST') return { status: 405, json: { error: 'method not allowed' } };
  const key = headers['x-api-key'];
  if (!secret || !key || key !== secret) return { status: 401, json: { error: 'unauthorized' } };

  let payload = body;
  if (typeof payload === 'string' || Buffer.isBuffer(payload)) {
    try { payload = JSON.parse(payload.toString()); } catch { return { status: 400, json: { error: 'invalid JSON' } }; }
  }
  payload = payload || {};
  const data = payload.data || {};

  if (payload.event_type === 'publish_articles') {
    const items = Array.isArray(data.articles) ? data.articles : [];
    for (const item of items) await upsertArticle(query, item);
    return { status: 200, json: { ok: true, upserted: items.length } };
  }
  if (payload.event_type === 'unpublish_article') {
    if (data.id === undefined || data.id === null) return { status: 400, json: { error: 'missing data.id' } };
    await query('DELETE FROM articles WHERE external_id = $1', [String(data.id)]);
    return { status: 200, json: { ok: true, deleted: String(data.id) } };
  }
  return { status: 200, json: { ok: true, ignored: payload.event_type || null } };
}

// ---------- rendering ----------
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : '');
const parseJson = (v) => { if (v == null) return null; if (typeof v !== 'string') return v; try { return JSON.parse(v); } catch { return null; } };

// The main marketing site (served separately). Blog links home point here.
const MAIN_SITE = (process.env.MAIN_SITE_URL || 'https://www.launchpadservices.com').replace(/\/$/, '');

const STYLE = `
:root{--navy:#13234E;--pink:#E6187E;--cyan:#0AB5D4;--ink:#1d2333;--muted:#5b6478;--bg:#fff;--line:#e6e9f0}
*{box-sizing:border-box}body{margin:0;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:var(--ink);background:var(--bg);line-height:1.65}
header.site{background:var(--navy);color:#fff;padding:16px}header.site a{color:#fff;text-decoration:none;font-weight:700}
.wrap{max-width:760px;margin:0 auto;padding:32px 16px}h1{color:var(--navy);line-height:1.2}
a{color:var(--pink)}.meta{color:var(--muted);font-size:.9rem}.card{display:block;border-bottom:1px solid var(--line);padding:20px 0;text-decoration:none;color:inherit}
.card h2{margin:.2em 0;color:var(--navy)}.cat{color:var(--cyan);font-weight:600;font-size:.8rem;text-transform:uppercase;letter-spacing:.04em}
.hero{width:100%;height:auto;border-radius:8px;margin:16px 0}article img{max-width:100%;height:auto}
footer{color:var(--muted);font-size:.85rem;text-align:center;padding:32px 16px}`;

function page({ title, description, head = '', body, lang = 'en' }) {
  return `<!doctype html><html lang="${esc(lang)}"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title><meta name="description" content="${esc(description)}">${head}
<style>${STYLE}</style></head><body>
<header class="site"><a href="${MAIN_SITE}/">Launchpad Services</a> &middot; <a href="/blog">Blog</a></header>
<main class="wrap">${body}</main>
<footer>Launchpad Services &middot; Our service is out of this world.</footer></body></html>`;
}

async function renderList(query, base) {
  const rows = await query(
    `SELECT title, slug, subtitle, meta_description, category, author_name, published_at, read_time
     FROM articles WHERE slug IS NOT NULL ORDER BY published_at DESC NULLS LAST, updated_at DESC`,
  );
  const items = rows.map((a) => `<a class="card" href="/blog/${encodeURIComponent(a.slug)}">
${a.category ? `<div class="cat">${esc(a.category)}</div>` : ''}<h2>${esc(a.title)}</h2>
${a.subtitle || a.meta_description ? `<p>${esc(a.subtitle || a.meta_description)}</p>` : ''}
<div class="meta">${esc(fmtDate(a.published_at))}${a.read_time ? ` &middot; ${esc(a.read_time)}` : ''}</div></a>`).join('\n');
  const desc = 'HVAC tips, maintenance advice, and comfort guides from Launchpad Services on Florida\'s Space Coast.';
  return page({
    title: 'Blog | Launchpad Services',
    description: desc,
    head: `<link rel="canonical" href="${esc(base)}/blog">`,
    body: `<h1>Launchpad Services Blog</h1>${items || '<p>New articles are on the way.</p>'}`,
  });
}

async function renderArticle(query, base, slug) {
  const [a] = await query('SELECT * FROM articles WHERE slug = $1 LIMIT 1', [slug]);
  if (!a) {
    return { status: 404, html: page({ title: 'Article not found | Launchpad Services', description: 'This article does not exist.',
      head: '<meta name="robots" content="noindex">', body: '<h1>Article not found</h1><p><a href="/blog">Back to the blog</a></p>' }) };
  }
  const url = `${base}/blog/${encodeURIComponent(a.slug)}`;
  const title = a.meta_title || a.title || 'Launchpad Services';
  const desc = a.meta_description || a.subtitle || '';
  const ld = parseJson(a.json_ld_schema);
  const head = [
    `<link rel="canonical" href="${esc(url)}">`,
    `<meta property="og:type" content="article">`,
    `<meta property="og:title" content="${esc(title)}">`,
    `<meta property="og:description" content="${esc(desc)}">`,
    a.image_url ? `<meta property="og:image" content="${esc(a.image_url)}">` : '',
    `<meta property="og:url" content="${esc(url)}">`,
    `<meta name="twitter:card" content="${a.image_url ? 'summary_large_image' : 'summary'}">`,
    ld ? `<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, '\\u003c')}</script>` : '',
  ].join('\n');
  const body = `<article>
${a.category ? `<div class="cat">${esc(a.category)}</div>` : ''}<h1>${esc(a.title)}</h1>
${a.subtitle ? `<p class="meta" style="font-size:1.1rem">${esc(a.subtitle)}</p>` : ''}
<div class="meta">${a.author_name ? `By ${esc(a.author_name)} &middot; ` : ''}${esc(fmtDate(a.published_at))}${a.read_time ? ` &middot; ${esc(a.read_time)}` : ''}</div>
${a.image_url ? `<img class="hero" src="${esc(a.image_url)}" alt="${esc(a.title)}">` : ''}
${a.content_html || ''}
</article><p><a href="/blog">&larr; All articles</a></p>`;
  return { status: 200, html: page({ title, description: desc, head, body, lang: a.language_code || 'en' }) };
}

async function renderSitemap(query, base) {
  const rows = await query('SELECT slug, updated_at FROM articles WHERE slug IS NOT NULL ORDER BY updated_at DESC');
  const latest = rows[0]?.updated_at;
  const u = (loc, mod) => `  <url><loc>${esc(loc)}</loc>${mod ? `<lastmod>${new Date(mod).toISOString()}</lastmod>` : ''}</url>`;
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${[u(`${base}/blog`, latest), ...rows.map((r) => u(`${base}/blog/${encodeURIComponent(r.slug)}`, r.updated_at))].join('\n')}
</urlset>`;
}

function baseUrl(req) {
  if (process.env.SITE_URL) return process.env.SITE_URL.replace(/\/$/, '');
  const proto = (req.headers['x-forwarded-proto'] || 'https').split(',')[0];
  return `${proto}://${req.headers['x-forwarded-host'] || req.headers.host}`;
}

module.exports = { toRow, handleWebhook, renderList, renderArticle, renderSitemap, baseUrl };
