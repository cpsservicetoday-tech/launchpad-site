// Website lead capture. Every valid lead is saved to Postgres FIRST, then the office is
// notified. Notification is best-effort, so a lead is never lost if email is down.
// Secrets come only from the environment:
//   MS_TENANT_ID, MS_CLIENT_ID, MS_CLIENT_SECRET  -> Microsoft 365 (Graph sendMail)
//   LEAD_NOTIFY_FROM (mailbox that sends), LEAD_NOTIFY_TO (comma list, default service@)

const FIELDS = { name: 100, phone: 40, email: 200, zip: 10, issue: 120, time: 80, message: 2000, page: 500, source: 300 };
const SCHEMA = `CREATE TABLE IF NOT EXISTS leads (
  id SERIAL PRIMARY KEY, name TEXT, phone TEXT, email TEXT, zip TEXT, issue TEXT, time TEXT,
  message TEXT, page TEXT, source TEXT, ip TEXT, user_agent TEXT, notified BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now())`;

function clean(body) {
  const out = {};
  for (const [k, max] of Object.entries(FIELDS)) {
    const v = body && body[k] != null ? String(body[k]).replace(/[\u0000-\u001f]+/g, ' ').trim() : '';
    out[k] = v.slice(0, max) || null;
  }
  return out;
}

function validate(lead, body) {
  if (body && body.company_website) return 'spam';           // honeypot field, hidden from humans
  if (!lead.name) return 'Name is required';
  const digits = (lead.phone || '').replace(/\D/g, '');
  if (digits.length < 10 || digits.length > 11) return 'A valid phone number is required';
  if (lead.zip && !/^\d{5}$/.test(lead.zip)) return 'ZIP must be 5 digits';
  return null;
}

async function tooMany(query, ip) {
  if (!ip) return false;
  const [r] = await query("SELECT count(*)::int AS n FROM leads WHERE ip = $1 AND created_at > now() - interval '10 minutes'", [ip]);
  return r && r.n >= 5;
}

async function sendEmail(lead, env, fetchImpl) {
  const { MS_TENANT_ID: t, MS_CLIENT_ID: c, MS_CLIENT_SECRET: s, LEAD_NOTIFY_FROM: from } = env;
  if (!t || !c || !s || !from) return false;
  const to = (env.LEAD_NOTIFY_TO || 'service@launchpadservices.com').split(',').map((x) => x.trim()).filter(Boolean);
  const tok = await fetchImpl(`https://login.microsoftonline.com/${encodeURIComponent(t)}/oauth2/v2.0/token`, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: c, client_secret: s, scope: 'https://graph.microsoft.com/.default', grant_type: 'client_credentials' }),
  }).then((r) => r.json());
  if (!tok.access_token) return false;
  const lines = [['Name', lead.name], ['Phone', lead.phone], ['Email', lead.email], ['ZIP', lead.zip], ['Issue', lead.issue],
    ['Preferred time', lead.time], ['Message', lead.message], ['Page', lead.page], ['Source', lead.source]]
    .filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`).join('\n');
  const r = await fetchImpl(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(from)}/sendMail`, {
    method: 'POST', headers: { Authorization: `Bearer ${tok.access_token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: {
      subject: `New web lead: ${lead.name}${lead.zip ? ` (${lead.zip})` : ''} — ${lead.issue || 'service request'}`,
      body: { contentType: 'Text', content: `New service request from launchpadservices.com\n\n${lines}\n\nCall within 15 minutes.` },
      toRecipients: to.map((address) => ({ emailAddress: { address } })),
    }, saveToSentItems: false }),
  });
  return r.status === 202;
}

async function handleLead(query, { body, ip, userAgent, env = process.env, fetchImpl = fetch }) {
  let data = body;
  if (typeof data === 'string') { try { data = JSON.parse(data); } catch { return { status: 400, json: { ok: false, error: 'invalid JSON' } }; } }
  const lead = clean(data || {});
  const err = validate(lead, data);
  if (err === 'spam') return { status: 200, json: { ok: true } };   // pretend success to bots
  if (err) return { status: 400, json: { ok: false, error: err } };
  await query(SCHEMA);
  if (await tooMany(query, ip)) return { status: 429, json: { ok: false, error: 'Too many requests' } };
  const [row] = await query(
    `INSERT INTO leads (name, phone, email, zip, issue, time, message, page, source, ip, user_agent)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
    [lead.name, lead.phone, lead.email, lead.zip, lead.issue, lead.time, lead.message, lead.page, lead.source, ip || null, (userAgent || '').slice(0, 300) || null],
  );
  let notified = false;
  try { notified = await sendEmail(lead, env, fetchImpl); } catch (e) { console.error('lead email failed', e); }
  if (notified) await query('UPDATE leads SET notified = true WHERE id = $1', [row.id]);
  return { status: 200, json: { ok: true, id: row.id, notified } };
}

module.exports = { handleLead, clean, validate };
