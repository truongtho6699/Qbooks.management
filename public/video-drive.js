// Pure, independently testable Google Drive resumable upload transport.
// Caller must obtain the OAuth token from the user's interactive Google consent.
export async function checkDriveFolderAccess({token,folderId,fetchImpl=fetch}={}){
 if(!/^[-A-Za-z0-9_]{10,}$/.test(String(folderId||'')))throw Error('Thiếu mã thư mục Google Drive hợp lệ.');
 if(!token||typeof token!=='string')throw Error('Chưa được Google cấp quyền Drive.');
 const url='https://www.googleapis.com/drive/v3/files/'+encodeURIComponent(folderId)+'?fields=id,name,mimeType,capabilities(canAddChildren)&supportsAllDrives=true';
 const response=await fetchImpl(url,{headers:{Authorization:'Bearer '+token}});
 if(!response.ok){
  if(response.status===403||response.status===404)throw Error('Tài khoản Google chưa có quyền truy cập thư mục đầu sách (403/404). Hãy yêu cầu quản lý chia sẻ thư mục.');
  throw Error('Không kiểm tra được thư mục Drive: HTTP '+response.status);
 }
 const folder=await response.json();
 if(folder.id!==folderId||folder.mimeType!=='application/vnd.google-apps.folder')throw Error('Liên kết Drive không trỏ đến thư mục.');
 if(folder.capabilities?.canAddChildren!==true)throw Error('Tài khoản Google chưa có quyền tải tệp vào thư mục đầu sách. Cần quyền chỉnh sửa.');
 return {id:folder.id,name:folder.name||''};
}

export async function resumableDriveUpload(file,{token,folderId,fetchImpl=fetch,onProgress=()=>{},chunkBytes=8*1024*1024}={}){
 if(!file||!Number.isSafeInteger(file.size)||file.size<1)throw Error('Tệp video rỗng hoặc không hợp lệ.');
 if(!/^[-A-Za-z0-9_]{10,}$/.test(String(folderId||'')))throw Error('Chưa cấu hình thư mục Drive của đầu sách. Không tải video vào thư mục Drive cá nhân.');
 if(typeof token!=='string'||!token.trim())throw Error('Chưa được cấp quyền Google Drive.');
 if(!Number.isSafeInteger(chunkBytes)||chunkBytes<1)throw Error('Kích thước phần tải không hợp lệ.');
 await checkDriveFolderAccess({token,folderId,fetchImpl});
 const start=await fetchImpl('https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id,name,size,webViewLink',{
  method:'POST',headers:{
   Authorization:'Bearer '+token,'Content-Type':'application/json; charset=UTF-8',
   'X-Upload-Content-Type':file.type||'application/octet-stream',
   'X-Upload-Content-Length':String(file.size)
  },body:JSON.stringify({name:file.name,mimeType:file.type||'application/octet-stream',parents:[folderId]})
 });
 if(!start.ok)throw Error('Google Drive không khởi tạo được phiên tải: HTTP '+start.status+'. Kiểm tra quyền sửa thư mục của đầu sách.');
 const location=start.headers.get('Location');
 let target;
 try{target=new URL(location)}catch{throw Error('Google Drive chưa cấp địa chỉ phiên tải hợp lệ.');}
 if(target.protocol!=='https:'||target.hostname!=='www.googleapis.com'||!target.pathname.startsWith('/upload/drive/'))
  throw Error('Google Drive trả phiên tải không an toàn. Đã chặn tải tệp.');
 let offset=0;
 while(offset<file.size){
  const end=Math.min(offset+chunkBytes,file.size);
  const response=await fetchImpl(target.href,{
   method:'PUT',headers:{
    'Content-Type':file.type||'application/octet-stream',
    'Content-Range':'bytes '+offset+'-'+(end-1)+'/'+file.size
   },body:file.slice(offset,end)
  });
  if(response.status===308){
   const range=response.headers.get('Range');
   const match=/^bytes=0-(\d+)$/.exec(range||'');
   if(!match)throw Error('Google Drive chưa xác nhận tiến độ, vui lòng kiểm tra lại phiên tải.');
   const next=Number(match[1])+1;
   if(!Number.isSafeInteger(next)||next<=offset||next>end)throw Error('Google Drive trả tiến độ không hợp lệ.');
   offset=next;
   onProgress({offset,total:file.size,percent:Math.round(offset*100/file.size)});
  }else if(response.ok){
   const result=await response.json();
   if(!result.id||Number(result.size)!==file.size)throw Error('Tệp Drive chưa được xác nhận đủ dung lượng.');
   onProgress({offset:file.size,total:file.size,percent:100});
   return result.webViewLink||'https://drive.google.com/file/d/'+encodeURIComponent(result.id)+'/view';
  }else throw Error('Google Drive lỗi HTTP '+response.status+'. Tệp chưa được ghi nhận vào QBooks.');
 }
 throw Error('Google Drive chưa trả kết quả hoàn tất tải tệp.');
}
