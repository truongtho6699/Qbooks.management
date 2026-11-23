import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createDirectVideoSession,probeDriveSession,DIRECT_DRIVE_CHUNK,VIDEO_ARCHIVE_FOLDER} from '../src/sync-google.js';

const app=fs.readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
const worker=fs.readFileSync(new URL('../src/worker.js',import.meta.url),'utf8');
const SESSION='https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&upload_id=abc';

test('Drive chunk size is a multiple of 256 KiB',()=>{
 assert.equal(DIRECT_DRIVE_CHUNK%(256*1024),0);
});

test('server opens a resumable session in the video archive with Origin and QBOOK metadata',async()=>{
 const calls=[];const original=globalThis.fetch;
 globalThis.fetch=async(url,opt={})=>{
  calls.push({url,opt});
  if(String(url).includes('/drive/v3/files/'))return new Response(JSON.stringify({id:VIDEO_ARCHIVE_FOLDER,mimeType:'application/vnd.google-apps.folder',trashed:false,capabilities:{canAddChildren:true}}));
  return new Response('',{status:200,headers:{location:SESSION}});
 };
 try{
  const s=await createDirectVideoSession('token',{uploadId:'u1',orderId:'o1',filename:'a.mp4',contentType:'video/mp4',bytes:1000,origin:'https://qbooks-quantri.pages.dev'});
  assert.equal(s.sessionUrl,SESSION);
  const init=calls.find(c=>String(c.url).includes('uploadType=resumable'));
  assert.equal(init.opt.headers.Origin,'https://qbooks-quantri.pages.dev');
  const meta=JSON.parse(init.opt.body);
  assert.deepEqual(meta.parents,[VIDEO_ARCHIVE_FOLDER]);
  assert.equal(meta.appProperties.qbooksUploadId,'u1');
 }finally{globalThis.fetch=original;}
});

test('probe reports offset, completion and expiry',async()=>{
 const r=(status,headers={},body='')=>async()=>new Response(body||null,{status,headers});
 assert.deepEqual(await probeDriveSession(SESSION,100,{fetchImpl:r(308,{range:'bytes=0-49'})}),{done:false,offset:50});
 const done=await probeDriveSession(SESSION,100,{fetchImpl:r(200,{},JSON.stringify({id:'file123456789',size:'100'}))});
 assert.equal(done.done,true);assert.equal(done.fileId,'file123456789');
 assert.equal((await probeDriveSession(SESSION,100,{fetchImpl:r(404)})).expired,true);
 await assert.rejects(probeDriveSession('https://evil.example/upload',100),/không hợp lệ/);
});

test('worker uses direct Drive only when switched on and verifies before completing',()=>{
 assert.match(worker,/env\.VIDEO_DIRECT_DRIVE==='true'/);
 assert.match(worker,/await checkDriveCopy\(\{\.\.\.u,status:'COMPLETE',drive_file_id:fileId\},token\)/);
 assert.match(worker,/r2_deleted_at=CURRENT_TIMESTAMP WHERE id=\? AND status='UPLOADING'/);
});

// Run the real browser functions against a simulated Drive session.
function loadClient(drive){
 const src=['driveSessionPut','driveOffset','uploadVideoToDrive'].map(name=>{
  const start=app.indexOf((name==='uploadVideoToDrive'?'async ':'')+'function '+name+'(');
  const next=app.indexOf('\nfunction ',start+10),nextAsync=app.indexOf('\nasync function ',start+10);
  const end=Math.min(...[next,nextAsync].filter(i=>i>0));
  return app.slice(start,end);
 }).join('\n');
 const progressLog=[];
 class XHR{
  constructor(){this.headers={};this.upload={};}
  open(m,u){this.url=u;}
  setRequestHeader(k,v){this.headers[k]=v;}
  getResponseHeader(k){return k==='Range'?this.range:null;}
  send(body){setTimeout(()=>{
   const out=drive(this.headers['Content-Range'],body);
   if(out==='network')return this.onerror();
   this.status=out.status;this.range=out.range||null;this.responseText=out.text||'';
   if(body&&this.upload.onprogress)this.upload.onprogress({lengthComputable:true,loaded:body.size});
   this.onload();
  },0);}
 }
 const ctx={XMLHttpRequest:XHR,setTimeout:(f)=>setTimeout(f,0),progress:(...a)=>progressLog.push(a[1]),console};
 vm.createContext(ctx);vm.runInContext(src+';this.uploadVideoToDrive=uploadVideoToDrive;',ctx);
 return {upload:ctx.uploadVideoToDrive,progressLog};
}

test('browser uploads to Drive in order and resumes from Drive-confirmed offset after a drop',async()=>{
 const total=10*1024*1024,chunk=4*1024*1024;let stored=0,dropped=false;const ranges=[];
 const drive=(range,body)=>{
  if(range.startsWith('bytes */'))return stored>=total?{status:200,text:JSON.stringify({id:'drivefile12345'})}:{status:308,range:stored?'bytes=0-'+(stored-1):null};
  ranges.push(range);
  const [s]=range.slice(6).split('-').map(Number);
  assert.equal(s,stored,'Drive must receive bytes in order');
  if(!dropped&&s===chunk){dropped=true;stored+=1024*1024;return 'network';} // partial write, then connection lost
  stored=s+body.size;
  return stored>=total?{status:200,text:JSON.stringify({id:'drivefile12345'})}:{status:308,range:'bytes=0-'+(stored-1)};
 };
 const {upload,progressLog}=loadClient(drive);
 const file={size:total,slice:(a,b)=>({size:b-a})};
 const id=await upload(file,{sessionUrl:SESSION,chunkSize:chunk},false);
 assert.equal(id,'drivefile12345');
 assert.equal(stored,total);
 assert.ok(ranges.includes('bytes '+(5*1024*1024)+'-'+(9*1024*1024-1)+'/'+total),'resumes at Drive-confirmed offset');
 assert.equal(progressLog.at(-1),total);
});

test('browser rejects a session URL that is not Google Drive',async()=>{
 const {upload}=loadClient(()=>({status:500}));
 await assert.rejects(upload({size:10,slice:()=>({size:10})},{sessionUrl:'https://evil.example/x'},false),/không hợp lệ/);
});

test('browser rejects impossible Drive offsets instead of skipping bytes',async()=>{
 const {upload}=loadClient(()=>({status:308,range:'bytes=0-999'}));
 await assert.rejects(upload({size:10,slice:()=>({size:10})},{sessionUrl:SESSION},false),/tiến độ không hợp lệ/);
});

test('browser rejects a missing Range after acknowledged progress instead of replaying bytes',async()=>{
 let requests=0;
 const {upload}=loadClient(()=>++requests===1?{status:308,range:'bytes=0-3'}:{status:308});
 await assert.rejects(upload({size:10,slice:(a,b)=>({size:b-a})},{sessionUrl:SESSION,chunkSize:4},false),/tiến độ không hợp lệ/);
});

test('Google failures fall back to R2 instead of blocking the upload',()=>{
 assert.match(worker,/VIDEO_DIRECT_DRIVE fallback to R2/);
 assert.match(worker,/if\(session\)\{/);
});
