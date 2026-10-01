'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const read=p=>fs.readFileSync(p,'utf8');
function logContext(getAttendance){
 const nodes={attendanceLogDate:{value:''},attendanceLogStatus:{textContent:''},filterClassNumber:{value:''}};
 const ctx=vm.createContext({Intl,Date,console,Event,window:{dispatchEvent(){}},document:{getElementById:id=>nodes[id],addEventListener(){},querySelectorAll:()=>[]},getAttendance,filteredAttendanceData:[],currentPage:4,renderAdminData(){},extractClassNumber:v=>v.match(/\d+/)?.[0]||''});
 vm.runInContext(read('js/page-refinements.js'),ctx);return {ctx,nodes};
}
test('log defaults to today in Jakarta and keeps monthly records separate',async()=>{
 let filter;const {ctx}=logContext(async f=>{filter=f;return [{date:f.date,student:'A'},{date:'2000-01-01',student:'B'}]});
 await ctx.loadAttendanceLog();assert.equal(filter.date,ctx.attendanceLogToday());assert.equal(ctx.filteredAttendanceData.length,1);assert.equal(ctx.currentPage,1);
});
test('explicit date wins and clearing returns to today',async()=>{
 const dates=[];const {ctx,nodes}=logContext(async f=>{dates.push(f.date);return []});
 nodes.attendanceLogDate.value='2026-09-20';await ctx.loadAttendanceLog();nodes.attendanceLogDate.value='';await ctx.loadAttendanceLog();
 assert.deepEqual(dates,['2026-09-20',ctx.attendanceLogToday()]);
});
test('late log response cannot overwrite newer selected date',async()=>{
 const pending=[];const {ctx,nodes}=logContext(f=>new Promise(resolve=>pending.push({f,resolve})));
 nodes.attendanceLogDate.value='2026-09-20';const first=ctx.loadAttendanceLog();
 nodes.attendanceLogDate.value='2026-09-21';const second=ctx.loadAttendanceLog();
 pending[1].resolve([{date:pending[1].f.date,student:'new'}]);await second;
 pending[0].resolve([{date:pending[0].f.date,student:'old'}]);await first;
 assert.equal(ctx.filteredAttendanceData[0].student,'new');
});
test('presentation reports are mutually exclusive with overview',()=>{
 const {ctx,nodes}=logContext(async()=>[]);nodes.presentationOverview={hidden:false};nodes.presentationReports={hidden:true};
 ctx.switchPresentationTab('reports');assert.equal(nodes.presentationOverview.hidden,true);assert.equal(nodes.presentationReports.hidden,false);
 ctx.switchPresentationTab('overview');assert.equal(nodes.presentationOverview.hidden,false);assert.equal(nodes.presentationReports.hidden,true);
});
test('maintenance reads fresh public status, rejects unavailable status',async()=>{
 let result=[{enabled:false}],options;
 const ctx=vm.createContext({URL,console,window:{},SUPABASE_URL:'https://example.test',SUPABASE_ANON_KEY:'public-key',fetch:async(url,o)=>{options=o;return {ok:true,json:async()=>result}}});
 const source=read('js/database.js').match(/async function getMaintenanceMode\(\) \{[\s\S]*?\n\}/)[0];vm.runInContext(source,ctx);
 assert.equal(await ctx.getMaintenanceMode(),false);assert.equal(options.cache,'no-store');assert.equal(options.headers.Authorization,'Bearer public-key');
 result=[{enabled:true}];assert.equal(await ctx.getMaintenanceMode(),true);
 result={message:'bad'};await assert.rejects(()=>ctx.getMaintenanceMode());
});
test('log markup has four columns and retired admin pages are absent',()=>{
 const html=read('admin.html');assert.doesNotMatch(html,/id="(?:menu|page)-(?:infografik|analitik|laporan)"/);
 for(const name of ['admin','guru']){
  const table=read(name+'.html').match(/<table id="attendanceLogTable"[\s\S]*?<\/thead>/)[0];
  assert.deepEqual([...table.matchAll(/<th\b[^>]*>(.*?)<\/th>/g)].map(m=>m[1]),['Siswa','Kelas','Status','Catatan']);
 }
 assert.match(read('js/public-app.js'),/PUBLIC_LOADER_MIN_MS = 5000/);
 assert.doesNotMatch(read('js/pwa.js'),/tools\.append\(statusButton/);
});
