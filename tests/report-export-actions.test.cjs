'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
function fixture() {
    const nodes = new Map(), builds = [], events = [], messages = [], issued = [];
    const el = id => {
        if (!nodes.has(id)) nodes.set(id, {value:'',hidden:false,disabled:false,textContent:'',classList:{add(){},remove(){},toggle(){}},click(){events.push('download');}});
        return nodes.get(id);
    };
    for (const [id,value] of Object.entries({reportDownloadMode:'grade',reportDownloadClass:'',reportGrade:'1',reportExam:'pts',reportSemester:'ganjil',reportYear:'2026'})) el(id).value=value;
    const rows=[{student:{id:1,name:'Siswa',class:'1 A'},year:2026,period:'pts_ganjil',fingerprint:'data-version'}];
    const context = {el,rows,busy:false,pdfUrl:null,lastDownloadAttempt:null,downloadStartedAt:0,
        URL:{createObjectURL:()=> 'blob:test',revokeObjectURL(){}},
        load:async()=>true,checks(){events.push('checks');},tell:message=>messages.push(message),
        updatePdfProgress(){},formatDuration:()=> '1 detik',
        ReportCore:{reportCheck:()=>({complete:true})},
        ReportZip:{safe:value=>value,build:async(records,options)=>{assert(el('downloadReportsExcel').disabled);builds.push(options.format);events.push('build');return new Blob(['zip']);}},
        window:{},supabase:{rpc:async(name,options)=>{issued.push({name,options});events.push('issuance');return {};}}};
    const source = fs.readFileSync('js/report-cards.js','utf8');
    const code = source.slice(source.indexOf('    function setBusy('),source.indexOf('    function formatDuration(')) +
        source.slice(source.indexOf('    function refreshDownloadScope('),source.indexOf('    function updateNavigationButtons(')) +
        source.slice(source.indexOf('    async function download('),source.indexOf('    function changeTab('));
    vm.runInNewContext(code,context);
    return {context,el,builds,events,messages,issued};
}
test('Word and Excel actions keep distinct formats and ZIP filenames, and issue only after build',async()=>{
    const f=fixture();await f.context.download(false,'word');
    assert.match(f.el('reportPdfLink').download,/ - Word\.zip$/);
    await f.context.download(false,'excel');assert.match(f.el('reportPdfLink').download,/ - Excel\.zip$/);
    assert.deepEqual(f.builds,['word','excel']);assert.deepEqual(f.events,['build','issuance','download','build','issuance','download']);
    assert.equal(f.issued.length,2);assert.equal(f.el('downloadReportsExcel').disabled,false);
});
test('retry preserves Excel format and original scope, and failed exports do not issue reports',async()=>{
    const f=fixture();f.context.ReportZip.build=async(_,options)=>{f.builds.push(options.format);throw Error('Unduhan terhenti');};
    await f.context.download(false,'excel');assert.equal(f.issued.length,0);assert.equal(f.el('reportRetryDownload').hidden,false);
    f.el('reportDownloadMode').value='class';f.el('reportDownloadClass').value='2 B';
    f.context.ReportZip.build=async(_,options)=>{f.builds.push(options.format);return new Blob(['zip']);};
    await f.context.download(true);assert.deepEqual(f.builds,['excel','excel']);assert.equal(f.el('reportDownloadMode').value,'grade');
    assert.equal(f.issued.length,1);assert.equal(f.el('reportRetryDownload').hidden,true);
});
test('incomplete data blocks both formats without building or issuing',async()=>{
    const f=fixture();f.context.ReportCore.reportCheck=()=>({complete:false});
    await f.context.download(false,'word');await f.context.download(false,'excel');
    assert.deepEqual(f.builds,[]);assert.equal(f.issued.length,0);assert.deepEqual(f.events,['checks','checks']);
});
