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
 function makeBranch(parent,label,open,depth,action){
  const button=make('button','qbn-branch qbn-depth-'+depth+(open?' qbn-open':''));button.type='button';
  const name=make('span','qbn-branch-label',label);const arrow=make('span','qbn-chevron',open?'▾':'▸');
  button.append(name,arrow);button.setAttribute('aria-expanded',String(open));
  button.onclick=action;parent.append(button);return button;
 }
 function makeLeaf(parent,label,active,depth,action){
  const button=make('button','qbn-leaf qbn-depth-'+depth+(active?' qbn-active':''),label);
  button.type='button';button.setAttribute('aria-current',active?'page':'false');
  button.onclick=()=>{drawerOpen=false;render(config);action();};parent.append(button);return button;
 }
 for(const container of containers){
  container.replaceChildren();
  const orderOpen=expandedRoot==='orders';
  if(orders.length)makeBranch(container,'▣  Quản lý giao hàng',orderOpen,1,()=>setRoot('orders'));
  if(orderOpen){
   const kids=make('div','qbn-children');
   const labels={overview:'Tổng hợp',sale:'Sale lên đơn',pack:'Đóng hàng',ship:'Vận đơn'};
   for(const [key,label] of orders)makeLeaf(kids,label||labels[key]||key,area==='orders'&&activeView===key,2,()=>onOrder(key));
   container.append(kids);
  }
  const mediaOpen=expandedRoot==='media';
  const visibleMedia=MEDIA_GROUPS.some(group=>group.items.some(([id])=>canMedia(id)));
  if(visibleMedia)makeBranch(container,'◉  Quản lý Media',mediaOpen,1,()=>setRoot('media'));
  if(visibleMedia&&mediaOpen){
   const section=make('div','qbn-children');
   for(const group of MEDIA_GROUPS){
    const allowed=group.items.filter(([key])=>canMedia(key));
    if(!allowed.length)continue;
    const isOpen=expandedGroup===group.id;
    makeBranch(section,group.icon+'  '+group.name,isOpen,2,()=>{expandedGroup=isOpen?null:group.id;repaint();});
    if(isOpen){
     const leaves=make('div','qbn-children');
     for(const [key,label] of allowed)makeLeaf(leaves,label,area==='media'&&activeView===key,3,()=>{expandedGroup=group.id;onMedia(key);});
     section.append(leaves);
    }
   }
   container.append(section);
  }
  if(admin)makeLeaf(container,'⚙  Quản trị hệ thống',area==='admin'||(area==='orders'&&activeView==='staff'),1,onAdmin);
 }
 if(drawer){drawer.hidden=!drawerOpen;drawer.setAttribute('aria-hidden',String(!drawerOpen));}
 if(toggle){toggle.setAttribute('aria-expanded',String(drawerOpen));toggle.onclick=()=>{drawerOpen=!drawerOpen;repaint();};}
}
function closeDrawer(){drawerOpen=false;}
function focusMedia(view){expandedRoot='media';expandedGroup=groupFor(view);hasInitialState=true;}
function focusOrders(){expandedRoot='orders';expandedGroup=null;hasInitialState=true;}
function focusAdmin(){expandedRoot=null;expandedGroup=null;hasInitialState=true;}
global.QbookNavigation={render,closeDrawer,focusMedia,focusOrders,focusAdmin,mediaGroups:MEDIA_GROUPS};
})(window);
