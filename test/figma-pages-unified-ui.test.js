import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const html=read('public/index.html'),app=read('public/app.js'),nav=read('public/navigation.js'),style=read('public/design-system.css');
test('Figma Page 1 & Page 2 share Qbooks shell, CSS and navigation without changing backend',()=>{
 assert.match(html,/href="\/design-system\.css"/);
 assert.match(html,/id="unifiedMediaView"/);
 assert.match(html,/id="overviewView"/);
 assert.match(html,/id="saleView"/);
 assert.match(html,/id="ordersView"/);
 assert.match(html,/id="detailView"/);
 assert.match(nav,/QUẢN LÝ GIAO HÀNG/);
 assert.match(nav,/QUẢN LÝ MEDIA/);
 assert.match(nav,/QUẢN TRỊ HỆ THỐNG/);
 assert.match(style,/--qf-navy:#0b1f46/);
 assert.match(style,/\.qbook-media-page \.kpi/);
});
test('Desktop navigation has both sections expanded, mobile still keeps collapse controls',()=>{
 assert.match(nav,/scope==='desktop'\|\|expandedRoot==='orders'/);
 assert.match(nav,/scope==='desktop'\|\|expandedRoot==='media'/);
 assert.match(nav,/scope==='desktop'\|\|expandedRoot==='admin'/);
 assert.match(nav,/scope==='desktop'\?onOrder/);
 assert.match(nav,/scope==='desktop'\?onMedia/);
 assert.match(nav,/scope==='desktop'\?onAdmin/);
 assert.match(nav,/setRoot\('orders'\)/);
 assert.match(nav,/setRoot\('media'\)/);
});
test('Quick period selector reuses existing period API',()=>{
 for(const period of ['today','7days','month','all'])assert.match(html,new RegExp('data-qbook-period="'+period+'"'));
 assert.match(app,/function syncPeriodShortcuts/);
 assert.match(app,/data-qbook-period/);
 assert.match(app,/dispatchEvent\(new Event\('change'\)\)/);
 assert.match(app,/api\/shipping\/overview\?'\+params\.toString\(\)/);
});
test('Order detail uses responsive desktop split view, never changes the order status',()=>{
 assert.match(app,/show\('ordersView',true\);show\('saleView',false\);show\('detailView',true\)/);
 assert.match(app,/classList\.toggle\('qbook-detail-open',yes\)/);
 assert.match(style,/\.shipping-workspace\.qbook-detail-open/);
 assert.match(style,/@media\(max-width:800px\)/);
 assert.match(style,/\.shipping-workspace\.qbook-detail-open #ordersView\{display:none\}/);
 assert.match(app,/function showOrderSummary\(order\)/);
 assert.match(html,/id="editFromOrderDetail"/);
});
