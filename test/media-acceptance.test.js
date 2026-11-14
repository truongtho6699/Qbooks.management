import test from 'node:test';
import assert from 'node:assert/strict';
import {videoApi} from '../src/video-manager.js';

const VIDEO_ID='22222222-2222-4222-8222-222222222222';
const BOOK_ID='11111111-1111-4111-8111-111111111111';
const film={id:'quay-a',name:'Người quay',role:'SALE',can_admin:0,menuKeys:['media.film','media.filmOverview']};
const editor={id:'edit-b',name:'Người dựng',role:'SALE',can_admin:0,menuKeys:['media.edit','media.postOverview']};
const reviewer={id:'manager-c',name:'Người duyệt',role:'SALE',can_admin:0,menuKeys:['media.edit','media.books','media.production']};
const readOnly={id:'view-d',name:'Người xem',role:'VIEW',can_admin:0,menuKeys:['media.dashboard']};

function fixture(){
 const video={id:VIDEO_ID,book_id:BOOK_ID,status:'CHỜ QUAY',review_status:'NONE',raw_url:'',output_url:'',filmed_at:null,edited_at:null,editor_id:null,camera_id:null,published_at:null};
 const events=[];
 const db={prepare(sql){return {args:[],bind(...args){this.args=args;return this},
   async first(){
    if(sql.includes('FROM video_role_grants'))return {
      can_film:this.args[0]===film.id?1:0,
      can_edit:this.args[0]===editor.id?1:0,
      can_manage:this.args[0]===reviewer.id?1:0};
    if(sql.includes('FROM video_items WHERE id=?'))return {...video};
    return null;
   },async all(){return {results:[]}},
   async run(){
    const a=this.args;
    if(sql.startsWith('INSERT OR IGNORE INTO video_events')||sql.startsWith('INSERT INTO video_events'))events.push({actor_id:a[1],event_type:a[2]});
    if(sql.startsWith('UPDATE video_items SET raw_url=')){video.raw_url=a[0];video.camera_id=video.camera_id||a[1];video.filmed_at=video.filmed_at||'2026-11-14 03:00:00';video.status='ĐÃ QUAY';}
    if(sql.startsWith('UPDATE video_items SET editor_id=')){video.editor_id=video.editor_id||a[0];video.output_url=a[1];video.status=a[2];video.review_status=a[3];if(a[2]==='CHỜ DUYỆT')video.edited_at=video.edited_at||'2026-11-14 03:20:00';}
    if(sql.startsWith('UPDATE video_items SET status=?,review_status=?')){video.status=a[0];video.review_status=a[1];}
    if(sql.startsWith('UPDATE video_items SET youtube_url=')){video.youtube_url=a[0];video.status='ĐÃ PHÁT HÀNH';video.published_at='2026-11-14 04:00:00';}
    return {meta:{changes:1}};
   }};}};
 return {db,video,events};
}
async function call(f,user,action,input={}){
 const r=new Request('https://qbook.test/api/video/items/'+VIDEO_ID,{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({action,...input})});
 return videoApi(r,{DB:f.db},user);
}
test('three-role end-to-end Media flow: film, submit, reject, resubmit, approve, publish',async()=>{
 const f=fixture();
 assert.equal((await call(f,film,'film',{raw_url:'https://drive.google.com/file/d/video_raw'})).status,200);
 assert.equal(f.video.status,'ĐÃ QUAY');
 const firstFilm=f.video.filmed_at;
 assert.equal((await call(f,editor,'edit',{status:'CHỜ DUYỆT',output_url:'https://drive.google.com/file/d/output1'})).status,200);
 assert.equal(f.video.review_status,'PENDING');
 await assert.rejects(()=>call(f,editor,'publish',{youtube_url:'https://youtu.be/demo'}),e=>e.status===403);
 await assert.rejects(()=>call(f,reviewer,'reject',{note:''}),e=>e.status===400);
 assert.equal((await call(f,reviewer,'reject',{note:'Chỉnh lại âm thanh'})).status,200);
 assert.equal(f.video.status,'ĐANG HẬU KỲ');
 assert.equal(f.video.review_status,'CHANGES_REQUESTED');
 const firstEdit=f.video.edited_at;
 assert.equal((await call(f,editor,'edit',{status:'CHỜ DUYỆT',output_url:'https://drive.google.com/file/d/output2'})).status,200);
 assert.equal(f.video.review_status,'PENDING');
 assert.equal((await call(f,reviewer,'approve',{note:'Đã đạt'})).status,200);
 assert.equal(f.video.review_status,'APPROVED');
 assert.equal((await call(f,reviewer,'publish',{youtube_url:'https://www.youtube.com/watch?v=video'})).status,200);
 assert.equal(f.video.status,'ĐÃ PHÁT HÀNH');
 assert.equal(f.video.filmed_at,firstFilm);
 assert.equal(f.video.edited_at,firstEdit);
 assert.equal(f.events.filter(e=>e.event_type==='FILM_COMPLETED').length,1);
 assert.equal(f.events.filter(e=>e.event_type==='EDIT_SUBMITTED').length,1);
 assert.equal(f.events.filter(e=>e.event_type==='REVIEW_REJECTED').length,1);
 assert.equal(f.events.filter(e=>e.event_type==='REVIEW_APPROVED').length,1);
 assert.equal(f.events.filter(e=>e.event_type==='PUBLISHED').length,1);
});
test('VIEW cannot change a video even with visible Media dashboard',async()=>{
 const f=fixture();
 await assert.rejects(()=>call(f,readOnly,'film',{raw_url:'https://drive.google.com/file/d/abc'}),e=>e.status===403);
 assert.equal(f.video.status,'CHỜ QUAY');
});
test('Existing book Drive folder requires manage role and validates target',async()=>{
 const f=fixture();
 const req=(url)=>new Request('https://qbook.test/api/video/books/'+BOOK_ID+'/drive-folder',{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({drive_url:url})});
 await assert.rejects(()=>videoApi(req('https://drive.google.com/drive/folders/abcdefghijklmnop'),{DB:f.db},editor),e=>e.status===403);
 await assert.rejects(()=>videoApi(req('https://evil.example/folders/abcdefghijklmnop'),{DB:f.db},reviewer),e=>e.status===400);
 const result=await videoApi(req('https://drive.google.com/drive/folders/abcdefghijklmnop?usp=sharing'),{DB:f.db},reviewer);
 assert.equal(result.status,200);
 assert.equal((await result.json()).drive_url,'https://drive.google.com/drive/folders/abcdefghijklmnop');
});
