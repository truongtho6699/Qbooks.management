// Shared QBOOK form UX guard. Visual state only; never saves operational data.
const baselines=new WeakMap();
const tracked=new Set();
function controls(root){
 return [...root.querySelectorAll('input,select,textarea')].filter(el=>!el.disabled&&el.type!=='hidden'&&el.type!=='button'&&el.type!=='submit');
}
function snapshot(root){
 return JSON.stringify(controls(root).map(el=>[
  el.name||el.id||'',el.type,
  el.type==='checkbox'||el.type==='radio'?Boolean(el.checked):
  el.type==='file'?[...(el.files||[])].map(f=>[f.name,f.size,f.lastModified]):el.value
 ]));
}
function isShown(node){
 for(let n=node;n&&n.nodeType===1;n=n.parentElement)if(n.hidden)return false;
 return true;
}
export function trackDraft(root){
 if(!root)return;
 baselines.set(root,snapshot(root));tracked.add(root);
 root.addEventListener('input',event=>{if(event.target?.matches?.('[aria-invalid="true"]'))clearFieldError(event.target)});
 root.addEventListener('change',event=>{if(event.target?.matches?.('[aria-invalid="true"]'))clearFieldError(event.target)});
}
export function markDraftSaved(root){if(root)baselines.set(root,snapshot(root));}
export function hasUnsavedWork(){
 for(const root of tracked){
  if(!root.isConnected){tracked.delete(root);continue;}
  if(isShown(root)&&baselines.has(root)&&snapshot(root)!==baselines.get(root))return true;
 }
 return false;
}
export function confirmLeave(){
 if(!hasUnsavedWork())return true;
 return window.confirm('Bạn có thông tin chưa lưu. Rời màn hình sẽ mất những thay đổi này. Bạn có muốn tiếp tục?');
}
export function protectBeforeUnload(){
 window.addEventListener('beforeunload',event=>{
  if(hasUnsavedWork()){event.preventDefault();event.returnValue='';}
 });
}
export function humanizeError(message){
 const raw=String(message||'');
 if(/D1_ERROR|SQLITE_ERROR|SQLITE_CONSTRAINT|\bSQL\b/i.test(raw))return 'Chưa lưu được vì hệ thống dữ liệu gặp lỗi. Thông tin đã nhập vẫn được giữ; hãy thử lại hoặc liên hệ quản trị.';
 if(/(?:401|phiên đăng nhập|hết phiên|unauthorized)/i.test(raw))return 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại rồi kiểm tra trước khi gửi lại.';
 if(/(?:403|forbidden|chưa được cấp quyền|không có quyền)/i.test(raw))return 'Tài khoản chưa có quyền thực hiện thao tác này. Hãy liên hệ quản trị để kiểm tra phân quyền.';
 if(/(?:409|đã tồn tại|trùng|duplicate)/i.test(raw))return 'Dữ liệu có thể đã tồn tại hoặc được người khác cập nhật. Hãy kiểm tra mã đơn và tải lại danh sách trước khi thử lại.';
 if(/(?:network|failed to fetch|lỗi kết nối|Wi-Fi|3G|timeout)/i.test(raw))return 'Không kết nối được máy chủ. Kiểm tra Internet rồi thử lại; các thông tin đã nhập vẫn còn.';
 return raw||'Chưa thể thực hiện. Kiểm tra thông tin và thử lại.';
}
export function clearFieldError(field){
 if(!field)return;
 field.removeAttribute('aria-invalid');
 const name=field.name||field.id;
 if(!name)return;
 const label=field.closest('label')||field.parentElement;
 label?.querySelectorAll?.('.qb-field-error').forEach(x=>x.remove());
}
export function showFieldError(root,name,message){
 if(!root)return false;
 const field=controls(root).find(x=>x.name===name||x.id===name);
 if(!field)return false;
 clearFieldError(field);
 const error=document.createElement('span');
 error.className='qb-field-error';error.setAttribute('role','alert');error.textContent=humanizeError(message);
 const parent=field.closest('label')||field.parentElement;
 if(parent)parent.append(error);
 field.setAttribute('aria-invalid','true');
 field.focus();return true;
}
export function showFormError(root,message,fieldName){
 const text=humanizeError(message);
 if(fieldName&&showFieldError(root,fieldName,text))return;
 if(!root)return;
 let node=root.querySelector('.qb-form-error');
 if(!node){node=document.createElement('p');node.className='qb-form-error';node.setAttribute('role','alert');root.prepend(node);}
 node.textContent=text;
 node.setAttribute('tabindex','-1');node.focus();
}
