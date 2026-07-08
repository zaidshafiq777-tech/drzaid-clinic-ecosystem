// ============================================================
// Dr. Zaid Healthcare OS — AI Copilot
// Persistent floating assistant. Every response is a real AI.ask()
// call through the production n8n proxy. No scripted answers.
// ============================================================

function dzCopilotInit(profile) {
  const root = document.createElement("div");
  root.innerHTML = `
    <button id="dz-copilot-fab" title="AI Copilot (real Gemini, via n8n)"
      style="position:fixed;bottom:20px;right:20px;width:52px;height:52px;border-radius:50%;background:#0B5C46;color:#fff;border:none;font-size:20px;box-shadow:0 6px 18px rgba(6,42,32,.35);z-index:150;cursor:pointer">✦</button>
    <div id="dz-copilot-panel" style="display:none;position:fixed;bottom:82px;right:20px;width:340px;max-height:460px;background:#fff;border-radius:14px;box-shadow:0 20px 50px rgba(0,0,0,.25);z-index:150;overflow:hidden;flex-direction:column">
      <div style="padding:12px 14px;background:#0B5C46;color:#fff;font-size:13px;font-weight:700;display:flex;justify-content:space-between;align-items:center">
        <span>AI Copilot</span>
        <button id="dz-copilot-close" style="background:none;border:none;color:#fff;font-size:16px;cursor:pointer">✕</button>
      </div>
      <div id="dz-copilot-msgs" style="flex:1;overflow-y:auto;padding:10px;font-size:13px;max-height:320px"></div>
      <div style="display:flex;border-top:1px solid #E2E8F0">
        <input id="dz-copilot-input" placeholder="Ask anything…" style="flex:1;border:none;padding:11px 12px;font-size:13px;font-family:inherit;outline:none">
        <button id="dz-copilot-send" style="border:none;background:#0B5C46;color:#fff;padding:0 16px;font-weight:700">→</button>
      </div>
    </div>`;
  document.body.appendChild(root);

  const fab = document.getElementById("dz-copilot-fab");
  const panel = document.getElementById("dz-copilot-panel");
  const msgs = document.getElementById("dz-copilot-msgs");
  const input = document.getElementById("dz-copilot-input");

  function bubble(text, who) {
    const d = document.createElement("div");
    d.style.cssText = `margin:6px 0;display:flex;justify-content:${who === "user" ? "flex-end" : "flex-start"}`;
    d.innerHTML = `<div style="max-width:82%;padding:8px 11px;border-radius:10px;background:${who === "user" ? "#0B5C46;color:#fff" : "#F2FAF7;color:#1A2027"}">${text}</div>`;
    msgs.appendChild(d);
    msgs.scrollTop = msgs.scrollHeight;
  }

  let greeted = false;
  fab.onclick = () => {
    panel.style.display = panel.style.display === "none" ? "flex" : "none";
    if (panel.style.display === "flex" && !greeted) {
      greeted = true;
      bubble(`Hi ${profile.full_name || ""}. I can answer questions and help you work faster. This connects to a real AI model — not a script.`, "ai");
    }
    if (panel.style.display === "flex") setTimeout(() => input.focus(), 30);
  };
  document.getElementById("dz-copilot-close").onclick = () => (panel.style.display = "none");

  async function send() {
    const q = input.value.trim();
    if (!q) return;
    input.value = "";
    bubble(q.replace(/</g, "&lt;"), "user");
    bubble(`<em>Thinking…</em>`, "ai");
    const r = await AI.ask(q);
    msgs.removeChild(msgs.lastChild);
    if (!r.ok) {
      bubble(`I couldn't reach the AI service right now (${r.error}). Please try again.`, "ai");
      return;
    }
    bubble(r.text.replace(/</g, "&lt;").replace(/\n/g, "<br>"), "ai");
  }
  document.getElementById("dz-copilot-send").onclick = send;
  input.addEventListener("keydown", (e) => { if (e.key === "Enter") send(); });
}
