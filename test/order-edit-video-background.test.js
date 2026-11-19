import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const server=read('src/worker.js'),app=read('public/app.js'),html=read('public/index.html'),css=read('public/navigation.css');

test('protected edit route verifies ownership, stage, duplicate invoices and audits changes',()=>{
 assert.match(server,/const editOrderMatch=path\.match/);
 assert.match(server,/editOrderMatch&&method==='PATCH'/);
 assert.match(server,/user\.role==='VIEW'/);
 assert.match(server,/before\.created_by===user\.id/);
 assert.match(server,/before\.status!==STATUS\.PACK/);
 assert.match(server,/id<>\? AND REPLACE\(REPLACE\(UPPER\(TRIM\(invoice_codes\)\)/);
 assert.match(server,/updated_at=\? AND status=\?/);
 assert.match(server,/await audit\(env,user,'EDIT_ORDER'/);
 assert.match(server,/const lock=await env\.DB\.prepare\('SELECT user_id,expires_at FROM order_locks/);
 assert.match(server,/SELECT id,created_by,invoice_codes/);
});
test('Sale and overview have edit actions with form and safe expected timestamp',()=>{
 for(const field of ['invoice_codes','customer','transport','quantity','address','carrier','delivery_mode','delivery_time'])
  assert.ok(html.includes('name="'+field+'"'),field);
 assert.match(html,/id="editOrderDialog"/);
 assert.match(html,/id="saleOrdersList"/);
 assert.match(app,/function canEditOrder\(order\)/);
 assert.match(app,/function openEditOrder\(order\)/);
 assert.match(app,/data\.expected_updated_at=order\.updated_at/);
 assert.match(app,/api\('PATCH','\/api\/orders\/'\+order\.id,data\)/);
 assert.match(app,/if\(canEditOrder\(order\)\)/);
});
test('background video maintains order lock, completes packing after bytes and survives internal menu switches',()=>{
 assert.match(app,/state\.backgroundJob=\{orderId:id/);
 assert.match(app,/void \(async\(\)=>\{/);
 assert.match(app,/await uploadSelection\(id,uploads\)/);
 assert.match(app,/await api\('POST','\/api\/orders\/'\+id\+'\/pack',payload\)/);
 assert.match(app,/const protectedId=state\.backgroundJob\?\.orderId/);
 assert.match(app,/id!==protectedId/);
 assert.match(app,/if\(state\.backgroundJob\)return notice\('Video đang tải nền/);
 assert.match(app,/window\.addEventListener\('beforeunload',e=>\{if\(state\.backgroundJob\)/);
 assert.match(html,/id="backgroundUploadBar"/);
 assert.match(css,/qbook-background-upload/);
});
