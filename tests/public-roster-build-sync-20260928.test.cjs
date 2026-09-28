const fs=require('fs'),path=require('path'),assert=require('assert');
const root=path.resolve(__dirname,'..');
const db=fs.readFileSync(path.join(root,'js/database.js'),'utf8');
const utils=fs.readFileSync(path.join(root,'js/utils.js'),'utf8');
assert.match(db,/rpc\('gm_public_tahsin_students', \{ year_key: yearKey \}\)/);
assert.match(utils,/student\.teacher_id/);
assert.match(utils,/studentClassNumber === selectedLevel/);
const out=path.join(root,'public-build');
if(fs.existsSync(out)){
 for(const f of ['index.html','sw.js','js/database.js','js/utils.js','js/ui.js','js/public-app.js']){
  assert.strictEqual(fs.readFileSync(path.join(root,f),'utf8'),fs.readFileSync(path.join(out,f),'utf8'),`public-build stale: ${f}`);
 }
}
console.log('public roster/build sync OK');
