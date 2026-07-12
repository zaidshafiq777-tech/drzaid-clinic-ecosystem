// ============================================================
// Dr. Zaid Healthcare OS — Lab AI Agent
// Real AI analysis for lab results - identifies abnormal/critical
// values and generates a concise clinical summary. NEVER creates a
// final diagnosis - only flags findings for doctor review.
// ============================================================

const DZ_CRITICAL_PATTERNS = [
  { re: /h(a|ae)?moglobin[:\s]*([\d.]+)/i, check: (v) => v < 6, label: "Critically low hemoglobin" },
  { re: /potassium[:\s]*([\d.]+)/i, check: (v) => v > 6.5 || v < 2.5, label: "Critical potassium level" },
  { re: /sodium[:\s]*([\d.]+)/i, check: (v) => v > 160 || v < 120, label: "Critical sodium level" },
  { re: /platelet[s]?[:\s]*([\d.]+)/i, check: (v) => v < 20, label: "Critically low platelets" },
  { re: /glucose|rbs|fbs[:\s]*([\d.]+)/i, check: (v) => v > 500 || v < 40, label: "Critical blood sugar" },
  { re: /creatinine[:\s]*([\d.]+)/i, check: (v) => v > 5, label: "Severe renal impairment (high creatinine)" },
];

/** Real, deterministic critical-value scan over extracted text - runs
 *  BEFORE the AI summary, so a critical flag is never solely dependent
 *  on the AI's judgement. */
function dzScanForCriticalValues(text) {
  const found = [];
  DZ_CRITICAL_PATTERNS.forEach(p => {
    const m = text.match(p.re);
    if (m) {
      const val = parseFloat(m[m.length - 1]);
      if (!isNaN(val) && p.check(val)) found.push(p.label + ` (${val})`);
    }
  });
  return found;
}

/** Real AI analysis of lab result text/values. Returns the exact contract
 *  requested: testName, parameters, abnormalFindings, criticalFindings,
 *  cleanSummary, confidence, doctorReviewRequired. Never finalizes a
 *  diagnosis - only surfaces findings. */
async function dzAnalyzeLabResult(testName, rawText, previousResult) {
  const criticalFromScan = dzScanForCriticalValues(rawText);
  const prompt = `You are a lab AI assistant. Analyze this ${testName} result for a doctor's review.
Rules: extract only what is visible, never invent a value. Identify abnormal values (flag High/Low/Normal/Critical). Compare with the previous result if given. Never state a final diagnosis - only findings.
${previousResult ? `Previous result for comparison: ${previousResult}` : "No previous result available."}
Result text:
"""${rawText}"""
Return ONLY a raw JSON object, no markdown, no preamble:
{"parameters":[{"parameter":"","result":"","unit":"","referenceRange":"","flag":"high|low|normal|critical"}],"abnormalFindings":[],"criticalFindings":[],"cleanSummary":"","confidence":"high|medium|low","urgentNotificationSuggested":false}`;

  const r = await AI.ask(prompt, { json: true, temperature: 0 });
  let parsed = null;
  if (r.ok) {
    try {
      let t = r.text.replace(/```json|```/g, "").trim();
      const s = t.indexOf("{"), e = t.lastIndexOf("}");
      if (s !== -1 && e !== -1) parsed = JSON.parse(t.slice(s, e + 1));
    } catch (err) { parsed = null; }
  }

  const criticalFindings = [...new Set([...(parsed?.criticalFindings || []), ...criticalFromScan])];
  return {
    testName,
    parameters: parsed?.parameters || [],
    abnormalFindings: parsed?.abnormalFindings || [],
    criticalFindings,
    cleanSummary: parsed?.cleanSummary || (rawText ? "AI summary unavailable — please review the raw result manually." : ""),
    confidence: parsed?.confidence || "low",
    doctorReviewRequired: true,
  };
}
