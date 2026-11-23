import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/worker.js';
const future=Math.floor(Date.now()/1000)+3600;
function makeEnv(role){
 const calls=[];
 const user={id:'audit-'+role,name:'Tài khoản kiểm thử',email:'role@example.test',
  role,active:1,can_pack:role==='PACKER'?1:0,can_ship:0,can_admin:0,expires_at:future};
 return {MEDIA:{},calls,DB:{
  prepare(sql){calls.push(sql);return{
   bind(...args){this.args=args;return this},
   async first(){if(sql.includes('FROM sessions'))return user;
    if(sql.includes('FROM video_role_grants'))return {can_film:0,can_edit:0,can_manage:0};
    return null;},
   async all(){if(sql.includes('FROM user_menu_permissions'))
     return {results:role==='PACKER'?[{menu_key:'orders.sale',allowed:1}]:[]};
    return {results:[]};},
   async run(){throw Error('Write should never be reached in permission rejection test');}
  }},
  async batch(){throw Error('Write batch should never be reached')}
 }};
}
async function request(env,method,route){
 return worker.fetch(new Request('https://qbooks.test'+route,{
  method,headers:{authorization:'Bearer mock-session','content-type':'application/json'},
  body:JSON.stringify({invoice_codes:'HD001',customer:'Test',quantity:1,name:'Unauthorized'})
 }),env);
}
test('VIEW cannot POST orders or PATCH users even if navigating directly to API',async()=>{
 const env=makeEnv('VIEW');
 const a=await request(env,'POST','/api/orders');
 const b=await request(env,'PATCH','/api/users/11111111-1111-1111-1111-111111111111');
 assert.equal(a.status,403);assert.equal(b.status,403);
 assert.ok(!env.calls.some(sql=>sql.includes('INSERT INTO orders')));
});
test('PACKER cannot create Sale orders even if orders.sale menu is granted explicitly',async()=>{
 const env=makeEnv('PACKER');
 const a=await request(env,'POST','/api/orders');
 const b=await request(env,'PATCH','/api/users/11111111-1111-1111-1111-111111111111');
 assert.equal(a.status,403);assert.equal(b.status,403);
 assert.ok(!env.calls.some(sql=>sql.includes('INSERT INTO orders')));
});
