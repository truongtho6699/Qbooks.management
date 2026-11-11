
const CHUNK_BYTES=8*1024*1024;
const $=id=>document.getElementById(id);
const state={token:sessionStorage.getItem('qbooks_token')||'',user:null,orders:[],selected:null,tab:'orders',saving:false,lockedOrderIds:new Set()};
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
function makeCard(order,fn){
 const b=el('button',null,'order');b.type='button';
 const info=el('div');info.append(el('strong',order.title),meta(order.customer+' · '+order.quantity+' quyển · '+(order.carrier||order.transport||'Chưa có nhà xe')),meta(order.invoice_codes));
 b.append(info,el('span',order.status,'tag'));b.onclick=fn;return b;
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
async function loadPendingGoogle(){
 const container=$('googlePendingList');
 if(!state.user||state.user.role!=='ADMIN')return;
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
 try{const r=await api('GET','/api/bootstrap');state.user=r.user;$('userInfo').textContent=r.user.name+' · '+r.user.role;show('loginPage',false);show('appPage',true);$('logoutBtn').hidden=false;const rights=capabilities();state.tab=rights.pack?'pack':rights.ship?'ship':r.user.role==='SALE'?'sale':'orders';renderTabs();show('ordersView',['pack','ship','orders'].includes(state.tab));show('saleView',state.tab==='sale');show('staffView',false);if(state.tab==='sale')await loadGroupOptions();else await loadOrders();}
 catch(e){state.token='';sessionStorage.removeItem('qbooks_token');show('loginPage',true);show('appPage',false);$('logoutBtn').hidden=true;notice(e.message);}
}
function capabilities(){const r=state.user?.rights||{};return {pack:r.dongHang||['PACKER','ADMIN'].includes(state.user?.role),ship:r.vanDon||['SHIPPER','ADMIN'].includes(state.user?.role),admin:r.admin||state.user?.role==='ADMIN'};}
function renderTabs(){
 const r=capabilities(),role=state.user.role,buttons=[];
 if(r.pack)buttons.push(['pack','Đóng hàng']);
 if(r.ship)buttons.push(['ship','Vận đơn']);
 if(['ADMIN','SALE','SHIPPER'].includes(role))buttons.push(['sale',role==='SHIPPER'?'Gộp vận đơn':'Sale (D1 thử nghiệm)']);
 if(r.admin)buttons.push(['staff','Quản trị']);
 if(!buttons.length)buttons.push(['orders','Danh sách đơn']);
 $('tabs').replaceChildren(...buttons.map(([key,text])=>button(text,()=>tab(key),key===state.tab?'selected':'')));
}
async function releaseLocks(){
 const ids=[...state.lockedOrderIds];state.lockedOrderIds.clear();
 await Promise.allSettled(ids.map(id=>api('DELETE','/api/orders/'+id+'/lock')));
}
function tab(key){
 if(state.lockedOrderIds.size)releaseLocks();
 state.tab=key;
 show('ordersView',['pack','ship','orders'].includes(key));
 show('saleView',key==='sale');show('staffView',key==='staff');show('detailView',false);
 show('newSalePanel',state.user.role!=='SHIPPER');
 renderTabs();
 if(key==='sale')loadGroupOptions();
 if(key==='staff')loadPendingGoogle();
 if(['pack','ship','orders'].includes(key))loadOrders().catch(e=>notice(e.message));
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
 if(info.status==='COMPLETE'){localStorage.removeItem(key);progress(file.name,file.size,file.size);return}
 if(!video){
  progress(file.name,0,file.size);await api('PUT','/api/uploads/'+id,file,true);
  progress(file.name,file.size,file.size);localStorage.removeItem(key);return;
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
}
async function uploadSelection(orderId,items){
 let index=0,total=items.length;
 for(const [stage,file] of items){
  $('uploadLabel').textContent='Tệp '+(++index)+'/'+total+': '+file.name;
  await uploadOne(orderId,stage,file);
 }
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
async function savePack(){
 if(state.saving||!state.selected)return;
 const id=state.selected.id,uploads=[];
 for(const f of $('invoicePics').files)uploads.push(['ANH_HOA_DON',f]);
 for(const f of $('goodsPics').files)uploads.push(['HANG_HOA',f]);
 for(const f of $('videos').files)uploads.push(['VIDEO_DONG_HANG',f]);
 setBusy(true);
 try{
  notice('Đang tải hồ sơ R2 (nếu có), sau đó lưu đóng hàng...');
  await uploadSelection(id,uploads);
  const nguoiDongCung=$all('.packHelperChoice:checked').map(x=>x.value);
  await api('POST','/api/orders/'+id+'/pack',{boxes:Number($('boxes').value),nguoiDongCung,note:$('packNote').value});
  state.lockedOrderIds.delete(id);
  notice('Đã lưu đóng hàng trên D1. Chưa đồng bộ Google Sheets/Drive.',true);
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
  await uploadSelection(id,uploads);
  await api('POST','/api/shipments',{orderIds,loaiShip,tenShip,sdtShip,
   tienShip:costs[0],hangNang:costs[1],phiBen:costs[2],phuPhi:costs[3],status:v('shippingStatus'),note:v('shippingNote')});
  for(const key of orderIds)state.lockedOrderIds.delete(key);
  notice('Đã lưu vận đơn trên D1. Chưa đồng bộ Google Sheets/Drive.',true);
  show('detailView',false);show('ordersView',true);await loadOrders();
 }catch(e){notice('Chưa lưu vận đơn: '+e.message)}
 finally{setBusy(false)}
}
async function loadGroupOptions(){
 try{
  const r=await api('GET','/api/orders');const list=$('groupList');list.replaceChildren();
  const options=r.orders.filter(o=>state.user.role==='SHIPPER'?o.status==='CHỜ VẬN ĐƠN':['CHỜ ĐÓNG HÀNG','CHỜ VẬN ĐƠN'].includes(o.status)&&!o.group_id);
  for(const o of options){
   const row=el('label',null,'order');row.style.display='flex';
   const ck=document.createElement('input');ck.type='checkbox';ck.className='groupCheck';ck.value=o.id;
   row.append(ck,el('div',o.title));list.append(row);
  }
  if(!options.length)list.append(el('p','Không có đơn chưa gộp.'));
 }catch(e){notice(e.message)}
}
$('setupForm').addEventListener('submit',async e=>{e.preventDefault();const fields=Object.fromEntries(new FormData(e.target));try{await api('POST','/api/setup',fields);notice('Đã tạo tài khoản quản trị. Đang đăng nhập...',true);await login(fields.email,fields.pin);e.target.reset();}catch(error){notice('Chưa thiết lập được quản trị: '+error.message)}});
$('loginForm').addEventListener('submit',async e=>{e.preventDefault();const b=Object.fromEntries(new FormData(e.target));try{await login(b.email,b.pin)}catch(error){notice(error.message)}});
$('logoutBtn').onclick=async()=>{await releaseLocks();try{await api('POST','/api/logout',{})}catch{}state.token='';state.user=null;sessionStorage.removeItem('qbooks_token');show('loginPage',true);show('appPage',false);$('logoutBtn').hidden=true;};
$('search').addEventListener('input',()=>{loadOrders().catch(e=>notice(e.message))});
$('reloadBtn').onclick=()=>loadOrders().catch(e=>notice(e.message));
$('backBtn').onclick=()=>tab(state.tab);
$('savePacking').onclick=savePack;$('saveShipping').onclick=saveShip;
['shippingFee','heavyFee','terminalFee','extraFee'].forEach(id=>$(id).addEventListener('input',updateShippingTotal));
$('saleForm').addEventListener('submit',async e=>{e.preventDefault();const f=Object.fromEntries(new FormData(e.target));f.urgent=!!e.target.querySelector('[name=urgent]').checked;try{await api('POST','/api/orders',f);e.target.reset();notice('Đã tạo đơn Sale.',true);await loadGroupOptions();await loadOrders()}catch(err){notice(err.message)}});
$('createGroup').onclick=async()=>{const orderIds=$all('.groupCheck:checked').map(c=>c.value);try{const r=await api('POST','/api/groups',{orderIds});notice('Đã tạo nhóm '+r.groupId,true);await loadGroupOptions()}catch(e){notice(e.message)}};
$('staffForm').addEventListener('submit',async e=>{e.preventDefault();try{const r=await api('POST','/api/users',Object.fromEntries(new FormData(e.target)));notice('Đã tạo nhân sự '+r.id,true);e.target.reset()}catch(err){notice(err.message)}});
const SHEET_ID='1TSuK6EF2yK8Qb9ZAU1v98VhzekrjX2SKkIDmR7OXMiw';
async function googleRead(url,token){
 const res=await fetch(url,{headers:{Authorization:'Bearer '+token},cache:'no-store'});
 let data;try{data=await res.json()}catch{throw Error('Google trả dữ liệu không hợp lệ.');}
 if(!res.ok)throw Error(data.error?.message||'Google API trả lỗi '+res.status);
 return data;
}
function sourceAuth(scope,done){
 const status=$('legacyStatus');
 if(!capabilities().admin)return notice('Chỉ Admin được kết nối dữ liệu Google.');
 if(!state.googleClientId||!window.google?.accounts?.oauth2){
  status.textContent='Google chưa sẵn sàng. Hãy tải lại trang hoặc kiểm tra Client ID.';
  return;
 }
 const client=window.google.accounts.oauth2.initTokenClient({
  client_id:state.googleClientId,scope,
  callback:response=>{
   if(response.error||!response.access_token){status.textContent='Google không cấp quyền: '+(response.error||'Đã hủy');return;}
   if(!window.google.accounts.oauth2.hasGrantedAllScopes(response,scope)){
    status.textContent='Chưa cấp đủ quyền chỉ đọc.';return;
   }
   Promise.resolve(done(response.access_token)).catch(e=>{
    status.textContent='Không đọc được dữ liệu Google: '+e.message;
   });
  },
  error_callback:e=>{status.textContent='Cửa sổ Google bị đóng/chặn: '+e.type;}
 });
 // Phải gọi từ sự kiện nhấn nút, tránh popup bị trình duyệt chặn.
 client.requestAccessToken({prompt:'consent'});
}
function connectGoogleSheets(){
 sourceAuth('https://www.googleapis.com/auth/spreadsheets.readonly',async token=>{
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
$('connectGoogleSheets').onclick=connectGoogleSheets;
$('connectGoogleDrive').onclick=connectGoogleDrive;
$('checkLegacy').onclick=checkLegacy;
$('previewLegacy').onclick=previewLegacy;
$('refreshGooglePending').onclick=()=>loadPendingGoogle();
initGoogleSignIn();
if(state.token)bootstrap();
