// QBooks -> Google Drive / Sheets on-demand. Requires an explicitly granted Google OAuth
// access token for the current Admin session. Never retain token or remove R2 originals.
const SHEET_ID='1TSuK6EF2yK8Qb9ZAU1v98VhzekrjX2SKkIDmR7OXMiw';
const ROOT_FOLDER='18rw-KCkTs0Q8MYABCzYTxfLh_W7pbx83';
const GOOGLE_BASE='https://www.googleapis.com';
const CHUNK=8*1024*1024;
const clean=s=>String(s??'').trim();
const validToken=t=>typeof t==='string'&&t.length>=30&&t.length<=4096&&/^[A-Za-z0-9._~+\/_-]+$/.test(t);
const conflict=message=>Object.assign(new Error(message),{status:409});
const noAccess=()=>Object.assign(new Error('Cần cấp quyền Google Sheets và Google Drive cho tài khoản quản trị.'),{status:403});
const quoted=s=>String(s).replace(/\\/g,'\\\\').replace(/'/g,"\\'");
function access(b){if(!validToken(b?.googleAccessToken))throw noAccess();return b.googleAccessToken;}
async function google(url,token,options={}){
 const headers={Authorization:'Bearer '+token,...options.headers};
 const resp=await fetch(url,{...options,headers,redirect:'follow',cache:'no-store'});
 if(!resp.ok){
  const body=(await resp.text()).slice(0,1500);
  throw Object.assign(new Error('Google API ('+resp.status+'): '+body),{status:resp.status===403?403:502});
 }
 return resp;
}
async function gjson(url,token,options){return (await google(url,token,options)).json();}
const driveUrl=(id)=>'https://drive.google.com/drive/folders/'+encodeURIComponent(id);
function safeName(name){return clean(name).replace(/[\\/\x00-\x1f]/g,'_').slice(0,160);}
async function findFolder(token,parent,name){
 const q="mimeType = 'application/vnd.google-apps.folder' and trashed = false and name = '"+quoted(name)+"' and '"+quoted(parent)+"' in parents";
 const url=GOOGLE_BASE+'/drive/v3/files?'+new URLSearchParams({q,fields:'nextPageToken,files(id,name,mimeType)',pageSize:'100'}).toString();
 const found=await gjson(url,token);
 if(found.files?.length>1)throw conflict('Có nhiều thư mục cùng tên: '+name+'. Cần xử lý thủ công.');
 return found.files?.[0]?.id||null;
}
async function getFolder(token,parent,name){
 const existing=await findFolder(token,parent,name);
 if(existing)return existing;
 const created=await gjson(GOOGLE_BASE+'/drive/v3/files?fields=id,name,mimeType',token,{
  method:'POST',headers:{'content-type':'application/json'},
  body:JSON.stringify({name,mimeType:'application/vnd.google-apps.folder',parents:[parent]})
 });
 if(!created.id)throw Error('Drive không trả mã thư mục.');
 return created.id;
}
async function targetFolder(token,order,stage){
 const root=await gjson(GOOGLE_BASE+'/drive/v3/files/'+ROOT_FOLDER+'?fields=id,name,mimeType,trashed',token);
 if(root.trashed||root.mimeType!=='application/vnd.google-apps.folder')throw conflict('Thư mục DON_HANG gốc không tồn tại.');
 const orderFolder=await getFolder(token,ROOT_FOLDER,safeName(order.id+'_'+order.invoice_codes.replace(/\s*,\s*/g,'_')));
 const packing=stage!=='GIAO_HANG';
 const parent=packing?await getFolder(token,orderFolder,'DONG_HANG'):orderFolder;
 const stages={ANH_HOA_DON:'01_ANH_HOA_DON',VIDEO_DONG_HANG:'02_VIDEO_DONG_HANG',HANG_HOA:'03_HANG_HOA',GIAO_HANG:'GIAO_HANG'};
 const folder=await getFolder(token,parent,stages[stage]);
 return {id:folder,url:driveUrl(folder),orderFolder:driveUrl(orderFolder),packingFolder:packing?driveUrl(parent):null};
}
async function storeFolderLinks(env,orderId,stage,folder){
 const column={ANH_HOA_DON:'invoice_folder_url',VIDEO_DONG_HANG:'video_folder_url',HANG_HOA:'goods_folder_url',GIAO_HANG:'shipping_folder_url'}[stage];
 if(!column)throw Error('Loại hồ sơ không được hỗ trợ.');
 await env.DB.prepare('UPDATE orders SET '+column+'=?'+(folder.packingFolder?',packing_folder_url=?':'')+' WHERE id=?')
  .bind(...(folder.packingFolder?[folder.url,folder.packingFolder,orderId]:[folder.url,orderId])).run();
}
async function findExistingDriveFile(token,folderId,filename){
 const q="name = '"+quoted(filename)+"' and trashed = false and '"+quoted(folderId)+"' in parents";
 const url=GOOGLE_BASE+'/drive/v3/files?'+new URLSearchParams({q,fields:'files(id,name,size,webViewLink,appProperties),nextPageToken',pageSize:'100'}).toString();
 const result=await gjson(url,token);
 if(result.files?.length>1)throw conflict('Drive có nhiều tệp trùng tên. Cần đối chiếu.');
 return result.files?.[0]||null;
}
export async function syncStatus(env){
 const dirty=await env.DB.prepare("SELECT id,invoice_codes,status,local_dirty,source_system FROM orders WHERE local_dirty=1 ORDER BY updated_at DESC LIMIT 100").all();
 const uploads=await env.DB.prepare("SELECT id,order_id,stage,filename,bytes,status,drive_file_id,drive_offset,drive_folder_url,auto_attempts,auto_next_attempt,auto_error FROM uploads WHERE status='COMPLETE' ORDER BY created_at DESC LIMIT 300").all();
 const last=await env.DB.prepare("SELECT started_at,finished_at,status,processed_files,completed_files,failed_files,notes FROM drive_sync_runs ORDER BY started_at DESC LIMIT 1").first();
 const pending=(uploads.results||[]).filter(x=>!x.drive_file_id);
 return {orders:dirty.results||[],uploads:uploads.results||[],canWriteBack:true,
  auto:{configured:!!last,lastRun:last,pending:pending.length,failed:pending.filter(x=>x.auto_attempts>0&&x.auto_error).length}};
}
export async function driveInit(env,data){
 const token=access(data);
 const upload=await env.DB.prepare('SELECT * FROM uploads WHERE id=?').bind(clean(data.uploadId)).first();
 if(!upload||upload.status!=='COMPLETE')throw Object.assign(new Error('Tệp chưa sẵn sàng.'),{status:404});
 if(upload.drive_file_id)return {done:true,uploadId:upload.id,fileId:upload.drive_file_id,offset:upload.bytes,total:upload.bytes};
 const order=await env.DB.prepare('SELECT * FROM orders WHERE id=?').bind(upload.order_id).first();
 if(!order)throw Error('Không tìm thấy đơn.');
 if(upload.drive_session_url){
  const probe=await fetch(upload.drive_session_url,{method:'PUT',headers:{'Content-Length':'0','Content-Range':'bytes */'+upload.bytes},redirect:'manual'});
  if(probe.status===308){
   const range=probe.headers.get('range');
   const offset=range?Number(range.split('-').pop())+1:0;
   if(!Number.isSafeInteger(offset)||offset<0||offset>upload.bytes)throw Error('Drive trả tiến độ không hợp lệ.');
   if(offset!==upload.drive_offset)await env.DB.prepare('UPDATE uploads SET drive_offset=? WHERE id=? AND drive_file_id IS NULL').bind(offset,upload.id).run();
   return {done:false,uploadId:upload.id,offset,total:upload.bytes};
  }
  if(probe.ok){
   const detail=await probe.json();
   if(!detail.id||Number(detail.size)!==upload.bytes)throw Error('Drive chưa xác nhận được tệp.');
   await env.DB.prepare("UPDATE uploads SET drive_file_id=?,drive_offset=?,drive_session_url=NULL,drive_completed_at=CURRENT_TIMESTAMP WHERE id=? AND drive_file_id IS NULL").bind(detail.id,upload.bytes,upload.id).run();
   return {done:true,uploadId:upload.id,fileId:detail.id,offset:upload.bytes,total:upload.bytes};
  }
  if(probe.status===404||probe.status===410){
   await env.DB.prepare('UPDATE uploads SET drive_session_url=NULL,drive_offset=0 WHERE id=? AND drive_file_id IS NULL').bind(upload.id).run();
  }else throw Object.assign(new Error('Không xác minh được phiên Drive: HTTP '+probe.status),{status:502});
 }

 const folder=await targetFolder(token,order,upload.stage);
 const filename=safeName('QBOOKS_'+upload.id+'_'+upload.filename);
 const old=await findExistingDriveFile(token,folder.id,filename);
 if(old){
  if(Number(old.size)!==upload.bytes||old.appProperties?.qbooksUploadId!==upload.id)throw conflict('Tệp Drive trùng tên nhưng khác dữ liệu nguồn: '+upload.id);
  await env.DB.prepare("UPDATE uploads SET drive_file_id=?,drive_folder_url=?,drive_offset=?,drive_completed_at=CURRENT_TIMESTAMP WHERE id=? AND drive_file_id IS NULL").bind(old.id,folder.url,upload.bytes,upload.id).run();
  await storeFolderLinks(env,order.id,upload.stage,folder);
  return {done:true,uploadId:upload.id,fileId:old.id,offset:upload.bytes,total:upload.bytes};
 }
 const url=GOOGLE_BASE+'/upload/drive/v3/files?uploadType=resumable&fields=id,name,size,mimeType,parents,webViewLink';
 const res=await google(url,token,{method:'POST',headers:{
  'Content-Type':'application/json; charset=UTF-8','X-Upload-Content-Type':upload.content_type,
  'X-Upload-Content-Length':String(upload.bytes)
 },body:JSON.stringify({name:filename,mimeType:upload.content_type,parents:[folder.id],appProperties:{qbooksUploadId:upload.id,qbooksOrderId:upload.order_id}})});
 const session=res.headers.get('location');
 if(!session||!/^https:\/\/(www\.googleapis\.com|content-googleapis\.com)\//.test(session))
  throw Error('Drive không trả phiên tải tệp hợp lệ.');
 await env.DB.prepare("UPDATE uploads SET drive_session_url=?,drive_folder_url=?,drive_offset=0 WHERE id=? AND drive_file_id IS NULL").bind(session,folder.url,upload.id).run();
 await storeFolderLinks(env,order.id,upload.stage,folder);
 return {done:false,uploadId:upload.id,offset:0,total:upload.bytes};
}
export async function driveChunk(env,data){
 const token=access(data);
 const upload=await env.DB.prepare('SELECT * FROM uploads WHERE id=?').bind(clean(data.uploadId)).first();
 if(!upload||upload.status!=='COMPLETE')throw Error('Tệp không tồn tại hoặc chưa hoàn thành.');
 if(upload.drive_file_id)return{done:true,offset:upload.bytes,total:upload.bytes};
 if(!upload.drive_session_url)throw Error('Chưa khởi tạo phiên tải Drive.');
 const start=upload.drive_offset,bytes=Math.min(CHUNK,upload.bytes-start);
 if(bytes<=0)throw Error('Trạng thái tải tệp không hợp lệ.');
 const r2=await env.MEDIA.get(upload.object_key,{range:{offset:start,length:bytes}});
 if(!r2?.body)throw Error('Không đọc được đoạn dữ liệu trên R2.');
 const end=start+bytes-1;
 const res=await fetch(upload.drive_session_url,{method:'PUT',headers:{
  'Content-Length':String(bytes),'Content-Range':'bytes '+start+'-'+end+'/'+upload.bytes,
  'Content-Type':upload.content_type
 },body:r2.body,duplex:'half',redirect:'manual'});
 if(res.status===308){
  const progress=res.headers.get('range');
  const newOffset=progress?Number(progress.split('-').pop())+1:0;
  if(!Number.isSafeInteger(newOffset)||newOffset<=start||newOffset>upload.bytes)throw Error('Drive chưa xác nhận đủ dữ liệu; cần kiểm tra phiên tải trước khi tiếp tục.');
  const updated=await env.DB.prepare('UPDATE uploads SET drive_offset=? WHERE id=? AND drive_offset=? AND drive_file_id IS NULL').bind(newOffset,upload.id,start).run();
  if(updated.meta.changes!==1)throw conflict('Có phiên khác đang chuyển tệp này; hãy tải lại trạng thái.');
  return {done:false,offset:newOffset,total:upload.bytes};
 }
 if(res.ok){
  const detail=await res.json();
  if(!detail.id||Number(detail.size)!==upload.bytes)throw Error('Drive chưa xác minh được kích thước tệp đã tải.');
  await env.DB.prepare("UPDATE uploads SET drive_file_id=?,drive_offset=?,drive_session_url=NULL,drive_completed_at=CURRENT_TIMESTAMP WHERE id=? AND drive_file_id IS NULL").bind(detail.id,upload.bytes,upload.id).run();
  return {done:true,offset:upload.bytes,total:upload.bytes,fileId:detail.id};
 }
 const err=(await res.text()).slice(0,350);
 if(res.status===404||res.status===410){
  await env.DB.prepare('UPDATE uploads SET drive_session_url=NULL,drive_offset=0 WHERE id=? AND drive_file_id IS NULL').bind(upload.id).run();
  throw conflict('Phiên tải Drive hết hạn; bấm khởi tạo lại. '+err);
 }
 if(res.status===401||res.status===403)throw noAccess();
 throw Object.assign(new Error('Drive tải phần '+start+' bị lỗi HTTP '+res.status+': '+err),{status:502});
}
const col=(i)=>{let x=i+1,s='';while(x){x--;s=String.fromCharCode(65+x%26)+s;x=Math.floor(x/26)}return s;};
const toVNTime=(value)=>{
 if(!value)return '';
 const normalized=String(value).replace(' ','T')+(String(value).includes('Z')?'':'Z');
 const d=new Date(normalized);
 if(Number.isNaN(d.getTime()))return '';
 const parts=new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Ho_Chi_Minh',day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(d);
 const m=Object.fromEntries(parts.map(x=>[x.type,x.value]));
 return m.day+'/'+m.month+'/'+m.year+' '+m.hour+':'+m.minute+':'+m.second;
};
export function desiredSheetUpdates(order,files){
 // Only update fields owned by the new QBooks workflow. Never touch source identity or Sale columns.
 const out=new Map();
 const put=(index,value)=>out.set(index,String(value??''));
 const statusChanged=order.status!==String(JSON.parse(order.source_payload||'[]')[23]||'');
 const packingChanged=!!order.packed_at && statusChanged || !!order.packed_at && !!order.packing_note;
 const shippingChanged=!!order.shipped_at && (statusChanged||!!order.shipping_type);
 if(packingChanged){
  put(11,order.packing_note);put(12,order.source_packed_by||order.packed_by);
  put(13,toVNTime(order.packed_at));put(28,order.boxes);
  let helpers=[];try{helpers=JSON.parse(order.packing_helpers||'[]')}catch{}
  put(29,Array.isArray(helpers)?helpers.join(' | '):'');
 }
 if(shippingChanged){
  put(14,order.shipping_person);put(15,order.shipping_phone);
  put(19,order.shipping_note);put(21,order.source_shipped_by||order.shipped_by);
  put(22,toVNTime(order.shipped_at));put(30,order.shipping_type);
  [order.shipping_fee,order.heavy_fee,order.terminal_fee,order.extra_fee,order.total_fee].forEach((n,i)=>put(31+i,n));
  if(order.group_id)put(37,order.group_id);
 }
 if(statusChanged)put(23,order.status);
 if(packingChanged||shippingChanged||statusChanged)put(24,toVNTime(order.updated_at));
 const stageMap={ANH_HOA_DON:25,VIDEO_DONG_HANG:26,HANG_HOA:27,GIAO_HANG:20};
 for(const f of files){
  if(f.drive_folder_url&&stageMap[f.stage]!==undefined)put(stageMap[f.stage],f.drive_folder_url);
 }
 // Root packing link must resolve from a synchronized Drive stage's folder metadata.
 if(order.packing_folder_url&&files.some(f=>f.stage!=='GIAO_HANG'&&f.drive_folder_url))put(10,order.packing_folder_url);
 return out;
}
export async function sheetCommit(env,data){
 const token=access(data);
 const orderId=clean(data.orderId);
 if(!/^DON_[0-9]{8}_[0-9]{4,}$/.test(orderId))throw Error('Mã đơn không hợp lệ.');
 const order=await env.DB.prepare('SELECT * FROM orders WHERE id=?').bind(orderId).first();
 if(!order||order.source_system!=='GOOGLE_SHEETS'||order.local_dirty!==1)
  throw conflict('Đơn không có thay đổi cần đồng bộ hoặc không thuộc nguồn Google Sheets.');
 const allUploads=(await env.DB.prepare("SELECT * FROM uploads WHERE order_id=? AND status='COMPLETE'").bind(orderId).all()).results||[];
 if(allUploads.some(x=>!x.drive_file_id))throw conflict('Phải chuyển đủ ảnh/video sang Drive trước khi cập nhật DATA_TONG.');
 const snapshot=JSON.parse(order.source_payload||'[]');
 if(!Array.isArray(snapshot)||snapshot[0]!==order.id)throw conflict('Không có bản ghi gốc để đối chiếu.');
 const header=await gjson('https://sheets.googleapis.com/v4/spreadsheets/'+SHEET_ID+'/values/DATA_TONG!A1:AP1000?valueRenderOption=FORMATTED_VALUE',token);
 const rows=header.values||[];
 if(rows[0]?.[0]!=='ID_DON'||rows[0]?.[23]!=='TRANG_THAI'||rows[0]?.[41]!=='NHA_XE_SALE')
  throw conflict('Cấu trúc DATA_TONG đã thay đổi.');
 const matched=[];
 for(let i=1;i<rows.length;i++)if(clean(rows[i]?.[0])===orderId)matched.push(i);
 if(matched.length!==1)throw conflict('Không tìm được đúng một đơn '+orderId+' trong DATA_TONG.');
 const sheetRow=matched[0]+1,live=rows[matched[0]];
 const identities=await env.DB.prepare('SELECT id,email,name FROM users WHERE id=? OR id=?').bind(order.packed_by||'',order.shipped_by||'').all();
 const userNames=new Map((identities.results||[]).map(u=>[u.id,u.email]));
 const enriched={...order,source_packed_by:order.packed_by?userNames.get(order.packed_by)||order.source_packed_by:order.source_packed_by,
  source_shipped_by:order.shipped_by?userNames.get(order.shipped_by)||order.source_shipped_by:order.source_shipped_by};
 const desired=desiredSheetUpdates(enriched,allUploads);
 if(!desired.size)throw conflict('Chưa xác định được trường thay đổi.');
 const updates=[];
 for(const [i,value] of desired){
  if(i===10&&!value)continue; // Folder root is unknown; do not erase legacy link.
  const current=clean(live[i]);
  const before=clean(snapshot[i]);
  if(current===value)continue;
  // Format-aware numeric equivalence; do not overwrite if source changed independently.
  const numeric=i===28||(i>=31&&i<=35);
  const norm=numeric?s=>s.replace(/[.,\s₫đ]/gi,''):s=>s;
  if(norm(current)!==norm(before))throw conflict('Xung đột tại DATA_TONG!'+col(i)+sheetRow+': dữ liệu nguồn đã thay đổi.');
  updates.push({range:'DATA_TONG!'+col(i)+sheetRow,values:[[value]]});
 }
 if(!updates.length){
  // The user's sheet may already match the intended data after an interrupted previous sync.
  await env.DB.prepare("UPDATE orders SET local_dirty=0,synced_at=CURRENT_TIMESTAMP WHERE id=? AND local_dirty=1").bind(orderId).run();
  return {ok:true,skipped:true,cells:0};
 }
 const result=await gjson('https://sheets.googleapis.com/v4/spreadsheets/'+SHEET_ID+'/values:batchUpdate',token,{
  method:'POST',headers:{'Content-Type':'application/json'},
  body:JSON.stringify({valueInputOption:'RAW',data:updates,includeValuesInResponse:false})
 });
 if(result.totalUpdatedCells!==updates.length)throw Error('Google Sheets chưa xác nhận đủ ô cập nhật; cần đối chiếu.');
 // Readback exact fields to ensure write succeeded; do not erase D1 local dirty on failed verification.
 const again=await gjson('https://sheets.googleapis.com/v4/spreadsheets/'+SHEET_ID+'/values:batchGet?'+updates.map(x=>'ranges='+encodeURIComponent(x.range)).join('&')+'&valueRenderOption=FORMATTED_VALUE',token);
 if((again.valueRanges||[]).some((r,i)=>clean(r.values?.[0]?.[0])!==updates[i].values[0][0]))
  throw Error('Đã ghi Google Sheets nhưng kết quả đọc lại chưa khớp. Giữ trạng thái chờ đối chiếu.');
 await env.DB.prepare("UPDATE orders SET local_dirty=0,synced_at=CURRENT_TIMESTAMP WHERE id=? AND local_dirty=1").bind(orderId).run();
 return {ok:true,updated:true,cells:updates.length,orderId};
}
