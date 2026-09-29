'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const read = file => fs.readFileSync(file, 'utf8');

test('attention center tidak lagi memakai huruf hijaiyah sebagai ikon', () => {
    const js = read('js/attention-center.js');
    assert.doesNotMatch(js, />ت</);
    assert.doesNotMatch(js, />ح</);
    assert.match(js, /attentionIcon\('tahsin'\)/);
    assert.match(js, /attentionIcon\('tahfidz'\)/);
    assert.match(js, /data-attention-notify/);
    assert.match(js, /Kirim pengingat/);
});

test('notifikasi internal memakai RPC dan status seen/read', () => {
    const js = read('js/notifications.js');
    const profile = read('js/profile.js');
    assert.match(js, /gm_my_notifications/);
    assert.match(js, /gm_mark_notifications_seen/);
    assert.match(js, /gm_mark_notification_read/);
    assert.match(js, /gm_send_attention_notification/);
    assert.match(js, /60000/);
    assert.match(profile, /GMNotifications\?\.markSeen/);
    assert.match(profile, /data-notification-id/);
    assert.match(profile, /is-unseen/);
});

test('SQL notifikasi hanya dapat dikirim koordinator dan tidak mengubah data akademik', () => {
    const sql = read('supabase/20260928-20-notifikasi-internal-guru.sql');
    assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.internal_notifications/);
    assert.match(sql, /actor_role IS DISTINCT FROM 'koordinator'/);
    assert.match(sql, /created_at >= now\(\) - interval '10 minutes'/);
    assert.match(sql, /recipient_user_id = auth\.uid\(\)/);
    assert.match(sql, /push_status text NOT NULL DEFAULT 'not_requested'/);
    assert.doesNotMatch(sql, /DELETE\s+FROM\s+public\.students/i);
    assert.doesNotMatch(sql, /UPDATE\s+public\.students/i);
    assert.doesNotMatch(sql, /DELETE\s+FROM\s+public\.subject_assessments/i);
});

test('build memasukkan modul notifikasi dan cache notify24', () => {
    const start = read('js/panel-start.js');
    const build = read('scripts/build-static.cjs');
    const sw = read('sw.js');
    const admin = read('admin.html');
    assert.match(start, /js\/notifications\.js/);
    assert.match(start, /notifications/);
    assert.match(build, /js\/notifications\.js/);
    assert.match(sw, /const VERSION = 'loader33'/);
    assert.match(admin, /visual-stage8\.css\?v=20260929-loader33/);
});
