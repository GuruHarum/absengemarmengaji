export function createHandler(admin) {
 const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type','Access-Control-Allow-Methods':'POST, OPTIONS','Content-Type':'application/json','Cache-Control':'no-store'};
 const reply=(status,body)=>new Response(JSON.stringify(body),{status,headers});
 return async request=>{
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers});
  if(request.method!=='POST')return reply(405,{error:'Metode tidak valid'});
  try {
   const token=request.headers.get('Authorization')?.match(/^Bearer (.+)$/i)?.[1];
   if(!token)return reply(401,{error:'Login diperlukan'});
   const {data:auth,error:authError}=await admin.auth.getUser(token);
   if(authError||!auth.user)return reply(401,{error:'Sesi tidak valid'});
   const body=await request.json();
   if(!['teacher','account'].includes(body.kind)||typeof body.target!=='string'||!body.target.trim()||body.target.length>254)return reply(400,{error:'Target tidak valid'});
   const {data:job,error}=await admin.rpc('prepare_account_deletion',{actor:auth.user.id,deletion_kind:body.kind,target_key:body.target});
   if(error)return reply(403,{error:error.message});
   for(const id of job.accounts){
    const {error:removeError}=await admin.auth.admin.deleteUser(id);
    if(removeError && removeError.code!=='user_not_found') return reply(409,{error:'Penghapusan Auth belum selesai. Akses panel sudah dicabut. Periksa kepemilikan file di Storage atau koneksi, lalu tekan hapus lagi untuk melanjutkan.'});
   }
   const {error:finishError}=await admin.rpc('finish_account_deletion',{actor:auth.user.id,job_id:job.id});
   if(finishError)return reply(409,{error:'Akun Auth sudah diproses, tetapi penghapusan data belum selesai. Tekan hapus lagi untuk melanjutkan.'});
   return reply(200,{ok:true});
  }catch(_){return reply(500,{error:'Penghapusan belum dapat dipastikan. Muat ulang daftar lalu lanjutkan penghapusan jika masih tertunda.'});}
 };
}
