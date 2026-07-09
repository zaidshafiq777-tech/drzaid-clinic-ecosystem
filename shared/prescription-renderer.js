// ============================================================
// Dr. Zaid Healthcare OS — Prescription Renderer
// Renders the AI draft (or doctor-edited version) in Dr. Zaid's
// professional prescription format, for on-screen preview and print.
// ============================================================

function dzEsc(s) { return String(s == null ? "" : s).replace(/</g, "&lt;"); }

function dzRenderPrescriptionPreview(draft, patient, visitMeta) {
  const compact = draft.one_page_mode !== false; // ON by default per Milestone 5 spec
  const gap = compact ? 6 : 8;
  const fs = compact ? 12.5 : 13;

  const meds = (draft.medicines || []).map((m, i) => `
    <div style="margin-bottom:${compact?4:8}px">
      <b>${i + 1}. ${dzEsc(m.name)} ${dzEsc(m.strength)}</b>
      <span style="font-size:11.5px;color:var(--slate-500)">
        &middot; ${dzEsc(m.dose)||'—'} &middot; ${dzEsc(m.frequency)||'—'} &middot; ${dzEsc(m.duration)||'—'}${m.quantity ? ' &middot; Qty '+dzEsc(m.quantity) : ''}
      </span>
      ${m.instructions && !compact ? `<div style="font-size:11.5px;font-style:italic">${dzEsc(m.instructions)}</div>` : ''}
    </div>`).join("") || '<div style="color:var(--slate-500);font-size:12px">No medicines drafted.</div>';

  const ddx = (draft.differential_diagnosis||[]).map(dzEsc).join(", ") || "—";
  const invest = (draft.investigations||[]).map(dzEsc).join(", ") || "—";
  const reportsLine = draft.reports_summary && draft.reports_summary !== "No reports attached for this visit."
    ? `<div style="margin-bottom:${gap}px"><b>Reports / Investigations Summary:</b> ${dzEsc(draft.reports_summary)}</div>` : "";
  const overflowWarning = !compact
    ? `<div style="background:#FFF7E6;color:var(--signal-warning);font-size:11px;padding:6px 10px;border-radius:6px;margin-bottom:10px">Prescription may exceed one page due to reports/history.</div>` : "";

  return `
  <div id="rxPrintArea" style="background:#fff;padding:${compact?16:22}px;border:1px solid var(--slate-200);border-radius:10px;font-size:${fs}px;line-height:${compact?1.4:1.55}">
    ${overflowWarning}
    <div style="text-align:center;border-bottom:2px solid var(--clinical-700);padding-bottom:${compact?6:10}px;margin-bottom:${compact?8:14}px">
      <div style="font-size:16px;font-weight:800;color:var(--clinical-700)">Dr. Zaid Shafique</div>
      <div style="font-size:11.5px;color:var(--slate-500)">MBBS &middot; Family Physician</div>
      <div style="font-size:11px;color:var(--slate-500)">Dr. Zaid Shafique Clinic, Main Bazar, Purani Mandi, Pattoki &middot; 0327-4845413</div>
    </div>
    <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:${gap+4}px">
      <div><b>${dzEsc(patient.full_name)}</b><br>${patient.age||'?'} y &middot; ${dzEsc(patient.gender)||'-'} &middot; EMR ${dzEsc(patient.emr_number)||'—'}</div>
      <div style="text-align:right">Date: ${new Date().toLocaleDateString()}<br>Visit: ${dzEsc(visitMeta?.id||'').slice(0,8)}</div>
    </div>
    <div style="margin-bottom:${gap}px"><b>Chief Complaint:</b> ${dzEsc(draft.chief_complaint)}</div>
    ${!compact ? `<div style="margin-bottom:${gap}px"><b>History:</b> ${dzEsc(draft.history)}</div><div style="margin-bottom:${gap}px"><b>Examination:</b> ${dzEsc(draft.examination)}</div>` : `<div style="margin-bottom:${gap}px"><b>History/Exam:</b> ${dzEsc((draft.history||'')+' '+(draft.examination||'')).slice(0,180)}</div>`}
    <div style="margin-bottom:${gap}px"><b>Vitals:</b> ${dzEsc(draft.vitals_summary)}</div>
    ${reportsLine}
    <div style="margin-bottom:${gap}px"><b>Provisional Diagnosis:</b> ${dzEsc(draft.provisional_diagnosis)}</div>
    <div style="margin-bottom:${gap}px"><b>Differential Diagnosis:</b> ${ddx}</div>
    <div style="margin:${gap+4}px 0"><b>Medicines:</b>${meds}</div>
    <div style="margin-bottom:${gap}px"><b>Investigations:</b> ${invest}</div>
    <div style="margin-bottom:${gap}px"><b>Advice:</b> ${dzEsc(draft.advice_english)}</div>
    <div style="margin-bottom:${gap}px"><b>Urdu Instructions:</b> ${dzEsc(draft.advice_urdu)}</div>
    <div style="margin-bottom:${gap}px"><b>Follow-up:</b> ${dzEsc(draft.follow_up)}</div>
    ${draft.referral && draft.referral !== "Not clearly mentioned" ? `<div style="margin-bottom:${gap}px"><b>Referral:</b> ${dzEsc(draft.referral)}</div>` : ""}
    <div style="margin-top:${compact?14:24}px;display:flex;justify-content:space-between;font-size:10.5px;color:var(--slate-500)">
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
