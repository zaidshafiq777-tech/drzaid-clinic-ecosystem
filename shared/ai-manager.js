// ============================================================
// Dr. Zaid Healthcare OS — Global AI Manager
// The frontend NEVER calls an AI provider directly and NEVER holds
// a provider key. Every request goes through the production n8n
// "DZ Multi-AI Router" (Gemini primary, Groq automatic fallback for
// retryable failures only). The external AI.ask() interface is
// UNCHANGED from before - every existing caller (Doctor Copilot,
// Prescription Generator, Pharmacy AI Agent, Report Summary,
// AI Copilot) needed zero code changes to get automatic failover.
// ============================================================

const AI = {
  _endpoint: window.DZ_CONFIG.N8N_BASE_URL + "/dz-ai-router",

  /** Ask the AI a question. Returns { ok, text, raw, error, providerUsed,
   *  modelUsed, fallbackUsed, fallbackReason }. Never throws. */
  async ask(prompt, opts = {}) {
    try {
      const res = await fetch(this._endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt,
          temperature: opts.temperature ?? 0,
          json: !!opts.json,
          maxOutputTokens: opts.maxOutputTokens || 2000,
          taskType: opts.taskType || "copilot",
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data) return { ok: false, error: `AI service returned ${res.status}` };

      if (!data.ok) {
        dzLogAiUsage({ok:false, taskType: opts.taskType, data});
        return { ok: false, error: data.userMessage || data.primaryError?.message || "AI service unavailable" };
      }
      if (!data.content) return { ok: false, error: "AI returned no content", raw: data };

      dzLogAiUsage({ok:true, taskType: opts.taskType, data});
      return {
        ok: true, text: data.content, raw: data,
        providerUsed: data.providerUsed, modelUsed: data.modelUsed,
        fallbackUsed: !!data.fallbackUsed, fallbackReason: data.fallbackReason || "",
        usedFallback: !!data.fallbackUsed,
      };
    } catch (e) {
      return { ok: false, error: e.message || "Network error reaching AI service" };
    }
  },

  async testConnection() {
    const t0 = performance.now();
    const r = await this.ask("Reply with exactly one word: OK");
    const ms = Math.round(performance.now() - t0);
    if (!r.ok) return { connected: false, detail: r.error, latencyMs: ms };
    return { connected: true, detail: r.fallbackUsed ? `Responding via fallback (${r.providerUsed})` : `Responding normally (${r.providerUsed})`, latencyMs: ms };
  },

  async testGroqDirectly() {
    const t0 = performance.now();
    try {
      const res = await fetch(this._endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: "Reply with exactly one word: OK", temperature: 0, forceProvider: "groq" }),
      });
      const data = await res.json().catch(() => null);
      const ms = Math.round(performance.now() - t0);
      if (!res.ok || !data || !data.ok) return { connected: false, detail: data?.userMessage || `HTTP ${res.status}`, latencyMs: ms };
      return { connected: true, detail: `Responding normally (${data.modelUsed})`, latencyMs: ms };
    } catch (e) {
      return { connected: false, detail: e.message, latencyMs: Math.round(performance.now() - t0) };
    }
  },
};

/** Fire-and-forget telemetry - metadata only, never the clinical prompt/content itself. */
function dzLogAiUsage({ ok, taskType, data }) {
  try {
    if (!window.dzSupabase || !window.DZ_SESSION) return; // not signed in yet (e.g. login page test)
    window.dzSupabase.from("ai_provider_logs").insert({
      organization_id: window.DZ_SESSION.profile.organization_id,
      user_id: window.DZ_SESSION.user.id,
      request_id: data?.requestId || null,
      task_type: taskType || "copilot",
      provider_used: data?.providerUsed || null,
      model_used: data?.modelUsed || null,
      fallback_used: !!data?.fallbackUsed,
      fallback_reason: data?.fallbackReason || null,
      status: ok ? "success" : "failure",
      latency_ms: data?.latencyMs || null,
      input_token_count: data?.usage?.inputTokens || null,
      output_token_count: data?.usage?.outputTokens || null,
    }).then(() => {}, () => {}); // best-effort, never block or throw on log failure
  } catch (e) { /* never let telemetry break the actual AI response */ }
}

window.AI = AI;
