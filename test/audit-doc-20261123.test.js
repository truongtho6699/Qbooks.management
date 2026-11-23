import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const worker=read('src/worker.js'),app=read('public/app.js'),html=read('public/index.html'),
  cron=read('src/drive-auto-worker.js'),headers=read('public/_headers'),
  media=read('public/video.js'),design=read('public/design-system.css');
test('New and reset PINs require six digits on both server and admin UI without locking existing login',()=>{
 assert.match(worker,/!\s*\/\^\\d\{6,12\}\$\/\.test\(String\(input\.pin/);
 assert.match(worker,/!\s*\/\^\\d\{6,8\}\$\/\.test\(pin\)/);
 assert.match(worker,/!\s*\/\^\\d\{6,8\}\$\/\.test\(String\(b\.pin/);
 assert.match(worker,/!\s*\/\^\\d\{6,8\}\$\/\.test\(newPin\)/);
 assert.doesNotMatch(worker,/\/\^\\d\{3,(?:8|12)\}\$\//);
 assert.match(app,/!\s*\/\^\\d\{6,8\}\$\/\.test\(data\.pin\)/);
 assert.match(html,/PIN \(6–8 chữ số, bỏ trống khi sửa\)/);
 assert.match(worker,/iterations:100000,hash:'SHA-256'/);
 assert.match(worker,/path==='\/api\/login'/);
});
test('Headers protect the app from framing and stale HTML/script mismatches',()=>{
 assert.match(headers,/X-Frame-Options: DENY/);
 assert.match(headers,/Content-Security-Policy: frame-ancestors 'none'/);
 assert.match(headers,/X-Content-Type-Options: nosniff/);
 assert.match(headers,/Cache-Control: no-cache, must-revalidate/);
 assert.match(html,/rel="manifest"/);
 assert.match(html,/rel="icon"/);
});
test('Disabled Drive Worker is auditable but never self-enables without secrets',()=>{
 assert.match(cron,/if\(!configured\(env\)\)/);
 assert.match(cron,/status,processed_files,completed_files,failed_files,notes\) VALUES\(\?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,'DISABLED'/);
 assert.match(cron,/GOOGLE_REFRESH_TOKEN/);
 assert.match(cron,/DELETE FROM sessions WHERE expires_at < \?/);
 assert.match(cron,/DELETE FROM order_locks WHERE expires_at < \?/);
 assert.doesNotMatch(cron,/SYNC_ENABLED\s*=\s*'true'/);
});
test('Overview searches the entire authorized D1 dataset using server page and filtered totals',()=>{
 assert.match(worker,/const paginated=url\.searchParams\.has\('page'\)/);
 assert.match(worker,/const counter=await env\.DB\.prepare\('SELECT COUNT\(\*\) AS total FROM orders'/);
 assert.match(worker,/LIMIT \? OFFSET \?/);
 assert.match(worker,/sortSql=\{newest:/);
 assert.match(worker,/pageSize:\$\(\'overviewPageSize\'\)/);
 assert.match(app,/const serverPage=!!r\.pagination/);
 assert.match(app,/const matched=serverPage\?Number\(r\.pagination\.total\|\|0\)/);
 assert.match(app,/overviewController\?\.abort\(\)/);
 assert.match(app,/overviewSearchTimer=setTimeout\(refreshOverviewFilters,300\)/);
 assert.match(html,/<option value="7days" selected>/);
});
test('Order search debounces and cancels stale requests; merged invoice codes are visible',()=>{
 assert.match(app,/orderSearchTimer=setTimeout\(\(\)=>\{/);
 assert.match(app,/},300\);/);
 assert.match(app,/orderSearchController\?\.abort\(\)/);
 assert.match(app,/if\(signal\?\.aborted\|\|serial!==ordersLoadSerial\|\|state\.tab!==requestedTab\)return/);
 assert.match(app,/String\(order\.invoice_codes\|\|''\)\.trim\(\)\|\|'Chưa có mã hóa đơn'/);
 assert.match(html,/id="overviewPeriod"[^>]*hidden/);
 assert.match(design,/shipping-order-card \.shipping-card-title strong/);
});
test('Backend enforces protected write permissions; Google consent is not forced repeatedly',()=>{
 assert.match(worker,/if\(method==='POST'&&path==='\/api\/orders'\)\{\s*await requireMenu\('orders\.sale'\);needRole\(user,'SALE'\)/);
 assert.match(worker,/if\(method==='POST'&&path==='\/api\/users'\)\{\s*needRole\(user,'ADMIN'\)/);
 assert.match(media,/sessionStorage\.getItem\('qbooks_media_drive_granted'\)==='true'\?'':'consent'/);
 assert.match(html,/Đang kiểm tra đăng nhập Google/);
});
