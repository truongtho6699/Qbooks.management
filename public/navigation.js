/* QBOOK unified three-level navigation. Pure client-side, no permissions granted here. */
(function(global){
'use strict';
const MEDIA_GROUPS=[
 {id:'overview',name:'Tổng quan',icon:'▦',items:[['dashboard','Bảng điều khiển'],['adminOverview','Tổng quan quản trị']]},
 {id:'shoot',name:'Quay video',icon:'◉',items:[['filmOverview','Tổng quan quay'],['film','Quay bài'],['createVideo','Lập kế hoạch video']]},
 {id:'post',name:'Hậu kỳ',icon:'◫',items:[['postOverview','Tổng quan hậu kỳ'],['edit','Xử lý video']]},
 {id:'manage',name:'Quản lý',icon:'▥',items:[['production','Sản lượng hằng ngày'],['booksProgress','Tiến độ đầu sách'],['report','Báo cáo tổng hợp']]},
 {id:'catalog',name:'Danh mục Media',icon:'▧',items:[['books','Quản trị đầu sách'],['catalog','Danh mục bài học'],['staff','Quản trị nhân viên'],['permissions','Phân quyền tài khoản'],['audit','Lịch sử thao tác']]}
];
const iconPaths={
 'truck':'<rect x="1" y="5" width="14" height="12" rx="2"/><path d="M15 9h4l3 4v4h-7"/><circle cx="6" cy="18" r="2"/><circle cx="18" cy="18" r="2"/>',
 'video':'<rect x="2" y="5" width="15" height="14" rx="2"/><path d="m17 10 5-3v10l-5-3"/>',
 'overview':'<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
 'shoot':'<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/><path d="M20 4v5M17.5 6.5h5"/>',
 'post':'<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 4v16M17 4v16M3 9h4M17 9h4M3 15h4M17 15h4"/>',
 'manage':'<path d="M4 20V10M10 20V4M16 20v-8M22 20V7"/>',
 'catalog':'<path d="M4 3h16v18H4zM8 3v18M12 8h5M12 13h5"/>',
 'settings':'<circle cx="12" cy="12" r="3"/><path d="M12 2v3m0 14v3M2 12h3m14 0h3M4.9 4.9 7 7m10 10 2.1 2.1M19.1 4.9 17 7M7 17l-2.1 2.1"/>'
};
function icon(name){
 const span=document.createElement('span');span.className='qbn-icon';span.setAttribute('aria-hidden','true');
 const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('focusable','false');
 svg.innerHTML=iconPaths[name]||iconPaths.overview;span.append(svg);return span;
}
let expandedRoot=null,expandedGroup=null,hasInitialState=false,drawerOpen=false;
function groupFor(id){return MEDIA_GROUPS.find(g=>g.items.some(x=>x[0]===id))?.id||'overview';}
function render(config){
 const {desktop,mobileTree,drawer,toggle,area,activeView,orders=[],admin=false,canMedia=()=>true,onOrder=()=>{},onMedia=()=>{},onAdmin=()=>{}}=config;
 if(!desktop)return;
 if(!hasInitialState){expandedRoot=area==='media'?'media':area==='admin'?'admin':null;expandedGroup=area==='media'?groupFor(activeView):null;hasInitialState=true;}
 const containers=[desktop,mobileTree].filter(Boolean);
 const make=(tag,cls,label)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(label!=null)n.textContent=label;return n;};
 function repaint(){render(config);}
 function setRoot(root){expandedRoot=expandedRoot===root?null:root;if(root!=='media')expandedGroup=null;repaint();}
 function makeBranch(parent,label,open,depth,action,iconName='overview',key='',scope='desktop'){
  const button=make('button','qbn-branch qbn-depth-'+depth+(open?' qbn-open':''));button.type='button';
  const name=make('span','qbn-branch-label');name.append(icon(iconName),document.createTextNode(label));
  const arrow=make('span','qbn-chevron',open?'▾':'▸');arrow.setAttribute('aria-hidden','true');
  button.append(name,arrow);button.setAttribute('aria-expanded',String(open));
  if(key){button.dataset.navKey=key;button.setAttribute('aria-controls','qbn-panel-'+key+'-'+scope);}
  button.onclick=()=>{const isMobile=scope==='mobile';action();
   const target=(isMobile?mobileTree:desktop)?.querySelector?.('[data-nav-key="'+key+'"]');target?.focus?.();
  };
  parent.append(button);return button;
 }
 function makeLeaf(parent,label,active,depth,action){
  const button=make('button','qbn-leaf qbn-depth-'+depth+(active?' qbn-active':''),label);
  button.type='button';if(active)button.setAttribute('aria-current','page');
  button.onclick=()=>{drawerOpen=false;render(config);action();};parent.append(button);return button;
 }
 for(const container of containers){
  const scope=container===mobileTree?'mobile':'desktop';
  container.replaceChildren();
  const orderOpen=expandedRoot==='orders';
  if(orders.length)makeBranch(container,'Quản lý giao hàng',orderOpen,1,()=>setRoot('orders'),'truck','orders',scope);
  if(orderOpen&&orders.length){
   const kids=make('div','qbn-children');kids.id='qbn-panel-orders-'+scope;
   const labels={overview:'Tổng hợp',sale:'Sale lên đơn',pack:'Đóng hàng',ship:'Vận đơn'};
   for(const [key,label] of orders)makeLeaf(kids,label||labels[key]||key,area==='orders'&&activeView===key,2,()=>onOrder(key));
   container.append(kids);
  }
  const mediaOpen=expandedRoot==='media';
  const visibleMedia=MEDIA_GROUPS.some(group=>group.items.some(([id])=>canMedia(id)));
  if(visibleMedia)makeBranch(container,'Quản lý Media',mediaOpen,1,()=>setRoot('media'),'video','media',scope);
  if(visibleMedia&&mediaOpen){
   const section=make('div','qbn-children');section.id='qbn-panel-media-'+scope;
   for(const group of MEDIA_GROUPS){
    const allowed=group.items.filter(([key])=>canMedia(key));
    if(!allowed.length)continue;
    const isOpen=expandedGroup===group.id;
    makeBranch(section,group.name,isOpen,2,()=>{expandedGroup=isOpen?null:group.id;repaint();},group.id,'media-'+group.id,scope);
    if(isOpen){
     const leaves=make('div','qbn-children');leaves.id='qbn-panel-media-'+group.id+'-'+scope;
     for(const [key,label] of allowed)makeLeaf(leaves,label,area==='media'&&activeView===key,3,()=>{expandedGroup=group.id;onMedia(key);});
     section.append(leaves);
    }
   }
   container.append(section);
  }
  if(admin){const adminButton=makeLeaf(container,'Quản trị hệ thống',area==='admin'||(area==='orders'&&activeView==='staff'),1,onAdmin);adminButton.prepend(icon('settings'));adminButton.classList.add('qbn-admin');}
 }
 if(drawer){drawer.hidden=!drawerOpen;drawer.setAttribute('aria-hidden',String(!drawerOpen));drawer.setAttribute('role','dialog');drawer.setAttribute('aria-modal',String(drawerOpen));drawer.setAttribute('aria-label','Menu điều hướng QBOOK');}
 if(toggle){toggle.setAttribute('aria-expanded',String(drawerOpen));toggle.setAttribute('aria-controls','qbnDrawer');toggle.onclick=()=>{drawerOpen=!drawerOpen;repaint();if(drawerOpen){drawer?.querySelector?.('#qbnClose')?.focus?.();}else toggle.focus?.();};}
}
function closeDrawer(){drawerOpen=false;const toggle=document.getElementById('qbnToggle');toggle?.focus?.();}
function focusMedia(view){expandedRoot='media';expandedGroup=groupFor(view);hasInitialState=true;}
function focusOrders(){expandedRoot='orders';expandedGroup=null;hasInitialState=true;}
function focusAdmin(){expandedRoot=null;expandedGroup=null;hasInitialState=true;}
document.addEventListener('keydown',event=>{
 if(!drawerOpen)return;
 const drawer=document.getElementById('qbnDrawer');
 if(event.key==='Escape'){
  event.preventDefault();
  drawerOpen=false;
  if(drawer){drawer.hidden=true;drawer.setAttribute('aria-hidden','true');drawer.setAttribute('aria-modal','false');}
  const toggle=document.getElementById('qbnToggle');toggle?.setAttribute('aria-expanded','false');toggle?.focus?.();
  return;
 }
 if(event.key==='Tab'&&drawer&&!drawer.hidden){
  const nodes=[...drawer.querySelectorAll('button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled),[tabindex]:not([tabindex="-1"])')].filter(x=>x.getClientRects?.().length!==0);
  if(!nodes.length)return;
  const first=nodes[0],last=nodes[nodes.length-1];
  if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
  else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
 }
});
global.QbookNavigation={render,closeDrawer,focusMedia,focusOrders,focusAdmin,mediaGroups:MEDIA_GROUPS};
})(window);
