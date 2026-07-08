// ============================================================
// Dr. Zaid Healthcare OS — Global Automation Manager
// Automation.execute(name, payload) is the ONLY way any module
// triggers a workflow. Only names in KNOWN_AUTOMATIONS map to a
// real, production n8n webhook. Anything else fails loudly and
// honestly — it never pretends to succeed.
// ============================================================

const KNOWN_AUTOMATIONS = {
  "patient.intake": "/patient-intake",
  "prescription.approved": "/prescription-approved",
  "booking.create": "/booking-create",
  "queue.status": "/queue-status",
  "ai.generate": "/gemini-ai",
};

const Automation = {
  /** List what's actually wired — used by API Settings / n8n status panel. */
  list() {
    return Object.keys(KNOWN_AUTOMATIONS).map((name) => ({
      name,
      endpoint: window.DZ_CONFIG.N8N_BASE_URL + KNOWN_AUTOMATIONS[name],
    }));
  },

  /** Execute a known automation. Returns { ok, data, error }.
   *  Unknown automation names are refused, not silently faked. */
  async execute(name, payload = {}) {
    const path = KNOWN_AUTOMATIONS[name];
    if (!path) {
      return { ok: false, error: `"${name}" is not a configured automation. No n8n workflow is wired for it yet.` };
    }
    try {
      const res = await fetch(window.DZ_CONFIG.N8N_BASE_URL + path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) return { ok: false, error: `Automation "${name}" returned ${res.status}` };
      const data = await res.json().catch(() => ({}));
      return { ok: true, data };
    } catch (e) {
      return { ok: false, error: e.message || `Network error running "${name}"` };
    }
  },
};

window.Automation = Automation;
