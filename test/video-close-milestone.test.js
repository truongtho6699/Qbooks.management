import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
test('safe to close only after server records completed packing',()=>{
 const begin=app.indexOf('const saved=await uploadSelection(id,uploads,true)');
 const commit=app.indexOf("await api('POST','/api/orders/'+id+'/pack',payload);",begin);
 const safe=app.indexOf('CÓ THỂ ĐÓNG TRÌNH DUYỆT',commit);
 assert.ok(begin>=0&&commit>begin&&safe>commit);
 assert.match(app.slice(begin,commit),/Chưa đóng trình duyệt/);
});
test('never claim browser closed can continue sending bytes',()=>{
 assert.match(html,/Video còn truyền từ điện thoại\/máy tính lên R2: không đóng trình duyệt/);
 assert.match(app,/KHÔNG đóng tab\/Safari/);
 assert.match(app,/window.addEventListener\('beforeunload'/);
 assert.match(app,/Đồng bộ Google Drive tiếp tục trên máy chủ nếu Worker đồng bộ đã bật/);
});
