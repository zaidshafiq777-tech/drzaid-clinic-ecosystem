// ============================================================
// Dr. Zaid Healthcare OS — Queue Service
// Single source of truth for loading the token queue, used by both
// Reception and Doctor Workspace. Never relies on a single fragile
// nested Supabase select — fetches tokens, patients, and visits as
// three separate queries and joins them in JavaScript, so a
// relation/RLS/embed quirk on one table can never silently hide
// an entire token row.
// ============================================================

const DZ_ACTIVE_TOKEN_STATUSES = [
  "registered", "waiting_vitals", "vitals_done", "waiting_doctor", "with_doctor", "in_progress",
];
const DZ_DOCTOR_ACTIVE_STATUSES = [
  "waiting_doctor", "vitals_done", "with_doctor", "in_progress",
];

/** Loads today's token queue for the org. Returns { rows, debug }.
 *  `rows` is always an array (never throws for missing relations) -
 *  a token with no matching patient/visit row still appears, marked
 *  clearly instead of silently disappearing. */
async function dzLoadQueueService(orgId, { onlyToday = true, statusFilter = null } = {}) {
  const debug = { steps: [], excluded: [] };

  // STEP 1: tokens, no nested relations at all.
  let tokenQuery = window.dzSupabase.from("tokens")
    .select("id, organization_id, patient_id, visit_id, token_number, status, source, priority, payment_status, created_at, updated_at")
    .eq("organization_id", orgId);
  if (onlyToday) {
    const { startUtc, endUtc } = dzGetClinicDayRange("Asia/Karachi");
    tokenQuery = tokenQuery.gte("created_at", startUtc).lt("created_at", endUtc);
    debug.dayRange = { startUtc, endUtc };
  }
  if (statusFilter) tokenQuery = tokenQuery.in("status", statusFilter);
  const { data: rawTokens, error: tErr } = await tokenQuery.order("token_number", { ascending: true });
  if (tErr) { debug.steps.push("tokens query FAILED: " + tErr.message); return { rows: [], debug }; }
  debug.rawTokenCount = (rawTokens || []).length;
  debug.steps.push(`Step 1: fetched ${debug.rawTokenCount} raw token rows`);

  if (!rawTokens || !rawTokens.length) return { rows: [], debug };

  // STEP 2/3: fetch patients and visits separately, by the IDs we actually have.
  const patientIds = [...new Set(rawTokens.map(t => t.patient_id).filter(Boolean))];
  const visitIds = [...new Set(rawTokens.map(t => t.visit_id).filter(Boolean))];

  const [{ data: patients, error: pErr }, { data: visits, error: vErr }] = await Promise.all([
    patientIds.length
      ? window.dzSupabase.from("patients").select("id, full_name, age, gender, phone, emr_number").in("id", patientIds)
      : Promise.resolve({ data: [], error: null }),
    visitIds.length
      ? window.dzSupabase.from("visits").select("id, patient_id, visit_mode, chief_complaint, status, created_at").in("id", visitIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (pErr) debug.steps.push("patients query error (non-fatal): " + pErr.message);
  if (vErr) debug.steps.push("visits query error (non-fatal): " + vErr.message);
  debug.patientFetchCount = (patients || []).length;
  debug.visitFetchCount = (visits || []).length;
  debug.steps.push(`Step 2: fetched ${debug.patientFetchCount} patients for ${patientIds.length} ids`);
  debug.steps.push(`Step 3: fetched ${debug.visitFetchCount} visits for ${visitIds.length} ids`);

  const patientMap = new Map((patients || []).map(p => [p.id, p]));
  const visitMap = new Map((visits || []).map(v => [v.id, v]));

  // STEP 5/6: join in JS, never hide a token for a missing relation.
  let rows = rawTokens.map(t => {
    const patient = t.patient_id ? patientMap.get(t.patient_id) : null;
    const visit = t.visit_id ? visitMap.get(t.visit_id) : null;
    if (t.patient_id && !patient) debug.excluded.push({ tokenId: t.id, reason: "patient_id set but no matching patient row", patientId: t.patient_id });
    if (t.visit_id && !visit) debug.excluded.push({ tokenId: t.id, reason: "visit_id set but no matching visit row", visitId: t.visit_id });
    if (!t.patient_id) debug.excluded.push({ tokenId: t.id, reason: "token has no patient_id" });
    if (!t.visit_id) debug.excluded.push({ tokenId: t.id, reason: "token has no visit_id" });
    return {
      tokenId: t.id, visitId: t.visit_id, patientId: t.patient_id,
      tokenNumber: t.token_number, status: t.status, paymentStatus: t.payment_status,
      source: t.source, priority: t.priority || "normal", createdAt: t.created_at, updatedAt: t.updated_at,
      patient: patient ? {
        id: patient.id, fullName: patient.full_name, age: patient.age,
        gender: patient.gender, phone: patient.phone, emrNumber: patient.emr_number,
      } : null,
      visit: visit ? {
        id: visit.id, visitMode: visit.visit_mode, chiefComplaint: visit.chief_complaint, status: visit.status,
      } : null,
    };
  });

  // PART 4: normalize duplicates - group by visitId, keep newest active token per visit.
  const byVisit = new Map();
  const noVisit = [];
  rows.forEach(r => {
    if (!r.visitId) { noVisit.push(r); return; }
    const existing = byVisit.get(r.visitId);
    if (!existing || new Date(r.createdAt) > new Date(existing.createdAt)) {
      if (existing) debug.excluded.push({ tokenId: existing.tokenId, reason: "superseded by newer token on same visit", visitId: r.visitId });
      byVisit.set(r.visitId, r);
    } else {
      debug.excluded.push({ tokenId: r.tokenId, reason: "older duplicate token on same visit", visitId: r.visitId });
    }
  });
  rows = [...byVisit.values(), ...noVisit];

  // Sort: priority desc, token_number asc, created_at asc.
  const priorityRank = { urgent: 2, high: 2, normal: 1, low: 0 };
  rows.sort((a, b) => {
    const pr = (priorityRank[b.priority] ?? 1) - (priorityRank[a.priority] ?? 1);
    if (pr !== 0) return pr;
    if (a.tokenNumber !== b.tokenNumber) return a.tokenNumber - b.tokenNumber;
    return new Date(a.createdAt) - new Date(b.createdAt);
  });

  debug.normalizedCount = rows.length;
  debug.steps.push(`Normalized to ${rows.length} unique-per-visit rows (${debug.excluded.length} excluded/deduped)`);

  return { rows, debug };
}

/** Owner-only diagnostic - flags data-quality issues without deleting anything. */
async function dzQueueDiagnostics(orgId) {
  const { data: tokens } = await window.dzSupabase.from("tokens").select("id, visit_id, patient_id, status, created_at").eq("organization_id", orgId);
  const issues = { multipleActivePerVisit: [], missingPatientId: [], missingVisitId: [] };
  const byVisit = new Map();
  (tokens || []).forEach(t => {
    if (!t.patient_id) issues.missingPatientId.push(t.id);
    if (!t.visit_id) issues.missingVisitId.push(t.id);
    if (t.visit_id && DZ_ACTIVE_TOKEN_STATUSES.includes(t.status)) {
      if (!byVisit.has(t.visit_id)) byVisit.set(t.visit_id, []);
      byVisit.get(t.visit_id).push(t.id);
    }
  });
  byVisit.forEach((ids, visitId) => { if (ids.length > 1) issues.multipleActivePerVisit.push({ visitId, tokenIds: ids }); });
  return issues;
}
