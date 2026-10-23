"use strict";
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const read=name=>fs.readFileSync(name,'utf8');
const html=read('admin.html');
const dashboard=read('js/dashboard.js');
const accounts=read('js/accounts.js');
const css=read('css/gm-data-navigation.css');

test('Kelola Guru uses one responsive account directory',()=>{
  const section=html.split('id="manageAccountView"')[1]?.split('id="manageImportView"')[0]||'';
  assert.match(section,/id="manageAccountSearch"/);
  assert.match(section,/id="manageAccountRows"/);
  assert.match(section,/id="manageAccountCards"/);
  assert.match(section,/<th>Peran &amp; Tautan<\/th>/);
  assert.match(dashboard,/gm-account-list-row/);
  assert.match(dashboard,/gm-account-avatar/);
  assert.match(css,/@media\(max-width:630px\)/);
  assert.match(css,/#kelolaDataSection \.gm-account-list-row/);
});
test('Hak Akses is modal-only; the same form and RPC remain intact',()=>{
  assert.doesNotMatch(html,/id="manageAccessDetails"/);
  assert.match(html,/id="manageAccessModal"/);
  assert.match(html,/aria-modal="true"/);
  for(const id of ['accountForm','accountTeacher','accountRoleSelect','accountEmail','accountSave']){
    assert.equal((html.match(new RegExp('id="'+id+'"','g'))||[]).length,1);
  }
  assert.match(dashboard,/save\.setAttribute\('form','accountForm'\)/);
  assert.match(dashboard,/closeManageAccountEditor/);
  assert.match(accounts,/assign_school_account/);
  assert.match(accounts,/window\.closeManageAccountEditor\?\.\(\)/);
});
test('Student filters remain available only for student tab',()=>{
  assert.match(html,/id="studentManageFilters"/);
  assert.match(dashboard,/filterWrap\.hidden=!studentOnly/);
  assert.match(dashboard,/searchRow\.hidden=!studentOnly/);
  assert.match(dashboard,/currentManageTab!=='siswa'\|\|!search/);
  assert.match(dashboard,/getElementById\('manageAccountSearch'\)\?\.addEventListener\('input'/);
  assert.match(css,/#studentManageFilters\[hidden\]/);
});
test('Modified scripts parse',()=>{
  for(const name of ['js/dashboard.js','js/accounts.js'])assert.doesNotThrow(()=>new vm.Script(read(name)));
});
