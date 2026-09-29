"use strict";
const fs=require('node:fs');
const assert=require('node:assert');
const read=p=>fs.readFileSync(p,'utf8');
const css=read('css/visual-stage8.css');
for(const page of ['admin.html','index.html','login.html','maintenance.html','offline.html']){
  assert(read(page).includes('visual-stage8.css'), `${page} belum memuat visual-stage8.css`);
}
assert(css.includes('body.admin-page'), 'style admin hilang');
assert(css.includes('body.public-page'), 'style publik hilang');
assert(css.includes('body.login-page'), 'style login hilang');
assert(css.includes('.gm-attention-center'), 'style pusat perhatian hilang');
assert(css.includes('.gm-group-card'), 'style kelompok hilang');
assert(css.includes('.admin-notification-popover'), 'style notifikasi hilang');
assert(read('sw.js').includes("const VERSION = 'loader33'"), 'versi SW bukan loader33');
assert(read('sw.js').includes("'/css/visual-stage8.css'"), 'visual-stage8 belum diprecache');
assert(read('js/pwa.js').includes("const BUILD = 'loader33'"), 'versi PWA bukan loader33');
console.log('stage8 visual consistency loader33 OK');
