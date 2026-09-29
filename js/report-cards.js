window.StudentReports = (() => {
    let rows = [], busy = false, previewToken = 0, pdfUrl = null, activeTab = 'preview', loadedKey = '';
    const currentLoadKey = () => `${Number(el('reportYear').value || 0)}|${period()}|${String(el('reportGrade').value || '')}`;
    const el = id => document.getElementById(id);
    const esc = value => escapeHtml(String(value ?? ''));
    const period = () => `${el('reportExam').value}_${el('reportSemester').value}`;
    const tell = message => { el('reportFeedback').textContent = message; };
    const selected = () => rows.find(row => String(row.student.id) === el('reportStudent').value);
    const visible = () => rows.filter(row => (!el('reportClass').value || row.student.class === el('reportClass').value) &&
        row.student.name.toLocaleLowerCase('id').includes(el('reportSearch').value.toLocaleLowerCase('id')));
    function setBusy(value) {
        busy = value;
        el('reportControls').disabled = value;
        ['checkMissingScores','downloadReports'].forEach(id => { el(id).disabled = value; });
        ['reportDownloadMode','reportDownloadClass'].forEach(id => { if (el(id)) el(id).disabled = value; });
        el('reportSelection').disabled = value;
    }
    function refreshDownloadScope() {
        const classMode = el('reportDownloadMode')?.value === 'class';
        const classField = el('reportDownloadClassField');
        if (classField) classField.hidden = !classMode;
        const button = el('downloadReports');
        const summary = el('reportDownloadSummary');
        if (!classMode) {
            if (button) button.textContent = 'Unduh ZIP Satu Tingkat';
            if (summary) {
                summary.textContent = rows.length
                    ? `${rows.length} siswa dari seluruh rombel tingkat ${el('reportGrade').value} akan dimasukkan.`
                    : 'Mode satu tingkat akan mengunduh seluruh siswa dari semua rombel pada tingkat yang dimuat.';
                summary.classList.remove('is-warning');
            }
            return;
        }
        if (button) button.textContent = 'Unduh ZIP Satu Rombel';
        const className = el('reportDownloadClass')?.value || '';
        const count = className ? rows.filter(row => row.student.class === className).length : 0;
        if (summary) {
            summary.textContent = !className
                ? 'Pilih satu rombel yang akan diunduh.'
                : `${count} siswa dari ${className} akan dimasukkan.`;
            summary.classList.toggle('is-warning', !className || !count);
        }
    }
    function downloadSelection() {
        const mode = el('reportDownloadMode')?.value || 'grade';
        if (mode !== 'class') return { rows: [...rows], label: `Kelas ${el('reportGrade').value}` };
        const className = el('reportDownloadClass')?.value || '';
        if (!className) throw Error('Pilih rombel yang akan diunduh terlebih dahulu.');
        const selectedRows = rows.filter(row => row.student.class === className);
        if (!selectedRows.length) throw Error('Tidak ada siswa pada rombel yang dipilih.');
        return { rows: selectedRows, label: className };
    }
    function updateNavigationButtons() {
        const candidates = visible();
        const index = candidates.findIndex(row => String(row.student.id) === el('reportStudent').value);
        el('reportPrevious').disabled = busy || index <= 0;
        el('reportNext').disabled = busy || index < 0 || index >= candidates.length - 1;
    }
    function studentOptions() {
        const previous = el('reportStudent').value;
        const candidates = visible();
        el('reportStudent').replaceChildren(new Option('Pilih siswa', ''));
        candidates.forEach(row => el('reportStudent').add(new Option(`${row.student.name} · ${row.student.class}`, String(row.student.id))));
        if (candidates.some(row => String(row.student.id) === previous))
            el('reportStudent').value = previous;
        else if (candidates.length)
            el('reportStudent').value = String(candidates[0].student.id);
        updateNavigationButtons();
        if (activeTab === 'preview') preview();
    }
    function checks() {
        const grouped = ReportCore.missingByStudent(rows);
        const totalAspects = grouped.reduce((sum, pupil) => sum + pupil.programs.reduce((n, program) => n + program.fields.length, 0), 0);
        el('missingSummary').textContent = grouped.length
            ? `${grouped.length} siswa · ${totalAspects} aspek wajib belum diisi. Satu siswa hanya ditampilkan satu kali.`
            : (rows.length ? 'Seluruh nilai wajib sudah terisi.' : 'Muat data rapor terlebih dahulu.');
        const teacherFilter = el('missingTeacher').value;
        const subjectFilter = el('missingSubject').value;
        const classFilter = el('missingClass').value;
        const search = el('missingSearch').value.trim().toLocaleLowerCase('id');
        const filtered = grouped.map(pupil => ({
            student: pupil.student,
            programs: pupil.programs.filter(program => (!teacherFilter || program.teacher === teacherFilter) &&
                (!subjectFilter || program.subject === subjectFilter))
        })).filter(pupil => pupil.programs.length &&
            (!classFilter || pupil.student.class === classFilter) &&
            pupil.student.name.toLocaleLowerCase('id').includes(search));
        el('missingRows').innerHTML = filtered.map(pupil => `<tr>
            <td><strong>${esc(pupil.student.name)}</strong></td>
            <td>${esc(pupil.student.class)}</td>
            <td>${pupil.programs.map(program => `<div class="missing-program">
                <span class="missing-program-label">${esc(program.subject.toUpperCase())}</span>
                <span>${program.fields.map(field => esc(ReportCore.labels[field])).join(', ')}</span>
            </div>`).join('')}</td>
            <td>${pupil.programs.map(program => `<div class="missing-program">
                <span class="missing-program-label">${esc(program.subject.toUpperCase())}</span>
                <span>${esc(program.teacher)}</span>
            </div>`).join('')}</td>
        </tr>`).join('') || '<tr><td colspan="4">Tidak ada nilai kosong sesuai filter.</td></tr>';
        el('reportProblems').textContent = rows.flatMap(row => ReportCore.reportCheck(row).problems.map(problem => `${row.student.name} (${row.student.class}): ${problem}`)).join('\n');
    }
    async function load(force = true) {
        if (busy || AppAccess.profile?.role !== 'koordinator')
            return false;
        const requestKey = currentLoadKey();
        if (!force && rows.length && loadedKey === requestKey) {
            studentOptions();
            checks();
            tell('Data rapor yang sudah dimuat dipakai kembali.');
            refreshDownloadScope();
            return true;
        }
        setBusy(true);
        el('reportPdfLink').hidden = true;
        tell('Memuat seluruh siswa dan rombel tingkat terpilih...');
        try {
            const all = [];
            for (let start = 0;; start += 250) {
                const response = await supabase.rpc('report_roster', {
                    yr: Number(el('reportYear').value), pr: period(),
                    grade: Number(el('reportGrade').value), start_at: start
                });
                if (response.error)
                    throw response.error;
                all.push(...response.data);
                if (response.data.length < 250)
                    break;
            }
            rows = ReportPDF.sorted(all);
            loadedKey = requestKey;
            const classes = [...new Set(rows.map(row => row.student.class))];
            const previousReportClass = el('reportClass').value;
            const previousDownloadClass = el('reportDownloadClass')?.value || '';
            for (const id of ['reportClass', 'missingClass']) {
                const previous = el(id).value;
                el(id).replaceChildren(new Option('Semua rombel', ''));
                classes.forEach(name => el(id).add(new Option(name, name)));
                if (classes.includes(previous)) el(id).value = previous;
            }
            if (classes.includes(previousReportClass)) el('reportClass').value = previousReportClass;
            if (el('reportDownloadClass')) {
                el('reportDownloadClass').replaceChildren(new Option('Pilih rombel', ''));
                classes.forEach(name => el('reportDownloadClass').add(new Option(name, name)));
                if (classes.includes(previousDownloadClass)) el('reportDownloadClass').value = previousDownloadClass;
                refreshDownloadScope();
            }
            el('missingTeacher').replaceChildren(new Option('Semua guru', ''));
            [...new Set(ReportCore.missingByStudent(rows).flatMap(pupil => pupil.programs.map(p => p.teacher)))].sort()
                .forEach(name => el('missingTeacher').add(new Option(name, name)));
            const complete = rows.filter(row => ReportCore.reportCheck(row).complete).length;
            el('reportChecks').textContent = `${rows.length} siswa · ${classes.length} rombel · ${complete} lengkap · ${rows.length - complete} belum lengkap`;
            checks();
            studentOptions();
            tell('Data nilai terbaru dimuat. Identitas pratinjau menggunakan data Supabase, bukan contoh Excel.');
            return true;
        }
        catch (error) {
            rows = [];
            loadedKey = '';
            previewToken++;
            el('reportPreview').replaceChildren();
            el('reportDataAudit').replaceChildren();
            el('reportStudent').replaceChildren();
            el('reportChecks').textContent = 'Data belum tersedia';
            el('missingRows').replaceChildren();
            el('reportProblems').textContent = '';
            tell(error.message);
            return false;
        }
        finally {
            setBusy(false);
        }
    }
    const isMissing = value => value == null || !String(value).trim();
    const hasOfficials = value => value && ['principal_name', 'principal_niy', 'coordinator_name', 'coordinator_niy', 'city']
        .every(key => !isMissing(value[key]));
    async function hydrateForPreview(row) {
        const jobs = [];
        if (isMissing(row.student.nis) || isMissing(row.student.nisn))
            jobs.push((async () => {
                const result = await supabase.from('student_identifiers').select('nis,nisn')
                    .eq('student_id', row.student.id).maybeSingle();
                if (result.error)
                    throw result.error;
                for (const key of ['nis', 'nisn'])
                    if (isMissing(row.student[key]) && !isMissing(result.data?.[key]))
                        row.student[key] = result.data[key];
            })());
        if (isMissing(row.school?.name) || isMissing(row.school?.logo_url))
            jobs.push((async () => {
                const result = await supabase.from('school_profile').select('name,logo_url')
                    .eq('id', 1).maybeSingle();
                if (result.error)
                    throw result.error;
                row.school = { ...(result.data || {}), ...(row.school || {}) };
                for (const key of ['name', 'logo_url'])
                    if (isMissing(row.school[key]) && !isMissing(result.data?.[key]))
                        row.school[key] = result.data[key];
            })());
        if (!row.issued_at && !hasOfficials(row.officials))
            jobs.push((async () => {
                const result = await supabase.from('report_settings').select('data').eq('id', 1).maybeSingle();
                if (result.error)
                    throw result.error;
                const config = result.data?.data || {};
                row.officials ||= {};
                for (const key of ['principal_name', 'principal_niy', 'coordinator_name', 'coordinator_niy', 'city']) {
                    if (isMissing(row.officials[key]) && !isMissing(config[key]))
                        row.officials[key] = config[key];
                }
            })());
        const errors = (await Promise.allSettled(jobs)).filter(r => r.status === 'rejected')
            .map(r => r.reason?.message || 'Sumber data belum dapat dibaca');
        return errors;
    }
    function renderIdentityAudit(report, errors = []) {
        const student = report.student || {}, officials = report.officials || {}, school = report.school || {};
        const teachers = report.teachers || {};
        const items = [
            ['Nama siswa', student.name], ['Kelas / rombel', student.class],
            ['NIS', student.nis], ['NISN', student.nisn],
            ['Guru Tahsin', teachers.tahsin || report.tahsin?.teacher_name],
            ['Guru Tahfidz', teachers.tahfidz || report.tahfidz?.teacher_name],
            ['Sekolah', school.name], ['Kepala sekolah + gelar', officials.principal_name],
            ['NIY kepala sekolah', officials.principal_niy],
            ['Koordinator + gelar', officials.coordinator_name],
            ['NIY koordinator', officials.coordinator_niy], ['Tempat terbit', officials.city]
        ];
        const empty = items.filter(([, value]) => isMissing(value) || value === 'Pengampu Belum Ditetapkan');
        const audit = el('reportDataAudit');
        audit.innerHTML = `<h3>Data asli untuk memeriksa rapor</h3>
            <p class="report-audit-help">Data ini berasal dari Supabase. Tanda "belum tersedia" menunjukkan data yang perlu diperiksa, bukan nilai contoh.</p>
            <dl class="report-audit-grid">${items.map(([label, value]) => `<div>
                <dt>${esc(label)}</dt><dd class="${isMissing(value) || value === 'Pengampu Belum Ditetapkan' ? 'report-audit-unset' : ''}">
                ${esc(isMissing(value) ? 'Belum tersedia' : value)}</dd></div>`).join('')}</dl>
            ${empty.length ? `<p class="report-audit-warning">${empty.length} informasi belum tersedia. Periksa master siswa / NIS-NISN, pengampu, profil sekolah, atau Identitas Rapor pada Pengaturan.</p>` : ''}
            ${errors.length ? `<p class="report-audit-warning">Beberapa data pelengkap tidak dapat diambil: ${esc(errors.join('; '))}</p>` : ''}`;
    }
    async function preview() {
        const report = selected(), token = ++previewToken;
        updateNavigationButtons();
        el('reportPreview').replaceChildren();
        el('reportDataAudit').replaceChildren();
        if (!report) {
            el('reportStudentStatus').textContent = 'Pilih satu siswa untuk pratinjau.';
            return;
        }
        el('reportStudentStatus').textContent = 'Memeriksa identitas dan menyiapkan pratinjau...';
        try {
            const errors = await hydrateForPreview(report);
            if (token !== previewToken)
                return;
            const checked = ReportCore.reportCheck(report);
            const status = el('reportStudentStatus');
            const badge = document.createElement('span');
            badge.className = `report-status-badge ${checked.complete ? 'is-complete' : 'is-draft'}`;
            badge.textContent = checked.complete ? 'Nilai lengkap' : 'Draf · nilai belum lengkap';
            const metrics = document.createElement('dl');
            metrics.className = 'report-status-metrics';
            for (const [name, value] of [
                ['Target Tahsin', ReportCore.attainment(report.tahsin?.scores || {}, report.settings?.tahsin_target, 'tahsin')],
                ['Target Tahfidz', ReportCore.attainment(report.tahfidz?.scores || {}, report.settings?.tahfidz_target, 'tahfidz')]
            ]) {
                const line = document.createElement('div');
                const label = document.createElement('dt');
                label.textContent = name;
                const result = document.createElement('dd');
                result.textContent = value;
                line.append(label, result);
                metrics.append(line);
            }
            status.replaceChildren(badge, metrics);
            renderIdentityAudit(report, errors);
            const canvas = await ReportPDF.render(report, { draft: !checked.complete });
            if (token === previewToken)
                el('reportPreview').replaceChildren(canvas);
        }
        catch (error) {
            if (token === previewToken)
                tell(error.message);
        }
    }
    function step(amount) {
        const list = visible(), index = list.findIndex(row => String(row.student.id) === el('reportStudent').value);
        if (!list.length)
            return;
        el('reportStudent').value = String(list[Math.max(0, Math.min(list.length - 1, index + amount))].student.id);
        preview();
    }
    async function download() {
        if (busy || !await load(false) || !rows.length) return;
        let selection;
        try { selection = downloadSelection(); }
        catch (error) { tell(error.message); refreshDownloadScope(); return; }
        const selectedRows = selection.rows;
        if (selectedRows.some(row => !ReportCore.reportCheck(row).complete)) {
            checks(); tell(`Belum dapat mengunduh ${selection.label}: masih ada nilai wajib, identitas, atau pengaturan yang belum lengkap.`); return;
        }
        setBusy(true);
        try {
            const pdfName = `Rapor ${selection.label} - ${el('reportExam').value.toUpperCase()} Semester ${el('reportSemester').value === 'ganjil' ? '1' : '2'} - ${el('reportYear').value}-${Number(el('reportYear').value)+1}.pdf`;
            const blob = await ReportZip.build(selectedRows, { fileName: pdfName, onProgress: (n,total)=>tell(n ? `Menyusun rapor ${n}/${total} halaman...` : 'Menyiapkan dokumen rapor...') });
            const issued = await supabase.rpc('record_report_issuance', { entries: selectedRows.map(row => ({ student_id: row.student.id, year: row.year, period: row.period, fingerprint: row.fingerprint })) });
            if (issued.error) throw issued.error;
            if (pdfUrl) URL.revokeObjectURL(pdfUrl);
            pdfUrl = URL.createObjectURL(blob);
            const link = el('reportPdfLink');
            link.href = pdfUrl;
            const scope = ReportZip.safe(selection.label);
            link.download = `Rapor ${el('reportExam').value.toUpperCase()} Semester ${el('reportSemester').value === 'ganjil' ? '1':'2'} - ${scope} - ${el('reportYear').value}-${Number(el('reportYear').value)+1}.zip`;
            link.hidden = false; link.textContent = 'Simpan ZIP Rapor'; link.click();
            tell(`ZIP selesai: 1 PDF berisi ${selectedRows.length} halaman rapor · ${selection.label}.`);
        } catch (error) { tell(error.message); }
        finally { setBusy(false); refreshDownloadScope(); }
    }
    function changeTab(tab) {
        if (!['preview','missing','print'].includes(tab)) return;
        activeTab = tab;
        for (const key of ['preview','missing','print']) {
            const panel = el('reportView' + key[0].toUpperCase() + key.slice(1));
            panel.hidden = key !== tab;
        }
        document.querySelectorAll('[data-rapor-view]').forEach(button => {
            const chosen = button.dataset.raporView === tab;
            button.classList.toggle('active', chosen);
            button.setAttribute('aria-selected', String(chosen));
        });
        if (tab === 'preview' && selected() && !el('reportPreview').firstChild) preview();
        if (tab === 'missing' && rows.length) checks();
    }
    function open() {
        if (AppAccess.profile?.role !== 'koordinator')
            return;
        changeTab(activeTab);
        el('reportYear').value ||= String(new Date().getFullYear() - (new Date().getMonth() < 6 ? 1 : 0));
    }
    async function openMissing(options = {}) {
        if (AppAccess.profile?.role !== 'koordinator')
            return false;
        const year = Number(options.year || (new Date().getFullYear() - (new Date().getMonth() < 6 ? 1 : 0)));
        const [exam = 'pts', semester = 'ganjil'] = String(options.period || 'pts_ganjil').split('_');
        const grade = String(options.className || '').match(/^\s*(?:kelas\s*)?(\d+)/i)?.[1] || '1';
        el('reportYear').value = String(year);
        el('reportExam').value = exam;
        el('reportSemester').value = semester;
        el('reportGrade').value = grade;
        changeTab('missing');
        const ok = await load(true);
        if (!ok) return false;
        if (options.className && [...el('missingClass').options].some(option => option.value === options.className))
            el('missingClass').value = options.className;
        if (options.subject)
            el('missingSubject').value = options.subject;
        if (options.teacher && [...el('missingTeacher').options].some(option => option.value === options.teacher))
            el('missingTeacher').value = options.teacher;
        el('missingSearch').value = options.studentName || '';
        checks();
        return true;
    }
    document.addEventListener('panelready', () => {
        document.querySelectorAll('[data-rapor-view]').forEach(button =>
            button.addEventListener('click', () => changeTab(button.dataset.raporView)));
        el('reportPaperTint').addEventListener('change', event => {
            el('reportPreview').classList.toggle('paper-tint', event.target.checked);
        });
        changeTab('preview');
        el('loadReports').addEventListener('click', () => load(true));
        el('checkMissingScores').addEventListener('click', () => load(true));
        el('reportClass').addEventListener('change', studentOptions);
        el('reportSearch').addEventListener('input', studentOptions);
        el('reportStudent').addEventListener('change', preview);
        el('reportPrevious').addEventListener('click', () => step(-1));
        el('reportNext').addEventListener('click', () => step(1));
        el('downloadReports').addEventListener('click', download);
        el('reportDownloadMode')?.addEventListener('change', () => { el('reportPdfLink').hidden = true; refreshDownloadScope(); });
        el('reportDownloadClass')?.addEventListener('change', () => { el('reportPdfLink').hidden = true; refreshDownloadScope(); });
        refreshDownloadScope();
        ['missingSearch', 'missingClass', 'missingTeacher', 'missingSubject']
            .forEach(id => el(id).addEventListener('input', checks));
        ['reportYear', 'reportExam', 'reportSemester', 'reportGrade'].forEach(id => el(id).addEventListener('change', () => {
            rows = [];
            loadedKey = '';
            studentOptions();
            el('reportChecks').textContent = 'Filter berubah. Muat rapor kembali.';
            checks();
            el('reportPdfLink').hidden = true;
            if (el('reportDownloadClass')) el('reportDownloadClass').value = '';
            refreshDownloadScope();
        }));
    });
    return { open, openMissing, isBusy: () => busy };
})();
