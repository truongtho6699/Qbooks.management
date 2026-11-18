// Qbooks Media Hub V2: direct-to-Google-Drive storage (no R2 writes).
// The server creates a scoped Google resumable session; when enabled in Preview,
// the browser can PUT media bytes straight to Google without proxying the file.
// Google OAuth secrets stay server-side. The session URI is a short-lived
// capability and is returned only after per-order access and lock checks.
// Legacy proxy upload remains available behind its own feature flag.
import {googleAccessToken} from './drive-auto-worker.js';
import {targetFolder} from './sync-google.js';

export const DRIVE_CHUNK=8*1024*1024;
export const browserDirectEnabled=env=>directEnabled(env)&&env.DRIVE_BROWSER_DIRECT_ENABLED==='true';
export const directEnabled=env=>env.DRIVE_DIRECT_ENABLED==='true' &&
 (env.DRIVE_STAGING_MODE!=='true'||/^[A-Za-z0-9_-]{10,}$/.test(String(env.DRIVE_STAGING_FOLDER_ID||''))) &&
 !!env.DB && !!env.GOOGLE_CLIENT_ID && !!env.GOOGLE_OAUTH_CLIENT_SECRET && !!env.GOOGLE_REFRESH_TOKEN;
const error=(message,status=400)=>Object.assign(new Error(message),{status});
const safeName=name=>String(name).replace(/[\/\\\x00-\x1f]/g,'_').slice(0,160);
export function driveFolderId(url){
 const u=new URL(url);
 if(u.protocol!=='https:'||u.hostname!=='drive.google.com')throw error('Sai thư mục Drive.');
 const id=u.pathname.match(/^\/drive\/folders\/([A-Za-z0-9_-]{10,})\/?$/)?.[1];
 if(!id)throw error('Sai đường dẫn thư mục Drive.');
 return id;
}
export function driveSessionUrl(value){
 if(typeof value!=='string'||value.length>4096)throw error('Phiên Google Drive không hợp lệ.',502);
 const u=new URL(value);
 if(u.protocol!=='https:'||!['www.googleapis.com','content-googleapis.com'].includes(u.hostname)||
 u.username||u.password||u.pathname!=='/upload/drive/v3/files')throw error('Phiên Google Drive không hợp lệ.',502);
 return u.toString();
}
export function offsetFromRange(range,total){
 if(!range)return 0;
 const m=/^bytes=0-(\d+)$/.exec(range);
 if(!m)throw error('Google trả Range không hợp lệ.',502);
 const offset=Number(m[1])+1;
 if(!Number.isSafeInteger(offset)||offset>total)throw error('Vượt dung lượng tệp.',502);
 return offset;
}
async function metadata(env,record,token){
 const url='https://www.googleapis.com/drive/v3/files/'+encodeURIComponent(record.drive_file_id)+
 '?fields=id,size,mimeType,parents,trashed,appProperties&supportsAllDrives=true';
 const res=await fetch(url,{headers:{authorization:'Bearer '+token},redirect:'manual'});
 if(!res.ok)throw error('Không đọc được tệp Google Drive để xác minh.',502);
 const d=await res.json();
 if(d.id!==record.drive_file_id||Number(d.size)!==Number(record.bytes)||
 d.mimeType!==record.content_type||d.trashed||
 !Array.isArray(d.parents)||!d.parents.includes(driveFolderId(record.drive_folder_url))||
 d.appProperties?.qbooksUploadId!==record.id)
  throw error('Tệp Google Drive chưa khớp mã, dung lượng, định dạng hoặc thư mục.',409);
 return d;
}
async function finalize(env,record,fileId,token){
 if(!fileId||!/^[A-Za-z0-9_-]{10,}$/.test(fileId))throw error('Drive chưa cung cấp file ID hợp lệ.',502);
 // Save candidate ID before independently re-reading Drive; never mark COMPLETE early.
 await env.DB.prepare('UPDATE uploads SET drive_file_id=?,drive_session_url=NULL WHERE id=? AND storage_backend=? AND status=?')
  .bind(fileId,record.id,'DRIVE','UPLOADING').run();
 const candidate={...record,drive_file_id:fileId};
 await metadata(env,candidate,token);
 const result=await env.DB.prepare("UPDATE uploads SET status='COMPLETE',drive_offset=bytes,drive_verified_at=CURRENT_TIMESTAMP,drive_completed_at=CURRENT_TIMESTAMP,completed_at=CURRENT_TIMESTAMP WHERE id=? AND storage_backend='DRIVE' AND status='UPLOADING'")
  .bind(record.id).run();
 if(result.meta?.changes!==1)throw error('Trạng thái tệp đã thay đổi, cần kiểm tra lại.',409);
 return {id:record.id,status:'COMPLETE',offset:record.bytes,bytes:record.bytes,fileId,driveUrl:'https://drive.google.com/file/d/'+encodeURIComponent(fileId)+'/view'};
}
export async function beginDriveUpload(env,{id,order,user,stage,name,type,size}){
 if(!directEnabled(env))throw error('Drive Direct chưa được kích hoạt.',503);
 const token=await googleAccessToken(env);
 const folder=await (async()=>{
  if(env.DRIVE_STAGING_MODE!=='true')return targetFolder(token,order,stage);
  const folderId=String(env.DRIVE_STAGING_FOLDER_ID||'');
  if(!/^[A-Za-z0-9_-]{10,}$/.test(folderId))throw error('Preview chưa cấu hình thư mục Drive thử nghiệm.',503);
  const response=await fetch('https://www.googleapis.com/drive/v3/files/'+encodeURIComponent(folderId)+'?fields=id,name,mimeType,trashed,capabilities(canAddChildren)&supportsAllDrives=true',{
    headers:{Authorization:'Bearer '+token},redirect:'manual'});
  if(!response.ok)throw error('Không xác minh được quyền ghi thư mục Drive thử nghiệm.',502);
  const info=await response.json();
  if(info.id!==folderId||info.trashed||info.mimeType!=='application/vnd.google-apps.folder'||info.capabilities?.canAddChildren!==true)
    throw error('Tài khoản Google không có quyền ghi thư mục Drive thử nghiệm.',403);
  return {id:folderId,url:'https://drive.google.com/drive/folders/'+folderId};
 })();
 const filename=safeName('QBOOKS_'+id+'_'+name);
 const res=await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id,name,size,mimeType,parents,appProperties',{
  method:'POST',redirect:'manual',headers:{
   authorization:'Bearer '+token,'content-type':'application/json; charset=UTF-8',
   'X-Upload-Content-Type':type,'X-Upload-Content-Length':String(size)
  },body:JSON.stringify({name:filename,mimeType:type,parents:[folder.id],appProperties:{qbooksUploadId:id,qbooksOrderId:order.id}})
 });
 if(!res.ok)throw error('Không khởi tạo được phiên tải lên Google Drive (HTTP '+res.status+').',502);
 const session=driveSessionUrl(res.headers.get('location')||'');
 await env.DB.prepare('INSERT INTO uploads(id,order_id,user_id,stage,object_key,filename,content_type,bytes,upload_id,chunk_size,storage_backend,drive_session_url,drive_folder_url,drive_offset) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,0)')
 .bind(id,order.id,user.id,stage,'drive/'+id,name,type,size,null,DRIVE_CHUNK,'DRIVE',session,folder.url).run();
 return {id,status:'UPLOADING',chunkSize:DRIVE_CHUNK,bytes:size,offset:0,storage:'DRIVE'};
}
export async function browserDriveSession(env,record){
 if(!browserDirectEnabled(env))throw error('Upload trực tiếp từ trình duyệt chưa bật.',503);
 if(record.storage_backend!=='DRIVE')throw error('Không phải phiên Drive Direct.',409);
 if(record.status==='COMPLETE')return {id:record.id,status:'COMPLETE',bytes:record.bytes,offset:record.bytes};
 if(record.status!=='UPLOADING')throw error('Phiên upload đã bị dừng.',409);
 const progress=await inspectDriveUpload(env,record);
 if(progress.status==='COMPLETE')return progress;
 // Do not expose OAuth access/refresh tokens or Google credentials.
 // The resumable session URI authorizes only this one previously-created file.
 return {id:record.id,status:'UPLOADING',bytes:record.bytes,offset:progress.offset,
  chunkSize:DRIVE_CHUNK,transport:'BROWSER_TO_GOOGLE',sessionUrl:driveSessionUrl(record.drive_session_url)};
}

async function probe(record){
 const session=driveSessionUrl(record.drive_session_url);
 const res=await fetch(session,{method:'PUT',redirect:'manual',headers:{'Content-Length':'0','Content-Range':'bytes */'+record.bytes}});
 if(res.status===308)return {offset:offsetFromRange(res.headers.get('range'),record.bytes)};
 if(res.ok){const d=await res.json();return {done:true,fileId:d.id};}
 if(res.status===404||res.status===410)throw error('Phiên upload Google đã hết hạn, cần tạo phiên mới.',410);
 throw error('Google chưa xác nhận được tiến độ upload (HTTP '+res.status+').',502);
}
export async function inspectDriveUpload(env,record){
 if(record.storage_backend!=='DRIVE')throw error('Không phải tệp Drive Direct.',409);
 if(record.status==='COMPLETE')return {id:record.id,status:'COMPLETE',offset:record.bytes,bytes:record.bytes};
 if(record.drive_file_id){
  const token=await googleAccessToken(env);
  await metadata(env,record,token);
  return finalize(env,record,record.drive_file_id,token);
 }
 if(!record.drive_session_url)throw error('Phiên upload chưa được khởi tạo.',409);
 const progress=await probe(record);
 if(progress.done)return finalize(env,record,progress.fileId,await googleAccessToken(env));
 if(progress.offset!==record.drive_offset)
  await env.DB.prepare('UPDATE uploads SET drive_offset=? WHERE id=? AND storage_backend=? AND status=?')
   .bind(progress.offset,record.id,'DRIVE','UPLOADING').run();
 return {id:record.id,status:'UPLOADING',offset:progress.offset,bytes:record.bytes,chunkSize:DRIVE_CHUNK};
}
export async function putDriveChunk(env,record,req){
 if(record.storage_backend!=='DRIVE'||record.status!=='UPLOADING')throw error('Phiên tải không hợp lệ.',409);
 if(!record.drive_session_url)return inspectDriveUpload(env,record);
 const offsetRaw=new URL(req.url).searchParams.get('offset');
 if(offsetRaw===null||!/^(0|[1-9][0-9]*)$/.test(offsetRaw))throw error('Thiếu vị trí tải hợp lệ.');
 const offset=Number(offsetRaw);
 if(!Number.isSafeInteger(offset)||offset<0)throw error('Vị trí tải không hợp lệ.');
 const current=await inspectDriveUpload(env,record);
 if(current.status==='COMPLETE')return current;
 if(offset!==current.offset)throw error('Tiến độ đã thay đổi. Kiểm tra lại rồi tiếp tục tải.',409);
 const length=Math.min(DRIVE_CHUNK,record.bytes-offset);
 if(length<=0)throw error('Dữ liệu đã hoàn tất hoặc vị trí tải không hợp lệ.',409);
 if(!req.headers.has('content-length')||Number(req.headers.get('content-length'))!==length)throw error('Đoạn dữ liệu có dung lượng không khớp.',400);
 const session=driveSessionUrl(record.drive_session_url);
 const res=await fetch(session,{method:'PUT',redirect:'manual',headers:{
  'Content-Length':String(length),'Content-Range':'bytes '+offset+'-'+(offset+length-1)+'/'+record.bytes,
  'Content-Type':record.content_type
 },body:req.body,duplex:'half'});
 if(res.status===308){
  const next=offsetFromRange(res.headers.get('range'),record.bytes);
  if(next<=offset)throw error('Google chưa nhận thêm dữ liệu, hãy kiểm tra lại.',502);
  await env.DB.prepare("UPDATE uploads SET drive_offset=? WHERE id=? AND storage_backend='DRIVE' AND status='UPLOADING'")
    .bind(next,record.id).run();
  return {id:record.id,status:'UPLOADING',offset:next,bytes:record.bytes};
 }
 if(res.ok){const d=await res.json();return finalize(env,record,d.id,await googleAccessToken(env));}
 throw error('Google Drive từ chối đoạn upload (HTTP '+res.status+').',502);
}
