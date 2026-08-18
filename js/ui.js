        const studentList = document.getElementById('studentList');
        const currentDate = document.getElementById('currentDate');
        const classTitle = document.getElementById('classTitle');
        
        function showLoading() {
    loadingCounter++;

    if (loadingIndicator) {
        loadingIndicator.classList.remove('hidden');
    }
}

        function hideLoading() {
    loadingCounter = Math.max(0, loadingCounter - 1);

    if (loadingCounter === 0 && loadingIndicator) {
        loadingIndicator.classList.add('hidden');
    }
}

        function resetLoading() {
    loadingCounter = 0;

    if (loadingIndicator) {
        loadingIndicator.classList.add('hidden');
    }
}

        function showNotification(type, message) {
            const notificationContent = document.getElementById('notificationContent');
            if (type === 'success') {
                notificationContent.innerHTML = `
                    <div class="bg-green-100 border-l-4 border-green-500 text-green-700 p-4 w-full">
                        <div class="flex items-center">
                            <svg class="h-6 w-6 text-green-500 mr-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
                            </svg>
                            <p>${message}</p>
                        </div>
                    </div>
                `;
            } else if (type === 'info') {
                notificationContent.innerHTML = `
                    <div class="bg-blue-100 border-l-4 border-blue-500 text-blue-700 p-4 w-full">
                        <div class="flex items-center">
                            <svg class="h-6 w-6 text-blue-500 mr-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            <p>${message}</p>
                        </div>
                    </div>
                `;
            } else {
                notificationContent.innerHTML = `
                    <div class="bg-red-100 border-l-4 border-red-500 text-red-700 p-4 w-full">
                        <div class="flex items-center">
                            <svg class="h-6 w-6 text-red-500 mr-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                            </svg>
                            <p>${message}</p>
                        </div>
                    </div>
                `;
            }
            notification.classList.add('show');
            setTimeout(() => {
                notification.classList.remove('show');
            }, 3000);
        }

        function showThankYouModal() {
            thankYouModal.classList.add('show');
        }

        function hideThankYouModal() {
            thankYouModal.classList.remove('show');
        }

        function populateTeacherDropdown() {
            const dropdown = document.getElementById('filterTeacher');
            while (dropdown.options.length > 1) {
                dropdown.remove(1);
            }
            
            teachersData.forEach(teacher => {
                const option = document.createElement('option');
                option.value = teacher.nama;
                option.textContent = teacher.nama;
                dropdown.appendChild(option);
            });
        }

        function populateClassFilters() {
    if (!filterTeacher) return;
    filterTeacher.innerHTML = '<option value="">Semua Guru</option>';
    
    // Isi filter guru berdasarkan data dari database
    teachersData.forEach(teacher => {
        filterTeacher.innerHTML += `<option value="${teacher.id}">${teacher.nama}</option>`;
    });

    // Isi filter tingkat kelas (1-6)
    if (filterClassNumber) {
        filterClassNumber.innerHTML = '<option value="">Semua Tingkat</option>';
        for(let i=1; i<=6; i++) {
            filterClassNumber.innerHTML += `<option value="${i}">Kelas ${i}</option>`;
        }
    }
}

        function updateClassNameDropdown(classNumber) {
            const classNameDropdown = document.getElementById('filterClassName');
            while (classNameDropdown.options.length > 1) {
                classNameDropdown.remove(1);
            }
            
            if (!classNumber) {
                filterClassNameContainer.style.display = 'none';
                return;
            }

            const classNames = classNamesByNumber.get(classNumber);
            
            if (!classNames || classNames.size === 0) {
                filterClassNameContainer.style.display = 'none';
                return;
            }

            filterClassNameContainer.style.display = 'block';
            Array.from(classNames)
                .sort()
                .forEach(className => {
                    const option = document.createElement('option');
                    option.value = className;
                    option.textContent = className;
                    classNameDropdown.appendChild(option);
                });
        }

        function renderTeachers() {
            if (teachersData.length === 0) {
                teacherGrid.innerHTML = `
                    <div class="col-span-full text-center p-8">
                        <p class="text-gray-500">Tidak ada data guru tersedia.</p>
                    </div>
                `;
                return;
            }
            
            teacherGrid.innerHTML = teachersData.map((teacher, index) => `
                <div class="teacher-card bg-white rounded-lg shadow-md p-6 text-center cursor-pointer hover:shadow-lg" data-index="${index}">
                    <div class="w-32 h-32 mx-auto mb-4 rounded-full overflow-hidden shadow-md transform transition-transform hover:scale-105">
                        <img src="${teacher.foto}" alt="${teacher.nama}" class="w-full h-full object-cover" onerror="this.src='https://via.placeholder.com/150?text=${encodeURIComponent(teacher.nama)}'; this.onerror=null;">
                    </div>
                    <h3 class="text-lg font-semibold text-blue-800">${teacher.nama}</h3>
                </div>
            `).join('');
            document.querySelectorAll('.teacher-card').forEach(card => {
                card.addEventListener('click', function() {
                    const index = this.getAttribute('data-index');
                    selectedTeacher = teachersData[index].nama;
                    const teacherClassNumbers = new Set();
studentsData.forEach(student => {
    if (student['nama guru'] === selectedTeacher) {
        const classNumber = extractClassNumber(student.kelas);
        if (classNumber) teacherClassNumbers.add(classNumber);
    }
});

renderClassOptions(Array.from(teacherClassNumbers));
                    
                    openClassModal();
                });
            });
        }

        function renderClassOptions(classes) {
            if (classes.length === 0) {
                classOptions.innerHTML = `
                    <div class="col-span-2 text-center p-4">
                        <p class="text-gray-500">Tidak ada kelas tersedia untuk guru ini.</p>
                    </div>
                `;
                return;
            }
            classes.sort((a, b) => parseInt(a) - parseInt(b));
            
            classOptions.innerHTML = classes.map(classNumber => `
                <button class="class-option bg-blue-50 hover:bg-blue-100 text-blue-800 font-medium py-4 px-6 rounded-lg transition duration-300 shadow-sm transform hover:scale-105" data-class="${classNumber}">
                    Kelas ${classNumber}
                </button>
            `).join('');

            document.querySelectorAll('.class-option').forEach(button => {
                button.addEventListener('click', function() {
                    selectedClass = this.getAttribute('data-class');
                    closeClassModal();
                    showPage(2);
                    fetchAttendanceData().then(() => {
                        renderStudents();
                        populateYearFilter();
                    });
                });
            });
        }

function getAttendanceBadge(status) {

    switch(status){

        case 'hadir':
            return {
                className:'bg-green-100 text-green-800',
                icon:'✅ Hadir'
            };

        case 'sakit':
            return {
                className:'bg-yellow-100 text-yellow-800',
                icon:'🤒 Sakit'
            };

        case 'izin':
            return {
                className:'bg-blue-100 text-blue-800',
                icon:'📝 Izin'
            };

        default:
            return {
                className:'bg-red-100 text-red-800',
                icon:'❌ Alpha'
            };

    }

}

function bindAttendanceOptionEvents() {
    document.querySelectorAll('.attendance-option').forEach(button => {
        button.addEventListener('click', function() {
            const studentName = this.getAttribute('data-student');
            const status = this.getAttribute('data-status');
            const card = this.closest('.student-card');
            const noteContainer = card.querySelector('.note-container');
            const noteInput = card.querySelector('.note-input');
            const isSelected = this.classList.contains('selected-option');

            card.querySelectorAll('.attendance-option').forEach(opt => {
                opt.classList.remove('selected-option');
            });

            if (isSelected) {
                noteContainer.style.display = 'none';
                delete selectedStudentStatus[studentName];
                return;
            }

            this.classList.add('selected-option');
            selectedStudentStatus[studentName] = status;

            noteContainer.style.display = 'block';

            if (status === 'hadir') {
                noteInput.placeholder = 'Contoh: Buku 1 Halaman 1, Tahfidz Surah Al-Fatihah (Jangan Gunakan Enter)';
            } else if (status === 'sakit') {
                noteInput.placeholder = 'Contoh: Demam';
            } else if (status === 'izin') {
                noteInput.placeholder = 'Contoh: Acara Keluarga';
            } else if (status === 'alpha') {
                noteInput.placeholder = 'Tidak Perlu Diisi';
            }

            noteContainer.style.display = 'block';
        });
    });
}

async function renderStudents() {

    if (!selectedTeacher || !selectedClass) return;
    selectedStudentStatus = {};

    const filteredStudents = getFilteredStudents();

    if (filteredStudents.length === 0) {
        studentList.innerHTML = `
            <div class="col-span-full text-center p-8 bg-white rounded-lg shadow-md">
                <p class="text-gray-500">Tidak ada data siswa untuk guru dan kelas yang dipilih.</p>
            </div>
        `;
        return;
    }

    const today = formatDateForStorage();

    let html = '';

    for (let i = 0; i < filteredStudents.length; i++) {
        const student = filteredStudents[i];
        const studentName = student['nama siswa'];
        const recordedData = getAttendanceRecord(studentName, today);
        const isRecorded = recordedData !== undefined;
        const normalizedRecordedStatus = isRecorded ? ({ h: 'hadir', s: 'sakit', i: 'izin', a: 'alpha', alfa: 'alpha', '-': 'alpha' }[String(recordedData.status || '').toLowerCase()] || String(recordedData.status || '').toLowerCase()) : '';

        html += `
           <div class="student-card">
                        <div class="student-header bg-blue-50">
                            <h3 class="font-medium text-blue-800">${studentName}</h3>
                            <p class="text-xs text-blue-600">${student.kelas}</p>
                        </div>
                        <div class="student-content">
                            ${isRecorded ? 
                                `<div class="flex flex-col">
                                    <div class="flex items-center justify-center mb-3">
                                        <span class="attendance-badge inline-flex items-center px-4 py-2 rounded-full text-sm font-medium ${
                                            normalizedRecordedStatus === 'hadir' ? 'bg-green-100 text-green-800' : 
                                            normalizedRecordedStatus === 'sakit' ? 'bg-yellow-100 text-yellow-800' : 
                                            normalizedRecordedStatus === 'izin' ? 'bg-blue-100 text-blue-800' : 
                                            'bg-red-100 text-red-800'
                                        }">
                                            ${
                                                recordedData.status === 'hadir' ? '✅ Hadir' : 
                                                recordedData.status === 'sakit' ? '🤒 Sakit' : 
                                                recordedData.status === 'izin' ? '📝 Izin' : 
                                                '❌ Alpha'
                                            }
                                        </span>
                                    </div>
                                     <div class="note-container">
                                         <p class="text-sm text-gray-600 mb-1">Catatan:</p>
                                         <p class="text-gray-800">${recordedData.note || '-'}</p>
                                     </div>
                                      ${(typeof isAdmin !== 'undefined' && isAdmin) || localStorage.getItem('isAdminLoggedIn') === 'true' ? `
                                        <div class="flex gap-2 mt-3">
                                            <button type="button" class="edit-attendance-btn p-2 rounded-md text-blue-700 hover:bg-blue-50" data-attendance-id="${recordedData.id}" title="Edit">
                                                <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                                    <path d="M17.414 2.586a2 2 0 00-2.828 0L7 10.172V13h2.828l7.586-7.586a2 2 0 000-2.828z" />
                                                    <path fill-rule="evenodd" d="M2 15.25V18h2.75l8.447-8.447-2.75-2.75L2 15.25z" clip-rule="evenodd" />
                                                </svg>
                                            </button>
                                        </div>` : ''}
                                 </div>` :
                                `<div class="flex flex-col">
                                    <div class="attendance-options">
                                        <button class="attendance-option bg-green-100 hover:bg-green-200 text-green-800 px-3 py-1 rounded-full text-sm font-medium flex items-center shadow-sm" data-student="${studentName}" data-status="hadir">
                                            ✅ Hadir
                                        </button>
                                        <button class="attendance-option bg-yellow-100 hover:bg-yellow-200 text-yellow-800 px-3 py-1 rounded-full text-sm font-medium flex items-center shadow-sm" data-student="${studentName}" data-status="sakit">
                                            🤒 Sakit
                                        </button>
                                        <button class="attendance-option bg-blue-100 hover:bg-blue-200 text-blue-800 px-3 py-1 rounded-full text-sm font-medium flex items-center shadow-sm" data-student="${studentName}" data-status="izin">
                                            📝 Izin
                                        </button>
                                        <button class="attendance-option bg-red-100 hover:bg-red-200 text-red-800 px-3 py-1 rounded-full text-sm font-medium flex items-center shadow-sm" data-student="${studentName}" data-status="alpha">
                                            ❌ Alpha
                                        </button>
                                    </div>
                                    <div class="note-container" data-student="${studentName}" style="display: none;">
                                        <div class="mb-2">
                                            <label class="block text-sm font-medium text-gray-700 mb-1">Catatan:</label>
                                            <textarea class="note-input w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm" rows="2" placeholder=""></textarea>
                                        </div>
                                        <button class="save-btn w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-md transition duration-300 shadow-sm text-sm"
    data-student-index="${i}">
    Simpan
                                        </button>
                                    </div>
                                </div>`
                            }
                        </div>
                    </div>
                `;
    }

    studentList.innerHTML = html;

    bindAttendanceOptionEvents();

    bindSaveButtonEvents(filteredStudents);
    bindAttendanceEditEvents();

    currentDate.textContent = formatCurrentDate();

    classTitle.textContent = `Kelas ${selectedClass} - ${selectedTeacher}`;
}

function bindAttendanceEditEvents() {
    // Buka modal edit saat ikon edit diklik
    document.querySelectorAll('.edit-attendance-btn').forEach(button => {
        button.addEventListener('click', function() {
            if ((typeof isAdmin === 'undefined' || !isAdmin) && localStorage.getItem('isAdminLoggedIn') !== 'true') return;
            const record = (typeof attendanceData !== 'undefined' ? attendanceData : []).find(item => String(item.id) === this.dataset.attendanceId);
            if (!record) return showNotification('error', 'Data absensi tidak ditemukan. Silakan muat ulang halaman.');

            const modal = document.getElementById('attendanceEditModal');
            if (!modal) return showNotification('error', 'Modal edit tidak ditemukan.');

            document.getElementById('attendanceEditId').value = record.id;
            document.getElementById('attendanceEditStatus').value = record.status || 'hadir';
            document.getElementById('attendanceEditNote').value = record.note || '';
            document.getElementById('attendanceEditStudent').textContent = `${record.student} — ${record.class} — ${record.date}`;

            modal.classList.remove('hidden');
            modal.classList.add('flex');
        });
    });

    // Event untuk menutup modal
    const closeBtn = document.getElementById('closeAttendanceEdit');
    if (closeBtn && !closeBtn.dataset.bound) {
        closeBtn.addEventListener('click', () => {
            const modal = document.getElementById('attendanceEditModal');
            if (modal) {
                modal.classList.add('hidden');
                modal.classList.remove('flex');
            }
        });
        closeBtn.dataset.bound = '1';
    }

    // Submit form (simpan perubahan)
    const form = document.getElementById('attendanceEditForm');
    if (form && !form.dataset.bound) {
        form.addEventListener('submit', async function(e) {
            e.preventDefault();
            if ((typeof isAdmin === 'undefined' || !isAdmin) && localStorage.getItem('isAdminLoggedIn') !== 'true') return;

            const id = document.getElementById('attendanceEditId').value;
            const status = document.getElementById('attendanceEditStatus').value;
            const note = document.getElementById('attendanceEditNote').value || '';

            if (!id) return showNotification('error', 'ID absensi tidak ditemukan.');

            try {
                showLoading();
                const updated = await updateAttendance(id, { status: status, note: note.trim() });
                console.log('updateAttendance response:', updated);
                // Jika supabase mengembalikan data kosong (maybeSingle), tetap treat sebagai sukses
                showNotification('success', 'Absensi berhasil diperbarui.');
                const modal = document.getElementById('attendanceEditModal');
                if (modal) {
                    modal.classList.add('hidden');
                    modal.classList.remove('flex');
                }
                await fetchAttendanceData({ date: formatDateForStorage(), teacher: selectedTeacher, class: selectedClass });
                await renderStudents();
            } catch (err) {
                console.error(err);
                showNotification('error', err.message || 'Gagal memperbarui absensi.');
            } finally {
                hideLoading();
            }
        });
        form.dataset.bound = '1';
    }

    // Tombol hapus di dalam modal: tampilkan konfirmasi kustom
    const modalDeleteBtn = document.getElementById('deleteAttendanceBtn');
    if (modalDeleteBtn && !modalDeleteBtn.dataset.bound) {
        modalDeleteBtn.addEventListener('click', function() {
            if ((typeof isAdmin === 'undefined' || !isAdmin) && localStorage.getItem('isAdminLoggedIn') !== 'true') return;
            const id = document.getElementById('attendanceEditId').value;
            if (!id) return showNotification('error', 'ID absensi tidak ditemukan.');

            const confirmContainer = document.getElementById('attendanceDeleteConfirm');
            const actions = document.getElementById('attendanceEditActions');
            if (confirmContainer && actions) {
                confirmContainer.classList.remove('hidden');
                actions.classList.add('hidden');
            }
        });
        modalDeleteBtn.dataset.bound = '1';
    }

    // Tombol batal pada konfirmasi hapus
    const cancelDeleteBtn = document.getElementById('cancelDeleteBtn');
    if (cancelDeleteBtn && !cancelDeleteBtn.dataset.bound) {
        cancelDeleteBtn.addEventListener('click', function() {
            const confirmContainer = document.getElementById('attendanceDeleteConfirm');
            const actions = document.getElementById('attendanceEditActions');
            if (confirmContainer && actions) {
                confirmContainer.classList.add('hidden');
                actions.classList.remove('hidden');
            }
        });
        cancelDeleteBtn.dataset.bound = '1';
    }

    // Tombol konfirmasi hapus
    const confirmDeleteBtn = document.getElementById('confirmDeleteBtn');
    if (confirmDeleteBtn && !confirmDeleteBtn.dataset.bound) {
        confirmDeleteBtn.addEventListener('click', async function() {
            if ((typeof isAdmin === 'undefined' || !isAdmin) && localStorage.getItem('isAdminLoggedIn') !== 'true') return;
            const id = document.getElementById('attendanceEditId').value;
            if (!id) return showNotification('error', 'ID absensi tidak ditemukan.');

            try {
                showLoading();
                const deleted = await deleteAttendance(id);
                console.log('deleteAttendance response:', deleted);
                showNotification('success', 'Absensi berhasil dihapus.');
                const modal = document.getElementById('attendanceEditModal');
                if (modal) {
                    modal.classList.add('hidden');
                    modal.classList.remove('flex');
                }
                // reset confirm UI
                const confirmContainer = document.getElementById('attendanceDeleteConfirm');
                const actions = document.getElementById('attendanceEditActions');
                if (confirmContainer && actions) {
                    confirmContainer.classList.add('hidden');
                    actions.classList.remove('hidden');
                }
                await fetchAttendanceData({ date: formatDateForStorage(), teacher: selectedTeacher, class: selectedClass });
                await renderStudents();
            } catch (err) {
                console.error(err);
                showNotification('error', err.message || 'Gagal menghapus absensi.');
            } finally {
                hideLoading();
            }
        });
        confirmDeleteBtn.dataset.bound = '1';
    }
}

function bindSaveButtonEvents(filteredStudents) {
    const saveButtons = document.querySelectorAll('.save-btn');
    
    saveButtons.forEach(button => {
        button.addEventListener('click', async function() {
            const studentIndex = this.getAttribute('data-student-index');
            const student = filteredStudents[studentIndex];
            const studentName = student['nama siswa'];
            const status = selectedStudentStatus[studentName];
            const cardContent = this.closest('.student-content');
            const noteInput = cardContent.querySelector('.note-input');
            const note = noteInput ? noteInput.value : '';

            if (!status) {
                showNotification('error', 'Silakan pilih status absensi terlebih dahulu (Hadir/Sakit/Izin/Alpha)');
                return;
            }

            const today = formatDateForStorage();
            const record = {
                date: today,
                teacher: selectedTeacher,
                class: student.kelas,
                student: studentName,
                status: status,
                note: note
            };

            try {
                showLoading();
                
                const savedData = await saveAttendance(record);
                const indexKey = `${today}|${selectedTeacher}|${studentName}`;
                if (typeof attendanceIndex !== 'undefined') {
                    attendanceIndex.set(indexKey, savedData);
                }

                if (window.attendanceData) {
                    window.attendanceData.push(savedData);
                }

                showNotification('success', `Berhasil menyimpan absensi ${studentName}`);

                await renderStudents();
                
            } catch (error) {
                console.error(error);
                showNotification('error', error.message || 'Gagal menyimpan absensi');
            } finally {
                hideLoading();
            }
        });
    });
}

        function showPage(pageNumber) {
            page1.classList.add('hidden');
            page2.classList.add('hidden');
            page3.classList.add('hidden');
            
            if (pageNumber === 1) {
                page1.classList.remove('hidden');
                page1.classList.add('fade-in');
                fetchTeachers();

                if (autoSubmitTimer) {
                    clearTimeout(autoSubmitTimer);
                    autoSubmitTimer = null;
                }
            } else if (pageNumber === 2) {
                page2.classList.remove('hidden');
                page2.classList.add('fade-in');
                // Ambil data absensi hanya untuk guru/kelas/tanggal yang relevan sehingga tidak mengambil seluruh tabel
                    Promise.all([fetchStudents(), fetchAttendanceData({ date: formatDateForStorage(), teacher: selectedTeacher, class: selectedClass })]).then(() => {
                        populateClassFilters();
                        renderStudents();
                    });
            
            } else if (pageNumber === 3) {
                page3.classList.remove('hidden');
                page3.classList.add('fade-in');

                if (!filterMonth.value) {
                    const today = new Date();
                    const month = String(today.getMonth() + 1).padStart(2, '0');
                    filterMonth.value = month;
                }

                if (!adminDataFetched) {
                    Promise.all([
                        fetchStudents(),
                        populateClassFilters(),
                        fetchTeachers(),
                    ]).then(() => {
                        populateYearFilter();
                        adminDataFetched = true;
                        filterAttendanceData();
                    });
                } else {
                    filterAttendanceData();
                }
            }
        }

        function openLoginModal() {
            loginModal.style.display = 'block';
            setTimeout(() => {
                loginModal.classList.add('show');
                document.getElementById('username').focus();
            }, 10);
        }

        function closeLoginModal() {
            loginModal.classList.remove('show');
            setTimeout(() => {
                loginModal.style.display = 'none';
                document.getElementById('username').value = '';
                document.getElementById('password').value = '';
            }, 300);
        }

        function openClassModal() {
            classModal.style.display = 'block';
            setTimeout(() => {
                classModal.classList.add('show');
            }, 10);
        }

        function closeClassModal() {
            classModal.classList.remove('show');
            setTimeout(() => {
                classModal.style.display = 'none';
            }, 300);
        }

        function startRefreshAnimation(button) {
            const icon = button.querySelector('.refresh-icon');
            icon.classList.add('spinning');
        }

        function stopRefreshAnimation(button) {
            const icon = button.querySelector('.refresh-icon');
            icon.classList.remove('spinning');
        }
