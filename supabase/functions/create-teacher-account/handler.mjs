
export function createHandler(admin) {
    const cors = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers':
            'authorization, x-client-info, apikey, content-type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS'
    };

    const reply = (status, body) =>
        new Response(JSON.stringify(body), {
            status,
            headers: {
                ...cors,
                'Content-Type': 'application/json',
                'Cache-Control': 'no-store'
            }
        });

    function slugify(value) {
        return String(value || '')
            .normalize('NFKD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLowerCase()
            .trim()
            .replace(/[^a-z0-9]+/g, '.')
            .replace(/^\.+|\.+$/g, '');
    }

    function isDuplicateEmail(error) {
        const code = String(error?.code || '');
        const message = String(error?.message || '');

        return code === 'email_exists' ||
            /already registered|already exists|duplicate|email_exists/i
                .test(message);
    }

    return async request => {
        if (request.method === 'OPTIONS') {
            return new Response(null, {
                status: 204,
                headers: cors
            });
        }

        if (request.method !== 'POST') {
            return reply(405, {
                error: 'Metode tidak didukung.'
            });
        }

        try {
            const token = request.headers
                .get('Authorization')
                ?.match(/^Bearer (.+)$/i)?.[1];

            if (!token) {
                return reply(401, {
                    error: 'Login diperlukan.'
                });
            }

            const {
                data: auth,
                error: authError
            } = await admin.auth.getUser(token);

            if (authError || !auth.user) {
                return reply(401, {
                    error: 'Sesi tidak valid. Masuk kembali.'
                });
            }

            const {
                data: role,
                error: roleError
            } = await admin
                .from('user_roles')
                .select('role')
                .eq('user_id', auth.user.id)
                .maybeSingle();

            if (
                roleError ||
                !['admin', 'koordinator'].includes(role?.role)
            ) {
                return reply(403, {
                    error: 'Hanya admin/koordinator dapat membuat akun guru.'
                });
            }

            const input = await request.json();

            const teacherId = input.teacher_id
                ? String(input.teacher_id).trim()
                : null;
            const manualEmail = input.manual_email === true;
            const requestedEmail = typeof input.email === 'string' ? input.email.trim().toLowerCase() : '';

            if (teacherId && teacherId.length > 80) {
                return reply(400, {
                    error: 'ID guru tidak valid.'
                });
            }
            if (manualEmail && !teacherId) {
                return reply(400, { error: 'Pilih data guru yang akan ditautkan.' });
            }
            const emailParts = requestedEmail.split('@');
            if (manualEmail && (emailParts.length !== 2 || !emailParts[0] || !emailParts[1] || emailParts[1].indexOf('.') < 1 || emailParts[1].endsWith('.') || requestedEmail.length > 254 || requestedEmail.split('').some(char => char.trim() === ''))) {
                return reply(400, { error: 'Masukkan alamat email yang valid (maksimal 254 karakter).' });
            }

            let name = String(input.name || '').trim();
            let fullName = String(input.full_name || '').trim();
            let attendanceEnabled =
                input.attendance_enabled !== false;

            if (teacherId) {
                const {
                    data: teacher,
                    error: teacherError
                } = await admin
                    .from('teachers')
                    .select(
                        'nama,nama_lengkap,attendance_enabled'
                    )
                    .eq('id', teacherId)
                    .maybeSingle();

                if (teacherError || !teacher) {
                    return reply(400, {
                        error: 'Data guru tidak ditemukan.'
                    });
                }

                name = teacher.nama;
                fullName =
                    teacher.nama_lengkap || teacher.nama;
                attendanceEnabled =
                    teacher.attendance_enabled !== false;
            }

            if (
                !name ||
                name.length > 80 ||
                !fullName ||
                fullName.length > 160
            ) {
                return reply(400, {
                    error: 'Nama guru dan nama lengkap wajib diisi.'
                });
            }

            const local = slugify(name);

            if (!local || local.length > 60) {
                return reply(400, {
                    error: 'Nama guru tidak valid untuk email akun.'
                });
            }

            const emailCandidates = manualEmail ? [requestedEmail] : [
                `${local}@harum.com`,
                `${local}@harum.co.id`,
                ...Array.from(
                    { length: 18 },
                    (_, index) =>
                        `${local}.${index + 2}@harum.co.id`
                )
            ];

            const initialPassword = '123456';

            let createdUser = null;
            let actualEmail = '';
            let lastError = null;

            for (const email of emailCandidates) {
                const {
                    data,
                    error
                } = await admin.auth.admin.createUser({
                    email,
                    password: initialPassword,
                    email_confirm: true,
                    user_metadata: {
                        full_name: fullName,
                        temporary_password: true
                    }
                });

                if (!error && data?.user) {
                    createdUser = data.user;
                    actualEmail = email;
                    break;
                }

                lastError = error;

                if (manualEmail && isDuplicateEmail(error)) {
                    return reply(409, { error: 'Email tersebut sudah terdaftar. Gunakan “Atur akses” jika akun yang sama ingin ditautkan.' });
                }

                if (!isDuplicateEmail(error)) {
                    return reply(400, {
                        error:
                            'Akun tidak dapat dibuat: ' +
                            (error?.message || 'Kesalahan Authentication.')
                    });
                }
            }

            if (!createdUser) {
                return reply(409, {
                    error:
                        'Email akun tidak tersedia. ' +
                        (lastError?.message || '')
                });
            }

            let provision;

            try {
                provision = await admin.rpc(
                    'provision_teacher_account',
                    {
                        actor_id: auth.user.id,
                        account_id: createdUser.id,
                        linked_teacher: teacherId,
                        teacher_label: teacherId ? null : name,
                        full_label: teacherId ? null : fullName,
                        show_attendance: attendanceEnabled
                    }
                );
            } catch (_) {
                provision = {
                    error: {
                        message: 'Konfirmasi penyimpanan terputus.'
                    }
                };
            }

            if (provision.error) {
                const {
                    data: mapped,
                    error: checkError
                } = await admin
                    .from('user_roles')
                    .select('teacher_id')
                    .eq('user_id', createdUser.id)
                    .maybeSingle();

                if (mapped) {
                    return reply(200, {
                        ok: true,
                        email: actualEmail
                    });
                }

                if (checkError) {
                    return reply(503, {
                        error:
                            'Status pembuatan akun belum dapat dipastikan. ' +
                            'Periksa Authentication dan Akses Akun.'
                    });
                }

                const { error: cleanupError } =
                    await admin.auth.admin.deleteUser(
                        createdUser.id
                    );

                if (cleanupError) {
                    return reply(503, {
                        error:
                            'Akun Authentication berhasil dibuat, ' +
                            'tetapi pemetaan guru gagal. ' +
                            'Periksa akun secara manual.'
                    });
                }

                return reply(400, {
                    error:
                        provision.error.message ||
                        'Pemetaan guru gagal; akun dibatalkan.'
                });
            }

            return reply(200, {
                ok: true,
                email: actualEmail
            });

        } catch (error) {
            console.error(
                'create-teacher-account:',
                error
            );

            return reply(500, {
                error:
                    'Permintaan belum dapat diselesaikan. ' +
                    'Periksa status akun sebelum mencoba kembali.'
            });
        }
    };
}
