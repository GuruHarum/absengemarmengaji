window.PeriodicAssessments = (() => {
    const state = {
        initialized: false, busy: false, context: null, teachers: [], students: [], saved: new Map(), drafts: new Map(), page: 1,
        problemOnly: false, lastFailedSave: [], lastSubject: 'tahsin', pendingWorkspaceFilter: null, draftTimer: null,
        renderLimit: 12, lazyObserver: null, prefetchedMarkup: new Map()
    };
    const el = id => document.getElementById(id);
    const escape = value => escapeHtml(value);
    const classLevel = value => String(value || '').match(/^\s*(?:kelas\s*)?(\d+)(?=\D|$)/i)?.[1].replace(/^0+(?=\d)/, '') || '';
    const legacyClassNames = ["Amru Bin Ash", "Abu Bakar Ash Shiddiq", "Umar Bin Khattab", "Utsman Bin Affan", "Ali Bin Abi Thalib", "Bilal Bin Rabbah", "Anas Bin Malik", "Zainab Binti Muhammad", "Zubair Bin Awwam", "Abdurrahman Bin Auf", "Thalhah Bin Ubaidillah", "Haritsah Bin Nu'man", "Nusaybah Binti Ka'ab", "Mush'ab Bin Umair", "Zaid Bin Haritsah", "Saad Bin Abi Waqqos", "Abu Musa Al Asy'ari", "Salman Al Farisi", "Abdullah Bin Umar", "Ammar Bin Yassir", "Ubay Bin Ka'ab", "Said Bin Zaid", "Khadijah Binti Khuwailid", "Ummu Salamah", "Ruqayyah Binti Muhammad", "Muadz Bin Jabbal", "Hamzah Bin Abdul Muthalib", "Khalid Bin Walid", "Abbas Bin Abdul Muthalib", "Thariq Bin Ziyyad", "Abu Ubaidah Bin Jaroh", "Abu Hurairah", "Malik Bin Sinan", "Ja'far Bin Abi Thalib", "Hafshah Binti Umar", "Aisyah Binti Abu Bakar", "Asma Binti Abu Bakar", "Abu Ayyub Al Anshori", "Usamah Bin Zaid", "Uwais Al Qarni", "Fatimah Binti Muhammad", "Abu Dzar Al Ghifari", "Tsuroqoh Bin Malik", "Abdul Aziz Bin Abdullah", "Muawiyyah Binti Muhammad", "Abu Bakar Asshiddiq", "Umar Bin Khottob", "Zainab Binti Abu Bakar"];
    const classNameKey = value => String(value).normalize('NFKC').replace(/[??]/g, "'").replace(/\s+/g, '').toLocaleLowerCase('id');
    const STORAGE = Object.freeze({ last: 'gm_assessment_last_filter_v45', favorite: 'gm_assessment_favorite_filter_v45', drafts: 'gm_assessment_drafts_v45' });

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
    const message = (text, error = false) => {
        const node = el('assessmentFeedback');
        if (!node) return;
        node.textContent = text;
        node.classList.toggle('is-error', error);
    };
    const storageAvailable = () => { try { return Boolean(window.localStorage); } catch (_) { return false; } };
    const storageScope = () => String(AppAccess?.profile?.id || AppAccess?.profile?.teacher_id || AppAccess?.profile?.email || 'shared');
    const scopedKey = key => `${key}:${storageScope()}`;
    function readStorage(key, fallback = null) {
        if (!storageAvailable()) return fallback;
        try { const raw = localStorage.getItem(scopedKey(key)); return raw ? JSON.parse(raw) : fallback; }
        catch (_) { return fallback; }
    }
    function writeStorage(key, value) {
        if (!storageAvailable()) return false;
        try { localStorage.setItem(scopedKey(key), JSON.stringify(value)); return true; }
        catch (_) { return false; }
    }
    function removeStorage(key) {
        if (!storageAvailable()) return;
        try { localStorage.removeItem(scopedKey(key)); } catch (_) { }
    }
    const contextKey = (context = state.context) => context ? `${context.year}|${context.period}|${context.subject}|${context.teacherId}` : '';

    const SESSION_CACHE = Object.freeze({ reference: 'gm_report_reference_v46', teachers: 'gm_teachers_v46', assignments: 'gm_assignments_v46' });
    function readSession(key, ttlMs = 10 * 60 * 1000) {
        try {
            const raw = sessionStorage.getItem(key);
            if (!raw) return null;
            const row = JSON.parse(raw);
            if (!row || Date.now() - Number(row.at || 0) > ttlMs) { sessionStorage.removeItem(key); return null; }
            return row.data;
        } catch (_) { return null; }
    }
    function writeSession(key, data) {
        try { sessionStorage.setItem(key, JSON.stringify({ at: Date.now(), data })); } catch (_) { }
        return data;
    }
    async function loadReportReferenceCached(force = false) {
        if (!window.ReportCore) return null;
        const cached = force ? null : readSession(SESSION_CACHE.reference, 30 * 60 * 1000);
        if (cached) { ReportCore.useReference(cached); return cached; }
        const ref = await supabase.from('report_reference').select('data').eq('id', 1).single();
        if (ref.error) throw ref.error;
        const data = ref.data?.data || {};
        writeSession(SESSION_CACHE.reference, data);
        ReportCore.useReference(data);
        return data;
    }
    async function loadTeachersCached(force = false) {
        const cached = force ? null : readSession(SESSION_CACHE.teachers, 10 * 60 * 1000);
        if (cached?.length) return cached;
        const rows = await getTeachers();
        writeSession(SESSION_CACHE.teachers, rows);
        return rows;
    }

    function filterSnapshot() {
        return {
            year: Number(el('assessmentYear')?.value || state.context?.year || 0),
            period: el('assessmentPeriod')?.value || state.context?.period || 'pts_ganjil',
            teacherId: String(el('assessmentTeacher')?.value || state.context?.teacherId || ''),
            subject: el('assessmentSubject')?.value || state.context?.subject || 'tahsin',
            level: el('assessmentLevel')?.value || '',
            className: el('assessmentClass')?.value || '',
            problemOnly: Boolean(state.problemOnly)
        };
    }
    function rememberLastFilter() { writeStorage(STORAGE.last, filterSnapshot()); }
    function refreshFavoriteButtons() {
        const favorite = readStorage(STORAGE.favorite);
        const use = el('assessmentFavoriteUse');
        if (use) use.disabled = !favorite;
        const status = el('assessmentFavoriteStatus');
        if (status) status.textContent = favorite ? 'Filter favorit tersedia.' : 'Belum ada filter favorit.';
    }
    function saveFavorite() {
        writeStorage(STORAGE.favorite, filterSnapshot());
        refreshFavoriteButtons();
        window.AdminNotice?.notify?.('Filter penilaian disimpan sebagai favorit.', 'success');
    }

    function draftStore() {
        const store = readStorage(STORAGE.drafts, {});
        return store && typeof store === 'object' ? store : {};
    }
    function draftStatus(text, kind = '') {
        const node = el('assessmentDraftState');
        if (!node) return;
        node.textContent = text || '';
        if (node.dataset) node.dataset.state = kind;
    }
    function persistDrafts() {
        if (!state.context) return;
        const store = draftStore();
        const key = contextKey();
        const entries = {};
        for (const student of state.students) {
            if (!isDirty(student)) continue;
            const saved = state.saved.get(String(student.id));
            entries[String(student.id)] = {
                draft: state.drafts.get(String(student.id)),
                baselineVersion: Number(saved?.version || 0),
                name: student['nama siswa'],
                className: student.kelas
            };
        }
        if (Object.keys(entries).length) {
            store[key] = { savedAt: Date.now(), context: { ...state.context }, entries };
            writeStorage(STORAGE.drafts, store);
            const now = new Date();
            draftStatus(`Draf sementara tersimpan di perangkat · ${now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}`, 'saved');
        } else {
            delete store[key];
            writeStorage(STORAGE.drafts, store);
            draftStatus('Semua perubahan sudah tersimpan ke database.', 'clean');
        }
    }
    function scheduleDraftSave() {
        if (window.clearTimeout && state.draftTimer) window.clearTimeout(state.draftTimer);
        if (window.setTimeout) state.draftTimer = window.setTimeout(persistDrafts, 450);
        else persistDrafts();
    }
    function restoreDrafts() {
        if (!state.context) return 0;
        const store = draftStore();
        const bucket = store[contextKey()];
        if (!bucket?.entries) return 0;
        if (Date.now() - Number(bucket.savedAt || 0) > 14 * 24 * 60 * 60 * 1000) {
            delete store[contextKey()];
            writeStorage(STORAGE.drafts, store);
            return 0;
        }
        let restored = 0, skipped = 0;
        for (const student of state.students) {
            const id = String(student.id), savedDraft = bucket.entries[id];
            if (!savedDraft?.draft) continue;
            const currentVersion = Number(state.saved.get(id)?.version || 0);
            if (currentVersion !== Number(savedDraft.baselineVersion || 0)) { skipped++; continue; }
            state.drafts.set(id, AssessmentData.draft(savedDraft.draft));
            restored++;
        }
        if (restored) draftStatus(`${restored} draf sementara dipulihkan dari perangkat.${skipped ? ` ${skipped} draf dilewati karena data database sudah berubah.` : ''}`, 'restored');
        return restored;
    }

    function issueDetail(student) {
        const saved = state.saved.get(String(student.id));
        if (saved?.needs_review) return { problem: true, reason: 'Perlu verifikasi' };
        const draft = state.drafts.get(String(student.id)) || AssessmentData.draft();
        if (isDirty(student)) return { problem: true, reason: 'Belum disimpan' };
        if (!state.context) return { problem: false, reason: '' };
        try {
            AssessmentData.payload(state.context, student, draft, saved);
            return { problem: false, reason: '' };
        } catch (error) {
            return { problem: true, reason: saved ? 'Belum lengkap' : 'Belum diisi', detail: error.message };
        }
    }
    const problemStudents = () => state.students.filter(student => issueDetail(student).problem);

    function setBusy(busy) {
        state.busy = busy;
        if (el('assessmentContextFields')) el('assessmentContextFields').disabled = busy;
        el('assessmentCards')?.querySelectorAll('input, select, button').forEach(control => { control.disabled = busy || control.closest('form')?.dataset.reviewLocked === 'true'; });
        ['assessmentSaveAll', 'assessmentRetrySave', 'assessmentLevel', 'assessmentClass', 'assessmentSearch', 'assessmentProblemOnly', 'assessmentExport', 'assessmentExportScope', 'assessmentFavoriteSave', 'assessmentFavoriteUse', 'assessmentPasteExcel', 'assessmentPeriodPrev', 'assessmentPeriodNext', 'assessmentMobileSave', 'assessmentMobileProblems'].forEach(id => { if (el(id)) el(id).disabled = busy || (id === 'assessmentFavoriteUse' && !readStorage(STORAGE.favorite)); });
        if (el('assessmentSaveAll')) el('assessmentSaveAll').textContent = busy ? 'Menyimpan / memuat...' : 'Simpan Semua';
        pagination();
    }

    // Setiap halaman hanya satu kelas nyata, bukan gabungan tingkat/rombel.
    function visible() {
        const kelas = el('assessmentClass')?.value;
        if (!kelas) return [];
        const search = el('assessmentSearch')?.value.trim().toLocaleLowerCase('id') || '';
        return state.students.filter(student => student.kelas === kelas &&
            String(student['nama siswa']).toLocaleLowerCase('id').includes(search) &&
            (!state.problemOnly || issueDetail(student).problem));
    }
    function resetLazy() {
        state.renderLimit = 12;
        state.prefetchedMarkup.clear();
        state.lazyObserver?.disconnect?.();
        state.lazyObserver = null;
    }
    function pagination() {
        state.page = 1;
        const rows = visible();
        if (el('assessmentPrev')) { el('assessmentPrev').disabled = true; el('assessmentPrev').hidden = true; }
        if (el('assessmentNext')) { el('assessmentNext').disabled = true; el('assessmentNext').hidden = true; }
        if (el('assessmentPageInfo')) el('assessmentPageInfo').textContent = el('assessmentClass')?.value ? classLabel(el('assessmentClass').value) : 'Pilih kelas';
    }
    function prefetchNext(rows) {
        const start = state.renderLimit;
        if (start >= rows.length) return;
        const task = () => {
            rows.slice(start, Math.min(rows.length, start + 12)).forEach((student, offset) => {
                const idx = state.students.indexOf(student);
                if (!state.prefetchedMarkup.has(String(student.id)))
                    state.prefetchedMarkup.set(String(student.id), cardMarkup(student, idx, start + offset + 1));
            });
        };
        if ('requestIdleCallback' in window) requestIdleCallback(task, { timeout: 800 });
        else setTimeout(task, 40);
    }
    function bindLazySentinel(rows) {
        state.lazyObserver?.disconnect?.();
        const sentinel = el('assessmentLazySentinel');
        if (!sentinel || state.renderLimit >= rows.length) return;
        const loadMore = () => {
            state.renderLimit = Math.min(rows.length, state.renderLimit + 12);
            render({ preserveLimit: true });
        };
        sentinel.querySelector('button')?.addEventListener('click', loadMore, { once: true });
        if ('IntersectionObserver' in window) {
            state.lazyObserver = new IntersectionObserver(entries => {
                if (entries.some(entry => entry.isIntersecting)) {
                    state.lazyObserver?.disconnect?.();
                    loadMore();
                }
            }, { rootMargin: '280px 0px' });
            state.lazyObserver.observe(sentinel);
        }
    }
    function summaries() {
        const shown = visible();
        const cleanSaved = shown.filter(student => state.saved.has(String(student.id)) && !isDirty(student) && !issueDetail(student).problem).length;
        if (el('assessmentTotal')) el('assessmentTotal').textContent = shown.length;
        if (el('assessmentSaved')) el('assessmentSaved').textContent = cleanSaved;
        if (el('assessmentDirty')) el('assessmentDirty').textContent = shown.length - cleanSaved;
        if (el('assessmentProblems')) el('assessmentProblems').textContent = state.students.filter(student => student.kelas === el('assessmentClass')?.value && issueDetail(student).problem).length;
        if (el('assessmentMobileStatus')) {
            const dirty = shown.filter(isDirty).length, problems = shown.filter(student => issueDetail(student).problem).length;
            el('assessmentMobileStatus').textContent = dirty ? `${dirty} belum disimpan` : (problems ? `${problems} perlu diperiksa` : 'Semua aman');
        }
        const problemButton = el('assessmentProblemOnly');
        if (problemButton) {
            problemButton.classList.toggle('active', state.problemOnly);
            problemButton.setAttribute?.('aria-pressed', String(state.problemOnly));
            problemButton.textContent = state.problemOnly ? 'Tampilkan semua siswa' : 'Hanya bermasalah';
        }
        el('assessmentCards')?.querySelectorAll('[data-student-index]').forEach(card => {
            const student = state.students[Number(card.dataset.studentIndex)];
            const badge = card.querySelector('.assessment-state');
            const summary = card.querySelector('[data-report-summary]');
            if (summary && window.ReportCore) {
                const scores = state.drafts.get(String(student.id));
                const totals = ReportCore.stats(scores, state.context.subject);
                summary.textContent = `Jumlah: ${totals.sum ?? '-'} · Rata-rata: ${totals.average == null ? '-' : totals.average.toFixed(1).replace('.', ',')} · Grade: ${totals.grade}${totals.complete ? '' : ' · BELUM LENGKAP'}`;
            }
            const issue = issueDetail(student), dirty = isDirty(student);
            badge.textContent = issue.reason || (state.saved.has(String(student.id)) ? 'Tersimpan' : 'Belum diisi');
            badge.dataset.dirty = String(dirty);
            card.dataset.problem = String(issue.problem);
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
    function cardMarkup(student, index, orderNumber = index + 1) {
        const draft = state.drafts.get(String(student.id));
        const displayOrder = String(Math.max(1, Number(orderNumber) || 1)).padStart(2, '0');
        const input = (field, label, attributes) => `<label class="field-label" for="assessment-${index}-${field}">${label}<input id="assessment-${index}-${field}" data-field="${field}" value="${escape(draft[field])}" ${attributes}></label>`;
        const score = field => input(field, AssessmentData.scores[field].replace(' Tahsin', '').replace(' Tahfidz', ''), `type="number" min="0" max="100" step="0.01" inputmode="decimal" enterkeyhint="next" placeholder="0–100" required`);
        const markup = `<form novalidate class="assessment-student" data-student-index="${index}"><header><div class="assessment-student-identity"><span class="assessment-card-order" aria-label="Nomor urut ${displayOrder}">${displayOrder}</span><div><p>${escape(classLabel(student.kelas))}</p><h3>${escape(student['nama siswa'])}</h3></div></div><span class="assessment-state"></span></header>
            <div class="assessment-subjects"><fieldset data-subject="tahsin" aria-label="Penilaian Tahsin"><div class="assessment-score-grid">${(window.ReportCore ? ReportCore.applicable(draft, 'tahsin').keys : ['tahsin_makhraj', 'tahsin_tajwid', 'tahsin_tartil', 'tahsin_gharib']).map(score).join('')}</div><h4>Capaian akhir</h4><div class="assessment-attainment">${window.ProgressForm ? ProgressForm.markup(draft, 'tahsin', 'assessment-' + index) : input('tahsin_book', 'Buku/Jilid', 'required') + input('tahsin_page', 'Halaman terakhir', 'type="number" required')}</div></fieldset>
            <fieldset data-subject="tahfidz" aria-label="Penilaian Tahfidz"><div class="assessment-score-grid">${['tahfidz_makhraj', 'tahfidz_tajwid', 'tahfidz_hafalan'].map(score).join('')}</div><h4>Capaian akhir</h4><div class="assessment-attainment">${window.ProgressForm ? ProgressForm.markup(draft, 'tahfidz', 'assessment-' + index) : ''}<div ${['REVIEW', 'TES'].includes(draft.tahfidz_progress_type) ? 'hidden' : ''}>${SurahPicker.markup(`assessment-${index}-surah`, draft.tahfidz_surah, student['nama siswa'], window.ReportCore ? ReportCore.surahsForJuz(draft.tahfidz_juz).map(s => s.number) : null)}<label class="field-label" for="assessment-${index}-ayah">Ayat terakhir<select id="assessment-${index}-ayah" data-field="tahfidz_ayah" required>${optionsAyah(draft.tahfidz_surah, draft.tahfidz_ayah)}</select></label></div></div></fieldset></div>
            <output data-report-summary class="assessment-result-summary"></output><footer><span>${state.saved.get(String(student.id))?.needs_review ? 'Nilai lama: pengelola perlu memeriksa dan menyimpan untuk verifikasi pengampu.' : state.context.subject === 'tahsin' ? 'Nilai mengikuti capaian aktual siswa.' : 'Tahfidz'}</span><button class="primary-action" type="submit">${state.saved.get(String(student.id))?.needs_review && AppAccess.full() ? 'Verifikasi & Simpan' : 'Simpan Nilai'}</button></footer></form>`;
        const selectedMarkup = markup.replace(/<fieldset data-subject="(tahsin|tahfidz)"[^>]*>[\s\S]*?<\/fieldset>/g, (block, subject) => subject === state.context.subject ? block : '');
        return state.saved.get(String(student.id))?.needs_review && !AppAccess.full()
            ? selectedMarkup.replace('<form ', '<form data-review-locked="true" ').replace('<fieldset ', '<fieldset disabled ').replace('type="submit"', 'type="submit" disabled')
            : selectedMarkup;
    }
    function render(options = {}) {
        if (!options.preserveLimit) resetLazy();
        pagination();
        const allRows = visible();
        const rows = allRows.slice(0, state.renderLimit);
        if (el('assessmentCards')) {
            const markup = rows.length ? rows.map((student, visibleIndex) => {
                const cached = state.prefetchedMarkup.get(String(student.id));
                return cached || cardMarkup(student, state.students.indexOf(student), visibleIndex + 1);
            }).join('') : `<div class="assessment-empty">${state.problemOnly ? 'Tidak ada siswa bermasalah pada kelas ini.' : 'Tidak ada siswa pada kelas ini.'}</div>`;
            const more = rows.length < allRows.length ? `<div id="assessmentLazySentinel" class="assessment-lazy-sentinel">Menyiapkan siswa berikutnya… <button type="button" class="secondary-action">Muat berikutnya</button></div>` : '';
            el('assessmentCards').innerHTML = markup + more;
        }
        summaries();
        rememberLastFilter();
        prefetchNext(allRows);
        bindLazySentinel(allRows);
        if (options.focusField) {
            requestAnimationFrame(() => {
                const selector = `[data-student-index="${options.studentIndex}"] [data-field="${options.focusField}"]`;
                const target = el('assessmentCards')?.querySelector(selector);
                target?.focus?.({ preventScroll: true });
            });
        }
    }

    async function chooseUnsaved(messageText) {
        persistDrafts();
        const count = dirtyStudents().length;
        if (!count) return 'continue';
        if (window.AdminNotice?.choose) {
            const choice = await AdminNotice.choose({
                title: `${count} siswa memiliki perubahan belum disimpan`,
                message: messageText || 'Simpan ke database sekarang, atau keluar dengan draf tetap aman di perangkat ini.',
                primaryLabel: 'Simpan sekarang', secondaryLabel: 'Keluar & simpan draf', cancelLabel: 'Batal'
            });
            if (choice === 'primary') return (await save(dirtyStudents(), { showSummary: true, source: 'leave' })) ? 'continue' : 'cancel';
            if (choice === 'secondary') return 'continue';
            return 'cancel';
        }
        const leave = typeof confirm === 'function' ? confirm('Ada nilai yang belum disimpan. Draf sementara sudah disimpan di perangkat. Lanjutkan?') : false;
        return leave ? 'continue' : 'cancel';
    }

    async function load(options = {}) {
        if (state.busy) return false;
        if (!el('assessmentLoadForm').reportValidity()) return false;
        if (!options.skipUnsavedPrompt && dirtyStudents().length) {
            const decision = await chooseUnsaved('Anda akan mengganti guru/periode penilaian. Pilih Simpan sekarang agar nilai masuk database, atau lanjutkan dengan draf tersimpan di perangkat.');
            if (decision !== 'continue') return false;
        }
        const teacherId = AppAccess.full() ? el('assessmentTeacher').value : AppAccess.profile.teacher_id;
        const teacher = state.teachers.find(item => String(item.id) === String(teacherId));
        if (!teacher) { message('Pilih guru yang valid terlebih dahulu.', true); return false; }
        const context = { subject: el('assessmentSubject').value, teacherId: String(teacher.id), teacherName: teacher.nama, year: Number(el('assessmentYear').value), period: el('assessmentPeriod').value };
        setBusy(true);
        message('');
        if (window.GMUX?.skeletonCards) {
            el('assessmentWorkspace').hidden = false;
            el('assessmentCards').innerHTML = window.GMUX.skeletonCards(3, { form: true });
        } else message('Memuat siswa dan nilai tersimpan...');
        try {
            const students = await fetchAllRows(() => supabase.rpc('assessment_roster', {
                teacher_key: String(teacher.id), year_key: context.year, subject_key: context.subject
            }));
            const saved = [];
            const studentIds = [...new Set(students.map(row => String(row.id)))];
            for (let i = 0; i < studentIds.length; i += 100) {
                const ids = studentIds.slice(i, i + 100);
                const chunk = await fetchAllRows(() => supabase.from('subject_assessments').select('*')
                    .eq('subject', context.subject).eq('academic_year_start', context.year)
                    .eq('period', context.period).in('student_id', ids).order('id'));
                saved.push(...chunk);
            }
            state.context = context;
            state.lastSubject = context.subject;
            state.students = students.sort((a, b) => String(a.kelas).localeCompare(String(b.kelas), 'id', { numeric: true }) || String(a['nama siswa']).localeCompare(String(b['nama siswa']), 'id'));
            state.saved = new Map(saved.map(row => [String(row.student_id), { ...row, ...row.scores }]));
            state.drafts = new Map(students.map(student => [String(student.id), AssessmentData.draft(state.saved.get(String(student.id)))]));
            state.lastFailedSave = [];
            if (el('assessmentRetrySave')) el('assessmentRetrySave').hidden = true;
            const restored = restoreDrafts();
            state.page = 1;
            el('assessmentLevel').replaceChildren(new Option('Semua tingkat', ''));
            [...new Set(students.map(row => classLevel(row.kelas)).filter(Boolean))].sort((a, b) => Number(a) - Number(b)).forEach(level => el('assessmentLevel').add(new Option(`Kelas ${level}`, level)));
            el('assessmentClass').replaceChildren(new Option('Pilih kelas', ''));
            const classes = [...new Set(students.map(row => row.kelas).filter(Boolean))].sort((a, b) => String(a).localeCompare(String(b), 'id', { numeric: true }));
            classes.forEach(kelas => el('assessmentClass').add(new Option(classLabel(kelas), kelas)));
            const preferred = options.preferredFilter || state.pendingWorkspaceFilter || readStorage(STORAGE.last, {});
            const sameContext = preferred && Number(preferred.year) === context.year && preferred.period === context.period && preferred.subject === context.subject && String(preferred.teacherId || '') === String(context.teacherId);
            const preferredClass = sameContext && classes.includes(preferred.className) ? preferred.className : classes[0] || '';
            el('assessmentClass').value = preferredClass;
            el('assessmentLevel').value = preferredClass ? classLevel(preferredClass) : '';
            state.problemOnly = Boolean(sameContext && preferred.problemOnly);
            el('assessmentSearch').value = '';
            el('assessmentActivePeriod').textContent = `${context.year}/${context.year + 1} · ${AssessmentData.periods[context.period]} · ${teacher.nama} / ${context.subject.toUpperCase()}`;
            el('assessmentWorkspace').hidden = false;
            state.pendingWorkspaceFilter = null;
            render();
            rememberLastFilter();
            message(students.length ? `${restored ? `${restored} draf sementara dipulihkan. ` : ''}Nilai siap diisi. Data kosong tidak dihitung sebagai nilai nol.` : 'Belum ada anggota kelompok aktif untuk guru dan pelajaran ini.');
            return true;
        } catch (error) {
            console.error(error);
            message('Nilai belum dapat dimuat. Pastikan koneksi tersedia. Draf yang sebelumnya tersimpan di perangkat tidak dihapus.', true);
            return false;
        } finally { setBusy(false); }
    }

    function saveSummary(savedCount, attemptedCount) {
        const className = el('assessmentClass')?.value;
        const classRows = state.students.filter(student => !className || student.kelas === className);
        const problems = classRows.filter(student => issueDetail(student).problem).length;
        const dirty = classRows.filter(isDirty).length;
        const node = el('assessmentSaveSummary');
        if (node) {
            node.hidden = false;
            node.innerHTML = `<strong>${savedCount} siswa berhasil disimpan.</strong><span>${problems} siswa masih perlu diperiksa · ${dirty} draf belum masuk database.</span>`;
        }
        return `${savedCount} dari ${attemptedCount} siswa berhasil disimpan. ${problems ? `${problems} siswa masih perlu diperiksa.` : 'Semua siswa pada kelas ini sudah lengkap.'}`;
    }

    async function save(students, options = {}) {
        if (state.busy || !state.context) return false;
        if (!students.length) { message('Tidak ada perubahan yang perlu disimpan.'); return true; }
        const payload = [];
        for (const student of students) {
            try {
                payload.push(AssessmentData.payload(state.context, student, state.drafts.get(String(student.id)), state.saved.get(String(student.id))));
            } catch (error) {
                state.lastFailedSave = [student];
                if (el('assessmentRetrySave')) el('assessmentRetrySave').hidden = false;
                message(`${student['nama siswa']}: ${error.message} Belum ada perubahan yang dikirim.`, true);
                el('assessmentLevel').value = classLevel(student.kelas);
                el('assessmentClass').value = student.kelas;
                el('assessmentSearch').value = '';
                state.problemOnly = false;
                state.page = 1;
                render();
                el('assessmentCards').querySelector(`[data-student-index="${state.students.indexOf(student)}"]`)?.reportValidity();
                return false;
            }
        }
        setBusy(true);
        message(`Menyimpan ${payload.length} siswa...`);
        try {
            const { data, error } = await supabase.rpc('save_subject_assessments', { entries: payload });
            if (error) throw error;
            if (!Array.isArray(data) || data.length !== payload.length)
                throw new Error('Konfirmasi penyimpanan belum lengkap. Muat ulang untuk memeriksa nilai.');
            data.forEach(result => {
                const row = { ...result, ...result.scores };
                state.saved.set(String(row.student_id), row);
                state.drafts.set(String(row.student_id), AssessmentData.draft(row));
            });
            state.lastFailedSave = [];
            if (el('assessmentRetrySave')) el('assessmentRetrySave').hidden = true;
            persistDrafts();
            render();
            message(options.showSummary ? saveSummary(data.length, payload.length) : `${data.length} siswa berhasil disimpan untuk ${AssessmentData.periods[state.context.period]}.`);
            return true;
        } catch (error) {
            state.lastFailedSave = [...students];
            if (el('assessmentRetrySave')) el('assessmentRetrySave').hidden = false;
            persistDrafts();
            message(`Gagal menyimpan: ${error.message}. Draf tetap tersimpan di perangkat. Gunakan Coba Lagi setelah koneksi normal.`, true);
            return false;
        } finally { setBusy(false); }
    }

    function normalizeStudentName(value) {
        return String(value || '').normalize('NFKC').toLocaleLowerCase('id')
            .replace(/[^\p{L}\p{N}]+/gu, ' ').replace(/\s+/g, ' ').trim();
    }
    function parseClipboard(text) {
        return String(text || '').split(/\r?\n/).map(line => line.trim()).filter(Boolean)
            .map(line => line.split(/\t|;/).map(cell => cell.trim()));
    }
    function scoreKeysForSubject(subject) {
        return subject === 'tahsin'
            ? ['tahsin_makhraj','tahsin_tajwid','tahsin_tartil','tahsin_gharib']
            : ['tahfidz_makhraj','tahfidz_tajwid','tahfidz_hafalan'];
    }
    function clipboardPlan(text) {
        const matrix = parseClipboard(text);
        const targets = visible();
        if (!matrix.length) return { rows: [], errors: ['Clipboard kosong.'] };
        const keys = scoreKeysForSubject(state.context?.subject);
        const byName = new Map(targets.map(student => [normalizeStudentName(student['nama siswa']), student]));
        const firstLooksNumeric = matrix[0].every((cell, idx) => idx >= keys.length || cell === '' || !Number.isNaN(Number(String(cell).replace(',', '.'))));
        const rows = [], errors = [];
        matrix.forEach((cells, rowIndex) => {
            let student, values;
            const first = cells[0] || '';
            const firstNumber = Number(String(first).replace(',', '.'));
            const hasName = Number.isNaN(firstNumber) || cells.length > keys.length;
            if (hasName) {
                student = byName.get(normalizeStudentName(first));
                values = cells.slice(1);
                if (!student) { errors.push(`Baris ${rowIndex + 1}: nama "${first}" tidak ditemukan pada kelas yang tampil.`); return; }
            } else {
                student = targets[rowIndex];
                values = cells;
                if (!student) { errors.push(`Baris ${rowIndex + 1}: jumlah baris melebihi siswa yang tampil.`); return; }
            }
            const draft = state.drafts.get(String(student.id));
            const applicable = state.context.subject === 'tahsin' && window.ReportCore ? new Set(ReportCore.applicable(draft, 'tahsin').keys) : new Set(keys);
            const changes = [];
            keys.forEach((field, idx) => {
                if (!applicable.has(field)) return;
                const raw = String(values[idx] ?? '').trim();
                if (raw === '') return;
                const value = Number(raw.replace(',', '.'));
                if (!Number.isFinite(value) || value < 0 || value > 100) {
                    errors.push(`Baris ${rowIndex + 1}: nilai ${raw} tidak valid untuk ${AssessmentData.scores[field]}.`);
                    return;
                }
                changes.push({ field, value: String(value) });
            });
            if (changes.length) rows.push({ student, changes });
        });
        return { rows, errors, matrix, firstLooksNumeric };
    }
    function ensurePasteDialog() {
        let dialog = el('assessmentPasteDialog');
        if (dialog) return dialog;
        dialog = document.createElement('dialog');
        dialog.id = 'assessmentPasteDialog';
        dialog.className = 'assessment-paste-dialog';
        dialog.innerHTML = `<div class="assessment-paste-shell">
            <header><h3>Tempel nilai dari Excel</h3><p>Salin sel nilai dari Excel lalu tempel di bawah. Bisa memakai urutan siswa yang sedang tampil, atau sertakan nama siswa di kolom pertama. Fitur ini hanya mengisi angka nilai dan tidak mengubah capaian akhir.</p></header>
            <textarea id="assessmentPasteText" spellcheck="false" placeholder="Contoh tanpa nama:&#10;85&#9;88&#9;90&#10;80&#9;82&#9;87&#10;&#10;Contoh dengan nama:&#10;Ahmad Fauzan&#9;85&#9;88&#9;90"></textarea>
            <div id="assessmentPastePreview" class="assessment-paste-preview">Tempel data untuk melihat pratinjau.</div>
            <div class="assessment-paste-actions"><button id="assessmentPasteCancel" type="button" class="secondary-action">Batal</button><button id="assessmentPasteApply" type="button" class="primary-action" disabled>Terapkan ke Draf</button></div>
        </div>`;
        document.body.append(dialog);
        const update = () => {
            const plan = clipboardPlan(el('assessmentPasteText').value);
            dialog._gmPlan = plan;
            const preview = el('assessmentPastePreview');
            preview.innerHTML = `${plan.rows.length ? `<strong>${plan.rows.length} siswa siap diisi.</strong>` : '<strong>Belum ada nilai yang siap diterapkan.</strong>'}
                ${plan.errors.length ? `<div style="margin-top:6px">${plan.errors.slice(0,8).map(e => `• ${escape(e)}`).join('<br>')}${plan.errors.length > 8 ? `<br>• dan ${plan.errors.length-8} peringatan lain` : ''}</div>` : '<div style="margin-top:6px">Tidak ada masalah yang terdeteksi.</div>'}`;
            el('assessmentPasteApply').disabled = !plan.rows.length;
        };
        el('assessmentPasteText').addEventListener('input', update);
        el('assessmentPasteCancel').addEventListener('click', () => dialog.close());
        el('assessmentPasteApply').addEventListener('click', () => {
            const plan = dialog._gmPlan || clipboardPlan(el('assessmentPasteText').value);
            for (const row of plan.rows) {
                const draft = state.drafts.get(String(row.student.id));
                row.changes.forEach(change => { draft[change.field] = change.value; if (change.field === 'tahfidz_hafalan') draft.tahfidz_aspect_confirmed = 'true'; });
            }
            scheduleDraftSave();
            render({ preserveLimit: false });
            message(`${plan.rows.length} siswa diperbarui dari clipboard sebagai draf. Periksa hasil lalu tekan Simpan.`);
            dialog.close();
        });
        return dialog;
    }
    async function openPasteDialog() {
        if (!state.context || !visible().length) { message('Pilih kelas dan muat siswa terlebih dahulu sebelum menempel nilai.', true); return; }
        const dialog = ensurePasteDialog();
        el('assessmentPasteText').value = '';
        el('assessmentPastePreview').textContent = 'Tempel data untuk melihat pratinjau.';
        el('assessmentPasteApply').disabled = true;
        dialog.showModal?.();
        setTimeout(() => el('assessmentPasteText')?.focus(), 50);
    }

    async function ensureXlsx() {
        if (window.XLSX) return window.XLSX;
        if (!document.createElement) throw Error('Export Excel tidak tersedia pada perangkat ini.');
        await new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = '/js/vendor/xlsx.full.min.js';
            script.onload = resolve;
            script.onerror = () => reject(Error('Modul Excel gagal dimuat. Periksa koneksi lalu coba lagi.'));
            document.head.appendChild(script);
        });
        if (!window.XLSX) throw Error('Modul Excel belum siap.');
        return window.XLSX;
    }
    function exportRows() {
        const scope = el('assessmentExportScope')?.value || 'view';
        if (scope === 'all') return [...state.students];
        const kelas = el('assessmentClass')?.value;
        if (scope === 'class') return state.students.filter(student => student.kelas === kelas);
        return visible();
    }
    async function exportExcel() {
        if (!state.context || !state.students.length) { message('Muat penilaian terlebih dahulu sebelum export Excel.', true); return; }
        const list = exportRows();
        if (!list.length) { message('Tidak ada siswa pada cakupan export yang dipilih.', true); return; }
        const button = el('assessmentExport');
        if (button) { button.disabled = true; button.textContent = 'Menyiapkan Excel...'; }
        try {
            const XLSX = await ensureXlsx();
            const subject = state.context.subject;
            const data = list.map((student, index) => {
                const draft = state.drafts.get(String(student.id));
                const stats = ReportCore.stats(draft, subject);
                const issue = issueDetail(student);
                const base = { No: index + 1, 'Nama Siswa': student['nama siswa'], Kelas: classLabel(student.kelas), Status: issue.reason || 'Tersimpan' };
                const excelValue = value => value === '' || value == null ? '' : value;
                if (subject === 'tahsin') Object.assign(base, {
                    'Makhorijul Huruf': excelValue(draft.tahsin_makhraj), Tajwid: excelValue(draft.tahsin_tajwid), 'Tartil/Kelancaran': excelValue(draft.tahsin_tartil), 'Gharib Musykilat': excelValue(draft.tahsin_gharib),
                    'Capaian Akhir': ReportCore.progress(draft, 'tahsin')
                });
                else Object.assign(base, {
                    'Makhorijul Huruf': excelValue(draft.tahfidz_makhraj), Tajwid: excelValue(draft.tahfidz_tajwid), 'Tartil/Kelancaran': excelValue(draft.tahfidz_hafalan),
                    'Capaian Akhir': ReportCore.progress(draft, 'tahfidz')
                });
                base.Jumlah = stats.sum ?? '';
                base['Rata-rata'] = stats.average == null ? '' : Number(stats.average.toFixed(2));
                base.Grade = stats.grade;
                return base;
            });
            const sheet = XLSX.utils.json_to_sheet(data);
            sheet['!cols'] = Object.keys(data[0]).map(key => ({ wch: Math.min(45, Math.max(12, key.length + 3, ...data.slice(0, 80).map(row => String(row[key] ?? '').length + 2))) }));
            const workbook = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(workbook, sheet, state.context.subject.toUpperCase());
            const scopeLabel = el('assessmentExportScope')?.value === 'all' ? 'Semua Siswa' : (el('assessmentClass')?.value || 'Tampilan Saat Ini');
            const fileName = window.GMFileName?.assessment?.({ subject: state.context.subject, scope: classLabel(scopeLabel), period: state.context.period, year: state.context.year })
                || `Penilaian ${state.context.subject.toUpperCase()} - ${scopeLabel} - ${state.context.period} - ${state.context.year}-${state.context.year + 1}.xlsx`;
            XLSX.writeFile(workbook, fileName);
            message(`Excel berhasil dibuat untuk ${list.length} siswa.`);
        } catch (error) { message(`Export Excel gagal: ${error.message}`, true); }
        finally { if (button) { button.disabled = false; button.textContent = 'Export Excel'; } }
    }

    async function refreshSubjectTeachers() {
        const subject = el('assessmentSubject').value || 'tahsin';
        const previous = el('assessmentTeacher').value;
        const year = Number(el('assessmentYear').value);
        const assignmentCacheKey = `${SESSION_CACHE.assignments}:${year}:${subject}`;
        let assignmentRows = readSession(assignmentCacheKey, 5 * 60 * 1000);
        if (!assignmentRows) {
            assignmentRows = await fetchAllRows(() => supabase.from('teaching_assignments')
                .select('teacher_id').eq('subject', subject).eq('active', true)
                .eq('academic_year_start', year));
            writeSession(assignmentCacheKey, assignmentRows);
        }
        const ids = new Set(assignmentRows.map(row => String(row.teacher_id)));
        const eligible = state.teachers.filter(row => ids.has(String(row.id)) && (subject !== 'tahsin' || row.attendance_enabled !== false));
        el('assessmentTeacher').replaceChildren(new Option('Pilih guru', ''));
        eligible.forEach(row => el('assessmentTeacher').add(new Option(row.nama, row.id)));
        const wanted = AppAccess.teacher?.() ? String(AppAccess.profile.teacher_id) : (previous || String(AppAccess.profile.teacher_id || ''));
        if (eligible.some(row => String(row.id) === wanted)) el('assessmentTeacher').value = wanted;
        else el('assessmentTeacher').value = '';
        el('assessmentTeacher').disabled = !AppAccess.full();
        const teacherLabel = el('assessmentTeacher').closest?.('label');
        if (teacherLabel) teacherLabel.hidden = !AppAccess.full();
        return Boolean(el('assessmentTeacher').value);
    }

    async function applyStoredFilter(filter, { loadData = true } = {}) {
        if (!filter) return false;
        el('assessmentYear').value = String(filter.year || el('assessmentYear').value);
        el('assessmentPeriod').value = filter.period || el('assessmentPeriod').value;
        el('assessmentSubject').value = filter.subject || el('assessmentSubject').value;
        state.lastSubject = el('assessmentSubject').value;
        yearLabel();
        await refreshSubjectTeachers();
        if (filter.teacherId && [...el('assessmentTeacher').options].some(option => String(option.value) === String(filter.teacherId))) el('assessmentTeacher').value = String(filter.teacherId);
        state.pendingWorkspaceFilter = filter;
        if (loadData && el('assessmentTeacher').value) return load({ preferredFilter: filter });
        return true;
    }

    async function open() {
        if (state.busy) return;
        if (state.initialized) {
            state.busy = true;
            try {
                if (window.ReportCore) await loadReportReferenceCached();
                state.teachers = await loadTeachersCached();
                await refreshSubjectTeachers();
                refreshFavoriteButtons();
            } catch (error) { message(error.message, true); }
            finally { state.busy = false; }
            return;
        }
        state.busy = true;
        message('Memuat daftar guru...');
        try {
            await AppAccess.ready;
            if (window.ReportCore) await loadReportReferenceCached();
            state.teachers = await loadTeachersCached();
            const now = new Date(), month = now.getMonth() + 1;
            const smartPeriod = month >= 11 ? 'pas_ganjil' : month >= 7 ? 'pts_ganjil' : month >= 4 ? 'pas_genap' : 'pts_genap';
            const fallback = { year: now.getFullYear() - (now.getMonth() < 6 ? 1 : 0), period: smartPeriod, subject: 'tahsin' };
            const last = readStorage(STORAGE.last, fallback) || fallback;
            el('assessmentYear').value = String(last.year || fallback.year);
            el('assessmentPeriod').value = last.period || fallback.period;
            el('assessmentSubject').value = last.subject || 'tahsin';
            state.lastSubject = el('assessmentSubject').value;
            yearLabel();
            await refreshSubjectTeachers();
            if (last.teacherId && [...el('assessmentTeacher').options].some(option => String(option.value) === String(last.teacherId))) el('assessmentTeacher').value = String(last.teacherId);
            state.pendingWorkspaceFilter = last;
            el('assessmentScopeNote').textContent = AppAccess.full() ? 'Daftar siswa mengikuti anggota kelompok pelajaran yang aktif. Filter terakhir disimpan di perangkat.' : 'Hanya siswa dari kelompok pelajaran Anda. Filter terakhir disimpan di perangkat.';
            state.initialized = true;
            refreshFavoriteButtons();
            draftStatus('Autosave draf sementara aktif di perangkat ini.', 'clean');
            message('Pilih pelajaran, guru, dan periode untuk memuat kelas.');
        } catch (error) { message(error.message, true); }
        finally { state.busy = false; }
    }

    async function openAttention(options = {}) {
        for (let i = 0; i < 120 && state.busy; i++) await new Promise(resolve => setTimeout(resolve, 25));
        if (!state.initialized) await open();
        for (let i = 0; i < 120 && state.busy; i++) await new Promise(resolve => setTimeout(resolve, 25));
        const year = Number(options.year || (new Date().getFullYear() - (new Date().getMonth() < 6 ? 1 : 0)));
        el('assessmentYear').value = String(year);
        yearLabel();
        el('assessmentSubject').value = options.subject || 'tahsin';
        state.lastSubject = el('assessmentSubject').value;
        await refreshSubjectTeachers();
        if (AppAccess.full() && options.teacherId && [...el('assessmentTeacher').options].some(option => String(option.value) === String(options.teacherId))) el('assessmentTeacher').value = String(options.teacherId);
        el('assessmentPeriod').value = options.period || 'pts_ganjil';
        await load();
        if (options.className && state.students.some(student => student.kelas === options.className)) el('assessmentClass').value = options.className;
        el('assessmentSearch').value = options.studentName || '';
        state.problemOnly = Boolean(options.problemOnly);
        state.page = 1;
        render();
        return true;
    }

    function yearLabel() { const year = Number(el('assessmentYear').value); el('assessmentYearLabel').textContent = `Tahun ajaran ${year}/${year + 1}`; }

    async function confirmLeave() {
        if (!dirtyStudents().length) return true;
        const decision = await chooseUnsaved('Anda akan meninggalkan halaman Penilaian Periodik. Simpan sekarang ke database, atau keluar dengan draf tetap tersimpan di perangkat ini.');
        return decision === 'continue';
    }

    ((callback) => window.GMPanel ? GMPanel.onReady(callback) : document.addEventListener('panelready', callback))( () => {
        el('assessmentLoadForm').addEventListener('submit', event => { event.preventDefault(); return load(); });
        el('assessmentYear').addEventListener('input', () => { yearLabel(); rememberLastFilter(); refreshSubjectTeachers().catch(error => message(error.message, true)); });
        el('assessmentPeriod').addEventListener('change', rememberLastFilter);
        el('assessmentTeacher').addEventListener('change', rememberLastFilter);
        el('assessmentSubject').addEventListener('change', async () => {
            const next = el('assessmentSubject').value;
            const previous = state.context?.subject || state.lastSubject || 'tahsin';
            if (state.context && next !== previous && dirtyStudents().length) {
                const decision = await chooseUnsaved('Anda akan mengganti pelajaran. Simpan sekarang ke database, atau lanjutkan dengan draf tetap tersimpan di perangkat.');
                if (decision !== 'continue') { el('assessmentSubject').value = previous; return; }
            }
            state.lastSubject = next;
            el('assessmentWorkspace').hidden = true;
            state.students = []; state.saved.clear(); state.drafts.clear(); state.context = null; state.problemOnly = false;
            rememberLastFilter();
            refreshSubjectTeachers().catch(error => message(error.message, true));
        });
        el('assessmentCards').addEventListener('input', event => {
            if (event.target.dataset.surahSearch) {
                if (!event.target.dataset.surahCommit) return;
                const card = event.target.closest('[data-student-index]');
                const student = state.students[Number(card.dataset.studentIndex)];
                if (state.busy || card.dataset.reviewLocked === 'true') return;
                const draft = state.drafts.get(String(student.id));
                const normalize = value => String(value).toLocaleLowerCase('id').replace(/[^a-z0-9]/g, '');
                const query = normalize(event.target.value);
                const row = QURAN_SURAHS.find(row => event.target.dataset.selectedSurah
                    ? String(row.number) === event.target.dataset.selectedSurah
                    : String(row.number) === query || normalize(surahLabel(row.number)) === query || normalize(row.name) === query || (window.ReportCore && normalize(row.number + '. ' + ReportCore.surahName(row.number)) === query));
                const next = row ? String(row.number) : '';
                event.target.setCustomValidity(row ? '' : 'Pilih nama surat dari saran yang muncul.');
                if (draft.tahfidz_surah !== next) {
                    draft.tahfidz_surah = next;
                    draft.tahfidz_ayah = '';
                    if (window.ReportCore) {
                        draft.tahfidz_ayah_start = '1';
                        const start = card.querySelector('[data-field="tahfidz_ayah_start"]');
                        if (start) start.value = '1';
                    }
                    card.querySelector('[data-field="tahfidz_ayah"]').innerHTML = optionsAyah(next, '');
                }
                scheduleDraftSave(); summaries(); return;
            }
            const field = event.target.dataset.field;
            if (!field || !AssessmentData.fields.includes(field) || state.busy) return;
            const card = event.target.closest('[data-student-index]');
            const student = state.students[Number(card.dataset.studentIndex)];
            const draft = state.drafts.get(String(student.id));
            draft[field] = event.target.value;
            if (field === 'tahfidz_hafalan') draft.tahfidz_aspect_confirmed = 'true';
            if (window.ProgressForm && ProgressForm.changed(draft, field)) {
                scheduleDraftSave();
                render({ focusField: field, studentIndex: Number(card.dataset.studentIndex) });
                return;
            }
            if (field === 'tahfidz_surah') {
                draft.tahfidz_ayah = '';
                if (window.ReportCore) {
                    draft.tahfidz_ayah_start = '1';
                    const start = card.querySelector('[data-field="tahfidz_ayah_start"]');
                    if (start) start.value = '1';
                }
                card.querySelector('[data-field="tahfidz_ayah"]').innerHTML = optionsAyah(draft.tahfidz_surah, '');
            }
            scheduleDraftSave(); summaries();
        });
        el('assessmentCards').addEventListener('keydown', event => {
            const target = event.target;
            if (!target.matches('input, select, textarea')) return;
            if (event.key === 'Enter' && !event.shiftKey && !event.ctrlKey && !event.metaKey) {
                event.preventDefault();
                // Pada mobile, Enter/Next selalu berpindah ke field berikutnya; tidak pernah mengirim form.
                const controls = [...el('assessmentCards').querySelectorAll('input:not([disabled]), select:not([disabled]), textarea:not([disabled]), button[type="submit"]:not([disabled])')]
                    .filter(node => node.offsetParent !== null);
                const index = controls.indexOf(target);
                const next = controls[index + 1];
                if (next) {
                    if (next.matches('button[type="submit"]')) {
                        const after = controls[index + 2];
                        (after || next).focus();
                    } else next.focus();
                }
                return;
            }
            // Arrow Up/Down pada select dibiarkan native agar desktop bisa memilih opsi dengan keyboard.
        });
        SurahPicker.bind(el('assessmentCards'));
        el('assessmentCards').addEventListener('submit', event => { event.preventDefault(); const student = state.students[Number(event.target.dataset.studentIndex)]; if (student) return save([student], { showSummary: false }); });
        el('assessmentSaveAll').addEventListener('click', () => save(visible().filter(isDirty), { showSummary: true, source: 'save-all' }));
        el('assessmentRetrySave')?.addEventListener('click', () => save(state.lastFailedSave.filter(Boolean), { showSummary: true, source: 'retry' }));
        ['assessmentClass', 'assessmentSearch'].forEach(id => el(id).addEventListener('input', () => { state.page = 1; render(); }));
        el('assessmentLevel').addEventListener('input', () => { const level = el('assessmentLevel').value; const row = state.students.find(s => !level || classLevel(s.kelas) === level); el('assessmentClass').value = row?.kelas || ''; state.page = 1; render(); });
        el('assessmentProblemOnly')?.addEventListener('click', () => { state.problemOnly = !state.problemOnly; state.page = 1; render(); });
        el('assessmentFavoriteSave')?.addEventListener('click', saveFavorite);
        el('assessmentFavoriteUse')?.addEventListener('click', async () => {
            const favorite = readStorage(STORAGE.favorite);
            if (!favorite) return;
            if (dirtyStudents().length) {
                const decision = await chooseUnsaved('Anda akan membuka filter favorit. Simpan sekarang ke database, atau lanjutkan dengan draf tetap tersimpan di perangkat.');
                if (decision !== 'continue') return;
            }
            await applyStoredFilter(favorite, { loadData: true });
        });
        el('assessmentExport')?.addEventListener('click', exportExcel);
        el('assessmentPasteExcel')?.addEventListener('click', openPasteDialog);
        const movePeriod = amount => {
            const order = ['pts_ganjil','pas_ganjil','pts_genap','pas_genap'];
            const current = order.indexOf(el('assessmentPeriod').value);
            const next = Math.max(0, Math.min(order.length - 1, current + amount));
            if (next === current) return;
            el('assessmentPeriod').value = order[next];
            rememberLastFilter();
        };
        el('assessmentPeriodPrev')?.addEventListener('click', () => movePeriod(-1));
        el('assessmentPeriodNext')?.addEventListener('click', () => movePeriod(1));
        el('assessmentRuleHelp')?.addEventListener('click', () => {
            const pop = el('assessmentRuleHelpText'), btn = el('assessmentRuleHelp');
            if (!pop) return;
            pop.hidden = !pop.hidden;
            btn?.setAttribute('aria-expanded', String(!pop.hidden));
        });
        el('assessmentMobileSave')?.addEventListener('click', () => save(visible().filter(isDirty), { showSummary: true, source: 'mobile-save' }));
        el('assessmentMobileProblems')?.addEventListener('click', () => {
            state.problemOnly = !state.problemOnly; state.page = 1; render();
        });
        el('assessmentPrev').addEventListener('click', () => { state.page--; render(); });
        el('assessmentNext').addEventListener('click', () => { state.page++; render(); });
        refreshFavoriteButtons();
    });

    window.addEventListener('beforeunload', event => {
        if (dirtyStudents().length) {
            persistDrafts();
            event.preventDefault();
            event.returnValue = '';
        }
    });

    return {
        open, openAttention, classLabel, confirmLeave,
        hasUnsavedChanges: () => dirtyStudents().length > 0,
        persistDrafts,
        problemCount: () => problemStudents().length
    };
})();
