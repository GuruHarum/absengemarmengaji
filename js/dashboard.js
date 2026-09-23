        let currentPage = 1;
        let recordsPerPage = 10;

        const reportContainer = document.getElementById('reportContainer');
        const monthlyReportTable = document.getElementById('monthlyReportTable');
        const avgAttendanceRate = document.getElementById('avgAttendanceRate');
        
        const metaGuru = document.getElementById('metaGuru');
        const metaKelas = document.getElementById('metaKelas');
        const metaBulan = document.getElementById('metaBulan');

        // Fungsi Filter Laporan dari Log Database Riil
        // ==================== FUNGSI PEMBANTU (HELPER) ====================
// Mengubah tanggal mentah dari database menjadi format YYYY-MM-DD
function formatDateToYYYYMMDD(dateVal) {
    if (!dateVal) return '';
    try {
        const raw = String(dateVal);
        if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
        const d = new Date(dateVal);
        if (isNaN(d.getTime())) return '';
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    } catch (e) {
        return '';
    }
}

// Mengubah string menjadi lowercase secara aman
function safeLowerCase(val) {
    if (val === undefined || val === null) return '';
    return String(val).toLowerCase().trim();
}


// ==================== FUNGSI UTAMA RENDER TABEL ====================
async function renderMonthlyReportTable(selectedMonth, selectedYear, selectedTeacher, selectedClass, isInitialLoad = false) {
    const monthlyReportTable = document.getElementById('monthlyReportTable');
    const avgAttendanceRate = document.getElementById('avgAttendanceRate');

    if (!monthlyReportTable) return;

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
        if (avgAttendanceRate) avgAttendanceRate.innerText = "0.00%";
        return; 
    }

    showLoading(true);

    try {
        // Ambil data mentah jika belum terisi di state global
        if (typeof fetchStudents === 'function' && studentsData.length === 0) {
            await fetchStudents();
        }
        if (typeof fetchAttendanceData === 'function' && attendanceData.length === 0) {
            await fetchAttendanceData();
        }

        const yearInt = parseInt(selectedYear) || new Date().getFullYear();
        const monthInt = parseInt(selectedMonth) || (new Date().getMonth() + 1);
        const daysInMonth = new Date(yearInt, monthInt, 0).getDate();

        // Variabel pembantu format YYYY-MM untuk dateStr
        const yearStr = String(yearInt);
        const monthStr = String(monthInt).padStart(2, '0');

        // Logika tanggal hari ini (Today) untuk pembanding Alfa Otomatis
        const todayObj = new Date();
        const todayStr = `${todayObj.getFullYear()}-${String(todayObj.getMonth() + 1).padStart(2, '0')}-${String(todayObj.getDate()).padStart(2, '0')}`;

        // Perbarui Meta Tampilan Informasi
        if (typeof metaGuru !== 'undefined') metaGuru.innerText = selectedTeacher || "Semua Guru";
        if (typeof metaKelas !== 'undefined') metaKelas.innerText = selectedClass || "Semua Kelas";
        if (typeof metaBulan !== 'undefined' && typeof getMonthName === 'function') {
            metaBulan.innerText = `${getMonthName(monthInt)} ${yearInt}`;
        }

        // Filter siswa berdasarkan guru dan kelas/tingkat yang dipilih.
        let filteredStudents = [...studentsData];
        if (selectedTeacher) {
            const teacherKey = safeLowerCase(selectedTeacher);
            filteredStudents = filteredStudents.filter(student => safeLowerCase(student['nama guru'] || student.nama_guru) === teacherKey);
        }
        if (selectedClass && selectedClass !== "Semua Tingkat" && selectedClass !== "Semua Nama Kelas") {
            const cleanSelectedClass = selectedClass.toString().toLowerCase().trim();
            filteredStudents = studentsData.filter(student => {
                const studentClass = student.kelas || student.class_name || student.kelas_nama || "";
                const cleanStudentClass = studentClass.toString().toLowerCase().trim();
                const classNumber = extractClassNumber(String(studentClass));
                return cleanStudentClass === cleanSelectedClass || classNumber === cleanSelectedClass;
            });
            if (selectedTeacher) {
                const teacherKey = safeLowerCase(selectedTeacher);
                filteredStudents = filteredStudents.filter(student => safeLowerCase(student['nama guru'] || student.nama_guru) === teacherKey);
            }
        }
        filteredStudents.sort((a, b) => String(a['nama siswa'] || a.nama || '').localeCompare(String(b['nama siswa'] || b.nama || ''), 'id'));

        if (filteredStudents.length === 0) {
            monthlyReportTable.innerHTML = `
                <tr>
                    <td class="p-8 text-center text-slate-400">Data Siswa Tidak Ditemukan.</td>
                </tr>
            `;
            if (avgAttendanceRate) avgAttendanceRate.innerText = "0.00%";
            showLoading(false);
            return;
        }

        // 1. Bangun Header Kalender (1 s.d Akhir Bulan)
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

        // Indeks dibuat sekali. Sebelumnya setiap sel tabel menjalankan
        // Array.find() terhadap seluruh absensi, yang sangat lambat pada data besar.
        const attendanceMap = new Map();
        const attendanceByStudentDate = new Map();
        attendanceData.forEach(record => {
            if (!record) return;
            const recordDate = formatDateToYYYYMMDD(record.date || record.tanggal);
            const recordStudent = safeLowerCase(record.nama_siswa || record.student || record.student_name);
            const recordTeacher = safeLowerCase(record.nama_guru || record.teacher || record.teacher_name);
            if (recordDate && recordStudent) {
                attendanceMap.set(`${recordDate}|${recordStudent}|${recordTeacher}`, record);
                // Cadangan untuk data lama yang belum menyimpan nama guru.
                attendanceMap.set(`${recordDate}|${recordStudent}|`, record);
                attendanceByStudentDate.set(`${recordDate}|${recordStudent}`, record);
            }
        });

        // 2. Iterasi Setiap Siswa
        filteredStudents.forEach(student => {
            const studentName = student["nama siswa"] || student.nama || student.student_name || "";
            
            // Inisialisasi Counter untuk Siswa ini
            let hadirCount = 0;
            let sakitCount = 0;
            let izinCount = 0;
            let alphaCount = 0;

            let studentRow = `
                <tr class="divide-x divide-slate-200 hover:bg-slate-50 transition-colors">
                    <td class="px-4 py-3 font-semibold text-slate-800 sticky left-0 bg-white hover:bg-slate-50 z-10 shadow-[2px_0_5px_rgba(0,0,0,0.05)] whitespace-nowrap">
                        ${studentName}
                    </td>
            `;

            let cellsHtml = '';

            // Looping Hari dalam Bulan (1 s.d 28/29/30/31)
            for (let day = 1; day <= daysInMonth; day++) {
                const dateStr = `${yearStr}-${monthStr}-${String(day).padStart(2, '0')}`;

                // 1. Ambil record dari indeks O(1), bukan mencari seluruh array.
                const studentKey = safeLowerCase(studentName);
                const teacherKey = safeLowerCase(selectedTeacher);
                let record = teacherKey
                    ? attendanceMap.get(`${dateStr}|${studentKey}|${teacherKey}`)
                    : attendanceMap.get(`${dateStr}|${studentKey}|`);
                if (!record && !teacherKey) {
                    record = attendanceByStudentDate.get(`${dateStr}|${studentKey}`);
                }

                let statusCode = '-'; // Default tampilan jika belum ada data
                let bgClass = 'text-gray-400'; // Default warna abu-abu untuk hari ini / masa depan yang kosong

                if (record) {
                    const status = safeLowerCase(record.status);
                    if (status === 'hadir' || status === 'h') { 
                        statusCode = 'H'; 
                        hadirCount++; 
                        bgClass = 'bg-emerald-100 text-emerald-800 font-bold'; 
                    } else if (status === 'sakit' || status === 's') { 
                        statusCode = 'S'; 
                        sakitCount++; 
                        bgClass = 'bg-amber-100 text-amber-800 font-bold';
                    } else if (status === 'izin' || status === 'i') { 
                        statusCode = 'I'; 
                        izinCount++; 
                        bgClass = 'attendance-badge bg-blue-100 text-blue-800 font-bold';
                    } else if (status === 'alfa' || status === 'alpha' || status === 'a' || status === '-') { 
                        statusCode = '-'; 
                        alphaCount++; 
                        bgClass = 'bg-red-100 text-red-800 font-bold';
                    }
                } else {
                    // 2. LOGIKA ALFA OTOMATIS UNTUK TANGGAL YANG SUDAH BERJALAN
                    if (dateStr <= todayStr) {
                        statusCode = '-';
                        alphaCount++;     // Masukkan ke dalam hitungan Alfa siswa
                        bgClass = 'bg-red-50 text-red-500 font-medium'; // Beri warna merah soft khas Alfa otomatis
                    }
                }

                // Tambahkan cell td ke HTML baris siswa
                cellsHtml += `<td class="p-1 text-center text-xs ${bgClass}">${statusCode}</td>`;
            }

            // Hitung Persentase Kehadiran Siswa secara Real-time
            const totalAbsenSiswa = hadirCount + sakitCount + izinCount + alphaCount;
            const persentaseSiswa = totalAbsenSiswa > 0 ? Math.round((hadirCount / totalAbsenSiswa) * 100) : 0;
            totalPercent += persentaseSiswa;
            totalPercentStudents++;

            // Gabungkan cell data siswa dengan kolom rekap H, S, I, A, dan % di akhir baris
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

        // Hitung Tingkat Kehadiran Rata-rata Kelas
        const rateRataRata = totalPercentStudents > 0
            ? (totalPercent / totalPercentStudents).toFixed(2)
            : "0.00";
        
        if (avgAttendanceRate) {
            avgAttendanceRate.innerText = `${rateRataRata}%`;
        }

        if (typeof reportContainer !== 'undefined' && reportContainer) {
            reportContainer.style.display = 'block';
        }

    } catch (error) {
        console.error("Gagal memuat rekap data riil:", error);
    }
    
    showLoading(false);
}

        // ==========================================================
        // FUNGSI UTAMA MERENDER LOG RIWAYAT ABSENSI (LOCAL FALLBACK)
        // ==========================================================
        function renderLocalAdminLogTable(filterTeacher = "", filterClass = "", isInitialLoad = false) {
            const adminDataList = document.getElementById('adminDataList');
            const recordCount = document.getElementById('recordCount');
            
            if (!adminDataList) return;

            // ==========================================================
            // TAMPILKAN INSTRUKSI FILTER JIKA BARU PERTAMA KALI DIMUAT
            // ==========================================================
            if (isInitialLoad === true) {
                adminDataList.innerHTML = `
                    <tr>
                        <td colspan="6" class="px-6 py-12 text-center text-slate-400">
                            Silakan terapkan filter terlebih dahulu untuk menampilkan log riwayat absensi.
                        </td>
                    </tr>
                `;
                if (recordCount) recordCount.innerText = "0";
                return; // Berhenti di sini
            }
            
            // Cek apakah data absensi global sudah ada isinya
            if (!attendanceData || attendanceData.length === 0) {
                adminDataList.innerHTML = `
                    <tr>
                        <td colspan="6" class="px-6 py-8 text-center text-slate-400">
                            Belum ada riwayat data absensi yang terekam.
                        </td>
                    </tr>
                `;
                if (recordCount) recordCount.innerText = "0";
                return;
            }

            // Filter data secara dinamis berdasarkan input user
            let filteredLogs = [...attendanceData];
            
            if (filterTeacher) {
                filteredLogs = filteredLogs.filter(item => {
                    const guru = item.teacher || item.guru || "";
                    return guru.toString().toLowerCase().includes(filterTeacher.toLowerCase());
                });
            }
            
            if (filterClass) {
                filteredLogs = filteredLogs.filter(item => {
                    const kelas = item.class || item.kelas || "";
                    return kelas.toString().toLowerCase().includes(filterClass.toLowerCase());
                });
            }

            // Urutkan data berdasarkan tanggal terbaru
            filteredLogs.sort((a, b) => {
                const dateA = new Date(a.date || a.tanggal || 0);
                const dateB = new Date(b.date || b.tanggal || 0);
                return dateB - dateA;
            });

            if (filteredLogs.length === 0) {
                adminDataList.innerHTML = `
                    <tr>
                        <td colspan="6" class="px-6 py-8 text-center text-slate-400">
                            Tidak ada data riwayat yang cocok dengan filter.
                        </td>
                    </tr>
                `;
                if (recordCount) recordCount.innerText = "0";
                return;
            }

            let html = "";
            filteredLogs.forEach(item => {
                // Pemetaan fleksibel untuk menghindari nilai "-" akibat perbedaan schema database
                const formattedDate = item.date || item.tanggal || "-";
                const guru = item.teacher || item.guru || "-";
                const kelas = item.class || item.kelas || "-";
                const siswa = item.student || item.siswa || "-";
                const statusRaw = item.status || "-";
                const status = statusRaw.toUpperCase().trim();
                const catatan = item.note || item.catatan || "-";

                // Tentukan warna badge berdasarkan status
                let badgeClass = "bg-slate-100 text-slate-800";
                if (status === 'HADIR' || status === 'H') badgeClass = "bg-emerald-100 text-emerald-800 font-bold";
                else if (status === 'SAKIT' || status === 'S') badgeClass = "bg-amber-100 text-amber-800 font-bold";
                else if (status === 'IZIN' || status === 'I') badgeClass = "attendance-badge bg-blue-100 text-blue-800 font-bold";
                else if (status === 'ALFA' || status === 'A' || status === 'ABSEN') badgeClass = "bg-red-100 text-red-800 font-bold";

                html += `
                    <tr class="hover:bg-slate-50/80 transition-colors">
                        <td class="px-6 py-4 whitespace-nowrap font-medium text-slate-600">${formattedDate}</td>
                        <td class="px-6 py-4 whitespace-nowrap font-semibold text-slate-700">${guru}</td>
                        <td class="px-6 py-4 whitespace-nowrap text-slate-600">${kelas}</td>
                        <td class="px-6 py-4 whitespace-nowrap font-bold text-slate-800">${siswa}</td>
                        <td class="px-6 py-4 whitespace-nowrap">
                            <span class="px-2.5 py-1 rounded-full text-xs ${badgeClass}">${status}</span>
                        </td>
                        <td class="px-6 py-4 text-slate-500 max-w-[200px] truncate">${catatan}</td>
                    </tr>
                `;
            });

            adminDataList.innerHTML = html;
            
            if (recordCount) {
                recordCount.innerText = filteredLogs.length;
            }
        }

        // Fungsi Helper untuk Format Tanggal di Cetakan
function formatTanggalCetak(dateObj) {
    const hari = String(dateObj.getDate()).padStart(2, '0');
    const bulanIndex = dateObj.getMonth(); // 0-11
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
    if (!className) return '';
    const match = className.match(/\d+/);
    return match ? match[0] : '';
}

// Fungsi Cetak Utama
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

    let filteredStudents = Array.isArray(studentsData) ? [...studentsData] : [];
    
    if (teacher && teacher.trim() !== '') {
        filteredStudents = filteredStudents.filter(student => {
            if (!student) return false;
            const namaGuru = student['nama guru'] ? String(student['nama guru']) : '';
            return namaGuru.toLowerCase() === teacher.toLowerCase();
        });
    }
    
    if (className && className.trim() !== '') {
        filteredStudents = filteredStudents.filter(student => {
            if (!student) return false;
            const kelasSiswa = student.kelas ? String(student.kelas) : '';
            return kelasSiswa.toLowerCase() === className.toLowerCase();
        });
    } else if (classNumber && classNumber.trim() !== '') {
        filteredStudents = filteredStudents.filter(student => {
            if (!student) return false;
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
        if (!student) return;
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
                if (!r) return false;
                const recordDate = r.date ? String(r.date) : '';
                const recordStudent = r.student ? String(r.student) : '';
                const recordTeacher = r.teacher ? String(r.teacher) : '';

                const matchDate = recordDate === dateStr;
                const matchStudent = recordStudent.toLowerCase() === studentName.toLowerCase();
                const matchTeacher = teacher ? recordTeacher.toLowerCase() === teacher.toLowerCase() : true;
                return matchDate && matchStudent && matchTeacher;
            });
            
            let statusCode = '-'; 
            if (record) {
                const status = record.status ? String(record.status).toLowerCase() : '';
                if (status === 'hadir' || status === 'h') { statusCode = 'H'; hadirCount++; }
                else if (status === 'sakit' || status === 's') { statusCode = 'S'; sakitCount++; }
                else if (status === 'izin' || status === 'i') { statusCode = 'I'; izinCount++; }
                else if (status === 'alpha' || status === 'alfa' || status === 'a' || status === '-') { statusCode = '-'; alphaCount++; }
            } else {
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
        alert("Koneksi ke database (Supabase client) tidak ditemukan! Pastikan database.js sudah dimuat.");
        return;
    }

    // Tampilkan loading sederhana pada tombol yang sedang aktif
    const originalBtnText = document.activeElement ? document.activeElement.innerText : '';
    let activeBtn = null;
    if (document.activeElement && document.activeElement.tagName === 'BUTTON') {
        activeBtn = document.activeElement;
        activeBtn.disabled = true;
        activeBtn.innerText = "Memproses Data...";
    }

    try {
        const safeLowerCase = (val) => {
            if (val === null || val === undefined) return '';
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
            if (!classVal) return '';
            const match = String(classVal).match(/\d+/);
            return match ? match[0] : String(classVal).trim();
        };

        const formatDateToYYYYMMDD = (dateVal) => {
            if (!dateVal) return '';
            const dateStr = String(dateVal);
            if (dateStr.includes('-') && dateStr.length >= 10) {
                return dateStr.substring(0, 10);
            }
            const d = new Date(dateVal);
            if (isNaN(d.getTime())) return '';
            return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        };

        // AMBIL VALUE FILTER SECARA AMAN
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

        // Gunakan state data yang sama dengan rekap web agar normalisasi dan
        // pencocokan status tidak menghasilkan angka yang berbeda.
        if (!Array.isArray(studentsData) || studentsData.length === 0) {
            await fetchStudents();
        }

        // Ambil rentang bulan aktif agar PDF tidak bergantung pada data lama
        // yang kebetulan sedang tersimpan di state halaman.
        const startDate = `${year}-${month}-01`;
        const endDate = `${year}-${month}-${new Date(year, parseInt(month), 0).getDate()}`;

        await fetchAttendanceData({ date_from: startDate, date_to: endDate });
        const dbStudentsList = Array.isArray(studentsData) ? studentsData : [];
        const listAbsensi = Array.isArray(attendanceData) ? attendanceData : [];

        // 3. FILTER DATA SISWA SECARA LOKAL
        let filteredStudents = [...dbStudentsList];
        
        if (teacher && teacher.trim() !== '') {
            filteredStudents = filteredStudents.filter(student => {
                if (!student) return false;
                const namaGuru = student['nama guru'] || student.nama_guru || '';
                return safeLowerCase(namaGuru) === safeLowerCase(teacher);
            });
        }
        
        if (className && className.trim() !== '') {
            filteredStudents = filteredStudents.filter(student => {
                if (!student) return false;
                const kelasSiswa = student.kelas || student.kelas_nama || '';
                return safeLowerCase(kelasSiswa) === safeLowerCase(className);
            });
        } else if (classNumber && classNumber.trim() !== '') {
            filteredStudents = filteredStudents.filter(student => {
                if (!student) return false;
                const kelasSiswa = student.kelas || student.kelas_nama || '';
                return localExtractClassNumber(kelasSiswa) === classNumber;
            });
        }

        // Urutkan siswa berdasarkan nama
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

        // 4. COCOKKAN DATA ABSENSI KE STRUKTUR BARIS TABEL
        filteredStudents.forEach(student => {
            if (!student) return;
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

                // Cari data absensi siswa berdasarkan tanggal 'dateStr' di kolom 'date'
                let record = listAbsensi.find(r => {
                    if (!r) return false;
                    
                    const recordDateRaw = r.date; // Hanya gunakan r.date karena created_at terbukti tidak ada
                    const formattedRecordDate = formatDateToYYYYMMDD(recordDateRaw);

                    const recordStudent = r.nama_siswa || r.student || '';
                    const recordTeacher = r.nama_guru || r.teacher || '';

                    const matchDate = formattedRecordDate === dateStr;
                    const matchStudent = safeLowerCase(recordStudent) === safeLowerCase(studentName);
                    
                    const matchTeacher = teacher 
                        ? safeLowerCase(recordTeacher) === safeLowerCase(teacher) 
                        : true;

                    return matchDate && matchStudent && matchTeacher;
                });

                let statusCode = '-'; 
                if (record) {
                    const status = safeLowerCase(record.status);
                    if (status === 'hadir' || status === 'h') { statusCode = 'H'; hadirCount++; }
                    else if (status === 'sakit' || status === 's') { statusCode = 'S'; sakitCount++; }
                    else if (status === 'izin' || status === 'i') { statusCode = 'I'; izinCount++; }
                    else if (status === 'alfa' || status === 'alpha' || status === 'a' || status === '-') { statusCode = '-'; alphaCount++; }
                } else {
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

        // 5. GENERATE PDF
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

    } catch (err) {
        console.error("Gagal mengambil data dari Supabase: ", err);
        alert("Terjadi kesalahan saat memproses data Supabase: " + err.message);
    } finally {
        if (activeBtn) {
            activeBtn.disabled = false;
            activeBtn.innerText = originalBtnText;
        }
    }
}

        // ==========================================================
        // INISIALISASI UNTUK MENGHINDARI DUPLIKASI DAN DOUBLE-RENDER
        // ==========================================================
        window.addEventListener('panelready', () => {
            showLoading(true);
            setTimeout(async () => {
                const currentMonth = (new Date().getMonth() + 1).toString().padStart(2, '0');
                const currentYear = new Date().getFullYear().toString();
                
                // 1. Bersihkan dropdown filter terlebih dahulu sebelum di-populate
                document.getElementById('filterTeacher').innerHTML = '<option value="">Semua Guru</option>';
                document.getElementById('filterClassNumber').innerHTML = '<option value="">Semua Tingkat</option>';
                document.getElementById('filterClassName').innerHTML = '<option value="">Semua Nama Kelas (Opsional)</option>';
                
                // 2. Tarik data Guru dan Siswa terlebih dahulu jika belum dimuat
                try {
                    if (typeof fetchTeachers === 'function' && teachersData.length === 0) {
                        await fetchTeachers();
                    }
                    if (typeof fetchStudents === 'function' && studentsData.length === 0) {
                        await fetchStudents();
                    }
                } catch (err) {
                    console.error("Gagal menarik data master guru/siswa:", err);
                }

                // 3. ISI DROPDOWN FILTER (Sekarang data dijamin sudah ada!)
                if (typeof populateAdminDropdowns === 'function') {
                    populateAdminDropdowns();
                } else if (typeof populateClassFilters === 'function') {
                    // Fallback jika nama fungsi di script lain berbeda
                    populateClassFilters();
                }
                
                if (typeof populateYearFilter === 'function') {
                    populateYearFilter();
                }
                
                // 4. Render tabel rekap bulanan pertama kali
                await renderMonthlyReportTable(currentMonth, currentYear, "", "", true);
                
                // 5. Amankan eksekusi render log riwayat absensi
                try {
                    if (typeof renderAdminTable === 'function') {
                        await renderAdminTable(); 
                    } else {
                        renderLocalAdminLogTable();
                    }
                } catch (err) {
                    console.warn("Gagal menjalankan renderAdminTable utama, beralih ke render lokal:", err);
                    renderLocalAdminLogTable();
                }
                
                showLoading(false);
            }, 1200);
        });

        document.addEventListener("panelready", () => {
    const printButton = document.getElementById("btn-print");
    const downloadButton = document.getElementById("btn-download");

    // Sambungkan Tombol Cetak
    if (printButton) {
        printButton.addEventListener("click", () => {
            // Pastikan data siswa dan absensi sudah siap sebelum mencetak
            if (typeof studentsData !== 'undefined' && studentsData.length > 0) {
                printAttendanceReport();
            } else {
                showNotification('warning', 'Tidak ada data siswa untuk dicetak.');
            }
        });
    }

    // Sambungkan Tombol Download PDF
    if (downloadButton) {
        downloadButton.addEventListener("click", () => {
            // Pastikan data siswa dan absensi sudah siap sebelum download
            if (typeof studentsData !== 'undefined' && studentsData.length > 0) {
                exportAttendanceToPDF();
            } else {
                showNotification('warning', 'Tidak ada data siswa untuk diunduh.');
            }
        });
    }
});

        // Binding Filter Action Button
        // ==========================================
        // ACTION CLICK PADA TOMBOL FILTER (DI-PERBAIKI)
        // ==========================================
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
            
            // Filter Nama Kelas (opsional) - Jika kosong, ambil filter Tingkat Kelas
            const c = document.getElementById('filterClassName').value || document.getElementById('filterClassNumber').value || "";
            
            // 1. Jalankan render rekap bulanan berdasarkan filter (bukan initial load lagi, jadi isInitialLoad = false)
            try {
                await renderMonthlyReportTable(m, y, t, c, false);

                // Jalankan filter untuk tabel log riwayat setelah rekap selesai.
                if (typeof renderAdminTable === 'function') {
                    await renderAdminTable();
                } else {
                    renderLocalAdminLogTable(t, c, false);
                }
            } catch (err) {
                renderLocalAdminLogTable(t, c, false);
            } finally {
                button.disabled = false;
                button.classList.remove('opacity-75', 'cursor-wait');
                button.innerHTML = originalButtonHtml;
            }
        });

        // Logout Panel
        document.getElementById('logoutBtn').addEventListener('click', () => {
            supabase.auth.signOut().finally(() => window.location.href = 'login.html');
        });

        // ==================== MODE MAINTENANCE ====================
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
            if (!statusEl) return;
            if (maintenanceMode) {
                statusEl.classList.remove('hidden');
                statusEl.innerText = 'ON';
                statusEl.classList.remove('text-green-400');
                statusEl.classList.add('text-red-400');
            } else {
                statusEl.classList.add('hidden');
                statusEl.innerText = 'OFF';
            }
        }

        window.handleMaintenanceRealtime = function(enabled) {
            maintenanceMode = enabled;
            updateMaintenanceStatusUI();
        };

        async function toggleMaintenance() {
    if (!AppAccess.full()) return;
            const button = document.getElementById('maintenanceToggleBtn');
            const feedback = document.getElementById('maintenanceFeedback');
            if (button.disabled) return;
            button.disabled = true;
            feedback.textContent = 'Menyimpan perubahan...';
            try {
                maintenanceMode = await setMaintenanceMode(!maintenanceMode);
                updateMaintenanceStatusUI();
                feedback.textContent = maintenanceMode ? 'Mode maintenance berhasil diaktifkan.' : 'Website kembali dapat digunakan.';
            } catch (error) {
                console.error('Gagal mengubah mode maintenance:', error);
                feedback.textContent = 'Perubahan belum tersimpan. Silakan coba lagi.';
            } finally {
                button.disabled = false;
            }
        }

        async function loadMaintenanceMode() {
    if (!AppAccess.full()) return;
            try {
                maintenanceMode = await getMaintenanceMode();
                updateMaintenanceStatusUI();
            } catch (error) {
                console.error('Gagal memuat mode maintenance:', error);
                document.getElementById('maintenanceFeedback').textContent = 'Status belum dapat dimuat. Buka kembali menu ini untuk mencoba lagi.';
            }
        }

        if (AppAccess.full()) loadMaintenanceMode();


    // ==================== STATE MANAJEMEN LOKAL ====================
let currentManageTab = 'siswa';
let editingIndex = null;

// Pemicu inisialisasi awal saat halaman dimuat
document.addEventListener('panelready', async () => {
    // Tarik data referensi guru dan kelas dari Supabase terlebih dahulu
    await fetchTeachers();
    await fetchClasses();
    
    // Tampilkan tab siswa secara default
    switchManageTab('siswa');
});

// ==================== FUNGSI PENGAMBILAN DATA (READ) FROM SUPABASE ====================
async function fetchTeachers() {
    try {
        teachersData = await getTeachers();
    } catch (err) {
        console.error("Gagal memuat data guru dari Supabase:", err.message);
    }
}

async function fetchClasses() {
    try {
        classesData = await getStudents();
    } catch (err) {
        console.error("Gagal memuat data kelas dari Supabase:", err.message);
    }
}

function closeManageModal() {
    const modal = document.getElementById('manageModal');
    const modalContent = document.getElementById('modalContent');
    
    if (!modal || !modalContent) return;

    modalContent.classList.remove('scale-100', 'opacity-100');
    modalContent.classList.add('scale-95', 'opacity-0');
    setTimeout(() => {
        modal.classList.add('hidden');
        document.getElementById('manageForm').reset();
        editingIndex = null;
    }, 200);
}

// ==================== KELOLA DATA: SISWA & GURU ====================
// Implementasi ini memakai ID database (bukan indeks tabel), sehingga tetap
// tepat walaupun data difilter, dicari, atau dipaginasi.
let managePage = 1;
const manageRowsPerPage = 25;

function manageEscape(value) {
    return String(value ?? '').replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char]);
}

function getManageData() {
    return currentManageTab === 'guru' ? (Array.isArray(teachersData) ? teachersData : []) : (Array.isArray(studentsData) ? studentsData : []);
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
    if (!filterWrap) return;
    filterWrap.classList.toggle('hidden', currentManageTab !== 'siswa');
    if (currentManageTab !== 'siswa') return;
    const levelSelect = document.getElementById('manageLevelFilter');
    const modeSelect = document.getElementById('manageStudentFilterMode');
    const detailSelect = document.getElementById('manageStudentDetailFilter');
    const previousLevel = levelSelect.value;
    const levels = [...new Set((Array.isArray(studentsData) ? studentsData : []).map(student => getManageLevel(student.kelas)).filter(Boolean))].sort((a, b) => Number(a) - Number(b));
    levelSelect.innerHTML = '<option value="">Pilih tingkat kelas dahulu</option>' + levels.map(level => `<option value="${manageEscape(level)}">Tingkat ${manageEscape(level)}</option>`).join('');
    if (levels.includes(previousLevel)) levelSelect.value = previousLevel;
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
        ? [...new Set(levelStudents.map(student => student['nama guru'] || student.nama_guru).filter(Boolean))].sort((a, b) => String(a).localeCompare(String(b), 'id'))
        : [...new Set(levelStudents.map(student => student.kelas).filter(Boolean))].sort((a, b) => String(a).localeCompare(String(b), 'id'));
    const current = detailSelect.value;
    detailSelect.innerHTML = `<option value="">Pilih ${modeSelect.value === 'guru' ? 'nama guru' : 'nama kelas'}</option>` + options.map(option => `<option value="${manageEscape(option)}">${manageEscape(option)}</option>`).join('');
    if (options.includes(current)) detailSelect.value = current;
}

function renderManageTable() {
    const header = document.getElementById('manageTableHeader');
    const body = document.getElementById('manageTableBody');
    if (!header || !body) return;

    document.getElementById('manageAddBtn').hidden = AppAccess.teacher() && currentManageTab === 'guru';
    document.getElementById('manageImportControls').hidden = AppAccess.teacher() && currentManageTab === 'guru';
    refreshStudentManageFilters();
    const search = (document.getElementById('manageSearch')?.value || '').trim().toLowerCase();
    const level = document.getElementById('manageLevelFilter')?.value || '';
    const mode = document.getElementById('manageStudentFilterMode')?.value || '';
    const detail = document.getElementById('manageStudentDetailFilter')?.value || '';
    const rows = getManageData().filter(item => {
        if (currentManageTab === 'siswa') {
            if (level && getManageLevel(item.kelas) !== level) return false;
            if (mode === 'guru' && detail && String(item['nama guru'] || item.nama_guru || '') !== detail) return false;
            if (mode === 'kelas' && detail && String(item.kelas || '') !== detail) return false;
        }
        const studentSearch = `${item['nama siswa'] || item.nama_siswa || ''} ${item['nama guru'] || item.nama_guru || ''} ${item.kelas || ''}`;
        const teacherSearch = `${item.nama || item.nama_guru || ''} ${item.foto || ''}`;
        return !search || (currentManageTab === 'guru' ? teacherSearch : studentSearch).toLowerCase().includes(search);
    }).sort((a, b) => {
        if (currentManageTab === 'siswa') {
            const classCompare = String(a.kelas || '').localeCompare(String(b.kelas || ''), 'id');
            if (classCompare) return classCompare;
        }
        return getManageTitle(a).localeCompare(getManageTitle(b), 'id');
    });
    const totalPages = Math.max(1, Math.ceil(rows.length / manageRowsPerPage));
    managePage = Math.min(Math.max(1, managePage), totalPages);
    const pageRows = rows.slice((managePage - 1) * manageRowsPerPage, managePage * manageRowsPerPage);

    header.innerHTML = currentManageTab === 'guru'
        ? '<tr><th class="px-6 py-4">No</th><th class="px-6 py-4">Nama Guru</th><th class="px-6 py-4">Foto</th><th class="px-6 py-4 text-center w-36">Aksi</th></tr>'
        : '<tr><th class="px-6 py-4">No</th><th class="px-6 py-4">Nama Siswa</th><th class="px-6 py-4">Nama Guru</th><th class="px-6 py-4">Kelas</th><th class="px-6 py-4 text-center w-36">Aksi</th></tr>';

    if (!pageRows.length) {
        body.innerHTML = `<tr><td colspan="${currentManageTab === 'guru' ? 4 : 5}" class="p-8 text-center text-slate-400">Data tidak ditemukan.</td></tr>`;
    } else {
        let lastClass = null;
        const startNumber = (managePage - 1) * manageRowsPerPage;
        body.innerHTML = pageRows.map((item, offset) => {
            const id = manageEscape(item.id);
            let classGroup = '';
            if (currentManageTab === 'siswa' && item.kelas !== lastClass) {
                lastClass = item.kelas;
                classGroup = `<tr class="bg-indigo-50"><td colspan="5" class="px-6 py-2 text-xs font-bold text-indigo-700">Kelas: ${manageEscape(item.kelas || '-')}</td></tr>`;
            }
            const actions = `<td class="px-6 py-3 text-center whitespace-nowrap"><button onclick="openManageModal('${id}')" class="text-indigo-600 hover:text-indigo-800 font-semibold text-xs mr-3">Edit</button><button ${AppAccess.teacher() && currentManageTab === 'guru' ? 'hidden' : ''} onclick="deleteData('${id}')" class="text-red-600 hover:text-red-800 font-semibold text-xs">Hapus</button></td>`;
            if (currentManageTab === 'guru') {
                const photo = item.foto ? `<img src="${manageEscape(item.foto)}" alt="" class="w-9 h-9 rounded-full object-cover bg-slate-100">` : '<span class="text-slate-400">-</span>';
                return `${classGroup}<tr class="hover:bg-slate-50"><td class="px-6 py-3 text-slate-500">${startNumber + offset + 1}</td><td class="px-6 py-3 font-semibold">${manageEscape(getManageTitle(item))}</td><td class="px-6 py-3">${photo}</td>${actions}</tr>`;
            }
            return `${classGroup}<tr class="hover:bg-slate-50"><td class="px-6 py-3 text-slate-500">${startNumber + offset + 1}</td><td class="px-6 py-3 font-semibold">${manageEscape(getManageTitle(item))}</td><td class="px-6 py-3">${manageEscape(item['nama guru'] || item.nama_guru || '-')}</td><td class="px-6 py-3">${manageEscape(item.kelas || '-')}</td>${actions}</tr>`;
        }).join('');
    }
    document.getElementById('manageRecordInfo').textContent = `${rows.length} data`;
    document.getElementById('managePageInfo').textContent = `Halaman ${managePage} / ${totalPages}`;
    document.getElementById('managePrevPage').disabled = managePage <= 1;
    document.getElementById('manageNextPage').disabled = managePage >= totalPages;
    document.getElementById('csvImportHint').textContent = currentManageTab === 'guru' ? 'Format guru: nama,foto' : 'Format siswa: nama siswa,nama guru,kelas';
}

function switchManageTab(tab) {
    if (tab !== 'siswa' && tab !== 'guru') return;
    currentManageTab = tab;
    managePage = 1;
    ['siswa', 'guru'].forEach(name => {
        const button = document.getElementById(`tab-${name}`);
        button.setAttribute('aria-pressed', String(name === tab));
        button.className = name === tab ? 'px-4 py-2.5 text-sm font-semibold border-b-2 border-indigo-600 text-indigo-600 transition-all' : 'px-4 py-2.5 text-sm font-medium border-b-2 border-transparent text-slate-500 hover:text-slate-800 transition-all';
    });
    renderManageTable();
}

function openManageModal(id = null) {
    if (AppAccess.teacher() && currentManageTab === "guru" && !id) return;
    const item = id ? getManageData().find(row => String(row.id) === String(id)) : null;
    if (id && !item) return alert('Data tidak ditemukan. Silakan muat ulang halaman.');
    document.getElementById('entityId').value = item?.id || '';
    document.getElementById('modalTitle').textContent = `${item ? 'Ubah' : 'Tambah'} Data ${currentManageTab === 'guru' ? 'Guru' : 'Siswa'}`;
    const fields = document.getElementById('formFields');
    if (currentManageTab === 'guru') {
        fields.innerHTML = `<div><label class="block text-xs font-bold text-slate-600 uppercase mb-2">Nama Guru</label><input id="inputGuruNama" required value="${manageEscape(item?.nama || item?.nama_guru || '')}" class="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm"></div><div><label class="block text-xs font-bold text-slate-600 uppercase mb-2">URL Foto</label><input id="inputGuruFoto" type="url" value="${manageEscape(item?.foto || '')}" class="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm" placeholder="https://..."></div>`;
    } else {
        fields.innerHTML = `<div><label class="block text-xs font-bold text-slate-600 uppercase mb-2">Nama Siswa</label><input id="inputSiswaNama" required value="${manageEscape(item?.['nama siswa'] || item?.nama_siswa || '')}" class="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm"></div><div><label class="block text-xs font-bold text-slate-600 uppercase mb-2">Nama Guru</label><input id="inputSiswaGuru" required value="${manageEscape(item?.['nama guru'] || item?.nama_guru || '')}" class="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm"></div><div><label class="block text-xs font-bold text-slate-600 uppercase mb-2">Kelas</label><input id="inputSiswaKelas" required value="${manageEscape(item?.kelas || '')}" class="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm" placeholder="Contoh: Kelas 1A"></div>`;
    }
    if (AppAccess.teacher()) {
        const teacherInput = document.getElementById('inputSiswaGuru') || document.getElementById('inputGuruNama');
        if (teacherInput) { teacherInput.value = AppAccess.profile.teacherName; teacherInput.readOnly = true; }
    }
    document.getElementById('manageModal').classList.remove('hidden');
    document.getElementById('modalContent').classList.remove('scale-95', 'opacity-0');
}

async function handleFormSubmit(event) {
    event.preventDefault();
    const id = document.getElementById('entityId').value;
    const table = currentManageTab === 'guru' ? 'teachers' : 'students';
    const payload = currentManageTab === 'guru'
        ? { nama: document.getElementById('inputGuruNama').value.trim(), foto: document.getElementById('inputGuruFoto').value.trim() || null }
        : { 'nama siswa': document.getElementById('inputSiswaNama').value.trim(), 'nama guru': document.getElementById('inputSiswaGuru').value.trim(), kelas: document.getElementById('inputSiswaKelas').value.trim() };
    if (Object.values(payload).some(value => value === '')) return alert('Semua kolom wajib diisi.');
    if (AppAccess.teacher()) {
        if (currentManageTab === 'guru') { delete payload.nama; if (!id) return; }
        else payload['nama guru'] = AppAccess.profile.teacherName;
    }
    const query = id ? supabase.from(table).update(payload).eq('id', id) : supabase.from(table).insert([payload]);
    const { error } = await query;
    if (error) return alert(`Gagal menyimpan data: ${error.message}`);
    if (currentManageTab === 'guru') teachersData = await getTeachers(); else studentsData = await getStudents();
    closeManageModal();
    renderManageTable();
}

async function deleteData(id) {
    if (AppAccess.teacher() && currentManageTab === "guru") return;
    const item = getManageData().find(row => String(row.id) === String(id));
    if (!item || !confirm(`Hapus ${getManageTitle(item)}?`)) return;
    const table = currentManageTab === 'guru' ? 'teachers' : 'students';
    const { error } = await supabase.from(table).delete().eq('id', id);
    if (error) return alert(`Gagal menghapus data: ${error.message}`);
    if (currentManageTab === 'guru') teachersData = await getTeachers(); else studentsData = await getStudents();
    renderManageTable();
}

function parseCsv(text) {
    return text.replace(/^\uFEFF/, '').split(/\r?\n/).filter(Boolean).map(line => {
        const values = []; let value = ''; let quoted = false;
        for (let i = 0; i < line.length; i++) {
            if (line[i] === '"' && line[i + 1] === '"') { value += '"'; i++; }
            else if (line[i] === '"') quoted = !quoted;
            else if (line[i] === ',' && !quoted) { values.push(value.trim()); value = ''; }
            else value += line[i];
        }
        values.push(value.trim()); return values;
    });
}

async function importManageCsv() {
    if (AppAccess.teacher() && currentManageTab === "guru") return;
    const file = document.getElementById('csvImportFile').files[0];
    if (!file) return alert('Pilih file CSV terlebih dahulu.');
    const rows = parseCsv(await file.text());
    const header = rows[0]?.map(cell => cell.toLowerCase());
    const expected = currentManageTab === 'guru' ? ['nama', 'foto'] : ['nama siswa', 'nama guru', 'kelas'];
    const hasHeader = expected.every((name, index) => header[index] === name);
    const dataRows = hasHeader ? rows.slice(1) : rows;
    const payload = dataRows.filter(row => row.some(Boolean)).map(row => currentManageTab === 'guru'
        ? { nama: row[0], foto: row[1] || null }
        : { 'nama siswa': row[0], 'nama guru': row[1], kelas: row[2] }).filter(row => currentManageTab === 'guru' ? row.nama : row['nama siswa'] && row['nama guru'] && row.kelas);
    if (AppAccess.teacher()) payload.forEach(row => { row['nama guru'] = AppAccess.profile.teacherName; });
    if (!payload.length) return alert(`CSV kosong atau format tidak sesuai. Gunakan: ${expected.join(',')}`);
    const table = currentManageTab === 'guru' ? 'teachers' : 'students';
    const { error } = await supabase.from(table).insert(payload);
    if (error) return alert(`Impor gagal: ${error.message}`);
    if (currentManageTab === 'guru') teachersData = await getTeachers(); else studentsData = await getStudents();
    document.getElementById('csvImportFile').value = '';
    renderManageTable();
    alert(`${payload.length} data berhasil diimpor.`);
}

document.addEventListener('panelready', () => {
    document.getElementById('manageSearch').addEventListener('input', () => { managePage = 1; renderManageTable(); });
    document.getElementById('managePrevPage').addEventListener('click', () => { if (managePage > 1) { managePage--; renderManageTable(); } });
    document.getElementById('manageNextPage').addEventListener('click', () => { managePage++; renderManageTable(); });
    document.getElementById('csvImportBtn').addEventListener('click', importManageCsv);
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
    if (!profile) return;
    const name = profile.name || 'Gemar Mengaji';
    const logo = profile.logo_url || 'https://iili.io/FjF61ou.png';
    document.getElementById('adminSchoolName')?.replaceChildren(document.createTextNode(name));
    document.getElementById('adminSchoolAddress')?.replaceChildren(document.createTextNode(profile.address || ''));
    const logoElement = document.getElementById('adminSchoolLogo');
    if (logoElement) logoElement.src = logo;
    const nameInput = document.getElementById('settingsSchoolName');
    const addressInput = document.getElementById('settingsSchoolAddress');
    const colorInput = document.getElementById('settingsThemeColor');
    if (nameInput && document.activeElement !== nameInput) nameInput.value = name;
    if (addressInput && document.activeElement !== addressInput) addressInput.value = profile.address || '';
    if (colorInput && document.activeElement !== colorInput) colorInput.value = resolveThemeColor(profile.theme_color);
    document.documentElement.style.setProperty('--brand-color', resolveThemeColor(profile.theme_color));
    document.getElementById('settingsNamePreview')?.replaceChildren(document.createTextNode(name));
    const previewLogo = document.getElementById('settingsLogoPreview');
    if (previewLogo) previewLogo.src = logo;
    const colorText = document.getElementById('settingsThemeColorValue');
    if (colorText) colorText.textContent = resolveThemeColor(profile.theme_color);
    const colorPreview = document.getElementById('settingsColorPreview');
    if (colorPreview) colorPreview.style.backgroundColor = resolveThemeColor(profile.theme_color);
}

async function loadSchoolSettings() {
    if (!AppAccess.full()) return;
    try {
        applySchoolProfile(await getSchoolProfile());
    } catch (error) {
        console.error('Gagal memuat pengaturan sekolah:', error);
    }
}

async function saveSchoolSettings(event) {
    if (!AppAccess.full()) return;
    event.preventDefault();
    const button = document.getElementById('saveSchoolSettings');
    const logoFile = document.getElementById('settingsSchoolLogo').files[0] || null;
    if (logoFile && logoFile.size > 2 * 1024 * 1024) return alert('Ukuran logo maksimal 2 MB.');
    const originalText = button.textContent;
    button.disabled = true;
    button.textContent = 'Menyimpan...';
    try {
        const profile = await updateSchoolProfile(
            document.getElementById('settingsSchoolName').value.trim(),
            document.getElementById('settingsSchoolAddress').value.trim(),
            logoFile,
            document.getElementById('settingsThemeColor').value
        );
        applySchoolProfile(profile);
        document.getElementById('settingsSchoolLogo').value = '';
        alert('Pengaturan sekolah berhasil disimpan.');
    } catch (error) {
        console.error('Gagal menyimpan pengaturan sekolah:', error);
        alert(`Gagal menyimpan pengaturan: ${error.message}`);
    } finally {
        button.disabled = false;
        button.textContent = originalText;
    }
}

function normalizeAttendanceStatus(value) {
    const status = safeLowerCase(value);
    if (status === 'hadir' || status === 'h') return 'hadir';
    if (status === 'sakit' || status === 's') return 'sakit';
    if (status === 'izin' || status === 'i') return 'izin';
    return 'alpha';
}

function populateInfographicFilters() {
    const year = document.getElementById('infoYear');
    const teacher = document.getElementById('infoTeacher');
    const level = document.getElementById('infoLevel');
    const kelas = document.getElementById('infoClass');
    const years = [...new Set((attendanceData || []).map(row => String(row.date || '').slice(0, 4)).filter(Boolean))].sort().reverse();
    if (!years.includes(String(new Date().getFullYear()))) years.unshift(String(new Date().getFullYear()));
    year.innerHTML = '<option value="">Pilih tahun</option>' + years.map(value => `<option value="${value}">${value}</option>`).join('');
    teacher.innerHTML = '<option value="">Semua guru</option>' + [...new Set((studentsData || []).map(row => row['nama guru'] || row.nama_guru).filter(Boolean))].sort().map(value => `<option value="${manageEscape(value)}">${manageEscape(value)}</option>`).join('');
    const levelValues = [...new Set((studentsData || []).map(row => getManageLevel(row.kelas || row.kelas_nama).trim()).filter(Boolean))].sort((a, b) => Number(a) - Number(b));
    level.innerHTML = '<option value="">Semua tingkat</option>' + levelValues.map(value => `<option value="${manageEscape(value)}">Tingkat ${manageEscape(value)}</option>`).join('');
    const classValues = [...new Set((studentsData || []).map(row => row.kelas || row.kelas_nama).filter(Boolean))].sort((a, b) => String(a).localeCompare(String(b), 'id'));
    kelas.innerHTML = '<option value="">Semua nama kelas</option>' + classValues.map(value => `<option value="${manageEscape(value)}">${manageEscape(value)}</option>`).join('');
}

async function showInfographic() {
    if (!AppAccess.full()) return;
    const year = document.getElementById('infoYear').value;
    const month = document.getElementById('infoMonth').value;
    const teacher = safeLowerCase(document.getElementById('infoTeacher').value);
    const levelFilter = document.getElementById('infoLevel').value;
    const classFilter = document.getElementById('infoClass').value;
    if (!year || !month) return alert('Pilih tahun dan bulan terlebih dahulu.');
    const firstDate = `${year}-${month}-01`;
    const lastDate = `${year}-${month}-${String(new Date(Number(year), Number(month), 0).getDate()).padStart(2, '0')}`;
    const button = document.getElementById('showInfographicBtn');

    try {
        if (button) {
            button.disabled = true;
            button.textContent = 'Memuat data...';
        }
        if (!studentsData?.length) await fetchStudents();
        await fetchAttendanceData({ date_from: firstDate, date_to: lastDate });

        const matchingStudents = (studentsData || []).filter(student => {
            const studentTeacher = safeLowerCase(student['nama guru'] || student.nama_guru);
            const studentClass = String(student.kelas || student.class_name || student.kelas_nama || '').trim();
            const matchesTeacher = !teacher || studentTeacher === teacher;
            const matchesLevel = !levelFilter || getManageLevel(studentClass) === levelFilter;
            const matchesClass = !classFilter || studentClass === classFilter;
            return matchesTeacher && matchesLevel && matchesClass;
        });
        const insight = buildAttendanceInsights(matchingStudents, attendanceData || [], firstDate, lastDate);
        const counts = insight.totals;
        const classCounts = new Map(insight.rows.map(row => [row.name, { hadir: row.hadir, total: row.recorded }]));
        document.getElementById('infoRate').textContent = insight.rate === null ? '-' : `${insight.rate.toFixed(1)}%`;
        document.getElementById('infoStudents').textContent = insight.students;
        document.getElementById('infoRecorded').textContent = counts.recorded;
        document.getElementById('infoMissing').textContent = counts.missing;
        document.getElementById('infoScope').textContent = `${getMonthName(month)} ${year} ? ${insight.rows.length} kelas`;
        document.getElementById('classComparisonRows').innerHTML = insight.rows.map(row => `<tr><th>${manageEscape(row.name)}</th><td>${row.students}</td><td>${row.days}</td><td>${row.hadir}</td><td>${row.sakit}</td><td>${row.izin}</td><td>${row.alpha}</td><td>${row.unknown}</td><td>${row.missing}</td><td><strong>${row.rate === null ? '-' : row.rate.toFixed(1) + '%'}</strong></td></tr>`).join('');

        const totalRecords = counts.recorded;
        if (!totalRecords) {
            document.getElementById('infoEmptyState').textContent = 'Tidak ada data absensi pada filter yang dipilih.';
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
    attendanceDonutChart?.destroy(); classComparisonChart?.destroy();
    attendanceDonutChart = new Chart(document.getElementById('attendanceDonut'), { type: 'doughnut', data: { labels: ['Hadir', 'Sakit', 'Izin', 'Alfa', 'Status lainnya'], datasets: [{ data: [counts.hadir, counts.sakit, counts.izin, counts.alpha, counts.unknown], backgroundColor: ['#10b981', '#f59e0b', '#0ea5e9', '#f43f5e', '#94a3b8'], borderWidth: 0 }] }, options: { maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } }, cutout: '65%' } });
    const entries = [...classCounts.entries()];
        classComparisonChart = new Chart(document.getElementById('classComparisonChart'), { type: 'bar', data: { labels: entries.map(([name]) => name), datasets: [{ label: 'Kehadiran (%)', data: entries.map(([, value]) => value.total ? Number((value.hadir / value.total * 100).toFixed(1)) : null), backgroundColor: getComputedStyle(document.documentElement).getPropertyValue('--brand-color').trim() || '#216454', borderRadius: 8 }] }, options: { indexAxis: 'y', maintainAspectRatio: false, scales: { x: { beginAtZero: true, max: 100, ticks: { callback: value => `${value}%` } } }, plugins: { legend: { display: false } } } });
    } catch (error) {
        console.error('Gagal memuat infografik:', error);
        alert('Infografik gagal dimuat. Periksa koneksi database lalu coba lagi.');
    } finally {
        if (button) {
            button.disabled = false;
            button.textContent = 'Tampilkan Infografik';
        }
    }
}

function switchPage(pageId) {
    const pages = ['absensi', 'kelola', 'infografik', 'pengaturan', 'maintenance'];
    if (!pages.includes(pageId) || !AppAccess.canPage(pageId)) return;
    const headings = {
        absensi: ['Data Absensi', 'Catat kehadiran, dampingi kebaikan.', 'Pantau dan kelola rekap kehadiran siswa dalam satu tempat.'],
        kelola: ['Kelola Data', 'Data tertata, belajar lebih terarah.', 'Kelola data siswa dan guru untuk mendukung kegiatan mengaji.'],
        infografik: ['Infografik Absensi', 'Lihat perkembangan kehadiran.', 'Temukan ringkasan dan perbandingan kehadiran setiap kelas.'],
        maintenance: ['Mode Maintenance', 'Sejenak menata, untuk kembali lebih baik.', 'Kelola ketersediaan website tanpa mengganggu pekerjaan administrasi.'],
        pengaturan: ['Pengaturan Sistem', 'Identitas sekolah, dalam satu ruang.', 'Sesuaikan profil dan tampilan aplikasi sekolah.']
    };
    ['adminHeaderTitle', 'adminPageTitle', 'adminPageDescription'].forEach((id, index) => {
        const element = document.getElementById(id);
        if (element) element.textContent = headings[pageId][index];
    });
    pages.forEach(name => {
        const item = document.getElementById(`menu-${name}`);
        if (name === pageId) item?.setAttribute('aria-current', 'page');
        else item?.removeAttribute('aria-current');
    });
    pages.forEach(name => {
        const page = document.getElementById(`page-${name}`);
        if (!page) return;
        page.classList.toggle('hidden', name !== pageId);
        if (name === pageId) {
            page.classList.remove('page-animate-in');
            requestAnimationFrame(() => page.classList.add('page-animate-in'));
        }
    });
    ['menu-absensi', 'menu-kelola', 'menu-infografik', 'menu-pengaturan', 'menu-maintenance'].forEach(id => document.getElementById(id)?.classList.remove('bg-indigo-600', 'text-white'));
    const active = document.getElementById(`menu-${pageId}`);
    active?.classList.add('bg-indigo-600', 'text-white');
    if (pageId === 'kelola') renderManageTable();
    if (pageId === 'infografik') populateInfographicFilters();
    if (pageId === 'pengaturan') { loadSchoolSettings(); loadAccountSettings().catch(console.error); }
    if (pageId === 'maintenance') loadMaintenanceMode();
    setMobileDrawer(false);
}

document.addEventListener('panelready', () => {
    document.getElementById('showInfographicBtn').addEventListener('click', showInfographic);
    document.getElementById('infoLevel').addEventListener('change', () => {
        document.getElementById('infoClass').value = '';
    });
    document.getElementById('topLogoutBtn').addEventListener('click', () => document.getElementById('logoutBtn').click());
    document.getElementById('schoolSettingsForm').addEventListener('submit', saveSchoolSettings);
    document.getElementById('settingsThemeColor').addEventListener('input', event => {
        document.getElementById('settingsThemeColorValue').textContent = event.target.value;
        document.getElementById('settingsColorPreview').style.backgroundColor = event.target.value;
    });
    if (AppAccess.full()) loadSchoolSettings();
});
