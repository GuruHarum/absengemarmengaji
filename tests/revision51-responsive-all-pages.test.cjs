const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');

test('REV51 loader and responsive stylesheet are wired',()=>{
  const admin=read('admin.html');
  assert(admin.includes('css/rev51-responsive.css?v=20260930-rev51'));
  assert(admin.includes('20260930-loader51'));
  assert(read('js/pwa.js').includes("BUILD = 'loader51'"));
  assert(read('sw.js').includes("VERSION = 'loader51'"));
  assert(read('sw.js').includes("'/css/rev51-responsive.css'"));
});

test('manage data rows have dedicated responsive classes',()=>{
  const js=read('js/dashboard.js');
  assert(js.includes('gm-manage-class-row'));
  assert(js.includes('gm-manage-actions'));
  const css=read('css/rev51-responsive.css');
  assert(css.includes('#manageDirectoryTable table.gm-table-card-mode'));
  assert(css.includes('@media (max-width: 420px)'));
});

test('global mobile, tablet, landscape and safe-area rules exist',()=>{
  const css=read('css/rev51-responsive.css');
  for(const token of ['@media (max-width: 767px)','@media (min-width:768px) and (max-width:1180px)','orientation:landscape','safe-area-inset-left','dialog']) assert(css.includes(token));
});
