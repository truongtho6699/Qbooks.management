import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
const css=readFileSync(new URL('../public/navigation.css',import.meta.url),'utf8');
const extract=name=>{
 const at=source.indexOf('function '+name+'(');
 const next=source.indexOf('\n}',at);
 assert.ok(at>=0&&next>at,'Missing function '+name);
 return source.slice(at,next+2);
};
const make=new Function(
 extract('orderContentSegments')+'\n'+extract('orderContentLine')+'\n'+extract('goodsImageLinks')+
 '\n'+extract('orderCopyText')+'\n'+
 'const safeDriveUrl=value=>{try{const u=new URL(value);return u.protocol==="https:"&&["drive.google.com","docs.google.com"].includes(u.hostname)?u.toString():null}catch{return null}};\n'+
 'const fileDriveUrl=id=>id&&/^[A-Za-z0-9_-]{10,200}$/.test(id)?"https://drive.google.com/file/d/"+id+"/view":null;\n'+
 'return {orderContentSegments,orderContentLine,goodsImageLinks,orderCopyText};'
)();
test('Copy order uses a single hyphen-separated line and exact folder link',()=>{
 const o={urgent:1,invoice_codes:'HD76954',transport:'ĐÓNG ĐƠN',customer:'C DUNG',
  address:'NGÕ 20 PHẠM HÙNG',quantity:16,carrier:'63153584648',
  goods_folder_url:'https://drive.google.com/drive/folders/1egeEHQ_r-5bNeLaKyPVfx3QDV9y_386e'};
 const expected='Thông tin đơn hàng: GẤP - HD76954 - ĐÓNG ĐƠN - C DUNG - NGÕ 20 PHẠM HÙNG - 16 - 63153584648\n'+
  'Link ảnh hàng hóa: https://drive.google.com/drive/folders/1egeEHQ_r-5bNeLaKyPVfx3QDV9y_386e';
 assert.equal(make.orderCopyText(o),expected);
});
test('Empty values are removed, including zero-absent fields, without duplicate separators',()=>{
 const o={invoice_codes:'HD99',transport:'GỬI XE',customer:' Khách ',quantity:1,
 address:'',carrier:'',shipping_person:null,shipping_phone:'',delivery_time:'2026-11-20T08:45'};
 assert.equal(make.orderContentLine(o),'2026-11-20 08:45 - HD99 - GỬI XE - Khách - 1');
 assert.equal(make.orderCopyText(o).split('\n')[1],'Link ảnh hàng hóa: Chưa có link ảnh hàng hóa');
 assert.doesNotMatch(make.orderCopyText(o),/ -  - /);
});
test('Goods image folder takes precedence over individual file and rejects unsafe host',()=>{
 const o={goods_folder_url:'https://drive.google.com/drive/folders/1egeEHQ_r-5bNeLaKyPVfx3QDV9y_386e',
 media:[{stage:'HANG_HOA',drive_file_id:'1234567890ABCDEFG'}]};
 assert.equal(make.goodsImageLinks(o).length,1);
 o.goods_folder_url='https://drive.google.com.attacker.invalid/drive/folders/abc';
 assert.match(make.goodsImageLinks(o)[0],/drive.google.com\/file\/d\//);
});
test('Desktop and mobile both expose copy action; merchandise image is an anchor',()=>{
 assert.match(html,/<th class="overview-actions-col">Thao tác<\/th>/);
 assert.match(source,/const copy=button\('Copy đơn hàng',\(\)=>copyOrderToClipboard\(order\)/);
 assert.match(source,/button\('Copy đơn hàng',\(\)=>copyOrderToClipboard\(order\)/);
 assert.match(source,/link=el\('a',null,'goods-image-card'\)/);
 assert.match(source,/link\.href=url;link\.target='_blank'/);
 assert.match(source,/td\.colSpan=5/); // Chi tiết + Copy share the Thao tác column
 assert.match(css,/\.goods-image-card/);
});
