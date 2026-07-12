// ============================================================
// Dr. Zaid Healthcare OS — Event Bus
// Instant same-tab (CustomEvent) and cross-tab (BroadcastChannel)
// notifications, so Doctor Workspace in another tab doesn't have to
// wait for the next poll cycle after Reception registers a patient.
// ============================================================

const DZ_BROADCAST_CHANNEL_NAME = "dz-clinic-events";
let _dzBroadcastChannel = null;

function dzGetBroadcastChannel() {
  if (!_dzBroadcastChannel && "BroadcastChannel" in window) {
    _dzBroadcastChannel = new BroadcastChannel(DZ_BROADCAST_CHANNEL_NAME);
  }
  return _dzBroadcastChannel;
}

/** Fires both a same-tab CustomEvent and a cross-tab BroadcastChannel
 *  message. Call this right after a token/visit is created or its status
 *  changes - any listening page (Reception, Doctor, Lab, Pharmacy) picks
 *  it up within milliseconds instead of waiting for the next poll. */
function dzBroadcastEvent(type, detail) {
  try {
    window.dispatchEvent(new CustomEvent("dz:" + type, { detail }));
  } catch (e) { console.warn("[EventBus] same-tab dispatch failed", e); }
  try {
    const ch = dzGetBroadcastChannel();
    if (ch) ch.postMessage({ type, ...detail, ts: Date.now() });
  } catch (e) { console.warn("[EventBus] cross-tab broadcast failed", e); }
}

/** Registers a listener for both same-tab and cross-tab delivery of the
 *  same event type. `type` is the bare name (e.g. "token-created"),
 *  matching what dzBroadcastEvent was called with. */
function dzOnBroadcastEvent(type, handler) {
  window.addEventListener("dz:" + type, (e) => handler(e.detail));
  const ch = dzGetBroadcastChannel();
  if (ch) {
    ch.addEventListener("message", (e) => {
      if (e.data && e.data.type === type) handler(e.data);
    });
  }
}
