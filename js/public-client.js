// Keep panel login intact. Public attendance always uses the anonymous API role,
// including when an administrator or teacher has a session in another tab.
window.panelAuthClient = window.supabase;
window.supabase = supabaseClientFactory(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
        storageKey: 'gemar-mengaji-public'
    }
});
