// ============================================================
// Dr. Zaid Healthcare OS — Report Analyzer
// Normalizes whatever comes back from the n8n Report Vision webhook
// into the strict shape the UI and prescription context depend on.
// The n8n workflow already does clean_summary/prescription_text
// generation server-side (with its own two-pass fallback) - this
// module is the frontend's defensive final check, so a field-name
// mismatch or a stray raw-JSON string can never reach the doctor's
// screen or a prescription again.
// ============================================================

/** Detects text that still looks like raw JSON/markdown fencing -
 *  a sign something upstream leaked unprocessed content. */
function dzLooksLikeRawJson(text) {
  if (!text) return false;
  const t = text.trim();
  return t.startsWith("{") || t.startsWith("```") || /^"[a-z_]+"\s*:/.test(t);
}

/** Takes the raw n8n response and returns a guaranteed-clean object:
 *  { ok, reportType, cleanSummary, keyFindings, redFlags, impression,
 *    prescriptionText, rawExtractedText, confidence, source }
 *  Never returns raw JSON/markdown in any display field. */
function dzNormalizeReportResult(r) {
  if (!r || !r.ok) {
    return { ok: false, error: r?.error || "Unknown error", fallback: r?.fallback || "Paste report text manually" };
  }

  let cleanSummary = r.cleanSummary || "";
  let prescriptionText = r.prescriptionText || cleanSummary || "";

  // Defensive guard: if either display field still looks like raw JSON
  // (shouldn't happen given the n8n pipeline, but never show it if it does).
  if (dzLooksLikeRawJson(cleanSummary)) cleanSummary = "";
  if (dzLooksLikeRawJson(prescriptionText)) prescriptionText = "";

  if (!cleanSummary && !prescriptionText) {
    cleanSummary = "No clean summary could be generated for this report — the raw extracted text is available below for manual review.";
    prescriptionText = "";
  }

  return {
    ok: true,
    reportType: r.reportType || "Other",
    cleanSummary,
    keyFindings: Array.isArray(r.keyFindings) ? r.keyFindings : [],
    redFlags: Array.isArray(r.redFlags) ? r.redFlags : [],
    impression: r.impression || "",
    prescriptionText,
    rawExtractedText: r.rawExtractedText || "",
    confidence: r.confidence || "medium",
    source: r.source || "gemini-2.5-flash-vision",
  };
}
