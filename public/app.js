
const CHUNK_BYTES=8*1024*1024;
const $=id=>document.getElementById(id);
const state={token:sessionStorage.getItem('qbooks_token')||'',user:null,orders:[],selected:null,tab:'orders',saving:false};
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
async function bootstrap(){
 try{const r=await api('GET','/api/bootstrap');state.user=r.user;$('userInfo').textContent=r.user.name+' · '+r.user.role;show('loginPage',false);show('appPage',true);$('logoutBtn').hidden=false;renderTabs();await loadOrders();}
 catch(e){state.token='';sessionStorage.removeItem('qbooks_token');show('loginPage',true);show('appPage',false);$('logoutBtn').hidden=true;notice(e.message);}
}
function renderTabs(){
 const role=state.user.role,buttons=[['orders','Danh sách đơn']];
 if(['ADMIN','SALE'].includes(role))buttons.push(['sale','Sale / Gộp đơn']);
 if(role==='ADMIN')buttons.push(['staff','Nhân sự']);
 $('tabs').replaceChildren(...buttons.map(([key,text])=>{const b=button(text,()=>tab(key),key===state.tab?'selected':'');return b;}));
}
function tab(key){state.tab=key;show('ordersView',key==='orders');show('saleView',key==='sale');show('staffView',key==='staff');show('detailView',false);renderTabs();if(key==='sale')loadGroupOptions();}
async function loadOrders(){
 const q=$('search').value.trim();const r=await api('GET','/api/orders?q='+encodeURIComponent(q));
 state.orders=r.orders;$('listTitle').textContent=statusTitle[state.user.role]||'Đơn hàng';
 const list=$('orderList');list.replaceChildren();
 if(!r.orders.length)list.append(el('p','Chưa có đơn phù hợp.'));
 for(const o of r.orders)list.append(makeCard(o,()=>openOrder(o)));
}
function openOrder(order){
 state.selected=order;show('ordersView',false);show('saleView',false);show('detailView',true);
 const n=$('selectedOrder');n.replaceChildren(el('h2',order.title),el('p','Khách hàng: '+order.customer+' · '+order.invoice_codes));
 const pack=order.status==='CHỜ ĐÓNG HÀNG'&&['PACKER','ADMIN'].includes(state.user.role);
 const ship=order.status==='CHỜ VẬN ĐƠN'&&['SHIPPER','ADMIN'].includes(state.user.role);
 show('packControls',pack);show('shipControls',ship);show('progressWrap',false);
 $('boxes').value=order.boxes||0;$('packNote').value=order.packing_note||'';notice('');
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
async function savePack(){
 if(state.saving||!state.selected)return;
 const id=state.selected.id,uploads=[];
 for(const f of $('invoicePics').files)uploads.push(['ANH_HOA_DON',f]);
 for(const f of $('goodsPics').files)uploads.push(['HANG_HOA',f]);
 for(const f of $('videos').files)uploads.push(['VIDEO_DONG_HANG',f]);
 if(!uploads.length){notice('Vui lòng chọn ít nhất một ảnh hoặc video đóng hàng.');return;}
 setBusy(true);
 try{
  notice('Đang tải ảnh/video vào R2, sau đó lưu đơn...');
  await uploadSelection(id,uploads);
  await api('POST','/api/orders/'+id+'/pack',{boxes:Number($('boxes').value)||0,note:$('packNote').value});
  notice('Đã tải đầy đủ ảnh/video và lưu đóng hàng.',true);show('detailView',false);show('ordersView',true);await loadOrders();
 }catch(e){notice('Chưa lưu đơn: '+e.message);}
 finally{setBusy(false);}
}
async function saveShip(){
 if(state.saving||!state.selected)return;
 setBusy(true);
 try{
  const id=state.selected.id;
  const uploads=[...$('shippingPics').files].map(f=>['GIAO_HANG',f]);
  notice('Đang tải ảnh bàn giao, sau đó lưu vận đơn...');
  await uploadSelection(id,uploads);
  await api('POST','/api/shipments',{orderIds:[id],transport:$('shippingTransport').value,note:$('shippingNote').value});
  notice('Đã lưu vận đơn.',true);show('detailView',false);show('ordersView',true);await loadOrders();
 }catch(e){notice('Chưa lưu vận đơn: '+e.message)}
 finally{setBusy(false)}
}
async function loadGroupOptions(){
 try{
  const r=await api('GET','/api/orders');const list=$('groupList');list.replaceChildren();
  const options=r.orders.filter(o=>['CHỜ ĐÓNG HÀNG','CHỜ VẬN ĐƠN'].includes(o.status)&&!o.group_id);
  for(const o of options){
   const row=el('label',null,'order');row.style.display='flex';
   const ck=document.createElement('input');ck.type='checkbox';ck.className='groupCheck';ck.value=o.id;
   row.append(ck,el('div',o.title));list.append(row);
  }
  if(!options.length)list.append(el('p','Không có đơn chưa gộp.'));
 }catch(e){notice(e.message)}
}
$('loginForm').addEventListener('submit',async e=>{e.preventDefault();const b=Object.fromEntries(new FormData(e.target));try{await login(b.email,b.pin)}catch(error){notice(error.message)}});
$('logoutBtn').onclick=async()=>{try{await api('POST','/api/logout',{})}catch{}state.token='';state.user=null;sessionStorage.removeItem('qbooks_token');show('loginPage',true);show('appPage',false);$('logoutBtn').hidden=true;};
$('search').addEventListener('input',()=>{loadOrders().catch(e=>notice(e.message))});
$('reloadBtn').onclick=()=>loadOrders().catch(e=>notice(e.message));
$('backBtn').onclick=()=>tab('orders');
$('savePacking').onclick=savePack;$('saveShipping').onclick=saveShip;
$('saleForm').addEventListener('submit',async e=>{e.preventDefault();const f=Object.fromEntries(new FormData(e.target));f.urgent=!!e.target.querySelector('[name=urgent]').checked;try{await api('POST','/api/orders',f);e.target.reset();notice('Đã tạo đơn Sale.',true);await loadGroupOptions();await loadOrders()}catch(err){notice(err.message)}});
$('createGroup').onclick=async()=>{const orderIds=$all('.groupCheck:checked').map(c=>c.value);try{const r=await api('POST','/api/groups',{orderIds});notice('Đã tạo nhóm '+r.groupId,true);await loadGroupOptions()}catch(e){notice(e.message)}};
$('staffForm').addEventListener('submit',async e=>{e.preventDefault();try{const r=await api('POST','/api/users',Object.fromEntries(new FormData(e.target)));notice('Đã tạo nhân sự '+r.id,true);e.target.reset()}catch(err){notice(err.message)}});
if(state.token)bootstrap();
