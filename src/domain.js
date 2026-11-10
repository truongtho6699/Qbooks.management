export const STATUS = Object.freeze({ PACK:'CHỜ ĐÓNG HÀNG',SHIP:'CHỜ VẬN ĐƠN',MOVING:'ĐANG GIAO',DONE:'HOÀN THÀNH' });
export const STAGES = Object.freeze({ANH_HOA_DON:'PACKER',VIDEO_DONG_HANG:'PACKER',HANG_HOA:'PACKER',GIAO_HANG:'SHIPPER'});
export const CHUNK_BYTES=8*1024*1024;
export const MAX_VIDEO=2*1024*1024*1024;
export const MAX_IMAGE=25*1024*1024;
export function firstInvoice(value){return String(value||'').split(',')[0].trim();}
export function orderTitle(order){return firstInvoice(order.invoice_codes)+' - Sale: '+order.sale_name;}
export function permittedStatus(role){return role==='PACKER'?STATUS.PACK:role==='SHIPPER'?STATUS.SHIP:null;}
export function canUploadStage(role,stage,status){
 return Boolean(STAGES[stage] && (role==='ADMIN'||STAGES[stage]===role)
   && status === (stage==='GIAO_HANG'?STATUS.SHIP:STATUS.PACK));
}
export function validateUpload({stage,filename,contentType,size}){
 const video=stage==='VIDEO_DONG_HANG';
 if(!STAGES[stage])throw Error('Loại tệp không được hỗ trợ.');
 if(!Number.isSafeInteger(size)||size<=0||size>(video?MAX_VIDEO:MAX_IMAGE))throw Error('Dung lượng tệp không hợp lệ.');
 if(!/^[\w.\-() áàảãạâăêôơưđÁÀẢÃẠÂĂÊÔƠƯĐ]{1,180}$/.test(filename))throw Error('Tên tệp không hợp lệ.');
 if(video?!/^video\//.test(contentType):!/^image\//.test(contentType))throw Error('Sai định dạng tệp.');
 return true;
}
export function partsCount(size,chunk=CHUNK_BYTES){return Math.ceil(size/chunk);}
export function partBounds(size,number,chunk=CHUNK_BYTES){
 const count=partsCount(size,chunk);
 if(!Number.isInteger(number)||number<1||number>count)throw Error('Số phần không hợp lệ.');
 const start=(number-1)*chunk;return{start,end:Math.min(size,start+chunk),size:Math.min(size-start,chunk),count};
}
