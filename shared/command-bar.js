// ============================================================
// Dr. Zaid Healthcare OS — Command Bar (Ctrl+K)
// Real navigation between existing modules + real patient search
// against Supabase (RLS-scoped to the signed-in user's org).
// No fake suggestions, no static demo results.
// ============================================================

const DZ_NAV_COMMANDS = [
  { label: "Open Owner Dashboard",   go: "../owner/dashboard.html",     roles: ["org_owner","branch_admin","super_admin"] },
  { label: "Open Reception",         go: "../reception/dashboard.html", roles: ["org_owner","branch_admin","super_admin","receptionist","billing"] },
  { label: "Open Doctor Workspace",  go: "../doctor/dashboard.html",    roles: ["org_owner","branch_admin","super_admin","doctor"] },
  { label: "Open Pharmacy",          go: "../pharmacy/dashboard.html",  roles: ["org_owner","branch_admin","super_admin","pharmacist"] },
  { label: "Open Lab",               go: "../lab/dashboard.html",       roles: ["org_owner","branch_admin","super_admin","lab_technician"] },
  { label: "Open Patient Portal",    go: "../patient/portal.html",      roles: ["org_owner","branch_admin","super_admin","receptionist"] },
  { label: "Open Settings",          go: "../settings/settings.html",   roles: ["org_owner","branch_admin","super_admin"] },
  { label: "Open API & Integrations Status", go: "../settings/api-settings.html", roles: ["org_owner","branch_admin","super_admin"] },
  { label: "Open Prescription Print Desk", go: "../print-desk/dashboard.html", roles: ["org_owner","branch_admin","super_admin","doctor","receptionist"] },
];

let _dzCmdOpen = false;

function dzCommandBarInit(profile) {
  const root = document.createElement("div");
  root.id = "dz-cmdk-root";
  root.innerHTML = `
    <div id="dz-cmdk-overlay" style="display:none;position:fixed;inset:0;background:rgba(6,20,15,.45);z-index:200;align-items:flex-start;justify-content:center;padding-top:12vh">
      <div style="background:#fff;width:100%;max-width:560px;border-radius:14px;box-shadow:0 20px 60px rgba(0,0,0,.3);overflow:hidden">
        <input id="dz-cmdk-input" placeholder="Search patients, or type a command…" autocomplete="off"
          style="width:100%;border:none;padding:16px 18px;font-size:15.5px;font-family:inherit;box-sizing:border-box;border-bottom:1px solid #E2E8F0;outline:none">
        <div id="dz-cmdk-results" style="max-height:340px;overflow-y:auto;padding:6px"></div>
        <div style="padding:8px 16px;font-size:11px;color:#94A3B8;border-top:1px solid #F1F5F9">Ctrl/Cmd + K to open &middot; Esc to close</div>
      </div>
    </div>`;
  document.body.appendChild(root);

  const overlay = document.getElementById("dz-cmdk-overlay");
  const input = document.getElementById("dz-cmdk-input");
  const results = document.getElementById("dz-cmdk-results");

  function open() {
    _dzCmdOpen = true;
    overlay.style.display = "flex";
    input.value = "";
    renderNavDefaults();
    setTimeout(() => input.focus(), 30);
  }
  function close() {
    _dzCmdOpen = false;
    overlay.style.display = "none";
  }
  window.dzCommandBarOpen = open;

  function renderRow(label, sub, onClick) {
    const row = document.createElement("div");
    row.style.cssText = "padding:11px 14px;border-radius:8px;cursor:pointer;font-size:13.5px;display:flex;justify-content:space-between;align-items:center";
    row.innerHTML = `<span>${label}</span>${sub ? `<span style="font-size:11px;color:#94A3B8">${sub}</span>` : ""}`;
    row.onmouseenter = () => row.style.background = "#F2FAF7";
    row.onmouseleave = () => row.style.background = "";
    row.onclick = onClick;
    results.appendChild(row);
  }

  function renderNavDefaults() {
    results.innerHTML = "";
    DZ_NAV_COMMANDS.filter((c) => c.roles.includes(profile.role)).forEach((c) =>
      renderRow(c.label, "Navigate", () => (window.location.href = c.go))
    );
  }

  let searchTimer = null;
  input.addEventListener("input", () => {
    const q = input.value.trim();
    clearTimeout(searchTimer);
    if (!q) { renderNavDefaults(); return; }
    results.innerHTML = `<div style="padding:12px 14px;font-size:12.5px;color:#94A3B8">Searching…</div>`;
    searchTimer = setTimeout(async () => {
      try {
        const { data, error } = await window.dzSupabase
          .from("patients")
          .select("id, full_name, phone")
          .eq("organization_id", profile.organization_id)
          .or(`full_name.ilike.%${q}%,phone.ilike.%${q}%`)
          .limit(6);
        results.innerHTML = "";
        if (error) throw error;
        if (!data || !data.length) {
          results.innerHTML = `<div style="padding:12px 14px;font-size:12.5px;color:#94A3B8">No matching patients.</div>`;
          return;
        }
        data.forEach((p) => renderRow(p.full_name, p.phone || "", () => {
          window.location.href = `../reception/dashboard.html?patient=${p.id}`;
        }));
      } catch (e) {
        results.innerHTML = `<div style="padding:12px 14px;font-size:12.5px;color:#C0362C">Search failed: ${e.message}</div>`;
      }
    }, 280);
  });

  overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });
  document.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); _dzCmdOpen ? close() : open(); }
    if (e.key === "Escape" && _dzCmdOpen) close();
  });
}
