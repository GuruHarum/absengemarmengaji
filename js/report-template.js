/* Pembuat DOCX dari OOXML TEMPLATE_RAPOR_3_Tabel_Seragam_180mm.
 * Hanya token data diganti; dimensi, warna, font, border, logo, dan grid mengikuti Word asli.
 * ReportCore tetap satu-satunya sumber rumus, predikat, target, dan deskripsi.
 */
window.GMReportTemplate = (() => {
  const enc = new TextEncoder();
  let sourcePromise = null;
  async function source() {
    if (!sourcePromise) sourcePromise = (async () => {
      if (!window.GMReportTemplateData) throw Error('Acuan Word belum dimuat.');
      if (typeof DecompressionStream !== 'function') throw Error('Browser belum mendukung pembacaan template Word. Perbarui browser.');
      const raw = atob(window.GMReportTemplateData);
      const bytes = new Uint8Array(raw.length);
      for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
      const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
      const parts = JSON.parse(await new Response(stream).text());
      if (!parts['word/document.xml'] || !parts['word/styles.xml']) throw Error('Paket acuan Word tidak lengkap.');
      return parts;
    })().catch(error => { sourcePromise = null; throw error; });
    return sourcePromise;
  }
  const escapeXml = text => String(text ?? '-').replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;');
  const fmt = value => ReportCore.blank(value) ? '-' : String(value);
  function data(row, date) {
    ReportCore.useReference(row.reference);
    const st = row.student || {}, school = row.school || {}, officials = row.officials || {};
    const tahsin = row.tahsin || {}, tahfidz = row.tahfidz || {}, settings = row.settings || {};
    const s1 = tahsin.scores || {}, s2 = tahfidz.scores || {};
    const a = ReportCore.stats(s1, 'tahsin'), b = ReportCore.stats(s2, 'tahfidz');
    const title = ReportPDF.schoolHeader(school.name).split('\n');
    const issue = date ? new Date(date) : new Date();
    if (Number.isNaN(issue.getTime())) throw Error('Tanggal penerbitan tidak valid.');
    const className = window.PeriodicAssessments?.classLabel(st.class) || st.class;
    const name = ReportPDF.naturalName(st.name);
    const score = (subject, values, field) => {
      const keys = ReportCore.applicable(values,subject).keys;
      if (!keys.includes(field) || (field === 'tahfidz_hafalan' && ![true,'true'].includes(values.tahfidz_aspect_confirmed))) return '-';
      return fmt(values[field]);
    };
    const t = {
      PERIOD_LABEL: (ReportCore.periods[row.period] || row.period) + ' - TAHUN AJARAN ' + row.year + ' / ' + (Number(row.year) + 1),
      SCHOOL_LEVEL: title[0] || 'SEKOLAH DASAR ISLAM TERPADU (SDIT)',
      SCHOOL_NAME: title.slice(1).join(' ') || school.name || '-',
      SIGNATURE_SCHOOL: ReportPDF.signatureSchoolName(school.name),
      STUDENT_NAME: ReportPDF.personName(st.name),
      STUDENT_NIS: fmt(st.nis), STUDENT_NISN: fmt(st.nisn), STUDENT_CLASS: fmt(className),
      TAHSIN_TARGET: settings.tahsin_target ? ReportCore.progress(settings.tahsin_target,'tahsin') : '-',
      TAHSIN_PROGRESS: ReportCore.progress(s1,'tahsin'),
      TAHSIN_SUM: fmt(a.sum), TAHSIN_AVERAGE: a.average == null ? '-' : a.average.toFixed(1).replace('.',','),
      TAHSIN_GRADE: a.grade, TAHSIN_KKM: fmt(settings.tahsin_kkm), TAHSIN_PREDICATE: a.predicate,
      TAHSIN_TEACHER: ReportPDF.personName(row.teachers?.tahsin || tahsin.teacher_name || '-'),
      TAHSIN_DESCRIPTION: ReportCore.description(name,s1,'tahsin'),
      TAHFIDZ_TARGET: settings.tahfidz_target ? ReportCore.progress(settings.tahfidz_target,'tahfidz') : '-',
      TAHFIDZ_PROGRESS: ReportCore.progress(s2,'tahfidz'),
      TAHFIDZ_SUM: fmt(b.sum), TAHFIDZ_AVERAGE: b.average == null ? '-' : b.average.toFixed(1).replace('.',','),
      TAHFIDZ_GRADE: b.grade, TAHFIDZ_KKM: fmt(settings.tahfidz_kkm), TAHFIDZ_PREDICATE: b.predicate,
      TAHFIDZ_TEACHER: ReportPDF.personName(row.teachers?.tahfidz || tahfidz.teacher_name || '-'),
      TAHFIDZ_DESCRIPTION: ReportCore.description(name,s2,'tahfidz'),
      TEACHER_NOTE: ReportCore.note(name,row.period),
      ISSUE_DATE: (officials.city || 'Tempat belum diisi').toLocaleUpperCase('id-ID') + ', ' + ReportPDF.dateLabel(issue),
      PRINCIPAL_NAME: ReportPDF.personName([officials.principal_name,officials.principal_degree].filter(Boolean).join(', ')),
      COORDINATOR_NAME: ReportPDF.personName([officials.coordinator_name,officials.coordinator_degree].filter(Boolean).join(', ')),
      PRINCIPAL_NIY: 'NIY. ' + fmt(officials.principal_niy),
      COORDINATOR_NIY: 'NIY. ' + fmt(officials.coordinator_niy)
    };
    for (const [sub,values] of [['TAHSIN',s1],['TAHFIDZ',s2]]) {
      const fields = sub === 'TAHSIN'
        ? [['MAKHRAJ','tahsin_makhraj'],['TAJWID','tahsin_tajwid'],['TARTIL','tahsin_tartil'],['GHARIB','tahsin_gharib']]
        : [['MAKHRAJ','tahfidz_makhraj'],['TAJWID','tahfidz_tajwid'],['HAFALAN','tahfidz_hafalan']];
      for (const [label,field] of fields) {
        t[sub+'_'+label+'_SCORE'] = score(sub.toLowerCase(),values,field);
        t[sub+'_'+label+'_ASPECT'] = ReportCore.aspect(t[sub+'_'+label+'_SCORE']==='-'?null:t[sub+'_'+label+'_SCORE']);
      }
    }
    return t;
  }
  function fill(xml, values) {
    return xml.replace(/\{\{([A-Z_]+)\}\}/g,(whole,key) => {
      if (!Object.prototype.hasOwnProperty.call(values,key)) throw Error('Token template tidak dikenal: '+key);
      return escapeXml(values[key]);
    });
  }
  async function build(rows,{date=null,onProgress=()=>{}}={}) {
    if (!Array.isArray(rows) || !rows.length) throw Error('Tidak ada rapor yang dipilih.');
    if (rows.some(row => !ReportCore.reportCheck(row).complete)) throw Error('Nilai atau identitas wajib rapor belum lengkap.');
    const parts = await source();
    const base = parts['word/document.xml'];
    const bodyStart = base.indexOf('<w:body>') + '<w:body>'.length;
    const sectStart = base.lastIndexOf('<w:sectPr');
    if (bodyStart < 8 || sectStart < bodyStart) throw Error('Bentuk dokumen acuan tidak valid.');
    const prefix = base.slice(0,bodyStart), tail = base.slice(sectStart);
    const inner = base.slice(bodyStart,sectStart);
    const pages = [];
    for (let i = 0; i < rows.length; i++) {
      if (i) pages.push('<w:p><w:pPr><w:pageBreakBefore/></w:pPr></w:p>');
      pages.push(fill(inner,data(rows[i],date)));
      onProgress(i+1,rows.length,rows[i]);
      if ((i+1)%12 === 0) await new Promise(resolve=>setTimeout(resolve,0));
    }
    const output = prefix + pages.join('') + tail;
    if (/\{\{[A-Z_]+\}\}/.test(output)) throw Error('Template masih memiliki data contoh yang belum diganti.');
    const logo = await fetch('assets/school-logo.png');
    if (!logo.ok) throw Error('Logo sekolah untuk template Word tidak ditemukan.');
    const files = Object.entries(parts).map(([name,contents]) => ({
      name,bytes:enc.encode(name==='word/document.xml'?output:contents)
    }));
    files.push({name:'word/media/image1.png',bytes:new Uint8Array(await logo.arrayBuffer())});
    return ReportZip.pack(files,'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  }

  // Pratinjau A4 HTML menggunakan kunci data yang sama dengan template DOCX.
  // Rendering browser adalah representasi layar, bukan dokumen cetak independen.
  const html = value => escapeXml(value);
  function renderPreview(row,{draft=false}={}) {
    const v=data(row);
    const h=key=>html(v[key] ?? '-');
    const cells=(sub,fields)=>{
      const rows=fields.map(([label,key])=>'<tr>'+
        '<td>'+html(label)+'</td><td class="num">'+h(sub+'_'+key+'_SCORE')+'</td>'+
        '<td class="gm-rapor-aspect">'+h(sub+'_'+key+'_ASPECT')+'</td>'+
        '<td class="gm-rapor-progress">'+h(sub+'_PROGRESS')+'</td></tr>').join('');
      return '<table class="gm-rapor-table"><colgroup><col style="width:13%"><col style="width:23%"><col style="width:8%"><col style="width:30%"><col style="width:26%"></colgroup>'+
        '<tr class="'+(sub==='TAHSIN'?'gm-rapor-yellow':'gm-rapor-salmon')+'"><th>PROGRAM</th><th colspan="4">TARGET PEMBELAJARAN '+sub+'</th></tr>'+
        '<tr><td class="gm-rapor-program" rowspan="'+(fields.length+3)+'">'+sub+'</td>'+
        '<td colspan="4" class="gm-rapor-target">'+h(sub+'_TARGET')+'</td></tr>'+
        '<tr><th>ASPEK</th><th>NILAI</th><th>KETERANGAN</th><th>PENCAPAIAN '+sub+'</th></tr>'+
        rows+
        '<tr class="gm-rapor-gray"><td colspan="4"><div class="gm-rapor-three">'+
        '<span>JUMLAH : '+h(sub+'_SUM')+'</span><span>RATA-RATA : '+h(sub+'_AVERAGE')+'</span>'+
        '<span>GRADE NILAI : '+h(sub+'_GRADE')+'</span></div></td></tr></table>';
    };
    const subject=(sub,fields)=>{
      return '<section class="gm-rapor-subject">'+cells(sub,fields)+
        '<div class="gm-rapor-gray gm-rapor-meta"><span>NILAI KKM : '+h(sub+'_KKM')+'</span>'+
        '<span>PREDIKAT : '+h(sub+'_PREDICATE')+'</span>'+
        '<span>GURU PEMBIMBING : '+h(sub+'_TEACHER')+'</span></div>'+
        '<div class="gm-rapor-section-label">CAPAIAN KOMPETENSI :</div>'+
        '<div class="gm-rapor-description">'+h(sub+'_DESCRIPTION')+'</div></section>';
    };
    const sheet=document.createElement('div');
    sheet.className='gm-rapor-sheet';
    sheet.innerHTML='<div class="gm-rapor-letterhead"><img src="assets/school-logo.png" alt="Logo SDIT">'+
      '<div class="gm-rapor-letterhead-copy"><strong>LAPORAN PENILAIAN HASIL BELAJAR TAHSIN & TAHFIDZ</strong>'+
      '<span>'+h('PERIOD_LABEL')+'</span><strong>'+h('SCHOOL_LEVEL')+'</strong>'+
      '<strong>'+h('SCHOOL_NAME')+'</strong></div></div>'+
      '<div class="gm-rapor-identities"><div><b>NAMA</b><span>:</span><span>'+h('STUDENT_NAME')+'</span></div>'+
      '<div><b>NISN</b><span>:</span><span>'+h('STUDENT_NISN')+'</span></div>'+
      '<div><b>NIS</b><span>:</span><span>'+h('STUDENT_NIS')+'</span></div>'+
      '<div><b>KELAS</b><span>:</span><span>'+h('STUDENT_CLASS')+'</span></div></div>'+
      subject('TAHSIN',[['MAKHORIJUL HURUF','MAKHRAJ'],['TAJWID','TAJWID'],['TARTIL/KELANCARAN','TARTIL'],['GHARIB MUSYKILAT','GHARIB']])+
      subject('TAHFIDZ',[['MAKHORIJUL HURUF','MAKHRAJ'],['TAJWID','TAJWID'],['TARTIL/KELANCARAN','HAFALAN']])+
      '<div class="gm-rapor-section-label">CATATAN GURU MENGENAI SISWA</div>'+
      '<div class="gm-rapor-description">'+h('TEACHER_NOTE')+'</div>'+
      '<div class="gm-rapor-date">'+h('ISSUE_DATE')+'</div>'+
      '<div class="gm-rapor-signatures"><div><strong>ORANG TUA / WALI<br/>SISWA</strong><div class="gm-rapor-sign-line"></div><span> </span></div>'+
      '<div><strong>KEPALA SEKOLAH<br/>'+h('SIGNATURE_SCHOOL')+'</strong><div class="gm-rapor-sign-line">'+h('PRINCIPAL_NAME')+'</div><span>'+h('PRINCIPAL_NIY')+'</span></div>'+
      '<div><strong>KOORDINATOR STUDI<br/>AL-QUR’AN</strong><div class="gm-rapor-sign-line">'+h('COORDINATOR_NAME')+'</div><span>'+h('COORDINATOR_NIY')+'</span></div></div>';
    if(draft){const mark=document.createElement('div');mark.className='gm-rapor-draft';mark.textContent='DRAF';sheet.appendChild(mark);}
    return sheet;
  }
  return {build,source,data,renderPreview};
})();
