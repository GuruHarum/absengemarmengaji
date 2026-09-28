async function fetchAllRows(queryFactory, batchSize = 500) {
    const all = [];
    let from = 0;
    while (true) {
        const to = from + batchSize - 1;
        const { data, error } = await queryFactory().range(from, to);
        if (error)
            throw error;
        if (!data || data.length === 0)
            break;
        all.push(...data);
        if (data.length < batchSize)
            break;
        from += batchSize;
    }
    return all;
}
async function getTeachers() {
    if (window.AppAccess)
        await AppAccess.ready;
    if (!window.AppAccess) {
        const {data,error} = await supabase.rpc('gm_public_tahsin_teachers');
        if (error) throw new Error('Daftar guru Tahsin belum tersedia: ' + error.message);
        return data || [];
    }
    return fetchAllRows(() => AppAccess.scope(supabase.from('teachers').select('*').order('nama'), 'teachers'), 500);
}
async function getStudents() {
    if (window.AppAccess)
        await AppAccess.ready;
    if (!window.AppAccess) {
        const now = new Date();
        const yearKey = now.getFullYear() - (now.getMonth() + 1 < 7 ? 1 : 0);
        const {data,error} = await supabase.rpc('gm_public_tahsin_students', { year_key: yearKey });
        if (error) throw new Error('Daftar peserta Tahsin belum tersedia: ' + error.message);
        return data || [];
    }
    return fetchAllRows(() => AppAccess.scope(supabase.from('students').select('*').order('kelas').order('nama siswa'), 'students'), 500);
}
// Ambil absensi dengan filter server-side dan identitas ID. Tidak pernah
// mengunduh seluruh riwayat sebagai fallback jika filter gagal.
async function getAttendance(filters = {}) {
    if (window.AppAccess) {
        await AppAccess.ready;
        if (AppAccess.teacher()) {
            filters = { ...filters, teacher_id: String(AppAccess.profile.teacher_id) };
            delete filters.teacher;
        }
    }
    const identity = window.GMFilter;
    const teacherId = filters.teacher_id || identity?.teacherId(filters.teacher);
    const classId = filters.class_id || identity?.classId(filters.class);
    const select = 'id,date,teacher,class,student,status,note,student_id,class_id,teacher_id';
    const makeQuery = () => {
        let q = supabase.from('attendance').select(select);
        if (filters.date) q = q.eq('date', filters.date);
        else if (filters.date_from && filters.date_to) q = q.gte('date', filters.date_from).lte('date', filters.date_to);
        else if (filters.month && filters.year) {
            const m = String(filters.month).padStart(2,'0'), y = String(filters.year);
            const last = new Date(Number(y),Number(m),0).getDate();
            q = q.gte('date',`${y}-${m}-01`).lte('date',`${y}-${m}-${String(last).padStart(2,'0')}`);
        }
        if (teacherId) q = q.eq('teacher_id', teacherId);
        else if (filters.teacher) q = q.eq('teacher', filters.teacher);
        if (classId) q = q.eq('class_id', classId);
        else if (filters.class) q = q.eq('class', filters.class);
        if (filters.student_id) q = q.eq('student_id', filters.student_id);
        else if (filters.student) q = q.eq('student', filters.student);
        return q.order('date',{ascending:false}).order('id',{ascending:false});
    };
    const all = [];
    for (let offset=0; ; offset+=500) {
        const {data,error} = await makeQuery().range(offset,offset+499);
        if (error) {
            console.error('Filter absensi gagal (tanpa fallback seluruh tabel):', {filters,error});
            throw new Error(`Gagal memuat absensi: ${error.message}. Periksa migrasi ID dan izin akses.`);
        }
        all.push(...(data||[]));
        if (!data || data.length < 500) break;
    }
    return all;
}
async function getMaintenanceMode() {
    const { data, error } = await supabase
        .from('maintenance_settings')
        .select('enabled')
        .eq('id', true)
        .maybeSingle();
    if (error)
        throw error;
    return data?.enabled === true;
}
async function setMaintenanceMode(enabled) {
    const { data, error } = await supabase
        .from('maintenance_settings')
        .upsert({ id: true, enabled: Boolean(enabled), updated_at: new Date().toISOString() }, { onConflict: 'id' })
        .select('enabled')
        .single();
    if (error)
        throw error;
    return data.enabled === true;
}
// PWA publik: identitas tiga ID ditentukan dari master yang sudah ditampilkan.
// Tidak ada langkah baru untuk orang tua; jika referensi tidak unik, jangan menebak ID.
async function getPublicAttendanceIds(student, teacherName, date) {
    const year = Number(date.slice(0, 4)) - (Number(date.slice(5, 7)) < 7 ? 1 : 0);
    const studentId = Number(student?.id);
    if (!Number.isSafeInteger(studentId) || studentId <= 0)
        throw new Error('ID siswa tidak valid. Muat ulang daftar siswa.');
    const matchedTeachers = (teachersData || []).filter(t => t.nama === teacherName && Number.isSafeInteger(Number(t.id)));
    if (matchedTeachers.length !== 1)
        throw new Error('Identitas guru tidak unik. Muat ulang halaman.');
    if (Number.isSafeInteger(Number(student.class_id)) && Number(student.class_id) > 0 &&
        String(student.teacher_id) === String(matchedTeachers[0].id) &&
        Number(student.academic_year_start) === year) {
        return {student_id:studentId,class_id:Number(student.class_id),teacher_id:Number(student.teacher_id)};
    }
    const cleanClass = value => String(value || '').trim().replace(/\s+/g, ' ').toLowerCase();
    const className = cleanClass(student.kelas);
    const { data: classes, error } = await supabase.from('school_classes')
        .select('id,class_name,academic_year_start')
        .eq('academic_year_start', year);
    if (error)
        throw new Error('ID kelas belum tersedia. Hubungi koordinator.');
    const matchingClasses = (classes || []).filter(c => cleanClass(c.class_name) === className);
    if (matchingClasses.length !== 1)
        throw new Error('Kelas tidak ditemukan atau ganda di master kelas. Hubungi koordinator.');
    return { student_id: studentId, class_id: Number(matchingClasses[0].id), teacher_id: Number(matchedTeachers[0].id) };
}

async function saveAttendance(record) {
    const exists = await attendanceExists(record.date, record.teacher, record.student);
    if (exists) {
        throw new Error("Absensi siswa sudah pernah disimpan.");
    }
    const { data, error } = await supabase
        .from("attendance")
        .insert(record)
        .select()
        .single();
    if (error)
        throw error;
    return data;
}
async function updateAttendance(id, values) {
    const { data, error } = await supabase
        .from("attendance")
        .update(values)
        .eq("id", id)
        .select()
        .maybeSingle();
    if (error)
        throw error;
    if (!data)
        throw new Error("Data absensi tidak ditemukan atau tidak dapat diperbarui.");
    return data;
}
async function deleteAttendance(id) {
    const { data, error } = await supabase
        .from("attendance")
        .delete()
        .eq("id", id)
        .select()
        .maybeSingle();
    if (error)
        throw error;
    if (!data)
        throw new Error("Data absensi tidak ditemukan atau tidak dapat dihapus.");
    return data;
}
async function fetchTeachers() {
    if (typeof showLoading === 'function') {
        showLoading();
    }
    try {
        teachersData = await getTeachers();
        if (typeof renderTeachers === 'function') {
            renderTeachers();
        }
        else {
            console.log("Fungsi renderTeachers diabaikan di halaman ini.");
        }
        if (typeof populateTeacherDropdown === 'function') {
            populateTeacherDropdown();
        }
        else {
            console.log("Fungsi populateTeacherDropdown diabaikan di halaman ini.");
        }
        return teachersData;
    }
    catch (err) {
        console.error("fetchTeachers:", err);
        if (typeof showNotification === 'function') {
            showNotification("error", "Gagal mengambil data guru.");
        }
        else {
            if (window.AdminNotice) AdminNotice.notify("Gagal mengambil data guru.", "error");
        }
        return [];
    }
    finally {
        if (typeof hideLoading === 'function') {
            hideLoading();
        }
    }
}
async function fetchStudents() {
    try {
        showLoading();
        studentsData = await getStudents();
        classesData.clear();
        classNamesByNumber.clear();
        studentsData.forEach(student => {
            const kelas = student.kelas;
            const nomor = extractClassNumber(kelas);
            if (!classesData.has(nomor))
                classesData.set(nomor, []);
            classesData.get(nomor).push(student);
            if (!classNamesByNumber.has(nomor))
                classNamesByNumber.set(nomor, new Set());
            classNamesByNumber
                .get(nomor)
                .add(kelas);
        });
    }
    catch (err) {
        console.error(err);
    }
    finally {
        hideLoading();
    }
}
async function fetchAttendanceData(filters = {}) {
    try {
        if (typeof showLoading === 'function') {
            showLoading();
        }
        attendanceData = await getAttendance(filters);
        window.GM_ATTENDANCE_FILTER_FETCHED = true;
        if (typeof attendanceIndex !== 'undefined' && attendanceIndex instanceof Map) {
            attendanceIndex.clear();
        }
        else {
            window.attendanceIndex = new Map();
        }
        attendanceData.forEach(record => {
            if (record && record.date && record.teacher && record.student) {
                const cleanDate = record.date.includes('T') ? record.date.split('T')[0] : record.date;
                const key = `${cleanDate}|${record.teacher}|${record.student}`;
                attendanceIndex.set(key, record);
            }
        });
        console.log("Index absensi berhasil dibangun ulang dari database. attendanceData.length=", attendanceData ? attendanceData.length : 0);
    }
    catch (err) {
        console.error("Gagal memuat data absensi saat refresh:", err);
    }
    finally {
        if (typeof hideLoading === 'function') {
            hideLoading();
        }
        else {
            console.log("Proses memuat data selesai (tanpa animasi loading).");
        }
    }
}
function cacheAttendanceRecord(record) {
    const index = attendanceData.findIndex(item => String(item.id) === String(record.id));
    const previous = index === -1 ? null : attendanceData[index];
    if (index === -1)
        attendanceData.push(record);
    else
        attendanceData[index] = record;
    syncAttendanceIndex(record, previous);
}
function syncAttendanceIndex(record, previousRecord = null) {
    if (previousRecord && typeof attendanceIndex !== 'undefined' && attendanceIndex instanceof Map) {
        const previousDate = String(previousRecord.date || '').slice(0, 10);
        attendanceIndex.delete(`${previousDate}|${previousRecord.teacher}|${previousRecord.student}`);
    }
    if (record && typeof attendanceIndex !== 'undefined' && attendanceIndex instanceof Map) {
        const date = String(record.date || '').slice(0, 10);
        if (date && record.teacher && record.student) {
            attendanceIndex.set(`${date}|${record.teacher}|${record.student}`, record);
        }
    }
}
async function saveAttendanceRecord(studentName, status, note, studentClass) {
    try {
        showLoading();
        const matches = studentsData.filter(s => s['nama siswa'] === studentName && s.kelas === studentClass && s['nama guru'] === selectedTeacher);
        if (matches.length !== 1)
            throw new Error('Siswa tidak ditemukan atau tidak unik pada pilihan kelas dan guru.');
        const date = formatDateForStorage();
        const ids = await getPublicAttendanceIds(matches[0], selectedTeacher, date);
        const newRecord = await saveAttendance({
            date, teacher: selectedTeacher, class: studentClass, student: studentName,
            status, note, ...ids
        });
        cacheAttendanceRecord(newRecord);
        if (typeof checkAndUpdateMonthlyReport === 'function')
            checkAndUpdateMonthlyReport();
        return true;
    }
    catch (err) {
        console.error(err);
        showNotification("error", err.message || "Gagal menyimpan absensi.");
        return false;
    }
    finally {
        hideLoading();
    }
}
async function getTeacherByName(name) {
    const { data, error } = await supabase
        .from("teachers")
        .select("*")
        .eq("nama", name)
        .single();
    if (error)
        throw error;
    return data;
}
async function getStudentsByClass(kelas) {
    return fetchAllRows(() => supabase
        .from("students")
        .select("*")
        .eq("kelas", kelas)
        .order("nama siswa"), 500);
}
async function getAttendanceByDate(date) {
    const { data, error } = await supabase
        .from("attendance")
        .select("*")
        .eq("date", date);
    if (error)
        throw error;
    return data;
}
async function attendanceExists(date, teacher, student) {
    const { count, error } = await supabase
        .from("attendance")
        .select("*", {
        count: "exact",
        head: true
    })
        .eq("date", date)
        .eq("teacher", teacher)
        .eq("student", student);
    if (error)
        throw error;
    return count > 0;
}
if (!window.__gemarMengajiRealtimeChannel) {
    const realtimeChannel = window.supabase.channel('gemar-mengaji-realtime');
    const refreshVisibleViews = async (table) => {
        if (table === 'students' || table === 'teachers') {
            if (table === 'students') {
                const freshStudents = await getStudents();
                if (typeof studentsData !== 'undefined')
                    studentsData = freshStudents;
            }
            else {
                const freshTeachers = await getTeachers();
                if (typeof teachersData !== 'undefined')
                    teachersData = freshTeachers;
            }
            if (typeof populateAdminDropdowns === 'function')
                populateAdminDropdowns();
            if (typeof populateTeacherDropdown === 'function')
                populateTeacherDropdown();
            if (typeof renderManageTable === 'function')
                renderManageTable();
        }
        if (typeof renderStudents === 'function')
            await renderStudents();
        if (typeof renderMonthlyReportTable === 'function') {
            const month = document.getElementById('filterMonth')?.value;
            if (month) {
                await renderMonthlyReportTable(month, document.getElementById('filterYear')?.value || new Date().getFullYear().toString(), document.getElementById('filterTeacher')?.value || '', document.getElementById('filterClassName')?.value || document.getElementById('filterClassNumber')?.value || '', false);
            }
        }
    };
    const handleRealtimeChange = async (payload) => {
        const table = payload.table;
        if (table === 'maintenance_settings') {
            const enabled = payload.eventType !== 'DELETE' && payload.new?.enabled === true;
            if (typeof window.handleMaintenanceRealtime === 'function') {
                window.handleMaintenanceRealtime(enabled);
            }
            return;
        }
        if (table === 'school_profile' && payload.new && typeof window.applySchoolProfile === 'function') {
            window.applySchoolProfile(payload.new);
            return;
        }
        if (table === 'attendance') {
            if (window.AppAccess) {
                await AppAccess.ready;
                if (AppAccess.teacher() && payload.eventType !== 'DELETE' && payload.new?.teacher !== AppAccess.profile.teacherName)
                    return;
            }
            const changedRecord = payload.eventType === 'DELETE' ? payload.old : payload.new;
            const currentAttendance = typeof attendanceData !== 'undefined'
                ? attendanceData
                : (window.attendanceData || []);
            if (payload.eventType === 'DELETE') {
                const index = currentAttendance.findIndex(record => record.id === changedRecord.id);
                if (index !== -1) {
                    const previousRecord = currentAttendance[index];
                    currentAttendance.splice(index, 1);
                    syncAttendanceIndex(null, previousRecord);
                }
            }
            else {
                const index = currentAttendance.findIndex(record => record.id === changedRecord.id);
                const previousRecord = index === -1 ? null : currentAttendance[index];
                if (index === -1)
                    currentAttendance.push(changedRecord);
                else
                    currentAttendance[index] = changedRecord;
                syncAttendanceIndex(changedRecord, previousRecord);
            }
            if (typeof renderAdminData === 'function') {
                if (typeof filteredAttendanceData !== 'undefined') {
                    filteredAttendanceData = typeof getFilteredAttendanceRecords === 'function'
                        ? getFilteredAttendanceRecords(currentAttendance) : [...currentAttendance];
                }
                renderAdminData();
            }
        }
        await refreshVisibleViews(table);
    };
    ['attendance', 'students', 'teachers', 'maintenance_settings', 'school_profile'].forEach(table => {
        realtimeChannel.on('postgres_changes', {
            event: '*', schema: 'public', table
        }, handleRealtimeChange);
    });
    window.__gemarMengajiRealtimeChannel = realtimeChannel;
    realtimeChannel.subscribe((status, error) => {
        console.log('[Realtime] status:', status, error || '');
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            console.error('[Realtime] Gagal berlangganan perubahan Supabase.', error || status);
        }
    });
}
async function getSchoolProfile() {
    const { data, error } = await supabase
        .from("school_profile")
        .select("*")
        .eq("id", 1)
        .maybeSingle();
    if (error)
        throw error;
    return data || {
        id: 1,
        name: 'SDIT Harapan Umat Karawang',
        address: 'Jl. Pakuncen No. 01, Desa Sukaharja, Kec. Teluk Jambe Timur',
        logo_url: 'assets/school-logo.png',
        theme_color: '#216454'
    };
}
async function updateSchoolProfile(name, address, logoFile, themeColor) {
    let logoUrl = null;
    if (logoFile) {
        const fileExt = logoFile.name.split('.').pop();
        const fileName = `school-logo-${Date.now()}.${fileExt}`;
        const { error: uploadError } = await supabase.storage
            .from("teachers")
            .upload(fileName, logoFile, { upsert: true });
        if (uploadError)
            throw uploadError;
        const { data } = supabase.storage.from("teachers").getPublicUrl(fileName);
        logoUrl = data.publicUrl;
    }
    const updateValues = { id: 1, name, address };
    if (logoUrl)
        updateValues.logo_url = logoUrl;
    if (themeColor)
        updateValues.theme_color = themeColor;
    const { data, error } = await supabase
        .from("school_profile")
        .upsert(updateValues, { onConflict: 'id' })
        .select()
        .single();
    if (error)
        throw error;
    return data;
}
