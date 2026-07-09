// ============================================================
// Dr. Zaid Healthcare OS — EMR Generator
// EMR numbers are generated ONLY by Postgres (patient_emr_seq +
// generate_next_emr() RPC + trg_set_patient_emr trigger on the
// patients table). This file never computes an EMR number itself -
// it only calls the database and returns what it gives back.
// ============================================================

/** Calls the database RPC directly. Normally you don't need this -
 *  just insert a patient with no emr_number and the trigger assigns
 *  one atomically. This is exposed for cases that need to know the
 *  number in advance (e.g. a printed pre-registration slip). */
async function dzGenerateEmrViaRpc() {
  const { data, error } = await window.dzSupabase.rpc("generate_next_emr");
  if (error) return { ok: false, error: error.message };
  return { ok: true, emr: data };
}
