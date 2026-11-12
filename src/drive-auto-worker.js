// Cloudflare Cron Worker — one durable batch of R2->Google Drive synchronization.
// Credentials must be stored exclusively as Worker Secrets, never in Git or D1.
import {driveInit,driveChunk} from './sync-google.js';

const RETRIES=[60,180,600,1800,3600,7200,14400,21600];
const now=()=>Math.floor(Date.now()/1000);
const safeError=e=>String(e?.message||e||'Không xác định').slice(0,380)
 .replace(/ya29\.[A-Za-z0-9._-]+/g,'[REDACTED]')
 .replace(/1\/\/[A-Za-z0-9_-]+/g,'[REDACTED]');
export function configured(env){
 return env.SYNC_ENABLED==='true' && !!env.DB && !!env.MEDIA &&
 !!env.GOOGLE_CLIENT_ID && !!env.GOOGLE_OAUTH_CLIENT_SECRET && !!env.GOOGLE_REFRESH_TOKEN;
}
export async function googleAccessToken(env){
 if(!env.GOOGLE_CLIENT_ID||!env.GOOGLE_OAUTH_CLIENT_SECRET||!env.GOOGLE_REFRESH_TOKEN)
  throw new Error('Chưa cấu hình Google OAuth ngoại tuyến trên máy chủ.');
 const resp=await fetch('https://oauth2.googleapis.com/token',{
  method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},
  body:new URLSearchParams({
   client_id:env.GOOGLE_CLIENT_ID,
   client_secret:env.GOOGLE_OAUTH_CLIENT_SECRET,
   refresh_token:env.GOOGLE_REFRESH_TOKEN,
   grant_type:'refresh_token'
  })
 });
 const obj=await resp.json().catch(()=>({}));
 if(!resp.ok||!obj.access_token)
  throw new Error('Google OAuth refresh failed (HTTP '+resp.status+'): '+String(obj.error||'unknown').slice(0,70));
 return obj.access_token;
}
async function runFile(env,uploadId,token,maxChunks=5){
 const claimed=await env.DB.prepare(
  'UPDATE uploads SET auto_lease_until=?,auto_last_attempt_at=CURRENT_TIMESTAMP WHERE id=? AND status=\'COMPLETE\' AND drive_file_id IS NULL AND auto_next_attempt<=? AND auto_lease_until<=?')
  .bind(now()+9*60,uploadId,now(),now()).run();
 if(claimed.meta?.changes!==1)return {status:'SKIPPED',uploadId};
 try{
  let progress=await driveInit(env,{uploadId,googleAccessToken:token});
  let chunks=0;
  while(!progress.done&&chunks<maxChunks){
   progress=await driveChunk(env,{uploadId,googleAccessToken:token});
   chunks++;
  }
  if(progress.done){
   await env.DB.prepare('UPDATE uploads SET auto_error=\'\',auto_lease_until=0,auto_next_attempt=0 WHERE id=?')
    .bind(uploadId).run();
   return {status:'DONE',uploadId,chunks,fileId:progress.fileId};
  }
  await env.DB.prepare('UPDATE uploads SET auto_lease_until=0,auto_next_attempt=0,auto_error=\'\' WHERE id=?').bind(uploadId).run();
  return {status:'PROGRESS',uploadId,chunks,offset:progress.offset,total:progress.total};
 }catch(e){
  const previous=await env.DB.prepare('SELECT auto_attempts FROM uploads WHERE id=?').bind(uploadId).first();
  const attempts=Math.min(100,(Number(previous?.auto_attempts)||0)+1);
  const delay=RETRIES[Math.min(attempts-1,RETRIES.length-1)];
  await env.DB.prepare('UPDATE uploads SET auto_attempts=?,auto_next_attempt=?,auto_error=?,auto_lease_until=0 WHERE id=?')
   .bind(attempts,now()+delay,safeError(e),uploadId).run();
  return {status:'ERROR',uploadId,error:safeError(e)};
 }
}
export async function syncBatch(env,{maxFiles=2,maxChunks=5}={}){
 if(!configured(env))return {status:'DISABLED',processed:0,reason:'Cần quyền Google ngoại tuyến và SYNC_ENABLED=true'};
 const ids=await env.DB.prepare(
  'SELECT id FROM uploads WHERE status=\'COMPLETE\' AND drive_file_id IS NULL AND auto_next_attempt<=? AND auto_lease_until<=? ORDER BY created_at,id LIMIT ?'
 ).bind(now(),now(),Math.min(3,Math.max(1,maxFiles))).all();
 const candidates=ids.results||[];
 if(!candidates.length)return {status:'IDLE',processed:0};
 // Refresh once per batch; do not store access token.
 const token=await googleAccessToken(env);
 const out=[];
 for(const {id} of candidates)out.push(await runFile(env,id,token,maxChunks));
 return {status:'COMPLETE',processed:out.length,completed:out.filter(x=>x.status==='DONE').length,
   failed:out.filter(x=>x.status==='ERROR').length,items:out};
}
export default {
 async scheduled(controller,env,ctx){
  ctx.waitUntil((async()=>{
   const id=crypto.randomUUID();
   try{
    if(!configured(env))return;
    const result=await syncBatch(env);
    if(!result.processed)return;
    await env.DB.prepare(
     "INSERT INTO drive_sync_runs(id,started_at,finished_at,status,processed_files,completed_files,failed_files,notes) VALUES(?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,?,?,?, ?,?)"
    ).bind(id,result.status,result.processed,result.completed||0,result.failed||0,
      result.items.map(x=>x.status+':'+x.uploadId).join(';').slice(0,900)).run();
   }catch(e){
    // Avoid leaking credentials, tokens or upload session URLs into audit logs.
    await env.DB?.prepare(
     "INSERT INTO drive_sync_runs(id,finished_at,status,notes) VALUES(?,CURRENT_TIMESTAMP,'FAILED',?)"
    ).bind(id,safeError(e)).run().catch(()=>{});
   }
  })());
 },
 async fetch(){
  return new Response('Không có API công khai. Worker chỉ chạy tác vụ định kỳ.',{status:404});
 }
};
