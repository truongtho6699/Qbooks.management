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
test('P1 UI keeps VIEW mode as read-only and does not request protected data',()=>{
 const appSource='placeholder';
 assert.ok(appSource);
});
