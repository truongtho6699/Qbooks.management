import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=(file)=>readFileSync(new URL('../public/'+file,import.meta.url),'utf8');

test('Unified QBOOK main page owns shipping, media and admin under one shell',()=>{
 const html=read('index.html');
 for(const marker of ['id="appPage"','id="tabs"','id="unifiedMediaView"','id="page"','id="staffView"','id="mobileShippingTabs"','id="qbnDrawer"']){
  assert.ok(html.includes(marker),marker+' must be present in the primary page');
 }
 const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);
 assert.equal(new Set(ids).size,ids.length,'No duplicate IDs in unified shell');
 assert.ok(html.includes('src="/app.js"'));
 assert.ok(html.includes('href="/unified.css"'));
 assert.ok(html.includes('src="https://accounts.google.com/gsi/client"'));
 assert.ok(!html.includes('src="/video.js"'),'Media loads on demand to keep login fast');
});
test('Media is mounted inside QBOOK without iframe or second authentication form',()=>{
 const html=read('index.html');
 assert.equal((html.match(/id="loginForm"/g)||[]).length,1);
 assert.ok(!/<iframe[^>]*video\.html/.test(html));
 assert.ok(html.indexOf('id="unifiedMediaView"')>html.indexOf('id="appPage"'));
 const js=read('app.js');
 assert.ok(js.includes("import('/video.js')"));
 assert.ok(js.includes('window.QbookShell='));
 assert.ok(js.includes("onMedia:key=>openMedia(key)"));
 assert.ok(!js.includes("window.location.href='/video.html"));
});
test('Media module exposes lifecycle, navigation, and account-isolation reset',()=>{
 const js=read('video.js');
 assert.ok(js.includes("document.getElementById('unifiedMediaView')"));
 assert.ok(js.includes('window.QbookMedia={'));
 assert.ok(js.includes('reset(){'));
 assert.ok(js.includes('async start(view)'));
 assert.ok(js.includes('window.QbookShell?.mediaChanged'));
 assert.ok(js.includes("state.user=null;state.rights={};state.menuKeys=[]"));
});
test('Unified QBOOK UI keeps deep-link compatibility with legacy video page',()=>{
 const legacy=read('video.html');
 assert.ok(legacy.includes("window.location.replace"));
 assert.ok(legacy.includes("target.searchParams.set('section','media')"));
 assert.ok(legacy.includes("target.searchParams.set('view',view)"));
 assert.ok(!legacy.includes('src="/video.js"'));
 const app=read('app.js');
 assert.ok(app.includes("section==='media'"));
 assert.ok(app.includes("syncRoute('media',view)"));
});
test('Unified mobile layout retains one menu drawer and one bottom nav',()=>{
 const html=read('index.html');
 assert.equal((html.match(/id="qbnMobileTree"/g)||[]).length,1);
 assert.equal((html.match(/id="mobileShippingTabs"/g)||[]).length,1);
 assert.equal((html.match(/id="qbnToggle"/g)||[]).length,1);
 assert.ok(read('unified.css').includes('.qbook-media-pane[hidden]'));
 assert.ok(read('app.js').includes('state.area===\'media\''));
});
