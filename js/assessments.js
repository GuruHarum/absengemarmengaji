window.PeriodicAssessments = (() => {
    const state = {
        initialized: false, busy: false, context: null, teachers: [], students: [], saved: new Map(), drafts: new Map(), page: 1,
        problemOnly: false, teacherRequestId: 0, eligibleTeachers: [], lastFailedSave: [], lastSubject: 'tahsin', pendingWorkspaceFilter: null, draftTimer: null,
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
    const storageScope = () => String(AppAccess?.profile?.userId || AppAccess?.profile?.email || 'anonymous');
    const scopedKey = key => `${key}:${storageScope()}`;
    function readStorage(key, fallback = null) {
        if (!storageAvailable()) return fallback;
        try {
            const raw = localStorage.getItem(scopedKey(key));
            if (raw) return JSON.parse(raw);
            // Pulihkan draf pengguna lama yang dahulu disimpan dengan ID guru,
            // tetapi pindahkan ke penyimpanan yang terikat akun Auth saat ini.
            const profile = AppAccess?.profile;
            const oldScope = AppAccess?.teacher?.() ? String(profile?.teacher_id || '') : String(profile?.email || '');
            if (key === STORAGE.drafts && oldScope && oldScope !== storageScope()) {
                const previousKey = key + ':' + oldScope;
                const previousRaw = localStorage.getItem(previousKey);
                if (previousRaw) {
                    const previous = JSON.parse(previousRaw);
                    if (previous && typeof previous === 'object' && !Array.isArray(previous)) {
                        const selected = {};
                        for (const [name,bucket] of Object.entries(previous)) {
                            if (!AppAccess?.teacher?.() ||
                                String(bucket?.context?.teacherId || '') === String(profile?.teacher_id || '')) selected[name] = bucket;
                        }
                        if (Object.keys(selected).length && writeStorage(key, selected)) {
                            localStorage.removeItem(previousKey);
                            return selected;
                        }
                    }
                }
            }
            return fallback;
        } catch (_) { return fallback; }
    }
    function writeStorage(key, value) {
        if (!storageAvailable()) return false;
        try { localStorage.setItem(scopedKey(key), JSON.stringify(value)); return true; }
        catch (_) { return false; }
    }
    function removeStorage(key) {
        if (!storageAvailable()) return false;
        try { localStorage.removeItem(scopedKey(key)); return true; } catch (_) { return false; }
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
            status: el('assessmentStatusFilter')?.value || 'all',
            search: el('assessmentSearch')?.value.trim() || '',
            problemOnly: el('assessmentStatusFilter')?.value === 'problem'
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
            if (!writeStorage(STORAGE.drafts, store)) {
                draftStatus('PERINGATAN: draf belum aman. Penyimpanan perangkat gagal atau penuh. Simpan nilai ke database sebelum keluar.', 'error');
                return false;
            }
            const now = new Date();
            draftStatus(`Draf belum dikirim, tersimpan di perangkat · ${now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}`, 'saved');
        } else {
            delete store[key];
            if (!writeStorage(STORAGE.drafts, store)) {
                draftStatus('Nilai sudah sesuai database; penyimpanan lokal tidak tersedia.', 'error');
            } else {
                draftStatus('Tidak ada draf tertunda. Nilai tersimpan di database atau belum diisi.', 'clean');
            }
        }
        return true;
    }
    function scheduleDraftSave() {
        if (window.clearTimeout && state.draftTimer) window.clearTimeout(state.draftTimer);
        if (window.setTimeout) state.draftTimer = window.setTimeout(persistDrafts, 450);
        else persistDrafts();
    }
    async function clearLocalDrafts() {
        if (state.busy) return;
        const pending = dirtyStudents().length;
        const confirmed = await AdminNotice.confirm(
            `Hapus semua draf penilaian di perangkat untuk akun ini?${pending ? ` ${pending} perubahan yang belum masuk database ikut dibatalkan.` : ''} Nilai database tetap aman.`);
        if (!confirmed) return;
        if (!removeStorage(STORAGE.drafts)) {
            draftStatus('Draf gagal dihapus. Periksa izin penyimpanan perangkat.', 'error');
            return;
        }
        try {
            const profile = AppAccess?.profile;
            const legacy = AppAccess?.teacher?.() ? String(profile?.teacher_id || '') : String(profile?.email || '');
            if (legacy && legacy !== storageScope()) localStorage.removeItem(STORAGE.drafts + ':' + legacy);
        } catch (_) { /* Browser mungkin memblokir storage. */ }
        if (state.draftTimer) { clearTimeout(state.draftTimer); state.draftTimer = null; }
        if (state.context) {
            state.drafts = new Map(state.students.map(student => [String(student.id),
                AssessmentData.draft(state.saved.get(String(student.id)))]));
            state.lastFailedSave = [];
            if (el('assessmentRetrySave')) el('assessmentRetrySave').hidden = true;
            render();
        }
        draftStatus('Draf lokal akun telah dihapus. Nilai database tidak berubah.', 'clean');
        message('Draf perangkat berhasil dibersihkan. Nilai database tetap aman.');
        AdminNotice.notify('Draf lokal akun berhasil dihapus.', 'success');
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
        if (restored || skipped) draftStatus(`${restored} draf sementara dipulihkan dari perangkat.${skipped ? ` ${skipped} draf dilewati karena data database sudah berubah (tidak ditimpa).` : ''}`, skipped ? 'error' : 'restored');
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
        ['assessmentSaveAll', 'assessmentRetrySave', 'assessmentLevel', 'assessmentSearch', 'assessmentStatusFilter', 'assessmentExport', 'assessmentExportScope', 'assessmentFavoriteSave', 'assessmentFavoriteUse', 'assessmentPasteExcel', 'assessmentPeriodPrev', 'assessmentPeriodNext', 'assessmentMobileSave', 'assessmentMobileProblems'].forEach(id => { if (el(id)) el(id).disabled = busy || (id === 'assessmentFavoriteUse' && !readStorage(STORAGE.favorite)); });
        if (el('assessmentSaveAll')) el('assessmentSaveAll').textContent = busy ? 'Menyimpan / memuat...' : 'Simpan semua perubahan tingkat ini';
        pagination();
    }

    // Tingkat kelas mencakup seluruh rombel guru, tidak hanya satu kelas bernama.
    const gradeStudents = () => {
        const grade = el('assessmentLevel')?.value || '';
        return state.students.filter(student => !grade || classLevel(student.kelas) === grade);
    };
    const dirtyInGrade = () => gradeStudents().filter(isDirty);
    function statusOf(student) {
        const saved = state.saved.get(String(student.id));
        if (saved?.needs_review) return 'review';
        if (isDirty(student)) return 'draft';
        if (!saved) return 'ungraded';
        return issueDetail(student).problem ? 'incomplete' : 'saved';
    }
    function visible() {
        const search = el('assessmentSearch')?.value.trim().toLocaleLowerCase('id') || '';
        const filter = el('assessmentStatusFilter')?.value || 'all';
        return gradeStudents().filter(student =>
            String(student['nama siswa'] || '').toLocaleLowerCase('id').includes(search) &&
            (filter === 'all' || (filter === 'problem' ? issueDetail(student).problem : statusOf(student) === filter)));
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
        if (el('assessmentPageInfo')) el('assessmentPageInfo').textContent = (el('assessmentLevel')?.value ? 'Tingkat ' + el('assessmentLevel').value : 'Semua tingkat') + ' · ' + rows.length + ' dari ' + gradeStudents().length + ' siswa';
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
        const group = gradeStudents();
        const count = { saved: 0, draft: 0, ungraded: 0, incomplete: 0, review: 0 };
        group.forEach(student => { count[statusOf(student)] += 1; });
        const completedPct = group.length ? Math.round(100 * count.saved / group.length) : 0;
        if (el('assessmentProgressText')) el('assessmentProgressText').textContent =
            `${count.saved} dari ${group.length} siswa tingkat ini tersimpan lengkap di database`;
        if (el('assessmentProgressPct')) el('assessmentProgressPct').textContent = `${completedPct}%`;
        if (el('assessmentProgressFill')) el('assessmentProgressFill').style.width = completedPct + '%';
        if (el('assessmentProgressBar')) el('assessmentProgressBar').setAttribute('aria-valuenow', String(completedPct));
        for (const [key,id] of [['saved','assessmentSaved'],['draft','assessmentDirty'],['ungraded','assessmentUnrated'],['incomplete','assessmentIncomplete'],['review','assessmentProblems']])
            if (el(id)) el(id).textContent = count[key];
        if (el('assessmentTotal')) el('assessmentTotal').textContent = group.length;
        if (el('assessmentMobileStatus')) {
            const pending = count.draft + count.incomplete + count.review;
            el('assessmentMobileStatus').textContent = count.draft ? count.draft + ' draf belum dikirim' :
                (pending ? pending + ' perlu dicek' : count.saved + '/' + group.length + ' tersimpan');
        }
        el('assessmentCards')?.querySelectorAll('[data-student-index]').forEach(card => {
            const student = state.students[Number(card.dataset.studentIndex)];
            if (!student) return;
            const badge = card.querySelector('.assessment-state');
            const summary = card.querySelector('[data-report-summary]');
            if (summary && window.ReportCore) {
                const scores = state.drafts.get(String(student.id));
                const totals = ReportCore.stats(scores, state.context.subject);
                summary.textContent = `Jumlah: ${totals.sum ?? '-'} · Rata-rata: ${totals.average == null ? '-' : totals.average.toFixed(1).replace('.', ',')} · Grade: ${totals.grade}${totals.complete ? '' : ' · BELUM LENGKAP'}`;
            }
            const status = statusOf(student);
            badge.textContent = { saved:'Tersimpan', draft:'Draf belum dikirim', ungraded:'Belum dinilai', incomplete:'Belum lengkap', review:'Perlu verifikasi' }[status];
            badge.dataset.dirty = String(status === 'draft');
            badge.dataset.state = status;
            card.dataset.problem = String(status !== 'saved');
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
            }).join('') : `<div class="assessment-empty">${gradeStudents().length ? 'Tidak ada siswa yang cocok dengan pencarian/status.' : 'Belum ada murid pada tingkat ini.'}</div>`;
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
        const draftSafe = persistDrafts();
        const count = dirtyStudents().length;
        if (!count) return 'continue';
        if (!draftSafe) {
            const saveNow = await AdminNotice.confirm('Penyimpanan draf perangkat gagal. Nilai akan hilang bila keluar tanpa menyimpan ke database. Simpan sekarang?');
            if (!saveNow) return 'cancel';
            return (await save(dirtyStudents(), { showSummary: true, source: 'leave-storage-failed' })) ? 'continue' : 'cancel';
        }
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
            state.students = students.sort((a, b) =>
                Number(classLevel(a.kelas) || 999) - Number(classLevel(b.kelas) || 999) ||
                String(a['nama siswa']).localeCompare(String(b['nama siswa']), 'id') ||
                String(a.kelas).localeCompare(String(b.kelas), 'id', { numeric: true }));
            state.saved = new Map(saved.map(row => [String(row.student_id), { ...row, ...row.scores }]));
            state.drafts = new Map(students.map(student => [String(student.id), AssessmentData.draft(state.saved.get(String(student.id)))]));
            state.lastFailedSave = [];
            if (el('assessmentRetrySave')) el('assessmentRetrySave').hidden = true;
            const restored = restoreDrafts();
            state.page = 1;
            el('assessmentLevel').replaceChildren(new Option('Semua tingkat', ''));
            [...new Set(students.map(row => classLevel(row.kelas)).filter(Boolean))].sort((a, b) => Number(a) - Number(b)).forEach(level => el('assessmentLevel').add(new Option(`Kelas ${level}`, level)));
            const preferred = options.preferredFilter || state.pendingWorkspaceFilter || readStorage(STORAGE.last, {});
            const sameContext = preferred && Number(preferred.year) === context.year && preferred.period === context.period && preferred.subject === context.subject && String(preferred.teacherId || '') === String(context.teacherId);
            const gradeOptions = [...el('assessmentLevel').options].map(option => option.value);
            const savedGrade = preferred?.level || classLevel(preferred?.className);
            el('assessmentLevel').value = sameContext && gradeOptions.includes(savedGrade) ? savedGrade : '';
            const savedStatus = sameContext ? (preferred.status || (preferred.problemOnly ? 'problem' : 'all')) : 'all';
            el('assessmentStatusFilter').value = [...el('assessmentStatusFilter').options].some(o => o.value === savedStatus) ? savedStatus : 'all';
            el('assessmentSearch').value = sameContext ? String(preferred.search || '') : '';
            state.problemOnly = el('assessmentStatusFilter').value === 'problem';
            el('assessmentActivePeriod').textContent = `${context.year}/${context.year + 1} · ${AssessmentData.periods[context.period]} · ${teacher.nama} / ${context.subject.toUpperCase()}`;
            el('assessmentWorkspace').hidden = false;
            if (el('assessmentPendingFilter')) el('assessmentPendingFilter').hidden = true;
            state.pendingWorkspaceFilter = null;
            if (el('assessmentSaveSummary')) el('assessmentSaveSummary').hidden = true;
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
        const gradeRows = gradeStudents();
        const problems = gradeRows.filter(student => issueDetail(student).problem).length;
        const dirty = gradeRows.filter(isDirty).length;
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
        const payload = [], invalid = [];
        for (const student of students) {
            try {
                payload.push(AssessmentData.payload(state.context, student,
                    state.drafts.get(String(student.id)), state.saved.get(String(student.id))));
            } catch (error) {
                invalid.push({ student, reason: error.message });
            }
        }
        if (invalid.length) {
            state.lastFailedSave = students;
            if (el('assessmentRetrySave')) el('assessmentRetrySave').hidden = false;
            // Validasi semua siswa terlebih dahulu: tidak ada sebagian nilai
            // yang dikirim tanpa pengetahuan guru.
            const first = invalid[0].student;
            el('assessmentLevel').value = classLevel(first.kelas);
            el('assessmentSearch').value = '';
            el('assessmentStatusFilter').value = 'all';
            state.page = 1;
            render();
            const summary = el('assessmentSaveSummary');
            if (summary) {
                summary.hidden = false;
                summary.innerHTML = `<strong>${invalid.length} siswa perlu diperbaiki. Belum ada nilai yang dikirim.</strong><span>${invalid.slice(0, 5).map(row =>
                    escape(row.student['nama siswa']) + ': ' + escape(row.reason)).join(' • ')}${invalid.length > 5 ? ' • dan ' + (invalid.length - 5) + ' siswa lainnya' : ''}</span>`;
            }
            message(`Tidak dapat menyimpan. ${invalid.length} siswa perlu diperiksa, termasuk ${first['nama siswa']}: ${invalid[0].reason}. Semua draf tetap tersedia.`, true);
            persistDrafts();
            return false;
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
            if (!options.showSummary && el('assessmentSaveSummary')) el('assessmentSaveSummary').hidden = true;
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
        const errors = [], rows = [];
        if (!matrix.length) return { rows, errors: ['Clipboard kosong.'] };
        if (matrix.length > 1000) return { rows, errors: ['Maksimal 1000 baris sekali tempel.'] };
        const keys = scoreKeysForSubject(state.context?.subject);
        const byName = new Map(), byId = new Map(targets.map(student => [String(student.id), student]));
        for (const student of targets) {
            const key = normalizeStudentName(student['nama siswa']);
            byName.set(key, [...(byName.get(key) || []), student]);
        }
        const used = new Set();
        matrix.forEach((cells, index) => {
            const first = String(cells[0] || '').trim();
            const number = Number(first.replace(',', '.'));
            const hasIdentity = !first || !Number.isFinite(number) || cells.length > keys.length;
            let student, values = cells;
            if (hasIdentity) {
                const idMatch = first.match(/^(?:#|ID\s*[:#]\s*)(\d+)$/i);
                const matchingId = idMatch ? idMatch[1] : (/^\d+$/.test(first) ? first : null);
                if (matchingId && byId.has(matchingId)) {
                    student = byId.get(matchingId);
                } else {
                    const matches = byName.get(normalizeStudentName(first)) || [];
                    if (matches.length > 1) {
                        errors.push(`Baris ${index + 1}: nama "${first}" ditemukan lebih dari sekali. Gunakan ID siswa (#ID).`);
                        return;
                    }
                    student = matches[0];
                }
                values = cells.slice(1);
                if (!student) {
                    errors.push(`Baris ${index + 1}: siswa "${first}" tidak ditemukan pada tingkat dan filter saat ini.`);
                    return;
                }
            } else {
                student = targets[index];
                if (!student) {
                    errors.push(`Baris ${index + 1}: jumlah baris melebihi hasil filter siswa.`);
                    return;
                }
            }
            if (used.has(String(student.id))) {
                errors.push(`Baris ${index + 1}: siswa "${student['nama siswa']}" terulang dalam data tempelan.`);
                return;
            }
            used.add(String(student.id));
            const draft = state.drafts.get(String(student.id));
            const applicable = state.context.subject === 'tahsin' && window.ReportCore
                ? new Set(ReportCore.applicable(draft, 'tahsin').keys) : new Set(keys);
            const changes = [];
            keys.forEach((field, idx) => {
                if (!applicable.has(field)) return;
                const raw = String(values[idx] ?? '').trim();
                if (raw === '') return;
                const value = Number(raw.replace(',', '.'));
                if (!Number.isFinite(value) || value < 0 || value > 100 || !/^\d{1,3}([.,]\d{1,2})?$/.test(raw)) {
                    errors.push(`Baris ${index + 1}: nilai "${raw}" tidak valid untuk ${AssessmentData.scores[field]}.`);
                    return;
                }
                changes.push({ field, value: String(value) });
            });
            if (changes.length) rows.push({ student, changes });
            else errors.push(`Baris ${index + 1}: tidak ada nilai yang bisa diterapkan.`);
        });
        return { rows, errors };
    }
    function ensurePasteDialog() {
        let dialog = el('assessmentPasteDialog');
        if (dialog) return dialog;
        dialog = document.createElement('dialog');
        dialog.id = 'assessmentPasteDialog';
        dialog.className = 'assessment-paste-dialog';
        dialog.innerHTML = `<div class="assessment-paste-shell">
            <header><h3>Tempel nilai dari Excel</h3><p>Tempel angka sesuai urutan seluruh hasil filter tingkat/status/pencarian, atau sertakan nama atau ID siswa (#ID) di kolom pertama. Periksa pratinjau; jika ada kesalahan, tidak ada baris yang diterapkan. Capaian akhir tidak berubah.</p></header>
            <textarea id="assessmentPasteText" spellcheck="false" placeholder="Contoh tanpa nama:&#10;85&#9;88&#9;90&#10;80&#9;82&#9;87&#10;&#10;Contoh dengan nama:&#10;Ahmad Fauzan&#9;85&#9;88&#9;90"></textarea>
            <div id="assessmentPastePreview" class="assessment-paste-preview">Tempel nilai untuk memeriksa seluruh baris sebelum diterapkan ke draf.</div>
            <div class="assessment-paste-actions"><button id="assessmentPasteCancel" type="button" class="secondary-action">Batal</button><button id="assessmentPasteApply" type="button" class="primary-action" disabled>Terapkan ke Draf</button></div>
        </div>`;
        document.body.append(dialog);
        const update = () => {
            const plan = clipboardPlan(el('assessmentPasteText').value);
            dialog._gmPlan = plan;
            const preview = el('assessmentPastePreview');
            const examples = plan.rows.slice(0, 8).map(row => escape(row.student['nama siswa']) + ' (' + escape(classLabel(row.student.kelas)) + ')');
            preview.innerHTML = `${plan.rows.length ? `<strong>${plan.rows.length} siswa terdeteksi.</strong>` : '<strong>Belum ada nilai yang siap diterapkan.</strong>'}
                ${examples.length ? '<p>Pratinjau: ' + examples.join(' · ') + (plan.rows.length > 8 ? ' · ...' : '') + '</p>' : ''}
                ${plan.errors.length ? '<strong>' + plan.errors.length + ' kesalahan. Perbaiki seluruhnya sebelum melanjutkan.</strong><div>' +
                    plan.errors.slice(0, 10).map(e => '• ' + escape(e)).join('<br>') +
                    (plan.errors.length > 10 ? '<br>• dan ' + (plan.errors.length - 10) + ' kesalahan lain' : '') + '</div>' :
                    '<p>Semua baris siap diterapkan sebagai draf; belum disimpan ke database.</p>'}`;
            el('assessmentPasteApply').disabled = !plan.rows.length || plan.errors.length > 0;
            el('assessmentPasteApply').textContent = plan.errors.length ? 'Perbaiki kesalahan dulu' : `Terapkan ${plan.rows.length} siswa ke draf`;
        };
        el('assessmentPasteText').addEventListener('input', update);
        el('assessmentPasteCancel').addEventListener('click', () => dialog.close());
        el('assessmentPasteApply').addEventListener('click', () => {
            const plan = clipboardPlan(el('assessmentPasteText').value);
            if (!plan.rows.length || plan.errors.length) {
                message('Tempelan belum dapat diterapkan karena masih ada kesalahan. Periksa pratinjau.', true);
                return;
            }
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
        el('assessmentPasteApply').textContent = 'Terapkan ke Draf';
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
        if (scope === 'level') return gradeStudents();
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
            const includeDrafts = Boolean(el('assessmentExportIncludeDrafts')?.checked);
            const data = list.map((student, index) => {
                const saved = state.saved.get(String(student.id));
                const status = statusOf(student);
                const localDraft = includeDrafts && status === 'draft';
                const scores = localDraft ? state.drafts.get(String(student.id)) :
                    (saved ? AssessmentData.draft(saved) : AssessmentData.draft());
                const hasValues = Boolean(saved || localDraft);
                const stats = hasValues ? ReportCore.stats(scores, subject) : null;
                const labels = { saved: 'Tersimpan di database', draft: 'Draf belum dikirim',
                    ungraded: 'Belum dinilai', incomplete: 'Belum lengkap', review: 'Perlu verifikasi' };
                const base = {
                    No: index + 1,
                    'ID Siswa': String(student.id),
                    'Nama Siswa': student['nama siswa'],
                    Kelas: classLabel(student.kelas),
                    Status: labels[status],
                    'Sumber Nilai': localDraft ? 'Draf perangkat (BELUM MASUK DATABASE)' :
                        (saved ? 'Database' : 'Belum ada nilai')
                };
                const excelValue = value => hasValues && value !== '' && value != null ? value : '';
                if (subject === 'tahsin') Object.assign(base, {
                    'Makhorijul Huruf': excelValue(scores.tahsin_makhraj),
                    Tajwid: excelValue(scores.tahsin_tajwid),
                    'Tartil/Kelancaran': excelValue(scores.tahsin_tartil),
                    'Gharib Musykilat': excelValue(scores.tahsin_gharib),
                    'Capaian Akhir': hasValues ? ReportCore.progress(scores, 'tahsin') : ''
                });
                else Object.assign(base, {
                    'Makhorijul Huruf': excelValue(scores.tahfidz_makhraj),
                    Tajwid: excelValue(scores.tahfidz_tajwid),
                    'Tartil/Kelancaran': excelValue(scores.tahfidz_hafalan),
                    'Capaian Akhir': hasValues ? ReportCore.progress(scores, 'tahfidz') : ''
                });
                base.Jumlah = stats?.sum ?? '';
                base['Rata-rata'] = stats?.average == null ? '' : Number(stats.average.toFixed(2));
                base.Grade = stats?.grade ?? '';
                return base;
            });
            const sheet = XLSX.utils.json_to_sheet(data);
            sheet['!cols'] = Object.keys(data[0]).map(key => ({ wch: Math.min(45, Math.max(12, key.length + 3, ...data.slice(0, 80).map(row => String(row[key] ?? '').length + 2))) }));
            const workbook = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(workbook, sheet, state.context.subject.toUpperCase());
            const scopeLabel = el('assessmentExportScope')?.value === 'all' ? 'Semua Siswa' :
                (el('assessmentExportScope')?.value === 'level' ? (el('assessmentLevel').value ? 'Tingkat ' + el('assessmentLevel').value : 'Seluruh Tingkat') : 'Tampilan Saat Ini');
            const originalName = window.GMFileName?.assessment?.({ subject: state.context.subject, scope: classLabel(scopeLabel), period: state.context.period, year: state.context.year })
                || `Penilaian ${state.context.subject.toUpperCase()} - ${scopeLabel} - ${state.context.period} - ${state.context.year}-${state.context.year + 1}.xlsx`;
            const fileName = includeDrafts ? String(originalName).replace(/\.xlsx$/i, ' - DRAF BELUM DIKIRIM.xlsx') : originalName;
            XLSX.writeFile(workbook, fileName);
            message(`Excel berhasil dibuat untuk ${list.length} siswa. ${includeDrafts ? 'Draf perangkat ditandai dan dibedakan dari database.' : 'Nilai yang diekspor berasal dari database; draf tidak disertakan.'}`);
        } catch (error) { message(`Export Excel gagal: ${error.message}`, true); }
        finally { if (button) { button.disabled = false; button.textContent = 'Export Excel'; } }
    }

    function renderTeacherOptions() {
        const select = el('assessmentTeacher');
        const search = el('assessmentTeacherSearch')?.value.trim().toLocaleLowerCase('id') || '';
        const eligible = state.eligibleTeachers || [];
        const selectedId = String(state.selectedTeacherId || '');
        const matches = eligible.filter(teacher =>
            `${teacher.nama || ''} ${teacher.nama_lengkap || ''}`.toLocaleLowerCase('id').includes(search));
        const selected = eligible.find(teacher => String(teacher.id) === selectedId);
        const visible = selected && !matches.some(teacher => String(teacher.id) === selectedId)
            ? [selected, ...matches] : matches;
        select.replaceChildren(new Option('Pilih guru', ''), ...visible.map(teacher =>
            new Option(teacher.nama_lengkap || teacher.nama, String(teacher.id))));
        select.value = selectedId;
        select.disabled = !AppAccess.full();
        const label = select.closest('label');
        if (label) label.hidden = !AppAccess.full();
        if (el('assessmentTeacherSearch')) el('assessmentTeacherSearch').disabled = !AppAccess.full();
        if (el('assessmentTeacherSearch')) el('assessmentTeacherSearch').hidden = !AppAccess.full();
    }

    async function refreshSubjectTeachers() {
        const sequence = ++state.teacherRequestId;
        const subject = el('assessmentSubject').value || 'tahsin';
        const previous = el('assessmentTeacher').value || state.selectedTeacherId || '';
        const year = Number(el('assessmentYear').value);
        if (!Number.isInteger(year) || year < 2000 || year > 2200) return false;
        const cacheKey = `${SESSION_CACHE.assignments}:${year}:${subject}`;
        let rows = readSession(cacheKey, 5 * 60 * 1000);
        if (!rows) {
            rows = await fetchAllRows(() => supabase.from('teaching_assignments')
                .select('teacher_id').eq('subject', subject).eq('active', true)
                .eq('academic_year_start', year));
            writeSession(cacheKey, rows);
        }
        if (sequence !== state.teacherRequestId) return false;
        const ids = new Set(rows.map(row => String(row.teacher_id)));
        state.eligibleTeachers = state.teachers
            .filter(teacher => ids.has(String(teacher.id)) &&
                (subject !== 'tahsin' || teacher.attendance_enabled !== false))
            .sort((x, y) => String(x.nama_lengkap || x.nama || '').localeCompare(String(y.nama_lengkap || y.nama || ''), 'id'));
        const wanted = AppAccess.teacher() ? String(AppAccess.profile.teacher_id) :
            (previous || String(AppAccess.profile.teacher_id || ''));
        state.selectedTeacherId = state.eligibleTeachers.some(row => String(row.id) === wanted) ? wanted : '';
        renderTeacherOptions();
        markPendingFilter();
        return Boolean(state.selectedTeacherId);
    }

    function markPendingFilter() {
        if (!state.context) return;
        const c = state.context;
        const teacherId = AppAccess.full() ? el('assessmentTeacher').value : AppAccess.profile.teacher_id;
        const changed = c.year !== Number(el('assessmentYear').value) ||
            c.period !== el('assessmentPeriod').value ||
            c.subject !== el('assessmentSubject').value ||
            c.teacherId !== String(teacherId || '');
        if (el('assessmentPendingFilter')) el('assessmentPendingFilter').hidden = !changed;
        if (changed) {
            persistDrafts();
            el('assessmentWorkspace').hidden = true;
            message('Filter berubah. Tekan Tampilkan Siswa untuk memuat periode dan guru yang baru. Draf lama tetap di perangkat sampai disimpan.');
        } else {
            el('assessmentWorkspace').hidden = false;
        }
    }

    async function applyStoredFilter(filter, { loadData = true } = {}) {
        if (!filter) return false;
        el('assessmentYear').value = String(filter.year || el('assessmentYear').value);
        el('assessmentPeriod').value = filter.period || el('assessmentPeriod').value;
        el('assessmentSubject').value = filter.subject || el('assessmentSubject').value;
        state.lastSubject = el('assessmentSubject').value;
        yearLabel();
        await refreshSubjectTeachers();
        if (filter.teacherId && state.eligibleTeachers.some(teacher => String(teacher.id) === String(filter.teacherId))) {
            state.selectedTeacherId = String(filter.teacherId);
            renderTeacherOptions();
        }
        state.pendingWorkspaceFilter = filter;
        if (loadData && el('assessmentTeacher').value) return load({ preferredFilter: filter, skipUnsavedPrompt: true });
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
            if (last.teacherId && state.eligibleTeachers.some(teacher => String(teacher.id) === String(last.teacherId))) {
                state.selectedTeacherId = String(last.teacherId); renderTeacherOptions();
            }
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
        if (AppAccess.full() && options.teacherId && state.eligibleTeachers.some(teacher => String(teacher.id) === String(options.teacherId))) {
            state.selectedTeacherId = String(options.teacherId); renderTeacherOptions();
        }
        el('assessmentPeriod').value = options.period || 'pts_ganjil';
        const loaded = await load();
        if (!loaded) return false;
        if (options.className && state.students.some(student => student.kelas === options.className)) el('assessmentLevel').value = classLevel(options.className);
        el('assessmentSearch').value = options.studentName || '';
        el('assessmentStatusFilter').value = options.problemOnly ? 'problem' : 'all';
        state.problemOnly = Boolean(options.problemOnly);
        state.page = 1;
        render();
        return true;
    }

    function yearLabel() {
        const year = Number(el('assessmentYear').value);
        el('assessmentYearLabel').textContent = Number.isInteger(year) && year >= 2000 && year <= 2200
            ? `Tahun ajaran ${year}/${year + 1}` : 'Masukkan tahun awal ajaran yang valid.';
    }

    async function confirmLeave() {
        if (!dirtyStudents().length) return true;
        const decision = await chooseUnsaved('Anda akan meninggalkan halaman Penilaian Periodik. Simpan sekarang ke database, atau keluar dengan draf tetap tersimpan di perangkat ini.');
        return decision === 'continue';
    }

    ((callback) => window.GMPanel ? GMPanel.onReady(callback) : document.addEventListener('panelready', callback))( () => {
        el('assessmentLoadForm').addEventListener('submit', event => { event.preventDefault(); void load(); });
        el('assessmentYear').addEventListener('input', () => { yearLabel(); markPendingFilter(); });
        el('assessmentYear').addEventListener('change', () => {
            rememberLastFilter();
            refreshSubjectTeachers().catch(error => message(error.message, true));
        });
        el('assessmentPeriod').addEventListener('change', () => { rememberLastFilter(); markPendingFilter(); });
        el('assessmentTeacher').addEventListener('change', () => {
            state.selectedTeacherId = el('assessmentTeacher').value;
            rememberLastFilter(); markPendingFilter();
        });
        el('assessmentTeacherSearch').addEventListener('input', renderTeacherOptions);
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
            el('assessmentPendingFilter').hidden = false;
            message('Pelajaran berubah. Tekan Tampilkan Siswa untuk memuat kelompok pelajaran baru.');
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
        el('assessmentSaveAll').addEventListener('click', () => save(dirtyInGrade(), { showSummary: true, source: 'save-all' }));
        el('assessmentRetrySave')?.addEventListener('click', () => save(state.lastFailedSave.filter(Boolean), { showSummary: true, source: 'retry' }));
        ['assessmentLevel','assessmentSearch','assessmentStatusFilter'].forEach(id => el(id).addEventListener(
            id === 'assessmentSearch' ? 'input' : 'change', () => {
                state.problemOnly = el('assessmentStatusFilter').value === 'problem';
                state.page = 1; render();
            }));
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
        el('assessmentClearLocalDrafts')?.addEventListener('click', () => { void clearLocalDrafts(); });
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
        el('assessmentMobileSave')?.addEventListener('click', () => save(dirtyInGrade(), { showSummary: true, source: 'mobile-save' }));
        el('assessmentMobileProblems')?.addEventListener('click', () => {
            el('assessmentStatusFilter').value = el('assessmentStatusFilter').value === 'problem' ? 'all' : 'problem';
            state.problemOnly = el('assessmentStatusFilter').value === 'problem'; state.page = 1; render();
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
