import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import worker from '../src/worker.js';
import {validateShippingForm,SHIP_TYPES} from '../src/legacy-v35.js';

const future=Math.floor(Date.now()/1000)+3600;
const ORDER_ID='DON_20261124_0001';
function env({role='SALE',order={},lock=null,fresh=[],uploads=[]}={}){
 const user={id:'u-'+role,name:'Ngân',email:'n@x.test',role,active:1,expires_at:future,
  can_pack:role==='PACKER'?1:0,can_ship:0,can_admin:role==='ADMIN'?1:0};
 const o={id:ORDER_ID,status:'CHỜ VẬN ĐƠN',created_by:'u-SALE',sale_name:'Ngân',repack_stages:'',repack_requested_at:null,source_system:'QBOOKS',...order};
 const batches=[],runs=[];
 return {batches,runs,MEDIA:{},DB:{
  prepare(sql){return {sql,args:[],bind(...a){this.args=a;return this},
   async first(){
    if(sql.includes('FROM sessions'))return user;
    if(sql.includes('FROM video_role_grants'))return null;
    if(sql.includes('SELECT * FROM orders WHERE id=?'))return o;
    if(sql.includes('FROM order_locks WHERE order_id=?'))return lock;
    return null;},
   async all(){
    if(sql.includes('FROM user_menu_permissions'))return {results:[{menu_key:'orders.pack',allowed:1},{menu_key:'orders.sale',allowed:1}]};
    if(sql.includes('SELECT DISTINCT stage FROM uploads'))return {results:fresh.map(stage=>({stage}))};
    if(sql.includes('SELECT stage,status FROM uploads'))return {results:uploads};
    return {results:[]};},
   async run(){runs.push(sql);return {meta:{changes:1}}}}},
  async batch(st){batches.push(st.map(x=>[x.sql,x.args]));return st.map((x,i)=>({meta:{changes:i===1?2:1}}))}
 }};
}
const call=(e,route,body)=>worker.fetch(new Request('https://q.test'+route,{method:'POST',headers:{authorization:'Bearer t','content-type':'application/json'},body:JSON.stringify(body)}),e);

test('new delivery types: pickup and customer-paid courier cost 0, debt-supported shipping keeps the fee',()=>{
 for(const t of ['Khách tự lấy','Ship ngoài – khách trả','Ship ngoài – trừ công nợ'])assert.ok(SHIP_TYPES.includes(t));
 assert.equal(validateShippingForm({loaiShip:'Khách tự lấy',tienShip:50000,phuPhi:10000}).tongTien,0);
 assert.equal(validateShippingForm({loaiShip:'Ship ngoài – khách trả',tienShip:30000}).tongTien,0);
 assert.equal(validateShippingForm({loaiShip:'Ship ngoài – trừ công nợ',tienShip:30000}).tongTien,30000);
 assert.doesNotThrow(()=>validateShippingForm({loaiShip:'Khách tự lấy',tenShip:''}));
 assert.throws(()=>validateShippingForm({loaiShip:'Khác'}),/Loại ship không hợp lệ/);
});

test('the order\'s Sale can send a packed order back; old files become history',async()=>{
 const e=env();
 const r=await call(e,'/api/orders/'+ORDER_ID+'/repack',{stages:['VIDEO_DONG_HANG','HANG_HOA'],reason:'Đóng thiếu 2 quyển'});
 assert.equal(r.status,200);const body=await r.json();assert.equal(body.status,'CHỜ ĐÓNG HÀNG');assert.equal(body.replacedFiles,2);
 const [orderSql,uploadSql]=e.batches[0];
 assert.match(orderSql[0],/repack_count=repack_count\+1/);assert.equal(orderSql[1][2],'["VIDEO_DONG_HANG","HANG_HOA"]');
 assert.match(uploadSql[0],/SET status='SUPERSEDED'/);
});

test('re-pack is refused for other sales, after shipping, without reason or while a shipper holds the order',async()=>{
 assert.equal((await call(env({order:{created_by:'someone',sale_name:'Khác'}}),'/api/orders/'+ORDER_ID+'/repack',{stages:['VIDEO_DONG_HANG'],reason:'sai hàng'})).status,403);
 assert.equal((await call(env({order:{status:'HOÀN THÀNH'}}),'/api/orders/'+ORDER_ID+'/repack',{stages:['VIDEO_DONG_HANG'],reason:'sai hàng'})).status,409);
 assert.equal((await call(env(),'/api/orders/'+ORDER_ID+'/repack',{stages:['VIDEO_DONG_HANG'],reason:''})).status,400);
 assert.equal((await call(env(),'/api/orders/'+ORDER_ID+'/repack',{stages:['GIAO_HANG'],reason:'sai'})).status,400);
 assert.equal((await call(env({lock:{user_id:'shipper',expires_at:future}}),'/api/orders/'+ORDER_ID+'/repack',{stages:['VIDEO_DONG_HANG'],reason:'sai hàng'})).status,409);
 assert.equal((await call(env({role:'PACKER',order:{created_by:'x',sale_name:'y'}}),'/api/orders/'+ORDER_ID+'/repack',{stages:['HANG_HOA'],reason:'chụp mờ'})).status,200);
});

test('saving a re-pack requires a NEW file for every stage sent back; superseded files never block',async()=>{
 const base={order:{status:'CHỜ ĐÓNG HÀNG',repack_stages:'["VIDEO_DONG_HANG","HANG_HOA"]',repack_requested_at:'2026-11-24 10:00:00'},
  uploads:[{stage:'VIDEO_DONG_HANG',status:'SUPERSEDED'},{stage:'VIDEO_DONG_HANG',status:'COMPLETE'}]};
 const lockOk={user_id:'u-PACKER',stage:'DONG_HANG',expires_at:future};
 const missing=await call(env({role:'PACKER',lock:lockOk,fresh:['VIDEO_DONG_HANG'],...base}),'/api/orders/'+ORDER_ID+'/pack',{boxes:1});
 assert.equal(missing.status,400);assert.match((await missing.json()).error,/ảnh hàng hóa/);
 const e=env({role:'PACKER',lock:lockOk,fresh:['VIDEO_DONG_HANG','HANG_HOA'],...base});
 const ok=await call(e,'/api/orders/'+ORDER_ID+'/pack',{boxes:1});
 assert.equal(ok.status,200);
 assert.ok(e.runs.some(s=>s.includes("repack_stages=''")),'re-pack flag cleared once packed again');
});

test('screens: delivery types, re-pack button for Sale/Packer and banner for the warehouse',()=>{
 const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
 const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
 for(const t of ['Khách tự lấy','Ship ngoài – khách trả','Ship ngoài – trừ công nợ'])assert.ok(html.includes('<option>'+t+'</option>'));
 assert.match(html,/id="repackFromOrderDetail"/);assert.match(html,/id="repackBanner"/);
 assert.match(app,/if\(noFee\)f\.value=0;f\.disabled=noFee;/);
 assert.match(app,/const redoMissing=repackStages\(order\)/);
 assert.match(app,/await api\('POST','\/api\/orders\/'\+order\.id\+'\/repack'/);
});
