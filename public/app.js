
const CHUNK_BYTES=8*1024*1024;
const $=id=>document.getElementById(id);
const state={token:sessionStorage.getItem('qbooks_token')||'',user:null,orders:[],selected:null,tab:'orders',saving:false,lockedOrderIds:new Set(),orderMenuExpanded:false};
const statusTitle={PACKER:'Đơn chờ đóng hàng',SHIPPER:'Đơn chờ vận đơn',SALE:'Đơn hàng',ADMIN:'Tất cả đơn hàng'};
const $all=(s)=>[...document.querySelectorAll(s)];
function notice(text='',ok=false){$('notice').textContent=text;$('notice').className=ok?'notice ok':'notice';}
async function api(method,path,data,blob=false){
 const headers={};if(state.token)headers.authorization='Bearer '+state.token;
 if(!blob&&data!=null)headers['content-type']='application/json';
 let res;
 try{res=await fetch(path,{method,headers,body:data==null?undefined:blob?data:JSON.stringify(data)})}
 catch(e){throw Error('Lỗi kết nối. Kiểm tra Wi-Fi/3G rồi thử lại: '+e.message)}
 let result;try{result=await res.json()}catch{result={error:'Máy chủ không trả JSON.'}}
 if(!res.ok)throw Error(result.error||'Máy chủ trả lỗi '+res.status);
 return result;
}
function show(id,yes){$(id).hidden=!yes;}
function setBusy(value){state.saving=value;['savePacking','saveShipping','createGroup'].forEach(k=>$(k).disabled=value)}
function el(tag,text,cls){const n=document.createElement(tag);if(text!=null)n.textContent=text;if(cls)n.className=cls;return n}
function meta(text){return el('small',text)}
function button(text,fn,cls='secondary'){const b=el('button',text,cls);b.type='button';b.onclick=fn;return b}
function statusClass(value){
 const names={'CHỜ ĐÓNG HÀNG':'waiting-pack','CHỜ VẬN ĐƠN':'waiting-ship','ĐANG GIAO':'moving','HOÀN THÀNH':'completed'};
 return names[String(value||'').trim()]||'unknown';
}
function statusBadge(value){
 return el('span',value||'Chưa xác định','tag shipment-status status-'+statusClass(value));
}
function firstInvoice(value){
 return String(value||'').split(',').map(s=>s.trim()).find(Boolean)||'Chưa có mã hóa đơn';
}
function orderCardContents(order){
 const fragment=document.createDocumentFragment();
 const titleRow=el('div',null,'shipping-card-title');
 titleRow.append(el('strong',firstInvoice(order.invoice_codes)+' · Sale: '+(order.sale_name||'Chưa rõ')),statusBadge(order.status));
 const info=el('div',null,'shipping-card-details');
 const time=String(order.delivery_time||'').trim()||(order.urgent?'GẤP':'Chưa có giờ giao');
 const invoices=String(order.invoice_codes||'').trim();
 info.textContent=[time,invoices,order.customer,order.address].filter(Boolean).join(' · ');
 fragment.append(titleRow,info);
 return fragment;
}
function makeCard(order,fn){
 const card=el('button',null,'order shipping-order-card status-border-'+statusClass(order.status));
 card.type='button';card.append(orderCardContents(order));card.onclick=fn;
 return card;
}
async function login(email,pin){
 const res=await api('POST','/api/login',{email,pin});
 state.token=res.token;sessionStorage.setItem('qbooks_token',res.token);
 await bootstrap();
}
async function loadGoogleSdk(){
 if(window.google?.accounts?.id)return;
 await new Promise((resolve,reject)=>{
  const script=document.createElement('script');
  script.src='https://accounts.google.com/gsi/client';
  script.async=true;script.defer=true;
  script.onload=resolve;script.onerror=()=>reject(Error('Không tải được Google Identity Services. Hãy thử mở bằng Chrome/Safari.'));
  document.head.append(script);
 });
 if(!window.google?.accounts?.id)throw Error('Trình duyệt không hỗ trợ đăng nhập Google.');
}
async function initGoogleSignIn(){
 try{
  const cfg=await api('GET','/api/google/config');
  state.googleClientId=cfg.clientId||null;
  if(!cfg.enabled||!cfg.clientId){
   $('googleStatus').textContent='Google chưa được kết nối. Quản trị cần cấu hình GOOGLE_CLIENT_ID trên Cloudflare Pages.';
   return;
  }
  await loadGoogleSdk();
  window.google.accounts.id.initialize({
   client_id:cfg.clientId,
   ux_mode:'popup',
   auto_select:false,
   callback:async({credential})=>{
    if(!credential)return notice('Google chưa trả thông tin đăng nhập.');
    try{
     $('googleStatus').textContent='Đang kiểm tra tài khoản Google...';
     const result=await api('POST','/api/google/login',{credential});
     if(result.pending){
      $('googleStatus').textContent=result.message;
      return notice(result.message,true);
     }
     if(!result.token)throw Error('Máy chủ chưa cấp phiên đăng nhập.');
     state.token=result.token;
     sessionStorage.setItem('qbooks_token',result.token);
     await bootstrap();
    }catch(e){notice('Đăng nhập Google thất bại: '+e.message);}
    finally{if(!state.user)$('googleStatus').textContent='Tài khoản mới cần quản trị phê duyệt trước khi sử dụng.';}
   }
  });
  $('googleUnavailable').hidden=true;
  window.google.accounts.id.renderButton($('googleSignIn'),{type:'standard',theme:'outline',size:'large',shape:'rectangular',text:'continue_with',width:290});
  $('googleStatus').textContent='Dùng tài khoản Google đã được cấp quyền hoặc đăng ký mới để chờ quản trị duyệt.';
 }catch(e){$('googleStatus').textContent=e.message;}
}
function resetStaffEdit(){
 state.editStaffId=null;
 $('staffForm').reset();
 $('staffForm').elements.email.readOnly=false;
 $('staffForm').elements.role.disabled=false;
 $('saveStaffBtn').textContent='TẠO NHÂN SỰ';
 $('staffForm').elements.role.value='VIEW';
 $('staffForm').elements.role.onchange?.();
}
async function loadStaffUsers(){
 if(!capabilities().admin)return;
 const r=await api('GET','/api/users'),list=$('staffList');
 list.replaceChildren();
 for(const person of r.users||[]){
  const row=button(person.name+' · '+person.email+' · '+(person.active?'HOẠT ĐỘNG':'NGỪNG')+' · '+(person.role==='VIEW'?'VIEW · Chỉ xem':[person.can_pack?'Đóng hàng':'',person.can_ship?'Vận đơn':'',person.can_admin?'Admin':''].filter(Boolean).join('/')),()=>{
   state.editStaffId=person.id;
   const form=$('staffForm');
   form.elements.name.value=person.name;form.elements.email.value=person.email;
   form.elements.email.readOnly=true;form.elements.role.value=person.role;
   form.elements.role.disabled=false;form.elements.pin.value='';
   form.elements.dongHang.checked=!!person.can_pack;form.elements.vanDon.checked=!!person.can_ship;
   form.elements.admin.checked=!!person.can_admin;form.elements.active.checked=!!person.active;
   form.elements.role.onchange();
   $('saveStaffBtn').textContent='LƯU THAY ĐỔI NHÂN SỰ';
   form.scrollIntoView({behavior:'smooth',block:'center'});
  },'order');
  list.append(row);
 }
}
async function loadAdminReport(kind){
 const wrap=$('adminReport');wrap.replaceChildren(el('p','Đang tải '+kind+'...'));
 try{
  const report=await api('GET','/api/admin/data?kind='+encodeURIComponent(kind));
  const table=document.createElement('table');table.className='admin-table';
  const header=document.createElement('tr');
  for(const name of report.headers||[])header.append(el('th',name));
  table.append(header);
  for(const record of report.rows||[]){
   const tr=document.createElement('tr');for(const value of record)tr.append(el('td',String(value??'')));
   table.append(tr);
  }
  wrap.replaceChildren(table);
 }catch(e){wrap.replaceChildren(el('p',e.message));}
}
async function loadPendingGoogle(){
 const container=$('googlePendingList');
 if(!state.user||!capabilities().admin)return;
 try{
  const res=await api('GET','/api/google/pending');
  container.replaceChildren();
  if(!res.registrations.length)return container.append(el('p','Không có đăng ký Google chờ duyệt.'));
  for(const person of res.registrations){
   const row=el('div',null,'order google-pending');
   const info=el('div');
   info.append(el('strong',person.name),meta(person.email),meta(person.existing_user?'Đã có nhân sự: chỉ liên kết Google, giữ nguyên quyền.':'Đăng ký mới: cần chọn vai trò.'),meta('Đăng ký: '+person.requested_at));
   const controls=el('div',null,'google-actions');
   const select=document.createElement('select');
   [['PACKER','Đóng hàng'],['SHIPPER','Vận đơn'],['SALE','Sale']].forEach(([value,title])=>{
    const opt=document.createElement('option');opt.value=value;opt.textContent=title;select.append(opt);
   });
   if(person.existing_user){select.disabled=true;select.title='Tài khoản đã có, sẽ giữ nguyên vai trò.';}
   const approve=button(person.existing_user?'Liên kết Google':'Duyệt',async()=>{
    approve.disabled=true;
    try{
     await api('POST','/api/google/approve',{sub:person.google_sub,role:select.value});
     notice('Đã duyệt tài khoản '+person.email+'.',true);
     await loadPendingGoogle();
    }catch(e){notice(e.message);}finally{approve.disabled=false;}
   },'primary');
   const reject=button('Từ chối',async()=>{
    reject.disabled=true;
    try{await api('POST','/api/google/reject',{sub:person.google_sub});notice('Đã từ chối yêu cầu '+person.email+'.',true);await loadPendingGoogle();}
    catch(e){notice(e.message);}finally{reject.disabled=false;}
   },'secondary');
   controls.append(select,approve,reject);row.append(info,controls);container.append(row);
  }
 }catch(e){notice('Không tải được đăng ký Google: '+e.message);}
}
async function bootstrap(){
 try{
  const r=await api('GET','/api/bootstrap');state.user=r.user;
  $('userInfo').textContent=r.user.name+' · '+r.user.role;
  $('shippingUserBadge').textContent=r.user.name;
  show('loginPage',false);show('appPage',true);$('logoutBtn').hidden=false;
  // Always drop operational data kept by a previous session before showing the new identity.
  state.orders=[];state.overviewData=null;state.selected=null;state.lockedOrderIds.clear();
  const rights=capabilities();
  state.tab=rights.admin||r.user.role==='VIEW'?'overview':rights.pack?'pack':rights.ship?'ship':'sale';
  const requested=new URLSearchParams(window.location.search);
  const target=requested.get('tab'),toAdmin=requested.get('nav')==='admin';
  if(toAdmin&&rights.admin)state.tab='staff';
  else if(['overview','sale','pack','ship'].includes(target)&&((target==='overview'&&(rights.admin||rights.pack||rights.ship||rights.view))||(target==='sale'&&(rights.sale||rights.view))||(target==='pack'&&(rights.pack||rights.view))||(target==='ship'&&(rights.ship||rights.view))))state.tab=target;
  if(target||toAdmin)window.QbookNavigation?.focusOrders();
  renderTabs();switchView();
 }catch(e){state.token='';sessionStorage.removeItem('qbooks_token');show('loginPage',true);show('appPage',false);$('logoutBtn').hidden=true;notice(e.message);}
}
function capabilities(){
 const r=state.user?.rights||{};
 return {pack:!!r.dongHang,ship:!!r.vanDon,admin:!!r.admin,view:state.user?.role==='VIEW',sale:state.user?.role==='SALE'||!!r.admin};
}
const OPERATION_TABS=[['sale','Sale lên đơn','✎'],['pack','Đóng hàng','▣'],['ship','Vận đơn','▤']];
function availableOperationTabs(){
 const r=capabilities();
 return OPERATION_TABS.filter(([key])=>r.view||(key==='sale'?r.sale:key==='pack'?r.pack:r.ship));
}
function isOperationTab(key){return ['sale','pack','ship'].includes(key);}
function renderTabs(){
 const r=capabilities(),operations=availableOperationTabs();
 const orderTabs=[...(r.admin||r.pack||r.ship||r.view?[['overview','Tổng hợp']]:[]),...operations.map(([id,label])=>[id,label])];
 const desktop=$('tabs'),mobile=$('mobileShippingTabs'),inner=$('shippingOperationTabs');
 desktop.replaceChildren();mobile.replaceChildren();inner.replaceChildren();
 if(!window.QbookNavigation)throw Error('Thiếu bộ điều hướng QBOOK');
 window.QbookNavigation.render({
   desktop,mobileTree:$('qbnMobileTree'),drawer:$('qbnDrawer'),toggle:$('qbnToggle'),
   area:state.tab==='staff'?'admin':'orders',activeView:state.tab,orders:orderTabs,admin:r.admin,
   onOrder:key=>tab(key),
   onMedia:key=>{window.location.href='/video.html?view='+encodeURIComponent(key);},
   onAdmin:()=>tab('staff')
 });
 const active=['overview','sale','pack','ship'].includes(state.tab);
 const addMobile=(id,label,icon,fn,isActive)=>{
   const b=button('',fn,isActive?'selected':'');b.classList.add('shipping-mobile-item');
   b.append(el('span',icon,'shipping-mobile-icon'),el('span',label,'shipping-mobile-label'));
   b.setAttribute('aria-label',label);b.setAttribute('aria-current',isActive?'page':'false');mobile.append(b);
 };
 if(orderTabs.length){
   addMobile('orders','Giao hàng','▣',()=>{
     window.QbookNavigation.focusOrders();state.orderMenuExpanded=!state.orderMenuExpanded;
     if(state.orderMenuExpanded){const first=orderTabs.find(x=>x[0]===state.tab)||orderTabs[0];tab(first[0]);}
     else renderTabs();
   },active);
 }
 addMobile('media','Media','◉',()=>window.location.href='/video.html',false);
 if(r.admin)addMobile('admin','Quản trị','⚙',()=>tab('staff'),state.tab==='staff');
 for(const [id,label]of orderTabs){const b=button(label,()=>tab(id),state.tab===id?'selected':'');b.classList.add('shipping-operation-tab');inner.append(b);}
 show('shippingOperationGroup',state.orderMenuExpanded&&active&&orderTabs.length>0);
 const close=$('qbnClose');
 if(close)close.onclick=()=>{window.QbookNavigation.closeDrawer();renderTabs();};
 const drawer=$('qbnDrawer');
 if(drawer)drawer.onclick=e=>{if(e.target===drawer){window.QbookNavigation.closeDrawer();renderTabs();}};
}

function viewOnlyLayout(key){
 const content=$('viewOnlyContent');
 const heading=(label)=>'<section class="view-only-section"><h2>'+label+'</h2><p>Chỉ xem bố cục. Không có dữ liệu hoặc quyền thao tác.</p>';
 const field=(label)=>'<div class="view-only-field"><span>'+label+'</span><div class="view-only-placeholder" aria-hidden="true"></div></div>';
 const exampleCard='<div class="view-only-card"><div class="view-only-placeholder"></div><div class="view-only-placeholder short"></div><small>Không hiển thị thông tin đơn hàng</small></div>';
 const views={
  overview:`<div class="view-only-kpis">${['Tổng số đơn','Chờ đóng hàng','Chờ vận đơn','Đang giao','Hoàn thành'].map(x=>'<div class="view-only-kpi"><small>'+x+'</small><strong>—</strong></div>').join('')}</div>
   ${heading('Danh sách đơn hàng')}<div class="view-only-table"><strong>Mã hóa đơn</strong><strong>Khách hàng</strong><strong>Trạng thái</strong><strong>Hồ sơ ảnh/video</strong></div>
   <div class="view-only-empty">Không có quyền xem dữ liệu đơn hàng, khách hàng hoặc hồ sơ.</div></section>`,
  sale:`${heading('Sale lên đơn')}<div class="view-only-fields">${['Giờ giao / Gấp','Mã hóa đơn','Loại vận chuyển','Tên khách hàng','Số quyển','Địa chỉ','Nhà xe'].map(field).join('')}</div>
   <div class="view-only-disabled">Lưu đơn (không khả dụng)</div></section>
   ${heading('Gộp đơn')}${exampleCard}<div class="view-only-disabled">Gộp đơn (không khả dụng)</div></section>`,
  pack:`${heading('Đơn chờ đóng hàng')}${exampleCard}</section>
   ${heading('Chi tiết đóng hàng')}<div class="view-only-fields">${['Ảnh hóa đơn','Video đóng hàng','Ảnh hàng hóa','Số thùng','Người đóng cùng','Ghi chú'].map(field).join('')}</div>
   <div class="view-only-disabled">Lưu và đóng hàng (không khả dụng)</div></section>`,
  ship:`${heading('Đơn chờ vận đơn')}${exampleCard}</section>
   ${heading('Thông tin vận đơn')}<div class="view-only-fields">${['Loại ship','Người giao','Số điện thoại','Tiền ship','Hàng nặng','Phí bến','Phụ phí','Ảnh bàn giao'].map(field).join('')}</div>
   <div class="view-only-disabled">Lưu vận đơn (không khả dụng)</div></section>`
 };
 content.innerHTML=views[key]||views.overview;
}
function switchView(){
 const key=state.tab,isView=capabilities().view;
 if(isOperationTab(key))state.lastOperationTab=key;
 const title={overview:'Tổng quan chuyển hàng',sale:'Sale lên đơn',pack:'Đóng hàng',ship:'Vận đơn',staff:'Quản trị hệ thống'};
 $('shippingHeading').textContent=title[key]||'Quản lý chuyển hàng';
 $('shippingSubheading').textContent=isView?'Chế độ VIEW – chỉ xem giao diện, không truy cập dữ liệu':
  key==='overview'?'Tiến độ, chứng từ, ảnh và video của từng đơn':'Theo dõi và thực hiện nghiệp vụ QBooks';
 if(isView){
  show('viewOnlyPanel',true);
  for(const id of ['overviewView','ordersView','saleView','staffView','detailView'])show(id,false);
  viewOnlyLayout(key);
  renderTabs();
  return; // Security: VIEW never calls operational endpoints or loads real data.
 }
 show('viewOnlyPanel',false);
 show('overviewView',key==='overview');show('ordersView',key==='pack'||key==='ship');
 show('saleView',key==='sale');show('staffView',key==='staff');show('detailView',false);
 show('newSalePanel',state.user.role!=='SHIPPER');
 renderTabs();
 if(key==='overview')loadOverview().catch(e=>notice('Không đọc được tổng quan: '+e.message));
 if(key==='sale')loadGroupOptions().catch(e=>notice(e.message));
 if(key==='staff'){loadPendingGoogle();loadStaffUsers();refreshGoogleSync();}
 if(key==='pack'||key==='ship')loadOrders().catch(e=>notice(e.message));
}
async function releaseLocks(){
 const ids=[...state.lockedOrderIds];state.lockedOrderIds.clear();
 await Promise.allSettled(ids.map(id=>api('DELETE','/api/orders/'+id+'/lock')));
}
function tab(key){if(state.lockedOrderIds.size)releaseLocks();state.tab=key;state.orderMenuExpanded=key!=='staff';if(key==='staff')window.QbookNavigation?.focusAdmin();else window.QbookNavigation?.focusOrders();switchView();}
const MEDIA_LABELS={ANH_HOA_DON:'Ảnh hóa đơn',VIDEO_DONG_HANG:'Video đóng hàng',HANG_HOA:'Ảnh hàng hóa',GIAO_HANG:'Ảnh bàn giao'};
const LINK_LABELS=[['packing_folder_url','Thư mục đóng hàng'],['shipping_folder_url','Thư mục vận đơn'],['invoice_folder_url','Thư mục ảnh hóa đơn'],['video_folder_url','Thư mục video'],['goods_folder_url','Thư mục ảnh hàng hóa']];
function safeDriveUrl(value){
 try{const u=new URL(String(value||''));return u.protocol==='https:'&&['drive.google.com','docs.google.com'].includes(u.hostname)?u.href:null}catch{return null}
}
async function downloadMedia(id,filename,btn){
 const old=btn.textContent;btn.disabled=true;btn.textContent='Đang lấy tệp…';
 try{
  const response=await fetch('/api/uploads/'+encodeURIComponent(id)+'/file',{headers:{authorization:'Bearer '+state.token}});
  if(!response.ok){const error=await response.json().catch(()=>({}));throw Error(error.error||'Không thể đọc tệp.');}
  const blob=await response.blob(),link=URL.createObjectURL(blob),a=document.createElement('a');
  a.href=link;a.download=filename||'hoso';document.body.append(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(link),60000);
 }catch(e){notice('Không tải được ảnh/video: '+e.message);}
 finally{btn.disabled=false;btn.textContent=old;}
}
function addCopyLink(container,url){
 const copy=button('Sao chép link',async()=>{
  try{
   await navigator.clipboard.writeText(url);
   notice('Đã sao chép liên kết Google Drive.',true);
  }catch{
   const dialog=window.prompt('Sao chép đường dẫn Google Drive:',url);
   if(dialog!==null)notice('Có thể sao chép đường dẫn hiển thị trên màn hình.');
  }
 },'overview-copy-link');
 copy.title='Sao chép liên kết tệp để gửi qua Zalo, email hoặc trang tính';
 container.append(copy);
}
function fileDriveUrl(id){
 if(!/^[A-Za-z0-9_-]{10,200}$/.test(String(id||'')))return null;
 return 'https://drive.google.com/file/d/'+encodeURIComponent(id)+'/view';
}
function driveFolderId(url){
 try{
  const parsed=new URL(url);
  if(parsed.protocol!=='https:'||parsed.hostname!=='drive.google.com')return null;
  return parsed.pathname.match(/^\/drive\/folders\/([A-Za-z0-9_-]{10,200})\/?$/)?.[1]||null;
 }catch{return null;}
}
function driveFolderToken(callback){
 const token=state.driveBrowseToken;
 if(token&&Date.now()<state.driveBrowseUntil)return Promise.resolve(callback(token)).catch(e=>$('drivePreviewNotice').textContent=e.message);
 if(!window.google?.accounts?.oauth2||!state.googleClientId)
  throw Error('Google chưa sẵn sàng. Tải lại trang hoặc đăng nhập Chrome/Safari.');
 const scope='https://www.googleapis.com/auth/drive.metadata.readonly';
 const client=window.google.accounts.oauth2.initTokenClient({
  client_id:state.googleClientId,scope,
  callback:response=>{
   if(response.error||!response.access_token||!window.google.accounts.oauth2.hasGrantedAllScopes(response,scope)){
    $('drivePreviewNotice').textContent='Google chưa cấp quyền xem danh sách ảnh/video trong Drive.';
    return;
   }
   state.driveBrowseToken=response.access_token;
   state.driveBrowseUntil=Date.now()+Math.max(60,Number(response.expires_in||3600)-60)*1000;
   callback(response.access_token).catch(e=>$('drivePreviewNotice').textContent=e.message);
  },
  error_callback:e=>$('drivePreviewNotice').textContent='Không thể xác thực Drive: '+(e.type||'Cửa sổ bị đóng')
 });
 client.requestAccessToken({prompt:'consent'});
}
function displayDrivePreview(file){
 const box=$('drivePreviewMedia');box.replaceChildren();
 if(!file?.id)return;
 const iframe=document.createElement('iframe');
 iframe.src='https://drive.google.com/file/d/'+encodeURIComponent(file.id)+'/preview';
 iframe.title='Xem '+file.name;
 iframe.loading='lazy';iframe.referrerPolicy='no-referrer';
 iframe.setAttribute('allow','autoplay; fullscreen');
 box.append(iframe);
}
async function readDriveFolderFiles(folderId,token){
 let pageToken='',results=[];
 do{
  const query=new URLSearchParams({
   q:"'"+folderId+"' in parents and trashed = false",
   fields:'nextPageToken,files(id,name,mimeType,webViewLink,size)',
   pageSize:'100',
   spaces:'drive',
   supportsAllDrives:'true',
   includeItemsFromAllDrives:'true'
  });
  if(pageToken)query.set('pageToken',pageToken);
  const response=await fetch('https://www.googleapis.com/drive/v3/files?'+query.toString(),{
   headers:{Authorization:'Bearer '+token},cache:'no-store'
  });
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw Error(data.error?.message||'Không được quyền xem thư mục Google Drive này.');
  results.push(...(data.files||[]));
  pageToken=data.nextPageToken||'';
  if(results.length>=300)break;
 }while(pageToken);
 return results;
}
function showDriveFolderPreview(folderUrl,label){
 const id=driveFolderId(folderUrl);
 if(!id)return notice('Liên kết thư mục Google Drive không hợp lệ.');
 const dialog=$('drivePreviewDialog'),noticeNode=$('drivePreviewNotice');
 $('drivePreviewTitle').textContent=label;
 $('drivePreviewFiles').replaceChildren();$('drivePreviewMedia').replaceChildren();
 noticeNode.textContent='Đang kết nối Google Drive để lấy đúng tệp ảnh/video…';
 if(!dialog.open)dialog.showModal();
 try{
  driveFolderToken(async(token)=>{
   const files=(await readDriveFolderFiles(id,token)).filter(file=>file.mimeType!=='application/vnd.google-apps.folder');
   const list=$('drivePreviewFiles');list.replaceChildren();
   if(!files.length){
    noticeNode.textContent='Thư mục hiện chưa có tệp. Không có ảnh/video để xem.';
    const link=el('a','Mở thư mục Drive','overview-link');
    link.href=folderUrl;link.target='_blank';link.rel='noopener noreferrer';list.append(link);
    return;
   }
   noticeNode.textContent='Có '+files.length+' tệp trong thư mục. Chọn tệp để xem ngay hoặc mở Google Drive.';
   for(const file of files){
    if(!/^[A-Za-z0-9_-]{10,200}$/.test(file.id||''))continue;
    const row=el('div',null,'drive-preview-file');
    const preview=button(file.name||'Xem tệp',()=>displayDrivePreview(file),'overview-link');
    const direct=el('a','Mở trên Drive','overview-link');
    direct.href=fileDriveUrl(file.id);
    direct.target='_blank';direct.rel='noopener noreferrer';
    row.append(preview,direct);addCopyLink(row,fileDriveUrl(file.id));list.append(row);
   }
   displayDrivePreview(files[0]);
  });
 }catch(e){noticeNode.textContent=e.message;}
}
function makeDirectDriveLink(file,label){
 const url=fileDriveUrl(file.id);
 if(!url)return null;
 const item=el('div',null,'drive-direct-item');
 const link=el('a',label||file.name||'Mở tệp','overview-link');
 link.href=url;link.target='_blank';link.rel='noopener noreferrer';
 link.title='Bấm để mở trực tiếp tệp này trên Google Drive';
 item.append(link);
 addCopyLink(item,url);
 return item;
}
function showDriveFilesInline(host,folderUrl,folderLabel){
 const folderId=driveFolderId(folderUrl);
 if(!folderId)return notice('Không có mã thư mục Drive hợp lệ.');
 host.replaceChildren(el('span','Đang lấy đường dẫn từng tệp Drive…','muted'));
 const load=async(token)=>{
  const files=(await readDriveFolderFiles(folderId,token))
   .filter(f=>f.mimeType!=='application/vnd.google-apps.folder');
  host.replaceChildren();
  if(!files.length){
   host.append(el('span','Thư mục chưa có tệp','muted'));
   return;
  }
  for(const f of files){
   const direct=makeDirectDriveLink(f,(folderLabel||'Hồ sơ')+' · '+(f.name||'Tệp'));
   if(direct)host.append(direct);
  }
  if(!host.children.length)host.append(el('span','Không đọc được mã các tệp','muted'));
 };
 try{
  driveFolderToken(load);
 }catch(e){host.replaceChildren(el('span','Không thể đọc Drive: '+e.message,'muted'));}
}
function addMediaLinks(container,order){
 const media=order.media||[];
 const unique=new Set();
 const appendDrive=(label,url,copyable=false)=>{
  if(!url||unique.has(url+'|'+label))return;
  unique.add(url+'|'+label);
  const a=el('a',label,'overview-link');
  a.href=url;a.target='_blank';a.rel='noopener noreferrer';
  a.title=copyable?'Mở đúng tệp đã lưu trên Google Drive':'Mở thư mục trên Google Drive';
  container.append(a);
  if(copyable)addCopyLink(container,url);
 };
 for(const item of media){
  const link=fileDriveUrl(item.drive_file_id);
  if(link)appendDrive((MEDIA_LABELS[item.stage]||'Tệp')+' · '+(item.filename||'Mở tệp'),link,true);
  else{
   const b=button((MEDIA_LABELS[item.stage]||'Tệp')+' · R2',()=>downloadMedia(item.id,item.filename,b),'overview-link');
   b.title='Tệp chưa chuyển lên Drive, chỉ có thể tải từ R2: '+(item.filename||'');
   container.append(b);
  }
 }
 for(const [key,label] of LINK_LABELS){
  const href=safeDriveUrl(order[key]);
  if(!href)continue;
  if(driveFolderId(href)){
   const names={packing_folder_url:'Hồ sơ đóng hàng',shipping_folder_url:'Ảnh giao hàng',
    invoice_folder_url:'Ảnh hóa đơn',video_folder_url:'Video đóng hàng',goods_folder_url:'Ảnh hàng hóa'};
   const holder=el('div',null,'drive-folder-item');
   const details=el('div',null,'drive-inline-files');
   const open=button('Lấy link '+(names[key]||label),()=>{
    showDriveFilesInline(details,href,names[key]||label);
   },'overview-link');
   open.title='Đọc từng ảnh/video trên Drive để mở trực tiếp và sao chép link từng tệp';
   const folder=el('a','Mở thư mục','overview-link');
   folder.href=href;folder.target='_blank';folder.rel='noopener noreferrer';
   holder.append(open,folder,details);
   container.append(holder);
  }else appendDrive(label,href,true);
 }
 if(!container.children.length)container.append(el('span','Chưa có hồ sơ','muted'));
}
function appendOverviewRow(order,table,cardHolder){
 const code=order.invoice_codes||order.id;
 const tr=document.createElement('tr');
 const orderTd=document.createElement('td');orderTd.append(el('strong',code),el('small',order.id));
 const customer=document.createElement('td');customer.append(el('strong',order.customer||'—'),el('small','Sale: '+(order.sale_name||'—')));
 const status=document.createElement('td');status.append(statusBadge(order.status));
 const links=document.createElement('td');links.className='overview-media-links';addMediaLinks(links,order);
 const detail=document.createElement('td');
 const view=button('Xem đơn',()=>showOrderSummary(order),'secondary');detail.append(view);
 tr.append(orderTd,customer,status,links,detail);table.append(tr);
 const card=el('article',null,'overview-mobile-card');
 card.append(el('strong',code),el('small',(order.customer||'—')+' · '+(order.sale_name||'—')),statusBadge(order.status));
 const linksMobile=el('div',null,'overview-media-links');addMediaLinks(linksMobile,order);card.append(linksMobile);
 card.append(button('Chi tiết đơn',()=>showOrderSummary(order),'secondary'));cardHolder.append(card);
}
function showOrderSummary(order){
 const modal=$('orderSummaryDialog');
 const info=$('orderSummaryInfo');info.replaceChildren();
 for(const [label,val] of [['Mã đơn',order.id],['Mã hóa đơn',order.invoice_codes],['Khách hàng',order.customer],['Sale',order.sale_name],['Trạng thái',order.status],['Số quyển',order.quantity],['Nhóm vận đơn',order.group_id],['Nhà xe',order.carrier||order.transport]]){
  const row=el('div',null,'summary-field');row.append(el('strong',label),el('span',String(val??'—')));info.append(row);
 }
 const media=$('orderSummaryMedia');media.replaceChildren();addMediaLinks(media,order);
 if(typeof modal.showModal==='function')modal.showModal();else modal.hidden=false;
}
function renderOverview(){
 const r=state.overviewData;if(!r)return;
 const kpis=$('shippingKpis');kpis.replaceChildren();
 const cards=[['Tổng số đơn',r.totals.total,'all'],['Chờ đóng hàng',r.totals.waitingPacking,'pack'],['Chờ vận đơn',r.totals.waitingShipping,'ship'],['Đang giao',r.totals.moving,'moving'],['Hoàn thành',r.totals.completed,'done']];
 for(const [label,num,style] of cards){
  const card=el('div',null,'shipping-kpi '+style);card.append(el('small',label),el('strong',Number(num||0).toLocaleString('vi-VN')));kpis.append(card);
 }
 const term=$('overviewSearch').value.trim().toLocaleLowerCase('vi'),status=$('overviewStatus').value;
 const rows=r.orders.filter(o=>(!status||o.status===status)&&(!term||[o.id,o.invoice_codes,o.customer,o.sale_name].some(x=>String(x||'').toLocaleLowerCase('vi').includes(term))));
 const table=$('overviewRows'),cardsHolder=$('overviewCards');table.replaceChildren();cardsHolder.replaceChildren();
 if(rows.length){for(const o of rows)appendOverviewRow(o,table,cardsHolder);}
 else{const td=el('td','Không tìm thấy đơn phù hợp.');td.colSpan=5;const tr=el('tr');tr.append(td);table.append(tr);cardsHolder.append(el('p','Không có đơn phù hợp.'));}
 $('overviewHint').textContent='Đang hiển thị '+rows.length+'/'+r.orders.length+' đơn. Liên kết Drive mở trong tab mới; ảnh/video trên R2 được tải qua phiên đăng nhập.';
}
async function loadOverview(){
 $('overviewHint').textContent='Đang đọc dữ liệu đơn và hồ sơ…';
 const r=await api('GET','/api/shipping/overview');
 state.overviewData=r;renderOverview();
}
async function loadOrders(){
 const q=$('search').value.trim(),status=state.tab==='pack'?'CHỜ ĐÓNG HÀNG':state.tab==='ship'?'CHỜ VẬN ĐƠN':'';
 const r=await api('GET','/api/orders?q='+encodeURIComponent(q)+'&status='+encodeURIComponent(status));
 state.orders=r.orders;
 $('listTitle').textContent=state.tab==='pack'?'Đơn chờ đóng hàng':state.tab==='ship'?'Đơn chờ vận đơn':statusTitle[state.user.role]||'Đơn hàng';
 const list=$('orderList');list.replaceChildren();
 if(!r.orders.length)list.append(el('p','Chưa có đơn phù hợp.'));
 for(const o of r.orders)list.append(makeCard(o,()=>openOrder(o)));
}
async function loadPackingHelpers(){
 const list=$('packingHelpers');list.replaceChildren();
 try{
  const result=await api('GET','/api/packing-people');
  for(const person of result.people||[]){
   if(person.email===state.user.email)continue;
   const label=el('label',null,'check');
   const input=document.createElement('input');input.type='checkbox';input.className='packHelperChoice';input.value=person.name;
   label.append(input,document.createTextNode(person.name));list.append(label);
  }
 }catch(e){list.append(el('p','Chưa tải được danh sách nhân sự: '+e.message));}
}
async function openOrder(order){
 if(state.saving)return;
 const r=capabilities(),pack=order.status==='CHỜ ĐÓNG HÀNG'&&r.pack,ship=order.status==='CHỜ VẬN ĐƠN'&&r.ship;
 if(!pack&&!ship)return notice('Không có quyền thực hiện với đơn này.');
 try{
  await releaseLocks();
  await api('POST','/api/orders/'+order.id+'/lock',{stage:pack?'DONG_HANG':'VAN_DON'});
  state.lockedOrderIds.add(order.id);
 }catch(e){return notice('Không lấy được khóa đơn: '+e.message);}
 state.selected=order;
 show('ordersView',false);show('saleView',false);show('detailView',true);
 const n=$('selectedOrder');n.replaceChildren(el('h2',order.title),el('p','Khách: '+order.customer+' · Mã HĐ: '+order.invoice_codes),
  el('p','Vận chuyển: '+(order.transport||'')+' · Nhà xe: '+(order.carrier||'')+' · Nội dung: '+(order.original_content||'')));
 show('packControls',pack);show('shipControls',ship);show('progressWrap',false);
 $('boxes').value=order.boxes||0;$('packNote').value=order.packing_note||'';
 if(pack)await loadPackingHelpers();
 if(ship){
  $('shippingBoxes').value=order.boxes||0;
  $('shippingType').value=order.shipping_type||'';
  $('shippingPhone').value=order.shipping_phone||'';
  $('shippingPerson').value=order.shipping_person||'';
  $('shippingFee').value=order.shipping_fee||0;
  $('heavyFee').value=order.heavy_fee||0;
  $('terminalFee').value=order.terminal_fee||0;
  $('extraFee').value=order.extra_fee||0;
  $('shippingNote').value=order.shipping_note||'';
  $('shippingStatus').value='HOÀN THÀNH';
  updateShippingTotal();
  showShippingGroup(order);
 }
 notice('');
}
function progress(file,done,total){
 $('progressWrap').hidden=false;$('uploadLabel').textContent='Đang tải: '+file;
 $('uploadProgress').value=Math.min(100,Math.round(done/total*100));
 $('uploadDetail').textContent=Math.round(done/1048576)+' / '+Math.round(total/1048576)+' MB đã ghi nhận tại R2';
}
function fingerprint(orderId,stage,file){return 'qbooks_upload_v1|'+orderId+'|'+stage+'|'+file.name+'|'+file.size+'|'+file.lastModified}
async function videoDuration(file){
 return new Promise((resolve,reject)=>{
  const node=document.createElement('video'),url=URL.createObjectURL(file);
  const timer=setTimeout(()=>finish(Error('Không đọc được thời lượng video.')),20000);
  let done=false;
  function finish(error){if(done)return;done=true;clearTimeout(timer);node.removeAttribute('src');node.load();URL.revokeObjectURL(url);error?reject(error):resolve();}
  node.preload='metadata';
  node.onloadedmetadata=()=>finish(!Number.isFinite(node.duration)||node.duration>3601?Error('Video cần dài tối đa 60 phút.'):null);
  node.onerror=()=>finish(Error('Không đọc được định dạng video.'));
  node.src=url;
 });
}
async function uploadOne(orderId,stage,file){
 const video=stage==='VIDEO_DONG_HANG',max=video?2*1024*1024*1024:25*1024*1024;
 if(!file.size||file.size>max)throw Error('Tệp '+file.name+' vượt giới hạn '+(video?'2 GB':'25 MB'));
 if(video)await videoDuration(file);
 const key=fingerprint(orderId,stage,file);let id=localStorage.getItem(key);
 let info;
 if(id){try{info=await api('GET','/api/uploads/'+id);if(info.bytes!==undefined&&info.bytes!==file.size)id=null}
 catch(e){if(/Không tìm thấy phiên tải/.test(e.message))id=null;else throw e}}
 if(!id){
  const result=await api('POST','/api/uploads',{orderId,stage,filename:file.name,contentType:file.type|| (video?'video/mp4':'image/jpeg'),size:file.size});
  id=result.id;localStorage.setItem(key,id);info={status:'UPLOADING',chunkSize:result.chunkSize,parts:[]};
 }
 if(info.status==='COMPLETE'){localStorage.removeItem(key);progress(file.name,file.size,file.size);return id}
 if(!video){
  progress(file.name,0,file.size);await api('PUT','/api/uploads/'+id,file,true);
  progress(file.name,file.size,file.size);localStorage.removeItem(key);return id;
 }
 const chunk=info.chunkSize||CHUNK_BYTES;
 const count=Math.ceil(file.size/chunk),parts=new Set((info.parts||[]).map(p=>p.part_number));
 let done=Math.min(file.size,info.parts.reduce((sum,p)=>sum+p.bytes,0));
 progress(file.name,done,file.size);
 for(let n=1;n<=count;n++){
  if(parts.has(n))continue;
  const start=(n-1)*chunk,end=Math.min(start+chunk,file.size),piece=file.slice(start,end);
  let retries=0;
  while(true){
   try{await api('PUT','/api/uploads/'+id+'/parts/'+n,piece,true);break;}
   catch(e){if(++retries>=4)throw Error('Tải video gián đoạn ở phần '+n+'/'+count+': '+e.message);await new Promise(r=>setTimeout(r,900*retries));}
  }
  done+=piece.size;progress(file.name,done,file.size);
 }
 await api('POST','/api/uploads/'+id+'/complete',{});
 localStorage.removeItem(key);
 progress(file.name,file.size,file.size);
 return id;
}
async function uploadSelection(orderId,items){
 let index=0,total=items.length;
 const uploaded=[];
 for(const [stage,file] of items){
  $('uploadLabel').textContent='Tệp '+(++index)+'/'+total+': '+file.name;
  const id=await uploadOne(orderId,stage,file);
  uploaded.push({id,stage,filename:file.name});
 }
 return uploaded;
}
function v(id){return $(id).value.trim()}
function updateShippingTotal(){
 const fields=['shippingFee','heavyFee','terminalFee','extraFee'];
 const total=fields.reduce((sum,id)=>sum+(Number($(id).value)||0),0);
 $('shippingTotal').textContent=new Intl.NumberFormat('vi-VN').format(total)+' đ';
}
function showShippingGroup(order){
 const group=order.group_id;
 const siblings=group?state.orders.filter(o=>o.group_id===group&&o.status==='CHỜ VẬN ĐƠN'):[];
 show('shipGroupArea',siblings.length>1);
 const list=$('shipGroupMembers');list.replaceChildren();
 for(const o of siblings){
  const row=el('label',null,'check');
  const input=document.createElement('input');input.type='checkbox';input.className='shippingGroupCheck';input.value=o.id;input.checked=o.id===order.id;
  row.append(input,document.createTextNode(o.title));list.append(row);
 }
}
function operationalDriveStatus(id,text){
 const node=$(id);if(node)node.textContent=text;
}
function connectOperationalDrive(statusId){
 if(!state.googleClientId||!window.google?.accounts?.oauth2){
  operationalDriveStatus(statusId,'Google chưa sẵn sàng. Tải lại QBooks và kiểm tra cấu hình Client ID.');
  return;
 }
 const scope='https://www.googleapis.com/auth/drive';
 const oauth=window.google.accounts.oauth2.initTokenClient({
  client_id:state.googleClientId,scope,
  callback:response=>{
   if(response.error||!response.access_token||!window.google.accounts.oauth2.hasGrantedAllScopes(response,scope)){
    operationalDriveStatus(statusId,'Chưa cấp quyền tạo tệp trên Google Drive.');
    return;
   }
   state.operationalDriveToken=response.access_token;
   state.operationalDriveUntil=Date.now()+(Math.max(60,Number(response.expires_in)||3600)-45)*1000;
   operationalDriveStatus(statusId,'Đã kết nối Drive. Khi bấm Lưu, hồ sơ mới sẽ được chuyển lên Drive và tạo liên kết sao chép.');
  },
  error_callback:error=>operationalDriveStatus(statusId,'Không mở được Google: '+(error.type||'vui lòng thử lại'))
 });
 oauth.requestAccessToken({prompt:'consent'});
}
async function mirrorOperationalFiles(uploads,statusId){
 const result={synced:0,pending:0,files:[],errors:[]};
 const token=state.operationalDriveToken;
 if(!uploads.length)return result;
 if(!token||Date.now()>=state.operationalDriveUntil){
  operationalDriveStatus(statusId,'Tệp đã lưu trên R2. Chưa có quyền Google Drive nên chưa tạo liên kết chia sẻ.');
  result.pending=uploads.length;
  result.files=uploads.map(f=>({...f,drive_file_id:null}));
  return result;
 }
 for(const f of uploads){
  try{
   operationalDriveStatus(statusId,'Đang chuyển '+f.filename+' lên Drive…');
   let data=await api('POST','/api/sync/drive/init',{uploadId:f.id,googleAccessToken:token});
   let steps=0;
   while(!data.done){
    if(Date.now()>=state.operationalDriveUntil)throw Error('Phiên Google hết hạn, cần kết nối lại để tiếp tục.');
    data=await api('POST','/api/sync/drive/chunk',{uploadId:f.id,googleAccessToken:token});
    const pct=data.total?Math.floor(data.offset*100/data.total):0;
    operationalDriveStatus(statusId,'Đang chuyển '+f.filename+': '+pct+'%');
    if(++steps>350)throw Error('Tệp lớn vượt quá lượt chuyển, cần tiếp tục từ phần còn lại.');
   }
   if(!data.fileId)throw Error('Drive chưa trả mã tệp để tạo liên kết.');
   result.synced++;
   result.files.push({...f,drive_file_id:data.fileId});
  }catch(e){
   result.pending++;result.errors.push(f.filename+': '+e.message);
   result.files.push({...f,drive_file_id:null});
  }
 }
 const summary='Đã lưu trên Drive '+result.synced+'/'+uploads.length+' tệp.'+
 (result.pending?' Còn '+result.pending+' tệp trên R2 cần đồng bộ tiếp.':' Có thể mở hoặc sao chép liên kết.');
 operationalDriveStatus(statusId,summary);
 return result;
}
function showSavedMediaLinks(order,result,newStatus){
 if(!result.files.length)return;
 const summary={...order,status:newStatus,media:result.files};
 showOrderSummary(summary);
}
async function savePack(){
 if(state.saving||!state.selected)return;
 const id=state.selected.id,uploads=[];
 for(const f of $('invoicePics').files)uploads.push(['ANH_HOA_DON',f]);
 for(const f of $('goodsPics').files)uploads.push(['HANG_HOA',f]);
 for(const f of $('videos').files)uploads.push(['VIDEO_DONG_HANG',f]);
 setBusy(true);
 try{
  notice('Đang tải hồ sơ R2 (nếu có), sau đó lưu đóng hàng...');
  const uploaded=await uploadSelection(id,uploads);
  // R2 is the durable source. Background Cron mirrors files without staff Google permissions.
  const nguoiDongCung=$all('.packHelperChoice:checked').map(x=>x.value);
  await api('POST','/api/orders/'+id+'/pack',{boxes:Number($('boxes').value),nguoiDongCung,note:$('packNote').value});
  state.lockedOrderIds.delete(id);
  notice('Đã lưu đóng hàng. '+uploaded.length+' tệp được giữ an toàn trên R2 và xếp hàng chờ tự chuyển Drive. Dữ liệu Sheets đồng bộ riêng.',true);
  show('detailView',false);show('ordersView',true);await loadOrders();
 }catch(e){notice('Chưa lưu đóng hàng: '+e.message);}
 finally{setBusy(false);}
}
async function saveShip(){
 if(state.saving||!state.selected)return;
 setBusy(true);
 try{
  const id=state.selected.id,groupIds=$all('.shippingGroupCheck:checked').map(x=>x.value);
  const orderIds=groupIds.length?[...new Set(groupIds.concat(id))]:[id];
  const loaiShip=v('shippingType'),tenShip=v('shippingPerson'),sdtShip=v('shippingPhone');
  if(!['Ship ruột','Kiot','App'].includes(loaiShip))throw Error('Vui lòng chọn loại ship.');
  if(loaiShip==='Ship ruột'&&!tenShip)throw Error('Tên ship bắt buộc khi chọn Ship ruột.');
  const costs=['shippingFee','heavyFee','terminalFee','extraFee'].map(id=>Number($(id).value)||0);
  if(costs.some(x=>!Number.isSafeInteger(x)||x<0))throw Error('Các khoản phí phải là số nguyên không âm.');
  for(const other of orderIds.filter(x=>x!==id)){
   await api('POST','/api/orders/'+other+'/lock',{stage:'VAN_DON'});
   state.lockedOrderIds.add(other);
  }
  const uploads=[...$('shippingPics').files].map(f=>['GIAO_HANG',f]);
  notice('Đang tải ảnh bàn giao (nếu có) và lưu vận đơn...');
  const uploaded=await uploadSelection(id,uploads);
  await api('POST','/api/shipments',{orderIds,loaiShip,tenShip,sdtShip,
   tienShip:costs[0],hangNang:costs[1],phiBen:costs[2],phuPhi:costs[3],status:v('shippingStatus'),note:v('shippingNote')});
  for(const key of orderIds)state.lockedOrderIds.delete(key);
  notice('Đã lưu vận đơn. '+uploaded.length+' tệp đã lưu R2 và xếp hàng chờ tự đồng bộ Drive. Dữ liệu Sheets đồng bộ riêng.',true);
  show('detailView',false);show('ordersView',true);await loadOrders();
 }catch(e){notice('Chưa lưu vận đơn: '+e.message)}
 finally{setBusy(false)}
}
async function loadGroupOptions(){
 try{
  const r=await api('GET','/api/orders');const list=$('groupList');list.replaceChildren();
  const options=r.orders.filter(o=>state.user.role==='SHIPPER'?o.status==='CHỜ VẬN ĐƠN':['CHỜ ĐÓNG HÀNG','CHỜ VẬN ĐƠN'].includes(o.status)&&!o.group_id);
  for(const o of options){
   const row=el('label',null,'order shipping-order-card shipping-group-card status-border-'+statusClass(o.status));
   const ck=document.createElement('input');ck.type='checkbox';ck.className='groupCheck';ck.value=o.id;
   ck.setAttribute('aria-label','Chọn gộp đơn '+firstInvoice(o.invoice_codes));
   const details=el('div',null,'shipping-group-details');details.append(orderCardContents(o));
   row.append(ck,details);list.append(row);
  }
  if(!options.length)list.append(el('p','Không có đơn chưa gộp.'));
 }catch(e){notice(e.message)}
}
$('loginForm').addEventListener('submit',async e=>{e.preventDefault();const b=Object.fromEntries(new FormData(e.target));try{await login(b.email,b.pin)}catch(error){notice(error.message)}});
$('logoutBtn').onclick=async()=>{await releaseLocks();try{await api('POST','/api/logout',{})}catch{}state.token='';state.user=null;state.orders=[];state.overviewData=null;state.selected=null;state.sheetReadToken=null;state.sheetReadUntil=0;state.googleWriteToken=null;state.googleWriteUntil=0;state.operationalDriveToken=null;state.operationalDriveUntil=0;state.driveBrowseToken=null;state.driveBrowseUntil=0;state.googleDriveRoot=null;sessionStorage.removeItem('qbooks_token');show('loginPage',true);show('appPage',false);$('logoutBtn').hidden=true;};
$('search').addEventListener('input',()=>{loadOrders().catch(e=>notice(e.message))});
$('reloadBtn').onclick=()=>loadOrders().catch(e=>notice(e.message));
$('backBtn').onclick=()=>tab(state.tab);
$('savePacking').onclick=savePack;$('saveShipping').onclick=saveShip;
['shippingFee','heavyFee','terminalFee','extraFee'].forEach(id=>$(id).addEventListener('input',updateShippingTotal));
$('saleForm').addEventListener('submit',async e=>{e.preventDefault();const f=Object.fromEntries(new FormData(e.target));f.urgent=!!e.target.querySelector('[name=urgent]').checked;try{await api('POST','/api/orders',f);e.target.reset();notice('Đã tạo đơn Sale.',true);await loadGroupOptions();await loadOrders()}catch(err){notice(err.message)}});
$('createGroup').onclick=async()=>{const orderIds=$all('.groupCheck:checked').map(c=>c.value);try{const r=await api('POST','/api/groups',{orderIds});notice('Đã tạo nhóm '+r.groupId,true);await loadGroupOptions()}catch(e){notice(e.message)}};
$('staffForm').addEventListener('submit',async e=>{e.preventDefault();const f=e.target;const data=Object.fromEntries(new FormData(f));data.dongHang=f.elements.dongHang.checked;data.vanDon=f.elements.vanDon.checked;data.admin=f.elements.admin.checked;data.active=f.elements.active.checked;if(!state.editStaffId&&!data.pin)return notice('Nhân sự mới cần mã PIN 3–8 số.');if(data.role==='VIEW'){data.dongHang=false;data.vanDon=false;data.admin=false;}try{const r=state.editStaffId?await api('PATCH','/api/users/'+state.editStaffId,data):await api('POST','/api/users',data);notice('Đã lưu nhân sự '+r.id,true);resetStaffEdit();await loadStaffUsers();await loadAdminReport('STAFF');}catch(err){notice(err.message)}});
const SHEET_ID='1TSuK6EF2yK8Qb9ZAU1v98VhzekrjX2SKkIDmR7OXMiw';
async function googleRead(url,token){
 const res=await fetch(url,{headers:{Authorization:'Bearer '+token},cache:'no-store'});
 let data;try{data=await res.json()}catch{throw Error('Google trả dữ liệu không hợp lệ.');}
 if(!res.ok)throw Error(data.error?.message||'Google API trả lỗi '+res.status);
 return data;
}
function sourceAuth(scope,done,statusId='legacyStatus'){
 const status=$(statusId);
 if(!capabilities().admin)return notice('Chỉ Admin được kết nối dữ liệu Google.');
 if(!state.googleClientId||!window.google?.accounts?.oauth2){
  status.textContent='Google chưa sẵn sàng. Hãy tải lại trang hoặc kiểm tra Client ID.';
  return;
 }
 const client=window.google.accounts.oauth2.initTokenClient({
  client_id:state.googleClientId,scope,
  callback:response=>{
   if(response.error||!response.access_token){status.textContent='Google không cấp quyền: '+(response.error||'Đã hủy');return;}
   if(!window.google.accounts.oauth2.hasGrantedAllScopes(response,...scope.trim().split(/\s+/))){
    status.textContent='Google chưa cấp đủ các quyền được yêu cầu. Kiểm tra màn hình đồng ý Google Cloud.';return;
   }
   Promise.resolve(done(response.access_token,Number(response.expires_in)||3600)).catch(e=>{
    status.textContent='Không đọc được dữ liệu Google: '+e.message;
   });
  },
  error_callback:e=>{status.textContent='Cửa sổ Google bị đóng/chặn: '+e.type;}
 });
 // Phải gọi từ sự kiện nhấn nút, tránh popup bị trình duyệt chặn.
 client.requestAccessToken({prompt:'consent'});
}
function connectGoogleSheets(){
 sourceAuth('https://www.googleapis.com/auth/spreadsheets.readonly',async(token,expiresIn)=>{
  state.sheetReadToken=token;
  state.sheetReadUntil=Date.now()+Math.max(60,expiresIn-120)*1000;
  const status=$('legacyStatus');
  status.textContent='Đang đọc Google Sheets bằng quyền Google của anh...';
  const ranges=['DATA_TONG!A1:AP1000','DM_NHAN_SU!A1:F300','CAU_HINH!A1:C50','SALE_GOP_VAN_DON!A1:B100'];
  const params=ranges.map(v=>'ranges='+encodeURIComponent(v)).join('&');
  const payload=await googleRead('https://sheets.googleapis.com/v4/spreadsheets/'+SHEET_ID+'/values:batchGet?'+params+'&valueRenderOption=FORMATTED_VALUE',token);
  const values=(payload.valueRanges||[]).map(v=>v.values||[]);
  const rows=(values[0]||[]).slice(1).filter(r=>r[0]);
  const staff=(values[1]||[]).slice(1).filter(r=>r[0]);
  const config=(values[2]||[]).slice(1);
  state.googleDriveRoot=(config.find(r=>r[0]==='ROOT_FOLDER_ID')||[])[1]||'';
  const groups=(values[3]||[]).slice(1).filter(r=>r[0]);
  const states={};
  for(const r of rows){const k=r[23]||'(trống)';states[k]=(states[k]||0)+1;}
  const grouped=rows.filter(r=>r[37]).length;
  const combined=rows.filter(r=>String(r[3]||'').includes(',')).length;
  status.textContent='Đã đọc CHỈ ĐỌC: '+rows.length+' đơn, '+staff.length+' nhân sự (không đọc PIN), '+groups.length+' lựa chọn gộp. '+Object.entries(states).map(([k,n])=>k+': '+n).join(' · ')+'. Đơn có nhóm: '+grouped+', nhiều mã hóa đơn: '+combined+'. D1 và Google Sheets chưa bị sửa.';
  const list=$('legacyPreview');list.replaceChildren();
  for(const r of rows.slice(0,50)){
   const item=el('div',null,'order');item.append(el('div',[r[0],r[3],r[5]].filter(Boolean).join(' · ')),el('span',r[23]||'Chưa có trạng thái','tag'));list.append(item);
  }
  if(rows.length>50)list.append(el('p','Đang xem 50/'+rows.length+' đơn. Đây chỉ là bản đọc thử, chưa nhập dữ liệu vào D1.'));
  $('confirmImport').disabled=!rows.length;
  $('confirmImport').checked=false;
  $('importGoogleSheets').disabled=true;
 });
}
function connectGoogleDrive(){
 if(!state.googleDriveRoot)return $('legacyStatus').textContent='Hãy bấm Đọc Google Sheets trước để nhận thư mục DON_HANG từ CAU_HINH.';
 sourceAuth('https://www.googleapis.com/auth/drive.metadata.readonly',async token=>{
  $('legacyStatus').textContent='Đang kiểm tra thư mục Google Drive...';
  const data=await googleRead('https://www.googleapis.com/drive/v3/files/'+encodeURIComponent(state.googleDriveRoot)+'?fields=id,name,mimeType,webViewLink',token);
  $('legacyStatus').textContent='Đã xác minh Drive: '+data.name+' ('+data.mimeType+'). Chỉ kiểm tra thông tin thư mục, chưa tạo hoặc di chuyển file.';
 });
}
async function importGoogleSheets(){
 if(!capabilities().admin)return notice('Chỉ Admin được phép nhập dữ liệu từ Google Sheets.');
 if(!$('confirmImport').checked)return notice('Cần xác nhận đối chiếu dữ liệu trước khi nhập.');
 if(!state.sheetReadToken||Date.now()>=state.sheetReadUntil)return notice('Quyền Google đã hết hạn. Hãy bấm Đọc Google Sheets để cấp lại.');
 const btn=$('importGoogleSheets');btn.disabled=true;
 $('legacyStatus').textContent='Đang đọc nguồn Google Sheets và nhập vào D1; KHÔNG ghi sang Google Sheets hoặc Drive...';
 try{
  let offset=0,total={new:0,updated:0,unchanged:0,conflicts:0,errors:0},issues=[];
  for(let i=0;i<15;i++){
   const r=await api('POST','/api/legacy/import',{
    confirmation:'DONG_Y_NHAP_D1_CHI_MOT_CHIEU',
    googleAccessToken:state.sheetReadToken,offset,limit:100
   });
   for(const key of Object.keys(total))total[key]+=Number(r[key])||0;
   issues.push(...(r.details||[]).slice(0,12));
   if((r.new||0)+(r.updated||0)+(r.unchanged||0)+(r.conflicts||0)+(r.errors||0)<100)break;
   offset+=100;
  }
  $('legacyStatus').textContent='Đã hoàn tất đối chiếu/nhập D1: mới '+total.new+', cập nhật '+total.updated+', giữ nguyên '+total.unchanged+', xung đột '+total.conflicts+', lỗi '+total.errors+'. Google Sheets và Drive không bị ghi.';
  const box=$('legacyPreview');box.replaceChildren();
  for(const item of issues)box.append(el('p',item.id?item.id+' · '+item.result:'Dòng '+item.row+': '+item.error));
  $('confirmImport').checked=false;
  await loadOrders();
 }catch(e){$('legacyStatus').textContent='Không nhập được D1: '+e.message;}
 finally{btn.disabled=!$('confirmImport').checked;}
}
async function refreshGoogleSync(){
 if(!capabilities().admin)return;
 const status=$('syncMessage');
 try{
  const r=await api('GET','/api/sync/status');
  const waiting=r.uploads.filter(u=>!u.drive_file_id).length;
  const last=r.auto?.lastRun;
  status.textContent='D1: '+r.orders.length+' đơn chờ ghi Sheets · R2: '+waiting+' tệp chờ Drive. '+
   (last?'Lần chạy tự động gần nhất: '+last.started_at+' ('+last.status+').':
   'Bộ chạy tự động đang chờ thiết lập quyền Google ngoại tuyến của máy chủ.');

  const media=$('syncUploads');media.replaceChildren();
  if(!r.uploads.length)media.append(el('p','Không có ảnh/video mới cần kiểm tra.'));
  for(const file of r.uploads){
   const div=el('div',null,'order');
   const label=el('div',(file.order_id+' · '+file.stage+' · '+file.filename+' · '+(file.bytes/1048576).toFixed(1)+' MB'));
   const span=el('span',file.drive_file_id?'Đã có trên Drive':file.auto_error?'Lỗi tạm thời – sẽ thử lại':(file.drive_offset?'Đã chuyển '+Math.floor(100*file.drive_offset/file.bytes)+'%':'Đang chờ đồng bộ'),'tag');
   if(file.auto_error)span.title=file.auto_error;
   div.append(label,span);
   if(!file.drive_file_id){
    const btn=button(file.drive_offset?'Tiếp tục chuyển':'Chuyển sang Drive',()=>mirrorGoogleFile(file.id,btn),'secondary');
    div.append(btn);
   }
   media.append(div);
  }
  const orders=$('syncOrders');orders.replaceChildren();
  if(!r.orders.length)orders.append(el('p','Không có đơn nào đánh dấu chờ đồng bộ.'));
  for(const order of r.orders){
   const files=r.uploads.filter(f=>f.order_id===order.id);
   const pending=files.some(f=>!f.drive_file_id);
   const row=el('div',null,'order');
   row.append(el('div',order.id+' · '+order.invoice_codes+' · '+order.status));
   const btn=button(pending?'Cần chuyển đủ tệp trước':'Ghi đơn về DATA_TONG',()=>pushGoogleOrder(order.id,btn),'primary');
   btn.disabled=pending;
   row.append(btn);orders.append(row);
  }
 }catch(e){status.textContent='Lỗi kiểm tra đồng bộ: '+e.message;}
}
function googleWriteSession(){
 if(!state.googleWriteToken||!state.googleWriteUntil||Date.now()>=state.googleWriteUntil)
  throw Error('Chưa kết nối hoặc quyền Google đã hết hạn. Bấm "Kết nối Google" để cấp quyền lại.');
 return state.googleWriteToken;
}
function connectGoogleWrite(){
 sourceAuth('https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive',async(token,expires)=>{
  state.googleWriteToken=token;
  state.googleWriteUntil=Date.now()+Math.max(60,expires-120)*1000;
  $('syncMessage').textContent='Đã kết nối quyền Google Sheets và Drive trong phiên này. Xác nhận riêng từng thao tác để thực hiện.';
  await refreshGoogleSync();
 },'syncMessage');
}
async function mirrorGoogleFile(uploadId,btn){
 if(!$('syncDriveApprove').checked)return $('syncMessage').textContent='Cần tích xác nhận đồng ý chuyển tệp lên Drive.';
 let token;try{token=googleWriteSession()}catch(e){return $('syncMessage').textContent=e.message;}
 btn.disabled=true;
 const status=$('syncMessage');
 try{
  let info=await api('POST','/api/sync/drive/init',{uploadId,googleAccessToken:token});
  let cycles=0;
  while(!info.done){
   if(Date.now()>=state.googleWriteUntil)throw Error('Phiên Google hết hạn; hãy cấp quyền lại để tiếp tục.');
   info=await api('POST','/api/sync/drive/chunk',{uploadId,googleAccessToken:token});
   status.textContent='Đang chuyển tệp '+uploadId+': '+Math.floor(info.offset/info.total*100)+'% ('+(info.offset/1048576).toFixed(1)+' MB / '+(info.total/1048576).toFixed(1)+' MB).';
   if(++cycles>350)throw Error('Đã dừng vì vượt số lần tải dự kiến. Kiểm tra phiên tải.');
  }
  status.textContent='Đã chuyển và xác minh tệp trên Google Drive: '+uploadId+'. Tệp R2 vẫn được giữ nguyên.';
 }catch(e){status.textContent='Chưa hoàn tất chuyển tệp: '+e.message+' Có thể bấm Tiếp tục sau khi xử lý.';}
 finally{btn.disabled=false;await refreshGoogleSync();}
}
async function pushGoogleOrder(orderId,btn){
 if(!$('syncSheetApprove').checked)return $('syncMessage').textContent='Cần tích xác nhận ghi các thay đổi về DATA_TONG.';
 let token;try{token=googleWriteSession()}catch(e){return $('syncMessage').textContent=e.message;}
 btn.disabled=true;
 try{
  const r=await api('POST','/api/sync/sheets/commit',{orderId,googleAccessToken:token,confirmation:'XAC_NHAN_GHI_DATA_TONG'});
  $('syncMessage').textContent=r.ok?'Đã cập nhật '+r.cells+' ô của đơn '+orderId+' vào DATA_TONG; đã kiểm tra đọc lại.':'Chưa hoàn tất đồng bộ.';
 }catch(e){$('syncMessage').textContent='Chưa ghi được DATA_TONG: '+e.message;}
 finally{btn.disabled=false;await refreshGoogleSync();}
}
async function checkLegacy(){
 const node=$('legacyStatus');node.textContent='Đang kiểm tra...';
 try{
  const x=await api('GET','/api/legacy/status');
  node.textContent=x.configured?'Đã có cầu nối, CHỈ ĐỌC. Chưa cho phép ghi về Sheets/Drive.':'Chưa có cầu nối Google Sheets. Cần triển khai cầu nối Apps Script riêng, cấu hình secret rồi mới đọc được dữ liệu thật.';
 }catch(e){node.textContent=e.message;}
}
async function previewLegacy(){
 const box=$('legacyPreview');box.replaceChildren(el('p','Đang lấy bản xem trước...'));
 try{
  const r=await api('GET','/api/legacy/preview?offset=0&limit=50');
  box.replaceChildren(el('p','Google Sheets: '+r.total+' đơn · Đọc '+r.preview.length+' dòng · Mới '+r.summary.new+' · Đã khớp '+r.summary.unchanged+' · Thay đổi '+r.summary.changed+' · Xung đột '+r.summary.conflicts+' · Lỗi '+r.summary.errors));
  for(const item of r.preview){
   const div=el('div',null,'order');
   div.append(el('div',item.error||[item.id,item.invoice_codes,item.customer,item.status].filter(Boolean).join(' · ')));
   div.append(el('span',item.action,'tag'));box.append(div);
  }
 }catch(e){box.replaceChildren(el('p','Chưa thể đối chiếu: '+e.message));}
}
$('syncRefresh').onclick=refreshGoogleSync;
$('syncConnect').onclick=connectGoogleWrite;
$('connectGoogleSheets').onclick=connectGoogleSheets;
$('connectGoogleDrive').onclick=connectGoogleDrive;
$('confirmImport').onchange=()=>{$('importGoogleSheets').disabled=!$('confirmImport').checked;};
$('importGoogleSheets').onclick=importGoogleSheets;
$('checkLegacy').onclick=checkLegacy;
$('previewLegacy').onclick=previewLegacy;
$('staffForm').elements.role.onchange=()=>{
 const view=$('staffForm').elements.role.value==='VIEW';
 for(const k of ['dongHang','vanDon','admin']){const control=$('staffForm').elements[k];if(view)control.checked=false;control.disabled=view;}
};
$('cancelStaffEdit').onclick=resetStaffEdit;
$all('.admin-report').forEach(btn=>btn.onclick=()=>loadAdminReport(btn.dataset.kind));
$('refreshGooglePending').onclick=()=>loadPendingGoogle();
$('overviewRefresh').onclick=()=>loadOverview().catch(e=>notice(e.message));
$('overviewSearch').oninput=renderOverview;
$('overviewStatus').onchange=renderOverview;
$('closeOrderSummary').onclick=()=>$('orderSummaryDialog').close();
$('closeDrivePreview').onclick=()=>$('drivePreviewDialog').close();
initGoogleSignIn();
if(state.token)bootstrap();
