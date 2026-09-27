window.CurriculumTargets = (() => {
  const periods = ['pts_ganjil', 'pas_ganjil', 'pts_genap', 'pas_genap'];
  const modes = Object.freeze([
    ['BUKU', 'Buku dan rentang halaman'],
    ['ALQ_GHARIB', "Al-Qur'an dan Gharib"],
    ['GHARIB', 'Gharib dan target juz'],
    ['TAJWID', 'Tajwid dan target juz'],
    ['IMTAS', 'IMTAS / Syahadah'],
    ['TAKHASSUS', 'Kelas Takhossus / Tahfidz']
  ]);
  const index = n => QURAN_SURAHS.find(s => s.number === Number(n));
  const requiredInt = (v, label, min, max) => {
    if (!/^\d+$/.test(String(v ?? '')) || Number(v) < min || Number(v) > max)
      throw Error(`${label} harus ${min}–${max}.`);
    return Number(v);
  };
  const safeName = n => window.ReportCore?.surahName?.(n) || index(n)?.name || `Surat ${n}`;
  const pts = [1, 15, 16, 30, 31, 44, 45, 60];
  const presetTahsin = (grade, period) => {
    const p = periods.indexOf(period);
    if (p < 0 || !Number.isInteger(Number(grade)) || Number(grade) < 1 || Number(grade) > 6) return null;
    if (grade <= 3) return { curriculum_mode: 'BUKU', tahsin_progress_type: 'BUKU', tahsin_book_number: grade, target_page_start: pts[p * 2], target_page_end: pts[p * 2 + 1], tahsin_page: pts[p * 2 + 1] };
    if (grade === 4) return [
      { curriculum_mode: 'ALQ_GHARIB', target_juz_start: 1, target_juz_end: 6, gharib_page_start: 1, gharib_page_end: 15 },
      { curriculum_mode: 'ALQ_GHARIB', target_juz_start: 7, target_juz_end: 12, gharib_page_start: 16, gharib_page_end: 30 },
      { curriculum_mode: 'GHARIB', target_juz_start: 13, target_juz_end: 18, gharib_page_start: 31, gharib_page_end: 44 },
      { curriculum_mode: 'TAJWID', target_juz_start: 19, target_juz_end: 30, target_tajwid: 'Tajwid' }
    ][p];
    if (grade === 5) return [
      { curriculum_mode: 'IMTAS', imtas_month: 'NOVEMBER', target_outcome: 'SYAHADAH' },
      { curriculum_mode: 'TAKHASSUS', target_activity: 'TAHFIDZ' },
      { curriculum_mode: 'IMTAS', imtas_month: 'FEBRUARI', target_outcome: 'SYAHADAH' },
      { curriculum_mode: 'TAKHASSUS', target_activity: 'TAHFIDZ' }
    ][p];
    return { curriculum_mode: 'TAKHASSUS', target_activity: 'TAHFIDZ' };
  };
  const ranges = {
    1: [[30,114,109],[30,108,105],[30,104,101],[30,100,98]],
    2: [[30,97,95],[30,94,92],[30,91,89],[30,88,86]],
    3: [[30,85,84],[30,83,82],[30,81,80],[30,79,78]],
    4: [[29,67,68],[29,69,70],[29,71,72],[29,73,74]],
    5: [[29,75,76,1,15],[29,76,77,16,null],[27,51,52,1,25],[27,52,53,25,null]],
    6: [[27,54,54],[27,55,55],[27,56,56],[27,57,57]]
  };
  const presetTahfidz = (grade, period) => {
    const row = ranges[Number(grade)]?.[periods.indexOf(period)];
    if (!row) return null;
    const [juz, start, end, startAyah = 1, endAyah] = row;
    return { curriculum_range: true, tahfidz_progress_type: 'SURAT', tahfidz_juz: juz,
      tahfidz_surah_start: start, tahfidz_ayah_start: startAyah,
      tahfidz_surah: end, tahfidz_ayah: endAyah || index(end).ayahs };
  };
  const preset = (subject, grade, period) => subject === 'tahsin' ? presetTahsin(Number(grade), period) : presetTahfidz(Number(grade), period);
  function validate(value, subject, surahsForJuz) {
    if (subject === 'tahsin') {
      const mode = String(value.curriculum_mode || '');
      if (!modes.some(([v]) => v === mode)) throw Error('Pilih jenis target Tahsin.');
      const t = { curriculum_mode: mode };
      if (mode === 'BUKU') {
        t.tahsin_progress_type = 'BUKU';
        t.tahsin_book_number = requiredInt(value.tahsin_book_number, 'Nomor buku', 1, 3);
        t.target_page_start = requiredInt(value.target_page_start, 'Halaman awal', 1, 60);
        t.target_page_end = requiredInt(value.target_page_end, 'Halaman akhir', t.target_page_start, 60);
        t.tahsin_page = t.target_page_end;
      } else if (['ALQ_GHARIB', 'GHARIB', 'TAJWID'].includes(mode)) {
        t.target_juz_start = requiredInt(value.target_juz_start, 'Juz awal', 1, 30);
        t.target_juz_end = requiredInt(value.target_juz_end, 'Juz akhir', t.target_juz_start, 30);
        t.tahsin_progress_type = mode === 'ALQ_GHARIB' ? "AL-QUR'AN" : mode;
        if (mode === 'ALQ_GHARIB' || mode === 'GHARIB') {
          t.gharib_page_start = requiredInt(value.gharib_page_start, 'Halaman Gharib awal', 1, 60);
          t.gharib_page_end = requiredInt(value.gharib_page_end, 'Halaman Gharib akhir', t.gharib_page_start, 60);
        } else {
          const topic = String(value.target_tajwid || '').trim();
          if (!topic || topic.length > 120) throw Error('Materi Tajwid wajib, maksimal 120 karakter.');
          t.target_tajwid = topic;
        }
      } else if (mode === 'IMTAS') {
        if (!['NOVEMBER', 'FEBRUARI'].includes(value.imtas_month)) throw Error('Pilih bulan IMTAS.');
        t.tahsin_progress_type = 'SYAHADAH';
        t.imtas_month = value.imtas_month;
        t.target_outcome = 'SYAHADAH';
      } else {
        t.tahsin_progress_type = 'TAKHASSUS';
        t.target_activity = 'TAHFIDZ';
      }
      return t;
    }
    const juz = requiredInt(value.tahfidz_juz, 'Juz', 1, 30);
    const start = requiredInt(value.tahfidz_surah_start, 'Surat awal', 1, 114);
    const end = requiredInt(value.tahfidz_surah, 'Surat akhir', 1, 114);
    if (!surahsForJuz(juz).some(s => s.number === start) || !surahsForJuz(juz).some(s => s.number === end)) throw Error('Surat awal dan akhir harus berada pada juz terpilih.');
    if (juz === 30 ? start < end : start > end) throw Error('Urutan surat tidak sesuai urutan hafalan juz.');
    const first = requiredInt(value.tahfidz_ayah_start, 'Ayat awal', 1, index(start).ayahs);
    const last = requiredInt(value.tahfidz_ayah, 'Ayat akhir', 1, index(end).ayahs);
    if (start === end && first > last) throw Error('Ayat akhir tidak boleh lebih kecil daripada ayat awal pada surat yang sama.');
    return { curriculum_range: true, tahfidz_progress_type: 'SURAT', tahfidz_juz: juz,
      tahfidz_surah_start: start, tahfidz_ayah_start: first, tahfidz_surah: end, tahfidz_ayah: last };
  }
  function label(t, subject) {
    if (!t) return 'Target belum diatur';
    if (subject === 'tahfidz' && t.curriculum_range) {
      const start = `QS. ${safeName(t.tahfidz_surah_start)}` + (Number(t.tahfidz_ayah_start) > 1 ? ` ayat ${t.tahfidz_ayah_start}` : '');
      const end = `QS. ${safeName(t.tahfidz_surah)}` + (Number(t.tahfidz_ayah) < (index(t.tahfidz_surah)?.ayahs || 0) ? ` ayat ${t.tahfidz_ayah}` : '');
      return `Juz ${t.tahfidz_juz}: ${start}${t.tahfidz_surah_start === t.tahfidz_surah && t.tahfidz_ayah_start === t.tahfidz_ayah ? '' : ' – ' + end}`;
    }
    if (subject !== 'tahsin' || !t.curriculum_mode) return '';
    const r = (start,end) => `${start}–${end}`;
    if (t.curriculum_mode === 'BUKU') return `Buku ${t.tahsin_book_number}, halaman ${r(t.target_page_start,t.target_page_end)}`;
    if (t.curriculum_mode === 'ALQ_GHARIB') return `Al-Qur'an juz ${r(t.target_juz_start,t.target_juz_end)} dan Gharib halaman ${r(t.gharib_page_start,t.gharib_page_end)}`;
    if (t.curriculum_mode === 'GHARIB') return `Gharib: juz ${r(t.target_juz_start,t.target_juz_end)}, halaman ${r(t.gharib_page_start,t.gharib_page_end)}`;
    if (t.curriculum_mode === 'TAJWID') return `Tajwid: juz ${r(t.target_juz_start,t.target_juz_end)} dan materi ${t.target_tajwid || 'Tajwid'}`;
    if (t.curriculum_mode === 'IMTAS') return `IMTAS ${t.imtas_month} – Syahadah`;
    return 'Kelas Takhossus – Tahfidz';
  }
  function attainment(actual, target, subject) {
    if (!actual || !target) return 'BELUM DINILAI';
    if (subject === 'tahfidz' && target.curriculum_range) {
      const aJuz = Number(actual.tahfidz_juz), tJuz = Number(target.tahfidz_juz);
      const order = [30,29,28,27,26,25,1,2,3,4,5,6,7,8];
      if (!Number.isInteger(aJuz) || !Number.isInteger(tJuz) || !index(actual.tahfidz_surah) || !Number.isInteger(Number(actual.tahfidz_ayah)) || !actual.tahfidz_ayah) return 'BELUM DINILAI';
      if (!order.includes(aJuz) || !order.includes(tJuz)) return 'BELUM DINILAI';
      if (order.indexOf(aJuz) !== order.indexOf(tJuz)) return order.indexOf(aJuz) > order.indexOf(tJuz) ? 'TERCAPAI' : 'BELUM TERCAPAI';
      const act = Number(actual.tahfidz_surah), end = Number(target.tahfidz_surah), reverse = tJuz === 30;
      if (act === end) return Number(actual.tahfidz_ayah) >= Number(target.tahfidz_ayah) ? 'TERCAPAI' : 'BELUM TERCAPAI';
      return (reverse ? act < end : act > end) ? 'TERCAPAI' : 'BELUM TERCAPAI';
    }
    if (subject !== 'tahsin' || !target.curriculum_mode) return 'BELUM DINILAI';
    const mode = target.curriculum_mode;
    if (mode === 'BUKU') {
      if (actual.tahsin_progress_type === 'BUKU') {
        const book = Number(actual.tahsin_book_number), page = Number(actual.tahsin_page);
        if (!book || !page) return 'BELUM DINILAI';
        return book > Number(target.tahsin_book_number) || (book === Number(target.tahsin_book_number) && page >= Number(target.target_page_end)) ? 'TERCAPAI' : 'BELUM TERCAPAI';
      }
      if (['JILID',"AL-QUR'AN",'FINISHING','SYAHADAH','TAKHASSUS'].includes(actual.tahsin_progress_type)) return 'TERCAPAI';
      return 'BELUM DINILAI';
    }
    if (mode === 'TAKHASSUS') return actual.tahsin_progress_type === 'TAKHASSUS' ? 'TERCAPAI' : actual.tahsin_progress_type ? 'BELUM TERCAPAI' : 'BELUM DINILAI';
    if (mode === 'IMTAS') return ['SYAHADAH','TAKHASSUS'].includes(actual.tahsin_progress_type) ? 'TERCAPAI' : actual.tahsin_progress_type ? 'BELUM TERCAPAI' : 'BELUM DINILAI';
    const actualJuz = Number(actual.tahsin_juz_last), endJuz = Number(target.target_juz_end);
    if (!Number.isInteger(actualJuz) || actualJuz < 1 || actualJuz > 30) return 'BELUM DINILAI';
    if (mode === 'TAJWID') {
      if (actualJuz < endJuz) return 'BELUM TERCAPAI';
      return actual.tahsin_tajwid_target_done === true ? 'TERCAPAI' : 'BELUM DINILAI';
    }
    const gharibPage = Number(actual.tahsin_gharib_page);
    if (actualJuz < endJuz || (gharibPageValid(gharibPage) && gharibPage < Number(target.gharib_page_end))) return 'BELUM TERCAPAI';
    if (!gharibPageValid(gharibPage)) return 'BELUM DINILAI';
    return 'TERCAPAI';
  }
  const gharibPageValid = n => Number.isInteger(n) && n >= 1 && n <= 60;
  return { periods, modes, preset, validate, label, attainment };
})();
