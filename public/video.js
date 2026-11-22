import {checkDriveFolderAccess,resumableDriveUpload} from './video-drive.js';
import {resolveMediaFolder,validateMediaPhotos,appendEvidenceLinks} from './media-upload.js';
import {trackDraft,markDraftSaved,confirmLeave,humanizeError,showFormError,showFieldError} from './ux-guard.js';
const $=id=>document.getElementById(id);
const state={token:sessionStorage.getItem('qbooks_token')||'',view:'dashboard',books:[],lessons:[],items:[],staff:[],catalogBook:'',catalogWeek:'',catalogQuery:'',overview:null,rights:{},user:null,selected:null,filter:{},videoPage:1,videoPagination:{page:1,pages:1,total:0},videoFilter:{q:'',book:'',review:''},videoListItems:[],videoListPagination:{page:1,pages:1,total:0},videoListScope:'',videoSearchToken:0,dailyStats:{day:'',people:[]},menuKeys:[],managementBook:'',quickFilmBook:'',quickFilmLesson:'',quickFilmUploadedKey:'',quickFilmUploadedUrl:''};
const NAV=[
 {id:'dashboard',text:'Bảng điều khiển',icon:'▦',group:'CHUNG'},
 {id:'filmOverview',text:'Tổng quan quay',icon:'▣',group:'QUAY VIDEO'},
 {id:'film',text:'Quay bài',icon:'◉',group:'QUAY VIDEO'},
 {id:'postOverview',text:'Tổng quan hậu kỳ',icon:'◫',group:'HẬU KỲ'},
 {id:'edit',text:'Xử lý video',icon:'✎',group:'HẬU KỲ'},
 {id:'production',text:'Sản lượng hằng ngày',icon:'▤',group:'QUẢN LÝ'},
 {id:'booksProgress',text:'Tiến độ đầu sách',icon:'◷',group:'QUẢN LÝ'},
 {id:'report',text:'Báo cáo tổng hợp',icon:'▥',group:'QUẢN LÝ'},
 {id:'books',text:'Quản trị đầu sách',icon:'▧',group:'QUẢN TRỊ'},
 {id:'catalog',text:'Danh mục bài học',icon:'≡',group:'QUẢN TRỊ'}
];
const mobile=[{id:'dashboard',text:'Tổng quan',icon:'▦'},{id:'film',text:'Quay',icon:'◉'},{id:'edit',text:'Hậu kỳ',icon:'✎'},{id:'booksProgress',text:'Đầu sách',icon:'▧'},{id:'more',text:'Khác',icon:'☷'}];
const statColor={'CHỜ QUAY':'','ĐÃ QUAY':'blue','ĐANG HẬU KỲ':'purple','CHỜ DUYỆT':'amber','ĐÃ PHÁT HÀNH':'green'};
const E=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const count=v=>Number(v||0).toLocaleString('vi-VN');
const date=s=>s?new Date(String(s).replace(' ','T')+'Z').toLocaleDateString('vi-VN'):'—';
const toast=(text)=>{const node=$('toast');node.textContent=humanizeError(text);node.hidden=false;clearTimeout(toast.timer);toast.timer=setTimeout(()=>node.hidden=true,5000)};
async function api(method,path,data){
 const headers={'authorization':'Bearer '+state.token};if(data!==undefined)headers['content-type']='application/json';
 const controller=new AbortController();
 const timer=setTimeout(()=>controller.abort(),method==='GET'?12000:45000);
 let r;
 try{
  r=await fetch(path,{method,headers,body:data===undefined?undefined:JSON.stringify(data),signal:controller.signal});
 }catch(e){
  if(e.name==='AbortError')throw Error('Máy chủ phản hồi quá chậm. Bấm Thử tải lại để kiểm tra kết nối.');
  throw Error('Không kết nối được máy chủ: '+e.message);
 }finally{clearTimeout(timer)}
 let j;try{j=await r.json()}catch{throw Error('Máy chủ không trả dữ liệu hợp lệ.');}
 if(!r.ok)throw Error(j.error||'Lỗi máy chủ '+r.status);return j;
}
function can(section){
 return !!state.rights.admin||state.menuKeys.includes('media.'+section);
}

const panel=(title,content,subtitle='')=>'<section class="panel"><div class="panelhead"><div><h2>'+E(title)+'</h2>'+(subtitle?'<p class="sub">'+E(subtitle)+'</p>':'')+'</div></div>'+content+'</section>';
const badge=s=>'<span class="state '+(statColor[s]||'')+'">'+E(s||'Chưa có')+'</span>';
function table(headers,rows,empty='Chưa có dữ liệu'){
 if(!rows.length)return '<div class="empty"><strong>'+E(empty)+'</strong>Chưa có bản ghi phù hợp.</div>';
 return '<div class="tablewrap"><table class="data-table"><thead><tr>'+headers.map(h=>'<th>'+E(h)+'</th>').join('')+'</tr></thead><tbody>'+rows.map(row=>'<tr>'+row.map(cell=>'<td>'+cell+'</td>').join('')+'</tr>').join('')+'</tbody></table></div>';
}
function kpis(items){return '<div class="kpis">'+items.map(x=>'<div class="kpi"><div class="kpi-label">'+E(x.label)+'</div><div class="kpi-number">'+count(x.value)+'</div><div class="kpi-sub">'+E(x.sub||'')+'</div></div>').join('')+'</div>';}
const btn=(label,action,id='',type='button')=>'<button type="'+type+'" class="btn '+(action==='primary'?'primary':'')+'" '+(id?'id="'+id+'"':'')+'>'+E(label)+'</button>';
const selected=(arr,cur)=>arr.map(x=>'<option value="'+E(x.id)+'" '+(x.id===cur?'selected':'')+'>'+E(x.name)+'</option>').join('');
const booksList=()=>state.books.map(b=>({id:b.id,name:b.code+' — '+b.name}));
const statuses=['CHỜ QUAY','ĐÃ QUAY','ĐANG HẬU KỲ','CHỜ DUYỆT','ĐÃ PHÁT HÀNH'];
const pager=()=>{const p=state.videoListPagination;return p.pages>1?'<div class="actions qv-pager"><span class="mini-note">Trang '+p.page+'/'+p.pages+' · '+count(p.total)+' video</span><button type="button" class="btn" id="videoPrev" '+(p.page===1?'disabled':'')+'>‹ Trước</button><button type="button" class="btn" id="videoNext" '+(p.page>=p.pages?'disabled':'')+'>Sau ›</button></div>':'';};
const booksTable=(bookId='')=>table(['Mã sách','Tên đầu sách','Giảng viên','Kế hoạch','Video đã có','Đã phát hành','Tiến độ'],state.books.filter(b=>!bookId||b.id===bookId).map(b=>{
 const target=Number(b.target_count)||0,pub=Number(b.published)||0,rate=target?Math.min(100,Math.round(100*pub/target)):0;
 return ['<button class="link-action" data-book="'+E(b.id)+'">'+E(b.code)+'</button>',E(b.name),E(b.teacher||'—'),count(target),count(b.total),count(pub),'<div class="progress"><span style="width:'+rate+'%"></span></div><span class="mini-note">'+rate+'%</span>'];
}));
function renderNav(){
 if(document.getElementById('unifiedMediaView')){window.QbookShell?.mediaChanged(state.view,NAV.find(x=>x.id===state.view)?.text||'Quản lý Media');return;}
 if(!window.QbookNavigation)throw Error('Thiếu bộ điều hướng QBOOK');
 window.QbookNavigation.render({
  desktop:$('desktopNav'),mobileTree:$('qbnMobileTree'),drawer:$('qbnDrawer'),toggle:$('qbnToggle'),
  area:'media',activeView:state.view,
  orders:[['overview','Tổng hợp'],['sale','Sale lên đơn'],['pack','Đóng hàng'],['ship','Vận đơn']].filter(([id])=>state.menuKeys.includes('orders.'+id)),
  admin:state.menuKeys.includes('system.admin'),canMedia:id=>can(id),
  onOrder:id=>{window.location.href='/?nav=orders&tab='+encodeURIComponent(id);},
  onMedia:id=>navigate(id),
  onAdmin:()=>{window.location.href='/?nav=admin';}
 });
 const active=state.view;
 $('mobileNav').innerHTML=mobile.filter(item=>item.id==='more'?NAV.some(n=>can(n.id)&&!['dashboard','film','edit','booksProgress'].includes(n.id)):can(item.id)).map(item=>{
  const current=item.id==='more'?['books','catalog','report','production','filmOverview','postOverview'].includes(active):active===item.id;
  return '<button class="mobile-item '+(current?'active':'')+'" data-view="'+item.id+'"><span class="nav-icon">'+item.icon+'</span><span>'+E(item.text)+'</span></button>';
 }).join('');
 document.querySelectorAll('#mobileNav [data-view]').forEach(el=>el.onclick=()=>navigate(el.dataset.view));
 const close=$('qbnClose');if(close)close.onclick=()=>{window.QbookNavigation.closeDrawer();renderNav();};
 const drawer=$('qbnDrawer');if(drawer)drawer.onclick=e=>{if(e.target===drawer){window.QbookNavigation.closeDrawer();renderNav();}};
}

let mediaLoadGeneration=0;
function mediaLoadNotice(message,error=false){
 const node=$('mediaLoadStatus');if(!node)return;
 node.hidden=!message;
 node.textContent=message||'';
 node.classList.toggle('qbook-load-error',error);
 const retry=$('mediaLoadRetry');
 if(retry)retry.hidden=!error;
}
function safeMediaRefresh(){
 // Never replace editable forms while a user is entering or reviewing data.
 if(state.selected||['edit','books','catalog'].includes(state.view)||$('quickFilmFile')?.files?.length)return;
 const active=document.activeElement;
 if(active?.closest?.('#page form')||active?.matches?.('input,textarea,select'))return;
 render();
}
async function load({initial=false}={}){
 const version=++mediaLoadGeneration;
 const failures=new Set();
 let coreReady=false,optionalReady=false;
 function refreshStatus(){
  if(version!==mediaLoadGeneration)return;
  if(failures.size)mediaLoadNotice('Chưa tải được '+[...failures].join(', ')+'. Chọn Thử tải lại.',true);
  else if(!coreReady)mediaLoadNotice('Đang tải đầu sách và tổng quan…');
  else if(!optionalReady)mediaLoadNotice('Đã mở dữ liệu chính · đang tải bài học và danh sách video…');
  else mediaLoadNotice('');
 }
 const overviewMenus=['dashboard','filmOverview','postOverview','booksProgress','report','production'];
 const itemMenus=['dashboard','filmOverview','postOverview','film','edit','booksProgress','report'];
 const canOverview=overviewMenus.some(can),canItems=itemMenus.some(can);
 const booksPromise=api('GET','/api/video/books');
 const overviewPromise=canOverview?api('GET','/api/video/overview'):Promise.resolve({totals:{},books:[],staff:[],statusCounts:[]});
 const itemsPromise=canItems?api('GET','/api/video/items?page='+state.videoPage+'&pageSize=100'):Promise.resolve({items:[],pagination:{page:1,pages:0,total:0}});
 const lessonsPromise=api('GET','/api/video/lessons');
 const staffPromise=can('staff')&&(state.rights.manage||state.rights.admin)?api('GET','/api/video/staff'):Promise.resolve({staff:[]});
 const optional=Promise.allSettled([itemsPromise,lessonsPromise,staffPromise]).then(([videos,lessons,staff])=>{
  if(version!==mediaLoadGeneration)return;
  const errors=[];
  if(videos.status==='fulfilled'){
   state.items=videos.value.items||[];
   state.videoPagination=videos.value.pagination||{page:1,pages:1,total:state.items.length};
  }else errors.push('danh sách video');
  if(lessons.status==='fulfilled')state.lessons=lessons.value.lessons||[];
  else errors.push('danh sách bài học');
  if(staff.status==='fulfilled')state.staff=staff.value.staff||[];
  else errors.push('danh sách nhân sự');
  for(const err of errors)failures.add(err);
  optionalReady=true;refreshStatus();
  if(initial)safeMediaRefresh();
 });
 const [bs,ov]=await Promise.allSettled([booksPromise,overviewPromise]);
 if(version!==mediaLoadGeneration)return;
 const errors=[];
 if(bs.status==='fulfilled')state.books=bs.value.books||[];
 else errors.push('đầu sách');
 if(ov.status==='fulfilled')state.overview=ov.value;
 else errors.push('tổng quan');
 for(const err of errors)failures.add(err);
 coreReady=true;refreshStatus();
 if(bs.status==='rejected'&&ov.status==='rejected'){
  // All optional requests are already guarded by allSettled; no unhandled rejections.
  void optional;
  throw Error('Chưa tải được dữ liệu Media. Kiểm tra kết nối và chọn Thử tải lại.');
 }
 if(!initial){
  await optional;
 }else{
  // Render initial dashboard as soon as books/overview arrive.
  // Remaining lists and lessons are fetched independently without blocking navigation.
  void optional;
 }
}

async function refreshVideoList(restoreFocus=false){
 if(!['film','edit'].includes(state.view)||state.selected)return;
 const scope=state.view,token=++state.videoSearchToken;
 const params=new URLSearchParams({page:String(state.videoPage),pageSize:'100',scope,q:state.videoFilter.q||'',book:state.videoFilter.book||''});if(scope==='edit'&&state.videoFilter.review)params.set('review',state.videoFilter.review);
 try{
  const result=await api('GET','/api/video/items?'+params.toString());
  if(token!==state.videoSearchToken||state.view!==scope||state.selected)return;
  state.videoListItems=result.items||[];
  state.videoListPagination=result.pagination||{page:1,pages:1,total:state.videoListItems.length};
  state.videoListScope=scope;render();
  if(restoreFocus){const input=$('filterVideo');if(input){input.focus();input.setSelectionRange(input.value.length,input.value.length);}}
 }catch(e){toast('Không đọc được danh sách: '+e.message);}
}
function navigate(view){
 if((view!==state.view||state.selected)&&!confirmLeave())return;
 if(['adminOverview','permissions','staff','audit','createVideo'].includes(view)){
  if(view==='adminOverview')view='dashboard';
  else if(state.rights.admin&&['permissions','staff','audit'].includes(view)){window.location.href='/?nav=admin&panel='+(view==='audit'?'logs':'accounts');return;}
  else return toast('Chức năng đã được chuyển hoặc ẩn khỏi menu.');
 }
 if(view==='more'){
  const options=NAV.filter(n=>can(n.id)&&!['dashboard','film','edit','booksProgress'].includes(n.id));
  $('page').innerHTML=panel('Các chức năng khác','<div class="two">'+options.map(n=>'<button class="btn" data-menu="'+n.id+'">'+n.icon+' '+E(n.text)+'</button>').join('')+'</div>');
  document.querySelectorAll('[data-menu]').forEach(b=>b.onclick=()=>navigate(b.dataset.menu));
  $('viewTitle').textContent='Danh mục chức năng';$('viewSubtitle').textContent='Các phân hệ quản lý và báo cáo';renderNav();return;
 }
 if(!can(view))return toast('Tài khoản chưa được cấp quyền chức năng này.');
 state.view=view;state.selected=null;mediaPhotoCache.clear();window.QbookNavigation?.focusMedia(view);
 const title=NAV.find(x=>x.id===view)?.text||'Quản lý video';
 $('viewTitle').textContent=title;
 const groupName=({'CHUNG':'Tổng quan','QUAY VIDEO':'Quay video','HẬU KỲ':'Hậu kỳ','QUẢN LÝ':'Quản lý','QUẢN TRỊ':'Danh mục Media'})[NAV.find(x=>x.id===view)?.group]||'Tổng quan';
 $('viewSubtitle').textContent='Quản lý Media  /  '+groupName+'  /  '+title;
 renderNav();render();if(['film','edit'].includes(view)){state.videoPage=1;state.videoListItems=[];state.videoListPagination={page:1,pages:1,total:0};refreshVideoList();}if(view==='production'&&state.dailyStats?.day!==(state.productionDate||new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Ho_Chi_Minh',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())))fetchProduction();
}
function readinessPanel(){
 const folderCount=state.books.filter(b=>!!googleFolderId(b.id)).length;
 const roleUsers=state.staff.filter(p=>p.can_film||p.can_edit||p.can_manage);const rolesVisible=can('staff')||state.rights.admin;
 const oauth=!!state.googleClientId;
 const allowedBooks=can('books');
 const allowedRoles=!!state.rights.admin;
 const rows=[
  ['Thư mục Drive theo đầu sách',folderCount+'/'+state.books.length,folderCount===state.books.length?'Đã có đường dẫn':'Cần thiết lập thư mục cho từng đầu sách',allowedBooks?'<button class="link-action" data-goto="books">Cấu hình đầu sách</button>':'Liên hệ quản lý'],
  ['Google OAuth Client ID',oauth?'Đã cấu hình':'Chưa cấu hình',oauth?'Chưa xác nhận quyền Google của nhân viên':'Cần quản trị Cloudflare kiểm tra cấu hình','Kiểm thử tải với tài khoản Google'],
  ['Quyền Media nhân viên',rolesVisible?roleUsers.length+' tài khoản':'Chưa có quyền xem',rolesVisible?(roleUsers.length?'Cần đối chiếu nhân sự từng vai trò':'Chưa cấp quyền Quay / Hậu kỳ / Quản lý'):'Yêu cầu Admin kiểm tra quyền nhân sự',allowedRoles?'<a href="/?nav=admin">Cấp quyền menu</a>':'Liên hệ quản trị']
 ];
 return panel('Mức độ sẵn sàng vận hành Media',table(['Điều kiện','Hiện trạng','Nhận xét','Thao tác'],rows)+
 '<p class="mini-note">Chỉ là kiểm tra cấu hình và dữ liệu. Đường dẫn Drive đã lưu chưa đồng nghĩa đã kiểm tra quyền sửa thư mục. Chưa kiểm thử đăng nhập và tải tệp với tài khoản nhân viên thật.</p>');
}
function bookProgressViz(){
 const bookRows=state.books.map(book=>{
  const total=Number(book.target_count)||0,published=Number(book.published)||0;
  return {name:book.code+' · '+book.name,total,published,ratio:total?Math.min(100,Math.round(published*100/total)):0};
 }).filter(x=>x.total>0).sort((a,b)=>b.ratio-a.ratio||b.published-a.published).slice(0,10);
 if(!bookRows.length)return panel('Tiến độ phát hành theo đầu sách','<div class="empty"><strong>Chưa có chỉ tiêu video</strong>Thiết lập kế hoạch cho từng đầu sách để theo dõi tiến độ.</div>');
 return panel('Tiến độ phát hành theo đầu sách','<div class="qb-viz" role="list" aria-label="Tiến độ phát hành theo từng đầu sách">'+bookRows.map(x=>
  '<div class="qb-viz-row" role="listitem" aria-label="'+E(x.name)+': '+x.ratio+' phần trăm, '+x.published+' trên '+x.total+' video">'+
  '<span class="qb-viz-label" title="'+E(x.name)+'">'+E(x.name)+'</span>'+
  '<div class="qb-viz-track" aria-hidden="true"><span class="qb-viz-bar" style="width:'+x.ratio+'%"></span></div>'+
  '<span class="qb-viz-value">'+x.ratio+'%</span></div>'
 ).join('')+'</div><p class="qb-viz-caption">Hiển thị tối đa 10 đầu sách có kế hoạch, sắp xếp theo tỷ lệ phát hành. Tỷ lệ tính từ dữ liệu D1, không phải số liệu giả.</p>');
}
function productionTrend(){
 const activities=state.overview?.activities||[];
 const keyDay=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Ho_Chi_Minh',year:'numeric',month:'2-digit',day:'2-digit'});
 const series=Array.from({length:14},(_,i)=>{
  const day=keyDay.format(new Date(Date.now()-(13-i)*86400000));
  return {day,filmed:0,edited:0};
 });
 const grouped=new Map(series.map(row=>[row.day,row]));
 for(const activity of activities){
  const target=grouped.get(activity.day);
  if(!target)continue;
  const quantity=Number(activity.total)||0;
  if(activity.event_type==='FILM_COMPLETED')target.filmed+=quantity;
  if(activity.event_type==='EDIT_SUBMITTED')target.edited+=quantity;
 }
 const total=series.reduce((sum,x)=>sum+x.filmed+x.edited,0);
 if(!total)return panel('Sản lượng 14 ngày gần nhất','<div class="empty"><strong>Chưa có sự kiện sản xuất</strong>Khi nhân viên hoàn thành quay hoặc gửi hậu kỳ, biểu đồ sẽ cập nhật từ nhật ký D1.</div>');
 const max=Math.max(1,...series.map(x=>Math.max(x.filmed,x.edited)));
 return panel('Sản lượng 14 ngày gần nhất','<div class="qb-trend-legend"><span><i class="qb-key qb-key-film"></i> Hoàn thành quay</span><span><i class="qb-key qb-key-edit"></i> Gửi hậu kỳ</span></div>'+
 '<div class="qb-trend" role="img" aria-label="Biểu đồ sản lượng 14 ngày, quay và hậu kỳ">'+series.map(row=>{
  const label=row.day.slice(8,10)+'/'+row.day.slice(5,7);
  const h1=Math.round(row.filmed/max*100),h2=Math.round(row.edited/max*100);
  return '<div class="qb-trend-day" title="'+E(row.day)+': '+row.filmed+' quay, '+row.edited+' hậu kỳ">'+
  '<div class="qb-trend-bars" aria-hidden="true"><span class="qb-trend-film" style="height:'+h1+'%"></span><span class="qb-trend-edit" style="height:'+h2+'%"></span></div>'+
  '<span class="qb-trend-label">'+E(label)+'</span></div>';
 }).join('')+'</div><p class="qb-viz-caption">Dữ liệu lấy từ nhật ký sự kiện video, múi giờ Việt Nam; mỗi video chỉ tính lần hoàn thành đầu tiên.</p>');
}
function dashboardMeta(){
 const timestamp=state.overview?.asOf;
 return '<div class="qb-dashboard-meta"><span class="qb-dot" aria-hidden="true"></span>'+
 'Nguồn: Cloudflare D1 · '+E(timestamp?new Date(timestamp).toLocaleString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh'}):'Chưa có thời điểm cập nhật')+
 '</div>';
}
function mediaBookSelector(){
 const selected=state.managementBook;
 const options=['<option value="">Tất cả đầu sách</option>']
  .concat(state.books.map(b=>'<option value="'+E(b.id)+'" '+(b.id===selected?'selected':'')+'>'+E(b.code)+' · '+E(b.name)+'</option>'));
 return '<div class="qbook-media-report-filter"><label for="managementBookFilter">Lọc báo cáo theo đầu sách</label><select id="managementBookFilter">'+options.join('')+'</select>'+
 '<small>Số KPI tổng quan và sản lượng nhân sự luôn tính toàn hệ thống; chỉ bảng đầu sách được lọc.</small></div>';
}
function dashboard(){
 const o=state.overview||{totals:{},books:[],staff:[]},t=o.totals;
 const bookRows=(o.books||[]).filter(b=>!state.managementBook||b.id===state.managementBook||state.books.some(x=>x.id===state.managementBook&&x.code===b.code)).slice(0,10).map(b=>[E(b.code),E(b.name),count(b.total),count(b.filmed),count(b.published)]);
 const top=(o.staff||[]).filter(x=>Number(x.filmed)||Number(x.edited)).slice(0,10).map(p=>[E(p.name),count(p.filmed),count(p.edited)]);
 const statusesRows=statuses.map(s=>[badge(s),count((o.statusCounts||[]).find(x=>x.status===s)?.total||0)]);
 return dashboardMeta()+mediaBookSelector()+kpis([{label:'Đầu sách kế hoạch',value:state.books.length,sub:'Danh mục hiện hành'},{label:'Bài/tiết dự kiến',value:state.lessons.length,sub:'Không phải video đã quay'},{label:'Video đã quay',value:t.filmed,sub:'Ghi nhận lần đầu'},{label:'Đã phát hành',value:t.published,sub:'Sau duyệt của quản lý'}])+
 '<div class="two">'+panel('Tiến độ sản xuất theo đầu sách',table(['Mã sách','Đầu sách','Video','Đã quay','Phát hành'],bookRows,'Chưa có đầu sách'))+
 panel('Sản lượng nhân viên',table(['Nhân sự','Quay','Hậu kỳ'],top,'Chưa có sản lượng'))+'</div>'+productionTrend()+bookProgressViz()+
 panel('Việc cần xử lý',table(['Tình trạng','Số video','Hành động'],[[badge('CHỜ DUYỆT'),count(t.pending_review||0),'<button type="button" class="link-action" data-goto="edit" data-review="PENDING">Xem video chờ duyệt</button>'],['Cần sửa',count(t.need_revision||0),'<button type="button" class="link-action" data-goto="edit" data-review="CHANGES_REQUESTED">Xem hậu kỳ</button>'],['Bài/tiết chưa gắn kế hoạch video',count(o.unplannedLessons||0),'Đối chiếu theo mã bài học']]))+panel('Tình trạng video toàn hệ thống',table(['Trạng thái','Số lượng'],statusesRows))+(state.rights.manage||state.rights.admin?readinessPanel():'');
}
function adminOverview(){
 const o=state.overview||{totals:{},books:[],staff:[]},t=o.totals||{};
 const goals=state.books.reduce((acc,b)=>acc+Number(b.target_count||0),0);
 const remaining=Math.max(0,goals-Number(t.published||0));
 const staff=(o.staff||[]).filter(x=>Number(x.filmed)||Number(x.edited));
 const progress=state.books.map(b=>{
  const target=Number(b.target_count)||0,done=Number(b.published)||0,pct=target?Math.min(100,Math.round(done*100/target)):0;
  return [E(b.code),'<button class="link-action" data-book="'+E(b.id)+'">'+E(b.name)+'</button>',
   count(target),count(b.filmed),count(done),'<div class="progress"><span style="width:'+pct+'%"></span></div><span class="mini-note">'+pct+'%</span>'];
 });
 const people=staff.map(p=>[E(p.name),count(p.filmed),count(p.edited)]);
 return dashboardMeta()+kpis([{label:'Đầu sách quản lý',value:state.books.length,sub:'Đã lập kế hoạch sản xuất'},
  {label:'Chỉ tiêu video',value:goals,sub:'Kế hoạch toàn hệ thống'},
  {label:'Video đã phát hành',value:t.published,sub:'Video có kết quả phát hành'},
  {label:'Chưa đạt kế hoạch',value:remaining,sub:'Theo chỉ tiêu đầu sách'}])+
 '<div class="two">'+panel('Tiến độ theo đầu sách',
 table(['Mã sách','Tên đầu sách','Kế hoạch','Đã quay','Phát hành','Hoàn thành'],progress,'Chưa có kế hoạch đầu sách'))+
 panel('Hiệu suất nhân sự',table(['Nhân sự','Video quay','Video hậu kỳ'],people,'Chưa có hoạt động nhân sự'))+'</div>'+productionTrend()+bookProgressViz()+
 panel('Cơ cấu trạng thái',table(['Trạng thái','Số lượng video'],statuses.map(x=>[badge(x),count((o.statusCounts||[]).find(r=>r.status===x)?.total||0)])))+readinessPanel();
}
function bookDetail(){
 const b=state.books.find(x=>x.id===state.selectedBook);
 if(!b)return panel('Đầu sách','Không tìm thấy đầu sách được chọn.');
 const items=state.items.filter(x=>x.book_id===b.id),published=Number(b.published||0);
 return '<div class="actions" style="justify-content:flex-start;margin:0 0 15px">'+btn('← Trở về tiến độ đầu sách','','backBooks')+'</div>'+
 kpis([{label:'Kế hoạch',value:b.target_count},{label:'Video đã có',value:b.total},{label:'Đã quay',value:b.filmed},{label:'Đã phát hành',value:published}])+
 panel('Chi tiết đầu sách · '+b.code,'<div class="record-card"><strong>'+E(b.name)+'</strong><span class="mini-note">Giảng viên: '+E(b.teacher||'Chưa cập nhật')+'</span>'+(b.drive_url?'<a href="'+E(b.drive_url)+'" target="_blank" rel="noopener noreferrer">Mở thư mục Drive ↗</a>':'')+'</div>')+
 panel('Danh mục bài/tiết theo sách',table(['Tuần','Bài','Tiết','Tên bài','Trang'],state.lessons.filter(x=>x.book_code===b.code).slice(0,70).map(x=>[E(x.week),E(x.lesson_no),E(x.period),E(x.title),E(x.page)]),'Chưa nhập nội dung bài học'))+
 panel('Video gần đây của đầu sách (danh sách tải trên trang)',table(['Video','Người quay','Người hậu kỳ','Trạng thái','Chi tiết'],
 items.map(v=>[E(v.title),E(v.camera_name||'—'),E(v.editor_name||'—'),badge(v.status),
 '<button class="link-action" data-action="'+(v.status==='CHỜ QUAY'?'film':'edit')+'" data-id="'+E(v.id)+'">Xem chi tiết</button>'])));
}
function filmingOverview(){
 const o=state.overview||{totals:{},staff:[]},t=o.totals||{};
 const total=Number(t.total||0),filmed=Number(t.filmed||0);
 const team=(o.staff||[]).filter(p=>Number(p.filmed||0)>0);
 return kpis([{label:'Video đã khai báo',value:total},{label:'Đã quay',value:filmed},{label:'Chờ quay',value:Math.max(0,total-filmed)},{label:'Nhân sự đã quay',value:team.length}])+
 panel('Tiến độ quay theo đầu sách',table(['Đầu sách','Video đã khai báo','Đã quay','Chờ quay'],state.books.map(book=>{
 const planned=Number(book.total||0),done=Number(book.filmed||0);
 return [E(book.name),count(planned),count(done),count(Math.max(0,planned-done))];
 })))+panel('Sản lượng quay theo nhân viên',table(['Nhân sự','Video đã quay'],team.map(p=>[E(p.name),count(p.filmed)])));
}

function makeVideoRows(items,action){
 return items.map(v=>[E(v.book_code),'<strong>'+E(v.title)+'</strong><div class="mini-note">'+E(v.lesson||'')+'</div>',E(v.teacher||'—'),E(v.camera_name||'—'),badge(v.status),'<button type="button" class="link-action" data-action="'+action+'" data-id="'+E(v.id)+'">'+(action==='film'?'Quay / Chi tiết':'Xử lý / Chi tiết')+'</button>']);
}
function quickFilmOptions(){
 const selectedBook=state.quickFilmBook||'';
 const selectedLesson=state.quickFilmLesson||'';
 const lessons=state.lessons.filter(l=>l.book_code===state.books.find(b=>b.id===selectedBook)?.code);
 const selectedBookData=state.books.find(b=>b.id===selectedBook);
 const destination=selectedBook?resolveMediaFolder(state.books,selectedBook):null;
 return '<form id="quickFilmForm" class="form-grid">'+
  '<div class="field full"><label for="quickFilmBook">1. Chọn đầu sách *</label><select id="quickFilmBook" name="book_id" required><option value="">-- Chọn đầu sách --</option>'+
  selected(booksList(),selectedBook)+'</select></div>'+
  '<div class="field full"><label for="quickFilmLesson">2. Chọn bài / tiết quay *</label><select id="quickFilmLesson" name="lesson_id" required>'+
  '<option value="">'+(selectedBook?(lessons.length?'-- Chọn bài/tiết --':'Chưa có bài/tiết cho đầu sách này'):'Chọn đầu sách trước')+'</option>'+
  lessons.map(l=>'<option value="'+E(l.id)+'" '+(String(l.id)===String(selectedLesson)?'selected':'')+'>'+E([l.week&&'Tuần '+l.week,l.lesson_no&&'Bài '+l.lesson_no,l.period&&'Tiết '+l.period,l.title].filter(Boolean).join(' · '))+'</option>').join('')+'</select>'+
  '<small class="mini-note" id="quickFilmLessonCount">'+(selectedBook?count(lessons.length)+' bài/tiết thuộc sách này':count(state.lessons.length)+' bài/tiết trong danh mục')+'</small></div>'+
  '<div class="field full qbook-media-direct"><label for="quickFilmFile">3. Chọn video quay trên điện thoại *</label><input id="quickFilmFile" type="file" accept="video/*,.mov,.mp4,.m4v,.webm" required><small class="mini-note">Video MOV/MP4 tối đa 2 GB, tối đa 60 phút. Không phải dán link Drive.</small></div>'+
  '<div class="field full"><label for="quickFilmImages">Ảnh minh chứng (không bắt buộc)</label><input id="quickFilmImages" type="file" accept="image/*,.heic,.heif" multiple><small class="mini-note">Tối đa 10 ảnh, 25 MB/ảnh.</small></div>'+
  '<div class="field full"><label for="quickFilmNote">Ghi chú quay</label><textarea id="quickFilmNote" name="note" maxlength="2000"></textarea></div>'+
  '<div class="field full"><p class="mini-note" id="quickFilmFolder">'+(destination?'📁 Nơi lưu: '+E(destination.label)+' ('+E(selectedBookData?.code||'')+')':'📁 Chọn sách để xác định thư mục lưu tự động')+'</p></div>'+
  '<div class="field full"><p id="quickFilmStatus" role="status" aria-live="polite" class="mini-note">Chọn sách, chọn bài/tiết và video, sau đó bấm Lưu.</p></div>'+
  '<div class="actions full"><button type="submit" class="btn primary" id="quickFilmSave">Lưu video quay lên Drive và Qbooks</button></div></form>';
}
function filmList(){
 const quick=(state.rights.film||state.rights.admin)?
  panel('Quay bài · chọn sách, bài/tiết và tải video',quickFilmOptions(),'Luồng nhanh cho nhân viên quay: một lần lưu, không cần lập kế hoạch video riêng.'):
  panel('Chưa được cấp quyền Quay bài','<p class="mini-note">Tài khoản được xem menu Media nhưng chưa có quyền Quay video. Liên hệ Quản trị hệ thống trước khi tải tệp.</p>');
 return quick+panel('Video đã có · chỉnh sửa hoặc xem lại','<div class="filters"><div class="field"><label for="filterVideo">Tìm video</label><input id="filterVideo" placeholder="Tên video, đầu sách, bài học" value="'+E(state.videoFilter.q||'')+'"></div><div class="field"><label for="filterBook">Đầu sách</label><select id="filterBook"><option value="">Tất cả đầu sách</option>'+selected(booksList(),state.videoFilter.book||'')+'</select></div></div><div id="filteredRows">'+table(['Đầu sách','Video','Giảng viên','Người quay','Tình trạng','Thao tác'],makeVideoRows(state.videoListItems,'film'),'Chưa có video')+'</div>'+pager());
}
function mediaDestinationHtml(bookId){
 const destination=resolveMediaFolder(state.books,bookId);
 return '<p class="mini-note">📁 Nơi lưu mặc định: <a href="'+E(destination.url)+'" target="_blank" rel="noopener noreferrer">'+E(destination.label)+'</a>. Video và ảnh sẽ cùng lưu tại đây.</p>';
}
function evidenceLinksHtml(note){
 const lines=String(note||'').split('\n').filter(x=>x.startsWith('Ảnh minh chứng: '));
 if(!lines.length)return '';
 const links=[];
 for(const line of lines){
  const m=/^Ảnh minh chứng: (.+?) — (https:\/\/\S+)$/.exec(line.trim());
  if(!m)continue;
  try{
   const url=new URL(m[2]);
   if(url.protocol==='https:'&&url.hostname==='drive.google.com'&&/^\/file\/d\/[-A-Za-z0-9_]+\/view$/.test(url.pathname))
    links.push('<a target="_blank" rel="noopener noreferrer" href="'+E(url.href)+'">📷 '+E(m[1])+'</a>');
  }catch{ /* Invalid link stays in the note only; do not render unsafe URLs. */ }
 }
 return links.length?'<div class="qbook-evidence-links" aria-label="Ảnh minh chứng đã lưu">'+links.join('')+'</div>':'';
}
const mediaPhotoCache=new Map();
function filmDetail(v){
 return panel('Thông tin video','<div class="record-card"><strong>'+E(v.book_code)+' · '+E(v.title)+'</strong><span class="mini-note">Bài học: '+E(v.lesson||'—')+' · Giáo viên: '+E(v.teacher||'—')+'</span>'+badge(v.status)+evidenceLinksHtml(v.note)+'</div>')+
 panel('Quay bài · cập nhật tiến độ','<form id="filmForm" class="form-grid">'+
 mediaDestinationHtml(v.book_id)+'<div class="field full qbook-media-direct"><label for="rawFile">Video quay (tải tự động khi bấm Lưu)</label><input id="rawFile" type="file" accept="video/*,.mov,.mp4,.m4v"><span class="mini-note" id="rawUploadStatus" role="status" aria-live="polite">Chọn video tối đa 2 GB, sau đó bấm Lưu. Hệ thống tải lên thư mục Drive mặc định của đầu sách và tự ghi liên kết.</span></div>'+
 '<div class="field full"><label for="filmImages">Ảnh minh chứng / hậu trường (nếu có)</label><input id="filmImages" type="file" accept="image/*,.heic,.heif" multiple><span class="mini-note">Tối đa 10 ảnh, mỗi ảnh 25 MB. Ảnh cùng lưu vào thư mục Drive của video.</span></div>'+
 '<details class="qbook-link-fallback"><summary>Đã có video trên Drive? Dán liên kết thay vì tải lại</summary><div class="field"><label for="filmRawUrl">Liên kết video gốc (chỉ cần khi không chọn tệp)</label><input id="filmRawUrl" name="raw_url" type="url" placeholder="https://drive.google.com/..." value="'+E(v.raw_url||'')+'"></div></details>'+
 '<div class="field full"><label for="filmNote">Ghi chú quay</label><textarea id="filmNote" name="note">'+E(v.note||'')+'</textarea></div>'+
 '<div class="actions full">'+btn('Quay lại danh sách','','backList')+btn('Lưu video đã quay và tệp','primary','','submit')+'</div></form>'+
 '<p class="mini-note">Tệp tải trực tiếp từ thiết bị lên Google Drive. Trên iPhone/Android, giữ trang đang mở trong khi tải; không đóng Safari/Chrome trước khi có thông báo lưu thành công.</p>');
}
function postOverview(){
 const t=state.overview?.totals||{},counts=state.overview?.statusCounts||[];
 const value=s=>Number(counts.find(x=>x.status===s)?.total||0);
 return kpis([{label:'Chờ hậu kỳ',value:value('ĐÃ QUAY')},{label:'Đang hậu kỳ',value:value('ĐANG HẬU KỲ')},{label:'Chờ duyệt',value:t.pending_review||0},{label:'Đã phát hành',value:value('ĐÃ PHÁT HÀNH')}])+
 panel('Hàng đợi xử lý','<div class="actions" style="justify-content:flex-start"><button class="btn primary" data-goto="edit" data-review="PENDING">Xem video chờ duyệt ('+count(t.pending_review||0)+')</button><button class="btn" data-goto="edit" data-review="CHANGES_REQUESTED">Xem video cần sửa ('+count(t.need_revision||0)+')</button><button class="btn" data-goto="edit">Danh sách hậu kỳ</button></div><p class="mini-note">Dữ liệu tổng hợp từ máy chủ, mở danh sách để tra cứu toàn bộ và phân trang.</p>');
}

function editList(){return panel('Danh sách video hậu kỳ','<div class="filters"><div class="field"><label>Tìm video</label><input id="filterVideo" placeholder="Tên video, tên sách" value="'+E(state.videoFilter.q||'')+'"></div><div class="field"><label>Đầu sách</label><select id="filterBook"><option value="">Tất cả đầu sách</option>'+selected(booksList(),state.videoFilter.book||'')+'</select></div><div class="field"><label>Kiểm duyệt</label><select id="reviewFilter"><option value="">Tất cả</option>'+[['PENDING','Chờ duyệt'],['APPROVED','Đã duyệt'],['CHANGES_REQUESTED','Yêu cầu sửa']].map(([v,t])=>'<option value="'+v+'" '+(state.videoFilter.review===v?'selected':'')+'>'+t+'</option>').join('')+'</select></div></div><div id="filteredRows">'+table(['Đầu sách','Video','Giảng viên','Người quay','Tình trạng','Thao tác'],makeVideoRows(state.videoListItems,'edit'),'Chưa có video hậu kỳ')+'</div>'+pager());}
function editDetail(v){
 const manager=state.rights.manage||state.rights.admin;
 const canEdit=state.rights.edit||state.rights.admin;
 const pending=v.status==='CHỜ DUYỆT'&&v.review_status==='PENDING';
 const approved=v.status==='CHỜ DUYỆT'&&v.review_status==='APPROVED';
 let html=panel('Chi tiết xử lý','<div class="record-card"><strong>'+E(v.book_code)+' · '+E(v.title)+'</strong>'+badge(v.status)+'<p class="mini-note">Phê duyệt: '+E(v.review_status==='APPROVED'?'Đã được duyệt':pending?'Đang chờ duyệt':v.review_status==='CHANGES_REQUESTED'?'Cần sửa lại':'Chưa gửi duyệt')+'</p>'+(v.review_note?'<p>'+E(v.review_note)+'</p>':'')+'<span class="mini-note">Video gốc: '+(v.raw_url?'<a href="'+E(v.raw_url)+'" target="_blank" rel="noopener noreferrer">Mở video gốc</a>':'Chưa có liên kết')+'</span>'+evidenceLinksHtml(v.note)+'</div>');
 if(canEdit&&['ĐÃ QUAY','ĐANG HẬU KỲ'].includes(v.status)){
  html+=panel('Biên tập và gửi duyệt','<form id="editForm" class="form-grid">'+
  mediaDestinationHtml(v.book_id)+'<div class="field full qbook-media-direct"><label for="editedFile">Video bản hậu kỳ (tự tải khi bấm Lưu / gửi duyệt)</label><input id="editedFile" type="file" accept="video/*,.mov,.mp4,.m4v"><span class="mini-note" id="editedUploadStatus" role="status" aria-live="polite">Tệp tối đa 2 GB. Video được lưu vào thư mục Drive mặc định của đầu sách.</span></div>'+
  '<div class="field full"><label for="editImages">Ảnh hậu kỳ / minh chứng (nếu có)</label><input id="editImages" type="file" accept="image/*,.heic,.heif" multiple><span class="mini-note">Tối đa 10 ảnh, mỗi ảnh 25 MB; cùng thư mục Drive với video.</span></div>'+
  '<details class="qbook-link-fallback"><summary>Đã có video hậu kỳ trên Drive? Dùng liên kết</summary><div class="field"><label for="editOutputUrl">Liên kết video hậu kỳ (khi không chọn tệp)</label><input id="editOutputUrl" name="output_url" type="url" placeholder="https://drive.google.com/..." value="'+E(v.output_url||'')+'"></div></details>'+
  '<div class="field"><label for="editStatus">Trạng thái</label><select id="editStatus" name="status"><option value="ĐANG HẬU KỲ">Đang hậu kỳ</option><option value="CHỜ DUYỆT">Gửi trưởng nhóm duyệt</option></select></div>'+
  '<div class="field full"><label for="editNote">Ghi chú</label><textarea id="editNote" name="note">'+E(v.note||'')+'</textarea></div>'+
  '<div class="actions full">'+btn('Quay lại','','backList')+btn('Lưu / gửi duyệt','primary','','submit')+'</div></form>');
 }
 if(manager&&pending&&v.editor_id!==state.user?.id){
  html+=panel('Phê duyệt trưởng nhóm','<div class="field"><label for="reviewNote">Ghi chú / lý do trả sửa</label><textarea id="reviewNote" placeholder="Nhập lý do nếu yêu cầu sửa"></textarea></div><div class="actions"><button class="btn" id="rejectVideo">Yêu cầu sửa lại</button><button class="btn primary" id="approveVideo">Duyệt video</button></div>');
 }
 if(manager&&approved)html+=panel('Phát hành video đã duyệt','<div class="field"><label for="publishYoutube">Liên kết YouTube công khai *</label><input id="publishYoutube" type="url" placeholder="https://www.youtube.com/watch?v=..." value="'+E(v.youtube_url||'')+'"></div><div class="actions"><button id="publishVideo" class="btn primary">Xác nhận đã phát hành</button></div>');
 if(pending&&!manager)html+=panel('Đang chờ duyệt','<p>Video đã nộp cho trưởng nhóm. Chưa thể chỉnh sửa hoặc phát hành.</p>');
 if(!canEdit&&!manager)html+=panel('Thông tin video','<p>Bạn chưa có quyền xử lý video này.</p>');
 return html;
}

function production(){
 const dateSelected=state.productionDate||new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Ho_Chi_Minh',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 const current=state.dailyStats?.day===dateSelected;
 const people=current?(state.dailyStats.people||[]):[];
 const selectedStaff=state.productionStaff||'';
 const names=[...new Set(people.map(p=>p.id+'|'+p.name))].sort();
 const filtered=people.filter(p=>!selectedStaff||String(p.id)===selectedStaff);
 const filmed=filtered.reduce((a,p)=>a+Number(p.filmed||0),0),edited=filtered.reduce((a,p)=>a+Number(p.edited||0),0);
 return '<p class="qv-asof">Nguồn: nhật ký video_events · Kỳ báo cáo: '+E(dateSelected)+' · Múi giờ Việt Nam (UTC+7). Chỉ tính lần hoàn thành đầu tiên.</p>'+
 '<div class="filters"><div class="field"><label>Ngày báo cáo</label><input type="date" id="productionDate" value="'+E(dateSelected)+'"></div>'+
 '<div class="field"><label>Nhân sự</label><select id="productionStaff"><option value="">Tất cả nhân sự</option>'+
 names.map(n=>{const parts=n.split('|');return '<option value="'+E(parts[0])+'" '+(selectedStaff===parts[0]?'selected':'')+'>'+E(parts.slice(1).join('|'))+'</option>';}).join('')+
 '</select></div></div>'+
 (current?kpis([{label:'Hoàn thành quay',value:filmed},{label:'Hoàn thành hậu kỳ',value:edited},{label:'Tổng hoạt động',value:filmed+edited},{label:'Nhân sự có hoạt động',value:filtered.length}]):'<p class="mini-note">Đang tải dữ liệu nhật ký...</p>')+
 panel('Sản lượng theo nhân sự',current?table(['Nhân sự','Video quay','Hậu kỳ','Tổng'],filtered.map(p=>[E(p.name),count(p.filmed),count(p.edited),count(Number(p.filmed||0)+Number(p.edited||0))])):'<p>Đang tải...</p>');
}
async function fetchProduction(){
 const day=state.productionDate||new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Ho_Chi_Minh',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 try{const r=await api('GET','/api/video/production?day='+encodeURIComponent(day));state.dailyStats=r;if(state.view==='production')render();}catch(e){toast('Không tải được nhật ký sản lượng: '+e.message);}
}

function booksProgress(){return mediaBookSelector()+panel('Tiến độ đầu sách',booksTable(state.managementBook),'Theo dõi số lượng và trạng thái sản xuất theo từng đầu sách');}
function report(){
 const t=state.overview?.totals||{};
 return mediaBookSelector()+kpis([{label:'Kế hoạch video',value:state.books.reduce((a,b)=>a+Number(b.target_count||0),0)},{label:'Video đã khai báo',value:t.total},{label:'Video đã quay',value:t.filmed},{label:'Video đã phát hành',value:t.published}])+
 panel('Báo cáo tổng hợp theo sách',booksTable(state.managementBook))+
 panel('Tình trạng video',table(['Trạng thái','Video'],statuses.map(s=>[badge(s),count((state.overview?.statusCounts||[]).find(x=>x.status===s)?.total||0)])))+
 '<div class="actions">'+btn('Xuất báo cáo CSV','primary','exportReport')+'</div>';
}
function booksAdmin(){
 const form=state.rights.manage||state.rights.admin?panel('Thêm đầu sách','<form id="bookForm" class="form-grid">'+
 '<div class="field"><label>Mã đầu sách *</label><input name="code" maxlength="60" required placeholder="SP337"></div>'+
 '<div class="field"><label>Tên đầu sách *</label><input name="name" maxlength="250" required placeholder="Toán 1 – Tập 1"></div>'+
 '<div class="field"><label>Giảng viên</label><input name="teacher" placeholder="Tên giáo viên"></div>'+
 '<div class="field"><label>Kế hoạch số video</label><input name="target_count" type="number" min="0" value="0"></div>'+
 '<div class="field full"><label>Thư mục Drive</label><input name="drive_url" type="url" placeholder="https://drive.google.com/drive/folders/..."></div>'+
 '<div class="actions full">'+btn('Thêm đầu sách','primary','','submit')+'</div></form>'):'';
 const missing=state.books.filter(b=>!googleFolderId(b.id));
 const note=panel('Sẵn sàng tải video lên Google Drive','<p class="mini-note"><strong>'+missing.length+' / '+state.books.length+' đầu sách chưa có thư mục Drive hợp lệ.</strong> Nhập liên kết thư mục của từng đầu sách trước khi quay hoặc hậu kỳ. Ứng dụng sẽ không tự tải video vào thư mục gốc cá nhân.</p>'+
 '<div class="tablewrap"><table class="data-table"><thead><tr><th>Đầu sách</th><th>Thư mục Drive</th><th>Thiết lập</th></tr></thead><tbody>'+
 state.books.map(b=>'<tr><td>'+E(b.code)+' · '+E(b.name)+'</td><td>'+(googleFolderId(b.id)?'<a href="'+E(b.drive_url)+'" target="_blank" rel="noopener noreferrer">Đã thiết lập</a>':'<span class="state amber">Chưa thiết lập</span>')+'</td><td>'+
 ((state.rights.manage||state.rights.admin)?'<form data-book-folder="'+E(b.id)+'" class="qv-folder-form"><input type="url" name="drive_url" value="'+E(b.drive_url||'')+'" placeholder="https://drive.google.com/drive/folders/..." required><button type="submit" class="btn">Lưu thư mục</button></form>':'Chỉ quản lý được cập nhật')+(googleFolderId(b.id)?'<button type="button" class="btn qv-check-folder" data-check-folder="'+E(b.id)+'">Kiểm tra quyền Drive</button>':'')+'</td></tr>').join('')+'</tbody></table></div>');
 return note+form+panel('Danh sách đầu sách',booksTable());
}
function catalogItems(){
 const book=state.catalogBook||'',week=state.catalogWeek||'',q=(state.catalogQuery||'').trim().toLocaleLowerCase('vi');
 return state.lessons.filter(x=>(!book||x.book_code===book)&&(!week||x.week===week)&&(!q||[x.id,x.title,x.lesson_no,x.period,x.book_code].join(' ').toLocaleLowerCase('vi').includes(q)));
}
function catalogTable(){
 const matched=catalogItems(),bookNames=new Map(state.books.map(b=>[b.code,b.name]));
 const rows=matched.slice(0,150).map(x=>[E(x.book_code),E(x.week||'—'),E(x.lesson_no||'—'),E(x.period||'—'),'<strong>'+E(x.title)+'</strong><div class="mini-note">'+E(x.id)+'</div>',E(x.page||'—')]);
 return '<p class="mini-note">Hiển thị '+count(rows.length)+' / '+count(matched.length)+' bài/tiết phù hợp. Tổng danh mục: '+count(state.lessons.length)+'.</p>'+
 table(['Mã sách','Tuần','Bài','Tiết','Nội dung','Trang'],rows,'Không có nội dung khớp bộ lọc');
}
function catalog(){
 const book=state.catalogBook||'',week=state.catalogWeek||'';
 const codes=[...new Set(state.lessons.map(x=>x.book_code))].sort();
 const weeks=[...new Set(state.lessons.filter(x=>!book||x.book_code===book).map(x=>x.week).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'vi',{numeric:true}));
 const counts=[{label:'Đầu sách có bài học',value:codes.length},{label:'Bài/tiết kế hoạch',value:state.lessons.length}];
 if(['dashboard','adminOverview','booksProgress','report'].some(can))counts.push({label:'Video đã khai báo',value:state.overview?.totals?.total||0},{label:'Video đã phát hành',value:state.overview?.totals?.published||0});
 return kpis(counts)+
 panel('Danh mục bài học theo đầu sách','<div class="filters"><div class="field"><label>Đầu sách</label><select id="catalogBook"><option value="">Tất cả đầu sách</option>'+
 state.books.map(b=>'<option value="'+E(b.code)+'" '+(b.code===book?'selected':'')+'>'+E(b.code)+' — '+E(b.name)+'</option>').join('')+
 '</select></div><div class="field"><label>Tuần</label><select id="catalogWeek"><option value="">Tất cả các tuần</option>'+
 weeks.map(x=>'<option value="'+E(x)+'" '+(x===week?'selected':'')+'>'+E(x)+'</option>').join('')+
 '</select></div><div class="field"><label>Tìm bài/tiết</label><input id="catalogQuery" placeholder="Tên bài, tiết, mã bài..." value="'+E(state.catalogQuery||'')+'"></div></div><div id="catalogTable">'+catalogTable()+'</div>',
 'Danh mục từ Google Sheets đã đồng bộ vào Cloudflare D1; số bài học không phải số video đã quay.');
}
function createVideo(){
 return panel('Lập kế hoạch video mới','<form id="newVideoForm" class="form-grid">'+
 '<div class="field"><label>Đầu sách *</label><select id="newVideoBook" name="book_id" required><option value="">Chọn đầu sách</option>'+selected(booksList(),'')+'</select></div>'+
 '<div class="field"><label>Tuần học</label><select id="newVideoWeek"><option value="">Tất cả các tuần</option></select></div>'+
 '<div class="field full"><label>Chọn bài học / tiết quay</label><select id="newVideoLesson" name="lesson_id"><option value="">Chọn đầu sách trước hoặc nhập nội dung tự do</option></select><p class="mini-note" id="newVideoCount">Đã đồng bộ '+count(state.lessons.length)+' bài/tiết thuộc '+count(state.books.length)+' đầu sách.</p></div>'+
 '<div class="field full"><label>Tên video / bài *</label><input id="newVideoTitle" name="title" required placeholder="Chọn bài ở trên để tự điền hoặc nhập nội dung độc lập"></div>'+
 '<input type="hidden" name="lesson"><input type="hidden" name="lesson_group">'+
 '<div class="field"><label>Giảng viên</label><input name="teacher" placeholder="Giảng viên phụ trách"></div>'+
 '<div class="field full"><label>Ghi chú</label><textarea name="note"></textarea></div>'+
 '<div class="actions full">'+btn('Lưu kế hoạch video','primary','','submit')+'</div></form>')+
 panel('Các video đã lập kế hoạch',table(['Sách','Video','Giảng viên','Tình trạng'],state.items.slice(0,150).map(v=>[E(v.book_code),E(v.title),E(v.teacher||'—'),badge(v.status)])));
}
function initializeLessonSelection(){
 const b=$('newVideoBook'),week=$('newVideoWeek'),lesson=$('newVideoLesson'),title=$('newVideoTitle'),form=$('newVideoForm');
 if(!b||!week||!lesson||!title||!form)return;
 const current=()=>state.lessons.filter(x=>x.book_code===state.books.find(y=>y.id===b.value)?.code);
 const fillWeek=()=>{
  const weeks=[...new Set(current().map(x=>x.week).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'vi',{numeric:true}));
  week.innerHTML='<option value="">Tất cả các tuần</option>'+weeks.map(x=>'<option value="'+E(x)+'">'+E(x)+'</option>').join('');
  fillLesson();
 };
 const fillLesson=()=>{
  const matching=current().filter(x=>!week.value||x.week===week.value);
  lesson.innerHTML='<option value="">Tự nhập / Không có trong danh mục</option>'+matching.map(x=>'<option value="'+E(x.id)+'">'+E([x.lesson_no,x.period,x.title].filter(Boolean).join(' · '))+'</option>').join('');
  $('newVideoCount').textContent=count(matching.length)+' bài/tiết phù hợp';
 };
 b.addEventListener('change',()=>{fillWeek();});
 week.addEventListener('change',fillLesson);
 lesson.addEventListener('change',()=>{
  const x=state.lessons.find(y=>y.id===lesson.value);if(!x)return;
  title.value=x.title;
  form.elements.lesson.value=[x.lesson_no,x.period].filter(Boolean).join(' · ');
  form.elements.lesson_group.value=x.week||'';
 });
 fillWeek();
}

function staffAdmin(){
 return panel('Nhân viên QBooks',table(['Họ tên','Email','Vai trò QBooks','Quay','Hậu kỳ','Quản lý'],state.staff.map(p=>[E(p.name),E(p.email),E(p.role),p.can_film?'✓':'—',p.can_edit?'✓':'—',p.can_manage?'✓':'—'])));
}
function permissions(){
 if(!state.rights.admin)return panel('Phân quyền','<p>Chỉ quản trị viên có quyền thay đổi phân quyền.</p>');
 return panel('Phân quyền người dùng theo vai trò','<p class="sub">Chỉ áp dụng cho phân hệ Video, không tác động quyền Đóng hàng – Vận đơn.</p>'+
 state.staff.map(p=>'<form class="person-row" data-grant="'+E(p.id)+'"><div><strong>'+E(p.name)+'</strong><div class="mini-note">'+E(p.email)+'</div></div>'+
 '<div class="checkset"><label><input type="checkbox" name="can_film" '+(p.can_film?'checked':'')+'>Quay</label><label><input type="checkbox" name="can_edit" '+(p.can_edit?'checked':'')+'>Hậu kỳ</label><label><input type="checkbox" name="can_manage" '+(p.can_manage?'checked':'')+'>Quản lý</label><button class="btn primary" type="submit">Lưu</button></div></form>').join(''));
}
function auditView(){return panel('Lịch sử thao tác',table(['Ngày','Nhân sự','Hành động','Video'],(state.audit||[]).map(a=>[date(a.created_at),E(a.actor_name||'—'),E(a.action),E(a.video_id||'—')])));}
function render(){
 const screen={dashboard,bookDetail,filmOverview:filmingOverview,film:filmList,postOverview,edit:editList,production,booksProgress,report,books:booksAdmin,catalog};
 let html=screen[state.view]?.()||'<p>Chưa có nội dung.</p>';
 if(state.view==='film'&&state.selected)html=filmDetail(state.selected);
 if(state.view==='edit'&&state.selected)html=editDetail(state.selected);
 $('page').innerHTML=html;
 wire();
 for(const form of $('page').querySelectorAll('form'))trackDraft(form);
 for(const id of ['reviewNote','publishYoutube']){const control=$(id);if(control){const panel=control.closest('.panel');if(panel)trackDraft(panel);}}
}
function bindForm(id,callback){
 const form=$(id);if(!form)return;
 form.onsubmit=async e=>{
  e.preventDefault();const button=form.querySelector('button[type=submit]');
  if(button?.disabled)return;
  if(!form.reportValidity())return;
  if((id==='filmForm'||id==='editForm')&&saveMediaFilesWithOneClick(form,id,callback,button))return;
  if(id==='filmForm'&&!form.elements.raw_url.value.trim())return showFieldError(form,'raw_url','Chọn video quay hoặc nhập liên kết Google Drive trước khi lưu.');
  if(button)button.disabled=true;
  let saved=false;
  try{
   await callback(Object.fromEntries(new FormData(form)));saved=true;
   markDraftSaved(form);
   await load();state.selected=null;render();
   if(['film','edit'].includes(state.view))await refreshVideoList();
   toast('Đã lưu thành công.');
  }catch(err){
   if(saved){toast('Video đã lưu nhưng chưa cập nhật được danh sách: '+err.message);return;}
   toast('Không lưu được: '+err.message);
   if(/liên kết|link|url/i.test(err.message)){
    const target=form.querySelector('[name=raw_url],[name=output_url],[name=youtube_url]');
    if(target)showFieldError(form,target.name,err.message);
    else showFormError(form,err.message);
   }else showFormError(form,err.message);
  }finally{if(button)button.disabled=false;}
 };
}
function csvExport(){
 const lines=[['Mã sách','Tên sách','Kế hoạch','Đã có','Phát hành'],...state.books.filter(b=>!state.managementBook||b.id===state.managementBook).map(b=>[b.code,b.name,b.target_count,b.total,b.published])];
 const csv='\ufeff'+lines.map(row=>row.map(c=>'"'+String(c??'').replace(/"/g,'""')+'"').join(',')).join('\r\n');
 const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));
 const a=document.createElement('a');a.href=url;a.download='QBOOK_BAO_CAO_VIDEO.csv';a.click();URL.revokeObjectURL(url);
}
async function validateVideoFile(file){
 if(!file||(!file.type.startsWith('video/')&&!/\.(mov|mp4|m4v|webm|mkv)$/i.test(file.name)))throw Error('Vui lòng chọn tệp video hợp lệ.');
 if(file.size>2*1024*1024*1024||!file.size)throw Error('Mỗi video phải có dữ liệu và không vượt 2 GB.');
 const video=document.createElement('video'),url=URL.createObjectURL(file);
 try{
  await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Không đọc được thời lượng video sau 15 giây. Hãy kiểm tra định dạng MOV/MP4.')),15000);video.preload='metadata';video.onloadedmetadata=()=>{clearTimeout(timer);resolve()};video.onerror=()=>{clearTimeout(timer);reject(Error('Không đọc được thông tin video.'))};video.src=url});
  if(Number.isFinite(video.duration)&&video.duration>3600)throw Error('Video tối đa 60 phút.');
 }finally{URL.revokeObjectURL(url);video.removeAttribute('src');video.load();}
}
function askGoogleDriveToken(continueWith,onFailure=()=>{}){
 if(!window.google?.accounts?.oauth2)throw Error('Google chưa sẵn sàng. Vui lòng tải lại trang trong Chrome/Safari.');
 if(!state.googleClientId)throw Error('Google Client ID chưa sẵn sàng; tải lại trang.');
 const client=window.google.accounts.oauth2.initTokenClient({
  client_id:state.googleClientId,scope:'https://www.googleapis.com/auth/drive',
  callback:r=>{if(r.error||!r.access_token){onFailure();return toast('Google chưa cấp quyền Drive: '+(r.error||'Đã hủy'));}continueWith(r.access_token).catch(e=>{onFailure();toast(e.message)});},
  error_callback:r=>{onFailure();toast('Không thể mở Google: '+(r.type||'Lỗi trình duyệt'));}
 });
 client.requestAccessToken({prompt:'consent'});
}
function googleFolderId(bookId){
 const b=state.books.find(x=>x.id===bookId);
 if(!b?.drive_url)return null;
 try{
  const url=new URL(b.drive_url);
  if(url.hostname!=='drive.google.com')return null;
  const match=url.pathname.match(/\/folders\/([a-zA-Z0-9_-]+)/);
  return match?.[1]||null;
 }catch{return null;}
}
async function uploadToDriveFile(file,bookId,token,updateStatus){
 if(file.type.startsWith('video/')||/\.(mov|mp4|m4v|webm|mkv)$/i.test(file.name))await validateVideoFile(file);
 else validateMediaPhotos([file]);
 const destination=resolveMediaFolder(state.books,bookId);
 const result=await resumableDriveUpload(file,{
  token,folderId:destination.id,
  onProgress:p=>updateStatus(p.percent===100?
   'Đã tải '+file.name+' lên '+destination.label+'. Đang lưu thông tin video…':
   'Đang tải '+file.name+': '+p.percent+'% · '+Math.round(p.offset/1048576)+' / '+Math.round(p.total/1048576)+' MB')
 });
 return result;
}

// Upload from the same user-initiated Save click. The Google OAuth prompt is opened
// synchronously, then Drive URLs and evidence links are saved in the D1 video record.
function saveMediaFilesWithOneClick(form,id,callback,button){
 const filming=id==='filmForm';
 const fileInput=$(filming?'rawFile':'editedFile');
 const imageInput=$(filming?'filmImages':'editImages');
 const video=fileInput?.files?.[0]||null;
 const images=[...(imageInput?.files||[])];
 if(!video&&!images.length)return false;
 const status=$(filming?'rawUploadStatus':'editedUploadStatus');
 const current=state.selected,bookId=current?.book_id;
 if(!current||!bookId){showFormError(form,'Không xác định được đầu sách. Mở lại video và thử lại.');return true;}
 try{
  validateMediaPhotos(images);
  if(filming&&!video&&!form.elements.raw_url.value.trim())throw Error('Chọn video quay hoặc nhập liên kết Google Drive trước khi lưu ảnh.');
  if(!filming&&!video&&form.elements.status.value==='CHỜ DUYỆT'&&!form.elements.output_url.value.trim())throw Error('Cần chọn video hậu kỳ hoặc nhập liên kết trước khi gửi duyệt.');
  if(video&&(!video.size||video.size>2*1024*1024*1024))throw Error('Video phải có dữ liệu và không vượt quá 2 GB.');
  const provisional=appendEvidenceLinks(form.elements.note?.value||'',images.map(f=>({name:f.name,url:'https://drive.google.com/file/d/placeholder/view'})));
  if(provisional.length>2000)throw Error('Ghi chú và danh sách ảnh quá dài.');
  if(!window.google?.accounts?.oauth2||!state.googleClientId)throw Error('Chưa sẵn sàng Google Drive. Hãy tải lại Qbooks và đăng nhập Google.');
 }catch(e){status.textContent=e.message;showFormError(form,e.message);return true;}
 const destination=resolveMediaFolder(state.books,bookId);
 const originalLabel=button?.textContent||'Lưu';
 if(button){button.disabled=true;button.textContent='ĐANG TẢI TỆP…';}
 status.textContent='Đang yêu cầu quyền Google. Đích lưu: '+destination.label+'. Giữ trình duyệt đang mở cho đến khi lưu thành công.';
 try{
  askGoogleDriveToken(async token=>{
   let recordSaved=false;
   try{
    const payload=Object.fromEntries(new FormData(form));
    if(video){
     payload[filming?'raw_url':'output_url']=await uploadToDriveFile(video,bookId,token,text=>status.textContent=text);
     // Keep the successful Drive URL so a later D1 error can be retried without reuploading.
     form.elements[filming?'raw_url':'output_url'].value=payload[filming?'raw_url':'output_url'];
     fileInput.value='';
    }
    const uploaded=[];
    for(let i=0;i<images.length;i++){
     const file=images[i];
     status.textContent='Đang tải ảnh '+(i+1)+'/'+images.length+' vào '+destination.label+'…';
     const key=id+'|'+current.id+'|'+file.name+'|'+file.size+'|'+file.lastModified;
     const link=mediaPhotoCache.get(key)||await uploadToDriveFile(file,bookId,token,text=>status.textContent=text);
     mediaPhotoCache.set(key,link);
     uploaded.push({name:file.name,url:link});
     // Immediately preserve each successful photo link across partial failures.
     if(!form.elements.note.value.includes(' — '+link))
      form.elements.note.value=appendEvidenceLinks(form.elements.note.value,[{name:file.name,url:link}]);
    }
    if(uploaded.length){payload.note=form.elements.note.value;imageInput.value='';}
    if(filming&&!payload.raw_url)throw Error('Chưa có video gốc. Chọn video hoặc nhập liên kết Drive.');
    if(!filming&&payload.status==='CHỜ DUYỆT'&&!payload.output_url)throw Error('Cần video hậu kỳ để gửi duyệt.');
    status.textContent='Tệp đã lên Drive. Đang ghi nhận vào Qbooks…';
    await callback(payload);recordSaved=true;mediaPhotoCache.clear();
    markDraftSaved(form);
    status.textContent='Đã lưu tệp và trạng thái video vào Qbooks.';
    await load();state.selected=null;render();
    if(['film','edit'].includes(state.view))await refreshVideoList();
    toast('Đã lưu thành công. Tệp được đặt trong '+destination.label+'.');
   }catch(e){
    const message=(recordSaved?'Video đã lưu nhưng tải danh sách lỗi: ':'Không lưu được video: ')+e.message;
    status.textContent=message;showFormError(form,message);toast(message);
   }finally{if(button){button.disabled=false;button.textContent=originalLabel;}}
  },()=>{
   if(button){button.disabled=false;button.textContent=originalLabel;}
   status.textContent='Chưa cấp quyền Google Drive. Tệp chưa được tải; bấm Lưu để thử lại.';
  });
 }catch(e){
  if(button){button.disabled=false;button.textContent=originalLabel;}
  status.textContent=e.message;showFormError(form,e.message);
 }
 return true;
}
function saveQuickFilm(){
 const form=$('quickFilmForm');if(!form)return;
 const bookId=form.elements.book_id?.value||'',lessonId=form.elements.lesson_id?.value||'';
 const video=$('quickFilmFile')?.files?.[0],photos=[...($('quickFilmImages')?.files||[])];
 const status=$('quickFilmStatus'),button=$('quickFilmSave');
 if(!state.rights.film&&!state.rights.admin){status.textContent='Tài khoản chưa được cấp quyền Quay video.';return;}
 if(!bookId||!lessonId||!video){status.textContent='Chọn đủ đầu sách, bài/tiết và video trước khi lưu.';return;}
 try{
  validateMediaPhotos(photos);
  appendEvidenceLinks(form.elements.note.value,photos.map(file=>({name:file.name,url:'https://drive.google.com/file/d/example-identifier/view'})));
  if(!video.size||video.size>2*1024*1024*1024)throw Error('Video phải có dữ liệu và không vượt 2 GB.');
  if(!state.googleClientId||!window.google?.accounts?.oauth2)throw Error('Chưa có cấu hình Google Drive hoặc thư viện Google chưa sẵn sàng.');
 }catch(e){status.textContent=e.message;return;}
 const destination=resolveMediaFolder(state.books,bookId);
 const original=button.textContent;button.disabled=true;button.textContent='ĐANG TẢI TỆP…';
 status.textContent='Đang xin quyền Google Drive. Đích lưu: '+destination.label+'. Không đóng tab khi đang tải.';
 // Google prompt must be initiated by the operator's Submit interaction.
 try{askGoogleDriveToken(async token=>{
  try{
   const videoKey=bookId+'|'+lessonId+'|'+video.name+'|'+video.size+'|'+video.lastModified;
   const link=state.quickFilmUploadedKey===videoKey&&state.quickFilmUploadedUrl?
    state.quickFilmUploadedUrl:await uploadToDriveFile(video,bookId,token,msg=>status.textContent=msg);
   state.quickFilmUploadedKey=videoKey;state.quickFilmUploadedUrl=link;
   // This Drive URL remains available for retry if recording metadata fails.
   let note=form.elements.note.value||'';
   for(let index=0;index<photos.length;index++){
    const file=photos[index],key='quick|'+bookId+'|'+lessonId+'|'+file.name+'|'+file.size+'|'+file.lastModified;
    status.textContent='Đang lưu ảnh '+(index+1)+'/'+photos.length+'…';
    const url=mediaPhotoCache.get(key)||await uploadToDriveFile(file,bookId,token,msg=>status.textContent=msg);
    mediaPhotoCache.set(key,url);
    if(!note.includes(' — '+url))note=appendEvidenceLinks(note,[{name:file.name,url}]);
   }
   status.textContent='Đã tải xong lên Drive. Đang ghi nhận bài/tiết vào Qbooks…';
   const response=await api('POST','/api/video/film-direct',{book_id:bookId,lesson_id:lessonId,raw_url:link,note});
   if(!response?.ok)throw Error('Máy chủ chưa xác nhận hoàn thành quay.');
   mediaPhotoCache.clear();state.quickFilmUploadedUrl='';state.quickFilmUploadedKey='';status.textContent='Đã lưu video và ảnh vào Drive; Qbooks đã ghi nhận bài/tiết thành công.';
   toast('Đã lưu video quay: '+(response.created?'Tạo mới':'Cập nhật')+' thành công.');
   state.quickFilmLesson='';state.videoPage=1;
   await load({initial:true});
   if(state.view==='film')await refreshVideoList();
  }catch(e){status.textContent='Chưa hoàn tất: '+e.message+'. Tệp đã tải lên có thể còn trên Drive; kiểm tra trước khi thử lại.';toast(e.message);}
  finally{button.disabled=false;button.textContent=original;}
 },()=>{
  button.disabled=false;button.textContent=original;
  status.textContent='Bạn chưa cấp quyền Drive, chưa có tệp nào được gửi.';
 });}catch(e){
  button.disabled=false;button.textContent=original;status.textContent=e.message;
 }
}
function wireQuickFilm(){
 const form=$('quickFilmForm');if(!form)return;
 const book=$('quickFilmBook'),lesson=$('quickFilmLesson');
 if(!book||!lesson)return;
 const fillLessons=items=>{
  lesson.replaceChildren();
  const empty=document.createElement('option');empty.value='';
  empty.textContent=items.length?'-- Chọn bài/tiết --':'Chưa có bài/tiết cho đầu sách này';lesson.append(empty);
  for(const l of items){
   const option=document.createElement('option');option.value=l.id;
   option.textContent=[l.week&&'Tuần '+l.week,l.lesson_no&&'Bài '+l.lesson_no,l.period&&'Tiết '+l.period,l.title].filter(Boolean).join(' · ');
   lesson.append(option);
  }
  $('quickFilmLessonCount').textContent=items.length+' bài/tiết thuộc sách này';
 };
 book.onchange=async()=>{
  state.quickFilmBook=book.value;state.quickFilmLesson='';
  state.quickFilmUploadedUrl='';state.quickFilmUploadedKey='';mediaPhotoCache.clear();
  const selectedBook=state.books.find(b=>b.id===book.value);
  const code=selectedBook?.code;
  if(!code){fillLessons([]);$('quickFilmFolder').textContent='📁 Chọn sách để xác định thư mục lưu.';return;}
  $('quickFilmFolder').textContent='📁 Nơi lưu: '+resolveMediaFolder(state.books,book.value).label;
  const existing=state.lessons.filter(l=>l.book_code===code);
  fillLessons(existing);
  $('quickFilmLessonCount').textContent='Đang cập nhật đầy đủ bài/tiết của đầu sách…';
  try{
   const result=await api('GET','/api/video/lessons?book='+encodeURIComponent(code));
   if(book.value!==selectedBook.id)return;
   const incoming=result.lessons||[];
   const map=new Map(state.lessons.map(l=>[String(l.id),l]));
   for(const item of incoming)map.set(String(item.id),item);
   state.lessons=[...map.values()];
   const picked=state.quickFilmLesson;fillLessons(incoming);
   if(picked&&incoming.some(l=>String(l.id)===String(picked)))lesson.value=picked;
  }catch(e){
   if(book.value===selectedBook.id){
    fillLessons(existing);
    $('quickFilmLessonCount').textContent='Chưa tải được danh mục mới: '+e.message+'. Đang dùng dữ liệu sẵn có.';
   }
  }
 };
 lesson.onchange=()=>{state.quickFilmLesson=lesson.value;state.quickFilmUploadedUrl='';state.quickFilmUploadedKey='';};
 form.onsubmit=e=>{e.preventDefault();if(form.reportValidity())saveQuickFilm();};
}
function wire(){
 initializeLessonSelection();
 wireQuickFilm();
 const managementFilter=$('managementBookFilter');
 if(managementFilter)managementFilter.onchange=e=>{state.managementBook=e.target.value;render();};
 if($('catalogBook'))$('catalogBook').onchange=e=>{state.catalogBook=e.target.value;state.catalogWeek='';render();};
 if($('catalogWeek'))$('catalogWeek').onchange=e=>{state.catalogWeek=e.target.value;render();};
 if($('catalogQuery'))$('catalogQuery').oninput=e=>{state.catalogQuery=e.target.value;$('catalogTable').innerHTML=catalogTable();};
 if($('productionDate'))$('productionDate').onchange=e=>{state.productionDate=e.target.value;state.productionStaff='';render();fetchProduction();};
 if($('productionStaff'))$('productionStaff').onchange=e=>{state.productionStaff=e.target.value;render()};
 document.querySelectorAll('[data-book]').forEach(b=>b.onclick=()=>{state.selectedBook=b.dataset.book;navigate('bookDetail')});
 const backBooks=$('backBooks');if(backBooks)backBooks.onclick=()=>navigate('booksProgress');
 document.querySelectorAll('[data-goto]').forEach(b=>b.onclick=()=>{if(b.dataset.goto==='edit')state.videoFilter.review=b.dataset.review||'';navigate(b.dataset.goto);});
 document.querySelectorAll('form[data-book-folder]').forEach(form=>form.onsubmit=async event=>{
  event.preventDefault();const btn=form.querySelector('button');btn.disabled=true;
  try{
   const id=form.dataset.bookFolder,link=form.elements.drive_url.value.trim();
   await api('PATCH','/api/video/books/'+encodeURIComponent(id)+'/drive-folder',{drive_url:link});
   await load();render();toast('Đã lưu thư mục Drive cho đầu sách.');
  }catch(e){toast('Không lưu được thư mục: '+e.message);}
  finally{btn.disabled=false;}
 });
 document.querySelectorAll('[data-check-folder]').forEach(button=>button.onclick=()=>{
  const folderId=googleFolderId(button.dataset.checkFolder);
  if(!folderId)return toast('Đầu sách chưa có thư mục Drive hợp lệ.');
  button.disabled=true;button.textContent='Đang yêu cầu Google xác thực...';
  try{askGoogleDriveToken(async token=>{
   try{
    const info=await checkDriveFolderAccess({token,folderId});
    toast('Google Drive: có quyền tải tệp vào '+info.name+'.');
    button.textContent='Đã kiểm tra ✓';
   }catch(err){button.textContent='Kiểm tra quyền Drive';toast(err.message);}
   finally{button.disabled=false;}
  },()=>{button.disabled=false;button.textContent='Kiểm tra quyền Drive';});}catch(err){button.disabled=false;button.textContent='Kiểm tra quyền Drive';toast(err.message);}
 });
 bindForm('bookForm',b=>api('POST','/api/video/books',b));
 bindForm('newVideoForm',b=>api('POST','/api/video/items',b));
 bindForm('filmForm',b=>api('PATCH','/api/video/items/'+state.selected.id,{action:'film',...b}));
 bindForm('editForm',b=>api('PATCH','/api/video/items/'+state.selected.id,{action:'edit',...b}));
 const reviewAction=async action=>{
 const note=$('reviewNote'),url=$('publishYoutube');
 if(action==='reject'&&!String(note?.value||'').trim()){if(note)showFieldError(note.closest('.panel'),'reviewNote','Nhập lý do để nhân viên biết nội dung cần sửa.');return;}
 if(action==='publish'&&!String(url?.value||'').trim()){if(url)showFieldError(url.closest('.panel'),'publishYoutube','Nhập liên kết YouTube của video đã phát hành.');return;}
 try{
  await api('PATCH','/api/video/items/'+state.selected.id,{action,note:note?.value||'',youtube_url:url?.value||''});
  markDraftSaved($('editForm'));
  if(note)markDraftSaved(note.closest('.panel'));if(url)markDraftSaved(url.closest('.panel'));
  state.selected=null;await load();await refreshVideoList();toast('Đã cập nhật trạng thái video.');
 }catch(e){toast(e.message);const panel=(action==='publish'?url:note)?.closest('.panel');if(panel)showFormError(panel,e.message);}
};
 if($('approveVideo'))$('approveVideo').onclick=()=>reviewAction('approve');
 if($('rejectVideo'))$('rejectVideo').onclick=()=>reviewAction('reject');
 if($('publishVideo'))$('publishVideo').onclick=()=>reviewAction('publish');
 if($('videoPrev'))$('videoPrev').onclick=async()=>{state.videoPage=Math.max(1,state.videoPage-1);await refreshVideoList();};
 if($('videoNext'))$('videoNext').onclick=async()=>{state.videoPage=Math.min(state.videoListPagination.pages,state.videoPage+1);await refreshVideoList();};
 const eform=$('editForm');if(eform&&state.selected)eform.elements.status.value=['ĐANG HẬU KỲ','CHỜ DUYỆT','ĐÃ PHÁT HÀNH'].includes(state.selected.status)?state.selected.status:'ĐANG HẬU KỲ';
 const back=$('backList');if(back)back.onclick=()=>{if(!confirmLeave())return;state.selected=null;render()};
 let searchTimer;
 const queueFilter=restoreFocus=>{clearTimeout(searchTimer);state.videoPage=1;searchTimer=setTimeout(()=>refreshVideoList(restoreFocus),240);};
 if($('filterVideo'))$('filterVideo').oninput=e=>{state.videoFilter.q=e.target.value;queueFilter(true);};
 if($('filterBook'))$('filterBook').onchange=e=>{state.videoFilter.book=e.target.value;queueFilter(false);};
 if($('reviewFilter'))$('reviewFilter').onchange=e=>{state.videoFilter.review=e.target.value;queueFilter(false);};
 document.querySelectorAll('[data-action][data-id]').forEach(b=>b.onclick=()=>openVideo(b.dataset.id,b.dataset.action));
 document.querySelectorAll('[data-grant]').forEach(form=>form.onsubmit=async e=>{e.preventDefault();try{
  await api('POST','/api/video/staff',{user_id:form.dataset.grant,can_film:form.elements.can_film.checked,can_edit:form.elements.can_edit.checked,can_manage:form.elements.can_manage.checked});
  await load();render();toast('Đã cập nhật quyền nhân sự.');
 }catch(err){toast(err.message)}});
 const exp=$('exportReport');if(exp)exp.onclick=csvExport;
}
function openVideo(id,action){
 const v=state.videoListItems.find(x=>x.id===id)||state.items.find(x=>x.id===id);if(!v)return toast('Không tìm thấy video.');
 if(action==='film'&&!state.rights.film&&!state.rights.admin)return toast('Chưa có quyền quay video.');
 if(action==='edit'&&!state.rights.edit&&!state.rights.manage&&!state.rights.admin)return toast('Chưa có quyền hậu kỳ hoặc quản lý.');
 if(!confirmLeave())return;
 state.selected=v;mediaPhotoCache.clear();state.view=action;renderNav();render();$('page').focus();
}
async function boot(){
 if(!state.token){if(!document.getElementById('unifiedMediaView'))window.location.href='/';return false;}
 try{
  mediaLoadNotice('Đang mở Media và kiểm tra quyền truy cập…');
  // The config endpoint is optional, and can never hold the whole Media screen indefinitely.
  const configController=new AbortController();
  const configTimeout=setTimeout(()=>configController.abort(),8000);
  const configPromise=fetch('/api/google/config',{signal:configController.signal})
   .then(r=>r.ok?r.json():{}).catch(()=>({})).finally(()=>clearTimeout(configTimeout));
  const [b,access,googleCfg]=await Promise.all([
   api('GET','/api/video/bootstrap'),api('GET','/api/menu-access'),configPromise
  ]);
  state.user=b.user;state.rights=b.rights;state.menuKeys=access.menus||[];
  $('currentUser').textContent=b.user.name;
  state.googleClientId=googleCfg.clientId||'';
  mediaLoadNotice('Đang đọc đầu sách và tổng quan; danh sách video sẽ tải riêng…');
  await load({initial:true});const queryView=new URLSearchParams(window.location.search).get('view');const requested=queryView==='adminOverview'?'dashboard':queryView;const target=requested&&NAV.some(n=>n.id===requested)&&can(requested)?requested:NAV.find(n=>can(n.id))?.id;if(target)navigate(target);else {document.getElementById('page').textContent='Tài khoản chưa được cấp quyền menu Media. Liên hệ Quản trị hệ thống.';renderNav();}
  return true;
 }catch(err){
  if(err.message.includes('đăng nhập')||err.message.includes('401')){
   if(!document.getElementById('unifiedMediaView')){sessionStorage.removeItem('qbooks_token');window.location.href='/';}
   throw err;
  }
  mediaLoadNotice('Media chưa mở được: '+err.message,true);
  $('page').innerHTML='<div class="panel"><h2>Không mở được Quản lý Media</h2><p>'+E(err.message)+'</p><button type="button" id="mediaRetryInline" class="btn primary">Thử tải lại</button></div>';
  const retry=$('mediaRetryInline');if(retry)retry.onclick=()=>window.QbookMedia?.retry?.();
  throw err;
 }
}
if(document.getElementById('unifiedMediaView')){
 let started=null;
 const retryButton=$('mediaLoadRetry');
 if(retryButton)retryButton.onclick=()=>window.QbookMedia?.retry?.().catch(e=>mediaLoadNotice('Thử tải lại thất bại: '+e.message,true));
 window.QbookMedia={
  reset(){
   started=null;mediaLoadGeneration++;
   mediaLoadNotice('');
   state.token='';
   state.user=null;state.rights={};state.menuKeys=[];
   state.books=[];state.lessons=[];state.items=[];state.staff=[];
   state.overview=null;state.selected=null;state.videoListItems=[];
   state.videoListPagination={page:1,pages:1,total:0};state.dailyStats={day:'',people:[]};
   state.googleClientId='';state.view='dashboard';state.managementBook='';
   state.quickFilmBook='';state.quickFilmLesson='';state.quickFilmUploadedUrl='';state.quickFilmUploadedKey='';mediaPhotoCache.clear();
   const page=$('page');if(page)page.replaceChildren();
  },
  async start(view,activeToken){
   const token=activeToken||sessionStorage.getItem('qbooks_token')||localStorage.getItem('qbooks_remember_token')||'';
   if(state.token&&state.token!==token)this.reset();
   state.token=token;
   if(!token)throw Error('Phiên đăng nhập đã hết hạn. Đăng nhập lại Qbooks.');
   if(!started)started=boot().catch(err=>{started=null;throw err;});
   await started;
   if(view&&NAV.some(item=>item.id===view)&&can(view)&&state.view!==view)navigate(view);
   return {view:state.view,rights:state.rights};
  },
  async retry(){
   // Retry only Media loading; no form submissions or state mutations.
   started=null;
   mediaLoadNotice('Đang thử tải lại Media…');
   return this.start(state.view,state.token);
  },
  navigate(view){if(!can(view))return false;navigate(view);return true;},
  allowed(view){return can(view);},
  get currentView(){return state.view;}
 };
}else boot().catch(err=>toast(err.message));
