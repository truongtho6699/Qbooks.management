import test from 'node:test';
import assert from 'node:assert/strict';
import {DRIVE_CHUNK,directEnabled,driveSessionUrl,driveFolderId} from '../src/drive-direct.js';

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
