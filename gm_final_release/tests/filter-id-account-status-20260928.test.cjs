'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const read=p=>fs.readFileSync(p,'utf8');
test('filters prefer stable teacher_id and class_id over stale text',()=>{
 const env={console};env.window=env;
 env.tahsinRosterTeachers=[{id:34,nama:'Bu Amil'},{id:45,nama:'Bu Ulfa'}];
 env.tahsinRosterStudents=[{id:89,'nama siswa':'Aksana',kelas:'1 Ali Bin Abi Thalib','nama guru':'Bu Amil',teacher_id:34,class_id:2}];
 vm.createContext(env);vm.runInContext(read('js/filter-identity.js'),env);
 const correct={student_id:89,teacher_id:34,class_id:2,student:'Nama lama',teacher:'Bu Ulfa',class:'Kelas lama'};
 const other={student_id:89,teacher_id:45,class_id:5,student:'Nama lama',teacher:'Bu Amil',class:'1 Ali Bin Abi Thalib'};
 assert.equal(env.GMFilter.teacherMatches(correct,'Bu Amil'),true);
 assert.equal(env.GMFilter.classMatches(correct,'1 Ali Bin Abi Thalib'),true);
 assert.equal(env.GMFilter.studentMatches(correct,env.tahsinRosterStudents[0]),true);
 assert.equal(env.GMFilter.teacherMatches(other,'Bu Amil'),false);
 assert.equal(env.GMFilter.classMatches(other,'1 Ali Bin Abi Thalib'),false);
 assert.equal(env.GMFilter.studentMatches(other,{id:999,kelas:'1 Ali Bin Abi Thalib','nama siswa':'Nama lama'}),false);
 assert.equal(env.GMFilter.teacherMatches({teacher:'Bu Amil'},'Bu Amil'),true);
});
test('server attendance query filters by IDs, not stale names, and selects all three IDs',async()=>{
 const calls=[];
 const result=[{id:12,date:'2026-09-27',student_id:89,class_id:2,teacher_id:34,teacher:'Nama lama',class:'Kelas lama',student:'Nama lama'}];
 const chain={
  select(cols){calls.push(['select',cols]);return this;},
  eq(k,v){calls.push(['eq',k,String(v)]);return this;},
  gte(k,v){calls.push(['gte',k,v]);return this;},
  lte(k,v){calls.push(['lte',k,v]);return this;},
  order(){return this;},
  range(){return Promise.resolve({data:result,error:null});}
 };
 const env={console,supabase:{from(t){assert.equal(t,'attendance');return chain;}}};env.window=env;
 env.__gemarMengajiRealtimeChannel=true;
 env.tahsinRosterTeachers=[{id:34,nama:'Bu Amil'}];
 env.tahsinRosterStudents=[{id:89,class_id:2,kelas:'1 Ali Bin Abi Thalib',teacher_id:34,'nama guru':'Bu Amil'}];
 vm.createContext(env);vm.runInContext(read('js/filter-identity.js'),env);
 vm.runInContext(read('js/database.js'),env);
 const got=await env.getAttendance({teacher:'Bu Amil',class:'1 Ali Bin Abi Thalib',date_from:'2026-09-01',date_to:'2026-09-30'});
 assert.equal(got.length,1);
 assert.ok(calls.find(c=>c[0]==='eq'&&c[1]==='teacher_id'&&c[2]==='34'));
 assert.ok(calls.find(c=>c[0]==='eq'&&c[1]==='class_id'&&c[2]==='2'));
 assert.ok(!calls.some(c=>c[0]==='eq'&&['teacher','class'].includes(c[1])));
 assert.match(calls.find(c=>c[0]==='select')[1],/student_id,class_id,teacher_id/);
});
test('account status SQL includes registered Authentication users without existing roles, manager-only',()=>{
 const sql=read('supabase/20260928-11-status-tautan-akun-READ-ONLY.sql');
 assert.match(sql,/FROM auth\.users u[\s\S]*LEFT JOIN public\.user_roles r/);
 assert.match(sql,/app_private\.is_manager\(\)/);
 assert.match(sql,/GRANT EXECUTE ON FUNCTION public\.gm_list_account_link_status\(\) TO authenticated/);
 assert.doesNotMatch(sql,/\b(?:DELETE|TRUNCATE|UPDATE)\s+(?:FROM\s+)?(?:auth\.users|public\.(?:attendance|students))\b/i);
});
test('account directory shows linked/unlinked/unassigned teacher markers without inventing email',async()=>{
 const node=(props={})=>({value:'',textContent:'',innerHTML:'',options:[],replaceChildren(...vals){this.options=vals;this.innerHTML=''},add(o){this.options.push(o)},append(){},insertAdjacentHTML(){},...props});
 const elements={
  accountTeacher:node(),accountRows:node(),accountEmailOptions:node(),accountLinkFilter:node(),
  accountLinkSummary:node(),accountDirectoryHint:node(),accountFeedback:node(),
  accountEmail:node(),accountEmailHint:node()
 };
 const teachers=[{id:34,nama:'Bu Amil',nama_lengkap:'Bu Amil'},{id:45,nama:'Bu Ulfa',nama_lengkap:'Bu Ulfa'}];
 const accounts=[
  {email:'amil@school.sch.id',role:'guru',teacher_name:'Bu Amil',teacher_id:34,link_status:'linked'},
  {email:'ulfa@school.sch.id',role:'belum_ditetapkan',teacher_name:null,teacher_id:null,link_status:'unassigned'},
  {email:'office@school.sch.id',role:'admin',teacher_name:null,teacher_id:null,link_status:'admin'}
 ];
 const env={console,document:{getElementById(id){return elements[id]},querySelectorAll(){return []},addEventListener(){}},
   Option:class {constructor(text,value){this.text=text;this.value=value;this.dataset={}}},
   AppAccess:{full(){return true}},escapeHtml:s=>String(s),getTeachers:async()=>teachers,
   supabase:{rpc:async name=>{assert.equal(name,'gm_list_account_link_status');return {data:accounts,error:null}},from:()=>({select:()=>({eq:async()=>({data:[],error:null})})})}};
 vm.createContext(env);vm.runInContext(read('js/accounts.js'),env);
 await env.loadAccountSettings();
 assert.match(elements.accountRows.innerHTML,/Sudah tertaut/);
 assert.match(elements.accountRows.innerHTML,/Belum diberi peran/);
 assert.match(elements.accountRows.innerHTML,/Admin · Semua data/);
 assert.match(elements.accountLinkSummary.textContent,/1 akun tertaut · 1 perlu ditautkan/);
 assert.match(elements.accountTeacher.options.find(o=>o.value==='34').text,/amil@school/);
 assert.match(elements.accountTeacher.options.find(o=>o.value==='45').text,/Belum tertaut/);
 env.gmSyncEmailFromTeacher('34');assert.equal(elements.accountEmail.value,'amil@school.sch.id');
 env.gmSyncEmailFromTeacher('45');assert.equal(elements.accountEmail.value,'');
});
