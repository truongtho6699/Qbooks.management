import test from 'node:test';
import assert from 'node:assert/strict';
import {checkDriveFolderAccess,resumableDriveUpload} from '../public/video-drive.js';

const folderId='abcdefghijklmnop1234';
const token='fake-oauth-token-not-real';
const file={name:'sample.mp4',type:'video/mp4',size:9,slice:(start,end)=>new Blob([new Uint8Array(end-start)],{type:'video/mp4'})};
function fakeResponse(status,{location,range,payload}={}){
 return {ok:status>=200&&status<300,status,
  headers:{get(name){return ({location,range})[name.toLowerCase()]||null}},
  async json(){return payload||{}}
 };
}
const allowedFolder=()=>fakeResponse(200,{payload:{id:folderId,name:'QBOOK SP337',mimeType:'application/vnd.google-apps.folder',capabilities:{canAddChildren:true}}});
test('Drive upload refuses missing folder before any network call',async()=>{
 let calls=0;
 await assert.rejects(()=>resumableDriveUpload(file,{token,folderId:'',fetchImpl:async()=>{calls++;}}),/Chưa cấu hình thư mục Drive/);
 assert.equal(calls,0);
});
test('Drive upload must send folder parent and complete resumable chunks',async()=>{
 const calls=[],progress=[];
 const responses=[
  allowedFolder(),
  fakeResponse(200,{location:'https://www.googleapis.com/upload/drive/v3/files?upload_id=test'}),
  fakeResponse(308,{range:'bytes=0-4'}),
  fakeResponse(200,{payload:{id:'gfile123',size:'9',webViewLink:'https://drive.google.com/file/d/gfile123/view'}})
 ];
 const link=await resumableDriveUpload(file,{token,folderId,chunkBytes:5,
  fetchImpl:async(url,init)=>{calls.push({url,init});return responses.shift()},
  onProgress:p=>progress.push(p)
 });
 assert.equal(link,'https://drive.google.com/file/d/gfile123/view');
 assert.match(calls[0].url,/\/drive\/v3\/files\/abcdefghijklmnop1234/);
 const body=JSON.parse(calls[1].init.body);
 assert.deepEqual(body.parents,[folderId]);
 assert.equal(calls[0].init.headers.Authorization,'Bearer '+token);
 assert.equal(calls[1].init.headers.Authorization,'Bearer '+token);
 assert.equal(calls[2].init.headers['Content-Range'],'bytes 0-4/9');
 assert.equal(calls[3].init.headers['Content-Range'],'bytes 5-8/9');
 assert.deepEqual(progress.map(x=>x.percent),[56,100]);
});
test('Drive upload refuses unexpected resumable session host before sending file bytes',async()=>{
 let count=0;
 await assert.rejects(()=>resumableDriveUpload(file,{token,folderId,fetchImpl:async()=>{count++;return count===1?allowedFolder():fakeResponse(200,{location:'https://evil.example/upload/drive/v3/files?upload_id=bad'})}}),/không an toàn/);
 assert.equal(count,2);
});
test('Drive upload surfaces forbidden folder before sending file bytes',async()=>{
 let count=0;
 await assert.rejects(()=>resumableDriveUpload(file,{token,folderId,fetchImpl:async()=>{count++;return fakeResponse(403)}}),/quyền truy cập thư mục đầu sách/);
 assert.equal(count,1);
});
test('Drive upload does not accept incomplete Drive size confirmation',async()=>{
 const responses=[allowedFolder(),fakeResponse(200,{location:'https://www.googleapis.com/upload/drive/v3/files?upload_id=good'}),fakeResponse(200,{payload:{id:'abc',size:'8'}})];
 await assert.rejects(()=>resumableDriveUpload(file,{token,folderId,chunkBytes:12,fetchImpl:async()=>responses.shift()}),/chưa được xác nhận đủ dung lượng/);
});

test('Drive folder preflight rejects read-only access and refuses upload',async()=>{
 let calls=0;
 const result=()=>checkDriveFolderAccess({token,folderId,fetchImpl:async()=>{calls++;return fakeResponse(200,{payload:{id:folderId,mimeType:'application/vnd.google-apps.folder',capabilities:{canAddChildren:false}}})}});
 await assert.rejects(result,/chưa có quyền tải tệp/);
 assert.equal(calls,1);
});
test('Drive folder preflight rejects a file mistakenly configured as a folder',async()=>{
 await assert.rejects(()=>checkDriveFolderAccess({token,folderId,fetchImpl:async()=>fakeResponse(200,{payload:{id:folderId,mimeType:'video/mp4',capabilities:{canAddChildren:true}}})}),/không trỏ đến thư mục/);
});
test('Drive folder preflight refuses mismatched Google file ID',async()=>{
 await assert.rejects(()=>checkDriveFolderAccess({token,folderId,fetchImpl:async()=>fakeResponse(200,{payload:{id:'another-folder',mimeType:'application/vnd.google-apps.folder',capabilities:{canAddChildren:true}}})}),/không trỏ đến thư mục/);
});
