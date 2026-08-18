const SUPABASE_URL = "https://pfuwdqgrltxxtnrzmzpe.supabase.co";

const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBmdXdkcWdybHR4eHRucnptenBlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM5OTkxMjYsImV4cCI6MjA5OTU3NTEyNn0.PlHBHfrbrWxqeBa77ybSKgDuTCKZtemVwIoPJOvJAlE";

window.supabase = window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_ANON_KEY
);