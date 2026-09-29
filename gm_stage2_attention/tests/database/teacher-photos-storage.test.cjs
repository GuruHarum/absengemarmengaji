"use strict";
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { PGlite } = require('../../.test-tools/node_modules/@electric-sql/pglite');

test('migrasi foto Tahsin: Storage, pengelola, foto sendiri, larangan Tahfidz dan pemakaian ulang', async () => {
    const db = new PGlite();
    try {
        await db.exec(`
            create schema auth;
            create schema app_private;
            create schema storage;
            create role authenticated;
            create role anon;
            create table storage.objects(id bigserial primary key, name text, bucket_id text);
            create table storage.buckets(id text primary key,name text,public boolean);
            create table public.teachers(id bigint primary key,nama text,foto text,attendance_enabled boolean default true);
            create table public.user_roles(user_id uuid primary key,teacher_id text,role text);
            create function auth.uid() returns uuid language sql stable as $$
                select nullif(current_setting('test.uid',true),'')::uuid
            $$;
            create function app_private.is_manager() returns boolean language sql stable as $$
                select coalesce(current_setting('test.manager',true)='true',false)
            $$;
            insert into storage.buckets values('teachers','teachers',false);
            insert into teachers(id,nama,attendance_enabled) values(10,'Guru Tahsin',true),(11,'Guru Tahfidz',false);
            insert into user_roles(user_id,teacher_id,role) values
                ('00000000-0000-0000-0000-000000000001','10','guru'),
                ('00000000-0000-0000-0000-000000000002','11','guru');
        `);
        const migration = fs.readFileSync('supabase/teacher-photos-storage.sql', 'utf8');
        await db.exec(migration);
        await db.exec('create trigger protect_teacher_identity before update on public.teachers for each row execute function app_private.protect_teacher_identity()');
        assert.equal((await db.query("select public from storage.buckets where id='teachers'")).rows[0].public,true);
        assert.ok((await db.query("select column_name from information_schema.columns where table_name='teachers' and column_name='foto_storage_path'")).rows.length);
        const photo = 'portraits/10/11111111-1111-4111-8111-111111111111.jpg';
        const photo2 = 'portraits/10/22222222-2222-4222-8222-222222222222.png';
        const photoOther = 'portraits/11/33333333-3333-4333-8333-333333333333.webp';
        const url = name => `https://test.example/storage/v1/object/public/teachers/${name}`;
        await db.query("insert into storage.objects(name,bucket_id) values($1,'teachers'),($2,'teachers'),($3,'teachers')",[photo,photo2,photoOther]);
        await db.query('update teachers set foto=$1,foto_storage_path=$2 where id=10',[url(photo),photo]);
        assert.equal((await db.query('select foto_storage_path from teachers where id=10')).rows[0].foto_storage_path,photo);
        await assert.rejects(db.query('update teachers set foto=$1,foto_storage_path=$2 where id=11',[url(photoOther),photoOther]), /guru.*Tahfidz|hanya berlaku/);
        await assert.rejects(db.query("update teachers set foto_storage_path='portraits/12/x.jpg' where id=10"), /Lokasi|Berkas|Unggah/);
        await db.exec("select set_config('test.uid','00000000-0000-0000-0000-000000000001',false)");
        const permitted = await db.query("select app_private.can_write_teacher_portrait($1) as allowed,app_private.can_write_teacher_portrait($2) as denied",[photo2,photoOther]);
        assert.equal(permitted.rows[0].allowed,true);
        assert.equal(permitted.rows[0].denied,false);
        await db.query('update teachers set foto=$1,foto_storage_path=$2 where id=10',[url(photo2),photo2]);
        await assert.rejects(db.query("update teachers set nama='Nama Berubah' where id=10"),/hanya dapat memperbarui foto/);
        await db.exec("select set_config('test.uid','00000000-0000-0000-0000-000000000002',false)");
        await assert.rejects(db.query('update teachers set foto=$1,foto_storage_path=$2 where id=10',[url(photo),photo]),/Hanya pengelola/);
        await assert.rejects(db.query('update teachers set foto=$1,foto_storage_path=$2 where id=11',[url(photoOther),photoOther]),/Hanya pengelola/);
        await db.exec("select set_config('test.manager','true',false)");
        await db.query('update teachers set foto=null,foto_storage_path=null where id=10');
        assert.equal((await db.query('select foto from teachers where id=10')).rows[0].foto,null);
        await db.exec(migration);
        const policies=await db.query("select policyname from pg_policies where schemaname='storage' and tablename='objects'");
        assert.ok(policies.rows.some(row=>row.policyname==='own_portrait_select'));
    } finally {
        await db.close();
    }
});
