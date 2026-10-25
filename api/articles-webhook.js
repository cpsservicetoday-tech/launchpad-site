const { query } = require('../lib/db');
const { handleWebhook } = require('../lib/core');

const MAX_BYTES = 10 * 1024 * 1024; // 10 MB

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []; let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size <= MAX_BYTES) chunks.push(c); // past the cap: keep draining, stop buffering
    });
    req.on('end', () => {
      if (size > MAX_BYTES) reject(Object.assign(new Error('too large'), { status: 413 }));
      else resolve(Buffer.concat(chunks).toString('utf8'));
    });
    req.on('error', reject);
  });
}

module.exports = async function handler(req, res) {
  try {
    const body = req.method === 'POST' ? await readBody(req) : null;
    const out = await handleWebhook(query, {
      method: req.method, headers: req.headers, body, secret: process.env.GRANDRANKER_SECRET,
    });
    res.statusCode = out.status;
    res.setHeader('Content-Type', 'application/json');
    res.end(req.method === 'HEAD' ? undefined : JSON.stringify(out.json));
  } catch (err) {
    res.statusCode = err.status || 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: err.status === 413 ? 'payload too large' : 'server error' }));
    if (!err.status) console.error(err);
  }
};

// Read the raw stream ourselves so our 10 MB cap applies, not the default parser limit.
module.exports.config = { api: { bodyParser: false } };
