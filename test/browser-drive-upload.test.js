import test from 'node:test';
import assert from 'node:assert/strict';
import {trustedBrowserSession,browserResumableUpload,BROWSER_DRIVE_CHUNK} from '../public/browser-drive-upload.js';
import {browserDirectEnabled,browserDriveSession} from '../src/drive-direct.js';

const sessionUrl='https://www.googleapis.com/upload/drive/v3/files?upload_id=sample';
const env={DB:{},DRIVE_DIRECT_ENABLED:'true',DRIVE_BROWSER_DIRECT_ENABLED:'true',DRIVE_STAGING_MODE:'true',
 DRIVE_STAGING_FOLDER_ID:'1WnvrEKMuOzQVgUuL9KtsoWNMauvrvxAV',
 GOOGLE_CLIENT_ID:'id',GOOGLE_OAUTH_CLIENT_SECRET:'secret',GOOGLE_REFRESH_TOKEN:'refresh'};

test('browser mode is feature-gated and requires valid Drive integration',()=>{
 assert.equal(browserDirectEnabled({...env,DRIVE_BROWSER_DIRECT_ENABLED:'false'}),false);
 assert.equal(browserDirectEnabled({...env,GOOGLE_REFRESH_TOKEN:''}),false);
 assert.equal(browserDirectEnabled(env),true);
 assert.equal(BROWSER_DRIVE_CHUNK,16*1024*1024);
});
test('untrusted session never reaches browser uploader',()=>{
 assert.equal(trustedBrowserSession(sessionUrl),sessionUrl);
 for(const value of ['http://www.googleapis.com/upload/drive/v3/files','https://evil.test/upload/drive/v3/files',
  'https://www.googleapis.com.evil.test/upload/drive/v3/files',
  'https://www.googleapis.com/oauth2/token','https://u:pass@www.googleapis.com/upload/drive/v3/files']){
  assert.throws(()=>trustedBrowserSession(value));
 }
});
test('browser uploader sends media to Google only, verifies via Qbooks and resumes at Google offset',async()=>{
 const file=new Blob([new Uint8Array(270000)],{type:'video/mp4'});
 const writes=[];let checks=0;
 const fetchImpl=async(url,opts)=>{
  assert.equal(url,sessionUrl);
  assert.equal(opts.method,'PUT');
  assert.equal(opts.headers['Content-Type'],'video/mp4');
  writes.push(opts.headers['Content-Range']);
  return new Response(null,{status:308});
 };
 const refresh=async()=>{checks++;return checks===2?
  {status:'COMPLETE',offset:file.size,bytes:file.size}:
  {status:'UPLOADING',offset:262144,bytes:file.size};};
 const result=await browserResumableUpload(file,{session:{sessionUrl,bytes:file.size,offset:0,status:'UPLOADING'},
  fetchImpl,refresh,chunkBytes:262144});
 assert.equal(result.status,'COMPLETE');
 assert.deepEqual(writes,['bytes 0-262143/270000','bytes 262144-269999/270000']);
 assert.equal(checks,2);
});
test('network exception rechecks Google before retry to prevent duplicated chunks',async()=>{
 const file=new Blob([new Uint8Array(262144)],{type:'video/mp4'});
 const result=await browserResumableUpload(file,{session:{sessionUrl,bytes:file.size,offset:0,status:'UPLOADING'},
  fetchImpl:async()=>{throw Error('CORS/network');},
  refresh:async()=>({status:'COMPLETE',offset:file.size,bytes:file.size}),chunkBytes:262144});
 assert.equal(result.status,'COMPLETE');
});
test('server never returns upload URL with feature flag disabled',async()=>{
 const record={id:'123e4567-e89b-12d3-a456-426614174000',status:'UPLOADING',storage_backend:'DRIVE',bytes:30};
 await assert.rejects(()=>browserDriveSession({...env,DRIVE_BROWSER_DIRECT_ENABLED:'false'},record),/chưa bật/);
});
