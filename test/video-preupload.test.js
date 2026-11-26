import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
const worker=readFileSync(new URL('../src/worker.js',import.meta.url),'utf8');
const slice=(from,to)=>app.slice(app.indexOf(from),app.indexOf(to,app.indexOf(from)));

function harness(){
 const calls=[],deleted=[],store=new Map(),resolvers=[];
 const input={files:[]};
 const ctx={
  state:{selected:{id:'o1',status:'CHỜ ĐÓNG HÀNG'},tab:'pack',preUpload:null,backgroundJob:null},
  $:id=>id==='videos'?input:{textContent:''},
  fingerprint:(o,s,f)=>o+'|'+s+'|'+f.name,
  cancelledUploadKeys:new Set(),uploadIdsByKey:new Map(),localStorage:{getItem:k=>store.get(k),removeItem:k=>store.delete(k)},
  api:async(m,p)=>{if(m==='DELETE')deleted.push(p);return {}},
  uploadSelection:(orderId,items,bg)=>{calls.push({orderId,names:items.map(x=>x[1].name),bg,cancelledAtStart:[...ctx.cancelledUploadKeys]});
   for(const [s,f] of items)ctx.uploadIdsByKey.set(ctx.fingerprint(orderId,s,f),'id-'+f.name);
   return new Promise((res,rej)=>resolvers.push({res,rej,items}));},
  Promise,videoFiles:()=>[...input.files],isNativeFile:()=>false,
 };
 vm.createContext(ctx);
 vm.runInContext(slice('function startVideoPreUpload(','async function savePack(')+';this.start=startVideoPreUpload;this.cancel=cancelPreUpload;',ctx);
 return {ctx,input,calls,deleted,resolvers};
}
const tick=()=>new Promise(r=>setTimeout(r,0));

test('picking a video starts uploading immediately in background mode',async()=>{
 const h=harness();h.input.files=[{name:'a.mp4'}];
 h.ctx.start();await tick();
 assert.equal(h.calls.length,1);assert.equal(h.calls[0].names.join(),'a.mp4');assert.equal(h.calls[0].bg,true);
 h.ctx.start();await tick();
 assert.equal(h.calls.length,1,'same selection is not uploaded twice');
});

test('changing the video cancels and deletes the previous upload before starting the new one',async()=>{
 const h=harness();h.input.files=[{name:'a.mp4'}];
 h.ctx.start();await tick();
 h.input.files=[{name:'b.mp4'}];h.ctx.start();await tick();
 assert.equal(h.calls.length,1,'new upload waits for the cancelled one to stop');
 h.resolvers[0].rej(Object.assign(Error('cancelled'),{cancelled:true}));
 await tick();await tick();await tick();
 assert.equal(h.deleted.join(),'/api/uploads/id-a.mp4');
 assert.equal(h.calls.length,2);assert.equal(h.calls[1].names.join(),'b.mp4');
 assert.equal(h.ctx.cancelledUploadKeys.size,0,'cancel markers are cleared');
});

test('no pre-upload outside the packing form or while another video job runs',async()=>{
 const h=harness();h.input.files=[{name:'a.mp4'}];
 h.ctx.state.backgroundJob={orderId:'o2'};h.ctx.start();
 h.ctx.state.backgroundJob=null;h.ctx.state.tab='ship';h.ctx.start();
 await tick();assert.equal(h.calls.length,0);
});

test('save reuses videos already sent and leaving the order cancels the pre-upload',()=>{
 assert.match(app,/rest=uploads\.filter\(\(\[stage,file\]\)=>!preKeys\.has\(fingerprint\(id,stage,file\)\)\)/);
 assert.match(app,/if\(state\.preUpload&&state\.preUpload\.orderId!==protectedId\)await cancelPreUpload\(\);/);
 assert.match(app,/\$\('videos'\)\.addEventListener\('change',startVideoPreUpload\);/);
});

test('server lets only the uploader discard an unsaved upload and cleans storage',()=>{
 assert.match(worker,/if\(method==='DELETE'&&!action\)\{/);
 assert.match(worker,/if\(u\.user_id!==user\.id\)return fail\('Chỉ người tải lên mới được hủy tệp này\.',403\)/);
 assert.match(worker,/resumeMultipartUpload\(u\.object_key,u\.upload_id\)\.abort\(\)/);
});
