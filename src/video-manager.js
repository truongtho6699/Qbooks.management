// QBOOK VIDEO MANAGER — module isolated from QBooks packing and shipping.
const j=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});
const str=(v,max=500)=>String(v??'').trim().slice(0,max);
const err=(s,status=400)=>Object.assign(new Error(s),{status});
const admin=u=>u.can_admin===1||u.role==='ADMIN';
const roles=async(db,user)=>{
 const g=await db.prepare('SELECT * FROM video_role_grants WHERE user_id=?').bind(user.id).first();
 return {admin:admin(user),film:admin(user)||g?.can_film===1,edit:admin(user)||g?.can_edit===1,manage:admin(user)||g?.can_manage===1};
};
const safeUrl=(x)=>{const v=str(x,2000);if(!v)return '';try{const u=new URL(v);if(u.protocol==='https:'&&u.username===''&&u.password==='')return v;}catch{}throw err('Liên kết phải bắt đầu bằng https://');};
async function log(db,u,action,id='',details=''){await db.prepare('INSERT INTO video_audit(actor_id,action,video_id,details) VALUES(?,?,?,?)').bind(u.id,action,id,details).run();}
async function getOne(db,id){const v=await db.prepare('SELECT * FROM video_items WHERE id=?').bind(id).first();if(!v)throw err('Không tìm thấy video.',404);return v;}
export async function videoApi(req,env,u){
 const url=new URL(req.url),path=url.pathname,method=req.method,db=env.DB,rights=await roles(db,u);
 if(!rights.admin&&!rights.film&&!rights.edit&&!rights.manage)throw err('Tài khoản chưa được cấp quyền sử dụng Quản lý video sách.',403);
 const requireRight=r=>{if(!rights[r]&&!rights.admin)throw err('Tài khoản chưa được cấp quyền chức năng này.',403);};
 const body=async()=>{try{return await req.json()}catch{throw err('Nội dung gửi lên không hợp lệ.')}};
 if(method==='GET'&&path==='/api/video/bootstrap')return j({user:{id:u.id,name:u.name,email:u.email,role:u.role},rights});
 if(method==='GET'&&path==='/api/video/lessons'){
  const book=str(url.searchParams.get('book'),60);
  const sql='SELECT id,book_code,week,lesson_no,period,title,page FROM video_lessons'+(book?' WHERE book_code=?':'')+' ORDER BY book_code,id LIMIT 2500';
  const data=await db.prepare(sql).bind(...(book?[book]:[])).all();
  return j({lessons:data.results||[]});
 }
 if(method==='GET'&&path==='/api/video/overview'){
  const totals=await db.prepare("SELECT COUNT(*) total, SUM(CASE WHEN status!='CHỜ QUAY' THEN 1 ELSE 0 END) filmed,SUM(CASE WHEN edited_at IS NOT NULL THEN 1 ELSE 0 END) edited,SUM(CASE WHEN status='ĐÃ PHÁT HÀNH' THEN 1 ELSE 0 END) published,SUM(CASE WHEN status='CHỜ DUYỆT' AND review_status='PENDING' THEN 1 ELSE 0 END) pending_review,SUM(CASE WHEN review_status='CHANGES_REQUESTED' THEN 1 ELSE 0 END) need_revision FROM video_items").first();
  const statusCounts=await db.prepare('SELECT status,COUNT(*) total FROM video_items GROUP BY status').all();
  const uncovered=await db.prepare('SELECT COUNT(*) total FROM video_lessons l WHERE NOT EXISTS (SELECT 1 FROM video_items v WHERE v.lesson_id=l.id)').first();
  const books=await db.prepare("SELECT b.id,b.code,b.name,b.target_count,COUNT(v.id) total,SUM(CASE WHEN v.status!='CHỜ QUAY' THEN 1 ELSE 0 END) filmed,SUM(CASE WHEN v.status='ĐÃ PHÁT HÀNH' THEN 1 ELSE 0 END) published FROM video_books b LEFT JOIN video_items v ON b.id=v.book_id GROUP BY b.id ORDER BY b.created_at DESC LIMIT 150").all();
  const staff=await db.prepare("SELECT u.id,u.name,COUNT(DISTINCT CASE WHEN v.camera_id=u.id THEN v.id END) filmed,COUNT(DISTINCT CASE WHEN v.editor_id=u.id THEN v.id END) edited FROM users u LEFT JOIN video_items v ON v.camera_id=u.id OR v.editor_id=u.id GROUP BY u.id ORDER BY filmed DESC,edited DESC LIMIT 100").all();
  const activities=await db.prepare("SELECT event_type,actor_id,date(event_time,'+7 hours') day,COUNT(*) total FROM video_events WHERE event_type IN ('FILM_COMPLETED','EDIT_SUBMITTED') GROUP BY event_type,actor_id,date(event_time,'+7 hours') ORDER BY day DESC LIMIT 1500").all();const eventCount=await db.prepare('SELECT COUNT(*) total FROM video_events').first();return j({totals:{total:totals?.total||0,filmed:totals?.filmed||0,edited:totals?.edited||0,published:totals?.published||0,pending_review:totals?.pending_review||0,need_revision:totals?.need_revision||0},books:books.results||[],staff:staff.results||[],activities:activities.results||[],eventCount:eventCount?.total||0,unplannedLessons:uncovered?.total||0,statusCounts:statusCounts.results||[],asOf:new Date().toISOString()});
 }
 if(method==='GET'&&path==='/api/video/production'){
  const day=str(url.searchParams.get('day'),10);
  if(!/^\d{4}-\d{2}-\d{2}$/.test(day)||Number.isNaN(Date.parse(day+'T00:00:00Z')))throw err('Ngày báo cáo không hợp lệ.');
  const r=await db.prepare("SELECT u.id,u.name, SUM(CASE WHEN e.event_type='FILM_COMPLETED' THEN 1 ELSE 0 END) filmed,SUM(CASE WHEN e.event_type='EDIT_SUBMITTED' THEN 1 ELSE 0 END) edited FROM video_events e JOIN users u ON u.id=e.actor_id WHERE date(e.event_time,'+7 hours')=? AND e.event_type IN ('FILM_COMPLETED','EDIT_SUBMITTED') GROUP BY u.id,u.name ORDER BY filmed DESC,edited DESC,u.name").bind(day).all();
  return j({day,people:r.results||[],asOf:new Date().toISOString(),source:'video_events'});
 }
 if(method==='GET'&&path==='/api/video/books'){
  const r=await db.prepare("SELECT b.*,COUNT(v.id) AS total,SUM(CASE WHEN v.status='ĐÃ PHÁT HÀNH' THEN 1 ELSE 0 END) AS published FROM video_books b LEFT JOIN video_items v ON b.id=v.book_id GROUP BY b.id ORDER BY b.created_at DESC LIMIT 300").all();
  return j({books:r.results||[]});
 }
 if(method==='POST'&&path==='/api/video/books'){
  requireRight('manage');const b=await body(),code=str(b.code,60).toUpperCase(),name=str(b.name,250);
  if(!code||!name)throw err('Cần mã và tên đầu sách.');
  const count=Number(b.target_count||0);if(!Number.isSafeInteger(count)||count<0||count>100000)throw err('Chỉ tiêu video không hợp lệ.');
  const id=crypto.randomUUID();
  await db.prepare('INSERT INTO video_books(id,code,name,teacher,target_count,drive_url) VALUES(?,?,?,?,?,?)').bind(id,code,name,str(b.teacher,200),count,safeUrl(b.drive_url)).run();
  await log(db,u,'CREATE_BOOK',id,code);return j({id},201);
 }
 if(method==='GET'&&path==='/api/video/items'){
  const bookId=str(url.searchParams.get('book'),100),q=str(url.searchParams.get('q'),150),status=str(url.searchParams.get('status'),40);
  const page=Math.max(1,Math.min(100000,Number.parseInt(url.searchParams.get('page')||'1',10)||1));
  const pageSize=Math.max(10,Math.min(100,Number.parseInt(url.searchParams.get('pageSize')||'100',10)||100));
  let where=' WHERE 1=1';const args=[];
  if(bookId){where+=' AND v.book_id=?';args.push(bookId);}
  if(status){where+=' AND v.status=?';args.push(status);}
  if(url.searchParams.get('scope')==='edit')where+=" AND v.status!='CHỜ QUAY'";
  if(q){where+=' AND (v.title LIKE ? OR v.lesson LIKE ? OR b.name LIKE ? OR b.code LIKE ?)';args.push('%'+q+'%','%'+q+'%','%'+q+'%','%'+q+'%');}
  const countRow=await db.prepare('SELECT COUNT(*) total FROM video_items v JOIN video_books b ON b.id=v.book_id'+where).bind(...args).first();
  const sql='SELECT v.*,b.code AS book_code,b.name AS book_name,cu.name AS camera_name,ed.name AS editor_name FROM video_items v JOIN video_books b ON b.id=v.book_id LEFT JOIN users cu ON cu.id=v.camera_id LEFT JOIN users ed ON ed.id=v.editor_id'+where+' ORDER BY v.updated_at DESC,v.id DESC LIMIT ? OFFSET ?';
  const r=await db.prepare(sql).bind(...args,pageSize,(page-1)*pageSize).all();
  const total=countRow?.total||0;
  return j({items:r.results||[],pagination:{page,pageSize,total,pages:Math.ceil(total/pageSize)}});
 }
 if(method==='POST'&&path==='/api/video/items'){
  requireRight('manage');const b=await body(),book=str(b.book_id,100),title=str(b.title,300);
  if(!book||!title)throw err('Chọn đầu sách và nhập tên video.');
  const bookRecord=await db.prepare('SELECT id,code FROM video_books WHERE id=?').bind(book).first();if(!bookRecord)throw err('Đầu sách không tồn tại.');const lessonId=str(b.lesson_id,100);if(lessonId&&!await db.prepare('SELECT id FROM video_lessons WHERE id=? AND book_code=?').bind(lessonId,bookRecord.code).first())throw err('Bài học không thuộc đầu sách đã chọn.');
  const id=crypto.randomUUID();
  await db.prepare('INSERT INTO video_items(id,book_id,title,lesson,lesson_group,teacher,note,lesson_id) VALUES(?,?,?,?,?,?,?,?)').bind(id,book,title,str(b.lesson,150),str(b.lesson_group,150),str(b.teacher,200),str(b.note,2000),lessonId||null).run();
  await log(db,u,'CREATE_VIDEO',id,title);return j({id},201);
 }
 const match=path.match(/^\/api\/video\/items\/([a-f0-9-]{36})$/);
 if(method==='PATCH'&&match){
  const current=await getOne(db,match[1]),input=await body(),action=str(input.action,40),note=str(input.note,2000);
  const event=(kind,details='')=>db.prepare('INSERT OR IGNORE INTO video_events(video_id,actor_id,event_type,details) VALUES(?,?,?,?)').bind(current.id,u.id,kind,details).run();
  if(action==='film'){
    requireRight('film');
    if(!['CHỜ QUAY','ĐÃ QUAY'].includes(current.status))throw err('Video đã chuyển sang hậu kỳ.',409);
    const link=safeUrl(input.raw_url);if(!link)throw err('Cần link Drive của video gốc.');
    if(current.raw_url===link&&current.status==='ĐÃ QUAY')return j({ok:true,unchanged:true});
    const r=await db.prepare("UPDATE video_items SET raw_url=?,camera_id=COALESCE(camera_id,?),filmed_at=COALESCE(filmed_at,CURRENT_TIMESTAMP),status='ĐÃ QUAY',note=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND status IN ('CHỜ QUAY','ĐÃ QUAY')").bind(link,u.id,note,current.id).run();
    if(!r.meta?.changes)throw err('Video đã được người khác cập nhật.',409);
    if(!current.filmed_at)await event('FILM_COMPLETED','Lần quay hoàn tất đầu tiên');
  }else if(action==='edit'){
    requireRight('edit');
    if(!['ĐÃ QUAY','ĐANG HẬU KỲ','CHỜ DUYỆT'].includes(current.status))throw err('Video chưa quay hoặc đã phát hành.',409);
    if(current.status==='CHỜ DUYỆT'&&current.review_status!=='CHANGES_REQUESTED')throw err('Video đang chờ duyệt; không thể sửa.',409);
    const target=str(input.status,30);
    if(!['ĐANG HẬU KỲ','CHỜ DUYỆT'].includes(target))throw err('Hậu kỳ không được tự phát hành video.');
    const output=safeUrl(input.output_url);
    if(target==='CHỜ DUYỆT'&&!output)throw err('Cần link bản hậu kỳ để gửi duyệt.');
    const reviewed=target==='CHỜ DUYỆT'?'PENDING':'NONE';
    const sql="UPDATE video_items SET editor_id=COALESCE(editor_id,?),output_url=?,status=?,review_status=?,reviewed_by=NULL,reviewed_at=NULL,review_note='',edited_at=CASE WHEN ?='CHỜ DUYỆT' THEN COALESCE(edited_at,CURRENT_TIMESTAMP) ELSE edited_at END,note=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND status IN ('ĐÃ QUAY','ĐANG HẬU KỲ') AND review_status!='PENDING'";
    const r=await db.prepare(sql).bind(u.id,output,target,reviewed,target,note,current.id).run();
    if(!r.meta?.changes)throw err('Video đang được duyệt hoặc trạng thái đã thay đổi.',409);
    if(target==='CHỜ DUYỆT'&&!current.edited_at)await event('EDIT_SUBMITTED','Lần nộp bản hậu kỳ đầu tiên');
  }else if(action==='approve'||action==='reject'){
    requireRight('manage');
    if(current.status!=='CHỜ DUYỆT'||current.review_status!=='PENDING')throw err('Chỉ duyệt video CHỜ DUYỆT.',409);
    if(current.editor_id===u.id)throw err('Người biên tập không được tự duyệt.',403);
    if(action==='reject'&&!note)throw err('Vui lòng ghi lý do yêu cầu sửa.');
    const passed=action==='approve';
    const r=await db.prepare("UPDATE video_items SET status=?,review_status=?,reviewed_by=?,reviewed_at=CURRENT_TIMESTAMP,review_note=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='CHỜ DUYỆT' AND review_status='PENDING'").bind(passed?'CHỜ DUYỆT':'ĐANG HẬU KỲ',passed?'APPROVED':'CHANGES_REQUESTED',u.id,note,current.id).run();
    if(!r.meta?.changes)throw err('Video đã được xử lý bởi người khác.',409);
    await event(passed?'REVIEW_APPROVED':'REVIEW_REJECTED',note);
  }else if(action==='publish'){
    requireRight('manage');
    if(current.status!=='CHỜ DUYỆT'||current.review_status!=='APPROVED')throw err('Video chưa được phê duyệt.',409);
    const youtube=safeUrl(input.youtube_url);
    if(!youtube||!new URL(youtube).hostname.match(/^(www\.)?(youtube\.com|youtu\.be)$/i))throw err('Link phát hành phải là YouTube hợp lệ.');
    const r=await db.prepare("UPDATE video_items SET youtube_url=?,status='ĐÃ PHÁT HÀNH',published_at=COALESCE(published_at,CURRENT_TIMESTAMP),updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='CHỜ DUYỆT' AND review_status='APPROVED'").bind(youtube,current.id).run();
    if(!r.meta?.changes)throw err('Video đã thay đổi trạng thái.',409);
    await event('PUBLISHED',youtube);
  }else if(action==='update'){
    requireRight('manage');
    await db.prepare('UPDATE video_items SET title=?,lesson=?,lesson_group=?,teacher=?,note=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').bind(str(input.title,300)||current.title,str(input.lesson,150),str(input.lesson_group,150),str(input.teacher,200),note,current.id).run();
  }else throw err('Thao tác không được hỗ trợ.');
  await log(db,u,'VIDEO_'+action.toUpperCase(),current.id);
  return j({ok:true,id:current.id});
 }
 if(method==='GET'&&path==='/api/video/staff'){
  requireRight('manage');const r=await db.prepare('SELECT u.id,u.name,u.email,u.role,COALESCE(g.can_film,0) can_film,COALESCE(g.can_edit,0) can_edit,COALESCE(g.can_manage,0) can_manage FROM users u LEFT JOIN video_role_grants g ON g.user_id=u.id WHERE u.active=1 ORDER BY u.name LIMIT 300').all();return j({staff:r.results||[]});
 }
 if(method==='POST'&&path==='/api/video/staff'){
  if(!rights.admin)throw err('Chỉ Admin được phân quyền.',403);
  const b=await body(),id=str(b.user_id,100);if(!id)throw err('Thiếu nhân sự.');
  if(!(await db.prepare('SELECT id FROM users WHERE id=?').bind(id).first()))throw err('Nhân sự không tồn tại.');
  await db.prepare('INSERT INTO video_role_grants(user_id,can_film,can_edit,can_manage) VALUES(?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET can_film=excluded.can_film,can_edit=excluded.can_edit,can_manage=excluded.can_manage').bind(id,b.can_film?1:0,b.can_edit?1:0,b.can_manage?1:0).run();
  await log(db,u,'VIDEO_GRANT',id);return j({ok:true});
 }
 if(method==='GET'&&path==='/api/video/audit'){
  requireRight('manage');const r=await db.prepare('SELECT a.*,u.name AS actor_name FROM video_audit a LEFT JOIN users u ON u.id=a.actor_id ORDER BY a.id DESC LIMIT 300').all();return j({events:r.results||[]});
 }
 throw err('Không tìm thấy chức năng video.',404);
}
