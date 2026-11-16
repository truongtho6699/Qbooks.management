import test from 'node:test';
import assert from 'node:assert/strict';
import {humanizeError,trackDraft,markDraftSaved,hasUnsavedWork,confirmLeave,showFieldError,showFormError,clearFieldError} from '../public/ux-guard.js';
function input(name,value=''){
 const attributes=new Map();
 const el={name,id:name,value,type:'text',disabled:false,hidden:false,nodeType:1,parentElement:null,
  attrs:attributes,setAttribute(k,v){attributes.set(k,v)},removeAttribute(k){attributes.delete(k)},
  getAttribute(k){return attributes.get(k)},matches(s){return s==='[aria-invalid="true"]'&&attributes.get('aria-invalid')==='true'},
  focus(){this.focused=true},closest(){return this.parentElement}};
 return el;
}
function form(elements){
 const callbacks={};
 const root={nodeType:1,hidden:false,isConnected:true,parentElement:null,
   events:callbacks,querySelectorAll(selector){if(selector==='input,select,textarea')return elements;return[];},
   addEventListener(name,callback){callbacks[name]=callback},
   querySelector(selector){return null},prepend(element){this.lastPrepended=element}};
 const parent={nodeType:1,hidden:false,parentElement:root,children:[],
  append(el){this.children.push(el)},querySelectorAll(){return []}};
 elements.forEach(el=>el.parentElement=parent);
 return root;
}
test('P1 draft guard warns on changed text, but not when unchanged or saved',()=>{
 const field=input('customer','Khách A'),root=form([field]);
 trackDraft(root);assert.equal(hasUnsavedWork(),false);
 field.value='Khách B';assert.equal(hasUnsavedWork(),true);
 let prompts=0;globalThis.window={confirm:()=>{prompts++;return false}};
 assert.equal(confirmLeave(),false);assert.equal(prompts,1);
 markDraftSaved(root);assert.equal(hasUnsavedWork(),false);
 field.value='Khách C';assert.equal(hasUnsavedWork(),true);
 root.hidden=true;assert.equal(hasUnsavedWork(),false,'Hidden workflows must not block other visible tasks');
 root.isConnected=false;assert.equal(hasUnsavedWork(),false);
});
test('P1 draft guard includes selected file metadata',()=>{
 const field=input('video','');field.type='file';field.files=[];
 const root=form([field]);trackDraft(root);
 field.files=[{name:'quay.mp4',size:120,lastModified:12345}];
 assert.equal(hasUnsavedWork(),true);
 markDraftSaved(root);assert.equal(hasUnsavedWork(),false);
 root.isConnected=false;hasUnsavedWork();
});
test('P1 user-facing errors conceal SQL while providing recovery',()=>{
 const error=humanizeError('D1_ERROR: 11 values for 12 columns: SQLITE_ERROR');
 assert.match(error,/Chưa lưu được/);assert.doesNotMatch(error,/SQL|D1_ERROR/i);
 assert.match(humanizeError('HTTP 403 Forbidden'),/quyền/);
 assert.match(humanizeError('duplicate invoice'),/đã tồn tại/);
 assert.match(humanizeError('Failed to fetch'),/Internet/);
});
test('P1 inline field errors have alert role, invalid state and focus',()=>{
 const field=input('customer'),root=form([field]);
 const parent=field.parentElement;
 globalThis.document={createElement(tag){return{tag,attrs:{},setAttribute(k,v){this.attrs[k]=v},textContent:'',remove(){}}}};
 assert.equal(showFieldError(root,'customer','Cần nhập tên khách hàng.'),true);
 assert.equal(field.getAttribute('aria-invalid'),'true');
 assert.equal(field.focused,true);
 assert.equal(parent.children[0].attrs.role,'alert');
 assert.match(parent.children[0].textContent,/khách hàng/);
 clearFieldError(field);
 assert.equal(field.getAttribute('aria-invalid'),undefined);
});
test('P1 VIEW screen contains no fake editable operational form and keeps overview access unchanged',async()=>{
 const {readFileSync}=await import('node:fs');
 const source=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
 assert.ok(source.includes('Chế độ chỉ xem'));
 assert.ok(source.includes("if(isView&&key!=='overview')"),'Keep server-controlled read-only overview behavior');
 assert.ok(source.includes("return; // Security: VIEW never calls operational endpoints"));
 assert.ok(!source.includes('view-only-fields'),'Do not pretend VIEW can edit simulated forms');
});
test('P1 Shipping and Media use the same unsaved-work and inline-error helpers',async()=>{
 const {readFileSync}=await import('node:fs');
 const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
 const video=readFileSync(new URL('../public/video.js',import.meta.url),'utf8');
 assert.ok(app.includes("from './ux-guard.js'"));
 assert.ok(video.includes("from './ux-guard.js'"));
 assert.ok(app.includes("if(!confirmLeave())return;await releaseLocks()"),'Logout must ask before discarding edits');
 assert.ok(app.includes("markDraftSaved(form)"),'Sale must clear draft state only after successful save');
 assert.ok(video.includes("if((view!==state.view||state.selected)&&!confirmLeave())return;"),'Media must not discard edits');
 assert.ok(video.includes("for(const form of $('page').querySelectorAll('form'))trackDraft(form)"));
});
test('P1 Media form labels explicitly point to real editable controls',async()=>{
 const {readFileSync}=await import('node:fs');
 const video=readFileSync(new URL('../public/video.js',import.meta.url),'utf8');
 for(const id of ['rawFile','filmRawUrl','filmNote','editedFile','editOutputUrl','editStatus','editNote','reviewNote','publishYoutube']){
  assert.ok(video.includes('<label for="'+id+'">'),id+' should have a persistent accessible name');
 }
});
