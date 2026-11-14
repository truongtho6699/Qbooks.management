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
