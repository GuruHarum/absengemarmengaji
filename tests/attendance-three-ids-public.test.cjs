const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const src = fs.readFileSync('js/database.js','utf8');
const start = src.indexOf('async function getPublicAttendanceIds(');
const end = src.indexOf('async function saveAttendance(record)',start);
assert.ok(start>=0 && end>start);
const resolver = src.slice(start,end);
function harness(classes,teachers) {
 const context = {
   teachersData: teachers,
   supabase: { from(table){ assert.equal(table,'school_classes'); return { select(){return { eq(key,year){assert.equal(key,'academic_year_start');return Promise.resolve({ data: classes.filter(c=>c.academic_year_start===year),error:null });} };} }; } },
   Error,Number,String
 };
 vm.createContext(context);
 vm.runInContext(resolver+';globalResolver=getPublicAttendanceIds;',context);
 return context.globalResolver;
}
test('parent flow resolves student/class/teacher unique IDs with no extra prompt',async()=>{
 const resolve=harness([{id:33,class_name:'4 Muadz Bin Jabbal',academic_year_start:2026}], [{id:46,nama:'Bu Wafi'}]);
 const result=await resolve({id:629,kelas:'4 Muadz  Bin Jabbal'},'Bu Wafi','2026-09-27');
 assert.deepEqual(JSON.parse(JSON.stringify(result)),{student_id:629,class_id:33,teacher_id:46});
});
test('a missing class fails closed instead of guessing',async()=>{
 const resolve=harness([], [{id:46,nama:'Bu Wafi'}]);
 await assert.rejects(resolve({id:629,kelas:'4 Muadz Bin Jabbal'},'Bu Wafi','2026-09-27'),/Kelas tidak ditemukan/);
});
test('a duplicate teacher fails closed instead of guessing',async()=>{
 const resolve=harness([{id:33,class_name:'4 Muadz Bin Jabbal',academic_year_start:2026}],[{id:46,nama:'Bu Wafi'},{id:47,nama:'Bu Wafi'}]);
 await assert.rejects(resolve({id:629,kelas:'4 Muadz Bin Jabbal'},'Bu Wafi','2026-09-27'),/Identitas guru tidak unik/);
});
test('January maps to preceding school year',async()=>{
 const resolve=harness([{id:33,class_name:'4 Muadz Bin Jabbal',academic_year_start:2026}], [{id:46,nama:'Bu Wafi'}]);
 const result=await resolve({id:629,kelas:'4 Muadz Bin Jabbal'},'Bu Wafi','2027-01-05');
 assert.equal(result.class_id,33);
});
