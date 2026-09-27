const SUPABASE_URL = "https://ISI-URL-PROYEK-PENGUJIAN.supabase.co";
const SUPABASE_ANON_KEY = "ISI-PUBLISHABLE-KEY-PENGUJIAN";
const supabaseClientFactory = window.supabase.createClient;
window.supabase = supabaseClientFactory(SUPABASE_URL, SUPABASE_ANON_KEY);
function resolveThemeColor(color) {
    const value = typeof color === 'string' ? color.trim().toLowerCase() : '';
    return /^#[0-9a-f]{6}$/.test(value) && value !== '#1d4ed8' ? value : '#216454';
}
