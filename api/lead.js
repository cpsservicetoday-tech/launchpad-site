const { query } = require('../lib/db');
const { handleLead } = require('../lib/leads');

const ALLOWED_ORIGINS = [
  'https://www.launchpadservices.com',
  'https://launchpadservices.com',
  'https://blog.launchpadservices.com',
  'https://launchpad-website.pages.dev',
];

function readBody(req, limit = 20000) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', (c) => { size += c.length; if (size <= limit) chunks.push(c); });
    req.on('end', () => (size > limit ? reject(Object.assign(new Error('too large'), { code: 413 })) : resolve(Buffer.concat(chunks).toString())));
    req.on('error', reject);
  });
}

module.exports = async function handler(req, res) {
  const origin = req.headers.origin;
  if (ALLOWED_ORIGINS.includes(origin) || /^https:\/\/[a-z0-9-]+\.launchpad-website\.pages\.dev$/.test(origin || '')) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  }
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') { res.statusCode = 204; return res.end(); }
  if (req.method !== 'POST') { res.statusCode = 405; return res.end(JSON.stringify({ ok: false, error: 'method not allowed' })); }
  try {
    const body = await readBody(req);
    const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || null;
    const out = await handleLead(query, { body, ip, userAgent: req.headers['user-agent'] });
    res.statusCode = out.status;
    res.end(JSON.stringify(out.json));
  } catch (err) {
    console.error(err);
    res.statusCode = err.code === 413 ? 413 : 500;
    res.end(JSON.stringify({ ok: false, error: 'server error' }));
  }
};
module.exports.config = { api: { bodyParser: false } };
