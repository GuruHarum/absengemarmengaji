/* Kelola Tahsin/Tahfidz: satu halaman menampilkan satu guru agar ringkas. */
window.LearningGroups = (() => {
  const el = id => document.getElementById(id);
  const views = Object.create(null);
  const safe = value => escapeHtml(String(value ?? ''));
  const schoolYear = () => { const d = new Date(); return d.getFullYear() - (d.getMonth() < 6 ? 1 : 0); };
  const titleOf = subject => subject === 'tahsin' ? 'Tahsin' : 'Tahfidz';

  function shell(subject) {
    const title = titleOf(subject);
    const host = el(subject === 'tahsin' ? 'learningGroupTahsin' : 'learningGroupTahfidz');
    if (host.dataset.ready) return host;
    host.dataset.ready = '1';
    host.innerHTML = `
      <section class="assessment-controls gm-group-manager" data-subject="${subject}">
        <div class="section-heading gm-compact-heading"><div><h2>Kelola ${title}</h2></div></div>
        <div class="gm-group-pagebar">
          <label class="field-label">Guru
            <select data-view-teacher><option value="">Pilih guru</option></select>
          </label>
          <label class="field-label gm-year-field">Tahun ajaran
            <input data-year type="number" min="2000" max="2200" value="${schoolYear()}">
          </label>
          <div class="gm-group-view-actions">
            <label class="gm-archive-toggle" title="Lihat kelompok yang sudah diarsipkan">
              <input type="checkbox" data-show-archived>
              <span class="gm-archive-toggle-ui">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M4 7h16v13H4zM3 4h18v3H3zM9 11h6"/></svg>
                <span>Arsip</span>
              </span>
            </label>
            <button type="button" data-refresh class="secondary-action gm-group-refresh" title="Muat ulang data kelompok" aria-label="Muat ulang data kelompok">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M20 6v5h-5M4 18v-5h5M6.1 9A7 7 0 0 1 18 6l2 2M17.9 15A7 7 0 0 1 6 18l-2-2"/></svg>
              <span>Muat ulang</span>
            </button>
          </div>
        </div>
        <div class="gm-group-page-summary" data-page-summary>Pilih guru untuk melihat kelompok.</div>

        <div data-groups class="gm-group-cards" aria-live="polite"></div>

        <details class="gm-group-editor" data-editor>
          <summary><span data-editor-label>Tambah kelompok</span><small>Atur kelas dan anggota untuk guru yang sedang dipilih.</small></summary>
          <form data-form>
            <fieldset data-fields>
              <div class="gm-group-editor-head">
                <p data-form-title class="gm-form-caption">Buat kelompok ${title}</p>
                <button type="button" data-cancel class="secondary-action" hidden>Batal ubah</button>
              </div>
              <div class="gm-group-form-grid">
                <label class="field-label">Kelas siswa
                  <select data-class required><option value="">Pilih kelas</option></select>
                </label>
                <label class="field-label">Cari siswa
                  <input data-search type="search" placeholder="Cari nama siswa" autocomplete="off">
                </label>
              </div>
              <div class="gm-group-tools gm-member-tools">
                <button type="button" data-pick-visible class="secondary-action">Pilih semua</button>
                <button type="button" data-clear class="secondary-action">Kosongkan</button>
                <strong data-selected>0 siswa dipilih</strong>
              </div>
              <div data-students class="assignment-student-options gm-member-picker"></div>
              <div class="gm-group-savebar"><button type="submit" class="primary-action" data-save>Simpan kelompok</button></div>
            </fieldset>
          </form>
        </details>
        <p data-message class="assessment-feedback" role="status" aria-live="polite"></p>
      </section>`;

    host.addEventListener('click', event => click(subject, event));
    host.addEventListener('input', event => {
      const state = views[subject]; if (!state || state.busy) return;
      if (event.target.matches('[data-search]')) renderStudents(subject);
    });
    host.addEventListener('change', event => {
      const state = views[subject]; if (!state || state.busy) return;
      if (event.target.matches('[data-year]')) void open(subject, true);
      if (event.target.matches('[data-show-archived]')) { renderGroups(subject); return; }
      if (event.target.matches('[data-view-teacher]')) {
        resetForm(subject, false);
        renderGroups(subject);
        renderStudents(subject);
      }
      if (event.target.matches('[data-class]')) renderStudents(subject);
      if (event.target.matches('[data-student]')) {
        const id = event.target.dataset.student;
        if (event.target.checked) state.selected.add(id); else state.selected.delete(id);
        host.querySelector('[data-selected]').textContent = `${state.selected.size} siswa dipilih`;
      }
    });
    host.querySelector('[data-form]').addEventListener('submit', event => { event.preventDefault(); void save(subject); });
    return host;
  }

  function msg(subject, text, error = false) {
    const node = shell(subject).querySelector('[data-message]');
    node.textContent = text; node.classList.toggle('is-error', error);
  }
  function busy(subject, value) {
    const host = shell(subject); views[subject].busy = value;
    host.querySelector('[data-fields]').disabled = value;
    host.querySelector('[data-refresh]').disabled = value;
    host.querySelector('[data-year]').disabled = value;
    host.querySelector('[data-view-teacher]').disabled = value;
    host.querySelectorAll('[data-edit], [data-end], [data-delete-group]').forEach(button => button.disabled = value);
  }
  function teacherName(state, id) {
    const t = state.teachers.find(row => String(row.id) === String(id));
    return t?.nama_lengkap || t?.nama || 'Guru tidak tersedia';
  }
  function selectedTeacher(subject) {
    return shell(subject).querySelector('[data-view-teacher]').value;
  }

  async function open(subject, refresh = false) {
    const host = shell(subject);
    const state = views[subject] ||= { teachers: [], students: [], groups: [], members: [], selected: new Set(), edit: null, busy: false, year: schoolYear() };
    if (state.busy) return;
    const requestedYear = Number(host.querySelector('[data-year]').value || schoolYear());
    if (state.groups.length && !refresh && requestedYear === state.year) return;
    busy(subject, true); msg(subject, 'Memuat data kelompok...');
    try {
      const year = requestedYear;
      if (!Number.isInteger(year) || year < 2000 || year > 2200) throw new Error('Tahun ajaran tidak valid.');
      const previousTeacher = selectedTeacher(subject);
      const [teachers, students, groups, members] = await Promise.all([
        getTeachers(), getStudents(),
        fetchAllRows(() => supabase.from('teaching_assignments').select('id,teacher_id,subject,class_name,academic_year_start,active').eq('subject', subject).eq('academic_year_start', year).order('class_name')),
        fetchAllRows(() => supabase.from('assessment_group_members').select('assignment_id,student_id,subject,academic_year_start,active').eq('subject', subject).eq('academic_year_start', year))
      ]);
      Object.assign(state, { teachers, students, groups, members, year });
      state.edit = null; state.selected.clear();

      const allowedTeachers = teachers.filter(t => subject !== 'tahsin' || t.attendance_enabled !== false);
      const teacherSelect = host.querySelector('[data-view-teacher]');
      teacherSelect.replaceChildren(new Option('Pilih guru', ''));
      allowedTeachers.forEach(t => teacherSelect.add(new Option(t.nama_lengkap || t.nama, String(t.id))));
      const teacherIds = new Set(allowedTeachers.map(t => String(t.id)));
      const firstWithGroup = groups.find(g => teacherIds.has(String(g.teacher_id)))?.teacher_id;
      teacherSelect.value = AppAccess.teacher() ? String(AppAccess.profile.teacher_id || '') : (teacherIds.has(String(previousTeacher)) ? String(previousTeacher) : (firstWithGroup ? String(firstWithGroup) : (allowedTeachers[0] ? String(allowedTeachers[0].id) : '')));
      teacherSelect.disabled = AppAccess.teacher(); host.querySelector('[data-year]').disabled = AppAccess.teacher(); host.querySelector('[data-show-archived]').closest('label').hidden = AppAccess.teacher();

      const cls = host.querySelector('[data-class]'); cls.replaceChildren(new Option('Pilih kelas', ''));
      [...new Set(students.map(s => s.kelas).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'id',{numeric:true}))
        .forEach(c => cls.add(new Option(c,c)));
      resetForm(subject, false);
      renderGroups(subject); renderStudents(subject);
      msg(subject, '');
    } catch(error) { msg(subject, `Gagal memuat kelompok: ${error.message}`, true); }
    finally { busy(subject, false); }
  }

  function membersOf(state, groupId) {
    const g = state.groups.find(x => x.id === groupId); return new Set(state.members.filter(row => row.assignment_id === groupId && (g?.active ? row.active : true)).map(row => String(row.student_id)));
  }
  function gradeFromClassName(value) {
    const match = String(value || '').match(/(?:^|\D)([1-6])(?:\D|$)/);
    return match ? match[1] : '';
  }
  function groupClassLabels(state, group, students) {
    const labels = [...new Set([...membersOf(state, group.id)].map(id => students.get(id)?.kelas).filter(Boolean))]
      .sort((a,b)=>a.localeCompare(b,'id',{numeric:true}));
    if (labels.length) return labels;
    const raw = String(group.class_name || '').trim();
    const slash = raw.lastIndexOf(' / ');
    return [slash >= 0 ? raw.slice(slash + 3) : raw || 'Kelompok tanpa kelas'];
  }

  function renderGroups(subject) {
    const state = views[subject], host = shell(subject), target = host.querySelector('[data-groups]');
    const teacherId = selectedTeacher(subject);
    if (!teacherId) {
      target.innerHTML = '<div class="gm-empty-state">Pilih guru untuk melihat kelompok.</div>';
      host.querySelector('[data-page-summary]').textContent = 'Satu halaman hanya menampilkan kelompok milik satu guru.';
      host.querySelector('[data-editor]').hidden = true;
      return;
    }
    host.querySelector('[data-editor]').hidden = !AppAccess.full();
    const students = new Map(state.students.map(s => [String(s.id), s]));
    const showArchived = host.querySelector('[data-show-archived]')?.checked;
    const teacherGroups = state.groups.filter(group => String(group.teacher_id) === String(teacherId));
    const groups = teacherGroups.filter(group => showArchived ? !group.active : group.active);
    const totalMembers = new Set(groups.flatMap(group => [...membersOf(state, group.id)])).size;
    const gradeBuckets = new Map();
    groups.forEach(group => {
      const ids = membersOf(state, group.id);
      const labels = groupClassLabels(state, group, students);
      const gradeCandidates = [...ids].map(id => gradeFromClassName(students.get(id)?.kelas)).filter(Boolean);
      const grade = gradeCandidates[0] || gradeFromClassName(labels[0]) || gradeFromClassName(group.class_name) || 'lain';
      if (!gradeBuckets.has(grade)) gradeBuckets.set(grade, { grade, groups: [], studentIds: new Set(), classCounts: new Map() });
      const bucket = gradeBuckets.get(grade);
      bucket.groups.push({ group, ids, labels });
      ids.forEach(id => bucket.studentIds.add(id));
      labels.forEach(label => {
        const count = [...ids].filter(id => students.get(id)?.kelas === label).length;
        bucket.classCounts.set(label, (bucket.classCounts.get(label) || 0) + (count || (ids.size && labels.length === 1 ? ids.size : 0)));
      });
    });
    const buckets = [...gradeBuckets.values()].sort((a,b) => {
      if (a.grade === 'lain') return 1;
      if (b.grade === 'lain') return -1;
      return Number(a.grade) - Number(b.grade);
    });
    host.querySelector('[data-page-summary]').textContent = `${teacherName(state, teacherId)} · ${buckets.length} tingkat · ${totalMembers} siswa`;
    target.innerHTML = buckets.map(bucket => {
      const title = bucket.grade === 'lain' ? 'Tingkat belum dikenali' : `Tingkat ${bucket.grade}`;
      const breakdown = [...bucket.classCounts]
        .sort((a,b)=>a[0].localeCompare(b[0],'id',{numeric:true}))
        .map(([c,n])=>`<span>${safe(c)} <b>${n}</b></span>`).join('');
      const groupRows = bucket.groups.map(({group,ids,labels}) => `<div class="gm-grade-group-row">
          <div><strong>${safe(labels.join(', '))}</strong><small>${ids.size} siswa</small></div>
          <div class="gm-grade-group-actions">
            ${AppAccess.full() ? `<button type="button" class="secondary-action" data-edit="${safe(group.id)}">Ubah anggota</button>${group.active ? `<button type="button" class="secondary-action" data-transfer="${safe(group.id)}">Transfer Guru</button><button type="button" class="secondary-action" data-end="${safe(group.id)}">Arsipkan</button><button type="button" class="secondary-action danger-action" data-delete-group="${safe(group.id)}">Hapus</button>` : '<span class="gm-muted">Arsip</span>'}` : '<span class="gm-muted">Lihat saja</span>'}
          </div>
        </div>`).join('');
      return `<article class="gm-group-card gm-grade-card">
        <div class="gm-grade-card-head">
          <div><span class="gm-grade-kicker">TINGKAT</span><h3>${safe(title)}</h3></div>
          <strong class="gm-grade-total">${bucket.studentIds.size}<small>siswa</small></strong>
        </div>
        <div class="gm-group-breakdown">${breakdown || '<span>Belum ada anggota</span>'}</div>
        <details class="gm-grade-details">
          <summary>${bucket.groups.length} kelompok kelas <span>Kelola</span></summary>
          <div class="gm-grade-group-list">${groupRows}</div>
        </details>
      </article>`;
    }).join('') || '<div class="gm-empty-state">Belum ada kelompok untuk guru ini. Gunakan “Tambah kelompok”.</div>';
  }

  function renderStudents(subject) {
    const state = views[subject], host = shell(subject);
    const cls = host.querySelector('[data-class]').value;
    const search = host.querySelector('[data-search]').value.trim().toLocaleLowerCase('id');
    const list = host.querySelector('[data-students]');
    const filtered = state.students.filter(s => s.kelas === cls && String(s['nama siswa']).toLocaleLowerCase('id').includes(search));
    list.innerHTML = cls ? filtered.map(s => {
      const current = state.members.find(m => String(m.student_id) === String(s.id));
      const other = current && current.assignment_id !== state.edit;
      const origin = state.groups.find(g => g.id === current?.assignment_id);
      return `<label><input type="checkbox" data-student="${safe(s.id)}" ${state.selected.has(String(s.id)) ? 'checked' : ''} ${other ? 'disabled' : ''}>
        <span><strong>${safe(s['nama siswa'])}</strong><small>${safe(s.kelas)}${other ? ` · Sudah di ${safe(origin?.class_name || 'kelompok lain')}` : ''}</small></span></label>`;
    }).join('') || '<p class="gm-empty-state">Tidak ada siswa pada kelas ini.</p>' : '<p class="gm-empty-state">Pilih kelas untuk menampilkan siswa.</p>';
    host.querySelector('[data-selected]').textContent = `${state.selected.size} siswa dipilih`;
  }

  function resetForm(subject, closeEditor = true) {
    const state = views[subject], host = shell(subject);
    state.edit = null; state.selected.clear();
    host.querySelector('[data-class]').value = '';
    host.querySelector('[data-search]').value = '';
    host.querySelector('[data-form-title]').textContent = `Buat kelompok ${titleOf(subject)}`;
    host.querySelector('[data-editor-label]').textContent = 'Tambah kelompok';
    host.querySelector('[data-save]').textContent = 'Simpan kelompok';
    host.querySelector('[data-cancel]').hidden = true;
    if (closeEditor) host.querySelector('[data-editor]').open = false;
    renderStudents(subject);
  }

  async function click(subject, event) {
    const state = views[subject], host = shell(subject);
    if (!state || state.busy) return;
    if (event.target.closest('[data-refresh]')) return void open(subject, true);
    if (event.target.closest('[data-cancel]')) return resetForm(subject);
    if (event.target.closest('[data-clear]')) { state.selected.clear(); renderStudents(subject); return; }
    if (event.target.closest('[data-pick-visible]')) {
      host.querySelectorAll('[data-student]:not([disabled])').forEach(input => state.selected.add(input.dataset.student));
      renderStudents(subject); return;
    }
    const edit = event.target.closest('[data-edit]');
    if (edit) {
      const g = state.groups.find(row => row.id === edit.dataset.edit);
      if (!g) return msg(subject, 'Kelompok sudah berubah. Muat ulang.', true);
      host.querySelector('[data-view-teacher]').value = String(g.teacher_id);
      state.edit = g.id; state.selected = membersOf(state, g.id);
      const first = state.students.find(s => state.selected.has(String(s.id)));
      host.querySelector('[data-class]').value = first?.kelas || '';
      host.querySelector('[data-search]').value = '';
      host.querySelector('[data-form-title]').textContent = `Ubah anggota: ${g.class_name}`;
      host.querySelector('[data-editor-label]').textContent = 'Ubah anggota kelompok';
      host.querySelector('[data-save]').textContent = 'Simpan perubahan';
      host.querySelector('[data-cancel]').hidden = false;
      host.querySelector('[data-editor]').open = true;
      renderGroups(subject); renderStudents(subject);
      host.querySelector('[data-editor]').scrollIntoView({ behavior: 'smooth', block: 'start' }); return;
    }
    const transfer = event.target.closest('[data-transfer]');
    if (transfer) {
      const g = state.groups.find(row => row.id === transfer.dataset.transfer);
      if (!g) return msg(subject,'Kelompok sudah berubah. Muat ulang.',true);
      const choices = state.teachers.filter(t => String(t.id)!==String(g.teacher_id)).map(t=>`${t.id} | ${t.nama_lengkap||t.nama}`).join('\n');
      const target = window.prompt(`Transfer kelompok ke guru lain. Masukkan ID guru tujuan:\n${choices}`);
      if (!target) return;
      busy(subject,true);
      try { const {data,error}=await supabase.rpc('gm_transfer_learning_group',{p_group_id:g.id,p_teacher_id:String(target).trim()}); if(error) throw error; msg(subject,`Kelompok ditransfer ke ${data?.teacher_name||'guru tujuan'}.`); }
      catch(error){ msg(subject,error.message,true); busy(subject,false); return; }
      busy(subject,false); await open(subject,true); return;
    }
    const del = event.target.closest('[data-delete-group]');
    if (del) {
      const g = state.groups.find(row => row.id === del.dataset.deleteGroup);
      if (!g) return msg(subject, 'Kelompok sudah berubah. Muat ulang.', true);
      busy(subject,true);
      try {
        const {data: preview, error: previewError} = await supabase.rpc('gm_learning_group_delete_preview', {p_group_id:g.id});
        if (previewError) throw previewError;
        if (!preview?.can_delete) throw new Error(`Kelompok mempunyai data nilai/penilaian historis (${Number(preview?.subject_assessments||0)+Number(preview?.legacy_periodic||0)}). Gunakan Akhiri agar riwayat tetap aman.`);
        if (!(await AdminNotice.confirm(`Hapus permanen ${g.class_name}? ${preview.members || 0} keanggotaan kelompok juga akan dihapus dari database.`))) { busy(subject,false); return; }
        const typed = window.prompt(`Konfirmasi kedua. Ketik tepat:\nHAPUS ${g.id}`);
        if (typed !== `HAPUS ${g.id}`) { busy(subject,false); return msg(subject,'Penghapusan dibatalkan: konfirmasi kedua tidak sesuai.',true); }
        const {data: result, error} = await supabase.rpc('gm_delete_learning_group_verified', {p_group_id:g.id,p_confirmation:typed});
        if (error) throw error;
        if(subject==='tahsin') await refreshPublicTahsinRoster();
        msg(subject,`Kelompok dihapus permanen. ${result?.deleted_members || 0} keanggotaan terkait ikut dihapus.`);
      } catch(error) { msg(subject,error.message,true); busy(subject,false); return; }
      busy(subject,false); await open(subject,true); return;
    }
    const end = event.target.closest('[data-end]');
    if (end) {
      const g = state.groups.find(row => row.id === end.dataset.end);
      if (!g || !(await AdminNotice.confirm(`Akhiri kelompok ${g.class_name}? Kelompok dinonaktifkan, bukan dihapus.`))) return;
      busy(subject,true);
      try {
        const {error} = await supabase.rpc('gm_archive_learning_group', {p_group_id:g.id});
        if(error) throw error;
        if(subject==='tahsin') await refreshPublicTahsinRoster();
        msg(subject,'Kelompok diarsipkan. Riwayat tetap tersimpan dan disembunyikan dari tampilan utama.');
      } catch(error) { msg(subject,error.message,true); busy(subject,false); return; }
      busy(subject,false); await open(subject,true);
    }
  }

  async function refreshPublicTahsinRoster() {
    const [teachers, students] = await Promise.all([supabase.rpc('gm_public_tahsin_teachers'),supabase.rpc('gm_public_tahsin_students')]);
    if(teachers.error || students.error) throw teachers.error || students.error;
    window.tahsinRosterTeachers=teachers.data || [];
    window.tahsinRosterStudents=students.data || [];
    if(typeof populateAdminDropdowns==='function') populateAdminDropdowns();
    if(typeof renderManageTable==='function') renderManageTable();
  }

  async function save(subject) {
    const state = views[subject], host = shell(subject);
    if (state.busy || !AppAccess.full()) return;
    const teacher = selectedTeacher(subject);
    const cls = host.querySelector('[data-class]').value;
    if (!teacher) return msg(subject, 'Pilih guru pada bagian atas terlebih dahulu.', true);
    if (!cls || !state.selected.size) return msg(subject, 'Pilih kelas dan minimal satu siswa.',true);
    const group = state.groups.find(g => g.id === state.edit);
    const name = `${titleOf(subject)} ${teacherName(state, teacher)} / ${cls}`;
    if (name.length > 80) return msg(subject,'Nama kelompok melebihi 80 karakter.',true);
    busy(subject,true);
    try {
      const {error} = await supabase.rpc('gm_manage_learning_group', {
        subject_key: subject, action: group ? 'replace' : 'create', target_id: group?.id || null,
        teacher_key: teacher, group_name: name, year_key: state.year, student_keys: [...state.selected]
      });
      if (error) throw error;
      if(subject==='tahsin') await refreshPublicTahsinRoster();
      msg(subject,'Kelompok tersimpan. Absensi dan penilaian mengikuti keanggotaan terbaru.');
    } catch(error) { msg(subject,error.message,true); busy(subject,false); return; }
    busy(subject,false); resetForm(subject); await open(subject,true);
  }
  return { open };
})();
