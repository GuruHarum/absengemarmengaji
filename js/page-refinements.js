function switchPresentationTab(tab) {
    const reports = tab === 'reports';
    const overview = document.getElementById('presentationOverview');
    const report = document.getElementById('presentationReports');
    if (!overview || !report) return;
    overview.hidden = reports;
    report.hidden = !reports;
    document.querySelectorAll('[data-presentation-tab]').forEach(button => {
        const active = button.dataset.presentationTab === (reports ? 'reports' : 'overview');
        button.setAttribute('aria-pressed', String(active));
        button.classList.toggle('active', active);
    });
    if (!reports) window.dispatchEvent(new Event('resize'));
}

function attendanceLogToday() {
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit'
    }).formatToParts(new Date());
    return ['year', 'month', 'day'].map(type => parts.find(part => part.type === type).value).join('-');
}

let attendanceLogRequest = 0;
async function loadAttendanceLog() {
    const input = document.getElementById('attendanceLogDate');
    if (!input) return;
    const request = ++attendanceLogRequest;
    const date = input.value || attendanceLogToday();
    const status = document.getElementById('attendanceLogStatus');
    status.textContent = 'Memuat log absensi...';
    const value = id => document.getElementById(id)?.value || '';
    try {
        const filters = { date };
        const teacher = value('filterTeacher');
        const className = value('filterClassName');
        const level = value('filterClassNumber');
        if (teacher) filters.teacher = teacher;
        if (className) filters.class = className;
        const rows = await getAttendance(filters);
        if (request !== attendanceLogRequest) return;
        filteredAttendanceData = rows.filter(row =>
            String(row.date).slice(0, 10) === date &&
            (!level || String(extractClassNumber(row.class || '')) === level)
        );
        currentPage = 1;
        renderAdminData();
        status.textContent = `Tanggal ${date.split('-').reverse().join('/')} · ${filteredAttendanceData.length} catatan`;
    } catch (error) {
        if (request !== attendanceLogRequest) return;
        filteredAttendanceData = [];
        currentPage = 1;
        renderAdminData();
        status.textContent = 'Log gagal dimuat. Silakan pilih ulang tanggal atau terapkan filter untuk mencoba lagi.';
        console.error('Gagal memuat log absensi:', error);
    }
}

document.addEventListener('panelready', () => {
    document.getElementById('attendanceLogDate')?.addEventListener('change', loadAttendanceLog);
});
