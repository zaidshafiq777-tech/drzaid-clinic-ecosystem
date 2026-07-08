// ============================================================
// Dr. Zaid Healthcare OS — Global AI Manager
// The frontend NEVER calls an AI provider directly and NEVER
// holds a provider key. Every request goes through the existing,
// production n8n Gemini AI Proxy. This is the only wired provider
// today — the interface is provider-agnostic so more can be added
// server-side later without any frontend change.
// ============================================================

const AI = {
  _endpoint: window.DZ_CONFIG.N8N_BASE_URL + "/gemini-ai",

  /** Ask the AI a question. Returns { ok, text, raw, error }.
   *  Never throws — callers can always safely read .ok. */
  async ask(prompt, opts = {}) {
    try {
      const res = await fetch(this._endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
      });
      if (!res.ok) return { ok: false, error: `AI service returned ${res.status}` };
      const data = await res.json();
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
      if (!text) return { ok: false, error: "AI returned no content", raw: data };
      return { ok: true, text, raw: data, usedFallback: !!data?._fallbackUsed };
    } catch (e) {
      return { ok: false, error: e.message || "Network error reaching AI service" };
    }
  },

  /** Live connectivity test — used by the API Settings page.
   *  Makes one real, minimal call and reports true success/failure. */
  async testConnection() {
    const t0 = performance.now();
    const r = await this.ask("Reply with exactly one word: OK");
    const ms = Math.round(performance.now() - t0);
    if (!r.ok) return { connected: false, detail: r.error, latencyMs: ms };
    return { connected: true, detail: r.usedFallback ? "Responding via fallback model" : "Responding normally", latencyMs: ms };
  },
};

window.AI = AI;
