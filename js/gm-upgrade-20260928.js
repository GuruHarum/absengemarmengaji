window.GMUpgrade = (()=>{
 const $=id=>document.getElementById(id), yearNow=()=>{const d=new Date();return d.getFullYear()-(d.getMonth()<6?1:0)};
 function quote(){
  const shared=window.GMIslamicQuotes?.daily?.();
  if(shared)return [shared.text,shared.source];
  return ['Sesungguhnya bersama kesulitan ada kemudahan.','QS. Al-Insyirah: 5-6'];
 }
 async function ensureXLSX(){if(window.XLSX)return XLSX;await new Promise((resolve,reject)=>{const sc=document.createElement('script');sc.src='js/vendor/xlsx.full.min.js';sc.onload=resolve;sc.onerror=()=>reject(new Error('Modul Excel gagal dimuat'));document.head.appendChild(sc)});return window.XLSX;}
 async function count(table,apply=q=>q){let q=supabase.from(table).select('*',{count:'exact',head:true});q=apply(q);const r=await q;if(r.error)throw r.error;return r.count||0}
 function dashboardIdentity(){
  const p=AppAccess.profile||{}, teacher=AppAccess.teacher(), now=new Date();
  const localHour=Number(new Intl.DateTimeFormat('id-ID',{timeZone:'Asia/Jakarta',hour:'2-digit',hourCycle:'h23'}).format(now));
  const greeting=localHour<11?'Selamat pagi':localHour<15?'Selamat siang':localHour<18?'Selamat sore':'Selamat malam';
  const person=String(p.displayName||p.teacherName||(p.role==='koordinator'?'Koordinator':p.role==='admin'?'Admin':'Guru')).trim();
  return {p,teacher,now,greeting,person,todayText:new Intl.DateTimeFormat('id-ID',{timeZone:'Asia/Jakarta',weekday:'long',day:'numeric',month:'long',year:'numeric'}).format(now)};
 }
 function refreshIdentity(){
  const {p,teacher,greeting,person,todayText}=dashboardIdentity(), yr=yearNow();
  const headerEyebrow=$('adminEyebrow'), headerTitle=$('adminPageTitle'), headerDescription=$('adminPageDescription'), headerSource=$('dashboardHeaderSource');
  if(headerEyebrow) headerEyebrow.textContent=teacher?'DASHBOARD GURU':(p.role==='admin'?'DASHBOARD ADMIN':'DASHBOARD KOORDINATOR');
  if(headerTitle) headerTitle.textContent=`${greeting}, ${person}`;
  if(headerDescription) headerDescription.textContent='Semoga setiap langkah hari ini menjadi bagian dari kebaikan.';
  if(headerSource){headerSource.hidden=false;headerSource.textContent=`${todayText} · Tahun Ajaran ${yr}/${yr+1}`;}
 }
 async function dashboard(){
  const host=$('page-dashboard'); if(!host)return;
  host.innerHTML='<div class="gm-dashboard-skeleton"><div></div><div></div><div></div></div>';
  const {p,teacher,todayText}=dashboardIdentity(), q=quote(), yr=yearNow();
  const headerQuote=$('dashboardHeaderQuote'), headerQuoteText=$('dashboardQuoteText'), headerQuoteDalil=$('dashboardQuoteDalil');
  refreshIdentity();
  if(headerQuote){ headerQuote.hidden=false; if(headerQuoteText)headerQuoteText.textContent=q[0]; if(headerQuoteDalil)headerQuoteDalil.textContent=q[1]; }
  const icon=(name)=>({
    teacher:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="8" r="3.5"/><path d="M5 20c.6-4 3-6 7-6s6.4 2 7 6"/></svg>',
    students:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="9" cy="8" r="3"/><path d="M3.5 20c.5-3.5 2.4-5.5 5.5-5.5S14 16.5 14.5 20"/><circle cx="17" cy="9" r="2.4"/><path d="M15.5 14.7c2.8-.4 4.6 1.3 5 4.3"/></svg>',
    tahsin:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M5 4.5h10.5A2.5 2.5 0 0 1 18 7v12H7.5A2.5 2.5 0 0 1 5 16.5z"/><path d="M5 16.5A2.5 2.5 0 0 1 7.5 14H18M9 8h5M9 11h4"/></svg>',
    tahfidz:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4.5 5.5c3.2-1.1 5.7-.6 7.5 1.4v12c-1.8-2-4.3-2.5-7.5-1.4z"/><path d="M19.5 5.5c-3.2-1.1-5.7-.6-7.5 1.4v12c1.8-2 4.3-2.5 7.5-1.4z"/></svg>',
    attendance:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="4" y="5" width="16" height="15" rx="2"/><path d="M8 3v4M16 3v4M4 9h16M8 14l2 2 5-5"/></svg>',
    pending:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="9"/><path d="M12 7v6l3.5 2"/></svg>',
    register:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="9" cy="8" r="3"/><path d="M3.5 19c.5-3.4 2.4-5.3 5.5-5.3 1.5 0 2.7.4 3.6 1.2M17 12v8M13 16h8"/></svg>',
    group:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="8" cy="8" r="3"/><circle cx="17" cy="9" r="2.5"/><path d="M2.5 20c.5-3.6 2.4-5.5 5.5-5.5 3 0 5 1.9 5.5 5.5M14 15c3.7-.8 6.5 1 7 4.5"/></svg>',
    score:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M6 3.5h12v17H6z"/><path d="M9 8h6M9 12h6M9 16h3"/></svg>',
    report:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M6 3.5h8l4 4V20H6z"/><path d="M14 3.5V8h4M9 12h6M9 16h6"/></svg>',
    chart:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></svg>',
    settings:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="3"/><path d="M19 13.5v-3l-2.1-.7-.7-1.7 1-2-2.1-2.1-2 1-1.7-.7L10.5 2h-3l-.7 2.1-1.7.7-2-1L1 5.9l1 2-.7 1.7L0 10.5v3l2.1.7.7 1.7-1 2L3.9 20l2-1 1.7.7.9 2.3h3l.7-2.1 1.7-.7 2 1 2.1-2.1-1-2 .7-1.7z" transform="translate(1 0) scale(.92)"/></svg>',
    profile:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="8" r="3.5"/><path d="M5 20c.6-4 3-6 7-6s6.4 2 7 6"/></svg>'
  }[name]||'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="9"/></svg>');
  try{
   let stats;
   if(teacher){
    const tid=String(p.teacher_id), today=new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Jakarta'});
    const groups=await supabase.from('teaching_assignments').select('id,subject').eq('teacher_id',tid).eq('academic_year_start',yr).eq('active',true);
    if(groups.error) throw groups.error;
    const gs=groups.data||[], gids=gs.map(g=>g.id); let studentIds=[];
    if(gids.length){const mr=await fetchAllRows(()=>supabase.from('assessment_group_members').select('student_id').in('assignment_id',gids).eq('active',true));studentIds=[...new Set(mr.map(x=>String(x.student_id)))];}
    const att = await count('attendance',q=>q.eq('teacher_id',tid).eq('date',today));
    stats=[
      {label:'Kelompok Tahsin',value:gs.filter(x=>x.subject==='tahsin').length,icon:'tahsin',tone:'emerald'},
      {label:'Kelompok Tahfidz',value:gs.filter(x=>x.subject==='tahfidz').length,icon:'tahfidz',tone:'gold'},
      {label:'Siswa Binaan',value:studentIds.length,icon:'students',tone:'forest'},
      {label:'Absensi Gemar Mengaji',value:att,sub:studentIds.length?`dari ${studentIds.length} siswa`:'hari ini',icon:'attendance',tone:'blue'},
      {label:'Belum Absen',value:Math.max(0,studentIds.length-att),sub:'orang tua belum mengirim',icon:'pending',tone:'amber'},
      {label:'Nilai Perlu Dilengkapi',value:'—',sub:'memeriksa periode aktif',icon:'score',tone:'slate',key:'missing-score'}
    ];
   }else{
    const today=new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Jakarta'});
    const [teachers,students,tahsin,tahfidz,att]=await Promise.all([count('teachers'),count('students'),count('teaching_assignments',q=>q.eq('subject','tahsin').eq('active',true)),count('teaching_assignments',q=>q.eq('subject','tahfidz').eq('active',true)),count('attendance',q=>q.eq('date',today))]);
    stats=[
      {label:'Guru Aktif',value:teachers,icon:'teacher',tone:'forest'},
      {label:'Siswa Aktif',value:students,icon:'students',tone:'emerald'},
      {label:'Kelompok Tahsin',value:tahsin,icon:'tahsin',tone:'blue'},
      {label:'Kelompok Tahfidz',value:tahfidz,icon:'tahfidz',tone:'gold'},
      {label:'Absensi Gemar Mengaji',value:att,sub:'kiriman hari ini',icon:'attendance',tone:'teal'},
      {label:'Nilai Perlu Diperiksa',value:'—',sub:'memeriksa periode aktif',icon:'score',tone:'slate',key:'missing-score'}
    ];
   }
   const quick=teacher?[
     {label:'Kelompok Saya',page:'kelompok-tahsin',icon:'group',hint:'Lihat kelompok aktif'},
     {label:'Absensi',page:'absensi',icon:'attendance',hint:'Pantau absensi siswa'},
     {label:'Penilaian',page:'penilaian',icon:'score',hint:'Isi dan periksa nilai'},
     {label:'Profil',page:'profil',icon:'profile',hint:'Kelola akun saya'}
   ]:[
     {label:'Daftarkan Data',page:'kelola',icon:'register',hint:'Siswa dan guru'},
     {label:'Kelola Tahsin',page:'kelompok-tahsin',icon:'tahsin',hint:'Kelompok Tahsin'},
     {label:'Kelola Tahfidz',page:'kelompok',icon:'tahfidz',hint:'Kelompok Tahfidz'},
     {label:'Absensi',page:'absensi',icon:'attendance',hint:'Rekap kehadiran'},
     {label:'Penilaian',page:'penilaian',icon:'score',hint:'Nilai Tahsin & Tahfidz'},
     {label:'Rapor',page:'rapor',icon:'report',hint:'Kelola dan unduh rapor'},
     {label:'Presentasi',page:'presentasi',icon:'chart',hint:'Ringkasan & laporan'},
     {label:'Pengaturan',page:'pengaturan',icon:'settings',hint:'Sistem dan backup'}
   ];
   const statHtml=stats.map((s,i)=>`<article class="gm-stat-card gm-tone-${s.tone}" ${s.key?`data-gm-stat="${s.key}"`:''} style="--gm-delay:${i*35}ms"><div class="gm-stat-icon">${icon(s.icon)}</div><div class="gm-stat-copy"><span>${s.label}</span><strong>${s.value}</strong>${s.sub?`<small>${s.sub}</small>`:''}</div></article>`).join('');
   const quickHtml=quick.map((x,i)=>`<button class="gm-quick-card" data-gm-page="${x.page}" style="--gm-delay:${i*30}ms"><span class="gm-quick-icon">${icon(x.icon)}</span><span class="gm-quick-copy"><strong>${x.label}</strong><small>${x.hint}</small></span><span class="gm-quick-arrow" aria-hidden="true">→</span></button>`).join('');
   host.innerHTML=`
    <div class="gm-dashboard-main-grid">
      <section class="gm-dashboard-section gm-dashboard-stats">
        <div class="gm-dashboard-section-head"><div><span>Ringkasan</span><h2>Aktivitas hari ini</h2></div><span class="gm-dashboard-date-pill">${todayText}</span></div>
        <div class="gm-stat-grid">${statHtml}</div>
      </section>
      <section class="gm-dashboard-section gm-dashboard-shortcuts">
        <div class="gm-dashboard-section-head"><div><span>Navigasi</span><h2>Akses cepat</h2></div><span class="gm-dashboard-role-chip">${teacher?'Guru':'Koordinator'}</span></div>
        <div class="gm-quick-grid">${quickHtml}</div>
      </section>
    </div>`;
   host.querySelectorAll('[data-gm-page]').forEach(b=>b.onclick=()=>switchPage(b.dataset.gmPage));
   if(window.GMAttention && ['koordinator','guru'].includes(p.role)) void GMAttention.mount(host,{year:yr});
  }catch(e){host.innerHTML=`<div class="gm-panel-card gm-dashboard-error">Ringkasan belum dapat dimuat: ${escapeHtml(e.message)}</div>`}
 }
 async function fetchReports(year,period){const out=[];for(let grade=1;grade<=6;grade++){for(let start=0;;start+=250){const r=await supabase.rpc('report_roster',{yr:year,pr:period,grade,start_at:start});if(r.error)throw r.error;out.push(...(r.data||[]));if((r.data||[]).length<250)break;}}return out}
 function stageLabel(row,subject){const s=row?.[subject]?.scores||{};if(subject==='tahsin'){const t=s.tahsin_progress_type||'';if(t==='BUKU')return `Buku ${s.tahsin_book_number||''}`.trim();if(t==='JILID')return `Jilid ${s.tahsin_jilid||''}`.trim();return t||'Belum Dinilai'}return s.tahfidz_juz?`Juz ${s.tahfidz_juz}`:'Belum Dinilai'}
 async function exportTargets(){await ensureXLSX();const y=Number($('gmReportYear').value),period=$('gmReportPeriod').value,subject=$('gmReportSubject').value,btn=$('gmExportTargets');btn.disabled=true;$('gmReportStatus').textContent='Menyiapkan data...';try{const rows=await fetchReports(y,period);const subjects=subject==='all'?['tahsin','tahfidz']:[subject],wb=XLSX.utils.book_new();for(const sub of subjects){const aoa=[['TARGET '+sub.toUpperCase()],['Tahun Ajaran',`${y}/${y+1}`],['Periode',period],[],['Kelas','Total Murid','Tercapai','Belum Tercapai','% Tercapai','% Belum','Distribusi Capaian']];const by=new Map();for(const r of rows){const k=r.student.class||'-',a=ReportCore.attainment(r[sub]?.scores||{},r.settings?.[sub+'_target'],sub),o=by.get(k)||{n:0,ok:0,no:0,dist:{}};o.n++;if(a==='TERCAPAI')o.ok++;else o.no++;const st=stageLabel(r,sub);o.dist[st]=(o.dist[st]||0)+1;by.set(k,o)}for(const [k,o] of [...by].sort((a,b)=>a[0].localeCompare(b[0],'id',{numeric:true}))){aoa.push([k,o.n,o.ok,o.no,o.n?o.ok/o.n:0,o.n?o.no/o.n:0,Object.entries(o.dist).map(([a,b])=>`${a}: ${b}`).join(' | ')])}const ws=XLSX.utils.aoa_to_sheet(aoa);ws['!cols']=[{wch:14},{wch:12},{wch:12},{wch:15},{wch:14},{wch:12},{wch:55}];for(let r=5;r<aoa.length;r++){for(const c of [4,5])if(ws[XLSX.utils.encode_cell({r,c})])ws[XLSX.utils.encode_cell({r,c})].z='0.0%'}XLSX.utils.book_append_sheet(wb,ws,sub==='tahsin'?'TARGET TAHSIN':'TARGET TAHFIDZ')}
    XLSX.writeFile(wb,`Target Tahsin Tahfidz - ${({pts_ganjil:'PTS Ganjil',pas_ganjil:'PAS Ganjil',pts_genap:'PTS Genap',pas_genap:'PAS Genap'}[period]||period)} - ${y}-${y+1}.xlsx`);$('gmReportStatus').textContent=`Selesai. ${rows.length} siswa diproses.`;
   }catch(e){$('gmReportStatus').textContent=e.message}finally{btn.disabled=false}}
 async function backup(){await ensureXLSX();const btn=$('gmBackupBtn');btn.disabled=true;$('gmBackupStatus').textContent='Menyiapkan backup...';try{const wb=XLSX.utils.book_new();const [students,teachers,groups,members,attendance,assessments]=await Promise.all([getStudents(),getTeachers(),fetchAllRows(()=>supabase.from('teaching_assignments').select('*').order('academic_year_start')),fetchAllRows(()=>supabase.from('assessment_group_members').select('*')),fetchAllRows(()=>supabase.from('attendance').select('*').order('date')),fetchAllRows(()=>supabase.from('subject_assessments').select('*'))]);for(let grade=1;grade<=6;grade++){const data=students.filter(s=>String(s.kelas||'').match(new RegExp(`(^|\\D)${grade}(\\D|$)`)));XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(data),`KELAS ${grade}`)}[['GURU',teachers],['KELOMPOK',groups],['ANGGOTA KELOMPOK',members],['ABSENSI',attendance],['NILAI',assessments]].forEach(([n,d])=>XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(d),n.slice(0,31)));XLSX.writeFile(wb,`Backup Gemar Mengaji - ${new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Jakarta'})}.xlsx`);$('gmBackupStatus').textContent='Backup selesai.'}catch(e){$('gmBackupStatus').textContent=e.message}finally{btn.disabled=false}}
 async function archive(){
  const host=$('page-arsip'); if(!host||!AppAccess.full())return;
  host.innerHTML=`<section class="gm-panel-card">${window.GMUX?.skeletonTable ? window.GMUX.skeletonTable(5,4) : 'Memuat arsip rapor...'}</section>`;
  try{
    const [current,history]=await Promise.all([
      fetchAllRows(()=>supabase.from('student_reports').select('student_id,academic_year_start,period,status,snapshot,approved_at').not('snapshot','is',null).order('academic_year_start',{ascending:false})),
      fetchAllRows(()=>supabase.from('student_report_history').select('id,previous_record,changed_at').order('changed_at',{ascending:false}))
    ]);
    const rows=[];
    for(const r of current){const snap=r.snapshot||{};rows.push({name:snap.student?.name||r.student_id,kelas:snap.student?.class||'-',year:r.academic_year_start,period:r.period,teacher:snap.teachers?.tahsin||snap.tahsin?.teacher_name||'-',date:r.approved_at||''})}
    for(const h of history){const r=h.previous_record||{},snap=r.snapshot||{};if(!snap.student)continue;rows.push({name:snap.student?.name||r.student_id,kelas:snap.student?.class||'-',year:Number(r.academic_year_start||0),period:r.period||'-',teacher:snap.teachers?.tahsin||snap.tahsin?.teacher_name||'-',date:h.changed_at||''})}
    rows.sort((a,b)=>b.year-a.year||a.name.localeCompare(b.name,'id'));
    host.innerHTML=`<section class="gm-panel-card"><div class="section-heading"><div><h2>Arsip Rapor</h2></div><strong>${rows.length} arsip</strong></div><div style="overflow:auto"><table class="gm-compact-table"><thead><tr><th>Siswa</th><th>Kelas</th><th>Tahun Ajaran</th><th>Periode</th><th>Guru Tahsin</th></tr></thead><tbody>${rows.map(r=>`<tr><td>${escapeHtml(r.name)}</td><td>${escapeHtml(r.kelas)}</td><td>${r.year?`${r.year}/${r.year+1}`:'-'}</td><td>${escapeHtml(r.period)}</td><td>${escapeHtml(r.teacher)}</td></tr>`).join('')||'<tr class="gm-table-empty-row"><td colspan="5"><strong>Belum ada arsip rapor</strong><span>Arsip akan muncul setelah rapor difinalkan.</span></td></tr>'}</tbody></table></div></section>`;
  }catch(e){host.innerHTML=`<section class="gm-panel-card">Arsip belum dapat dimuat: ${escapeHtml(e.message)}</section>`}
 }
 function init(){
  if ($('gmReportYear') && !$('gmReportYear').value) $('gmReportYear').value=yearNow();
  for (const [id, callback] of [['gmExportTargets',exportTargets],['gmBackupBtn',backup]]) { const button=$(id); if (button && !button.dataset.gmBound) { button.dataset.gmBound='true'; button.addEventListener('click',callback); } }
 }
 if (window.GMPanel) { GMPanel.onPage('presentasi',init); GMPanel.onPage('pengaturan',init); }
 else document.addEventListener('panelready',init);
 return {dashboard,refreshIdentity,exportTargets,backup,archive};
})();
