// Mapping versioned for QBooks V35. Use positional indices for duplicate AO header.
export const V35_COLUMNS=Object.freeze([
'ID_DON','NOI_DUNG_GOC','GAP','MA_HOA_DON','LOAI_VAN_CHUYEN','TEN_KHACH','SO_QUYEN','DIA_CHI',
'USER_TAO','THOI_GIAN_TAO','LINK_THU_MUC_DONG_HANG','GHI_CHU_DONG_HANG','USER_DONG_HANG',
'THOI_GIAN_DONG_HANG','NGUOI_GIAO_HANG','SDT_GIAO_HANG','MA_KIOT','NHA_XE','MA_VAN_DON',
'GHI_CHU_VAN_DON','LINK_THU_MUC_GIAO_HANG','USER_VAN_DON','THOI_GIAN_VAN_DON','TRANG_THAI',
'CAP_NHAT_CUOI','LINK_ANH_HOA_DON','LINK_VIDEO_DONG_HANG','LINK_HANG_HOA','SO_THUNG',
'NGUOI_DONG_CUNG','LOAI_SHIP','TIEN_SHIP','HANG_NANG','PHI_BEN','PHU_PHI','TONG_TIEN',
'TEN_SALE','NHOM_VAN_DON','USER_GOM_DON','THOI_GIAN_GOM','THOI_GIAN_GOM','NHA_XE_SALE'
]);
export const V35_STATUS=Object.freeze(['CHỜ ĐÓNG HÀNG','CHỜ VẬN ĐƠN','ĐANG GIAO','HOÀN THÀNH']);
export const V35_SHIP_TYPES=Object.freeze(['Ship ruột','Kiot','App']);
const field=(row,i)=>String(row?.[i]??'').trim();
export function splitInvoiceCodes(v){return String(v??'').split(',').map(x=>x.trim().toUpperCase()).filter(Boolean);}
export function detectDuplicateInvoices(existing,proposed){
 const seen=new Set(existing.flatMap(s=>splitInvoiceCodes(s)));
 return splitInvoiceCodes(proposed).filter(x=>seen.has(x));
}
export function moneyVN(v,label='Khoản tiền'){
 const n=Number(v==null||v===''?0:v);
 if(!Number.isSafeInteger(n)||n<0)throw Error(label+' cần là số nguyên không âm.');
 return n;
}
export function displayVND(value){
 const v=String(value??'').trim().replace(/[\s₫đ]/gi,'');
 if(!v)return 0;
 if(/^\d{1,3}([.,]\d{3})+$/.test(v))return moneyVN(Number(v.replace(/[.,]/g,'')));
 if(/^\d+$/.test(v))return moneyVN(Number(v));
 throw Error('Giá trị tiền trong Google Sheets không hợp lệ: '+value);
}
export function shippingTotal(f){return moneyVN(f.tienShip,'Tiền ship')+moneyVN(f.hangNang,'Hàng nặng')+moneyVN(f.phiBen,'Phí bến')+moneyVN(f.phuPhi,'Phụ phí');}
export function normalizeV35Row(row){
 if(!Array.isArray(row)||!row.length)throw Error('Dòng DATA_TONG trống hoặc không hợp lệ.');
 // Google Sheets API bỏ các ô trống ở cuối dòng, trong khi header vẫn đủ A:AP.
 row=Array.from({length:42},(_,i)=>row[i]??'');
 const id=field(row,0);
 if(!/^DON_[0-9]{8}_[0-9]{4,}$/.test(id))throw Error('ID_DON không hợp lệ.');
 const status=field(row,23);
 if(status&&!V35_STATUS.includes(status))throw Error('Trạng thái không được hỗ trợ: '+status);
 const codes=field(row,3);
 if(!codes)throw Error('Mã hóa đơn trống.');
 const fees={tienShip:displayVND(field(row,31)),hangNang:displayVND(field(row,32)),phiBen:displayVND(field(row,33)),phuPhi:displayVND(field(row,34))};
 const helpers=field(row,29).split('|').map(x=>x.trim()).filter(Boolean);
 return {
  id,invoice_codes:codes,original_content:field(row,1),delivery_time:field(row,2),transport:field(row,4),
  customer:field(row,5),quantity:Number(field(row,6).replace(/[^0-9]/g,''))||0,address:field(row,7),
  sale_name:field(row,36),carrier:field(row,41)||field(row,17),
  status:status||'CHỜ ĐÓNG HÀNG',group_id:field(row,37)||null,
  packing_note:field(row,11),boxes:Number(field(row,28))||0,packing_helpers:helpers,
  shipping_note:field(row,19),shipping_person:field(row,14),shipping_phone:field(row,15),
  shipping_type:field(row,30),shipping_fee:fees.tienShip,heavy_fee:fees.hangNang,
  terminal_fee:fees.phiBen,extra_fee:fees.phuPhi,total_fee:shippingTotal(fees),
  packing_folder_url:field(row,10),shipping_folder_url:field(row,20),
  invoice_folder_url:field(row,25),video_folder_url:field(row,26),goods_folder_url:field(row,27),
  source_system:'GOOGLE_SHEETS',source_updated_at:field(row,24),
  legacy_created_by:field(row,8),legacy_created_at:field(row,9),
  legacy_packed_by:field(row,12),legacy_shipped_by:field(row,21)
 };
}
export function validateShippingForm(f){
 const type=String(f.loaiShip||'').trim();
 if(!V35_SHIP_TYPES.includes(type))throw Error('Loại ship chỉ được chọn Ship ruột, Kiot hoặc App.');
 const phone=String(f.sdtShip||'').trim();
 if(phone&&!/^(\+84|0)[0-9]{9,10}$/.test(phone))throw Error('Số điện thoại ship không hợp lệ.');
 if(type==='Ship ruột'&&!String(f.tenShip||'').trim())throw Error('Tên ship là bắt buộc khi chọn Ship ruột.');
 return {...f,loaiShip:type,sdtShip:phone,tenShip:String(f.tenShip||'').trim(),tongTien:shippingTotal(f)};
}
export function canGroup(orders){
 if(orders.length<2)throw Error('Chọn ít nhất hai đơn để gộp.');
 if(orders.some(o=>o.group_id||o.status==='HOÀN THÀNH'))throw Error('Chỉ gộp đơn chưa có nhóm và chưa hoàn thành.');
 const codes=new Set(orders.map(o=>o.id));if(codes.size!==orders.length)throw Error('Đã chọn trùng đơn.');
 return true;
}
