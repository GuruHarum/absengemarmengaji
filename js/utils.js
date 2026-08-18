        let loadingCounter = 0;
        
        function addDebugLog(message, data) {
        if (console && console.log) {
        console.log('[DEBUG]', message, data || '');
    }
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
            if (!dateString) return '';
            const parts = dateString.split('-');
            if (parts.length !== 3) return dateString;
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
            const checkDate = date || formatDateForStorage();

            const key =
    `${dateStr}|${studentName}|${teacher || record?.teacher}|${studentClass}`;

const record = attendanceMap.get(key);
            
            return record !== undefined;
        }

        function getAttendanceRecord(studentName, date) {

            const checkDate = date || formatDateForStorage();

            const key = `${checkDate}|${selectedTeacher}|${studentName}`;

            return attendanceIndex.get(key);

        }

        function extractClassNumber(className) {
            if (!className) return null;
            const match = className.match(/\d+/);
            return match ? match[0] : null;
        }

        function isSimpleClassNumber(className) {
            if (!className) return false;
            return /^\d+$/.test(className);
        }

        function isComplexClassName(className) {
            if (!className) return false;
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
        const filteredStudents = studentsData.filter(student => {
        const studentClass = student.kelas;
        const studentClassNumber = extractClassNumber(studentClass);

        return (
            student['nama guru'] === selectedTeacher &&
            studentClassNumber === selectedClass
        );
    });

    filteredStudents.sort((a, b) =>
        a['nama siswa'].localeCompare(b['nama siswa'])
    );

    return filteredStudents;
}