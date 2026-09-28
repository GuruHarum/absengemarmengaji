"use strict";
const fs = require('node:fs');
const db = fs.readFileSync('js/database.js','utf8');
const dash = fs.readFileSync('js/dashboard.js','utf8');
const groups = fs.readFileSync('js/learning-groups.js','utf8');
function ok(v,m){ if(!v) throw new Error(m); }
ok(db.includes('async function fetchAllRpcRows'), 'fetchAllRpcRows helper missing');
ok(db.includes("request.range(from, to)"), 'RPC pagination must use range');
ok(db.includes("fetchAllRpcRows('gm_public_tahsin_students', { year_key: yearKey }, 500)"), 'public getStudents must paginate roster RPC');
ok(!/const \{ data, error \} = await supabase\.rpc\('gm_public_tahsin_students'/.test(db), 'unpaged public student RPC remains in database.js');
ok(dash.includes("fetchAllRpcRows('gm_public_tahsin_students'"), 'dashboard roster must paginate');
ok(groups.includes("fetchAllRpcRows('gm_public_tahsin_students'"), 'learning-groups roster refresh must paginate');
console.log('public roster pagination roster20 OK');
