// ============================================================
// Dr. Zaid Healthcare OS — Prescription Safety Layer
// Every warning here is computed from real, on-file patient data
// or from real ages/gender. Nothing is invented. Warnings never
// block the doctor — they only inform.
// ============================================================

function dzRunSafetyChecks(draft, context) {
  const warnings = [];

  // Allergy conflict — real substring match against real allergy records.
  if (context.allergies && context.allergies.length && draft.medicines) {
    const allergyTexts = context.allergies.map(a => a.allergy.toLowerCase());
    draft.medicines.forEach((m) => {
      const name = (m.name || "").toLowerCase();
      allergyTexts.forEach((a) => {
        if (a && name.includes(a)) {
          warnings.push({ level: "critical", text: `Possible allergy conflict: patient has a recorded allergy to "${a}", prescribed medicine is "${m.name}".` });
        }
      });
    });
  }

  // Pregnancy-age heuristic — a flag to prompt the doctor to check, not a diagnosis.
  const age = Number(context.demographics.age);
  if (context.demographics.gender && /female/i.test(context.demographics.gender) && age >= 12 && age <= 50) {
    warnings.push({ level: "info", text: "Patient is of reproductive age — confirm pregnancy status before prescribing, if relevant to the medicines chosen." });
  }

  // Pediatric caution
  if (age && age < 12) {
    warnings.push({ level: "warning", text: "Pediatric patient — confirm all doses are weight/age-appropriate." });
  }

  // Elderly caution
  if (age && age >= 65) {
    warnings.push({ level: "warning", text: "Elderly patient — consider renal/hepatic dose adjustment and fall/interaction risk." });
  }

  // Duplicate therapy — real check against patient's on-file active medications.
  if (context.activeMedications && context.activeMedications.length && draft.medicines) {
    const activeNames = context.activeMedications.map(m => m.medicine_name.toLowerCase());
    draft.medicines.forEach((m) => {
      const name = (m.name || "").toLowerCase();
      if (activeNames.some(a => a && name.includes(a))) {
        warnings.push({ level: "warning", text: `"${m.name}" may duplicate an already-active medicine on file.` });
      }
    });
  }

  // Red flags surfaced by the AI itself (from the transcript), if any.
  if (draft.red_flags && draft.red_flags.length) {
    draft.red_flags.forEach((f) => warnings.push({ level: "critical", text: "Red flag from consultation: " + f }));
  }

  // Honest limitation — always shown once, not a per-medicine fake check.
  warnings.push({ level: "note", text: "Drug-drug interaction checking is not available — it requires a licensed interaction database, not currently integrated. See DATABASE_CHANGES_REQUIRED.md." });

  return warnings;
}
