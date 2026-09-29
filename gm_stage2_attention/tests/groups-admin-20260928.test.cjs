'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const read=name=>fs.readFileSync(name,'utf8');

test('kelompok Tahsin/Tahfidz have separate menu and one student master',()=>{
 const html=read('admin.html'),js=read('js/learning-groups.js'),sql=read('supabase/20260928-05-kelompok-dua-pelajaran-STAGING.sql');
 assert.match(html,/id="menu-kelompok-tahsin"/);
 assert.match(html,/id="learningGroupTahsin"/);
 assert.match(html,/id="learningGroupTahfidz"/);
 assert.match(js,/const host = el\(subject === 'tahsin'/);
 assert.match(js,/getTeachers\(\), getStudents\(\)/);
 assert.match(sql,/UNIQUE|unique/i);
 assert.match(sql,/gm_public_tahsin_students/);
});

test('Akses Akun order Data guru => Peran => Email and no extra coordinator caption',()=>{
 const form=read('admin.html').match(/<form id="accountForm"[\s\S]*?<\/form>/)?.[0];
 assert.ok(form);
 assert.ok(form.indexOf('id="accountTeacher"') < form.indexOf('id="accountRoleSelect"'));
 assert.ok(form.indexOf('id="accountRoleSelect"') < form.indexOf('id="accountEmail"'));
 assert.doesNotMatch(form,/koordinator juga dapat dipasangkan/i);
 assert.match(form,/id="accountEmailHint"/);
});

test('email autocompletes only for one exact associated account, not by teacher name',()=>{
 const fields={accountEmail:{value:''},accountEmailHint:{textContent:''}};
 const context=vm.createContext({document:{getElementById(id){return fields[id]||={value:'',textContent:''}},addEventListener(){}},AppAccess:{}});
 vm.runInContext(read('js/accounts.js'),context);
 vm.runInContext("gmTeacherAccountHints=[{teacher_id:42,email:'guru@example.sch.id',source:'akun terhubung'}]",context);
 vm.runInContext('gmSyncEmailFromTeacher(42)',context);
 assert.equal(fields.accountEmail.value,'guru@example.sch.id');
 vm.runInContext('gmSyncEmailFromTeacher(99)',context);
 assert.equal(fields.accountEmail.value,'');
 assert.match(fields.accountEmailHint.textContent,/Belum ada email/);
 vm.runInContext("gmTeacherAccountHints=[{teacher_id:42,email:'a@example.sch.id'},{teacher_id:42,email:'b@example.sch.id'}]",context);
 vm.runInContext('gmSyncEmailFromTeacher(42)',context);
 assert.equal(fields.accountEmail.value,'');
 assert.match(fields.accountEmailHint.textContent,/lebih dari satu/);
});

test('initial dashboard defers full master, absensi and heavier settings',()=>{
 const dashboard=read('js/dashboard.js'),settings=read('js/settings-hub.js');
 assert.match(dashboard,/function gmOpenManageData\(\)/);
 assert.match(dashboard,/if \(pageId === 'kelola'\)\s*void gmOpenManageData\(\)/);
 assert.match(dashboard,/unduh absensi saat filter/);
 assert.doesNotMatch(dashboard,/document\.addEventListener\('panelready', async \(\) => \{\s*await fetchTeachers\(\)/);
 assert.match(settings,/category === 'accounts' && AppAccess\.full\(\)/);
});

test('migration guards import teacher mismatch and audits per-actual-class roster without writes',()=>{
 const guard=read('supabase/20260928-09-cegah-ketidaksinkronan-guru-impor.sql');
 const audit=read('supabase/20260928-10-audit-dua-kelompok-READ-ONLY.sql');
 assert.match(guard,/BEFORE UPDATE OF "nama guru"/);
 assert.match(guard,/Kelola Tahsin/);
 assert.match(guard,/BEGIN;/);assert.match(guard,/COMMIT;/);
 assert.match(audit,/s\.kelas,COUNT\(\*\)/);
 assert.match(audit,/belum_tahsin/);assert.match(audit,/belum_tahfidz/);
 assert.doesNotMatch(audit,/\b(?:DELETE|TRUNCATE|DROP)\s+(?:FROM\s+|TABLE\s+)?public\./i);
});
