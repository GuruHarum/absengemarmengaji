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
async function loadAttendanceLog(page = 1) {
    const input = document.getElementById('attendanceLogDate');
    if (!input) return;
    if (typeof page !== 'number') page = 1;
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
        if (level) filters.level = level;
        const result = await getAttendancePage(filters, page, recordsPerPage);
        if (request !== attendanceLogRequest) return;
        const lastPage = Math.max(1, Math.ceil(result.total / recordsPerPage));
        if (page > lastPage) return loadAttendanceLog(lastPage);
        window.GM_ATTENDANCE_LOG_PAGE = { total: result.total, page, date };
        filteredAttendanceData = result.rows;
        currentPage = page;
        renderAdminData();
        status.textContent = `Tanggal ${date.split('-').reverse().join('/')} · ${result.total} catatan`;

    } catch (error) {
        if (request !== attendanceLogRequest) return;
        filteredAttendanceData = [];
        window.GM_ATTENDANCE_LOG_PAGE = { total: 0, page: 1, date };
        currentPage = 1;
        renderAdminData();
        status.textContent = 'Log gagal dimuat. Silakan pilih ulang tanggal atau terapkan filter untuk mencoba lagi.';
        console.error('Gagal memuat log absensi:', error);
    }
}

document.addEventListener('panelready', () => {
    document.getElementById('attendanceLogDate')?.addEventListener('change', loadAttendanceLog);
});
