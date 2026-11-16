// QBOOK R2 retention gate: Google Drive copy MUST be independently re-read and
// identified by size, parent directory and qbooks upload ID before R2 is removed.
// No Google bearer token, file content or sensitive metadata is logged.
import {VIDEO_ARCHIVE_FOLDER} from './sync-google.js';

const allowedStages=new Set(['ANH_HOA_DON','HANG_HOA','GIAO_HANG','VIDEO_DONG_HANG']);
export const moveEnabled=env=>env.SYNC_ENABLED==='true'&&env.R2_MOVE_ENABLED==='true';

function driveParent(upload){
 if(upload.stage==='VIDEO_DONG_HANG')return VIDEO_ARCHIVE_FOLDER;
 const url=new URL(upload.drive_folder_url);
 if(url.protocol!=='https:'||url.hostname!=='drive.google.com')throw Error('Sai máy chủ thư mục Google Drive.');
 const id=url.pathname.match(/^\/drive\/folders\/([A-Za-z0-9_-]{10,})\/?$/)?.[1];
 if(!id)throw Error('Đường dẫn thư mục ảnh trên Drive không hợp lệ.');
 return id;
}

export async function checkDriveCopy(upload,token,{fetchImpl=fetch}={}){
 if(!upload||upload.status!=='COMPLETE'||!allowedStages.has(upload.stage))throw Error('Chỉ có thể chuyển tệp hồ sơ đã lưu hoàn chỉnh.');
 if(!upload.drive_file_id||!upload.id)throw Error('Chưa có tệp Google Drive để xác minh.');
 if(!token)throw Error('Thiếu Google access token.');
 const parentId=driveParent(upload);
 const uri='https://www.googleapis.com/drive/v3/files/'+encodeURIComponent(upload.drive_file_id)
  +'?fields=id,size,mimeType,parents,trashed,appProperties&supportsAllDrives=true';
 const response=await fetchImpl(uri,{headers:{Authorization:'Bearer '+token},redirect:'manual'});
 if(!response.ok)throw Error('Google Drive chưa xác minh được tệp: HTTP '+response.status);
 const data=await response.json();
 if(data.trashed||data.id!==upload.drive_file_id)throw Error('Tệp Drive không tồn tại hoặc đã bị đưa vào thùng rác.');
 if(Number(data.size)!==Number(upload.bytes))throw Error('Dung lượng tệp trên Drive không khớp với R2.');
 if(!Array.isArray(data.parents)||!data.parents.includes(parentId))throw Error('Tệp Drive không nằm trong thư mục đích yêu cầu.');
 if(data.appProperties?.qbooksUploadId!==upload.id)throw Error('Tệp Drive không khớp mã hồ sơ nguồn QBOOK.');
 if(upload.content_type&&data.mimeType!==upload.content_type)throw Error('Định dạng tệp trên Drive không khớp R2.');
 return {id:data.id,size:Number(data.size),folderId:parentId};
}
export async function verifyAndMove(env,upload,token,{fetchImpl=fetch}={}){
 if(!moveEnabled(env))return {status:'PRESERVED',uploadId:upload.id};
 const verified=await checkDriveCopy(upload,token,{fetchImpl});
 await env.DB.prepare("UPDATE uploads SET drive_verified_at=COALESCE(drive_verified_at,CURRENT_TIMESTAMP),r2_delete_error='' WHERE id=? AND drive_file_id=? AND status='COMPLETE'")
  .bind(upload.id,verified.id).run();
 // A recorded verification is NOT enough. Check R2 object identity just before delete.
 const current=await env.DB.prepare('SELECT id,object_key,bytes,drive_file_id,r2_deleted_at,drive_verified_at FROM uploads WHERE id=?').bind(upload.id).first();
 if(!current||current.drive_file_id!==verified.id||!current.drive_verified_at)throw Error('Không xác nhận được bản ghi D1 trước khi dọn R2.');
 if(current.r2_deleted_at)return {status:'ALREADY_MOVED',uploadId:upload.id,fileId:verified.id};
 if(current.object_key!==upload.object_key||current.bytes!==upload.bytes)throw Error('Dữ liệu R2 thay đổi sau khi tải Drive, không được xóa.');
 const object=await env.MEDIA.head(upload.object_key);
 if(object&&object.size!==Number(upload.bytes))throw Error('Dung lượng bản gốc R2 đã thay đổi, từ chối xóa.');
 if(object)await env.MEDIA.delete(upload.object_key);
 // Idempotent retry if object was deleted but a previous D1 status update failed.
 const after=await env.MEDIA.head(upload.object_key);
 if(after)throw Error('R2 vẫn còn tệp sau yêu cầu xóa, sẽ kiểm tra lại lần sau.');
 await env.DB.prepare("UPDATE uploads SET r2_deleted_at=COALESCE(r2_deleted_at,CURRENT_TIMESTAMP),r2_delete_error='' WHERE id=? AND drive_file_id=? AND drive_verified_at IS NOT NULL")
  .bind(upload.id,verified.id).run();
 return {status:'MOVED',uploadId:upload.id,fileId:verified.id,bytes:verified.size};
}
