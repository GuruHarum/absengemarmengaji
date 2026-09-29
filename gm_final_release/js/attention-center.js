window.GMAttention = (() => {
    const periods = Object.freeze({
        pts_ganjil: 'PTS Semester 1',
        pas_ganjil: 'PAS Semester 1',
        pts_genap: 'PTS Semester 2',
        pas_genap: 'PAS Semester 2'
    });
    const state = { rows: [], filter: 'all', limit: 8, year: null, period: null, section: null, loading: false };
    const esc = value => escapeHtml(String(value ?? ''));
    const el = id => document.getElementById(id);
    const attentionIcon = type => ({
        score: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M12 8v5m0 3.5h.01M10.3 4.4 3.2 17a2 2 0 0 0 1.75 3h14.1a2 2 0 0 0 1.75-3L13.7 4.4a2 2 0 0 0-3.4 0Z"/></svg>',
        tahsin: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM19 8v6m-3-3h6"/></svg>',
        tahfidz: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M4 5.5A2.5 2.5 0 0 1 6.5 3H11v16H6.5A2.5 2.5 0 0 0 4 21.5v-16ZM20 5.5A2.5 2.5 0 0 0 17.5 3H13v16h4.5a2.5 2.5 0 0 1 2.5 2.5v-16Z"/></svg>'
    }[type] || '');

    function fallbackPeriod() {
        const month = Number(new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Jakarta', month: 'numeric' }).format(new Date()));
        if (month >= 7 && month <= 10) return 'pts_ganjil';
        if (month >= 11) return 'pas_ganjil';
        if (month <= 3) return 'pts_genap';
        return 'pas_genap';
    }
    function initialPeriod(year) {
        const saved = localStorage.getItem(`gm_attention_period_${year}`);
        return periods[saved] ? saved : fallbackPeriod();
    }
    const uniqueStudents = rows => new Set(rows.map(row => String(row.student_id))).size;
    const rowsFor = type => state.rows.filter(row => row.issue_type === type);
    const missingGroupRows = subject => state.rows.filter(row => row.issue_type === 'missing_group' && row.subject === subject);

    function issueText(row) {
        if (row.issue_type === 'missing_group')
            return `Belum memiliki kelompok ${row.subject === 'tahsin' ? 'Tahsin' : 'Tahfidz'}`;
        const payload = row.issue_payload || {};
        const missing = Array.isArray(payload.missing) ? payload.missing : [];
        const invalid = Array.isArray(payload.invalid) ? payload.invalid : [];
        const stage = Array.isArray(payload.stage) ? payload.stage : [];
        const labels = window.ReportCore?.labels || {};
        const parts = [];
        if (missing.includes('nilai_belum_diisi')) parts.push('Nilai belum diisi');
        const scoreMissing = missing.filter(key => key !== 'nilai_belum_diisi').map(key => labels[key] || key);
        if (scoreMissing.length) parts.push(`Kosong: ${scoreMissing.join(', ')}`);
        if (invalid.length) parts.push(`Periksa: ${invalid.map(key => labels[key] || key).join(', ')}`);
        if (stage.length) parts.push(stage.join(' · '));
        return parts.join(' · ') || 'Nilai perlu diperiksa';
    }
    function subjectLabel(subject) { return subject === 'tahsin' ? 'Tahsin' : 'Tahfidz'; }
    function issueLabel(row) { return row.issue_type === 'missing_group' ? `Belum Kelompok ${subjectLabel(row.subject)}` : `Nilai ${subjectLabel(row.subject)}`; }
    function initials(name) {
        const words = String(name || '?').trim().split(/\s+/).filter(Boolean);
        return (words[0]?.[0] || '') + (words[1]?.[0] || '');
    }
    function matchesFilter(row) {
        if (state.filter === 'scores') return row.issue_type === 'incomplete_score';
        if (state.filter === 'tahsin') return row.issue_type === 'missing_group' && row.subject === 'tahsin';
        if (state.filter === 'tahfidz') return row.issue_type === 'missing_group' && row.subject === 'tahfidz';
        return true;
    }
    function filteredRows() {
        const search = String(el('gmAttentionSearch')?.value || '').trim().toLocaleLowerCase('id');
        return state.rows.filter(row => matchesFilter(row) && (!search || `${row.student_name} ${row.class_name} ${row.teacher_name || ''}`.toLocaleLowerCase('id').includes(search)));
    }
    function setTopStat(count) {
        const stat = document.querySelector('[data-gm-stat="missing-score"]');
        if (!stat) return;
        const value = stat.querySelector('.gm-stat-copy > strong');
        const sub = stat.querySelector('.gm-stat-copy > small');
        if (value) value.textContent = String(count);
        if (sub) sub.textContent = count ? `${periods[state.period]} · perlu tindak lanjut` : `${periods[state.period]} · lengkap`;
    }
    function summaryMarkup() {
        const scoreRows = rowsFor('incomplete_score');
        const scoreCount = uniqueStudents(scoreRows);
        const tahsinCount = missingGroupRows('tahsin').length;
        const tahfidzCount = missingGroupRows('tahfidz').length;
        const isTeacher = AppAccess.teacher();
        setTopStat(scoreCount);
        const cards = [
            `<button type="button" class="gm-attention-card gm-attention-score ${state.filter === 'scores' ? 'is-active' : ''}" data-attention-filter="scores">
                <span class="gm-attention-card-icon" aria-hidden="true">${attentionIcon('score')}</span>
                <span class="gm-attention-card-copy"><small>Nilai belum lengkap</small><strong>${scoreCount}</strong><em>${scoreRows.length} item penilaian</em></span>
                <span class="gm-attention-card-arrow" aria-hidden="true">→</span>
            </button>`
        ];
        if (!isTeacher) {
            cards.push(`<button type="button" class="gm-attention-card gm-attention-tahsin ${state.filter === 'tahsin' ? 'is-active' : ''}" data-attention-filter="tahsin">
                <span class="gm-attention-card-icon" aria-hidden="true">${attentionIcon('tahsin')}</span>
                <span class="gm-attention-card-copy"><small>Belum kelompok Tahsin</small><strong>${tahsinCount}</strong><em>siswa</em></span>
                <span class="gm-attention-card-arrow" aria-hidden="true">→</span>
            </button>`);
            cards.push(`<button type="button" class="gm-attention-card gm-attention-tahfidz ${state.filter === 'tahfidz' ? 'is-active' : ''}" data-attention-filter="tahfidz">
                <span class="gm-attention-card-icon" aria-hidden="true">${attentionIcon('tahfidz')}</span>
                <span class="gm-attention-card-copy"><small>Belum kelompok Tahfidz</small><strong>${tahfidzCount}</strong><em>siswa</em></span>
                <span class="gm-attention-card-arrow" aria-hidden="true">→</span>
            </button>`);
        }
        return cards.join('');
    }
    function rowMarkup(row) {
        const index = state.rows.indexOf(row);
        return `<article class="gm-attention-row" data-attention-index="${index}">
            <span class="gm-attention-avatar" aria-hidden="true">${esc(initials(row.student_name).toUpperCase())}</span>
            <div class="gm-attention-person">
                <strong>${esc(row.student_name)}</strong>
                <span>${esc(row.class_name || 'Kelas belum tersedia')}</span>
            </div>
            <div class="gm-attention-issue">
                <span class="gm-attention-badge ${row.issue_type === 'missing_group' ? 'is-group' : 'is-score'}">${esc(issueLabel(row))}</span>
                <small>${esc(issueText(row))}</small>
                ${row.teacher_name ? `<em>${esc(row.teacher_name)}</em>` : ''}
            </div>
            <button type="button" class="gm-attention-open" data-attention-open="${index}">${row.issue_type === 'missing_group' ? 'Kelola' : 'Periksa'}</button>
        </article>`;
    }
    function teacherScoreGroups(rows) {
        const groups = new Map();
        rows.forEach(row => {
            const key = String(row.teacher_id || '');
            if (!key) return;
            if (!groups.has(key)) groups.set(key, { teacherId: key, teacherName: row.teacher_name || 'Guru', rows: [], students: new Set(), subjects: new Set() });
            const group = groups.get(key);
            group.rows.push(row);
            group.students.add(String(row.student_id));
            group.subjects.add(row.subject);
        });
        return [...groups.values()].sort((a,b) => a.teacherName.localeCompare(b.teacherName, 'id'));
    }
    function coordinatorScoreGroups() {
        const search = String(el('gmAttentionSearch')?.value || '').trim().toLocaleLowerCase('id');
        return teacherScoreGroups(state.rows.filter(row => row.issue_type === 'incomplete_score'))
            .filter(group => !search || group.teacherName.toLocaleLowerCase('id').includes(search));
    }
    function scoreGroupsMarkup(groups) {
        return `<div class="gm-attention-teacher-groups gm-attention-teacher-groups-compact">${groups.map(group => {
            const subjects = [...group.subjects].map(subjectLabel).join(' & ');
            return `<article class="gm-attention-teacher-summary">
                <div class="gm-attention-teacher-identity">
                    <div><strong>${esc(group.teacherName)}</strong><span>${group.students.size} siswa belum lengkap${subjects ? ` · ${esc(subjects)}` : ''}</span></div>
                </div>
                <button type="button" class="gm-attention-notify" data-attention-notify="${esc(group.teacherId)}" data-teacher-name="${esc(group.teacherName)}" data-student-count="${group.students.size}">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/></svg>
                    <span>Kirim pengingat</span>
                </button>
            </article>`;
        }).join('')}</div>`;
    }
    function listMarkup() {
        const coordinatorScores = AppAccess.profile?.role === 'koordinator' && state.filter === 'scores';
        if (coordinatorScores) {
            const groups = coordinatorScoreGroups();
            if (!groups.length) return `<div class="gm-attention-empty"><span class="gm-attention-empty-mark" aria-hidden="true">✓</span><strong>Tidak ada yang perlu ditindaklanjuti</strong></div>`;
            const shown = groups.slice(0, state.limit);
            return `${scoreGroupsMarkup(shown)}${groups.length > shown.length ? `<button type="button" id="gmAttentionMore" class="gm-attention-more">Tampilkan berikutnya <span>${shown.length}/${groups.length} guru</span></button>` : ''}`;
        }
        const rows = filteredRows();
        if (!rows.length) {
            return `<div class="gm-attention-empty"><span class="gm-attention-empty-mark" aria-hidden="true">✓</span><strong>Tidak ada yang perlu ditindaklanjuti</strong></div>`;
        }
        const shown = rows.slice(0, state.limit);
        return `<div class="gm-attention-list">${shown.map(rowMarkup).join('')}</div>${rows.length > shown.length ? `<button type="button" id="gmAttentionMore" class="gm-attention-more">Tampilkan berikutnya <span>${shown.length}/${rows.length}</span></button>` : ''}`;
    }
    function renderContent() {
        if (!state.section) return;
        const summary = el('gmAttentionSummary');
        const list = el('gmAttentionRows');
        const count = el('gmAttentionResultCount');
        if (summary) summary.innerHTML = summaryMarkup();
        if (list) list.innerHTML = listMarkup();
        const coordinatorScores = AppAccess.profile?.role === 'koordinator' && state.filter === 'scores';
        const resultTotal = coordinatorScores ? coordinatorScoreGroups().length : filteredRows().length;
        if (count) count.textContent = coordinatorScores ? `${resultTotal} guru` : String(resultTotal);
        const search = el('gmAttentionSearch');
        if (search) search.placeholder = coordinatorScores ? 'Cari guru...' : 'Cari siswa...';
        state.section.querySelectorAll('[data-attention-filter]').forEach(button => button.addEventListener('click', () => {
            const next = button.dataset.attentionFilter;
            if (AppAccess.profile?.role === 'koordinator')
                state.filter = next === 'scores' ? 'scores' : (state.filter === next ? 'scores' : next);
            else
                state.filter = state.filter === next ? 'all' : next;
            state.limit = 8;
            renderContent();
        }));
        el('gmAttentionMore')?.addEventListener('click', () => { state.limit += 8; renderContent(); });
        state.section.querySelectorAll('[data-attention-open]').forEach(button => button.addEventListener('click', () => openIssue(state.rows[Number(button.dataset.attentionOpen)])));
        state.section.querySelectorAll('[data-attention-notify]').forEach(button => button.addEventListener('click', async () => {
            const teacherId = button.dataset.attentionNotify;
            const teacherName = button.dataset.teacherName || 'guru';
            const studentCount = Number(button.dataset.studentCount || 0);
            if (!window.GMNotifications?.sendAttention) return;
            const original = button.innerHTML;
            button.disabled = true;
            try {
                await window.GMNotifications.sendAttention(teacherId, { year: state.year, period: state.period, teacherName, studentCount });
            } finally {
                button.disabled = false;
                button.innerHTML = original;
            }
        }));
    }
    async function openIssue(row) {
        if (!row) return;
        if (row.issue_type === 'missing_group') {
            switchPage(row.subject === 'tahsin' ? 'kelompok-tahsin' : 'kelompok');
            return;
        }
        if (AppAccess.profile?.role === 'koordinator') {
            switchPage('rapor');
            await window.StudentReports?.openMissing?.({
                year: state.year, period: state.period, studentId: row.student_id,
                studentName: row.student_name, className: row.class_name,
                subject: row.subject, teacher: row.teacher_name
            });
            return;
        }
        switchPage('penilaian');
        await window.PeriodicAssessments?.openAttention?.({
            year: state.year, period: state.period, subject: row.subject,
            teacherId: row.teacher_id, className: row.class_name, studentName: row.student_name
        });
    }
    function loadingMarkup() {
        if (window.GMUX?.skeletonList) return window.GMUX.skeletonList(4, { compact: true });
        return `<div class="gm-attention-loading" aria-live="polite" aria-label="Memuat"><span></span></div>`;
    }
    async function load() {
        if (!state.section || state.loading) return;
        state.loading = true;
        const body = el('gmAttentionBody');
        const refresh = el('gmAttentionRefresh');
        if (refresh) refresh.disabled = true;
        if (body) body.innerHTML = loadingMarkup();
        try {
            state.rows = await fetchAllRpcRows('gm_attention_center', { year_key: state.year, period_key: state.period }, 500);
            state.limit = 8;
            if (state.filter !== 'all' && !state.rows.some(matchesFilter)) state.filter = 'all';
            if (body) body.innerHTML = `<div id="gmAttentionSummary" class="gm-attention-summary"></div>
                <div class="gm-attention-list-head"><div><strong>Tindak lanjut</strong><span id="gmAttentionResultCount"></span></div>
                <label class="gm-attention-search"><span class="sr-only">Cari siswa</span><input id="gmAttentionSearch" type="search" name="attention_search" placeholder="Cari siswa..." autocomplete="off"></label></div>
                <div id="gmAttentionRows"></div>`;
            el('gmAttentionSearch')?.addEventListener('input', () => { state.limit = 8; renderContent(); });
            renderContent();
        } catch (error) {
            console.error('Pusat Perlu Perhatian gagal dimuat:', error);
            setTopStat('—');
            if (body) {
                body.innerHTML = `<div class="gm-attention-error"><strong>Data belum dapat dimuat.</strong><button type="button" id="gmAttentionRetry" class="gm-attention-open">Coba lagi</button></div>`;
                el('gmAttentionRetry')?.addEventListener('click', load);
            }
        } finally {
            state.loading = false;
            if (refresh) refresh.disabled = false;
        }
    }
    function shell() {
        const options = Object.entries(periods).map(([value, label]) => `<option value="${value}">${label}</option>`).join('');
        return `<section id="gmAttentionCenter" class="gm-attention-center" aria-labelledby="gmAttentionTitle">
            <div class="gm-attention-heading">
                <h2 id="gmAttentionTitle">Pusat Perlu Perhatian</h2>
                <div class="gm-attention-controls">
                    <label><span>Periode</span><select id="gmAttentionPeriod" name="attention_period">${options}</select></label>
                    <button id="gmAttentionRefresh" type="button" class="gm-attention-refresh" aria-label="Muat ulang" title="Muat ulang">↻</button>
                </div>
            </div>
            <div id="gmAttentionBody">${loadingMarkup()}</div>
        </section>`;
    }
    async function mount(host, options = {}) {
        if (!host || !['koordinator', 'guru'].includes(AppAccess.profile?.role)) return;
        state.year = Number(options.year || getPublicAcademicYearStart());
        state.period = initialPeriod(state.year);
        state.filter = AppAccess.profile?.role === 'koordinator' ? 'scores' : 'all';
        state.limit = 8;
        const wrap = document.createElement('div');
        wrap.innerHTML = shell();
        state.section = wrap.firstElementChild;
        host.appendChild(state.section);
        const period = el('gmAttentionPeriod');
        period.value = state.period;
        period.addEventListener('change', () => {
            state.period = period.value;
            localStorage.setItem(`gm_attention_period_${state.year}`, state.period);
            state.filter = AppAccess.profile?.role === 'koordinator' ? 'scores' : 'all';
            load();
        });
        el('gmAttentionRefresh')?.addEventListener('click', load);
        await load();
    }
    function focusScores() {
        if (!state.section) return false;
        state.filter = 'scores';
        state.limit = 16;
        renderContent();
        state.section.scrollIntoView({ behavior: 'smooth', block: 'start' });
        return true;
    }
    return { mount, reload: load, focusScores, periods, get rows() { return [...state.rows]; }, get period() { return state.period; } };
})();
