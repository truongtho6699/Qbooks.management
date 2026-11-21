/* QBOOK local performance diagnostics: opt-in via ?perf=1.
 * No analytics endpoint, no account/order data, no local storage.
 * Values are diagnostic hints and not a substitute for a Lighthouse lab run
 * or field Core Web Vitals measurement across real users.
 */
(function(){
 'use strict';
 if(!new URLSearchParams(window.location.search).has('perf'))return;
 if(typeof performance==='undefined')return;
 const metrics={firstContentfulPaint:null,largestContentfulPaint:null,cumulativeLayoutShift:0,
  interactionDurationMax:null,domContentLoaded:null,loadEventEnd:null,serverResponseStart:null};
 const observers=[];
 const observe=(type,callback)=>{
  if(typeof PerformanceObserver==='undefined'||!PerformanceObserver.supportedEntryTypes?.includes(type))return;
  try{
   const observer=new PerformanceObserver(list=>callback(list.getEntries()));
   observer.observe({type,buffered:true});
   observers.push(observer);
  }catch{}
 };
 observe('paint',entries=>{for(const e of entries)if(e.name==='first-contentful-paint')metrics.firstContentfulPaint=Math.round(e.startTime);render()});
 observe('largest-contentful-paint',entries=>{for(const e of entries)metrics.largestContentfulPaint=Math.round(e.startTime);render()});
 observe('layout-shift',entries=>{for(const e of entries)if(!e.hadRecentInput)metrics.cumulativeLayoutShift+=e.value;render()});
 observe('event',entries=>{
  for(const e of entries)if(e.interactionId>0)metrics.interactionDurationMax=Math.max(metrics.interactionDurationMax||0,Math.round(e.duration));
  render();
 });
 const wrapper=document.createElement('aside');wrapper.id='qbookLocalMetrics';wrapper.setAttribute('aria-label','Thông số hiệu năng Qbooks');
 wrapper.style.cssText='position:fixed;z-index:10002;bottom:12px;left:12px;width:min(340px,calc(100vw - 24px));padding:13px 14px;border-radius:12px;border:1px solid #bed1eb;background:#fff;color:#152e50;box-shadow:0 10px 25px #19375d30;font:12px/1.5 system-ui;max-height:55vh;overflow:auto';
 const title=document.createElement('strong');title.textContent='QBOOK · Kiểm tra hiệu năng (cục bộ)';
 const close=document.createElement('button');close.type='button';close.textContent='Đóng';close.setAttribute('aria-label','Đóng bảng thông số hiệu năng');
 close.style.cssText='float:right;min-height:44px;border:1px solid #cbdcf8;border-radius:8px;background:#eaf2ff;color:#1756a0;padding:8px 12px';
 const values=document.createElement('div');values.style.marginTop='9px';values.setAttribute('role','status');
 const note=document.createElement('p');note.textContent='Đo trong tab này, không gửi dữ liệu. INP hiển thị ước lượng từ thời lượng sự kiện, không phải chỉ số INP chính thức. Hãy dùng Lighthouse/CrUX để nghiệm thu.';note.style.cssText='font-size:11px;color:#586b84;margin:9px 0 0';
 const button=document.createElement('button');button.type='button';button.textContent='Lưu báo cáo JSON';
 button.style.cssText='min-height:44px;margin-top:9px;border:1px solid #cbdcf8;border-radius:8px;background:#eaf2ff;color:#1756a0;padding:8px 12px';
 const fmt=(n,suffix=' ms')=>n===null?'Chưa có':String(n)+suffix;
 const report=()=>{
  const n=performance.getEntriesByType('navigation')[0];
  if(n){
   metrics.serverResponseStart=Math.round(n.responseStart);
   metrics.domContentLoaded=Math.round(n.domContentLoadedEventEnd);
   metrics.loadEventEnd=n.loadEventEnd?Math.round(n.loadEventEnd):null;
  }
  return {...metrics,cumulativeLayoutShift:Number(metrics.cumulativeLayoutShift.toFixed(3)),timestamp:new Date().toISOString(),mode:'local-opt-in'};
 };
 function render(){
  if(!values.isConnected)return;
  const m=report();
  values.textContent='FCP: '+fmt(m.firstContentfulPaint)+' · LCP: '+fmt(m.largestContentfulPaint)+
   ' · CLS: '+fmt(m.cumulativeLayoutShift,'')+' · Sự kiện chậm nhất: '+fmt(m.interactionDurationMax)+
   ' · DOM sẵn sàng: '+fmt(m.domContentLoaded)+' · Tải xong: '+fmt(m.loadEventEnd);
 }
 button.onclick=()=>{
  const blob=new Blob([JSON.stringify(report(),null,2)],{type:'application/json'});
  const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='qbooks-performance-local.json';a.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
 };
 close.onclick=()=>{for(const o of observers)o.disconnect();clearInterval(interval);wrapper.remove();};
 wrapper.append(title,close,values,note,button);
 const mount=()=>{document.body.append(wrapper);render();};
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});else mount();
 const interval=setInterval(render,2500);
})();
