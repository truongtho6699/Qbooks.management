import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/worker.js';

const ADMIN={
 id:'admin-pintest',name:'Quản trị thử nghiệm',email:'admin@example.test',
 role:'ADMIN',active:1,can_admin:1,can_pack:1,can_ship:1,
 expires_at:Math.floor(Date.now()/1000)+3600
};
function mockEnv(){
 const sqls=[], batches=[];
 return {
  sqls,batches,
  DB:{
   prepare(sql){
    sqls.push(sql);
    return {
     sql,args:[],
     bind(...args){this.args=args;return this},
     async first(){
      if(sql.includes('FROM sessions'))return ADMIN;
      if(sql.includes('FROM users WHERE id=?'))return {id:'staff-id',email:'staff@example.test',role:'SALE'};
      return null;
     },
     async all(){return{results:[]}},
     async run(){return{success:true,meta:{changes:1}}}
    }
   },
   async batch(statements){batches.push(statements);return statements.map(()=>({success:true}))}
  }
 };
}
async function request(method,route,payload,env){
 return worker.fetch(new Request('https://qbooks.test'+route,{
  method,
  headers:{authorization:'Bearer test-session','content-type':'application/json'},
  body:JSON.stringify(payload)
 }),env);
}
const staff=(pin)=>({name:'Nhân sự thử nghiệm',email:'person@example.test',role:'SALE',pin,active:true});

test('Create staff accepts 3, 4, and 8 digit PIN including leading zero',async()=>{
 for(const pin of ['123','0123','12345678']){
  const env=mockEnv();
  const res=await request('POST','/api/users',staff(pin),env);
  assert.equal(res.status,201,'PIN length '+pin.length+' should be accepted');
  assert.equal(env.batches.length,1);
  assert.ok(env.sqls.some(x=>x.includes('INSERT INTO users')));
 }
});
test('Create staff rejects non-numeric and outside 3-8 digit lengths',async()=>{
 for(const pin of ['12','123456789','1a3','12 34','']){
  const env=mockEnv();
  const res=await request('POST','/api/users',staff(pin),env);
  assert.equal(res.status,400,'PIN '+JSON.stringify(pin)+' must fail validation');
  assert.equal(env.batches.length,0);
 }
});
test('Changing employee PIN supports valid numbers and rejects invalid values',async()=>{
 for(const pin of ['0123','12345678']){
  const env=mockEnv();
  const res=await request('PATCH','/api/users/11111111-1111-1111-1111-111111111111',staff(pin),env);
  assert.equal(res.status,200,'PIN '+pin+' should be accepted on edit');
  assert.equal(env.batches.length,1);
 }
 const env=mockEnv();
 const invalid=await request('PATCH','/api/users/11111111-1111-1111-1111-111111111111',staff('123456789'),env);
 assert.equal(invalid.status,400);
 assert.equal(env.batches.length,0);
});
