// ============================================================
// Dr. Zaid Healthcare OS — Global AI Manager
// The frontend NEVER calls an AI provider directly and NEVER holds
// a provider key. Every request goes through the production n8n
// "DZ Multi-AI Router" (Gemini primary, Groq automatic fallback).
//
// FIX: previously called response.json() blindly. If n8n returned
// HTTP 200 with a non-JSON body (e.g. an HTML "execution limit
// reached" page from n8n's own infrastructure, or any malformed
// response), res.json() failed silently (.catch(() => null)) and the
// user saw the confusing "AI service returned 200" message even
// though the real problem was an unparseable body. Now routes
// through the same safe text-first parser used for report analysis
// (shared/response-parser.js), which reads the body as text, tries
// several normalization strategies (markdown fences, stringified
// JSON, Gemini/Groq wrappers), and only ever reports a genuine,
// specific failure reason.
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

      const http = await dzReadHttpResponse(res);
      dzDebugLogAiResponse("ask", http);

      if (!http.ok) {
        const err = { ok: false, error: dzClassifyHttpFailure(http) };
        dzLogAiUsage({ ok: false, taskType: opts.taskType, data: null });
        return err;
      }
      if (!http.rawText || http.rawLength === 0) {
        dzLogAiUsage({ ok: false, taskType: opts.taskType, data: null });
        return { ok: false, error: "AI service returned an empty response. Please retry." };
      }

      let data = dzSafeJsonParse(http.rawText);
      if (data !== null) data = dzParseRecursive(data);
      if (data !== null) data = dzUnwrapGeminiResponse(data);
      // Also try unwrapping a raw Groq choices[] wrapper, in case anything
      // ever bypasses the router's own normalization.
      if (data && typeof data === "object" && Array.isArray(data.choices) && !data.content) {
        data = { ok: true, content: data.choices[0]?.message?.content || "", providerUsed: "groq", modelUsed: data.model || "" };
      }

      if (data === null) {
        dzLogAiUsage({ ok: false, taskType: opts.taskType, data: null });
        return { ok: false, error: "AI response could not be understood. Please retry." };
      }

      // Per the standard contract: HTTP 200 is only a real success when
      // ok !== false AND either content or data is actually present.
      const hasPayload = !!(data.content || data.data);
      if (data.ok === false || !hasPayload) {
        dzLogAiUsage({ ok: false, taskType: opts.taskType, data });
        return { ok: false, error: data.userMessage || data.primaryError?.message || data.error || "AI service unavailable" };
      }

      dzLogAiUsage({ ok: true, taskType: opts.taskType, data });
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
      const http = await dzReadHttpResponse(res);
      dzDebugLogAiResponse("testGroqDirectly", http);
      const ms = Math.round(performance.now() - t0);
      if (!http.ok) return { connected: false, detail: dzClassifyHttpFailure(http), latencyMs: ms };
      let data = dzSafeJsonParse(http.rawText);
      if (data !== null) data = dzParseRecursive(data);
      if (!data || data.ok === false || !data.content) {
        return { connected: false, detail: data?.userMessage || data?.error || "Groq did not return usable content", latencyMs: ms };
      }
      return { connected: true, detail: `Responding normally (${data.modelUsed})`, latencyMs: ms };
    } catch (e) {
      return { connected: false, detail: e.message, latencyMs: Math.round(performance.now() - t0) };
    }
  },
};

/** Sanitized, specific messages for non-200 responses - never a bare status code alone. */
function dzClassifyHttpFailure(http) {
  if (http.status === 404) return "AI router webhook is incorrect or inactive.";
  if (http.status === 401 || http.status === 403) return "AI router authorization failed.";
  if (http.status === 429) return "AI service limit has been reached. Please retry shortly.";
  if ([500, 502, 503, 504].includes(http.status)) return "AI services are temporarily unavailable. Please retry or continue manually.";
  if (http.status === 200 && http.contentType.includes("text/html")) {
    // Real, observed case: n8n itself can return an HTML page with HTTP 200
    // (e.g. its own "execution limit reached" notice) when the workflow
    // can't run at all - this is an n8n-side issue, not a code bug.
    return "AI router returned an unexpected page instead of a result - check that the n8n workflow can execute (e.g. execution quota) and is Active.";
  }
  return `AI service returned ${http.status}.`;
}

/** Owner/dev-only debug logging - console only, never shown to normal
 *  users, never includes the clinical prompt itself. */
function dzDebugLogAiResponse(callSite, http) {
  const isOwnerTier = ["org_owner","branch_admin","super_admin"].includes(window.DZ_SESSION?.profile?.role);
  if (!(isOwnerTier && window.DZ_DEBUG === true)) return;
  let topLevelKeys = [];
  try { const p = dzSafeJsonParse ? dzSafeJsonParse(http.rawText) : null; if (p && typeof p === "object") topLevelKeys = Object.keys(p); } catch (e) {}
  console.log(`[AI Debug] ${callSite}`, {
    status: http.status, contentType: http.contentType, rawLength: http.rawLength,
    topLevelKeys, rawPreview: (http.rawText || "").slice(0, 300),
  });
}

/** Fire-and-forget telemetry - metadata only, never the clinical prompt/content itself. */
function dzLogAiUsage({ ok, taskType, data }) {
  try {
    if (!window.dzSupabase || !window.DZ_SESSION) return;
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
    }).then(() => {}, () => {});
  } catch (e) { /* never let telemetry break the actual AI response */ }
}

window.AI = AI;
