window.ReportPDF = (() => {
    const labels = ['MAKHORIJUL HURUF', 'TAJWID', 'TARTIL / KELANCARAN', 'GHARIB MUSYKILAT'];
    const dateLabel = (date = new Date()) => new Intl.DateTimeFormat('id-ID', { timeZone: 'Asia/Jakarta', day: 'numeric', month: 'long', year: 'numeric' }).format(date).toUpperCase();
    const logoCache = new Map();
    async function logo(url) {
        if (!url) return null;
        if (logoCache.has(url)) return logoCache.get(url);
        const promise = new Promise((resolve, reject) => {
            const image = new Image();
            image.crossOrigin = 'anonymous';
            image.onload = () => resolve(image);
            image.onerror = () => reject(Error('Logo sekolah gagal dimuat. Periksa URL dan izin akses logo.'));
            image.src = url;
        });
        logoCache.set(url, promise);
        try { return await promise; }
        catch (error) { logoCache.delete(url); throw error; }
    }
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

    function normalizeDegree(value) {
        const keepUpper = new Set(['MBA','CPA','CFA','CA','ACCA','CMA']);
        return String(value || '').trim().replace(/[A-Za-z]+/g, token => {
            const upper = token.toUpperCase();
            if (keepUpper.has(upper)) return upper;
            if (token.length === 1) return upper;
            return upper.charAt(0) + upper.slice(1).toLowerCase();
        });
    }
    function personName(value) {
        const raw = String(value || '').trim();
        if (!raw) return '-';
        const parts = raw.split(',');
        let namePart = String(parts.shift() || '').trim();
        let degreeParts = parts.map(value => String(value || '').trim()).filter(Boolean);
        // Jika data lama menulis gelar tanpa koma (contoh: BAGUS WIBOWO S. PD),
        // kenali akhiran bergelar yang mengandung titik tanpa mengubah bagian nama.
        if (!degreeParts.length) {
            const match = namePart.match(/^(.*?)(?:\s+)((?:[A-Za-z]{1,4}\.)[A-Za-z.\s]{1,20})$/);
            if (match && match[1].trim()) {
                namePart = match[1].trim();
                degreeParts = [match[2].trim()];
            }
        }
        const name = namePart.toLocaleUpperCase('id-ID');
        const degrees = degreeParts.map(normalizeDegree).filter(Boolean);
        return degrees.length ? `${name}, ${degrees.join(', ')}` : name;
    }

    // Nama siswa di narasi rapor mengikuti format dokumen sekolah: Title Case,
    // sedangkan nama pada identitas / nama guru tetap kapital.
    function naturalName(value) {
        const raw = String(value || '').trim().replace(/\s+/g, ' ');
        if (!raw) return '-';
        return raw.toLocaleLowerCase('id-ID').replace(/(^|[\s'’\-])([a-zà-ÿ])/g, (_, lead, char) => lead + char.toLocaleUpperCase('id-ID'));
    }

    function schoolHeader(value) {
        const raw = String(value || '').trim().replace(/\s+/g, ' ');
        if (!raw) return 'PROFIL SEKOLAH BELUM DIISI';
        const upper = raw.toLocaleUpperCase('id-ID');
        const expanded = upper.match(/^SEKOLAH DASAR ISLAM TERPADU\s*\(SDIT\)\s*(.*)$/i);
        if (expanded) return `SEKOLAH DASAR ISLAM TERPADU (SDIT)\n${expanded[1] || ''}`.trim();
        const short = upper.match(/^SDIT\s+(.+)$/i);
        if (short) return `SEKOLAH DASAR ISLAM TERPADU (SDIT)\n${short[1]}`;
        return upper;
    }

    function signatureSchoolName(value) {
        const raw = String(value || '').trim().replace(/\s+/g, ' ');
        if (!raw) return '';
        const match = raw.match(/^SEKOLAH DASAR ISLAM TERPADU\s*\(SDIT\)\s*(.*)$/i);
        return match ? `SDIT ${match[1] || ''}`.trim() : raw;
    }

    async function render(report, { draft = false, date = new Date(), scale = 5.35, normalWeight = '500', canvas: reusableCanvas = null, validated = false } = {}) {
        draft = draft || (!validated && !ReportCore.reportCheck(report).complete);
        ReportCore.useReference(report.reference);
        const canvas = reusableCanvas || document.createElement('canvas');
        const outputScale = Math.max(4.2, Number(scale) || 5.35);
        canvas.width = Math.round(210 * outputScale);
        canvas.height = Math.round(297 * outputScale);
        const c = canvas.getContext('2d');
        c.scale(outputScale, outputScale);
        c.imageSmoothingEnabled = true;
        // Tidak melukis latar putih: PNG ber-alpha di atas halaman PDF yang tidak diberi warna.
        // Area kosong akan mengikuti warna kertas saat dicetak, termasuk kepala tabel.
        c.strokeStyle = '#161616';
        c.lineWidth = .38;
        const box = (x, y, w, h) => { c.strokeRect(x, y, w, h); };
        const filledBox = (x, y, w, h, color) => { c.save(); c.fillStyle = color; c.fillRect(x, y, w, h); c.restore(); c.strokeRect(x, y, w, h); };
        // Label/judul tetap kapital. Nama orang dibuat kapital, sedangkan gelar akademik dipertahankan dalam bentuk normal seperti S. Pd / M. Pd.
        const text = (value, x, y, w, h, { size = 2.88, bold = false, align = 'left', min = 2.45, preserveCase = false } = {}) => {
            const display = preserveCase ? String(value ?? '-') : String(value ?? '-').toLocaleUpperCase('id-ID');
            for (let font = size;; font -= .1) {
                c.font = `${bold ? '700' : normalWeight} ${font}px Arial, Helvetica, sans-serif`;
                const lines = wrap(c, display, w - 2.8), lineHeight = font * 1.24, total = lines.length * lineHeight;
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
        const logoUrl = school.logo_url && String(school.logo_url).includes('FjF61ou.png') ? 'assets/school-logo.png' : school.logo_url;
        const image = await logo(logoUrl);
        if (image) {
            const size = 25, x = 12, y = 9, ratio = Math.min(size / image.width, size / image.height);
            const dw = image.width * ratio, dh = image.height * ratio;
            c.save();
            c.beginPath();
            c.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
            c.clip();
            c.clearRect(x, y, size, size);
            c.drawImage(image, x + (size - dw) / 2, y + (size - dh) / 2, dw, dh);
            c.restore();
        }
        text('LAPORAN PENILAIAN HASIL BELAJAR TAHSIN & TAHFIDZ', 39, 8.5, 158, 8, { size: 3.85, bold: true, align: 'center' });
        text((ReportCore.periods[report.period] || '') + ' - TAHUN AJARAN ' + report.year + ' / ' + (report.year + 1), 39, 17, 158, 7, { size: 3.35, bold: true, align: 'center' });
        text(schoolHeader(school.name), 39, 24.5, 158, 15, { size: 4.15, bold: true, align: 'center', min: 3.7 });
        c.save();
        c.lineWidth = .54;
        c.beginPath();
        c.moveTo(10, 42);
        c.lineTo(200, 42);
        c.stroke();
        c.restore();

        const identity = (label, value, x, y, w, labelW) => {
            text(label, x, y, labelW, 7, { bold: true, size: 2.55 });
            text(':', x + labelW, y, 4, 7, { bold: true, size: 2.55, align: 'center' });
            text(value || '-', x + labelW + 4, y, w - labelW - 4, 7, { bold: true, size: 2.55, preserveCase: true });
        };
        identity('NAMA', personName(student.name), 12, 45, 104, 14);
        identity('NISN', String(student.nisn || '-').toLocaleUpperCase('id-ID'), 119, 45, 79, 14);
        identity('NIS', String(student.nis || '-').toLocaleUpperCase('id-ID'), 12, 54, 104, 14);
        identity('KELAS', String(window.PeriodicAssessments?.classLabel(student.class) || student.class || '-').toLocaleUpperCase('id-ID'), 119, 54, 79, 14);
        function subjectTable(sub, y) {
            const row = report[sub], scores = row?.scores || {}, sum = ReportCore.stats(scores, sub), target = report.settings?.[sub + '_target'];
            const fields = sub === 'tahsin' ? ['tahsin_makhraj', 'tahsin_tajwid', 'tahsin_tartil', 'tahsin_gharib'] : ['tahfidz_makhraj', 'tahfidz_tajwid', 'tahfidz_hafalan'];
            const rows = fields.length;
            const h = 6;
            const programColor = sub === 'tahsin' ? '#FFF6D9' : '#FDEDE4';
            const summaryColor = '#ECEBEC';
            filledBox(10, y, 29, 6, programColor);
            text('PROGRAM', 10, y, 29, 6, { bold: true, align: 'center' });
            filledBox(39, y, 161, 6, programColor);
            text('TARGET PEMBELAJARAN ' + sub.toUpperCase(), 39, y, 161, 6, { bold: true, align: 'center' });
            box(10, y + 6, 29, 12 + rows * h);
            text(sub.toUpperCase(), 10, y + 16, 29, 10, { bold: true, align: 'center' });
            box(39, y + 6, 161, 6);
            text(target ? ReportCore.progress(target, sub) : 'Target belum diatur', 39, y + 6, 161, 6, { align: 'center' });
            const xs = [39, 78, 90, 136], ws = [39, 12, 46, 64];
            ['ASPEK', 'NILAI', 'KETERANGAN', 'PENCAPAIAN ' + sub.toUpperCase()].forEach((label, i) => { box(xs[i], y + 12, ws[i], 6); text(label, xs[i], y + 12, ws[i], 6, { bold: true, align: 'center', size: 2.68 }); });
            fields.forEach((field, i) => { [0, 1, 2].forEach(col => box(xs[col], y + 18 + i * h, ws[col], h)); const active = ReportCore.applicable(scores, sub).keys.includes(field), value = active && !(sub === 'tahfidz' && field === 'tahfidz_hafalan' && ![true, 'true'].includes(scores.tahfidz_aspect_confirmed)) ? scores[field] : null; text(labels[i], 39, y + 18 + i * h, 39, h, { size: 2.55 }); text(ReportCore.blank(value) ? '-' : value, 78, y + 18 + i * h, 12, h, { align: 'center' }); text(ReportCore.aspect(value), 90, y + 18 + i * h, 46, h, { align: 'center', size: 2.55 }); });
            box(136, y + 18, 64, rows * h);
            text(ReportCore.progress(scores, sub), 138, y + 20, 60, rows * h - 3, { align: 'center', size: 3.0 });
            const bottom = y + 18 + rows * h;
            filledBox(10, bottom, 190, 7, summaryColor);
            text('JUMLAH : ' + (sum.sum ?? '-'), 39, bottom, 45, 7, { bold: true });
            text('RATA-RATA : ' + (sum.average == null ? '-' : sum.average.toFixed(1).replace('.', ',')), 84, bottom, 60, 7, { bold: true });
            text('GRADE NILAI : ' + sum.grade, 144, bottom, 56, 7, { bold: true });
            const actualTeacher = report.teachers?.[sub] || row?.teacher_name || '-';
            filledBox(10, bottom + 9, 190, 9, summaryColor);
            text('NILAI KKM : ' + (report.settings?.[sub + '_kkm'] ?? '-'), 11, bottom + 10, 24, 7, { size: 2.55, bold: true });
            text('PREDIKAT : ' + sum.predicate, 36, bottom + 10, 76, 7, { size: 2.55, bold: true });
            text('GURU PEMBIMBING : ' + personName(actualTeacher), 112, bottom + 10, 87, 7, { size: 2.55, preserveCase: true, bold: true });
            text('CAPAIAN KOMPETENSI :', 10, bottom + 19, 100, 5, { bold: true, size: 2.65 });
            box(10, bottom + 24, 190, 17);
            text(ReportCore.description(naturalName(student.name), scores, sub), 12, bottom + 25, 186, 15, { size: 2.8, min: 2.45, preserveCase: true });
            return bottom + 43;
        }
        const next = subjectTable('tahsin', 64.5);
        const end = subjectTable('tahfidz', next + 1);
        text('CATATAN GURU MENGENAI SISWA', 10, end, 190, 5, { bold: true, size: 2.65 });
        box(10, end + 5, 190, 22);
        const complete = ReportCore.reportCheck(report).complete;
        const auto = complete ? ReportCore.note(naturalName(student.name), report.period) : 'Rapor belum lengkap. ' + (report.issues || []).join('; ');
        text(auto, 12, end + 6, 186, 20, { size: 2.65, min: 2.35, preserveCase: true });
        text((officials.city || 'Tempat belum diisi').toUpperCase() + ', ' + dateLabel(date), 110, 257, 90, 6, { bold: true, align: 'right', size: 2.6 });
        const signer = (x, title, name, niy) => { text(title, x, 264, 60, 13, { align: 'center', size: 2.6, bold: true }); c.beginPath(); c.moveTo(x + 6, 287); c.lineTo(x + 54, 287); c.stroke(); text(name ? personName(name) : '', x, 280, 60, 7, { align: 'center', bold: true, size: 2.6, preserveCase: true }); if (niy)
            text('NIY. ' + niy, x, 288, 60, 5, { align: 'center', size: 2.45, bold: true }); };
        signer(10, 'ORANG TUA / WALI\nSISWA', '', '');
        signer(75, 'KEPALA SEKOLAH\n' + signatureSchoolName(school.name), [officials.principal_name, officials.principal_degree].filter(Boolean).join(', '), officials.principal_niy);
        signer(140, "KOORDINATOR STUDI\nAL-QUR'AN", [officials.coordinator_name, officials.coordinator_degree].filter(Boolean).join(', '), officials.coordinator_niy);
        if (draft) {
            c.save();
            c.translate(105, 148);
            c.rotate(-Math.PI / 5);
            c.font = '600 24px Arial, Helvetica, sans-serif';
            c.fillStyle = 'rgba(130,30,30,.17)';
            c.textAlign = 'center';
            c.fillText('DRAF', 0, 0);
            c.restore();
        }
        return canvas;
    }
    function sorted(rows) { const ids = new Set(); return [...rows].map(row => { if (ids.has(row.student.id))
        throw Error('Siswa ganda dalam daftar cetak'); ids.add(row.student.id); return row; }).sort((a, b) => a.student.class.localeCompare(b.student.class, 'id', { numeric: true }) || a.student.name.localeCompare(b.student.name, 'id') || String(a.student.id).localeCompare(String(b.student.id))); }
    async function build(rows, { draft = false, onProgress = () => { } } = {}) {
        if (!rows.length) throw Error('Tidak ada siswa');
        const list = sorted(rows);
        // Validasi satu kali sebelum render. Sebelumnya pemeriksaan yang sama dilakukan lagi di setiap halaman.
        if (!draft && list.some(row => !ReportCore.reportCheck(row).complete))
            throw Error('Seluruh nilai wajib dan pengaturan rapor harus lengkap');
        const pdf = new window.jspdf.jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });
        const date = new Date();
        // Satu canvas dipakai ulang untuk seluruh halaman. Ukuran, skala, PNG, dan koordinat tetap sama,
        // sehingga hasil visual tidak berubah tetapi pembuatan ratusan elemen canvas dapat dihindari.
        const workCanvas = document.createElement('canvas');
        for (let i = 0; i < list.length; i++) {
            if (i) pdf.addPage('a4', 'portrait');
            const canvas = await render(list[i], { draft, date, scale: 300 / 25.4, normalWeight: '500', canvas: workCanvas, validated: !draft });
            // PNG mempertahankan alpha; halaman PDF tidak pernah digambar putih.
            pdf.addImage(canvas.toDataURL('image/png'), 'PNG', 0, 0, 210, 297);
            onProgress(i + 1, list.length, list[i]);
            // Beri kesempatan UI menggambar progress berkala, bukan setiap halaman.
            if ((i + 1) % 4 === 0 || i === list.length - 1)
                await new Promise(resolve => setTimeout(resolve, 0));
        }
        if (pdf.getNumberOfPages() !== list.length) throw Error('Jumlah halaman tidak sesuai');
        return pdf;
    }
    return { render, build, sorted, dateLabel, personName, normalizeDegree, naturalName, schoolHeader, signatureSchoolName };
})();
