import test from 'node:test';
import assert from 'node:assert/strict';
import {MENU_KEYS,menuDefaults,resolveMenuPermissions} from '../src/menu-permissions.js';
import worker from '../src/worker.js';

const viewer={id:'view-01',role:'VIEW',can_admin:0,can_pack:0,can_ship:0};
const seller={id:'seller-01',name:'Sale Test',email:'sale@test.example',role:'SALE',active:1,can_admin:0,can_pack:0,can_ship:0,expires_at:Math.floor(Date.now()/1000)+3600};

function permsDb(user,overrides={},video=null){
 return {prepare(sql){
  return {bind(){return this},async all(){
    if(sql.includes('FROM user_menu_permissions'))return {results:Object.entries(overrides).map(([menu_key,allowed])=>({menu_key,allowed:allowed?1:0}))};
    throw Error('Unexpected permission select: '+sql);
   },async first(){
    if(sql.includes('FROM video_role_grants'))return video;
    throw Error('Unexpected permission lookup: '+sql);
   }};
 }};
}
test('VIEW starts with no menus and explicit admin menus cannot be granted',async()=>{
 assert.deepEqual(menuDefaults(viewer),[]);
 const a=await resolveMenuPermissions(permsDb(viewer,{'orders.overview':true,'media.dashboard':true,'system.admin':true,'media.permissions':true}),viewer);
 assert.deepEqual(a.keys.filter(x=>x.startsWith('orders.')),['orders.overview']);
 assert.ok(a.keys.includes('media.dashboard'));
 assert.ok(!a.keys.includes('system.admin'));
 assert.ok(!a.keys.includes('media.permissions'));
});
test('Sales have only sale menu by default and explicit deny hides it',async()=>{
 const access=await resolveMenuPermissions(permsDb(seller,{'orders.sale':false}),seller);
 assert.equal(access.keys.includes('orders.sale'),false);
 assert.equal(access.keys.includes('orders.ship'),false);
});
test('Media roles supply matching menus, and overrides can hide forbidden sections',async()=>{
 const video={can_film:1,can_edit:0,can_manage:0};
 const access=await resolveMenuPermissions(permsDb(seller,{'media.film':false},video),seller);
 assert.ok(access.keys.includes('media.filmOverview'));
 assert.ok(!access.keys.includes('media.film'));
 assert.ok(!access.keys.includes('media.edit'));
});
test('System admin has full menu access, independent of per-user overrides',async()=>{
 const admin={...seller,role:'ADMIN',can_admin:1};
 const access=await resolveMenuPermissions({prepare(){throw Error('Admin should not query grants')}},admin);
 assert.equal(access.keys.length,MENU_KEYS.length);
});
function mockSellerDb(existing=null,menus={}){
 const sqls=[],binds=[];
 return {sqls,binds,prepare(sql){sqls.push(sql);
  return {sql,params:[],bind(...a){this.params=a;binds.push({sql,values:a});return this},
    async first(){
      if(sql.includes('FROM sessions'))return {...seller};
      if(sql.includes('FROM video_role_grants'))return null;
      if(sql.includes('SELECT id FROM orders WHERE REPLACE(REPLACE(UPPER(TRIM(invoice_codes))'))return existing;
      return null;
    },async all(){
      if(sql.includes('FROM user_menu_permissions'))return {results:Object.entries(menus).map(([menu_key,allowed])=>({menu_key,allowed:allowed?1:0}))};
      return {results:[]};
    },async run(){return {success:true,meta:{changes:1}}}
  };
 }};
}
function envForSeller(existing=null,menus={}){const db=mockSellerDb(existing,menus);return {DB:db,MEDIA:{},sqls:db.sqls,binds:db.binds};}
async function saleCreate(env,invoice='HD_NEW_9001'){
 const req=new Request('https://qbooks.test/api/orders',{method:'POST',headers:{authorization:'Bearer test-session','content-type':'application/json'},body:JSON.stringify({invoice_codes:invoice,customer:'Khách A',quantity:'12',sale_name:'Tự đặt tên'})});
 const res=await worker.fetch(req,env);return {status:res.status,data:await res.json()};
}
test('Sale creates an order in D1 when permitted, without requiring legacy toggle',async()=>{
 const env=envForSeller();
 const res=await saleCreate(env);
 assert.equal(res.status,201,JSON.stringify(res.data));
 assert.equal(res.data.source,'D1');assert.equal(res.data.googleSynced,false);
 const insertion=env.binds.find(x=>x.sql.includes('INSERT INTO orders'));
 assert.ok(insertion);assert.equal(insertion.values[2],seller.name);
 assert.ok(insertion.sql.includes("'D1',0"));
});
test('Duplicate invoice code is rejected before database write',async()=>{
 const env=envForSeller({id:'old-order'});
 const res=await saleCreate(env);
 assert.equal(res.status,409);
 assert.ok(!env.sqls.some(x=>x.includes('INSERT INTO orders')));
});
test('Explicitly disabled Sale menu blocks creating orders even with SALE role',async()=>{
 const env=envForSeller(null,{'orders.sale':false});
 const before=await resolveMenuPermissions(env.DB,seller);
 assert.ok(!before.keys.includes('orders.sale'),'Explicitly denied Sale menu should not be in effective permission list');
 const res=await saleCreate(env);
 assert.equal(res.status,403,JSON.stringify({data:res.data,sqls:env.sqls,binds:env.binds}));
 assert.ok(!env.sqls.some(x=>x.includes('INSERT INTO orders')));
});

test('Granted VIEW sees only assigned menus and can open Media in read-only mode',async()=>{
 const viewerSession={...viewer,name:'Guest',email:'viewer@test.example',active:1,expires_at:Math.floor(Date.now()/1000)+3600};
 const allowed=['orders.overview','media.dashboard'];
 const env={MEDIA:{},DB:{prepare(sql){return {bind(){return this},
  async first(){if(sql.includes('FROM sessions'))return {...viewerSession};if(sql.includes('video_role_grants'))return null;return null;},
  async all(){if(sql.includes('FROM user_menu_permissions'))return {results:allowed.map(menu_key=>({menu_key,allowed:1}))};return {results:[]};},
  async run(){throw Error('VIEW must never write');}
 }}}};
 const headers={authorization:'Bearer test-session'};
 const menus=await worker.fetch(new Request('https://qbooks.test/api/menu-access',{headers}),env);
 assert.equal(menus.status,200);
 const data=await menus.json();
 assert.deepEqual(data.menus,allowed);
 assert.equal(data.readOnly,true);
 const media=await worker.fetch(new Request('https://qbooks.test/api/video/bootstrap',{headers}),env);
 assert.equal(media.status,200);
 const body=await media.json();assert.equal(body.rights.readOnly,true);
 const blocked=await worker.fetch(new Request('https://qbooks.test/api/video/items',{method:'POST',headers:{...headers,'content-type':'application/json'},body:'{}'}),env);
 assert.equal(blocked.status,403);
});

test('Admin can atomically save menu grants and Media roles for an existing staff member',async()=>{
 const admin={...seller,id:'admin-01',role:'ADMIN',can_admin:1};
 const statements=[],batches=[];
 const env={MEDIA:{},DB:{prepare(sql){return {
  sql,params:[],bind(...args){this.params=args;return this},
  async first(){if(sql.includes('FROM sessions'))return {...admin};if(sql.includes('FROM users u LEFT JOIN user_view_roles'))return {id:'target-01',role:'SALE',effective_role:'SALE',can_admin:0,can_pack:0,can_ship:0};return null;},
  async all(){return {results:[]}},
  async run(){return {meta:{changes:1}}}
 }},async batch(stmts){statements.push(...stmts.map(x=>x.sql));batches.push(stmts);return stmts.map(()=>({success:true}))}}};
 const body={permissions:{'orders.sale':true,'media.dashboard':true,'media.film':true},video:{can_film:true,can_edit:false,can_manage:false}};
 const r=await worker.fetch(new Request('https://qbooks.test/api/users/12345678-1234-1234-1234-123456789abc/menus',{
  method:'PUT',headers:{authorization:'Bearer admin-session','content-type':'application/json'},body:JSON.stringify(body)}),env);
 assert.equal(r.status,200);
 assert.equal(batches.length,1);
 assert.ok(statements.some(x=>x.startsWith('DELETE FROM user_menu_permissions')));
 assert.equal(statements.filter(x=>x.startsWith('INSERT INTO user_menu_permissions')).length,3);
 assert.ok(statements.some(x=>x.startsWith('INSERT INTO video_role_grants')));
});
test('Unknown menu key is rejected before changing staff permissions',async()=>{
 const admin={...seller,role:'ADMIN',can_admin:1};
 const env={MEDIA:{},DB:{prepare(sql){return {bind(){return this},async first(){if(sql.includes('FROM sessions'))return {...admin};if(sql.includes('FROM users u LEFT JOIN user_view_roles'))return {id:'target',role:'SALE',effective_role:'SALE',can_admin:0};return null;},async run(){return {meta:{changes:1}}}}},async batch(){throw Error('Invalid rights must never reach database')}}};
 const r=await worker.fetch(new Request('https://qbooks.test/api/users/12345678-1234-1234-1234-123456789abc/menus',{
  method:'PUT',headers:{authorization:'Bearer admin-session','content-type':'application/json'},body:JSON.stringify({permissions:{'system.superuser':true},video:{can_film:false,can_edit:false,can_manage:false}})}),env);
 assert.equal(r.status,400);
});

test('Media permission editor is visible to system admin but never to regular Media manager or VIEW',async()=>{
 const admin={...seller,id:'admin-role',can_admin:1,role:'ADMIN'};
 const manager={...seller,id:'manager-role',role:'SALE',can_admin:0};
 const roles={can_film:0,can_edit:0,can_manage:1};
 const grants={'media.permissions':true,'media.edit':true};
 const a=await resolveMenuPermissions({prepare(){throw Error('Admin should not need grant lookup')}},admin);
 assert.ok(a.keys.includes('media.permissions'));
 const m=await resolveMenuPermissions(permsDb(manager,grants,roles),manager);
 assert.ok(m.keys.includes('media.edit'));
 assert.ok(!m.keys.includes('media.permissions'));
 const v=await resolveMenuPermissions(permsDb(viewer,grants,roles),viewer);
 assert.ok(!v.keys.includes('media.permissions'));
});
