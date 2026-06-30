/**
 * Central Supabase client accessor.
 * The legacy script still owns the original client. This file gives all new
 * modules one safe place to read it without creating duplicate clients.
 */
export function getSupabaseClient() {
  const client = window.supabaseClient || window.phoenixSupabaseClient || window.PHX_SUPABASE_CLIENT || null;
  if (client) return client;

  // Legacy script uses internal scoped variables in some builds. As a fallback,
  // use the public Supabase factory only when global project constants exist.
  const url = window.SUPABASE_URL || window.PHX_SUPABASE_URL;
  const key = window.SUPABASE_ANON_KEY || window.PHX_SUPABASE_ANON_KEY;
  if (window.supabase?.createClient && url && key) {
    const created = window.supabase.createClient(url, key);
    window.phoenixSupabaseClient = created;
    return created;
  }
  return null;
}

export function requireSupabaseClient() {
  const client = getSupabaseClient();
  if (!client) throw new Error('Supabase client is not available. Check config and script loading order.');
  return client;
}
