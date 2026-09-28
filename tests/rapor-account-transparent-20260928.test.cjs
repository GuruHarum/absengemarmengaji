'use strict';
const {test}=require('node:test'), assert=require('node:assert/strict'), fs=require('node:fs'), vm=require('node:vm');
const html=fs.readFileSync('admin.html','utf8');
const pdfCode=fs.readFileSync('js/report-pdf.js','utf8');
const cards=fs.readFileSync('js/report-cards.js','utf8');
const accountCode=fs.readFileSync('js/accounts.js','utf8');

test('Rapor has three separate, accessible submenu panels without destroying existing controls',()=>{
  for(const id of ['reportViewPreview','reportViewMissing','reportViewPrint','reportSelection','reportPreview','reportDataAudit','checkMissingScores','downloadReports','reportPdfLink','reportPaperTint'])
    assert.equal((html.match(new RegExp(`id="${id}"`,'g'))||[]).length,1,id);
  assert.equal((html.match(/data-rapor-view=/g)||[]).length,3);
  assert.match(cards,/function changeTab\(tab\)/);
  assert.match(cards,/activeTab === 'preview'/);
  assert.match(fs.readFileSync('css/report-cards.css','utf8'),/#page-rapor \[hidden\] \{ display: none !important; \}/);
});

test('Akses Akun email uses the same rows as the card and can be clicked to select',()=>{
  assert.match(accountCode,/gmExistingSchoolAccounts = data/);
  assert.match(accountCode,/gmTeacherAccountHints = data\.flatMap/);
  assert.match(accountCode,/data-use-account=/);
  assert.match(accountCode,/\[data-use-account\]/);
  assert.match(html,/list="accountEmailOptions"/);
  assert.match(accountCode,/Email ini sudah terhubung dengan guru lain/);
});

test('Canvas report remains transparent; every label/name/signer uppercase except competence and teacher note',async()=>{
  const commands=[];
  const ctx={
    scale(){}, strokeRect(){}, fillRect(){throw Error('White/tinted fill forbidden');},beginPath(){},moveTo(){},lineTo(){},stroke(){},
    save(){},restore(){},translate(){},rotate(){},drawImage(){},
    measureText(str){return {width:str.length*.48}},
    fillText(str){commands.push(str)},
    set font(v){this._font=v},get font(){return this._font},
    set fillStyle(v){this._fill=v},get fillStyle(){return this._fill}
  };
  const canvas={width:0,height:0,getContext(){return ctx}};
  const reference={texts:{}};
  const core={
    reportCheck(){return {complete:true}},useReference(){},periods:{pts_ganjil:'Penilaian Tengah Semester Ganjil'},
    stats(){return {sum:250,average:83.5,grade:'B',predicate:'Baik',complete:true}},
    applicable(){return {keys:['tahsin_makhraj','tahsin_tajwid','tahsin_tartil','tahsin_gharib','tahfidz_makhraj','tahfidz_tajwid','tahfidz_hafalan']}},
    blank(v){return v==null},aspect(){return 'Baik'},progress(){return 'Buku 2 halaman 5'},
    description(){return 'Ananda Budi membaca dengan lancar.'},
    note(){return 'Ananda Budi perlu latihan mandiri di rumah.'}
  };
  const context=vm.createContext({window:{},document:{createElement(tag){assert.equal(tag,'canvas');return canvas}},ReportCore:core,Image:function(){}});
  vm.runInContext(pdfCode,context);
  const report={period:'pts_ganjil',year:2026,reference,
    school:{name:'Sekolah Uji',logo_url:null},student:{name:'Budi Santoso',nis:'0123',nisn:'0123456789',class:'1 A'},
    teachers:{tahsin:'Bu Siti',tahfidz:'Pak Ali'},settings:{},tahsin:{scores:{}},tahfidz:{scores:{}},
    officials:{city:'Karawang',principal_name:'Ibu Kepala',coordinator_name:'Pak Koordinator',principal_niy:'100',coordinator_niy:'101'}};
  const returned=await context.window.ReportPDF.render(report,{date:new Date('2026-09-28T07:00:00Z')});
  assert.equal(returned,canvas);
  assert.ok(commands.some(t=>t.includes('SEKOLAH UJI')));
  assert.ok(commands.some(t=>t.includes('NAMA : BUDI SANTOSO')));
  assert.ok(commands.some(t=>t.includes('BU SITI')));
  assert.ok(commands.some(t=>t.includes('IBU KEPALA')));
  assert.ok(commands.some(t=>t.includes('KARAWANG')));
  assert.ok(commands.some(t=>t.includes('Ananda Budi membaca')));
  assert.ok(commands.some(t=>t.includes('Ananda Budi perlu')));
  const prose=commands.filter(t=>t.includes('Ananda Budi'));
  assert.ok(prose.length >= 2);
  const ordinary=commands.filter(t=>!t.includes('Ananda Budi'));
  assert.ok(ordinary.every(t=>t===t.toLocaleUpperCase('id-ID')),ordinary.filter(t=>t!==t.toLocaleUpperCase('id-ID')).join('|'));
  assert.doesNotMatch(pdfCode,/c\.fillRect\(/);
});
