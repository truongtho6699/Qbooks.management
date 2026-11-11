import test from 'node:test';
import assert from 'node:assert/strict';
import {V35_COLUMNS,displayVND,normalizeV35Row,splitInvoiceCodes,detectDuplicateInvoices,shippingTotal,validateShippingForm,canGroup} from '../src/legacy-v35.js';

test('Nguồn Google Sheets V35 có 42 cột, hai tên thời gian gộp trùng',()=>{
 assert.equal(V35_COLUMNS.length,42);
 assert.equal(V35_COLUMNS[39],'THOI_GIAN_GOM');
 assert.equal(V35_COLUMNS[40],'THOI_GIAN_GOM');
 assert.equal(V35_COLUMNS[41],'NHA_XE_SALE');
});
test('Phát hiện trùng từng mã hóa đơn, kể cả một dòng có nhiều mã',()=>{
 assert.deepEqual(splitInvoiceCodes('HD001, HD002'),['HD001','HD002']);
 assert.deepEqual(detectDuplicateInvoices(['HD001, HD004','HD999'],'HD002, HD004'),['HD004']);
});
test('Đọc đúng tiền VNĐ hiển thị và công thức 4 khoản phí',()=>{
 assert.equal(displayVND('1.200.000 đ'),1200000);
 assert.equal(displayVND('1,200,000'),1200000);
 assert.equal(displayVND('0'),0);
 assert.equal(shippingTotal({tienShip:100000,hangNang:15000,phiBen:2000,phuPhi:3000}),120000);
 assert.throws(()=>displayVND('-5.000'));
 assert.throws(()=>shippingTotal({tienShip:-1}));
});
test('Ràng buộc loại Ship ruột, SDT, tiền phí',()=>{
 assert.throws(()=>validateShippingForm({loaiShip:'Ship ruột',sdtShip:'0912345678',tenShip:''}),/Tên ship/);
 assert.equal(validateShippingForm({loaiShip:'Kiot',sdtShip:'0912345678',tienShip:50000}).tongTien,50000);
 assert.throws(()=>validateShippingForm({loaiShip:'Khác',tenShip:'Anh A'}));
});
test('Ánh xạ trục dữ liệu 42 cột DATA_TONG',()=>{
 const row=Array(42).fill('');
 row[0]='DON_20261111_0001';row[1]='17h - HD100 - Ship ngoài';row[2]='17h';row[3]='HD100, HD101';
 row[5]='Khách thử';row[6]='30Q';row[23]='CHỜ VẬN ĐƠN';row[28]='3';row[29]='Mai | Quyền';
 row[31]='100.000';row[32]='20.000';row[33]='10.000';row[34]='5.000';row[36]='Sale A';row[41]='Nhà xe X';
 const x=normalizeV35Row(row);
 assert.equal(x.id,'DON_20261111_0001');assert.equal(x.invoice_codes,'HD100, HD101');
 assert.deepEqual(x.packing_helpers,['Mai','Quyền']);assert.equal(x.total_fee,135000);
 assert.equal(x.carrier,'Nhà xe X');assert.equal(x.quantity,30);
});
test('Không tạo nhóm cho đơn đã gộp hoặc hoàn thành',()=>{
 assert.equal(canGroup([{id:'1',status:'CHỜ ĐÓNG HÀNG'},{id:'2',status:'CHỜ VẬN ĐƠN'}]),true);
 assert.throws(()=>canGroup([{id:'1',status:'HOÀN THÀNH'},{id:'2',status:'CHỜ VẬN ĐƠN'}]));
});
