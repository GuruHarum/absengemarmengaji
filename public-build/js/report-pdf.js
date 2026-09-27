window.ReportPDF = (() => {
    const labels = ['MAKHORIJUL HURUF', 'TAJWID', 'TARTIL / KELANCARAN', 'GHARIB MUSYKILAT'];
    const dateLabel = (date = new Date()) => new Intl.DateTimeFormat('id-ID', { timeZone: 'Asia/Jakarta', day: 'numeric', month: 'long', year: 'numeric' }).format(date).toUpperCase();
    async function logo(url) { if (!url)
        return null; const image = new Image(); image.crossOrigin = 'anonymous'; await new Promise((resolve, reject) => { image.onload = resolve; image.onerror = () => reject(Error('Logo sekolah gagal dimuat. Periksa URL dan izin akses logo.')); image.src = url; }); return image; }
    function wrap(ctx, text, width) { const lines = []; for (const paragraph of String(text ?? '-').split('\n')) {
        let line = '';
        for (const word of paragraph.split(/\s+/)) {
            if (ctx.measureText(word).width > width) {
                if (line) {
                    lines.push(line);
                    line = '';
                }
                let chunk = '';
                for (const char of word) {
                    if (ctx.measureText(chunk + char).width > width) {
                        lines.push(chunk);
                        chunk = '';
                    }
                    chunk += char;
                }
                line = chunk;
                continue;
            }
            const next = line ? line + ' ' + word : word;
            if (ctx.measureText(next).width > width && line) {
                lines.push(line);
                line = word;
            }
            else
                line = next;
        }
        lines.push(line);
    } return lines; }
    async function render(report, { draft = false, date = new Date() } = {}) {
        draft = draft || !ReportCore.reportCheck(report).complete;
        ReportCore.useReference(report.reference);
        const canvas = document.createElement('canvas'), scale = 6;
        canvas.width = 210 * scale;
        canvas.height = 297 * scale;
        const c = canvas.getContext('2d');
        c.scale(scale, scale);
        c.fillStyle = '#fff';
        c.fillRect(0, 0, 210, 297);
        c.strokeStyle = '#222';
        c.lineWidth = .25;
        const box = (x, y, w, h, fill) => { if (fill) {
            c.fillStyle = fill;
            c.fillRect(x, y, w, h);
        } c.strokeRect(x, y, w, h); };
        const text = (value, x, y, w, h, { size = 2.7, bold = false, align = 'left', min = 2.35 } = {}) => {
            for (let font = size;; font -= .1) {
                c.font = `${bold ? 'bold ' : ''}${font}px Arial, sans-serif`;
                const lines = wrap(c, String(value ?? '-'), w - 2.8), lineHeight = font * 1.24, total = lines.length * lineHeight;
                if (total <= h - (h <= 7 ? 1.2 : 2.2)) {
                    c.fillStyle = '#111';
                    c.textBaseline = 'top';
                    c.textAlign = align;
                    const firstY = y + (h - total) / 2;
                    lines.forEach((line, i) => c.fillText(line, align === 'center' ? x + w / 2 : align === 'right' ? x + w - 1.4 : x + 1.4, firstY + i * lineHeight));
                    break;
                }
                if (font <= min)
                    throw Error('Teks terlalu panjang untuk satu halaman: ' + String(value).slice(0, 60) + '. Ringkas catatan atau nama pada pengaturan.');
            }
        };
        const school = report.school || {}, student = report.student, officials = report.officials || {};
        const image = await logo(school.logo_url);
        if (image) {
            const ratio = Math.min(22 / image.width, 22 / image.height);
            c.drawImage(image, 11 + (22 - image.width * ratio) / 2, 11, image.width * ratio, image.height * ratio);
        }
        text('LAPORAN PENILAIAN HASIL BELAJAR TAHSIN & TAHFIDZ', 36, 10, 164, 8, { size: 3.5, bold: true, align: 'center' });
        text((ReportCore.periods[report.period] || '') + ' - TAHUN AJARAN ' + report.year + ' / ' + (report.year + 1), 36, 19, 164, 7, { size: 3.2, bold: true, align: 'center' });
        text(school.name || 'Profil sekolah belum diisi', 36, 27, 164, 12, { size: 4.2, bold: true, align: 'center' });
        c.beginPath();
        c.moveTo(10, 41);
        c.lineTo(200, 41);
        c.stroke();
        text('NAMA : ' + student.name, 12, 44, 114, 10, { bold: true });
        text('NISN : ' + (student.nisn || '-'), 131, 44, 67, 7);
        text('NIS : ' + (student.nis || '-'), 12, 54, 114, 7);
        text('KELAS : ' + (window.PeriodicAssessments?.classLabel(student.class) || student.class), 131, 53, 67, 9);
        function subjectTable(sub, y) {
            const row = report[sub], scores = row?.scores || {}, sum = ReportCore.stats(scores, sub), target = report.settings?.[sub + '_target'];
            const fields = sub === 'tahsin' ? ['tahsin_makhraj', 'tahsin_tajwid', 'tahsin_tartil', 'tahsin_gharib'] : ['tahfidz_makhraj', 'tahfidz_tajwid', 'tahfidz_hafalan'];
            const rows = fields.length;
            const h = 6;
            box(10, y, 29, 6, '#eee6cb');
            text('PROGRAM', 10, y, 29, 6, { bold: true, align: 'center' });
            box(39, y, 161, 6, '#eee6cb');
            text('TARGET PEMBELAJARAN ' + sub.toUpperCase(), 39, y, 161, 6, { bold: true, align: 'center' });
            box(10, y + 6, 29, 12 + rows * h);
            text(sub.toUpperCase(), 10, y + 16, 29, 10, { bold: true, align: 'center' });
            box(39, y + 6, 161, 6);
            text(target ? ReportCore.progress(target, sub) : 'Target belum diatur', 39, y + 6, 161, 6, { align: 'center' });
            const xs = [39, 78, 90, 136], ws = [39, 12, 46, 64];
            ['ASPEK', 'NILAI', 'KETERANGAN', 'PENCAPAIAN ' + sub.toUpperCase()].forEach((label, i) => { box(xs[i], y + 12, ws[i], 6); text(label, xs[i], y + 12, ws[i], 6, { bold: true, align: 'center', size: 2.55 }); });
            fields.forEach((field, i) => { [0, 1, 2].forEach(col => box(xs[col], y + 18 + i * h, ws[col], h)); const active = ReportCore.applicable(scores, sub).keys.includes(field), value = active && !(sub === 'tahfidz' && field === 'tahfidz_hafalan' && ![true, 'true'].includes(scores.tahfidz_aspect_confirmed)) ? scores[field] : null; text(labels[i], 39, y + 18 + i * h, 39, h, { size: 2.4 }); text(ReportCore.blank(value) ? '-' : value, 78, y + 18 + i * h, 12, h, { align: 'center' }); text(ReportCore.aspect(value), 90, y + 18 + i * h, 46, h, { align: 'center', size: 2.45 }); });
            box(136, y + 18, 64, rows * h);
            text(ReportCore.progress(scores, sub), 138, y + 20, 60, rows * h - 3, { align: 'center', size: 2.9 });
            const bottom = y + 18 + rows * h;
            box(10, bottom, 190, 7);
            text('JUMLAH : ' + (sum.sum ?? '-'), 39, bottom, 45, 7, { bold: true });
            text('RATA-RATA : ' + (sum.average == null ? '-' : sum.average.toFixed(1).replace('.', ',')), 84, bottom, 60, 7, { bold: true });
            text('GRADE NILAI : ' + sum.grade, 144, bottom, 56, 7, { bold: true });
            const actualTeacher = report.teachers?.[sub] || row?.teacher_name || '-';
            box(10, bottom + 9, 190, 9);
            text('KKM : ' + (report.settings?.[sub + '_kkm'] ?? '-'), 11, bottom + 10, 24, 7, { size: 2.4 });
            text('PREDIKAT : ' + sum.predicate, 36, bottom + 10, 76, 7, { size: 2.4 });
            text('GURU PEMBIMBING : ' + actualTeacher, 112, bottom + 10, 87, 7, { size: 2.4 });
            text('CAPAIAN KOMPETENSI', 10, bottom + 19, 100, 5, { bold: true, size: 2.5 });
            box(10, bottom + 24, 190, 17);
            text(ReportCore.description(student.name, scores, sub), 12, bottom + 25, 186, 15, { size: 2.65 });
            return bottom + 43;
        }
        const next = subjectTable('tahsin', 64);
        const end = subjectTable('tahfidz', next + 1);
        text('CATATAN GURU MENGENAI SISWA', 10, end, 190, 5, { bold: true, size: 2.5 });
        box(10, end + 5, 190, 22);
        const complete = ReportCore.reportCheck(report).complete;
        const auto = complete ? ReportCore.note(student.name, report.period) : 'Rapor belum lengkap. ' + (report.issues || []).join('; ');
        text(auto, 12, end + 6, 186, 20, { size: 2.5, min: 2.35 });
        text((officials.city || 'Tempat belum diisi').toUpperCase() + ', ' + dateLabel(date), 110, 257, 90, 6, { bold: true, align: 'right', size: 2.5 });
        const signer = (x, title, name, niy) => { text(title, x, 264, 60, 13, { align: 'center', size: 2.5 }); c.beginPath(); c.moveTo(x + 6, 287); c.lineTo(x + 54, 287); c.stroke(); text(name || '', x, 280, 60, 7, { align: 'center', bold: true, size: 2.5 }); if (niy)
            text('NIY. ' + niy, x, 288, 60, 5, { align: 'center', size: 2.4 }); };
        signer(10, 'ORANG TUA / WALI SISWA', '', '');
        signer(75, 'KEPALA SEKOLAH\n' + (school.name || ''), [officials.principal_name, officials.principal_degree].filter(Boolean).join(', '), officials.principal_niy);
        signer(140, "KOORDINATOR STUDI AL-QUR'AN", [officials.coordinator_name, officials.coordinator_degree].filter(Boolean).join(', '), officials.coordinator_niy);
        if (draft) {
            c.save();
            c.translate(105, 148);
            c.rotate(-Math.PI / 5);
            c.font = 'bold 24px Arial';
            c.fillStyle = 'rgba(130,30,30,.17)';
            c.textAlign = 'center';
            c.fillText('DRAF', 0, 0);
            c.restore();
        }
        return canvas;
    }
    function sorted(rows) { const ids = new Set(); return [...rows].map(row => { if (ids.has(row.student.id))
        throw Error('Siswa ganda dalam daftar cetak'); ids.add(row.student.id); return row; }).sort((a, b) => a.student.class.localeCompare(b.student.class, 'id', { numeric: true }) || a.student.name.localeCompare(b.student.name, 'id') || String(a.student.id).localeCompare(String(b.student.id))); }
    async function build(rows, { draft = false, onProgress = () => { } } = {}) { if (!rows.length)
        throw Error('Tidak ada siswa'); const list = sorted(rows); if (!draft && list.some(row => !ReportCore.reportCheck(row).complete))
        throw Error('Seluruh nilai wajib dan pengaturan rapor harus lengkap'); const pdf = new window.jspdf.jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true }); const date = new Date(); for (let i = 0; i < list.length; i++) {
        if (i)
            pdf.addPage('a4', 'portrait');
        const canvas = await render(list[i], { draft, date });
        pdf.addImage(canvas.toDataURL('image/png'), 'PNG', 0, 0, 210, 297);
        onProgress(i + 1, list.length);
        await new Promise(resolve => setTimeout(resolve, 0));
    } if (pdf.getNumberOfPages() !== list.length)
        throw Error('Jumlah halaman tidak sesuai'); return pdf; }
    return { render, build, sorted, dateLabel };
})();
