const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');
const a = read('js/assessments.js');
const css = read('css/assessments.css');
const admin = read('admin.html');
const guru = read('guru.html');

if (!a.includes('assessment-card-order')) throw new Error('Nomor urut eksplisit card belum ada');
if (!a.includes('${displayOrder}</span>')) throw new Error('Nomor urut card belum memakai displayOrder');
if (a.includes('<legend><span>${displayOrder}</span> Tahsin</legend>')) throw new Error('Legend Tahsin bernomor masih ada');
if (a.includes('<legend><span>${displayOrder}</span> Tahfidz</legend>')) throw new Error('Legend Tahfidz bernomor masih ada');
if (css.includes('counter-increment: student')) throw new Error('CSS counter lama masih digunakan');
if (admin.includes('Simpan nilai kelas aktif') || guru.includes('Simpan nilai kelas aktif')) throw new Error('Teks Simpan nilai kelas aktif masih ada');
if (admin.includes('Simpan Semua mengikuti siswa yang sedang tampil') || guru.includes('Simpan Semua mengikuti siswa yang sedang tampil')) throw new Error('Teks bantuan Simpan Semua masih ada');
if (!admin.includes('id="assessmentSaveAll"') || !guru.includes('id="assessmentSaveAll"')) throw new Error('Tombol Simpan Semua hilang');
console.log('REV54 assessment cleanup: OK');
