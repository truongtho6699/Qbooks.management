const $=id=>document.getElementById(id);
const state={token:sessionStorage.getItem('qbooks_token')||'',view:'dashboard',books:[],items:[],staff:[],overview:null,rights:{},user:null,selected:null,filter:{}};
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
 if(section==='bookDetail')return !!state.user;
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
 const [bs,vs,ov]=await Promise.all([api('GET','/api/video/books'),api('GET','/api/video/items'),api('GET','/api/video/overview')]);
 state.books=bs.books;state.items=vs.items;state.overview=ov;
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
 const byName=new Map();
 for(const v of state.items){for(const [name,kind] of [[v.camera_name,'filmed'],[v.editor_name,'edited']]){
 if(!name)continue;const value=byName.get(name)||{filmed:0,edited:0};
 if(kind==='filmed'&&v.filmed_at)value.filmed++;
 if(kind==='edited'&&v.edited_at)value.edited++;
 byName.set(name,value);
 }}
 return kpis([{label:'Video đã quay',value:state.items.filter(v=>v.filmed_at).length},{label:'Video đã hậu kỳ',value:state.items.filter(v=>v.edited_at).length},{label:'Nhân sự tham gia',value:byName.size},{label:'Đầu sách',value:state.books.length}])+
 panel('Sản lượng theo nhân sự',table(['Nhân sự','Đã quay','Đã hậu kỳ','Tổng hoạt động'],[...byName].map(([name,v])=>[E(name),count(v.filmed),count(v.edited),count(v.filmed+v.edited)])),'Chưa có dữ liệu nhân sự');
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
function createVideo(){
 return panel('Lập kế hoạch video mới','<form id="newVideoForm" class="form-grid">'+
 '<div class="field"><label>Đầu sách *</label><select name="book_id" required><option value="">Chọn đầu sách</option>'+selected(booksList(),'')+'</select></div>'+
 '<div class="field"><label>Tên video / bài *</label><input name="title" required placeholder="Toán 1 – Bài 33"></div>'+
 '<div class="field"><label>Bài số</label><input name="lesson" placeholder="Tiết 1"></div>'+
 '<div class="field"><label>Nhóm bài</label><input name="lesson_group" placeholder="Tuần 5"></div>'+
 '<div class="field"><label>Giảng viên</label><input name="teacher" placeholder="Giảng viên phụ trách"></div>'+
 '<div class="field full"><label>Ghi chú</label><textarea name="note"></textarea></div>'+
 '<div class="actions full">'+btn('Lưu kế hoạch video','primary','','submit')+'</div></form>')+
 panel('Kế hoạch video',table(['Sách','Video','Giảng viên','Tình trạng'],state.items.map(v=>[E(v.book_code),E(v.title),E(v.teacher||'—'),badge(v.status)])));
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
 const screen={dashboard,adminOverview,bookDetail,filmOverview,film:filmList,createVideo,postOverview,edit:editList,production,booksProgress,report,books:booksAdmin,staff:staffAdmin,permissions,audit:auditView};
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
function wire(){
 document.querySelectorAll('[data-book]').forEach(b=>b.onclick=()=>{state.selectedBook=b.dataset.book;navigate('bookDetail')});
 const backBooks=$('backBooks');if(backBooks)backBooks.onclick=()=>navigate('booksProgress');
 document.querySelectorAll('[data-goto]').forEach(b=>b.onclick=()=>navigate(b.dataset.goto));
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
  await load();navigate('dashboard');
 }catch(err){if(err.message.includes('đăng nhập')||err.message.includes('401')){sessionStorage.removeItem('qbooks_token');window.location.href='/';return;}
  $('page').innerHTML='<div class="panel"><h2>Không mở được chương trình Video</h2><p>'+E(err.message)+'</p><a href="/">Quay về đăng nhập</a></div>';
 }
}
boot();
