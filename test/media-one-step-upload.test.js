import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DEFAULT_MEDIA_FOLDER_ID,resolveMediaFolder,validateMediaPhotos,appendEvidenceLinks} from '../public/media-upload.js';
const src=readFileSync(new URL('../public/video.js',import.meta.url),'utf8');
const css=readFileSync(new URL('../public/design-system.css',import.meta.url),'utf8');
test('Media folder resolution prioritizes configured book folder and defaults to existing shared Drive folder',()=>{
 const a='1AbCdEfGhIjKlMnOpQrStUvWxYz012';
 assert.equal(resolveMediaFolder([{id:'book1',drive_url:'https://drive.google.com/drive/folders/'+a+'?usp=sharing'}],'book1').id,a);
 assert.equal(resolveMediaFolder([{id:'book1',drive_url:'https://evil.example/folders/'+a}],'book1').id,DEFAULT_MEDIA_FOLDER_ID);
 assert.equal(resolveMediaFolder([],'no-book').id,DEFAULT_MEDIA_FOLDER_ID);
 assert.equal(resolveMediaFolder([],'no-book').fallback,true);
});
test('Valid photo files and note references are bounded and safely prepared',()=>{
 validateMediaPhotos([{name:'photo.HEIC',type:'',size:2000},{name:'img.png',type:'image/png',size:1200}]);
 assert.throws(()=>validateMediaPhotos([{name:'malware.exe',type:'',size:1200}]),/không phải ảnh/);
 assert.throws(()=>validateMediaPhotos(Array.from({length:11},(_,i)=>({name:'p'+i+'.jpg',type:'image/jpeg',size:1}))),/tối đa 10/);
 const n=appendEvidenceLinks('Quay tốt',[{name:'IMG_7706.jpg',url:'https://drive.google.com/file/d/xyz/view'}]);
 assert.match(n,/Ảnh minh chứng: IMG_7706.jpg/);
 assert.match(n,/Quay tốt/);
 assert.throws(()=>appendEvidenceLinks('a'.repeat(1999),[{name:'p',url:'https://drive.google.com/file/d/xyz/view'}]),/2.000/);
});
test('Film/edit selection saves directly through Save button with no forced manual Drive URL',()=>{
 assert.match(src,/id="rawFile" type="file"/);
 assert.match(src,/id="filmImages" type="file"/);
 assert.match(src,/id="editImages" type="file"/);
 assert.match(src,/id="editedFile" type="file"/);
 assert.doesNotMatch(src,/id="filmRawUrl"[^>]*required/);
 assert.match(src,/id="filmRawUrl" name="raw_url"/);
 assert.match(src,/id="editOutputUrl" name="output_url"/);
 assert.match(src,/function saveMediaFilesWithOneClick/);
 assert.match(src,/askGoogleDriveToken\(async token=>/);
 assert.match(src,/await uploadToDriveFile\(video,bookId,token/);
 assert.match(src,/await callback\(payload\);recordSaved=true/);
 assert.match(src,/form\.elements\.note\.value=appendEvidenceLinks/);
 assert.match(src,/mediaPhotoCache\.set\(key,link\)/);
 assert.match(src,/function evidenceLinksHtml\(note\)/);
 assert.match(src,/mediaDestinationHtml\(v\.book_id\)/);
});
test('Media upload preserves required backend validation and mobile iOS usability',()=>{
 assert.match(src,/if\(id==='filmForm'&&!form\.elements\.raw_url\.value\.trim\(\)\)/);
 assert.match(src,/Chọn video quay hoặc nhập liên kết Google Drive/);
 assert.match(src,/payload\.status==='CHỜ DUYỆT'&&!payload\.output_url/);
 assert.match(src,/validateVideoFile\(file\)/);
 assert.match(css,/qbook-link-fallback/);
 assert.match(css,/font-size:16px/);
 assert.match(src,/Giữ trình duyệt đang mở cho đến khi lưu thành công/);
});

test('Photo-only evidence updates filmed note and records stay viewable',()=>{
 const manager=readFileSync(new URL('../src/video-manager.js',import.meta.url),'utf8');
 assert.match(manager,/current\.raw_url===link&&current\.status==='ĐÃ QUAY'&&String\(current\.note\|\|''\)===note/);
 assert.match(src,/evidenceLinksHtml\(v\.note\)/);
 assert.match(src,/new URL\(m\[2\]\)/);
 assert.match(src,/url\.hostname==='drive\.google\.com'/);
});
