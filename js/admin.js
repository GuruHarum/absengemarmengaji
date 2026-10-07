if (typeof filterYear === 'undefined') {
    window.filterYear = document.getElementById('filterYear');
}
if (typeof filterMonth === 'undefined') {
    window.filterMonth = document.getElementById('filterMonth');
}
if (typeof filterTeacher === 'undefined') {
    window.filterTeacher = document.getElementById('filterTeacher');
}
if (typeof filterClassNumber === 'undefined') {
    window.filterClassNumber = document.getElementById('filterClassNumber');
}
if (typeof filterClassName === 'undefined') {
    window.filterClassName = document.getElementById('filterClassName');
}
if (typeof adminDataList === 'undefined') {
    window.adminDataList = document.getElementById('adminDataList');
}
if (typeof recordCount === 'undefined') {
    window.recordCount = document.getElementById('recordCount');
}
if (typeof pageIndicator === 'undefined') {
    window.pageIndicator = document.getElementById('pageIndicator');
}
if (typeof prevPage === 'undefined') {
    window.prevPage = document.getElementById('prevPage');
}
if (typeof nextPage === 'undefined') {
    window.nextPage = document.getElementById('nextPage');
}
if (typeof reportContainer === 'undefined') {
    window.reportContainer = document.getElementById('reportContainer');
}
if (typeof attendanceData === 'undefined') {
    window.attendanceData = [];
}
if (typeof filteredAttendanceData === 'undefined') {
    window.filteredAttendanceData = [];
}
if (typeof currentPage === 'undefined') {
    window.currentPage = 1;
}
if (typeof recordsPerPage === 'undefined') {
    window.recordsPerPage = 10;
}
function formatDateForDisplay(dateVal) {
    if (!dateVal)
        return '-';
    const d = new Date(dateVal);
    if (isNaN(d.getTime()))
        return String(dateVal);
    return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
}
function getFilteredAttendanceRecords(records) {
    const value = id => document.getElementById(id)?.value || '';
    const year = value('filterYear');
    const month = value('filterMonth');
    const teacher = value('filterTeacher');
    const level = value('filterClassNumber');
    const className = value('filterClassName');
    const teacherRecord = typeof teachersData !== 'undefined'
        ? teachersData.find(item => String(item.id) === teacher) : null;
    return records.filter(item => {
        const date = String(item.date || '').slice(0, 10);
        const itemTeacher = item.teacher || item.nama_guru || '';
        const itemClass = item.class || item.kelas || item.kelas_nama || '';
        if (year && date.slice(0, 4) !== year)
            return false;
        if (month && date.slice(5, 7) !== month.padStart(2, '0'))
            return false;
        if (teacher && !(window.GMFilter ? GMFilter.teacherMatches(item, teacher) : (itemTeacher === teacher || itemTeacher === teacherRecord?.nama || String(item.teacher_id ?? item.guru_id ?? '') === teacher)))
            return false;
        if (level && String(item.kelas_tingkat || extractClassNumber(itemClass)) !== level)
            return false;
        if (className && !(window.GMFilter ? GMFilter.classMatches(item, className) : itemClass === className))
            return false;
        return true;
    });
}
async function filterAttendanceData() {
    const yearVal = filterYear ? filterYear.value : '';
    const monthVal = filterMonth ? filterMonth.value : '';
    const teacherVal = filterTeacher ? filterTeacher.value : '';
    const classNumVal = filterClassNumber ? filterClassNumber.value : '';
    if (monthVal) {
        const year = yearVal || new Date().getFullYear().toString();
        const from = `${year}-${String(monthVal).padStart(2, '0')}-01`;
        const lastDay = new Date(Number(year), Number(monthVal), 0).getDate();
        const to = `${year}-${String(monthVal).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
        try {
            await fetchAttendanceData({ date_from: from, date_to: to });
        }
        catch (e) {
            console.error('Gagal fetch data untuk filter bulan:', e);
        }
    }
    await loadAttendanceLog();
    if (monthVal && reportContainer) {
        if (typeof window.renderMonthlyReportTable !== 'function') {
            reportContainer.style.display = 'block';
            if (typeof renderAdminTable === 'function') {
                renderAdminTable();
            }
            else if (typeof generateMonthlyReport === 'function') {
                generateMonthlyReport();
            }
        }
    }
    else if (reportContainer) {
        reportContainer.style.display = 'none';
    }
}
function renderAdminData() {
    if (!adminDataList)
        return;
    const startIndex = (currentPage - 1) * recordsPerPage;
    const endIndex = Math.min(startIndex + recordsPerPage, filteredAttendanceData.length);
    const currentRecords = filteredAttendanceData.slice(startIndex, endIndex);
    if (recordCount)
        recordCount.textContent = filteredAttendanceData.length;
    if (pageIndicator)
        pageIndicator.textContent = currentPage;
    updatePaginationButtons();
    if (currentRecords.length === 0) {
        adminDataList.innerHTML = `
            <tr>
                <td colspan="5" class="py-8 text-center text-slate-400 font-medium">
                    Tidak ada arsip log riwayat absensi tersedia.
                </td>
            </tr>
        `;
        return;
    }
    adminDataList.innerHTML = currentRecords.map(record => `
        <tr class="hover:bg-slate-50 transition-all border-b border-slate-100">
            <td class="log-student">${escapeHtml(record.student || record.nama_siswa || '-')}</td>
            <td class="px-4 py-3.5">${escapeHtml(record.class || record.kelas_nama || '-')}</td>
            <td class="px-6 py-3.5">
                <span class="px-2.5 py-1 rounded-full text-[11px] font-bold uppercase tracking-wide inline-flex items-center gap-1
                    ${String(record.status).toLowerCase() === 'hadir' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' :
        String(record.status).toLowerCase() === 'sakit' ? 'bg-amber-50 text-amber-700 border border-amber-200' :
            String(record.status).toLowerCase() === 'izin' ? 'bg-sky-50 text-sky-700 border border-sky-200' :
                'bg-rose-50 text-rose-700 border border-rose-200'}">
                    ${String(record.status).toLowerCase() === 'hadir' ? '✅ Hadir' :
        String(record.status).toLowerCase() === 'sakit' ? '🤒 Sakit' :
            String(record.status).toLowerCase() === 'izin' ? '📝 Izin' :
                '❌ Alpha'}
                </span>
            </td>
            <td class="px-6 py-3.5 text-slate-500 italic">${escapeHtml(record.note || record.catatan || '-')}</td>
            <td class="px-6 py-3.5"><div class="flex gap-2"><button type="button" class="secondary-action" data-log-edit="${escapeHtml(String(record.id))}">Edit</button><button type="button" class="secondary-action" data-log-delete="${escapeHtml(String(record.id))}">Hapus</button></div></td>
        </tr>
    `).join('');
    adminDataList.querySelectorAll('[data-log-edit], [data-log-delete]').forEach(button => {
        button.onclick = () => attendanceLogAction(button);
    });
}
async function attendanceLogAction(button) {
    const deleting = button.hasAttribute('data-log-delete');
    const id = deleting ? button.dataset.logDelete : button.dataset.logEdit;
    const record = filteredAttendanceData.find(row => String(row.id) === id);
    if (!record) return AdminNotice.notify('Data absensi tidak ditemukan. Muat ulang log.', 'error');
    if (!deleting) {
        const dialog = document.createElement('dialog');
        dialog.className = 'admin-confirm';
        dialog.setAttribute('aria-label', 'Edit absensi');
        dialog.innerHTML = `<form><h2>Edit absensi</h2><p>${escapeHtml(record.student || record.nama_siswa || '-')} · ${escapeHtml(record.date || '')}</p><label class="field-label">Status<select name="status"><option value="hadir">Hadir</option><option value="sakit">Sakit</option><option value="izin">Izin</option><option value="alpha">Alpha</option></select></label><label class="field-label">Catatan<textarea name="note" rows="3"></textarea></label><p data-error role="alert"></p><div class="confirm-actions"><button type="button" class="secondary-action" data-cancel>Batal</button><button type="submit" class="primary-action">Simpan</button></div></form>`;
        const form = dialog.querySelector('form');
        form.elements.status.value = String(record.status || 'hadir').toLowerCase();
        form.elements.note.value = record.note || record.catatan || '';
        let saving = false;
        dialog.querySelector('[data-cancel]').onclick = () => { if (!saving) dialog.close(); };
        dialog.oncancel = event => { if (saving) event.preventDefault(); };
        dialog.onclose = () => dialog.remove();
        form.onsubmit = async event => {
            event.preventDefault();
            if (saving) return;
            saving = true;
            form.querySelectorAll('button').forEach(b => b.disabled = true);
            try {
                await updateAttendance(id, { status: form.elements.status.value, note: form.elements.note.value.trim() });
                dialog.close();
                await loadAttendanceLog();
                AdminNotice.notify('Absensi berhasil diperbarui.', 'success');
            } catch (error) { dialog.querySelector('[data-error]').textContent = error.message || 'Gagal memperbarui absensi.'; }
            finally { saving = false; form.querySelectorAll('button').forEach(b => b.disabled = false); }
        };
        document.body.append(dialog);
        dialog.showModal();
        return;
    }
    if (!await AdminNotice.confirm(`Hapus absensi ${record.student || record.nama_siswa || '-'} tanggal ${record.date}?`)) return;
    button.disabled = true;
    try {
        await deleteAttendance(id);
        await loadAttendanceLog();
        AdminNotice.notify('Absensi berhasil dihapus.', 'success');
    } catch (error) { AdminNotice.notify(error.message || 'Gagal menghapus absensi.', 'error'); }
    finally { button.disabled = false; }
}
function renderAdminTable() {
    const tbody = document.getElementById('monthlyReportTable');
    if (!tbody)
        return;
    tbody.innerHTML = '';
    const month = (filterMonth) ? filterMonth.value : '01';
    const teacher = (filterTeacher) ? filterTeacher.value : '';
    const classNumber = (filterClassNumber) ? filterClassNumber.value : '';
    const className = (filterClassName) ? filterClassName.value : '';
    const year = new Date().getFullYear();
    const daysInMonth = new Date(year, parseInt(month) || 1, 0).getDate();
    const todayObj = new Date();
    const todayStr = `${todayObj.getFullYear()}-${String(todayObj.getMonth() + 1).padStart(2, '0')}-${String(todayObj.getDate()).padStart(2, '0')}`;
    const safeLowerCase = (val) => (val === null || val === undefined) ? '' : String(val).toLowerCase().trim();
    const localExtractClassNumber = (classVal) => {
        if (!classVal)
            return '';
        const match = String(classVal).match(/\d+/);
        return match ? match[0] : String(classVal).trim();
    };
    const formatDateToYYYYMMDD = (dateVal) => {
        if (!dateVal)
            return '';
        const dateStr = String(dateVal);
        if (dateStr.includes('-') && dateStr.length >= 10)
            return dateStr.substring(0, 10);
        const d = new Date(dateVal);
        if (isNaN(d.getTime()))
            return '';
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    };
    let filteredStudents = Array.isArray(window.tahsinRosterStudents) ? [...window.tahsinRosterStudents] : (typeof studentsData !== 'undefined' && Array.isArray(studentsData) ? [...studentsData] : []);
    if (teacher) {
        filteredStudents = filteredStudents.filter(student => {
            if (!student)
                return false;
            const namaGuru = student['nama guru'] || student.nama_guru || '';
            return window.GMFilter ? GMFilter.teacherMatches(student, teacher) : safeLowerCase(namaGuru) === safeLowerCase(teacher);
        });
    }
    if (className) {
        filteredStudents = filteredStudents.filter(student => {
            if (!student)
                return false;
            const kelasSiswa = student.kelas || student.kelas_nama || '';
            return window.GMFilter ? GMFilter.classMatches(student,className) : safeLowerCase(kelasSiswa) === safeLowerCase(className);
        });
    }
    else if (classNumber) {
        filteredStudents = filteredStudents.filter(student => {
            if (!student)
                return false;
            const kelasSiswa = student.kelas || student.kelas_nama || '';
            return localExtractClassNumber(kelasSiswa) === classNumber;
        });
    }
    filteredStudents.sort((a, b) => {
        const namaA = a ? (a['nama siswa'] || a.nama_siswa || '') : '';
        const namaB = b ? (b['nama siswa'] || b.nama_siswa || '') : '';
        return String(namaA).localeCompare(String(namaB));
    });
    const listAbsensi = Array.isArray(attendanceData) ? attendanceData : [];
    let headerDaysHtml = '';
    for (let day = 1; day <= daysInMonth; day++) {
        headerDaysHtml += `<th class="p-1 text-center border border-slate-200 min-w-[28px] bg-slate-50">${day}</th>`;
    }
    tbody.innerHTML = `
        <thead>
            <tr class="bg-slate-100 text-slate-700 font-bold border border-slate-200">
                <th class="p-2 border border-slate-200 text-center" rowspan="2">No</th>
                <th class="p-2 border border-slate-200 text-left min-w-[180px]" rowspan="2">Nama Siswa</th>
                ${headerDaysHtml}
                <th class="p-1 border border-slate-200 text-center text-emerald-600 bg-emerald-50" title="Hadir">H</th>
                <th class="p-1 border border-slate-200 text-center text-amber-600 bg-amber-50" title="Sakit">S</th>
                <th class="p-1 border border-slate-200 text-center text-sky-600 bg-sky-50" title="Izin">I</th>
                <th class="p-1 border border-slate-200 text-center text-rose-600 bg-rose-50" title="Alpha">A</th>
                <th class="p-2 border border-slate-200 text-center bg-slate-50">%</th>
            </tr>
        </thead>
        <tbody id="monthlyReportTableBody" class="divide-y divide-slate-200"></tbody>
    `;
    const reportBody = document.getElementById('monthlyReportTableBody');
    if (!reportBody)
        return;
    const attendanceMap = new Map();
    listAbsensi.forEach(record => {
        if (!record)
            return;
        const date = formatDateToYYYYMMDD(record.date || record.tanggal);
        const student = safeLowerCase(record.nama_siswa || record.student || record.student_name);
        if (date && record.student_id != null) attendanceMap.set(`${date}|id:${record.student_id}|${record.teacher_id ?? ''}`,record);
        else if (date && student) attendanceMap.set(`${date}|legacy:${student}|${safeLowerCase(record.class)}|${safeLowerCase(record.teacher)}`,record);
    });
    filteredStudents.forEach((student, index) => {
        if (!student)
            return;
        const studentName = student['nama siswa'] || student.nama_siswa || 'Tanpa Nama';
        let hadirCount = 0, sakitCount = 0, izinCount = 0, alphaCount = 0;
        let cellsHtml = '';
        for (let day = 1; day <= daysInMonth; day++) {
            const dateStr = `${year}-${month}-${String(day).padStart(2, '0')}`;
            const record = attendanceMap.get(`${dateStr}|id:${student.id}|${student.teacher_id ?? GMFilter?.teacherId(teacher) ?? ''}`) ||
                attendanceMap.get(`${dateStr}|legacy:${safeLowerCase(studentName)}|${safeLowerCase(student.kelas)}|${safeLowerCase(student['nama guru'])}`);
            let statusCode = '';
            let bgClass = '';
            if (record) {
                const status = safeLowerCase(record.status);
                if (status === 'hadir' || status === 'h') {
                    statusCode = 'H';
                    hadirCount++;
                    bgClass = 'bg-emerald-50 text-emerald-700';
                }
                else if (status === 'sakit' || status === 's') {
                    statusCode = 'S';
                    sakitCount++;
                    bgClass = 'bg-amber-50 text-amber-700';
                }
                else if (status === 'izin' || status === 'i') {
                    statusCode = 'I';
                    izinCount++;
                    bgClass = 'bg-sky-50 text-sky-700';
                }
                else if (status === 'alfa' || status === 'alpha' || status === 'a' || status === '-') {
                    statusCode = '-';
                    alphaCount++;
                    bgClass = 'bg-rose-50 text-rose-700';
                }
            }
            else if (dateStr < todayStr) {
                statusCode = '-';
                alphaCount++;
                bgClass = 'bg-rose-50 text-rose-700';
            }
            cellsHtml += `<td class="border border-slate-100 p-1 text-center font-semibold text-[11px] ${bgClass}">${statusCode || '-'}</td>`;
        }
        const totalDays = hadirCount + sakitCount + izinCount + alphaCount;
        const attendancePercentage = totalDays > 0 ? Math.round((hadirCount / totalDays) * 100) : 0;
        const tr = document.createElement('tr');
        tr.className = "hover:bg-slate-50 transition-all";
        tr.innerHTML = `
            <td class="border border-slate-200 p-2 text-center text-slate-500">${index + 1}</td>
            <td class="border border-slate-200 p-2 font-medium text-slate-800 whitespace-nowrap">${studentName}</td>
            ${cellsHtml}
            <td class="border border-slate-200 p-1 text-center font-bold text-emerald-600 bg-emerald-50/30">${hadirCount}</td>
            <td class="border border-slate-200 p-1 text-center font-bold text-amber-600 bg-amber-50/30">${sakitCount}</td>
            <td class="border border-slate-200 p-1 text-center font-bold text-sky-600 bg-sky-50/30">${izinCount}</td>
            <td class="border border-slate-200 p-1 text-center font-bold text-rose-600 bg-rose-50/30">${alphaCount}</td>
            <td class="border border-slate-200 p-2 text-center font-black text-slate-700 bg-slate-50">${attendancePercentage}%</td>
        `;
        reportBody.appendChild(tr);
    });
}
function updatePaginationButtons() {
    if (!prevPage || !nextPage)
        return;
    const maxPage = Math.ceil(filteredAttendanceData.length / recordsPerPage) || 1;
    prevPage.disabled = (currentPage === 1);
    nextPage.disabled = (currentPage >= maxPage);
}
function populateAdminDropdowns() {
    const dropdownGuru = document.getElementById('filterTeacher');
    const dropdownTingkat = document.getElementById('filterClassNumber');
    const dropdownNamaKelas = document.getElementById('filterClassName');
    if (dropdownGuru && (Array.isArray(window.tahsinRosterTeachers) || (typeof teachersData !== 'undefined' && Array.isArray(teachersData)))) {
        dropdownGuru.innerHTML = '<option value="">Semua Guru</option>';
        const masterTeachers = Array.isArray(window.tahsinRosterTeachers) ? window.tahsinRosterTeachers : teachersData.filter(g => g.attendance_enabled !== false);
        const uniqueTeachers = [...new Set(masterTeachers.map(g => g.nama || g.nama_guru).filter(Boolean))].sort();
        uniqueTeachers.forEach(name => {
            const option = document.createElement('option');
            option.value = name;
            option.textContent = name;
            dropdownGuru.appendChild(option);
        });
        if (window.AppAccess?.teacher()) {
            dropdownGuru.value = AppAccess.profile.teacherName;
            dropdownGuru.disabled = true;
        }
    }
    if (dropdownTingkat && (Array.isArray(window.tahsinRosterStudents) || Array.isArray(studentsData))) {
        const classRoster = Array.isArray(window.tahsinRosterStudents) ? window.tahsinRosterStudents : studentsData;
        dropdownTingkat.innerHTML = '<option value="">Semua Tingkat</option>';
        const uniqueTingkat = [...new Set(classRoster.map(s => {
                const kelas = s.kelas || s.kelas_nama || '';
                const match = kelas.match(/\d+/);
                return match ? match[0] : kelas;
            }).filter(Boolean))].sort();
        uniqueTingkat.forEach(tingkat => {
            const option = document.createElement('option');
            option.value = tingkat;
            option.textContent = "Tingkat " + tingkat;
            dropdownTingkat.appendChild(option);
        });
    }
    if (dropdownNamaKelas && (Array.isArray(window.tahsinRosterStudents) || Array.isArray(studentsData))) {
        const classRoster = Array.isArray(window.tahsinRosterStudents) ? window.tahsinRosterStudents : studentsData;
        dropdownNamaKelas.innerHTML = '<option value="">Semua Nama Kelas</option>';
        const uniqueNamaKelas = [...new Set(classRoster.map(s => s.kelas || s.kelas_nama).filter(Boolean))].sort();
        uniqueNamaKelas.forEach(kelas => {
            const option = document.createElement('option');
            option.value = kelas;
            option.textContent = kelas;
            dropdownNamaKelas.appendChild(option);
        });
    }
}
if (prevPage) {
    prevPage.addEventListener('click', () => {
        if (currentPage > 1) {
            currentPage--;
            renderAdminData();
        }
    });
}
if (nextPage) {
    nextPage.addEventListener('click', () => {
        const maxPage = Math.ceil(filteredAttendanceData.length / recordsPerPage) || 1;
        if (currentPage < maxPage) {
            currentPage++;
            renderAdminData();
        }
    });
}
const filterBtn = document.getElementById('filterBtn');
if (filterBtn && !window.GM_DASHBOARD_OWNS_FILTER) {
    filterBtn.addEventListener('click', filterAttendanceData);
}
window.addEventListener(document.body.classList.contains('admin-page') ? 'panelready' : 'DOMContentLoaded', () => {
    setTimeout(() => {
        if (typeof attendanceData !== 'undefined' && attendanceData.length > 0) {
            if (document.getElementById('attendanceLogDate')) { void loadAttendanceLog(); return; }
            filteredAttendanceData = [...attendanceData];
            populateAdminDropdowns();
            renderAdminData();
        }
    }, 1000);
});
