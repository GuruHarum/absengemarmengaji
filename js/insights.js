function buildAttendanceInsights(students, records, from, to, months = null, today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' })) {
    const text = value => String(value ?? '').trim();
    const norm = value => text(value).normalize('NFKC').replace(/\\s+/g, ' ').toLocaleLowerCase('id');
    const legacyKey = (teacher, kelas, name) => JSON.stringify([teacher, kelas, name].map(norm));

    // ID siswa menjadi kunci utama. Pencocokan teks hanya dipakai untuk
    // catatan lama yang memang belum memiliki student_id.
    const rosterById = new Map();
    const rosterByLegacyKey = new Map();
    for (const student of students || []) {
        if (student.id != null && student.id !== '')
            rosterById.set(String(student.id), student);
        rosterByLegacyKey.set(legacyKey(student['nama guru'], student.kelas, student['nama siswa']), student);
    }

    const dates = new Set();
    for (let day = new Date(from + 'T00:00:00Z'); Number.isFinite(day.getTime()) && day.toISOString().slice(0, 10) <= to; day.setUTCDate(day.getUTCDate() + 1)) {
        const date = day.toISOString().slice(0, 10);
        if (date <= today && (!months || months.includes(date.slice(5, 7))))
            dates.add(date);
    }

    const empty = () => ({ hadir: 0, sakit: 0, izin: 0, alpha: 0, recorded: 0, missing: 0, total: 0 });
    const classes = new Map();
    for (const student of rosterById.size ? rosterById.values() : rosterByLegacyKey.values()) {
        if (!classes.has(student.kelas))
            classes.set(student.kelas, { name: student.kelas, students: 0, ...empty() });
        classes.get(student.kelas).students++;
    }

    const unique = new Map();
    for (const row of [...(records || [])].sort((a, b) => String(a.id || '').localeCompare(String(b.id || ''), undefined, { numeric: true }))) {
        const date = text(row.date).slice(0, 10);
        if (!dates.has(date))
            continue;

        let student = null;
        if (row.student_id != null && row.student_id !== '') {
            student = rosterById.get(String(row.student_id)) || null;
        } else {
            student = rosterByLegacyKey.get(legacyKey(row.teacher, row.class, row.student)) || null;
        }
        if (!student)
            continue;

        const identity = student.id != null ? String(student.id) : legacyKey(row.teacher, row.class, row.student);
        // Satu siswa hanya dihitung sekali per hari, termasuk jika label/pengampu berubah.
        unique.set(JSON.stringify([date, identity]), { row, student });
    }

    const statuses = { h: 'hadir', hadir: 'hadir', s: 'sakit', sakit: 'sakit', i: 'izin', izin: 'izin', a: 'alpha', alfa: 'alpha', alpha: 'alpha', '-': 'alpha' };
    for (const { row, student } of unique.values()) {
        const group = classes.get(student.kelas);
        if (!group)
            continue;
        const status = statuses[text(row.status).toLowerCase()];
        if (status) {
            group[status]++;
            group.recorded++;
        }
    }

    const totals = empty();
    const rows = [...classes.values()].map(group => {
        group.total = group.students * dates.size;
        group.missing = group.total - group.recorded;
        group.alpha += group.missing;
        Object.keys(totals).forEach(field => totals[field] += group[field]);
        return { ...group, days: dates.size, rate: group.total ? group.hadir / group.total * 100 : null };
    }).sort((a, b) => (b.rate ?? -1) - (a.rate ?? -1) || String(a.name).localeCompare(String(b.name), 'id'));
    return { totals, rows, students: rosterById.size || rosterByLegacyKey.size, days: dates.size, rate: totals.total ? totals.hadir / totals.total * 100 : null };
}
