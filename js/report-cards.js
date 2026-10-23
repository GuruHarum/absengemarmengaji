window.StudentReports = (() => {
    let rows = [], busy = false, previewToken = 0, previewSearchToken = 0, pdfUrl = null, activeTab = 'print', loadedKey = '', lastDownloadAttempt = null, downloadStartedAt = 0, previewVisited = false, pendingDownloadLoad = false;
    const currentLoadKey = () => `${Number(el('reportYear').value || 0)}|${period()}|${String(el('reportGrade').value || '')}`;
    const el = id => document.getElementById(id);
    const esc = value => escapeHtml(String(value ?? ''));
    const period = () => `${el('reportExam').value}_${el('reportSemester').value}`;
    const tell = message => { el('reportFeedback').textContent = message; };
    const selected = () => rows.find(row => String(row.student.id) === el('reportStudent').value);
    const visible = () => rows.filter(row => ReportCore.reportCheck(row).complete);
    function setBusy(value) {
        busy = value;
        el('reportControls').disabled = value;
        ['checkMissingScores','downloadReports','downloadReportsExcel','reportRetryDownload'].forEach(id => { if (el(id)) el(id).disabled = value; });
        ['reportDownloadMode','reportDownloadClass'].forEach(id => { if (el(id)) el(id).disabled = value; });
        if (el('reportSelection')) el('reportSelection').disabled = value;
    }
    function formatDuration(ms) {
        const seconds = Math.max(0, Math.round(Number(ms || 0) / 1000));
        if (seconds < 60) return `${seconds} detik`;
        const minutes = Math.floor(seconds / 60), rest = seconds % 60;
        return `${minutes} menit${rest ? ` ${rest} detik` : ''}`;
    }
    function updatePdfProgress({ visible = true, title = 'Menyiapkan rapor', n = 0, total = 0, row = null, done = false, error = '' } = {}) {
        const box = el('reportPdfProgress');
        if (!box) return;
        box.hidden = !visible;
        if (!visible) return;
        const percent = total ? Math.min(100, Math.round((n / total) * 100)) : 0;
        if (el('reportPdfProgressTitle')) el('reportPdfProgressTitle').textContent = title;
        if (el('reportPdfProgressPercent')) el('reportPdfProgressPercent').textContent = done ? '100%' : `${percent}%`;
        if (el('reportPdfProgressBar')) el('reportPdfProgressBar').value = done ? 100 : percent;
        const detail = el('reportPdfProgressDetail');
        if (!detail) return;
        if (error) { detail.textContent = error; box.dataset.state = 'error'; return; }
        box.dataset.state = done ? 'done' : 'working';
        if (done) { detail.textContent = total ? `${total} halaman selesai disusun.` : 'PDF selesai disusun.'; return; }
        if (!n || !total) { detail.textContent = 'Memeriksa data dan menyiapkan halaman pertama...'; return; }
        const elapsed = Date.now() - downloadStartedAt;
        const perPage = elapsed / n;
        const remaining = Math.max(0, (total - n) * perPage);
        const student = row?.student?.name ? ` · ${row.student.name}` : '';
        detail.textContent = `Halaman ${n} dari ${total}${student} · berjalan ${formatDuration(elapsed)}${n < total ? ` · perkiraan sisa ${formatDuration(remaining)}` : ''}`;
    }

    function refreshDownloadScope() {
        const className = el('reportDownloadClass')?.value || '';
        const summary = el('reportDownloadSummary');
        if (!summary) return;
        const count = className ? rows.filter(row => row.student.class === className).length : rows.length;
        summary.textContent = rows.length
            ? `${count} siswa · ${className || 'semua rombel tingkat ' + el('reportGrade').value} · ${rows.filter(row => ReportCore.reportCheck(row).complete && (!className || row.student.class === className)).length} rapor lengkap`
            : 'Mencari data siswa dan nilai periode terpilih...';
        summary.classList.toggle('is-warning', !count);
    }
    function downloadSelection() {
        const className = el('reportDownloadClass')?.value || '';
        const selectedRows = className ? rows.filter(row => row.student.class === className) : [...rows];
        if (!selectedRows.length) throw Error('Belum ada siswa pada pilihan ini.');
        return { rows: selectedRows, label: className || `Kelas ${el('reportGrade').value} (semua rombel)` };
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
            el('reportStudent').value = String(candidates[Math.floor(Math.random() * candidates.length)].student.id);
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
            const previousDownloadClass = el('reportDownloadClass')?.value || '';
            if (el('reportDownloadClass')) {
                el('reportDownloadClass').replaceChildren(new Option('Semua rombel', ''));
                classes.forEach(name => el('reportDownloadClass').add(new Option(name, name)));
                if (classes.includes(previousDownloadClass)) el('reportDownloadClass').value = previousDownloadClass;
                refreshDownloadScope();
            }
            const complete = rows.filter(row => ReportCore.reportCheck(row).complete).length;
            el('reportChecks').textContent = `${rows.length} siswa · ${classes.length} rombel · ${complete} lengkap · ${rows.length - complete} belum lengkap`;
            tell('Data nilai terbaru dimuat. Identitas pratinjau menggunakan data Supabase, bukan contoh Excel.');
            return true;
        }
        catch (error) {
            rows = [];
            loadedKey = '';
            previewToken++;



            el('reportChecks').textContent = 'Data belum tersedia';


            tell(error.message);
            return false;
        }
        finally {
            setBusy(false);
            if (pendingDownloadLoad && activeTab === 'print') {
                pendingDownloadLoad = false;
                void load(true);
            }
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
            const studentTitle = document.createElement('strong');
            studentTitle.textContent = report.student.name + ' · ' + report.student.class;
            status.replaceChildren(studentTitle, badge, metrics);
            renderIdentityAudit(report, errors);
            const canvas = GMReportTemplate.renderPreview(report, { draft: !checked.complete });
            if (token === previewToken)
                el('reportPreview').replaceChildren(canvas);
        }
        catch (error) {
            if (token === previewToken) {
                el('reportStudentStatus').textContent = 'Pratinjau belum dapat ditampilkan: ' + error.message;
                tell(error.message);
            }
        }
    }
    function step(amount) {
        const list = visible(), index = list.findIndex(row => String(row.student.id) === el('reportStudent').value);
        if (!list.length)
            return;
        el('reportStudent').value = String(list[Math.max(0, Math.min(list.length - 1, index + amount))].student.id);
        preview();
    }
    async function download(retry = false, format = 'word') {
        if (busy) return;
        if (retry && lastDownloadAttempt) {
            format = lastDownloadAttempt.format || 'word';
            if (el('reportDownloadClass')) el('reportDownloadClass').value = lastDownloadAttempt.className || '';
            refreshDownloadScope();
        }
        if (!await load(true) || !rows.length) return;
        let selection;
        try { selection = downloadSelection(); }
        catch (error) { tell(error.message); refreshDownloadScope(); return; }
        const selectedRows = selection.rows;
        if (selectedRows.some(row => !ReportCore.reportCheck(row).complete)) {
            tell(`Belum dapat mengunduh ${selection.label}: nilai wajib atau identitas belum lengkap. Periksa melalui Dashboard.`); return;
        }
        const formatName = format === 'excel' ? 'Excel' : 'Word';
        lastDownloadAttempt = {
            format,
            mode: el('reportDownloadMode')?.value || 'grade',
            className: el('reportDownloadClass')?.value || '',
            label: selection.label
        };
        if (el('reportRetryDownload')) el('reportRetryDownload').hidden = true;
        if (el('reportPdfLink')) el('reportPdfLink').hidden = true;
        downloadStartedAt = Date.now();
        updatePdfProgress({ visible: true, title: `Menyiapkan ${selection.label}`, total: selectedRows.length });
        setBusy(true);
        try {
            const pdfName = `Rapor ${selection.label} - ${el('reportExam').value.toUpperCase()} Semester ${el('reportSemester').value === 'ganjil' ? '1' : '2'} - ${el('reportYear').value}-${Number(el('reportYear').value)+1}.${format === 'excel' ? 'xlsx' : 'docx'}`;
            const blob = await ReportZip.build(selectedRows, {
                fileName: pdfName, format,
                onProgress: (n, total, row) => {
                    updatePdfProgress({ visible: true, title: 'Menyusun halaman rapor', n, total, row });
                    tell(n ? `Menyusun rapor ${n}/${total} halaman (${Math.round(n / total * 100)}%)...` : 'Menyiapkan dokumen rapor...');
                }
            });
            updatePdfProgress({ visible: true, title: 'Mencatat penerbitan rapor', n: selectedRows.length, total: selectedRows.length, row: selectedRows.at(-1) });
            const issued = await supabase.rpc('record_report_issuance', { entries: selectedRows.map(row => ({ student_id: row.student.id, year: row.year, period: row.period, fingerprint: row.fingerprint })) });
            if (issued.error) throw issued.error;
            if (pdfUrl) URL.revokeObjectURL(pdfUrl);
            pdfUrl = URL.createObjectURL(blob);
            const link = el('reportPdfLink');
            link.href = pdfUrl;
            const scope = ReportZip.safe(selection.label);
            link.download = window.GMFileName?.report?.({
                exam: el('reportExam').value,
                semester: el('reportSemester').value === 'ganjil' ? '1' : '2',
                scope,
                year: Number(el('reportYear').value),
                ext: 'zip'
            }) || `Rapor ${el('reportExam').value.toUpperCase()} Semester ${el('reportSemester').value === 'ganjil' ? '1':'2'} - ${scope} - ${el('reportYear').value}-${Number(el('reportYear').value)+1}.zip`;
            link.download = link.download.replace(/\.zip$/i, ` - ${formatName}.zip`);
            link.hidden = false; link.textContent = `Simpan ZIP ${formatName}`; link.click();
            updatePdfProgress({ visible: true, title: `${formatName} selesai`, n: selectedRows.length, total: selectedRows.length, done: true });
            tell(`ZIP selesai: 1 ${formatName} berisi ${selectedRows.length} ${format === 'excel' ? 'lembar' : 'halaman'} rapor · ${selection.label} · ${formatDuration(Date.now() - downloadStartedAt)}.`);
        } catch (error) {
            if (el('reportRetryDownload')) el('reportRetryDownload').hidden = false;
            updatePdfProgress({ visible: true, title: `Pembuatan ${formatName} terhenti`, n: 0, total: selectedRows.length, error: `${error.message} Data rapor yang sudah dimuat tetap tersedia; tekan Coba Lagi yang Gagal.` });
            tell(`${error.message}. Tekan Coba Lagi yang Gagal untuk mengulang tanpa memuat ulang data yang masih valid.`);
        } finally { setBusy(false); refreshDownloadScope(); }
    }
    function changeTab(tab) {
        if (!['print','archive'].includes(tab)) return;
        activeTab = tab;
        el('reportViewPrint').hidden = tab !== 'print';
        el('page-arsip').classList.toggle('hidden',tab !== 'archive');
        document.querySelectorAll('[data-rapor-view]').forEach(button => {
            const chosen = button.dataset.raporView === tab;
            button.classList.toggle('active',chosen);
            button.setAttribute('aria-selected',String(chosen));
            button.tabIndex = chosen ? 0 : -1;
        });
        if (tab === 'print') {
            if (busy) pendingDownloadLoad = true;
            else void load(false);
        } else {
            ++previewSearchToken;
            void GMUpgrade.archive();
        }
    }
    function open(tab = null) {
        if (AppAccess.profile?.role !== 'koordinator') return;
        el('reportYear').value ||= String(new Date().getFullYear() - (new Date().getMonth() < 6 ? 1 : 0));
        changeTab(tab === 'archive' ? 'archive' : activeTab);
    }
    async function openMissing(options = {}) {
        if (AppAccess.profile?.role !== 'koordinator') return false;
        const [exam = 'pts', semester = 'ganjil'] = String(options.period || 'pts_ganjil').split('_');
        el('reportYear').value = String(options.year || el('reportYear').value);
        el('reportPeriod').value = exam + '_' + semester;
        el('reportExam').value = exam;
        el('reportSemester').value = semester;
        el('reportGrade').value = String(options.className || '').match(/(\\d+)/)?.[1] || '1';
        changeTab('print');
        return true;
    }
    ((callback) => window.GMPanel ? GMPanel.onReady(callback) : document.addEventListener('panelready',callback))(() => {
        const tabs = [...document.querySelectorAll('[data-rapor-view]')];
        tabs.forEach((button,index) => {
            button.addEventListener('click',()=>changeTab(button.dataset.raporView));
            button.addEventListener('keydown',event=>{
                if (!['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return;
                event.preventDefault();
                const next=event.key==='Home'?0:event.key==='End'?tabs.length-1:
                    (index+(event.key==='ArrowRight'?1:-1)+tabs.length)%tabs.length;
                changeTab(tabs[next].dataset.raporView);tabs[next].focus();
            });
        });
        el('reportViewPrint').hidden = false;
        el('page-arsip').classList.add('hidden');
        el('loadReports').addEventListener('click',()=>void load(true));
        el('downloadReports').addEventListener('click',()=>void download(false,'word'));
        el('downloadReportsExcel').addEventListener('click',()=>void download(false,'excel'));
        el('reportRetryDownload').addEventListener('click',()=>void download(true));
        el('reportDownloadClass').addEventListener('change',refreshDownloadScope);
        el('reportPeriod').addEventListener('change',()=>{
            const [exam,semester]=el('reportPeriod').value.split('_');
            el('reportExam').value=exam;el('reportSemester').value=semester;
            rows=[];loadedKey='';el('reportDownloadClass').value='';
            if(activeTab==='print'){if(busy)pendingDownloadLoad=true;else void load(true)}
        });
        for(const id of ['reportGrade','reportYear']) el(id).addEventListener('change',()=>{
            rows=[];loadedKey='';el('reportDownloadClass').value='';
            if(activeTab==='print'){if(busy)pendingDownloadLoad=true;else void load(true)}
        });
    });
    return {open,openMissing,isBusy:()=>busy};
})();
