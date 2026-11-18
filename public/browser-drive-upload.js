// Google Drive resumable transfer: browser -> Google. No file bytes pass Qbooks Worker.
// Qbooks backend authenticates the account, owns the Google OAuth secrets, and
// independently verifies the Drive file's ID, size and parent before finalization.
export const BROWSER_DRIVE_CHUNK = 16*1024*1024;
export function trustedBrowserSession(value){
 if(typeof value!=='string'||value.length>4096)throw Error('Phiên Google Drive không hợp lệ.');
 let u;try{u=new URL(value)}catch{throw Error('Phiên Google Drive không hợp lệ.');}
 if(u.protocol!=='https:'||!['www.googleapis.com','content-googleapis.com'].includes(u.hostname)||
  u.username||u.password||u.pathname!=='/upload/drive/v3/files')
  throw Error('Địa chỉ upload không thuộc Google Drive. Đã dừng tải.');
 return u.toString();
}
export async function browserResumableUpload(file,{session,refresh,onProgress=()=>{},fetchImpl=fetch,chunkBytes=BROWSER_DRIVE_CHUNK}={}){
 if(!file||!Number.isSafeInteger(file.size)||file.size<1)throw Error('Tệp không hợp lệ.');
 if(typeof refresh!=='function')throw Error('Thiếu chức năng đối chiếu tiến độ.');
 if(!Number.isSafeInteger(chunkBytes)||chunkBytes<256*1024||chunkBytes%(256*1024)!==0)
  throw Error('Phần upload phải là bội số 256 KB.');
 if(session?.bytes!==file.size)throw Error('Dung lượng file không khớp phiên Qbooks.');
 if(session.status==='COMPLETE')return session;
 const url=trustedBrowserSession(session?.sessionUrl);
 let offset=session.offset||0;
 if(!Number.isSafeInteger(offset)||offset<0||offset>file.size)throw Error('Tiến độ file không hợp lệ.');
 let failures=0;
 while(offset<file.size){
  const end=Math.min(file.size,offset+chunkBytes);
  onProgress({offset,total:file.size,transport:'direct-google'});
  try{
   const response=await fetchImpl(url,{method:'PUT',headers:{
    'Content-Type':file.type||'application/octet-stream',
    'Content-Range':'bytes '+offset+'-'+(end-1)+'/'+file.size
   },body:file.slice(offset,end),redirect:'manual'});
   // 308: the upload is still in progress. 200/201: Google claims completion.
   // Neither status may mark Qbooks COMPLETE without independent server verification.
   if(response.status!==308&&!response.ok)
    throw Error('Google Drive từ chối phần tải (HTTP '+response.status+').');
  }catch(err){
   // A CORS/network failure can happen after Google has received the bytes.
   // Always recheck through Qbooks before attempting to send the same chunk again.
   const checked=await refresh();
   if(checked.status==='COMPLETE'){onProgress({offset:file.size,total:file.size,transport:'direct-google'});return checked;}
   if(!Number.isSafeInteger(checked.offset)||checked.offset<offset||checked.offset>file.size)throw Error('Google trả tiến độ không hợp lệ.');
   if(checked.offset>offset){offset=checked.offset;failures=0;continue;}
   if(++failures>=3)throw Error('Không thể tải trực tiếp lên Google Drive. Kiểm tra mạng hoặc chính sách CORS của Google: '+err.message);
   continue;
  }
  const checked=await refresh();
  if(checked.status==='COMPLETE'){onProgress({offset:file.size,total:file.size,transport:'direct-google'});return checked;}
  if(!Number.isSafeInteger(checked.offset)||checked.offset<=offset||checked.offset>file.size){
   if(++failures>=3)throw Error('Google Drive chưa xác nhận thêm dữ liệu; không tự tải lại toàn bộ.');
   continue;
  }
  offset=checked.offset;failures=0;
 }
 const verified=await refresh();
 if(verified.status!=='COMPLETE')throw Error('Google Drive chưa xác nhận hoàn tất. Hãy thử tiếp tục với cùng tệp.');
 onProgress({offset:file.size,total:file.size,transport:'direct-google'});
 return verified;
}
