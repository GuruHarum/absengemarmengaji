let currentPage = 1;
let recordsPerPage = 10;
const reportContainer = document.getElementById('reportContainer');
const monthlyReportTable = document.getElementById('monthlyReportTable');
const avgAttendanceRate = document.getElementById('avgAttendanceRate');
const metaGuru = document.getElementById('metaGuru');
const metaKelas = document.getElementById('metaKelas');
const metaBulan = document.getElementById('metaBulan');
function formatDateToYYYYMMDD(dateVal) {
    if (!dateVal)
        return '';
    try {
        const raw = String(dateVal);
        if (/^\d{4}-\d{2}-\d{2}/.test(raw))
            return raw.slice(0, 10);
        const d = new Date(dateVal);
        if (isNaN(d.getTime()))
            return '';
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }
    catch (e) {
        return '';
    }
}
function safeLowerCase(val) {
    if (val === undefined || val === null)
        return '';
    return String(val).toLowerCase().trim();
}
async function renderMonthlyReportTable(selectedMonth, selectedYear, selectedTeacher, selectedClass, isInitialLoad = false) {
    const monthlyReportTable = document.getElementById('monthlyReportTable');
    const avgAttendanceRate = document.getElementById('avgAttendanceRate');
    if (!monthlyReportTable)
        return;
    if (isInitialLoad) {
        monthlyReportTable.innerHTML = `
            <tr>
                <td class="p-12 text-center text-slate-500">
                    <div class="flex flex-col items-center justify-center gap-3">
                        <svg class="w-12 h-12 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                        </svg>
                        <span class="font-medium text-slate-600">Silakan pilih filter di atas dan klik "Terapkan Filter Data" untuk melihat rekap bulanan.</span>
                    </div>
                </td>
            </tr>
        `;
        if (avgAttendanceRate)
            avgAttendanceRate.innerText = "0.00%";
        return;
    }
    showLoading(true);
    try {
        if (typeof fetchStudents === 'function' && studentsData.length === 0 && !Array.isArray(window.tahsinRosterStudents)) {
            await fetchStudents();
        }
        if (typeof fetchAttendanceData === 'function' && !window.GM_ATTENDANCE_FILTER_FETCHED) {
            const ym = `${selectedYear}-${String(selectedMonth).padStart(2,'0')}`;
            const last = new Date(Number(selectedYear), Number(selectedMonth), 0).getDate();
            await fetchAttendanceData({date_from:`${ym}-01`,date_to:`${ym}-${String(last).padStart(2,'0')}`});
        }
        const yearInt = parseInt(selectedYear) || new Date().getFullYear();
        const monthInt = parseInt(selectedMonth) || (new Date().getMonth() + 1);
        const daysInMonth = new Date(yearInt, monthInt, 0).getDate();
        const yearStr = String(yearInt);
        const monthStr = String(monthInt).padStart(2, '0');
        const todayObj = new Date();
        const todayStr = `${todayObj.getFullYear()}-${String(todayObj.getMonth() + 1).padStart(2, '0')}-${String(todayObj.getDate()).padStart(2, '0')}`;
        if (typeof metaGuru !== 'undefined')
            metaGuru.innerText = selectedTeacher || "Semua Guru";
        if (typeof metaKelas !== 'undefined')
            metaKelas.innerText = selectedClass || "Semua Kelas";
        if (typeof metaBulan !== 'undefined' && typeof getMonthName === 'function') {
            metaBulan.innerText = `${getMonthName(monthInt)} ${yearInt}`;
        }
        const attendanceRoster = Array.isArray(window.tahsinRosterStudents) ? window.tahsinRosterStudents : studentsData;
        let filteredStudents = [...attendanceRoster];
        if (selectedTeacher) {
            const teacherKey = safeLowerCase(selectedTeacher);
            filteredStudents = filteredStudents.filter(student => window.GMFilter ? GMFilter.teacherMatches(student,selectedTeacher) : safeLowerCase(student['nama guru'] || student.nama_guru) === teacherKey);
        }
        if (selectedClass && selectedClass !== "Semua Tingkat" && selectedClass !== "Semua Nama Kelas") {
            const cleanSelectedClass = selectedClass.toString().toLowerCase().trim();
            filteredStudents = filteredStudents.filter(student => {
                const studentClass = student.kelas || student.class_name || student.kelas_nama || "";
                const cleanStudentClass = studentClass.toString().toLowerCase().trim();
                const classNumber = extractClassNumber(String(studentClass));
                return (window.GMFilter && !/^\d+$/.test(cleanSelectedClass)) ? GMFilter.classMatches(student, selectedClass) : (cleanStudentClass === cleanSelectedClass || classNumber === cleanSelectedClass);
            });
            if (selectedTeacher) {
                const teacherKey = safeLowerCase(selectedTeacher);
                filteredStudents = filteredStudents.filter(student => window.GMFilter ? GMFilter.teacherMatches(student,selectedTeacher) : safeLowerCase(student['nama guru'] || student.nama_guru) === teacherKey);
            }
        }
        filteredStudents.sort((a, b) => String(a['nama siswa'] || a.nama || '').localeCompare(String(b['nama siswa'] || b.nama || ''), 'id'));
        if (filteredStudents.length === 0) {
            monthlyReportTable.innerHTML = `
                <tr>
                    <td class="p-8 text-center text-slate-400">Data Siswa Tidak Ditemukan.</td>
                </tr>
            `;
            if (avgAttendanceRate)
                avgAttendanceRate.innerText = "0.00%";
            showLoading(false);
            return;
        }
        let headerHtml = `
            <thead class="bg-slate-100 text-slate-700 font-bold border-b border-slate-300">
                <tr class="divide-x divide-slate-200">
                    <th class="px-4 py-3 min-w-[200px] sticky left-0 bg-slate-100 z-10 shadow-[2px_0_5px_rgba(0,0,0,0.05)]">Nama Siswa</th>
        `;
        for (let d = 1; d <= daysInMonth; d++) {
            headerHtml += `<th class="px-1 py-3 text-center w-8">${d}</th>`;
        }
        headerHtml += `
                    <th class="px-2 py-3 text-center bg-blue-50 text-blue-800 w-10">H</th>
                    <th class="px-2 py-3 text-center bg-blue-50 text-blue-800 w-10">S</th>
                    <th class="px-2 py-3 text-center bg-blue-50 text-blue-800 w-10">I</th>
                    <th class="px-2 py-3 text-center bg-blue-50 text-blue-800 w-10">A</th>
                    <th class="px-3 py-3 text-center bg-blue-100 text-blue-900 font-extrabold w-16">%</th>
                </tr>
            </thead>
        `;
        let bodyHtml = `<tbody class="divide-y divide-slate-200 bg-white text-slate-800">`;
        let totalPercent = 0;
        let totalPercentStudents = 0;
        const attendanceMap = new Map();
        const attendanceByStudentDate = new Map();
        const attendanceById = new Map();
        attendanceData.forEach(record => {
            if (!record)
                return;
            const recordDate = formatDateToYYYYMMDD(record.date || record.tanggal);
            const recordStudent = safeLowerCase(record.nama_siswa || record.student || record.student_name);
            const recordTeacher = safeLowerCase(record.nama_guru || record.teacher || record.teacher_name);
            if (recordDate && record.student_id != null) {
                attendanceById.set(`${recordDate}|${record.student_id}|${record.teacher_id ?? ''}`,record);
            }
            if (recordDate && recordStudent && record.student_id == null) {
                attendanceMap.set(`${recordDate}|${recordStudent}|${recordTeacher}|${safeLowerCase(record.class)}`, record);
                attendanceMap.set(`${recordDate}|${recordStudent}||${safeLowerCase(record.class)}`, record);
                attendanceByStudentDate.set(`${recordDate}|${recordStudent}|${safeLowerCase(record.class)}`, record);
            }
        });
        filteredStudents.forEach(student => {
            const studentName = student["nama siswa"] || student.nama || student.student_name || "";
            let hadirCount = 0;
            let sakitCount = 0;
            let izinCount = 0;
            let alphaCount = 0;
            let studentRow = `
                <tr class="divide-x divide-slate-200 hover:bg-slate-50 transition-colors">
                    <td class="px-4 py-3 font-semibold text-slate-800 sticky left-0 bg-white hover:bg-slate-50 z-10 shadow-[2px_0_5px_rgba(0,0,0,0.05)]" title="${manageEscape(studentName)}" data-fullname="${manageEscape(studentName)}" tabindex="0" aria-label="Nama siswa: ${manageEscape(studentName)}">
                        ${manageEscape(studentName)}
                    </td>
            `;
            let cellsHtml = '';
            for (let day = 1; day <= daysInMonth; day++) {
                const dateStr = `${yearStr}-${monthStr}-${String(day).padStart(2, '0')}`;
                const studentKey = safeLowerCase(studentName);
                const teacherKey = safeLowerCase(selectedTeacher);
                const studentTeacherId = student.teacher_id ?? (window.GMFilter ? GMFilter.teacherId(selectedTeacher || student['nama guru']) : '');
                let record = attendanceById.get(`${dateStr}|${student.id}|${studentTeacherId}`);
                // Cadangan teks hanya untuk riwayat lama tanpa student_id.
                if (!record) record = attendanceMap.get(`${dateStr}|${studentKey}|${safeLowerCase(selectedTeacher || student['nama guru'])}|${safeLowerCase(student.kelas)}`);
                if (!record && !teacherKey) record = attendanceByStudentDate.get(`${dateStr}|${studentKey}|${safeLowerCase(student.kelas)}`);
                let statusCode = '-';
                let bgClass = 'text-gray-400';
                if (record) {
                    const status = safeLowerCase(record.status);
                    if (status === 'hadir' || status === 'h') {
                        statusCode = 'H';
                        hadirCount++;
                        bgClass = 'bg-emerald-100 text-emerald-800 font-bold';
                    }
                    else if (status === 'sakit' || status === 's') {
                        statusCode = 'S';
                        sakitCount++;
                        bgClass = 'bg-amber-100 text-amber-800 font-bold';
                    }
                    else if (status === 'izin' || status === 'i') {
                        statusCode = 'I';
                        izinCount++;
                        bgClass = 'attendance-badge bg-blue-100 text-blue-800 font-bold';
                    }
                    else if (status === 'alfa' || status === 'alpha' || status === 'a' || status === '-') {
                        statusCode = '-';
                        alphaCount++;
                        bgClass = 'bg-red-100 text-red-800 font-bold';
                    }
                }
                else {
                    if (dateStr <= todayStr) {
                        statusCode = '-';
                        alphaCount++;
                        bgClass = 'bg-red-50 text-red-500 font-medium';
                    }
                }
                cellsHtml += `<td class="p-1 text-center text-xs ${bgClass}">${statusCode}</td>`;
            }
            const totalAbsenSiswa = hadirCount + sakitCount + izinCount + alphaCount;
            const persentaseSiswa = totalAbsenSiswa > 0 ? Math.round((hadirCount / totalAbsenSiswa) * 100) : 0;
            totalPercent += persentaseSiswa;
            totalPercentStudents++;
            studentRow += cellsHtml;
            studentRow += `
                    <td class="px-2 py-3 text-center bg-blue-50/50 font-bold">${hadirCount}</td>
                    <td class="px-2 py-3 text-center bg-blue-50/50">${sakitCount}</td>
                    <td class="px-2 py-3 text-center bg-blue-50/50">${izinCount}</td>
                    <td class="px-2 py-3 text-center bg-blue-50/50 text-red-600 font-medium">${alphaCount}</td>
                    <td class="px-3 py-3 text-center bg-blue-100/40 text-blue-800 font-bold">${persentaseSiswa}%</td>
                </tr>
            `;
            bodyHtml += studentRow;
        });
        bodyHtml += `</tbody>`;
        monthlyReportTable.innerHTML = headerHtml + bodyHtml;
        const rateRataRata = totalPercentStudents > 0
            ? (totalPercent / totalPercentStudents).toFixed(2)
            : "0.00";
        if (avgAttendanceRate) {
            avgAttendanceRate.innerText = `${rateRataRata}%`;
        }
        if (typeof reportContainer !== 'undefined' && reportContainer) {
            reportContainer.style.display = 'block';
        }
    }
    catch (error) {
        console.error("Gagal memuat rekap data riil:", error);
    }
    showLoading(false);
}
function renderLocalAdminLogTable(filterTeacher = '', filterClass = '', isInitialLoad = false) {
    if (!isInitialLoad) return loadAttendanceLog();
    const list = document.getElementById('adminDataList');
    if (list) list.innerHTML = '<tr><td colspan="4" class="px-6 py-8 text-center">Buka Data Absensi untuk melihat log hari ini.</td></tr>';
    if (document.body.dataset.activePage === 'absensi') void loadAttendanceLog();
}
function formatTanggalCetak(dateObj) {
    const hari = String(dateObj.getDate()).padStart(2, '0');
    const bulanIndex = dateObj.getMonth();
    const tahun = dateObj.getFullYear();
    const namaBulan = [
        "Januari", "Februari", "Maret", "April", "Mei", "Juni",
        "Juli", "Agustus", "September", "Oktober", "November", "Desember"
    ][bulanIndex];
    return `${hari} ${namaBulan} ${tahun}`;
}
function getDaysInMonth(year, month) {
    return new Date(year, month, 0).getDate();
}
function getMonthName(monthNumber) {
    const months = [
        "Januari", "Februari", "Maret", "April", "Mei", "Juni",
        "Juli", "Agustus", "September", "Oktober", "November", "Desember"
    ];
    return months[parseInt(monthNumber) - 1];
}
function extractClassNumber(className) {
    if (!className)
        return '';
    const match = className.match(/\d+/);
    return match ? match[0] : '';
}
function printAttendanceReport() {
    const month = (typeof filterMonth !== 'undefined' && filterMonth && filterMonth.value) ? filterMonth.value : String(new Date().getMonth() + 1).padStart(2, '0');
    const teacher = (typeof filterTeacher !== 'undefined' && filterTeacher) ? filterTeacher.value : '';
    const classNumber = (typeof filterClassNumber !== 'undefined' && filterClassNumber) ? filterClassNumber.value : '';
    const className = (typeof filterClassName !== 'undefined' && filterClassName) ? filterClassName.value : '';
    const monthName = getMonthName(month);
    const year = parseInt((typeof filterYear !== 'undefined' && filterYear && filterYear.value) ? filterYear.value : '', 10) || new Date().getFullYear();
    const now = new Date();
    const tanggalCetak = `${now.getDate()}/${now.getMonth() + 1}/${now.getFullYear()}`;
    const reportTeacherText = teacher || 'Semua Guru';
    const reportClassText = className || (classNumber ? `Kelas ${classNumber}` : 'Semua Kelas');
    let filteredStudents = Array.isArray(window.tahsinRosterStudents) ? [...window.tahsinRosterStudents] : (Array.isArray(studentsData) ? [...studentsData] : []);
    if (teacher && teacher.trim() !== '') {
        filteredStudents = filteredStudents.filter(student => {
            if (!student)
                return false;
            const namaGuru = student['nama guru'] ? String(student['nama guru']) : '';
            return window.GMFilter ? GMFilter.teacherMatches(student,teacher) : namaGuru.toLowerCase() === teacher.toLowerCase();
        });
    }
    if (className && className.trim() !== '') {
        filteredStudents = filteredStudents.filter(student => {
            if (!student)
                return false;
            const kelasSiswa = student.kelas ? String(student.kelas) : '';
            return window.GMFilter ? GMFilter.classMatches(student,className) : kelasSiswa.toLowerCase() === className.toLowerCase();
        });
    }
    else if (classNumber && classNumber.trim() !== '') {
        filteredStudents = filteredStudents.filter(student => {
            if (!student)
                return false;
            const kelasSiswa = student.kelas ? String(student.kelas) : '';
            return extractClassNumber(kelasSiswa) === classNumber;
        });
    }
    filteredStudents.sort((a, b) => {
        const namaA = a && a['nama siswa'] ? String(a['nama siswa']) : '';
        const namaB = b && b['nama siswa'] ? String(b['nama siswa']) : '';
        return namaA.localeCompare(namaB);
    });
    const daysInMonth = getDaysInMonth(year, parseInt(month) || 1);
    const headers = ['Nama Siswa'];
    for (let day = 1; day <= daysInMonth; day++) {
        headers.push(day.toString());
    }
    headers.push('H', 'S', 'I', 'A', '%');
    const rows = [];
    let totalPercent = 0;
    const listAbsensi = Array.isArray(attendanceData) ? attendanceData : [];
    filteredStudents.forEach(student => {
        if (!student)
            return;
        const studentName = student['nama siswa'] ? String(student['nama siswa']) : 'Tanpa Nama';
        const row = [studentName];
        let hadirCount = 0, sakitCount = 0, izinCount = 0, alphaCount = 0;
        for (let day = 1; day <= daysInMonth; day++) {
            const dateStr = `${year}-${month}-${String(day).padStart(2, '0')}`;
            const today = new Date();
            const currentDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
            if (dateStr > currentDate) {
                row.push('');
                continue;
            }
            let record = listAbsensi.find(r => {
                if (!r)
                    return false;
                const recordDate = r.date ? String(r.date) : '';
                const recordStudent = r.student ? String(r.student) : '';
                const recordTeacher = r.teacher ? String(r.teacher) : '';
                const matchDate = recordDate === dateStr;
                const matchStudent = window.GMFilter ? GMFilter.studentMatches(r, student) : recordStudent.toLowerCase() === studentName.toLowerCase();
                const matchTeacher = window.GMFilter ? GMFilter.teacherMatches(r, teacher || student['nama guru']) : (teacher ? recordTeacher.toLowerCase() === teacher.toLowerCase() : true);
                return matchDate && matchStudent && matchTeacher;
            });
            let statusCode = '-';
            if (record) {
                const status = record.status ? String(record.status).toLowerCase() : '';
                if (status === 'hadir' || status === 'h') {
                    statusCode = 'H';
                    hadirCount++;
                }
                else if (status === 'sakit' || status === 's') {
                    statusCode = 'S';
                    sakitCount++;
                }
                else if (status === 'izin' || status === 'i') {
                    statusCode = 'I';
                    izinCount++;
                }
                else if (status === 'alpha' || status === 'alfa' || status === 'a' || status === '-') {
                    statusCode = '-';
                    alphaCount++;
                }
            }
            else {
                alphaCount++;
            }
            row.push(statusCode);
        }
        const totalDays = hadirCount + sakitCount + izinCount + alphaCount;
        const attendancePercentage = totalDays > 0 ? Math.round((hadirCount / totalDays) * 100) : 0;
        totalPercent += attendancePercentage;
        row.push(hadirCount.toString(), sakitCount.toString(), izinCount.toString(), alphaCount.toString(), `${attendancePercentage}%`);
        rows.push(row);
    });
    const averagePercent = filteredStudents.length > 0 ? (totalPercent / filteredStudents.length) : 0;
    let html = `
    <div id="print-area" style="font-family: Arial, sans-serif; padding: 20px; color: #000;">
      <div style="text-align: center; margin-bottom: 10px;">
        <h2 style="margin: 0; font-size: 16pt; font-weight: normal; letter-spacing: 0.5px;">REKAP ABSENSI BULANAN GEMAR MENGAJI</h2>
        <div style="font-size: 12pt; margin-top: 5px;">SDIT Harapan Umat Karawang</div>
        <div style="font-size: 10pt; margin-top: 3px;">Jl. Pakuncen No. 01, Desa Sukaharja, Kec. Teluk Jambe Timur</div>
      </div>
      <hr style="border: none; border-top: 1px solid #000; margin-bottom: 15px;">
      <div style="display: flex; justify-content: space-between; font-size: 11pt; margin-bottom: 8px; padding: 0 5px;">
        <div style="width: 33.33%;">Guru: ${reportTeacherText}</div>
        <div style="width: 33.33%; text-align: center;">Kelas: ${reportClassText}</div>
        <div style="width: 33.33%; text-align: right;">Bulan: ${monthName} ${year}</div>
      </div>
      <div style="font-size: 11pt; margin-bottom: 20px; padding: 0 5px;">
        Rata-rata Kehadiran: ${averagePercent.toFixed(2)}%
      </div>
      <table border="1" cellpadding="0" cellspacing="0" style="width: 100%; font-size: 8pt; border-collapse: collapse; text-align: center; border: 1px solid #000;">
        <thead>
          <tr style="background-color: #fff;">
            <th style="text-align: left; padding: 6px 4px; font-weight: bold; font-size: 8.5pt; width: 180px;">Nama Siswa</th>
            ${headers.slice(1).map(h => `<th style="padding: 6px 2px; font-weight: bold; font-size: 8.5pt;">${h}</th>`).join('')}
          </tr>
        </thead>
        <tbody>
          ${rows.map(row => `
            <tr>
              <td style="text-align: left; padding: 5px 4px; font-size: 8.5pt;">${row[0]}</td>
              ${row.slice(1).map(cell => `<td style="padding: 5px 2px; font-size: 8.5pt;">${cell}</td>`).join('')}
            </tr>
          `).join('')}
        </tbody>
      </table>
      <div style="display: flex; justify-content: space-between; margin-top: 80px; font-size: 11pt; padding: 0 10px;">
        <div style="width: 40%; text-align: left;">
            Mengetahui,<br>
            Kepala Sekolah<br><br><br><br><br>
            (...................................)
        </div>
        <div style="width: 40%; text-align: right; display: flex; flex-direction: column; justify-content: space-between; align-items: flex-end;">
            <div>Karawang, ${tanggalCetak}</div>
            <div style="border-top: 1px solid #000; width: 200px; margin-top: 65px;"></div>
        </div>
      </div>
    </div>
    `;
    let win = window.open('', 'PrintReport', 'width=1200,height=800');
    win.document.write('<html><head><title>Cetak Rekap Absensi</title>');
    win.document.write('<style>@media print { @page { size: landscape; margin: 8mm; } body { margin: 0; } #print-area { width: 100%; } th, td { border: 1px solid #000 !important; } }</style>');
    win.document.write('</head><body>' + html + '</body></html>');
    win.document.close();
    win.focus();
    setTimeout(() => win.print(), 500);
}
async function exportAttendanceToPDF() {
    const { jsPDF } = window.jspdf;
    if (typeof supabase === 'undefined') {
        AdminNotice.notify("Koneksi ke database (Supabase client) tidak ditemukan! Pastikan database.js sudah dimuat.");
        return;
    }
    const originalBtnText = document.activeElement ? document.activeElement.innerText : '';
    let activeBtn = null;
    if (document.activeElement && document.activeElement.tagName === 'BUTTON') {
        activeBtn = document.activeElement;
        activeBtn.disabled = true;
        activeBtn.innerText = "Memproses Data...";
    }
    try {
        const safeLowerCase = (val) => {
            if (val === null || val === undefined)
                return '';
            return String(val).toLowerCase().trim();
        };
        const localGetMonthName = (monthStr) => {
            const months = {
                '01': 'Januari', '02': 'Februari', '03': 'Maret', '04': 'April',
                '05': 'Mei', '06': 'Juni', '07': 'Juli', '08': 'Agustus',
                '09': 'September', '10': 'Oktober', '11': 'November', '12': 'Desember'
            };
            return months[monthStr] || 'Januari';
        };
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
            if (dateStr.includes('-') && dateStr.length >= 10) {
                return dateStr.substring(0, 10);
            }
            const d = new Date(dateVal);
            if (isNaN(d.getTime()))
                return '';
            return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        };
        const month = (typeof filterMonth !== 'undefined' && filterMonth && filterMonth.value) ? filterMonth.value : String(new Date().getMonth() + 1).padStart(2, '0');
        const teacher = (typeof filterTeacher !== 'undefined' && filterTeacher && filterTeacher.value) ? filterTeacher.value : '';
        const classNumber = (typeof filterClassNumber !== 'undefined' && filterClassNumber && filterClassNumber.value) ? filterClassNumber.value : '';
        const className = (typeof filterClassName !== 'undefined' && filterClassName && filterClassName.value) ? filterClassName.value : '';
        const monthName = localGetMonthName(month);
        const year = parseInt((typeof filterYear !== 'undefined' && filterYear && filterYear.value) ? filterYear.value : '', 10) || new Date().getFullYear();
        const now = new Date();
        const tanggalCetak = `${now.getDate()}/${now.getMonth() + 1}/${now.getFullYear()}`;
        const reportTeacherText = teacher || 'Semua Guru';
        const reportClassText = className || (classNumber ? `Kelas ${classNumber}` : 'Semua Kelas');
        if (!Array.isArray(window.tahsinRosterStudents) && (!Array.isArray(studentsData) || studentsData.length === 0)) {
            await fetchStudents();
        }
        const startDate = `${year}-${month}-01`;
        const endDate = `${year}-${month}-${new Date(year, parseInt(month), 0).getDate()}`;
        if (!window.GM_ATTENDANCE_FILTER_FETCHED) await fetchAttendanceData({ date_from: startDate, date_to: endDate });
        const dbStudentsList = Array.isArray(studentsData) ? studentsData : [];
        const listAbsensi = Array.isArray(attendanceData) ? attendanceData : [];
        let filteredStudents = Array.isArray(window.tahsinRosterStudents) ? [...window.tahsinRosterStudents] : [...dbStudentsList];
        if (teacher && teacher.trim() !== '') {
            filteredStudents = filteredStudents.filter(student => {
                if (!student)
                    return false;
                const namaGuru = student['nama guru'] || student.nama_guru || '';
                return window.GMFilter ? GMFilter.teacherMatches(student,teacher) : safeLowerCase(namaGuru) === safeLowerCase(teacher);
            });
        }
        if (className && className.trim() !== '') {
            filteredStudents = filteredStudents.filter(student => {
                if (!student)
                    return false;
                const kelasSiswa = student.kelas || student.kelas_nama || '';
                return window.GMFilter ? GMFilter.classMatches(student,className) : safeLowerCase(kelasSiswa) === safeLowerCase(className);
            });
        }
        else if (classNumber && classNumber.trim() !== '') {
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
        const daysInMonth = new Date(year, parseInt(month) || 1, 0).getDate();
        const headers = ['Nama Siswa'];
        for (let day = 1; day <= daysInMonth; day++) {
            headers.push(day.toString());
        }
        headers.push('H', 'S', 'I', 'A', '%');
        const rows = [];
        let totalPercent = 0;
        filteredStudents.forEach(student => {
            if (!student)
                return;
            const studentName = student['nama siswa'] || student.nama_siswa || 'Tanpa Nama';
            const row = [studentName];
            let hadirCount = 0, sakitCount = 0, izinCount = 0, alphaCount = 0;
            for (let day = 1; day <= daysInMonth; day++) {
                const dateStr = `${year}-${month}-${String(day).padStart(2, '0')}`;
                const today = new Date();
                const currentDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
                if (dateStr > currentDate) {
                    row.push('');
                    continue;
                }
                let record = listAbsensi.find(r => {
                    if (!r)
                        return false;
                    const recordDateRaw = r.date;
                    const formattedRecordDate = formatDateToYYYYMMDD(recordDateRaw);
                    const recordStudent = r.nama_siswa || r.student || '';
                    const recordTeacher = r.nama_guru || r.teacher || '';
                    const matchDate = formattedRecordDate === dateStr;
                    const matchStudent = window.GMFilter ? GMFilter.studentMatches(r, student) : safeLowerCase(recordStudent) === safeLowerCase(studentName);
                    const matchTeacher = window.GMFilter ? GMFilter.teacherMatches(r, teacher || student['nama guru']) :
                        (teacher ? safeLowerCase(recordTeacher) === safeLowerCase(teacher) : true);
                    return matchDate && matchStudent && matchTeacher;
                });
                let statusCode = '-';
                if (record) {
                    const status = safeLowerCase(record.status);
                    if (status === 'hadir' || status === 'h') {
                        statusCode = 'H';
                        hadirCount++;
                    }
                    else if (status === 'sakit' || status === 's') {
                        statusCode = 'S';
                        sakitCount++;
                    }
                    else if (status === 'izin' || status === 'i') {
                        statusCode = 'I';
                        izinCount++;
                    }
                    else if (status === 'alfa' || status === 'alpha' || status === 'a' || status === '-') {
                        statusCode = '-';
                        alphaCount++;
                    }
                }
                else {
                    alphaCount++;
                }
                row.push(statusCode);
            }
            const totalDays = hadirCount + sakitCount + izinCount + alphaCount;
            const attendancePercentage = totalDays > 0 ? Math.round((hadirCount / totalDays) * 100) : 0;
            totalPercent += attendancePercentage;
            row.push(hadirCount.toString(), sakitCount.toString(), izinCount.toString(), alphaCount.toString(), `${attendancePercentage}%`);
            rows.push(row);
        });
        const averagePercent = filteredStudents.length > 0 ? (totalPercent / filteredStudents.length) : 0;
        const doc = new jsPDF('l', 'mm', 'a4');
        const pageWidth = doc.internal.pageSize.getWidth();
        doc.setTextColor(0, 0, 0);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(15);
        doc.text('REKAP ABSENSI BULANAN GEMAR MENGAJI', pageWidth / 2, 16, { align: 'center' });
        doc.setFontSize(12);
        doc.text('SDIT Harapan Umat Karawang', pageWidth / 2, 22, { align: 'center' });
        doc.setFontSize(9);
        doc.text('Jl. Pakuncen No. 01, Desa Sukaharja, Kec. Teluk Jambe Timur', pageWidth / 2, 27, { align: 'center' });
        doc.setLineWidth(0.3);
        doc.line(12, 31, pageWidth - 12, 31);
        doc.setFontSize(11);
        doc.text(`Guru: ${reportTeacherText}`, 15, 38);
        doc.text(`Kelas: ${reportClassText}`, pageWidth / 2, 38, { align: 'center' });
        doc.text(`Bulan: ${monthName} ${year}`, pageWidth - 15, 38, { align: 'right' });
        doc.text(`Rata-rata Kehadiran: ${averagePercent.toFixed(2)}%`, 15, 45);
        doc.autoTable({
            head: [headers],
            body: rows,
            startY: 50,
            theme: 'grid',
            margin: { left: 12, right: 12 },
            styles: {
                fontSize: 7.5,
                cellPadding: 1.5,
                halign: 'center',
                valign: 'middle',
                textColor: [0, 0, 0],
                lineColor: [0, 0, 0],
                lineWidth: 0.1
            },
            headStyles: {
                fillColor: [255, 255, 255],
                textColor: [0, 0, 0],
                fontStyle: 'bold'
            },
            columnStyles: {
                0: { cellWidth: 42, halign: 'left' }
            },
            pageBreak: 'auto',
            didDrawPage: function (data) {
                const doc = data.doc;
                const pageWidth = doc.internal.pageSize.getWidth();
                const pageHeight = doc.internal.pageSize.getHeight();
                let yFooter = pageHeight - 35;
                doc.setFontSize(11);
                doc.text('Mengetahui,', 20, yFooter);
                doc.text('Kepala Sekolah', 20, yFooter + 6);
                doc.text('(...................................)', 20, yFooter + 26);
                doc.text(`Karawang, ${tanggalCetak}`, pageWidth - 65, yFooter);
                doc.line(pageWidth - 75, yFooter + 28, pageWidth - 15, yFooter + 28);
            },
        });
        const filename = `rekap_absensi_${monthName.toLowerCase()}_${year}_kelas_${classNumber || 'all'}.pdf`;
        doc.save(filename);
    }
    catch (err) {
        console.error("Gagal mengambil data dari Supabase: ", err);
        AdminNotice.notify("Terjadi kesalahan saat memproses data Supabase: " + err.message);
    }
    finally {
        if (activeBtn) {
            activeBtn.disabled = false;
            activeBtn.innerText = originalBtnText;
        }
    }
}
window.addEventListener('panelready', () => {
    showLoading(true);
    window.panelDataReady = (async () => {
        const currentMonth = (new Date().getMonth() + 1).toString().padStart(2, '0');
        const currentYear = new Date().getFullYear().toString();
        document.getElementById('filterTeacher').innerHTML = '<option value="">Semua Guru</option>';
        document.getElementById('filterClassNumber').innerHTML = '<option value="">Semua Tingkat</option>';
        document.getElementById('filterClassName').innerHTML = '<option value="">Semua Nama Kelas (Opsional)</option>';
        try {
            if (!AppAccess.canPage('absensi')) { showLoading(false); return; }
            // Panel awal hanya memuat roster Tahsin yang ringkas; master penuh baru
            // dimuat saat menu Kelola Data dipilih. Absensi baru diambil saat difilter.
            const yearKey = getPublicAcademicYearStart();
            const [teachers, students] = await Promise.all([
                fetchAllRpcRows('gm_public_tahsin_teachers', { year_key: yearKey }, 500),
                fetchAllRpcRows('gm_public_tahsin_students', { year_key: yearKey }, 500)
            ]);
            window.tahsinRosterTeachers = teachers;
            window.tahsinRosterStudents = students;
        }
        catch (err) {
            console.error("Gagal menarik data master guru/siswa:", err);
            if (window.AdminNotice) AdminNotice.notify('Daftar Tahsin gagal dimuat. Periksa SQL kelompok serta koneksi; filter tidak akan menampilkan guru Tahfidz sebagai pengganti.', 'error');
        }
        if (typeof populateAdminDropdowns === 'function') {
            populateAdminDropdowns();
        }
        else if (typeof populateClassFilters === 'function') {
            populateClassFilters();
        }
        if (typeof populateYearFilter === 'function') {
            populateYearFilter();
        }
        await renderMonthlyReportTable(currentMonth, currentYear, "", "", true);
        // Hanya tampilkan placeholder; unduh absensi saat filter Data Absensi digunakan.
        // Tidak mengunduh puluhan ribu baris saat pertama membuka panel.
        renderLocalAdminLogTable('', '', true);
        showLoading(false);
    })();
});
document.addEventListener("panelready", () => {
    const printButton = document.getElementById("btn-print");
    const downloadButton = document.getElementById("btn-download");
    if (printButton) {
        printButton.addEventListener("click", () => {
            if (Array.isArray(window.tahsinRosterStudents) ? window.tahsinRosterStudents.length > 0 : (typeof studentsData !== 'undefined' && studentsData.length > 0)) {
                if (!window.GM_ATTENDANCE_FILTER_FETCHED) { AdminNotice.notify('Terapkan filter data absensi terlebih dahulu sebelum mencetak.','warning'); return; }
                printAttendanceReport();
            }
            else {
                showNotification('warning', 'Tidak ada data siswa untuk dicetak.');
            }
        });
    }
    if (downloadButton) {
        downloadButton.addEventListener("click", () => {
            if (Array.isArray(window.tahsinRosterStudents) ? window.tahsinRosterStudents.length > 0 : (typeof studentsData !== 'undefined' && studentsData.length > 0)) {
                if (!window.GM_ATTENDANCE_FILTER_FETCHED) { AdminNotice.notify('Terapkan filter data absensi terlebih dahulu sebelum mengunduh.','warning'); return; }
                exportAttendanceToPDF();
            }
            else {
                showNotification('warning', 'Tidak ada data siswa untuk diunduh.');
            }
        });
    }
});
window.GM_DASHBOARD_OWNS_FILTER = true;
document.getElementById('filterBtn').addEventListener('click', async (event) => {
    const button = event.currentTarget;
    const originalButtonHtml = button.innerHTML;
    button.disabled = true;
    button.classList.add('opacity-75', 'cursor-wait');
    button.innerHTML = `
                <svg class="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                    <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"></path>
                </svg>
                Memuat data...
            `;
    const y = document.getElementById('filterYear').value || "";
    const m = document.getElementById('filterMonth').value || "";
    const t = document.getElementById('filterTeacher').value || "";
    const c = document.getElementById('filterClassName').value || document.getElementById('filterClassNumber').value || "";
    try {
        const year = y || String(new Date().getFullYear());
        const month = m || String(new Date().getMonth()+1).padStart(2,'0');
        const last = new Date(Number(year), Number(month), 0).getDate();
        if (!m) document.getElementById('filterMonth').value=String(month).padStart(2,'0');
        if (!y) document.getElementById('filterYear').value=year;
        const filter = {date_from:`${year}-${String(month).padStart(2,'0')}-01`, date_to:`${year}-${String(month).padStart(2,'0')}-${String(last).padStart(2,'0')}`};
        const teacherId = window.GMFilter?.teacherId(t);
        const classId = window.GMFilter?.classId(c);
        if (t) { if (!teacherId) throw new Error('Guru tidak ditemukan di kelompok Tahsin. Muat ulang data kelompok.'); filter.teacher_id=teacherId; }
        if (c && !/^\d+$/.test(c)) { if (!classId) throw new Error('Kelas tidak ditemukan dalam master. Muat ulang daftar kelas.'); filter.class_id=classId; }
        await fetchAttendanceData(filter);
        await renderMonthlyReportTable(month, year, t, c, false);
        await loadAttendanceLog();
    }
    catch (err) {
        console.error('Filter Data Absensi:',err);
        if (window.AdminNotice) AdminNotice.notify(err.message || 'Gagal memuat data filter.', 'error');
    }
    finally {
        button.disabled = false;
        button.classList.remove('opacity-75', 'cursor-wait');
        button.innerHTML = originalButtonHtml;
    }
});
document.getElementById('logoutBtn').addEventListener('click', () => {
    supabase.auth.signOut().finally(() => window.location.href = 'login.html');
});
let maintenanceMode = false;
function updateMaintenanceStatusUI() {
    const badge = document.getElementById('maintenanceStateBadge');
    badge.textContent = maintenanceMode ? 'Maintenance aktif' : 'Website aktif';
    badge.dataset.active = String(maintenanceMode);
    document.getElementById('maintenanceStateTitle').textContent = maintenanceMode ? 'Website sedang dalam perawatan' : 'Website siap digunakan';
    document.getElementById('maintenanceStateDescription').textContent = maintenanceMode ? 'Pengunjung diarahkan ke halaman maintenance. Nonaktifkan mode ini untuk membuka kembali absensi.' : 'Guru dapat membuka halaman absensi seperti biasa. Aktifkan maintenance ketika website perlu dirawat.';
    const toggle = document.getElementById('maintenanceToggleBtn');
    toggle.textContent = maintenanceMode ? 'Nonaktifkan Maintenance' : 'Aktifkan Maintenance';
    toggle.disabled = false;
    const statusEl = document.getElementById('maintenanceStatus');
    if (!statusEl)
        return;
    if (maintenanceMode) {
        statusEl.classList.remove('hidden');
        statusEl.innerText = 'ON';
        statusEl.classList.remove('text-green-400');
        statusEl.classList.add('text-red-400');
    }
    else {
        statusEl.classList.add('hidden');
        statusEl.innerText = 'OFF';
    }
}
window.handleMaintenanceRealtime = function (enabled) {
    maintenanceMode = enabled;
    updateMaintenanceStatusUI();
};
async function toggleMaintenance() {
    if (!AppAccess.full())
        return;
    const button = document.getElementById('maintenanceToggleBtn');
    const feedback = document.getElementById('maintenanceFeedback');
    if (button.disabled)
        return;
    button.disabled = true;
    feedback.textContent = 'Menyimpan perubahan...';
    try {
        maintenanceMode = await setMaintenanceMode(!maintenanceMode);
        updateMaintenanceStatusUI();
        feedback.textContent = maintenanceMode ? 'Mode maintenance berhasil diaktifkan.' : 'Website kembali dapat digunakan.';
    }
    catch (error) {
        console.error('Gagal mengubah mode maintenance:', error);
        feedback.textContent = 'Perubahan belum tersimpan. Silakan coba lagi.';
    }
    finally {
        button.disabled = false;
    }
}
async function loadMaintenanceMode() {
    if (!AppAccess.full())
        return;
    try {
        maintenanceMode = await getMaintenanceMode();
        updateMaintenanceStatusUI();
    }
    catch (error) {
        console.error('Gagal memuat mode maintenance:', error);
        document.getElementById('maintenanceFeedback').textContent = 'Status belum dapat dimuat. Buka kembali menu ini untuk mencoba lagi.';
    }
}
let currentManageTab = 'siswa';
let currentTeacherGroup = 'tahsin';
let editingIndex = null;
let identifierAuditLoaded = false;
let missingIdentifierRows = [];
// Kelola Data dimuat hanya ketika pengguna membuka menunya.
let gmManageDataLoaded = false;
let gmManageDataPending = null;
async function gmOpenManageData() {
    if (!gmManageDataLoaded) {
        if (!gmManageDataPending) gmManageDataPending = Promise.all([getTeachers(),getStudents()])
            .then(([teachers,students])=> {teachersData=teachers;studentsData=students;gmManageDataLoaded=true;})
            .finally(()=> {gmManageDataPending=null;});
        try { await gmManageDataPending; }
        catch (error) { AdminNotice.notify('Gagal memuat master: '+error.message,'error'); return; }
    }
    renderManageTable();
    switchManageView('directory');
}
function switchManageView(view) {
    if (!['directory', 'enrollment'].includes(view)) return;
    if (view === 'enrollment' && !AppAccess.full()) return;
    const directory = document.getElementById('manageViewDirectory');
    const enrollment = document.getElementById('teacherEnrollment');
    const directoryButton = document.getElementById('manageViewDirectoryButton');
    const enrollmentButton = document.getElementById('manageViewEnrollmentButton');
    if (enrollmentButton) enrollmentButton.hidden = !AppAccess.full();
    if (directory) directory.hidden = view !== 'directory';
    if (enrollment) enrollment.hidden = view !== 'enrollment';
    [[directoryButton, view === 'directory'], [enrollmentButton, view === 'enrollment']].forEach(([button, active]) => {
        if (!button) return;
        button.setAttribute('aria-pressed', String(active));
        button.classList.toggle('active', active);
    });
    if (view === 'directory') {
        renderManageTable();
    } else {
        void TeacherEnrollment.open();
    }
}
document.addEventListener('panelready', () => switchManageTab('siswa'));
async function fetchTeachers() {
    try {
        teachersData = await getTeachers();
    }
    catch (err) {
        console.error("Gagal memuat data guru dari Supabase:", err.message);
    }
}
async function fetchClasses() {
    try {
        classesData = await getStudents();
    }
    catch (err) {
        console.error("Gagal memuat data kelas dari Supabase:", err.message);
    }
}
function closeManageModal() {
    const modal = document.getElementById('manageModal');
    const modalContent = document.getElementById('modalContent');
    if (!modal || !modalContent)
        return;
    modalContent.classList.remove('scale-100', 'opacity-100');
    modalContent.classList.add('scale-95', 'opacity-0');
    setTimeout(() => {
        modal.classList.add('hidden');
        document.getElementById('manageForm').reset();
        editingIndex = null;
    }, 200);
}
let managePage = 1;
const manageRowsPerPage = 25;
function manageEscape(value) {
    return String(value ?? '').replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char]);
}
// Guru Tahsin pada tabel Data Siswa bersumber dari kelompok aktif, bukan
// kolom nama guru legacy yang bisa tertinggal setelah anggota dipindahkan.
function gmTahsinGroupTeacher(student) {
    const roster = window.tahsinRosterStudents;
    const active = Array.isArray(roster) ? roster.find(row => String(row.id) === String(student.id)) : null;
    return active ? String(active['nama guru'] || '') : (Array.isArray(roster) ? 'Belum ada kelompok' : String(student['nama guru'] || 'Belum ada kelompok'));
}
function getManageData() {
    if (currentManageTab === 'siswa')
        return Array.isArray(studentsData) ? studentsData : [];
    return (Array.isArray(teachersData) ? teachersData : []).filter(teacher => currentTeacherGroup === 'tahfidz' ? teacher.attendance_enabled === false : teacher.attendance_enabled !== false);
}
function getManageTitle(item) {
    return currentManageTab === 'guru' ? (item.nama || item.nama_guru || '') : (item['nama siswa'] || item.nama_siswa || item.nama || '');
}
function getManageLevel(className) {
    const match = String(className || '').match(/\d+/);
    return match ? match[0] : '';
}
function refreshStudentManageFilters() {
    const filterWrap = document.getElementById('studentManageFilters');
    if (!filterWrap)
        return;
    filterWrap.classList.toggle('hidden', currentManageTab !== 'siswa');
    if (currentManageTab !== 'siswa')
        return;
    const levelSelect = document.getElementById('manageLevelFilter');
    const modeSelect = document.getElementById('manageStudentFilterMode');
    const detailSelect = document.getElementById('manageStudentDetailFilter');
    const previousLevel = levelSelect.value;
    const levels = [...new Set((Array.isArray(studentsData) ? studentsData : []).map(student => getManageLevel(student.kelas)).filter(Boolean))].sort((a, b) => Number(a) - Number(b));
    levelSelect.innerHTML = '<option value="">Pilih tingkat kelas dahulu</option>' + levels.map(level => `<option value="${manageEscape(level)}">Tingkat ${manageEscape(level)}</option>`).join('');
    if (levels.includes(previousLevel))
        levelSelect.value = previousLevel;
    modeSelect.disabled = !levelSelect.value;
    if (!levelSelect.value) {
        modeSelect.value = '';
        detailSelect.disabled = true;
        detailSelect.innerHTML = '<option value="">Pilih tingkat dan filter terlebih dahulu</option>';
        return;
    }
    const levelStudents = studentsData.filter(student => getManageLevel(student.kelas) === levelSelect.value);
    detailSelect.disabled = !modeSelect.value;
    if (!modeSelect.value) {
        detailSelect.innerHTML = '<option value="">Pilih guru atau nama kelas</option>';
        return;
    }
    const options = modeSelect.value === 'guru'
        ? [...new Set(levelStudents.map(student => gmTahsinGroupTeacher(student)).filter(Boolean))].sort((a, b) => String(a).localeCompare(String(b), 'id'))
        : [...new Set(levelStudents.map(student => student.kelas).filter(Boolean))].sort((a, b) => String(a).localeCompare(String(b), 'id'));
    const current = detailSelect.value;
    detailSelect.innerHTML = `<option value="">Pilih ${modeSelect.value === 'guru' ? 'nama guru' : 'nama kelas'}</option>` + options.map(option => `<option value="${manageEscape(option)}">${manageEscape(option)}</option>`).join('');
    if (options.includes(current))
        detailSelect.value = current;
}
function renderManageTable() {
    const header = document.getElementById('manageTableHeader');
    const body = document.getElementById('manageTableBody');
    if (!header || !body)
        return;
    const importTab = currentManageTab === 'impor';
    document.getElementById('manageDirectoryView').hidden = importTab;
    document.getElementById('manageDirectoryTable').hidden = importTab;
    document.getElementById('manageDirectoryPagination').hidden = importTab;
    document.getElementById('manageImportView').hidden = !importTab;
    document.getElementById('tab-impor').hidden = !AppAccess.full();
    document.getElementById('manageAddBtn').hidden = importTab || (AppAccess.teacher() && currentManageTab === 'guru');
    document.getElementById('manageIdentifierActions').hidden = !(AppAccess.full() && currentManageTab === 'siswa');
    document.getElementById('manageIdentifierAudit').hidden = !(identifierAuditLoaded && AppAccess.full() && currentManageTab === 'siswa');
    refreshManageImportControls();
    if (importTab) return;
    refreshStudentManageFilters();
    const search = (document.getElementById('manageSearch')?.value || '').trim().toLowerCase();
    const level = document.getElementById('manageLevelFilter')?.value || '';
    const mode = document.getElementById('manageStudentFilterMode')?.value || '';
    const detail = document.getElementById('manageStudentDetailFilter')?.value || '';
    const rows = getManageData().filter(item => {
        if (currentManageTab === 'siswa') {
            if (level && getManageLevel(item.kelas) !== level)
                return false;
            if (mode === 'guru' && detail && gmTahsinGroupTeacher(item) !== detail)
                return false;
            if (mode === 'kelas' && detail && String(item.kelas || '') !== detail)
                return false;
        }
        const studentSearch = `${item['nama siswa'] || item.nama_siswa || ''} ${gmTahsinGroupTeacher(item)} ${item.kelas || ''}`;
        const teacherSearch = `${item.nama || item.nama_guru || ''} ${item.nama_lengkap || ''} ${item.foto || ''}`;
        return !search || (currentManageTab === 'guru' ? teacherSearch : studentSearch).toLowerCase().includes(search);
    }).sort((a, b) => {
        if (currentManageTab === 'siswa') {
            const classCompare = String(a.kelas || '').localeCompare(String(b.kelas || ''), 'id');
            if (classCompare)
                return classCompare;
        }
        return getManageTitle(a).localeCompare(getManageTitle(b), 'id');
    });
    const totalPages = Math.max(1, Math.ceil(rows.length / manageRowsPerPage));
    managePage = Math.min(Math.max(1, managePage), totalPages);
    const pageRows = rows.slice((managePage - 1) * manageRowsPerPage, managePage * manageRowsPerPage);
    header.innerHTML = currentManageTab === 'guru'
        ? `<tr><th class="px-6 py-4">No</th><th class="px-6 py-4">Nama Guru</th>${currentTeacherGroup === 'tahsin' ? '<th class="px-6 py-4">Foto</th>' : ''}<th class="px-6 py-4 text-center w-36">Aksi</th></tr>`
        : '<tr><th class="px-6 py-4">No</th><th class="px-6 py-4">Nama Siswa</th><th class="px-6 py-4">Kelompok Tahsin</th><th class="px-6 py-4">Kelas</th><th class="px-6 py-4 text-center w-36">Aksi</th></tr>';
    if (!pageRows.length) {
        body.innerHTML = `<tr><td colspan="${currentManageTab === 'guru' ? (currentTeacherGroup === 'tahsin' ? 4 : 3) : 5}" class="p-8 text-center text-slate-400">Data tidak ditemukan.</td></tr>`;
    }
    else {
        let lastClass = null;
        const startNumber = (managePage - 1) * manageRowsPerPage;
        body.innerHTML = pageRows.map((item, offset) => {
            const id = manageEscape(item.id);
            let classGroup = '';
            if (currentManageTab === 'siswa' && item.kelas !== lastClass) {
                lastClass = item.kelas;
                classGroup = `<tr class="gm-manage-class-row"><td colspan="5">Kelas: ${manageEscape(item.kelas || '-')}</td></tr>`;
            }
            const canEdit = !(AppAccess.teacher() && currentManageTab === 'guru' && (currentTeacherGroup !== 'tahsin' || String(AppAccess.profile.teacher_id) !== String(item.id)));
            const actions = `<td class="px-6 py-3 text-center whitespace-nowrap gm-manage-actions">${canEdit ? `<button onclick="openManageModal('${id}')" class="text-indigo-600 hover:text-indigo-800 font-semibold text-xs mr-3">Edit</button>` : '<span class="text-slate-400 text-xs">—</span>'}${currentManageTab === 'guru' && !AppAccess.teacher() ? `<button onclick="deleteData('${id}')" class="text-red-600 hover:text-red-800 font-semibold text-xs">Hapus</button>` : currentManageTab === 'siswa' && AppAccess.profile.role === 'koordinator' ? `<button onclick="deleteStudentVerified('${id}')" class="text-red-600 hover:text-red-800 font-semibold text-xs">Hapus siswa</button>` : ''}</td>`;
            if (currentManageTab === 'guru') {
                const photo = currentTeacherGroup === 'tahsin' ? `<td class="px-6 py-3">${item.foto ? `<img src="${manageEscape(item.foto)}" alt="Foto ${manageEscape(item.nama)}" class="teacher-photo-circle teacher-photo-circle--small bg-slate-100" loading="lazy" decoding="async" onerror="this.onerror=null;this.classList.add('teacher-photo-circle--placeholder');this.src='assets/school-logo.png'">` : '<span class="text-slate-400">Belum ada foto</span>'}</td>` : '';
                return `${classGroup}<tr class="hover:bg-slate-50"><td class="px-6 py-3 text-slate-500">${startNumber + offset + 1}</td><td class="px-6 py-3 font-semibold">${manageEscape(getManageTitle(item))}<div class="text-xs font-normal text-slate-500 mt-1">${manageEscape(item.nama_lengkap || 'Nama lengkap belum diisi')}</div><small>${item.attendance_enabled === false ? 'Khusus Tahfidz' : 'Tampil pada absensi Tahsin'}</small></td>${photo}${actions}</tr>`;
            }
            return `${classGroup}<tr class="hover:bg-slate-50"><td class="px-6 py-3 text-slate-500">${startNumber + offset + 1}</td><td class="px-6 py-3 font-semibold">${manageEscape(getManageTitle(item))}</td><td class="px-6 py-3">${manageEscape(gmTahsinGroupTeacher(item))}</td><td class="px-6 py-3">${manageEscape(item.kelas || '-')}</td>${actions}</tr>`;
        }).join('');
    }
    document.getElementById('manageRecordInfo').textContent = `${rows.length} data`;
    document.getElementById('managePageInfo').textContent = `Halaman ${managePage} / ${totalPages}`;
    document.getElementById('managePrevPage').disabled = managePage <= 1;
    document.getElementById('manageNextPage').disabled = managePage >= totalPages;
    refreshManageImportControls();
}
function refreshManageImportControls() {
    document.getElementById('studentTemplateDownload').hidden = false;
    document.getElementById('studentImportYearLabel').hidden = !AppAccess.full();
    if (!document.getElementById('studentImportYear').value) {
        const now = new Date();
        document.getElementById('studentImportYear').value = now.getFullYear() - (now.getMonth() < 6 ? 1 : 0);
    }
    document.getElementById('csvImportFile').accept = '.xlsx,.xls,.csv';
    document.getElementById('csvImportHint').textContent = 'Impor 2 tahap. Identitas dicocokkan berdasarkan NISN, lalu NIS; perubahan nama/kelas/guru diperbarui untuk ID yang sama. Nomor ganda atau NIS dan NISN yang bertentangan akan diblokir untuk diperiksa. Guru Tahfidz pada Excel menyinkronkan anggota kelompok.';
}
function switchManageTab(tab) {
    if (!['siswa', 'guru', 'guru-tahsin', 'guru-tahfidz', 'impor'].includes(tab))
        return;
    if (tab === 'impor' && !AppAccess.full()) return;
    if (tab === 'guru')
        tab = 'guru-tahsin';
    currentManageTab = (tab === 'siswa' || tab === 'impor') ? tab : 'guru';
    if (currentManageTab === 'guru')
        currentTeacherGroup = tab === 'guru-tahfidz' ? 'tahfidz' : 'tahsin';
    managePage = 1;
    ['siswa', 'guru-tahsin', 'guru-tahfidz', 'impor'].forEach(name => {
        const button = document.getElementById(`tab-${name}`);
        button.setAttribute('aria-pressed', String(name === tab));
        button.className = name === tab ? 'px-4 py-2.5 text-sm font-semibold border-b-2 border-indigo-600 text-indigo-600 transition-all' : 'px-4 py-2.5 text-sm font-medium border-b-2 border-transparent text-slate-500 hover:text-slate-800 transition-all';
    });
    renderManageTable();
}
async function openManageModal(id = null) {
    if (AppAccess.teacher() && currentManageTab === "guru" && !id)
        return;
    const item = id ? getManageData().find(row => String(row.id) === String(id)) : null;
    if (id && !item)
        return AdminNotice.notify('Data tidak ditemukan. Silakan muat ulang halaman.');
    document.getElementById('entityId').value = item?.id || '';
    document.getElementById('modalTitle').textContent = `${item ? 'Ubah' : 'Tambah'} Data ${currentManageTab === 'guru' ? 'Guru' : 'Siswa'}`;
    const fields = document.getElementById('formFields');
    if (currentManageTab === 'guru') {
        fields.innerHTML = `<div><label class="block text-xs font-bold text-slate-600 uppercase mb-2">Nama Guru</label><input id="inputGuruNama" required value="${manageEscape(item?.nama || item?.nama_guru || '')}" class="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm"></div>`;
        if (AppAccess.full())
            fields.innerHTML += `<div><label for="inputGuruNamaLengkap" class="block text-xs font-bold text-slate-600 uppercase mb-2">Nama lengkap untuk rapor</label><input id="inputGuruNamaLengkap" maxlength="160" value="${manageEscape(item?.nama_lengkap || '')}" class="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm" placeholder="Nama lengkap beserta gelar"><p class="mt-2 text-xs text-slate-500">Terpisah dari nama guru yang digunakan pada absensi.</p></div>`;
        if (AppAccess.full())
            fields.innerHTML += `<div><label for="inputGuruAttendance" class="block text-xs font-bold text-slate-600 uppercase mb-2">Tampil pada absensi (Tahsin)</label><select id="inputGuruAttendance" class="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm"><option value="true" ${(item ? item.attendance_enabled !== false : currentTeacherGroup === 'tahsin') ? 'selected' : ''}>Ya - guru Tahsin / kedua pelajaran</option><option value="false" ${(item ? item.attendance_enabled === false : currentTeacherGroup === 'tahfidz') ? 'selected' : ''}>Tidak - khusus Tahfidz</option></select></div>`;
    }
    else {
        fields.innerHTML = `<div><label class="block text-xs font-bold text-slate-600 uppercase mb-2">Nama Siswa</label><input id="inputSiswaNama" required value="${manageEscape(item?.['nama siswa'] || item?.nama_siswa || '')}" class="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm"></div><input type="hidden" id="inputSiswaGuru" value="${manageEscape(item?.['nama guru'] || item?.nama_guru || 'Belum ditugaskan')}"><div><label class="block text-xs font-bold text-slate-600 uppercase mb-2">Kelas</label><input id="inputSiswaKelas" required value="${manageEscape(item?.kelas || '')}" class="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm" placeholder="Contoh: Kelas 1A"></div>`;
        if (AppAccess.full() && item) {
            // Identitas diambil langsung dari tabel tersendiri; student master tidak memuat NIS/NISN.
            const { data: ids, error: idsError } = await supabase.from('student_identifiers')
                .select('nis,nisn').eq('student_id', item.id).maybeSingle();
            if (idsError) return AdminNotice.notify('Gagal membaca NIS/NISN siswa: ' + idsError.message, 'error');
            fields.innerHTML += `<div class="rounded-xl border border-amber-200 bg-amber-50 p-4 space-y-3">
                <p class="text-xs font-semibold uppercase text-amber-800">Identitas siswa — bisa dikoreksi tanpa impor ulang</p>
                <label class="block text-xs font-semibold text-slate-700" for="inputSiswaNis">NIS
                    <input id="inputSiswaNis" type="text" inputmode="numeric" autocomplete="off" maxlength="32" value="${manageEscape(ids?.nis || '')}" placeholder="Kosongkan jika belum valid" class="mt-1 w-full px-4 py-3 bg-white border border-slate-200 rounded-xl text-sm">
                </label>
                <label class="block text-xs font-semibold text-slate-700" for="inputSiswaNisn">NISN
                    <input id="inputSiswaNisn" type="text" inputmode="numeric" autocomplete="off" maxlength="32" value="${manageEscape(ids?.nisn || '')}" placeholder="Kosongkan jika belum valid" class="mt-1 w-full px-4 py-3 bg-white border border-slate-200 rounded-xl text-sm">
                </label>
                <p class="text-xs text-amber-800">Nomor tidak wajib. Nomor yang digunakan siswa lain akan ditolak, bukan menimpa pemiliknya.</p>
            </div>`;
        }
        else if (AppAccess.full() && !item) {
            fields.innerHTML += '<p class="text-xs text-slate-500">Setelah siswa dibuat, klik Edit untuk melengkapi NIS dan NISN.</p>';
        }

    }
    if (AppAccess.teacher()) {
        const teacherInput = document.getElementById('inputSiswaGuru') || document.getElementById('inputGuruNama');
        if (teacherInput) {
            teacherInput.value = AppAccess.profile.teacherName;
            teacherInput.readOnly = true;
        }
    }
    document.getElementById('manageModal').classList.remove('hidden');
    document.getElementById('modalContent').classList.remove('scale-95', 'opacity-0');
}
async function handleFormSubmit(event) {
    event.preventDefault();
    const button = document.getElementById('submitBtn');
    if (button.disabled)
        return;
    const id = document.getElementById('entityId').value;
    const teacherTab = currentManageTab === 'guru';
    const table = teacherTab ? 'teachers' : 'students';
    const payload = teacherTab
        ? { nama: document.getElementById('inputGuruNama').value.trim() }
        : { 'nama siswa': document.getElementById('inputSiswaNama').value.trim(), 'nama guru': document.getElementById('inputSiswaGuru').value.trim(), kelas: document.getElementById('inputSiswaKelas').value.trim() };
    if (teacherTab && AppAccess.full()) {
        payload.attendance_enabled = document.getElementById('inputGuruAttendance').value === 'true';
        payload.nama_lengkap = document.getElementById('inputGuruNamaLengkap').value.trim() || null;
        if (id && payload.attendance_enabled === false) {
            payload.foto = null;
            payload.foto_storage_path = null;
        }
    }
    if (Object.entries(payload).some(([key, value]) => value === '' && key !== 'nama_lengkap'))
        return AdminNotice.notify('Semua kolom wajib diisi.');
    if (AppAccess.teacher()) {
        if (teacherTab) {
            delete payload.nama;
            if (!id)
                return;
        }
        else
            payload['nama guru'] = AppAccess.profile.teacherName;
    }
    button.disabled = true;
    const buttonText = button.textContent;
    button.textContent = 'Menyimpan...';
    try {
        let saved;
        if (teacherTab && AppAccess.teacher()) {
            saved = getManageData().find(row => String(row.id) === String(id));
            if (!saved) throw new Error('Guru terkait tidak ditemukan.');
        }
        else if (id && !teacherTab && AppAccess.full()) {
            const nis = document.getElementById('inputSiswaNis').value.trim();
            const nisn = document.getElementById('inputSiswaNisn').value.trim();
            if ([nis, nisn].some(value => value && !/^\d{1,32}$/.test(value)))
                throw new Error('NIS dan NISN harus berupa angka maksimal 32 digit. Kosongkan jika belum diketahui.');
            const { error } = await supabase.rpc('save_student_profile_and_identifiers', {
                p_student_id: Number(id), p_student_name: payload['nama siswa'],
                p_class_name: payload.kelas, p_tahsin_teacher: payload['nama guru'],
                p_nis: nis || null, p_nisn: nisn || null
            });
            if (error) throw error;
            saved = { ...payload, id };
        }
        else if (id) {
            const { data, error } = await supabase.from(table).update(payload).eq('id', id).select('*').single();
            if (error)
                throw error;
            saved = data;
        }
        else if (!teacherTab && AppAccess.full()) {
            const { data, error } = await supabase.rpc('gm_create_student_master', {
                p_student_name: payload['nama siswa'],
                p_class_name: payload.kelas
            });
            if (error) throw error;
            saved = data;
        }
        else {
            const { data, error } = await supabase.from(table).insert([payload]).select('*').single();
            if (error)
                throw error;
            saved = data;
        }
        if (teacherTab && id && payload.attendance_enabled === false) {
            const previous = getManageData().find(row => String(row.id) === String(id));
            if (previous?.foto_storage_path?.startsWith(`portraits/${id}/`)) {
                try {
                    await supabase.storage.from('teachers').remove([previous.foto_storage_path]);
                }
                catch (cleanupError) {
                    console.warn('Foto lama perlu dibersihkan secara manual.', cleanupError);
                }
            }
        }
        if (teacherTab)
            teachersData = await getTeachers();
        else
            studentsData = await getStudents();
        closeManageModal();
        renderManageTable();
        if (identifierAuditLoaded && AppAccess.full() && !teacherTab) await checkMissingStudentIdentifiers();
        AdminNotice.notify('Data berhasil disimpan.', 'success');
    }
    catch (error) {
        AdminNotice.notify('Gagal menyimpan: ' + error.message, 'error');
    }
    finally {
        button.disabled = false;
        button.textContent = buttonText;
    }
}
// Dua tahap konfirmasi: tinjau jumlah relasi, lalu ketik ID siswa.
// Penghapusan sebenarnya wajib dilakukan RPC di database, bukan DELETE langsung.
async function deleteStudentVerified(id) {
    if (AppAccess.profile.role !== 'koordinator') return;
    const { data: preview, error: previewError } = await supabase.rpc('gm_student_delete_preview', { p_student_id: Number(id) });
    if (previewError) return AdminNotice.notify('Pratinjau penghapusan gagal: ' + previewError.message, 'error');
    const confirmed = await AdminNotice.confirm(
        `KONFIRMASI 1/2\nHapus siswa ${preview.name} (#${preview.id}), kelas ${preview.class}? ` +
        `${preview.attendance} absensi dan ${preview.subject_assessments} penilaian serta relasi siswa akan dihapus permanen. ` +
        'Guru, akun, foto dan data siswa lain tidak ikut dihapus. Buat backup terlebih dahulu.'
    );
    if (!confirmed) return;
    const phrase = `HAPUS ${preview.id}`;
    const typed = await AdminNotice.request({
        title: 'Konfirmasi penghapusan siswa',
        message: `Ketik tepat “${phrase}” untuk menghapus ${preview.name}.`,
        label: 'Konfirmasi',
        placeholder: phrase,
        confirmLabel: 'Hapus permanen'
    });
    if (typed !== phrase) return AdminNotice.notify('Penghapusan dibatalkan: konfirmasi kedua tidak cocok.', 'error');
    try {
        const { error } = await supabase.rpc('gm_delete_student_verified', {
            p_student_id: Number(id), p_expected_name: preview.name,
            p_expected_attendance: preview.attendance, p_confirmation: typed
        });
        if (error) throw error;
        studentsData = await getStudents();
        renderManageTable();
        AdminNotice.notify(`Siswa ${preview.name} beserta data terkait berhasil dihapus.`, 'success');
    } catch (error) { AdminNotice.notify('Penghapusan dibatalkan: ' + error.message, 'error'); }
}
async function deleteData(id) {
    if (currentManageTab !== 'guru') {
        if (AppAccess.profile?.role !== 'koordinator') return;
        return deleteStudentVerified(id);
    }
    if (AppAccess.teacher()) return;
    const item = getManageData().find(row => String(row.id) === String(id));
    if (!item) return;
    if (!(await AdminNotice.confirm(`Hapus ${getManageTitle(item)}? Data guru dan akun terkait akan dihapus; data siswa dan absensi tetap disimpan.`))) return;
    try {
        await deleteSchoolAccount('teacher', String(id));
        teachersData = await getTeachers();
        renderManageTable();
        AdminNotice.notify('Data guru berhasil dihapus dari Supabase.', 'success');
    } catch (error) {
        AdminNotice.notify(error.message, 'error');
    }
}
function visibleMissingIdentifierRows() {
    const selectedClass = document.getElementById('manageIdentifierAuditClass').value;
    const search = document.getElementById('manageIdentifierAuditSearch').value.trim().toLocaleLowerCase('id');
    return missingIdentifierRows.filter(row =>
        (!selectedClass || row.kelas === selectedClass) &&
        (!search || String(row.nama || '').toLocaleLowerCase('id').includes(search)));
}
function renderMissingStudentIdentifierResults() {
    const rows = visibleMissingIdentifierRows();
    const list = document.getElementById('manageIdentifierAuditList');
    if (!rows.length) {
        list.textContent = missingIdentifierRows.length ? 'Tidak ada siswa sesuai filter.' : 'Semua siswa memiliki NIS dan NISN.';
        return;
    }
    list.innerHTML = `<p class="mb-2 text-xs text-slate-600">Menampilkan ${rows.length} dari ${missingIdentifierRows.length} siswa dengan identitas belum lengkap.</p><table class="w-full text-left border-collapse"><thead><tr><th class="p-2">Nama siswa</th><th class="p-2">Kelas / Guru Tahsin</th><th class="p-2">NIS</th><th class="p-2">NISN</th><th class="p-2">Perbaiki</th></tr></thead><tbody>${rows.map(row => `<tr class="border-t border-amber-200"><td class="p-2 font-semibold">${manageEscape(row.nama)} <small class="text-slate-500">#${manageEscape(row.id)}</small></td><td class="p-2">${manageEscape(row.kelas)}<br><small>${manageEscape(row.guru)}</small></td><td class="p-2">${row.nis ? manageEscape(row.nis) : '<strong class="text-rose-600">Kosong</strong>'}</td><td class="p-2">${row.nisn ? manageEscape(row.nisn) : '<strong class="text-rose-600">Kosong</strong>'}</td><td class="p-2"><button type="button" onclick="openManageModal('${manageEscape(row.id)}')" class="text-indigo-700 underline">Edit</button></td></tr>`).join('')}</tbody></table>`;
}
async function checkMissingStudentIdentifiers() {
    if (!AppAccess.full()) return;
    const button = document.getElementById('manageCheckIdentifiersBtn');
    const section = document.getElementById('manageIdentifierAudit');
    const summary = document.getElementById('manageIdentifierAuditSummary');
    const list = document.getElementById('manageIdentifierAuditList');
    button.disabled = true;
    section.hidden = false;
    summary.textContent = 'Memeriksa seluruh data siswa...';
    try {
        const { data, error } = await supabase.rpc('list_missing_student_identifiers');
        if (error) throw error;
        identifierAuditLoaded = true;
        missingIdentifierRows = Array.isArray(data?.rows) ? data.rows : [];
        summary.textContent = `${data?.total || 0} siswa belum lengkap · NIS kosong: ${data?.nis_missing || 0} · NISN kosong: ${data?.nisn_missing || 0} · Keduanya kosong: ${data?.both_missing || 0}`;
        document.getElementById('manageCopyMissingBtn').hidden = !missingIdentifierRows.length;
        const availableClasses = [...new Set(missingIdentifierRows.map(row => row.kelas).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'id',{numeric:true}));
        const selector = document.getElementById('manageIdentifierAuditClass');
        const previous = selector.value;
        selector.innerHTML = '<option value="">Semua kelas</option>' + availableClasses.map(name => `<option value="${manageEscape(name)}">${manageEscape(name)}</option>`).join('');
        if (availableClasses.includes(previous)) selector.value = previous;
        document.getElementById('manageIdentifierAuditFilters').hidden = !missingIdentifierRows.length;
        renderMissingStudentIdentifierResults();
    } catch (error) {
        summary.textContent = 'Pemeriksaan gagal: ' + error.message;
        list.textContent = 'Periksa apakah SQL identitas terbaru sudah dipasang.';
        AdminNotice.notify('Pemeriksaan NIS/NISN gagal', 'error');
    } finally { button.disabled = false; }
}
function copyMissingStudentNames() {
    if (!missingIdentifierRows.length) return;
    const text = ['ID\tNama Siswa\tKelas\tGuru Tahsin\tNIS\tNISN',
       ...visibleMissingIdentifierRows().map(row => [row.id,row.nama,row.kelas,row.guru,row.nis || 'KOSONG',row.nisn || 'KOSONG'].join('\t'))].join('\n');
    if (!navigator.clipboard?.writeText) return AdminNotice.notify('Browser ini belum mendukung salin otomatis.', 'error');
    navigator.clipboard.writeText(text).then(() => AdminNotice.notify('Daftar nama siswa berhasil disalin.', 'success'))
      .catch(() => AdminNotice.notify('Gagal menyalin daftar siswa.', 'error'));
}

let studentImportPreview = null;
let studentImportEntries = null;
let studentImportFingerprint = '';
function resetStudentImportPreview() {
    studentImportPreview = null;
    studentImportEntries = null;
    studentImportFingerprint = '';
    const button = document.getElementById('csvImportBtn');
    if (button && !button.disabled)
        button.textContent = 'Analisis File';
    const result = document.getElementById('studentImportResult');
    if (result) {
        result.hidden = false;
        result.textContent = 'Belum ada hasil pemeriksaan. Pilih file lalu klik “Analisis File”.';
    }
}
function importFingerprint(file, yearKey) {
    return [file?.name || '', file?.size || 0, file?.lastModified || 0, yearKey].join('|');
}
function renderStudentImportPreview(data) {
    const result = document.getElementById('studentImportResult');
    const summary = data.summary || {};
    const rows = Array.isArray(data.rows) ? data.rows : [];
    const issues = rows.filter(row => row.action === 'conflict' || row.action === 'review');
    const localGroups = Array.isArray(data.file_groups) ? data.file_groups :
        (Array.isArray(data.groups) ? data.groups : []);
    const clearedRows = rows.filter(row => row.clear_identifiers && ['new','update','unchanged'].includes(row.action));

    const sameFileRows = (row, field) => {
        const value = String(row?.[field] || '').trim();
        if (!value)
            return [];
        return rows.filter(other => Number(other.row) !== Number(row.row)
            && String(other?.[field] || '').trim() === value);
    };

    const relatedNotes = row => {
        const notes = [];
        (row.related_file_rows || []).forEach(other => {
            notes.push(`${String(other.field || '').toUpperCase()} sama dengan baris ${other.row}: ${other.nama || '(nama kosong)'} (${other.kelas || '-'})`);
        });
        (row.duplicate_target_file_rows || []).forEach(other => {
            notes.push(`ID siswa sama dengan baris ${other.row}: ${other.nama || '(nama kosong)'} (${other.kelas || '-'})`);
        });
        sameFileRows(row, 'nis').forEach(other => {
            notes.push(`NIS sama dengan baris ${other.row}: ${other.nama || '(nama kosong)'} (${other.kelas || '-'})`);
        });
        sameFileRows(row, 'nisn').forEach(other => {
            notes.push(`NISN sama dengan baris ${other.row}: ${other.nama || '(nama kosong)'} (${other.kelas || '-'})`);
        });
        if (row.target_student_id)
            notes.push(`Terhubung dengan ID siswa database ${row.target_student_id}`);
        if (Array.isArray(row.database_candidate_ids) && row.database_candidate_ids.length > 1)
            notes.push(`Duplikasi master nama+kelas pada ID: ${row.database_candidate_ids.join(', ')}`);
        return [...new Set(notes)];
    };

    const lines = [
        'HASIL PEMERIKSAAN FILE IMPOR',
        `Baru: ${summary.new || 0} · Diperbarui/Disinkronkan: ${summary.update || 0} · Sudah sesuai: ${summary.unchanged || 0} · Perlu diperiksa: ${summary.review || 0} · Konflik: ${summary.conflict || 0}`,
        `Referensi guru yang belum ada: ${summary.teacher_new || 0}`,
        'Identitas bermasalah harus diperbaiki, tidak dikosongkan otomatis.',
        ...(data.local_only ? [] : [
            `Tahun ajaran: ${data.year_key || '-'} / ${(Number(data.year_key) || 0) + 1}`,
            `Perlu sinkronisasi guru/Tahfidz/rapor: ${summary.link_sync || 0} siswa`,
            `Guru Tahfidz kosong dalam file: ${summary.tahfidz_empty || 0} baris (kelompok lama tidak dihapus)`
        ]),
        ''
    ];

    if (data.local_only) {
        lines.splice(0, lines.length,
            'KONFLIK TERDETEKSI LANGSUNG DARI FILE — BELUM ADA DATA DISIMPAN',
            `Jumlah baris file: ${data.total_file_rows || rows.length} · Baris bermasalah: ${issues.length} · Kelompok NIS/NISN sama: ${localGroups.length}`, '');
        if (localGroups.length) {
            lines.push('NAMA SISWA YANG MEMAKAI NIS / NISN SAMA', '');
            localGroups.forEach((group, i) => {
                lines.push(`${i + 1}. ${group.field.toUpperCase()} SAMA: ${group.value}`);
                group.matches.forEach(match => lines.push(`   • BARIS ${match.row}: ${match.nama || '(nama kosong)'} — ${match.kelas || '(kelas kosong)'}`));
                lines.push('');
            });
        }
        lines.push('Pemeriksaan kecocokan dengan database belum dijalankan karena ada identitas ganda di dalam file.', '');
    }
    if (clearedRows.length && issues.length) {
        lines.push(`NIS/NISN YANG AKAN DIKOSONGKAN JIKA KONFLIK LAIN SELESAI (${clearedRows.length} SISWA)`, '');
        clearedRows.forEach(row => lines.push(`• Baris ${row.row}: ${row.nama} — ${row.identifier_warning || 'nomor ganda'} — NIS file ${row.original_nis || '-'}, NISN file ${row.original_nisn || '-'}`));
        lines.push('');
    }
    if (issues.length) {
        lines.push(`DATA YANG WAJIB DIPERIKSA (${issues.length} BARIS)`, '');
        issues.forEach((row, index) => {
            const label = row.action === 'review' ? 'PERLU DIPERIKSA' : 'KONFLIK';
            const related = relatedNotes(row);
            lines.push(`${index + 1}. Baris ${row.row}: ${row.nama || '(nama kosong)'}`);
            lines.push(`   Kelas : ${row.kelas || '-'}`);
            lines.push(`   NIS   : ${row.nis || '-'}`);
            lines.push(`   NISN  : ${row.nisn || '-'}`);
            lines.push(`   Status: ${label}`);
            lines.push(`   Masalah: ${row.reason || '-'}`);
            if (related.length) {
                lines.push('   Ditemukan sama/terkait dengan:');
                related.forEach(note => lines.push(`   - ${note}`));
            }
            else {
                lines.push('   Ditemukan sama/terkait dengan: tidak ada pasangan lain di file; periksa data lama di database.');
            }
            lines.push('');
        });
        lines.push('IMPOR DIBLOKIR. Perbaiki nomor baris di atas di Excel, simpan, PILIH ULANG file yang sudah diperbaiki, lalu klik “Analisis File”.');
    }
    else {
        lines.push('TIDAK ADA DATA KONFLIK/PERLU DIPERIKSA.', '');
        if (!data.local_only) {
            if (clearedRows.length) {
                lines.push(`NIS/NISN AKAN DIKOSONGKAN (${clearedRows.length} SISWA) — cek nama berikut sebelum menekan Proses Impor`, '');
                clearedRows.forEach((row, index) => {
                    lines.push(`${index + 1}. Baris ${row.row}: ${row.nama} — ${row.kelas} — ID ${row.target_student_id || 'BARU'}`);
                    lines.push(`   NIS file: ${row.original_nis || '-'} · NISN file: ${row.original_nisn || '-'}`);
                    lines.push(`   Penyebab: ${row.identifier_warning || 'Nomor ganda'}`);
                    if (row.identifier_db_owners) lines.push(`   Nomor juga dipakai oleh: ${row.identifier_db_owners}`);
                    const localMatches = localGroups.filter(group => group.matches.some(match => Number(match.row) === Number(row.row)));
                    localMatches.forEach(group => lines.push(`   ${group.field.toUpperCase()} sama dalam file: ${group.matches.map(match => `baris ${match.row} ${match.nama}`).join('; ')}`));
                    lines.push('');
                });
                lines.push('Nomor siswa di atas akan NULL; lengkapi nanti melalui Siswa → Edit atau Cek NIS/NISN Kosong.', '');
            }
            const changeRows = rows.filter(row => row.action === 'new' || row.action === 'update');
            lines.push(`RENCANA PEMBARUAN (${changeRows.length} SISWA)`, '');
            changeRows.slice(0, 60).forEach((row, index) => {
                const todo = [];
                if (row.guru_tahsin) todo.push(`Tahsin: ${row.guru_tahsin}${row.class_access_needs_sync ? ' (akses kelas perlu diperbarui)' : ''}`);
                if (row.guru_tahfidz) todo.push(`Tahfidz: ${row.guru_tahfidz}${row.tahfidz_needs_sync ? ' (perlu ditautkan)' : ''}`);
                if (Number(row.report_periods_missing) > 0) todo.push(`Tambah ${row.report_periods_missing} periode rapor`);
                if (Number(row.report_periods_refresh) > 0) todo.push(`Perbarui ${row.report_periods_refresh} daftar periode rapor`);
                lines.push(`${index + 1}. Baris ${row.row}: ${row.nama || '(nama kosong)'} — ID ${row.target_student_id || 'BARU'}`);
                lines.push(`   ${todo.join(' · ') || row.reason || 'Data identitas siswa'}`);
            });
            if (changeRows.length > 60) lines.push(`... dan ${changeRows.length - 60} siswa lainnya (lihat Excel).`);
            lines.push('', 'Rapor yang dibuat berupa daftar peserta saja; nilai dan rapor disetujui tidak diubah.');
            lines.push('Siswa dengan Guru Tahfidz kosong TIDAK akan dipindah otomatis ke kelompok mana pun.', '');
        }
        lines.push('Pratinjau selesai. Klik “Proses Impor Aman” jika tidak ada konflik dan seluruh perubahan guru/kelas sudah benar.');
    }

    result.textContent = lines.join('\n');
    result.hidden = false;
}

async function importManageCsv() {
    const file = document.getElementById('csvImportFile').files[0];
    if (!file)
        return AdminNotice.notify('Pilih file yang akan diimpor.');
    const year_key = Number(document.getElementById('studentImportYear').value);
    if (!Number.isInteger(year_key) || year_key < 2000 || year_key > 2200)
        return AdminNotice.notify('Isi tahun awal ajaran antara 2000–2200.', 'error');
    const fingerprint = importFingerprint(file, year_key);
    const button = document.getElementById('csvImportBtn');
    if (button.disabled)
        return;
    const result = document.getElementById('studentImportResult');
    button.disabled = true;
    try {
        if (!studentImportPreview || studentImportFingerprint !== fingerprint || !studentImportPreview.can_import) {
            button.textContent = 'Menganalisis...';
            result.hidden = false;
            result.textContent = 'Sedang memeriksa file impor...';
            const entries = await StudentImport.read(file);
            // Audit lokal mengumpulkan nama pasangan nomor ganda; server versi baru
            // tetap menganalisis SEMUA baris dan mengosongkan nomor berulang.
            const fileAudit = StudentImport.auditFileDuplicates(entries);
            if (!fileAudit.can_import) {
                studentImportPreview = fileAudit;
                studentImportEntries = null; // Nothing can be saved from this preview.
                studentImportFingerprint = fingerprint;
                renderStudentImportPreview(fileAudit);
                button.textContent = 'Analisis Ulang';
                AdminNotice.notify('File impor perlu diperiksa', 'error');
                return;
            }
            const { data, error } = await supabase.rpc('preview_import_students', { entries, year_key });
            if (error)
                throw error;
            data.file_groups = fileAudit.groups;
            studentImportPreview = data;
            studentImportEntries = entries;
            studentImportFingerprint = fingerprint;
            renderStudentImportPreview(data);
            if (data.can_import) {
                button.textContent = 'Proses Impor Aman';
                AdminNotice.notify(data.summary?.identifiers_cleared ?
                    'Analisis selesai. Ada NIS/NISN yang akan dikosongkan; periksa daftar nama di bawah.' :
                    'Analisis selesai. Tidak ada konflik yang memblokir impor.', 'success');
            }
            else {
                button.textContent = 'Analisis Ulang';
                AdminNotice.notify('File impor perlu diperiksa', 'error');
            }
            return;
        }
        if (!studentImportPreview.can_import) {
            return AdminNotice.notify('File impor perlu diperiksa', 'error');
        }
        if (!(await AdminNotice.confirm(`Simpan impor tahun ajaran ${year_key}/${year_key + 1}? ${studentImportPreview.summary?.new || 0} siswa baru, ${studentImportPreview.summary?.update || 0} siswa diperbarui, ${studentImportPreview.summary?.link_sync || 0} relasi perlu disinkronkan. Nomor ganda, identitas bertentangan, dan nama ambigu WAJIB diperiksa; jangan membuat ID ganda. Penugasan Tahsin/Tahfidz dan daftar 4 periode rapor akan diselaraskan sesuai Excel. Nilai/rapor terbit serta ID lama tidak dihapus.`))) {
            button.textContent = 'Proses Impor Aman';
            return;
        }
        button.textContent = 'Menyimpan...';
        const { data, error } = await supabase.rpc('import_students', {
            entries: studentImportEntries,
            year_key,
            preview_token: studentImportPreview.token
        });
        if (error)
            throw error;
        studentsData = await getStudents();
        teachersData = await getTeachers();
        renderManageTable();
        document.getElementById('csvImportFile').value = '';
        const summary = `${data.created} siswa baru, ${data.updated} master diperbarui, ${data.unchanged} master sudah sesuai. ${(data.tahfidz_added || 0)} kelompok Tahfidz ditautkan, ${(data.report_added || 0)} daftar periode rapor dibuat, ${(data.report_refreshed || 0)} daftar rapor diperbarui. ${(data.teachers_created || 0)} guru baru dibuat. Pencocokan NISN/NIS dan keanggotaan Tahfidz telah diperiksa.`;
        result.textContent = 'IMPOR BERHASIL\n' + summary + '\n\n' +
            `Tahun ajaran: ${year_key}/${year_key + 1}. Periksa menu Tahsin, Kelompok Tahfidz, dan Rapor.\n` +
            'Guru Tahfidz yang berbeda dari guru Tahsin tidak harus memiliki jumlah siswa yang sama.';
        result.hidden = false;
        studentImportPreview = null;
        studentImportEntries = null;
        studentImportFingerprint = '';
        AdminNotice.notify(summary, 'success');
    }
    catch (error) {
        studentImportPreview = null;
        studentImportEntries = null;
        studentImportFingerprint = '';
        const staleServerHint = /NISN? berulang dalam file/i.test(error.message || '')
            ? '\n\nFungsi impor Supabase kemungkinan masih versi lama. Pasang ulang supabase/student-import.sql pada PROYEK PENGUJIAN, lalu analisis ulang.'
            : '';
        result.textContent = 'FILE IMPOR PERLU DIPERIKSA\n\n' + error.message + staleServerHint
            + '\n\nTidak ada data yang disimpan atau ID siswa yang dihapus oleh proses analisis.';
        result.hidden = false;
        AdminNotice.notify('File impor perlu diperiksa', 'error');
    }
    finally {
        button.disabled = false;
        if (!studentImportPreview)
            button.textContent = 'Analisis File';
        else if (studentImportPreview.can_import)
            button.textContent = 'Proses Impor Aman';
        else
            button.textContent = 'Analisis Ulang';
        refreshManageImportControls();
    }
}
document.addEventListener('panelready', () => {
    document.getElementById('manageSearch').addEventListener('input', () => { managePage = 1; renderManageTable(); });
    document.getElementById('managePrevPage').addEventListener('click', () => { if (managePage > 1) {
        managePage--;
        renderManageTable();
    } });
    document.getElementById('manageNextPage').addEventListener('click', () => { managePage++; renderManageTable(); });
    document.getElementById('csvImportBtn').addEventListener('click', importManageCsv);
    document.getElementById('csvImportFile').addEventListener('change', resetStudentImportPreview);
    document.getElementById('studentImportYear').addEventListener('change', resetStudentImportPreview);
    document.getElementById('manageCheckIdentifiersBtn').addEventListener('click', checkMissingStudentIdentifiers);
    document.getElementById('manageCopyMissingBtn').addEventListener('click', copyMissingStudentNames);
    document.getElementById('manageIdentifierAuditClass').addEventListener('change', renderMissingStudentIdentifierResults);
    document.getElementById('manageIdentifierAuditSearch').addEventListener('input', renderMissingStudentIdentifierResults);
    document.getElementById('manageLevelFilter').addEventListener('change', () => {
        document.getElementById('manageStudentFilterMode').value = '';
        document.getElementById('manageStudentDetailFilter').value = '';
        managePage = 1;
        renderManageTable();
    });
    document.getElementById('manageStudentFilterMode').addEventListener('change', () => {
        document.getElementById('manageStudentDetailFilter').value = '';
        managePage = 1;
        renderManageTable();
    });
    document.getElementById('manageStudentDetailFilter').addEventListener('change', () => { managePage = 1; renderManageTable(); });
});
let attendanceDonutChart = null;
let classComparisonChart = null;
function applySchoolProfile(profile) {
    if (!profile)
        return;
    const name = profile.name || 'Gemar Mengaji';
    const logo = (!profile.logo_url || String(profile.logo_url).includes('FjF61ou.png')) ? 'assets/school-logo.png' : profile.logo_url;
    document.getElementById('adminSchoolName')?.replaceChildren(document.createTextNode(name));
    document.getElementById('adminSchoolAddress')?.replaceChildren(document.createTextNode(profile.address || ''));
    const logoElement = document.getElementById('adminSchoolLogo');
    if (logoElement)
        logoElement.src = logo;
    const loaderLogo = document.getElementById('loaderSchoolLogo');
    if (loaderLogo) {
        loaderLogo.src = logo;
        loaderLogo.hidden = false;
        loaderLogo.parentElement.hidden = false;
    }
    const loaderName = document.getElementById('loaderSchoolName');
    if (loaderName)
        loaderName.textContent = name;
    const nameInput = document.getElementById('settingsSchoolName');
    const addressInput = document.getElementById('settingsSchoolAddress');
    const colorInput = document.getElementById('settingsThemeColor');
    if (nameInput && document.activeElement !== nameInput)
        nameInput.value = name;
    if (addressInput && document.activeElement !== addressInput)
        addressInput.value = profile.address || '';
    if (colorInput && document.activeElement !== colorInput)
        colorInput.value = resolveThemeColor(profile.theme_color);
    document.documentElement.style.setProperty('--brand-color', resolveThemeColor(profile.theme_color));
    document.getElementById('settingsNamePreview')?.replaceChildren(document.createTextNode(name));
    const previewLogo = document.getElementById('settingsLogoPreview');
    if (previewLogo)
        previewLogo.src = logo;
    const colorText = document.getElementById('settingsThemeColorValue');
    if (colorText)
        colorText.textContent = resolveThemeColor(profile.theme_color);
    const colorPreview = document.getElementById('settingsColorPreview');
    if (colorPreview)
        colorPreview.style.backgroundColor = resolveThemeColor(profile.theme_color);
}
async function loadSchoolSettings() {
    if (!AppAccess.full())
        return;
    try {
        applySchoolProfile(await getSchoolProfile());
    }
    catch (error) {
        console.error('Gagal memuat pengaturan sekolah:', error);
    }
}
async function saveSchoolSettings(event) {
    if (!AppAccess.full())
        return;
    event.preventDefault();
    const button = document.getElementById('saveSchoolSettings');
    const logoFile = document.getElementById('settingsSchoolLogo').files[0] || null;
    if (logoFile && logoFile.size > 2 * 1024 * 1024)
        return AdminNotice.notify('Ukuran logo maksimal 2 MB.');
    const originalText = button.textContent;
    button.disabled = true;
    button.textContent = 'Menyimpan...';
    try {
        const profile = await updateSchoolProfile(document.getElementById('settingsSchoolName').value.trim(), document.getElementById('settingsSchoolAddress').value.trim(), logoFile, document.getElementById('settingsThemeColor').value);
        applySchoolProfile(profile);
        document.getElementById('settingsSchoolLogo').value = '';
        AdminNotice.notify('Pengaturan sekolah berhasil disimpan.');
    }
    catch (error) {
        console.error('Gagal menyimpan pengaturan sekolah:', error);
        AdminNotice.notify(`Gagal menyimpan pengaturan: ${error.message}`);
    }
    finally {
        button.disabled = false;
        button.textContent = originalText;
    }
}
function normalizeAttendanceStatus(value) {
    const status = safeLowerCase(value);
    if (status === 'hadir' || status === 'h')
        return 'hadir';
    if (status === 'sakit' || status === 's')
        return 'sakit';
    if (status === 'izin' || status === 'i')
        return 'izin';
    return 'alpha';
}
function populateInfographicFilters() {
    const year = document.getElementById('infoYear');
    const teacher = document.getElementById('infoTeacher');
    const level = document.getElementById('infoLevel');
    const kelas = document.getElementById('infoClass');
    const years = [...new Set((attendanceData || []).map(row => String(row.date || '').slice(0, 4)).filter(Boolean))].sort().reverse();
    if (!years.includes(String(new Date().getFullYear())))
        years.unshift(String(new Date().getFullYear()));
    year.innerHTML = '<option value="">Pilih tahun</option>' + years.map(value => `<option value="${value}">${value}</option>`).join('');
    teacher.innerHTML = '<option value="">Semua guru</option>' + [...new Set((studentsData || []).map(row => row['nama guru'] || row.nama_guru).filter(Boolean))].sort().map(value => `<option value="${manageEscape(value)}">${manageEscape(value)}</option>`).join('');
    const levelValues = [...new Set((studentsData || []).map(row => getManageLevel(row.kelas || row.kelas_nama).trim()).filter(Boolean))].sort((a, b) => Number(a) - Number(b));
    level.innerHTML = '<option value="">Semua tingkat</option>' + levelValues.map(value => `<option value="${manageEscape(value)}">Tingkat ${manageEscape(value)}</option>`).join('');
    const classValues = [...new Set((studentsData || []).map(row => row.kelas || row.kelas_nama).filter(Boolean))].sort((a, b) => String(a).localeCompare(String(b), 'id'));
    kelas.innerHTML = '<option value="">Semua nama kelas</option>' + classValues.map(value => `<option value="${manageEscape(value)}">${manageEscape(value)}</option>`).join('');
}
async function showInfographic() {
    if (!AppAccess.full())
        return;
    const year = document.getElementById('infoYear').value;
    const months = Array.from(document.getElementById('infoMonth').selectedOptions).map(option => option.value).filter(Boolean).sort();
    const teacher = safeLowerCase(document.getElementById('infoTeacher').value);
    const levelFilter = document.getElementById('infoLevel').value;
    const classFilter = document.getElementById('infoClass').value;
    if (!year || !months.length)
        return AdminNotice.notify('Pilih tahun dan minimal satu bulan terlebih dahulu.');
    const month = months[0], lastMonth = months[months.length - 1];
    const firstDate = `${year}-${month}-01`;
    const lastDate = `${year}-${lastMonth}-${String(new Date(Number(year), Number(lastMonth), 0).getDate()).padStart(2, '0')}`;
    const button = document.getElementById('showInfographicBtn');
    try {
        if (button) {
            button.disabled = true;
            button.textContent = 'Memuat data...';
        }
        if (!studentsData?.length)
            await fetchStudents();
        await fetchAttendanceData({ date_from: firstDate, date_to: lastDate });
        const matchingStudents = (studentsData || []).filter(student => {
            const studentTeacher = safeLowerCase(student['nama guru'] || student.nama_guru);
            const studentClass = String(student.kelas || student.class_name || student.kelas_nama || '').trim();
            const matchesTeacher = !teacher || studentTeacher === teacher;
            const matchesLevel = !levelFilter || getManageLevel(studentClass) === levelFilter;
            const matchesClass = !classFilter || studentClass === classFilter;
            return matchesTeacher && matchesLevel && matchesClass;
        });
        const insight = buildAttendanceInsights(matchingStudents, attendanceData || [], firstDate, lastDate, months);
        const counts = insight.totals;
        const classCounts = new Map(insight.rows.map(row => [row.name, { hadir: row.hadir, total: row.total }]));
        document.getElementById('infoRate').textContent = insight.rate === null ? '-' : `${insight.rate.toFixed(1)}%`;
        document.getElementById('infoStudents').textContent = insight.students;
        document.getElementById('infoRecorded').textContent = counts.recorded;
        document.getElementById('infoMissing').textContent = counts.missing;
        document.getElementById('infoScope').textContent = `${months.map(getMonthName).join(', ')} ${year} — ${insight.days} hari dihitung, termasuk akhir pekan`;
        document.getElementById('classComparisonRows').innerHTML = insight.rows.map(row => { const pct = value => row.total ? (value / row.total * 100).toFixed(1) + '%' : '—'; return `<tr><th>${manageEscape(row.name)}</th><td>${row.students}</td><td>${pct(row.hadir)}</td><td>${pct(row.sakit)}</td><td>${pct(row.izin)}</td><td>${pct(row.alpha)}</td><td>${row.missing}</td><td><strong>${pct(row.hadir)}</strong></td></tr>`; }).join('');
        const totalRecords = counts.total;
        if (!totalRecords) {
            document.getElementById('infoEmptyState').textContent = 'Tidak ada siswa atau hari yang sudah berjalan pada filter ini.';
            document.getElementById('infoEmptyState').classList.remove('hidden');
            document.getElementById('infoContent').classList.add('hidden');
            return;
        }
        document.getElementById('infoHadir').textContent = counts.hadir;
        document.getElementById('infoSakit').textContent = counts.sakit;
        document.getElementById('infoIzin').textContent = counts.izin;
        document.getElementById('infoAlpha').textContent = counts.alpha;
        document.getElementById('infoEmptyState').classList.add('hidden');
        document.getElementById('infoContent').classList.remove('hidden');
        attendanceDonutChart?.destroy();
        classComparisonChart?.destroy();
        const legend = [['Hadir', 'hadir', '#10b981'], ['Sakit', 'sakit', '#f59e0b'], ['Izin', 'izin', '#0ea5e9'], ['Alfa', 'alpha', '#f43f5e']];
        document.getElementById('attendanceDonutLegend').innerHTML = legend.map(([name, key, color]) => '<div><span style="background:' + color + '"></span><b>' + name + '</b><strong>' + (counts[key] / counts.total * 100).toFixed(1) + '%</strong></div>').join('');
        attendanceDonutChart = new Chart(document.getElementById('attendanceDonut'), { type: 'doughnut', data: { labels: legend.map(row => row[0]), datasets: [{ data: legend.map(row => counts[row[1]]), backgroundColor: legend.map(row => row[2]), borderWidth: 0 }] }, options: { maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { callbacks: { label: context => context.label + ': ' + (context.raw / counts.total * 100).toFixed(1) + '%' } } }, cutout: '65%' } });
        const entries = [...classCounts.entries()];
        classComparisonChart = new Chart(document.getElementById('classComparisonChart'), { type: 'bar', data: { labels: entries.map(([name]) => name), datasets: [{ label: 'Kehadiran (%)', data: entries.map(([, value]) => value.total ? Number((value.hadir / value.total * 100).toFixed(1)) : null), backgroundColor: getComputedStyle(document.documentElement).getPropertyValue('--brand-color').trim() || '#216454', borderRadius: 8 }] }, options: { indexAxis: 'y', maintainAspectRatio: false, scales: { x: { beginAtZero: true, max: 100, ticks: { callback: value => `${value}%` } } }, plugins: { legend: { display: false } } } });
    }
    catch (error) {
        console.error('Gagal memuat infografik:', error);
        AdminNotice.notify('Infografik gagal dimuat. Periksa koneksi database lalu coba lagi.');
    }
    finally {
        if (button) {
            button.disabled = false;
            button.textContent = 'Tampilkan Infografik';
        }
    }
}
function switchPage(pageId) {
    if (pageId === 'laporan') { switchPage('presentasi'); switchPresentationTab('reports'); return; }
    if (['infografik', 'analitik'].includes(pageId)) pageId = 'presentasi';
    const currentPage = document.body?.dataset?.activePage || '';
    const leaveApproved = document.body?.dataset?.assessmentLeaveApproved === 'true';
    if (!leaveApproved && currentPage === 'penilaian' && pageId !== 'penilaian' && window.PeriodicAssessments?.hasUnsavedChanges?.()) {
        Promise.resolve(PeriodicAssessments.confirmLeave?.()).then(ok => {
            if (!ok) return;
            if (document.body?.dataset) document.body.dataset.assessmentLeaveApproved = 'true';
            try { switchPage(pageId); }
            finally { if (document.body?.dataset) delete document.body.dataset.assessmentLeaveApproved; }
        });
        return;
    }
    const pages = ['dashboard','rapor','laporan','arsip','analitik','presentasi','absensi','kelola','kelompok','kelompok-tahsin','profil','penilaian','infografik','identitas','pengaturan','maintenance'];
    if (!pages.includes(pageId) || !AppAccess.canPage(pageId))
        return;
    if (document.body?.dataset) document.body.dataset.activePage = pageId;
    const headings = {
        dashboard: ['Dashboard', 'Ringkasan Gemar Mengaji.', ''],
        laporan: ['Laporan', 'Target Tahsin dan Tahfidz.', ''],
        arsip: ['Arsip Rapor', 'Riwayat rapor siswa.', ''],
        analitik: ['Analitik Periode', 'Bandingkan ketercapaian target secara agregat.', 'Tanpa menampilkan identitas siswa.'],
        presentasi: ['Laman Presentasi', 'Ringkasan data Gemar Mengaji untuk presentasi.', 'Data ditampilkan per tingkat dan kelas.'],
        rapor: ['Rapor Siswa', 'Laporan perkembangan siswa.', 'Periksa dan terbitkan rapor per tingkat kelas.'],
        kelompok: ['Kelola Tahfidz', 'Kelola kelompok Tahfidz.', ''],
        'kelompok-tahsin': ['Kelola Tahsin', 'Kelola kelompok Tahsin.', ''],
        profil: ['Pengaturan Profil', 'Profil rapi, akses lebih personal.', 'Kelola nama profil, foto dan keamanan akun dalam satu tempat.'],
        absensi: ['Data Absensi', 'Catat kehadiran, dampingi kebaikan.', 'Pantau dan kelola rekap kehadiran siswa dalam satu tempat.'],
        penilaian: ['Penilaian Periodik', 'Catat perkembangan, rawat potensi.', 'Penilaian Tahsin dan Tahfidz untuk setiap tahap belajar siswa.'],
        kelola: ['Kelola Data', 'Data tertata, belajar lebih terarah.', 'Kelola data siswa dan guru untuk mendukung kegiatan mengaji.'],
        infografik: ['Infografik Absensi', 'Lihat perkembangan kehadiran.', 'Temukan ringkasan dan perbandingan kehadiran setiap kelas.'],
        maintenance: ['Mode Maintenance', 'Sejenak menata, untuk kembali lebih baik.', 'Kelola ketersediaan website tanpa mengganggu pekerjaan administrasi.'],
        pengaturan: ['Pengaturan Sistem', 'Pengaturan tertata, pekerjaan lebih mudah.', 'Kelola rapor, hak akses akun serta referensi materi dan surat.'],
        identitas: ['Identitas Sekolah', 'Profil sekolah dalam satu halaman.', 'Kelola nama, alamat, logo dan warna tema aplikasi.']
    };
    ['adminHeaderTitle', 'adminPageTitle', 'adminPageDescription'].forEach((id, index) => {
        const element = document.getElementById(id);
        if (element)
            element.textContent = headings[pageId][index];
    });
    const eyebrow = document.getElementById('adminEyebrow');
    if (eyebrow && pageId !== 'dashboard') eyebrow.textContent = 'PANEL ADMINISTRASI';
    pages.forEach(name => {
        const item = document.getElementById(`menu-${name}`);
        if (name === pageId)
            item?.setAttribute('aria-current', 'page');
        else
            item?.removeAttribute('aria-current');
    });
    pages.forEach(name => {
        const page = document.getElementById(`page-${name}`);
        if (!page)
            return;
        page.classList.toggle('hidden', name !== pageId);
        if (name === pageId) {
            page.classList.remove('page-animate-in');
            requestAnimationFrame(() => page.classList.add('page-animate-in'));
        }
    });
    ['menu-dashboard','menu-rapor','menu-laporan','menu-arsip','menu-analitik','menu-presentasi','menu-kelompok','menu-kelompok-tahsin','menu-profil','menu-absensi','menu-kelola','menu-penilaian','menu-infografik','menu-identitas','menu-pengaturan','menu-maintenance'].forEach(id => document.getElementById(id)?.classList.remove('bg-indigo-600', 'text-white'));
    const active = document.getElementById(`menu-${pageId}`);
    active?.classList.add('bg-indigo-600', 'text-white');
    if (pageId === 'absensi') void loadAttendanceLog();
    if (pageId === 'dashboard')
        GMUpgrade.dashboard();
    if (pageId === 'kelola')
        void gmOpenManageData();
    if (pageId === 'kelompok')
        LearningGroups.open('tahfidz');
    if (pageId === 'kelompok-tahsin')
        LearningGroups.open('tahsin');
    if (pageId === 'profil')
        AccountProfile.open();
    if (pageId === 'penilaian')
        PeriodicAssessments.open();
    if (pageId === 'rapor')
        StudentReports.open();
    if (pageId === 'arsip')
        GMUpgrade.archive();
    if (pageId === 'infografik')
        populateInfographicFilters();
    if (pageId === 'identitas')
        loadSchoolSettings();
    if (pageId === 'pengaturan') {
        SettingsHub.open();
        ReportSettings.open();
    }
    if (pageId === 'maintenance')
        loadMaintenanceMode();
    if (pageId === 'analitik')
        window.GMRev46?.loadAnalytics?.();
    if (pageId === 'presentasi') { switchPresentationTab('overview'); window.GMRev46?.loadPresentation?.(); }
    setMobileDrawer(false);
}
document.addEventListener('panelready', () => {
    document.getElementById('showInfographicBtn')?.addEventListener('click', showInfographic);
    document.getElementById('infoLevel')?.addEventListener('change', () => {
        const classFilter = document.getElementById('infoClass');
        if (classFilter) classFilter.value = '';
    });
    document.getElementById('topLogoutBtn')?.addEventListener('click', () => document.getElementById('logoutBtn')?.click());
    document.getElementById('schoolSettingsForm')?.addEventListener('submit', saveSchoolSettings);
    document.getElementById('settingsThemeColor')?.addEventListener('input', event => {
        const value = document.getElementById('settingsThemeColorValue');
        const preview = document.getElementById('settingsColorPreview');
        if (value) value.textContent = event.target.value;
        if (preview) preview.style.backgroundColor = event.target.value;
    });
    // Pengaturan identitas sekolah dimuat saat menu Identitas dibuka.
});

// Nama tetap ringkas pada HP; sentuh sel nama untuk membaca nama lengkap.
document.addEventListener('panelready', () => {
    const table = document.getElementById('monthlyReportTable');
    if (!table) return;
    const showFullName = target => {
        const cell = target.closest?.('td[data-fullname]');
        if (cell && window.matchMedia('(max-width: 640px)').matches)
            AdminNotice.notify(cell.dataset.fullname, 'info');
    };
    table.addEventListener('click', event => showFullName(event.target));
    table.addEventListener('keydown', event => {
        if (event.key === 'Enter' || event.key === ' ') showFullName(event.target);
    });
});
