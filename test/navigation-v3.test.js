import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

class Node {
 constructor(tag){this.tag=tag;this.children=[];this.attrs={};this.dataset={};this.className='';this.textContent='';this.hidden=false;this.onclick=null;this.parent=null;this.focused=false;}
 append(...children){for(const c of children){this.children.push(c);if(c&&typeof c==='object')c.parent=this;}}
 prepend(...children){for(const c of children.reverse()){this.children.unshift(c);if(c&&typeof c==='object')c.parent=this;}}
 replaceChildren(...children){this.children=[];this.append(...children)}
 setAttribute(k,v){this.attrs[k]=String(v)}
 getAttribute(k){return this.attrs[k]}
 closest(selector){if(selector==='#qbnMobileTree'){let node=this;while(node){if(node.id==='qbnMobileTree')return node;node=node.parent;}}return null;}
 querySelector(selector){
  const k=/^\[data-nav-key="([^"]+)"\]$/.exec(selector);
  if(k)return walk(this).find(x=>x.dataset?.navKey===k[1])||null;
  return null;
 }
 focus(){this.focused=true}
}
const walk=node=>[node,...(node.children||[]).flatMap(x=>x&&typeof x==='object'?walk(x):[])];
function harness(){
 const els=new Map();
 const doc={
  createElement:tag=>new Node(tag),
  createElementNS:(_ns,tag)=>new Node(tag),
  createTextNode:text=>({textContent:text}),
  getElementById:id=>els.get(id)||null,
  addEventListener:(event,handler)=>{if(event==='keydown')doc.keydown=handler}
 };
 const win={};
 runInNewContext(readFileSync(new URL('../public/navigation.js',import.meta.url),'utf8'),{document:doc,window:win});
 const desktop=new Node('nav'),mobile=new Node('nav'),drawer=new Node('div'),toggle=new Node('button'),close=new Node('button');
 desktop.id='desktopNav';mobile.id='qbnMobileTree';drawer.id='qbnDrawer';toggle.id='qbnToggle';close.id='qbnClose';drawer.append(close);
 for(const element of [desktop,mobile,drawer,toggle,close])els.set(element.id,element);
 const callbacks=[];
 const base={desktop,mobileTree:mobile,drawer,toggle,area:'orders',activeView:'overview',orders:[['overview','Tổng hợp'],['sale','Sale lên đơn']],admin:false,
  canMedia:()=>false,onOrder:key=>callbacks.push(key)};
 return {doc,win,base,desktop,mobile,drawer,toggle,callbacks};
}
test('QBOOK V3 hides unassigned Media parent and system admin without rights',()=>{
 const h=harness();h.win.QbookNavigation.render(h.base);
 const menu=walk(h.desktop).filter(n=>n.className?.split(/\s+/).includes('qbn-branch'));
 assert.equal(menu.length,1);assert.equal(menu[0].attrs['aria-expanded'],'false');
 assert.ok(!walk(h.desktop).some(n=>n.textContent==='Quản lý Media'));
 assert.ok(!walk(h.desktop).some(n=>n.textContent==='Quản trị hệ thống'));
});
test('QBOOK V3 accordion exposes child and declares expanded state',()=>{
 const h=harness();h.win.QbookNavigation.render(h.base);
 const parent=walk(h.desktop).find(n=>n.dataset?.navKey==='orders');assert.ok(parent);
 parent.onclick();
 const expanded=walk(h.desktop).find(n=>n.dataset?.navKey==='orders');
 assert.equal(expanded.attrs['aria-expanded'],'true');
 assert.ok(walk(h.desktop).some(n=>n.textContent==='Sale lên đơn'));
 assert.ok(expanded.focused,'retain keyboard focus after expanding');
});
test('QBOOK V3 drawer is dismissed with Escape and restores focus',()=>{
 const h=harness();h.win.QbookNavigation.render(h.base);
 h.toggle.onclick();
 assert.equal(h.drawer.hidden,false);
 assert.equal(h.toggle.attrs['aria-expanded'],'true');
 assert.equal(h.drawer.attrs['role'],'dialog');
 assert.equal(h.drawer.attrs['aria-modal'],'true');
 h.doc.keydown({key:'Escape',preventDefault(){}});
 assert.equal(h.drawer.hidden,true);
 assert.equal(h.toggle.attrs['aria-expanded'],'false');
 assert.equal(h.toggle.focused,true);
});
test('QBOOK V3 shows allowed Media menu only and uses SVG icons',()=>{
 const h=harness();h.win.QbookNavigation.render({...h.base,canMedia:key=>key==='film'});
 const btn=walk(h.desktop).find(n=>n.dataset?.navKey==='media');assert.ok(btn);
 assert.ok(walk(btn).some(n=>n.tag==='svg'));
 btn.onclick();
 const filmGroup=walk(h.desktop).find(n=>n.dataset?.navKey==='media-shoot');assert.ok(filmGroup);
 filmGroup.onclick();
 assert.ok(walk(h.desktop).some(n=>n.textContent==='Quay bài'));
 assert.ok(!walk(h.desktop).some(n=>n.textContent==='Phân quyền tài khoản'));
});

test('QBOOK V3 closes drawer with focus returned through shared API',()=>{
 const h=harness();h.win.QbookNavigation.render(h.base);h.toggle.onclick();
 assert.equal(h.drawer.hidden,false);
 h.win.QbookNavigation.closeDrawer();
 assert.equal(h.toggle.focused,true);
 h.win.QbookNavigation.render(h.base);
 assert.equal(h.drawer.hidden,true);
 assert.equal(h.drawer.attrs['aria-modal'],'false');
});
