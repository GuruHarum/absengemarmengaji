'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const read=p=>fs.readFileSync(p,'utf8');
function tableFixture(layout){
 class Table {}
 const table=new Table();const classes=new Set(['gm-table-card-mode']);
 const headers=['Siswa','Kelas','Status','Catatan'];
 const cells=headers.map(()=>({tagName:'TD',dataset:{},hasAttribute:()=>false}));
 Object.assign(table,{dataset:layout?{tableLayout:layout}:{},closest:()=>null,classList:{add:c=>classes.add(c),remove:(...values)=>values.forEach(c=>classes.delete(c)),contains:c=>classes.has(c)},parentElement:{classList:{add(){}}},querySelectorAll:s=>s==='thead th'?headers.map(textContent=>({textContent})):[{children:cells}]});
 const ctx=vm.createContext({window:{},HTMLTableElement:Table,document:{readyState:'loading',addEventListener(){}}});
 vm.runInContext(read('js/ux-stage5.js'),ctx);
 return {table,classes,cells,enhance:()=>ctx.window.GMUX.enhanceTables({querySelectorAll:()=>[table]})};
}
test('four-column attendance log remains a scrolling table after initial render and pagination',()=>{
 const f=tableFixture('scroll');f.enhance();
 assert(f.classes.has('gm-table-scroll-mode'));assert(!f.classes.has('gm-table-card-mode'));
 f.table.dataset.gmTableEnhanced='';f.enhance();
 assert(!f.classes.has('gm-table-card-mode'));assert.deepEqual(f.cells.map(c=>c.dataset.label),['Siswa','Kelas','Status','Catatan']);
});
test('other four-column tables retain their existing mobile card layout',()=>{
 const f=tableFixture();f.enhance();assert(f.classes.has('gm-table-card-mode'));
});
test('both panels request scroll layout and omit removed date helper',()=>{
 for(const page of ['admin','guru']){
  const html=read(page+'.html');assert.match(html,/id="attendanceLogTable" data-table-layout="scroll"/);
  assert.doesNotMatch(html,/attendanceLogDateHint|Tanpa pilihan tanggal/);
  assert.match(html,/id="attendanceLogDate" type="date"/);
 }
});
