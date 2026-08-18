// Kita gunakan 'let' dan periksa apakah sudah dideklarasikan secara global.
// Jika belum dideklarasikan di file lain, kita buat baru. 
// Jika sudah ada, kita gunakan variabel yang sudah ada tersebut.

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

// SINKRONISASI ID SEUSAI HTML (Menggunakan id asli tanpa akhiran 'Btn')
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

// Menghindari tabrakan state data
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

// Fungsi bantu format tanggal display lokal Indonesia
function formatDateForDisplay(dateVal) {
    if (!dateVal) return '-';
    const d = new Date(dateVal);
    if (isNaN(d.getTime())) return String(dateVal);
    return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
}

async function filterAttendanceData() {
    const yearVal = filterYear ? filterYear.value : '';
    const monthVal = filterMonth ? filterMonth.value : '';
    const teacherVal = filterTeacher ? filterTeacher.value : '';
    const classNumVal = filterClassNumber ? filterClassNumber.value : '';

    // Jika pengguna memilih bulan, fetch data untuk rentang bulan tersebut agar lengkap
    if (monthVal) {
        const year = yearVal || new Date().getFullYear().toString();
        const from = `${year}-${String(monthVal).padStart(2, '0')}-01`;
        const lastDay = new Date(Number(year), Number(monthVal), 0).getDate();
        const to = `${year}-${String(monthVal).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

        try {
            await fetchAttendanceData({ date_from: from, date_to: to });
        } catch (e) {
            console.error('Gagal fetch data untuk filter bulan:', e);
        }
    }

    filteredAttendanceData = attendanceData.filter(item => {
        let match = true;
        const itemDate = new Date(item.date);
        
        if (yearVal && itemDate.getFullYear().toString() !== yearVal) match = false;
        if (monthVal && (itemDate.getMonth() + 1).toString().padStart(2, '0') !== monthVal) match = false;
        if (teacherVal && item.guru_id?.toString() !== teacherVal) match = false;
        if (classNumVal && item.kelas_tingkat?.toString() !== classNumVal) match = false;
        
        return match;
    });

    currentPage = 1;
    renderAdminData(); // Render data log reguler terlebih dahulu
    
    // Halaman admin memiliki renderer rekap modern sendiri di admin.html.
    // Jangan jalankan renderer lama juga: selain menggandakan pekerjaan, versi
    // lama bergantung pada buildAttendanceMap yang tidak tersedia di halaman ini.
    if (monthVal && reportContainer) {
        if (typeof window.renderMonthlyReportTable !== 'function') {
            reportContainer.style.display = 'block';
            if (typeof renderAdminTable === 'function') {
                renderAdminTable();
            } else if (typeof generateMonthlyReport === 'function') {
                generateMonthlyReport();
            }
        }
    } else if (reportContainer) {
        reportContainer.style.display = 'none';
    }
}

// FUNGSI UTAMA: Render tabel riwayat log absensi di bagian bawah halaman
function renderAdminData() {
    if (!adminDataList) return;

    const startIndex = (currentPage - 1) * recordsPerPage;
    const endIndex = Math.min(startIndex + recordsPerPage, filteredAttendanceData.length);
    const currentRecords = filteredAttendanceData.slice(startIndex, endIndex);

    if (recordCount) recordCount.textContent = filteredAttendanceData.length;
    if (pageIndicator) pageIndicator.textContent = currentPage;

    updatePaginationButtons();
    
    if (currentRecords.length === 0) {
        adminDataList.innerHTML = `
            <tr>
                <td colspan="6" class="py-8 text-center text-slate-400 font-medium">
                    Tidak ada arsip log riwayat absensi tersedia.
                </td>
            </tr>
        `;
        return;
    }
    
    adminDataList.innerHTML = currentRecords.map(record => `
        <tr class="hover:bg-slate-50 transition-all border-b border-slate-100">
            <td class="px-6 py-3.5 font-medium text-slate-800">${formatDateForDisplay(record.date)}</td>
            <td class="px-6 py-3.5 text-slate-600">${record.teacher || record.nama_guru || '-'}</td>
            <td class="px-6 py-3.5 text-slate-600">${record.class || record.kelas_nama || '-'}</td>
            <td class="px-6 py-3.5 font-semibold text-slate-700">${record.student || record.nama_siswa || '-'}</td>
            <td class="px-6 py-3.5">
                <span class="px-2.5 py-1 rounded-full text-[11px] font-bold uppercase tracking-wide inline-flex items-center gap-1
                    ${
                        String(record.status).toLowerCase() === 'hadir' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 
                        String(record.status).toLowerCase() === 'sakit' ? 'bg-amber-50 text-amber-700 border border-amber-200' : 
                        String(record.status).toLowerCase() === 'izin' ? 'bg-sky-50 text-sky-700 border border-sky-200' : 
                        'bg-rose-50 text-rose-700 border border-rose-200'
                    }">
                    ${
                        String(record.status).toLowerCase() === 'hadir' ? '✅ Hadir' : 
                        String(record.status).toLowerCase() === 'sakit' ? '🤒 Sakit' : 
                        String(record.status).toLowerCase() === 'izin' ? '📝 Izin' : 
                        '❌ Alpha'
                    }
                </span>
            </td>
            <td class="px-6 py-3.5 text-slate-500 italic">${record.note || record.catatan || '-'}</td>
        </tr>
    `).join('');
}

// FUNGSI REKAP: Digunakan untuk merender struktur tabel matrix bulanan (H/S/I/A) ke #monthlyReportTable
function renderAdminTable() {
    const tbody = document.getElementById('monthlyReportTable'); 
    if (!tbody) return;

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
        if (!classVal) return '';
        const match = String(classVal).match(/\d+/);
        return match ? match[0] : String(classVal).trim();
    };

    const formatDateToYYYYMMDD = (dateVal) => {
        if (!dateVal) return '';
        const dateStr = String(dateVal);
        if (dateStr.includes('-') && dateStr.length >= 10) return dateStr.substring(0, 10);
        const d = new Date(dateVal);
        if (isNaN(d.getTime())) return '';
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    };

    let filteredStudents = typeof studentsData !== 'undefined' && Array.isArray(studentsData) ? [...studentsData] : [];

    if (teacher) {
        filteredStudents = filteredStudents.filter(student => {
            if (!student) return false;
            const namaGuru = student['nama guru'] || student.nama_guru || '';
            return safeLowerCase(namaGuru) === safeLowerCase(teacher);
        });
    }

    if (className) {
        filteredStudents = filteredStudents.filter(student => {
            if (!student) return false;
            const kelasSiswa = student.kelas || student.kelas_nama || '';
            return safeLowerCase(kelasSiswa) === safeLowerCase(className);
        });
    } else if (classNumber) {
        filteredStudents = filteredStudents.filter(student => {
            if (!student) return false;
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

    // Header Generator untuk tabel bulanan matrix
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
    if (!reportBody) return;

    const attendanceMap = new Map();
    listAbsensi.forEach(record => {
        if (!record) return;
        const date = formatDateToYYYYMMDD(record.date || record.tanggal);
        const student = safeLowerCase(record.nama_siswa || record.student || record.student_name);
        if (date && student) attendanceMap.set(`${date}|${student}`, record);
    });

    filteredStudents.forEach((student, index) => {
        if (!student) return;
        const studentName = student['nama siswa'] || student.nama_siswa || 'Tanpa Nama';
        
        let hadirCount = 0, sakitCount = 0, izinCount = 0, alphaCount = 0;
        let cellsHtml = '';

        for (let day = 1; day <= daysInMonth; day++) {
            const dateStr = `${year}-${month}-${String(day).padStart(2, '0')}`;

            const record = attendanceMap.get(`${dateStr}|${safeLowerCase(studentName)}`);

            let statusCode = '';
            let bgClass = ''; 

            if (record) {
                const status = safeLowerCase(record.status);
                if (status === 'hadir' || status === 'h') { statusCode = 'H'; hadirCount++; bgClass = 'bg-emerald-50 text-emerald-700'; }
                else if (status === 'sakit' || status === 's') { statusCode = 'S'; sakitCount++; bgClass = 'bg-amber-50 text-amber-700'; }
                else if (status === 'izin' || status === 'i') { statusCode = 'I'; izinCount++; bgClass = 'bg-sky-50 text-sky-700'; }
                else if (status === 'alfa' || status === 'alpha' || status === 'a' || status === '-') { statusCode = '-'; alphaCount++; bgClass = 'bg-rose-50 text-rose-700'; }
            } else if (dateStr < todayStr) {
                statusCode = '-'; alphaCount++; bgClass = 'bg-rose-50 text-rose-700';
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
    if (!prevPage || !nextPage) return;

    const maxPage = Math.ceil(filteredAttendanceData.length / recordsPerPage) || 1;
    prevPage.disabled = (currentPage === 1);
    nextPage.disabled = (currentPage >= maxPage);
}

function populateAdminDropdowns() {
    const dropdownGuru = document.getElementById('filterTeacher');
    const dropdownTingkat = document.getElementById('filterClassNumber');
    const dropdownNamaKelas = document.getElementById('filterClassName');
    
    if (dropdownGuru && typeof teachersData !== 'undefined' && Array.isArray(teachersData)) {
        dropdownGuru.innerHTML = '<option value="">Semua Guru</option>';
        const uniqueTeachers = [...new Set(teachersData.map(g => g.nama || g.nama_guru).filter(Boolean))].sort();
        uniqueTeachers.forEach(name => {
            const option = document.createElement('option');
            option.value = name; option.textContent = name;
            dropdownGuru.appendChild(option);
        });
    }

    if (dropdownTingkat && typeof studentsData !== 'undefined' && Array.isArray(studentsData)) {
        dropdownTingkat.innerHTML = '<option value="">Semua Tingkat</option>';
        const uniqueTingkat = [...new Set(studentsData.map(s => {
            const kelas = s.kelas || s.kelas_nama || '';
            const match = kelas.match(/\d+/);
            return match ? match[0] : kelas;
        }).filter(Boolean))].sort();

        uniqueTingkat.forEach(tingkat => {
            const option = document.createElement('option');
            option.value = tingkat; option.textContent = "Tingkat " + tingkat;
            dropdownTingkat.appendChild(option);
        });
    }

    if (dropdownNamaKelas && typeof studentsData !== 'undefined' && Array.isArray(studentsData)) {
        dropdownNamaKelas.innerHTML = '<option value="">Semua Nama Kelas</option>';
        const uniqueNamaKelas = [...new Set(studentsData.map(s => s.kelas || s.kelas_nama).filter(Boolean))].sort();
        uniqueNamaKelas.forEach(kelas => {
            const option = document.createElement('option');
            option.value = kelas; option.textContent = kelas;
            dropdownNamaKelas.appendChild(option);
        });
    }
}

// Pengendali Aksi Tombol Navigasi Paginasi secara Aman
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

// Hubungkan tombol filter di HTML ke fungsi filter JS
const filterBtn = document.getElementById('filterBtn');
if (filterBtn) {
    filterBtn.addEventListener('click', filterAttendanceData);
}

// Jalankan inisialisasi ketika data siap
window.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
        if (typeof attendanceData !== 'undefined' && attendanceData.length > 0) {
            filteredAttendanceData = [...attendanceData];
            populateAdminDropdowns(); 
            renderAdminData();       
        }
    }, 1000);
});
