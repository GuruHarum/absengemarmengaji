"use strict";
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const XLSX = require('../js/vendor/xlsx.full.min.js');
const sandbox = vm.createContext({ XLSX }); sandbox.window = sandbox;
vm.runInContext(fs.readFileSync(path.join(__dirname, '../js/student-import.js'), 'utf8'), sandbox);
const { StudentImport } = sandbox;
const columns = ['Nama','NIS','NISN','Kelas','Guru Tahsin','Guru Tahfidz'];

test('local audit names BOTH students, Excel row numbers, and repeated NISN before RPC', () => {
 const data=StudentImport.parseRows([columns,
  ['Muhammad Gibran Ardana','26270107','3200106581','1 Umar Bin Khottob','Bu Lilis',''],
  ['Muhammad Ibrahim Albarra Maliq','26270110','3200106581','1 Umar Bin Khattab','Bu Lilis',''],
  ['Siswa berbeda','0003','33333','1 Umar Bin Khattab','Bu Lilis','']]);
 const report=StudentImport.auditFileDuplicates(data);
 assert.equal(report.can_import,false);
 assert.equal(report.local_only,true);
 assert.equal(report.summary.conflict,2);
 assert.equal(report.groups.length,1);
 assert.equal(report.groups[0].value,'3200106581');
 assert.deepEqual(Array.from(report.rows.map(s=>s.row)),[2,3]);
 assert.deepEqual(Array.from(report.groups[0].matches.map(s=>s.nama)),['Muhammad Gibran Ardana','Muhammad Ibrahim Albarra Maliq']);
 assert.ok(report.rows[0].related_file_rows.some(r=>r.row===3&&r.nama.includes('Ibrahim')));
});

test('local audit reports all duplicate NIS and NISN groups in a single pass without repeated same-row issues', () => {
 const data=StudentImport.parseRows([columns,
  ['A','01','101','1 A','T',''], ['B','02','101','1 A','T',''],
  ['C','03','103','1 A','T',''], ['D','03','104','1 A','T',''],
  ['E','05','105','1 A','T','']]);
 const r=StudentImport.auditFileDuplicates(data);
 assert.equal(r.groups.length,2);
 assert.equal(r.rows.length,4);
 assert.deepEqual(Array.from(r.rows.map(v=>v.row)),[2,3,4,5]);
 assert.equal(r.summary.conflict,4);
});

test('a file with unique identifiers leaves the DB preview reachable', () => {
 const data=StudentImport.parseRows([columns,
  ['Siswa A','01','101','1 A','T',''],['Siswa B','02','102','1 B','T','']]);
 const r=StudentImport.auditFileDuplicates(data);
 assert.equal(r.can_import,true); assert.equal(r.rows.length,0);
});

test('frontend checks local file before RPC, retains the report and keeps toast short', () => {
 const dashboard=fs.readFileSync('js/dashboard.js','utf8');
 const posLocal=dashboard.indexOf('StudentImport.auditFileDuplicates(entries)');
 const posRPC=dashboard.indexOf("supabase.rpc('preview_import_students'");
 assert.ok(posLocal>=0 && posLocal < posRPC);
 assert.match(dashboard,/if \(!fileAudit\.can_import\)/);
 assert.match(dashboard,/renderStudentImportPreview\(fileAudit\)/);
 assert.match(dashboard,/NAMA SISWA YANG MEMAKAI NIS \/ NISN SAMA/);
 assert.match(dashboard,/AdminNotice\.notify\('File impor perlu diperiksa', 'error'\)/);
 assert.doesNotMatch(dashboard,/if \(!studentImportPreview\.can_import\) \{\s*resetStudentImportPreview\(\)/);
 const panel=fs.readFileSync('admin.html','utf8');
 assert.match(panel,/panel-start\.js\?v=20260928-ui-reset-1/);
 assert.match(panel,/id="studentImportResult"/);
});

test('dashboard blocks duplicate file locally and identifies BOTH names before RPC', async () => {
 const dashboard=fs.readFileSync('js/dashboard.js','utf8');
 const start=dashboard.indexOf('let studentImportPreview = null;');
 const end=dashboard.indexOf("document.addEventListener('panelready'",start);
 const entries=StudentImport.parseRows([columns,
  ['Muhammad Gibran Ardana','26270107','3200106581','1 Umar Bin Khottob','Bu Lilis',''],
  ['Muhammad Ibrahim Albarra Maliq','26270110','3200106581','1 Umar Bin Khattab','Bu Lilis','']]);
 const panel={textContent:'',hidden:false};
 const button={disabled:false,textContent:'Analisis File'};
 const file={name:'siswa.xlsx',size:300,lastModified:1234};
 const controls={csvImportFile:{files:[file]},studentImportYear:{value:'2026'},csvImportBtn:button,studentImportResult:panel};
 let rpcCalls=0;const notifications=[];
 const ctx=vm.createContext({
   StudentImport:{auditFileDuplicates:StudentImport.auditFileDuplicates,read:async()=>entries},
   supabase:{rpc:async()=>{rpcCalls++;return {data:{can_import:true,token:'ok',year_key:2026,
     summary:{new:0,update:2,unchanged:0,review:0,conflict:0,identifiers_cleared:2},
     rows:entries.map((entry,i)=>({row:entry.row,nama:entry.nama,kelas:entry.kelas,
       original_nis:entry.nis,original_nisn:entry.nisn,clear_identifiers:true,
       identifier_warning:'NISN sama pada 2 baris file',target_student_id:38+i,action:'update'}))}};}},
   document:{getElementById:id=>controls[id]},
   AdminNotice:{notify:(...args)=>notifications.push(args)},
   refreshManageImportControls:()=>{}
 });
 vm.runInContext(dashboard.slice(start,end),ctx);
 await vm.runInContext('importManageCsv()',ctx);
 assert.equal(rpcCalls,0,'duplicate file is rejected before calling the RPC');
 assert.match(panel.textContent,/(?:Baris|BARIS) 2: Muhammad Gibran Ardana/);
 assert.match(panel.textContent,/(?:Baris|BARIS) 3: Muhammad Ibrahim Albarra Maliq/);
 assert.match(panel.textContent,/NAMA SISWA YANG MEMAKAI NIS \/ NISN SAMA/);
 assert.equal(button.textContent,'Analisis Ulang');
 assert.ok(notifications.some(([note]) => /perlu diperiksa/.test(note)));
});
