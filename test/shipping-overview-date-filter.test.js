import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const file=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const html=file('public/index.html'),app=file('public/app.js'),server=file('src/worker.js'),css=file('public/style.css');
test('shipping period control has exactly four options; defaults to last 7 days',()=>{
 const match=html.match(/<select id="overviewPeriod"[^>]*>([\s\S]*?)<\/select>/);
 assert.ok(match,'Missing date filter');
 assert.deepEqual([...match[1].matchAll(/<option value="([^"]+)"[^>]*>([^<]+)<\/option>/g)].map(m=>[m[1],m[2]]),[
 ['today','Hôm nay'],['7days','7 ngày gần đây'],['month','Tháng này'],['all','Toàn bộ']]);
 assert.match(match[1],/<option value="7days" selected>/);
 assert.match(html,/data-qbook-period="7days" aria-pressed="true"/);
 assert.match(html,/data-qbook-period="today" aria-pressed="false"/);
});
test('existing invoice storage schema stays invoice_codes and labels show Số hóa đơn',()=>{
 assert.match(html,/Số hóa đơn \(có thể nhập nhiều số/);
 assert.match(html,/name="invoice_codes"/);
 assert.match(html,/Mã đơn \/ Số hóa đơn/);
 assert.match(app,/'Số hóa đơn'/);
 assert.doesNotMatch(html,/Mã hóa đơn/);
});
test('server filters by Vietnam creation date with correct inclusive boundaries',()=>{
 assert.match(server,/const period=clean\(url\.searchParams\.get\('period'\)\|\|'7days'\)/);
 assert.match(server,/!?\['today','7days','month','all'\]/);
 assert.match(server,/Date\.now\(\)\+7\*3600000/);
 assert.match(server,/day-6/);
 assert.match(server,/month,1/);
 assert.match(server,/day\+1/);
 assert.match(server,/created_at>=\? AND created_at<\?/);
 assert.match(server,/\.bind\(\.\.\.args\)\.all\(\)/);
 assert.match(server,/return json\(\{orders:\[\.\.\.byId\.values\(\)\],manager:isManager,period,totals/);
});
test('client uses filtered endpoint and refreshes when filter changes, including when old request pending',()=>{
 assert.match(app,/api\/shipping\/overview\?period=/);
 assert.match(app,/overviewLoading\)await overviewLoading\.catch/);
 assert.match(app,/overviewPeriod'\)\.selectedOptions\[0\]/);
 assert.match(css,/minmax\(145px,0\.8fr\)/);
});
