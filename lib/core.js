// Blog logic. Every function takes `query(text, params) => rows` so it runs against Neon in
// production and an in-memory Postgres in tests.

const COLUMNS = [
  'external_id', 'title', 'slug', 'content_html', 'content_markdown', 'meta_title',
  'meta_description', 'subtitle', 'category', 'author_name', 'image_url', 'read_time',
  'word_count', 'tags', 'faqs', 'json_ld_schema', 'language_code', 'published_at', 'updated_at',
];
const JSON_COLS = new Set(['tags', 'faqs', 'json_ld_schema']);

// GrandRanker's "Send Test" button posts a dummy article; keep it off the public site.
function isTestArticle(slug, title) {
  return /^test-webhook/i.test(String(slug || '')) || /^test webhook article$/i.test(String(title || '').trim());
}
const LIVE = "slug IS NOT NULL AND slug NOT ILIKE 'test-webhook%'";

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
  // Accept the key as X-API-Key or as a standard "Authorization: Bearer <token>" header.
  const bearer = /^Bearer\s+(.+)$/i.exec(headers.authorization || '');
  const key = headers['x-api-key'] || (bearer && bearer[1].trim());
  if (!secret || !key || key !== secret) return { status: 401, json: { error: 'unauthorized' } };

  let payload = body;
  if (typeof payload === 'string' || Buffer.isBuffer(payload)) {
    try { payload = JSON.parse(payload.toString()); } catch { return { status: 400, json: { error: 'invalid JSON' } }; }
  }
  payload = payload || {};
  const data = payload.data || {};

  if (payload.event_type === 'publish_articles') {
    const items = Array.isArray(data.articles) ? data.articles : [];
    let upserted = 0;
    for (const item of items) {
      if (isTestArticle(item.slug, item.title)) continue; // GrandRanker "Send Test" payloads never go live
      await upsertArticle(query, item);
      upserted += 1;
    }
    return { status: 200, json: { ok: true, upserted } };
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
const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'America/New_York' }) : '');
const iso = (d) => (d ? new Date(d).toISOString() : '');
const parseJson = (v) => { if (v == null) return null; if (typeof v !== 'string') return v; try { return JSON.parse(v); } catch { return null; } };
const jsonLd = (obj) => `<script type="application/ld+json">${JSON.stringify(obj).replace(/</g, '\\u003c')}</script>`;

// Business details used for calls to action. The main marketing site is served separately.
const MAIN_SITE = (process.env.MAIN_SITE_URL || 'https://www.launchpadservices.com').replace(/\/$/, '');
const BIZ = {
  name: 'Launchpad Services',
  phoneDisplay: '(321) 375-5582',
  phoneTel: '+13213755582',
  bookUrl: process.env.BOOKING_URL || 'https://book.housecallpro.com/book/Launchpad-Services/d45290aff5b54b4597514b5b978f8e70?v2=true',
  plansUrl: `${MAIN_SITE}/maintenance-plans/`,
  financingUrl: `${MAIN_SITE}/financing/`,
  logo: `${MAIN_SITE}/assets/img/logo-nav.webp`,
  license: 'CAC1822716',
};
const SERVICE_LINKS = [
  ['AC Repair', '/ac-repair/'], ['AC Installation', '/ac-installation/'], ['HVAC Repair', '/hvac-repair/'],
  ['Heating Repair', '/heating-repair/'], ['Indoor Air Quality', '/indoor-air-quality/'], ['Maintenance Plans', '/maintenance-plans/'],
];
const AREA_LINKS = [
  ['Palm Bay', '/service-areas/palm-bay/'], ['Melbourne', '/service-areas/melbourne/'], ['West Melbourne', '/service-areas/west-melbourne/'],
  ['Viera', '/service-areas/viera/'], ['Merritt Island', '/service-areas/merritt-island/'], ['Satellite Beach', '/service-areas/satellite-beach/'],
];

const STYLE = `
:root{--navy:#13234E;--navy2:#1c3270;--pink:#E6187E;--cyan:#0AB5D4;--ink:#1d2333;--muted:#5b6478;--bg:#fff;--soft:#f4f6fb;--line:#e6e9f0}
*{box-sizing:border-box}html{-webkit-text-size-adjust:100%}
body{margin:0;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:var(--ink);background:var(--bg);line-height:1.7;font-size:17px}
a{color:var(--pink)}img{max-width:100%;height:auto}
.top{background:var(--navy);color:#fff}
.top .in{max-width:1100px;margin:0 auto;padding:10px 16px;display:flex;align-items:center;gap:16px;flex-wrap:wrap}
.top .logo img{height:40px;width:auto;display:block}.top .logo{color:#fff;font-weight:800;text-decoration:none}
.top nav{display:flex;gap:16px;flex:1;flex-wrap:wrap}.top nav a{color:#fff;text-decoration:none;font-weight:600;font-size:.95rem;opacity:.9}
.top .phone{color:#fff;font-weight:700;text-decoration:none;white-space:nowrap}
.btn{display:inline-block;background:var(--pink);color:#fff!important;font-weight:700;text-decoration:none;padding:12px 20px;border-radius:999px;line-height:1.2;text-align:center}
.btn.alt{background:#fff;color:var(--navy)!important;border:2px solid #fff}.btn.ghost{background:transparent;border:2px solid var(--navy);color:var(--navy)!important}
.wrap{max-width:760px;margin:0 auto;padding:28px 16px 40px}.wide{max-width:1100px;margin:0 auto;padding:0 16px}
.crumbs{font-size:.85rem;color:var(--muted);margin-bottom:12px}.crumbs a{color:var(--muted)}
h1{color:var(--navy);line-height:1.2;font-size:clamp(1.8rem,4vw,2.5rem);margin:.2em 0 .3em}
article h2{color:var(--navy);line-height:1.25;margin-top:1.8em}article h3{color:var(--navy2)}
article table{border-collapse:collapse;width:100%;display:block;overflow-x:auto}article td,article th{border:1px solid var(--line);padding:8px}
.cat{color:var(--cyan);font-weight:700;font-size:.8rem;text-transform:uppercase;letter-spacing:.05em}
.meta{color:var(--muted);font-size:.9rem}.sub{font-size:1.15rem;color:var(--muted);margin:.2em 0 .6em}
.hero{width:100%;border-radius:12px;margin:16px 0;aspect-ratio:16/9;object-fit:cover;background:var(--soft)}
.cta{background:var(--navy);color:#fff;border-radius:14px;padding:22px;margin:32px 0}
.cta h2,.cta h3{color:#fff;margin:0 0 6px}.cta p{margin:0 0 14px;opacity:.92}.cta .row{display:flex;gap:10px;flex-wrap:wrap}
.cta.soft{background:var(--soft);color:var(--ink);border:1px solid var(--line)}.cta.soft h3{color:var(--navy)}
.pill{display:inline-block;background:rgba(10,181,212,.15);color:var(--cyan);font-weight:700;font-size:.75rem;padding:3px 10px;border-radius:999px;margin-bottom:8px}
.faq details{border:1px solid var(--line);border-radius:10px;padding:12px 16px;margin:10px 0}.faq summary{font-weight:700;color:var(--navy);cursor:pointer}
.tags{display:flex;gap:8px;flex-wrap:wrap;margin:24px 0}.tags span{background:var(--soft);border-radius:999px;padding:4px 12px;font-size:.85rem;color:var(--muted)}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:20px}
.card{display:block;text-decoration:none;color:inherit;border:1px solid var(--line);border-radius:14px;overflow:hidden;background:#fff;transition:box-shadow .15s}
.card:hover{box-shadow:0 6px 24px rgba(19,35,78,.12)}.card img{width:100%;aspect-ratio:16/9;object-fit:cover;display:block;background:var(--soft)}
.card .b{padding:14px 16px}.card h2,.card h3{font-size:1.1rem;margin:.2em 0;color:var(--navy);line-height:1.3}.card p{margin:.3em 0;color:var(--muted);font-size:.95rem}
.intro{background:var(--navy);color:#fff}.intro .wide{padding:40px 16px}.intro h1{color:#fff}.intro p{max-width:640px;opacity:.92}
footer{background:var(--navy);color:#cfd6ea;margin-top:40px;font-size:.92rem}
footer .wide{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:24px;padding:36px 16px}
footer h4{color:#fff;margin:0 0 8px}footer a{color:#cfd6ea;text-decoration:none;display:block;padding:2px 0}footer .fine{grid-column:1/-1;border-top:1px solid rgba(255,255,255,.15);padding-top:14px;font-size:.8rem}
.mbar{display:none}
@media(max-width:720px){.top nav{display:none}.mbar{display:flex;position:fixed;left:0;right:0;bottom:0;z-index:20;background:#fff;border-top:1px solid var(--line);padding:8px;gap:8px}
.mbar a{flex:1;padding:12px 8px}body{padding-bottom:70px}}`;

const header = () => `<header class="top"><div class="in">
<a class="logo" href="${MAIN_SITE}/"><img src="${BIZ.logo}" alt="${BIZ.name}" width="160" height="40"></a>
<nav aria-label="Primary"><a href="${MAIN_SITE}/ac-repair/">AC Repair</a><a href="${MAIN_SITE}/ac-installation/">AC Installation</a><a href="${BIZ.plansUrl}">Maintenance Plans</a><a href="/blog">Blog</a></nav>
<a class="phone" href="tel:${BIZ.phoneTel}">${BIZ.phoneDisplay}</a>
<a class="btn" href="${esc(BIZ.bookUrl)}" rel="nofollow">Book Online</a></div></header>`;

const footer = () => `<footer><div class="wide">
<div><h4>${BIZ.name}</h4><p>Residential and light commercial HVAC across Brevard County and the Space Coast. Our service is out of this world.</p>
<a href="tel:${BIZ.phoneTel}">${BIZ.phoneDisplay}</a><a href="${esc(BIZ.bookUrl)}" rel="nofollow">Book online</a></div>
<div><h4>Services</h4>${SERVICE_LINKS.map(([t, u]) => `<a href="${MAIN_SITE}${u}">${t}</a>`).join('')}</div>
<div><h4>Service areas</h4>${AREA_LINKS.map(([t, u]) => `<a href="${MAIN_SITE}${u}">${t}</a>`).join('')}</div>
<div class="fine">&copy; ${new Date().getFullYear()} ${BIZ.name} LLC &middot; Florida License ${BIZ.license}</div>
</div></footer>
<div class="mbar"><a class="btn ghost" href="tel:${BIZ.phoneTel}">Call</a><a class="btn" href="${esc(BIZ.bookUrl)}" rel="nofollow">Book Online</a></div>`;

const bookCta = (heading) => `<aside class="cta" aria-label="Book service">
<h3>${esc(heading || 'Need it fixed today?')}</h3>
<p>Licensed Launchpad techs serve Palm Bay, Melbourne, Viera and the whole Space Coast. Upfront pricing, no surprises.</p>
<div class="row"><a class="btn" href="${esc(BIZ.bookUrl)}" rel="nofollow">Book service online</a><a class="btn alt" href="tel:${BIZ.phoneTel}">Call ${BIZ.phoneDisplay}</a></div></aside>`;

const clubCta = () => `<aside class="cta soft" aria-label="Maintenance plans">
<span class="pill">Save all year</span><h3>Keep this from happening again</h3>
<p>Florida heat and salt air are hard on AC systems. A Launchpad maintenance plan covers your seasonal tune-ups, priority scheduling and member discounts on repairs.</p>
<div class="row"><a class="btn" href="${BIZ.plansUrl}">See maintenance plans</a><a class="btn ghost" href="${BIZ.financingUrl}">Financing options</a></div></aside>`;

function page({ title, description, head = '', body, lang = 'en' }) {
  return `<!doctype html><html lang="${esc(lang)}"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title><meta name="description" content="${esc(description)}">
<meta name="robots" content="index,follow,max-image-preview:large,max-snippet:-1">
<meta name="theme-color" content="#13234E"><link rel="icon" href="${MAIN_SITE}/favicon.ico">
<meta property="og:site_name" content="${BIZ.name}">${head}
<style>${STYLE}</style></head><body>
${header()}
${body}
${footer()}
</body></html>`;
}

// Put a booking prompt part-way through the article (before the 3rd section heading) and lazy-load inline images.
function enhanceContent(htmlIn) {
  let html = String(htmlIn || '').replace(/<img(?![^>]*\bloading=)/gi, '<img loading="lazy" decoding="async"');
  let count = 0;
  html = html.replace(/<h2[\s>]/gi, (m) => (++count === 3 ? `${bookCta('Rather have a pro take a look?')}\n${m}` : m));
  return html;
}

function faqBlock(faqs, contentHtml) {
  if (!Array.isArray(faqs) || !faqs.length) return { html: '', items: [] };
  const items = faqs.map((f) => ({ q: f.name || f.question || f.q, a: f.answer || f.a || f.text })).filter((f) => f.q && f.a);
  if (!items.length) return { html: '', items: [] };
  const plain = String(contentHtml || '').replace(/<[^>]+>/g, ' ').toLowerCase();
  const alreadyOnPage = items.every((f) => plain.includes(String(f.q).toLowerCase().slice(0, 40)));
  const html = alreadyOnPage ? '' : `<section class="faq"><h2>Frequently asked questions</h2>${items.map((f) =>
    `<details><summary>${esc(f.q)}</summary><p>${esc(f.a)}</p></details>`).join('')}</section>`;
  return { html, items };
}

function hasType(ld, type) {
  const walk = (n) => n && (Array.isArray(n) ? n.some(walk) : typeof n === 'object' && (
    n['@type'] === type || (Array.isArray(n['@type']) && n['@type'].includes(type)) || walk(n['@graph'])));
  return walk(ld);
}

const card = (a, tag = 'h2') => `<a class="card" href="/blog/${encodeURIComponent(a.slug)}">
${a.image_url ? `<img src="${esc(a.image_url)}" alt="" loading="lazy" decoding="async" width="640" height="360">` : ''}
<div class="b">${a.category ? `<div class="cat">${esc(a.category)}</div>` : ''}<${tag}>${esc(a.title)}</${tag}>
${a.subtitle || a.meta_description ? `<p>${esc(a.subtitle || a.meta_description)}</p>` : ''}
<div class="meta">${esc(fmtDate(a.published_at))}${a.read_time ? ` &middot; ${esc(a.read_time)}` : ''}</div></div></a>`;

async function renderList(query, base) {
  const rows = await query(
    `SELECT title, slug, subtitle, meta_description, category, image_url, published_at, read_time
     FROM articles WHERE ${LIVE} ORDER BY published_at DESC NULLS LAST, updated_at DESC`,
  );
  const title = 'HVAC Tips & AC Advice for Space Coast Homeowners | Launchpad Services Blog';
  const desc = 'Practical AC repair, maintenance and indoor air quality advice for Palm Bay, Melbourne and Brevard County homes, from the techs at Launchpad Services.';
  const url = `${base}/blog`;
  const ld = {
    '@context': 'https://schema.org', '@type': 'Blog', name: 'Launchpad Services Blog', url, description: desc,
    publisher: { '@type': 'HVACBusiness', name: BIZ.name, url: MAIN_SITE, telephone: BIZ.phoneTel, logo: BIZ.logo },
    blogPost: rows.slice(0, 20).map((a) => ({ '@type': 'BlogPosting', headline: a.title, url: `${base}/blog/${encodeURIComponent(a.slug)}`, datePublished: iso(a.published_at) || undefined })),
  };
  const head = [
    `<link rel="canonical" href="${esc(url)}">`,
    `<meta property="og:type" content="website">`, `<meta property="og:title" content="${esc(title)}">`,
    `<meta property="og:description" content="${esc(desc)}">`, `<meta property="og:url" content="${esc(url)}">`,
    rows[0]?.image_url ? `<meta property="og:image" content="${esc(rows[0].image_url)}">` : '',
    `<meta name="twitter:card" content="summary_large_image">`, jsonLd(ld),
  ].join('\n');
  const body = `<section class="intro"><div class="wide"><h1>HVAC tips for Space Coast homes</h1>
<p>Straight answers on AC repair, maintenance and indoor air from the Launchpad Services team in Palm Bay. When you'd rather have a pro handle it, we're a click away.</p>
<a class="btn" href="${esc(BIZ.bookUrl)}" rel="nofollow">Book service online</a></div></section>
<main class="wide" style="padding-top:28px;padding-bottom:20px">
${rows.length ? `<div class="grid">${rows.map((a) => card(a)).join('\n')}</div>` : '<p>New articles are on the way.</p>'}
${clubCta()}</main>`;
  return page({ title, description: desc, head, body });
}

async function renderArticle(query, base, slug) {
  const [a] = isTestArticle(slug) ? [] : await query(`SELECT * FROM articles WHERE slug = $1 AND ${LIVE} LIMIT 1`, [slug]);
  if (!a) {
    return { status: 404, html: page({ title: 'Article not found | Launchpad Services', description: 'This article does not exist.',
      head: '<meta name="robots" content="noindex">', body: `<main class="wrap"><h1>Article not found</h1><p><a href="/blog">Browse all articles</a></p>${bookCta()}</main>` }) };
  }
  const related = await query(
    `SELECT title, slug, subtitle, meta_description, category, image_url, published_at, read_time FROM articles
     WHERE ${LIVE} AND slug <> $1 ORDER BY (category IS NOT DISTINCT FROM $2) DESC, published_at DESC NULLS LAST LIMIT 3`,
    [a.slug, a.category],
  );
  const url = `${base}/blog/${encodeURIComponent(a.slug)}`;
  const title = a.meta_title || a.title || BIZ.name;
  const desc = a.meta_description || a.subtitle || '';
  const ld = parseJson(a.json_ld_schema);
  const faqs = faqBlock(parseJson(a.faqs), a.content_html);
  const tags = parseJson(a.tags);
  const extraLd = [
    { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: `${MAIN_SITE}/` },
      { '@type': 'ListItem', position: 2, name: 'Blog', item: `${base}/blog` },
      { '@type': 'ListItem', position: 3, name: a.title, item: url }] },
  ];
  if (!ld || !(hasType(ld, 'BlogPosting') || hasType(ld, 'Article'))) {
    extraLd.push({ '@context': 'https://schema.org', '@type': 'BlogPosting', headline: a.title, description: desc, url,
      mainEntityOfPage: url, image: a.image_url || undefined, datePublished: iso(a.published_at) || undefined,
      dateModified: iso(a.updated_at) || undefined, author: a.author_name ? { '@type': 'Person', name: a.author_name } : { '@type': 'Organization', name: BIZ.name },
      publisher: { '@type': 'Organization', name: BIZ.name, logo: { '@type': 'ImageObject', url: BIZ.logo } } });
  }
  if (faqs.items.length && !hasType(ld, 'FAQPage')) {
    extraLd.push({ '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: faqs.items.map((f) => (
      { '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })) });
  }
  const head = [
    `<link rel="canonical" href="${esc(url)}">`,
    `<meta property="og:type" content="article">`,
    `<meta property="og:title" content="${esc(title)}">`,
    `<meta property="og:description" content="${esc(desc)}">`,
    a.image_url ? `<meta property="og:image" content="${esc(a.image_url)}">` : '',
    `<meta property="og:url" content="${esc(url)}">`,
    a.published_at ? `<meta property="article:published_time" content="${iso(a.published_at)}">` : '',
    a.updated_at ? `<meta property="article:modified_time" content="${iso(a.updated_at)}">` : '',
    a.category ? `<meta property="article:section" content="${esc(a.category)}">` : '',
    `<meta name="twitter:card" content="${a.image_url ? 'summary_large_image' : 'summary'}">`,
    `<meta name="twitter:title" content="${esc(title)}">`, `<meta name="twitter:description" content="${esc(desc)}">`,
    a.image_url ? `<meta name="twitter:image" content="${esc(a.image_url)}">` : '',
    a.image_url ? `<link rel="preload" as="image" href="${esc(a.image_url)}">` : '',
    ld ? jsonLd(ld) : '',
    ...extraLd.map(jsonLd),
  ].filter(Boolean).join('\n');
  const body = `<main class="wrap"><article>
<nav class="crumbs" aria-label="Breadcrumb"><a href="${MAIN_SITE}/">Home</a> &rsaquo; <a href="/blog">Blog</a>${a.category ? ` &rsaquo; ${esc(a.category)}` : ''}</nav>
${a.category ? `<div class="cat">${esc(a.category)}</div>` : ''}<h1>${esc(a.title)}</h1>
${a.subtitle ? `<p class="sub">${esc(a.subtitle)}</p>` : ''}
<div class="meta">${a.author_name ? `By ${esc(a.author_name)} &middot; ` : ''}${a.published_at ? `<time datetime="${iso(a.published_at)}">${esc(fmtDate(a.published_at))}</time>` : ''}${a.read_time ? ` &middot; ${esc(a.read_time)}` : ''}</div>
${a.image_url ? `<img class="hero" src="${esc(a.image_url)}" alt="${esc(a.title)}" width="1200" height="675" fetchpriority="high">` : ''}
${enhanceContent(a.content_html)}
${faqs.html}
${Array.isArray(tags) && tags.length ? `<div class="tags">${tags.map((t) => `<span>${esc(t)}</span>`).join('')}</div>` : ''}
${bookCta('Need help with your AC?')}
${clubCta()}
</article>
${related.length ? `<section><h2 style="color:var(--navy)">More from the blog</h2><div class="grid">${related.map((r) => card(r, 'h3')).join('\n')}</div></section>` : ''}
</main>`;
  return { status: 200, html: page({ title, description: desc, head, body, lang: a.language_code || 'en' }) };
}

async function renderSitemap(query, base) {
  const rows = await query(`SELECT slug, updated_at, image_url, title FROM articles WHERE ${LIVE} ORDER BY updated_at DESC`);
  const latest = rows[0]?.updated_at;
  const u = (loc, mod, img, cap) => `  <url><loc>${esc(loc)}</loc>${mod ? `<lastmod>${new Date(mod).toISOString()}</lastmod>` : ''}${img ? `<image:image><image:loc>${esc(img)}</image:loc>${cap ? `<image:title>${esc(cap)}</image:title>` : ''}</image:image>` : ''}</url>`;
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
${[u(`${base}/blog`, latest), ...rows.map((r) => u(`${base}/blog/${encodeURIComponent(r.slug)}`, r.updated_at, r.image_url, r.title))].join('\n')}
</urlset>`;
}

function baseUrl(req) {
  if (process.env.SITE_URL) return process.env.SITE_URL.replace(/\/$/, '');
  const proto = (req.headers['x-forwarded-proto'] || 'https').split(',')[0];
  return `${proto}://${req.headers['x-forwarded-host'] || req.headers.host}`;
}

module.exports = { toRow, handleWebhook, renderList, renderArticle, renderSitemap, baseUrl, isTestArticle };
