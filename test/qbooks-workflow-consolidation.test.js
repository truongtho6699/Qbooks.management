import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const html=read('public/index.html');
const app=read('public/app.js');
const nav=read('public/navigation.js');
const media=read('public/video.js');
const worker=read('src/worker.js');
const css=read('public/navigation.css');

test('Sale form no longer requests Sale name; delivery choice comes first',()=>{
 const form=html.match(/<form id="saleForm">([\s\S]*?)<\/form>/)?.[1];
 assert.ok(form,'Sale form must exist');
 assert.doesNotMatch(form,/name="sale_name"/);
 assert.match(form,/name="delivery_mode"/);
 assert.match(form,/name="delivery_time"/);
 assert.ok(form.indexOf('name="delivery_mode"')<form.indexOf('name="invoice_codes"'));
 const transports=['SHIP NGOÀI','SHIP KIOT','GỬI XE','GỬI TÀU','GIAO HÀNG','ĐÓNG ĐƠN'];
 for(const value of transports)assert.ok(form.includes('<option>'+value+'</option>'),value);
 assert.match(app,/f\.urgent=f\.delivery_mode==='GAP'/);
 assert.match(worker,/saleName=user\.name/);
 assert.match(worker,/delivery_time,created_by/);
 assert.match(worker,/Cần chọn GẤP hoặc thời gian giao/);
});
test('shipment has no status selection and always finishes completed',()=>{
 assert.doesNotMatch(html,/id="shippingStatus"/);
 assert.match(worker,/const target=STATUS\.DONE;/);
 assert.match(app,/status:'HOÀN THÀNH',note:v\('shippingNote'\)/);
});
test('shipping overview contains all detail and copy fields',()=>{
 for(const column of ['address','urgent','delivery_time','shipping_person','shipping_phone','transport','carrier']){
  assert.match(worker,new RegExp('\\b'+column+'\\b'));
 }
 const extracted=app.match(/function orderContentLines\(order\)\{[\s\S]*?\n\}/);
 assert.ok(extracted);
 const makeLines=new Function(extracted[0]+';return orderContentLines;')();
 const lines=makeLines({urgent:1,invoice_codes:'HD001',transport:'SHIP NGOÀI',customer:'Mẫu',
  address:'Địa chỉ mẫu',quantity:10,carrier:'Nhà xe mẫu',shipping_person:'Người ship',shipping_phone:'0900000000'});
 assert.equal(lines.length,9);
 assert.ok(lines.some(x=>x.includes('GẤP')));
 assert.ok(lines.some(x=>x.includes('0900000000')));
 assert.doesNotMatch(html,/id="copyOrderInfo"/);
 assert.match(app,/button\('Copy đơn hàng',\(\)=>copyOrderToClipboard\(order\)/);
 assert.match(app,/function goodsImageLinks/);
 assert.match(app,/item\.stage==='HANG_HOA'/);
 assert.match(app,/Link ảnh hàng hóa/);
 assert.match(app,/function overviewMediaLinks/);
});
test('Media menu removed duplicates and moved administration to System Admin',()=>{
 const groups=nav.slice(nav.indexOf('const MEDIA_GROUPS='),nav.indexOf('const iconPaths='));
 for(const removed of ["['adminOverview',","['createVideo',","['staff',","['permissions',","['audit',"])
  assert.ok(!groups.includes(removed),'Media NAV still contains '+removed);
 for(const value of ['Tài khoản và nhân sự','Phân quyền tài khoản','Dữ liệu và nhật ký'])
  assert.ok(nav.includes(value));
 assert.match(nav,/makeBranch\(container,'QUẢN TRỊ HỆ THỐNG',adminOpen,1/);
 assert.match(app,/adminPanel:'accounts'/);
 assert.match(app,/data-admin-section/);
 assert.match(worker,/kind==='VIDEO_LOG'/);
 const mediaNav=media.slice(media.indexOf('const NAV=['),media.indexOf('const mobile='));
 for(const id of ["id:'adminOverview'","id:'createVideo'","id:'staff'","id:'permissions'","id:'audit'"])
  assert.ok(!mediaNav.includes(id),'Media module still exposes '+id);
});
test('profile menu includes account details, secure PIN change and logout',()=>{
 for(const id of ['accountMenuName','accountInfoBtn','changePinBtn','logoutBtn','accountInfoDialog','changePinDialog'])
  assert.ok(html.includes('id="'+id+'"'),id);
 assert.match(app,/\/api\/account\/change-pin/);
 assert.match(worker,/if\(method==='POST'&&path==='\/api\/account\/change-pin'\)/);
 assert.match(worker,/PIN hiện tại không đúng/);
 assert.match(worker,/failed_attempts/);
 assert.match(worker,/SELF_CHANGE_PIN/);
 assert.match(css,/qbook-account-trigger/);
 assert.doesNotMatch(app,/localStorage\.setItem\([^;\n]*newPin/);
});
