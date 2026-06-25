// ============================================================
// LAUNCHPAD SERVICES — AI Mission Control proxy
// Deploy on Vercel (free): place this file at /api/chat.js
// Then in each page set:  <script>window.MC_ENDPOINT="/api/chat";</script>
//
// SET ENV VAR in Vercel dashboard:  ANTHROPIC_API_KEY = sk-ant-...
// (Never put the key in front-end code — it would be public.)
// ============================================================
export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  try {
    const { system, messages } = req.body || {};

    // Basic guardrails: cap conversation length to control cost/abuse
    const safeMessages = Array.isArray(messages) ? messages.slice(-20) : [];

    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 1000,
        system,                // system prompt comes from the page (app.js)
        messages: safeMessages
      })
    });

    const data = await r.json();
    return res.status(r.status).json(data);
  } catch (err) {
    return res.status(500).json({
      content: [{ type: "text", text: "Assistant temporarily unavailable. Please call (321) 375-5582." }]
    });
  }
}
