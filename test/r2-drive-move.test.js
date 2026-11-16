import test from 'node:test';
import assert from 'node:assert/strict';
import {checkDriveCopy,verifyAndMove,moveEnabled} from '../src/r2-drive-move.js';
import {VIDEO_ARCHIVE_FOLDER} from '../src/sync-google.js';

const upload={id:'upload-123',status:'COMPLETE',stage:'VIDEO_DONG_HANG',object_key:'orders/order-1/video.mp4',bytes:91501,content_type:'video/mp4',drive_file_id:'google-video-123',drive_folder_url:'https://drive.google.com/drive/folders/'+VIDEO_ARCHIVE_FOLDER};
function reply(props={}){return {ok:true,json:async()=>({
 id:upload.drive_file_id,size:String(upload.bytes),mimeType:upload.content_type,parents:[VIDEO_ARCHIVE_FOLDER],trashed:false,
 appProperties:{qbooksUploadId:upload.id},...props
 })};}
test('Video archives must use only the requested video folder',async()=>{
 assert.equal(VIDEO_ARCHIVE_FOLDER,'1I3yAbCsMn_PiJ-haPblWdNNujbDYmy2N');
 const v=await checkDriveCopy(upload,'token',{fetchImpl:async(uri)=>{assert.match(uri,/google-video-123/);return reply();}});
 assert.equal(v.folderId,VIDEO_ARCHIVE_FOLDER);
});
for(const [label,change,pattern] of [
 ['wrong size',{size:'91500'},/Dung lượng/],
 ['wrong parent',{parents:['somewhere-else']},/thư mục/],
 ['missing source ID',{appProperties:{}},/mã hồ sơ/],
 ['trashed',{trashed:true},/thùng rác/],
 ['different file ID',{id:'different'},/không tồn tại/],
 ['wrong MIME',{mimeType:'image/png'},/Định dạng/]
])test('Do not move R2 when Drive copy has '+label,async()=>{
 await assert.rejects(checkDriveCopy(upload,'token',{fetchImpl:async()=>reply(change)}),pattern);
});
test('R2 move remains disabled without explicit switch even when upload is complete',async()=>{
 let calls=0;
 const env={SYNC_ENABLED:'true',R2_MOVE_ENABLED:'false',DB:{prepare(){calls++;throw Error('Unexpected DB call')}},MEDIA:{head(){calls++;throw Error('Unexpected R2 call')}}};
 const result=await verifyAndMove(env,upload,'token');
 assert.equal(result.status,'PRESERVED');assert.equal(calls,0);
 assert.equal(moveEnabled({...env,R2_MOVE_ENABLED:'true'}),true);
});
test('R2 deletion only occurs after Drive ID, size, parent and app metadata are verified',async()=>{
 const actions=[],dbRow={...upload,drive_verified_at:null,r2_deleted_at:null};
 const env={
  SYNC_ENABLED:'true',R2_MOVE_ENABLED:'true',
  MEDIA:{async head(key){actions.push('head');return actions.filter(v=>v==='delete').length?null:{size:upload.bytes};},
   async delete(key){assert.equal(key,upload.object_key);actions.push('delete');}},
  DB:{prepare(sql){return {bind(...args){this.args=args;return this},
   async run(){actions.push(sql.includes('drive_verified_at=')?'mark_verified':'mark_deleted');if(sql.includes('drive_verified_at='))dbRow.drive_verified_at='2026-11-16';if(sql.includes('r2_deleted_at='))dbRow.r2_deleted_at='2026-11-16';return {meta:{changes:1}};},
   async first(){actions.push('db_lookup');return {...dbRow}}};}}
 };
 const moved=await verifyAndMove(env,upload,'token',{fetchImpl:async()=>{actions.push('drive_verified');return reply()}});
 assert.equal(moved.status,'MOVED');
 assert.ok(actions.indexOf('drive_verified')<actions.indexOf('mark_verified'));
 assert.ok(actions.indexOf('mark_verified')<actions.indexOf('delete'));
 assert.ok(actions.indexOf('delete')<actions.indexOf('mark_deleted'));
 assert.equal(dbRow.r2_deleted_at,'2026-11-16');
});
test('Never delete R2 when Drive verification fails',async()=>{
 let deleted=false;
 const env={SYNC_ENABLED:'true',R2_MOVE_ENABLED:'true',MEDIA:{delete:async()=>{deleted=true}},DB:{prepare(){throw Error('D1 must not be touched on failed verification')}}};
 await assert.rejects(verifyAndMove(env,upload,'token',{fetchImpl:async()=>reply({size:'1'})}),/Dung lượng/);
 assert.equal(deleted,false);
});
