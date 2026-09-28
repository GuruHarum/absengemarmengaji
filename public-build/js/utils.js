let loadingCounter = 0;
function addDebugLog(message, data) {
    if (window.GEMAR_DEBUG === true && console?.log)
        console.log('[DEBUG]', message, data || '');
}
function formatCurrentDate() {
    const days = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
    const months = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
    const now = new Date();
    const day = days[now.getDay()];
    const date = now.getDate();
    const month = months[now.getMonth()];
    const year = now.getFullYear();
    return `${day}, ${date} ${month} ${year}`;
}
function formatDateForStorage() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}
function formatDateForDisplay(dateString) {
    if (!dateString)
        return '';
    const parts = dateString.split('-');
    if (parts.length !== 3)
        return dateString;
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
}
function getMonthName(monthNumber) {
    const months = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
    return months[parseInt(monthNumber) - 1];
}
function getDaysInMonth(year, month) {
    return new Date(year, month, 0).getDate();
}
function isAttendanceRecorded(studentName, date = null) {
    return getAttendanceRecord(studentName, date) !== undefined;
}
function getAttendanceRecord(studentName, date) {
    const checkDate = date || formatDateForStorage();
    const key = `${checkDate}|${selectedTeacher}|${studentName}`;
    const indexedRecord = attendanceIndex.get(key);
    if (indexedRecord)
        return indexedRecord;
    const normalizedStudent = String(studentName || '').trim().toLowerCase();
    const normalizedTeacher = String(selectedTeacher || '').trim().toLowerCase();
    const record = (Array.isArray(attendanceData) ? attendanceData : []).find(item => {
        const itemDate = String(item.date || item.tanggal || '').slice(0, 10);
        const itemStudent = String(item.student || item.nama_siswa || '').trim().toLowerCase();
        const itemTeacher = String(item.teacher || item.nama_guru || '').trim().toLowerCase();
        return itemDate === checkDate && itemStudent === normalizedStudent && itemTeacher === normalizedTeacher;
    });
    if (record && typeof syncAttendanceIndex === 'function') {
        syncAttendanceIndex(record);
    }
    return record;
}
function extractClassNumber(className) {
    if (!className)
        return null;
    const match = className.match(/\d+/);
    return match ? match[0] : null;
}
function isSimpleClassNumber(className) {
    if (!className)
        return false;
    return /^\d+$/.test(className);
}
function isComplexClassName(className) {
    if (!className)
        return false;
    return /\d/.test(className) && /[a-zA-Z]/.test(className);
}
function addCacheBuster(url) {
    const cacheBuster = `cache=${Date.now()}`;
    return url.includes('?') ? `${url}&${cacheBuster}` : `${url}?${cacheBuster}`;
}
function getTodayDate() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}
function getFilteredStudents() {
    const selectedTeacherRow = (teachersData || []).find(teacher => String(teacher.nama || '').trim() === String(selectedTeacher || '').trim());
    const selectedTeacherId = selectedTeacherRow?.id != null ? String(selectedTeacherRow.id) : '';
    const selectedLevel = String(selectedClass || '').trim();
    const filteredStudents = (studentsData || []).filter(student => {
        const studentClassNumber = String(extractClassNumber(student.kelas) || '');
        const hasTeacherId = student.teacher_id != null && String(student.teacher_id).trim() !== '';
        const sameTeacher = hasTeacherId && selectedTeacherId
            ? String(student.teacher_id) === selectedTeacherId
            : String(student['nama guru'] || '').trim() === String(selectedTeacher || '').trim();
        return sameTeacher && studentClassNumber === selectedLevel;
    });
    filteredStudents.sort((a, b) => String(a['nama siswa'] || '').localeCompare(String(b['nama siswa'] || ''), 'id'));
    if (window.GEMAR_DEBUG === true) {
        console.log('[Roster Tahsin]', { teacher: selectedTeacher, teacherId: selectedTeacherId, tingkat: selectedLevel, totalRoster: studentsData?.length || 0, hasil: filteredStudents.length });
    }
    return filteredStudents;
}

function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>'"]/g, char => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
    })[char]);
}
