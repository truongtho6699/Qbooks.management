import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
test('safe to close only after server records completed packing',()=>{
 const begin=app.indexOf('const saved=[...preSaved,...await uploadSelection(id,rest,true)]');
 const commit=app.indexOf("await api('POST','/api/orders/'+id+'/pack',payload);",begin);
 const safe=app.indexOf('Có thể đóng trình duyệt',commit);
 assert.ok(begin>=0&&commit>begin&&safe>commit);
 assert.match(app.slice(begin,commit),/Chưa đóng trình duyệt/);
});
test('never claim browser closed can continue sending bytes',()=>{
 assert.match(html,/Trong lúc video đang gửi, không đóng trình duyệt/);
 assert.match(app,/không đóng tab\/Safari/);
 assert.match(app,/window.addEventListener\('beforeunload'/);
 assert.match(app,/Hệ thống tự chuyển tệp lên Google Drive trong vài phút/);
});
