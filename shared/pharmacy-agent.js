// ============================================================
// Dr. Zaid Healthcare OS — AI Pharmacy Agent
// Observe -> Think -> Recommend -> Act -> (Pharmacist/Doctor Approval) -> Learn
// Every check here is either a real database lookup or a real AI.ask()
// call — nothing is a canned/fake rule pretending to be clinical judgement.
// The AI NEVER changes a prescription automatically — it only returns
// suggestions for the pharmacist or doctor to act on.
// ============================================================

/** OBSERVE: gather everything real about this prescription + patient. */
async function dzPharmacyObserve(prescriptionId, patientId, orgId) {
  const [{ data: items }, { data: allergies }, { data: activeMeds }, { data: patient }, { data: prescription }] = await Promise.all([
    window.dzSupabase.from("prescription_items").select("id, medicine_name, dosage, frequency, duration, instructions").eq("prescription_id", prescriptionId),
    window.dzSupabase.from("allergies").select("allergy, severity").eq("patient_id", patientId),
    window.dzSupabase.from("active_medications").select("medicine_name").eq("patient_id", patientId).eq("active", true),
    window.dzSupabase.from("patients").select("age, gender").eq("id", patientId).single(),
    window.dzSupabase.from("prescriptions").select("diagnosis").eq("id", prescriptionId).single(),
  ]);
  return { items: items || [], allergies: allergies || [], activeMeds: activeMeds || [], patient: patient || {}, diagnosis: prescription?.diagnosis || "" };
}

/** Real stock check against real inventory (medicines + medicine_batches). */
async function dzPharmacyCheckStock(orgId, medicineName) {
  const { data: meds } = await window.dzSupabase.from("medicines")
    .select("id, name, generic_name, medicine_batches(qty, expiry_date, batch_no)")
    .eq("organization_id", orgId).ilike("name", `%${medicineName}%`).limit(3);
  if (!meds || !meds.length) return { found: false, totalQty: 0, alternatives: [] };
  const match = meds[0];
  const today = new Date();
  const validBatches = (match.medicine_batches || []).filter(b => !b.expiry_date || new Date(b.expiry_date) >= today);
  const totalQty = validBatches.reduce((s, b) => s + (b.qty || 0), 0);
  const nearestExpiry = validBatches.sort((a,b) => new Date(a.expiry_date) - new Date(b.expiry_date))[0];
  return { found: true, medicineId: match.id, genericName: match.generic_name, totalQty, nearestExpiry: nearestExpiry?.expiry_date || null };
}

/** Real generic-name-based alternative lookup (same generic, different brand, in stock). */
async function dzPharmacyFindAlternatives(orgId, medicineName, genericName) {
  if (!genericName) return [];
  const { data } = await window.dzSupabase.from("medicines")
    .select("id, name, brand_name, medicine_batches(qty)")
    .eq("organization_id", orgId).ilike("generic_name", `%${genericName}%`).limit(5);
  return (data || [])
    .filter(m => m.name.toLowerCase() !== medicineName.toLowerCase())
    .map(m => ({ name: m.name, brand: m.brand_name, qty: (m.medicine_batches||[]).reduce((s,b)=>s+(b.qty||0),0) }))
    .filter(m => m.qty > 0);
}

/** THINK + RECOMMEND: run real checks per medicine, plus one AI.ask() call for
 *  the things a database alone can't judge (dose/frequency sanity, interaction
 *  patterns, pregnancy/pediatric/renal/hepatic cautions). Returns a warnings
 *  array the pharmacist reviews - nothing here is auto-applied. */
async function dzRunPharmacyAgent(context, orgId) {
  const warnings = [];
  const stockInfo = [];

  // Real, deterministic checks first.
  for (const item of context.items) {
    const stock = await dzPharmacyCheckStock(orgId, item.medicine_name);
    stockInfo.push({ ...item, stock });
    if (!stock.found) {
      warnings.push({ level: "critical", medicine: item.medicine_name, text: `"${item.medicine_name}" not found in inventory.` });
    } else if (stock.totalQty <= 0) {
      const alts = await dzPharmacyFindAlternatives(orgId, item.medicine_name, stock.genericName);
      warnings.push({ level: "critical", medicine: item.medicine_name, text: `Out of stock.` + (alts.length ? ` Available alternative(s): ${alts.map(a=>a.name+' ('+a.qty+' in stock)').join(', ')}.` : ' No in-stock alternative found.') });
    } else if (stock.nearestExpiry) {
      const daysLeft = Math.round((new Date(stock.nearestExpiry) - new Date()) / 86400000);
      if (daysLeft <= 30) warnings.push({ level: "warning", medicine: item.medicine_name, text: `Nearest batch expires in ${daysLeft} day(s) (${stock.nearestExpiry}) - dispense this batch first (FEFO).` });
    }

    // Real allergy cross-check.
    context.allergies.forEach(a => {
      if (a.allergy && item.medicine_name.toLowerCase().includes(a.allergy.toLowerCase())) {
        warnings.push({ level: "critical", medicine: item.medicine_name, text: `Possible allergy conflict - patient has a recorded allergy to "${a.allergy}".` });
      }
    });

    // Real duplicate-therapy check against active medicines.
    context.activeMeds.forEach(m => {
      if (m.medicine_name && item.medicine_name.toLowerCase().includes(m.medicine_name.toLowerCase())) {
        warnings.push({ level: "warning", medicine: item.medicine_name, text: `May duplicate an already-active medicine on file ("${m.medicine_name}").` });
      }
    });
  }

  // Age-based real heuristics (not a diagnosis, just a prompt-the-pharmacist flag).
  const age = Number(context.patient.age);
  if (age && age < 12) warnings.push({ level: "warning", medicine: "-", text: "Pediatric patient - confirm all doses are weight/age-appropriate before dispensing." });
  if (age && age >= 65) warnings.push({ level: "warning", medicine: "-", text: "Elderly patient - consider renal/hepatic dose adjustment." });
  if (context.patient.gender && /female/i.test(context.patient.gender) && age >= 12 && age <= 50) {
    warnings.push({ level: "info", medicine: "-", text: "Reproductive age - confirm pregnancy status if any prescribed medicine is contraindicated in pregnancy." });
  }

  // AI pass for interaction-pattern and dose/frequency sanity - the one thing
  // that genuinely needs judgement beyond a database lookup. Framed as a
  // question, not an instruction to invent facts.
  if (context.items.length >= 1) {
    const medList = context.items.map(i => `${i.medicine_name} ${i.dosage||''} ${i.frequency||''} ${i.duration||''}`).join("; ");
    const prompt = `A pharmacist is reviewing this prescription before dispensing. Medicines: ${medList}. Diagnosis: ${context.diagnosis || "not specified"}. Patient: ${age||'?'}y ${context.patient.gender||''}.
Flag ONLY genuine concerns: known drug-drug interactions between these specific medicines, an unusually high/low dose or frequency for the stated diagnosis, or a black-box-warning-level concern. If you are not confident about a specific interaction, do not mention it. If nothing stands out, say exactly "No additional concerns identified." Keep it to 2-3 sentences maximum, plain text, no markdown.`;
    const r = await AI.ask(prompt, { temperature: 0 });
    if (r.ok && !/no additional concerns/i.test(r.text)) {
      warnings.push({ level: "info", medicine: "-", text: "AI review: " + r.text.trim() });
    }
  }

  return { warnings, stockInfo };
}

/** Real AI-generated Dispensing Summary paragraph, built from the actual
 *  warnings just computed (never invents findings beyond what was found). */
async function dzGenerateDispensingSummary(context, warnings) {
  const medList = context.items.map(i => i.medicine_name).join(", ") || "no medicines";
  const critical = warnings.filter(w => w.level === "critical").map(w => w.text);
  const warn = warnings.filter(w => w.level === "warning").map(w => w.text);
  const prompt = `Write a short 2-4 sentence dispensing summary for a pharmacist, in the style of: "Prescription verified. No severe interaction detected. One medicine has low stock. Doctor review not required." Medicines: ${medList}. Critical findings: ${critical.length ? critical.join("; ") : "none"}. Warnings: ${warn.length ? warn.join("; ") : "none"}. Only state what is listed above - do not invent anything. If there are critical findings, end with "Doctor review recommended before dispensing." If none, end with "Doctor review not required." Plain text only.`;
  const r = await AI.ask(prompt, { temperature: 0 });
  return r.ok ? r.text.trim() : `Prescription received (${context.items.length} medicine(s)). AI summary unavailable right now - review warnings below manually.`;
}
