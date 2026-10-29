/* Kelola Tahsin/Tahfidz: satu halaman menampilkan satu guru agar ringkas. */
window.LearningGroups = (() => {
  const el = id => document.getElementById(id);
  const views = Object.create(null);
  const safe = value => escapeHtml(String(value ?? ''));
  const schoolYear = () => { const d = new Date(); return d.getFullYear() - (d.getMonth() < 6 ? 1 : 0); };
  const titleOf = subject => subject === 'tahsin' ? 'Tahsin' : 'Tahfidz';

  let tahsinPickerDialog;
  function teacherName(state, id) {
    const t = state.teachers.find(row => String(row.id) === String(id));
    return t?.nama_lengkap || t?.nama || 'Guru tidak tersedia';
  }
  function gradeFromClassName(value) {
    const match = String(value || '').match(/(?:^|\D)([1-6])(?:\D|$)/);
    return match ? match[1] : '';
  }
  function tahsinGroupName(state, teacherId, ids) {
    const levels = [...new Set([...ids].map(id => gradeFromClassName(state.students.find(student => String(student.id) === String(id))?.kelas)).filter(Boolean))].sort((a, b) => Number(a) - Number(b));
    if (!levels.length) return '';
    return `Tahfidz ${teacherName(state, teacherId)} / Kelas ${levels.join(', ')}`;
  }
  function selectedClassLabel(state, ids) {
    const classes = [...new Set([...ids].map(id => state.students.find(student => String(student.id) === String(id))?.kelas).filter(Boolean))]
      .sort((a, b) => String(a).localeCompare(String(b), 'id', { numeric: true }));
    if (!classes.length) return '';
    if (classes.length === 1) return classes[0];
    const levels = [...new Set(classes.map(gradeFromClassName).filter(Boolean))].sort((a, b) => Number(a) - Number(b));
    if (levels.length === 1) return `Kelas ${levels[0]}`;
    if (levels.length) return `Kelas ${levels.join(', ')}`;
    return classes.join(', ');
  }
  async function pickTahsinLevels(levels) {
    if (!levels.length) return [];
    if (!tahsinPickerDialog) {
      tahsinPickerDialog = document.createElement('dialog');
      tahsinPickerDialog.className = 'admin-confirm admin-value-dialog';
      tahsinPickerDialog.innerHTML = `<form method="dialog" class="gm-level-picker">
        <div class="confirm-emblem" aria-hidden="true">≡</div>
        <h2>Samakan dengan siswa Tahsin</h2>
        <p>Pilih satu atau beberapa tingkat kelas Tahsin yang ingin disalin ke kelompok Tahfidz.</p>
        <div id="gmTahsinLevelList" class="assignment-student-options gm-member-picker" style="max-height:280px;overflow:auto;margin:8px 0 14px"></div>
        <div class="confirm-actions"><button type="button" data-cancel class="secondary-action">Batal</button><button type="submit" value="ok" class="primary-action">Gunakan pilihan</button></div>
      </form>`;
      document.body.append(tahsinPickerDialog);
      tahsinPickerDialog.querySelector('[data-cancel]').addEventListener('click', () => tahsinPickerDialog.close('cancel'));
      tahsinPickerDialog.addEventListener('cancel', event => { event.preventDefault(); tahsinPickerDialog.close('cancel'); });
    }
    const list = tahsinPickerDialog.querySelector('#gmTahsinLevelList');
    list.innerHTML = levels.map(level => `<label><input type="checkbox" value="${safe(level)}"><span><strong>Kelas ${safe(level)}</strong><small>Mencakup seluruh rombel tingkat ${safe(level)}</small></span></label>`).join('');
    return await new Promise(resolve => {
      const finish = () => {
        const picked = tahsinPickerDialog.returnValue === 'ok'
          ? [...list.querySelectorAll('input:checked')].map(input => input.value).filter(Boolean)
          : [];
        tahsinPickerDialog.removeEventListener('close', finish);
        resolve(picked);
      };
      tahsinPickerDialog.addEventListener('close', finish);
      tahsinPickerDialog.showModal();
    });
  }

  async function pickStudentsForGradeTransfer(state, sourceTeacherId, grade, subject) {
    const studentsById = new Map(state.students.map(student => [String(student.id), student]));
    const sourceGroups = state.groups.filter(group =>
      group.active && String(group.teacher_id) === String(sourceTeacherId) &&
      gradeOfGroup(state, group, studentsById) === String(grade));
    const sourceIds = [...new Set(sourceGroups.flatMap(group => [...membersOf(state, group.id)]))];
    const students = sourceIds.map(id => studentsById.get(String(id)))
      .filter(student => student && gradeFromClassName(student.kelas) === String(grade))
      .sort((a, b) => String(a.kelas || '').localeCompare(String(b.kelas || ''), 'id', { numeric: true }) ||
        String(a['nama siswa'] || '').localeCompare(String(b['nama siswa'] || ''), 'id'));
    if (!students.length) throw new Error('Tidak ada murid aktif yang dapat dipindahkan pada tingkat ' + grade + '.');

    const destinationGroupCounts = new Map();
    state.groups.filter(group => group.active && String(group.teacher_id) !== String(sourceTeacherId) &&
      gradeOfGroup(state, group, studentsById) === String(grade)).forEach(group => {
        const id = String(group.teacher_id);
        destinationGroupCounts.set(id, (destinationGroupCounts.get(id) || 0) + 1);
      });
    const targets = (state.allowedTeachers || state.teachers)
      .filter(teacher => String(teacher.id) !== String(sourceTeacherId) &&
        destinationGroupCounts.has(String(teacher.id)) &&
        (subject !== 'tahsin' || teacher.attendance_enabled !== false))
      .sort((a, b) => String(a.nama_lengkap || a.nama || '').localeCompare(String(b.nama_lengkap || b.nama || ''), 'id'));
    if (!targets.length) throw new Error('Belum ada guru tujuan dengan kelompok aktif tingkat ' + grade + '. Buat kelompok tujuan terlebih dahulu.');

    const studentMap = new Map(students.map(student => [String(student.id), student]));
    const dialog = document.createElement('dialog');
    dialog.className = 'admin-confirm gm-transfer-student-dialog gm-transfer-grade-dialog';
    const targetOptions = targets.map(teacher =>
      '<option value="' + safe(teacher.id) + '">' + safe(teacher.nama_lengkap || teacher.nama || ('Guru ' + teacher.id)) + '</option>'
    ).join('');
    const studentOptions = students.map(student =>
      '<label><input type="checkbox" data-transfer-student="' + safe(student.id) + '">' +
      '<span><strong>' + safe(student['nama siswa']) + '</strong><small>' + safe(student.kelas || '-') + '</small></span></label>'
    ).join('');
    dialog.innerHTML =
      '<form class="gm-transfer-student-form">' +
        '<div class="confirm-emblem" aria-hidden="true">↔</div>' +
        '<h2>Transfer Murid · Tingkat ' + safe(grade) + '</h2>' +
        '<p>Pilih murid dari seluruh kelompok tingkat ini, lalu pilih guru tujuan. Sistem akan mencocokkan kelompok tujuan berdasarkan kelas masing-masing siswa. Kelas siswa tidak diubah. Jika pemetaan tidak aman, transfer dibatalkan tanpa memindahkan sebagian siswa.</p>' +
        '<label class="confirm-field-label" for="gmTransferGradeTarget">Guru tujuan · Tingkat ' + safe(grade) + '</label>' +
        '<select id="gmTransferGradeTarget" class="confirm-value-field" required><option value="">Pilih guru tujuan</option>' + targetOptions + '</select>' +
        '<div class="gm-transfer-student-toolbar"><strong><span data-transfer-count>0</span> dari ' + students.length + ' murid dipilih</strong>' +
          '<span><button type="button" class="secondary-action" data-transfer-all>Pilih semua</button><button type="button" class="secondary-action" data-transfer-clear>Kosongkan</button></span></div>' +
        '<div class="assignment-student-options gm-member-picker gm-transfer-student-list">' + studentOptions + '</div>' +
        '<p class="assessment-feedback is-error" data-transfer-error role="alert"></p>' +
        '<div class="confirm-actions"><button type="button" data-transfer-cancel class="secondary-action">Batal</button><button type="submit" class="primary-action">Transfer murid</button></div>' +
      '</form>';
    document.body.append(dialog);

    const form = dialog.querySelector('form');
    const list = dialog.querySelector('.gm-transfer-student-list');
    const count = dialog.querySelector('[data-transfer-count]');
    const error = dialog.querySelector('[data-transfer-error]');
    const targetSelect = dialog.querySelector('#gmTransferGradeTarget');
    const submitButton = form.querySelector('[type="submit"]');
    let submitting = false;
    const chosenStudentIds = () => [...list.querySelectorAll('[data-transfer-student]:checked')]
      .map(input => input.dataset.transferStudent).filter(id => studentMap.has(String(id)));
    const refreshTargetChoices = () => {
      const pickedIds = chosenStudentIds();
      const previous = targetSelect.value;
      const eligible = pickedIds.length
        ? targets.filter(teacher => canMapTransferStudents(state, subject, grade, String(teacher.id), pickedIds))
        : targets;
      targetSelect.replaceChildren(
        new Option('Pilih guru tujuan', ''),
        ...eligible.map(teacher => new Option(teacher.nama_lengkap || teacher.nama || ('Guru ' + teacher.id), String(teacher.id)))
      );
      if (eligible.some(teacher => String(teacher.id) === previous)) {
        targetSelect.value = previous;
      } else if (previous) {
        error.textContent = 'Pilihan guru tujuan direset karena tidak dapat memetakan semua kelas siswa yang dipilih.';
      }
      if (pickedIds.length && !eligible.length) {
        error.textContent = 'Belum ada guru tujuan dengan kelompok yang cocok untuk semua kelas terpilih. Ubah pilihan murid atau rapikan kelompok tujuan terlebih dahulu.';
      } else if (!pickedIds.length) {
        error.textContent = '';
      }
    };
    const updateCount = () => {
      count.textContent = String(chosenStudentIds().length);
      refreshTargetChoices();
    };
    list.addEventListener('change', updateCount);
    targetSelect.addEventListener('change', () => { error.textContent = ''; });
    dialog.querySelector('[data-transfer-all]').addEventListener('click', () => {
      list.querySelectorAll('[data-transfer-student]').forEach(input => { input.checked = true; });
      updateCount();
    });
    dialog.querySelector('[data-transfer-clear]').addEventListener('click', () => {
      list.querySelectorAll('[data-transfer-student]').forEach(input => { input.checked = false; });
      updateCount();
    });
    refreshTargetChoices();
    return await new Promise(resolve => {
      let settled = false;
      const finish = value => {
        if (settled) return;
        settled = true;
        if (dialog.open) dialog.close();
        dialog.remove();
        resolve(value);
      };
      dialog.querySelector('[data-transfer-cancel]').addEventListener('click', () => finish(null));
      dialog.addEventListener('cancel', event => { event.preventDefault(); finish(null); });
      form.addEventListener('submit', async event => {
        event.preventDefault();
        if (submitting) return;
        const targetTeacherId = targetSelect.value;
        const studentIds = chosenStudentIds();
        if (!targetTeacherId) { error.textContent = 'Pilih guru tujuan yang cocok untuk kelas siswa terpilih.'; return; }
        if (!studentIds.length) { error.textContent = 'Pilih minimal satu murid yang akan dipindahkan.'; return; }
        const chosenTeacher = targets.find(teacher => String(teacher.id) === String(targetTeacherId));
        const selectedClasses = [...new Set(studentIds.map(id => studentMap.get(String(id))?.kelas).filter(Boolean))]
          .sort((a, b) => String(a).localeCompare(String(b), 'id', { numeric: true }));
        submitting = true;
        submitButton.disabled = true;
        const confirmed = await AdminNotice.confirm(
          'Konfirmasi transfer ' + studentIds.length + ' murid tingkat ' + grade + ' dari ' + selectedClasses.length +
          ' kelas ke ' + (chosenTeacher?.nama_lengkap || chosenTeacher?.nama || 'guru tujuan') +
          '? Kelas asli siswa tidak berubah. Kelompok tujuan dipilih otomatis berdasarkan kelas. Periksa nama siswa sebelum melanjutkan.'
        );
        if (!confirmed) {
          submitting = false;
          submitButton.disabled = false;
          return;
        }
        finish({ targetTeacherId, studentIds });
      });
      dialog.showModal();
    });
  }

  function shell(subject) {
    const title = titleOf(subject);
    const host = el(subject === 'tahsin' ? 'learningGroupTahsin' : 'learningGroupTahfidz');
    if (host.dataset.ready) return host;
    host.dataset.ready = '1';
    host.innerHTML = `
      <section class="assessment-controls gm-group-manager" data-subject="${subject}">
        <div class="section-heading gm-compact-heading"><div><h2>Kelola ${title}</h2></div></div>
        <div class="gm-group-pagebar">
          <div class="gm-teacher-picker">
            <label class="field-label" for="gmGroupTeacherSearch-${subject}">Guru</label>
            <input id="gmGroupTeacherSearch-${subject}" data-teacher-search type="search" placeholder="Cari nama guru..." autocomplete="off" aria-label="Cari nama guru">
            <select data-view-teacher aria-label="Pilih guru dari hasil pencarian"><option value="">Pilih guru</option></select>
            <small data-teacher-result-label aria-live="polite"></small>
          </div>
          <label class="field-label gm-year-field">Tahun ajaran (tahun awal)
            <input data-year type="number" min="2000" max="2200" value="${schoolYear()}">
            <small class="gm-year-preview" data-year-label aria-live="polite">${schoolYear()}/${schoolYear() + 1}</small>
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
                  <select data-class ${subject === 'tahfidz' ? '' : 'required'}><option value="">Pilih kelas</option></select>
                </label>
                <label class="field-label">Cari siswa
                  <input data-search type="search" placeholder="Cari nama siswa di semua kelas" autocomplete="off">
                </label>
                <label class="field-label">Status keanggotaan
                  <select data-member-status>
                    <option value="all">Semua siswa</option>
                    <option value="unassigned">Belum punya kelompok</option>
                    <option value="assigned">Sudah punya kelompok</option>
                  </select>
                </label>
              </div>
              <div class="gm-group-tools gm-member-tools">
                <button type="button" data-pick-visible class="secondary-action">Pilih yang tampil</button>
                ${subject === 'tahfidz' ? '<button type="button" data-sync-tahsin class="secondary-action">Salin siswa Tahsin guru ini</button>' : ''}
                <button type="button" data-clear class="secondary-action">Kosongkan</button>
                <strong data-selected>0 siswa dipilih</strong>
              </div>
              ${subject === 'tahfidz' ? '<p class="gm-copy-tahsin-help">Salin hanya anggota kelompok Tahsin aktif milik guru yang dipilih pada tahun ajaran ini. Guru khusus Tahfidz dapat memilih siswa secara manual.</p>' : ''}
              <p data-search-summary class="gm-member-count" role="status" aria-live="polite"></p>
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
      if (event.target.matches('[data-teacher-search]')) renderTeacherOptions(subject);
      if (event.target.matches('[data-search]')) renderStudents(subject);
      if (event.target.matches('[data-year]')) renderYearPreview(subject);
    });
    host.addEventListener('change', event => {
      const state = views[subject]; if (!state || state.busy) return;
      if (event.target.matches('[data-year]')) { void changeAcademicYear(subject, event.target); return; }
      if (event.target.matches('[data-show-archived]')) { renderGroups(subject); return; }
      if (event.target.matches('[data-view-teacher]')) { void changeTeacher(subject, event.target); return; }
      if (event.target.matches('[data-class], [data-member-status]')) renderStudents(subject);
      if (event.target.matches('[data-student]')) {
        const id = event.target.dataset.student;
        if (event.target.checked) {
          const classSelect = host.querySelector('[data-class]');
          if (!classSelect.value && event.target.dataset.studentClass) classSelect.value = event.target.dataset.studentClass;
          state.selected.add(id);
        } else state.selected.delete(id);
        renderStudents(subject);
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
    host.querySelector('[data-year]').disabled = value || AppAccess.teacher();
    host.querySelector('[data-view-teacher]').disabled = value || AppAccess.teacher();
    host.querySelectorAll('[data-edit], [data-end], [data-delete-group], [data-transfer-grade], [data-transfer-students-grade]').forEach(button => button.disabled = value);
  }
  function selectedTeacher(subject) {
    return shell(subject).querySelector('[data-view-teacher]').value;
  }

  function renderYearPreview(subject) {
    const host = shell(subject);
    const year = Number(host.querySelector('[data-year]').value);
    host.querySelector('[data-year-label]').textContent =
      Number.isInteger(year) && year >= 2000 && year <= 2200
        ? `${year}/${year + 1}` : 'Masukkan tahun awal yang valid.';
  }

  function renderTeacherOptions(subject) {
    const state = views[subject];
    const host = shell(subject);
    if (!state) return;
    const search = host.querySelector('[data-teacher-search]').value.trim().toLocaleLowerCase('id');
    const teachers = state.allowedTeachers || [];
    const matches = teachers.filter(teacher =>
      `${teacher.nama_lengkap || ''} ${teacher.nama || ''}`.toLocaleLowerCase('id').includes(search));
    const selectedId = String(state.viewTeacherId || '');
    const selected = teachers.find(teacher => String(teacher.id) === selectedId);
    const visible = selected && !matches.some(teacher => String(teacher.id) === selectedId)
      ? [selected, ...matches] : matches;
    const select = host.querySelector('[data-view-teacher]');
    select.replaceChildren(new Option('Pilih guru', ''), ...visible.map(teacher =>
      new Option(teacher.nama_lengkap || teacher.nama || `Guru ${teacher.id}`, String(teacher.id))));
    select.value = selectedId || '';
    host.querySelector('[data-teacher-result-label]').textContent = search
      ? `${matches.length} dari ${teachers.length} guru cocok.` : `${teachers.length} guru tersedia.`;
    host.querySelector('[data-teacher-search]').disabled = AppAccess.teacher();
  }

  function hasUnsavedChanges(subject) {
    const state = views[subject];
    if (!state) return false;
    const original = state.edit ? membersOf(state, state.edit) : new Set();
    return state.selected.size !== original.size ||
      [...state.selected].some(studentId => !original.has(studentId));
  }

  async function confirmLeave(subject, reason = 'berpindah halaman') {
    const state = views[subject];
    if (state?.busy) {
      AdminNotice.notify('Tunggu hingga proses pengelolaan kelompok selesai.', 'info');
      return false;
    }
    if (!hasUnsavedChanges(subject)) return true;
    return Boolean(await AdminNotice.confirm(
      `Ada perubahan anggota ${titleOf(subject)} yang belum disimpan. Jika ${reason}, pilihan tersebut akan dibatalkan. Lanjutkan?`
    ));
  }

  function discardDraft(subject) {
    if (!views[subject]) return;
    resetForm(subject);
  }

  async function changeTeacher(subject, control) {
    const state = views[subject];
    const nextTeacher = control.value;
    const previous = String(state.viewTeacherId || '');
    if (nextTeacher === previous) return;
    // Pertahankan pilihan awal selama dialog konfirmasi masih terbuka.
    control.value = previous;
    if (!(await confirmLeave(subject, 'mengganti guru'))) return;
    discardDraft(subject);
    state.viewTeacherId = nextTeacher;
    renderTeacherOptions(subject);
    renderGroups(subject);
    renderStudents(subject);
    msg(subject, '');
  }

  async function changeAcademicYear(subject, control) {
    const state = views[subject];
    const text = control.value.trim();
    const requested = Number(text);
    const previous = state.year;
    if (!text || !Number.isInteger(requested) || requested < 2000 || requested > 2200) {
      msg(subject, 'Isi tahun awal ajaran yang valid (contoh: 2026).', true);
      control.value = String(previous);
      renderYearPreview(subject);
      return;
    }
    if (requested === previous) return;
    control.value = String(previous);
    renderYearPreview(subject);
    if (!(await confirmLeave(subject, 'mengganti tahun ajaran'))) return;
    control.value = String(requested);
    renderYearPreview(subject);
    if (!(await open(subject, true))) {
      control.value = String(previous);
      renderYearPreview(subject);
    }
  }

  async function open(subject, refresh = false) {
    const host = shell(subject);
    const state = views[subject] ||= { teachers: [], students: [], groups: [], members: [], selected: new Set(), edit: null, busy: false, year: schoolYear(), autoTahsinLevels: [] };
    if (state.busy) return false;
    const requestedYear = Number(host.querySelector('[data-year]').value || schoolYear());
    if (state.groups.length && !refresh && requestedYear === state.year) return true;
    busy(subject, true); msg(subject, '');
    if (window.GMUX) {
      host.querySelector('[data-groups]').innerHTML = window.GMUX.skeletonCards(3);
      host.querySelector('[data-students]').innerHTML = window.GMUX.skeletonList(5, { compact: true });
    } else {
      msg(subject, 'Memuat data kelompok...');
    }
    try {
      const year = requestedYear;
      if (!Number.isInteger(year) || year < 2000 || year > 2200) throw new Error('Tahun ajaran tidak valid.');
      const previousTeacher = selectedTeacher(subject);
      const [teachers, managerStudents, groups, members] = await Promise.all([
        getTeachers(), AppAccess.teacher() ? Promise.resolve(null) : getStudents(),
        fetchAllRows(() => supabase.from('teaching_assignments').select('id,teacher_id,subject,class_name,academic_year_start,active').eq('subject', subject).eq('academic_year_start', year).order('class_name')),
        fetchAllRows(() => supabase.from('assessment_group_members').select('assignment_id,student_id,subject,academic_year_start,active').eq('subject', subject).eq('academic_year_start', year))
      ]);
      // Guru melihat anggota kelompok yang benar, bukan hanya siswa yang
      // kolom "nama guru" lamanya cocok. Kebijakan RLS tetap berlaku.
      let students = managerStudents;
      if (AppAccess.teacher()) {
        const activeGroups = new Set(groups.filter(group => group.active).map(group => String(group.id)));
        const studentIds = [...new Set(members
          .filter(member => member.active && activeGroups.has(String(member.assignment_id)))
          .map(member => Number(member.student_id))
          .filter(Number.isSafeInteger))];
        students = [];
        for (let offset = 0; offset < studentIds.length; offset += 200) {
          const batch = studentIds.slice(offset, offset + 200);
          const rows = await fetchAllRows(() => supabase.from('students').select('*').in('id', batch).order('kelas').order('nama siswa'), 200);
          students.push(...rows);
        }
        students.sort((a, b) => String(a.kelas || '').localeCompare(String(b.kelas || ''), 'id', { numeric: true }) ||
          String(a['nama siswa'] || '').localeCompare(String(b['nama siswa'] || ''), 'id'));
      }
      Object.assign(state, { teachers, students, groups, members, year, autoTahsinLevels: [] });
      state.edit = null; state.selected.clear();

      const allowedTeachers = teachers.filter(t => subject !== 'tahsin' || t.attendance_enabled !== false)
        .sort((a, b) => String(a.nama_lengkap || a.nama || '').localeCompare(String(b.nama_lengkap || b.nama || ''), 'id'));
      state.allowedTeachers = allowedTeachers;
      const teacherIds = new Set(allowedTeachers.map(t => String(t.id)));
      const firstWithGroup = groups.find(g => teacherIds.has(String(g.teacher_id)))?.teacher_id;
      state.viewTeacherId = AppAccess.teacher() ? String(AppAccess.profile.teacher_id || '') :
        (teacherIds.has(String(previousTeacher)) ? String(previousTeacher) :
          (firstWithGroup ? String(firstWithGroup) : (allowedTeachers[0] ? String(allowedTeachers[0].id) : '')));
      renderTeacherOptions(subject);
      host.querySelector('[data-view-teacher]').disabled = AppAccess.teacher();
      renderYearPreview(subject);
      host.querySelector('[data-year]').disabled = AppAccess.teacher();
      host.querySelector('[data-show-archived]').closest('label').hidden = AppAccess.teacher();

      const cls = host.querySelector('[data-class]');
      cls.replaceChildren(new Option('Pilih kelas', ''));
      [...new Set(students.map(s => s.kelas).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'id',{numeric:true})).forEach(c => cls.add(new Option(c,c)));
      resetForm(subject, false);
      renderGroups(subject);
      renderStudents(subject);
      msg(subject, '');
      return true;
    } catch(error) {
      msg(subject, `Gagal memuat kelompok: ${error.message}`, true);
      return false;
    } finally {
      busy(subject, false);
    }
  }

  function membersOf(state, groupId) {
    const g = state.groups.find(x => x.id === groupId);
    return new Set(state.members.filter(row => row.assignment_id === groupId && (g?.active ? row.active : true)).map(row => String(row.student_id)));
  }
  function groupClassLabels(state, group, students) {
    const labels = [...new Set([...membersOf(state, group.id)].map(id => students.get(id)?.kelas).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'id',{numeric:true}));
    if (labels.length) return labels;
    const raw = String(group.class_name || '').trim();
    const slash = raw.lastIndexOf(' / ');
    return [slash >= 0 ? raw.slice(slash + 3) : raw || 'Kelompok tanpa kelas'];
  }
  function gradeOfGroup(state, group, students = new Map(state.students.map(student => [String(student.id), student]))) {
    const ids = [...membersOf(state, group.id)];
    const rosterGrades = [...new Set(ids.map(id => gradeFromClassName(students.get(String(id))?.kelas)).filter(Boolean))];
    if (rosterGrades.length === 1) return rosterGrades[0];
    if (rosterGrades.length > 1) return '';
    const labelGrades = [...new Set(groupClassLabels(state, group, students).map(gradeFromClassName).filter(Boolean))];
    if (labelGrades.length === 1) return labelGrades[0];
    return gradeFromClassName(group.class_name);
  }
  function normalizeClassLabel(value) {
    return String(value || '').trim().replace(/\s+/g, ' ').toLocaleLowerCase('id');
  }
  function groupClassSuffix(group) {
    const label = String(group.class_name || '').trim();
    const slash = label.lastIndexOf('/');
    return (slash >= 0 ? label.slice(slash + 1) : label).trim();
  }
  function canMapTransferStudents(state, subject, grade, targetTeacherId, studentIds) {
    const students = new Map(state.students.map(student => [String(student.id), student]));
    const targetGroups = state.groups.filter(group =>
      group.active && String(group.teacher_id) === String(targetTeacherId) &&
      gradeOfGroup(state, group, students) === String(grade));
    if (!targetGroups.length) return false;
    for (const studentId of studentIds) {
      const student = students.get(String(studentId));
      if (!student || gradeFromClassName(student.kelas) !== String(grade)) return false;
      const studentClass = normalizeClassLabel(student.kelas);
      const exactLabel = targetGroups.filter(group => normalizeClassLabel(groupClassSuffix(group)) === studentClass);
      if (exactLabel.length === 1) continue;
      if (exactLabel.length > 1) return false;
      const exactRoster = targetGroups.filter(group =>
        [...membersOf(state, group.id)].some(id => normalizeClassLabel(students.get(String(id))?.kelas) === studentClass));
      if (exactRoster.length === 1) continue;
      if (exactRoster.length > 1) return false;
      const broad = targetGroups.filter(group => normalizeClassLabel(groupClassSuffix(group)) === 'kelas ' + grade);
      if (broad.length === 1) continue;
      if (broad.length > 1) return false;
      if (targetGroups.length === 1) continue;
      return false;
    }
    return true;
  }

  function renderGroups(subject) {
    const state = views[subject], host = shell(subject), target = host.querySelector('[data-groups]');
    const teacherId = selectedTeacher(subject);
    if (!teacherId) {
      target.innerHTML = '<div class="gm-empty-state gm-empty-rich"><span class="gm-empty-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><circle cx="12" cy="8" r="3"/><path d="M5 20c.8-4 3.2-6 7-6s6.2 2 7 6"/></svg></span><strong>Pilih guru</strong><span>Kelompok akan tampil di sini.</span></div>';
      host.querySelector('[data-page-summary]').textContent = 'Satu halaman hanya menampilkan kelompok milik satu guru.';
      host.querySelector('[data-editor]').hidden = true;
      return;
    }
    host.querySelector('[data-editor]').hidden = !AppAccess.full();
    const students = new Map(state.students.map(student => [String(student.id), student]));
    const showArchived = host.querySelector('[data-show-archived]')?.checked;
    const teacherGroups = state.groups.filter(group => String(group.teacher_id) === String(teacherId));
    const groups = teacherGroups.filter(group => showArchived ? !group.active : group.active);
    const totalMembers = new Set(groups.flatMap(group => [...membersOf(state, group.id)])).size;
    const gradeBuckets = new Map();
    groups.forEach(group => {
      const ids = membersOf(state, group.id);
      const labels = groupClassLabels(state, group, students);
      const grade = gradeOfGroup(state, group, students) || 'lain';
      if (!gradeBuckets.has(grade)) gradeBuckets.set(grade, { grade, groups: [], studentIds: new Set(), classCounts: new Map() });
      const bucket = gradeBuckets.get(grade);
      bucket.groups.push({ group, ids, labels });
      ids.forEach(id => bucket.studentIds.add(id));
      labels.forEach(label => {
        const count = [...ids].filter(id => students.get(String(id))?.kelas === label).length;
        bucket.classCounts.set(label, (bucket.classCounts.get(label) || 0) + (count || (ids.size && labels.length === 1 ? ids.size : 0)));
      });
    });
    const buckets = [...gradeBuckets.values()].sort((a, b) => {
      if (a.grade === 'lain') return 1;
      if (b.grade === 'lain') return -1;
      return Number(a.grade) - Number(b.grade);
    });
    host.querySelector('[data-page-summary]').textContent =
      teacherName(state, teacherId) + ' · ' + (showArchived ? 'Arsip' : 'Aktif') + ' · ' + buckets.length + ' tingkat · ' + totalMembers + ' siswa';
    target.innerHTML = buckets.map(bucket => {
      const title = bucket.grade === 'lain' ? 'Tingkat belum dikenali' : 'Tingkat ' + bucket.grade;
      const breakdown = [...bucket.classCounts].sort((a, b) => a[0].localeCompare(b[0], 'id', { numeric: true }))
        .map(([className, count]) => '<span>' + safe(className) + ' <b>' + count + '</b></span>').join('');
      const bucketStudents = [...bucket.studentIds].map(id => students.get(String(id))).filter(Boolean)
        .sort((a, b) => String(a.kelas || '').localeCompare(String(b.kelas || ''), 'id', { numeric: true }) ||
          String(a['nama siswa'] || '').localeCompare(String(b['nama siswa'] || ''), 'id'));
      const studentPreview = bucketStudents.slice(0, 5).map(student =>
        '<span class="gm-grade-student-pill"><strong>' + safe(student['nama siswa'] || 'Nama belum diisi') + '</strong><small>' +
        safe(student.kelas || 'Kelas belum diisi') + '</small></span>').join('');
      const studentRoster = bucketStudents.map(student =>
        '<span class="gm-grade-student-row"><strong>' + safe(student['nama siswa'] || 'Nama belum diisi') + '</strong><small>' +
        safe(student.kelas || 'Kelas belum diisi') + '</small></span>').join('');
      const canTransfer = AppAccess.full() && !showArchived && bucket.grade !== 'lain';
      const gradeActions = canTransfer
        ? '<div class="gm-grade-actions">' +
            (bucket.studentIds.size ? '<button type="button" class="secondary-action" data-transfer-students-grade="' + safe(bucket.grade) + '">Transfer murid</button>' : '') +
            '<button type="button" class="secondary-action" data-transfer-grade="' + safe(bucket.grade) + '">Transfer guru</button>' +
          '</div>'
        : '';
      const groupRows = bucket.groups.map(({ group, ids, labels }) =>
        '<div class="gm-grade-group-row"><div><strong>' + safe(labels.join(', ')) + '</strong><small>' + ids.size + ' siswa</small></div>' +
          '<div class="gm-grade-group-actions">' +
            (AppAccess.full() ? (group.active
              ? '<button type="button" class="secondary-action" data-edit="' + safe(group.id) + '">Ubah anggota</button>' +
                '<button type="button" class="secondary-action" data-end="' + safe(group.id) + '">Arsipkan</button>' +
                '<button type="button" class="secondary-action danger-action" data-delete-group="' + safe(group.id) + '">Hapus</button>'
              : '<span class="gm-muted">Arsip</span><button type="button" class="secondary-action danger-action" data-delete-group="' + safe(group.id) + '">Hapus permanen</button>')
              : '<span class="gm-muted">Lihat saja</span>') + '</div></div>'
      ).join('');
      return '<article class="gm-group-card gm-grade-card">' +
        '<div class="gm-grade-card-head"><div><span class="gm-grade-kicker">TINGKAT</span><h3>' + safe(title) + '</h3></div>' +
          '<strong class="gm-grade-total">' + bucket.studentIds.size + '<small>siswa</small></strong></div>' +
        (studentPreview
          ? '<div class="gm-grade-student-preview" aria-label="Contoh nama siswa">' + studentPreview + '</div>' +
            (bucketStudents.length > 5
              ? '<details class="gm-grade-roster-details"><summary>Lihat semua siswa <span>' + bucketStudents.length + ' nama</span></summary>' +
                '<div class="gm-grade-roster-list">' + studentRoster + '</div></details>'
              : '')
          : '<p class="gm-grade-no-students">Belum ada murid pada kelompok tingkat ini.</p>') +
        gradeActions +
        '<div class="gm-group-breakdown">' + (breakdown || '<span>Belum ada anggota</span>') + '</div>' +
        '<details class="gm-grade-details"><summary>' + bucket.groups.length + ' kelompok kelas <span>Kelola</span></summary>' +
          '<div class="gm-grade-group-list">' + groupRows + '</div></details></article>';
    }).join('') || (showArchived
      ? '<div class="gm-empty-state gm-empty-rich"><strong>Belum ada kelompok di arsip</strong><span>Kelompok yang diarsipkan akan muncul di sini.</span></div>'
      : '<div class="gm-empty-state gm-empty-rich"><span class="gm-empty-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M4 6.5C6.6 5.4 9.2 5.6 12 7v12c-2.8-1.4-5.4-1.6-8-.5v-12Z"/><path d="M20 6.5c-2.6-1.1-5.2-.9-8 .5v12c2.8-1.4 5.4-1.6 8-.5v-12Z"/></svg></span><strong>Belum ada kelompok aktif</strong><span>Gunakan Tambah kelompok untuk mulai membuat kelompok baru.</span></div>');
  }

    function renderStudents(subject) {
    const state = views[subject], host = shell(subject);
    const cls = host.querySelector('[data-class]').value;
    const search = host.querySelector('[data-search]').value.trim().toLocaleLowerCase('id');
    const membershipStatus = host.querySelector('[data-member-status]').value;
    const list = host.querySelector('[data-students]');

    // Keanggotaan dilihat per program dan tahun ajaran dari state halaman.
    const activeGroupIds = new Set(state.groups.filter(group => group.active).map(group => String(group.id)));
    const assignmentByStudent = new Map();
    state.members.forEach(member => {
      if (member.active && activeGroupIds.has(String(member.assignment_id))) {
        assignmentByStudent.set(String(member.student_id), String(member.assignment_id));
      }
    });

    const candidatesBySearch = search
      ? state.students.filter(student => (student['nama siswa'] + ' ' + (student.kelas || '')).toLocaleLowerCase('id').includes(search))
      : (cls ? state.students.filter(student =>
          student.kelas === cls || (state.edit && state.selected.has(String(student.id))))
        : (state.autoTahsinLevels?.length ? state.students.filter(student => state.selected.has(String(student.id))) : []));

    const candidates = candidatesBySearch.filter(student => {
      const assigned = assignmentByStudent.has(String(student.id));
      return membershipStatus === 'unassigned' ? !assigned
        : membershipStatus === 'assigned' ? assigned : true;
    });
    const sortedCandidates = [...candidates].sort((a, b) =>
      String(a['nama siswa'] || '').localeCompare(String(b['nama siswa'] || ''), 'id') ||
      String(a.kelas || '').localeCompare(String(b.kelas || ''), 'id', { numeric: true }));
    const filtered = sortedCandidates.slice(0, search ? 80 : sortedCandidates.length);
    const statusLabel = membershipStatus === 'unassigned' ? ' · belum punya kelompok'
      : membershipStatus === 'assigned' ? ' · sudah punya kelompok' : '';
    host.querySelector('[data-search-summary]').textContent = search
      ? (sortedCandidates.length > 80
          ? `Menampilkan 80 dari ${sortedCandidates.length} hasil${statusLabel}. Persempit pencarian untuk melihat yang lain.`
          : `${sortedCandidates.length} hasil pencarian${statusLabel}.`)
      : (cls ? `${sortedCandidates.length} siswa ditampilkan dengan filter kelas ${cls}${state.edit && [...state.selected].some(id => state.students.some(student => String(student.id) === String(id) && student.kelas !== cls)) ? ', termasuk anggota terpilih dari kelas lain' : ''}${statusLabel}.`
        : (state.autoTahsinLevels?.length
          ? `${sortedCandidates.length} siswa salinan Tahsin${statusLabel}.`
          : `Pilih kelas atau cari nama siswa${statusLabel}.`));

    list.innerHTML = filtered.map(student => {
      const id = String(student.id);
      const groupId = assignmentByStudent.get(id);
      const other = Boolean(groupId && groupId !== String(state.edit || ''));
      const origin = state.groups.find(group => String(group.id) === groupId);
      const note = other ? ` · Sudah di ${safe(origin?.class_name || 'kelompok lain')}` : '';
      return `<label><input type="checkbox" data-student="${safe(student.id)}" data-student-class="${safe(student.kelas)}" ${state.selected.has(id) ? 'checked' : ''} ${other ? 'disabled' : ''}>
        <span><strong>${safe(student['nama siswa'])}</strong><small>${safe(student.kelas)}${note}</small></span></label>`;
    }).join('') || (membershipStatus !== 'all'
      ? '<div class="gm-empty-state gm-empty-rich gm-empty-state--compact"><strong>Tidak ada siswa pada status ini</strong><span>Coba filter lain atau pilih kelas berbeda.</span></div>'
      : search
        ? '<div class="gm-empty-state gm-empty-rich gm-empty-state--compact"><strong>Siswa tidak ditemukan</strong><span>Coba nama lain.</span></div>'
        : cls
          ? '<div class="gm-empty-state gm-empty-rich gm-empty-state--compact"><strong>Belum ada siswa</strong><span>Tidak ada siswa pada kelas ini.</span></div>'
          : state.autoTahsinLevels?.length
            ? '<div class="gm-empty-state gm-empty-rich gm-empty-state--compact"><strong>Belum ada siswa Tahsin pada pilihan ini</strong><span>Periksa tingkat kelas atau muat ulang data Tahsin.</span></div>'
            : '<div class="gm-empty-state gm-empty-rich gm-empty-state--compact"><strong>Cari siswa atau pilih kelas</strong><span>Pencarian dipakai untuk memilih siswa manual.</span></div>');

    host.querySelector('[data-selected]').textContent = state.autoTahsinLevels?.length
      ? `${state.selected.size} siswa dipilih · salinan Tahsin kelas ${state.autoTahsinLevels.join(', ')}`
      : `${state.selected.size} siswa dipilih`;
  }

  function resetForm(subject, closeEditor = true) {
    const state = views[subject], host = shell(subject);
    state.edit = null;
    state.selected.clear();
    state.autoTahsinLevels = [];
    host.querySelector('[data-class]').value = '';
    host.querySelector('[data-search]').value = '';
    host.querySelector('[data-member-status]').value = 'all';
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
    if (event.target.closest('[data-refresh]')) {
      if (await confirmLeave(subject, 'memuat ulang data')) await open(subject, true);
      return;
    }
    if (event.target.closest('[data-cancel]')) return resetForm(subject);
    if (event.target.closest('[data-clear]')) { state.selected.clear(); state.autoTahsinLevels = []; renderStudents(subject); return; }
    if (event.target.closest('[data-pick-visible]')) {
      const visible = [...host.querySelectorAll('[data-student]:not([disabled])')];
      const classSelect = host.querySelector('[data-class]');
      const searchValue = host.querySelector('[data-search]').value.trim();
      state.autoTahsinLevels = [];
      if (searchValue) {
        visible.forEach(input => state.selected.add(input.dataset.student));
      } else {
        if (!classSelect.value) {
          const classes = [...new Set(visible.map(input => input.dataset.studentClass).filter(Boolean))];
          if (classes.length !== 1) return msg(subject, 'Pilih kelas terlebih dahulu sebelum memilih seluruh siswa yang tampil.', true);
          classSelect.value = classes[0];
        }
        visible.filter(input => input.dataset.studentClass === classSelect.value).forEach(input => state.selected.add(input.dataset.student));
      }
      msg(subject, '');
      renderStudents(subject);
      return;
    }
    if (event.target.closest('[data-sync-tahsin]')) {
      if (subject !== 'tahfidz') return;
      if (hasUnsavedChanges(subject) && !(await AdminNotice.confirm(
        'Menyalin dari Tahsin akan mengganti daftar pilihan murid yang belum disimpan. Lanjutkan?'
      ))) return;
      const teacherId = selectedTeacher(subject);
      if (!teacherId) return msg(subject, 'Pilih guru terlebih dahulu sebelum menyalin siswa Tahsin.', true);
      busy(subject, true);
      try {
        const groups = await fetchAllRows(() => supabase.from('teaching_assignments').select('id,class_name').eq('subject', 'tahsin').eq('academic_year_start', state.year).eq('teacher_id', teacherId).eq('active', true).order('class_name'));
        const ids = groups.map(group => group.id).filter(Boolean);
        if (!ids.length) throw new Error('Guru ini belum memiliki kelompok Tahsin aktif. Pilih anggota Tahfidz secara manual atau guru lain yang memiliki kelompok Tahsin.');
        const members = await fetchAllRows(() => supabase.from('assessment_group_members').select('assignment_id,student_id').eq('subject', 'tahsin').eq('academic_year_start', state.year).eq('active', true).in('assignment_id', ids));
        const tahsinStudents = members.map(row => state.students.find(student => String(student.id) === String(row.student_id))).filter(Boolean);
        const levels = [...new Set(tahsinStudents.map(student => gradeFromClassName(student.kelas)).filter(Boolean))].sort((a, b) => Number(a) - Number(b));
        const pickedLevels = await pickTahsinLevels(levels);
        if (!pickedLevels.length) { busy(subject, false); return; }
        const activeGroupIds = new Set(state.groups.filter(group => group.active).map(group => String(group.id)));
        const eligible = tahsinStudents.filter(student => pickedLevels.includes(gradeFromClassName(student.kelas))).filter(student => {
          const current = state.members.find(m => m.active && activeGroupIds.has(String(m.assignment_id)) && String(m.student_id) === String(student.id));
          return !current || current.assignment_id === state.edit;
        });
        state.selected = new Set(eligible.map(student => String(student.id)));
        state.autoTahsinLevels = pickedLevels;
        host.querySelector('[data-member-status]').value = 'all';
        host.querySelector('[data-class]').value = '';
        host.querySelector('[data-search]').value = '';
        msg(subject, state.selected.size ? `Siswa Tahsin kelas ${pickedLevels.join(', ')} berhasil disalin.` : 'Tidak ada siswa Tahsin yang dapat disalin pada tingkat yang dipilih.', !state.selected.size);
        renderStudents(subject);
      } catch (error) {
        msg(subject, error.message, true);
      }
      busy(subject, false);
      return;
    }
    const edit = event.target.closest('[data-edit]');
    if (edit) {
      const g = state.groups.find(row => row.id === edit.dataset.edit);
      if (!g) return msg(subject, 'Kelompok sudah berubah. Muat ulang.', true);
      if (state.edit === g.id && hasUnsavedChanges(subject)) {
        host.querySelector('[data-editor]').open = true;
        host.querySelector('[data-editor]').scrollIntoView({ behavior: 'smooth', block: 'start' });
        return;
      }
      if (!(await confirmLeave(subject, 'membuka pengeditan kelompok lain'))) return;
      host.querySelector('[data-view-teacher]').value = String(g.teacher_id);
      state.edit = g.id;
      state.selected = membersOf(state, g.id);
      state.autoTahsinLevels = [];
      const first = state.students.find(s => state.selected.has(String(s.id)));
      host.querySelector('[data-class]').value = first?.kelas || '';
      host.querySelector('[data-search]').value = '';
      host.querySelector('[data-form-title]').textContent = `Ubah anggota: ${g.class_name}`;
      host.querySelector('[data-editor-label]').textContent = 'Ubah anggota kelompok';
      host.querySelector('[data-save]').textContent = 'Simpan perubahan';
      host.querySelector('[data-cancel]').hidden = false;
      host.querySelector('[data-editor]').open = true;
      renderGroups(subject);
      renderStudents(subject);
      host.querySelector('[data-editor]').scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    const groupAction = event.target.closest('[data-transfer-students-grade], [data-transfer-grade], [data-delete-group], [data-end]');
    if (groupAction && !(await confirmLeave(subject, 'mengelola kelompok lain'))) return;
    const transferStudents = event.target.closest('[data-transfer-students-grade]');
    if (transferStudents) {
      const grade = String(transferStudents.dataset.transferStudentsGrade || '');
      const sourceTeacherId = String(selectedTeacher(subject) || '');
      if (!/^[1-6]$/.test(grade) || !sourceTeacherId) return msg(subject, 'Tingkat atau guru asal tidak valid. Muat ulang daftar.', true);
      let choice;
      try {
        choice = await pickStudentsForGradeTransfer(state, sourceTeacherId, grade, subject);
      } catch (error) {
        return msg(subject, error.message, true);
      }
      if (!choice) return;
      let transferFeedback = '';
      busy(subject, true);
      try {
        const { data, error } = await supabase.rpc('gm_transfer_grade_students', {
          p_subject: subject, p_year: state.year, p_source_teacher_id: sourceTeacherId,
          p_target_teacher_id: String(choice.targetTeacherId).trim(), p_grade: Number(grade),
          p_student_ids: choice.studentIds
        });
        if (error) throw error;
        if (subject === 'tahsin') {
          try { await refreshPublicTahsinRoster(); }
          catch (refreshError) { console.warn('Daftar publik Tahsin perlu dimuat ulang.', refreshError); }
        }
        transferFeedback = Number(data?.moved || choice.studentIds.length) + ' murid tingkat ' + grade +
          ' dipindahkan ke ' + (data?.target_teacher_name || teacherName(state, choice.targetTeacherId)) +
          '. Kelas siswa tetap seperti semula.';
      } catch (error) { msg(subject, error.message, true); busy(subject, false); return; }
      busy(subject, false);
      await reloadWithFeedback(subject, transferFeedback);
      return;
    }
    const gradeTransfer = event.target.closest('[data-transfer-grade]');
    if (gradeTransfer) {
      const grade = String(gradeTransfer.dataset.transferGrade || '');
      const sourceTeacherId = String(selectedTeacher(subject) || '');
      const studentsById = new Map(state.students.map(student => [String(student.id), student]));
      const sourceGroups = state.groups.filter(group => group.active && String(group.teacher_id) === sourceTeacherId &&
        gradeOfGroup(state, group, studentsById) === grade);
      if (!/^[1-6]$/.test(grade) || !sourceGroups.length) return msg(subject, 'Kelompok tingkat ini sudah berubah. Muat ulang daftar.', true);
      const choices = (state.allowedTeachers || state.teachers)
        .filter(teacher => String(teacher.id) !== sourceTeacherId && (subject !== 'tahsin' || teacher.attendance_enabled !== false))
        .map(teacher => ({ value: String(teacher.id), label: teacher.nama_lengkap || teacher.nama || ('Guru ' + teacher.id) }));
      if (!choices.length) return msg(subject, 'Tidak ada guru tujuan yang tersedia untuk program ini.', true);
      const target = await AdminNotice.request({
        title: 'Transfer guru · Tingkat ' + grade,
        message: 'Semua ' + sourceGroups.length + ' kelompok aktif tingkat ' + grade + ' milik ' +
          teacherName(state, sourceTeacherId) + ' akan dialihkan kepada guru tujuan. Nama kelas dan daftar murid tetap; untuk Tahsin, nama guru pada data siswa diselaraskan.',
        label: 'Guru tujuan', placeholder: 'Pilih guru', choices, confirmLabel: 'Transfer tingkat'
      });
      if (!target) return;
      let groupTransferFeedback = '';
      busy(subject, true);
      try {
        const { data, error } = await supabase.rpc('gm_transfer_grade_groups', {
          p_group_ids: sourceGroups.map(group => group.id), p_source_teacher_id: sourceTeacherId,
          p_target_teacher_id: String(target).trim(), p_grade: Number(grade)
        });
        if (error) throw error;
        if (subject === 'tahsin') {
          try { await refreshPublicTahsinRoster(); }
          catch (refreshError) { console.warn('Daftar publik Tahsin perlu dimuat ulang.', refreshError); }
        }
        groupTransferFeedback = Number(data?.groups_updated || sourceGroups.length) + ' kelompok tingkat ' + grade +
          ' dipindahkan ke ' + (data?.teacher_name || teacherName(state, target)) + '. ' +
          Number(data?.students_kept || 0) + ' murid tetap di kelasnya.';
      } catch (error) { msg(subject, error.message, true); busy(subject, false); return; }
      busy(subject, false);
      await reloadWithFeedback(subject, groupTransferFeedback);
      return;
    }
        const del = event.target.closest('[data-delete-group]');
    if (del) {
      const g = state.groups.find(row => row.id === del.dataset.deleteGroup);
      if (!g) return msg(subject, 'Kelompok sudah berubah. Muat ulang.', true);
      let deletionFeedback = '';
      busy(subject,true);
      try {
        let preview = { members: state.members.filter(row => row.assignment_id === g.id).length };
        if (subject !== 'tahfidz') {
          const {data, error: previewError} = await supabase.rpc('gm_learning_group_delete_preview', {p_group_id:g.id});
          if (previewError) throw previewError;
          preview = data || preview;
          if (!preview?.can_delete) throw new Error(`Kelompok mempunyai data nilai/penilaian historis (${Number(preview?.subject_assessments||0)+Number(preview?.legacy_periodic||0)}). Gunakan Arsipkan agar riwayat tetap aman.`);
        }
        const impact = subject === 'tahfidz' ? `${preview.members || 0} keanggotaan kelompok akan dihapus. Nilai siswa dan data guru/siswa tetap aman.` : `${preview.members || 0} keanggotaan kelompok juga akan dihapus dari database.`;
        if (!(await AdminNotice.confirm(`Hapus permanen ${g.class_name}? ${impact}`))) { busy(subject,false); return; }
        const phrase = `HAPUS ${g.id}`;
        const typed = await AdminNotice.request({
          title: 'Konfirmasi penghapusan permanen',
          message: `Ketik tepat “${phrase}” untuk melanjutkan.`,
          label: 'Konfirmasi',
          placeholder: phrase,
          confirmLabel: 'Hapus permanen'
        });
        if (typed !== phrase) { busy(subject,false); return msg(subject,'Penghapusan dibatalkan: konfirmasi kedua tidak sesuai.',true); }
        const rpcName = subject === 'tahfidz' ? 'gm_delete_tahfidz_group_verified' : 'gm_delete_learning_group_verified';
        const {data: result, error} = await supabase.rpc(rpcName, {p_group_id:g.id,p_confirmation:typed});
        if (error) throw error;
        if (subject === 'tahsin') {
          try { await refreshPublicTahsinRoster(); }
          catch (refreshError) { console.warn('Daftar publik Tahsin perlu dimuat ulang.', refreshError); }
        }
        const detached = Number(result?.detached_assessments || 0);
        deletionFeedback = `Kelompok dihapus permanen. ${result?.deleted_members || preview.members || 0} keanggotaan dihapus${detached ? `; ${detached} nilai tetap disimpan tanpa tautan kelompok lama` : ''}.`;
      } catch(error) { msg(subject,error.message,true); busy(subject,false); return; }
      busy(subject,false); await reloadWithFeedback(subject,deletionFeedback); return;
    }
    const end = event.target.closest('[data-end]');
    if (end) {
      const g = state.groups.find(row => row.id === end.dataset.end);
      if (!g || !(await AdminNotice.confirm(`Akhiri kelompok ${g.class_name}? Kelompok dinonaktifkan, bukan dihapus.`))) return;
      let archiveFeedback = '';
      busy(subject,true);
      try {
        const {data: archived, error} = await supabase.rpc('gm_archive_learning_group_v2', {p_group_id:g.id});
        if(error) throw error;
        if (subject === 'tahsin') {
          try { await refreshPublicTahsinRoster(); }
          catch (refreshError) { console.warn('Daftar publik Tahsin perlu dimuat ulang.', refreshError); }
        }
        archiveFeedback = `Kelompok diarsipkan. ${archived?.released_members || 0} keanggotaan dilepas dari status aktif sehingga siswa dapat dimasukkan ke kelompok baru.`;
      } catch(error) { msg(subject,error.message,true); busy(subject,false); return; }
      busy(subject,false); await reloadWithFeedback(subject,archiveFeedback);
    }
  }

  async function refreshPublicTahsinRoster() {
    window.GMDataRequests?.invalidate();
    const yearKey = getPublicAcademicYearStart();
    const [teachers, students] = await Promise.all([
      fetchAllRpcRows('gm_public_tahsin_teachers', {year_key: yearKey}, 500),
      fetchAllRpcRows('gm_public_tahsin_students', {year_key: yearKey}, 500)
    ]);
    window.tahsinRosterTeachers=teachers;
    window.tahsinRosterStudents=students;
    if(typeof populateAdminDropdowns==='function') populateAdminDropdowns();
    if(typeof renderManageTable==='function') renderManageTable();
  }

  async function reloadWithFeedback(subject, feedback) {
    const loaded = await open(subject, true);
    if (loaded) {
      msg(subject, feedback);
      AdminNotice.notify(feedback, 'success');
    } else {
      AdminNotice.notify('Perubahan berhasil disimpan, tetapi daftar belum dapat dimuat ulang. Coba Muat ulang.', 'info');
    }
  }

  async function save(subject) {
    const state = views[subject], host = shell(subject);
    if (state.busy || !AppAccess.full()) return;
    const teacher = selectedTeacher(subject);
    const cls = host.querySelector('[data-class]').value;
    if (!teacher) return msg(subject, 'Pilih guru pada bagian atas terlebih dahulu.', true);
    if (!state.selected.size) return msg(subject, 'Pilih minimal satu siswa terlebih dahulu.', true);
    const group = state.groups.find(g => g.id === state.edit);
    const autoName = subject === 'tahfidz' && state.autoTahsinLevels?.length ? tahsinGroupName(state, teacher, state.selected) : '';
    const actualClassLabel = selectedClassLabel(state, state.selected) || cls;
    const name = autoName || `${titleOf(subject)} ${teacherName(state, teacher)} / ${actualClassLabel}`;
    if (!actualClassLabel && !autoName) return msg(subject, 'Kelas siswa terpilih tidak dapat dikenali. Periksa data siswa terlebih dahulu.', true);
    if (name.length > 80) return msg(subject,'Nama kelompok melebihi 80 karakter.',true);
    busy(subject, true);
    try {
      const { error } = await supabase.rpc('gm_manage_learning_group', {
        subject_key: subject, action: group ? 'replace' : 'create', target_id: group?.id || null,
        teacher_key: teacher, group_name: name, year_key: state.year, student_keys: [...state.selected]
      });
      if (error) throw error;
    } catch (error) {
      msg(subject, error.message, true);
      busy(subject, false);
      return;
    }
    // Transaksi sudah sukses: kegagalan memperbarui cache publik tidak boleh
    // dilaporkan sebagai kegagalan menyimpan kelompok.
    if (subject === 'tahsin') {
      try { await refreshPublicTahsinRoster(); }
      catch (error) { console.warn('Daftar publik Tahsin perlu dimuat ulang.', error); }
    }
    busy(subject, false);
    resetForm(subject);
    await reloadWithFeedback(subject, group ? 'Perubahan anggota kelompok berhasil disimpan.' :
      'Kelompok berhasil dibuat. Absensi dan penilaian mengikuti keanggotaan terbaru.');
  }

  // Mencegah browser ditutup atau dimuat ulang saat pilihan anggota belum disimpan.
  window.addEventListener('beforeunload', event => {
    if (!hasUnsavedChanges('tahsin') && !hasUnsavedChanges('tahfidz')) return;
    event.preventDefault();
    event.returnValue = '';
  });

  return { open, hasUnsavedChanges, confirmLeave, discardDraft, isBusy: subject => Boolean(views[subject]?.busy) };
})();
