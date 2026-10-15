/* PWA lifecycle only; learning state remains in localStorage. */
(function(){
'use strict';
let registration,checking=false;
const badge=document.getElementById('pwa-status'),banner=document.getElementById('pwa-update');
function status(message){badge.textContent=message;document.querySelectorAll('[data-offline-status]').forEach(el=>el.textContent=message);}
function waiting(){banner.hidden=!registration?.waiting;}
function offlineStatus(){return new Promise(resolve=>{
 const worker=registration?.active;
 if(!worker){status('正在准备离线文件…');resolve(false);return;}
 const channel=new MessageChannel(),timer=setTimeout(()=>{status('离线状态待检查');resolve(false);},5000);
 channel.port1.onmessage=event=>{clearTimeout(timer);channel.port1.close();const s=event.data;status(s.ready?`离线已就绪 · ${s.files} 个文件`:'离线文件不完整，请联网检查更新');resolve(s.ready);};
 worker.postMessage({type:'OFFLINE_STATUS'},[channel.port2]);
});}
async function setup(){
 if(!('serviceWorker' in navigator)||!window.isSecureContext||!/^https?:$/.test(location.protocol)){status('PWA 需通过 HTTPS 或本机 localhost 打开');return;}
 try{
  registration=await navigator.serviceWorker.register(new URL('sw.js',document.baseURI),{scope:'./',updateViaCache:'none'});
  waiting();registration.addEventListener('updatefound',()=>{
   const worker=registration.installing;
   if(worker)worker.addEventListener('statechange',()=>{
    if(worker.state==='installed'){waiting();if(!registration.waiting)offlineStatus();}
    if(worker.state==='redundant')status('缓存安装失败，原离线版本保留；请联网重试');
   });
  });
  await navigator.serviceWorker.ready;await offlineStatus();
 }catch(error){status('离线缓存未完成，请保持联网并检查更新');}
}
async function check(){
 if(checking)return;checking=true;status('正在检查离线文件与更新…');
 try{if(!registration)await setup();else{await registration.update();waiting();await offlineStatus();}}
 catch(error){status('当前无法检查更新；已有离线缓存仍可使用');}finally{checking=false;}
}
banner.querySelector('button').addEventListener('click',()=>{
 if(!registration?.waiting)return;
 if(!window.EEP_CAN_UPDATE?.()){window.alert('请先完成正在进行的模拟考试，并确认进度已保存，再更新。');return;}
 let reloading=false;
 navigator.serviceWorker.addEventListener('controllerchange',()=>{if(!reloading){reloading=true;location.reload();}});
 registration.waiting.postMessage({type:'ACTIVATE_UPDATE'});
});
window.EEP_PWA={check,status:()=>badge.textContent};
window.addEventListener('online',()=>{check();});
window.addEventListener('pageshow',()=>{if(registration)offlineStatus();});
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&registration)check();});
setup();
})();
