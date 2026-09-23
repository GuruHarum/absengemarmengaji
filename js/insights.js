// Match by teacher + class + student, never by student name alone.
function buildAttendanceInsights(students, records, from, to) {
    const text = value => String(value || '').trim();
    const key = (teacher, kelas, name) => JSON.stringify([text(teacher), text(kelas), text(name)]);
    const roster = new Map(students.map(row => [key(row['nama guru'], row.kelas, row['nama siswa']), row]));
    const classes = new Map();
    const normalized = { h: 'hadir', hadir: 'hadir', s: 'sakit', sakit: 'sakit', i: 'izin', izin: 'izin', a: 'alpha', alfa: 'alpha', alpha: 'alpha', '-': 'alpha' };
    for (const row of roster.values()) {
        if (!classes.has(row.kelas)) classes.set(row.kelas, { name: row.kelas, students: 0, dates: new Set(), hadir: 0, sakit: 0, izin: 0, alpha: 0, unknown: 0, recorded: 0, missing: 0 });
        classes.get(row.kelas).students++;
    }
    const unique = new Map();
    for (const row of [...records].sort((a, b) => String(a.id || '').localeCompare(String(b.id || ''), undefined, { numeric: true }))) {
        const date = text(row.date).slice(0, 10);
        const identity = key(row.teacher, row.class, row.student);
        if (date < from || date > to || !roster.has(identity)) continue;
        unique.set(JSON.stringify([date, identity]), { ...row, date });
    }
    const totals = { hadir: 0, sakit: 0, izin: 0, alpha: 0, unknown: 0, recorded: 0, missing: 0 };
    for (const row of unique.values()) {
        const group = classes.get(roster.get(key(row.teacher, row.class, row.student)).kelas);
        const status = normalized[text(row.status).toLowerCase()] || 'unknown';
        group[status]++; totals[status]++; group.recorded++; totals.recorded++; group.dates.add(row.date);
    }
    const rows = [...classes.values()].map(group => {
        group.missing = Math.max(0, group.students * group.dates.size - group.recorded);
        totals.missing += group.missing;
        return { ...group, days: group.dates.size, rate: group.recorded ? group.hadir / group.recorded * 100 : null };
    }).sort((a, b) => (b.rate ?? -1) - (a.rate ?? -1) || String(a.name).localeCompare(String(b.name), 'id'));
    return { totals, rows, students: roster.size, rate: totals.recorded ? totals.hadir / totals.recorded * 100 : null };
}
