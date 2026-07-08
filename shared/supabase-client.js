// ============================================================
// Dr. Zaid Healthcare Operating System — Supabase Client
// Single source of truth for backend connection.
// Backend (schema/RLS/n8n) is treated as production and untouched.
// ============================================================
window.DZ_CONFIG = {
  SUPABASE_URL: "https://yjcxhxsxlvrcrsbihbpo.supabase.co",
  SUPABASE_ANON_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlqY3hoeHN4bHZyY3JzYmloYnBvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI4MjMyMjYsImV4cCI6MjA5ODM5OTIyNn0.ZAA_jdUVlfAimtIuJXu_X9oHR4Ybl8OVshmuc2MP84M",
  N8N_BASE_URL: "https://drzaid.app.n8n.cloud/webhook",
  ORG_ID: "9bbac64a-2f41-41b0-abf1-03f4b276772b"
};

// supabase-js loaded via CDN <script> tag in each page before this file.
window.dzSupabase = window.supabase.createClient(
  window.DZ_CONFIG.SUPABASE_URL,
  window.DZ_CONFIG.SUPABASE_ANON_KEY
);
