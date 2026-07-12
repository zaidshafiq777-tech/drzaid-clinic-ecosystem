// ============================================================
// Dr. Zaid Healthcare OS — Realtime Service
// Thin wrapper around Supabase Realtime for the clinic queue tables.
// Ensures only ONE channel per page (no duplicate subscriptions on
// re-render), logs subscription status, and debounces rapid-fire
// changes into a single reload call.
// ============================================================

let _dzRealtimeChannel = null;
let _dzDebounceHandle = null;

/** Subscribes to real-time changes on tokens (and optionally visits) for
 *  the given organization. Calls `onChange()` (debounced ~400ms) whenever
 *  a row is inserted/updated/deleted. Safe to call more than once - reuses
 *  the existing channel instead of creating duplicates. */
function dzSubscribeClinicQueue(organizationId, onChange, { includeVisits = true } = {}) {
  if (_dzRealtimeChannel) {
    console.log("[Realtime] Reusing existing channel");
    return _dzRealtimeChannel;
  }
  if (!window.dzSupabase || !window.dzSupabase.channel) {
    console.warn("[Realtime] Supabase client does not support channels - relying on polling only.");
    return null;
  }

  const debouncedChange = (source) => {
    clearTimeout(_dzDebounceHandle);
    _dzDebounceHandle = setTimeout(() => {
      console.log("[Realtime] Reloading queue after change", source);
      onChange();
    }, 400);
  };

  let channel = window.dzSupabase
    .channel(`clinic-queue-${organizationId}`)
    .on("postgres_changes", { event: "*", schema: "public", table: "tokens", filter: `organization_id=eq.${organizationId}` },
      (payload) => debouncedChange({ table: "tokens", event: payload.eventType }));

  if (includeVisits) {
    channel = channel.on("postgres_changes", { event: "*", schema: "public", table: "visits", filter: `organization_id=eq.${organizationId}` },
      (payload) => debouncedChange({ table: "visits", event: payload.eventType }));
  }

  channel.subscribe((status) => {
    console.log("[Realtime] Subscription status:", status);
    // Possible values: SUBSCRIBED, CHANNEL_ERROR, TIMED_OUT, CLOSED
  });

  _dzRealtimeChannel = channel;
  return channel;
}

function dzUnsubscribeClinicQueue() {
  if (_dzRealtimeChannel && window.dzSupabase) {
    window.dzSupabase.removeChannel(_dzRealtimeChannel);
    _dzRealtimeChannel = null;
    console.log("[Realtime] Channel removed");
  }
}
