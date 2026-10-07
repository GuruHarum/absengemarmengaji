window.GMRev46 = (() => {
  const $ = id => document.getElementById(id);
  const nowYear = () => { const d = new Date(); return d.getFullYear() - (d.getMonth() < 6 ? 1 : 0); };
  const periods = ['pts_ganjil','pas_ganjil','pts_genap','pas_genap'];
  const periodLabel = key => ({pts_ganjil:'PTS Ganjil',pas_ganjil:'PAS Ganjil',pts_genap:'PTS Genap',pas_genap:'PAS Genap'}[key] || key);
  const esc = value => window.escapeHtml ? escapeHtml(value) : String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const gradeOf = value => String(value || '').match(/^\s*(?:kelas\s*)?(\d+)/i)?.[1] || '-';
  const storage = {
    get(key, fallback=null){ try { const raw = localStorage.getItem(key); return raw == null ? fallback : JSON.parse(raw); } catch(_) { return fallback; } },
    set(key, value){ try { localStorage.setItem(key, JSON.stringify(value)); } catch(_){} }
  };

  const FileName = {
    clean(value){ return String(value || '').normalize('NFKC').replace(/[\\/:*?"<>|]+/g,'-').replace(/\s+/g,' ').trim(); },
    period(value){ return periodLabel(value).replace(/\s+/g,'-'); },
    assessment({subject,scope,period,year}){ return `Penilaian ${String(subject||'').toUpperCase()} - ${this.clean(scope)} - ${periodLabel(period)} - ${year}-${Number(year)+1}.xlsx`; },
    report({exam,semester,scope,year,ext='zip'}){ return `Rapor - ${String(exam||'').toUpperCase()} Semester ${semester} - ${this.clean(scope)} - ${year}-${Number(year)+1}.${ext}`; },
    analysis({year,period}){ return `Analitik Target - ${periodLabel(period)} - ${year}-${Number(year)+1}.xlsx`; }
  };
  window.GMFileName = FileName;

  function applyTheme(theme) {
    const resolved = theme === 'system' ? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : theme;
    document.documentElement.dataset.gmTheme = resolved;
    document.documentElement.style.colorScheme = resolved;
    storage.set('gm_theme_v46', theme);
    const button = $('gmThemeToggle');
    if (button) {
      button.setAttribute('aria-pressed', String(resolved === 'dark'));
      button.title = resolved === 'dark' ? 'Gunakan mode terang' : 'Gunakan mode gelap';
      button.innerHTML = resolved === 'dark'
        ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 3v2M12 19v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M3 12h2M19 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4"/><circle cx="12" cy="12" r="4"/></svg><span class="sr-only">Mode terang</span>'
        : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M20 15.2A8.5 8.5 0 0 1 8.8 4 8.5 8.5 0 1 0 20 15.2Z"/></svg><span class="sr-only">Mode gelap</span>';
    }
    try { refreshPresentationChartTheme(); } catch(_) {}
  }

  function mountThemeToggle() {
    const actions = document.querySelector('.admin-account-actions');
    if (!actions || $('gmThemeToggle')) return;
    const button = document.createElement('button');
    button.id = 'gmThemeToggle'; button.type = 'button'; button.className = 'admin-icon-button gm-theme-toggle'; button.setAttribute('aria-label','Ganti tema');
    button.addEventListener('click', () => {
      const current = document.documentElement.dataset.gmTheme || 'light';
      applyTheme(current === 'dark' ? 'light' : 'dark');
    });
    actions.insertBefore(button, actions.firstChild);
    applyTheme(storage.get('gm_theme_v46','system'));
    matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => { if (storage.get('gm_theme_v46','system') === 'system') applyTheme('system'); });
  }

  async function fetchAll(factory){
    if (window.fetchAllRows) return fetchAllRows(factory);
    const out=[]; for(let from=0;;from+=1000){ const q=factory().range(from,from+999); const r=await q; if(r.error) throw r.error; out.push(...(r.data||[])); if((r.data||[]).length<1000) break; } return out;
  }

  const CacheV49 = (() => {
    const DB_NAME='gm-presentasi-cache-v49', STORE='entries', VERSION=1;
    const memory=new Map();
    let dbPromise=null;
    function open(){
      if(!('indexedDB' in window)) return Promise.resolve(null);
      if(dbPromise) return dbPromise;
      dbPromise=new Promise(resolve=>{
        try{
          const req=indexedDB.open(DB_NAME,VERSION);
          req.onupgradeneeded=()=>{ const db=req.result; if(!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE,{keyPath:'key'}); };
          req.onsuccess=()=>resolve(req.result);
          req.onerror=()=>resolve(null);
        }catch(_){ resolve(null); }
      });
      return dbPromise;
    }
    async function get(key,maxAge=Infinity){
      const now=Date.now(), mem=memory.get(key);
      if(mem && now-mem.at<=maxAge) return mem.value;
      const db=await open(); if(!db) return null;
      return new Promise(resolve=>{
        try{
          const req=db.transaction(STORE,'readonly').objectStore(STORE).get(key);
          req.onsuccess=()=>{ const row=req.result; if(!row || now-row.at>maxAge) return resolve(null); memory.set(key,row); resolve(row.value); };
          req.onerror=()=>resolve(null);
        }catch(_){ resolve(null); }
      });
    }
    async function set(key,value){
      const row={key,at:Date.now(),value}; memory.set(key,row);
      const db=await open(); if(!db) return;
      await new Promise(resolve=>{
        try{ const req=db.transaction(STORE,'readwrite').objectStore(STORE).put(row); req.onsuccess=req.onerror=()=>resolve(); }
        catch(_){ resolve(); }
      });
    }
    return {get,set};
  })();

  const reportCache = new Map();
  const presentationCacheInfo={report:'live',students:'live',attendanceCached:0,attendanceLive:0};
  function reportCacheTtl(year, period){
    const activeYear=nowYear(), current=smartCurrentPeriod();
    if(Number(year)<activeYear) return 24*60*60*1000;
    if(Number(year)>activeYear) return 5*60*1000;
    const p=periods.indexOf(period), c=periods.indexOf(current);
    return p>=0 && c>=0 && p<c ? 12*60*60*1000 : 10*60*1000;
  }
  async function reportRows(year, period){
    const key=`${year}|${period}`, ttl=reportCacheTtl(year,period);
    const cached=reportCache.get(key);
    if(cached && Date.now()-cached.at < ttl){ presentationCacheInfo.report='memory'; return cached.rows; }
    const persistent=await CacheV49.get(`report:${key}`,ttl);
    if(Array.isArray(persistent)){ reportCache.set(key,{at:Date.now(),rows:persistent}); presentationCacheInfo.report='local'; return persistent; }
    const gradeRows=await Promise.all([1,2,3,4,5,6].map(async grade=>{
      const rows=[];
      for(let start=0;;start+=250){
        const r=await supabase.rpc('report_roster',{yr:Number(year),pr:period,grade,start_at:start});
        if(r.error) throw r.error;
        rows.push(...(r.data||[]));
        if((r.data||[]).length<250) break;
      }
      return rows;
    }));
    const rows=gradeRows.flat();
    reportCache.set(key,{at:Date.now(),rows});
    presentationCacheInfo.report='live';
    CacheV49.set(`report:${key}`,rows);
    return rows;
  }

  function aggregateTargets(rows, subject='tahsin'){
    const byGrade = new Map(), byClass = new Map();
    for(const row of rows){
      const actual=row?.[subject]?.scores||{}; const target=row?.settings?.[subject+'_target'];
      let status='BELUM DINILAI';
      try { status=ReportCore.attainment(actual,target,subject); } catch(_){}
      const add=(map,key)=>{ const o=map.get(key)||{total:0,reached:0,notReached:0,unrated:0}; o.total++; if(status==='TERCAPAI')o.reached++; else if(status==='BELUM TERCAPAI')o.notReached++; else o.unrated++; map.set(key,o); };
      add(byGrade,gradeOf(row?.student?.class)); add(byClass,row?.student?.class||'-');
    }
    return {byGrade,byClass};
  }

  function targetTable(agg){
    return [...agg.entries()].sort((a,b)=>String(a[0]).localeCompare(String(b[0]),'id',{numeric:true})).map(([key,o])=>{
      const denom=o.reached+o.notReached; const pct=denom?o.reached/denom*100:0;
      return `<tr><td>${esc(key)}</td><td>${o.total}</td><td><strong>${o.reached}</strong></td><td>${o.notReached}</td><td>${o.unrated}</td><td>${pct.toFixed(1).replace('.',',')}%</td></tr>`;
    }).join('');
  }

  let analyticCharts=[];
  function clearCharts(){ analyticCharts.splice(0).forEach(c=>{try{c.destroy()}catch(_){}}); }
  function makeBar(canvas, labels, reached, notReached, title){
    if(!canvas || !window.Chart) return;
    const c=new Chart(canvas,{type:'bar',data:{labels,datasets:[{label:'Tercapai',data:reached},{label:'Belum tercapai',data:notReached}]},options:{responsive:true,maintainAspectRatio:false,plugins:{title:{display:true,text:title},legend:{position:'bottom'}},scales:{x:{stacked:true},y:{stacked:true,beginAtZero:true,ticks:{precision:0}}}}});
    analyticCharts.push(c);
  }

  async function loadAnalytics(){
    if(AppAccess.profile?.role!=='koordinator') return;
    const host=$('gmAnalyticsBody'), status=$('gmAnalyticsStatus'); if(!host) return;
    const year=Number($('gmAnalyticsYear')?.value||nowYear()), p1=$('gmAnalyticsPeriodA')?.value||'pts_ganjil', p2=$('gmAnalyticsPeriodB')?.value||'pas_ganjil', subject=$('gmAnalyticsSubject')?.value||'tahsin';
    status.textContent='Memuat perbandingan periode...'; host.innerHTML='<div class="gm-rev46-skeleton"><span></span><span></span><span></span></div>'; clearCharts();
    try{
      const historyRows = await Promise.all(periods.map(period => reportRows(year, period)));
      const historyAgg = historyRows.map(rows => aggregateTargets(rows, subject));
      const a = historyRows[periods.indexOf(p1)] || [], b = historyRows[periods.indexOf(p2)] || [];
      const aa=aggregateTargets(a,subject), bb=aggregateTargets(b,subject);
      const sum=agg=>[...agg.byGrade.values()].reduce((o,x)=>({total:o.total+x.total,reached:o.reached+x.reached,notReached:o.notReached+x.notReached,unrated:o.unrated+x.unrated}),{total:0,reached:0,notReached:0,unrated:0});
      const sa=sum(aa), sb=sum(bb), rate=s=>{const d=s.reached+s.notReached;return d?s.reached/d*100:0};
      host.innerHTML=`
        <div class="gm-analytics-kpis">
          <article><span>${esc(periodLabel(p1))}</span><strong>${sa.reached}</strong><small>tercapai · ${rate(sa).toFixed(1).replace('.',',')}%</small></article>
          <article><span>${esc(periodLabel(p2))}</span><strong>${sb.reached}</strong><small>tercapai · ${rate(sb).toFixed(1).replace('.',',')}%</small></article>
          <article><span>Perubahan jumlah tercapai</span><strong>${sb.reached-sa.reached>=0?'+':''}${sb.reached-sa.reached}</strong><small>tanpa menampilkan identitas siswa</small></article>
        </div>
        <div class="gm-analytics-grid">
          <div class="gm-analytics-chart-card"><canvas id="gmAnalyticsCompareChart" height="280"></canvas></div>
          <div class="gm-analytics-chart-card"><canvas id="gmAnalyticsHistoryChart" height="280"></canvas></div>
        </div>
        <section class="gm-panel-card"><h3>Riwayat ketercapaian sepanjang tahun ajaran</h3><p class="assessment-help">Hanya menampilkan jumlah siswa yang tercapai, belum tercapai, dan belum dinilai. Tidak ada nama siswa.</p><div class="gm-table-wrap"><table class="gm-compact-table"><thead><tr><th>Periode</th><th>Tercapai</th><th>Belum tercapai</th><th>Belum dinilai</th><th>% tercapai</th></tr></thead><tbody>${historyAgg.map((agg,i)=>{const x=sum(agg);const d=x.reached+x.notReached;return `<tr><td>${esc(periodLabel(periods[i]))}</td><td>${x.reached}</td><td>${x.notReached}</td><td>${x.unrated}</td><td>${(d?x.reached/d*100:0).toFixed(1).replace('.',',')}%</td></tr>`}).join('')}</tbody></table></div></section>
        <div class="gm-analytics-grid">
          <section class="gm-panel-card"><h3>${esc(periodLabel(p1))} per tingkat</h3><div class="gm-table-wrap"><table class="gm-compact-table"><thead><tr><th>Tingkat</th><th>Total</th><th>Tercapai</th><th>Belum</th><th>Belum dinilai</th><th>%</th></tr></thead><tbody>${targetTable(aa.byGrade)}</tbody></table></div></section>
          <section class="gm-panel-card"><h3>${esc(periodLabel(p2))} per tingkat</h3><div class="gm-table-wrap"><table class="gm-compact-table"><thead><tr><th>Tingkat</th><th>Total</th><th>Tercapai</th><th>Belum</th><th>Belum dinilai</th><th>%</th></tr></thead><tbody>${targetTable(bb.byGrade)}</tbody></table></div></section>
        </div>`;
      const grades=['1','2','3','4','5','6'];
      makeBar($('gmAnalyticsCompareChart'),grades,grades.map(g=>bb.byGrade.get(g)?.reached||0),grades.map(g=>bb.byGrade.get(g)?.notReached||0),`${periodLabel(p2)} · ${subject.toUpperCase()}`);
      if ($('gmAnalyticsHistoryChart') && window.Chart) {
        const totals = historyAgg.map(agg => sum(agg));
        const chart = new Chart($('gmAnalyticsHistoryChart'), {
          type: 'line',
          data: { labels: periods.map(periodLabel), datasets: [
            { label:'Tercapai', data:totals.map(x=>x.reached), tension:.28, fill:false },
            { label:'Belum tercapai', data:totals.map(x=>x.notReached), tension:.28, fill:false }
          ]},
          options:{responsive:true,maintainAspectRatio:false,plugins:{title:{display:true,text:`Riwayat ${subject.toUpperCase()} 1 Tahun Ajaran`},legend:{position:'bottom'}},scales:{y:{beginAtZero:true,ticks:{precision:0}}}}
        });
        analyticCharts.push(chart);
      }
      status.textContent=`Perbandingan ${periodLabel(p1)} dan ${periodLabel(p2)} · Tahun Ajaran ${year}/${year+1}`;
    }catch(e){ host.innerHTML=`<div class="gm-panel-card gm-error-card">Analitik belum dapat dimuat: ${esc(e.message)}</div>`; status.textContent='Gagal memuat analitik.'; }
  }

  function monthContext(){
    const todayText = new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Jakarta'});
    const [year,month,day] = todayText.split('-').map(Number);
    const first = `${year}-${String(month).padStart(2,'0')}-01`;
    const nextDate = new Date(Date.UTC(year, month, 1));
    const next = `${nextDate.getUTCFullYear()}-${String(nextDate.getUTCMonth()+1).padStart(2,'0')}-01`;
    const daysInMonth = new Date(year,month,0).getDate();
    const monthLabel = new Intl.DateTimeFormat('id-ID',{month:'long',year:'numeric',timeZone:'Asia/Jakarta'}).format(new Date(`${first}T12:00:00+07:00`));
    return {year,month,day,first,next,daysInMonth,todayText,monthLabel};
  }

  function academicYearMonthContexts(startYear){
    const todayText = new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Jakarta'});
    const out=[];
    for(let offset=0;offset<12;offset++){
      const d=new Date(Date.UTC(Number(startYear),6+offset,1));
      const year=d.getUTCFullYear(), month=d.getUTCMonth()+1;
      const first=`${year}-${String(month).padStart(2,'0')}-01`;
      const nextDate=new Date(Date.UTC(year,month,1));
      const next=`${nextDate.getUTCFullYear()}-${String(nextDate.getUTCMonth()+1).padStart(2,'0')}-01`;
      const daysInMonth=new Date(year,month,0).getDate();
      const monthLabel=new Intl.DateTimeFormat('id-ID',{month:'short',year:'2-digit',timeZone:'Asia/Jakarta'}).format(new Date(`${first}T12:00:00+07:00`));
      const fullMonthLabel=new Intl.DateTimeFormat('id-ID',{month:'long',year:'numeric',timeZone:'Asia/Jakarta'}).format(new Date(`${first}T12:00:00+07:00`));
      out.push({year,month,day:1,first,next,daysInMonth,todayText,monthLabel,fullMonthLabel});
    }
    return out;
  }
  function attendanceAcademicSeries(roster, attendance, startYear){
    const months=academicYearMonthContexts(startYear);
    const points=months.map(context=>{
      if(context.first>context.todayText) return {context,summary:null,rate:null};
      const summary=attendanceSummary(roster,attendance,context);
      return {context,summary,rate:summary.all.total?summary.all.averagePct:null};
    });
    const available=points.filter(point=>point.summary);
    const latest=available.at(-1)||points[0];
    return {months:points,latest};
  }
  const norm = value => String(value ?? '').trim().toLowerCase().replace(/\s+/g,' ');
  const studentName = student => student?.['nama siswa'] || student?.nama_siswa || student?.nama || student?.student_name || '';
  const studentClass = student => student?.kelas || student?.class_name || student?.kelas_nama || '';
  const studentTeacher = student => student?.['nama guru'] || student?.nama_guru || student?.teacher || student?.teacher_name || '';
  const attendanceCode = value => {
    const s=norm(value);
    if(['hadir','h'].includes(s)) return 'h';
    if(['sakit','s'].includes(s)) return 's';
    if(['izin','i'].includes(s)) return 'i';
    if(['alfa','alpha','a','-'].includes(s)) return 'a';
    return 'a';
  };
  function attendanceSummary(roster, attendance, context){
    const byIdDate=new Map(), byLegacyExact=new Map(), byLegacyStudentDate=new Map();
    for(const record of attendance){
      if(!record) continue;
      const date=String(record.date||record.tanggal||'').slice(0,10); if(!date) continue;
      if(record.student_id!=null) byIdDate.set(`${date}|${record.student_id}`,record);
      const name=norm(record.nama_siswa||record.student||record.student_name), cls=norm(record.class||record.kelas||record.class_name), teacher=norm(record.nama_guru||record.teacher||record.teacher_name);
      if(name){ byLegacyExact.set(`${date}|${name}|${teacher}|${cls}`,record); byLegacyStudentDate.set(`${date}|${name}|${cls}`,record); }
    }
    const fresh=()=>({students:0,sumStudentPct:0,h:0,s:0,i:0,a:0,total:0,averagePct:0});
    const byGrade=new Map(['1','2','3','4','5','6'].map(g=>[g,fresh()]));
    const all=fresh();
    const pad=n=>String(n).padStart(2,'0');
    for(const student of roster){
      const grade=gradeOf(studentClass(student)); if(!byGrade.has(grade)) continue;
      const counts={h:0,s:0,i:0,a:0,total:0};
      const name=norm(studentName(student)), cls=norm(studentClass(student)), teacher=norm(studentTeacher(student));
      for(let d=1;d<=context.daysInMonth;d++){
        const date=`${context.year}-${pad(context.month)}-${pad(d)}`;
        if(date>context.todayText) continue;
        let record=student?.id!=null?byIdDate.get(`${date}|${student.id}`):null;
        if(!record && name) record=byLegacyExact.get(`${date}|${name}|${teacher}|${cls}`);
        if(!record && name) record=byLegacyStudentDate.get(`${date}|${name}|${cls}`);
        const code=record?attendanceCode(record.status):'a'; counts[code]++; counts.total++;
      }
      const studentPct=counts.total?Math.round(counts.h/counts.total*100):0;
      for(const bucket of [all,byGrade.get(grade)]){
        bucket.students++; bucket.sumStudentPct+=studentPct;
        bucket.h+=counts.h; bucket.s+=counts.s; bucket.i+=counts.i; bucket.a+=counts.a; bucket.total+=counts.total;
      }
    }
    for(const bucket of [all,...byGrade.values()]) bucket.averagePct=bucket.students?bucket.sumStudentPct/bucket.students:0;
    return {all,byGrade};
  }

  const stageOrder=['Buku 1','Buku 2','Buku 3','Jilid 4','Jilid Juz 27',"Al-Qur'an",'Gharib','Tajwid','Finishing','Syahadah','Takhassus','Belum ditentukan'];
  function tahsinStage(scores={}){
    const v=window.ReportCore?.legacy?ReportCore.legacy(scores):scores;
    const type=String(v?.tahsin_progress_type||'').toUpperCase();
    if(type==='BUKU' && [1,2,3].includes(Number(v.tahsin_book_number))) return `Buku ${Number(v.tahsin_book_number)}`;
    if(type==='JILID') return String(v.tahsin_jilid||'').toUpperCase()==='JUZ 27'?'Jilid Juz 27':`Jilid ${v.tahsin_jilid||'-'}`;
    if(type==="AL-QUR'AN") return "Al-Qur'an";
    if(type==='GHARIB') return 'Gharib';
    if(type==='TAJWID') return 'Tajwid';
    if(type==='FINISHING') return 'Finishing';
    if(type==='SYAHADAH') return 'Syahadah';
    if(type==='TAKHASSUS') return 'Takhassus';
    return 'Belum ditentukan';
  }
  function aggregateTahsinStages(rows){
    const out=new Map(['1','2','3','4','5','6'].map(g=>[g,{total:0,stages:new Map()}]));
    for(const row of rows){
      const g=gradeOf(row?.student?.class); if(!out.has(g)) continue;
      const label=tahsinStage(row?.tahsin?.scores||{}), o=out.get(g); o.total++; o.stages.set(label,(o.stages.get(label)||0)+1);
    }
    return out;
  }
  function orderedStageEntries(o){
    const entries=[...(o?.stages||new Map()).entries()];
    return entries.sort((a,b)=>{
      const ai=stageOrder.indexOf(a[0]), bi=stageOrder.indexOf(b[0]);
      return (ai<0?999:ai)-(bi<0?999:bi)||String(a[0]).localeCompare(String(b[0]),'id');
    });
  }
  function dominantStage(o){
    const entries=orderedStageEntries(o).filter(([,n])=>n>0); if(!entries.length) return '-';
    entries.sort((a,b)=>b[1]-a[1]||stageOrder.indexOf(a[0])-stageOrder.indexOf(b[0])); return entries[0][0];
  }
  function pctText(value){ return `${Number(value||0).toFixed(1).replace('.',',')}%`; }
  function targetPct(o={}){ const d=(o.reached||0)+(o.notReached||0); return d?(o.reached||0)/d*100:0; }
  function presentationPalette(){
    const st=getComputedStyle(document.documentElement), dark=document.documentElement.dataset.gmTheme==='dark';
    return {
      text:st.getPropertyValue('--gm-text').trim()||(dark?'#e8f1ec':'#213c32'),
      muted:st.getPropertyValue('--gm-muted').trim()||(dark?'#a9bdb4':'#64766e'),
      grid:dark?'rgba(220,235,227,.10)':'rgba(41,77,63,.10)',
      reached:'#2f7d63', notReached:'#d7a247',
      h:'#2f7d63', s:'#d7a247', i:'#4d7fbf', a:'#b95e58'
    };
  }
  const presentationGroupColors=['#2f7d63','#4d7fbf','#8266c7','#d58a3a','#c75e78','#2d8f9f','#8a6b44','#637284','#a7679b','#55824c'];
  const hexToRgba=(hex,alpha=.28)=>{
    const raw=String(hex||'').replace('#',''); if(raw.length!==6) return `rgba(99,115,129,${alpha})`;
    const n=parseInt(raw,16); return `rgba(${(n>>16)&255},${(n>>8)&255},${n&255},${alpha})`;
  };
  function targetCountLegend(id,entries){
    const host=$(id); if(!host) return;
    host.innerHTML=entries.map(([label,o],index)=>{
      const color=presentationGroupColors[index%presentationGroupColors.length];
      return `<div class="gm-target-count-item"><i style="background:${color}" aria-hidden="true"></i><strong>${esc(label)}</strong><span><b>${o?.reached||0}</b> tercapai · <b>${o?.notReached||0}</b> belum tercapai</span></div>`;
    }).join('');
  }

  function chartOptions({stacked=false,horizontal=false}={}){
    const p=presentationPalette();
    return {responsive:true,maintainAspectRatio:false,indexAxis:horizontal?'y':'x',animation:{duration:900,easing:'easeOutQuart'},plugins:{legend:{position:'bottom',labels:{color:p.text,usePointStyle:true,boxWidth:8,boxHeight:8,padding:16}}},scales:{x:{stacked,beginAtZero:true,ticks:{color:p.muted,precision:0},grid:{color:p.grid}},y:{stacked,beginAtZero:true,ticks:{color:p.muted,precision:0},grid:{color:p.grid}}}};
  }
  let presentationCharts=[];
  const presentationChartMap=new Map();
  function clearPresentationCharts(){ presentationCharts.splice(0).forEach(c=>{try{c.destroy()}catch(_){}}); presentationChartMap.clear(); }
  function refreshPresentationChartTheme(){
    const p=presentationPalette();
    for(const chart of [...analyticCharts,...presentationCharts]){
      try{
        if(chart.options?.plugins?.legend?.labels) chart.options.plugins.legend.labels.color=p.text;
        if(chart.options?.plugins?.title) chart.options.plugins.title.color=p.text;
        for(const axis of ['x','y']) if(chart.options?.scales?.[axis]){ chart.options.scales[axis].ticks.color=p.muted; chart.options.scales[axis].grid.color=p.grid; }
        chart.update('none');
      }catch(_){}
    }
  }
  function targetChart(id,agg,title,legendId){
    if(presentationChartMap.has(id)||!window.Chart) return;
    const el=$(id); if(!el) return;
    const grades=['1','2','3','4','5','6'], p=presentationPalette();
    const entries=grades.map(g=>[`Tingkat ${g}`,agg.byGrade.get(g)||{reached:0,notReached:0}]);
    const solid=grades.map((_,i)=>presentationGroupColors[i%presentationGroupColors.length]);
    const soft=solid.map(color=>hexToRgba(color,.26));
    const options=chartOptions({stacked:false});
    options.animation={duration:1050,easing:'easeOutQuart'};
    options.datasets={bar:{maxBarThickness:34,categoryPercentage:.72,barPercentage:.82}};
    options.plugins={...options.plugins,title:{display:false,text:title},tooltip:{callbacks:{afterLabel:ctx=>{const g=grades[ctx.dataIndex],o=agg.byGrade.get(g)||{};return `Persentase tercapai: ${pctText(targetPct(o))}`;}}}};
    const chart=new Chart(el,{type:'bar',data:{labels:grades.map(g=>'Tingkat '+g),datasets:[
      {label:'Tercapai',data:grades.map(g=>agg.byGrade.get(g)?.reached||0),backgroundColor:solid,borderColor:solid,borderWidth:0,borderRadius:7,borderSkipped:false},
      {label:'Belum tercapai',data:grades.map(g=>agg.byGrade.get(g)?.notReached||0),backgroundColor:soft,borderColor:solid,borderWidth:1,borderRadius:7,borderSkipped:false}
    ]},options});
    presentationCharts.push(chart); presentationChartMap.set(id,chart);
    targetCountLegend(legendId,entries);
  }
  function destroyPresentationChart(id){
    const chart=presentationChartMap.get(id); if(!chart) return;
    try{chart.destroy()}catch(_){}
    presentationChartMap.delete(id);
    const index=presentationCharts.indexOf(chart); if(index>=0) presentationCharts.splice(index,1);
  }
  function classEntriesForGrade(agg,grade){
    return [...agg.byClass.entries()].filter(([name])=>gradeOf(name)===String(grade)).sort((a,b)=>String(a[0]).localeCompare(String(b[0]),'id',{numeric:true}));
  }
  function classTargetChart(id,agg,grade,emptyId,legendId){
    if(!window.Chart) return;
    destroyPresentationChart(id);
    const el=$(id), empty=$(emptyId); if(!el) return;
    const entries=classEntriesForGrade(agg,grade), p=presentationPalette();
    if(empty){ empty.hidden=entries.length>0; empty.textContent=entries.length?'':`Belum ada data kelas untuk Tingkat ${grade}.`; }
    el.hidden=!entries.length;
    const legend=$(legendId); if(legend) legend.innerHTML='';
    if(!entries.length) return;
    const shell=el.closest('.gm-class-chart-shell'); if(shell) shell.style.height=`${Math.max(250,120+entries.length*42)}px`;
    const solid=entries.map((_,i)=>presentationGroupColors[i%presentationGroupColors.length]);
    const soft=solid.map(color=>hexToRgba(color,.26));
    const options=chartOptions({stacked:false,horizontal:true});
    options.animation={duration:1000,easing:'easeOutQuart'};
    options.datasets={bar:{maxBarThickness:24,categoryPercentage:.72,barPercentage:.82}};
    options.plugins={...options.plugins,tooltip:{callbacks:{afterLabel:ctx=>{const o=entries[ctx.dataIndex]?.[1]||{};return `Persentase tercapai: ${pctText(targetPct(o))}`;}}}};
    const chart=new Chart(el,{type:'bar',data:{labels:entries.map(([name])=>name),datasets:[
      {label:'Tercapai',data:entries.map(([,o])=>o.reached||0),backgroundColor:solid,borderColor:solid,borderWidth:0,borderRadius:6,borderSkipped:false},
      {label:'Belum tercapai',data:entries.map(([,o])=>o.notReached||0),backgroundColor:soft,borderColor:solid,borderWidth:1,borderRadius:6,borderSkipped:false}
    ]},options});
    presentationCharts.push(chart); presentationChartMap.set(id,chart);
    targetCountLegend(legendId,entries);
  }
  function attendanceChart(id,series){
    if(presentationChartMap.has(id)||!window.Chart) return;
    const el=$(id); if(!el) return; const p=presentationPalette();
    const compact=matchMedia('(max-width: 640px)').matches;
    const labels=series.months.map(point=>compact
      ? new Intl.DateTimeFormat('id-ID',{month:'short',timeZone:'Asia/Jakarta'}).format(new Date(`${point.context.first}T12:00:00+07:00`))
      : point.context.monthLabel);
    const values=series.months.map(point=>point.rate==null?null:Number(point.rate.toFixed(1)));
    const options=chartOptions({stacked:false});
    options.scales.y={beginAtZero:true,max:100,ticks:{color:p.muted,callback:v=>`${v}%`,font:{size:compact?9:11}},grid:{color:p.grid}};
    options.scales.x={ticks:{color:p.muted,maxRotation:0,minRotation:0,autoSkip:compact,maxTicksLimit:compact?6:12,font:{size:compact?9:11}},grid:{display:false}};
    options.animation={duration:1100,easing:'easeOutQuart'};
    options.plugins={...options.plugins,legend:{display:false},tooltip:{callbacks:{title:items=>{const idx=items?.[0]?.dataIndex??0;return series.months[idx]?.context?.fullMonthLabel||labels[idx];},label:ctx=>ctx.raw==null?'Belum berjalan':`Kehadiran: ${Number(ctx.raw).toFixed(1).replace('.',',')}%`}}};
    const chart=new Chart(el,{type:'bar',data:{labels,datasets:[{label:'Kehadiran Gemar Mengaji',data:values,backgroundColor:series.months.map((_,i)=>presentationGroupColors[i%presentationGroupColors.length]),borderRadius:8,borderSkipped:false,maxBarThickness:compact?24:34}]},options});
    presentationCharts.push(chart); presentationChartMap.set(id,chart);
    const strip=$('gmPresentationAttendanceMonths');
    if(strip) strip.innerHTML=series.months.map((point,index)=>`<div class="gm-month-chip" style="--gm-month-color:${presentationGroupColors[index%presentationGroupColors.length]}"><span>${esc(point.context.monthLabel)}</span><strong>${point.rate==null?'—':pctText(point.rate)}</strong></div>`).join('');
  }
  function stagePane(grade,o){
    const total=o?.total||0, entries=orderedStageEntries(o).filter(([,count])=>count>0);
    if(!entries.length) return `<div class="gm-presentation-empty">Belum ada capaian Tahsin yang dapat diringkas untuk Tingkat ${grade} pada periode ini.</div>`;
    const rows=entries.map(([label,count],index)=>{ const p=total?count/total*100:0; return `<div class="gm-stage-row" data-stage-index="${index}"><div class="gm-stage-copy"><strong>${esc(label)}</strong><span>${count} siswa · ${pctText(p)}</span></div><div class="gm-stage-meter"><i style="--gm-stage-width:${Math.max(0,Math.min(100,p)).toFixed(2)}%"></i></div></div>`; }).join('');
    const legend=entries.map(([label,count])=>`<span><i aria-hidden="true"></i><strong>${esc(label)}</strong> ${count}</span>`).join('');
    return `<div class="gm-stage-pane" data-grade="${grade}" ${grade==='1'?'':'hidden'}><div class="gm-stage-pane-head"><div><span>Tingkat ${grade}</span><strong>${total} siswa</strong></div></div><div class="gm-stage-rows">${rows}</div><div class="gm-stage-legend" aria-label="Legenda capaian Tahsin">${legend}</div></div>`;
  }
  function attendanceGradeRows(summary){
    return ['1','2','3','4','5','6'].map(g=>{ const o=summary.byGrade.get(g)||{h:0,s:0,i:0,a:0,total:0,averagePct:0,students:0}; const q=k=>o.total?o[k]/o.total*100:0; return `<div class="gm-attendance-grade"><div class="gm-attendance-grade-head"><strong>Tingkat ${g}</strong><span>${pctText(o.averagePct)} hadir · ${o.students} siswa</span></div><div class="gm-attendance-stack" aria-label="Komposisi absensi Gemar Mengaji tingkat ${g}"><i class="is-h" style="--gm-stack:${q('h').toFixed(2)}%"></i><i class="is-s" style="--gm-stack:${q('s').toFixed(2)}%"></i><i class="is-i" style="--gm-stack:${q('i').toFixed(2)}%"></i><i class="is-a" style="--gm-stack:${q('a').toFixed(2)}%"></i></div><small>H ${o.h} · S ${o.s} · I ${o.i} · A ${o.a}</small></div>`; }).join('');
  }
  async function presentationStudents(){
    if(typeof studentsData!=='undefined' && Array.isArray(studentsData) && studentsData.length){
      presentationCacheInfo.students='memory';
      CacheV49.set('students:all',studentsData);
      return studentsData;
    }
    const cached=await CacheV49.get('students:all',30*60*1000);
    if(Array.isArray(cached) && cached.length){ presentationCacheInfo.students='local'; return cached; }
    const rows=await fetchAll(()=>supabase.from('students').select('*'));
    presentationCacheInfo.students='live';
    CacheV49.set('students:all',rows);
    return rows;
  }

  async function mapLimit(items,limit,worker){
    const out=new Array(items.length); let cursor=0;
    const runners=Array.from({length:Math.min(limit,items.length)},async()=>{
      while(true){ const index=cursor++; if(index>=items.length) return; out[index]=await worker(items[index],index); }
    });
    await Promise.all(runners); return out;
  }

  async function attendanceMonthRecords(context){
    if(context.first>context.todayText) return [];
    const monthKey=context.first.slice(0,7), currentKey=context.todayText.slice(0,7);
    const isCurrent=monthKey===currentKey;
    // Bulan yang sudah selesai berubah sangat jarang, jadi disimpan lebih lama di IndexedDB.
    // Bulan berjalan tetap pendek agar absensi Gemar Mengaji yang baru cepat ikut terbaca.
    const ttl=isCurrent?2*60*1000:30*24*60*60*1000;
    const cacheKey=`attendance:${monthKey}`;
    const cached=await CacheV49.get(cacheKey,ttl);
    if(Array.isArray(cached)){
      presentationCacheInfo.attendanceCached++;
      return cached;
    }
    const rows=await fetchAll(()=>supabase.from('attendance').select('*').gte('date',context.first).lt('date',context.next));
    presentationCacheInfo.attendanceLive++;
    CacheV49.set(cacheKey,rows);
    return rows;
  }

  async function presentationAttendanceSeries(roster,startYear){
    const months=academicYearMonthContexts(startYear);
    const active=months.filter(context=>context.first<=context.todayText);
    const chunks=await mapLimit(active,3,attendanceMonthRecords);
    const monthlyRecords=new Map(active.map((context,index)=>[context.first,chunks[index]||[]]));
    const points=months.map(context=>{
      if(context.first>context.todayText) return {context,summary:null,rate:null};
      const summary=attendanceSummary(roster,monthlyRecords.get(context.first)||[],context);
      return {context,summary,rate:summary.all.total?summary.all.averagePct:null};
    });
    const available=points.filter(point=>point.summary);
    return {months:points,latest:available.at(-1)||points[0]};
  }

  function setPresentationLoadButton(state){
    const button=$('gmPresentationLoad'); if(!button) return;
    button.classList.remove('is-loading','is-loaded');
    button.disabled=false;
    if(state==='loading'){
      button.disabled=true; button.classList.add('is-loading');
      button.innerHTML='<span class="gm-button-spinner" aria-hidden="true"></span><span>Memuat Data...</span>';
    }else if(state==='loaded'){
      button.classList.add('is-loaded');
      button.innerHTML='<span aria-hidden="true">✓</span><span>Data Sudah Ditampilkan</span>';
    }else{
      button.textContent='Tampilkan Data';
    }
  }

  function resetPresentationLoadButton(){ setPresentationLoadButton('idle'); }

  async function loadPresentation(){
    if(AppAccess.profile?.role!=='koordinator') return;
    const host=$('gmPresentationBody'), status=$('gmPresentationStatus'); if(!host) return;
    const year=Number($('gmPresentationYear')?.value||nowYear()), period=$('gmPresentationPeriod')?.value||'pts_ganjil';
    presentationCacheInfo.report='live'; presentationCacheInfo.students='live'; presentationCacheInfo.attendanceCached=0; presentationCacheInfo.attendanceLive=0;
    setPresentationLoadButton('loading');
    status.textContent='Menyiapkan data presentasi...'; host.innerHTML='<div class="gm-rev46-skeleton"><span></span><span></span><span></span></div>'; clearPresentationCharts();
    try{
      const [rows,students]=await Promise.all([
        reportRows(year,period),
        presentationStudents()
      ]);
      const roster=students.filter(s=>['1','2','3','4','5','6'].includes(gradeOf(studentClass(s))));
      const months=academicYearMonthContexts(year);
      status.textContent='Menyiapkan riwayat Absensi Gemar Mengaji...';
      const attendanceSeries=await presentationAttendanceSeries(roster,year);
      const latestPoint=attendanceSeries.latest;
      const attendanceAgg=latestPoint?.summary||attendanceSummary(roster,[],months[0]);
      const latestContext=latestPoint?.context||months[0];
      const tahsin=aggregateTargets(rows,'tahsin'), tahfidz=aggregateTargets(rows,'tahfidz'), stages=aggregateTahsinStages(rows);
      const totalAgg=agg=>[...agg.byGrade.values()].reduce((o,x)=>({reached:o.reached+x.reached,notReached:o.notReached+x.notReached,unrated:o.unrated+x.unrated,total:o.total+x.total}),{reached:0,notReached:0,unrated:0,total:0});
      const ts=totalAgg(tahsin), tf=totalAgg(tahfidz), pct=x=>targetPct(x);
      const overallAtt=attendanceAgg.all;
      const gradeTable=['1','2','3','4','5','6'].map(g=>{
        const t=tahsin.byGrade.get(g)||{}, f=tahfidz.byGrade.get(g)||{}, a=attendanceAgg.byGrade.get(g)||{};
        return `<tr><td><strong>Tingkat ${g}</strong></td><td>${a.students||0}</td><td>${pctText(targetPct(t))}</td><td>${pctText(targetPct(f))}</td><td>${pctText(a.averagePct||0)}</td></tr>`;
      }).join('');
      const gradeTabs=(subject,active='1')=>['1','2','3','4','5','6'].map(g=>`<button type="button" class="${g===active?'active':''}" data-class-target-subject="${subject}" data-class-target-grade="${g}" role="tab" aria-selected="${g===active}">Tingkat ${g}</button>`).join('');
      host.innerHTML=`
        <section class="gm-presentation-hero"><div><span>GEMAR MENGAJI · RINGKASAN AGREGAT</span><h2>${periodLabel(period)} ${year}/${year+1}</h2><p>Ringkasan target Tahsin, target Tahfidz, capaian Tahsin, dan Absensi Gemar Mengaji tanpa menampilkan identitas siswa.</p></div><div class="gm-presentation-date">${new Intl.DateTimeFormat('id-ID',{dateStyle:'long',timeZone:'Asia/Jakarta'}).format(new Date())}</div></section>
        <div class="gm-presentation-kpis gm-presentation-kpis-4">
          <article><span>Jumlah siswa</span><strong>${roster.length.toLocaleString('id-ID')}</strong><small>Master siswa tingkat 1–6</small></article>
          <article><span>Target Tahsin tercapai</span><strong>${pctText(pct(ts))}</strong><small>${ts.reached} dari ${ts.reached+ts.notReached} siswa yang sudah dapat dihitung</small></article>
          <article><span>Target Tahfidz tercapai</span><strong>${pctText(pct(tf))}</strong><small>${tf.reached} dari ${tf.reached+tf.notReached} siswa yang sudah dapat dihitung</small></article>
          <article><span>Kehadiran Gemar Mengaji</span><strong>${pctText(overallAtt.averagePct)}</strong><small>Total tingkat 1–6 · ${esc(latestContext.fullMonthLabel||latestContext.monthLabel)}</small></article>
        </div>
        <section class="gm-presentation-carousel" data-gm-presentation-carousel aria-label="Infografik presentasi koordinator">
          <div class="gm-carousel-head"><div><p class="section-kicker">INFOGRAFIK</p><h3 id="gmPresentationSlideTitle">Target Tahsin per Tingkat</h3></div><div class="gm-carousel-actions"><button type="button" class="secondary-action" data-carousel-prev aria-label="Infografik sebelumnya">←</button><span data-carousel-counter>1 / 4</span><button type="button" class="secondary-action" data-carousel-next aria-label="Infografik berikutnya">→</button></div></div>
          <div class="gm-presentation-track">
            <article class="gm-presentation-slide is-active" data-slide-kind="tahsin" data-title="Target Tahsin per Tingkat" aria-hidden="false"><div class="gm-slide-copy"><strong>Ketercapaian Target Tahsin</strong><span>Perbandingan siswa tercapai dan belum tercapai pada tiap tingkat.</span></div><div class="gm-chart-shell gm-chart-shell-large"><canvas id="gmPresentationTahsin"></canvas></div><div id="gmPresentationTahsinCounts" class="gm-target-count-grid" aria-label="Jumlah ketercapaian Tahsin per tingkat"></div></article>
            <article class="gm-presentation-slide" data-slide-kind="tahfidz" data-title="Target Tahfidz per Tingkat" aria-hidden="true"><div class="gm-slide-copy"><strong>Ketercapaian Target Tahfidz</strong><span>Perbandingan siswa tercapai dan belum tercapai pada tiap tingkat.</span></div><div class="gm-chart-shell gm-chart-shell-large"><canvas id="gmPresentationTahfidz"></canvas></div><div id="gmPresentationTahfidzCounts" class="gm-target-count-grid" aria-label="Jumlah ketercapaian Tahfidz per tingkat"></div></article>
            <article class="gm-presentation-slide" data-slide-kind="stages" data-title="Sebaran Capaian Tahsin" aria-hidden="true"><div class="gm-slide-copy"><strong>Sebaran Capaian Tahsin per Tingkat</strong><span>Jumlah siswa pada setiap tahapan capaian Tahsin yang tersimpan di periode ini.</span></div><div class="gm-stage-grade-tabs" role="tablist" aria-label="Pilih tingkat capaian Tahsin">${['1','2','3','4','5','6'].map(g=>`<button type="button" class="${g==='1'?'active':''}" data-stage-grade="${g}" role="tab" aria-selected="${g==='1'}">Tingkat ${g}</button>`).join('')}</div><div class="gm-stage-panes">${['1','2','3','4','5','6'].map(g=>stagePane(g,stages.get(g))).join('')}</div></article>
            <article class="gm-presentation-slide" data-slide-kind="attendance" data-title="Absensi Gemar Mengaji" aria-hidden="true"><div class="gm-slide-copy"><strong>Perbandingan Kehadiran Gemar Mengaji</strong><span>Persentase bulanan dari Juli ${year} sampai Juni ${year+1}. Bulan yang belum berjalan dibiarkan kosong.</span></div><div class="gm-chart-shell gm-chart-shell-large gm-monthly-attendance-chart"><canvas id="gmPresentationAttendance"></canvas></div><div id="gmPresentationAttendanceMonths" class="gm-attendance-month-strip" aria-label="Ringkasan kehadiran tiap bulan"></div><div class="gm-attendance-month-meta"><strong>${esc(latestContext.fullMonthLabel||latestContext.monthLabel)}</strong><span>${pctText(overallAtt.averagePct)} hadir · H ${overallAtt.h} · S ${overallAtt.s} · I ${overallAtt.i} · A ${overallAtt.a}</span></div></article>
          </div>
          <div class="gm-carousel-dots" role="tablist" aria-label="Pilih infografik">${[0,1,2,3].map(i=>`<button type="button" data-carousel-dot="${i}" aria-label="Buka infografik ${i+1}" aria-selected="${i===0}" class="${i===0?'active':''}"></button>`).join('')}</div>
        </section>
        <section class="gm-class-target-section" aria-labelledby="gmClassTargetTitle">
          <div class="gm-class-target-heading"><div><p class="section-kicker">KETERCAPAIAN PER KELAS</p><h3 id="gmClassTargetTitle">Perbandingan kelas dalam setiap tingkat</h3></div></div>
          <div class="gm-class-target-grid">
            <article class="gm-presentation-card gm-class-target-card" data-class-card="tahsin"><div class="gm-slide-copy"><strong>Target Tahsin per Kelas</strong><span>Pilih tingkat untuk melihat setiap rombel.</span></div><div class="gm-class-grade-tabs" role="tablist" aria-label="Pilih tingkat Tahsin per kelas">${gradeTabs('tahsin')}</div><div class="gm-class-chart-shell"><canvas id="gmPresentationTahsinClass"></canvas><div id="gmPresentationTahsinClassEmpty" class="gm-presentation-empty" hidden></div></div><div id="gmPresentationTahsinClassCounts" class="gm-target-count-grid gm-target-count-grid-class"></div></article>
            <article class="gm-presentation-card gm-class-target-card" data-class-card="tahfidz"><div class="gm-slide-copy"><strong>Target Tahfidz per Kelas</strong><span>Pilih tingkat untuk melihat setiap rombel.</span></div><div class="gm-class-grade-tabs" role="tablist" aria-label="Pilih tingkat Tahfidz per kelas">${gradeTabs('tahfidz')}</div><div class="gm-class-chart-shell"><canvas id="gmPresentationTahfidzClass"></canvas><div id="gmPresentationTahfidzClassEmpty" class="gm-presentation-empty" hidden></div></div><div id="gmPresentationTahfidzClassCounts" class="gm-target-count-grid gm-target-count-grid-class"></div></article>
          </div>
        </section>
        <section class="gm-presentation-card gm-presentation-summary"><div class="gm-slide-copy"><strong>Ringkasan per Tingkat</strong><span>Angka utama untuk dibaca cepat saat rapat atau presentasi.</span></div><div class="gm-table-wrap"><table class="gm-compact-table gm-presentation-table"><thead><tr><th>Tingkat</th><th>Siswa</th><th>Target Tahsin</th><th>Target Tahfidz</th><th>Kehadiran Gemar Mengaji</th></tr></thead><tbody>${gradeTable}</tbody></table></div></section>`;

      const carousel=host.querySelector('[data-gm-presentation-carousel]'), slides=[...host.querySelectorAll('.gm-presentation-slide')], dots=[...host.querySelectorAll('[data-carousel-dot]')], title=$('gmPresentationSlideTitle'), counter=host.querySelector('[data-carousel-counter]');
      let current=0, viewportReady=!('IntersectionObserver' in window);
      const animateBars=slide=>{ slide.classList.remove('is-animated'); requestAnimationFrame(()=>requestAnimationFrame(()=>slide.classList.add('is-animated'))); };
      const ensureVisual=slide=>{
        if(!viewportReady||!slide) return;
        if(slide.dataset.slideKind==='tahsin') targetChart('gmPresentationTahsin',tahsin,'Target Tahsin','gmPresentationTahsinCounts');
        else if(slide.dataset.slideKind==='tahfidz') targetChart('gmPresentationTahfidz',tahfidz,'Target Tahfidz','gmPresentationTahfidzCounts');
        else if(slide.dataset.slideKind==='attendance') attendanceChart('gmPresentationAttendance',attendanceSeries);
        animateBars(slide);
      };
      const showSlide=index=>{
        current=(index+slides.length)%slides.length;
        slides.forEach((slide,i)=>{const active=i===current;slide.classList.toggle('is-active',active);slide.setAttribute('aria-hidden',String(!active));});
        dots.forEach((dot,i)=>{dot.classList.toggle('active',i===current);dot.setAttribute('aria-selected',String(i===current));});
        if(title) title.textContent=slides[current]?.dataset.title||'Infografik'; if(counter) counter.textContent=`${current+1} / ${slides.length}`;
        ensureVisual(slides[current]);
      };
      host.querySelector('[data-carousel-prev]')?.addEventListener('click',()=>showSlide(current-1));
      host.querySelector('[data-carousel-next]')?.addEventListener('click',()=>showSlide(current+1));
      dots.forEach((dot,i)=>dot.addEventListener('click',()=>showSlide(i)));
      let touchX=null; carousel?.addEventListener('touchstart',e=>{touchX=e.changedTouches?.[0]?.clientX??null},{passive:true}); carousel?.addEventListener('touchend',e=>{if(touchX==null)return;const dx=(e.changedTouches?.[0]?.clientX??touchX)-touchX;touchX=null;if(Math.abs(dx)>48)showSlide(current+(dx<0?1:-1));},{passive:true});
      host.querySelectorAll('[data-stage-grade]').forEach(button=>button.addEventListener('click',()=>{
        const g=button.dataset.stageGrade; host.querySelectorAll('[data-stage-grade]').forEach(b=>{const a=b===button;b.classList.toggle('active',a);b.setAttribute('aria-selected',String(a));});
        host.querySelectorAll('.gm-stage-pane').forEach(pane=>pane.hidden=pane.dataset.grade!==g); const slide=button.closest('.gm-presentation-slide'); if(slide) animateBars(slide);
      }));
      const drawClassCard=(subject,grade)=>{
        const isTahsin=subject==='tahsin';
        classTargetChart(isTahsin?'gmPresentationTahsinClass':'gmPresentationTahfidzClass',isTahsin?tahsin:tahfidz,grade,isTahsin?'gmPresentationTahsinClassEmpty':'gmPresentationTahfidzClassEmpty',isTahsin?'gmPresentationTahsinClassCounts':'gmPresentationTahfidzClassCounts');
      };
      host.querySelectorAll('[data-class-target-grade]').forEach(button=>button.addEventListener('click',()=>{
        const subject=button.dataset.classTargetSubject, grade=button.dataset.classTargetGrade;
        host.querySelectorAll(`[data-class-target-subject="${subject}"]`).forEach(b=>{const active=b===button;b.classList.toggle('active',active);b.setAttribute('aria-selected',String(active));});
        drawClassCard(subject,grade);
      }));
      const classSection=host.querySelector('.gm-class-target-section');
      if('IntersectionObserver' in window && classSection){
        const classObserver=new IntersectionObserver(entries=>{if(entries.some(e=>e.isIntersecting)){drawClassCard('tahsin','1');drawClassCard('tahfidz','1');classObserver.disconnect();}},{threshold:.12}); classObserver.observe(classSection);
      }else{drawClassCard('tahsin','1');drawClassCard('tahfidz','1');}
      if('IntersectionObserver' in window && carousel){
        const observer=new IntersectionObserver(entries=>{if(entries.some(e=>e.isIntersecting)){viewportReady=true;showSlide(current);observer.disconnect();}},{threshold:.18}); observer.observe(carousel);
      } else showSlide(0);
      const loadedAt=new Intl.DateTimeFormat('id-ID',{hour:'2-digit',minute:'2-digit',timeZone:'Asia/Jakarta'}).format(new Date());
      status.textContent=`Data siap ditampilkan · ${rows.length} peserta rapor · ${roster.length} siswa tingkat 1–6 · diperbarui ${loadedAt}`;
      setPresentationLoadButton('loaded');
    }catch(e){ host.innerHTML=`<div class="gm-panel-card gm-error-card">Presentasi belum dapat dimuat: ${esc(e.message)}</div>`; status.textContent='Gagal memuat data presentasi.'; setPresentationLoadButton('idle'); }
  }

  function shiftPeriod(selectId, amount){ const s=$(selectId); if(!s) return; const i=periods.indexOf(s.value); if(i<0) return; const ni=Math.max(0,Math.min(periods.length-1,i+amount)); s.value=periods[ni]; s.dispatchEvent(new Event('change',{bubbles:true})); }

  async function toggleFullscreen(){
    try{
      if(document.fullscreenElement){ await document.exitFullscreen(); return; }
      if(document.documentElement.requestFullscreen) await document.documentElement.requestFullscreen({navigationUI:'hide'});
      else document.documentElement.classList.toggle('gm-tablet-fullscreen');
    }catch(_){ document.documentElement.classList.toggle('gm-tablet-fullscreen'); }
  }

  function mountCoordinatorPages(){
    if(AppAccess.profile?.role!=='koordinator') return;
    $('menu-analitik') && ($('menu-analitik').hidden=false); $('menu-presentasi') && ($('menu-presentasi').hidden=false);
    const year=nowYear(), currentPeriod=smartCurrentPeriod();
    for(const id of ['gmAnalyticsYear','gmPresentationYear']) if($(id)&&!$(id).value) $(id).value=year;
    if ($('gmPresentationPeriod')) $('gmPresentationPeriod').value=currentPeriod;
    if ($('gmAnalyticsPeriodB')) $('gmAnalyticsPeriodB').value=currentPeriod;
    $('gmAnalyticsLoad')?.addEventListener('click',loadAnalytics);
    $('gmAnalyticsPrev')?.addEventListener('click',()=>shiftPeriod('gmAnalyticsPeriodB',-1));
    $('gmAnalyticsNext')?.addEventListener('click',()=>shiftPeriod('gmAnalyticsPeriodB',1));
    $('gmPresentationLoad')?.addEventListener('click',loadPresentation);
    ['gmPresentationYear','gmPresentationPeriod'].forEach(id=>$(id)?.addEventListener('change',resetPresentationLoadButton));
    setPresentationLoadButton('idle');
    $('gmPresentationFullscreen')?.addEventListener('click',toggleFullscreen);
  }

  function contextualConfirm(){
    document.addEventListener('click', event => {
      const button=event.target.closest('[data-gm-confirm-context]'); if(!button || button.dataset.gmConfirmed==='true') return;
      event.preventDefault(); event.stopImmediatePropagation();
      const message=button.dataset.gmConfirmContext || 'Lanjutkan tindakan ini?';
      const run=()=>{button.dataset.gmConfirmed='true';button.click();delete button.dataset.gmConfirmed;};
      if(window.AdminNotice?.choose){ AdminNotice.choose({title:'Periksa tindakan',message,primaryLabel:'Lanjutkan',cancelLabel:'Batal'}).then(choice=>{if(choice==='primary')run();}); }
      else if(confirm(message)) run();
    },true);
  }

  function smartCurrentPeriod(){
    const month = new Date().getMonth() + 1;
    return month >= 11 ? 'pas_ganjil' : month >= 7 ? 'pts_ganjil' : month >= 4 ? 'pas_genap' : 'pts_genap';
  }
  function mountKeyboardAvoidance(){
    if (!window.visualViewport) return;
    let focused = null, timer = null;
    document.addEventListener('focusin', event => {
      if (!event.target.matches('input,select,textarea')) return;
      focused = event.target;
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (!focused) return;
        const rect = focused.getBoundingClientRect();
        const viewportBottom = visualViewport.height + visualViewport.offsetTop;
        if (rect.bottom > viewportBottom - 18 || rect.top < visualViewport.offsetTop + 12)
          focused.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 120);
    }, true);
    document.addEventListener('focusout', () => { focused = null; }, true);
    visualViewport.addEventListener('resize', () => {
      document.documentElement.style.setProperty('--gm-visual-viewport-height', `${visualViewport.height}px`);
      if (focused) {
        clearTimeout(timer);
        timer = setTimeout(() => focused?.scrollIntoView?.({ behavior:'smooth', block:'center' }), 80);
      }
    });
  }

  function init(){
    mountThemeToggle(); contextualConfirm(); mountKeyboardAvoidance();
    document.documentElement.dataset.gmDevice = matchMedia('(max-width: 767px)').matches ? 'mobile' : (matchMedia('(max-width: 1180px)').matches ? 'tablet' : 'desktop');
    window.addEventListener('resize',()=>{document.documentElement.dataset.gmDevice=matchMedia('(max-width: 767px)').matches?'mobile':(matchMedia('(max-width:1180px)').matches?'tablet':'desktop');},{passive:true});
  }
  document.addEventListener('panelready',init);
  if (window.GMPanel) GMPanel.onPage('presentasi', mountCoordinatorPages);
  else document.addEventListener('panelready', mountCoordinatorPages);
  return { loadAnalytics, loadPresentation, toggleFullscreen, shiftPeriod, reportRows };
})();
