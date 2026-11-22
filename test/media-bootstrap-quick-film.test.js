import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {videoApi} from '../src/video-manager.js';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const shell=read('public/app.js'),media=read('public/video.js'),manager=read('src/video-manager.js');

function fakeDb({canFilm=true,existing=[],lessonBook='SP01',insertChanges=1}={}){
 const calls=[];
 const db={prepare(sql){
  const entry={sql,args:[]};calls.push(entry);
  return {bind(...args){
   entry.args=args;
   return {
    async first(){
     if(sql.includes('FROM video_role_grants'))return {can_film:canFilm?1:0,can_edit:0,can_manage:0};
     if(sql.includes('FROM video_books WHERE id'))return {id:'book-1',code:'SP01',teacher:'Giảng viên mẫu'};
     if(sql.includes('FROM video_lessons WHERE id'))return lessonBook==='SP01'?{id:'lesson-1',book_code:'SP01',week:'1',lesson_no:'2',period:'3',title:'Bài số 2'}:null;
     return null;
    },
    async all(){
     if(sql.includes('FROM video_items WHERE book_id'))return {results:existing};
     return {results:[]};
    },
    async run(){
     if(sql.includes('INSERT INTO video_items'))return {meta:{changes:insertChanges}};
     return {meta:{changes:1}};
    }
   };
  }};
 }};
 return {db,calls};
}
const user={id:'film-user',name:'Nhân viên quay',role:'SALE',can_admin:0,menuKeys:['media.film']};
const body={book_id:'book-1',lesson_id:'lesson-1',raw_url:'https://drive.google.com/file/d/abcde1234567890/view',note:'Ghi chú bài quay'};
const request=data=>new Request('https://qbooks.example/api/video/film-direct',{
 method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)
});

test('Media receives the exact token accepted by Qbooks for remembered sessions',()=>{
 assert.match(shell,/await media\.start\(target,state\.token\)/);
 assert.match(media,/async start\(view,activeToken\)/);
 assert.match(media,/const token=activeToken\|\|sessionStorage\.getItem\('qbooks_token'\)\|\|localStorage\.getItem\('qbooks_remember_token'\)/);
 assert.match(media,/if\(!token\)throw Error\('Phiên đăng nhập đã hết hạn/);
 assert.match(shell,/Media chưa tải được/);
 assert.match(shell,/retry\.onclick=\(\)=>/);
});
test('Quay bài guided workflow selects book, lesson/period and uploads the original video',()=>{
 assert.match(media,/id="quickFilmBook"/);
 assert.match(media,/id="quickFilmLesson"/);
 assert.match(media,/id="quickFilmFile"/);
 assert.match(media,/function saveQuickFilm\(\)/);
 assert.match(media,/function wireQuickFilm\(\)/);
 assert.match(media,/api\('GET','\/api\/video\/lessons\?book='/);
 assert.match(media,/await uploadToDriveFile\(video,bookId,token/);
 assert.match(media,/api\('POST','\/api\/video\/film-direct'/);
 assert.match(media,/validateMediaPhotos\(photos\)/);
 assert.match(media,/state\.rights\.film\|\|state\.rights\.admin/);
 assert.match(media,/Promise\.all\(\[\s*api\('GET','\/api\/video\/bootstrap'\)/);
});
test('Film-direct API is restricted to users with film permissions',async()=>{
 const {db}=fakeDb({canFilm:false});
 await assert.rejects(()=>videoApi(request(body),{DB:db},user),e=>e.status===403);
});
test('Film-direct API verifies book and lesson match and never modifies unrelated records',async()=>{
 const {db}=fakeDb({lessonBook:'OTHER'});
 await assert.rejects(()=>videoApi(request(body),{DB:db},user),e=>e.status===409);
});
test('Film-direct API creates a filmed record only for a new lesson and logs production',async()=>{
 const {db,calls}=fakeDb();
 const r=await videoApi(request(body),{DB:db},user);
 assert.equal(r.status,201);
 const data=await r.json();
 assert.equal(data.ok,true);assert.equal(data.created,true);
 assert.ok(calls.some(x=>x.sql.includes('WHERE NOT EXISTS(SELECT 1 FROM video_items')));
 assert.ok(calls.some(x=>x.sql.includes('INSERT OR IGNORE INTO video_events')));
 assert.ok(calls.some(x=>x.sql.includes('INSERT INTO video_audit')));
});
test('Film-direct API updates existing pending video but rejects video already in postproduction',async()=>{
 const existing=[{id:'existing-1',status:'CHỜ QUAY',raw_url:'',note:'',filmed_at:null}];
 const {db,calls}=fakeDb({existing});
 const r=await videoApi(request(body),{DB:db},user);
 assert.equal(r.status,200);assert.equal((await r.json()).updated,true);
 assert.ok(calls.some(x=>x.sql.includes('UPDATE video_items SET raw_url')));
 const locked=fakeDb({existing:[{...existing[0],status:'ĐANG HẬU KỲ'}]});
 await assert.rejects(()=>videoApi(request(body),{DB:locked.db},user),e=>e.status===409);
});
test('Film-direct API rejects duplicate races instead of creating another lesson record',async()=>{
 const {db}=fakeDb({insertChanges:0});
 await assert.rejects(()=>videoApi(request(body),{DB:db},user),e=>e.status===409);
});
test('Media first view does not wait indefinitely on optional Google configuration',()=>{
 assert.match(media,/new AbortController\(\)/);
 assert.match(media,/setTimeout\(\(\)=>configController\.abort\(\),8000\)/);
 assert.match(media,/mediaLoadNotice\('Đang đọc đầu sách và tổng quan/);
 assert.match(media,/if\(initial\)safeMediaRefresh\(\)/);
});
