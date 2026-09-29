"use strict";
const fs = require('node:fs');
const assert = require('node:assert/strict');

const db = fs.readFileSync('js/database.js','utf8');
const ui = fs.readFileSync('js/ui.js','utf8');
const utils = fs.readFileSync('js/utils.js','utf8');
const index = fs.readFileSync('index.html','utf8');
const builtDb = fs.readFileSync('public-build/js/database.js','utf8');
const builtUi = fs.readFileSync('public-build/js/ui.js','utf8');
const builtUtils = fs.readFileSync('public-build/js/utils.js','utf8');
const builtIndex = fs.readFileSync('public-build/index.html','utf8');

assert.match(db, /rpc\('gm_public_tahsin_students', \{ year_key: yearKey \}\)/);
assert.match(db, /rpc\('gm_public_tahsin_teachers', \{ year_key: yearKey \}\)/);
assert.match(ui, /String\(student\.teacher_id\) === selectedTeacherId/);
assert.match(utils, /String\(student\.teacher_id\) === selectedTeacherId/);
assert.match(index, /20260928-roster19-hotfix/);
assert.equal(db, builtDb, 'database.js root dan public-build berbeda');
assert.equal(ui, builtUi, 'ui.js root dan public-build berbeda');
assert.equal(utils, builtUtils, 'utils.js root dan public-build berbeda');
assert.equal(index, builtIndex, 'index.html root dan public-build berbeda');
console.log('public roster runtime roster19-hotfix OK');
