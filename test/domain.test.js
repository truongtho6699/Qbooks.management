import test from 'node:test';
import assert from 'node:assert/strict';
import {firstInvoice,orderTitle,STATUS,canUploadStage,validateUpload,CHUNK_BYTES,partBounds,partsCount} from '../src/domain.js';

test('tên đơn chỉ lấy mã hóa đơn đầu tiên',()=>{
 assert.equal(firstInvoice('HD0011, HD0012'),'HD0011');
 assert.equal(orderTitle({invoice_codes:'HD0011, HD0012',sale_name:'Admin'}),'HD0011 - Sale: Admin');
});
test('Đóng hàng và Vận đơn chỉ hiện đúng trạng thái',()=>{
 assert.equal(STATUS.PACK,'CHỜ ĐÓNG HÀNG');assert.equal(STATUS.SHIP,'CHỜ VẬN ĐƠN');
 assert.ok(canUploadStage('PACKER','VIDEO_DONG_HANG',STATUS.PACK));
 assert.ok(!canUploadStage('PACKER','GIAO_HANG',STATUS.PACK));
 assert.ok(canUploadStage('SHIPPER','GIAO_HANG',STATUS.SHIP));
 assert.ok(!canUploadStage('SHIPPER','GIAO_HANG',STATUS.DONE));
});
test('video 2GB được chia thành phần 8MiB; phần cuối chính xác',()=>{
 const size=2*1024*1024*1024;
 assert.equal(partsCount(size),256);
 assert.deepEqual(partBounds(size,1),{start:0,end:CHUNK_BYTES,size:CHUNK_BYTES,count:256});
 assert.equal(partBounds(size,256).end,size);
 const final=partBounds(CHUNK_BYTES+17,2);assert.equal(final.size,17);
});
test('không cho tệp quá giới hạn',()=>{
 assert.doesNotThrow(()=>validateUpload({stage:'VIDEO_DONG_HANG',filename:'video.mp4',contentType:'video/mp4',size:2*1024*1024*1024}));
 assert.throws(()=>validateUpload({stage:'VIDEO_DONG_HANG',filename:'video.mp4',contentType:'video/mp4',size:2*1024*1024*1024+1}));
 assert.throws(()=>validateUpload({stage:'ANH_HOA_DON',filename:'a.jpg',contentType:'video/mp4',size:100}));
});
