import test from 'node:test';
import assert from 'node:assert/strict';
import {videoApi} from '../src/video-manager.js';

function mockDb(){
 const queries=[];
 return {
  queries,
  prepare(sql){
   return {
    bind(...params){this.params=params;return this;},
    async first(){queries.push(sql);return null;},
    async all(){queries.push(sql);return{results:[]};},
    async run(){queries.push(sql);return{success:true,meta:{changes:1}};}
   };
  }
 };
}
const admin={id:'admin-id',name:'Admin',email:'admin@example.com',role:'ADMIN',can_admin:1};
const filmUser={id:'staff-id',name:'Nhân viên',email:'staff@example.com',role:'SALE',can_admin:0};

test('Video module requires login context from QBooks',async()=>{
 const env={DB:mockDb()};
 const result=await videoApi(new Request('https://test.local/api/video/bootstrap'),env,admin);
 assert.equal(result.status,200);
 const data=await result.json();
 assert.equal(data.rights.manage,true);
 assert.equal(data.rights.admin,true);
});
test('Employees without assigned video rights cannot create books',async()=>{
 const env={DB:mockDb()};
 const req=new Request('https://test.local/api/video/books',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({code:'SP337',name:'Toán 1'})});
 await assert.rejects(()=>videoApi(req,env,filmUser),e=>e.status===403);
});
test('Admin can create book and video plan (without affecting QBooks orders)',async()=>{
 const env={DB:mockDb()};
 const req=new Request('https://test.local/api/video/books',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({code:'SP337',name:'Toán 1',teacher:'Giảng viên A',target_count:30})});
 const res=await videoApi(req,env,admin);
 assert.equal(res.status,201);
 assert.equal((await res.json()).id.length,36);
 assert.ok(env.DB.queries.some(s=>s.includes('INSERT INTO video_books')));
 assert.ok(!env.DB.queries.some(s=>s.includes('INSERT INTO orders')));
});
test('Management overview displays zero rather than invented demo data',async()=>{
 const env={DB:mockDb()};
 const res=await videoApi(new Request('https://test.local/api/video/overview'),env,admin);
 assert.deepEqual((await res.json()).totals,{total:0,filmed:0,edited:0,published:0,pending_review:0,need_revision:0});
});

function videoDb(video,grants={}){
 const sqls=[];
 return {queries:sqls,prepare(sql){
   return {params:[],bind(...xs){this.params=xs;return this;},
     async first(){
       sqls.push(sql);
       if(sql.includes('video_role_grants'))return grants;
       if(sql.includes('FROM video_items WHERE id=?'))return video;
       return null;
     },
     async all(){sqls.push(sql);return {results:[]};},
     async run(){sqls.push(sql);return {meta:{changes:1}}}
   };
 }};
}
const videoId='12345678-1234-1234-1234-123456789abc';
const clip=(overrides={})=>({id:videoId,status:'CHỜ DUYỆT',review_status:'PENDING',editor_id:filmUser.id,raw_url:'https://drive.google.com/file/d/raw',output_url:'https://drive.google.com/file/d/edited',filmed_at:'2026-11-01 03:00:00',edited_at:'2026-11-02 04:00:00',...overrides});
const patch=(action,input={})=>new Request('https://test.local/api/video/items/'+videoId,{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({action,...input})});

test('Editor cannot bypass manager review by selecting published status',async()=>{
 const db=videoDb(clip({status:'ĐANG HẬU KỲ'}),{can_edit:1});
 await assert.rejects(()=>videoApi(patch('edit',{status:'ĐÃ PHÁT HÀNH',output_url:'https://drive.google.com/file/d/edited'}),{DB:db},filmUser),e=>e.status===400);
 assert.ok(!db.queries.some(q=>q.startsWith('UPDATE video_items')));
});
test('An editor cannot approve their own video even if granted manage permission',async()=>{
 const db=videoDb(clip(),{can_edit:1,can_manage:1});
 await assert.rejects(()=>videoApi(patch('approve'),{DB:db},filmUser),e=>e.status===403);
 assert.ok(!db.queries.some(q=>q.startsWith('UPDATE video_items')));
});
test('Publishing is blocked until review_status is APPROVED',async()=>{
 const db=videoDb(clip(),{can_manage:1});
 const manager={...filmUser,id:'manager-id'};
 await assert.rejects(()=>videoApi(patch('publish',{youtube_url:'https://www.youtube.com/watch?v=demo'}),{DB:db},manager),e=>e.status===409);
});
test('Different manager can approve; publishing only after approved state',async()=>{
 const manager={...filmUser,id:'manager-id'};
 const approved=await videoApi(patch('approve',{note:'Đạt'}),{DB:videoDb(clip(),{can_manage:1})},manager);
 assert.equal(approved.status,200);
 const db=videoDb(clip({review_status:'APPROVED'}),{can_manage:1});
 const published=await videoApi(patch('publish',{youtube_url:'https://www.youtube.com/watch?v=demo'}),{DB:db},manager);
 assert.equal(published.status,200);
 assert.ok(db.queries.some(q=>q.includes('INSERT OR IGNORE INTO video_events')));
});
test('Resubmission of video with same Drive link is idempotent',async()=>{
 const db=videoDb(clip({status:'ĐÃ QUAY'}),{can_film:1});
 const res=await videoApi(patch('film',{raw_url:'https://drive.google.com/file/d/raw'}),{DB:db},filmUser);
 assert.equal((await res.json()).unchanged,true);
 assert.ok(!db.queries.some(q=>q.startsWith('UPDATE video_items')));
});
test('Day production endpoint rejects bad date input',async()=>{
 const db=videoDb(clip(),{can_edit:1});
 await assert.rejects(()=>videoApi(new Request('https://test.local/api/video/production?day=not-a-day'),{DB:db},filmUser),e=>e.status===400);
});
