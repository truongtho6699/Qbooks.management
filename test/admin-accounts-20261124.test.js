import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/worker.js';

const ADMIN={id:'admin-1',name:'Quản trị',email:'admin@example.test',role:'ADMIN',active:1,can_admin:1,can_pack:1,can_ship:1,expires_at:Math.floor(Date.now()/1000)+3600};
const TARGET='11111111-1111-1111-1111-111111111111';
function env({target={id:TARGET,email:'staff@example.test',name:'Nhân sự',role:'SALE',can_pack:0,can_ship:0,can_admin:0,active:1},otherAdmins=1,existingEmail=false,auditTotal=0}={}){
 const sqls=[],batches=[],runs=[];
 return {sqls,batches,runs,MEDIA:{},DB:{
  prepare(sql){sqls.push(sql);return{sql,args:[],
   bind(...a){this.args=a;return this},
   async first(){
    if(sql.includes('FROM sessions'))return ADMIN;
    if(sql.includes('FROM users WHERE id=?'))return target;
    if(sql.includes('COUNT(*) AS n FROM users'))return {n:otherAdmins};
    if(sql.includes('SELECT id FROM users WHERE email=?'))return existingEmail?{id:'x'}:null;
    if(sql.includes('COUNT(*) AS n FROM audit_log'))return {n:auditTotal};
    return null;},
   async all(){return {results:[]}},
   async run(){runs.push({sql,args:this.args});return {success:true,meta:{changes:2}}}
  }},
  async batch(st){batches.push(st.map(x=>x.sql));return st.map(()=>({success:true}))}
 }};
}
const call=(e,method,route,body)=>worker.fetch(new Request('https://qbooks.test'+route,{method,headers:{authorization:'Bearer t','content-type':'application/json'},body:body?JSON.stringify(body):undefined}),e);
const staff=(over={})=>({name:'Nhân sự',email:'staff@example.test',role:'SALE',active:true,pin:'',...over});

test('the last active administrator cannot be demoted or deactivated',async()=>{
 const e=env({target:{id:TARGET,email:'a2@example.test',name:'A2',role:'ADMIN',can_pack:1,can_ship:1,can_admin:1,active:1},otherAdmins:0});
 const r=await call(e,'PATCH','/api/users/'+TARGET,staff({role:'SALE'}));
 assert.equal(r.status,409);assert.match((await r.json()).error,/quản trị viên hoạt động cuối cùng/);
 assert.equal(e.batches.length,0);
 const ok=await call(env({target:{id:TARGET,email:'a2@example.test',name:'A2',role:'ADMIN',can_pack:1,can_ship:1,can_admin:1,active:1},otherAdmins:1}),'PATCH','/api/users/'+TARGET,staff({role:'SALE'}));
 assert.equal(ok.status,200);
});

test('PIN reset unlocks the account and signs the person out everywhere',async()=>{
 const e=env();
 const r=await call(e,'PATCH','/api/users/'+TARGET,staff({pin:'654321'}));
 assert.equal(r.status,200);assert.equal((await r.json()).sessionsRevoked,true);
 const sqls=e.batches[0];
 assert.ok(sqls.some(s=>s.includes('failed_attempts=0,locked_until=0')));
 assert.ok(sqls.some(s=>s==='DELETE FROM sessions WHERE user_id=?'));
});

test('deactivating signs out; a plain role change does not',async()=>{
 const off=env();await call(off,'PATCH','/api/users/'+TARGET,staff({active:false}));
 assert.ok(off.batches[0].includes('DELETE FROM sessions WHERE user_id=?'));
 const plain=env();const r=await call(plain,'PATCH','/api/users/'+TARGET,staff({role:'PACKER'}));
 assert.equal((await r.json()).sessionsRevoked,false);
 assert.ok(!plain.batches[0].includes('DELETE FROM sessions WHERE user_id=?'));
});

test('creating staff rejects duplicate and malformed emails with a clear message',async()=>{
 const dup=await call(env({existingEmail:true}),'POST','/api/users',staff({email:'staff@example.test',pin:'123456'}));
 assert.equal(dup.status,409);assert.match((await dup.json()).error,/đã có nhân sự/);
 const bad=await call(env(),'POST','/api/users',staff({email:'not-an-email',pin:'123456'}));
 assert.equal(bad.status,400);
 const ok=await call(env(),'POST','/api/users',staff({email:'NEW@Example.test',pin:'123456'}));
 assert.equal(ok.status,201);
});

test('audit log is searchable and paged, logins hidden by default',async()=>{
 const e=env({auditTotal:250});
 const r=await call(e,'GET','/api/admin/data?kind=LOG&q=HD001&page=2');
 const body=await r.json();
 assert.equal(body.page,2);assert.equal(body.pages,3);assert.equal(body.headers[1],'NHAN_SU');
 const sql=e.sqls.find(s=>s.includes('FROM audit_log a LEFT JOIN users u')&&s.includes('LIMIT ? OFFSET ?'));
 assert.match(sql,/NOT IN \('LOGIN_PIN','LOGIN_GOOGLE'\)/);assert.match(sql,/a\.details LIKE \?/);
});

test('admin can retry files whose Drive sync is waiting on back-off',async()=>{
 const e=env();
 const r=await call(e,'POST','/api/sync/retry',{});
 assert.equal(r.status,200);assert.equal((await r.json()).files,2);
 assert.ok(e.runs.some(x=>x.sql.includes('SET auto_next_attempt=0,auto_lease_until=0')));
});
