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

  async function pickStudentsForTransfer(state, sourceGroup) {
    const sourceIds = [...membersOf(state, sourceGroup.id)];
    if (!sourceIds.length) throw new Error('Kelompok asal belum memiliki murid aktif.');

    const targets = state.groups
      .filter(group => group.active && group.id !== sourceGroup.id)
      .sort((a, b) => {
        const ta = teacherName(state, a.teacher_id);
        const tb = teacherName(state, b.teacher_id);
        return ta.localeCompare(tb, 'id') || String(a.class_name || '').localeCompare(String(b.class_name || ''), 'id', { numeric: true });
      });
    if (!targets.length) throw new Error('Belum ada kelompok tujuan aktif. Buat kelompok tujuan terlebih dahulu.');

    const students = sourceIds
      .map(id => state.students.find(student => String(student.id) === String(id)))
      .filter(Boolean)
      .sort((a, b) => String(a.kelas || '').localeCompare(String(b.kelas || ''), 'id', { numeric: true }) || String(a['nama siswa'] || '').localeCompare(String(b['nama siswa'] || ''), 'id'));

    const studentMap = new Map(students.map(student => [String(student.id), student]));
    const dialog = document.createElement('dialog');
    dialog.className = 'admin-confirm gm-transfer-student-dialog';
    dialog.innerHTML = `<form class="gm-transfer-student-form">
      <div class="confirm-emblem" aria-hidden="true">↔</div>
      <h2>Transfer Murid</h2>
      <p>Pilih murid yang dipindahkan dari <strong>${safe(sourceGroup.class_name)}</strong>, lalu pilih kelompok tujuan. Murid lain tetap berada di kelompok asal.</p>
      <label class="confirm-field-label" for="gmTransferTarget">Kelompok tujuan</label>
      <select id="gmTransferTarget" class="confirm-value-field" required>
        <option value="">Pilih kelompok tujuan</option>
        ${targets.map(group => {
          const ids = membersOf(state, group.id);
          const labels = groupClassLabels(state, group, new Map(state.students.map(student => [String(student.id), student])));
          const label = `${teacherName(state, group.teacher_id)} · ${labels.join(', ')} · ${ids.size} siswa`;
          return `<option value="${safe(group.id)}">${safe(label)}</option>`;
        }).join('')}
      </select>
      <div class="gm-transfer-student-toolbar">
        <strong><span data-transfer-count>0</span> dari ${students.length} murid dipilih</strong>
        <span><button type="button" class="secondary-action" data-transfer-all>Pilih semua</button><button type="button" class="secondary-action" data-transfer-clear>Kosongkan</button></span>
      </div>
      <div class="assignment-student-options gm-member-picker gm-transfer-student-list">
        ${students.map(student => `<label><input type="checkbox" data-transfer-student="${safe(student.id)}"><span><strong>${safe(student['nama siswa'])}</strong><small>${safe(student.kelas || '-')}</small></span></label>`).join('')}
      </div>
      <p class="assessment-feedback is-error" data-transfer-error role="alert"></p>
      <div class="confirm-actions"><button type="button" data-transfer-cancel class="secondary-action">Batal</button><button type="submit" class="primary-action">Transfer murid</button></div>
    </form>`;
    document.body.append(dialog);

    const form = dialog.querySelector('form');
    const list = dialog.querySelector('.gm-transfer-student-list');
    const count = dialog.querySelector('[data-transfer-count]');
    const error = dialog.querySelector('[data-transfer-error]');
    const updateCount = () => { count.textContent = String(list.querySelectorAll('[data-transfer-student]:checked').length); };
    list.addEventListener('change', updateCount);
    dialog.querySelector('[data-transfer-all]').addEventListener('click', () => {
      list.querySelectorAll('[data-transfer-student]').forEach(input => { input.checked = true; });
      updateCount();
    });
    dialog.querySelector('[data-transfer-clear]').addEventListener('click', () => {
      list.querySelectorAll('[data-transfer-student]').forEach(input => { input.checked = false; });
      updateCount();
    });

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
      form.addEventListener('submit', event => {
        event.preventDefault();
        const targetGroupId = dialog.querySelector('#gmTransferTarget').value;
        const studentIds = [...list.querySelectorAll('[data-transfer-student]:checked')]
          .map(input => input.dataset.transferStudent)
          .filter(id => studentMap.has(String(id)));
        if (!targetGroupId) {
          error.textContent = 'Pilih kelompok tujuan terlebih dahulu.';
          return;
        }
        if (!studentIds.length) {
          error.textContent = 'Pilih minimal satu murid yang akan dipindahkan.';
          return;
        }
        finish({ targetGroupId, studentIds });
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
                  <select data-class ${subject === 'tahfidz' ? '' : 'required'}><option value="">Pilih kelas</option></select>
                </label>
                <label class="field-label">Cari siswa
                  <input data-search type="search" placeholder="Cari nama siswa di semua kelas" autocomplete="off">
                </label>
              </div>
              <div class="gm-group-tools gm-member-tools">
                <button type="button" data-pick-visible class="secondary-action">Pilih semua</button>
                ${subject === 'tahfidz' ? '<button type="button" data-sync-tahsin class="secondary-action">Samakan dengan siswa Tahsin</button>' : ''}
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
    host.querySelector('[data-year]').disabled = value;
    host.querySelector('[data-view-teacher]').disabled = value;
    host.querySelectorAll('[data-edit], [data-end], [data-delete-group], [data-transfer], [data-transfer-students]').forEach(button => button.disabled = value);
  }
  function selectedTeacher(subject) {
    return shell(subject).querySelector('[data-view-teacher]').value;
  }

  async function open(subject, refresh = false) {
    const host = shell(subject);
    const state = views[subject] ||= { teachers: [], students: [], groups: [], members: [], selected: new Set(), edit: null, busy: false, year: schoolYear(), autoTahsinLevels: [] };
    if (state.busy) return;
    const requestedYear = Number(host.querySelector('[data-year]').value || schoolYear());
    if (state.groups.length && !refresh && requestedYear === state.year) return;
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
      const [teachers, students, groups, members] = await Promise.all([
        getTeachers(), getStudents(),
        fetchAllRows(() => supabase.from('teaching_assignments').select('id,teacher_id,subject,class_name,academic_year_start,active').eq('subject', subject).eq('academic_year_start', year).order('class_name')),
        fetchAllRows(() => supabase.from('assessment_group_members').select('assignment_id,student_id,subject,academic_year_start,active').eq('subject', subject).eq('academic_year_start', year))
      ]);
      Object.assign(state, { teachers, students, groups, members, year, autoTahsinLevels: [] });
      state.edit = null; state.selected.clear();

      const allowedTeachers = teachers.filter(t => subject !== 'tahsin' || t.attendance_enabled !== false);
      const teacherSelect = host.querySelector('[data-view-teacher]');
      teacherSelect.replaceChildren(new Option('Pilih guru', ''));
      allowedTeachers.forEach(t => teacherSelect.add(new Option(t.nama_lengkap || t.nama, String(t.id))));
      const teacherIds = new Set(allowedTeachers.map(t => String(t.id)));
      const firstWithGroup = groups.find(g => teacherIds.has(String(g.teacher_id)))?.teacher_id;
      teacherSelect.value = AppAccess.teacher() ? String(AppAccess.profile.teacher_id || '') : (teacherIds.has(String(previousTeacher)) ? String(previousTeacher) : (firstWithGroup ? String(firstWithGroup) : (allowedTeachers[0] ? String(allowedTeachers[0].id) : '')));
      teacherSelect.disabled = AppAccess.teacher();
      host.querySelector('[data-year]').disabled = AppAccess.teacher();
      host.querySelector('[data-show-archived]').closest('label').hidden = AppAccess.teacher();

      const cls = host.querySelector('[data-class]');
      cls.replaceChildren(new Option('Pilih kelas', ''));
      [...new Set(students.map(s => s.kelas).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'id',{numeric:true})).forEach(c => cls.add(new Option(c,c)));
      resetForm(subject, false);
      renderGroups(subject);
      renderStudents(subject);
      msg(subject, '');
    } catch(error) {
      msg(subject, `Gagal memuat kelompok: ${error.message}`, true);
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
      const breakdown = [...bucket.classCounts].sort((a,b)=>a[0].localeCompare(b[0],'id',{numeric:true})).map(([c,n])=>`<span>${safe(c)} <b>${n}</b></span>`).join('');
      const groupRows = bucket.groups.map(({group,ids,labels}) => `<div class="gm-grade-group-row">
          <div><strong>${safe(labels.join(', '))}</strong><small>${ids.size} siswa</small></div>
          <div class="gm-grade-group-actions">
            ${AppAccess.full() ? (group.active
              ? `<button type="button" class="secondary-action" data-edit="${safe(group.id)}">Ubah anggota</button><button type="button" class="secondary-action" data-transfer-students="${safe(group.id)}">Transfer Murid</button><button type="button" class="secondary-action" data-transfer="${safe(group.id)}">Transfer Guru</button><button type="button" class="secondary-action" data-end="${safe(group.id)}">Arsipkan</button><button type="button" class="secondary-action danger-action" data-delete-group="${safe(group.id)}">Hapus</button>`
              : `<span class="gm-muted">Arsip</span><button type="button" class="secondary-action danger-action" data-delete-group="${safe(group.id)}">Hapus permanen</button>`)
              : '<span class="gm-muted">Lihat saja</span>'}
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
    }).join('') || '<div class="gm-empty-state gm-empty-rich"><span class="gm-empty-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M4 6.5C6.6 5.4 9.2 5.6 12 7v12c-2.8-1.4-5.4-1.6-8-.5v-12Z"/><path d="M20 6.5c-2.6-1.1-5.2-.9-8 .5v12c2.8-1.4 5.4-1.6 8-.5v-12Z"/></svg></span><strong>Belum ada kelompok aktif</strong><span>Gunakan Tambah kelompok untuk mulai membuat kelompok baru.</span></div>';
  }

  function renderStudents(subject) {
    const state = views[subject], host = shell(subject);
    const cls = host.querySelector('[data-class]').value;
    const search = host.querySelector('[data-search]').value.trim().toLocaleLowerCase('id');
    const list = host.querySelector('[data-students]');

    const candidates = search
      ? state.students.filter(s => `${s['nama siswa']} ${s.kelas || ''}`.toLocaleLowerCase('id').includes(search))
      : (cls ? state.students.filter(s => s.kelas === cls) : (state.autoTahsinLevels?.length ? state.students.filter(s => state.selected.has(String(s.id))) : []));

    const filtered = candidates.slice(0, search ? 80 : candidates.length);
    list.innerHTML = filtered.map(s => {
      const activeGroupIds = new Set(state.groups.filter(group => group.active).map(group => String(group.id)));
      const current = state.members.find(m => m.active && activeGroupIds.has(String(m.assignment_id)) && String(m.student_id) === String(s.id));
      const other = current && current.assignment_id !== state.edit;
      const origin = state.groups.find(g => g.id === current?.assignment_id);
      const classMismatch = Boolean(!search && cls && s.kelas !== cls && !state.selected.has(String(s.id)));
      const disabled = other || classMismatch;
      const note = other ? ` · Sudah di ${safe(origin?.class_name || 'kelompok lain')}` : (classMismatch ? ` · Pilihan kelas: ${safe(cls)}` : '');
      return `<label class="${classMismatch ? 'is-class-mismatch' : ''}"><input type="checkbox" data-student="${safe(s.id)}" data-student-class="${safe(s.kelas)}" ${state.selected.has(String(s.id)) ? 'checked' : ''} ${disabled ? 'disabled' : ''}>
        <span><strong>${safe(s['nama siswa'])}</strong><small>${safe(s.kelas)}${note}</small></span></label>`;
    }).join('') || (search
      ? '<div class="gm-empty-state gm-empty-rich gm-empty-state--compact"><strong>Siswa tidak ditemukan</strong><span>Coba nama lain.</span></div>'
      : (cls
          ? '<div class="gm-empty-state gm-empty-rich gm-empty-state--compact"><strong>Belum ada siswa</strong><span>Tidak ada siswa pada kelas ini.</span></div>'
          : (state.autoTahsinLevels?.length
              ? '<div class="gm-empty-state gm-empty-rich gm-empty-state--compact"><strong>Belum ada siswa Tahsin pada pilihan ini</strong><span>Periksa pilihan tingkat kelas atau muat ulang data Tahsin.</span></div>'
              : '<div class="gm-empty-state gm-empty-rich gm-empty-state--compact"><strong>Cari siswa atau pilih kelas</strong><span>Pencarian ini dipakai untuk memilih siswa manual.</span></div>')));

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
          if (classes.length !== 1) return msg(subject, 'Pilih kelas terlebih dahulu sebelum menggunakan Pilih semua.', true);
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
      const teacherId = selectedTeacher(subject);
      if (!teacherId) return msg(subject, 'Pilih guru terlebih dahulu sebelum menyalin siswa Tahsin.', true);
      busy(subject, true);
      try {
        const groups = await fetchAllRows(() => supabase.from('teaching_assignments').select('id,class_name').eq('subject', 'tahsin').eq('academic_year_start', state.year).eq('teacher_id', teacherId).eq('active', true).order('class_name'));
        const ids = groups.map(group => group.id).filter(Boolean);
        if (!ids.length) throw new Error('Guru ini belum memiliki kelompok Tahsin aktif.');
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
    const transferStudents = event.target.closest('[data-transfer-students]');
    if (transferStudents) {
      const g = state.groups.find(row => row.id === transferStudents.dataset.transferStudents);
      if (!g) return msg(subject, 'Kelompok sudah berubah. Muat ulang.', true);
      let choice;
      try {
        choice = await pickStudentsForTransfer(state, g);
      } catch (error) {
        return msg(subject, error.message, true);
      }
      if (!choice) return;
      const target = state.groups.find(row => row.id === choice.targetGroupId);
      if (!target) return msg(subject, 'Kelompok tujuan sudah berubah. Muat ulang.', true);
      busy(subject, true);
      try {
        const { data, error } = await supabase.rpc('gm_transfer_group_students', {
          p_source_group_id: g.id,
          p_target_group_id: target.id,
          p_student_ids: choice.studentIds
        });
        if (error) throw error;
        if (subject === 'tahsin') await refreshPublicTahsinRoster();
        msg(subject, `${Number(data?.moved || choice.studentIds.length)} murid dipindahkan ke ${data?.target_teacher_name || teacherName(state, target.teacher_id)}. ${Number(data?.source_remaining || 0)} murid tetap di kelompok asal.`);
      } catch (error) {
        msg(subject, error.message, true);
        busy(subject, false);
        return;
      }
      busy(subject, false);
      await open(subject, true);
      return;
    }
    const transfer = event.target.closest('[data-transfer]');
    if (transfer) {
      const g = state.groups.find(row => row.id === transfer.dataset.transfer);
      if (!g) return msg(subject,'Kelompok sudah berubah. Muat ulang.',true);
      const choices = state.teachers.filter(t => String(t.id) !== String(g.teacher_id)).map(t => ({ value: String(t.id), label: t.nama_lengkap || t.nama || `Guru ${t.id}` }));
      const target = await AdminNotice.request({
        title: 'Transfer kelompok',
        message: `Pilih guru tujuan untuk ${g.class_name}.`,
        label: 'Guru tujuan',
        placeholder: 'Pilih guru',
        choices,
        confirmLabel: 'Transfer'
      });
      if (!target) return;
      busy(subject,true);
      try {
        const {data,error}=await supabase.rpc('gm_transfer_learning_group',{p_group_id:g.id,p_teacher_id:String(target).trim()});
        if(error) throw error;
        msg(subject,`Kelompok ditransfer ke ${data?.teacher_name||'guru tujuan'}.`);
      } catch(error){ msg(subject,error.message,true); busy(subject,false); return; }
      busy(subject,false); await open(subject,true); return;
    }
    const del = event.target.closest('[data-delete-group]');
    if (del) {
      const g = state.groups.find(row => row.id === del.dataset.deleteGroup);
      if (!g) return msg(subject, 'Kelompok sudah berubah. Muat ulang.', true);
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
        if(subject==='tahsin') await refreshPublicTahsinRoster();
        const detached = Number(result?.detached_assessments || 0);
        msg(subject,`Kelompok dihapus permanen. ${result?.deleted_members || preview.members || 0} keanggotaan dihapus${detached ? `; ${detached} nilai tetap disimpan tanpa tautan kelompok lama` : ''}.`);
      } catch(error) { msg(subject,error.message,true); busy(subject,false); return; }
      busy(subject,false); await open(subject,true); return;
    }
    const end = event.target.closest('[data-end]');
    if (end) {
      const g = state.groups.find(row => row.id === end.dataset.end);
      if (!g || !(await AdminNotice.confirm(`Akhiri kelompok ${g.class_name}? Kelompok dinonaktifkan, bukan dihapus.`))) return;
      busy(subject,true);
      try {
        const {data: archived, error} = await supabase.rpc('gm_archive_learning_group_v2', {p_group_id:g.id});
        if(error) throw error;
        if(subject==='tahsin') await refreshPublicTahsinRoster();
        msg(subject,`Kelompok diarsipkan. ${archived?.released_members || 0} keanggotaan dilepas dari status aktif sehingga siswa dapat dimasukkan ke kelompok baru.`);
      } catch(error) { msg(subject,error.message,true); busy(subject,false); return; }
      busy(subject,false); await open(subject,true);
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
