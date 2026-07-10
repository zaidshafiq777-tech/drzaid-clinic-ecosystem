// ============================================================
// Dr. Zaid Healthcare OS — Date Utils
// Every "today" query in the app must use this, not a browser-local
// `new Date().setHours(0,0,0,0)` — that computes midnight in whatever
// timezone the DEVICE happens to be set to, which silently drifts from
// true Pakistan clinic hours and can make "today" queries miss rows
// near day boundaries. This computes the correct Asia/Karachi day
// window directly, independent of device timezone.
// ============================================================

/** Returns { startUtc, endUtc } as ISO strings marking the current
 *  clinic day (00:00 to next 00:00) in the given IANA timezone. */
function dzGetClinicDayRange(tz = "Asia/Karachi") {
  const now = new Date();
  // Get the current date's Y-M-D as seen in the clinic's timezone,
  // using Intl so this is correct regardless of device timezone.
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(now).reduce((acc, p) => { acc[p.type] = p.value; return acc; }, {});
  const dateStr = `${parts.year}-${parts.month}-${parts.day}`; // e.g. "2026-07-10"

  // Pakistan is a fixed UTC+5 offset (no DST) - this is safe and exact.
  // If the clinic ever operates in a DST-observing timezone, this fixed
  // offset would need to become timezone-aware; Asia/Karachi has none.
  const OFFSET_HOURS = tz === "Asia/Karachi" ? 5 : 0;
  const startUtc = new Date(`${dateStr}T00:00:00.000Z`);
  startUtc.setUTCHours(startUtc.getUTCHours() - OFFSET_HOURS);
  const endUtc = new Date(startUtc.getTime() + 24 * 60 * 60 * 1000);

  return { startUtc: startUtc.toISOString(), endUtc: endUtc.toISOString(), dateStr };
}
