// ============================================================
// Dr. Zaid Healthcare OS — Prescription Agent
// Observe -> Think -> Recommend -> Act -> (Doctor Approval) -> Learn
// Every field of context sent to the AI is real, queried data.
// The AI's output is a DRAFT ONLY — never auto-saved.
// ============================================================

/** OBSERVE: gather everything real we know about this patient/visit. */
async function dzGatherConsultationContext(patient, visit, tokenRow) {
  const [{ data: vitalsRows }, { data: allergies }, { data: chronic }, { data: activeMeds }, { data: history }] = await Promise.all([
    window.dzSupabase.from("vitals").select("*").eq("visit_id", visit.id).order("created_at", { ascending: false }).limit(1),
    window.dzSupabase.from("allergies").select("allergy, severity").eq("patient_id", patient.id),
    window.dzSupabase.from("chronic_conditions").select("condition, since_date").eq("patient_id", patient.id),
    window.dzSupabase.from("active_medications").select("medicine_name, dosage").eq("patient_id", patient.id).eq("active", true),
    window.dzSupabase.from("prescriptions").select("diagnosis, created_at").eq("patient_id", patient.id).order("created_at", { ascending: false }).limit(3),
  ]);
  return {
    demographics: { name: patient.full_name, age: patient.age, gender: patient.gender, phone: patient.phone, emr: patient.emr_number },
    vitals: (vitalsRows || [])[0] || null,
    allergies: allergies || [],
    chronicConditions: chronic || [],
    activeMedications: activeMeds || [],
    previousVisits: history || [],
    chiefComplaintOnFile: visit.chief_complaint || "",
  };
}

const DZ_RX_SCHEMA_EXAMPLE = `{
  "chief_complaint": "", "history": "", "examination": "", "vitals_summary": "",
  "provisional_diagnosis": "", "differential_diagnosis": [], "red_flags": [],
  "medicines": [{"name":"","strength":"","dose":"","frequency":"","duration":"","instructions":"","quantity":""}],
  "investigations": [], "advice_english": "", "advice_urdu": "", "follow_up": "",
  "referral": "", "safety_notes": "", "doctor_review_required": true
}`;

/** THINK + RECOMMEND + ACT: send real transcript + real context to the AI, get a structured draft.
 *  Returns { ok, data, error }. Never fabricates a prescription without a transcript. */
async function dzGeneratePrescriptionFromConsultation(transcript, context) {
  if (!transcript || transcript.trim().length < 15) {
    return { ok: false, error: "Transcript is too short to analyze. Record more of the consultation or type it manually." };
  }
  const ctxLines = [
    `Patient: ${context.demographics.name}, ${context.demographics.age || "age not on file"} ${context.demographics.gender || ""}, EMR ${context.demographics.emr || "—"}.`,
    context.vitals ? `Vitals: BP ${context.vitals.bp||"-"}, Pulse ${context.vitals.pulse||"-"}, Temp ${context.vitals.temperature||"-"}, SpO2 ${context.vitals.spo2||"-"}, RBS/FBS ${context.vitals.rbs_fbs||"-"}${context.vitals.is_abnormal?" (flagged abnormal)":""}.` : "Vitals: not recorded for this visit.",
    context.allergies.length ? `Known allergies: ${context.allergies.map(a=>a.allergy+(a.severity?` (${a.severity})`:"")).join(", ")}.` : "Known allergies: none on file.",
    context.chronicConditions.length ? `Chronic conditions: ${context.chronicConditions.map(c=>c.condition).join(", ")}.` : "Chronic conditions: none on file.",
    context.activeMedications.length ? `Current medicines: ${context.activeMedications.map(m=>m.medicine_name).join(", ")}.` : "Current medicines: none on file.",
    context.previousVisits.length ? `Previous visits: ${context.previousVisits.map(v=>v.diagnosis).filter(Boolean).join("; ")}.` : "Previous visits: none on file (first visit).",
    `On-file chief complaint: ${context.chiefComplaintOnFile || "not specified"}.`,
  ].join("\n");

  const prompt = `You are a clinical scribe assisting a Pakistani family physician (Dr. Zaid Shafique, MBBS). The consultation below may be in Roman Urdu, Urdu, English, or mixed — understand all of these.

REAL PATIENT CONTEXT (use this, do not invent beyond it):
${ctxLines}

FULL CONSULTATION TRANSCRIPT:
"""
${transcript.trim()}
"""

Produce a structured prescription DRAFT for the doctor to review — this is never final without doctor approval.
RULES:
- If something is not clearly mentioned in the transcript or context, write exactly "Not clearly mentioned" for that field — never invent it.
- Never invent a dangerous medication or a specific dose you cannot support from the transcript/context.
- Medicine strengths/doses should reflect what was actually said; if unclear, note "confirm with doctor" in instructions rather than guessing a number.
- advice_urdu must be written in Roman Urdu or Urdu script, simple and practical.
- Return ONLY a raw JSON object, no markdown fences, no preamble, no explanation text before or after. Exact shape:
${DZ_RX_SCHEMA_EXAMPLE}`;

  const r = await AI.ask(prompt, { json: true, temperature: 0 });
  if (!r.ok) return { ok: false, error: r.error };

  let text = r.text.replace(/```json|```/g, "").trim();
  const jStart = text.indexOf("{");
  const jEnd = text.lastIndexOf("}");
  if (jStart === -1 || jEnd === -1 || jEnd < jStart) {
    return { ok: false, error: "AI did not return structured JSON. Try Regenerate, or fill the prescription manually." };
  }
  try {
    const data = JSON.parse(text.slice(jStart, jEnd + 1));
    return { ok: true, data };
  } catch (e) {
    return { ok: false, error: "AI response could not be parsed (" + e.message + "). Try Regenerate." };
  }
}
