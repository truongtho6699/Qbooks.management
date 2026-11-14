// QBOOK permissions: explicit per-user menu grants, safe legacy defaults.
// Menu access NEVER substitutes for write-operation role checks.
export const ORDER_MENUS=['orders.overview','orders.sale','orders.pack','orders.ship'];
export const MEDIA_MENUS=[
 'media.dashboard','media.adminOverview','media.filmOverview','media.film','media.createVideo',
 'media.postOverview','media.edit','media.production','media.booksProgress','media.report',
 'media.books','media.catalog','media.staff','media.audit'
];
export const MENU_KEYS=[...ORDER_MENUS,...MEDIA_MENUS,'system.admin'];
export const MENU_LABELS={
 'orders.overview':'Giao hàng · Tổng hợp','orders.sale':'Giao hàng · Sale lên đơn',
 'orders.pack':'Giao hàng · Đóng hàng','orders.ship':'Giao hàng · Vận đơn',
 'media.dashboard':'Media · Bảng điều khiển','media.adminOverview':'Media · Tổng quan quản trị',
 'media.filmOverview':'Media · Tổng quan quay','media.film':'Media · Quay bài',
 'media.createVideo':'Media · Lập kế hoạch video','media.postOverview':'Media · Tổng quan hậu kỳ',
 'media.edit':'Media · Xử lý video','media.production':'Media · Sản lượng hằng ngày',
 'media.booksProgress':'Media · Tiến độ đầu sách','media.report':'Media · Báo cáo tổng hợp',
 'media.books':'Media · Quản trị đầu sách','media.catalog':'Media · Danh mục bài học',
 'media.staff':'Media · Nhân sự','media.permissions':'Media · Phân quyền',
 'media.audit':'Media · Lịch sử thao tác','system.admin':'Quản trị hệ thống'
};
const isAdmin=user=>user.can_admin===1||user.role==='ADMIN';
export function menuDefaults(user,video={}) {
 const out=new Set();
 if(isAdmin(user))return MENU_KEYS;
 if(user.role==='VIEW')return [];
 if(user.role==='SALE')out.add('orders.sale');
 if(user.role==='PACKER'||user.can_pack===1){out.add('orders.overview');out.add('orders.pack');}
 if(user.role==='SHIPPER'||user.can_ship===1){out.add('orders.overview');out.add('orders.ship');}
 const film=video?.can_film===1,edit=video?.can_edit===1,manage=video?.can_manage===1;
 if(film||edit||manage){for(const key of ['media.dashboard','media.booksProgress','media.catalog'])out.add(key);}
 if(film){out.add('media.filmOverview');out.add('media.film');}
 if(edit){out.add('media.postOverview');out.add('media.edit');}
 if(manage){for(const key of ['media.adminOverview','media.filmOverview','media.postOverview','media.edit','media.production','media.report','media.books','media.createVideo','media.staff','media.permissions','media.audit'])out.add(key);}
 return [...out];
}
export async function resolveMenuPermissions(db,user){
 const admin=isAdmin(user);
 if(admin)return {keys:MENU_KEYS.slice(),overrides:{},video:{can_film:1,can_edit:1,can_manage:1}};
 const [entries,video]=await Promise.all([
   db.prepare('SELECT menu_key,allowed FROM user_menu_permissions WHERE user_id=?').bind(user.id).all(),
   db.prepare('SELECT can_film,can_edit,can_manage FROM video_role_grants WHERE user_id=?').bind(user.id).first()
 ]);
 const chosen=new Set(menuDefaults(user,video));
 const overrides={};
 for(const entry of entries.results||[]){
   if(!MENU_KEYS.includes(entry.menu_key))continue;
   overrides[entry.menu_key]=entry.allowed===1;
   if(entry.allowed===1)chosen.add(entry.menu_key);else chosen.delete(entry.menu_key);
 }
 // No read-only VIEW account can acquire administration via a menu grant.
 if(user.role==='VIEW'){chosen.delete('system.admin');chosen.delete('media.permissions');chosen.delete('media.staff');chosen.delete('media.audit');}
 return {keys:MENU_KEYS.filter(key=>chosen.has(key)),overrides,video:video||{can_film:0,can_edit:0,can_manage:0}};
}
export function allowedMenu(user,key){
 return user.can_admin===1||user.role==='ADMIN'||Array.isArray(user.menuKeys)&&user.menuKeys.includes(key);
}
