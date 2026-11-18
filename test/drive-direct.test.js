import test from 'node:test';
import assert from 'node:assert/strict';
import {DRIVE_CHUNK,directEnabled,driveSessionUrl,driveFolderId,offsetFromRange} from '../src/drive-direct.js';

test('V2 is disabled by default, even when OAuth is present',()=>{
 const base={DB:{},GOOGLE_CLIENT_ID:'id',GOOGLE_OAUTH_CLIENT_SECRET:'secret',GOOGLE_REFRESH_TOKEN:'refresh'};
 assert.equal(directEnabled(base),false);
 assert.equal(directEnabled({...base,DRIVE_DIRECT_ENABLED:'true'}),true);
 assert.equal(directEnabled({...base,DRIVE_DIRECT_ENABLED:'true',GOOGLE_REFRESH_TOKEN:''}),false);
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
