import {trackDraft,markDraftSaved,confirmLeave,protectBeforeUnload,humanizeError,showFormError,showFieldError} from './ux-guard.js';

const CHUNK_BYTES=8*1024*1024;
const VIDEO_PART_CONCURRENCY=3;
const $=id=>document.getElementById(id);
const state={token:sessionStorage.getItem('qbooks_token')||localStorage.getItem('qbooks_remember_token')||'',user:null,orders:[],selected:null,tab:'orders',saving:false,lockedOrderIds:new Set(),orderMenuExpanded:false,menuKeys:[],menuEditor:null,area:'orders',mediaView:'dashboard',mediaPromise:null,adminPanel:'accounts',backgroundJob:null,preUpload:null,editOrder:null};
const statusTitle={PACKER:'Đơn chờ đóng hàng',SHIPPER:'Đơn chờ vận đơn',SALE:'Đơn hàng',ADMIN:'Tất cả đơn hàng'};
const REMEMBER_EMAIL='qbooks_remember_email';
const REMEMBER_TOKEN='qbooks_remember_token';
function clearLoginSession(){
 state.token='';
 sessionStorage.removeItem('qbooks_token');
 localStorage.removeItem(REMEMBER_TOKEN);
}
function saveLoginSession(result,email,remember){
 // Only store a temporary Qbooks session, never PIN/password or Google OAuth credentials.
 state.token=result.token;
 sessionStorage.setItem('qbooks_token',result.token);
 if(remember){
  localStorage.setItem(REMEMBER_TOKEN,result.token);
  if(email)localStorage.setItem(REMEMBER_EMAIL,String(email).trim().toLowerCase());
 }else{
  localStorage.removeItem(REMEMBER_TOKEN);
  localStorage.removeItem(REMEMBER_EMAIL);
 }
}
function prefillRememberedAccount(){
 const input=$('loginForm')?.elements?.email;
 const saved=localStorage.getItem(REMEMBER_EMAIL);
 if(input&&saved)input.value=saved;
 const checkbox=$('rememberLogin');if(checkbox)checkbox.checked=!!localStorage.getItem(REMEMBER_TOKEN)||!!saved||!localStorage.getItem('qbooks_remember_preference');
}

const $all=(s)=>[...document.querySelectorAll(s)];
function notice(text='',ok=false){$('notice').textContent=ok?text:humanizeError(text);$('notice').className=ok?'notice ok':'notice';}
async function api(method,path,data,blob=false,externalSignal=null){
 const headers={};if(state.token)headers.authorization='Bearer '+state.token;
 if(!blob&&data!=null)headers['content-type']='application/json';
 // Read-only calls may retry after a transient network error; never retry writes.
 const attempts=method==='GET'&&!externalSignal?2:1;
 for(let attempt=0;attempt<attempts;attempt++){
  const controller=new AbortController();
  const onAbort=()=>controller.abort();
  if(externalSignal?.aborted)controller.abort();
  else externalSignal?.addEventListener('abort',onAbort,{once:true});
  const wait=blob?300000:method==='GET'?20000:45000;
  const timer=setTimeout(()=>controller.abort(),wait);
  let res;
  try{
   res=await fetch(path,{method,headers,
    body:data==null?undefined:blob?data:JSON.stringify(data),
    signal:controller.signal,cache:method==='GET'?'no-store':'default'});
  }catch(e){
   clearTimeout(timer);externalSignal?.removeEventListener('abort',onAbort);
   if(externalSignal?.aborted)throw Object.assign(new Error('Đã hủy yêu cầu tìm kiếm cũ.'),{name:'AbortError'});
   if(method==='GET'&&attempt<attempts-1)continue;
   throw Error(e.name==='AbortError'?'Máy chủ phản hồi quá chậm, đã dừng yêu cầu. Vui lòng thử lại.':
    'Lỗi kết nối. Kiểm tra Wi-Fi/3G rồi thử lại: '+e.message);
  }
  clearTimeout(timer);externalSignal?.removeEventListener('abort',onAbort);
  if(externalSignal?.aborted)throw Object.assign(new Error('Đã hủy yêu cầu tìm kiếm cũ.'),{name:'AbortError'});
  let result;try{result=await res.json()}catch{result={error:'Máy chủ không trả JSON.'}}
  if(!res.ok)throw Error(result.error||'Máy chủ trả lỗi '+res.status);
  return result;
 }
}
function show(id,yes){$(id).hidden=!yes;if(id==='detailView')document.querySelector('.shipping-workspace')?.classList.toggle('qbook-detail-open',yes);}
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
 titleRow.append(el('strong',(String(order.invoice_codes||'').trim()||'Chưa có mã hóa đơn')+' · Sale: '+(order.sale_name||'Chưa rõ')),statusBadge(order.status));
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
async function login(email,pin,remember){
 const res=await api('POST','/api/login',{email,pin});
 saveLoginSession(res,res.user?.email||email,remember);
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
   $('googleUnavailable').textContent='Đăng nhập Google chưa được cấu hình';
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
     saveLoginSession(result,result.user?.email||'',!!$('rememberLogin')?.checked);
     await bootstrap();
    }catch(e){notice('Đăng nhập Google thất bại: '+e.message);}
    finally{if(!state.user)$('googleStatus').textContent='Tài khoản mới cần quản trị phê duyệt trước khi sử dụng.';}
   }
  });
  $('googleUnavailable').hidden=true;
  window.google.accounts.id.renderButton($('googleSignIn'),{type:'standard',theme:'outline',size:'large',shape:'rectangular',text:'continue_with',width:290});
  $('googleStatus').textContent='Dùng tài khoản Google đã được cấp quyền hoặc đăng ký mới để chờ quản trị duyệt.';
 }catch(e){$('googleUnavailable').textContent='Chưa kiểm tra được đăng nhập Google';$('googleStatus').textContent=e.message;}
}
function resetStaffEdit(){
 state.editStaffId=null;state.menuEditor=null;
 show('menuPermissionsPanel',false);
 if($('staffUnlockRow'))$('staffUnlockRow').hidden=true;
 $('staffForm').reset();
 $('staffForm').elements.email.readOnly=false;
 $('staffForm').elements.role.disabled=false;
 $('saveStaffBtn').textContent='TẠO NHÂN SỰ';
 $('staffForm').elements.role.value='VIEW';
 $('staffForm').elements.role.onchange?.();
 markDraftSaved($('staffForm'));
}
// ---- Tài khoản và nhân sự / Phân quyền: searchable list with clear status badges ----
function staffRoles(person){
 if(person.role==='VIEW')return ['Chỉ xem'];
 return [person.can_admin?'Quản trị':'',person.can_pack?'Đóng hàng':'',person.can_ship?'Vận đơn':'',person.role==='SALE'?'Sale':''].filter(Boolean);
}
function staffMatches(person,q,filter){
 if(q&&!(person.name+' '+person.email).toLowerCase().includes(q))return false;
 return filter==='all'||(filter==='active'&&person.active)||(filter==='inactive'&&!person.active)||(filter==='locked'&&person.locked_until>0)
  ||(filter==='admin'&&person.can_admin)||(filter==='VIEW'&&person.role==='VIEW')||(filter==='pack'&&person.can_pack)||(filter==='ship'&&person.can_ship);
}
function lastLoginText(value){
 if(!value)return 'Chưa ghi nhận đăng nhập';
 const d=new Date(String(value).replace(' ','T')+'Z');
 return Number.isNaN(d.getTime())?'Đăng nhập: '+value:'Đăng nhập gần nhất: '+d.toLocaleString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh',hour12:false});
}
function selectStaff(person){
 state.editStaffId=person.id;
 const form=$('staffForm');
 form.elements.name.value=person.name;form.elements.email.value=person.email;
 form.elements.email.readOnly=true;form.elements.role.value=person.role;
 form.elements.role.disabled=false;form.elements.pin.value='';
 form.elements.dongHang.checked=!!person.can_pack;form.elements.vanDon.checked=!!person.can_ship;
 form.elements.admin.checked=!!person.can_admin;form.elements.active.checked=!!person.active;
 form.elements.unlock.checked=false;$('staffUnlockRow').hidden=!(person.locked_until>0);
 form.elements.role.onchange();
 markDraftSaved(form);
 $('saveStaffBtn').textContent='LƯU THAY ĐỔI NHÂN SỰ';
 renderStaffList();
 if(state.adminPanel==='permissions')loadStaffMenuPermissions(person.id,person.name,person.role).catch(e=>notice('Không đọc được phân quyền: '+e.message));
 (state.adminPanel==='permissions'?$('menuPermissionsPanel'):form).scrollIntoView({behavior:'smooth',block:'center'});
}
function renderStaffList(){
 const list=$('staffList'),people=state.staffUsers||[];
 const q=($('staffSearch')?.value||'').trim().toLowerCase(),filter=$('staffFilter')?.value||'all';
 const shown=people.filter(p=>staffMatches(p,q,filter));
 list.replaceChildren();
 const active=people.filter(p=>p.active).length,admins=people.filter(p=>p.active&&p.can_admin).length,locked=people.filter(p=>p.locked_until>0).length;
 $('staffCount').textContent='Hiển thị '+shown.length+'/'+people.length+' · '+active+' hoạt động · '+admins+' quản trị'+(locked?' · '+locked+' tạm khóa':'');
 if(!shown.length)return list.append(el('p','Không có nhân sự phù hợp.'));
 for(const person of shown){
  const row=button('',()=>selectStaff(person),'order staff-row'+(state.editStaffId===person.id?' selected':''));
  const main=el('span',null,'staff-main');
  main.append(el('strong',person.name),meta(person.email),meta(lastLoginText(person.last_login)));
  const badges=el('span',null,'staff-badges');
  badges.append(el('span',person.active?'Hoạt động':'Ngừng','staff-badge '+(person.active?'ok':'off')));
  if(person.locked_until>0)badges.append(el('span','Tạm khóa sai PIN','staff-badge warn'));
  for(const r of staffRoles(person))badges.append(el('span',r,'staff-badge'+(r==='Quản trị'?' admin':'')));
  if(person.google_linked)badges.append(el('span','Google','staff-badge'));
  row.append(main,badges);
  row.setAttribute('aria-label',person.name+', '+person.email);
  list.append(row);
 }
}
async function loadStaffUsers(){
 if(!capabilities().admin)return;
 const r=await api('GET','/api/users');
 state.staffUsers=r.users||[];
 renderStaffList();
}
async function loadStaffMenuPermissions(id,name,role){
 if(!capabilities().admin)return;
 const details=await api('GET','/api/users/'+id+'/menus');
 state.menuEditor={id,name,role,keys:details.keys};
 const grid=$('menuPermissionsGrid');grid.replaceChildren();
 $('menuPermissionsUser').textContent='Nhân sự: '+name+' · Vai trò: '+role;
 const sections=[['Quản lý giao hàng',details.keys.filter(k=>k.startsWith('orders.'))],['Quản lý Media',details.keys.filter(k=>k.startsWith('media.'))],['Quản trị hệ thống',details.keys.filter(k=>k.startsWith('system.'))]];
 for(const [heading,keys] of sections){
  const group=el('fieldset',null,'menu-rights');group.append(el('legend',heading));
  for(const key of keys){
   const label=el('label',null,'menu-right-item'),input=document.createElement('input');
   input.type='checkbox';input.dataset.menuKey=key;input.checked=details.menus.includes(key);
   if(role==='VIEW'&&['system.admin','media.staff','media.permissions','media.audit'].includes(key))input.disabled=true;
   label.append(input,el('span',details.labels[key]||key));group.append(label);
  }
  grid.append(group);
 }
 $('grantFilm').checked=!!details.video?.can_film;
 $('grantEdit').checked=!!details.video?.can_edit;
 $('grantManage').checked=!!details.video?.can_manage;
 const isView=role==='VIEW';
 for(const id of ['grantFilm','grantEdit','grantManage'])$(id).disabled=isView;
 show('menuPermissionsPanel',true);
}
async function saveStaffMenuPermissions(){
 const edit=state.menuEditor;if(!edit)return notice('Chọn nhân sự cần phân quyền.');
 const permissions={};
 for(const el of document.querySelectorAll('#menuPermissionsGrid [data-menu-key]'))permissions[el.dataset.menuKey]=!!el.checked&&!el.disabled;
 const video={can_film:$('grantFilm').checked&&!$('grantFilm').disabled,can_edit:$('grantEdit').checked&&!$('grantEdit').disabled,can_manage:$('grantManage').checked&&!$('grantManage').disabled};
 try{
  await api('PUT','/api/users/'+edit.id+'/menus',{permissions,video});
  notice('Đã lưu phân quyền theo từng menu.',true);
  await loadStaffMenuPermissions(edit.id,edit.name,edit.role);
 }catch(e){notice('Không lưu được phân quyền: '+e.message);}
}
async function loadAdminReport(kind,page=1){
 const wrap=$('adminReport');wrap.replaceChildren(el('p','Đang tải '+kind+'...'));
 state.adminReportKind=kind;
 const isLog=kind==='LOG';$('logToolbar').hidden=!isLog;
 for(const b of document.querySelectorAll('.admin-report'))b.setAttribute('aria-pressed',String(b.dataset.kind===kind));
 try{
  const extra=isLog?'&page='+page+'&q='+encodeURIComponent($('logSearch').value.trim())+($('logShowLogins').checked?'&logins=1':''):'';
  const report=await api('GET','/api/admin/data?kind='+encodeURIComponent(kind)+extra);
  if(isLog){
   state.logPage=report.page||1;
   $('logPage').textContent='Trang '+(report.page||1)+'/'+(report.pages||1)+' · '+(report.total??report.rows?.length??0)+' dòng';
   $('logPrev').disabled=(report.page||1)<=1;$('logNext').disabled=(report.page||1)>=(report.pages||1);
  }
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
  container.append(el('p',res.registrations.length+' đăng ký đang chờ duyệt.','hint'));
  for(const person of res.registrations){
   const row=el('div',null,'order google-pending');
   const info=el('div');
   info.append(el('strong',person.name),meta(person.email),meta(person.existing_user?'Đã có nhân sự: chỉ liên kết Google, giữ nguyên quyền.':'Đăng ký mới: cần chọn vai trò.'),meta('Đăng ký: '+person.requested_at));
   const controls=el('div',null,'google-actions');
   const select=document.createElement('select');
   [['VIEW','Chỉ xem (mặc định)'],['PACKER','Đóng hàng'],['SHIPPER','Vận đơn'],['SALE','Sale']].forEach(([value,title])=>{
    const opt=document.createElement('option');opt.value=value;opt.textContent=title;select.append(opt);
   });
   if(person.existing_user){select.disabled=true;select.title='Tài khoản đã có, sẽ giữ nguyên vai trò.';}
   const approve=button(person.existing_user?'Liên kết Google':'Duyệt',async()=>{
    approve.disabled=true;
    try{
     if(!person.existing_user&&select.value!=='VIEW'&&!confirm('Cấp quyền '+select.selectedOptions[0].textContent+' cho '+person.email+'?')){approve.disabled=false;return;}
     await api('POST','/api/google/approve',{sub:person.google_sub,role:select.value});
     notice('Đã duyệt tài khoản '+person.email+'.',true);
     await loadPendingGoogle();
    }catch(e){notice(e.message);}finally{approve.disabled=false;}
   },'primary');
   const reject=button('Từ chối',async()=>{
    reject.disabled=true;
    if(!confirm('Từ chối đăng ký của '+person.email+'?')){reject.disabled=false;return;}
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
  const access=await api('GET','/api/menu-access');state.menuKeys=access.menus||[];
  $('userInfo').textContent=r.user.name+' · '+r.user.role;
  $('shippingUserBadge').textContent=r.user.name;
  $('accountMenuName').textContent=r.user.name;
  $('accountMenuRole').textContent=r.user.role;
  show('loginPage',false);show('appPage',true);$('logoutBtn').hidden=false;const skip=$('qbSkipLink');if(skip)skip.href='#appPage';
  // Always drop operational data kept by a previous session before showing the new identity.
  state.orders=[];state.overviewData=null;state.selected=null;state.lockedOrderIds.clear();clearUploadTasks();
  const rights=capabilities(),keys=state.menuKeys;
  const permitted=key=>keys.includes('orders.'+key),hasOrders=['overview','sale','pack','ship'].some(permitted),hasMedia=keys.some(k=>k.startsWith('media.'));
  state.tab=rights.admin?'overview':['overview','sale','pack','ship'].find(permitted)||'overview';
  const params=new URLSearchParams(window.location.search),tabParam=params.get('tab'),mediaParam=params.get('view'),section=params.get('section'),toAdmin=params.get('nav')==='admin';
  if(toAdmin&&rights.admin){state.adminPanel=['accounts','permissions','approvals','sync','logs'].includes(params.get('panel'))?params.get('panel'):'accounts';tab('staff',state.adminPanel);return;}
  if(((section==='media'||params.get('nav')==='media')&&(hasMedia||rights.admin))||(!hasOrders&&hasMedia)){
   await openMedia(mediaParam||undefined);return;
  }
  if(['overview','sale','pack','ship'].includes(tabParam)&&permitted(tabParam))state.tab=tabParam;
  state.area='orders';switchView();

 }catch(e){clearLoginSession();show('loginPage',true);show('appPage',false);$('logoutBtn').hidden=true;const skip=$('qbSkipLink');if(skip)skip.href='#loginPage';notice(e.message);}
}
function syncRoute(area,view){
 const q=new URLSearchParams();
 if(area==='media'){q.set('section','media');q.set('view',view||'dashboard');}
 else if(area==='admin'){q.set('nav','admin');q.set('panel',state.adminPanel||'accounts');}
 else if(view&&view!=='overview')q.set('tab',view);
 const path=window.location.pathname+(q.size?'?'+q.toString():'');
 if(window.location.pathname+window.location.search!==path)window.history.replaceState(null,'',path);
}
function setShellTitle(area,title,description=''){
 state.area=area;
 $('qbookSectionLabel').textContent=area==='media'?'QUẢN LÝ MEDIA':area==='admin'?'QUẢN TRỊ HỆ THỐNG':'QUẢN LÝ GIAO HÀNG';
 $('shippingHeading').textContent=title;
 $('shippingSubheading').textContent=description;
 const container=$('unifiedMediaView');
 const workspace=container.closest('.shipping-workspace');
 workspace?.classList.toggle('qbook-media-active',area==='media');
 show('unifiedMediaView',area==='media');
 if(area==='media'){
  for(const id of ['overviewView','ordersView','saleView','staffView','detailView','viewOnlyPanel','shippingOperationGroup'])show(id,false);
 }
}
async function openMedia(view){
 if(state.area!=='media'||(view&&state.mediaView!==view)){if(!confirmLeave())return;}
 const permitted=state.menuKeys.filter(key=>key.startsWith('media.')).map(key=>key.slice(6));
 if(!permitted.length&&!capabilities().admin)return notice('Bạn chưa được cấp quyền Quản lý Media.');
 const target=permitted.includes(view)?view:permitted.includes(state.mediaView)?state.mediaView:permitted[0]||'dashboard';
 state.mediaView=target;
 setShellTitle('media','Đang mở Quản lý Media','Đang tải thông tin…');
 window.QbookNavigation?.focusMedia(target);
 renderTabs();
 try{
  if(!state.mediaPromise)state.mediaPromise=import('/video.js').catch(err=>{state.mediaPromise=null;throw err;});
  await state.mediaPromise;
  const media=window.QbookMedia;
  if(!media)throw Error('Không khởi tạo được mô-đun Media.');
  await media.start(target,state.token);
 }catch(err){
  $('page').innerHTML='';
  const panel=document.createElement('div');panel.className='panel';
  const heading=document.createElement('h2');heading.textContent='Không mở được Quản lý Media';
  const msg=document.createElement('p');msg.textContent=err.message;
  const retry=document.createElement('button');retry.type='button';retry.className='btn primary';retry.textContent='Thử tải lại';
  retry.onclick=()=>{state.mediaPromise=null;openMedia(target);};
  panel.append(heading,msg,retry);$('page').append(panel);
  $('shippingHeading').textContent='Media chưa tải được';
  $('shippingSubheading').textContent='Kiểm tra kết nối và chọn Thử tải lại';
  notice('Quản lý Media: '+err.message);
 }
}
window.QbookShell={
 mediaChanged(view,title){
  if(state.area!=='media')return;
  state.mediaView=view;
  setShellTitle('media',title||'Quản lý Media','Quản lý Media / '+(title||'Bảng điều khiển'));
  window.QbookNavigation?.focusMedia(view);
  renderTabs();
  syncRoute('media',view);
 },
 openMedia,
 showOrders(key){tab(key);}
};
function capabilities(){
 const r=state.user?.rights||{};
 return {pack:!!r.dongHang,ship:!!r.vanDon,admin:!!r.admin,view:state.user?.role==='VIEW',sale:state.user?.role==='SALE'||!!r.admin};
}
const OPERATION_TABS=[['sale','Sale lên đơn','✎'],['pack','Đóng hàng','▣'],['ship','Vận đơn','▤']];
function menuAllowed(key){return !!state.user?.rights?.admin||state.menuKeys.includes(key);}
function availableOperationTabs(){return OPERATION_TABS.filter(([key])=>menuAllowed('orders.'+key));}
function isOperationTab(key){return ['sale','pack','ship'].includes(key);}
function renderTabs(){
 const r=capabilities(),operations=availableOperationTabs();
 const orderTabs=[...(menuAllowed('orders.overview')?[['overview','Tổng hợp']]:[]),...operations.map(([id,label])=>[id,label])];
 const desktop=$('tabs'),mobile=$('mobileShippingTabs'),inner=$('shippingOperationTabs');
 desktop.replaceChildren();mobile.replaceChildren();inner.replaceChildren();
 if(!window.QbookNavigation)throw Error('Thiếu bộ điều hướng QBOOK');
 window.QbookNavigation.render({
   desktop,mobileTree:$('qbnMobileTree'),drawer:$('qbnDrawer'),toggle:$('qbnToggle'),
   area:state.area==='media'?'media':state.tab==='staff'?'admin':'orders',activeView:state.area==='media'?state.mediaView:state.tab,orders:orderTabs,admin:menuAllowed('system.admin'),adminView:state.adminPanel,canMedia:id=>menuAllowed('media.'+id),
   onOrder:key=>tab(key),
   onMedia:key=>openMedia(key),
   onAdmin:key=>tab('staff',key||'accounts')
 });
 const active=state.area==='orders'&&['overview','sale','pack','ship'].includes(state.tab);
 const addMobile=(id,label,icon,fn,isActive)=>{
   const b=button('',fn,isActive?'selected':'');b.classList.add('shipping-mobile-item');
   b.append(el('span',icon,'shipping-mobile-icon'),el('span',label,'shipping-mobile-label'));
   b.setAttribute('aria-label',label);b.setAttribute('aria-current',isActive?'page':'false');mobile.append(b);
 };
 if(orderTabs.length)addMobile('orders','Giao hàng','▣',()=>tab(orderTabs[0][0]),active);
 const mediaMenus=state.menuKeys.filter(k=>k.startsWith('media.')).map(k=>k.slice(6));
 if(state.area==='media'){
  const primary=[['dashboard','Tổng quan','▦'],['film','Quay','◉'],['edit','Hậu kỳ','✎'],['booksProgress','Đầu sách','▧']].filter(([id])=>mediaMenus.includes(id));
  const slots=orderTabs.length?3:4;
  const visible=primary.slice(0,slots);
  const overflow=mediaMenus.some(id=>!visible.some(([key])=>key===id));
  for(const [id,label,symbol] of visible)addMobile(id,label,symbol,()=>openMedia(id),state.mediaView===id);
  if(overflow&&mobile.children.length<5)addMobile('more','Danh mục','☰',()=>{$('qbnToggle').click();},!visible.some(([id])=>id===state.mediaView));
 }else if(mediaMenus.length)addMobile('media','Media','◉',()=>openMedia(),false);
 if(menuAllowed('system.admin')&&mobile.children.length<5)addMobile('admin','Quản trị','⚙',()=>tab('staff','accounts'),state.area==='admin');
 for(const [id,label]of orderTabs){const b=button(label,()=>tab(id),state.tab===id?'selected':'');b.classList.add('shipping-operation-tab');inner.append(b);}
 show('shippingOperationGroup',state.area==='orders'&&state.orderMenuExpanded&&active&&orderTabs.length>0);
 const close=$('qbnClose');
 if(close)close.onclick=()=>{window.QbookNavigation.closeDrawer();renderTabs();};
 const drawer=$('qbnDrawer');
 if(drawer)drawer.onclick=e=>{if(e.target===drawer){window.QbookNavigation.closeDrawer();renderTabs();}};
}

function viewOnlyLayout(key){
 const labels={overview:'Tổng hợp',sale:'Sale lên đơn',pack:'Đóng hàng',ship:'Vận đơn'};
 const content=$('viewOnlyContent');content.replaceChildren();
 const section=el('section',null,'qb-view-only-info');
 section.setAttribute('role','status');
 const title=el('h2','Chế độ chỉ xem · '+(labels[key]||'Giao hàng'));
 const description=el('p','Tài khoản này không được phép tạo, thay đổi hay hoàn tất đơn trong chức năng này. Các tác vụ ghi dữ liệu đã được khóa.');
 const explanation=el('p','Để thực hiện công việc, đề nghị quản trị viên cấp vai trò và quyền thao tác phù hợp.','qb-muted');
 section.append(title,description,explanation);content.append(section);
}

function switchView(){
 const key=state.tab,isView=capabilities().view;
 if(key==='sale')trackDraft($('saleForm'));
 setShellTitle(key==='staff'?'admin':'orders',key==='staff'?'Quản trị hệ thống':'Quản lý giao hàng');
 syncRoute(key==='staff'?'admin':'orders',key);
 if(key!=='staff'&&!menuAllowed('orders.'+key)){
  for(const id of ['overviewView','ordersView','saleView','staffView','detailView'])show(id,false);
  show('viewOnlyPanel',true);$('viewOnlyContent').textContent='Bạn chưa được cấp quyền menu Quản lý giao hàng. Liên hệ quản trị để cấp quyền.';
  renderTabs();return;
 }
 if(isOperationTab(key))state.lastOperationTab=key;
 const title={overview:'Tổng hợp',sale:'Sale lên đơn',pack:'Đóng hàng',ship:'Vận đơn',staff:'Quản trị hệ thống'};
 $('shippingHeading').textContent=title[key]||'Quản lý chuyển hàng';
 $('shippingSubheading').textContent=isView?'Chế độ chỉ xem – chỉ hiển thị dữ liệu trong phạm vi được cấp quyền, không thể thay đổi':
  key==='overview'?'Tiến độ, chứng từ, ảnh và video của từng đơn':'Theo dõi và thực hiện nghiệp vụ QBooks';
 if(isView&&key!=='overview'){
  show('viewOnlyPanel',true);
  for(const id of ['overviewView','ordersView','saleView','staffView','detailView'])show(id,false);
  viewOnlyLayout(key);
  renderTabs();
  return; // Security: VIEW never calls operational endpoints or loads real data.
 }
 show('viewOnlyPanel',false);
 show('overviewView',key==='overview');show('ordersView',key==='pack'||key==='ship');
 show('saleView',key==='sale');show('staffView',key==='staff');show('detailView',false);
 show('newSalePanel',menuAllowed('orders.sale')&&state.user.role!=='VIEW');
 renderTabs();
 if(key==='overview')loadOverview().catch(e=>notice('Không đọc được tổng quan: '+e.message));
 if(key==='sale'){loadGroupOptions().catch(e=>notice(e.message));loadOrders().catch(e=>notice(e.message));}
 if(key==='staff'){
   for(const panel of document.querySelectorAll('#staffView [data-admin-section]')){
    const section=panel.dataset.adminSection;
    if(panel.id==='menuPermissionsPanel')continue; // Show only after selecting an employee.
    panel.hidden=state.adminPanel==='permissions'?section!=='accounts':section!==state.adminPanel;
   }
   if(['accounts','permissions'].includes(state.adminPanel)){
    $('staffAdminTitle').textContent=state.adminPanel==='permissions'?'Phân quyền tài khoản':'Quản trị nhân sự / PIN';
    $('staffForm').hidden=state.adminPanel==='permissions';
    $('menuPermissionsPanel').hidden=true;
    state.menuEditor=null;
    trackDraft($('staffForm'));loadStaffUsers();
   }
   if(state.adminPanel==='approvals')loadPendingGoogle();
   if(state.adminPanel==='sync')refreshGoogleSync();
   if(state.adminPanel==='logs')loadAdminReport('LOG').catch(e=>notice(e.message));
  }
 if(key==='pack'||key==='ship')loadOrders().catch(e=>notice(e.message));
}
async function releaseLocks(){
 const protectedId=state.backgroundJob?.orderId;
 if(state.preUpload&&state.preUpload.orderId!==protectedId)await cancelPreUpload();
 const ids=[...state.lockedOrderIds].filter(id=>id!==protectedId);
 for(const id of ids)state.lockedOrderIds.delete(id);
 await Promise.allSettled(ids.map(id=>api('DELETE','/api/orders/'+id+'/lock')));
}
function tab(key,panel){if((state.area!=='orders'||state.tab!==key||(key==='staff'&&panel&&state.adminPanel!==panel))&&!confirmLeave())return;if(key==='staff'&&!menuAllowed('system.admin'))return notice('Chưa được cấp quyền Quản trị hệ thống.');if(key!=='staff'&&!menuAllowed('orders.'+key))return notice('Chưa được cấp quyền menu này.');if(state.lockedOrderIds.size)releaseLocks();if(key==='staff'&&['accounts','permissions','approvals','sync','logs'].includes(panel))state.adminPanel=panel;state.tab=key;state.area=key==='staff'?'admin':'orders';state.orderMenuExpanded=key!=='staff';if(key==='staff')window.QbookNavigation?.focusAdmin();else window.QbookNavigation?.focusOrders();switchView();}
const MEDIA_LABELS={ANH_HOA_DON:'Ảnh hóa đơn',VIDEO_DONG_HANG:'Video đóng hàng',HANG_HOA:'Ảnh hàng hóa',GIAO_HANG:'Ảnh bàn giao'};
const LINK_LABELS=[['packing_folder_url','Thư mục đóng hàng'],['shipping_folder_url','Thư mục vận đơn'],['invoice_folder_url','Thư mục ảnh hóa đơn'],['video_folder_url','Thư mục video'],['goods_folder_url','Thư mục ảnh hàng hóa']];
function safeDriveUrl(value){
 try{const u=new URL(String(value||''));return u.protocol==='https:'&&['drive.google.com','docs.google.com'].includes(u.hostname)?u.href:null}catch{return null}
}
async function downloadMedia(id,filename,btn){
 const old=btn.textContent;btn.disabled=true;btn.textContent='Đang lấy tệp…';
 try{
  const response=await fetch('/api/uploads/'+encodeURIComponent(id)+'/file',{headers:{authorization:'Bearer '+state.token}});
  if(!response.ok){
   const error=await response.json().catch(()=>({}));
   if(error.driveUrl){
    try{const u=new URL(error.driveUrl);
     if(u.protocol==='https:'&&u.hostname==='drive.google.com'){
      notice('Tệp đã chuyển sang Google Drive. Bấm liên kết để mở tệp.');
      const link=document.createElement('a');link.href=u.href;link.target='_blank';link.rel='noopener noreferrer';link.textContent='Mở tệp trên Google Drive';link.className='qb-drive-download-link';
      $('notice').append(' ',link);return;
     }
    }catch{}
   }
   throw Error(error.error||'Không thể đọc tệp.');
  }
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
function orderContentSegments(order){
 const when=order.urgent?'GẤP':String(order.delivery_time||'').trim().replace('T',' ');
 const values=[when,order.invoice_codes,order.transport,order.customer,order.address,order.quantity,
  order.carrier,order.shipping_person,order.shipping_phone];
 return values.map(value=>value===null||value===undefined?'':String(value).trim()).filter(value=>value!==''&&value!=='—');
}
function orderContentLine(order){return orderContentSegments(order).join(' - ');}
function orderContentLines(order){
 const names=['Gấp/Thời gian giao','Số hóa đơn','Loại vận chuyển','Tên khách','Địa chỉ',
  'Số quyển','Nhà xe (nếu có)','Tên ship','SĐT ship'];
 const when=order.urgent?'GẤP':String(order.delivery_time||'').trim().replace('T',' ');
 const values=[when,order.invoice_codes,order.transport,order.customer,order.address,order.quantity,
  order.carrier,order.shipping_person,order.shipping_phone];
 return values.flatMap((value,i)=>value===null||value===undefined||String(value).trim()===''?[]:
  [names[i]+': '+String(value).trim()]);
}
function goodsImageLinks(order){
 // Give a folder link first so recipients can access the full collection of merchandise photos.
 const folder=safeDriveUrl(order.goods_folder_url);
 if(folder)return [folder];
 const fileLinks=(order.media||[]).filter(item=>item.stage==='HANG_HOA')
  .map(item=>fileDriveUrl(item.drive_file_id)||safeDriveUrl(item.drive_folder_url)).filter(Boolean);
 return [...new Set(fileLinks)];
}
function orderCopyText(order){
 const content=orderContentLine(order),imageLinks=goodsImageLinks(order);
 return 'Thông tin đơn hàng: '+content+'\nLink ảnh hàng hóa: '+
  (imageLinks.length?imageLinks.join('\n'):'Chưa có link ảnh hàng hóa');
}
async function copyOrderToClipboard(order){
 const content=orderCopyText(order);
 try{
  await navigator.clipboard.writeText(content);
  notice('Đã sao chép thông tin đơn hàng và link ảnh hàng hóa.',true);
 }catch{
  window.prompt('Sao chép thông tin đơn hàng:',content);
 }
}
function goodsImageCard(order){
 const folder=safeDriveUrl(order.goods_folder_url);
 const url=folder||(order.media||[]).filter(item=>item.stage==='HANG_HOA')
  .map(item=>fileDriveUrl(item.drive_file_id)).find(Boolean);
 if(!url)return null;
 const link=el('a',null,'goods-image-card');
 link.href=url;link.target='_blank';link.rel='noopener noreferrer';
 link.title='Xem ảnh hàng hóa trực tiếp trên Google Drive';
 link.append(el('span','▣','goods-image-card-icon'),el('span','Ảnh hàng hóa'));
 return link;
}
async function openStoredImage(upload){
 // Authenticated view of an image not yet synchronized to Drive. Open tab immediately
 // inside the user click to avoid popup blockers; never expose a Bearer token in a URL.
 const win=window.open('about:blank','_blank');
 if(win){
  try{win.opener=null;win.document.title='Đang mở ảnh Qbooks…';win.document.body.textContent='Đang tải ảnh đã lưu trên Qbooks…';}
  catch{}
 }
 try{
  const res=await fetch('/api/uploads/'+encodeURIComponent(upload.id)+'/file',{
   headers:{authorization:'Bearer '+state.token},cache:'no-store',
   signal:AbortSignal.timeout(60000)
  });
  if(!res.ok){
   const data=await res.json().catch(()=>({}));
   const drive=safeDriveUrl(data.driveUrl);
   if(drive){if(win)win.location.replace(drive);else window.open(drive,'_blank','noopener');return;}
   throw Error(data.error||'Tệp chưa sẵn sàng để xem.');
  }
  const blob=await res.blob();
  if(!blob.type.startsWith('image/')&&blob.type!=='application/pdf')
   throw Error('Chỉ xem trực tiếp ảnh/PDF; các tệp khác cần được đồng bộ lên Drive.');
  const url=URL.createObjectURL(blob);
  if(win)win.location.replace(url);
  else{
   const a=el('a');a.href=url;a.target='_blank';a.rel='noopener noreferrer';a.click();
  }
  setTimeout(()=>URL.revokeObjectURL(url),10*60*1000);
 }catch(e){
  try{if(win&&!win.closed)win.close();}catch{}
  notice('Không mở được ảnh: '+e.message);
 }
}
function overviewMediaLinks(container,order){
 const labels=[['HANG_HOA','Ảnh hàng hóa'],['GIAO_HANG','Ảnh giao hàng']];
 for(const [stage,label] of labels){
  const items=(order.media||[]).filter(item=>item.stage===stage);
  let count=0;
  for(const item of items){
   const href=fileDriveUrl(item.drive_file_id);
   if(href){
    const link=el('a',label+(items.length>1?' · '+item.filename:''),'overview-link');
    link.href=href;link.target='_blank';link.rel='noopener noreferrer';container.append(link);count++;
   }else{
    // The file may be on R2 while the Drive synchronization is pending.
    // Preview it after authentication instead of forcing an attachment download.
    const btn=button(label+(items.length>1?' · '+item.filename:''),()=>openStoredImage(item),'overview-link');
    btn.title='Xem ảnh đã lưu trên Qbooks; khi đồng bộ xong sẽ mở trực tiếp Google Drive';
    container.append(btn);count++;
   }
  }
  if(!count){
   const folder=safeDriveUrl(order[stage==='HANG_HOA'?'goods_folder_url':'shipping_folder_url']);
   if(folder){const link=el('a',label+' · Thư mục','overview-link');link.href=folder;link.target='_blank';link.rel='noopener noreferrer';container.append(link);}
  }
 }
 const folder=safeDriveUrl(order.packing_folder_url)||safeDriveUrl(order.shipping_folder_url)||safeDriveUrl(order.goods_folder_url);
 if(folder){const link=el('a','Thư mục chứa','overview-link');link.href=folder;link.target='_blank';link.rel='noopener noreferrer';container.append(link);}
 if(!container.children.length)container.append(el('span','Chưa có hồ sơ','muted'));
}
function canEditOrder(order){
 if(!state.user||state.user.role==='VIEW'||!order)return false;
 if(capabilities().admin)return true;
 return capabilities().sale&&order.status==='CHỜ ĐÓNG HÀNG'&&order.created_by===state.user.id;
}
function openEditOrder(order){
 if(!canEditOrder(order))return notice('Bạn chưa có quyền sửa đơn này.');
 if(state.backgroundJob?.orderId===order.id)return notice('Đơn đang tải video nền. Chỉ sửa sau khi tác vụ kết thúc.');
 state.editOrder=order;
 const form=$('editOrderForm');
 for(const key of ['invoice_codes','transport','customer','address','carrier','quantity'])
  form.elements[key].value=order[key]??'';
 form.elements.delivery_mode.value=order.urgent?'GAP':'THOI_GIAN';
 const time=String(order.delivery_time||'');
 form.elements.delivery_time.value=time.slice(0,16).replace(' ','T');
 $('editOrderDeliveryMode').onchange();
 $('editOrderDialog').showModal();
}
async function saveOrderEdit(event){
 event.preventDefault();
 const order=state.editOrder;if(!order)return;
 const form=$('editOrderForm'),button=$('submitEditOrder');button.disabled=true;
 try{
  const data=Object.fromEntries(new FormData(form));
  data.expected_updated_at=order.updated_at;
  await api('PATCH','/api/orders/'+order.id,data);
  $('editOrderDialog').close();state.editOrder=null;
  notice('Đã sửa đơn và ghi nhật ký.',true);
  if(state.tab==='overview')await loadOverview();
  else await loadOrders();
 }catch(e){notice('Chưa sửa được đơn: '+e.message);showFormError(form,e.message);}
 finally{button.disabled=false;}
}
function appendOverviewRow(order,table,cardHolder){
 const code=order.invoice_codes||order.id;
 const tr=document.createElement('tr');
 const orderTd=document.createElement('td');orderTd.append(el('strong',code),el('small',order.id));
 const customer=document.createElement('td');customer.append(el('strong',order.customer||'—'),el('small','Sale: '+(order.sale_name||'—')));
 const status=document.createElement('td');status.append(statusBadge(order.status));
 const links=document.createElement('td');links.className='overview-media-links';overviewMediaLinks(links,order);
 const goodsCard=goodsImageCard(order);if(goodsCard)links.prepend(goodsCard);
 const detail=document.createElement('td');detail.append(button('Chi tiết đơn',()=>showOrderSummary(order),'secondary'));
 const action=document.createElement('td');action.className='overview-copy-actions';
 const copy=button('Copy đơn hàng',()=>copyOrderToClipboard(order),'secondary');copy.classList.add('copy-order-btn');
 action.append(copy);
 tr.append(orderTd,customer,status,links,detail,action);table.append(tr);
 const card=el('article',null,'overview-mobile-card');
 card.append(el('strong',code),el('small',(order.customer||'—')+' · '+(order.sale_name||'—')),statusBadge(order.status));
 const linksMobile=el('div',null,'overview-media-links');overviewMediaLinks(linksMobile,order);
 const mobileGoods=goodsImageCard(order);if(mobileGoods)linksMobile.prepend(mobileGoods);
 card.append(linksMobile);
 const controls=el('div',null,'overview-card-actions');
 controls.append(button('Chi tiết đơn',()=>showOrderSummary(order),'secondary'),button('Copy đơn hàng',()=>copyOrderToClipboard(order),'secondary'));
 card.append(controls);cardHolder.append(card);
}
function showOrderSummary(order){
 state.summaryOrder=order;
 const modal=$('orderSummaryDialog'),info=$('orderSummaryInfo');info.replaceChildren();
 for(const [label,val] of [['Mã đơn',order.id],['Trạng thái',order.status],['Sale',order.sale_name]]){
  const row=el('div',null,'summary-field');row.append(el('strong',label),el('span',String(val??'—')));info.append(row);
 }
 const content=el('div',null,'order-content');content.append(el('strong','Nội dung đơn hàng'));
 content.append(el('pre',orderContentLine(order),'order-content-text'));info.append(content);
 const media=$('orderSummaryMedia');media.replaceChildren();overviewMediaLinks(media,order);
 const sync=$('orderSyncStatus');sync.replaceChildren();
 const files=order.media||[];
 if(files.length){
  sync.append(el('strong','Trạng thái lưu trữ và đồng bộ'));
  const drive=files.filter(f=>!!f.drive_file_id).length;
  sync.append(el('p',drive+'/'+files.length+' tệp có mã Google Drive. Các tệp còn lại vẫn được quản lý trên Qbooks.','hint'));
  for(const file of files){
   const state=file.drive_file_id?'Đã có trên Drive':file.sync_error?'Lỗi đồng bộ · hệ thống sẽ thử lại':Number(file.drive_offset)>0?'Đang chuyển Drive':'Đã lưu Qbooks · chờ Drive';
   const item=el('div',null,'qbook-sync-item');
   item.append(el('span',(uploadTaskLabels[file.stage]||file.stage)+' · '+(file.filename||'Tệp'),'qbook-sync-filename'),el('span',state,'qbook-sync-pill '+(file.drive_file_id?'qbook-sync-ok':file.sync_error?'qbook-sync-error':'qbook-sync-wait')));
   sync.append(item);
  }
 }
 $('editFromOrderDetail').hidden=!canEditOrder(order);
 if(typeof modal.showModal==='function')modal.showModal();else modal.hidden=false;
}
function renderOverview(){
 const r=state.overviewData;if(!r)return;
 const kpis=$('shippingKpis');kpis.replaceChildren();
 const cards=[['Tổng số đơn',r.totals.total,'all'],['Chờ đóng hàng',r.totals.waitingPacking,'pack'],['Chờ vận đơn',r.totals.waitingShipping,'ship'],['Đang giao',r.totals.moving,'moving'],['Hoàn thành',r.totals.completed,'done']];
 for(const [label,num,style] of cards){
  const card=el('div',null,'shipping-kpi '+style);card.append(el('small',label),el('strong',Number(num||0).toLocaleString('vi-VN')));kpis.append(card);
 }
 const serverPage=!!r.pagination;
 const term=$('overviewSearch').value.trim().toLocaleLowerCase('vi'),status=$('overviewStatus').value;
 const rows=serverPage?r.orders:r.orders.filter(o=>(!status||o.status===status)&&(!term||[o.id,o.invoice_codes,o.customer,o.sale_name].some(x=>String(x||'').toLocaleLowerCase('vi').includes(term))));
 const sort=$('overviewSort').value;
 if(!serverPage){
  const timestamp=o=>Date.parse(String(o.created_at||'').replace(' ','T')+'Z')||0;
  rows.sort((a,b)=>sort==='oldest'?timestamp(a)-timestamp(b):
   sort==='urgent'?Number(Boolean(b.urgent))-Number(Boolean(a.urgent))||timestamp(b)-timestamp(a):
   sort==='invoice'?String(a.invoice_codes||'').localeCompare(String(b.invoice_codes||''),'vi'):
   timestamp(b)-timestamp(a));
 }
 const size=Number($('overviewPageSize').value)||20;
 const matched=serverPage?Number(r.pagination.total||0):rows.length;
 const pages=serverPage?Number(r.pagination.pages||1):Math.max(1,Math.ceil(rows.length/size));
 state.overviewPage=Math.max(1,Math.min(pages,state.overviewPage||1));
 const start=(state.overviewPage-1)*size,visible=serverPage?rows:rows.slice(start,start+size);
 const table=$('overviewRows'),cardsHolder=$('overviewCards');table.replaceChildren();cardsHolder.replaceChildren();
 if(visible.length){for(const o of visible)appendOverviewRow(o,table,cardsHolder);}
 else{const td=el('td','Không tìm thấy đơn phù hợp.');td.colSpan=6;const tr=el('tr');tr.append(td);table.append(tr);cardsHolder.append(el('p','Không có đơn phù hợp.'));}
 $('overviewPageInfo').textContent='Trang '+state.overviewPage+'/'+pages+' · '+matched+' đơn phù hợp';
 $('overviewPrevPage').disabled=state.overviewPage<=1;
 $('overviewNextPage').disabled=state.overviewPage>=pages;
 $('overviewHint').textContent='Đang hiển thị '+visible.length+'/'+rows.length+' đơn phù hợp trong kỳ '+$('overviewPeriod').selectedOptions[0].textContent+'. '+(serverPage?'Đã tìm kiếm và phân trang trên toàn bộ dữ liệu có quyền xem.':'Chế độ tương thích: chỉ lọc trên dữ liệu đã tải.');
}
let overviewLoading=null,overviewController=null,overviewSerial=0;
state.overviewPage=1;
async function loadOverview(){
 overviewController?.abort();
 const controller=new AbortController(),serial=++overviewSerial;
 overviewController=controller;
 $('overviewHint').textContent='Đang đọc dữ liệu đơn và hồ sơ…';
 const params=new URLSearchParams({
  period:$('overviewPeriod').value,
  page:String(state.overviewPage||1),pageSize:$('overviewPageSize').value||'20',
  q:$('overviewSearch').value.trim(),
  status:$('overviewStatus').value,
  sort:$('overviewSort').value
 });
 overviewLoading=(async()=>{
  try{
   const r=await api('GET','/api/shipping/overview?'+params.toString(),null,false,controller.signal);
   if(controller.signal.aborted||serial!==overviewSerial)return;
   state.overviewData=r;renderOverview();
  }catch(e){
   if(controller.signal.aborted||e.name==='AbortError')return;
   $('overviewHint').textContent='Không tải được dữ liệu: '+e.message;
   throw e;
  }finally{if(serial===overviewSerial){overviewLoading=null;overviewController=null}}
 })();
 return overviewLoading;
}
function saleRecentCustomers(orders){
 const byName=new Map();
 for(const o of orders||[]){
  const name=String(o.customer||'').trim(),key=name.toLocaleLowerCase('vi');
  if(!name||byName.has(key))continue;
  byName.set(key,{name,address:String(o.address||''),carrier:String(o.carrier||'')});
 }
 return byName;
}
function refreshSaleSuggestions(){
 const list=$('saleCustomerOptions');if(!list)return;
 list.replaceChildren();
 for(const item of state.saleCustomerCache?.values()||[]){
  const option=document.createElement('option');option.value=item.name;list.append(option);
 }
}
function updateSaleCustomerHint(){
 const form=$('saleForm'),name=form?.elements.customer.value.trim().toLocaleLowerCase('vi');
 const suggestion=state.saleCustomerCache?.get(name);
 $('saleFillCustomer').disabled=!suggestion||(!suggestion.address&&!suggestion.carrier);
 $('saleCustomerHint').textContent=suggestion?
  'Đã tìm thấy khách hàng trong đơn được phép xem. Bấm nút để lấy lại địa chỉ/nhà xe.':
  'Không tìm thấy khách hàng trong danh sách đơn hiện tại.';
}
function checkSaleDuplicatePreview(){
 const invoice=String($('saleForm').elements.invoice_codes.value||'').replace(/\s/g,'').toLocaleUpperCase('vi');
 const duplicate=(state.orders||[]).find(o=>String(o.invoice_codes||'').replace(/\s/g,'').toLocaleUpperCase('vi')===invoice&&invoice);
 const warning=$('saleInvoiceWarning');
 warning.hidden=!duplicate;
 warning.textContent=duplicate?'Số hóa đơn này đã có trong danh sách: '+duplicate.invoice_codes+'. Kiểm tra trước khi lưu; hệ thống vẫn kiểm tra trùng trên máy chủ.':'';
}
let ordersLoadSerial=0;
async function loadOrders({signal}={}){
 const serial=++ordersLoadSerial,requestedTab=state.tab;
 const q=$('search').value.trim(),status=state.tab==='pack'?'CHỜ ĐÓNG HÀNG':state.tab==='ship'?'CHỜ VẬN ĐƠN':'';
 const r=await api('GET','/api/orders?q='+encodeURIComponent(q)+'&status='+encodeURIComponent(status),null,false,signal);
 if(signal?.aborted||serial!==ordersLoadSerial||state.tab!==requestedTab)return;
 state.orders=r.orders;
 if(state.tab==='sale'){state.saleCustomerCache=saleRecentCustomers(r.orders);refreshSaleSuggestions();updateSaleCustomerHint();checkSaleDuplicatePreview();}
 $('listTitle').textContent=state.tab==='pack'?'Đơn chờ đóng hàng':state.tab==='ship'?'Đơn chờ vận đơn':statusTitle[state.user.role]||'Đơn hàng';
 const list=$('orderList');list.replaceChildren();
 if(!r.orders.length)list.append(el('p','Chưa có đơn phù hợp.'));
 for(const o of r.orders)list.append(makeCard(o,()=>openOrder(o)));
 const saleList=$('saleOrdersList');if(saleList){
  saleList.replaceChildren();
  if(!r.orders.length)saleList.append(el('p','Chưa có đơn đã lên.','muted'));
  for(const order of r.orders){
   const row=el('article',null,'order');
   row.append(el('strong',order.invoice_codes||order.id),el('small',(order.customer||'')+' · '+(order.status||'')));
   row.append(button('Chi tiết đơn',()=>showOrderSummary(order),'secondary'));
   saleList.append(row);
  }
 }
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
 if(state.backgroundJob?.orderId===order.id)return notice('Đơn này đang tải video nền. Vui lòng theo dõi thanh trạng thái.');
 const r=capabilities(),pack=order.status==='CHỜ ĐÓNG HÀNG'&&r.pack,ship=order.status==='CHỜ VẬN ĐƠN'&&r.ship;
 if(!pack&&!ship)return notice('Không có quyền thực hiện với đơn này.');
 try{
  await releaseLocks();
  await api('POST','/api/orders/'+order.id+'/lock',{stage:pack?'DONG_HANG':'VAN_DON'});
  state.lockedOrderIds.add(order.id);
 }catch(e){return notice('Không lấy được khóa đơn: '+e.message);}
 state.selected=order;
 for(const id of ['invoicePics','goodsPics','videos','shippingPics'])$(id).value='';
 renderSelectedFiles();
 // Desktop follows the Figma split view: keep the pending-order list visible next to the form.
 show('ordersView',true);show('saleView',false);show('detailView',true);
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
  
  updateShippingTotal();
  showShippingGroup(order);
 }
 trackDraft(pack?$('packControls'):$('shipControls'));
 notice('');
}
function progress(file,done,total,background=false,dest='R2'){
 if(background&&state.backgroundJob){
  $('backgroundUploadBar').hidden=false;
  $('backgroundUploadTitle').textContent='Đang tải nền: '+file;
  $('backgroundUploadProgress').value=total?Math.min(100,Math.round(done/total*100)):0;
  $('backgroundUploadDetail').textContent=Math.round(done/1048576)+' / '+Math.round(total/1048576)+' MB đã truyền. Chưa thể đóng trình duyệt khi video chưa gửi đủ.';
 }
 $('progressWrap').hidden=false;$('uploadLabel').textContent='Đang tải: '+file;
 $('uploadProgress').value=Math.min(100,Math.round(done/total*100));
 $('uploadDetail').textContent=Math.round(done/1048576)+' / '+Math.round(total/1048576)+' MB đã ghi nhận tại '+dest;
}
// Uploads that the packer discarded (changed the selection or left the order) stop at the next part.
const cancelledUploadKeys=new Set(),uploadIdsByKey=new Map();
const cancelledError=()=>Object.assign(Error('Đã hủy tải video.'),{cancelled:true});
function fingerprint(orderId,stage,file){return 'qbooks_upload_v1|'+orderId+'|'+stage+'|'+file.name+'|'+file.size+'|'+file.lastModified}
// Videos recorded in-app are capped at 60 minutes by the recorder itself; WebM from
// MediaRecorder reports an infinite duration, so skip the metadata probe for them.
const recordedVideos=new WeakSet();
async function videoDuration(file){
 if(recordedVideos.has(file))return;
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
function uploadPhotoWithProgress(id,stage,file,background=false){
 // XMLHttpRequest exposes real upload bytes; fetch() does not expose request upload progress.
 return new Promise((resolve,reject)=>{
  const xhr=new XMLHttpRequest();
  xhr.open('PUT','/api/uploads/'+encodeURIComponent(id),true);
  xhr.setRequestHeader('authorization','Bearer '+state.token);
  xhr.timeout=150000;
  xhr.upload.onprogress=event=>{
   if(event.lengthComputable)progress(stage+' · '+file.name,event.loaded,event.total,background);
  };
  xhr.onerror=()=>reject(Error('Mất kết nối khi tải ảnh '+file.name+'. Có thể bấm Lưu để tiếp tục.'));
  xhr.ontimeout=()=>reject(Error('Tải ảnh '+file.name+' quá lâu. Kiểm tra tốc độ mạng và thử lại.'));
  xhr.onload=()=>{
   const result=(()=>{try{return JSON.parse(xhr.responseText)}catch{return {};}})();
   if(xhr.status<200||xhr.status>=300)return reject(Error(result.error||'Không lưu được ảnh: HTTP '+xhr.status));
   resolve(result);
  };
  xhr.send(file);
 });
}
// ---- Packing video: browser → Google Drive resumable session (opened by the server) ----
// Drive accepts a session's bytes strictly in order, so parts are sequential but large
// (32 MB) and go straight to Google without passing through the Worker.
function driveSessionPut(sessionUrl,headers,body,onProgress){
 return new Promise((resolve,reject)=>{
  const xhr=new XMLHttpRequest();
  xhr.open('PUT',sessionUrl,true);
  for(const [k,v] of Object.entries(headers))xhr.setRequestHeader(k,v);
  xhr.timeout=600000;
  if(onProgress)xhr.upload.onprogress=e=>{if(e.lengthComputable)onProgress(e.loaded)};
  xhr.onerror=()=>reject(Object.assign(Error('Mất kết nối tới Google Drive.'),{retry:true}));
  xhr.ontimeout=()=>reject(Object.assign(Error('Google Drive phản hồi quá chậm.'),{retry:true}));
  xhr.onload=()=>resolve({status:xhr.status,range:xhr.getResponseHeader('Range'),text:xhr.responseText});
  xhr.send(body);
 });
}
function driveOffset(res,total){
 if(res.status===200||res.status===201){let d={};try{d=JSON.parse(res.text)}catch{}return {done:true,offset:total,fileId:d.id||null};}
 if(res.status===308){
  const m=/^bytes=0-(\d+)$/.exec(res.range||'');
  const offset=m?Number(m[1])+1:0;
  if((res.range&&!m)||!Number.isSafeInteger(offset)||offset<0||offset>total)throw Error('Google Drive trả tiến độ không hợp lệ.');
  return {done:false,offset};
 }
 if(res.status===404||res.status===410)throw Object.assign(Error('Phiên tải Google Drive đã hết hạn. Bấm Lưu lại để tải video từ đầu.'),{expired:true});
 throw Object.assign(Error('Google Drive lỗi HTTP '+res.status),{retry:res.status>=500||res.status===429});
}
async function uploadVideoToDrive(file,info,background,cancelKey){
 const url=info.sessionUrl,total=file.size,chunk=info.chunkSize||32*1024*1024,dest='Google Drive';
 if(!/^https:\/\/(www\.googleapis\.com|content-googleapis\.com)\/upload\/drive\//.test(String(url||'')))throw Error('Phiên tải Google Drive không hợp lệ.');
 const probe=async()=>driveOffset(await driveSessionPut(url,{'Content-Range':'bytes */'+total},null),total);
 let state_=await probe(),failures=0;
 progress(file.name,state_.offset,total,background,dest);
 while(!state_.done){
  if(cancelKey&&cancelledUploadKeys.has(cancelKey))throw cancelledError();
  const start=state_.offset,end=Math.min(start+chunk,total);
  try{
   const res=await driveSessionPut(url,{'Content-Range':'bytes '+start+'-'+(end-1)+'/'+total},file.slice(start,end),
    loaded=>progress(file.name,start+loaded,total,background,dest));
   const next=driveOffset(res,total);
   if(!next.done&&(next.offset<start||next.offset>end))throw Error('Google Drive trả tiến độ không hợp lệ.');
   if(!next.done&&next.offset<=start&&++failures>4)throw Error('Google Drive không nhận thêm dữ liệu ở '+Math.round(start/1048576)+' MB.');
   state_=next;if(next.offset>start)failures=0;
  }catch(e){
   if(e.expired)throw e;
   if(!e.retry||++failures>4)throw Error('Tải video lên Google Drive gián đoạn: '+e.message);
   await new Promise(r=>setTimeout(r,1500*failures));
   // Ask Drive how much it really stored before resending.
   const confirmed=await probe().catch(err=>{if(err.expired||!err.retry)throw err;return state_;});
   if(!confirmed.done&&confirmed.offset<start)throw Error('Google Drive trả tiến độ không hợp lệ.');
   state_=confirmed;
  }
  progress(file.name,state_.offset,total,background,dest);
 }
 return state_.fileId;
}
async function uploadOne(orderId,stage,file,background=false){
 const video=stage==='VIDEO_DONG_HANG',max=video?2*1024*1024*1024:25*1024*1024;
 if(!file.size||file.size>max)throw Error('Tệp '+file.name+' vượt giới hạn '+(video?'2 GB':'25 MB'));
 if(video)await videoDuration(file);
 const key=fingerprint(orderId,stage,file);let id=localStorage.getItem(key);
 let info;
 if(id){try{info=await api('GET','/api/uploads/'+id);if((info.bytes!==undefined&&info.bytes!==file.size)||!['UPLOADING','COMPLETE'].includes(info.status))id=null}
 catch(e){if(/Không tìm thấy phiên tải/.test(e.message))id=null;else throw e}}
 if(!id){
  const result=await api('POST','/api/uploads',{orderId,stage,filename:file.name,contentType:file.type|| (video?'video/mp4':'image/jpeg'),size:file.size});
  id=result.id;localStorage.setItem(key,id);info={status:'UPLOADING',chunkSize:result.chunkSize,transport:result.transport,sessionUrl:result.sessionUrl,parts:[]};
 }
 uploadIdsByKey.set(key,id);
 // Keep the fingerprint until the order commit succeeds. Retrying a failed pack
 // must reuse completed files instead of creating duplicate Drive/R2 objects.
 if(info.status==='COMPLETE'){progress(file.name,file.size,file.size,background,info.transport==='drive'?'Google Drive':'R2');return id}
 if(!video){
  progress(stage+' · '+file.name,0,file.size,background);await uploadPhotoWithProgress(id,stage,file,background);
  progress(file.name,file.size,file.size,background);return id;
 }
 if(info.transport==='drive'){
  let fileId=null;
  try{fileId=await uploadVideoToDrive(file,info,background,key);}
  catch(e){
   if(!e.expired)throw e;
   // Reuse the D1 record: abandoning it would leave an UPLOADING row that
   // prevents packing forever, even after a replacement file has completed.
   const restarted=await api('POST','/api/uploads/'+id+'/restart-drive',{});
   fileId=await uploadVideoToDrive(file,restarted,background);
  }
  await api('POST','/api/uploads/'+id+'/complete',{fileId});
  progress(file.name,file.size,file.size,background,'Google Drive');
  return id;
 }
 const chunk=info.chunkSize||CHUNK_BYTES;
 const count=Math.ceil(file.size/chunk),parts=new Set((info.parts||[]).map(p=>p.part_number));
 let done=Math.min(file.size,info.parts.reduce((sum,p)=>sum+p.bytes,0));
 progress(file.name,done,file.size,background);
 // R2 multipart accepts parts in any order: send several at once so one slow
 // round-trip (browser → Worker → R2) no longer blocks the whole connection.
 const queue=[];for(let n=1;n<=count;n++)if(!parts.has(n))queue.push(n);
 let failed=null;
 const sendParts=async()=>{
  while(queue.length&&!failed){
   if(cancelledUploadKeys.has(key)){failed=cancelledError();throw failed;}
   const n=queue.shift(),start=(n-1)*chunk,end=Math.min(start+chunk,file.size),piece=file.slice(start,end);
   let retries=0;
   while(!failed){
    try{await api('PUT','/api/uploads/'+id+'/parts/'+n,piece,true);break;}
    catch(e){if(++retries>=4){failed=Error('Tải video gián đoạn ở phần '+n+'/'+count+': '+e.message);throw failed;}await new Promise(r=>setTimeout(r,900*retries));}
   }
   if(failed)return;
   done+=piece.size;progress(file.name,done,file.size,background);
  }
 };
 await Promise.all(Array.from({length:Math.min(VIDEO_PART_CONCURRENCY,queue.length)},sendParts));
 if(failed)throw failed;
 await api('POST','/api/uploads/'+id+'/complete',{});
 progress(file.name,file.size,file.size,background);
 return id;
}
const uploadTaskRecords=new Map();
function clearUploadTasks(){uploadTaskRecords.clear();const panel=$('qbookUploadActivity');if(panel)panel.hidden=true;const list=$('qbookUploadItems');if(list)list.replaceChildren();}
const uploadTaskLabels={ANH_HOA_DON:'Ảnh hóa đơn',HANG_HOA:'Ảnh hàng hóa',GIAO_HANG:'Ảnh bàn giao',VIDEO_DONG_HANG:'Video đóng hàng'};
function updateUploadTask(orderId,stage,file,status,detail=''){
 const id=fingerprint(orderId,stage,file);
 const previous=uploadTaskRecords.get(id)||{};
 uploadTaskRecords.set(id,{name:file.name,stage,orderId,status,detail,updated:Date.now(),...previous,status,detail});
 // Bound this in-memory UI to avoid unlimited growth on long-running operator sessions.
 if(uploadTaskRecords.size>30)uploadTaskRecords.delete(uploadTaskRecords.keys().next().value);
 const panel=$('qbookUploadActivity'),list=$('qbookUploadItems'),summary=$('qbookUploadSummary');
 if(!panel||!list||!summary)return;
 panel.hidden=false;list.replaceChildren();
 const records=[...uploadTaskRecords.values()].reverse();
 const done=records.filter(x=>x.status==='STORED').length,errors=records.filter(x=>x.status==='ERROR').length;
 summary.textContent='Đã lưu '+done+'/'+records.length+' tệp vào Qbooks'+(errors?' · '+errors+' tệp cần thử lại':'')+'.';
 for(const rec of records){
  const row=el('div',null,'qbook-upload-item');
  const caption=el('span',(uploadTaskLabels[rec.stage]||rec.stage)+' · '+rec.name,'qbook-upload-filename');
  const message=rec.status==='STORED'?'Đã lưu tệp · đối chiếu Drive tại Tổng hợp':rec.status==='ERROR'?'Tải lỗi · chọn lại tệp, bấm Lưu để thử lại':rec.status==='SENDING'?'Đang gửi dữ liệu lên máy chủ':'Đang chờ tải';
  const stateLabel=el('span',message,'qbook-upload-state qbook-upload-'+rec.status.toLowerCase());
  if(rec.detail)stateLabel.title=rec.detail;
  row.append(caption,stateLabel);list.append(row);
 }
}
$('qbookUploadCollapse').onclick=()=>{
 const list=$('qbookUploadItems'),open=!list.hidden;
 list.hidden=open;$('qbookUploadCollapse').textContent=open?'Mở danh sách':'Thu gọn';
 $('qbookUploadCollapse').setAttribute('aria-expanded',String(!open));
};
async function uploadSelection(orderId,items,background=false){
 // Photos use independent R2 objects. Allow up to 3 uploads concurrently instead
 // of blocking on every image. Preserve video sequential upload to limit bandwidth.
 const uploaded=new Array(items.length),photos=[],videos=[];
 items.forEach(([stage,file],index)=>{
  (stage==='VIDEO_DONG_HANG'?videos:photos).push(index);
  updateUploadTask(orderId,stage,file,'QUEUED');
 });
 const tracked=async(stage,file)=>{
  updateUploadTask(orderId,stage,file,'SENDING');
  try{
   const id=await uploadOne(orderId,stage,file,background);
   updateUploadTask(orderId,stage,file,'STORED');
   return id;
  }catch(e){
   updateUploadTask(orderId,stage,file,'ERROR',e.message);
   throw e;
  }
 };
 let next=0,complete=0;
 const runPhoto=async()=>{
  while(next<photos.length){
   const i=photos[next++],[stage,file]=items[i];
   const id=await tracked(stage,file);
   uploaded[i]={id,stage,filename:file.name};
   $('uploadLabel').textContent='Đã lưu '+(++complete)+'/'+items.length+' tệp vào Qbooks';
  }
 };
 await Promise.all(Array.from({length:Math.min(3,photos.length)},()=>runPhoto()));
 for(const i of videos){
  const [stage,file]=items[i],id=await tracked(stage,file);
  uploaded[i]={id,stage,filename:file.name};
  $('uploadLabel').textContent='Đã lưu '+(++complete)+'/'+items.length+' tệp vào Qbooks';
 }
 return uploaded;
}
function v(id){return $(id).value.trim()}
const selectedPreviewUrls=[];
function clearSelectedFilePreviews(){
 for(const url of selectedPreviewUrls)URL.revokeObjectURL(url);
 selectedPreviewUrls.length=0;
}
function renderSelectedFiles(){
 clearSelectedFilePreviews();
 const groups=[['invoicePics','Ảnh hóa đơn','packFilePreview'],['goodsPics','Ảnh hàng hóa','packFilePreview'],
  ['videos','Video đóng hàng','packFilePreview'],['shippingPics','Ảnh bàn giao','shipFilePreview']];
 const byTarget=new Map([['packFilePreview',[]],['shipFilePreview',[]]]);
 for(const [inputId,stage,targetId] of groups)for(const file of $(inputId).files||[])byTarget.get(targetId).push({stage,file});
 for(const [id,items] of byTarget){
  const node=$(id);if(!node)continue;node.replaceChildren();
  if(!items.length){node.textContent=id==='packFilePreview'?'Chưa chọn tệp đóng hàng.':'Chưa chọn ảnh bàn giao.';continue;}
  const mb=items.reduce((n,x)=>n+x.file.size,0)/1048576;
  node.append(el('strong','Đã chọn '+items.length+' tệp · '+mb.toFixed(1)+' MB'));
  for(const {stage,file} of items.slice(0,12)){
   const row=el('div',null,'qbook-selected-file');
   if(file.type.startsWith('image/')){
    const url=URL.createObjectURL(file);selectedPreviewUrls.push(url);
    const image=document.createElement('img');image.src=url;image.alt='Xem trước '+file.name;image.loading='lazy';row.append(image);
   }
   row.append(el('span',stage+' · '+file.name+' · '+(file.size/1048576).toFixed(1)+' MB'));node.append(row);
  }
  if(items.length>12)node.append(el('small','Còn '+(items.length-12)+' tệp khác đã chọn.'));
 }
}
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
// ---- Start sending packing videos the moment they are picked ----------------------------
// The phone first copies/converts the video into the browser ("loading"); afterwards the
// upload runs while the packer fills in boxes/notes, so LƯU only has to finish the tail.
function startVideoPreUpload(){
 const order=state.selected;
 if(!order||state.tab!=='pack'||order.status!=='CHỜ ĐÓNG HÀNG')return;
 const items=[...($('videos').files||[])].map(f=>['VIDEO_DONG_HANG',f]);
 const keys=items.map(([stage,file])=>fingerprint(order.id,stage,file));
 const current=state.preUpload;
 if(current&&current.orderId===order.id&&current.keys.join('\n')===keys.join('\n'))return;
 const previous=current?cancelPreUpload(current):Promise.resolve();
 if(!items.length||state.backgroundJob)return; // another order's video is still in the background
 const job={orderId:order.id,items,keys,done:false,error:null};
 job.promise=previous.then(()=>uploadSelection(order.id,items,true))
  .then(r=>{job.done=true;return r},e=>{job.error=e;throw e});
 job.settled=job.promise.catch(()=>{});
 state.preUpload=job;
 const status=$('packingDriveStatus');if(status)status.textContent='Video đang được tải lên ngay khi chọn. Bạn cứ điền tiếp các mục khác rồi bấm LƯU.';
}
async function cancelPreUpload(job=state.preUpload){
 if(!job)return;
 if(state.preUpload===job)state.preUpload=null;
 for(const k of job.keys)cancelledUploadKeys.add(k);
 await job.settled;
 const ids=[];
 for(const k of job.keys){const id=uploadIdsByKey.get(k)||localStorage.getItem(k);if(id)ids.push(id);localStorage.removeItem(k);uploadIdsByKey.delete(k);cancelledUploadKeys.delete(k);}
 await Promise.allSettled(ids.map(id=>api('DELETE','/api/uploads/'+id)));
}
// ---- In-app 720p recorder ------------------------------------------------------------------
// Phone camera apps record 1080p/4K at 10–50 Mbps (a 4-minute clip ≈ 465 MB, often kept in
// iCloud). Recording here at 720p/~2 Mbps gives ≈ 15 MB per minute, stored locally, so the
// "loading" step disappears and the upload (which starts immediately) takes seconds.
const RECORDER_MAX_MS=60*60*1000,RECORDER_BITRATE=2000000;
const recorder={stream:null,media:null,chunks:[],bytes:0,started:0,timer:null};
function recorderMime(){
 const list=['video/mp4;codecs=avc1.42E01E,mp4a.40.2','video/mp4','video/webm;codecs=vp9,opus','video/webm;codecs=vp8,opus','video/webm'];
 return list.find(t=>window.MediaRecorder?.isTypeSupported?.(t))||'';
}
function recorderError(message){const n=$('recorderError');n.textContent=message;n.hidden=!message;}
function recorderReset(){
 clearInterval(recorder.timer);recorder.timer=null;
 recorder.stream?.getTracks().forEach(t=>t.stop());
 recorder.stream=null;recorder.media=null;recorder.chunks=[];recorder.bytes=0;
 $('recorderPreview').srcObject=null;$('recorderDot').hidden=true;
 $('recorderStart').hidden=false;$('recorderStop').hidden=true;$('recorderTime').textContent='00:00';$('recorderSize').textContent='0 MB';
}
async function openRecorder(){
 if(!navigator.mediaDevices?.getUserMedia||!window.MediaRecorder){$('videos').click();return;} // old browser: normal picker
 recorderError('');
 try{
  recorder.stream=await navigator.mediaDevices.getUserMedia({audio:true,video:{facingMode:{ideal:'environment'},width:{ideal:1280},height:{ideal:720},frameRate:{ideal:30,max:30}}});
 }catch(e){
  recorderReset();
  alert('Không mở được camera. Hãy cho phép QBooks dùng camera và micro, hoặc chọn video có sẵn.');
  return;
 }
 $('recorderPreview').srcObject=recorder.stream;
 $('recorderDialog').showModal();
}
function startRecording(){
 const mimeType=recorderMime();
 try{recorder.media=new MediaRecorder(recorder.stream,{...(mimeType?{mimeType}:{}),videoBitsPerSecond:RECORDER_BITRATE,audioBitsPerSecond:64000});}
 catch{recorderError('Trình duyệt không hỗ trợ quay video. Hãy chọn video có sẵn.');return;}
 recorder.chunks=[];recorder.bytes=0;recorder.started=Date.now();
 recorder.media.ondataavailable=e=>{if(e.data?.size){recorder.chunks.push(e.data);recorder.bytes+=e.data.size;}};
 recorder.media.onstop=finishRecording;
 recorder.media.start(1000);
 $('recorderStart').hidden=true;$('recorderStop').hidden=false;$('recorderDot').hidden=false;
 recorder.timer=setInterval(()=>{
  const ms=Date.now()-recorder.started,sec=Math.floor(ms/1000);
  $('recorderTime').textContent=String(Math.floor(sec/60)).padStart(2,'0')+':'+String(sec%60).padStart(2,'0');
  $('recorderSize').textContent=(recorder.bytes/1048576).toFixed(1)+' MB';
  if(ms>=RECORDER_MAX_MS)recorder.media?.stop();
 },500);
}
function finishRecording(){
 const type=(recorder.media?.mimeType||recorderMime()||'video/webm').split(';')[0];
 const blob=new Blob(recorder.chunks,{type});
 recorderReset();$('recorderDialog').close();
 if(!blob.size){alert('Video rỗng, vui lòng quay lại.');return;}
 const code=String(String(state.selected?.invoice_codes||'').split(/[,;\s]+/)[0]||state.selected?.id||'DON').replace(/[^\w-]/g,'').slice(0,40)||'DON';
 const stamp=new Date().toISOString().replace(/[-:]/g,'').slice(0,15);
 const file=new File([blob],'QBOOKS_'+code+'_'+stamp+(type.includes('mp4')?'.mp4':'.webm'),{type,lastModified:Date.now()});
 recordedVideos.add(file);
 const input=$('videos'),list=new DataTransfer();
 for(const f of input.files||[])list.items.add(f);
 list.items.add(file);
 input.files=list.files;
 input.dispatchEvent(new Event('change',{bubbles:true})); // shows the file and starts the upload right away
}
function cancelRecording(){
 if(recorder.media&&recorder.media.state!=='inactive'){recorder.media.onstop=null;recorder.media.stop();}
 recorderReset();$('recorderDialog').close();
}
async function savePack(){
 if(state.saving||!state.selected)return;
 
 const order=state.selected,id=order.id,uploads=[];
 for(const f of $('invoicePics').files)uploads.push(['ANH_HOA_DON',f]);
 for(const f of $('goodsPics').files)uploads.push(['HANG_HOA',f]);
 for(const f of $('videos').files)uploads.push(['VIDEO_DONG_HANG',f]);
 const payload={boxes:Number($('boxes').value),nguoiDongCung:$all('.packHelperChoice:checked').map(x=>x.value),note:$('packNote').value};
 const hasVideo=uploads.some(([stage])=>stage==='VIDEO_DONG_HANG');
 if(state.backgroundJob&&(hasVideo||state.backgroundJob.orderId===id))return notice('Đang có video tải nền. Bạn có thể tiếp tục đóng đơn khác không kèm video.');
 if(!hasVideo){
  setBusy(true);
  try{
   const saved=await uploadSelection(id,uploads);
   await api('POST','/api/orders/'+id+'/pack',payload);
   for(const [stage,file] of uploads)localStorage.removeItem(fingerprint(id,stage,file));
   state.lockedOrderIds.delete(id);markDraftSaved($('packControls'));
   notice('Đã hoàn thành đóng hàng, '+saved.length+' tệp đã lưu R2.',true);
   show('detailView',false);show('ordersView',true);await loadOrders();
  }catch(e){notice('Chưa lưu được đóng hàng: '+e.message);showFormError($('packControls'),e.message);}
  finally{setBusy(false);}
  return;
 }
 // Files stay referenced by this in-page task; it survives SPA menu switches,
 // NOT browser/tab termination. Multipart upload IDs enable safe manual resume.
 state.backgroundJob={orderId:id,filename:uploads.filter(x=>x[0]==='VIDEO_DONG_HANG').map(x=>x[1].name).join(', '),status:'RUNNING'};
 $('backgroundUploadBar').hidden=false;
 $('backgroundUploadProgress').value=0;
 $('backgroundUploadTitle').textContent='Đang tải nền video cho đơn '+(order.invoice_codes||id);
 $('backgroundUploadDetail').textContent='Đang gửi video lên nơi lưu trữ. Có thể chuyển menu Qbooks, nhưng KHÔNG đóng tab/Safari trước khi thấy CÓ THỂ ĐÓNG TRÌNH DUYỆT.';
 markDraftSaved($('packControls'));
 notice('Đang tải video nền: có thể dùng menu Qbooks khác nhưng chưa được đóng trình duyệt.',true);
 // Deliberately not awaited: render/navigation continue while upload runs.
 const pre=state.preUpload?.orderId===id?state.preUpload:null;
 const preKeys=new Set(pre?pre.keys:[]);
 void (async()=>{
  try{
   // Videos already sent since they were picked are not sent again.
   let preSaved=[],rest=uploads.filter(([stage,file])=>!preKeys.has(fingerprint(id,stage,file)));
   if(pre){try{preSaved=await pre.promise;}catch(e){if(e.cancelled)throw e;preSaved=[];rest=uploads;}}
   const saved=[...preSaved,...await uploadSelection(id,rest,true)];
   // Keep the warning until both file storage and the packing record are committed.
   $('backgroundUploadProgress').value=100;
   $('backgroundUploadTitle').textContent='Video đã tải đủ – đang lưu đóng hàng';
   $('backgroundUploadDetail').textContent='Chưa đóng trình duyệt cho đến khi lưu đơn thành công.';
   await api('POST','/api/orders/'+id+'/pack',payload);
   for(const [stage,file] of uploads)localStorage.removeItem(fingerprint(id,stage,file));
   state.lockedOrderIds.delete(id);
   $('backgroundUploadTitle').textContent='Đã lưu đóng hàng '+(order.invoice_codes||id)+' – CÓ THỂ ĐÓNG TRÌNH DUYỆT';
   $('backgroundUploadDetail').textContent='Đã xác nhận lưu '+saved.length+' tệp. Video tải thẳng Drive đã được kiểm tra; tệp còn trên R2 sẽ chờ Worker đồng bộ nếu được bật.';
   if(state.area==='orders'&&state.tab==='pack'&&state.selected?.id===id){
    show('detailView',false);show('ordersView',true);
    await loadOrders().catch(()=>{});
   }
  }catch(e){
   $('backgroundUploadTitle').textContent='Tải nền chưa hoàn thành: '+(order.invoice_codes||id);
   $('backgroundUploadDetail').textContent=e.message+' · Video chưa xác nhận hoàn tất: mở lại đơn và chọn lại tệp để tiếp tục.';
   notice('Tải video nền gặp lỗi: '+e.message);
   state.lockedOrderIds.delete(id);
   await api('DELETE','/api/orders/'+id+'/lock').catch(()=>{});
  }finally{state.backgroundJob=null;if(state.preUpload===pre)state.preUpload=null;}
 })();
}
async function saveShip(){
 if(state.saving||!state.selected)return;
 
 let saved=false;
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
   tienShip:costs[0],hangNang:costs[1],phiBen:costs[2],phuPhi:costs[3],status:'HOÀN THÀNH',note:v('shippingNote')});saved=true;
  for(const [stage,file] of uploads)localStorage.removeItem(fingerprint(id,stage,file));
  for(const key of orderIds)state.lockedOrderIds.delete(key);
  markDraftSaved($('shipControls'));
  notice('Đã lưu vận đơn. '+uploaded.length+' tệp đã ghi R2. Chuyển Drive khi Worker được kích hoạt; chỉ xóa R2 sau khi xác minh đủ tệp. Dữ liệu Sheets đồng bộ riêng.',true);
  show('detailView',false);show('ordersView',true);await loadOrders();
 }catch(e){
  if(saved){notice('Vận đơn đã lưu, nhưng chưa tải lại được danh sách: '+humanizeError(e.message),true);return;}
  const msg='Chưa lưu vận đơn: '+e.message;notice(msg);
  if(/loại ship/i.test(e.message))showFieldError($('shipControls'),'shippingType',e.message);
  else if(/tên ship/i.test(e.message))showFieldError($('shipControls'),'shippingPerson',e.message);
  else if(/phí/i.test(e.message))showFormError($('shipControls'),e.message);
 }
 finally{setBusy(false)}
}
async function loadGroupOptions(){
 try{
  const r=await api('GET','/api/orders');const list=$('groupList');list.replaceChildren();
  const options=r.orders.filter(o=>o.source_system==='D1'&&(state.user.role==='SHIPPER'?o.status==='CHỜ VẬN ĐƠN':['CHỜ ĐÓNG HÀNG','CHỜ VẬN ĐƠN'].includes(o.status)&&!o.group_id));
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
$('loginForm').addEventListener('submit',async e=>{e.preventDefault();const b=Object.fromEntries(new FormData(e.target));try{await login(b.email,b.pin,!!$('rememberLogin')?.checked)}catch(error){notice(error.message)}});
$('logoutBtn').onclick=async()=>{if(state.backgroundJob)return notice('Video đang tải nền. Chờ hoàn thành trước khi đăng xuất.');if(!confirmLeave())return;await releaseLocks();try{await api('POST','/api/logout',{})}catch{}state.token='';state.user=null;state.orders=[];state.overviewData=null;state.selected=null;state.sheetReadToken=null;state.sheetReadUntil=0;state.googleWriteToken=null;state.googleWriteUntil=0;state.operationalDriveToken=null;state.operationalDriveUntil=0;state.driveBrowseToken=null;state.driveBrowseUntil=0;state.googleDriveRoot=null;state.menuKeys=[];state.area='orders';state.mediaView='dashboard';window.QbookMedia?.reset();clearSelectedFilePreviews();clearUploadTasks();clearLoginSession();window.history.replaceState(null,'',window.location.pathname);const skip=$('qbSkipLink');if(skip)skip.href='#loginPage';show('loginPage',true);show('appPage',false);$('logoutBtn').hidden=true;};
let orderSearchTimer=null,orderSearchController=null;
$('search').addEventListener('input',()=>{
 clearTimeout(orderSearchTimer);orderSearchController?.abort();
 const controller=new AbortController();orderSearchController=controller;
 const initialTab=state.tab;
 orderSearchTimer=setTimeout(()=>{
  if(controller.signal.aborted||state.tab!==initialTab)return;
  loadOrders({signal:controller.signal}).catch(e=>{if(e.name!=='AbortError')notice(e.message)});
 },300);
});
$('reloadBtn').onclick=()=>loadOrders().catch(e=>notice(e.message));
$('backBtn').onclick=()=>{if(!confirmLeave())return;markDraftSaved($('packControls'));markDraftSaved($('shipControls'));tab(state.tab);};
$('savePacking').onclick=savePack;$('saveShipping').onclick=saveShip;
['invoicePics','goodsPics','videos','shippingPics'].forEach(id=>$(id).addEventListener('change',renderSelectedFiles));
$('videos').addEventListener('change',startVideoPreUpload);
$('recordVideoBtn').addEventListener('click',openRecorder);
$('recorderStart').addEventListener('click',startRecording);
$('recorderStop').addEventListener('click',()=>recorder.media?.stop());
$('recorderCancel').addEventListener('click',cancelRecording);
$('recorderDialog').addEventListener('cancel',e=>{e.preventDefault();cancelRecording();});
['shippingFee','heavyFee','terminalFee','extraFee'].forEach(id=>$(id).addEventListener('input',updateShippingTotal));
$('saleDeliveryMode').onchange=()=>{const timed=$('saleDeliveryMode').value==='THOI_GIAN';$('saleDeliveryTimeBox').hidden=!timed;$('saleDeliveryTime').required=timed;if(!timed)$('saleDeliveryTime').value='';};
$('saleForm').elements.customer.addEventListener('input',updateSaleCustomerHint);
$('saleForm').elements.invoice_codes.addEventListener('input',checkSaleDuplicatePreview);
$('saleFillCustomer').onclick=()=>{
 const form=$('saleForm'),item=state.saleCustomerCache?.get(form.elements.customer.value.trim().toLocaleLowerCase('vi'));
 if(!item)return;
 // Never overwrite typed data without explicit operator action.
 if(item.address)form.elements.address.value=item.address;
 if(item.carrier)form.elements.carrier.value=item.carrier;
 $('saleCustomerHint').textContent='Đã điền địa chỉ/nhà xe từ đơn gần đây. Kiểm tra lại trước khi lưu.';
};
$('saleForm').addEventListener('submit',async e=>{
 e.preventDefault();
 const form=e.target,submit=form.querySelector('button[type=submit],button:not([type])');
 if(submit?.disabled)return;
 let saved=false;
 const f=Object.fromEntries(new FormData(form));f.urgent=f.delivery_mode==='GAP';
  if(!f.delivery_mode)return showFieldError(form,'delivery_mode','Chọn GẤP hoặc thời gian giao.');
  if(f.delivery_mode==='THOI_GIAN'&&!f.delivery_time)return showFieldError(form,'delivery_time','Cần chọn ngày giờ giao.');
  if(!f.transport)return showFieldError(form,'transport','Cần chọn loại vận chuyển.');
 if(!String(f.invoice_codes||'').trim())return showFieldError(form,'invoice_codes','Cần nhập ít nhất một mã hóa đơn.');
 if(!String(f.customer||'').trim())return showFieldError(form,'customer','Nhập tên khách hàng trước khi lưu.');
 if(!Number.isSafeInteger(Number(f.quantity))||Number(f.quantity)<1)return showFieldError(form,'quantity','Số quyển phải là số nguyên lớn hơn 0.');
 if(submit){submit.disabled=true;submit.textContent='ĐANG LƯU ĐƠN…';}
 try{
  await api('POST','/api/orders',f);saved=true;
  form.reset();updateSaleCustomerHint();checkSaleDuplicatePreview();$('saleDeliveryTimeBox').hidden=true;$('saleDeliveryTime').required=false;
  markDraftSaved(form);
  notice('Đã tạo đơn Sale trên D1. Đơn sẵn sàng chuyển Đóng hàng; chưa tự ghi sang Google Sheets.',true);
  await loadGroupOptions();await loadOrders();
 }catch(err){
  if(saved){notice('Đơn đã được lưu thành công, nhưng chưa cập nhật được danh sách: '+humanizeError(err.message),true);return;}
  notice(err.message);
  if(/trùng|duplicate|đã tồn tại|mã hóa đơn/i.test(err.message))showFieldError(form,'invoice_codes',err.message);
  else showFormError(form,err.message);
 }finally{if(submit){submit.disabled=false;submit.textContent='LƯU ĐƠN SALE';}}
});
$('saveMenuPermissions').onclick=saveStaffMenuPermissions;
$('createGroup').onclick=async()=>{const orderIds=$all('.groupCheck:checked').map(c=>c.value);try{const r=await api('POST','/api/groups',{orderIds});notice('Đã tạo nhóm '+r.groupId,true);await loadGroupOptions()}catch(e){notice(e.message)}};
$('staffForm').addEventListener('submit',async e=>{e.preventDefault();const f=e.target;const data=Object.fromEntries(new FormData(f));const pinInput=f.querySelector('input[name="pin"]');data.pin=String(pinInput?.value??data.pin??'').trim();data.dongHang=f.elements.dongHang.checked;data.vanDon=f.elements.vanDon.checked;data.admin=f.elements.admin.checked;data.active=f.elements.active.checked;data.unlock=!!f.elements.unlock?.checked;if((!state.editStaffId||data.pin)&&!/^\d{6,8}$/.test(data.pin))return showFieldError(f,'pin','Mã PIN mới phải gồm 6–8 chữ số từ 0 đến 9.');if(data.role==='VIEW'){data.dongHang=false;data.vanDon=false;data.admin=false;}try{const r=state.editStaffId?await api('PATCH','/api/users/'+state.editStaffId,data):await api('POST','/api/users',data);notice('Đã lưu nhân sự '+data.name+(r.sessionsRevoked?' · đã đăng xuất người này trên mọi thiết bị':''),true);const savedId=r.id;const savedName=data.name;const savedRole=data.role;resetStaffEdit();await loadStaffUsers();await loadStaffMenuPermissions(savedId,savedName,savedRole);}catch(err){notice(err.message);showFormError(f,err.message)}});
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
  const syncBlocked=waiting>0&&(!last||last.status==='DISABLED');
  status.classList.toggle('qbook-sync-warning',syncBlocked);
  status.textContent=(syncBlocked?'CẢNH BÁO: '+waiting+' tệp chưa đồng bộ Drive, tác vụ định kỳ chưa hoạt động hoặc đang tắt. Tệp vẫn lưu trên R2; cần quản trị cấu hình Worker và Google Refresh Token. ':'')+
   'D1: '+r.orders.length+' đơn chờ ghi Sheets · R2: '+waiting+' tệp chưa chuyển Drive · '+
   (r.auto?.moved||0)+' tệp đã xác minh Drive và dọn khỏi R2 · '+(r.auto?.awaitingR2Cleanup||0)+' tệp trên Drive chưa dọn R2. '+
   (last?'Lần chạy tự động gần nhất: '+last.started_at+' ('+last.status+').':
   'Chưa ghi nhận lần chạy tự động; kiểm tra quyền Google ngoại tuyến và trạng thái Worker.');

  const pendingFiles=r.uploads.filter(u=>!u.drive_file_id),errored=pendingFiles.filter(u=>u.auto_error);
  const summary=$('syncSummary');summary.replaceChildren();
  for(const [label,value,bad] of [['Chờ lên Drive',pendingFiles.length,false],['Đang lỗi (tự thử lại)',errored.length,errored.length>0],['Đã lên Drive',r.uploads.length-pendingFiles.length,false],['Đơn chờ ghi DATA_TONG',r.orders.length,false]]){
   const box=el('div',null,bad?'bad':'');box.append(el('strong',String(value)),el('span',label));summary.append(box);
  }
  $('syncRetryAll').disabled=!errored.length;
  const media=$('syncUploads');media.replaceChildren();
  const visible=$('syncShowDone').checked?r.uploads:pendingFiles;
  if(!visible.length)media.append(el('p',r.uploads.length?'Tất cả tệp gần đây đã lên Google Drive.':'Không có ảnh/video mới cần kiểm tra.'));
  for(const file of visible){
   const div=el('div',null,'order');
   const label=el('div',(file.order_id+' · '+file.stage+' · '+file.filename+' · '+(file.bytes/1048576).toFixed(1)+' MB'));
   const span=el('span',file.r2_deleted_at?'Đã chuyển Drive · Đã dọn R2':file.r2_delete_error?'Lỗi dọn R2 – vẫn giữ bản gốc':file.drive_file_id?'Đã có trên Drive · Chờ xác minh/dọn R2':file.auto_error?'Lỗi tạm thời – sẽ thử lại':(file.drive_offset?'Đã chuyển '+Math.floor(100*file.drive_offset/file.bytes)+'%':'Đang chờ đồng bộ'),'tag');
   if(file.auto_error||file.r2_delete_error)span.title=file.auto_error||file.r2_delete_error;
   div.append(label,span);
   if(!file.drive_file_id&&file.auto_error){
    const retry=button('Thử lại ngay',async()=>{retry.disabled=true;try{await api('POST','/api/sync/retry',{uploadId:file.id});notice('Đã xếp lại tệp, Worker sẽ thử trong khoảng 1 phút.',true);}catch(e){notice(e.message);}finally{retry.disabled=false;}},'secondary');
    div.append(retry);
   }
   if(!file.drive_file_id&&syncBlocked){ // Worker off: manual transfer with the admin's Google consent
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
$('staffSearch').addEventListener('input',renderStaffList);
$('staffFilter').addEventListener('change',renderStaffList);
let logSearchTimer=null;
$('logSearch').addEventListener('input',()=>{clearTimeout(logSearchTimer);logSearchTimer=setTimeout(()=>loadAdminReport('LOG',1),350);});
$('logShowLogins').addEventListener('change',()=>loadAdminReport('LOG',1));
$('logPrev').onclick=()=>loadAdminReport('LOG',Math.max(1,(state.logPage||1)-1));
$('logNext').onclick=()=>loadAdminReport('LOG',(state.logPage||1)+1);
$('syncShowDone').addEventListener('change',()=>refreshGoogleSync());
$('syncRetryAll').onclick=async()=>{
 $('syncRetryAll').disabled=true;
 try{const r=await api('POST','/api/sync/retry',{});notice('Đã xếp lại '+r.files+' tệp lỗi; Worker sẽ thử trong khoảng 1 phút.',true);await refreshGoogleSync();}
 catch(e){notice(e.message);$('syncRetryAll').disabled=false;}
};
$('overviewRefresh').onclick=()=>loadOverview().catch(e=>notice(e.message));
let overviewSearchTimer=null;
const refreshOverviewFilters=()=>{state.overviewPage=1;loadOverview().catch(e=>notice(e.message));};
$('overviewSearch').oninput=()=>{
 clearTimeout(overviewSearchTimer);
 overviewSearchTimer=setTimeout(refreshOverviewFilters,300);
};
$('overviewStatus').onchange=refreshOverviewFilters;
$('overviewSort').onchange=refreshOverviewFilters;
$('overviewPageSize').onchange=refreshOverviewFilters;
$('overviewPrevPage').onclick=()=>{state.overviewPage=Math.max(1,state.overviewPage-1);loadOverview().catch(e=>notice(e.message))};
$('overviewNextPage').onclick=()=>{state.overviewPage++;loadOverview().catch(e=>notice(e.message))};
$('overviewResetFilters').onclick=()=>{
 $('overviewPeriod').value='7days';$('overviewSearch').value='';$('overviewStatus').value='';
 $('overviewSort').value='newest';$('overviewPageSize').value='20';state.overviewPage=1;
 $('overviewPeriod').dispatchEvent(new Event('change'));
};
function syncPeriodShortcuts(){
 const selected=$('overviewPeriod').value;
 document.querySelectorAll('[data-qbook-period]').forEach(btn=>{
  btn.setAttribute('aria-pressed',String(btn.dataset.qbookPeriod===selected));
 });
}
$('overviewPeriod').onchange=async()=>{
 syncPeriodShortcuts();
 state.overviewPage=1;
 await loadOverview().catch(e=>notice(e.message));
};
document.querySelectorAll('[data-qbook-period]').forEach(btn=>{
 btn.onclick=()=>{
  const period=btn.dataset.qbookPeriod;
  if(!['today','7days','month','all'].includes(period))return;
  $('overviewPeriod').value=period;
  $('overviewPeriod').dispatchEvent(new Event('change'));
 };
});
syncPeriodShortcuts();

function openAccountInfo(){
 if(!state.user)return notice('Cần đăng nhập để xem thông tin tài khoản.');
 const wrap=$('accountInfoContent');wrap.replaceChildren();
 for(const [key,value] of [['Họ và tên',state.user.name],['Email',state.user.email],['Vai trò',state.user.role],['Đóng hàng',state.user.rights?.dongHang?'Có':'Không'],['Vận đơn',state.user.rights?.vanDon?'Có':'Không']]){
  const row=el('div',null,'summary-field');row.append(el('strong',key),el('span',String(value||'—')));wrap.append(row);
 }
 wrap.append(el('p','Mật khẩu tài khoản Google được quản lý tại Google; PIN Qbooks được đổi riêng trong chương trình.','hint'));
 $('accountMenu').open=false;
 $('accountInfoDialog').showModal();
}
$('accountInfoBtn').onclick=openAccountInfo;
$('accountTopBtn').onclick=openAccountInfo;
$('closeAccountInfo').onclick=()=>$('accountInfoDialog').close();
$('changePinBtn').onclick=()=>{
 $('accountMenu').open=false;$('changePinForm').reset();$('changePinStatus').textContent='';
 $('changePinDialog').showModal();
};
$('closeChangePin').onclick=()=>$('changePinDialog').close();
$('changePinForm').onsubmit=async event=>{
 event.preventDefault();
 const form=event.currentTarget,values=Object.fromEntries(new FormData(form));
 if(values.newPin!==values.confirmPin){$('changePinStatus').textContent='PIN xác nhận không khớp.';return;}
 const save=form.querySelector('button[type=submit]');save.disabled=true;
 try{
  await api('POST','/api/account/change-pin',{oldPin:values.oldPin,newPin:values.newPin});
  form.reset();$('changePinStatus').textContent='Đã đổi mã PIN. Các phiên đăng nhập khác đã bị đăng xuất.';
  notice('Đã đổi mã PIN Qbooks thành công.',true);
 }catch(e){$('changePinStatus').textContent=e.message;}
 finally{save.disabled=false;}
};

$('editOrderDeliveryMode').onchange=()=>{const show=$('editOrderDeliveryMode').value==='THOI_GIAN';$('editOrderDeliveryTimeWrap').hidden=!show;$('editOrderForm').elements.delivery_time.required=show;};
$('closeEditOrder').onclick=()=>$('editOrderDialog').close();
$('editOrderForm').onsubmit=saveOrderEdit;
$('editFromOrderDetail').onclick=()=>{const order=state.summaryOrder;if(!order||!canEditOrder(order))return; $('orderSummaryDialog').close();openEditOrder(order);};
$('closeOrderSummary').onclick=()=>$('orderSummaryDialog').close();
$('closeDrivePreview').onclick=()=>$('drivePreviewDialog').close();
window.addEventListener('beforeunload',e=>{if(state.backgroundJob||(state.preUpload&&!state.preUpload.done)){e.preventDefault();e.returnValue='';}});
prefillRememberedAccount();
initGoogleSignIn();
protectBeforeUnload();
if(state.token)bootstrap();
