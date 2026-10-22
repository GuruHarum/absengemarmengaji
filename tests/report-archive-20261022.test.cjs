"use strict";
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

const source=path=>fs.readFileSync(path,'utf8');
test('Rapor hanya menyediakan unduhan Word/Excel; tidak ada aksi cetak langsung',()=>{
 const html=source('admin.html'), js=source('js/report-cards.js');
 assert.match(html,/id="downloadReports"/);
 assert.match(html,/id="downloadReportsExcel"/);
 assert.match(html,/Unduh Rapor/);
 assert.doesNotMatch(html,/id="reportDirectPrint"|id="reportPrintTitle"|Cetak Langsung/);
 assert.doesNotMatch(js,/directPrint\(|reportDirectPrint|autoPrint/);
});
test('Arsip dibuka setelah modul rapor dan CSS mobile tersedia',()=>{
 const mod=source('js/panel-modules.js');
 const css=source('css/rapor-workspace.css');
 const sw=source('sw.js');
 assert.match(mod,/arsip: \['reports'\]/);
 assert.match(css,/#page-arsip \.gm-archive-item/);
 assert.match(css,/@media\(max-width:640px\)/);
 assert.match(sw,/report-archives-20261022b/);
 assert.match(source('admin.html'),/rapor-workspace\.css\?v=20261022-archive2/);
});
test('Snapshot diproteksi dan dicatat hanya saat penerbitan, tanpa merekonstruksi arsip lama',()=>{
 const sql=source('supabase/report-issuance-archives-20261022.sql');
 assert.match(sql,/report_issuance_archives/);
 assert.match(sql,/enable row level security/);
 assert.match(sql,/for select to authenticated using \(app_private\.is_report_coordinator\(\)\)/);
 assert.match(sql,/md5\(payload::text\)/);
 assert.match(sql,/on conflict \(student_id,academic_year_start,period,fingerprint\) do nothing/);
 assert.doesNotMatch(sql,/insert into public\.report_issuance_archives[\s\S]*select[\s\S]*from public\.student_reports/i);
});

function fixture(){
 const nodes={},events=[];
 const get=id=>nodes[id]??={
  id,value:'',innerHTML:'',textContent:'',disabled:false,handlers:{},
  addEventListener(name,fn){this.handlers[name]=fn},
  querySelectorAll(){return [{disabled:false},{disabled:false}]}
 };
 const newer={id:7,student_id:'s1',student_name:'Anisa',class_name:'2 A',
  academic_year_start:2026,period:'pts_ganjil',issued_at:'2026-10-22T15:00:00Z'};
 const old=[{student_id:'s1',academic_year_start:2026,period:'pts_ganjil',issued_at:'2026-09-12T12:00:00Z'},
  {student_id:'s2',academic_year_start:2026,period:'pas_ganjil',issued_at:'2026-08-21T12:00:00Z'}];
 const snapshot={student:{id:'s1',name:'Anisa',class:'2 A'},year:2026,period:'pts_ganjil'};
 const data={report_issuance_archives:[newer],student_reports:old};
 const supabase={from(table){return {table,select(){return this},order(){return this},not(){return this},eq(){return this},
    async single(){return {data:{snapshot,issued_at:newer.issued_at},error:null}}}}};
 const ReportZip={safe:value=>value,build:async(rows,options)=>{events.push({type:'build',rows,options});return {zip:true}}};
 const link={click(){events.push({type:'click',filename:this.download})},remove(){}};
 const document={getElementById:get,createElement:()=>link,head:{appendChild(){}},body:{appendChild(){}}};
 const ctx={document,supabase,ReportZip,URL:{createObjectURL:()=> 'blob:archive',revokeObjectURL(){}},
  setTimeout(){},Date,Intl,window:null,
  fetchAllRows:async callback=>data[callback().table],
  escapeHtml:value=>String(value).replaceAll('&','&amp;').replaceAll('<','&lt;'),
  AppAccess:{profile:{role:'koordinator'}},GMPanel:{onPage(){}},console};
 ctx.window=ctx;
 vm.runInNewContext(source('js/gm-upgrade-20260928.js'),ctx);
 return {app:ctx.GMUpgrade,get,events,link,newer};
}
test('Arsip menampilkan snapshot baru, penerbitan lama, dan penanda yang tidak dapat diunduh',async()=>{
 const f=fixture();
 await f.app.archive();
 const html=f.get('gmArchiveEntries').innerHTML;
 assert.match(html,/Anisa/);
 assert.match(html,/Penerbitan lama · s1/);
 assert.match(html,/Penerbitan lama · s2/);
 assert.equal((html.match(/data-archive-id=/g)||[]).length,2);
 assert.match(html,/Salinan asli belum tersedia/);
});
test('Unduh arsip menggunakan tanggal penerbitan lama dan format Excel, bukan PDF',async()=>{
 const f=fixture();await f.app.archive();
 const target={dataset:{archiveId:'7',archiveFormat:'excel'}};
 await f.get('gmArchiveEntries').handlers.click({target:{closest:()=>target}});
 assert.equal(f.events[0].type,'build');
 assert.equal(f.events[0].options.date,f.newer.issued_at);
 assert.equal(f.events[0].options.format,'excel');
 assert.match(f.events[1].filename,/Excel\.zip$/);
});
test('Filter arsip tidak mengubah data penerbitan',async()=>{
 const f=fixture();await f.app.archive();
 f.get('gmArchiveSearch').value='tidak ada';
 f.get('gmArchiveSearch').handlers.input();
 assert.match(f.get('gmArchiveEntries').innerHTML,/Tidak ada arsip sesuai filter/);
 assert.equal(f.events.length,0);
});
test('Tanggal arsip diteruskan ke Word maupun Excel, termasuk layout bersama',()=>{
 const zip=source('js/report-zip.js'), excel=source('js/report-excel.js'), gm=source('js/gm-upgrade-20260928.js');
 assert.match(zip,/const document = await word\(rows, onProgress, \{date\}\)/);
 assert.match(zip,/ReportExcel\.build\(rows, \{onProgress,date\}\)/);
 assert.match(excel,/ReportZip\.layout\(rows,[\s\S]{0,120}\{date\}\)/);
 assert.match(gm,/date:result\.data\.issued_at/);
});
