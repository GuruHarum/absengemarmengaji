window.PeriodicAssessments = (() => {
    const state = { initialized: false, busy: false, context: null, teachers: [], students: [], saved: new Map(), drafts: new Map(), page: 1 };
    const pageSize = 8;
    const el = id => document.getElementById(id);
    const escape = value => escapeHtml(value);
    const classLevel = value => String(value || '').match(/^\s*(?:kelas\s*)?(\d+)(?=\D|$)/i)?.[1].replace(/^0+(?=\d)/, '') || '';
    const legacyClassNames = ["Amru Bin Ash", "Abu Bakar Ash Shiddiq", "Umar Bin Khattab", "Utsman Bin Affan", "Ali Bin Abi Thalib", "Bilal Bin Rabbah", "Anas Bin Malik", "Zainab Binti Muhammad", "Zubair Bin Awwam", "Abdurrahman Bin Auf", "Thalhah Bin Ubaidillah", "Haritsah Bin Nu'man", "Nusaybah Binti Ka'ab", "Mush'ab Bin Umair", "Zaid Bin Haritsah", "Saad Bin Abi Waqqos", "Abu Musa Al Asy'ari", "Salman Al Farisi", "Abdullah Bin Umar", "Ammar Bin Yassir", "Ubay Bin Ka'ab", "Said Bin Zaid", "Khadijah Binti Khuwailid", "Ummu Salamah", "Ruqayyah Binti Muhammad", "Muadz Bin Jabbal", "Hamzah Bin Abdul Muthalib", "Khalid Bin Walid", "Abbas Bin Abdul Muthalib", "Thariq Bin Ziyyad", "Abu Ubaidah Bin Jaroh", "Abu Hurairah", "Malik Bin Sinan", "Ja'far Bin Abi Thalib", "Hafshah Binti Umar", "Aisyah Binti Abu Bakar", "Asma Binti Abu Bakar", "Abu Ayyub Al Anshori", "Usamah Bin Zaid", "Uwais Al Qarni", "Fatimah Binti Muhammad", "Abu Dzar Al Ghifari", "Tsuroqoh Bin Malik", "Abdul Aziz Bin Abdullah", "Muawiyyah Binti Muhammad", "Abu Bakar Asshiddiq", "Umar Bin Khottob", "Zainab Binti Abu Bakar"];
    const classNameKey = value => String(value).normalize('NFKC').replace(/[??]/g, "'").replace(/\s+/g, '').toLocaleLowerCase('id');
    function classLabel(value) {
        let text = String(value || '').normalize('NFKC').trim().replace(/^kelas\s*/i, '').replace(/\s+/g, ' ');
        const roman = text.match(/^(XII|XI|IX|VIII|VII|VI|IV|III|II|X|V|I)(?=\s|$)/i);
        if (roman)
            text = (['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'].indexOf(roman[0].toUpperCase()) + 1) + text.slice(roman[0].length);
        const parts = text.match(/^(\d+)\s*(.*)$/);
        if (!parts)
            return text.toLocaleLowerCase('id').replace(/(^|[\s-])([a-z])/g, (_, prefix, letter) => prefix + letter.toUpperCase());
        const candidates = state.students.map(student => String(student.kelas || '').replace(/^\d+\s*/, ''))
            .filter(label => /\s/.test(label)).concat(legacyClassNames);
        const spaced = candidates.find(label => classNameKey(label) === classNameKey(parts[2])) || parts[2];
        const title = spaced.toLocaleLowerCase('id').replace(/(^|[\s-])([a-z])/g, (_, prefix, letter) => prefix + letter.toUpperCase());
        return [parts[1], title].filter(Boolean).join(' ');
    }
    const isDirty = student => AssessmentData.dirty(state.drafts.get(String(student.id)) || AssessmentData.draft(), state.saved.get(String(student.id)));
    const dirtyStudents = () => state.students.filter(isDirty);
    const message = (text, error = false) => { el('assessmentFeedback').textContent = text; el('assessmentFeedback').classList.toggle('is-error', error); };
    function setBusy(busy) {
        state.busy = busy;
        el('assessmentContextFields').disabled = busy;
        el('assessmentCards').querySelectorAll('input, select, button').forEach(control => { control.disabled = busy || control.closest('form')?.dataset.reviewLocked === 'true'; });
        ['assessmentSaveAll', 'assessmentLevel', 'assessmentClass', 'assessmentSearch'].forEach(id => { el(id).disabled = busy; });
        el('assessmentSaveAll').textContent = busy ? 'Menyimpan / memuat...' : 'Simpan Semua';
        pagination();
    }
    function visible() {
        const kelas = el('assessmentClass').value;
        const search = el('assessmentSearch').value.trim().toLocaleLowerCase('id');
        return state.students.filter(student => (!el('assessmentLevel').value || classLevel(student.kelas) === el('assessmentLevel').value) && (!kelas || (kelas.startsWith('level:') ? classLevel(student.kelas) === kelas.slice(6) : student.kelas === kelas)) && String(student['nama siswa']).toLocaleLowerCase('id').includes(search));
    }
    function currentPageSize() {
        const rows = visible();
        const levels = new Set(rows.map(row => classLevel(row.kelas)));
        return rows.length && levels.size === 1 && !levels.has('') ? rows.length : pageSize;
    }
    function pagination() {
        const total = Math.max(1, Math.ceil(visible().length / currentPageSize()));
        state.page = Math.max(1, Math.min(total, state.page));
        el('assessmentPrev').disabled = state.busy || state.page <= 1;
        el('assessmentNext').disabled = state.busy || state.page >= total;
        el('assessmentPageInfo').textContent = `Halaman ${state.page} / ${total}`;
    }
    function summaries() {
        el('assessmentTotal').textContent = state.students.length;
        el('assessmentSaved').textContent = state.students.filter(student => state.saved.has(String(student.id))).length;
        el('assessmentDirty').textContent = dirtyStudents().length;
        el('assessmentCards').querySelectorAll('[data-student-index]').forEach(card => {
            const student = state.students[Number(card.dataset.studentIndex)];
            const badge = card.querySelector('.assessment-state');
            const summary = card.querySelector('[data-report-summary]');
            if (summary && window.ReportCore) {
                const scores = state.drafts.get(String(student.id));
                const totals = ReportCore.stats(scores, state.context.subject);
                summary.textContent = `Jumlah: ${totals.sum ?? '-'} · Rata-rata: ${totals.average == null ? '-' : totals.average.toFixed(1).replace('.', ',')} · Grade: ${totals.grade}${totals.complete ? '' : ' · BELUM LENGKAP'}`;
            }
            const dirty = isDirty(student);
            badge.textContent = state.saved.get(String(student.id))?.needs_review ? 'Perlu verifikasi' : dirty ? 'Belum disimpan' : state.saved.has(String(student.id)) ? 'Tersimpan' : 'Belum diisi';
            badge.dataset.dirty = String(dirty);
        });
    }
    function surahLabel(number) {
        const row = QURAN_SURAHS.find(row => String(row.number) === String(number));
        return row ? row.number + '. ' + row.name : '';
    }
    function optionsAyah(surahNumber, selected) {
        const surah = QURAN_SURAHS.find(row => String(row.number) === String(surahNumber));
        return '<option value="">Pilih ayat terakhir</option>' + (surah ? Array.from({ length: surah.ayahs }, (_, index) => `<option value="${index + 1}" ${String(index + 1) === selected ? 'selected' : ''}>Ayat ${index + 1}</option>`).join('') : '');
    }
    function cardMarkup(student, index) {
        const draft = state.drafts.get(String(student.id));
        const input = (field, label, attributes) => `<label class="field-label" for="assessment-${index}-${field}">${label}<input id="assessment-${index}-${field}" data-field="${field}" value="${escape(draft[field])}" ${attributes}></label>`;
        const score = field => input(field, AssessmentData.scores[field].replace(' Tahsin', '').replace(' Tahfidz', ''), `type="number" min="0" max="100" step="0.01" inputmode="decimal" placeholder="0–100" required`);
        const markup = `<form novalidate class="assessment-student" data-student-index="${index}"><header><div><p>${escape(classLabel(student.kelas))}</p><h3>${escape(student['nama siswa'])}</h3></div><span class="assessment-state"></span></header>
            <div class="assessment-subjects"><fieldset data-subject="tahsin"><legend><span>01</span> Tahsin</legend><div class="assessment-score-grid">${(window.ReportCore ? ReportCore.applicable(draft, 'tahsin').keys : ['tahsin_makhraj', 'tahsin_tajwid', 'tahsin_tartil', 'tahsin_gharib']).map(score).join('')}</div><h4>Capaian akhir</h4><div class="assessment-attainment">${window.ProgressForm ? ProgressForm.markup(draft, 'tahsin', 'assessment-' + index) : input('tahsin_book', 'Buku/Jilid', 'required') + input('tahsin_page', 'Halaman terakhir', 'type="number" required')}</div></fieldset>
            <fieldset data-subject="tahfidz"><legend><span>02</span> Tahfidz</legend><div class="assessment-score-grid">${['tahfidz_makhraj', 'tahfidz_tajwid', 'tahfidz_hafalan'].map(score).join('')}</div><h4>Capaian akhir</h4><div class="assessment-attainment">${window.ProgressForm ? ProgressForm.markup(draft, 'tahfidz', 'assessment-' + index) : ''}<div ${['REVIEW', 'TES'].includes(draft.tahfidz_progress_type) ? 'hidden' : ''}>${SurahPicker.markup(`assessment-${index}-surah`, draft.tahfidz_surah, student['nama siswa'], window.ReportCore ? ReportCore.surahsForJuz(draft.tahfidz_juz).map(s => s.number) : null)}<label class="field-label" for="assessment-${index}-ayah">Ayat terakhir<select id="assessment-${index}-ayah" data-field="tahfidz_ayah" required>${optionsAyah(draft.tahfidz_surah, draft.tahfidz_ayah)}</select></label></div></div></fieldset></div>
            <output data-report-summary class="assessment-result-summary"></output><footer><span>${state.saved.get(String(student.id))?.needs_review ? 'Nilai lama: pengelola perlu memeriksa dan menyimpan untuk verifikasi pengampu.' : state.context.subject === 'tahsin' ? (window.ReportCore && !ReportCore.applicable(draft, 'tahsin').known ? 'Lengkapi tahap capaian untuk menentukan aspek wajib.' : 'Aspek nilai mengikuti capaian aktual siswa.') : 'Capaian sesuai surat dan ayat terakhir.'}</span><button class="primary-action" type="submit">${state.saved.get(String(student.id))?.needs_review && AppAccess.full() ? 'Verifikasi & Simpan' : 'Simpan Nilai'}</button></footer></form>`;
        const selectedMarkup = markup.replace(/<fieldset data-subject="(tahsin|tahfidz)">[\s\S]*?<\/fieldset>/g, (block, subject) => subject === state.context.subject ? block : '');
        return state.saved.get(String(student.id))?.needs_review && !AppAccess.full()
            ? selectedMarkup.replace('<form ', '<form data-review-locked="true" ').replace('<fieldset ', '<fieldset disabled ').replace('type="submit"', 'type="submit" disabled')
            : selectedMarkup;
    }
    function render() {
        pagination();
        const rows = visible().slice((state.page - 1) * currentPageSize(), state.page * currentPageSize());
        el('assessmentCards').innerHTML = rows.length ? rows.map(student => cardMarkup(student, state.students.indexOf(student))).join('') : '<div class="assessment-empty">Tidak ada siswa untuk pilihan ini.</div>';
        summaries();
    }
    async function load() {
        if (state.busy)
            return;
        if (!el('assessmentLoadForm').reportValidity())
            return;
        if (dirtyStudents().length && !(await AdminNotice.confirm('Ada nilai yang belum disimpan. Ganti pilihan dan buang perubahan tersebut?')))
            return;
        const teacherId = AppAccess.full() ? el('assessmentTeacher').value : AppAccess.profile.teacher_id;
        const teacher = state.teachers.find(item => String(item.id) === String(teacherId));
        if (!teacher) {
            message('Pilih guru yang valid terlebih dahulu.', true);
            return;
        }
        const context = { subject: el('assessmentSubject').value, teacherId: String(teacher.id), teacherName: teacher.nama, year: Number(el('assessmentYear').value), period: el('assessmentPeriod').value };
        setBusy(true);
        message('Memuat siswa dan nilai tersimpan...');
        try {
            const [students, saved] = await Promise.all([
                fetchAllRows(() => supabase.rpc('assessment_roster', { teacher_key: String(teacher.id), year_key: context.year, subject_key: context.subject })),
                fetchAllRows(() => supabase.from('subject_assessments').select('*').eq('subject', context.subject).eq('academic_year_start', context.year).eq('period', context.period).order('id'))
            ]);
            state.context = context;
            state.students = students.sort((a, b) => String(a.kelas).localeCompare(String(b.kelas), 'id', { numeric: true }) || String(a['nama siswa']).localeCompare(String(b['nama siswa']), 'id'));
            state.saved = new Map(saved.map(row => [String(row.student_id), { ...row, ...row.scores }]));
            state.drafts = new Map(students.map(student => [String(student.id), AssessmentData.draft(state.saved.get(String(student.id)))]));
            state.page = 1;
            el('assessmentLevel').replaceChildren(new Option('Semua tingkat', ''));
            [...new Set(students.map(row => classLevel(row.kelas)).filter(Boolean))].sort((a, b) => Number(a) - Number(b)).forEach(level => el('assessmentLevel').add(new Option(`Kelas ${level}`, level)));
            el('assessmentClass').replaceChildren(new Option('Semua kelas', ''));
            [...new Set(students.map(row => classLevel(row.kelas)).filter(Boolean))].sort((a, b) => Number(a) - Number(b)).forEach(level => el('assessmentClass').add(new Option(`Kelas ${level} (semua rombel)`, `level:${level}`)));
            [...new Set(students.map(row => row.kelas).filter(Boolean))].sort((a, b) => String(a).localeCompare(String(b), 'id', { numeric: true })).forEach(kelas => el('assessmentClass').add(new Option(classLabel(kelas), kelas)));
            el('assessmentSearch').value = '';
            el('assessmentActivePeriod').textContent = `${context.year}/${context.year + 1} · ${AssessmentData.periods[context.period]} · ${teacher.nama} / ${context.subject.toUpperCase()}`;
            el('assessmentWorkspace').hidden = false;
            render();
            message(students.length ? 'Nilai siap diisi. Data kosong tidak dihitung sebagai nilai nol.' : 'Belum ada siswa. Tahsin mengikuti data guru pada master siswa; Tahfidz memerlukan anggota kelompok untuk tahun ajaran ini.');
        }
        catch (error) {
            console.error(error);
            message('Nilai belum dapat dimuat. Pastikan migrasi assessment-rosters.sql sudah dijalankan dan koneksi tersedia. Data yang sedang Anda isi tetap dipertahankan.', true);
        }
        finally {
            setBusy(false);
        }
    }
    async function save(students) {
        if (state.busy || !state.context)
            return;
        if (!students.length) {
            message('Tidak ada perubahan yang perlu disimpan.');
            return;
        }
        const payload = [];
        for (const student of students) {
            try {
                payload.push(AssessmentData.payload(state.context, student, state.drafts.get(String(student.id)), state.saved.get(String(student.id))));
            }
            catch (error) {
                message(`${student['nama siswa']}: ${error.message} Belum ada perubahan yang dikirim.`, true);
                el('assessmentLevel').value = '';
                el('assessmentClass').value = '';
                el('assessmentSearch').value = '';
                state.page = Math.floor(state.students.indexOf(student) / currentPageSize()) + 1;
                render();
                el('assessmentCards').querySelector(`[data-student-index="${state.students.indexOf(student)}"]`)?.reportValidity();
                return;
            }
        }
        setBusy(true);
        message(`Menyimpan ${payload.length} siswa...`);
        try {
            const { data, error } = await supabase.rpc('save_subject_assessments', { entries: payload });
            if (error)
                throw error;
            if (!Array.isArray(data) || data.length !== payload.length)
                throw new Error('Konfirmasi penyimpanan belum lengkap. Muat ulang untuk memeriksa nilai.');
            data.forEach(result => { const row = { ...result, ...result.scores }; state.saved.set(String(row.student_id), row); state.drafts.set(String(row.student_id), AssessmentData.draft(row)); });
            render();
            message(`${data.length} siswa berhasil disimpan untuk ${AssessmentData.periods[state.context.period]}.`);
        }
        catch (error) {
            message(`Gagal menyimpan: ${error.message}. Isian tetap tersedia; periksa koneksi atau muat ulang jika data telah berubah.`, true);
        }
        finally {
            setBusy(false);
        }
    }
    // Guru untuk penilaian mengikuti pelajaran, bukan gabungan semua guru.
    // Guru yang mengampu keduanya dapat tampil di kedua pilihan apabila
    // memiliki siswa Tahfidz melalui kelompok aktif.
    async function refreshSubjectTeachers() {
        const subject = el('assessmentSubject').value || 'tahsin';
        const previous = el('assessmentTeacher').value;
        let eligible = state.teachers;
        if (subject === 'tahsin') {
            eligible = eligible.filter(row => row.attendance_enabled !== false);
        } else {
            const year = Number(el('assessmentYear').value);
            const { data, error } = await supabase.from('teaching_assignments')
                .select('teacher_id').eq('subject', 'tahfidz').eq('active', true)
                .eq('academic_year_start', year);
            if (error) throw error;
            const ids = new Set((data || []).map(row => String(row.teacher_id)));
            eligible = eligible.filter(row => ids.has(String(row.id)));
        }
        el('assessmentTeacher').replaceChildren(new Option('Pilih guru', ''));
        eligible.forEach(row => el('assessmentTeacher').add(new Option(row.nama, row.id)));
        const wanted = AppAccess.teacher?.() ? String(AppAccess.profile.teacher_id) : (previous || String(AppAccess.profile.teacher_id || ''));
        if (eligible.some(row => String(row.id) === wanted))
            el('assessmentTeacher').value = wanted;
        else
            el('assessmentTeacher').value = '';
        el('assessmentTeacher').disabled = !AppAccess.full();
        // Guru hanya melihat peserta yang terhubung dengan akunnya.
        const teacherLabel = el('assessmentTeacher').closest?.('label');
        if (teacherLabel) teacherLabel.hidden = !AppAccess.full();
        return Boolean(el('assessmentTeacher').value);
    }
    async function open() {
        if (state.busy)
            return;
        if (state.initialized) {
            state.busy = true;
            try {
                if (window.ReportCore) {
                    const ref = await supabase.from('report_reference').select('data').eq('id', 1).single();
                    if (ref.error)
                        throw ref.error;
                    ReportCore.useReference(ref.data.data);
                }
                state.teachers = await getTeachers();
                await refreshSubjectTeachers();
            }
            catch (error) {
                message(error.message, true);
            }
            finally {
                state.busy = false;
            }
            return;
        }
        state.busy = true;
        message('Memuat daftar guru...');
        try {
            await AppAccess.ready;
            if (window.ReportCore) {
                const ref = await supabase.from('report_reference').select('data').eq('id', 1).single();
                if (ref.error)
                    throw ref.error;
                ReportCore.useReference(ref.data.data);
            }
            state.teachers = await getTeachers();

            const now = new Date();
            el('assessmentYear').value = now.getFullYear() - (now.getMonth() < 6 ? 1 : 0);
            el('assessmentPeriod').value = now.getMonth() < 6 ? 'pts_genap' : 'pts_ganjil';
            yearLabel();
            await refreshSubjectTeachers();
            el('assessmentScopeNote').textContent = AppAccess.full() ? 'Tahsin mengikuti master siswa. Tahfidz mengikuti kelompok aktif; kolom Guru Tahfidz pada impor dapat membuat dan memperbarui anggota kelompok. Periksa daftar sebelum memberi nilai.' : 'Tahsin hanya siswa yang Anda ampu; Tahfidz hanya anggota kelompok Tahfidz Anda.';
            state.initialized = true;
            message('Pilih tahun ajaran dan periode, lalu tampilkan siswa.');
        }
        catch (error) {
            message(error.message, true);
        }
        finally {
            state.busy = false;
        }
    }
    function yearLabel() { const year = Number(el('assessmentYear').value); el('assessmentYearLabel').textContent = `Tahun ajaran ${year}/${year + 1}`; }
    document.addEventListener('panelready', () => {
        el('assessmentLoadForm').addEventListener('submit', event => { event.preventDefault(); return load(); });
        el('assessmentYear').addEventListener('input', () => { yearLabel(); refreshSubjectTeachers().catch(error => message(error.message, true)); });
        el('assessmentSubject').addEventListener('change', () => {
            el('assessmentWorkspace').hidden = true;
            state.students = []; state.saved.clear(); state.drafts.clear(); state.context = null;
            refreshSubjectTeachers().catch(error => message(error.message, true));
        });
        el('assessmentCards').addEventListener('input', event => {
            if (event.target.dataset.surahSearch) {
                if (!event.target.dataset.surahCommit)
                    return;
                const card = event.target.closest('[data-student-index]');
                const student = state.students[Number(card.dataset.studentIndex)];
                if (state.busy || card.dataset.reviewLocked === 'true')
                    return;
                const draft = state.drafts.get(String(student.id));
                const normalize = value => String(value).toLocaleLowerCase('id').replace(/[^a-z0-9]/g, '');
                const query = normalize(event.target.value);
                const row = QURAN_SURAHS.find(row => event.target.dataset.selectedSurah
                    ? String(row.number) === event.target.dataset.selectedSurah
                    : String(row.number) === query || normalize(surahLabel(row.number)) === query
                        || normalize(row.name) === query
                        || (window.ReportCore && normalize(row.number + '. ' + ReportCore.surahName(row.number)) === query));
                const next = row ? String(row.number) : '';
                event.target.setCustomValidity(row ? '' : 'Pilih nama surat dari saran yang muncul.');
                if (draft.tahfidz_surah !== next) {
                    draft.tahfidz_surah = next;
                    draft.tahfidz_ayah = '';
                    if (window.ReportCore) {
                        draft.tahfidz_ayah_start = '';
                        const start = card.querySelector('[data-field="tahfidz_ayah_start"]');
                        if (start)
                            start.value = '';
                    }
                    card.querySelector('[data-field="tahfidz_ayah"]').innerHTML = optionsAyah(next, '');
                }
                summaries();
                return;
            }
            const field = event.target.dataset.field;
            if (!field || !AssessmentData.fields.includes(field) || state.busy)
                return;
            const card = event.target.closest('[data-student-index]');
            const student = state.students[Number(card.dataset.studentIndex)];
            const draft = state.drafts.get(String(student.id));
            draft[field] = event.target.value;
            if (field === 'tahfidz_hafalan')
                draft.tahfidz_aspect_confirmed = 'true';
            if (window.ProgressForm && ProgressForm.changed(draft, field)) {
                render();
                return;
            }
            if (field === 'tahfidz_surah') {
                draft.tahfidz_ayah = '';
                if (window.ReportCore) {
                    draft.tahfidz_ayah_start = '';
                    const start = card.querySelector('[data-field="tahfidz_ayah_start"]');
                    if (start)
                        start.value = '';
                }
                card.querySelector('[data-field="tahfidz_ayah"]').innerHTML = optionsAyah(draft.tahfidz_surah, '');
            }
            summaries();
        });
        SurahPicker.bind(el('assessmentCards'));
        el('assessmentCards').addEventListener('submit', event => { event.preventDefault(); const student = state.students[Number(event.target.dataset.studentIndex)]; if (student)
            return save([student]); });
        el('assessmentSaveAll').addEventListener('click', () => save(dirtyStudents()));
        ['assessmentClass', 'assessmentSearch'].forEach(id => el(id).addEventListener('input', () => { state.page = 1; render(); }));
        el('assessmentLevel').addEventListener('input', () => { el('assessmentClass').value = ''; state.page = 1; render(); });
        el('assessmentPrev').addEventListener('click', () => { state.page--; render(); });
        el('assessmentNext').addEventListener('click', () => { state.page++; render(); });
    });
    window.addEventListener('beforeunload', event => { if (dirtyStudents().length) {
        event.preventDefault();
        event.returnValue = '';
    } });
    return { open, classLabel, hasUnsavedChanges: () => dirtyStudents().length > 0 };
})();
