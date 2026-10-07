window.ReportZip = (() => {
  const enc = new TextEncoder();
  const table = (()=>{const t=new Uint32Array(256);for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=(c&1)?0xEDB88320^(c>>>1):c>>>1;t[n]=c>>>0;}return t;})();
  const crc32 = bytes => { let c=0xFFFFFFFF; for(const b of bytes)c=table[(c^b)&255]^(c>>>8); return (c^0xFFFFFFFF)>>>0; };
  const u16=n=>new Uint8Array([n&255,(n>>>8)&255]);
  const u32=n=>new Uint8Array([n&255,(n>>>8)&255,(n>>>16)&255,(n>>>24)&255]);
  const join=parts=>{const size=parts.reduce((n,p)=>n+p.length,0),out=new Uint8Array(size);let o=0;for(const p of parts){out.set(p,o);o+=p.length;}return out;};
  const safe = v => String(v||'').replace(/[\\/:*?"<>|]/g,'-').replace(/\s+/g,' ').trim().slice(0,140) || 'Tanpa Nama';
  function dos(){const d=new Date();return {time:(d.getHours()<<11)|(d.getMinutes()<<5)|(d.getSeconds()>>1),date:((d.getFullYear()-1980)<<9)|((d.getMonth()+1)<<5)|d.getDate()};}

  async function build(rows,{fileName='Rapor.pdf',format='pdf',onProgress=()=>{}}={}){
    if(!rows?.length) throw Error('Tidak ada rapor yang dipilih.');
    onProgress(0, rows.length);
    if(format === 'word') {
      const document = await word(rows, onProgress);
      return pack([{name: safe(fileName).replace(/\.(?:zip|pdf|docx)$/i,'') + '.docx', bytes: new Uint8Array(await document.arrayBuffer())}]);
    }
    const pdf = await ReportPDF.build(rows,{draft:false,onProgress});
    const bytes=new Uint8Array(pdf.output('arraybuffer'));
    const file = {
      name: safe(fileName).replace(/\.zip$/i,'').replace(/\.pdf$/i,'') + '.pdf',
      bytes,
      crc: crc32(bytes)
    };
    const stamp=dos();
    const name=enc.encode(file.name);
    const localHeader=join([u32(0x04034b50),u16(20),u16(0x0800),u16(0),u16(stamp.time),u16(stamp.date),u32(file.crc),u32(file.bytes.length),u32(file.bytes.length),u16(name.length),u16(0),name,file.bytes]);
    const centralHeader=join([u32(0x02014b50),u16(20),u16(20),u16(0x0800),u16(0),u16(stamp.time),u16(stamp.date),u32(file.crc),u32(file.bytes.length),u32(file.bytes.length),u16(name.length),u16(0),u16(0),u16(0),u16(0),u32(0),u32(0),name]);
    const end=join([u32(0x06054b50),u16(0),u16(0),u16(1),u16(1),u32(centralHeader.length),u32(localHeader.length),u16(0)]);
    return new Blob([localHeader,centralHeader,end],{type:'application/zip'});
  }

  async function pack(files, type='application/zip') {
    const locals=[], centrals=[]; let offset=0; const stamp=dos();
    for(const file of files) {
      const name=enc.encode(file.name), bytes=file.bytes, crc=crc32(bytes);
      let payload=bytes,method=0;
      if(typeof CompressionStream==='function') {
        try {
          const stream=new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate-raw'));
          const compressed=new Uint8Array(await new Response(stream).arrayBuffer());
          if(compressed.length<bytes.length) {payload=compressed;method=8;}
        } catch (_) { /* ZIP STORE remains valid on browsers without raw DEFLATE. */ }
      }
      // ZIP readers use the central directory, not just the local file header.
      // Reuse the same metadata so compression method, lengths and CRC always agree.
      const metadata=join([u16(0x0800),u16(method),u16(stamp.time),u16(stamp.date),u32(crc),u32(payload.length),u32(bytes.length)]);
      const local=join([u32(0x04034b50),u16(20),metadata,u16(name.length),u16(0),name,payload]);
      centrals.push(join([u32(0x02014b50),u16(20),u16(20),metadata,u16(name.length),u16(0),u16(0),u16(0),u16(0),u32(0),u32(offset),name]));
      locals.push(local); offset+=local.length;
    }
    const central=join(centrals);
    return new Blob([...locals,central,join([u32(0x06054b50),u16(0),u16(0),u16(files.length),u16(files.length),u32(central.length),u32(offset),u16(0)])],{type});
  }
  async function word(rows,onProgress=()=>{}) {
    const list=ReportPDF.sorted(rows);
    if(!list.length) throw Error('Tidak ada siswa');
    if(list.some(row=>!ReportCore.reportCheck(row).complete)) throw Error('Seluruh nilai wajib dan pengaturan rapor harus lengkap');
    const files=[], body=[], rels=[], logos=new Map(); const date=new Date();
    const esc=value=>String(value??'-').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g,'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    const mm=value=>Math.round(value*1440/25.4);
    const empty='<w:p><w:pPr><w:spacing w:before="0" w:after="0" w:line="1" w:lineRule="exact"/></w:pPr></w:p>';
    let pageShapes=[],shapeId=0;
    const measure=document.createElement('canvas').getContext('2d');
    function p(value,{bold=false,size=2.88,align='left',preserveCase=false,width=190,height=7,contentHeight=height,min=2.35}={}) {
      const text=preserveCase?String(value??'-'):String(value??'-').toLocaleUpperCase('id-ID');
      let lines;
      for(;;size-=.1) {
        measure.font=(bold?'700':'400')+' '+size+'px Arial';
        lines=[];
        for(const paragraph of text.split('\n')) {
          let line='';
          for(const word of paragraph.split(/\s+/)) {
            const next=line?line+' '+word:word;
            if(measure.measureText(next).width>width-3.4 && line) {lines.push(line);line=word;} else line=next;
            if(measure.measureText(line).width>width-3.4) {
              let chunk='';
              for(const char of line) {
                if(measure.measureText(chunk+char).width>width-3.4&&chunk) {lines.push(chunk);chunk='';}
                chunk+=char;
              }
              line=chunk;
            }
          }
          lines.push(line);
        }
        if(lines.length*size*1.24<=contentHeight-(contentHeight<=7?1.2:2.2)) break;
        if(size<=min) throw Error('Teks terlalu panjang untuk satu halaman: '+String(value).slice(0,60)+'. Ringkas catatan atau nama pada pengaturan.');
      }
      return '<w:p><w:pPr><w:spacing w:before="0" w:after="0" w:line="'+mm(size*1.24)+'" w:lineRule="exact"/><w:jc w:val="'+align+'"/></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/>'+(bold?'<w:b/>':'')+'<w:color w:val="111111"/><w:sz w:val="'+Math.round(size*144/25.4)+'"/></w:rPr>'+lines.map(line=>'<w:t xml:space="preserve">'+esc(line)+'</w:t>').join('<w:br/>')+'</w:r></w:p>';
    }
    const cell=(text,width,options={})=>({text,width,...options});
    // Native tables sit in editable text boxes at the existing millimetre coordinates.
    // All boxes share one paragraph anchor per pupil, keeping each report on one A4 page.
    function positionedTable(x,y,width,grid,rows,{border=false,inside=true,rule=false}={}) {
      const edge=border?'<w:tblBorders>'+['top','left','bottom','right','insideH','insideV'].map(side=>'<w:'+side+' w:val="'+((rule&&side!=='bottom')||(!inside&&side.startsWith('inside'))?'nil':'single')+'" w:sz="9" w:color="161616"/>').join('')+'</w:tblBorders>':'<w:tblBorders>'+['top','left','bottom','right','insideH','insideV'].map(side=>'<w:'+side+' w:val="nil"/>').join('')+'</w:tblBorders>';
      const tableXml='<w:tbl><w:tblPr><w:tblW w:w="'+mm(width)+'" w:type="dxa"/>'+edge+'<w:tblLayout w:type="fixed"/><w:tblCellMar><w:top w:w="0" w:type="dxa"/><w:left w:w="'+mm(1.4)+'" w:type="dxa"/><w:bottom w:w="0" w:type="dxa"/><w:right w:w="'+mm(1.4)+'" w:type="dxa"/></w:tblCellMar></w:tblPr><w:tblGrid>'+grid.map(w=>'<w:gridCol w:w="'+mm(w)+'"/>').join('')+'</w:tblGrid>'+rows.map(row=>'<w:tr><w:trPr><w:cantSplit/><w:trHeight w:val="'+mm(row.height)+'" w:hRule="exact"/></w:trPr>'+row.cells.map(c=>'<w:tc><w:tcPr><w:tcW w:w="'+mm(c.width)+'" w:type="dxa"/>'+(c.span?'<w:gridSpan w:val="'+c.span+'"/>':'')+(c.merge?'<w:vMerge w:val="'+c.merge+'"/>':'')+(c.fill?'<w:shd w:val="clear" w:fill="'+c.fill+'"/>':'')+'<w:vAlign w:val="center"/></w:tcPr>'+(c.xml||p(c.text,{height:row.height,...c}))+'</w:tc>').join('')+'</w:tr>').join('')+'</w:tbl>'+empty;
      const height=rows.reduce((sum,row)=>sum+row.height,0);
      const definition=shapeId===0?'<v:shapetype id="_x0000_t202" coordsize="21600,21600" o:spt="202" path="m,l,21600r21600,l21600,xe"><v:stroke joinstyle="miter"/><v:path gradientshapeok="t" o:connecttype="rect"/></v:shapetype>':'';
      pageShapes.push('<w:r><w:pict>'+definition+'<v:shape id="raporShape'+(++shapeId)+'" type="#_x0000_t202" style="position:absolute;margin-left:'+x+'mm;margin-top:'+y+'mm;width:'+width+'mm;height:'+height+'mm;mso-position-horizontal-relative:page;mso-position-vertical-relative:page;mso-wrap-style:none" stroked="f" filled="f"><v:textbox inset="0,0,0,0" style="mso-fit-shape-to-text:t"><w:txbxContent>'+tableXml+'</w:txbxContent></v:textbox></v:shape></w:pict></w:r>');
    }
    const text=(value,x,y,w,h,opts={})=>positionedTable(x,y,w,[w],[{height:h,cells:[cell(value,w,opts)]}]);
    for(let i=0;i<list.length;i++) {
      const report=list[i]; ReportCore.useReference(report.reference);
      pageShapes=[];
      const school=report.school||{}, student=report.student, officials=report.officials||{};
      const logoUrl=school.logo_url&&String(school.logo_url).includes('FjF61ou.png')?'assets/school-logo.png':school.logo_url;
      if(logoUrl) {
        let asset=logos.get(logoUrl);
        if(!asset) {
          const response=await fetch(logoUrl); if(!response.ok) throw Error('Logo sekolah gagal dimuat.');
          const blob=await response.blob();
          const image=await createImageBitmap(blob);
          try {
            // Only the logo is rasterized, once per school, preserving its existing circular crop.
            const canvas=document.createElement('canvas'); const size=Math.min(600,Math.max(image.width,image.height));
            canvas.width=canvas.height=size; const ctx=canvas.getContext('2d');
            const ratio=Math.min(size/image.width,size/image.height);
            ctx.beginPath();ctx.arc(size/2,size/2,size/2,0,Math.PI*2);ctx.clip();
            ctx.drawImage(image,(size-image.width*ratio)/2,(size-image.height*ratio)/2,image.width*ratio,image.height*ratio);
            const png=await new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(Error('Logo gagal disiapkan.')),'image/png'));
            asset={id:'logo'+logos.size,name:'logo'+logos.size+'.png'};
            files.push({name:'word/media/'+asset.name,bytes:new Uint8Array(await png.arrayBuffer())});
            rels.push('<Relationship Id="'+asset.id+'" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/'+asset.name+'"/>');
            logos.set(logoUrl,asset); canvas.width=canvas.height=1;
          } finally {image.close();}
        }
        const drawing='<w:p><w:pPr><w:spacing w:before="0" w:after="0"/></w:pPr><w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="900000" cy="900000"/><wp:docPr id="'+(i+1)+'" name="Logo sekolah"/><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="0" name="Logo sekolah"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="'+asset.id+'"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="900000" cy="900000"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>';
        positionedTable(10.6,9,28,[28],[{height:25,cells:[cell('',28,{xml:drawing})]}]);
      }
      text('LAPORAN PENILAIAN HASIL BELAJAR TAHSIN & TAHFIDZ',39,8.5,158,8,{size:3.85,bold:true,align:'center'});
      text((ReportCore.periods[report.period]||'')+' - TAHUN AJARAN '+report.year+' / '+(report.year+1),39,17,158,7,{size:3.35,bold:true,align:'center'});
      text(ReportPDF.schoolHeader(school.name),39,24.5,158,15,{size:4.15,bold:true,align:'center',min:3.7});
      positionedTable(10,41.5,190,[190],[{height:.5,cells:[cell('',190,{xml:empty})]}],{border:true,rule:true});
      const identity=(label,value,x,y,w)=>positionedTable(x,y,w,[14,4,w-18],[{height:7,cells:[cell(label,14,{bold:true,size:2.55}),cell(':',4,{bold:true,size:2.55,align:'center'}),cell(value||'-',w-18,{bold:true,size:2.55,preserveCase:true})]}]);
      identity('NAMA',ReportPDF.personName(student.name),12,45,104); identity('NISN',student.nisn,119,45,79);
      identity('NIS',student.nis,12,54,104);identity('KELAS',window.PeriodicAssessments?.classLabel(student.class)||student.class,119,54,79);
      function subject(sub,y) {
        const row=report[sub],scores=row?.scores||{},sum=ReportCore.stats(scores,sub),target=report.settings?.[sub+'_target'];
        const fields=sub==='tahsin'?['tahsin_makhraj','tahsin_tajwid','tahsin_tartil','tahsin_gharib']:['tahfidz_makhraj','tahfidz_tajwid','tahfidz_hafalan'];
        const labels=['MAKHORIJUL HURUF','TAJWID','TARTIL / KELANCARAN','GHARIB MUSYKILAT'];
        const color=sub==='tahsin'?'FFF6D9':'FDEDE4',grid=[29,39,12,46,64], center={align:'center'};
        const rows=[{height:6,cells:[cell('PROGRAM',29,{...center,bold:true,fill:color}),cell('TARGET PEMBELAJARAN '+sub.toUpperCase(),161,{...center,bold:true,fill:color,span:4})]},
          {height:6,cells:[cell(sub,29,{...center,bold:true,contentHeight:12+fields.length*6,merge:'restart'}),cell(target?ReportCore.progress(target,sub):'Target belum diatur',161,{...center,span:4})]},
          {height:6,cells:[cell('',29,{merge:'continue'}),...['ASPEK','NILAI','KETERANGAN','PENCAPAIAN '+sub.toUpperCase()].map((label,j)=>cell(label,grid[j+1],{...center,bold:true,size:2.68}))]}];
        fields.forEach((field,j)=>{
          const active=ReportCore.applicable(scores,sub).keys.includes(field);
          const value=active&&!(sub==='tahfidz'&&field==='tahfidz_hafalan'&&![true,'true'].includes(scores.tahfidz_aspect_confirmed))?scores[field]:null;
          rows.push({height:6,cells:[cell('',29,{merge:'continue'}),cell(labels[j],39,{size:2.55}),cell(ReportCore.blank(value)?'-':value,12,center),cell(ReportCore.aspect(value),46,{...center,size:2.55}),cell(j?'':ReportCore.progress(scores,sub),64,{...center,size:3,contentHeight:fields.length*6,merge:j?'continue':'restart'})]});
        });

        positionedTable(10,y,190,grid,rows,{border:true});
        const bottom=y+18+fields.length*6;
        positionedTable(10,bottom,190,[29,45,60,56],[{height:7,cells:[cell('',29,{fill:'ECEBEC'}),cell('JUMLAH : '+(sum.sum??'-'),45,{bold:true,fill:'ECEBEC'}),cell('RATA-RATA : '+(sum.average==null?'-':sum.average.toFixed(1).replace('.',',')),60,{bold:true,fill:'ECEBEC'}),cell('GRADE NILAI : '+sum.grade,56,{bold:true,fill:'ECEBEC'})]}],{border:true,inside:false});
        positionedTable(10,bottom+9,190,[25,76,89],[{height:9,cells:[cell('NILAI KKM : '+(report.settings?.[sub+'_kkm']??'-'),25,{bold:true,size:2.55,fill:'ECEBEC'}),cell('PREDIKAT : '+sum.predicate,76,{bold:true,size:2.55,fill:'ECEBEC'}),cell('GURU PEMBIMBING : '+ReportPDF.personName(report.teachers?.[sub]||row?.teacher_name||'-'),89,{bold:true,size:2.55,preserveCase:true,fill:'ECEBEC'})]}],{border:true,inside:false});
        text('CAPAIAN KOMPETENSI :',10,bottom+19,100,5,{bold:true,size:2.65});
        positionedTable(10,bottom+24,190,[190],[{height:17,cells:[cell(ReportCore.description(ReportPDF.naturalName(student.name),scores,sub),190,{size:2.8,preserveCase:true,min:2.45})]}],{border:true});
        return bottom+43;
      }
      const next=subject('tahsin',64.5),end=subject('tahfidz',next+1);
      text('CATATAN GURU MENGENAI SISWA',10,end,190,5,{bold:true,size:2.65});
      positionedTable(10,end+5,190,[190],[{height:22,cells:[cell(ReportCore.note(ReportPDF.naturalName(student.name),report.period),190,{size:2.65,preserveCase:true})]}],{border:true});
      text((officials.city||'Tempat belum diisi')+', '+ReportPDF.dateLabel(date),110,257,90,6,{bold:true,align:'right',size:2.6});
      const signer=(x,title,name,niy)=>{
        text(title,x,264,60,13,{align:'center',size:2.6,bold:true});
        text(name?ReportPDF.personName(name):'',x,280,60,7,{align:'center',size:2.6,bold:true,preserveCase:true});
        positionedTable(x+6,287,48,[48],[{height:.2,cells:[cell('',48,{xml:empty})]}],{border:true,rule:true});
        if(niy)text('NIY. '+niy,x,288,60,5,{align:'center',size:2.45,bold:true});
      };
      signer(10,'ORANG TUA / WALI\nSISWA','','');
      signer(75,'KEPALA SEKOLAH\n'+ReportPDF.signatureSchoolName(school.name),[officials.principal_name,officials.principal_degree].filter(Boolean).join(', '),officials.principal_niy);
      signer(140,"KOORDINATOR STUDI\nAL-QUR'AN",[officials.coordinator_name,officials.coordinator_degree].filter(Boolean).join(', '),officials.coordinator_niy);
      body.push('<w:p><w:pPr>'+(i?'<w:pageBreakBefore/>':'')+'<w:spacing w:before="0" w:after="0" w:line="1" w:lineRule="exact"/></w:pPr>'+pageShapes.join('')+'</w:p>');
      onProgress(i+1,list.length,list[i]);await new Promise(resolve=>setTimeout(resolve,0));
    }
    const xml=(name,text)=>files.push({name,bytes:enc.encode('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'+text)});
    xml('[Content_Types].xml','<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="png" ContentType="image/png"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/></Types>');
    xml('_rels/.rels','<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="document" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
    xml('word/_rels/document.xml.rels','<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'+rels.join('')+'<Relationship Id="settings" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings" Target="settings.xml"/></Relationships>');
    xml('word/settings.xml','<w:settings xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:doNotAutoCompressPictures/></w:settings>');
    xml('word/document.xml','<w:document xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><w:body>'+body.join('')+'<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="0" w:right="0" w:bottom="0" w:left="0" w:header="0" w:footer="0" w:gutter="0"/></w:sectPr></w:body></w:document>');
    return pack(files,'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  }
  return {build,safe,word};
})();
