import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const media=read('public/video.js');
const app=read('public/app.js');
const html=read('public/index.html');
const style=read('public/uiux-phase1.css');
const worker=read('src/worker.js');

test('Media has bounded GET timeout, a visible retry control and progressively loads supplements',()=>{
 assert.match(media,/const controller=new AbortController\(\)/);
 assert.match(media,/controller\.abort\(\),method==='GET'\?12000:45000/);
 assert.match(media,/signal:controller\.signal/);
 assert.match(media,/Promise\.allSettled\(\[itemsPromise,lessonsPromise,staffPromise\]\)/);
 assert.match(media,/await load\(\{initial:true\}\)/);
 assert.match(media,/void optional/);
 assert.match(media,/function safeMediaRefresh/);
 assert.match(media,/function mediaLoadNotice/);
 assert.match(media,/mediaLoadGeneration\+\+/);
 assert.match(html,/id="mediaLoadStatus"/);
 assert.match(html,/id="mediaLoadRetry"/);
 assert.match(media,/retryButton\.onclick/);
 assert.match(media,/async retry\(\)/);
});
test('Media load errors are preserved while independent tasks settle',()=>{
 assert.match(media,/const failures=new Set\(\)/);
 assert.match(media,/for\(const err of errors\)failures\.add\(err\)/);
 assert.match(media,/coreReady=true;refreshStatus\(\)/);
 assert.match(media,/optionalReady=true;refreshStatus\(\)/);
 assert.match(media,/if\(bs\.status==='rejected'&&ov\.status==='rejected'\)/);
});
test('Upload status is user-specific, distinguishes saved tệp from Drive sync and is cleared at logout',()=>{
 assert.match(app,/const uploadTaskRecords=new Map\(\)/);
 assert.match(app,/function clearUploadTasks\(\)/);
 assert.match(app,/window\.QbookMedia\?\.reset\(\);clearUploadTasks\(\);clearLoginSession\(\)/);
 assert.match(app,/updateUploadTask\(orderId,stage,file,'QUEUED'\)/);
 assert.match(app,/updateUploadTask\(orderId,stage,file,'SENDING'\)/);
 assert.match(app,/updateUploadTask\(orderId,stage,file,'STORED'\)/);
 assert.match(app,/updateUploadTask\(orderId,stage,file,'ERROR',e\.message\)/);
 assert.match(app,/Đã lưu tệp · đối chiếu Drive tại Tổng hợp/);
 assert.match(html,/id="qbookUploadActivity"/);
 assert.match(html,/id="qbookUploadItems"/);
 assert.match(html,/id="orderSyncStatus"/);
 assert.match(app,/file\.drive_file_id\?'Đã có trên Drive'/);
 assert.match(app,/file\.sync_error\?'Lỗi đồng bộ/);
 assert.match(worker,/AS sync_error,drive_offset FROM uploads/);
 assert.doesNotMatch(worker,/AS sync_error,auto_error FROM uploads/);
});
test('Touch targets include navigation, time chips, file and media actions',()=>{
 assert.match(html,/href="\/uiux-phase1\.css"/);
 assert.match(style,/@media\(max-width:800px\)/);
 assert.match(style,/\.qbn-mobile-pane \.qbn-leaf/);
 assert.match(style,/\.overview-card-actions button/);
 assert.match(style,/\.qbook-period-shortcuts button/);
 assert.match(style,/min-height:44px!important/);
 assert.match(style,/font-size:16px/);
 assert.match(style,/prefers-reduced-motion:reduce/);
});
