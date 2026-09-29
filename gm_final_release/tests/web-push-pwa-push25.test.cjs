const fs = require('node:fs');
const assert = require('node:assert/strict');
const read = p => fs.readFileSync(p, 'utf8');

const attention = read('js/attention-center.js');
const push = read('js/push-notifications.js');
const notifications = read('js/notifications.js');
const sw = read('sw.js');
const admin = read('admin.html');
const sql = read('supabase/20260928-21-web-push-pwa.sql');
const edge = read('supabase/functions/push-notifications/handler.mjs');

assert.match(attention, /gm-attention-teacher-summary/);
assert.match(attention, /siswa belum lengkap/);
assert.match(attention, /state\.filter = AppAccess\.profile\?\.role === 'koordinator' \? 'scores'/);
assert.match(push, /pushManager\.subscribe/);
assert.match(push, /gm_register_push_subscription/);
assert.match(notifications, /GMPush\?\.dispatch/);
assert.match(sw, /addEventListener\('push'/);
assert.match(sw, /addEventListener\('notificationclick'/);
assert.match(admin, /profilePushEnable/);
assert.match(admin, /20260929-groups26/);
assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.push_subscriptions/);
assert.match(sql, /notification_ids/);
assert.match(edge, /setVapidDetails/);
assert.match(edge, /sendNotification/);
console.log('web push pwa push25 OK');
