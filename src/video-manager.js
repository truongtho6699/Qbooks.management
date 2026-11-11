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
 if(method==='GET'&&path==='/api/video/overview'){
  const totals=await db.prepare("SELECT COUNT(*) total, SUM(CASE WHEN status!='CHỜ QUAY' THEN 1 ELSE 0 END) filmed,SUM(CASE WHEN status IN ('CHỜ DUYỆT','ĐÃ PHÁT HÀNH') THEN 1 ELSE 0 END) edited,SUM(CASE WHEN status='ĐÃ PHÁT HÀNH' THEN 1 ELSE 0 END) published FROM video_items").first();
  const books=await db.prepare("SELECT b.id,b.code,b.name,b.target_count,COUNT(v.id) total,SUM(CASE WHEN v.status!='CHỜ QUAY' THEN 1 ELSE 0 END) filmed,SUM(CASE WHEN v.status='ĐÃ PHÁT HÀNH' THEN 1 ELSE 0 END) published FROM video_books b LEFT JOIN video_items v ON b.id=v.book_id GROUP BY b.id ORDER BY b.created_at DESC LIMIT 150").all();
  const staff=await db.prepare("SELECT u.name,COUNT(DISTINCT CASE WHEN v.camera_id=u.id THEN v.id END) filmed,COUNT(DISTINCT CASE WHEN v.editor_id=u.id THEN v.id END) edited FROM users u LEFT JOIN video_items v ON v.camera_id=u.id OR v.editor_id=u.id GROUP BY u.id ORDER BY filmed DESC,edited DESC LIMIT 100").all();
  return j({totals:{total:totals?.total||0,filmed:totals?.filmed||0,edited:totals?.edited||0,published:totals?.published||0},books:books.results||[],staff:staff.results||[]});
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
  let sql='SELECT v.*,b.code AS book_code,b.name AS book_name,cu.name AS camera_name,ed.name AS editor_name FROM video_items v JOIN video_books b ON b.id=v.book_id LEFT JOIN users cu ON cu.id=v.camera_id LEFT JOIN users ed ON ed.id=v.editor_id WHERE 1=1';
  const args=[];if(bookId){sql+=' AND v.book_id=?';args.push(bookId);}if(status){sql+=' AND v.status=?';args.push(status);}if(q){sql+=' AND (v.title LIKE ? OR b.name LIKE ? OR b.code LIKE ?)';args.push('%'+q+'%','%'+q+'%','%'+q+'%');}
  sql+=' ORDER BY v.updated_at DESC LIMIT 600';
  const r=await db.prepare(sql).bind(...args).all();return j({items:r.results||[]});
 }
 if(method==='POST'&&path==='/api/video/items'){
  requireRight('manage');const b=await body(),book=str(b.book_id,100),title=str(b.title,300);
  if(!book||!title)throw err('Chọn đầu sách và nhập tên video.');
  if(!(await db.prepare('SELECT id FROM video_books WHERE id=?').bind(book).first()))throw err('Đầu sách không tồn tại.');
  const id=crypto.randomUUID();
  await db.prepare('INSERT INTO video_items(id,book_id,title,lesson,lesson_group,teacher,note) VALUES(?,?,?,?,?,?,?)').bind(id,book,title,str(b.lesson,150),str(b.lesson_group,150),str(b.teacher,200),str(b.note,2000)).run();
  await log(db,u,'CREATE_VIDEO',id,title);return j({id},201);
 }
 const match=path.match(/^\/api\/video\/items\/([a-f0-9-]{36})$/);
 if(method==='PATCH'&&match){
  const current=await getOne(db,match[1]);const b=await body(),action=str(b.action,40);
  if(action==='film'){
   requireRight('film');if(!['CHỜ QUAY','ĐÃ QUAY'].includes(current.status))throw err('Video đã chuyển sang hậu kỳ.');
   const link=safeUrl(b.raw_url);if(!link)throw err('Cần liên kết video gốc trên Drive.');
   await db.prepare("UPDATE video_items SET raw_url=?,camera_id=?,filmed_at=CURRENT_TIMESTAMP,status='ĐÃ QUAY',note=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(link,u.id,str(b.note,2000),current.id).run();
  }else if(action==='edit'){
   requireRight('edit');if(!['ĐÃ QUAY','ĐANG HẬU KỲ','CHỜ DUYỆT'].includes(current.status))throw err('Video chưa được quay hoặc đã phát hành.');
   const next=str(b.status,30);if(!['ĐANG HẬU KỲ','CHỜ DUYỆT','ĐÃ PHÁT HÀNH'].includes(next))throw err('Trạng thái hậu kỳ không hợp lệ.');
   const output=safeUrl(b.output_url),youtube=safeUrl(b.youtube_url);
   if(next==='ĐÃ PHÁT HÀNH'&&!youtube)throw err('Cần liên kết YouTube để phát hành.');
   await db.prepare('UPDATE video_items SET editor_id=?,output_url=?,youtube_url=?,status=?,edited_at=CURRENT_TIMESTAMP,published_at=CASE WHEN ?=\'ĐÃ PHÁT HÀNH\' THEN CURRENT_TIMESTAMP ELSE published_at END,note=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').bind(u.id,output,youtube,next,next,str(b.note,2000),current.id).run();
  }else if(action==='update'){
   requireRight('manage');await db.prepare('UPDATE video_items SET title=?,lesson=?,lesson_group=?,teacher=?,note=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').bind(str(b.title,300)||current.title,str(b.lesson,150),str(b.lesson_group,150),str(b.teacher,200),str(b.note,2000),current.id).run();
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
