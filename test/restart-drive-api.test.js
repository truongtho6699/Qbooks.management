import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/worker.js';
import {VIDEO_ARCHIVE_FOLDER} from '../src/sync-google.js';

const id='11111111-1111-1111-1111-111111111111';
const session='https://www.googleapis.com/upload/drive/v3/files?upload_id=old';
function environment(role='PACKER'){
 const writes=[];
 return {writes,GOOGLE_CLIENT_ID:'client',GOOGLE_OAUTH_CLIENT_SECRET:'secret',GOOGLE_REFRESH_TOKEN:'refresh',MEDIA:{},DB:{prepare(sql){return {
  bind(...args){this.args=args;return this;},
  async first(){
   if(sql.includes('FROM sessions'))return {id:'user',role,active:1,can_pack:role==='PACKER'?1:0,can_ship:0,can_admin:0,expires_at:Math.floor(Date.now()/1000)+3600};
   if(sql.includes('FROM uploads'))return {id,order_id:'order-1',stage:'VIDEO_DONG_HANG',status:'UPLOADING',object_key:'drive:video',bytes:16,content_type:'video/mp4',filename:'video.mp4',drive_session_url:session};
   if(sql.includes('FROM orders'))return {id:'order-1',status:'CHỜ ĐÓNG HÀNG'};
   if(sql.includes('FROM order_locks'))return {user_id:'user',stage:'DONG_HANG',expires_at:Math.floor(Date.now()/1000)+3600};
   return null;
  },
  async all(){return {results:[]};},
  async run(){writes.push({sql,args:this.args});return {meta:{changes:1}};}
 };}}};
}
async function restart(env){return worker.fetch(new Request('https://qbooks.test/api/uploads/'+id+'/restart-drive',{method:'POST',headers:{authorization:'Bearer test','content-type':'application/json'},body:'{}'}),env);}

test('expired Drive restart reuses upload ID and replaces only the expired session',async()=>{
 const env=environment(),original=globalThis.fetch;
 globalThis.fetch=async(url)=>{
  if(url===session)return new Response(null,{status:404});
  if(String(url).includes('oauth2'))return Response.json({access_token:'token'});
  if(String(url).includes('uploadType=resumable'))return new Response(null,{headers:{location:session+'new'}});
  return Response.json({id:VIDEO_ARCHIVE_FOLDER,mimeType:'application/vnd.google-apps.folder',trashed:false,capabilities:{canAddChildren:true}});
 };
 try{
  const res=await restart(env);
  assert.equal(res.status,200,await res.clone().text());
  assert.equal((await res.json()).sessionUrl,session+'new');
  assert.ok(env.writes.some(w=>w.sql.includes('UPDATE uploads SET drive_session_url=')));
  assert.ok(!env.writes.some(w=>/INSERT INTO uploads|DELETE FROM uploads/.test(w.sql)));
 }finally{globalThis.fetch=original;}
});

test('live Drive session cannot be replaced or discarded',async()=>{
 const env=environment(),original=globalThis.fetch;
 globalThis.fetch=async()=>new Response(null,{status:308,headers:{range:'bytes=0-7'}});
 try{assert.equal((await restart(env)).status,409);assert.equal(env.writes.length,0);}
 finally{globalThis.fetch=original;}
});

test('VIEW cannot restart Drive upload sessions',async()=>{
 const env=environment('VIEW');
 assert.equal((await restart(env)).status,403);
 assert.equal(env.writes.length,0);
});
