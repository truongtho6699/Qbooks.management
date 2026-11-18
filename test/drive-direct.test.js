import test from 'node:test';
import assert from 'node:assert/strict';
import {DRIVE_CHUNK,directEnabled,driveSessionUrl,driveFolderId,offsetFromRange,beginDriveUpload,putDriveChunk,inspectDriveUpload} from '../src/drive-direct.js';

test('V2 is disabled by default, even when OAuth is present',()=>{
 const base={DB:{},GOOGLE_CLIENT_ID:'id',GOOGLE_OAUTH_CLIENT_SECRET:'secret',GOOGLE_REFRESH_TOKEN:'refresh'};
 assert.equal(directEnabled(base),false);
 assert.equal(directEnabled({...base,DRIVE_DIRECT_ENABLED:'true'}),true);
 assert.equal(directEnabled({...base,DRIVE_DIRECT_ENABLED:'true',GOOGLE_REFRESH_TOKEN:''}),false);
});
test('staging requires a separate Google Drive folder',()=>{
 const env={DB:{},GOOGLE_CLIENT_ID:'id',GOOGLE_OAUTH_CLIENT_SECRET:'secret',GOOGLE_REFRESH_TOKEN:'refresh',DRIVE_DIRECT_ENABLED:'true',DRIVE_STAGING_MODE:'true'};
 assert.equal(directEnabled(env),false);
 assert.equal(directEnabled({...env,DRIVE_STAGING_FOLDER_ID:'1WnvrEKMuOzQVgUuL9KtsoWNMauvrvxAV'}),true);
});
test('resumable chunk is 8 MiB',()=>assert.equal(DRIVE_CHUNK,8388608));
test('session URI must be trusted Google Drive upload endpoint',()=>{
 assert.equal(driveSessionUrl('https://www.googleapis.com/upload/drive/v3/files?upload_id=abc'),'https://www.googleapis.com/upload/drive/v3/files?upload_id=abc');
 for(const x of ['http://www.googleapis.com/upload/drive/v3/files','https://evil.example/upload/drive/v3/files','https://www.googleapis.com.evil.example/upload/drive/v3/files','https://user:pass@www.googleapis.com/upload/drive/v3/files','https://www.googleapis.com/token','']){
  assert.throws(()=>driveSessionUrl(x));
 }
});
test('folder ID must be from an exact Google Drive folder URL',()=>{
 assert.equal(driveFolderId('https://drive.google.com/drive/folders/1I3yAbCsMn_PiJ-haPblWdNNujbDYmy2N'),'1I3yAbCsMn_PiJ-haPblWdNNujbDYmy2N');
 assert.throws(()=>driveFolderId('https://drive.google.com.evil.test/drive/folders/1I3yAbCsMn_PiJ-haPblWdNNujbDYmy2N'));
 assert.throws(()=>driveFolderId('https://drive.google.com/file/d/1I3yAbCsMn_PiJ-haPblWdNNujbDYmy2N/view'));
});

test('Google resumable Range is strict and bounded',()=>{
 assert.equal(offsetFromRange(null,999),0);
 assert.equal(offsetFromRange('bytes=0-7',999),8);
 assert.equal(offsetFromRange('bytes=0-998',999),999);
 for(const v of ['bytes=1-10','bytes=0-1000','bytes=0--1','bytes=0-9999','bytes 0-7']){
  assert.throws(()=>offsetFromRange(v,999));
 }
});
test('Google resumable URL rejects alternate path and credentials',()=>{
 for(const value of ['https://www.googleapis.com/upload/drive/v3/files/anything',
  'https://www.googleapis.com/upload/drive/v3/files.evil',
  'https://user:pass@www.googleapis.com/upload/drive/v3/files',
  'https://www.googleapis.com/oauth2/token']){
  assert.throws(()=>driveSessionUrl(value));
 }
});

test('direct Drive upload: initiate, stream and independently verify file before COMPLETE',async()=>{
 const original=globalThis.fetch;
 const uploadId='123e4567-e89b-12d3-a456-426614174000';
 const folderId='1I3yAbCsMn_PiJ-haPblWdNNujbDYmy2N';
 const fileId='drive-file-1234567890';
 const session='https://www.googleapis.com/upload/drive/v3/files?upload_id=test123';
 const statements=[];
 let posted=0,completed=0,requestedOffset=-1;
 const env={
  DB:{prepare(sql){return {bind(...args){return {async run(){statements.push({sql,args});return {meta:{changes:1}};}};}}}},
  DRIVE_DIRECT_ENABLED:'true',GOOGLE_CLIENT_ID:'client',GOOGLE_OAUTH_CLIENT_SECRET:'fake',
  GOOGLE_REFRESH_TOKEN:'fake-refresh'
 };
 globalThis.fetch=async(input,options={})=>{
  const url=String(input),method=options.method||'GET';
  if(url==='https://oauth2.googleapis.com/token')return Response.json({access_token:'test-access'});
  if(url.includes('/drive/v3/files/'+folderId))
   return Response.json({id:folderId,mimeType:'application/vnd.google-apps.folder',trashed:false,capabilities:{canAddChildren:true}});
  if(url.includes('uploadType=resumable')&&method==='POST'){
   posted++;
   return new Response('',{status:200,headers:{location:session}});
  }
  if(url===session&&method==='PUT'){
   if(options.headers['Content-Length']==='0')
    return new Response(null,{status:308});
   requestedOffset=Number(options.headers['Content-Range'].match(/^bytes (\d+)-/)[1]);
   return Response.json({id:fileId,size:'4'});
  }
  if(url.includes('/drive/v3/files/'+fileId))
   return Response.json({id:fileId,size:'4',mimeType:'video/mp4',trashed:false,parents:[folderId],appProperties:{qbooksUploadId:uploadId}});
  throw Error('Unexpected outbound request: '+method+' '+url);
 };
 try{
  const begun=await beginDriveUpload(env,{id:uploadId,user:{id:'user-1'},order:{id:'DON_20261118_0001',invoice_codes:'HD0001'},
   stage:'VIDEO_DONG_HANG',name:'test.mp4',type:'video/mp4',size:4});
  assert.equal(begun.storage,'DRIVE');assert.equal(posted,1);
  const record={id:uploadId,user_id:'user-1',order_id:'DON_20261118_0001',status:'UPLOADING',storage_backend:'DRIVE',
   bytes:4,content_type:'video/mp4',drive_session_url:session,drive_folder_url:'https://drive.google.com/drive/folders/'+folderId,drive_offset:0};
  const request=new Request('https://qbooks.local/api/drive-uploads/'+uploadId+'/chunk?offset=0',{method:'PUT',headers:{'content-length':'4'},body:Buffer.from('abcd')});
  const complete=await putDriveChunk(env,record,request);
  assert.equal(complete.status,'COMPLETE');assert.equal(complete.fileId,fileId);
  assert.equal(requestedOffset,0);
  assert.equal(statements.some(s=>s.sql.includes("status='COMPLETE'")),true);
  assert.equal(statements.some(s=>s.sql.includes('drive_verified_at=CURRENT_TIMESTAMP')),true);
  assert.equal(statements.some(s=>s.sql.includes("r2_deleted_at")),false);
  completed++;
 }finally{globalThis.fetch=original;}
 assert.equal(completed,1);
});

test('metadata mismatch never marks Drive upload COMPLETE',async()=>{
 const prior=globalThis.fetch;
 const id='123e4567-e89b-12d3-a456-426614174123',folder='1I3yAbCsMn_PiJ-haPblWdNNujbDYmy2N';
 const statements=[];
 const env={DB:{prepare(sql){return {bind(...args){return {async run(){statements.push(sql);return {meta:{changes:1}};}};}}}},
  GOOGLE_CLIENT_ID:'id',GOOGLE_OAUTH_CLIENT_SECRET:'secret',GOOGLE_REFRESH_TOKEN:'refresh'};
 globalThis.fetch=async(input,options={})=>{
  const url=String(input);
  if(url==='https://oauth2.googleapis.com/token')return Response.json({access_token:'fake'});
  if(url.includes('/drive/v3/files/file-1234567890'))return Response.json({
   id:'file-1234567890',size:'5',mimeType:'video/mp4',trashed:false,
   parents:[folder],appProperties:{qbooksUploadId:id}
  });
  throw Error('Unexpected request '+url);
 };
 try{
  const record={id,storage_backend:'DRIVE',status:'UPLOADING',drive_file_id:'file-1234567890',
   drive_folder_url:'https://drive.google.com/drive/folders/'+folder,
   bytes:4,content_type:'video/mp4'};
  await assert.rejects(()=>inspectDriveUpload(env,record),/chưa khớp/);
  assert.equal(statements.some(sql=>sql.includes("status='COMPLETE'")),false);
 }finally{globalThis.fetch=prior;}
});
