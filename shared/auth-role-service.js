// ============================================================
// Dr. Zaid Healthcare OS — Auth Role Service
// Central place for profile/role/permission logic. Built ON TOP of
// the existing shared/auth.js (dzRequireSession, DZ_ROLE_HOME) -
// that file is untouched so every existing page keeps working.
// This is the single source of truth for the NEW profile/approval
// system and permission checks.
// ============================================================

// The verified real owner account for this clinic (confirmed against
// production data - do not change without re-verifying in Supabase).
const DZ_OWNER_EMAIL = "zaidshafiq777@gmail.com";

// Role dropdown (Profile Setup) -> real backend role value already used
// everywhere else in this app. Reusing the existing vocabulary is
// deliberate: introducing new role strings would break every existing
// dzRequireSession(allowedRoles) call across 15+ pages.
const DZ_ROLE_DROPDOWN = [
  { label: "Doctor", value: "doctor" },
  { label: "Receptionist", value: "receptionist" },
  { label: "Pharmacist", value: "pharmacist" },
  { label: "Lab Staff", value: "lab_technician" },
  { label: "Nurse / LHV", value: "nurse" },
  { label: "Accountant", value: "billing" },
  { label: "Owner / Administrator", value: "org_owner" },
];

const DZ_PORTAL_BY_ROLE = {
  org_owner: "../owner/dashboard.html", branch_admin: "../owner/dashboard.html", super_admin: "../owner/dashboard.html",
  doctor: "../doctor/dashboard.html", receptionist: "../reception/dashboard.html", billing: "../reception/dashboard.html",
  pharmacist: "../pharmacy/dashboard.html", lab_technician: "../lab/dashboard.html", nurse: "../reception/vitals.html",
};

// Permission-ready mapping (role -> permission strings). Role is the
// active access level today; permissions are prepared for future
// per-user grants without needing another rewrite.
const DZ_ROLE_PERMISSIONS = {
  org_owner: ["owner.all"],
  branch_admin: ["owner.all"],
  super_admin: ["owner.all"],
  doctor: ["doctor.workspace","doctor.prescription","doctor.reports","doctor.lab_orders","doctor.pharmacy_handoff","ai.copilot"],
  receptionist: ["reception.registration","reception.queue","reception.appointments","ai.copilot"],
  billing: ["billing.manage","billing.receipts","billing.payments"],
  pharmacist: ["pharmacy.dispense","pharmacy.inventory","pharmacy.alerts","ai.copilot"],
  lab_technician: ["lab.queue","lab.samples","lab.reports"],
  nurse: ["nursing.vitals","nursing.notes"],
};

async function getCurrentUser() {
  const { data: { session } } = await window.dzSupabase.auth.getSession();
  return session?.user || null;
}

async function getCurrentProfile() {
  const user = await getCurrentUser();
  if (!user) return null;
  const { data, error } = await window.dzSupabase.from("profiles").select("*").eq("id", user.id).maybeSingle();
  if (error) { console.warn("[AuthRoleService] profile fetch failed", error); return null; }
  return data;
}

/** Ensures a profile row exists for the signed-in user. Applies the owner
 *  bootstrap automatically for the verified owner email; otherwise creates
 *  a minimal incomplete profile the Profile Setup screen will fill in. */
async function ensureProfileExists() {
  const user = await getCurrentUser();
  if (!user) return null;
  let profile = await getCurrentProfile();
  const email = (user.email || "").toLowerCase().trim();
  const isOwnerEmail = email === DZ_OWNER_EMAIL;

  if (!profile) {
    const { data: created, error } = await window.dzSupabase.from("profiles").insert({
      id: user.id, email, full_name: user.user_metadata?.full_name || "",
      profile_completed: isOwnerEmail, status: isOwnerEmail ? "active" : "pending",
      role: isOwnerEmail ? "org_owner" : null, is_super_admin: isOwnerEmail,
    }).select("*").single();
    if (error) { console.warn("[AuthRoleService] profile create failed", error); return null; }
    profile = created;
  } else if (isOwnerEmail && (!profile.is_super_admin || profile.status !== "active")) {
    // Owner must never get stuck pending, even if their row existed before this system.
    const { data: fixed } = await window.dzSupabase.from("profiles").update({
      role: "org_owner", status: "active", is_super_admin: true, profile_completed: true,
    }).eq("id", user.id).select("*").single();
    if (fixed) profile = fixed;
  }
  return profile;
}

async function isOwner() {
  const profile = await getCurrentProfile();
  return !!profile && (profile.is_super_admin === true || profile.role === "org_owner");
}

function hasRole(profile, role) {
  return !!profile && profile.role === role;
}

function hasPermission(profile, permission) {
  if (!profile) return false;
  const perms = DZ_ROLE_PERMISSIONS[profile.role] || [];
  return perms.includes("owner.all") || perms.includes(permission);
}

function getDefaultPortal(role) {
  return DZ_PORTAL_BY_ROLE[role] || "../shared/profile-setup.html";
}

/** Full gate: session -> profile existence/completeness -> status -> role.
 *  Returns the profile on success, or null after redirecting appropriately.
 *  This is the NEW entry point pages should migrate to over time; existing
 *  pages using dzRequireSession() from auth.js are unaffected. */
async function requireRole(allowedRoles) {
  const user = await getCurrentUser();
  if (!user) { window.location.href = "../shared/login.html"; return null; }

  const profile = await ensureProfileExists();
  if (!profile) { window.location.href = "../shared/login.html"; return null; }

  if (!profile.profile_completed || !profile.role) {
    window.location.href = "../shared/profile-setup.html";
    return null;
  }
  if (profile.status === "pending") {
    window.location.href = "../shared/profile-setup.html?status=pending";
    return null;
  }
  if (profile.status === "rejected") {
    window.location.href = "../shared/profile-setup.html?status=rejected";
    return null;
  }
  if (profile.status === "suspended") {
    window.location.href = "../shared/profile-setup.html?status=suspended";
    return null;
  }
  if (allowedRoles && !allowedRoles.includes(profile.role) && profile.role !== "org_owner" && !profile.is_super_admin) {
    alert("Access denied for your assigned role.");
    window.location.href = getDefaultPortal(profile.role);
    return null;
  }
  window.DZ_SESSION = { user, profile };
  return window.DZ_SESSION;
}

async function logout() {
  await window.dzSupabase.auth.signOut();
  window.location.href = "../shared/login.html";
}
