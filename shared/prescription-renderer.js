// ============================================================
// Dr. Zaid Healthcare OS — Prescription Renderer
// Renders the AI draft (or doctor-edited version) in Dr. Zaid's
// professional prescription format, for on-screen preview and print.
// ============================================================

function dzEsc(s) { return String(s == null ? "" : s).replace(/</g, "&lt;"); }

function dzRenderPrescriptionPreview(draft, patient, visitMeta) {
  const meds = (draft.medicines || []).map((m, i) => `
    <div style="margin-bottom:8px">
      <b>${i + 1}. ${dzEsc(m.name)} ${dzEsc(m.strength)}</b><br>
      <span style="font-size:12px;color:var(--slate-500)">
        Dose: ${dzEsc(m.dose)||'—'} &middot; Frequency: ${dzEsc(m.frequency)||'—'} &middot; Duration: ${dzEsc(m.duration)||'—'}
        ${m.quantity ? ' &middot; Qty: '+dzEsc(m.quantity) : ''}
      </span>
      ${m.instructions ? `<div style="font-size:12px;font-style:italic">${dzEsc(m.instructions)}</div>` : ''}
    </div>`).join("") || '<div style="color:var(--slate-500);font-size:12.5px">No medicines drafted.</div>';

  const ddx = (draft.differential_diagnosis||[]).map(dzEsc).join(", ") || "—";
  const invest = (draft.investigations||[]).map(dzEsc).join(", ") || "—";

  return `
  <div id="rxPrintArea" style="background:#fff;padding:22px;border:1px solid var(--slate-200);border-radius:10px;font-size:13px;line-height:1.55">
    <div style="text-align:center;border-bottom:2px solid var(--clinical-700);padding-bottom:10px;margin-bottom:14px">
      <div style="font-size:17px;font-weight:800;color:var(--clinical-700)">Dr. Zaid Shafique</div>
      <div style="font-size:12px;color:var(--slate-500)">MBBS &middot; Family Physician</div>
      <div style="font-size:11.5px;color:var(--slate-500)">Dr. Zaid Shafique Clinic, Main Bazar, Purani Mandi, Pattoki &middot; 0327-4845413</div>
    </div>
    <div style="display:flex;justify-content:space-between;font-size:12.5px;margin-bottom:12px">
      <div><b>${dzEsc(patient.full_name)}</b><br>${patient.age||'?'} y &middot; ${dzEsc(patient.gender)||'-'} &middot; EMR ${dzEsc(patient.emr_number)||'—'}</div>
      <div style="text-align:right">Date: ${new Date().toLocaleDateString()}<br>Visit: ${dzEsc(visitMeta?.id||'').slice(0,8)}</div>
    </div>
    <div style="margin-bottom:8px"><b>Chief Complaint:</b> ${dzEsc(draft.chief_complaint)}</div>
    <div style="margin-bottom:8px"><b>History:</b> ${dzEsc(draft.history)}</div>
    <div style="margin-bottom:8px"><b>Examination:</b> ${dzEsc(draft.examination)}</div>
    <div style="margin-bottom:8px"><b>Vitals:</b> ${dzEsc(draft.vitals_summary)}</div>
    <div style="margin-bottom:8px"><b>Provisional Diagnosis:</b> ${dzEsc(draft.provisional_diagnosis)}</div>
    <div style="margin-bottom:8px"><b>Differential Diagnosis:</b> ${ddx}</div>
    <div style="margin:12px 0"><b>Medicines:</b>${meds}</div>
    <div style="margin-bottom:8px"><b>Investigations:</b> ${invest}</div>
    <div style="margin-bottom:8px"><b>Advice:</b> ${dzEsc(draft.advice_english)}</div>
    <div style="margin-bottom:8px"><b>Urdu Instructions:</b> ${dzEsc(draft.advice_urdu)}</div>
    <div style="margin-bottom:8px"><b>Follow-up:</b> ${dzEsc(draft.follow_up)}</div>
    ${draft.referral && draft.referral !== "Not clearly mentioned" ? `<div style="margin-bottom:8px"><b>Referral:</b> ${dzEsc(draft.referral)}</div>` : ""}
    <div style="margin-top:24px;display:flex;justify-content:space-between;font-size:11px;color:var(--slate-500)">
      <span>Doctor Signature: ______________</span>
      <span>Generated with AI assistance &middot; reviewed by doctor</span>
    </div>
  </div>`;
}

function dzPrintPrescription() {
  const area = document.getElementById("rxPrintArea");
  if (!area) return;
  const w = window.open("", "_blank");
  if (!w) { alert("Allow popups to print."); return; }
  w.document.write(`<html><head><title>Prescription</title></head><body>${area.outerHTML}</body></html>`);
  w.document.close();
  w.onload = () => w.print();
}
