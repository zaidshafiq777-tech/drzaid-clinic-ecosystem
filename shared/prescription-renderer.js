// ============================================================
// Dr. Zaid Healthcare OS — Prescription Renderer
// Renders the AI draft (or doctor-edited version) in Dr. Zaid's
// professional prescription format, for on-screen preview and print.
// ============================================================

function dzEsc(s) { return String(s == null ? "" : s).replace(/</g, "&lt;"); }

function dzRenderPrescriptionPreview(draft, patient, visitMeta, headerConfig) {
  const compact = draft.one_page_mode !== false; // ON by default per Milestone 5 spec
  const gap = compact ? 6 : 8;
  const fs = compact ? 12.5 : 13;

  // headerConfig comes from getPrescriptionHeaderConfig() (organization-settings-service.js).
  // Falls back to safe generic placeholders (never a hardcoded specific clinic name)
  // if the caller didn't pass one - this should not normally happen since every
  // real call site fetches it first, but a missing organization must never crash
  // prescription rendering.
  const hc = headerConfig || {};
  const hs = hc.settings || {};
  const primaryColor = "var(--clinical-700)";

  const headerHtml = `
    ${hs.show_logo !== false && hc.logoUrl ? `<img src="${dzEsc(hc.logoUrl)}" style="height:34px;margin-bottom:4px">` : ""}
    ${hs.show_clinic_name !== false ? `<div style="font-size:16px;font-weight:800;color:${primaryColor}">${dzEsc(hc.clinicName || "Clinic Name Not Configured")}</div>` : ""}
    ${hs.show_doctor_name !== false ? `<div style="font-size:11.5px;color:var(--slate-500)">${dzEsc(hc.doctorName || "")}${hs.show_qualifications !== false && hc.qualification ? " &middot; " + dzEsc(hc.qualification) : ""}${hc.title ? " &middot; " + dzEsc(hc.title) : ""}</div>` : ""}
    ${hs.show_address !== false || hs.show_contact !== false ? `<div style="font-size:11px;color:var(--slate-500)">${hs.show_address !== false ? dzEsc(hc.address || "") : ""}${hs.show_contact !== false && hc.phone ? " &middot; " + dzEsc(hc.phone) : ""}</div>` : ""}
    ${hs.show_registration_number !== false && hc.registrationNumber ? `<div style="font-size:10.5px;color:var(--slate-500)">Reg. No: ${dzEsc(hc.registrationNumber)}</div>` : ""}
  `;

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
  const aiDisclaimer = hs.show_ai_disclaimer !== false
    ? `<div style="font-size:10px;color:var(--slate-500)">Generated with AI assistance &middot; reviewed by doctor</div>` : "";

  return `
  <div id="rxPrintArea" style="background:#fff;padding:${compact?16:22}px;border:1px solid var(--slate-200);border-radius:10px;font-size:${fs}px;line-height:${compact?1.4:1.55}">
    ${overflowWarning}
    <div style="text-align:center;border-bottom:2px solid ${primaryColor};padding-bottom:${compact?6:10}px;margin-bottom:${compact?8:14}px">
      ${headerHtml}
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
      ${aiDisclaimer}
    </div>
    ${hc.footerText ? `<div style="text-align:center;font-size:10px;color:var(--slate-500);margin-top:6px;border-top:1px solid var(--slate-100);padding-top:6px">${dzEsc(hc.footerText)}</div>` : ""}
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
