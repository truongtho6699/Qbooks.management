import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const html=read('public/index.html'),app=read('public/app.js');

test('detail dialog has no copy control but retains photo area',()=>{
 assert.ok(html.includes('id="orderSummaryMedia"'));
 assert.ok(html.includes('<h3>Hồ sơ chi tiết</h3>'));
 assert.doesNotMatch(html,/id="copyOrderInfo"/);
 assert.doesNotMatch(app,/copyOrderInfo/);
 assert.match(app,/function showOrderSummary\(order\)/);
 assert.match(app,/overviewMediaLinks\(media,order\)/);
});
test('files with Drive IDs open direct Google Drive; R2 images preview instead of download',()=>{
 assert.match(app,/const href=fileDriveUrl\(item\.drive_file_id\)/);
 assert.match(app,/link\.href=href;link\.target='_blank'/);
 assert.match(app,/button\(label\+\(items\.length>1\?' · '\+item\.filename:''\),\(\)=>openStoredImage\(item\)/);
 assert.match(app,/URL\.createObjectURL\(blob\)/);
 assert.match(app,/headers:\{authorization:'Bearer '\+state\.token\}/);
 assert.match(app,/!blob\.type\.startsWith\('image\/'\)/);
});
test('multiple images may upload concurrently while video stays sequential',()=>{
 assert.match(app,/Array\.from\(\{length:Math\.min\(3,photos\.length\)\}/);
 assert.match(app,/await Promise\.all\(/);
 assert.match(app,/for\(const i of videos\)/);
 assert.match(app,/xhr\.upload\.onprogress/);
 assert.match(app,/xhr\.timeout=150000/);
 assert.match(app,/uploadPhotoWithProgress\(id,stage,file\)/);
});
test('overview GET loads are deduplicated, network calls have bounded waits',()=>{
 assert.match(app,/if\(overviewLoading\)return overviewLoading/);
 assert.match(app,/const timer=setTimeout\(\(\)=>controller\.abort\(\),wait\)/);
 assert.match(app,/const attempts=method==='GET'\?2:1/);
 assert.match(app,/finally\{overviewLoading=null;\}/);
});
