/* Filter konsisten: ID sebagai kunci, teks hanya cadangan bagi catatan lama tanpa ID. */
window.GMFilter = (() => {
  const norm = v => String(v ?? '').normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('id');
  const sameId = (a,b) => a != null && a !== '' && b != null && b !== '' && String(a) === String(b);
  const teacherRows = () => window.tahsinRosterTeachers || window.teachersData || [];
  const pupilRows = () => window.tahsinRosterStudents || window.studentsData || [];
  function teacherId(value) {
    if (value == null || value === '') return '';
    const teachers = teacherRows();
    const byId = teachers.filter(t => sameId(t.id, value));
    if (byId.length === 1) return String(byId[0].id);
    const byName = teachers.filter(t => norm(t.nama) === norm(value));
    return byName.length === 1 ? String(byName[0].id) : '';
  }
  function teacherName(value) {
    const id = teacherId(value);
    return teacherRows().find(t => sameId(t.id,id))?.nama || String(value || '');
  }
  function classId(value) {
    if (value == null || value === '') return '';
    const all = pupilRows().filter(s => s.class_id != null);
    if (all.some(s => sameId(s.class_id,value))) return String(value);
    const unique = [...new Set(all.filter(s => norm(s.kelas) === norm(value)).map(s=>String(s.class_id)))];
    return unique.length === 1 ? unique[0] : '';
  }
  function teacherMatches(row, value) {
    if (!value) return true;
    const id = teacherId(value);
    if (row.teacher_id != null && row.teacher_id !== '') return Boolean(id) && sameId(row.teacher_id,id);
    return norm(row.teacher || row.nama_guru || row['nama guru']) === norm(teacherName(value));
  }
  function classMatches(row, value) {
    if (!value) return true;
    const id = classId(value);
    if (row.class_id != null && row.class_id !== '' && id) return sameId(row.class_id,id);
    // Tingkat numerik dipakai hanya saat memilih tingkat, bukan nama kelas.
    return norm(row.class || row.kelas || row.kelas_nama) === norm(value);
  }
  function studentMatches(row, student) {
    if (row.student_id != null && student.id != null) return sameId(row.student_id,student.id);
    return norm(row.student || row.nama_siswa) === norm(student['nama siswa'] || student.nama_siswa) &&
      norm(row.class || row.kelas) === norm(student.kelas);
  }
  return Object.freeze({ norm, sameId, teacherId, teacherName, classId, teacherMatches, classMatches, studentMatches });
})();
