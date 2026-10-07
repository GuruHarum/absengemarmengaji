window.ReportSettings = (() => {
    let settings = {}, version = 0, referenceVersion = 0, reference = null, tab = 'identity', dirtyIdentity = false, busy = false;
    const drafts = new Map(), el = id => document.getElementById(id), esc = value => escapeHtml(String(value ?? ''));
    const identityFields = ['principal_name', 'principal_niy', 'coordinator_name', 'coordinator_niy', 'city'];
    const message = text => el('reportSettingsFeedback').textContent = text;
    const values = root => Object.fromEntries([...root.querySelectorAll('[data-field]')].map(input => [input.dataset.field, input.value]));
    const cardKey = (year, period, grade) => `${year}_${period}_${grade}`;
    function fullName(name, degree) { name = String(name || '').trim(); degree = String(degree || '').trim(); return degree && !name.endsWith(degree) ? [name, degree].filter(Boolean).join(', ') : name; }
    function targetFields(v, sub, id) {
        const number = (field,label,min,max) => `<label class="field-label">${label}<input data-field="${field}" type="number" min="${min}" max="${max}" step="1" required value="${esc(v[field])}"></label>`;
        const select = (field,label,choices) => `<label class="field-label">${label}<select data-field="${field}" required><option value="">Pilih</option>${choices.map(([value,name]) => `<option value="${esc(value)}" ${String(v[field] ?? '') === String(value) ? 'selected' : ''}>${esc(name)}</option>`).join('')}</select></label>`;
        const juz = (field,label) => select(field,label,Array.from({length:30},(_,i)=>[i+1,`Juz ${i+1}`]));
        if (sub === 'tahsin') {
            let html = select('curriculum_mode','Jenis target Tahsin',CurriculumTargets.modes);
            if (v.curriculum_mode === 'BUKU')
                html += select('tahsin_book_number','Buku',[[1,'Buku 1'],[2,'Buku 2'],[3,'Buku 3']]) + number('target_page_start','Halaman awal',1,60) + number('target_page_end','Halaman target (akhir)',1,60);
            if (['ALQ_GHARIB','GHARIB','TAJWID'].includes(v.curriculum_mode)) {
                html += juz('target_juz_start','Juz awal') + juz('target_juz_end','Juz akhir');
                if (v.curriculum_mode !== 'TAJWID') html += number('gharib_page_start','Gharib halaman awal',1,60) + number('gharib_page_end','Gharib halaman target',1,60);
                else html += `<label class="field-label">Materi Tajwid<input data-field="target_tajwid" type="text" maxlength="120" required value="${esc(v.target_tajwid)}" placeholder="Tajwid"></label><p class="assessment-help">PDF mencantumkan Tajwid tanpa merinci materinya. Ubah jika sekolah memiliki target materi tertentu.</p>`;
            }
            if (v.curriculum_mode === 'IMTAS') html += select('imtas_month','Bulan IMTAS', [['NOVEMBER','November'],['FEBRUARI','Februari']]) + '<p class="assessment-help">Luaran: Syahadah.</p>';
            if (v.curriculum_mode === 'TAKHASSUS') html += '<p class="assessment-help">Kelas Takhossus, pembelajaran Tahfidz. Tidak ada target halaman buku.</p>';
            return html;
        }
        const list = ReportCore.surahsForJuz(v.tahfidz_juz);
        const surahs = list.map(r => [r.number, ReportCore.surahName(r.number)]);
        return juz('tahfidz_juz','Juz') + select('tahfidz_surah_start','Surat awal',surahs)
            + number('tahfidz_ayah_start','Ayat awal',1,QURAN_SURAHS.find(r=>r.number===Number(v.tahfidz_surah_start))?.ayahs || 286)
            + select('tahfidz_surah','Surat target (akhir)',surahs)
            + number('tahfidz_ayah','Ayat target (akhir)',1,QURAN_SURAHS.find(r=>r.number===Number(v.tahfidz_surah))?.ayahs || 286);
    }
    function render() {
        el('reportIdentity').hidden = tab !== 'identity';
        el('reportTargets').hidden = tab === 'identity';
        document.querySelectorAll('[data-report-tab]').forEach(b => { b.classList.toggle('active', b.dataset.reportTab === tab); b.setAttribute('aria-selected', String(b.dataset.reportTab === tab)); });
        if (tab === 'identity') return;
        const year = Number(el('reportSettingYear').value), gradeFilter = el('reportSettingGrade').value, cards = [];
        for (let grade = 1; grade <= 6; grade++) for (const [period, label] of Object.entries(ReportCore.periods)) {
            const key = cardKey(year, period, grade), id = tab + '_' + key;
            const record = settings.curriculum?.[key] || {};
            const saved = record[tab + '_target'];
            const template = year === 2025 && !saved ? CurriculumTargets.preset(tab,grade,period) : null;
            const draft = drafts.get(id);
            const v = draft || { ...template, ...saved, kkm: record[tab + '_kkm'] ?? 75 };
            const state = draft ? 'Belum disimpan' : saved ? 'Tersimpan' : template ? 'Acuan PDF 2025/2026; belum disimpan' : 'Belum diatur';
            const legacy = saved && !(tab==='tahsin' ? saved.curriculum_mode : saved.curriculum_range);
            cards.push(`<form class="report-panel target-card" data-target="${id}" data-key="${key}" data-sub="${tab}" data-grade="${grade}" data-period="${period}" ${gradeFilter && Number(gradeFilter) !== grade ? 'hidden' : ''}>
              <header><h3>Kelas ${grade}</h3><p>${esc(label)} · ${year}/${year+1}</p></header>
              ${legacy ? `<p class="assessment-help">Target format lama: ${esc(ReportCore.progress(saved,tab))}. Simpan ulang setelah mengisi format target terbaru.</p>` : ''}
              <label class="field-label">KKM ${tab==='tahsin'?'Tahsin':'Tahfidz'}<input data-field="kkm" type="number" min="0" max="100" step="0.01" value="${esc(v.kkm)}" required></label>
              <div class="report-grid">${targetFields(v,tab,id)}</div>
              ${legacy && year === 2025 ? '<button type="button" data-apply-reference class="secondary-action">Ganti draf dengan acuan PDF</button>' : ''}<button type="submit" class="primary-action">Simpan Target</button><span class="target-state" role="status">${state}</span>
            </form>`);
        }
        el('reportTargetCards').innerHTML = cards.join('');
    }
    async function copyReference() {
        const year=Number(el('reportSettingYear').value);
        if (year===2025) { message('Acuan 2025/2026 sudah otomatis terlihat pada kartu kosong; klik Simpan Target per kartu.'); return; }
        if (!(await AdminNotice.confirm('Salin target dari PDF tahun 2025/2026 ke kartu tahun '+year+'/'+(year+1)+' yang BELUM diatur? Target yang sudah tersimpan tidak ditimpa.'))) return;
        let n=0;
        for (let grade=1;grade<=6;grade++) for (const period of Object.keys(ReportCore.periods)) {
            const key=cardKey(year,period,grade),id=tab+'_'+key;
            if (settings.curriculum?.[key]?.[tab+'_target'] || drafts.has(id)) continue;
            drafts.set(id,{...CurriculumTargets.preset(tab,grade,period),kkm:settings.curriculum?.[key]?.[tab+'_kkm']??75});n++;
        }
        render();message(n+' target telah disalin sebagai DRAF, bukan disimpan ke database. Periksa dan simpan setiap kartu.');
    }
    async function open() { if (!AppAccess.full() || busy)
        return; if (dirtyIdentity || drafts.size)
        return; try {
        const [a, b] = await Promise.all([supabase.from('report_settings').select('*').eq('id', 1).single(), supabase.from('report_reference').select('*').eq('id', 1).single()]);
        if (a.error || b.error)
            throw a.error || b.error;
        settings = a.data.data;
        version = a.data.version;
        reference = b.data.data;
        referenceVersion = b.data.version;
        ReportCore.useReference(reference);
        for (const field of identityFields)
            el('report-' + field).value = field.endsWith('_name') ? fullName(settings[field], settings[field.replace('_name', '_degree')]) : settings[field] || '';
        el('reportSettingYear').value ||= String(new Date().getFullYear() - (new Date().getMonth() < 6 ? 1 : 0));
        el('referenceSurah').innerHTML = QURAN_SURAHS.map(s => `<option value="${s.number}">${s.number}. ${esc(ReportCore.surahName(s.number))}</option>`).join('');
        showMaterial();
        showSurah();
        render();
        message('Target berlaku bagi seluruh siswa pada tingkat dan periode yang sama.');
    }
    catch (e) {
        message('Pengaturan rapor belum tersedia: ' + e.message);
    } }
    async function saveIdentity() { if (busy)
        return; busy = true; try {
        const payload = Object.fromEntries(identityFields.map(k => [k, el('report-' + k).value.trim()]));
        const result = await supabase.rpc('save_report_identity', { payload, expected: version });
        if (result.error)
            throw result.error;
        version = result.data;
        Object.assign(settings, payload, { principal_degree: '', coordinator_degree: '' });
        dirtyIdentity = false;
        message('Identitas tersimpan. Identitas pada rapor yang sudah diterbitkan tetap terjaga.');
    }
    catch (e) {
        message(e.message);
    }
    finally {
        busy = false;
    } }
    async function saveCard(form) { if (busy || !form.reportValidity())
        return; busy = true; const button = form.querySelector('button'); button.disabled = true; try {
        const v = values(form), sub = form.dataset.sub;
        if (ReportCore.blank(v.kkm) || !Number.isFinite(Number(v.kkm)) || Number(v.kkm) < 0 || Number(v.kkm) > 100)
            throw Error('KKM harus 0–100');
        const target = CurriculumTargets.validate(v, sub, ReportCore.surahsForJuz);
        const previous = settings.curriculum?.[form.dataset.key] || {};
        const result = await supabase.rpc('save_report_target', { yr: Number(el('reportSettingYear').value), pr: form.dataset.period, grade: Number(form.dataset.grade), sub, target, kkm: Number(v.kkm), previous: previous[sub + '_target'] ? { target: previous[sub + '_target'], kkm: previous[sub + '_kkm'] } : null });
        if (result.error)
            throw result.error;
        settings.curriculum ||= {};
        settings.curriculum[form.dataset.key] = { ...previous, [sub + '_target']: target, [sub + '_kkm']: Number(v.kkm) };
        version = result.data;
        drafts.delete(form.dataset.target);
        form.querySelector('.target-state').textContent = 'Tersimpan';
        message('Target kartu ini tersimpan. Kartu lainnya tidak berubah.');
    }
    catch (e) {
        message(e.message);
    }
    finally {
        busy = false;
        button.disabled = false;
    } }
    function showMaterial() { el('referenceMaterial').value = ReportCore.material(el('referenceBook').value, el('referencePage').value); }
    function showSurah() { const n = el('referenceSurah').value; el('referenceSurahName').value = ReportCore.surahName(n); el('referenceAliases').value = (reference?.aliases?.[n] || []).join(', '); }
    async function saveReference() { if (busy)
        return; busy = true; try {
        const next = JSON.parse(JSON.stringify(reference)), book = Number(el('referenceBook').value), page = Number(el('referencePage').value), row = next.books.find(r => r.book === book && r.page === page);
        if (!row || !el('referenceMaterial').value.trim())
            throw Error('Halaman/materi tidak valid');
        row.material = el('referenceMaterial').value.trim();
        const n = el('referenceSurah').value;
        next.surahNames ||= {};
        next.aliases ||= {};
        if (!el('referenceSurahName').value.trim())
            throw Error('Nama surat wajib');
        next.surahNames[n] = el('referenceSurahName').value.trim();
        next.aliases[n] = el('referenceAliases').value.split(',').map(v => v.trim()).filter(Boolean);
        const result = await supabase.rpc('save_report_configuration', { kind: 'reference', payload: next, expected: referenceVersion });
        if (result.error)
            throw result.error;
        reference = next;
        referenceVersion = result.data;
        ReportCore.useReference(reference);
        message('Referensi tersimpan.');
    }
    catch (e) {
        message(e.message);
    }
    finally {
        busy = false;
    } }
    ((callback) => window.GMPanel ? GMPanel.onReady(callback) : document.addEventListener('panelready', callback))( () => { document.querySelectorAll('[data-report-tab]').forEach(b => b.addEventListener('click', () => { tab = b.dataset.reportTab; render(); })); el('saveReportSettings').addEventListener('click', saveIdentity); el('reportIdentity').addEventListener('input', () => dirtyIdentity = true); el('saveReportReference').addEventListener('click', saveReference); el('reportCopyCurriculum')?.addEventListener('click',copyReference); ['reportSettingYear', 'reportSettingGrade'].forEach(id => el(id).addEventListener('change', render)); el('reportTargetCards').addEventListener('input', event => { const form = event.target.closest('[data-target]'); if (!form)
        return; const v = values(form); drafts.set(form.dataset.target, v); form.querySelector('.target-state').textContent = 'Belum disimpan'; }); el('reportTargetCards').addEventListener('change', event => { const form = event.target.closest('[data-target]'); if (!form)
        return; const v = values(form), field = event.target.dataset.field; if (field === 'tahfidz_surah') v.tahfidz_ayah = '';
        if (field === 'tahfidz_surah_start') v.tahfidz_ayah_start = '';
        if (field === 'tahfidz_juz') { v.tahfidz_surah_start=''; v.tahfidz_ayah_start=''; v.tahfidz_surah=''; v.tahfidz_ayah=''; }
        if (field === 'curriculum_mode') { const kkm=v.kkm, mode=v.curriculum_mode; for (const key of Object.keys(v)) if (key!=='kkm' && key!=='curriculum_mode') delete v[key]; v.kkm=kkm; v.curriculum_mode=mode; }
        const changed = ['curriculum_mode','tahfidz_juz','tahfidz_surah','tahfidz_surah_start'].includes(field); drafts.set(form.dataset.target, v); if (changed)
        render(); }); el('reportTargetCards').addEventListener('click', async event => {
            if (!event.target.matches('[data-apply-reference]')) return;
            const form=event.target.closest('[data-target]');
            if (!form || !(await AdminNotice.confirm('Gunakan acuan PDF pada draf kartu ini? Target lama tetap tersimpan sampai Anda menekan Simpan Target.'))) return;
            drafts.set(form.dataset.target,{...CurriculumTargets.preset(form.dataset.sub,Number(form.dataset.grade),form.dataset.period),kkm:form.querySelector('[data-field=kkm]').value});
            render();message('Acuan PDF dimuat dalam draf kartu. Periksa lalu klik Simpan Target.');
        }); el('reportTargetCards').addEventListener('submit', event => { event.preventDefault(); saveCard(event.target); }); ['referenceBook', 'referencePage'].forEach(id => el(id).addEventListener('change', showMaterial)); el('referenceSurah').addEventListener('change', showSurah); });
    window.addEventListener('beforeunload', event => { if (dirtyIdentity || drafts.size) {
        event.preventDefault();
        event.returnValue = '';
    } });
    return { open, hasUnsavedChanges: () => dirtyIdentity || drafts.size > 0 };
})();
