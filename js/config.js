const SUPABASE_URL = "https://pfuwdqgrltxxtnrzmzpe.supabase.co";

const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBmdXdkcWdybHR4eHRucnptenBlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM5OTkxMjYsImV4cCI6MjA5OTU3NTEyNn0.PlHBHfrbrWxqeBa77ybSKgDuTCKZtemVwIoPJOvJAlE";

const supabaseClientFactory = window.supabase.createClient;
window.supabase = supabaseClientFactory(
    SUPABASE_URL,
    SUPABASE_ANON_KEY
);
// Upgrade the former default palette while retaining custom school colors.
function resolveThemeColor(color) {
    const value = typeof color === 'string' ? color.trim().toLowerCase() : '';
    return /^#[0-9a-f]{6}$/.test(value) && value !== '#1d4ed8' ? value : '#216454';
}
