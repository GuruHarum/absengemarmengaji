window.ReportZip = (() => {
  const enc = new TextEncoder();
  const table = (()=>{const t=new Uint32Array(256);for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=(c&1)?0xEDB88320^(c>>>1):c>>>1;t[n]=c>>>0;}return t;})();
  const crc32 = bytes => { let c=0xFFFFFFFF; for(const b of bytes)c=table[(c^b)&255]^(c>>>8); return (c^0xFFFFFFFF)>>>0; };
  const u16=n=>new Uint8Array([n&255,(n>>>8)&255]);
  const u32=n=>new Uint8Array([n&255,(n>>>8)&255,(n>>>16)&255,(n>>>24)&255]);
  const join=parts=>{const size=parts.reduce((n,p)=>n+p.length,0),out=new Uint8Array(size);let o=0;for(const p of parts){out.set(p,o);o+=p.length;}return out;};
  const safe = v => String(v||'').replace(/[\\/:*?"<>|]/g,'-').replace(/\s+/g,' ').trim().slice(0,140) || 'Tanpa Nama';
  function dos(){const d=new Date();return {time:(d.getHours()<<11)|(d.getMinutes()<<5)|(d.getSeconds()>>1),date:((d.getFullYear()-1980)<<9)|((d.getMonth()+1)<<5)|d.getDate()};}

  async function build(rows,{fileName='Rapor.pdf',onProgress=()=>{}}={}){
    if(!rows?.length) throw Error('Tidak ada rapor yang dipilih.');
    onProgress(0, rows.length);
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

  return {build,safe};
})();
