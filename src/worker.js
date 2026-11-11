
import {STATUS,CHUNK_BYTES,STAGES,MAX_VIDEO,MAX_IMAGE,canUploadStage,validateUpload,partBounds,partsCount,orderTitle} from './domain.js';
import {verifyGoogleCredential} from './google-auth.js';
import {normalizeV35Row,validateShippingForm,canGroup,parseVNDate} from './legacy-v35.js';

const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'}});
const fail=(message,status=400)=>json({error:message},status);
const now=()=>Math.floor(Date.now()/1000);
const uid=()=>crypto.randomUUID();
const hex=(bytes)=>[...bytes].map(v=>v.toString(16).padStart(2,'0')).join('');
const clean=(value)=>String(value??'').trim();
async function sha(value){return hex(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))));}
async function hashPin(pin,salt){
 const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(pin),'PBKDF2',false,['deriveBits']);
 return hex(new Uint8Array(await crypto.subtle.deriveBits({name:'PBKDF2',salt:new TextEncoder().encode(salt),iterations:100000,hash:'SHA-256'},key,256)));
}
const randomToken=()=>hex(crypto.getRandomValues(new Uint8Array(32)));
async function requestJSON(req){try{return await req.json();}catch{throw Error('Nội dung yêu cầu không phải JSON hợp lệ.');}}
const authError=(m='Vui lòng đăng nhập lại.')=>Object.assign(new Error(m),{status:401});
const hasRole=(user,...roles)=>user.can_admin===1||roles.some(r=>(r==='PACKER'&&user.can_pack===1)||(r==='SHIPPER'&&user.can_ship===1)||(r==='SALE'&&user.role==='SALE')||(r==='ADMIN'&&user.can_admin===1));
function needRole(user,...roles){if(!hasRole(user,...roles))throw Object.assign(new Error('Tài khoản không có quyền thao tác.'),{status:403});}
async function actor(req,env){
 const token=(req.headers.get('authorization')||'').replace(/^Bearer\s+/i,'');
 if(!token)throw authError();
 const record=await env.DB.prepare('SELECT u.id,u.email,u.name,u.role,u.active,u.can_pack,u.can_ship,u.can_admin,s.expires_at FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=?')
   .bind(await sha(token)).first();
 if(!record||!record.active||record.expires_at<now())throw authError();
 return record;
}
async function audit(env,user,action,orderId='',details=''){
 await env.DB.prepare('INSERT INTO audit_log(actor_id,action,order_id,details) VALUES(?,?,?,?)').bind(user?.id||null,action,orderId,details).run();
}
async function orderById(env,id){
 const o=await env.DB.prepare('SELECT * FROM orders WHERE id=?').bind(id).first();
 if(!o)throw Object.assign(new Error('Không tìm thấy đơn hàng.'),{status:404});
 return o;
}
async function pendingUpload(env,id){
 const u=await env.DB.prepare('SELECT * FROM uploads WHERE id=?').bind(id).first();
 if(!u)throw Object.assign(new Error('Không tìm thấy phiên tải.'),{status:404});
 return u;
}
async function assertOrderLock(env,user,orderId,stage){
 const lock=await env.DB.prepare('SELECT user_id,stage,expires_at FROM order_locks WHERE order_id=?').bind(orderId).first();
 if(!lock||lock.user_id!==user.id||lock.stage!==stage||lock.expires_at<now())
  throw Object.assign(new Error('Chưa khóa đơn hoặc đơn đã bị người khác nhận xử lý. Chọn đơn lại.'),{status:409});
}
async function checkUploads(env,orderId,stages){
 const rows=await env.DB.prepare('SELECT stage,status FROM uploads WHERE order_id=?').bind(orderId).all();
 const data=rows.results||[];
 if(data.some(x=>stages.includes(x.stage)&&x.status!=='COMPLETE'))throw Error('Có ảnh/video chưa tải xong. Vui lòng tiếp tục tải trước khi lưu.');
 return data.filter(x=>stages.includes(x.stage)&&x.status==='COMPLETE');
}
function mustStageAccess(user,u,o){
 if(o.status!==(u.stage==='GIAO_HANG'?STATUS.SHIP:STATUS.PACK)||!hasRole(user,u.stage==='GIAO_HANG'?'SHIPPER':'PACKER'))throw Object.assign(new Error('Không được tải tệp vào đơn hoặc giai đoạn này.'),{status:403});
}
function filePath(orderId,stage,name){return 'orders/'+encodeURIComponent(orderId)+'/'+stage+'/'+uid()+'-'+name.replace(/[^\w.\-]/g,'_');}
async function handle(req,env){
 const url=new URL(req.url),path=url.pathname,method=req.method;
 if(method==='GET'&&path==='/api/health')return json({ok:true,service:'qbooks-management',storageConfigured:!!env.MEDIA,databaseConfigured:!!env.DB});
 if(method==='GET'&&path==='/api/google/config')return json({enabled:!!env.GOOGLE_CLIENT_ID,clientId:env.GOOGLE_CLIENT_ID||null});
 if(method==='POST'&&path==='/api/google/login'){
  const data=await requestJSON(req);
  const identity=await verifyGoogleCredential(data.credential,env.GOOGLE_CLIENT_ID);
  let found=await env.DB.prepare('SELECT id,email,name,role,active,google_sub FROM users WHERE google_sub=?').bind(identity.sub).first();
  if(!found){
   const matching=await env.DB.prepare('SELECT id,email,name,role,active,google_sub FROM users WHERE email=?').bind(identity.email).first();
   if(matching){
    if(!matching.active)throw Object.assign(new Error('Tài khoản đã bị vô hiệu hóa. Liên hệ quản trị.'),{status:403});
    if(matching.google_sub&&matching.google_sub!==identity.sub)throw Object.assign(new Error('Email này đã liên kết tài khoản Google khác.'),{status:403});
    if(!matching.google_sub&&identity.authoritativeEmail){
     const changed=await env.DB.prepare('UPDATE users SET google_sub=? WHERE id=? AND google_sub IS NULL')
      .bind(identity.sub,matching.id).run();
     if(!changed.meta.changes)throw Error('Tài khoản vừa được cập nhật. Vui lòng đăng nhập lại.');
     found=matching;
    }else if(matching.google_sub===identity.sub){
     found=matching;
    }
   }
  }
  if(!found){
   const existing=await env.DB.prepare('SELECT status FROM google_registrations WHERE google_sub=?').bind(identity.sub).first();
   if(existing?.status==='REJECTED')throw Object.assign(new Error('Yêu cầu đăng ký Google đã bị từ chối. Liên hệ quản trị.'),{status:403});
   if(!existing){
    await env.DB.prepare("INSERT INTO google_registrations(google_sub,email,name,status) VALUES(?,?,?,'PENDING')")
     .bind(identity.sub,identity.email,identity.name).run();
   }else{
    await env.DB.prepare("UPDATE google_registrations SET name=?,updated_at=CURRENT_TIMESTAMP WHERE google_sub=? AND status='PENDING'")
     .bind(identity.name,identity.sub).run();
   }
   return json({pending:true,message:'Đã ghi nhận đăng ký Google. Vui lòng chờ quản trị viên duyệt và cấp quyền.'},202);
  }
  if(!found.active)throw Object.assign(new Error('Tài khoản đã bị vô hiệu hóa.'),{status:403});
  const token=randomToken(),expires=now()+12*3600;
  await env.DB.prepare('INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,?)').bind(await sha(token),found.id,expires).run();
  return json({token,user:{id:found.id,email:found.email,name:found.name,role:found.role},expires});
 }
 if(method==='POST'&&path==='/api/setup'){
  if(!env.SETUP_KEY)throw Error('Chưa cấu hình mã thiết lập quản trị trong Worker secret.');
  const input=await requestJSON(req);
  if(input.setupKey!==env.SETUP_KEY)throw Object.assign(new Error('Mã thiết lập không hợp lệ.'),{status:403});
  const count=await env.DB.prepare('SELECT COUNT(*) n FROM users').first();
  if(count.n)throw Object.assign(new Error('Hệ thống đã có quản trị; không cho thiết lập lại.'),{status:409});
  if(!/^\d{3,12}$/.test(String(input.pin||'')))throw Error('PIN quản trị cần 3–12 chữ số.');
  const salt=uid(),id=uid();
  await env.DB.prepare('INSERT INTO users(id,email,name,role,pin_salt,pin_hash,can_pack,can_ship,can_admin) VALUES(?,?,?,?,?,?,?,?,?)')
   .bind(id,clean(input.email).toLowerCase(),clean(input.name)||'Admin','ADMIN',salt,await hashPin(input.pin,salt),1,1,1).run();
  return json({ok:true,message:'Đã tạo tài khoản quản trị.'},201);
 }
 if(method==='POST'&&path==='/api/login'){
  const data=await requestJSON(req),email=clean(data.email).toLowerCase(),pin=String(data.pin||'');
  const user=await env.DB.prepare('SELECT * FROM users WHERE email=? AND active=1').bind(email).first();
  if(!user||user.locked_until>now())throw authError('Đăng nhập không hợp lệ hoặc tài khoản tạm khóa.');
  const candidate=await hashPin(pin,user.pin_salt);
  if(candidate!==user.pin_hash){
   const failed=user.failed_attempts+1;
   await env.DB.prepare('UPDATE users SET failed_attempts=?,locked_until=? WHERE id=?')
     .bind(failed>=5?0:failed,failed>=5?now()+900:0,user.id).run();
   throw authError('Email hoặc PIN không đúng.');
  }
  await env.DB.prepare('UPDATE users SET failed_attempts=0,locked_until=0 WHERE id=?').bind(user.id).run();
  const token=randomToken(),expires=now()+12*3600;
  await env.DB.prepare('INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,?)').bind(await sha(token),user.id,expires).run();
  return json({token,user:{id:user.id,email:user.email,name:user.name,role:user.role},expires});
 }
 const user=await actor(req,env);
 if(method==='POST'&&path==='/api/logout'){
  const token=req.headers.get('authorization').replace(/^Bearer\s+/i,'');
  await env.DB.prepare('DELETE FROM sessions WHERE token_hash=?').bind(await sha(token)).run();
  return json({ok:true});
 }
 if(method==='GET'&&path==='/api/bootstrap')return json({user:{id:user.id,name:user.name,email:user.email,role:user.role,rights:{dongHang:hasRole(user,'PACKER'),vanDon:hasRole(user,'SHIPPER'),admin:hasRole(user,'ADMIN')}},statuses:STATUS});
 if(method==='POST'&&path==='/api/legacy/import'){
  needRole(user,'ADMIN');
  const b=await requestJSON(req);
  if(b.confirmation!=='DONG_Y_NHAP_D1_CHI_MOT_CHIEU')
   throw Object.assign(new Error('Chưa xác nhận nhập dữ liệu vào D1.'),{status:403});
  const token=String(b.googleAccessToken||'').trim();
  if(token.length<30||token.length>4096||!/^[A-Za-z0-9._~+\/_-]+$/.test(token))
   throw Error('Phiên Google không hợp lệ hoặc đã hết hạn.');
  const offset=Math.max(0,Math.min(900,Math.floor(Number(b.offset)||0)));
  const limit=Math.max(1,Math.min(100,Math.floor(Number(b.limit)||50)));
  const rowStart=offset+2,rowEnd=rowStart+limit-1;
  const ranges=['DATA_TONG!A1:AP1','DATA_TONG!A'+rowStart+':AP'+rowEnd,'DM_NHAN_SU!A1:F301'];
  const query=ranges.map(r=>'ranges='+encodeURIComponent(r)).join('&');
  const google=await fetch('https://sheets.googleapis.com/v4/spreadsheets/1TSuK6EF2yK8Qb9ZAU1v98VhzekrjX2SKkIDmR7OXMiw/values:batchGet?'+query+'&valueRenderOption=FORMATTED_VALUE',
    {headers:{Authorization:'Bearer '+token},cache:'no-store'});
  if(!google.ok)throw Object.assign(new Error('Không đọc được Google Sheets để nhập. Kiểm tra quyền truy cập hoặc cấp lại quyền đọc.'),{status:502});
  const valueRanges=(await google.json()).valueRanges||[];
  const header=valueRanges[0]?.values?.[0]||[];
  if(header[0]!=='ID_DON'||header[3]!=='MA_HOA_DON'||header[23]!=='TRANG_THAI'||header[41]!=='NHA_XE_SALE')
   throw Error('Tiêu đề DATA_TONG không khớp cấu trúc 42 cột V35. Đã từ chối nhập.');
  const rawRows=valueRanges[1]?.values||[];
  const staffHeader=valueRanges[2]?.values?.[0]||[];
  const staffRows=staffHeader[0]==='EMAIL'&&staffHeader[1]==='HO_TEN'?
   (valueRanges[2]?.values||[]).slice(1):[];
  const yes=v=>['true','1','có','x','yes'].includes(String(v||'').trim().toLowerCase());
  let staffImported=0;
  for(const person of staffRows){
   const email=String(person[0]||'').trim().toLowerCase(),name=String(person[1]||'').trim();
   if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||!name)continue;
   const active=String(person[5]||'').trim().toUpperCase()==='HOẠT ĐỘNG'?1:0;
   await env.DB.prepare('INSERT INTO legacy_staff_catalog(email,name,can_pack,can_ship,can_admin,active) VALUES(?,?,?,?,?,?) ON CONFLICT(email) DO UPDATE SET name=excluded.name,can_pack=excluded.can_pack,can_ship=excluded.can_ship,can_admin=excluded.can_admin,active=excluded.active,imported_at=CURRENT_TIMESTAMP')
    .bind(email,name,yes(person[2])?1:0,yes(person[3])?1:0,yes(person[4])?1:0,active).run();
   staffImported++;
  }
  const report={new:0,updated:0,unchanged:0,conflicts:0,errors:0,details:[],readOnlyGoogle:true};
  const fields=[
   'id','invoice_codes','original_content','delivery_time','transport','customer','quantity','address',
   'sale_name','carrier','status','group_id','packing_note','boxes','packing_helpers','shipping_note',
   'shipping_person','shipping_phone','shipping_type','shipping_fee','heavy_fee','terminal_fee','extra_fee','total_fee',
   'packing_folder_url','shipping_folder_url','invoice_folder_url','video_folder_url','goods_folder_url',
   'source_system','source_updated_at','source_fingerprint','source_payload','source_creator','source_created_at',
   'source_packed_by','source_shipped_by','created_at'
  ];
  const updates=fields.filter(k=>!['id','source_system','created_at'].includes(k));
  const seen=new Set();
  for(let i=0;i<rawRows.length;i++){
   const row=rawRows[i];
   if(!row[0])continue;
   try{
    const parsed=normalizeV35Row(row);
    if(seen.has(parsed.id))throw Error('Trùng ID_DON trong lô dữ liệu.');
    seen.add(parsed.id);
    const hash=await sha(JSON.stringify(row));
    const current=await env.DB.prepare('SELECT id,source_system,local_dirty,source_fingerprint FROM orders WHERE id=?')
     .bind(parsed.id).first();
    if(current){
     if(current.source_system!=='GOOGLE_SHEETS'||current.local_dirty){
      report.conflicts++;report.details.push({id:parsed.id,result:'CONFLICT'});continue;
     }
     if(current.source_fingerprint===hash){
      report.unchanged++;continue;
     }
    }
    const valueByKey={...parsed,packing_helpers:JSON.stringify(parsed.packing_helpers),
     source_system:'GOOGLE_SHEETS',source_fingerprint:hash,source_payload:JSON.stringify(row),
     source_creator:parsed.legacy_created_by,source_created_at:parsed.legacy_created_at,
     source_packed_by:parsed.legacy_packed_by,source_shipped_by:parsed.legacy_shipped_by,
     created_at:parseVNDate(parsed.legacy_created_at)||new Date().toISOString().replace('T',' ').slice(0,19)};
    const binds=fields.map(k=>valueByKey[k]??null);
    if(!current){
     await env.DB.prepare('INSERT INTO orders ('+fields.join(',')+',synced_at) VALUES ('+fields.map(()=>'?').join(',')+',CURRENT_TIMESTAMP)').bind(...binds).run();
     report.new++;
    }else{
     await env.DB.prepare('UPDATE orders SET '+updates.map(k=>k+'=?').join(',')+',synced_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=? AND source_system=\'GOOGLE_SHEETS\' AND local_dirty=0')
      .bind(...updates.map(k=>valueByKey[k]??null),parsed.id).run();
     report.updated++;
    }
   }catch(err){report.errors++;report.details.push({row:rowStart+i,error:err.message.slice(0,160)});}
  }
  await audit(env,user,'IMPORT_GOOGLE_SHEETS','',JSON.stringify({offset,limit,new:report.new,updated:report.updated,conflicts:report.conflicts,errors:report.errors}));
  return json({...report,staffCatalog:staffImported});
 }
 if(method==='GET'&&path==='/api/legacy/status'){
  needRole(user,'ADMIN');
  return json({sheetId:'1TSuK6EF2yK8Qb9ZAU1v98VhzekrjX2SKkIDmR7OXMiw',
   configured:!!(env.QBOOKS_BRIDGE_URL&&env.QBOOKS_SYNC_SECRET),
   mode:'READ_ONLY_PREVIEW',writeBackEnabled:false,driveMirrorEnabled:false});
 }
 if(method==='GET'&&path==='/api/legacy/preview'){
  needRole(user,'ADMIN');
  if(!env.QBOOKS_BRIDGE_URL||!env.QBOOKS_SYNC_SECRET)
   throw Object.assign(new Error('Chưa cấu hình cầu nối Google Sheets. Bản Cloudflare chưa được phép đọc dữ liệu thật.'),{status:503});
  const endpoint=String(env.QBOOKS_BRIDGE_URL);
  if(!/^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(endpoint))
   throw Object.assign(new Error('URL cầu nối không hợp lệ.'),{status:503});
  const offset=Math.max(0,Math.min(100000,Math.floor(Number(url.searchParams.get('offset'))||0)));
  const limit=Math.max(1,Math.min(100,Math.floor(Number(url.searchParams.get('limit'))||50)));
  const response=await fetch(endpoint,{method:'POST',headers:{'content-type':'application/json'},
   body:JSON.stringify({action:'snapshot',secret:env.QBOOKS_SYNC_SECRET,timestamp:Date.now(),nonce:uid(),offset,limit})});
  if(!response.ok)throw Object.assign(new Error('Không thể đọc Google Sheets qua cầu nối.'),{status:502});
  const data=await response.json();
  if(!data.success||data.readOnly!==true||!Array.isArray(data.rows))
   throw Object.assign(new Error('Cầu nối Google Sheets từ chối yêu cầu hoặc trả dữ liệu không hợp lệ.'),{status:502});
  const parsed=data.rows.map((row,i)=>{try{return{record:normalizeV35Row(row),error:null};}catch(e){return{record:null,error:'Dòng '+(offset+i+2)+': '+e.message};}});
  const valid=parsed.filter(x=>x.record).map(x=>x.record);
  const ids=valid.map(x=>x.id);
  let known=[];
  if(ids.length){
   const existing=await env.DB.prepare('SELECT id,status,source_system,source_updated_at FROM orders WHERE id IN ('+ids.map(()=>'?').join(',')+')').bind(...ids).all();
   known=existing.results||[];
  }
  const index=new Map(known.map(x=>[x.id,x]));
  const preview=parsed.map(x=>{
   if(!x.record)return{error:x.error,action:'ERROR'};
   const current=index.get(x.record.id);
   const action=!current?'NEW':current.source_system!=='GOOGLE_SHEETS'?'CONFLICT':current.source_updated_at===x.record.source_updated_at?'UNCHANGED':'CHANGED';
   return {id:x.record.id,invoice_codes:x.record.invoice_codes,customer:x.record.customer,
    status:x.record.status,group_id:x.record.group_id,source_updated_at:x.record.source_updated_at,
    action,existingStatus:current?.status||null};
  });
  return json({readOnly:true,total:Number(data.total)||0,offset,limit,preview,
   summary:{new:preview.filter(x=>x.action==='NEW').length,changed:preview.filter(x=>x.action==='CHANGED').length,
    unchanged:preview.filter(x=>x.action==='UNCHANGED').length,conflicts:preview.filter(x=>x.action==='CONFLICT').length,
    errors:preview.filter(x=>x.action==='ERROR').length}});
 }

 if(method==='GET'&&path==='/api/google/pending'){
  needRole(user,'ADMIN');
  const rows=await env.DB.prepare("SELECT r.google_sub,r.email,r.name,r.requested_at,CASE WHEN u.id IS NULL THEN 0 ELSE 1 END existing_user FROM google_registrations r LEFT JOIN users u ON u.email=r.email WHERE r.status='PENDING' ORDER BY r.requested_at DESC LIMIT 100").all();
  return json({registrations:rows.results||[]});
 }
 if(method==='POST'&&path==='/api/google/approve'){
  needRole(user,'ADMIN');
  const input=await requestJSON(req),sub=clean(input.sub),role=clean(input.role);
  if(!['SALE','PACKER','SHIPPER'].includes(role))throw Error('Chỉ được phê duyệt nhân sự theo vai trò nghiệp vụ.');
  const requestRow=await env.DB.prepare("SELECT google_sub,email,name FROM google_registrations WHERE google_sub=? AND status='PENDING'").bind(sub).first();
  if(!requestRow)throw Object.assign(new Error('Đăng ký không còn chờ duyệt.'),{status:404});
  const existing=await env.DB.prepare('SELECT id,email,role,google_sub FROM users WHERE email=? OR google_sub=?').bind(requestRow.email,sub).first();
  if(existing){
   if(existing.email!==requestRow.email||(existing.google_sub&&existing.google_sub!==sub))
    throw Object.assign(new Error('Google đã liên kết tài khoản khác. Cần đối chiếu trước khi duyệt.'),{status:409});
   await env.DB.batch([
    env.DB.prepare('UPDATE users SET google_sub=? WHERE id=? AND (google_sub IS NULL OR google_sub=?)').bind(sub,existing.id,sub),
    env.DB.prepare("DELETE FROM google_registrations WHERE google_sub=? AND status='PENDING'").bind(sub)
   ]);
   await audit(env,user,'LINK_GOOGLE_USER','',existing.id);
   return json({ok:true,id:existing.id,role:existing.role,linked:true});
  }
  const salt=uid(),id=uid();
  const unusablePinHash=await hashPin(randomToken(),salt);
  await env.DB.batch([
   env.DB.prepare('INSERT INTO users(id,email,name,role,pin_salt,pin_hash,google_sub,can_pack,can_ship,can_admin) VALUES(?,?,?,?,?,?,?,?,?,?)')
    .bind(id,requestRow.email,requestRow.name,role,salt,unusablePinHash,sub,role==='PACKER'?1:0,role==='SHIPPER'?1:0,0),
   env.DB.prepare("DELETE FROM google_registrations WHERE google_sub=? AND status='PENDING'").bind(sub)
  ]);
  await audit(env,user,'APPROVE_GOOGLE_USER','',JSON.stringify({id,role}));
  return json({ok:true,id,role});
 }
 if(method==='POST'&&path==='/api/google/reject'){
  needRole(user,'ADMIN');const input=await requestJSON(req),sub=clean(input.sub);
  const result=await env.DB.prepare("UPDATE google_registrations SET status='REJECTED',updated_at=CURRENT_TIMESTAMP WHERE google_sub=? AND status='PENDING'").bind(sub).run();
  if(!result.meta.changes)throw Object.assign(new Error('Đăng ký không còn chờ duyệt.'),{status:404});
  await audit(env,user,'REJECT_GOOGLE_USER');return json({ok:true});
 }
 if(method==='GET'&&path==='/api/packing-people'){
  needRole(user,'PACKER','SHIPPER');
  const r=await env.DB.prepare("SELECT email,name FROM users WHERE active=1 AND (can_pack=1 OR can_admin=1) UNION SELECT email,name FROM legacy_staff_catalog WHERE active=1 AND can_pack=1 ORDER BY name LIMIT 300").all();
  return json({people:r.results||[]});
 }
 if(method==='GET'&&path==='/api/admin/data'){
  needRole(user,'ADMIN');
  const kind=clean(url.searchParams.get('kind'));
  if(kind==='DATA'){
   const result=await env.DB.prepare('SELECT id,invoice_codes,customer,sale_name,quantity,status,group_id,shipping_type,total_fee,source_system,local_dirty,updated_at FROM orders ORDER BY created_at DESC LIMIT 300').all();
   return json({headers:['ID_DON','MA_HOA_DON','TEN_KHACH','TEN_SALE','SO_QUYEN','TRANG_THAI','NHOM_VAN_DON','LOAI_SHIP','TONG_TIEN','NGUON','CHO_DONG_BO','CAP_NHAT'],rows:(result.results||[]).map(x=>Object.values(x))});
  }
  if(kind==='LOG'){
   const result=await env.DB.prepare('SELECT created_at,action,order_id,details FROM audit_log ORDER BY id DESC LIMIT 300').all();
   return json({headers:['THOI_GIAN','HANH_DONG','ID_DON','CHI_TIET'],rows:(result.results||[]).map(x=>[x.created_at,x.action,x.order_id,x.details])});
  }
  if(kind==='STAFF'){
   const result=await env.DB.prepare('SELECT email,name,role,can_pack,can_ship,can_admin,active FROM users ORDER BY name LIMIT 300').all();
   return json({headers:['EMAIL','HO_TEN','VAI_TRO','DONG_HANG','VAN_DON','ADMIN','TRANG_THAI'],rows:(result.results||[]).map(x=>[x.email,x.name,x.role,x.can_pack,x.can_ship,x.can_admin,x.active?'HOẠT ĐỘNG':'NGỪNG'])});
  }
  throw Error('Loại báo cáo không hợp lệ.');
 }
 if(method==='GET'&&path==='/api/users'){
  needRole(user,'ADMIN');
  const r=await env.DB.prepare('SELECT id,email,name,role,can_pack,can_ship,can_admin,active FROM users ORDER BY name LIMIT 300').all();
  return json({users:r.results||[]});
 }
 const staffMatch=path.match(/^\/api\/users\/([a-f0-9-]+)$/);
 if(method==='PATCH'&&staffMatch){
  needRole(user,'ADMIN');const id=staffMatch[1],b=await requestJSON(req);
  const target=await env.DB.prepare('SELECT id,email,role FROM users WHERE id=?').bind(id).first();
  if(!target)throw Object.assign(new Error('Không tìm thấy nhân sự.'),{status:404});
  const active=b.active!==false;
  const pack=!!b.dongHang,ship=!!b.vanDon,admin=!!b.admin;
  if(user.id===id&&(!active||!admin))throw Error('Không thể tự vô hiệu hóa hoặc bỏ quyền quản trị của chính mình.');
  const name=clean(b.name);
  if(!name)throw Error('Tên nhân sự không được trống.');
  const pin=String(b.pin||'').trim();
  if(pin&&!/^\d{3,8}$/.test(pin))throw Error('PIN mới phải có 3–8 chữ số.');
  if(pin){
   const salt=uid(),hashed=await hashPin(pin,salt);
   await env.DB.prepare('UPDATE users SET name=?,can_pack=?,can_ship=?,can_admin=?,active=?,pin_salt=?,pin_hash=? WHERE id=?')
    .bind(name,pack?1:0,ship?1:0,admin?1:0,active?1:0,salt,hashed,id).run();
  }else{
   await env.DB.prepare('UPDATE users SET name=?,can_pack=?,can_ship=?,can_admin=?,active=? WHERE id=?')
    .bind(name,pack?1:0,ship?1:0,admin?1:0,active?1:0,id).run();
  }
  await audit(env,user,'UPDATE_STAFF','',target.email);
  return json({ok:true,id});
 }
 if(method==='POST'&&path==='/api/users'){
  needRole(user,'ADMIN');const b=await requestJSON(req);
  if(!['ADMIN','SALE','PACKER','SHIPPER'].includes(b.role))throw Error('Vai trò không hợp lệ.');
  if(!/^\d{3,12}$/.test(String(b.pin||'')))throw Error('PIN cần 3–12 chữ số.');
  const salt=uid(),id=uid();
  await env.DB.prepare('INSERT INTO users(id,email,name,role,pin_salt,pin_hash,can_pack,can_ship,can_admin) VALUES(?,?,?,?,?,?,?,?,?)')
   .bind(id,clean(b.email).toLowerCase(),clean(b.name),b.role,salt,await hashPin(b.pin,salt),
    b.dongHang||['PACKER','ADMIN'].includes(b.role)?1:0,
    b.vanDon||['SHIPPER','ADMIN'].includes(b.role)?1:0,
    b.admin||b.role==='ADMIN'?1:0).run();
  await audit(env,user,'CREATE_USER','',id);return json({id},201);
 }
 if(method==='GET'&&path==='/api/orders'){
  needRole(user,'PACKER','SHIPPER');
  const query=clean(url.searchParams.get('q')).slice(0,120);
  let status=clean(url.searchParams.get('status'));
  if(user.role==='PACKER'&&!user.can_ship&&!user.can_admin)status=STATUS.PACK;
  if(user.role==='SHIPPER'&&!user.can_pack&&!user.can_admin)status=STATUS.SHIP;
  const conditions=[],params=[];
  if(status){conditions.push('status=?');params.push(status);}
  if(query){conditions.push('(invoice_codes LIKE ? OR customer LIKE ? OR sale_name LIKE ?)');params.push(...Array(3).fill('%'+query+'%'));}
  const sql='SELECT * FROM orders'+(conditions.length?' WHERE '+conditions.join(' AND '):'')+' ORDER BY created_at DESC LIMIT 300';
  const rows=await env.DB.prepare(sql).bind(...params).all();
  return json({orders:(rows.results||[]).map(o=>({...o,title:orderTitle(o)}))});
 }
 if(method==='POST'&&path==='/api/orders'){
  needRole(user,'SALE');
  if(env.QBOOKS_ENABLE_LOCAL_SALE!=='true')
   throw Object.assign(new Error('Đơn Sale hiện lấy từ SALE_DONG_DON trên Google Sheets. Chức năng tạo đơn riêng D1 tạm khóa để tránh dữ liệu lệch.'),{status:409});const b=await requestJSON(req);
  const invoice=clean(b.invoice_codes),saleName=clean(b.sale_name)||user.name,customer=clean(b.customer);
  if(!invoice||!customer)throw Error('Cần mã hóa đơn và tên khách hàng.');
  const id=uid();
  await env.DB.prepare('INSERT INTO orders(id,invoice_codes,sale_name,customer,quantity,address,carrier,transport,urgent,created_by) VALUES(?,?,?,?,?,?,?,?,?,?)')
  .bind(id,invoice,saleName,customer,Number(b.quantity)||0,clean(b.address),clean(b.carrier),clean(b.transport),b.urgent?1:0,user.id).run();
  await audit(env,user,'CREATE_ORDER',id,invoice);return json({id},201);
 }
 if(method==='POST'&&path==='/api/groups'){
  needRole(user,'SALE','SHIPPER');
  if(env.QBOOKS_ENABLE_LOCAL_SALE!=='true')
   throw Object.assign(new Error('Gộp đơn thực hiện tại SALE_GOP_VAN_DON. Chưa bật ghi nhóm từ Cloudflare.'),{status:409});const b=await requestJSON(req),ids=[...new Set((b.orderIds||[]).map(String))];
  if(ids.length<2)throw Error('Cần ít nhất 2 đơn để gộp.');
  if(ids.length>100)throw Error('Tối đa 100 đơn/nhóm.');
  const rows=await env.DB.prepare('SELECT id,status,group_id FROM orders WHERE id IN ('+ids.map(()=>'?').join(',')+')').bind(...ids).all();
  if(rows.results.length!==ids.length||rows.results.some(o=>![STATUS.PACK,STATUS.SHIP].includes(o.status)))throw Error('Có đơn không hợp lệ hoặc đã hoàn thành.');
  const existing=[...new Set(rows.results.map(o=>o.group_id).filter(Boolean))];
  if(existing.length>1)throw Error('Các đơn đã thuộc nhiều nhóm khác nhau.');
  const groupId=existing[0]||('VD'+Date.now());
  const stmts=[];
  if(!existing.length)stmts.push(env.DB.prepare('INSERT INTO shipping_groups(id,created_by) VALUES(?,?)').bind(groupId,user.id));
  for(const id of ids)stmts.push(env.DB.prepare('UPDATE orders SET group_id=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND (group_id IS NULL OR group_id=?)').bind(groupId,id,groupId));
  await env.DB.batch(stmts);await audit(env,user,'GROUP_ORDERS','',JSON.stringify({groupId,ids}));return json({groupId,orderIds:ids});
 }
 const lockMatch=path.match(/^\/api\/orders\/([A-Za-z0-9_-]+)\/lock$/);
 if(lockMatch){
  const id=lockMatch[1],o=await orderById(env,id);
  if(method==='POST'){
   const data=await requestJSON(req),stage=data.stage;
   if(!['DONG_HANG','VAN_DON'].includes(stage))throw Error('Loại khóa đơn không hợp lệ.');
   needRole(user,stage==='DONG_HANG'?'PACKER':'SHIPPER');
   if(stage==='DONG_HANG'&&o.status!==STATUS.PACK)throw Error('Đơn không chờ đóng hàng.');
   if(stage==='VAN_DON'&&![STATUS.SHIP,STATUS.MOVING].includes(o.status))throw Error('Đơn không chờ vận đơn.');
   const expires=now()+6*3600;
   const result=await env.DB.prepare('INSERT INTO order_locks(order_id,user_id,stage,expires_at) VALUES(?,?,?,?) ON CONFLICT(order_id) DO UPDATE SET user_id=excluded.user_id,stage=excluded.stage,expires_at=excluded.expires_at,locked_at=CURRENT_TIMESTAMP WHERE order_locks.expires_at<? OR order_locks.user_id=?')
    .bind(id,user.id,stage,expires,now(),user.id).run();
   if(result.meta.changes!==1)throw Object.assign(new Error('Đơn đang được người khác xử lý. Vui lòng thử lại sau.'),{status:409});
   return json({ok:true,expiresAt:expires});
  }
  if(method==='DELETE'){
   await env.DB.prepare('DELETE FROM order_locks WHERE order_id=? AND user_id=?').bind(id,user.id).run();
   return json({ok:true});
  }
 }
 if(method==='POST'&&path==='/api/uploads'){
  const b=await requestJSON(req),order=await orderById(env,b.orderId);
  if(order.status!==(b.stage==='GIAO_HANG'?STATUS.SHIP:STATUS.PACK)||!hasRole(user,b.stage==='GIAO_HANG'?'SHIPPER':'PACKER'))throw Object.assign(new Error('Không có quyền tải lên đơn này.'),{status:403});
  await assertOrderLock(env,user,order.id,b.stage==='GIAO_HANG'?'VAN_DON':'DONG_HANG');
  const size=Number(b.size),name=clean(b.filename),type=clean(b.contentType);
  validateUpload({stage:b.stage,filename:name,contentType:type,size});
  const id=uid(),key=filePath(order.id,b.stage,name),multipart=b.stage==='VIDEO_DONG_HANG';
  const upload=multipart?await env.MEDIA.createMultipartUpload(key,{httpMetadata:{contentType:type}}):null;
  try{
   await env.DB.prepare('INSERT INTO uploads(id,order_id,user_id,stage,object_key,filename,content_type,bytes,upload_id,chunk_size) VALUES(?,?,?,?,?,?,?,?,?,?)')
    .bind(id,order.id,user.id,b.stage,key,name,type,size,upload?.uploadId||null,multipart?CHUNK_BYTES:size).run();
  }catch(e){if(upload)await upload.abort();throw e;}
  return json({id,chunkSize:multipart?CHUNK_BYTES:size,multipart},201);
 }
 const uMatch=path.match(/^\/api\/uploads\/([a-f0-9-]+)(?:\/(parts\/(\d+)|complete|file))?$/);
 if(uMatch){
  const id=uMatch[1],action=uMatch[2]||'',u=await pendingUpload(env,id),o=await orderById(env,u.order_id);
  const isFile=action==='file';
  if(isFile){
   needRole(user,'PACKER','SHIPPER');
   if(method!=='GET')return fail('Không hỗ trợ.',405);
   const object=await env.MEDIA.get(u.object_key);
   if(!object||u.status!=='COMPLETE')return fail('Tệp chưa sẵn sàng.',404);
   return new Response(object.body,{headers:{'content-type':u.content_type,'content-disposition':'attachment; filename="download"','cache-control':'private, no-store'}});
  }
  mustStageAccess(user,u,o);
  await assertOrderLock(env,user,o.id,u.stage==='GIAO_HANG'?'VAN_DON':'DONG_HANG');
  if(method==='GET'&&!action){
   const rows=await env.DB.prepare('SELECT part_number,etag,bytes FROM upload_parts WHERE upload_id=? ORDER BY part_number').bind(id).all();
   return json({id,status:u.status,bytes:u.bytes,chunkSize:u.chunk_size,parts:rows.results||[]});
  }
  if(u.status!=='UPLOADING')throw Error('Phiên tải đã được hoàn tất hoặc hủy.');
  if(method==='PUT'&&!action){
   if(u.upload_id)throw Error('Video cần tải theo từng phần.');
   if(Number(req.headers.get('content-length'))!==u.bytes)throw Error('Dung lượng ảnh không khớp.');
   const written=await env.MEDIA.put(u.object_key,req.body,{httpMetadata:{contentType:u.content_type}});
   if(!written||written.size!==u.bytes)throw Error('R2 chưa ghi đủ dữ liệu ảnh.');
   await env.DB.prepare("UPDATE uploads SET status='COMPLETE',completed_at=CURRENT_TIMESTAMP WHERE id=?").bind(id).run();
   await audit(env,user,'UPLOAD_IMAGE',u.order_id,u.object_key);return json({ok:true});
  }
  if(method==='PUT'&&action.startsWith('parts/')){
   if(!u.upload_id)throw Error('Ảnh không dùng multipart.');
   const number=Number(uMatch[3]),bounds=partBounds(u.bytes,number,u.chunk_size);
   if(Number(req.headers.get('content-length'))!==bounds.size)throw Error('Dung lượng phần video không khớp.');
   const mp=env.MEDIA.resumeMultipartUpload(u.object_key,u.upload_id);
   const part=await mp.uploadPart(number,req.body);
   await env.DB.prepare('INSERT INTO upload_parts(upload_id,part_number,etag,bytes) VALUES(?,?,?,?) ON CONFLICT(upload_id,part_number) DO UPDATE SET etag=excluded.etag,bytes=excluded.bytes')
    .bind(id,number,part.etag,bounds.size).run();
   return json({partNumber:number,etag:part.etag});
  }
  if(method==='POST'&&action==='complete'){
   if(!u.upload_id)throw Error('Ảnh đã được xác nhận ngay khi tải.');
   const r=await env.DB.prepare('SELECT part_number,etag,bytes FROM upload_parts WHERE upload_id=? ORDER BY part_number').bind(id).all();
   const parts=r.results||[],n=partsCount(u.bytes,u.chunk_size);
   if(parts.length!==n||parts.some((p,i)=>p.part_number!==i+1||p.bytes!==partBounds(u.bytes,i+1,u.chunk_size).size))throw Error('Video chưa tải đủ từng phần.');
   const mp=env.MEDIA.resumeMultipartUpload(u.object_key,u.upload_id);
   const object=await mp.complete(parts.map(p=>({partNumber:p.part_number,etag:p.etag})));
   if(object.size!==u.bytes)throw Error('R2 trả về video thiếu dung lượng.');
   await env.DB.prepare("UPDATE uploads SET status='COMPLETE',completed_at=CURRENT_TIMESTAMP WHERE id=?").bind(id).run();
   await audit(env,user,'UPLOAD_VIDEO',u.order_id,u.object_key);return json({ok:true,size:object.size});
  }
 }
 const pMatch=path.match(/^\/api\/orders\/([A-Za-z0-9_-]+)\/pack$/);
 if(method==='POST'&&pMatch){
  needRole(user,'PACKER');const id=pMatch[1],o=await orderById(env,id),b=await requestJSON(req);
  if(o.status!==STATUS.PACK)throw Error('Đơn đã đóng hoặc không còn ở trạng thái chờ.');
  await assertOrderLock(env,user,id,'DONG_HANG');
  await checkUploads(env,id,['ANH_HOA_DON','VIDEO_DONG_HANG','HANG_HOA']);
  const helpers=Array.isArray(b.nguoiDongCung)?b.nguoiDongCung.map(clean).filter(Boolean):[];
  if(helpers.length>100)throw Error('Số lượng người đóng cùng vượt giới hạn.');
  const boxes=Number(b.boxes);
  if(!Number.isSafeInteger(boxes)||boxes<0)throw Error('Số thùng không hợp lệ.');
  const result=await env.DB.prepare("UPDATE orders SET status=?,boxes=?,packing_helpers=?,packing_note=?,packed_by=?,packed_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP,local_dirty=CASE WHEN source_system='GOOGLE_SHEETS' THEN 1 ELSE local_dirty END WHERE id=? AND status=?")
   .bind(STATUS.SHIP,boxes,JSON.stringify(helpers),clean(b.note),user.id,id,STATUS.PACK).run();
  if(!result.meta.changes)throw Error('Đơn đã được người khác xử lý.');
  await env.DB.prepare('DELETE FROM order_locks WHERE order_id=? AND user_id=?').bind(id,user.id).run();
  await audit(env,user,'PACK',id);return json({ok:true,status:STATUS.SHIP});
 }
 if(method==='POST'&&path==='/api/shipments'){
  needRole(user,'SHIPPER');const b=await requestJSON(req),ids=[...new Set((b.orderIds||[]).map(String))];
  if(!ids.length||ids.length>100)throw Error('Chọn từ 1 đến 100 đơn.');
  const orders=await env.DB.prepare('SELECT id,status,group_id FROM orders WHERE id IN ('+ids.map(()=>'?').join(',')+')').bind(...ids).all();
  if(orders.results.length!==ids.length||orders.results.some(x=>x.status!==STATUS.SHIP))throw Error('Chỉ được bàn giao các đơn Chờ vận đơn.');
  const groupIds=[...new Set(orders.results.map(o=>o.group_id).filter(Boolean))];
  if(groupIds.length>1)throw Error('Các đơn đang nằm ở nhiều nhóm khác nhau.');
  for(const id of ids){await assertOrderLock(env,user,id,'VAN_DON');await checkUploads(env,id,['GIAO_HANG']);}
  const form=validateShippingForm({loaiShip:b.loaiShip,sdtShip:b.sdtShip,tenShip:b.tenShip,
   tienShip:b.tienShip,hangNang:b.hangNang,phiBen:b.phiBen,phuPhi:b.phuPhi});
  const target=b.status===STATUS.MOVING?STATUS.MOVING:STATUS.DONE;
  const groupId=groupIds[0]||('VD_'+new Date().toISOString().replace(/[-:TZ.]/g,'').slice(0,14)+'_'+uid().slice(0,4));
  const stmts=[];
  if(!groupIds.length)stmts.push(env.DB.prepare('INSERT INTO shipping_groups(id,created_by) VALUES(?,?)').bind(groupId,user.id));
  for(const id of ids)stmts.push(env.DB.prepare("UPDATE orders SET status=?,group_id=?,shipping_type=?,shipping_phone=?,shipping_person=?,shipping_fee=?,heavy_fee=?,terminal_fee=?,extra_fee=?,total_fee=?,shipping_note=?,shipped_by=?,shipped_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP,local_dirty=CASE WHEN source_system='GOOGLE_SHEETS' THEN 1 ELSE local_dirty END WHERE id=? AND status=?")
    .bind(target,groupId,form.loaiShip,form.sdtShip,form.tenShip,form.tienShip,form.hangNang,form.phiBen,form.phuPhi,form.tongTien,clean(b.note),user.id,id,STATUS.SHIP));
  const updates=await env.DB.batch(stmts);
  if(updates.slice(groupIds.length?0:1).some(result=>result.meta.changes!==1))throw Error('Trạng thái đơn thay đổi khi lưu; cần đối chiếu.');
  for(const id of ids)await env.DB.prepare('DELETE FROM order_locks WHERE order_id=? AND user_id=?').bind(id,user.id).run();
  await audit(env,user,'SHIP_GROUP','',JSON.stringify({groupId,ids,total:form.tongTien}));
  return json({ok:true,groupId,status:target,total:form.tongTien});
 }
 return fail('Không tìm thấy chức năng.',404);
}
export default {
 async fetch(request,env){
  const url=new URL(request.url);
  if(!url.pathname.startsWith('/api/'))return env.ASSETS.fetch(request);
  try{
   if(!env.DB||!env.MEDIA)return fail('Chưa gắn D1 và R2 cho Worker.',503);
   return await handle(request,env);
  }catch(e){return fail(e.message||'Lỗi hệ thống.',e.status||400);}
 }
};
