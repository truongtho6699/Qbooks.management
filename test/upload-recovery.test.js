import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
function client(overrides={}){
 const start=app.indexOf('async function uploadOne(');
 const end=app.indexOf('\nconst uploadTaskRecords=',start);
 const values=new Map(),calls=[];
 const context={
  localStorage:{getItem:k=>values.get(k),setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)},
  fingerprint:()=> 'file-key',videoDuration:async()=>{},progress:()=>{},
  uploadVideoToDrive:async()=> 'drive-file',uploadPhotoWithProgress:async()=>{},
  CHUNK_BYTES:8,VIDEO_PART_CONCURRENCY:3,setTimeout,
  api:async(method,path)=>{calls.push([method,path]);return {id:'upload-1',transport:'drive',chunkSize:8,sessionUrl:'session'};},
  ...overrides
 };
 vm.createContext(context);vm.runInContext(app.slice(start,end),context);
 return {upload:context.uploadOne,values,calls};
}
const file={name:'video.mp4',size:16,type:'video/mp4',slice:(a,b)=>({size:b-a})};

test('retry keeps completed upload identity until packing is committed',async()=>{
 const {upload,values,calls}=client();
 await upload('order-1','VIDEO_DONG_HANG',file);
 assert.equal(values.get('file-key'),'upload-1','a failed pack commit must reuse this upload');
 assert.equal(calls.filter(([m])=>m==='POST').length,2);
});

test('cancelled upload session starts a new upload instead of completing an abandoned session',async()=>{
 const {upload,values,calls}=client({api:async(method,path)=>{
  calls.push([method,path]);
  if(method==='GET')return {status:'ABORTED',bytes:16,parts:[]};
  return {id:'new-upload',transport:'drive',chunkSize:8,sessionUrl:'session'};
 }});
 values.set('file-key','old-upload');
 assert.equal(await upload('order-1','VIDEO_DONG_HANG',file),'new-upload');
 assert.ok(calls.some(([m,p])=>m==='POST'&&p==='/api/uploads'));
});

test('completed upload status preserves its storage destination',async()=>{
 const destinations=[];
 const {upload,values}=client({api:async()=>({status:'COMPLETE',bytes:16,transport:'drive'}),progress:(...args)=>destinations.push(args[4])});
 values.set('file-key','upload-1');
 await upload('order-1','VIDEO_DONG_HANG',file);
 assert.equal(destinations.at(-1),'Google Drive');
});

test('expired Drive upload restarts the same record so packing is not blocked by an orphan',async()=>{
 let attempts=0;
 const {upload,values,calls}=client({uploadVideoToDrive:async()=>{
  if(++attempts===1)throw Object.assign(Error('expired'),{expired:true});
  return 'drive-file';
 }});
 await upload('order-1','VIDEO_DONG_HANG',file);
 assert.equal(attempts,2);
 assert.ok(calls.some(([m,p])=>m==='POST'&&p==='/api/uploads/upload-1/restart-drive'));
 assert.equal(values.get('file-key'),'upload-1');
});
