import { createClient } from 'npm:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';
import { createHandler } from './handler.mjs';

const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false, autoRefreshToken: false } },
);

Deno.serve(createHandler(admin, webpush, {
    publicKey: Deno.env.get('VAPID_PUBLIC_KEY') || '',
    privateKey: Deno.env.get('VAPID_PRIVATE_KEY') || '',
    subject: Deno.env.get('VAPID_SUBJECT') || 'https://gemarmengajisdit.netlify.app',
}));
