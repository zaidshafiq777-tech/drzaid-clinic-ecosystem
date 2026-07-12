// ============================================================
// Dr. Zaid Healthcare OS — Report Vision Uploader
// Reads a PDF/image file, sends it to the real n8n Gemini Vision
// webhook (key lives only in n8n), and returns a structured result.
// Frontend never sees or holds the Gemini API key.
//
// FIX: previously called response.json() blindly, which threw
// "Unexpected end of JSON input" on any empty/malformed n8n response.
// Now routes through dzNormalizeReportResponse() (response-parser.js)
// which reads the body as text first and never throws.
// ============================================================

const DZ_VISION_WEBHOOK = window.DZ_CONFIG.N8N_BASE_URL + "/dz-report-vision-analyzer";

function dzFileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result; // "data:<mime>;base64,<data>"
      const base64 = String(result).split(",")[1] || "";
      resolve(base64);
    };
    reader.onerror = () => reject(new Error("Could not read the file."));
    reader.readAsDataURL(file);
  });
}

/** Uploads a report file to the real Gemini Vision pipeline.
 *  Returns { ok, ...structuredFields } or { ok:false, error, fallback }.
 *  Never throws - all response handling goes through the safe parser. */
async function dzUploadReportForVision(file, reportType, patientContext) {
  const SUPPORTED = ["application/pdf", "image/jpeg", "image/jpg", "image/png", "image/webp", "image/heic"];
  if (!SUPPORTED.includes(file.type)) {
    return { ok: false, error: `Unsupported file type "${file.type || 'unknown'}". Supported: PDF, JPG, PNG, WEBP, HEIC.`, fallback: "Paste report text manually" };
  }
  let base64;
  try {
    base64 = await dzFileToBase64(file);
  } catch (e) {
    return { ok: false, error: e.message, fallback: "Paste report text manually" };
  }
  try {
    const res = await fetch(DZ_VISION_WEBHOOK, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fileName: file.name,
        mimeType: file.type,
        fileBase64: base64,
        reportType: reportType || "Other",
        patientContext: patientContext || {},
      }),
    });
    return await dzNormalizeReportResponse(res);
  } catch (e) {
    return { ok: false, error: e.message || "Network error reaching the vision service", fallback: "Paste report text manually" };
  }
}
