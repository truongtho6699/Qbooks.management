import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const load=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const html=load('public/index.html'),app=load('public/app.js'),media=load('public/video.js'),styles=load('public/design-system.css');
test('overview sorts and paginates only authorized fetched orders without changing API default',()=>{
 for(const id of ['overviewSort','overviewPageSize','overviewPagination','overviewPrevPage','overviewNextPage','overviewPageInfo'])assert.ok(html.includes('id="'+id+'"'),id);
 assert.match(app,/rows\.sort\(\(a,b\)=>/);
 assert.match(app,/rows\.slice\(start,start\+size\)/);
 assert.match(app,/state\.overviewPage=Math\.max\(1,Math\.min\(pages,state\.overviewPage\|\|1\)\)/);
 assert.match(app,/overviewResetFilters'\)\.onclick/);
 assert.match(app,/overviewPeriod'\)\.value='7days'/);
 assert.match(app,/Đã tìm kiếm và phân trang trên toàn bộ dữ liệu/);
 assert.match(html,/<option value="7days" selected>/);
});
test('Sale provides explicit customer fill, non-authoritative duplicate warning, keeps server validation',()=>{
 assert.match(html,/id="saleCustomerOptions"/);
 assert.match(html,/id="saleFillCustomer"/);
 assert.match(html,/id="saleInvoiceWarning"/);
 assert.match(app,/function saleRecentCustomers\(orders\)/);
 assert.match(app,/state\.saleCustomerCache=saleRecentCustomers\(r\.orders\)/);
 assert.match(app,/if\(item\.address\)form\.elements\.address\.value=item\.address/);
 assert.match(app,/checkSaleDuplicatePreview/);
 assert.match(app,/await api\('POST','\/api\/orders',f\)/);
});
test('Packing and Shipping show selected file previews and release object URLs',()=>{
 for(const id of ['packFilePreview','shipFilePreview'])assert.ok(html.includes('id="'+id+'"'),id);
 assert.match(app,/function renderSelectedFiles\(\)/);
 assert.match(app,/URL\.createObjectURL\(file\)/);
 assert.match(app,/URL\.revokeObjectURL\(url\)/);
 assert.match(app,/\['invoicePics','goodsPics','videos','shippingPics'\]\.forEach\(id=>\$\(id\)\.addEventListener\('change',renderSelectedFiles\)\)/);
 assert.match(app,/renderSelectedFiles\(\);\r?\n \/\/ Desktop follows/);
});
test('Media dashboards keep global KPI semantics when filtering by book',()=>{
 assert.match(media,/managementBook:''/);
 assert.match(media,/function mediaBookSelector\(\)/);
 assert.match(media,/KPI tổng quan và sản lượng nhân sự luôn tính toàn hệ thống/);
 assert.match(media,/state\.books\.filter\(b=>!bookId\|\|b\.id===bookId\)/);
 assert.match(media,/booksTable\(state\.managementBook\)/);
 assert.match(media,/managementFilter\.onchange=e=>\{state\.managementBook=e\.target\.value;render\(\);\}/);
 assert.match(media,/state\.books\.filter\(b=>!state\.managementBook\|\|b\.id===state\.managementBook\)/);
});
test('phase two remains mobile responsive',()=>{
 assert.match(html,/href="\/design-system\.css"/);
 assert.match(styles,/@media\(max-width:800px\)/);
 assert.match(styles,/qbook-media-report-filter/);
 assert.match(styles,/qbook-overview-pagination/);
 assert.match(styles,/qbook-file-selection/);
});
