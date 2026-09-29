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
                <span class="gm-attention-card-icon" aria-hidden="true">!</span>
                <span class="gm-attention-card-copy"><small>Nilai belum lengkap</small><strong>${scoreCount}</strong><em>${scoreRows.length} item penilaian</em></span>
                <span class="gm-attention-card-arrow" aria-hidden="true">→</span>
            </button>`
        ];
        if (!isTeacher) {
            cards.push(`<button type="button" class="gm-attention-card gm-attention-tahsin ${state.filter === 'tahsin' ? 'is-active' : ''}" data-attention-filter="tahsin">
                <span class="gm-attention-card-icon" aria-hidden="true">ت</span>
                <span class="gm-attention-card-copy"><small>Belum kelompok Tahsin</small><strong>${tahsinCount}</strong><em>siswa</em></span>
                <span class="gm-attention-card-arrow" aria-hidden="true">→</span>
            </button>`);
            cards.push(`<button type="button" class="gm-attention-card gm-attention-tahfidz ${state.filter === 'tahfidz' ? 'is-active' : ''}" data-attention-filter="tahfidz">
                <span class="gm-attention-card-icon" aria-hidden="true">ح</span>
                <span class="gm-attention-card-copy"><small>Belum kelompok Tahfidz</small><strong>${tahfidzCount}</strong><em>siswa</em></span>
                <span class="gm-attention-card-arrow" aria-hidden="true">→</span>
            </button>`);
        }
        return cards.join('');
    }
    function listMarkup() {
        const rows = filteredRows();
        if (!rows.length) {
            return `<div class="gm-attention-empty">
                <span class="gm-attention-empty-mark" aria-hidden="true">✓</span>
                <div><strong>Tidak ada yang perlu ditindaklanjuti</strong><p>${state.filter === 'all' ? `Data ${periods[state.period]} pada kategori ini sudah rapi.` : 'Tidak ada siswa sesuai filter yang dipilih.'}</p></div>
            </div>`;
        }
        const shown = rows.slice(0, state.limit);
        return `<div class="gm-attention-list">${shown.map((row, index) => `
            <article class="gm-attention-row" data-attention-index="${state.rows.indexOf(row)}">
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
                <button type="button" class="gm-attention-open" data-attention-open="${state.rows.indexOf(row)}">${row.issue_type === 'missing_group' ? 'Kelola' : 'Periksa'}</button>
            </article>`).join('')}</div>
            ${rows.length > shown.length ? `<button type="button" id="gmAttentionMore" class="gm-attention-more">Tampilkan berikutnya <span>${shown.length}/${rows.length}</span></button>` : ''}`;
    }
    function renderContent() {
        if (!state.section) return;
        const summary = el('gmAttentionSummary');
        const list = el('gmAttentionRows');
        const count = el('gmAttentionResultCount');
        if (summary) summary.innerHTML = summaryMarkup();
        if (list) list.innerHTML = listMarkup();
        if (count) count.textContent = `${filteredRows().length} item`;
        state.section.querySelectorAll('[data-attention-filter]').forEach(button => button.addEventListener('click', () => {
            const next = button.dataset.attentionFilter;
            state.filter = state.filter === next ? 'all' : next;
            state.limit = 8;
            renderContent();
        }));
        el('gmAttentionMore')?.addEventListener('click', () => { state.limit += 8; renderContent(); });
        state.section.querySelectorAll('[data-attention-open]').forEach(button => button.addEventListener('click', () => openIssue(state.rows[Number(button.dataset.attentionOpen)])));
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
        return `<div class="gm-attention-loading" aria-live="polite"><span></span><div><strong>Memeriksa data yang perlu ditindaklanjuti</strong><small>Nilai dan keanggotaan kelompok sedang diselaraskan.</small></div></div>`;
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
                <div class="gm-attention-list-head"><div><strong>Daftar tindak lanjut</strong><span id="gmAttentionResultCount"></span></div>
                <label class="gm-attention-search"><span class="sr-only">Cari siswa</span><input id="gmAttentionSearch" type="search" name="attention_search" placeholder="Cari siswa..." autocomplete="off"></label></div>
                <div id="gmAttentionRows"></div>`;
            el('gmAttentionSearch')?.addEventListener('input', () => { state.limit = 8; renderContent(); });
            renderContent();
            const updated = el('gmAttentionUpdated');
            if (updated) updated.textContent = `Diperbarui ${new Intl.DateTimeFormat('id-ID', { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit' }).format(new Date())}`;
        } catch (error) {
            console.error('Pusat Perlu Perhatian gagal dimuat:', error);
            setTopStat('—');
            if (body) body.innerHTML = `<div class="gm-attention-error"><strong>Pusat Perlu Perhatian belum dapat dimuat.</strong><p>${esc(error.message)}</p><small>Jika fitur ini baru dipasang, jalankan SQL Tahap 18 lalu muat ulang panel.</small></div>`;
        } finally {
            state.loading = false;
            if (refresh) refresh.disabled = false;
        }
    }
    function shell() {
        const options = Object.entries(periods).map(([value, label]) => `<option value="${value}">${label}</option>`).join('');
        return `<section id="gmAttentionCenter" class="gm-attention-center" aria-labelledby="gmAttentionTitle">
            <div class="gm-attention-heading">
                <div><span>PEMANTAUAN</span><h2 id="gmAttentionTitle">Pusat Perlu Perhatian</h2><p>${AppAccess.teacher() ? 'Nilai siswa binaan yang masih perlu dilengkapi.' : 'Nilai dan penempatan kelompok yang masih perlu ditindaklanjuti.'}</p></div>
                <div class="gm-attention-controls">
                    <label><span>Periode nilai</span><select id="gmAttentionPeriod" name="attention_period">${options}</select></label>
                    <button id="gmAttentionRefresh" type="button" class="gm-attention-refresh" aria-label="Muat ulang pusat perhatian" title="Muat ulang">↻</button>
                </div>
            </div>
            <div class="gm-attention-meta"><span>${state.year}/${state.year + 1}</span><span id="gmAttentionUpdated">Memuat data...</span></div>
            <div id="gmAttentionBody">${loadingMarkup()}</div>
        </section>`;
    }
    async function mount(host, options = {}) {
        if (!host || !['koordinator', 'guru'].includes(AppAccess.profile?.role)) return;
        state.year = Number(options.year || getPublicAcademicYearStart());
        state.period = initialPeriod(state.year);
        state.filter = 'all';
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
            state.filter = 'all';
            load();
        });
        el('gmAttentionRefresh')?.addEventListener('click', load);
        await load();
    }
    return { mount, reload: load, periods, get rows() { return [...state.rows]; }, get period() { return state.period; } };
})();
