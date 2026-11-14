import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/worker.js';

function envForView(){
 const queried=[];
 const identity={
  id:'view-id',email:'view@example.com',name:'VIEW demo',role:'VIEW',
  active:1,can_pack:0,can_ship:0,can_admin:0,
  expires_at:Math.floor(Date.now()/1000)+3600
 };
 return {
  queried,
  DB:{
   prepare(sql){
    queried.push(sql);
    return {
     bind(){return this;},
     async first(){
      if(queried.at(-1).includes('FROM sessions'))return identity;
      if(queried.at(-1).includes('FROM video_role_grants'))return null;
      throw Error('VIEW attempted unexpected database lookup');
     },
     async all(){
      if(queried.at(-1).includes('FROM user_menu_permissions'))return {results:[]};
      throw Error('VIEW attempted business-data query');
     },
     async run(){throw Error('VIEW attempted data mutation');}
    };
   }
  },
  MEDIA:{get(){throw Error('VIEW accessed storage');}}
 };
}
async function call(path,method='GET'){
 const env=envForView();
 const result=await worker.fetch(new Request('https://qbooks.example'+path,{
  method,headers:{authorization:'Bearer test-view-session','content-type':'application/json'},
  ...(method!=='GET'?{body:'{}'}:{})
 }),env);
 return {status:result.status,payload:await result.json(),queries:env.queried};
}
test('VIEW bootstrap exposes role and zero operational capabilities only',async()=>{
 const x=await call('/api/bootstrap');
 assert.equal(x.status,200);
 assert.equal(x.payload.user.role,'VIEW');
 assert.deepEqual(x.payload.user.rights,{dongHang:false,vanDon:false,admin:false});
});
test('VIEW blocked from every business data endpoint including image files',async()=>{
 for(const url of [
  '/api/shipping/overview','/api/orders','/api/admin/data?kind=DATA','/api/google/pending',
  '/api/packing-people','/api/video/overview',
  '/api/uploads/11111111-1111-1111-1111-111111111111/file',
  '/api/sync/status','/api/legacy/status'
 ]){
  const x=await call(url);
  assert.equal(x.status,403,url);
  assert.ok(x.queries.every(q=>q.includes('FROM sessions')||q.includes('FROM user_menu_permissions')||q.includes('FROM video_role_grants')),'Only session and menu-permission checks expected for '+url);
 }
});
test('VIEW blocked from all operational mutations',async()=>{
 for(const url of ['/api/orders','/api/groups','/api/shipments','/api/sync/sheets/commit','/api/uploads','/api/users']){
  const x=await call(url,'POST');
  assert.equal(x.status,403,url);
 }
});
