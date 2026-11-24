import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
const css=readFileSync(new URL('../public/design-system.css',import.meta.url),'utf8');
test('overview links live in a wrapper, never on the table cell itself (keeps row borders aligned)',()=>{
 assert.match(app,/links\.className='overview-links-cell';links\.append\(overviewChips\(order\)\)/);
 assert.doesNotMatch(app,/links\.className='overview-media-links'/);
 assert.match(css,/td\.overview-links-cell,#appPage \.shipping-table td\.overview-actions-cell\{display:table-cell!important\}/);
});
test('one chip per evidence type and Chi tiết + Copy share the Thao tác column',()=>{
 assert.match(app,/\['HANG_HOA','Ảnh hàng hóa','▣','goods_folder_url'\]/);
 assert.match(app,/tr\.append\(orderTd,customer,status,links,action\)/);
 assert.match(css,/@media\(max-width:1280px\) and \(min-width:801px\)\{\n #appPage \.shipping-table\{min-width:0!important;width:100%\}/);
 assert.match(css,/#appPage \.qbook-overview-controls>label\{margin-bottom:0\}/);
});
