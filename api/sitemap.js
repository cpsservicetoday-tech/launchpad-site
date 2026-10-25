const { query } = require('../lib/db');
const { renderSitemap, baseUrl } = require('../lib/core');

module.exports = async function handler(req, res) {
  try {
    const xml = await renderSitemap(query, baseUrl(req));
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=3600');
    res.end(xml);
  } catch (err) {
    console.error(err);
    res.statusCode = 500;
    res.end('Server error');
  }
};
