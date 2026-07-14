// ============================================================
// Dr. Zaid Healthcare OS — Distribution AI Agents
// Every agent: real deterministic checks first (stock, dates, credit
// math), AI only for interpretation/summarization/drafting. AI never
// auto-approves an order, auto-changes a price, or auto-disposes stock.
// Uses the shared AI.ask() -> Supabase Edge Function (Gemini+Groq),
// same infrastructure already proven for the clinic.
// ============================================================

/** AI Order Parser — Roman Urdu / Urdu / English free text -> structured
 *  draft order. Never finalizes - always requires human confirmation. */
async function dzParseDistroOrder(rawText, medicineList, retailerList) {
  const medNames = medicineList.map(m => m.product_name).join(", ");
  const retailerNames = retailerList.map(r => r.shop_name).join(", ");
  const prompt = `Parse this wholesale medicine order (may be Roman Urdu, Urdu, or English) into structured JSON.
Known medicines: ${medNames}
Known retailers: ${retailerNames}
Order text: "${rawText}"
Match each item to the closest known medicine name if reasonably confident (confidence >= 0.6), otherwise leave matchedMedicineName empty and put the raw text in unmatchedItems.
Return ONLY raw JSON, no markdown:
{"retailer":"","items":[{"rawName":"","matchedMedicineName":"","quantity":0,"unit":"box|strip|piece","confidence":0}],"deliveryInstructions":"","unmatchedItems":[],"warnings":[]}`;
  const r = await AI.ask(prompt, { json: true, temperature: 0, taskType: "distro_order_parser" });
  if (!r.ok) return { ok: false, error: r.error };
  const parsed = dzSafeJsonParse ? dzParseRecursive(dzSafeJsonParse(r.text)) : JSON.parse(r.text);
  if (!parsed) return { ok: false, error: "Could not parse the order. Please enter it manually." };
  return { ok: true, data: parsed };
}

/** Expiry Radar — real deterministic date-math scan, AI only drafts the
 *  narrative recommendation on top of real numbers. */
function dzScanExpiryRisk(batches) {
  const today = new Date();
  const results = { in30: [], in60: [], in90: [], in180: [], expired: [] };
  batches.forEach(b => {
    if (!b.expiry_date || (b.current_quantity || 0) <= 0) return;
    const days = Math.round((new Date(b.expiry_date) - today) / 86400000);
    if (days < 0) results.expired.push({ ...b, daysLeft: days });
    else if (days <= 30) results.in30.push({ ...b, daysLeft: days });
    else if (days <= 60) results.in60.push({ ...b, daysLeft: days });
    else if (days <= 90) results.in90.push({ ...b, daysLeft: days });
    else if (days <= 180) results.in180.push({ ...b, daysLeft: days });
  });
  return results;
}

/** Smart Restock — real velocity math (dispensed in last 30 days from
 *  stock ledger) vs current stock, AI drafts the supplier/quantity note. */
function dzCalcRestockSuggestion(medicine, currentStock, last30DaysOut) {
  const dailyVelocity = last30DaysOut / 30;
  if (dailyVelocity <= 0) return { needed: false, reason: "No recent sales velocity to project from." };
  const daysOfStockLeft = dailyVelocity > 0 ? Math.round(currentStock / dailyVelocity) : Infinity;
  const leadTimeDays = 7; // conservative default; real supplier lead time not tracked yet
  const safetyStock = Math.ceil(dailyVelocity * leadTimeDays);
  const suggestedQty = Math.max(0, Math.ceil(dailyVelocity * 30) - currentStock + safetyStock);
  return {
    needed: daysOfStockLeft <= leadTimeDays + 7,
    daysOfStockLeft, dailyVelocity: dailyVelocity.toFixed(1), suggestedQty,
    expectedStockOutDate: new Date(Date.now() + daysOfStockLeft * 86400000).toISOString().slice(0,10),
  };
}

/** Credit Risk Shield — real math on outstanding vs limit vs overdue days. */
function dzAssessCreditRisk(retailer, overdueInvoices) {
  const outstanding = retailer.current_balance || 0;
  const limit = retailer.credit_limit || 0;
  const utilizationPct = limit > 0 ? (outstanding / limit) * 100 : (outstanding > 0 ? 999 : 0);
  const maxOverdueDays = overdueInvoices.length ? Math.max(...overdueInvoices.map(i => i.overdueDays || 0)) : 0;

  let risk = "LOW";
  if (retailer.risk_status === "Blocked") risk = "CRITICAL";
  else if (utilizationPct >= 100 || maxOverdueDays > 60) risk = "CRITICAL";
  else if (utilizationPct >= 80 || maxOverdueDays > 30) risk = "HIGH";
  else if (utilizationPct >= 50 || maxOverdueDays > 15) risk = "MEDIUM";

  return { risk, utilizationPct: Math.round(utilizationPct), maxOverdueDays, outstanding, limit,
    blocksNewOrder: risk === "CRITICAL" };
}

/** Recovery Agent — real overdue-days math, AI drafts the reminder message only. */
async function dzDraftRecoveryMessage(retailer, invoice, overdueDays, tone) {
  const prompt = `Draft a short, professional ${tone || "polite"} payment reminder message (2-3 sentences, WhatsApp-appropriate) for a wholesale medicine retailer.
Retailer: ${retailer.shop_name}. Invoice: ${invoice.document_number}. Amount due: Rs. ${invoice.net_payable}. Overdue by ${overdueDays} days.
Do not threaten legal action. Keep it business-appropriate for Pakistan. Plain text only, no markdown.`;
  const r = await AI.ask(prompt, { temperature: 0.3, taskType: "distro_recovery" });
  return r.ok ? r.text.trim() : `Dear ${retailer.shop_name}, your invoice ${invoice.document_number} for Rs. ${invoice.net_payable} is overdue by ${overdueDays} days. Please arrange payment at your earliest convenience.`;
}

/** Owner Distribution Copilot brief — real data summary, AI narrates it. */
async function dzGenerateDistroBrief(stats) {
  const prompt = `You are an owner briefing assistant for a medicine distribution business. Summarize these REAL numbers into a concise 3-5 sentence briefing. Do not invent any numbers not given. If a category has zero/no data, say so plainly rather than inventing an insight.
Data: ${JSON.stringify(stats)}`;
  const r = await AI.ask(prompt, { temperature: 0, taskType: "distro_owner_brief" });
  return r.ok ? r.text.trim() : "AI brief unavailable right now — review the dashboard numbers directly.";
}
