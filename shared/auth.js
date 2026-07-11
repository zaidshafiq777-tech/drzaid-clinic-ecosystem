// ============================================================
// Dr. Zaid Healthcare Operating System — Auth Module
// Session check, role resolution, role-based routing, logout.
// Reuses the existing Supabase Auth + profiles table. No backend changes.
// ============================================================

const DZ_ROLE_HOME = {
  org_owner: "../owner/dashboard.html",
  branch_admin: "../owner/dashboard.html",
  super_admin: "../owner/dashboard.html",
  doctor: "../doctor/dashboard.html",
  receptionist: "../reception/dashboard.html",
  billing: "../reception/dashboard.html",
  pharmacist: "../pharmacy/dashboard.html",
  lab_technician: "../lab/dashboard.html",
};

const DZ_ROLE_LABEL = {
  org_owner: "Owner",
  branch_admin: "Admin",
  super_admin: "Super Admin",
  doctor: "Doctor",
  receptionist: "Reception",
  billing: "Accountant",
  pharmacist: "Pharmacist",
  lab_technician: "Lab Staff",
  nurse: "Nurse / LHV",
};

/** Require a live session + profile. Redirects to login if missing.
 *  If allowedRoles is passed and the profile's role isn't in it, redirects to that role's own home instead of blocking silently. */
async function dzRequireSession(allowedRoles) {
  const { data: { session } } = await window.dzSupabase.auth.getSession();
  if (!session) {
    window.location.href = "../shared/login.html";
    return null;
  }
  const { data: profile, error } = await window.dzSupabase
    .from("profiles")
    .select("id, full_name, role, organization_id")
    .eq("id", session.user.id)
    .single();

  if (error || !profile) {
    console.warn("[Auth] profile lookup failed", error);
    window.location.href = "../shared/login.html";
    return null;
  }

  if (allowedRoles && !allowedRoles.includes(profile.role)) {
    const home = DZ_ROLE_HOME[profile.role] || "../shared/login.html";
    window.location.href = home;
    return null;
  }

  window.DZ_SESSION = { user: session.user, profile };
  return window.DZ_SESSION;
}

async function dzLogout() {
  await window.dzSupabase.auth.signOut();
  window.location.href = "../shared/login.html";
}

function dzRoleLabel(role) {
  return DZ_ROLE_LABEL[role] || role || "Staff";
}
