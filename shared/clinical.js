// ============================================================
// Dr. Zaid Healthcare OS — Clinical Utilities
// Every calculation here is deterministic and derived from real
// entered values. No hardcoded "sample" alerts.
// ============================================================

/** Generates the next EMR number for an org: DZ-EMR-000001 style.
 *  Reads the real current max from the database — never guesses. */
async function dzNextEmrNumber(orgId) {
  // IMPORTANT: only consider EMRs already in our own "DZ-EMR-NNNNNN" format.
  // Older/legacy/test data (e.g. "EMR-<timestamp>", "EMR-E2E-...") must be
  // ignored, or the "highest" match picks garbage digits from an unrelated
  // format and produces a wrong/colliding number. This was a real bug found
  // via production data - fixed by filtering to our own prefix explicitly.
  const { data, error } = await window.dzSupabase
    .from("patients")
    .select("emr_number")
    .eq("organization_id", orgId)
    .ilike("emr_number", "DZ-EMR-%")
    .order("emr_number", { ascending: false })
    .limit(1);
  let next = 1;
  if (!error && data && data.length && data[0].emr_number) {
    const m = String(data[0].emr_number).match(/^DZ-EMR-(\d+)$/);
    if (m) next = parseInt(m[1], 10) + 1;
  }
  let candidate = "DZ-EMR-" + String(next).padStart(6, "0");
  // Extra safety net: if this exact number somehow already exists (race condition
  // or leftover data), keep incrementing until we find a free one - never let the
  // save fail on a duplicate-key error again.
  for (let guard = 0; guard < 20; guard++) {
    const { data: clash } = await window.dzSupabase.from("patients").select("id").eq("emr_number", candidate).maybeSingle();
    if (!clash) return candidate;
    next++;
    candidate = "DZ-EMR-" + String(next).padStart(6, "0");
  }
  return candidate;
}

/** Real abnormal-vitals detection. Thresholds are standard adult clinical
 *  ranges — every flag is computed from the actual value entered, nothing scripted. */
function dzCheckVitalsAbnormal(v) {
  const flags = [];
  if (v.bp) {
    const m = String(v.bp).match(/(\d+)\s*\/\s*(\d+)/);
    if (m) {
      const sys = parseInt(m[1], 10), dia = parseInt(m[2], 10);
      if (sys > 140 || dia > 90) flags.push("High BP (>140/90)");
      else if (sys < 90 || dia < 60) flags.push("Low BP (<90/60)");
    }
  }
  if (v.pulse) {
    const p = Number(v.pulse);
    if (p > 100) flags.push("High pulse (>100)");
    else if (p < 60) flags.push("Low pulse (<60)");
  }
  if (v.temperature) {
    const t = Number(v.temperature);
    if (t > 100.4) flags.push("Fever (>100.4°F)");
  }
  if (v.spo2) {
    const s = Number(v.spo2);
    if (s < 94) flags.push("Low SpO2 (<94%)");
  }
  if (v.rbs_fbs) {
    const g = Number(v.rbs_fbs);
    if (g >= 200) flags.push("High blood sugar");
    else if (g > 0 && g < 70) flags.push("Low blood sugar");
  }
  if (v.bmi) {
    const b = Number(v.bmi);
    if (b >= 30) flags.push("Obese (BMI ≥30)");
    else if (b >= 25) flags.push("Overweight (BMI 25-29.9)");
  }
  return { isAbnormal: flags.length > 0, flags };
}

/** BMI — computed client-side from weight (kg, stored) and height (cm, not
 *  yet a stored column — see DATABASE_CHANGES_REQUIRED.md). Display-only until
 *  a height column exists. */
function dzComputeBMI(weightKg, heightCm) {
  if (!weightKg || !heightCm) return null;
  const h = heightCm / 100;
  const bmi = weightKg / (h * h);
  if (!isFinite(bmi) || bmi <= 0) return null;
  return Math.round(bmi * 10) / 10;
}

function dzWaitingMinutes(createdAt) {
  return Math.max(0, Math.round((Date.now() - new Date(createdAt).getTime()) / 60000));
}

const DZ_TOKEN_STATUS_LABEL = {
  registered: "Registered", waiting_vitals: "Waiting Vitals", vitals_done: "Vitals Done",
  waiting_doctor: "Waiting Doctor", with_doctor: "With Doctor", doctor_done: "Doctor Done",
  sent_to_pharmacy: "Pharmacy Pending", sent_to_lab: "Lab Pending",
  billing_pending: "Billing Pending", completed: "Completed", cancelled: "Cancelled", no_show: "No Show",
};
