import test from 'node:test';
import assert from 'node:assert/strict';
import {desiredSheetUpdates,targetFolder,VIDEO_ARCHIVE_FOLDER} from '../src/sync-google.js';

function order(values={}){
 const snapshot=Array(42).fill('');
 snapshot[0]='DON_20261107_0010';snapshot[23]='CHỜ ĐÓNG HÀNG';
 return {id:'DON_20261107_0010',status:'CHỜ VẬN ĐƠN',packed_at:'2026-11-11 10:00:00',
   packing_note:'Gói đầy đủ',boxes:3,packing_helpers:'["Mai","Quyền"]',
   packed_by:'abc',source_packed_by:'pack@example.com',updated_at:'2026-11-11 10:00:00',
   shipping_note:'',source_payload:JSON.stringify(snapshot),...values};
}
test('pack sync updates only allowed packing + Drive columns, preserves Sale data',()=>{
 const o=order({packing_folder_url:'https://drive.google.com/drive/folders/root'});
 const files=[
  {stage:'ANH_HOA_DON',drive_folder_url:'https://drive.google.com/drive/folders/a'},
  {stage:'VIDEO_DONG_HANG',drive_folder_url:'https://drive.google.com/drive/folders/b'},
  {stage:'HANG_HOA',drive_folder_url:'https://drive.google.com/drive/folders/c'}
 ];
 const x=desiredSheetUpdates(o,files);
 assert.equal(x.get(23),'CHỜ VẬN ĐƠN');assert.equal(x.get(28),'3');
 assert.equal(x.get(29),'Mai | Quyền');assert.equal(x.get(12),'pack@example.com');
 assert.equal(x.get(10),o.packing_folder_url);assert.equal(x.get(25),files[0].drive_folder_url);
 assert.equal(x.get(26),files[1].drive_folder_url);assert.equal(x.get(27),files[2].drive_folder_url);
 for(const key of [0,1,2,3,4,5,6,7,8,9,36,38,39,40,41])assert.equal(x.has(key),false,'Forbidden col '+key);
});
test('sheet sync does not fabricate packing update for unchanged legacy row',()=>{
 const o=order({status:'CHỜ ĐÓNG HÀNG',packed_at:null,packing_note:''});
 const x=desiredSheetUpdates(o,[]);
 assert.equal(x.size,0);
});
test('ship changes use 4 separate fees and group code, without touching invoice',()=>{
 const o=order({status:'HOÀN THÀNH',packed_at:null,shipping_type:'Kiot',
  shipped_at:'2026-11-11 11:00:00',shipping_person:'Shipper A',shipping_phone:'0912345678',
  shipping_fee:100000,heavy_fee:5000,terminal_fee:2000,extra_fee:3000,total_fee:110000,
  shipping_note:'Đã giao',source_shipped_by:'ship@example.com',group_id:'VD_20261111_X'});
 const x=desiredSheetUpdates(o,[]);
 assert.equal(x.get(30),'Kiot');assert.equal(x.get(35),'110000');
 assert.equal(x.get(37),'VD_20261111_X');assert.equal(x.get(21),'ship@example.com');
 assert.equal(x.has(3),false);assert.equal(x.has(7),false);
});

test('Video packing archive resolves the exact authorized destination, not a legacy order subfolder',async()=>{
 const prev=globalThis.fetch,urls=[];
 globalThis.fetch=async(uri,opts)=>{
  urls.push(String(uri));
  assert.match(String(uri),new RegExp('/drive/v3/files/'+VIDEO_ARCHIVE_FOLDER+'[?]'));
  return {ok:true,json:async()=>({id:VIDEO_ARCHIVE_FOLDER,mimeType:'application/vnd.google-apps.folder',trashed:false,capabilities:{canAddChildren:true}})};
 };
 try{
  const folder=await targetFolder('test_token',{id:'ORDER_1',invoice_codes:'HD123'},'VIDEO_DONG_HANG');
  assert.equal(folder.id,VIDEO_ARCHIVE_FOLDER);
  assert.equal(folder.url,'https://drive.google.com/drive/folders/'+VIDEO_ARCHIVE_FOLDER);
  assert.equal(urls.length,1,'Video route must not create folders in old photo tree');
 }finally{globalThis.fetch=prev;}
});
test('Legacy image archive keeps old DON_HANG/order/DONG_HANG/01_ANH_HOA_DON tree',async()=>{
 const previous=globalThis.fetch,requests=[];
 globalThis.fetch=async(uri,opts={})=>{
  const url=String(uri);requests.push({url,method:opts.method||'GET'});
  if(url.includes('/drive/v3/files/18rw-KCkTs0Q8MYABCzYTxfLh_W7pbx83?'))return {ok:true,json:async()=>({id:'18rw-KCkTs0Q8MYABCzYTxfLh_W7pbx83',mimeType:'application/vnd.google-apps.folder',trashed:false})};
  if((opts.method||'GET')==='POST')return {ok:true,json:async()=>({id:'folder-'+requests.length,mimeType:'application/vnd.google-apps.folder'})};
  return {ok:true,json:async()=>({files:[]})};
 };
 try{
  const folder=await targetFolder('test_token',{id:'ORD_A',invoice_codes:'HD456'},'ANH_HOA_DON');
  assert.ok(folder.id.startsWith('folder-'));
  assert.ok(folder.packingFolder?.includes('/folders/'));
  assert.ok(requests.some(x=>x.url.includes('/drive/v3/files/18rw-KCkTs0Q8MYABCzYTxfLh_W7pbx83?')));
  const names=requests.filter(x=>x.method==='POST');
  assert.equal(names.length,3,'Order, packing and old photo folders should be created/reused');
 }finally{globalThis.fetch=previous;}
});
