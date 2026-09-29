const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

export function createHandler(admin, webpush, vapid) {
    const reply = (status, body) => new Response(JSON.stringify(body), {
        status,
        headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    });

    async function authenticate(request) {
        const token = request.headers.get('Authorization')?.match(/^Bearer (.+)$/i)?.[1];
        if (!token) return { error: reply(401, { error: 'Login diperlukan' }) };
        const { data, error } = await admin.auth.getUser(token);
        if (error || !data.user) return { error: reply(401, { error: 'Sesi tidak valid' }) };
        const { data: role } = await admin.from('user_roles').select('role').eq('user_id', data.user.id).maybeSingle();
        return { user: data.user, role: role?.role || null };
    }

    async function setPushStatus(notificationId, status) {
        await admin.from('internal_notifications').update({ push_status: status }).eq('id', notificationId);
    }

    return async request => {
        if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
        if (request.method !== 'POST') return reply(405, { error: 'Metode tidak didukung' });

        try {
            const auth = await authenticate(request);
            if (auth.error) return auth.error;
            const input = await request.json().catch(() => ({}));
            const action = input?.action || 'config';

            if (action === 'config') {
                if (!vapid.publicKey) return reply(503, { error: 'Web Push belum dikonfigurasi' });
                return reply(200, { vapid_public_key: vapid.publicKey });
            }

            if (action !== 'send') return reply(400, { error: 'Aksi tidak dikenal' });
            if (auth.role !== 'koordinator') return reply(403, { error: 'Hanya Koordinator yang dapat mengirim push' });
            if (!vapid.publicKey || !vapid.privateKey) return reply(503, { error: 'Kunci Web Push belum dikonfigurasi' });

            const ids = [...new Set((Array.isArray(input.notification_ids) ? input.notification_ids : [])
                .map(value => Number(value)).filter(value => Number.isSafeInteger(value) && value > 0))].slice(0, 20);
            if (!ids.length) return reply(200, { status: 'not_requested', sent: 0, failed: 0, no_subscription: 0 });

            const { data: notifications, error: notificationError } = await admin
                .from('internal_notifications')
                .select('id,recipient_user_id,title,message,target_page,payload,sender_user_id')
                .in('id', ids)
                .eq('sender_user_id', auth.user.id);
            if (notificationError) return reply(500, { error: 'Notifikasi internal tidak dapat dibaca' });
            if (!notifications?.length) return reply(403, { error: 'Notifikasi tidak valid' });

            webpush.setVapidDetails(vapid.subject, vapid.publicKey, vapid.privateKey);
            const recipients = [...new Set(notifications.map(row => row.recipient_user_id))];
            const { data: subscriptions, error: subscriptionError } = await admin
                .from('push_subscriptions')
                .select('id,user_id,endpoint,p256dh,auth_key')
                .in('user_id', recipients)
                .eq('active', true);
            if (subscriptionError) return reply(500, { error: 'Subscription push tidak dapat dibaca' });

            let sent = 0;
            let failed = 0;
            let noSubscription = 0;

            for (const notification of notifications) {
                const targets = (subscriptions || []).filter(row => row.user_id === notification.recipient_user_id);
                if (!targets.length) {
                    noSubscription += 1;
                    await setPushStatus(notification.id, 'no_subscription');
                    continue;
                }

                let notificationSent = 0;
                let notificationFailed = 0;
                const payload = JSON.stringify({
                    title: notification.title || 'Gemar Mengaji',
                    body: notification.message || 'Ada informasi baru di Gemar Mengaji. Buka aplikasi untuk melihat detail.',
                    icon: '/assets/icon-192.png',
                    badge: '/assets/notification-badge-96.png',
                    tag: `gm-notification-${notification.id}`,
                    data: {
                        notificationId: String(notification.id),
                        url: `/admin.html?pwa=notification&notification=${encodeURIComponent(notification.id)}`,
                        targetPage: notification.target_page || 'dashboard',
                        payload: notification.payload || {},
                    },
                });

                for (const subscription of targets) {
                    try {
                        await webpush.sendNotification({
                            endpoint: subscription.endpoint,
                            keys: { p256dh: subscription.p256dh, auth: subscription.auth_key },
                        }, payload, { TTL: 3600 });
                        notificationSent += 1;
                        sent += 1;
                        await admin.from('push_subscriptions').update({
                            last_success_at: new Date().toISOString(),
                            last_error_at: null,
                            updated_at: new Date().toISOString(),
                        }).eq('id', subscription.id);
                    } catch (error) {
                        notificationFailed += 1;
                        failed += 1;
                        const statusCode = Number(error?.statusCode || 0);
                        await admin.from('push_subscriptions').update({
                            active: ![404, 410].includes(statusCode),
                            last_error_at: new Date().toISOString(),
                            updated_at: new Date().toISOString(),
                        }).eq('id', subscription.id);
                    }
                }

                await setPushStatus(notification.id,
                    notificationSent > 0 && notificationFailed === 0 ? 'sent' :
                    notificationSent > 0 ? 'partial' : 'failed');
            }

            const status = sent > 0 && failed === 0 ? 'sent' : sent > 0 ? 'partial' : noSubscription === notifications.length ? 'no_subscription' : 'failed';
            return reply(200, { status, sent, failed, no_subscription: noSubscription });
        } catch (error) {
            console.error('push-notifications:', error);
            return reply(500, { error: 'Web Push belum dapat dikirim' });
        }
    };
}
