    async function fetchStudents(forceRefresh = false) {
    // AMAN: Cek apakah variabel global studentsLoaded eksis, jika tidak buat secara dinamis
    if (typeof window.studentsLoaded === 'undefined') {
        window.studentsLoaded = false;
    }

    if (window.studentsLoaded && !forceRefresh) {
        return studentsData;
    }

    // AMAN: Hanya panggil showLoading jika fungsinya didefinisikan
    if (typeof showLoading === 'function') {
        showLoading();
    }

    try {
        studentsData = await getStudents();
        console.log("studentsData:", studentsData);

        // AMAN: Tandai data telah dimuat pada objek window global
        window.studentsLoaded = true;

        classesData = new Map();
        classNamesByNumber = new Map();

        studentsData.forEach(student => {
            const className = student.kelas;
            const classNumber = extractClassNumber(className);

            if (classNumber) {
                if (!classesData.has(classNumber)) {
                    classesData.set(classNumber, new Set());
                }

                classesData.get(classNumber).add(className);

                if (isComplexClassName(className)) {
                    if (!classNamesByNumber.has(classNumber)) {
                        classNamesByNumber.set(classNumber, new Set());
                    }
                    classNamesByNumber.get(classNumber).add(className);
                }
            }
        });

        return studentsData;

    } catch (error) {
        console.error("Error fetching students:", error);

        // AMAN: Hanya panggil showNotification jika fungsinya didefinisikan
        if (typeof showNotification === 'function') {
            showNotification(
                "error",
                "Gagal memuat data siswa."
            );
        } else {
            alert("Gagal memuat data siswa.");
        }

        return [];

    } finally {
        // AMAN: Hanya panggil hideLoading jika fungsinya didefinisikan
        if (typeof hideLoading === 'function') {
            hideLoading();
        } else {
            console.log("Selesai memuat data siswa.");
        }
    }
}

        function checkAndUpdateMonthlyReport() {
            const month = filterMonth.value;
            const teacher = filterTeacher.value;
            const classNumber = filterClassNumber.value;
            const className = filterClassName.value;
            const year = filterYear.value;
            const showMonthlyReport = month && (classNumber || className);
            
            if (showMonthlyReport && reportContainer.style.display !== 'none') {
                generateMonthlyReport(month, teacher, classNumber, className, year);
            }
        }