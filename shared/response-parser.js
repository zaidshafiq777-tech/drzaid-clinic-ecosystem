// ============================================================
// Dr. Zaid Healthcare OS — Response Parsing Helpers
// The actual fix for "Unexpected end of JSON input": the report
// uploader used to call response.json() blindly. If n8n returned an
// empty body, a 204, an HTML error page, or a crashed-mid-workflow
// response, that call throws immediately with a cryptic browser
// error. These helpers read the body as text FIRST, inspect it, and
// only ever attempt JSON parsing on it - so a malformed or empty
// response becomes a clear message instead of an uncaught exception.
// ============================================================

/** Reads a fetch Response safely. Never throws on empty/invalid body.
 *  Returns { ok, status, statusText, contentType, rawText, rawLength }. */
async function dzReadHttpResponse(response) {
  let rawText = "";
  try { rawText = await response.text(); } catch (e) { rawText = ""; }
  return {
    ok: response.ok,
    status: response.status,
    statusText: response.statusText,
    contentType: response.headers.get("content-type") || "",
    rawText,
    rawLength: rawText.length,
  };
}

/** Strips ```json ... ``` or ``` ... ``` markdown fences. */
function dzStripJsonFences(text) {
  return String(text || "").replace(/```json/gi, "").replace(/```/g, "").trim();
}

/** Finds the first balanced {...} object in text and parses it.
 *  Returns null (never throws) if nothing valid is found. */
function dzSafeJsonParse(text) {
  if (!text) return null;
  const cleaned = dzStripJsonFences(text);
  const start = cleaned.indexOf("{");
  if (start === -1) {
    // Might be a plain JSON value (array/string/number) rather than an object.
    try { return JSON.parse(cleaned); } catch (e) { return null; }
  }
  let depth = 0, inString = false, escape = false;
  for (let i = start; i < cleaned.length; i++) {
    const ch = cleaned[i];
    if (escape) { escape = false; continue; }
    if (ch === "\\") { escape = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) {
        try { return JSON.parse(cleaned.slice(start, i + 1)); } catch (e) { return null; }
      }
    }
  }
  return null;
}

/** If a value is itself a JSON-encoded string (or nested one), parse it
 *  down until it's a real object, up to maxDepth attempts. */
function dzParseRecursive(value, maxDepth = 4) {
  let current = value, depth = 0;
  while (typeof current === "string" && depth < maxDepth) {
    const parsed = dzSafeJsonParse(current);
    if (parsed === null) break;
    current = parsed;
    depth++;
  }
  return current;
}

/** Unwraps a raw Gemini API response ({candidates:[{content:{parts:[{text}]}}]})
 *  down to its inner text, if that's what we were handed instead of our
 *  already-normalized n8n contract. Returns the original value untouched
 *  if it doesn't look like a Gemini wrapper. */
function dzUnwrapGeminiResponse(value) {
  if (value && typeof value === "object" && Array.isArray(value.candidates)) {
    const text = value.candidates[0]?.content?.parts?.[0]?.text;
    if (text) return dzParseRecursive(text) ?? text;
  }
  return value;
}

/** The single entry point: takes a raw fetch Response for a report-analysis
 *  call and returns a safe, predictable result - never throws, never lets
 *  a malformed/empty body crash the caller. */
async function dzNormalizeReportResponse(response) {
  const http = await dzReadHttpResponse(response);

  if (!http.ok) {
    const preview = http.rawText.slice(0, 200);
    let msg;
    if (http.status === 404) msg = "Report webhook URL is incorrect or inactive.";
    else if (http.status === 401 || http.status === 403) msg = "Report workflow authorization failed.";
    else if (http.status === 413) msg = "Uploaded file is too large.";
    else if (http.status === 429) msg = "AI report service limit has been reached. Please retry later or paste report text.";
    else if ([500, 502, 503].includes(http.status)) msg = "Report analysis service is temporarily unavailable.";
    else msg = `Report analysis failed (HTTP ${http.status}).`;
    return { ok: false, error: msg, fallback: "Paste report text manually", _debug: { ...http, rawText: preview } };
  }

  if (!http.rawText || http.rawLength === 0) {
    return {
      ok: false,
      error: "The report workflow returned an empty response. Check that the n8n workflow is active and its Respond to Webhook node is configured.",
      fallback: "Paste report text manually",
      _debug: http,
    };
  }

  let parsed = dzSafeJsonParse(http.rawText);
  if (parsed !== null) parsed = dzParseRecursive(parsed);
  if (parsed !== null) parsed = dzUnwrapGeminiResponse(parsed);

  if (parsed === null) {
    // Couldn't parse JSON at all, but we DO have readable text - don't crash,
    // treat it as a low-confidence raw-text result instead of failing outright.
    if (http.rawText.trim().length > 10) {
      return {
        ok: true, fileName: "", reportType: "Other",
        cleanSummary: "", prescriptionText: "",
        keyFindings: [], redFlags: [], impression: "",
        rawExtractedText: http.rawText.trim(), confidence: "low",
        source: "unparsed-text-fallback", _debug: http,
      };
    }
    return {
      ok: false,
      error: "The report was received, but the analysis response format was invalid. Please retry or use manual report text.",
      fallback: "Paste report text manually",
      _debug: http,
    };
  }

  // Normalize snake_case -> camelCase if the n8n workflow ever returns raw Gemini-schema keys.
  const camel = {
    ok: parsed.ok !== false,
    fileName: parsed.fileName ?? parsed.file_name ?? "",
    reportType: parsed.reportType ?? parsed.report_type ?? "Other",
    cleanSummary: parsed.cleanSummary ?? parsed.clean_summary ?? "",
    prescriptionText: parsed.prescriptionText ?? parsed.prescription_text ?? "",
    keyFindings: parsed.keyFindings ?? parsed.key_findings ?? [],
    abnormalFindings: parsed.abnormalFindings ?? parsed.abnormal_findings ?? [],
    redFlags: parsed.redFlags ?? parsed.red_flags ?? [],
    impression: parsed.impression ?? "",
    rawExtractedText: parsed.rawExtractedText ?? parsed.raw_extracted_text ?? "",
    confidence: parsed.confidence ?? "medium",
    source: parsed.source ?? "gemini-2.5-flash-vision",
    error: parsed.error, userMessage: parsed.userMessage, fallback: parsed.fallbackAvailable ? "Paste report text manually" : undefined,
    _debug: http,
  };
  if (parsed.ok === false) {
    return { ok: false, error: camel.userMessage || parsed.error || "Report analysis failed.", fallback: "Paste report text manually", _debug: http };
  }
  return camel;
}
