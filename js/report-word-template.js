/* Template Word 180 mm approved for rapor Tahsin & Tahfidz.
 * Only the source data is replaced. Fonts, tables and borders are owned by DOCX.
 * Source: assets/report-word-template-180mm.gz.b64 (gzip JSON OOXML package).
 */
window.ReportWordTemplate = (() => {
  const TEMPLATE = 'assets/report-word-template-180mm.gz.b64?v=20261023-rapor1';
  const encoder = new TextEncoder();
  let partsPromise;
  const readTemplate = async () => {
    if (!partsPromise) partsPromise = (async () => {
      const response = await fetch(TEMPLATE);
      if (!response.ok) throw Error('Template rapor Word belum dapat dimuat.');
      if (typeof DecompressionStream !== 'function') throw Error('Browser ini belum mendukung pembacaan template Word. Gunakan browser terbaru.');
      const source = (await response.text()).trim().replace(/\s+/g, '');
      const binary = atob(source);
      const bytes = Uint8Array.from(binary, char => char.charCodeAt(0));
      return JSON.parse(await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).text());
    })().catch(error => { partsPromise = null; throw error; });
    return partsPromise;
  };
  const xml = value => String(value ?? '-').replace(/[\\u0000-\\u0008\\u000B\\u000C\\u000E-\\u001F]/g, '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
  const filled = value => ReportCore.blank(value) ? '-' : String(value);
  const scoreValue = (scores, subject, key) => {
    const field = subject + '_' + key;
    const usable = ReportCore.applicable(scores, subject).keys.includes(field);
    const confirmed = !(subject === 'tahfidz' && key === 'hafalan') || [true, 'true'].includes(scores.tahfidz_aspect_confirmed);
    return usable && confirmed ? scores[field] : null;
  };
  const dateOf = value => {
    const date = value ? new Date(value) : new Date();
    if (Number.isNaN(date.getTime())) throw Error('Tanggal rapor tidak valid.');
    return date;
  };
  const reportValues = (report, date) => {
    ReportCore.useReference(report.reference);
    const student = report.student || {}, school = report.school || {}, officials = report.officials || {};
    const natural = ReportPDF.naturalName(student.name || '');
    const schoolName = ReportPDF.schoolHeader(school.name || '');
    const schoolLines = schoolName.split('\n');
    const out = {
      PERIOD_LABEL: (ReportCore.periods[report.period] || '').toUpperCase() + ' - TAHUN AJARAN ' + report.year + ' / ' + (report.year + 1),
      SCHOOL_LEVEL: schoolLines.length > 1 ? schoolLines.slice(0,-1).join(' ') : 'SEKOLAH DASAR ISLAM TERPADU (SDIT)',
      SCHOOL_NAME: schoolLines.length > 1 ? schoolLines.at(-1) : (schoolName || '-'),
      SIGNATURE_SCHOOL: ReportPDF.signatureSchoolName(school.name || ''),
      STUDENT_NAME: ReportPDF.personName(student.name || '-'),
      STUDENT_NIS: filled(student.nis),
      STUDENT_NISN: filled(student.nisn),
      STUDENT_CLASS: window.PeriodicAssessments?.classLabel(student.class) || filled(student.class),
      PRINCIPAL_NAME: ReportPDF.personName([officials.principal_name, officials.principal_degree].filter(Boolean).join(', ')),
      PRINCIPAL_NIY: officials.principal_niy ? 'NIY. ' + officials.principal_niy : '-',
      COORDINATOR_NAME: ReportPDF.personName([officials.coordinator_name,officials.coordinator_degree].filter(Boolean).join(', ')),
      COORDINATOR_NIY: officials.coordinator_niy ? 'NIY. ' + officials.coordinator_niy : '-',
      ISSUE_DATE: (officials.city || 'Kota belum diatur').toUpperCase() + ', ' + ReportPDF.dateLabel(date),
      TEACHER_NOTE: ReportCore.note(natural, report.period)
    };
    for (const subject of ['tahsin', 'tahfidz']) {
      const key = subject.toUpperCase(), sub = report[subject] || {}, scores = sub.scores || {};
      const stats = ReportCore.stats(scores, subject), target = report.settings?.[subject + '_target'];
      out[key + '_TARGET'] = target ? ReportCore.progress(target, subject) : 'Target belum diatur';
      out[key + '_PROGRESS'] = ReportCore.progress(scores, subject);
      out[key + '_SUM'] = filled(stats.sum);
      out[key + '_AVERAGE'] = stats.average == null ? '-' : stats.average.toFixed(1).replace('.', ',');
      out[key + '_GRADE'] = stats.grade;
      out[key + '_PREDICATE'] = stats.predicate;
      out[key + '_KKM'] = filled(report.settings?.[subject + '_kkm']);
      out[key + '_TEACHER'] = ReportPDF.personName(report.teachers?.[subject] || sub.teacher_name || '-');
      out[key + '_DESCRIPTION'] = ReportCore.description(natural, scores, subject);
      for (const field of (subject === 'tahsin' ? ['makhraj','tajwid','tartil','gharib'] : ['makhraj','tajwid','hafalan'])) {
        const value = scoreValue(scores, subject, field);
        const fieldName = key + '_' + field.toUpperCase();
        out[fieldName + '_SCORE'] = filled(value);
        out[fieldName + '_ASPECT'] = ReportCore.aspect(value);
      }
    }
    return out;
  };
  const renderBody = (body, values) => body.replace(/\{\{([A-Z_]+)\}\}/g,(whole,key)=>{
    if (!Object.prototype.hasOwnProperty.call(values,key)) throw Error('Kolom template tidak dikenal: ' + key);
    return xml(values[key]);
  });
  const getLogo = async report => {
    const url = report.school?.logo_url || 'assets/school-logo.png';
    let response;
    try { response = await fetch(url); } catch (_) {}
    if (!response?.ok) response = await fetch('assets/school-logo.png');
    if (!response.ok) throw Error('Logo sekolah tidak dapat dimuat.');
    return new Uint8Array(await response.arrayBuffer());
  };
  async function build(rows,onProgress=()=>{}, {date=null}={}) {
    if (!rows?.length) throw Error('Tidak ada rapor.');
    const list = ReportPDF.sorted(rows);
    if(list.some(row => !ReportCore.reportCheck(row).complete))
      throw Error('Rapor belum lengkap.');
    const parts = await readTemplate();
    const source = parts['word/document.xml'];
    const start = source.indexOf('<w:body>'), end = source.lastIndexOf('<w:sectPr');
    if (start < 0 || end <= start || !source.includes('{{STUDENT_NAME}}'))
      throw Error('Template rapor Word tidak valid.');
    const prefix = source.slice(0,start + '<w:body>'.length), suffix = source.slice(end);
    const body = source.slice(start + '<w:body>'.length,end);
    const contents = [];
    for(let i=0;i<list.length;i++) {
      if (i) contents.push('<w:p><w:pPr><w:pageBreakBefore/></w:pPr><w:r><w:t></w:t></w:r></w:p>');
      contents.push(renderBody(body,reportValues(list[i],dateOf(date))));
      onProgress(i+1,list.length,list[i]);
    }
    // Placeholder substitution preserves the author's exact margins, lines and table geometry.
    const documentXml = prefix + contents.join('') + suffix;
    if(/\{\{[A-Z_]+\}\}/.test(documentXml)) throw Error('Ada kolom template Word yang belum diisi.');
    const files = Object.entries(parts).map(([name,content]) => ({
      name,bytes:encoder.encode(name==='word/document.xml'?documentXml:content)
    }));
    files.push({name:'word/media/image1.png',bytes:await getLogo(list[0])});
    return ReportZip.pack(files,'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  }
  return {build};
})();
