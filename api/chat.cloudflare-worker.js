// ALTERNATIVE: Cloudflare Worker version of the proxy.
// Bind a secret named ANTHROPIC_API_KEY in the Worker settings.
export default {
  async fetch(request, env) {
    if (request.method !== "POST")
      return new Response("Method not allowed", { status: 405 });
    try {
      const { system, messages } = await request.json();
      const safe = Array.isArray(messages) ? messages.slice(-20) : [];
      const r = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": env.ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01"
        },
        body: JSON.stringify({ model: "claude-sonnet-4-6", max_tokens: 1000, system, messages: safe })
      });
      return new Response(await r.text(), {
        status: r.status, headers: { "Content-Type": "application/json" }
      });
    } catch (e) {
      return new Response(JSON.stringify({
        content: [{ type: "text", text: "Assistant temporarily unavailable. Please call (321) 375-5582." }]
      }), { headers: { "Content-Type": "application/json" } });
    }
  }
}
