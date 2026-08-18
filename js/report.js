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

// Safe helper — ambil elemen DOM tanpa mendeklarasikan identifier global yang bisa bertabrakan
function getElSafe(id, winProp) {
    if (typeof window !== 'undefined' && window[winProp]) return window[winProp];
    return document.getElementById(id);
}

// Normalisasi indeks absensi untuk pemanggil laporan lama. Renderer admin
// menggunakan indeksnya sendiri, namun helper ini mencegah fungsi lama gagal
// ketika dipanggil dari halaman lain.
function buildAttendanceMap(records) {
    const map = new Map();
    (Array.isArray(records) ? records : []).forEach(record => {
        if (!record) return;
        const date = String(record.date || record.tanggal || '').slice(0, 10);
        const student = String(record.student || record.nama_siswa || record.student_name || '').trim();
        const teacher = String(record.teacher || record.nama_guru || record.teacher_name || '').trim();
        const className = String(record.class || record.kelas || record.kelas_nama || '').trim();
        if (date && student) map.set(`${date}|${student}|${teacher}|${className}`, record);
    });
    return map;
}

function generateMonthlyReport(month, teacher, classNumber, className) {
    // Ambil elemen DOM lokal dengan aman
    const filterMonthEl = getElSafe('filterMonth', 'filterMonth');
    const filterTeacherEl = getElSafe('filterTeacher', 'filterTeacher');
    const filterClassNumberEl = getElSafe('filterClassNumber', 'filterClassNumber');
    const filterClassNameEl = getElSafe('filterClassName', 'filterClassName');
    const reportMonthEl = getElSafe('reportMonth', 'reportMonth');
    const reportTeacherEl = getElSafe('reportTeacher', 'reportTeacher');
    const reportClassEl = getElSafe('reportClass', 'reportClass');
    const monthlyReportTableEl = getElSafe('monthlyReportTable', 'monthlyReportTable');

    // Jika fungsi dipanggil tanpa argumen (mis. admin.js memanggil generateMonthlyReport()),
    // ambil nilai dari elemen filter jika tersedia.
    month = month || (filterMonthEl ? filterMonthEl.value : (new Date().getMonth() + 1).toString().padStart(2, '0'));
    if (month && month.length === 1) month = month.padStart(2, '0');
    teacher = teacher || (filterTeacherEl ? filterTeacherEl.value : '');
    classNumber = classNumber || (filterClassNumberEl ? filterClassNumberEl.value : '');
    className = className || (filterClassNameEl ? filterClassNameEl.value : '');

    const year = new Date().getFullYear();
    const daysInMonth = getDaysInMonth(year, parseInt(month, 10));
    const monthName = getMonthName(month);

    if (reportMonthEl) reportMonthEl.textContent = `${monthName} ${year}`;
    if (reportTeacherEl) reportTeacherEl.textContent = teacher || 'Semua Guru';
    if (reportClassEl) reportClassEl.textContent = className || (classNumber ? `Kelas ${classNumber}` : 'Semua Kelas');

    let filteredStudents = studentsData;

    if (teacher) {
        filteredStudents = filteredStudents.filter(student => student['nama guru'] === teacher);
    }

    if (className && className !== '') {
        filteredStudents = filteredStudents.filter(student => student.kelas === className);
    }

    else if (classNumber && classNumber !== '') {
        filteredStudents = filteredStudents.filter(student => {
            const studentClassNumber = extractClassNumber(student.kelas);
            return studentClassNumber === classNumber;
        });
    }

    filteredStudents.sort((a, b) => a['nama siswa'].localeCompare(b['nama siswa']));

    let tableHTML = '<thead><tr>';
    tableHTML += '<th class="student-name">Nama Siswa</th>';

    for (let day = 1; day <= daysInMonth; day++) {
        tableHTML += `<th class="date-header">${day}</th>`;
    }

    tableHTML += '<th class="summary-header">H</th>';
    tableHTML += '<th class="summary-header">S</th>';
    tableHTML += '<th class="summary-header">I</th>';
    tableHTML += '<th class="summary-header">A</th>';
    tableHTML += '<th class="summary-header">%</th>';
    tableHTML += '</tr></thead><tbody>';

    let totalPercent = 0;

    filteredStudents.forEach(student => {
        const attendanceMap = buildAttendanceMap(attendanceData);
        const studentName = student['nama siswa'];
        const studentClass = student.kelas;

        tableHTML += `<tr><td class="student-name">${studentName}</td>`;

        let hadirCount = 0;
        let sakitCount = 0;
        let izinCount = 0;
        let alphaCount = 0;

        for (let day = 1; day <= daysInMonth; day++) {
            const dateStr = `${year}-${month}-${String(day).padStart(2, '0')}`;
            const today = new Date();
            const currentDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
            const dateToCheck = new Date(dateStr);

            if (dateStr > currentDate) {
                tableHTML += `<td></td>`;
                continue;
            }

            let record = null;

            if (className && className !== '') {
                const key =
    `${dateStr}|${studentName}|${teacher || record?.teacher}|${studentClass}`;

const record = attendanceMap.get(key);
            } else if (classNumber && classNumber !== '') {
                const key =
    `${dateStr}|${studentName}|${teacher || record?.teacher}|${studentClass}`;

const record = attendanceMap.get(key);
            } else {
                const key =
    `${dateStr}|${studentName}|${teacher || record?.teacher}|${studentClass}`;

const record = attendanceMap.get(key);
            }

            let statusCode = '-';
            let statusClass = 'status--';

            if (record) {
                if (record.status === 'hadir') {
                    statusCode = 'H';
                    statusClass = 'status-H';
                    hadirCount++;
                } else if (record.status === 'sakit') {
                    statusCode = 'S';
                    statusClass = 'status-S';
                    sakitCount++;
                } else if (record.status === 'izin') {
                    statusCode = 'I';
                    statusClass = 'status-I';
                    izinCount++;
                } else if (record.status === 'alpha') {
                    statusCode = '-';
                    statusClass = 'status--';
                    alphaCount++;
                }
            } else {
                if (dateToCheck <= today) {
                    alphaCount++;
                }
            }

            tableHTML += `<td class="${statusClass}">${statusCode}</td>`;
        }

        const totalDays = hadirCount + sakitCount + izinCount + alphaCount;
        const attendancePercentage = totalDays > 0 ? Math.round((hadirCount / totalDays) * 100) : 0;

        totalPercent += attendancePercentage;

        tableHTML += `<td class="summary-cell">${hadirCount}</td>`;
        tableHTML += `<td class="summary-cell">${sakitCount}</td>`;
        tableHTML += `<td class="summary-cell">${izinCount}</td>`;
        tableHTML += `<td class="summary-cell">${alphaCount}</td>`;
        tableHTML += `<td class="percentage-cell">${attendancePercentage}%</td>`;

        tableHTML += '</tr>';
    });

    tableHTML += '</tbody>';

    const averagePercent = filteredStudents.length > 0 ? (totalPercent / filteredStudents.length) : 0;
    const reportAverageElem = document.getElementById('reportAverage');
    if (reportAverageElem) {
        reportAverageElem.textContent = `${averagePercent.toFixed(2)}%`;
    }

    // Tulis ke elemen tabel jika tersedia
    if (monthlyReportTableEl) monthlyReportTableEl.innerHTML = tableHTML;
}

function printAttendanceReport() {
    const filterMonthEl = getElSafe('filterMonth', 'filterMonth');
    const filterTeacherEl = getElSafe('filterTeacher', 'filterTeacher');
    const filterClassNumberEl = getElSafe('filterClassNumber', 'filterClassNumber');
    const filterClassNameEl = getElSafe('filterClassName', 'filterClassName');

    const month = filterMonthEl ? filterMonthEl.value : (new Date().getMonth() + 1).toString().padStart(2, '0');
    const teacher = filterTeacherEl ? filterTeacherEl.value : '';
    const classNumber = filterClassNumberEl ? filterClassNumberEl.value : '';
    const className = filterClassNameEl ? filterClassNameEl.value : '';
    const monthName = getMonthName(month);
    const year = new Date().getFullYear();
    const now = new Date();
    const tanggalCetak = formatTanggalCetak(now);
    const reportTeacherText = teacher || 'Semua Guru';
    const reportClassText = className || (classNumber ? `Kelas ${classNumber}` : 'Semua Kelas');

    let filteredStudents = studentsData;
    if (teacher) filteredStudents = filteredStudents.filter(student => student['nama guru'] === teacher);
    if (className) {
        filteredStudents = filteredStudents.filter(student => student.kelas.toLowerCase() === className.toLowerCase());
    } else if (classNumber) {
        filteredStudents = filteredStudents.filter(student => {
            const studentClassNumber = extractClassNumber(student.kelas);
            return studentClassNumber === classNumber;
        });
    }
    filteredStudents.sort((a, b) => a['nama siswa'].localeCompare(b['nama siswa']));
    const daysInMonth = getDaysInMonth(year, parseInt(month));

    const headers = ['Nama Siswa'];
    for (let day = 1; day <= daysInMonth; day++) {
        headers.push(day.toString());
    }
    headers.push('H', 'S', 'I', 'A', '%');

    const rows = [];
    let totalPercent = 0;
    filteredStudents.forEach(student => {
        const studentName = student['nama siswa'];
        const row = [studentName];
        let hadirCount = 0, sakitCount = 0, izinCount = 0, alphaCount = 0;
        for (let day = 1; day <= daysInMonth; day++) {
            const dateStr = `${year}-${month}-${String(day).padStart(2, '0')}`;
            const today = new Date();
            const currentDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
            const dateToCheck = new Date(dateStr);
            if (dateStr > currentDate) {
                row.push('');
                continue;
            }
            let record = null;
            if (className && className !== '') {
                const key =
    `${dateStr}|${studentName}|${teacher || record?.teacher}|${studentClass}`;

const record = attendanceMap.get(key);
            } else if (classNumber && classNumber !== '') {
                const key =
    `${dateStr}|${studentName}|${teacher || record?.teacher}|${studentClass}`;

const record = attendanceMap.get(key);
            } else {
                const key =
    `${dateStr}|${studentName}|${teacher || record?.teacher}|${studentClass}`;

const record = attendanceMap.get(key);
            }
            let statusCode = '-';
            if (record) {
                if (record.status === 'hadir') {
                    statusCode = 'H'; hadirCount++;
                } else if (record.status === 'sakit') {
                    statusCode = 'S'; sakitCount++;
                } else if (record.status === 'izin') {
                    statusCode = 'I'; izinCount++;
                } else if (record.status === 'alpha') {
                    statusCode = '-'; alphaCount++;
                }
            } else {
                if (dateToCheck <= today) alphaCount++;
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
    <div id="print-area" style="font-family:helvetica,sans-serif;">
      <div style="text-align:center; margin-bottom:5px;">
        <h2 style="margin:0; font-size:16pt;">REKAP ABSENSI BULANAN GEMAR MENGAJI</h2>
        <div style="font-size:12pt;">SDIT Harapan Umat Karawang</div>
        <div style="font-size:10pt;">Jl. Pakuncen No. 01, Desa Sukaharja, Kec. Teluk Jambe Timur</div>
        <hr>
      </div>
      <div style="display:flex; justify-content:space-between; font-size:11pt; margin-bottom:1px;">
        <div>Guru: ${reportTeacherText}</div>
        <div>Kelas: ${reportClassText}</div>
        <div>Bulan: ${monthName} ${year}</div>
      </div>
      <div style="font-size:11pt; margin-bottom:10px;">Rata-rata Kehadiran: ${averagePercent.toFixed(2)}%</div>
      <table border="1" cellpadding="2" cellspacing="0" style="width:100%; font-size:9pt; border-collapse:collapse; margin-bottom:15px;">
        <thead>
          <tr>
            ${headers.map(h => `<th>${h}</th>`).join('')}
          </tr>
        </thead>
        <tbody>
          ${rows.map(row => `<tr>${row.map((cell, idx) => `<td style="text-align:${idx === 0 ? 'left' : 'center'}">${cell}</td>`).join('')}</tr>`).join('')}
        </tbody>
      </table>
      <div style="font-size:10pt; margin-bottom:15px;">Keterangan: H = Hadir, S = Sakit, I = Izin, - = Alpha</div>
      <div style="display:flex; justify-content:space-between; margin-top:40px; font-size:11pt;">
        <div style="width:40%; text-align:center;">
            Mengetahui,<br>
            Kepala SDIT<br><br><br>
            <div style="height:12px;"></div>
            <div style="margin-top:15px;">(<span style="border-bottom:2px dotted #000; padding:0 30px;">&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</span>)</div>
        </div>
        <div style="width:40%; text-align:center;">
            Karawang, ${tanggalCetak}<br><br>
            Guru Bidang Studi<br><br><br>
            <div style="height:12px;"></div>
            <div style="margin-top:15px;">(<span style="border-bottom:2px dotted #000; padding:0 30px;">&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</span>)</div>
        </div>
        </div>
    </div>
    `;

    let win = window.open('', 'PrintReport', 'width=1000,height=700');
    win.document.write('<html><head><title>Cetak Rekap Absensi</title>');
    win.document.write('<style>@media print { #print-area { page-break-inside:avoid; width:297mm; min-height:210mm;} table{font-size:9pt;} }</style>');
    win.document.write('</head><body>' + html + '</body></html>');
    win.document.close();
    win.focus();
    setTimeout(() => win.print(), 500); // beri waktu render
}

function exportAttendanceToPDF() {
    const { jsPDF } = window.jspdf;
    const filterMonthEl = getElSafe('filterMonth', 'filterMonth');
    const filterTeacherEl = getElSafe('filterTeacher', 'filterTeacher');
    const filterClassNumberEl = getElSafe('filterClassNumber', 'filterClassNumber');
    const filterClassNameEl = getElSafe('filterClassName', 'filterClassName');

    const month = filterMonthEl ? filterMonthEl.value : (new Date().getMonth() + 1).toString().padStart(2, '0');
    const teacher = filterTeacherEl ? filterTeacherEl.value : '';
    const classNumber = filterClassNumberEl ? filterClassNumberEl.value : '';
    const className = filterClassNameEl ? filterClassNameEl.value : '';

    const monthName = getMonthName(month);
    const year = new Date().getFullYear();
    const now = new Date();
    const tanggalCetak = `${now.getDate()}/${now.getMonth()+1}/${now.getFullYear()}`;
    const reportTeacherText = teacher || 'Semua Guru';
    const reportClassText = className || (classNumber ? `Kelas ${classNumber}` : 'Semua Kelas');

    let filteredStudents = studentsData;
    if (teacher) filteredStudents = filteredStudents.filter(student => student['nama guru'] === teacher);
    if (className) {
        filteredStudents = filteredStudents.filter(student => student.kelas.toLowerCase() === className.toLowerCase());
    } else if (classNumber) {
        filteredStudents = filteredStudents.filter(student => {
            const studentClassNumber = extractClassNumber(student.kelas);
            return studentClassNumber === classNumber;
        });
    }
    filteredStudents.sort((a, b) => a['nama siswa'].localeCompare(b['nama siswa']));
    const daysInMonth = getDaysInMonth(year, parseInt(month));
    const headers = ['Nama Siswa'];
    for (let day = 1; day <= daysInMonth; day++) {
        headers.push(day.toString());
    }
    headers.push('H', 'S', 'I', 'A', '%');

    const rows = [];
    let totalPercent = 0;

    filteredStudents.forEach(student => {
        const studentName = student['nama siswa'];
        const row = [studentName];

        let hadirCount = 0;
        let sakitCount = 0;
        let izinCount = 0;
        let alphaCount = 0;

        for (let day = 1; day <= daysInMonth; day++) {
            const dateStr = `${year}-${month}-${String(day).padStart(2, '0')}`;
            const today = new Date();
            const currentDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
            const dateToCheck = new Date(dateStr);

            if (dateStr > currentDate) {
                row.push('');
                continue;
            }

            let record = null;
            if (className && className !== '') {
                const key =
    `${dateStr}|${studentName}|${teacher || record?.teacher}|${studentClass}`;

const record = attendanceMap.get(key);
            } else if (classNumber && classNumber !== '') {
                const key =
    `${dateStr}|${studentName}|${teacher || record?.teacher}|${studentClass}`;

const record = attendanceMap.get(key);
            } else {
                const key =
    `${dateStr}|${studentName}|${teacher || record?.teacher}|${studentClass}`;

const record = attendanceMap.get(key);
            }

            let statusCode = '-';
            if (record) {
                if (record.status === 'hadir') {
                    statusCode = 'H';
                    hadirCount++;
                } else if (record.status === 'sakit') {
                    statusCode = 'S';
                    sakitCount++;
                } else if (record.status === 'izin') {
                    statusCode = 'I';
                    izinCount++;
                } else if (record.status === 'alpha') {
                    statusCode = '-';
                    alphaCount++;
                }
            } else {
                if (dateToCheck <= today) {
                    alphaCount++;
                }
            }
            row.push(statusCode);
        }

        const totalDays = hadirCount + sakitCount + izinCount + alphaCount;
        const attendancePercentage = totalDays > 0 ? Math.round((hadirCount / totalDays) * 100) : 0;
        totalPercent += attendancePercentage;

        row.push(hadirCount.toString());
        row.push(sakitCount.toString());
        row.push(izinCount.toString());
        row.push(alphaCount.toString());
        row.push(`${attendancePercentage}%`);

        rows.push(row);
    });

    const averagePercent = filteredStudents.length > 0 ? (totalPercent / filteredStudents.length) : 0;
    const doc = new jsPDF('l', 'mm', 'a4');
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();

    doc.setFontSize(16);
    doc.text('REKAP ABSENSI BULANAN GEMAR MENGAJI', pageWidth/2, 18, { align: 'center' });
    doc.setFontSize(12);
    doc.text('SDIT Harapan Umat Karawang', pageWidth/2, 26, { align: 'center' });
    doc.setFontSize(10);
    doc.text('Jl. Pakuncen No. 01, Desa Sukaharja, Kec. Teluk Jambe Timur', pageWidth/2, 32, { align: 'center' });
    doc.line(15, 36, pageWidth-15, 36);

    let infoY = 44;
    doc.setFontSize(11);
    doc.text(`Guru: ${reportTeacherText}`, 20, infoY);
    doc.text(`Kelas: ${reportClassText}`, pageWidth/2 - 25, infoY);
    doc.text(`Bulan: ${monthName} ${year}`, pageWidth-65, infoY);
    doc.text(`Rata-rata Kehadiran: ${averagePercent.toFixed(2)}%`, 20, infoY + 8);

    doc.autoTable({
        head: [headers],
        body: rows,
        startY: infoY + 15,
        theme: 'grid',
        margin: { left: 10, right: 10 },
        tableWidth: 'auto',
        styles: {
            fontSize: 7,
            cellPadding: 1,
            halign: 'center',
            valign: 'middle'
        },
        headStyles: {
            fillColor: [255, 255, 255],
            textColor: [0, 0, 0],
            fontStyle: 'bold'
        },
        columnStyles: {
            0: { cellWidth: 40, halign: 'left' },
        },
        pageBreak: 'auto',
        didDrawPage: function (data) {
    const doc = data.doc;
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    let footerHeight = 30;
    let yFooter = pageHeight - footerHeight;

    doc.setFontSize(11);
    doc.text('Mengetahui,', 30, yFooter);
    doc.text('Kepala Sekolah', 30, yFooter + 7);
    doc.text('(.............................)', 30, yFooter + 25);

    doc.text(`Karawang, ${tanggalCetak}`, pageWidth - 67, yFooter);
    doc.line(pageWidth - 77, yFooter + 28, pageWidth - 17, yFooter + 28);
},
    });
    
    const filename = `rekap_absensi_${monthName.toLowerCase()}_${year}_${reportClassText.replace(/\s+/g, '_').toLowerCase()}.pdf`;
    doc.save(filename);

    showNotification('success', 'Laporan berhasil diunduh dalam format PDF!');
}

function populateYearFilter() {
            const dropdownTahun = document.getElementById('filterYear');
            if (!dropdownTahun) return;

            dropdownTahun.innerHTML = '<option value="">Semua Tahun</option>';
            
            // Ambil tahun unik dari date absensi
            const years = attendanceData.map(item => {
                const dateStr = item.tanggal || item.date || "";
                if (dateStr && dateStr !== "-") {
                    return dateStr.split('-')[0]; // Ambil YYYY
                }
                return null;
            }).filter(Boolean);

            const uniqueYears = [...new Set(years)].sort((a, b) => b - a);
            
            // Jika data kosong, sediakan tahun berjalan sebagai default
            if (uniqueYears.length === 0) {
                uniqueYears.push(new Date().getFullYear().toString());
            }

            uniqueYears.forEach(year => {
                const option = document.createElement('option');
                option.value = year;
                option.textContent = year;
                dropdownTahun.appendChild(option);
            });
            console.log("Dropdown Tahun berhasil diisi:", uniqueYears);
        }

        function checkAndUpdateMonthlyReport() {
            const filterMonthEl = getElSafe('filterMonth', 'filterMonth');
            const filterTeacherEl = getElSafe('filterTeacher', 'filterTeacher');
            const filterClassNumberEl = getElSafe('filterClassNumber', 'filterClassNumber');
            const filterClassNameEl = getElSafe('filterClassName', 'filterClassName');
            const filterYearEl = getElSafe('filterYear', 'filterYear');
            const reportContainerEl = getElSafe('reportContainer', 'reportContainer');

            const month = filterMonthEl ? filterMonthEl.value : '';
            const teacher = filterTeacherEl ? filterTeacherEl.value : '';
            const classNumber = filterClassNumberEl ? filterClassNumberEl.value : '';
            const className = filterClassNameEl ? filterClassNameEl.value : '';
            const year = filterYearEl ? filterYearEl.value : '';
            const showMonthlyReport = month && (classNumber || className);

            if (showMonthlyReport && reportContainerEl && reportContainerEl.style.display !== 'none') {
                generateMonthlyReport(month, teacher, classNumber, className, year);
            }
        }

    // 1. Fungsi untuk mengisi dropdown Guru di Panel Admin
function inisialisasiDropdownGuru(teachers) {
    const filterGuru = document.getElementById('filterGuru');
    if (!filterGuru) return;

    // Bersihkan opsi lama (sisakan opsi default "Semua Guru")
    filterGuru.innerHTML = '<option value="">Semua Guru</option>';

    // Urutkan nama guru secara alfabetis (A-Z)
    const sortedTeachers = [...teachers].sort((a, b) => a.nama.localeCompare(b.nama));

    sortedTeachers.forEach(guru => {
        const option = document.createElement('option');
        option.value = guru.nama;
        option.textContent = guru.nama;
        filterGuru.appendChild(option);
    });
}

// 2. Fungsi untuk mengisi dropdown Kelas di Panel Admin
function inisialisasiDropdownKelas() {
    const filterKelas = document.getElementById('filterKelas');
    if (!filterKelas) return;

    // Bersihkan opsi lama (sisakan opsi default "Semua Kelas")
    filterKelas.innerHTML = '<option value="">Semua Kelas</option>';

    // Ambil semua daftar kelas unik dari data siswa yang sudah dimuat
    const daftarKelasUnik = new Set();
    if (typeof studentsData !== 'undefined' && Array.isArray(studentsData)) {
        studentsData.forEach(student => {
            if (student.kelas) {
                daftarKelasUnik.add(student.kelas);
            }
        });
    }

    // Urutkan daftar kelas (contoh: Kelas 1A, Kelas 1B, dst)
    const sortedKelas = Array.from(daftarKelasUnik).sort();

    sortedKelas.forEach(kelas => {
        const option = document.createElement('option');
        option.value = kelas;
        option.textContent = kelas;
        filterKelas.appendChild(option);
    });
}

// 3. Modifikasi fungsi muatDataAbsensi() agar memicu pengisian dropdown
// (Temukan fungsi muatDataAbsensi Anda yang sudah kita perbaiki kemarin, lalu sesuaikan bagian akhirnya)
async function muatDataAbsensi() {
    try {
        const { data, error } = await supabase
            .from('attendance')
            .select('*')
            .order('date', { ascending: true });

        if (error) throw error;

        semuaDataAbsensi = data || [];
        
        // --- SINKRONISASI DROPDOWN ADMIN DI SINI ---
        // Isi dropdown Guru jika data global teachersData tersedia
        if (typeof teachersData !== 'undefined' && Array.isArray(teachersData)) {
            inisialisasiDropdownGuru(teachersData);
        }
        
        // Isi dropdown Kelas secara dinamis berdasarkan data siswa
        inisialisasiDropdownKelas();

        // Terapkan filter pertama kali
        terapkanFilter(); 
    } catch (error) {
        console.error("Gagal memuat data filter admin:", error.message);
    }
}
