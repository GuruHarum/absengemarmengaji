const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {inflateRawSync}=require('node:zlib');
function unzip(bytes) {
 const out=new Map();
 const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
 const end=bytes.length-22;
 assert.equal(view.getUint32(end,true),0x06054b50,'missing ZIP end record');
 const count=view.getUint16(end+10,true), centralSize=view.getUint32(end+12,true);
 let pos=view.getUint32(end+16,true);
 assert.equal(pos+centralSize,end,'central directory size is invalid');
 for(let entry=0;entry<count;entry++) {
  assert.equal(view.getUint32(pos,true),0x02014b50,'missing central entry');
  const method=view.getUint16(pos+10,true), crc=view.getUint32(pos+16,true);
  const size=view.getUint32(pos+20,true), rawSize=view.getUint32(pos+24,true);
  const length=view.getUint16(pos+28,true), extra=view.getUint16(pos+30,true), comment=view.getUint16(pos+32,true);
  const local=view.getUint32(pos+42,true);
  assert.equal(view.getUint32(local,true),0x04034b50,'invalid local offset');
  assert.equal(view.getUint16(local+8,true),method,'compression method differs between ZIP headers');
  assert.equal(view.getUint32(local+14,true),crc,'CRC differs between ZIP headers');
  assert.equal(view.getUint32(local+18,true),size,'compressed length differs between ZIP headers');
  assert.equal(view.getUint32(local+22,true),rawSize,'raw length differs between ZIP headers');
  const localLength=view.getUint16(local+26,true), localExtra=view.getUint16(local+28,true);
  const name=new TextDecoder().decode(bytes.subarray(pos+46,pos+46+length));
  assert.equal(new TextDecoder().decode(bytes.subarray(local+30,local+30+localLength)),name);
  const start=local+30+localLength+localExtra;
  assert(start+size<=view.getUint32(end+16,true),'entry overlaps central directory');
  const data=bytes.subarray(start,start+size), decoded=method===8?inflateRawSync(data):data;
  assert.equal(decoded.length,rawSize,'decoded entry size is invalid');
  let computed=0xffffffff;
  for(const byte of decoded) {computed^=byte;for(let bit=0;bit<8;bit++)computed=(computed>>>1)^((computed&1)?0xedb88320:0);}
  assert.equal((computed^0xffffffff)>>>0,crc,'ZIP entry CRC is invalid');
  out.set(name,decoded);
  pos+=46+length+extra+comment;
 }
 assert.equal(pos,end,'central entry count is invalid');
 return out;
}
function wordContext(compressed=true) {
 const ctx={window:{},Blob,TextEncoder,Uint8Array,Uint32Array,setTimeout,
   ...(compressed?{CompressionStream,Response}:{}),
   document:{createElement(){return {getContext(){return {font:'',measureText(text){return {width:String(text).length*parseFloat(this.font.split(' ')[1])*.5};}};},toBlob(){throw Error('Full-page rasterization is forbidden');}};}}};
 ctx.window=ctx;vm.createContext(ctx);
 for(const name of ['quran-surahs','report-reference','report-core','report-pdf','report-zip']) vm.runInContext(fs.readFileSync('js/'+name+'.js','utf8'),ctx);
 return ctx;
}
function report(id=1) {
 return {student:{id,name:'Siswa & Uji '+id,class:'1 A',nis:'123',nisn:'1234567890'},year:2026,period:'pts_ganjil',
 school:{name:'SDIT Sekolah Uji'},officials:{city:'Jakarta',principal_name:'Kepala Sekolah',principal_niy:'123',coordinator_name:'Koordinator',coordinator_niy:'456'},
 teachers:{tahsin:'Guru Tahsin',tahfidz:'Guru Tahfidz'},settings:{tahsin_kkm:70,tahfidz_kkm:70},
 tahsin:{scores:{tahsin_progress_type:'FINISHING',tahsin_makhraj:0,tahsin_tajwid:80,tahsin_tartil:80,tahsin_gharib:80}},
 tahfidz:{scores:{tahfidz_progress_type:'SURAT',tahfidz_juz:30,tahfidz_surah:108,tahfidz_ayah_start:2,tahfidz_ayah:3,tahfidz_aspect_confirmed:true,tahfidz_makhraj:80,tahfidz_tajwid:80,tahfidz_hafalan:80}}};
}
test('Word ZIP has editable text, native merged tables and A4 pages without pupil images',async()=>{
 const ctx=wordContext();const rows=[report(1),report(2)];const progress=[];
 const zip=await ctx.ReportZip.build(rows,{format:'word',fileName:'Rapor.docx',onProgress:n=>progress.push(n)});
 const outer=unzip(new Uint8Array(await zip.arrayBuffer()));assert.deepEqual([...outer.keys()],['Rapor.docx']);
 const doc=unzip(outer.get('Rapor.docx'));assert(doc.has('[Content_Types].xml'));
 assert(![...doc.keys()].some(key=>key.startsWith('word/media/')));
 const xml=new TextDecoder().decode(doc.get('word/document.xml'));
 assert.match(xml,/<w:t[^>]*>SISWA &amp; UJI 1<\/w:t>/);assert.match(xml,/SISWA &amp; UJI 2/);
 assert.match(xml,/<w:tbl>/);assert.match(xml,/<w:vMerge w:val="restart"/);assert.match(xml,/<w:gridSpan/);
 assert.match(xml,/GURU PEMBIMBING : GURU TAHSIN/);assert.match(xml,/>0<\/w:t>/);
 assert.equal((xml.match(/<w:pageBreakBefore\/>/g)||[]).length,1);
 assert.match(xml,/w:w="11906" w:h="16838"/);assert(!xml.includes('<wp:anchor'));
 assert.deepEqual(progress,[0,1,2]);
 const stored=await wordContext(false).ReportZip.word(rows);
 assert(zip.size<stored.size/4,'XML compression should substantially reduce download size');
});
test('central-directory ZIP reader detects the reported corrupt compression metadata',async()=>{
 const blob=await wordContext().ReportZip.word([report()]);
 const bytes=new Uint8Array(await blob.arrayBuffer()),view=new DataView(bytes.buffer);
 const central=view.getUint32(bytes.length-22+16,true);
 assert.equal(view.getUint16(central+10,true),8);
 view.setUint16(central+10,0,true);
 view.setUint32(central+20,view.getUint32(central+24,true),true);
 assert.throws(()=>unzip(bytes),/compression method differs/);
});
test('browsers without raw DEFLATE support still export a valid DOCX',async()=>{
 const ctx=wordContext();ctx.CompressionStream=class {constructor(){throw Error('Unsupported compression format');}};
 const blob=await ctx.ReportZip.word([report()]);
 const files=unzip(new Uint8Array(await blob.arrayBuffer()));
 assert.match(new TextDecoder().decode(files.get('word/document.xml')),/SISWA &amp; UJI 1/);
});
test('DOCX properties follow OOXML order and text omits illegal XML control characters',async()=>{
 const row=report();row.officials.city='Kota\u0001 Uji';
 const blob=await wordContext().ReportZip.word([row]);
 const files=unzip(new Uint8Array(await blob.arrayBuffer()));
 const xml=new TextDecoder().decode(files.get('word/document.xml'));
 assert(!xml.includes('\u0001'));
 for(const [,properties] of xml.matchAll(/<w:rPr>(.*?)<\/w:rPr>/g)) {
  assert(properties.indexOf('<w:color ')<properties.indexOf('<w:sz '),'color must precede font size');
 }
 for(const [,properties] of xml.matchAll(/<w:tblPr>(.*?)<\/w:tblPr>/g)) {
  const order=['<w:tblW ','<w:tblBorders>','<w:tblLayout ','<w:tblCellMar>'].map(tag=>properties.indexOf(tag));
  assert(order.every((pos,i)=>pos>=0 && (!i || pos>order[i-1])),'table properties must follow OOXML order');
 }
 assert.match(xml,/<v:shapetype id="_x0000_t202"/,'referenced VML type must be defined');
});
test('incomplete reports cannot be exported as final Word',async()=>{
 const ctx={window:{},Blob,TextEncoder,Uint8Array,Uint32Array,ReportCore:{reportCheck:()=>({complete:false})},ReportPDF:{sorted:r=>r}};
 vm.runInNewContext(fs.readFileSync('js/report-zip.js','utf8'),ctx);
 await assert.rejects(ctx.window.ReportZip.word([{student:{id:1}}]),/harus lengkap/);
});
function logoContext() {
 const ctx=wordContext();const png=fs.readFileSync('assets/school-logo.png');
 let fetches=0,draws=0;
 const measuringCanvas=ctx.document.createElement();
 ctx.fetch=async()=>{fetches++;return {ok:true,blob:async()=>new Blob([png])};};
 ctx.createImageBitmap=async()=>({width:512,height:512,close(){}});
 ctx.document.createElement=()=>({getContext:()=>({...measuringCanvas.getContext(),beginPath(){},arc(){},clip(){},drawImage(){draws++;}}),toBlob:cb=>cb(new Blob([png]))});
 return {ctx,counts:()=>({fetches,draws})};
}
test('logo is shared across pupils while all report content remains native Word text',async()=>{
 const {ctx,counts}=logoContext();const rows=[report(1),report(2)];
 for(const row of rows)row.school.logo_url='assets/school-logo.png';
 const blob=await ctx.ReportZip.word(rows),files=unzip(new Uint8Array(await blob.arrayBuffer()));
 assert.deepEqual([...files.keys()].filter(key=>key.startsWith('word/media/')),['word/media/logo0.png']);
 assert.deepEqual(counts(),{fetches:1,draws:1});
 const xml=new TextDecoder().decode(files.get('word/document.xml'));
 assert.equal((xml.match(/r:embed="logo0"/g)||[]).length,2);
 assert(!xml.includes('page0.png'));assert(xml.includes('<w:txbxContent>'));
});
test('overlong text is rejected instead of clipped in a fixed page layout',async()=>{
 const row=report();row.student.name='Sangat Panjang '.repeat(50);
 await assert.rejects(wordContext().ReportZip.word([row]),/Teks terlalu panjang/);
});
test('delete cancellation never writes; successful deletion reloads the active log',async()=>{
 let writes=0,reloads=0,accepted=false;
 const ctx={window:{},document:{getElementById:()=>null},filteredAttendanceData:[{id:7,student:'Siswa',date:'2026-10-07'}],
 AdminNotice:{confirm:async()=>accepted,notify(){}},deleteAttendance:async id=>{assert.equal(id,'7');writes++;},loadAttendanceLog:async()=>reloads++};
 const source=fs.readFileSync('js/admin.js','utf8');
 vm.runInNewContext(source.slice(source.indexOf('async function attendanceLogAction'), source.indexOf('function renderAdminTable')),ctx);
 const button={hasAttribute:()=>true,dataset:{logDelete:'7'}};
 await ctx.attendanceLogAction(button);assert.equal(writes,0);
 accepted=true;await ctx.attendanceLogAction(button);assert.equal(writes,1);assert.equal(reloads,1);assert.equal(button.disabled,false);
});
