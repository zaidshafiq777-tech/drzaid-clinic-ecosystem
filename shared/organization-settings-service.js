// ============================================================
// Dr. Zaid Healthcare OS — Organization Settings Service
// Single source of truth for clinic/branding/prescription-header
// data. Every module (prescription renderer, patient portal, login,
// receipts) must read through this - never hardcode clinic details.
// Multi-tenant safe: every read/write is scoped to the current
// user's organization_id via RLS + explicit .eq() filters.
// ============================================================

let _dzOrgCache = null;

async function getCurrentOrganization() {
  const profile = window.DZ_SESSION?.profile || await getCurrentProfile();
  if (!profile?.organization_id) return null;
  if (_dzOrgCache && _dzOrgCache.id === profile.organization_id) return _dzOrgCache;
  const { data, error } = await window.dzSupabase.from("organizations").select("*").eq("id", profile.organization_id).maybeSingle();
  if (error) { console.warn("[OrgSettings] load failed", error); return null; }
  _dzOrgCache = data;
  return data;
}

async function getCurrentBranch() {
  // Multi-branch is a prepared-but-not-yet-enabled feature (see feature_settings.multi_branch_enabled).
  const org = await getCurrentOrganization();
  return org ? { id: org.id, name: org.name } : null;
}

async function loadOrganizationSettings() {
  _dzOrgCache = null; // force fresh read
  return await getCurrentOrganization();
}

/** Owner-tier only (enforced by RLS + trigger regardless of frontend). */
async function saveOrganizationSettings(patch) {
  const org = await getCurrentOrganization();
  if (!org) return { ok: false, error: "No organization found for your account." };
  const me = await getCurrentUser();
  const { data, error } = await window.dzSupabase.from("organizations")
    .update({ ...patch, updated_by: me?.id }).eq("id", org.id).select("*").single();
  if (error) return { ok: false, error: error.message };
  _dzOrgCache = data;
  return { ok: true, organization: data };
}

/** Real per-doctor override: if the CURRENT LOGGED-IN USER is a doctor with
 *  their own qualification/registration on file, use that; otherwise fall
 *  back to the organization's default doctor. Never hardcoded. */
async function getPrescriptionHeaderConfig() {
  const org = await getCurrentOrganization();
  if (!org) return null;
  const profile = window.DZ_SESSION?.profile || await getCurrentProfile();
  const useCurrentDoctor = profile?.role === "doctor" && profile.full_name;

  const settings = org.prescription_settings || {};
  return {
    clinicName: org.name,
    logoUrl: settings.show_logo !== false ? org.prescription_logo_url || org.logo_url : null,
    doctorName: useCurrentDoctor ? profile.full_name : org.default_doctor_name,
    qualification: useCurrentDoctor ? (profile.qualification || org.default_doctor_qualification) : org.default_doctor_qualification,
    title: useCurrentDoctor ? (profile.department || org.default_doctor_title) : org.default_doctor_title,
    registrationNumber: useCurrentDoctor ? (profile.registration_number || org.default_doctor_registration_number) : org.default_doctor_registration_number,
    phone: org.phone_primary,
    whatsapp: org.whatsapp,
    address: org.address,
    email: settings.show_contact !== false ? org.email : null,
    website: settings.show_contact !== false ? org.website : null,
    footerText: org.footer_text,
    settings, // show_logo/show_clinic_name/.../compact_mode_default/paper_size etc, raw for the renderer to check
  };
}

async function getReceiptConfig() {
  const org = await getCurrentOrganization();
  if (!org) return null;
  return {
    clinicName: org.name, logoUrl: org.logo_url, address: org.address, phone: org.phone_primary,
    receiptPrefix: org.receipt_prefix || "RCT", footerText: org.footer_text,
    paymentSettings: org.payment_settings || {},
  };
}

async function getBrandingConfig() {
  const org = await getCurrentOrganization();
  if (!org) return { primaryColor: "#0B5C46", secondaryColor: "#062A20", accentColor: "#15806A", name: "Dr. Zaid Healthcare OS", logoUrl: null };
  return {
    name: org.name, tagline: org.tagline, logoUrl: org.logo_url, faviconUrl: org.favicon_url,
    primaryColor: org.primary_color || "#0B5C46", secondaryColor: org.secondary_color || "#062A20", accentColor: org.accent_color || "#15806A",
  };
}

async function getClinicHours() {
  const org = await getCurrentOrganization();
  return org?.clinic_hours || {};
}

async function getPaymentSettings() {
  const org = await getCurrentOrganization();
  return org?.payment_settings || {};
}

async function getFeatureSettings() {
  const org = await getCurrentOrganization();
  return org?.feature_settings || { ai_enabled: true, pharmacy_enabled: true, lab_enabled: true, billing_enabled: false };
}

/** Uploads a branding asset to Supabase Storage (organization-assets bucket,
 *  path organization_id/kind/filename), returns the public URL. */
async function uploadOrganizationAsset(file, kind) {
  const org = await getCurrentOrganization();
  if (!org) return { ok: false, error: "No organization found." };
  const ALLOWED = ["image/png","image/jpeg","image/jpg","image/webp","image/svg+xml"];
  if (!ALLOWED.includes(file.type)) return { ok: false, error: "Unsupported file type. Use PNG, JPG, WEBP, or SVG." };
  if (file.size > 5 * 1024 * 1024) return { ok: false, error: "File too large (max 5MB)." };
  const path = `${org.id}/${kind}/${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g,"_")}`;
  const { error: upErr } = await window.dzSupabase.storage.from("organization-assets").upload(path, file, { upsert: true });
  if (upErr) return { ok: false, error: upErr.message };
  const { data } = window.dzSupabase.storage.from("organization-assets").getPublicUrl(path);
  return { ok: true, url: data.publicUrl };
}

/** Applies primary/secondary/accent colors as CSS variables on the current
 *  page - lets branding show up without a hardcoded palette per tenant. */
async function applyOrganizationTheme() {
  const branding = await getBrandingConfig();
  const root = document.documentElement;
  root.style.setProperty("--clinical-700", branding.primaryColor);
  root.style.setProperty("--clinical-900", branding.secondaryColor);
  root.style.setProperty("--clinical-500", branding.accentColor);
  return branding;
}
