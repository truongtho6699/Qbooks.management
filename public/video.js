const $=id=>document.getElementById(id);
const state={token:sessionStorage.getItem('qbooks_token')||'',view:'dashboard',books:[],lessons:[],items:[],staff:[],catalogBook:'',catalogWeek:'',catalogQuery:'',overview:null,rights:{},user:null,selected:null,filter:{}};
const NAV=[
 {id:'dashboard',text:'Bảng điều khiển',icon:'▦',group:'CHUNG'},
 {id:'adminOverview',text:'Tổng quan quản trị',icon:'▤',group:'CHUNG'},
 {id:'filmOverview',text:'Tổng quan quay',icon:'▣',group:'QUAY VIDEO'},
 {id:'film',text:'Quay bài',icon:'◉',group:'QUAY VIDEO'},
 {id:'createVideo',text:'Lập kế hoạch video',icon:'＋',group:'QUAY VIDEO'},
 {id:'postOverview',text:'Tổng quan hậu kỳ',icon:'◫',group:'HẬU KỲ'},
 {id:'edit',text:'Xử lý video',icon:'✎',group:'HẬU KỲ'},
 {id:'production',text:'Sản lượng hằng ngày',icon:'▤',group:'QUẢN LÝ'},
 {id:'booksProgress',text:'Tiến độ đầu sách',icon:'◷',group:'QUẢN LÝ'},
 {id:'report',text:'Báo cáo tổng hợp',icon:'▥',group:'QUẢN LÝ'},
 {id:'books',text:'Quản trị đầu sách',icon:'▧',group:'QUẢN TRỊ'},
 {id:'catalog',text:'Danh mục bài học',icon:'≡',group:'QUẢN TRỊ'},
 {id:'staff',text:'Quản trị nhân viên',icon:'♙',group:'QUẢN TRỊ'},
 {id:'permissions',text:'Phân quyền tài khoản',icon:'♙',group:'QUẢN TRỊ'},
 {id:'audit',text:'Lịch sử thao tác',icon:'◴',group:'QUẢN TRỊ'}
];
const mobile=[{id:'dashboard',text:'Tổng quan',icon:'▦'},{id:'film',text:'Quay',icon:'◉'},{id:'edit',text:'Hậu kỳ',icon:'✎'},{id:'booksProgress',text:'Đầu sách',icon:'▧'},{id:'more',text:'Khác',icon:'☷'}];
const statColor={'CHỜ QUAY':'','ĐÃ QUAY':'blue','ĐANG HẬU KỲ':'purple','CHỜ DUYỆT':'amber','ĐÃ PHÁT HÀNH':'green'};
const E=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const count=v=>Number(v||0).toLocaleString('vi-VN');
const date=s=>s?new Date(String(s).replace(' ','T')+'Z').toLocaleDateString('vi-VN'):'—';
const toast=(text)=>{const node=$('toast');node.textContent=text;node.hidden=false;clearTimeout(toast.timer);toast.timer=setTimeout(()=>node.hidden=true,5000)};
async function api(method,path,data){
 const headers={'authorization':'Bearer '+state.token};if(data!==undefined)headers['content-type']='application/json';
 const r=await fetch(path,{method,headers,body:data===undefined?undefined:JSON.stringify(data)});
 let j;try{j=await r.json()}catch{throw Error('Máy chủ không trả dữ liệu hợp lệ.');}
 if(!r.ok)throw Error(j.error||'Lỗi máy chủ '+r.status);return j;
}
function can(section){
 if(state.rights.admin)return true;
 if(['dashboard','filmOverview','postOverview','production','booksProgress','report'].includes(section))return !!state.user;
 if(section==='adminOverview'||section==='permissions')return !!state.rights.manage||!!state.rights.admin;
 if(section==='bookDetail'||section==='catalog')return !!state.user;
 if(section==='film')return !!state.rights.film;
 if(section==='createVideo')return !!state.rights.manage;
 if(section==='edit')return !!state.rights.edit;
 return !!state.rights.manage;
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
const booksTable=()=>table(['Mã sách','Tên đầu sách','Giảng viên','Kế hoạch','Video đã có','Đã phát hành','Tiến độ'],state.books.map(b=>{
 const target=Number(b.target_count)||0,pub=Number(b.published)||0,rate=target?Math.min(100,Math.round(100*pub/target)):0;
 return ['<button class="link-action" data-book="'+E(b.id)+'">'+E(b.code)+'</button>',E(b.name),E(b.teacher||'—'),count(target),count(b.total),count(pub),'<div class="progress"><span style="width:'+rate+'%"></span></div><span class="mini-note">'+rate+'%</span>'];
}));
function renderNav(){
 const nav=$('desktopNav');let group='';
 nav.innerHTML=NAV.filter(n=>can(n.id)).map(item=>{
  const heading=group!==item.group?(group=item.group,'<span class="nav-heading">'+E(item.group)+'</span>'):'';
  return heading+'<button class="nav-item '+(item.id===state.view?'active':'')+'" data-view="'+item.id+'"><span class="nav-icon">'+item.icon+'</span><span>'+E(item.text)+'</span></button>';
 }).join('');
 const active=state.view;
 $('mobileNav').innerHTML=mobile.map(item=>{
 const current=item.id==='more'?['books','staff','permissions','audit','report','production','filmOverview','postOverview'].includes(active):active===item.id;
 return '<button class="mobile-item '+(current?'active':'')+'" data-view="'+item.id+'"><span class="nav-icon">'+item.icon+'</span><span>'+E(item.text)+'</span></button>';
 }).join('');
 document.querySelectorAll('[data-view]').forEach(el=>el.onclick=()=>navigate(el.dataset.view));
}
async function load(){
 const [bs,vs,ov,ls]=await Promise.all([api('GET','/api/video/books'),api('GET','/api/video/items'),api('GET','/api/video/overview'),api('GET','/api/video/lessons')]);
 state.books=bs.books;state.items=vs.items;state.overview=ov;state.lessons=ls.lessons||[];
 if(state.rights.manage||state.rights.admin){try{state.staff=(await api('GET','/api/video/staff')).staff}catch{state.staff=[]}}
}
function navigate(view){
 if(view==='more'){
  const options=NAV.filter(n=>can(n.id)&&!['dashboard','film','edit','booksProgress'].includes(n.id));
  $('page').innerHTML=panel('Các chức năng khác','<div class="two">'+options.map(n=>'<button class="btn" data-menu="'+n.id+'">'+n.icon+' '+E(n.text)+'</button>').join('')+'</div>');
  document.querySelectorAll('[data-menu]').forEach(b=>b.onclick=()=>navigate(b.dataset.menu));
  $('viewTitle').textContent='Danh mục chức năng';$('viewSubtitle').textContent='Các phân hệ quản lý và báo cáo';renderNav();return;
 }
 if(!can(view))return toast('Tài khoản chưa được cấp quyền chức năng này.');
 state.view=view;state.selected=null;
 const title=NAV.find(x=>x.id===view)?.text||'Quản lý video';
 $('viewTitle').textContent=title;
 $('viewSubtitle').textContent=view==='dashboard'?'Theo dõi toàn bộ tiến độ sản xuất video sách':'Dữ liệu thực tế · QBOOK Video Manager';
 renderNav();render();
}
function dashboard(){
 const o=state.overview||{totals:{},books:[],staff:[]},t=o.totals;
 const bookRows=(o.books||[]).slice(0,10).map(b=>[E(b.code),E(b.name),count(b.total),count(b.filmed),count(b.published)]);
 const top=(o.staff||[]).filter(x=>Number(x.filmed)||Number(x.edited)).slice(0,10).map(p=>[E(p.name),count(p.filmed),count(p.edited)]);
 const statusesRows=statuses.map(s=>[badge(s),count(state.items.filter(v=>v.status===s).length)]);
 return kpis([{label:'Tổng số video',value:t.total,sub:'Các video đã khai báo'},{label:'Đã quay',value:t.filmed,sub:'Video hoàn thành quay'},{label:'Hoàn thành hậu kỳ',value:t.edited,sub:'Đã hậu kỳ / chờ duyệt'},{label:'Đã phát hành',value:t.published,sub:'Có trên kênh YouTube'}])+
 '<div class="two">'+panel('Tiến độ sản xuất theo đầu sách',table(['Mã sách','Đầu sách','Video','Đã quay','Phát hành'],bookRows,'Chưa có đầu sách'))+
 panel('Sản lượng nhân viên',table(['Nhân sự','Quay','Hậu kỳ'],top,'Chưa có sản lượng'))+'</div>'+
 panel('Tình trạng video toàn hệ thống',table(['Trạng thái','Số lượng'],statusesRows));
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
 return kpis([{label:'Đầu sách quản lý',value:state.books.length,sub:'Đã lập kế hoạch sản xuất'},
  {label:'Chỉ tiêu video',value:goals,sub:'Kế hoạch toàn hệ thống'},
  {label:'Video đã phát hành',value:t.published,sub:'Video có kết quả phát hành'},
  {label:'Chưa đạt kế hoạch',value:remaining,sub:'Theo chỉ tiêu đầu sách'}])+
 '<div class="two">'+panel('Tiến độ theo đầu sách',
 table(['Mã sách','Tên đầu sách','Kế hoạch','Đã quay','Phát hành','Hoàn thành'],progress,'Chưa có kế hoạch đầu sách'))+
 panel('Hiệu suất nhân sự',table(['Nhân sự','Video quay','Video hậu kỳ'],people,'Chưa có hoạt động nhân sự'))+'</div>'+
 panel('Cơ cấu trạng thái',table(['Trạng thái','Số lượng video'],statuses.map(x=>[badge(x),count(state.items.filter(v=>v.status===x).length)])));
}
function bookDetail(){
 const b=state.books.find(x=>x.id===state.selectedBook);
 if(!b)return panel('Đầu sách','Không tìm thấy đầu sách được chọn.');
 const items=state.items.filter(x=>x.book_id===b.id),published=items.filter(x=>x.status==='ĐÃ PHÁT HÀNH').length;
 return '<div class="actions" style="justify-content:flex-start;margin:0 0 15px">'+btn('← Trở về tiến độ đầu sách','','backBooks')+'</div>'+
 kpis([{label:'Kế hoạch',value:b.target_count},{label:'Video đã có',value:items.length},{label:'Đã quay',value:items.filter(x=>x.status!=='CHỜ QUAY').length},{label:'Đã phát hành',value:published}])+
 panel('Chi tiết đầu sách · '+b.code,'<div class="record-card"><strong>'+E(b.name)+'</strong><span class="mini-note">Giảng viên: '+E(b.teacher||'Chưa cập nhật')+'</span>'+(b.drive_url?'<a href="'+E(b.drive_url)+'" target="_blank" rel="noopener noreferrer">Mở thư mục Drive ↗</a>':'')+'</div>')+
 panel('Danh mục bài/tiết theo sách',table(['Tuần','Bài','Tiết','Tên bài','Trang'],state.lessons.filter(x=>x.book_code===b.code).slice(0,70).map(x=>[E(x.week),E(x.lesson_no),E(x.period),E(x.title),E(x.page)]),'Chưa nhập nội dung bài học'))+
 panel('Danh sách bài học và tình trạng',table(['Video','Người quay','Người hậu kỳ','Trạng thái','Chi tiết'],
 items.map(v=>[E(v.title),E(v.camera_name||'—'),E(v.editor_name||'—'),badge(v.status),
 '<button class="link-action" data-action="'+(v.status==='CHỜ QUAY'?'film':'edit')+'" data-id="'+E(v.id)+'">Xem chi tiết</button>'])));
}
function filmingOverview(){
 const filmed=state.items.filter(v=>v.status!=='CHỜ QUAY'),people=new Map();
 for(const v of filmed)if(v.camera_name)people.set(v.camera_name,(people.get(v.camera_name)||0)+1);
 return kpis([{label:'Video kế hoạch',value:state.items.length},{label:'Đã quay',value:filmed.length},{label:'Chờ quay',value:state.items.length-filmed.length},{label:'Nhân sự đã quay',value:people.size}])+
 panel('Tiến độ quay theo đầu sách',table(['Đầu sách','Kế hoạch','Đã quay','Còn quay'],state.books.map(b=>{
 const list=state.items.filter(v=>v.book_id===b.id);const done=list.filter(v=>v.status!=='CHỜ QUAY').length;return [E(b.name),count(list.length),count(done),count(list.length-done)];
 })))+panel('Sản lượng quay theo nhân viên',table(['Nhân sự','Video đã quay'],[...people].map(([name,n])=>[E(name),count(n)])));
}
function makeVideoRows(items,action){
 return items.map(v=>[E(v.book_code),'<strong>'+E(v.title)+'</strong><div class="mini-note">'+E(v.lesson||'')+'</div>',E(v.teacher||'—'),E(v.camera_name||'—'),badge(v.status),'<button type="button" class="link-action" data-action="'+action+'" data-id="'+E(v.id)+'">'+(action==='film'?'Quay / Chi tiết':'Xử lý / Chi tiết')+'</button>']);
}
function filmList(){return (state.rights.manage||state.rights.admin?'<div class="actions" style="margin-bottom:15px"><button class="btn primary" data-goto="createVideo">＋ Lập kế hoạch video</button></div>':'')+panel('Danh sách video quay','<div class="filters"><div class="field"><label>Tìm video</label><input id="filterVideo" placeholder="Tên video, đầu sách, bài học"></div><div class="field"><label>Đầu sách</label><select id="filterBook"><option value="">Tất cả đầu sách</option>'+selected(booksList(),'')+'</select></div></div><div id="filteredRows">'+table(['Đầu sách','Video','Giảng viên','Người quay','Tình trạng','Thao tác'],makeVideoRows(state.items,'film'),'Chưa có video')+'</div>');}
function filmDetail(v){
 return panel('Thông tin video','<div class="record-card"><strong>'+E(v.book_code)+' · '+E(v.title)+'</strong><span class="mini-note">Bài học: '+E(v.lesson||'—')+' · Giáo viên: '+E(v.teacher||'—')+'</span>'+badge(v.status)+'</div>')+
 panel('Quay bài · cập nhật tiến độ','<form id="filmForm" class="form-grid">'+
 '<div class="field full"><label>Chọn video quay để tải trực tiếp lên Google Drive</label><input id="rawFile" type="file" accept="video/*"><button type="button" class="btn" id="uploadRawVideo" style="margin-top:10px">↑ Tải video lên Drive</button><span class="mini-note" id="rawUploadStatus">Tệp tối đa 2 GB. Có thể dùng liên kết Drive bên dưới thay cho tải tệp.</span></div>'+
 '<div class="field full"><label>Liên kết video gốc trên Google Drive *</label><input name="raw_url" type="url" placeholder="https://drive.google.com/..." value="'+E(v.raw_url||'')+'" required></div>'+
 '<div class="field full"><label>Ghi chú quay</label><textarea name="note">'+E(v.note||'')+'</textarea></div>'+
 '<div class="actions full">'+btn('Quay lại danh sách','','backList')+btn('Lưu video đã quay','primary','','submit')+'</div></form>'+
 '<p class="mini-note">Video tải trực tiếp từ trình duyệt lên Google Drive, không đi qua máy chủ QBooks. Có thể nhập liên kết Drive nếu đã tải sẵn.</p>');
}
function postOverview(){
 const pending=state.items.filter(v=>['ĐÃ QUAY','ĐANG HẬU KỲ'].includes(v.status));
 return kpis([{label:'Chờ hậu kỳ',value:state.items.filter(v=>v.status==='ĐÃ QUAY').length},{label:'Đang hậu kỳ',value:state.items.filter(v=>v.status==='ĐANG HẬU KỲ').length},{label:'Chờ duyệt',value:state.items.filter(v=>v.status==='CHỜ DUYỆT').length},{label:'Đã phát hành',value:state.items.filter(v=>v.status==='ĐÃ PHÁT HÀNH').length}])+
 panel('Danh sách video cần xử lý',table(['Đầu sách','Video','Người quay','Trạng thái','Thao tác'],pending.map(v=>[E(v.book_code),E(v.title),E(v.camera_name||'—'),badge(v.status),'<button class="link-action" data-action="edit" data-id="'+E(v.id)+'">Xử lý video</button>'])));
}
function editList(){return panel('Danh sách video hậu kỳ','<div class="filters"><div class="field"><label>Tìm video</label><input id="filterVideo" placeholder="Tên video, tên sách"></div><div class="field"><label>Đầu sách</label><select id="filterBook"><option value="">Tất cả đầu sách</option>'+selected(booksList(),'')+'</select></div></div><div id="filteredRows">'+table(['Đầu sách','Video','Giảng viên','Người quay','Tình trạng','Thao tác'],makeVideoRows(state.items.filter(v=>v.status!=='CHỜ QUAY'),'edit'),'Chưa có video hậu kỳ')+'</div>');}
function editDetail(v){return panel('Video đang xử lý','<div class="record-card"><strong>'+E(v.book_code)+' · '+E(v.title)+'</strong>'+badge(v.status)+'<span class="mini-note">Video gốc: '+(v.raw_url?'<a href="'+E(v.raw_url)+'" target="_blank" rel="noopener noreferrer">Mở video gốc</a>':'Chưa có liên kết')+'</span></div>')+
 panel('Xử lý video / Phát hành','<form id="editForm" class="form-grid">'+
 '<div class="field full"><label>Chọn video đã biên tập để tải lên Google Drive</label><input id="editedFile" type="file" accept="video/*"><button type="button" class="btn" id="uploadEditedVideo" style="margin-top:10px">↑ Tải video hậu kỳ lên Drive</button><span class="mini-note" id="editedUploadStatus">Có thể nhập liên kết Drive hoặc YouTube mà không cần tải video mới.</span></div>'+
 '<div class="field full"><label>Link video sau biên tập</label><input name="output_url" type="url" placeholder="https://drive.google.com/..." value="'+E(v.output_url||'')+'"></div>'+
 '<div class="field"><label>Trạng thái *</label><select name="status"><option>ĐANG HẬU KỲ</option><option>CHỜ DUYỆT</option><option>ĐÃ PHÁT HÀNH</option></select></div>'+
 '<div class="field"><label>Link YouTube (bắt buộc khi phát hành)</label><input name="youtube_url" type="url" placeholder="https://www.youtube.com/..." value="'+E(v.youtube_url||'')+'"></div>'+
 '<div class="field full"><label>Ghi chú hậu kỳ, kiểm duyệt</label><textarea name="note">'+E(v.note||'')+'</textarea></div>'+
 '<div class="actions full">'+btn('Quay lại','','backList')+btn('Lưu hậu kỳ & phát hành','primary','','submit')+'</div></form>');
}
function production(){
 const dateSelected=state.productionDate||new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Ho_Chi_Minh',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 const staffSelected=state.productionStaff||'';
 const dayOf=s=>{
  if(!s)return '';
  const d=new Date(String(s).replace(' ','T')+(String(s).includes('Z')?'':'Z'));
  return new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Ho_Chi_Minh',year:'numeric',month:'2-digit',day:'2-digit'}).format(d);
 };
 const ofDay=state.items.filter(v=>(v.filmed_at&&dayOf(v.filmed_at)===dateSelected)||(v.edited_at&&dayOf(v.edited_at)===dateSelected));
 const byName=new Map();
 for(const v of ofDay){
  if(v.filmed_at&&dayOf(v.filmed_at)===dateSelected&&v.camera_name){
   const p=byName.get(v.camera_name)||{filmed:0,edited:0};p.filmed++;byName.set(v.camera_name,p);
  }
  if(v.edited_at&&dayOf(v.edited_at)===dateSelected&&v.editor_name){
   const p=byName.get(v.editor_name)||{filmed:0,edited:0};p.edited++;byName.set(v.editor_name,p);
  }
 }
 const people=[...byName].filter(([name])=>!staffSelected||name===staffSelected);
 const todayFilmed=people.reduce((n,[,p])=>n+p.filmed,0),todayEdited=people.reduce((n,[,p])=>n+p.edited,0);
 return '<div class="filters"><div class="field"><label>Ngày báo cáo</label><input type="date" id="productionDate" value="'+E(dateSelected)+'"></div>'+
 '<div class="field"><label>Nhân sự</label><select id="productionStaff"><option value="">Tất cả nhân sự</option>'+
 [...new Set(state.items.flatMap(v=>[v.camera_name,v.editor_name]).filter(Boolean))].sort().map(name=>'<option '+(staffSelected===name?'selected':'')+' value="'+E(name)+'">'+E(name)+'</option>').join('')+
 '</select></div></div>'+
 kpis([{label:'Video quay trong ngày',value:todayFilmed},{label:'Video hậu kỳ trong ngày',value:todayEdited},
  {label:'Tổng hoạt động trong ngày',value:todayFilmed+todayEdited},{label:'Nhân sự có hoạt động',value:people.length}])+
 panel('Sản lượng theo từng nhân sự',table(['Nhân sự','Video quay','Video hậu kỳ','Tổng số'],people.map(([name,p])=>[E(name),count(p.filmed),count(p.edited),count(p.filmed+p.edited)])),'Chưa có sản lượng trong ngày được chọn');
}
function booksProgress(){return panel('Tiến độ đầu sách',booksTable(),'Theo dõi số lượng và trạng thái sản xuất theo từng đầu sách');}
function report(){
 const t=state.overview?.totals||{};
 return kpis([{label:'Kế hoạch video',value:state.books.reduce((a,b)=>a+Number(b.target_count||0),0)},{label:'Video đã khai báo',value:t.total},{label:'Video đã quay',value:t.filmed},{label:'Video đã phát hành',value:t.published}])+
 panel('Báo cáo tổng hợp theo sách',booksTable())+
 panel('Tình trạng video',table(['Trạng thái','Video'],statuses.map(s=>[badge(s),count(state.items.filter(v=>v.status===s).length)])))+
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
 return form+panel('Danh sách đầu sách',booksTable());
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
 return kpis([{label:'Đầu sách có bài học',value:codes.length},{label:'Bài/tiết kế hoạch',value:state.lessons.length},{label:'Video đã khai báo',value:state.items.length},{label:'Video đã phát hành',value:state.items.filter(x=>x.status==='ĐÃ PHÁT HÀNH').length}])+
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
 const screen={dashboard,adminOverview,bookDetail,filmOverview,film:filmList,createVideo,postOverview,edit:editList,production,booksProgress,report,books:booksAdmin,catalog,staff:staffAdmin,permissions,audit:auditView};
 let html=screen[state.view]?.()||'<p>Chưa có nội dung.</p>';
 if(state.view==='film'&&state.selected)html=filmDetail(state.selected);
 if(state.view==='edit'&&state.selected)html=editDetail(state.selected);
 $('page').innerHTML=html;
 wire();
}
function bindForm(id,callback){
 const form=$(id);if(!form)return;
 form.onsubmit=async e=>{e.preventDefault();const b=form.querySelector('button[type=submit]');if(b)b.disabled=true;
 try{await callback(Object.fromEntries(new FormData(form)));await load();state.selected=null;render();toast('Đã lưu thành công.');}
 catch(err){toast('Không lưu được: '+err.message);}finally{if(b)b.disabled=false;}};
}
function csvExport(){
 const lines=[['Mã sách','Tên sách','Kế hoạch','Đã có','Phát hành'],...state.books.map(b=>[b.code,b.name,b.target_count,b.total,b.published])];
 const csv='\ufeff'+lines.map(row=>row.map(c=>'"'+String(c??'').replace(/"/g,'""')+'"').join(',')).join('\r\n');
 const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));
 const a=document.createElement('a');a.href=url;a.download='QBOOK_BAO_CAO_VIDEO.csv';a.click();URL.revokeObjectURL(url);
}
async function validateVideoFile(file){
 if(!file||!file.type.startsWith('video/'))throw Error('Vui lòng chọn tệp video hợp lệ.');
 if(file.size>2*1024*1024*1024||!file.size)throw Error('Mỗi video phải có dữ liệu và không vượt 2 GB.');
 const video=document.createElement('video'),url=URL.createObjectURL(file);
 try{
  await new Promise((resolve,reject)=>{video.preload='metadata';video.onloadedmetadata=resolve;video.onerror=()=>reject(Error('Không đọc được thông tin video.'));video.src=url});
  if(Number.isFinite(video.duration)&&video.duration>3600)throw Error('Video tối đa 60 phút.');
 }finally{URL.revokeObjectURL(url);video.removeAttribute('src');video.load();}
}
function askGoogleDriveToken(continueWith){
 if(!window.google?.accounts?.oauth2)throw Error('Google chưa sẵn sàng. Vui lòng tải lại trang trong Chrome/Safari.');
 if(!state.googleClientId)throw Error('Google Client ID chưa sẵn sàng; tải lại trang.');
 const client=window.google.accounts.oauth2.initTokenClient({
  client_id:state.googleClientId,scope:'https://www.googleapis.com/auth/drive',
  callback:r=>{if(r.error||!r.access_token)return toast('Google chưa cấp quyền Drive: '+(r.error||'Đã hủy'));continueWith(r.access_token).catch(e=>toast(e.message));},
  error_callback:r=>toast('Không thể mở Google: '+(r.type||'Lỗi trình duyệt'))
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
 await validateVideoFile(file);
 const metadata={name:file.name,mimeType:file.type};
 const folder=googleFolderId(bookId);if(folder)metadata.parents=[folder];
 const start=await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id,name,size,webViewLink',{
  method:'POST',headers:{
   Authorization:'Bearer '+token,'Content-Type':'application/json; charset=UTF-8',
   'X-Upload-Content-Type':file.type,'X-Upload-Content-Length':String(file.size)
  },body:JSON.stringify(metadata)
 });
 if(!start.ok)throw Error('Google Drive không khởi tạo được phiên tải: HTTP '+start.status+'. Kiểm tra quyền và thư mục Drive của đầu sách.');
 const session=start.headers.get('Location');
 if(!session||!session.startsWith('https://'))throw Error('Google Drive chưa cấp phiên tải. Kiểm tra quyền của ứng dụng.');
 const chunkSize=8*1024*1024;let offset=0;
 while(offset<file.size){
  const end=Math.min(offset+chunkSize,file.size);
  const response=await fetch(session,{method:'PUT',headers:{
   'Content-Type':file.type,'Content-Range':'bytes '+offset+'-'+(end-1)+'/'+file.size
  },body:file.slice(offset,end)});
  if(response.status===308){
   const range=response.headers.get('Range');
   if(!range)throw Error('Google Drive chưa xác nhận tiến độ; vui lòng tải lại hoặc dùng liên kết Drive.');
   const next=Number(range.split('-').pop())+1;
   if(!Number.isFinite(next)||next<=offset||next>end)throw Error('Google Drive trả tiến độ không hợp lệ.');
   offset=next;
   updateStatus('Đã tải '+Math.round(100*offset/file.size)+'% · '+Math.round(offset/1048576)+' MB / '+Math.round(file.size/1048576)+' MB');
  }else if(response.ok){
   const result=await response.json();
   if(!result.id||Number(result.size)!==file.size)throw Error('Tệp Drive chưa được xác nhận đủ dung lượng.');
   updateStatus('Đã tải thành công. Bấm Lưu để cập nhật trạng thái video.');
   return result.webViewLink||'https://drive.google.com/file/d/'+encodeURIComponent(result.id)+'/view';
  }else throw Error('Google Drive lỗi HTTP '+response.status+'. Tệp chưa được ghi nhận vào QBooks.');
 }
 throw Error('Google Drive chưa trả kết quả hoàn tất tải tệp.');
}
function startUpload(sourceId,statusId,inputName){
 const file=$(sourceId)?.files?.[0];
 if(!file)return toast('Chọn tệp video trước khi tải.');
 const status=$(statusId),form=state.selected&&$(sourceId==='rawFile'?'filmForm':'editForm');
 if(!form)return;
 status.textContent='Đang yêu cầu quyền Google Drive...';
 // OAuth popup is requested from a user click, while transfer itself runs in its callback.
 askGoogleDriveToken(async token=>{
  const btn=$(sourceId==='rawFile'?'uploadRawVideo':'uploadEditedVideo');btn.disabled=true;
  try{
   const link=await uploadToDriveFile(file,state.selected.book_id,token,text=>status.textContent=text);
   form.elements[inputName].value=link;
  }catch(e){status.textContent=e.message;throw e;}
  finally{btn.disabled=false;}
 });
}
function wire(){
 initializeLessonSelection();
 if($('catalogBook'))$('catalogBook').onchange=e=>{state.catalogBook=e.target.value;state.catalogWeek='';render();};
 if($('catalogWeek'))$('catalogWeek').onchange=e=>{state.catalogWeek=e.target.value;render();};
 if($('catalogQuery'))$('catalogQuery').oninput=e=>{state.catalogQuery=e.target.value;$('catalogTable').innerHTML=catalogTable();};
 if($('productionDate'))$('productionDate').onchange=e=>{state.productionDate=e.target.value;render()};
 if($('productionStaff'))$('productionStaff').onchange=e=>{state.productionStaff=e.target.value;render()};
 document.querySelectorAll('[data-book]').forEach(b=>b.onclick=()=>{state.selectedBook=b.dataset.book;navigate('bookDetail')});
 const backBooks=$('backBooks');if(backBooks)backBooks.onclick=()=>navigate('booksProgress');
 document.querySelectorAll('[data-goto]').forEach(b=>b.onclick=()=>navigate(b.dataset.goto));
 if($('uploadRawVideo'))$('uploadRawVideo').onclick=()=>startUpload('rawFile','rawUploadStatus','raw_url');
 if($('uploadEditedVideo'))$('uploadEditedVideo').onclick=()=>startUpload('editedFile','editedUploadStatus','output_url');
 bindForm('bookForm',b=>api('POST','/api/video/books',b));
 bindForm('newVideoForm',b=>api('POST','/api/video/items',b));
 bindForm('filmForm',b=>api('PATCH','/api/video/items/'+state.selected.id,{action:'film',...b}));
 bindForm('editForm',b=>api('PATCH','/api/video/items/'+state.selected.id,{action:'edit',...b}));
 const eform=$('editForm');if(eform&&state.selected)eform.elements.status.value=['ĐANG HẬU KỲ','CHỜ DUYỆT','ĐÃ PHÁT HÀNH'].includes(state.selected.status)?state.selected.status:'ĐANG HẬU KỲ';
 const back=$('backList');if(back)back.onclick=()=>{state.selected=null;render()};
 function filterTable(){
  const q=($('filterVideo')?.value||'').toLocaleLowerCase('vi'),book=$('filterBook')?.value||'';
  const items=state.items.filter(v=>(state.view==='film'||v.status!=='CHỜ QUAY')&&(!book||v.book_id===book)&&(!q||(v.title+' '+v.book_name+' '+v.book_code).toLocaleLowerCase('vi').includes(q)));
  $('filteredRows').innerHTML=table(['Đầu sách','Video','Giảng viên','Người quay','Trạng thái','Thao tác'],makeVideoRows(items,state.view),'Chưa có video phù hợp');
  document.querySelectorAll('[data-action][data-id]').forEach(b=>b.onclick=()=>openVideo(b.dataset.id,b.dataset.action));
 }
 if($('filterVideo'))$('filterVideo').oninput=filterTable;
 if($('filterBook'))$('filterBook').onchange=filterTable;
 document.querySelectorAll('[data-action][data-id]').forEach(b=>b.onclick=()=>openVideo(b.dataset.id,b.dataset.action));
 document.querySelectorAll('[data-grant]').forEach(form=>form.onsubmit=async e=>{e.preventDefault();try{
  await api('POST','/api/video/staff',{user_id:form.dataset.grant,can_film:form.elements.can_film.checked,can_edit:form.elements.can_edit.checked,can_manage:form.elements.can_manage.checked});
  await load();render();toast('Đã cập nhật quyền nhân sự.');
 }catch(err){toast(err.message)}});
 const exp=$('exportReport');if(exp)exp.onclick=csvExport;
}
function openVideo(id,action){
 const v=state.items.find(x=>x.id===id);if(!v)return toast('Không tìm thấy video.');
 if(action==='film'&&!state.rights.film&&!state.rights.admin)return toast('Chưa có quyền quay video.');
 if(action==='edit'&&!state.rights.edit&&!state.rights.admin)return toast('Chưa có quyền hậu kỳ.');
 state.selected=v;state.view=action;renderNav();render();$('page').focus();
}
async function boot(){
 if(!state.token){window.location.href='/';return;}
 try{
  const b=await api('GET','/api/video/bootstrap');state.user=b.user;state.rights=b.rights;
  $('currentUser').textContent=b.user.name;
  const googleCfg=await fetch('/api/google/config').then(r=>r.json()).catch(()=>({}));state.googleClientId=googleCfg.clientId||'';
  await load();navigate('dashboard');
 }catch(err){if(err.message.includes('đăng nhập')||err.message.includes('401')){sessionStorage.removeItem('qbooks_token');window.location.href='/';return;}
  $('page').innerHTML='<div class="panel"><h2>Không mở được chương trình Video</h2><p>'+E(err.message)+'</p><a href="/">Quay về đăng nhập</a></div>';
 }
}
boot();
