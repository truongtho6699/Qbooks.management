// QBOOK Media: route all operator-selected video/image files to a configured book folder,
// or to the existing shared Media folder when the book has no folder configured.
// Pure helpers shared with unit tests; never send access tokens to QBOOK servers.
export const DEFAULT_MEDIA_FOLDER_ID='1I3yAbCsMn_PiJ-haPblWdNNujbDYmy2N';
export function resolveMediaFolder(books,bookId){
 const book=(books||[]).find(x=>x.id===bookId);
 const url=String(book?.drive_url||'');
 try{
  const u=new URL(url);
  const match=u.hostname==='drive.google.com'&&u.protocol==='https:'?u.pathname.match(/^\/drive\/folders\/([-A-Za-z0-9_]{10,})\/?$/)||u.pathname.match(/^\/folders\/([-A-Za-z0-9_]{10,})\/?$/):null;
  if(match)return {id:match[1],label:'thư mục Drive đầu sách',url:'https://drive.google.com/drive/folders/'+match[1],fallback:false};
 }catch{}
 return {id:DEFAULT_MEDIA_FOLDER_ID,label:'thư mục Media chung mặc định',url:'https://drive.google.com/drive/folders/'+DEFAULT_MEDIA_FOLDER_ID,fallback:true};
}
export function validateMediaPhotos(files){
 if(files.length>10)throw Error('Chọn tối đa 10 ảnh mỗi lần lưu.');
 for(const file of files){
  if(!file||!file.size||file.size>25*1024*1024)throw Error('Ảnh '+(file?.name||'')+' phải có dữ liệu và tối đa 25 MB.');
  if(!file.type?.startsWith('image/')&&!/\.(jpg|jpeg|png|webp|heic|heif|gif)$/i.test(file.name))
   throw Error('Tệp '+file.name+' không phải ảnh hợp lệ.');
 }
}
export function appendEvidenceLinks(note,photos){
 const base=String(note||'').trim();
 if(!photos.length)return base;
 const lines=photos.map(p=>'Ảnh minh chứng: '+String(p.name||'').slice(0,55)+' — '+p.url);
 const combined=[base,...lines].filter(Boolean).join('\n');
 if(combined.length>2000)throw Error('Ghi chú và liên kết ảnh vượt 2.000 ký tự. Giảm số ảnh hoặc nội dung ghi chú.');
 return combined;
}
