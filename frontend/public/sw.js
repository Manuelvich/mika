const CACHE_NAME='mika-4.3.2-list-actions-outline-r1';
const SW_VERSION='2026-07-15-mika-4.3-navigation-fix-r1';
self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',event=>event.waitUntil((async()=>{for(const key of await caches.keys())await caches.delete(key);await self.clients.claim()})()));

self.addEventListener('push',event=>{
  let data={title:'Messenger',body:'Новое сообщение',url:'/',tag:'message',kind:'message'};
  try{if(event.data)data={...data,...event.data.json()}}catch{}
  const options={
    body:data.body,
    icon:'/icon-192.png',
    badge:'/badge-96.png',
    tag:data.kind==='call'?`call-${data.call_id||Date.now()}`:(data.tag||'message'),
    renotify:true,
    requireInteraction:data.kind==='call',
    data:{url:data.url||'/',kind:data.kind||'message',callId:data.call_id||null,createdAt:Date.now()},
    actions:data.kind==='call'?[{action:'answer',title:'Открыть звонок'},{action:'dismiss',title:'Закрыть'}]:[]
  };
  event.waitUntil(self.registration.showNotification(data.title||'Messenger',options));
});

self.addEventListener('notificationclick',event=>{
  event.notification.close();
  if(event.action==='dismiss')return;
  const rawUrl=event.notification.data?.url||'/';
  const absoluteUrl=new URL(rawUrl,self.location.origin).href;
  const callId=event.notification.data?.callId||new URL(absoluteUrl).searchParams.get('call');
  event.waitUntil((async()=>{
    const windows=await clients.matchAll({type:'window',includeUncontrolled:true});
    for(const client of windows){
      try{
        client.postMessage({type:'OPEN_NOTIFICATION',url:absoluteUrl,kind:event.notification.data?.kind,callId});
        if('navigate' in client)await client.navigate(absoluteUrl);
        return await client.focus();
      }catch{}
    }
    const opened=await clients.openWindow(absoluteUrl);
    if(opened&&callId){
      setTimeout(()=>{try{opened.postMessage({type:'OPEN_NOTIFICATION',url:absoluteUrl,kind:'call',callId})}catch{}},500);
    }
    return opened;
  })());
});
