const { query } = require('../lib/db');
const { renderList, renderArticle, baseUrl } = require('../lib/core');

// /blog            -> list (no slug)
// /blog/:slug      -> rewritten to /api/blog?slug=:slug
module.exports = async function handler(req, res) {
  try {
    const base = baseUrl(req);
    const slug = new URL(req.url, 'http://x').searchParams.get('slug');
    let status = 200, html;
    if (slug) ({ status, html } = await renderArticle(query, base, slug));
    else html = await renderList(query, base);
    res.statusCode = status;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', status === 200 ? 's-maxage=300, stale-while-revalidate=86400' : 'no-store');
    res.end(html);
  } catch (err) {
    console.error(err);
    res.statusCode = 500;
    res.end('Server error');
  }
};
