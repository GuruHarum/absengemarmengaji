// Ambil data master secara bertahap agar data di atas 1.000 baris tidak terpotong oleh limit REST.
async function fetchAllRows(queryFactory, batchSize = 500) {
    const all = [];
    let from = 0;

    while (true) {
        const to = from + batchSize - 1;
        const { data, error } = await queryFactory().range(from, to);

        if (error) throw error;
        if (!data || data.length === 0) break;

        all.push(...data);
        if (data.length < batchSize) break;
        from += batchSize;
    }

    return all;
}

async function getTeachers() {
    return fetchAllRows(
        () => supabase.from("teachers").select("*").order("nama"),
        500
    );
}

async function getStudents() {
    return fetchAllRows(
        () => supabase.from("students").select("*").order("kelas").order("nama siswa"),
        500
    );
}

async function getAttendance(filters = {}) {
    // Jika ada filter (date, teacher, class, student), ambil hanya yang cocok
    // filters contoh: { date: '2026-08-18', teacher: 'Nama Guru', class: '1A' }
    try {
        const hasFilters = filters && Object.keys(filters).length > 0;

        if (hasFilters) {
            // Use paged fetching for filtered queries to avoid server default limit
            const batchSize = 1000;
            let from = 0;
            let allFiltered = [];
            let filteredFailed = false;

            while (true) {
                const to = from + batchSize - 1;
                // build base query and apply filters first, then apply ordering and range
                let q = supabase.from('attendance').select('id,date,teacher,class,student,status,note');

                if (filters.date) q = q.eq('date', filters.date);
                if (filters.date_from && filters.date_to) q = q.gte('date', filters.date_from).lte('date', filters.date_to);
                else if (filters.month && filters.year) {
                    const m = String(filters.month).padStart(2, '0');
                    const y = String(filters.year);
                    const first = `${y}-${m}-01`;
                    const lastDay = new Date(Number(y), Number(m), 0).getDate();
                    const last = `${y}-${m}-${String(lastDay).padStart(2, '0')}`;
                    q = q.gte('date', first).lte('date', last);
                }
                if (filters.teacher) q = q.eq('teacher', filters.teacher);
                if (filters.class) q = q.eq('class', filters.class);
                if (filters.student) q = q.eq('student', filters.student);

                q = q.order('date', { ascending: false }).range(from, to);

                try {
                    const { data, error } = await q;
                    if (error) {
                        // Log detailed server error if available; try to stringify fully
                        try {
                            const serialized = JSON.stringify(error, Object.getOwnPropertyNames(error));
                            console.error('getAttendance filtered chunk error (serialized):', serialized);
                        } catch (serr) {
                            console.error('getAttendance filtered chunk error (keys):', Object.getOwnPropertyNames(error));
                            console.error('getAttendance filtered chunk error (raw):', error);
                        }

                        // Also log friendly props if present
                        console.error('getAttendance filtered chunk error props:', {
                            message: error && error.message,
                            details: error && error.details,
                            hint: error && error.hint,
                            code: error && error.code,
                            status: error && error.status
                        });

                        // Log the attempted request context
                        console.error('getAttendance filtered chunk context:', { from, to, filters });

                        filteredFailed = true;
                        break;
                    }

                    console.log(`getAttendance filtered chunk from ${from} to ${to} fetched: ${data ? data.length : 0}`);

                    if (!data || data.length === 0) break;
                    allFiltered = allFiltered.concat(data);
                    if (data.length < batchSize) break;
                    from += batchSize;
                } catch (ex) {
                    try {
                        const ser = JSON.stringify(ex, Object.getOwnPropertyNames(ex));
                        console.error('getAttendance filtered chunk thrown exception (serialized):', ser);
                    } catch (e2) {
                        console.error('getAttendance filtered chunk thrown exception (raw):', ex);
                    }
                    console.error('getAttendance filtered chunk context on exception:', { from, to, filters });
                    filteredFailed = true;
                    break;
                }
            }

            if (!filteredFailed) {
                console.log('getAttendance with filters total fetched:', allFiltered.length, 'filters=', filters);
                return allFiltered;
            }

            // Fallback: server-side filtered request failed (400 or other). Fetch all in pages then filter client-side.
            console.warn('getAttendance: server-side filtered fetch failed, falling back to client-side filtering. This will fetch all attendance in pages then filter locally. filters=', filters);

            const batchSize2 = 1000;
            let from2 = 0;
            let all = [];

            while (true) {
                const to = from2 + batchSize2 - 1;
                const { data, error } = await supabase
                    .from('attendance')
                    .select('id,date,teacher,class,student,status,note')
                    .order('date', { ascending: false })
                    .range(from2, to);

                if (error) {
                    try {
                        const serialized = JSON.stringify(error, Object.getOwnPropertyNames(error));
                        console.error('getAttendance fallback full fetch error (serialized):', serialized);
                    } catch (serr) {
                        console.error('getAttendance fallback full fetch error (keys):', Object.getOwnPropertyNames(error));
                        console.error('getAttendance fallback full fetch error (raw):', error);
                    }
                    console.error('getAttendance fallback chunk context:', { from: from2, to, filters });
                    throw error;
                }

                console.log(`Fallback fetched chunk from ${from2} to ${to}: ${data ? data.length : 0}`);

                if (!data || data.length === 0) break;
                all = all.concat(data);
                if (data.length < batchSize2) break;
                from2 += batchSize2;
            }

            // client-side filter
            const filtered = all.filter(rec => {
                try {
                    if (filters.date) return rec.date === filters.date;
                    if (filters.date_from && filters.date_to) return rec.date >= filters.date_from && rec.date <= filters.date_to;
                    if (filters.month && filters.year) {
                        const m = String(filters.month).padStart(2, '0');
                        const y = String(filters.year);
                        const first = `${y}-${m}-01`;
                        const lastDay = new Date(Number(y), Number(m), 0).getDate();
                        const last = `${y}-${m}-${String(lastDay).padStart(2, '0')}`;
                        return rec.date >= first && rec.date <= last;
                    }
                    if (filters.teacher && rec.teacher !== filters.teacher) return false;
                    if (filters.class && rec.class !== filters.class) return false;
                    if (filters.student && rec.student !== filters.student) return false;
                    return true;
                } catch (e) {
                    return false;
                }
            });

            console.log('getAttendance fallback filtered client total:', filtered.length, 'filters=', filters);
            return filtered;
        }

        // Jika tidak ada filter, lakukan paging penuh seperti sebelumnya
        const { count, error: countErr } = await supabase
            .from('attendance')
            .select('*', { count: 'exact', head: true });

        if (countErr) {
            console.warn('Gagal mendapatkan count total attendance, akan paging tanpa total.');
        }

        const batchSize = 1000;
        let all = [];

        if (typeof count === 'number') {
            const total = count;
            const batches = Math.ceil(total / batchSize);
            console.log(`Mengambil attendance: total=${total}, batches=${batches}`);

            for (let b = 0; b < batches; b++) {
                const from = b * batchSize;
                const to = from + batchSize - 1;
                const { data, error } = await supabase
                    .from('attendance')
                    .select('id,date,teacher,class,student,status,note')
                    .order('date', { ascending: false })
                    .range(from, to);

                if (error) throw error;
                console.log(`Batch ${b + 1}/${batches} fetched: ${data ? data.length : 0}`);
                if (data && data.length > 0) all = all.concat(data);
            }
        } else {
            console.log('Count tidak tersedia — mulai paging fallback.');
            let from = 0;
            while (true) {
                const to = from + batchSize - 1;
                const { data, error } = await supabase
                    .from('attendance')
                    .select('id,date,teacher,class,student,status,note')
                    .order('date', { ascending: false })
                    .range(from, to);

                if (error) throw error;

                console.log(`Fetched chunk from ${from} to ${to}: ${data ? data.length : 0}`);

                if (!data || data.length === 0) break;

                all = all.concat(data);
                if (data.length < batchSize) break;
                from += batchSize;
            }
        }

        console.log('Total attendance fetched:', all.length);
        return all;
    } catch (err) {
        console.error('getAttendance error:', err);
        throw err;
    }
}

async function saveAttendance(record) {

    const exists = await attendanceExists(
        record.date,
        record.teacher,
        record.student
    );

    if (exists) {
        throw new Error("Absensi siswa sudah pernah disimpan.");
    }

    const { data, error } = await supabase
        .from("attendance")
        .insert(record)
        .select()
        .single();

    if (error) throw error;

    return data;
}

async function updateAttendance(id, values) {
    // Use maybeSingle so a 0-row result doesn't throw "Cannot coerce the result to a single JSON object"
    const { data, error } = await supabase
        .from("attendance")
        .update(values)
        .eq("id", id)
        .select()
        .maybeSingle();

    if (error) throw error;
    return data;
}

async function deleteAttendance(id) {
    // Use maybeSingle for delete as well; returns deleted row or null
    const { data, error } = await supabase
        .from("attendance")
        .delete()
        .eq("id", id)
        .select()
        .maybeSingle();

    if (error) throw error;
    return data;
}

async function fetchTeachers() {
    // Amankan showLoading agar tidak crash jika fungsinya tidak ada
    if (typeof showLoading === 'function') {
        showLoading();
    }

    try {
        teachersData = await getTeachers();
        console.log("teachersData:", teachersData);

        // AMAN: Hanya panggil renderTeachers jika fungsinya didefinisikan (ada di ui.js)
        if (typeof renderTeachers === 'function') {
            renderTeachers(); 
        } else {
            console.log("Fungsi renderTeachers diabaikan di halaman ini.");
        }

    if (typeof populateTeacherDropdown === 'function') {
        populateTeacherDropdown();
    } else {
        console.log("Fungsi populateTeacherDropdown diabaikan di halaman ini.");
    }

        return teachersData;

    } catch (err) {
        console.error("fetchTeachers:", err);

        // Amankan showNotification agar tidak crash
        if (typeof showNotification === 'function') {
            showNotification(
                "error",
                "Gagal mengambil data guru."
            );
        } else {
            alert("Gagal mengambil data guru.");
        }

        return [];

    } finally {
        // Amankan hideLoading agar tidak crash
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
                classNamesByNumber.set(
                    nomor,
                    new Set()
                );

            classNamesByNumber
                .get(nomor)
                .add(kelas);

        });

    } catch (err) {

        console.error(err);

    } finally {

        hideLoading();

    }

}

async function fetchAttendanceData(filters = {}) {
    try {
        // AMAN: Hanya panggil showLoading jika fungsinya didefinisikan
        if (typeof showLoading === 'function') {
            showLoading();
        }

        // Panggil getAttendance dengan filters yang diberikan; caller bertanggung jawab
        // untuk menentukan filter (mis. bulan, rentang, guru/kelas, dsb).
        attendanceData = await getAttendance(filters);

        if (typeof attendanceIndex !== 'undefined' && attendanceIndex instanceof Map) {
            attendanceIndex.clear();
        } else {
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

    } catch (err) {
        console.error("Gagal memuat data absensi saat refresh:", err);
    } finally {
        // AMAN: Hanya panggil hideLoading jika fungsinya didefinisikan
        if (typeof hideLoading === 'function') {
            hideLoading();
        } else {
            console.log("Proses memuat data selesai (tanpa animasi loading).");
        }
    }
}

async function saveAttendanceRecord(
    studentName,
    status,
    note,
    studentClass
) {

    try {

        showLoading();

        const newRecord = await saveAttendance({

            date: formatDateForStorage(),

            teacher: selectedTeacher,

            class: studentClass,

            student: studentName,

            status,

            note

        });

        attendanceData.unshift(newRecord);

        checkAndUpdateMonthlyReport();

        return true;

    } catch (err) {

        console.error(err);

        showNotification(
            "error",
            err.message || "Gagal menyimpan absensi."
        );

        return false;

    } finally {

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
    return fetchAllRows(
        () => supabase
            .from("students")
            .select("*")
            .eq("kelas", kelas)
            .order("nama siswa"),
        500
    );
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

async function attendanceExists(
    date,
    teacher,
    student
) {

    const { count, error } = await supabase
        .from("attendance")
        .select("*", {
            count: "exact",
            head: true
        })
        .eq("date", date)
        .eq("teacher", teacher)
        .eq("student", student);

    if (error) throw error;

    return count > 0;
}

async function uploadTeacherPhoto(file, teacherName) {

    const extension = file.name.split('.').pop();

    const fileName =
        teacherName
            .toLowerCase()
            .replace(/\s+/g, "-") +
        "." +
        extension;

    const { error } = await supabase.storage
        .from("teachers")
        .upload(fileName, file, {
            upsert: true
        });

    if (error) throw error;

    const { data } = supabase.storage
        .from("teachers")
        .getPublicUrl(fileName);

    return data.publicUrl;
}

async function updateTeacherPhoto(teacherId, photoUrl) {

    const { data, error } = await supabase
        .from("teachers")
        .update({
            foto: photoUrl
        })
        .eq("id", teacherId)
        .select()
        .single();

    if (error) throw error;

    return data;
}

window.supabase
    .channel("attendance-channel")
    .on(
        "postgres_changes",
        {
            event: "*",
            schema: "public",
            table: "attendance"
        },
        async (payload) => {
            console.log("Perubahan Attendance diterima secara Real-time:", payload);
            
            if (payload.eventType === "INSERT") {
                const newRecord = payload.new;
                const cleanDate = newRecord.date.includes('T') ? newRecord.date.split('T')[0] : newRecord.date;
                const key = `${cleanDate}|${newRecord.teacher}|${newRecord.student}`;
                
                if (typeof attendanceIndex !== 'undefined') {
                    attendanceIndex.set(key, newRecord);
                }
                
                if (window.attendanceData) {
                    const exists = window.attendanceData.some(r => r.id === newRecord.id);
                    if (!exists) window.attendanceData.push(newRecord);
                }
            } 
            
            else if (payload.eventType === "UPDATE") {
                const updatedRecord = payload.new;
                const cleanDate = updatedRecord.date.includes('T') ? updatedRecord.date.split('T')[0] : updatedRecord.date;
                const key = `${cleanDate}|${updatedRecord.teacher}|${updatedRecord.student}`;
                
                if (typeof attendanceIndex !== 'undefined') {
                    attendanceIndex.set(key, updatedRecord);
                }
                
                if (window.attendanceData) {
                    const idx = window.attendanceData.findIndex(r => r.id === updatedRecord.id);
                    if (idx !== -1) window.attendanceData[idx] = updatedRecord;
                }
            }
            
            else if (payload.eventType === "DELETE") {
                const oldRecord = payload.old;
                
                if (window.attendanceData) {
                    const foundIndex = window.attendanceData.findIndex(r => r.id === oldRecord.id);
                    if (foundIndex !== -1) {
                        const targetData = window.attendanceData[foundIndex];
                        const cleanDate = targetData.date.includes('T') ? targetData.date.split('T')[0] : targetData.date;
                        const key = `${cleanDate}|${targetData.teacher}|${targetData.student}`;
                        
                        if (typeof attendanceIndex !== 'undefined') {
                            attendanceIndex.delete(key);
                        }
                        
                        window.attendanceData.splice(foundIndex, 1);
                    }
                }
            }

            if (typeof renderStudents === 'function') {
                await renderStudents();
            }
        }
    )
    .subscribe();

// Ambil Data Profil Sekolah saat Web dimuat
async function getSchoolProfile() {
    const { data, error } = await supabase
        .from("school_profile")
        .select("*")
        .eq("id", 1)
        .single();
    if (error) throw error;
    return data;
}

async function updateSchoolProfile(name, address, logoFile) {
    let logoUrl = null;

    if (logoFile) {
        const fileExt = logoFile.name.split('.').pop();
        const fileName = `school-logo-${Date.now()}.${fileExt}`;

        const { error: uploadError } = await supabase.storage
            .from("teachers")
            .upload(fileName, logoFile, { upsert: true });

        if (uploadError) throw uploadError;

        const { data } = supabase.storage.from("teachers").getPublicUrl(fileName);
        logoUrl = data.publicUrl;
    }

    const updateValues = { name, address };
    if (logoUrl) updateValues.logo_url = logoUrl;

    const { data, error } = await supabase
        .from("school_profile")
        .update(updateValues)
        .eq("id", 1)
        .select()
        .single();

    if (error) throw error;
    return data;
}