// ============================================================
// Dr. Zaid Healthcare OS — Canonical Visit/Token Status Map
// This is the ONLY place status names/labels/groupings are defined.
// Every page must import this instead of hardcoding its own status
// list — that inconsistency (Doctor Workspace filtering for
// "waiting_doctor" while nothing ever set that status) was the
// exact bug this file exists to prevent from recurring.
//
// These values MUST match the real Postgres CHECK constraint on
// public.tokens.status exactly (verified against production schema):
// registered, waiting_vitals, vitals_done, waiting_doctor,
// with_doctor, doctor_done, sent_to_pharmacy, sent_to_lab,
// billing_pending, completed, cancelled, no_show.
// There is no separate "in_progress" DB value — where the UI shows
// "In progress" it is a DISPLAY LABEL for with_doctor, not a real status.
// ============================================================

const DZ_STATUS = {
  REGISTERED: "registered",
  WAITING_VITALS: "waiting_vitals",
  VITALS_DONE: "vitals_done",
  WAITING_DOCTOR: "waiting_doctor",
  WITH_DOCTOR: "with_doctor",
  DOCTOR_DONE: "doctor_done",
  SENT_TO_PHARMACY: "sent_to_pharmacy",
  SENT_TO_LAB: "sent_to_lab",
  BILLING_PENDING: "billing_pending",
  COMPLETED: "completed",
  CANCELLED: "cancelled",
  NO_SHOW: "no_show",
};

const DZ_STATUS_LABEL = {
  registered: "Registered",
  waiting_vitals: "Waiting Vitals",
  vitals_done: "Vitals Done",
  waiting_doctor: "Waiting Doctor",
  with_doctor: "In Progress", // display label only — real DB value is with_doctor
  doctor_done: "Doctor Done",
  sent_to_pharmacy: "Pharmacy Pending",
  sent_to_lab: "Lab Pending",
  billing_pending: "Billing Pending",
  completed: "Completed",
  cancelled: "Cancelled",
  no_show: "No Show",
};

/** Statuses that mean "reception still owns this patient" — shown in Reception's live queue. */
const DZ_RECEPTION_QUEUE_STATUSES = [
  DZ_STATUS.REGISTERED, DZ_STATUS.WAITING_VITALS, DZ_STATUS.VITALS_DONE,
  DZ_STATUS.WAITING_DOCTOR, DZ_STATUS.WITH_DOCTOR, DZ_STATUS.DOCTOR_DONE,
];

/** Statuses that mean "doctor should see this patient." Includes VITALS_DONE
 *  as a safety net (so a patient never gets stuck invisible even if reception
 *  forgets to click "Send to Doctor"), plus the two explicit doctor-owned states. */
const DZ_DOCTOR_QUEUE_STATUSES = [
  DZ_STATUS.VITALS_DONE, DZ_STATUS.WAITING_DOCTOR, DZ_STATUS.WITH_DOCTOR,
];

/** Statuses meaning vitals have not been recorded yet — shown in the Vitals worklist. */
const DZ_VITALS_PENDING_STATUSES = [DZ_STATUS.REGISTERED, DZ_STATUS.WAITING_VITALS];
