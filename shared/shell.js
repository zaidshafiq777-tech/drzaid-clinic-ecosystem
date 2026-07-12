// ============================================================
// Dr. Zaid Healthcare Operating System — Shell Renderer
// Builds the consistent sidebar + topbar for every dashboard.
// Nav items shown are role-appropriate; each dashboard passes its own key.
// ============================================================

const DZ_NAV_ITEMS = [
  { key: "owner",     label: "Owner Dashboard", href: "../owner/dashboard.html",     icon: "◆", roles: ["org_owner","branch_admin","super_admin"] },
  { key: "reception",  label: "Reception",       href: "../reception/dashboard.html", icon: "▤", roles: ["org_owner","branch_admin","super_admin","receptionist","billing"] },
  { key: "doctor",     label: "Doctor",          href: "../doctor/dashboard.html",    icon: "✚", roles: ["org_owner","branch_admin","super_admin","doctor"] },
  { key: "pharmacy",   label: "Pharmacy",        href: "../pharmacy/dashboard.html",  icon: "℞", roles: ["org_owner","branch_admin","super_admin","pharmacist"] },
  { key: "lab",        label: "Lab",             href: "../lab/dashboard.html",       icon: "⚗", roles: ["org_owner","branch_admin","super_admin","lab_technician"] },
  { key: "printdesk",  label: "Print Desk",      href: "../print-desk/dashboard.html", icon: "🖨", roles: ["org_owner","branch_admin","super_admin","doctor","receptionist"] },
  { key: "patient",    label: "Patient Portal",  href: "../patient/portal.html",      icon: "⌂", roles: ["org_owner","branch_admin","super_admin","receptionist"] },
  { key: "settings",   label: "Settings",        href: "../settings/settings.html",   icon: "⚙", roles: ["org_owner","branch_admin","super_admin"] },
];

function dzRenderShell({ activeKey, title, profile }) {
  const role = profile.role;
  const navHtml = DZ_NAV_ITEMS
    .filter(item => item.roles.includes(role))
    .map(item => `<a href="${item.href}" class="${item.key===activeKey?'active':''}"><span class="icon">${item.icon}</span>${item.label}</a>`)
    .join("");

  const initials = (profile.full_name || "?").split(" ").map(w => w[0]).join("").slice(0,2).toUpperCase();

  document.getElementById("dz-shell-root").innerHTML = `
    <div class="dz-shell">
      <aside class="dz-sidebar" id="dz-sidebar">
        <div class="dz-sidebar-brand">
          <img src="../assets/icon-192.png" alt="">
          <div>
            <div class="name">Dr. Zaid Healthcare OS</div>
            <div class="tag">Clinic Operations</div>
          </div>
        </div>
        <nav class="dz-nav">${navHtml}</nav>
        <div class="dz-sidebar-foot">Production &middot; v1.0 Milestone 1</div>
      </aside>
      <div class="dz-main">
        <header class="dz-topbar">
          <div style="display:flex;align-items:center;gap:10px">
            <button class="dz-menu-btn" onclick="document.getElementById('dz-sidebar').classList.toggle('open')">☰</button>
            <div class="dz-topbar-title">${title}</div>
          </div>
          <div class="dz-topbar-right">
            <span class="dz-live"><span class="dot"></span>Live</span>
            <span class="dz-clock" id="dz-clock"></span>
            <div class="dz-user">
              <div class="dz-avatar">${initials}</div>
              <div class="who"><b>${profile.full_name||''}</b><span>${dzRoleLabel(role)}</span></div>
            </div>
            <button class="dz-logout" onclick="dzLogout()">Log out</button>
          </div>
        </header>
        <main class="dz-content" id="dz-content"></main>
      </div>
    </div>
  `;

  const tick = () => {
    const el = document.getElementById("dz-clock");
    if (el) el.textContent = new Date().toLocaleString("en-GB",{weekday:"short",day:"2-digit",month:"short",hour:"2-digit",minute:"2-digit"});
  };
  tick();
  setInterval(tick, 30000);
}

/** Renders a real, live-queried count card. Shows the real number (including 0) — never a fake number. */
function dzCard(label, value, note) {
  const shown = (value === null || value === undefined) ? '<span class="muted">—</span>' : value;
  return `<div class="dz-card"><div class="label">${label}</div><div class="value">${shown}</div>${note?`<div class="note">${note}</div>`:''}</div>`;
}

function dzEmptyState(glyph, title, desc) {
  return `<div class="dz-empty"><div class="glyph">${glyph}</div><div class="title">${title}</div><div class="desc">${desc}</div></div>`;
}
