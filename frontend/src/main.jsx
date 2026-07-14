import React,{useEffect,useMemo,useRef,useState}from'react';
import{createRoot}from'react-dom/client';
import{createPortal}from'react-dom';
import'./style.css';

const API=import.meta.env.VITE_API_URL||'';
const APP_VERSION='2026.07.14-r22a-white-screen-fix';
const CALL_INVITE_TTL_MS=120000;
const isFreshCall=c=>{if(!c||c.ended)return false;const created=Date.parse(c.created_at||'');if(!Number.isFinite(created))return true;const unanswered=(c.participants||[]).length<=1;return !unanswered||Date.now()-created<CALL_INVITE_TTL_MS};
async function closeCallNotifications(){try{const reg=await navigator.serviceWorker?.getRegistration();const notes=await reg?.getNotifications?.();for(const n of notes||[])if(n.data?.kind==='call'||String(n.tag||'').startsWith('call-'))n.close()}catch{}}
const api=async(path,opt={})=>{const t=localStorage.token;const headers={...(opt.body instanceof FormData?{}:{'Content-Type':'application/json'}),...(t?{Authorization:'Bearer '+t}:{}),...(opt.headers||{})};const configured=String(API||'').replace(/\/$/,'');const sameOrigin=path.startsWith('/')?path:`/${path}`;const primary=configured?configured+sameOrigin:sameOrigin;const candidates=[primary];if(configured&&primary!==sameOrigin)candidates.push(sameOrigin);let lastError=null;for(const url of candidates){try{const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),15000);const r=await fetch(url,{...opt,headers,signal:opt.signal||controller.signal,credentials:'same-origin'});clearTimeout(timer);if(!r.ok){let e={detail:r.statusText};try{e=await r.json()}catch{}throw new Error(typeof e.detail==='string'?e.detail:JSON.stringify(e.detail))}if(r.status===204)return null;return await r.json()}catch(e){lastError=e;if(e?.name==='AbortError')lastError=new Error('Сервер не ответил. Проверьте соединение.');if(url===sameOrigin||!configured)break}}throw new Error(lastError?.message==='Failed to fetch'?'Не удалось связаться с сервером. Проверьте сеть и повторите.':lastError?.message||'Ошибка сети')};
const isStandalone=()=>window.matchMedia('(display-mode: standalone)').matches||window.navigator.standalone===true;
const detectDevice=()=>{const ua=navigator.userAgent||'';const touch=navigator.maxTouchPoints||0;const w=window.innerWidth,h=window.innerHeight;let type='desktop';if(/iPhone|Android.+Mobile/i.test(ua)||(touch>1&&Math.min(w,h)<600))type='phone';else if(/iPad|Tablet/i.test(ua)||(touch>1&&Math.min(w,h)>=600))type='tablet';return{type,width:w,height:h,orientation:w>h?'landscape':'portrait',standalone:isStandalone(),ios:/iPhone|iPad|iPod/i.test(ua)||(/Macintosh/i.test(ua)&&touch>1)}};
const MOSCOW_TZ='Europe/Moscow';
const moscowTime=value=>value?new Date(value).toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit',timeZone:MOSCOW_TZ}):'';
const moscowParts=value=>Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:MOSCOW_TZ,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(value)).filter(x=>x.type!=='literal').map(x=>[x.type,x.value]));
const lastSeenText=u=>{if(!u)return'';if(u.online)return'в сети';if(!u.last_seen)return'не в сети';const now=moscowParts(Date.now()),seen=moscowParts(u.last_seen),dayNow=Date.UTC(+now.year,+now.month-1,+now.day),daySeen=Date.UTC(+seen.year,+seen.month-1,+seen.day),days=Math.round((dayNow-daySeen)/86400000),time=moscowTime(u.last_seen);if(days===0)return`был(а) сегодня в ${time}`;if(days===1)return`был(а) вчера в ${time}`;return`был(а) ${new Date(u.last_seen).toLocaleDateString('ru-RU',{day:'2-digit',month:'2-digit',year:seen.year===now.year?undefined:'numeric',timeZone:MOSCOW_TZ})} в ${time}`};
const b64ToArray=s=>{const p='='.repeat((4-s.length%4)%4),b=atob((s+p).replace(/-/g,'+').replace(/_/g,'/'));return Uint8Array.from([...b].map(c=>c.charCodeAt(0)))};
const Icon=({name,size=20})=>{const paths={phone:<><path d="M7.2 3.5 9 7.8 6.8 9.4a15.5 15.5 0 0 0 7.8 7.8L16.2 15l4.3 1.8v3.1c0 .9-.7 1.6-1.6 1.6C9.8 21.5 2.5 14.2 2.5 5.1c0-.9.7-1.6 1.6-1.6h3.1Z"/></>,video:<><rect x="3" y="6" width="13" height="12" rx="3"/><path d="m16 10 5-3v10l-5-3Z"/></>,send:<><path d="m3 3 18 9-18 9 4-9-4-9Z"/><path d="M7 12h14"/></>,switch:<><path d="M7 7h10l-2.5-2.5M17 17H7l2.5 2.5"/><path d="M17 7l-2.5 2.5M7 17l2.5-2.5"/></>,mic:<><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></>,camera:<><rect x="3" y="6" width="18" height="13" rx="3"/><circle cx="12" cy="12.5" r="3.5"/><path d="m8 6 1.2-2h5.6L16 6"/></>,hangup:<><path d="M5 15c4.5-4 9.5-4 14 0"/><path d="m5 15-2 3M19 15l2 3"/></>,bell:<><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M10 21h4"/></>,info:<><circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7h.01"/></>,cloud:<><path d="M17.5 19H7a5 5 0 0 1-.8-9.94A7 7 0 0 1 19.7 11.5 3.8 3.8 0 0 1 17.5 19Z"/></>,star:<><path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9L12 3Z"/></>,folder:<><path d="M3 6.5h6l2 2h10v10.5H3Z"/></>,settings:<><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.12 2.12-.06-.06a1.7 1.7 0 0 0-1.88-.34 1.7 1.7 0 0 0-1.03 1.55V20.3h-3v-.09a1.7 1.7 0 0 0-1.03-1.55 1.7 1.7 0 0 0-1.88.34l-.06.06-2.12-2.12.06-.06A1.7 1.7 0 0 0 7 15a1.7 1.7 0 0 0-1.55-1.03H5.3v-3h.15A1.7 1.7 0 0 0 7 9.94a1.7 1.7 0 0 0-.34-1.88L6.6 8l2.12-2.12.06.06a1.7 1.7 0 0 0 1.88.34A1.7 1.7 0 0 0 11.7 4.7V4.6h3v.1a1.7 1.7 0 0 0 1.03 1.55 1.7 1.7 0 0 0 1.88-.34l.06-.06L19.8 8l-.06.06a1.7 1.7 0 0 0-.34 1.88 1.7 1.7 0 0 0 1.55 1.03h.15v3h-.15A1.7 1.7 0 0 0 19.4 15Z"/></>,logout:<><path d="M10 17l5-5-5-5M15 12H3"/><path d="M14 4h6v16h-6"/></>,message:<><path d="M4 5h16v11H8l-4 4Z"/></>,link:<><path d="M10 13a5 5 0 0 0 7.5.5l2-2a5 5 0 0 0-7-7l-1 1"/><path d="M14 11a5 5 0 0 0-7.5-.5l-2 2a5 5 0 0 0 7 7l1-1"/></>,paperclip:<path d="m9 12 6-6a3 3 0 0 1 4 4l-8 8a5 5 0 0 1-7-7l8-8"/>,more:<><circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/></>,image:<><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-5-5L5 20"/></>,file:<><path d="M6 3h8l4 4v14H6Z"/><path d="M14 3v5h5"/></>,search:<><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></>,apps:<><rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/></>,dockChat:<><path d="M4 5.5h16v11H9l-5 3.5V5.5Z"/><circle cx="8.5" cy="11" r=".7" fill="currentColor" stroke="none"/><circle cx="12" cy="11" r=".7" fill="currentColor" stroke="none"/><circle cx="15.5" cy="11" r=".7" fill="currentColor" stroke="none"/></>,dockDisk:<><path d="M17.8 18.5H7.2a4.7 4.7 0 0 1-.7-9.35A6.4 6.4 0 0 1 18.8 11a3.8 3.8 0 0 1-1 7.5Z"/><path d="M12 11.5v5M9.8 13.8 12 16l2.2-2.2"/></>,dockApps:<><rect x="3.5" y="3.5" width="6.5" height="6.5" rx="2.1"/><rect x="14" y="3.5" width="6.5" height="6.5" rx="2.1"/><rect x="3.5" y="14" width="6.5" height="6.5" rx="2.1"/><rect x="14" y="14" width="6.5" height="6.5" rx="2.1"/></>,dockStar:<><path d="m12 3.2 2.65 5.38 5.94.86-4.3 4.2 1.02 5.91L12 16.75l-5.31 2.8 1.02-5.91-4.3-4.2 5.94-.86L12 3.2Z"/></>,dockProfile:<><circle cx="12" cy="8" r="3.2"/><path d="M5.5 20c.7-4 3-6 6.5-6s5.8 2 6.5 6"/></>};return <svg className={'icon '+(String(name).startsWith('dock')?'dock-icon':'')} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={String(name).startsWith('dock')?2.05:1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>};
const Avatar=({user,name,className='chat-avatar'})=>{const label=(user?.display_name||user?.username||name||'?').trim();return <span className={className+(user?.avatar_url?' has-photo':'')}>{user?.avatar_url?<img src={user.avatar_url} alt=""/>:label[0]?.toUpperCase()}</span>};
const MessageTicks=({status})=><span className={'message-ticks '+(status==='read'?'read':'')} aria-label={status==='read'?'Прочитано':status==='delivered'?'Доставлено':'Отправлено'}>{status==='sent'?<span>✓</span>:<><span>✓</span><span>✓</span></>}</span>;
const LinkifiedText=({text=''})=>{const parts=String(text).split(/((?:https?:\/\/|\/share\/)[^\s]+)/gi);return <>{parts.map((part,i)=>{if(!/^(?:https?:\/\/|\/share\/)/i.test(part))return <React.Fragment key={i}>{part}</React.Fragment>;const href=part.startsWith('/share/')?`${location.origin}${part}`:part;return <a key={i} className="message-link" href={href} target="_blank" rel="noreferrer">{part}</a>})}</>};


function Auth({done}){const[mode,setMode]=useState('login'),[username,setU]=useState(''),[password,setP]=useState(''),[err,setE]=useState(''),[busy,setBusy]=useState(false);async function go(e){e.preventDefault();setBusy(true);setE('');try{const x=await api('/api/'+mode,{method:'POST',body:JSON.stringify({username,password})});localStorage.token=x.token;done(x.user)}catch(e){setE(e.message)}finally{setBusy(false)}}return <div className="auth-shell"><form className="auth-card" onSubmit={go}><div className="brand-mark">M</div><h1>Messenger</h1><p>Личное пространство для общения</p><input autoCapitalize="none" autoCorrect="off" placeholder="Логин" value={username} onChange={e=>setU(e.target.value)}/><input type="password" placeholder="Пароль" value={password} onChange={e=>setP(e.target.value)}/>{err&&<div className="error">{err}</div>}<button disabled={busy}>{busy?'Подождите…':mode==='login'?'Войти':'Зарегистрироваться'}</button><button type="button" className="link-button" onClick={()=>{setMode(mode==='login'?'register':'login');setE('')}}>{mode==='login'?'Нет аккаунта? Регистрация':'Уже есть аккаунт? Войти'}</button></form></div>}

function CallLayer({user,ws,chat,invite,setInvite,clearRequestedCall}){
const[call,setCall]=useState(null),[status,setStatus]=useState(''),[muted,setMuted]=useState(false),[cameraOff,setCameraOff]=useState(false);
const localVideo=useRef(),remoteGrid=useRef(),streamRef=useRef(),peers=useRef(new Map()),remoteStreams=useRef(new Map()),iceRef=useRef([]),callRef=useRef(null),pendingIce=useRef(new Map()),endingRef=useRef(false),toneRef=useRef({ctx:null,timer:null,nodes:[]}),sessionRef=useRef(0),facingRef=useRef('user');

function setCurrentCall(value){callRef.current=value;setCall(value)}
function stopTone(){
  const t=toneRef.current;
  if(t.timer){clearInterval(t.timer);t.timer=null}
  for(const n of t.nodes){try{n.stop?.();n.disconnect?.()}catch{}}
  t.nodes=[];
}
function startTone(kind){
  stopTone();
  try{
    const AC=window.AudioContext||window.webkitAudioContext;if(!AC)return;
    const ctx=toneRef.current.ctx||(toneRef.current.ctx=new AC());
    ctx.resume?.().catch(()=>{});
    const pulse=()=>{
      if(ctx.state==='suspended')ctx.resume?.().catch(()=>{});
      const now=ctx.currentTime, gain=ctx.createGain(), o1=ctx.createOscillator(), o2=ctx.createOscillator();
      const incoming=kind==='incoming';
      o1.frequency.value=incoming?440:425;o2.frequency.value=incoming?480:450;
      gain.gain.setValueAtTime(0.0001,now);gain.gain.exponentialRampToValueAtTime(incoming?0.10:0.055,now+0.03);
      gain.gain.setValueAtTime(incoming?0.10:0.055,now+(incoming?0.75:0.55));gain.gain.exponentialRampToValueAtTime(0.0001,now+(incoming?0.9:0.7));
      o1.connect(gain);o2.connect(gain);gain.connect(ctx.destination);o1.start(now);o2.start(now);o1.stop(now+(incoming?0.92:0.72));o2.stop(now+(incoming?0.92:0.72));
      toneRef.current.nodes=[o1,o2,gain];
    };
    pulse();toneRef.current.timer=setInterval(pulse,kind==='incoming'?2200:3000);
  }catch{}
}
useEffect(()=>{
  if(invite&&!call)startTone('incoming');else if(!call)stopTone();
  const resume=()=>toneRef.current.ctx?.resume?.().catch(()=>{});
  window.addEventListener('pointerdown',resume,{passive:true});
  return()=>window.removeEventListener('pointerdown',resume);
},[invite,call]);

useEffect(()=>{if(call&&localVideo.current&&streamRef.current)localVideo.current.srcObject=streamRef.current},[call]);
useEffect(()=>{window.__messengerCallEvent=handleEvent;return()=>{delete window.__messengerCallEvent;hardCleanup(true,true)}},[]);
useEffect(()=>{window.__startCall=start;return()=>{delete window.__startCall}},[chat]);

async function media(mode){
  if(!navigator.mediaDevices?.getUserMedia)throw new Error('Камера и микрофон недоступны');

  let stream=streamRef.current;
  const liveAudio=stream?.getAudioTracks().find(t=>t.readyState==='live');
  const liveVideo=stream?.getVideoTracks().find(t=>t.readyState==='live');
  const needAudio=!liveAudio;
  const needVideo=mode==='video'&&!liveVideo;

  // Для видеозвонка камера и микрофон запрашиваются одним системным диалогом,
  // а не двумя последовательными запросами.
  if(needAudio||needVideo){
    const acquired=await navigator.mediaDevices.getUserMedia({
      audio:needAudio?{echoCancellation:true,noiseSuppression:true}:false,
      video:needVideo?{facingMode:{ideal:facingRef.current},width:{ideal:1280},height:{ideal:720}}:false
    });
    if(!stream){stream=new MediaStream();streamRef.current=stream}
    acquired.getTracks().forEach(t=>stream.addTrack(t));
  }

  stream.getAudioTracks().forEach(t=>t.enabled=true);
  stream.getVideoTracks().forEach(t=>t.enabled=mode==='video');
  if(localVideo.current)localVideo.current.srcObject=stream;
  return stream;
}
async function emit(x){
  if(ws.current?.readyState===WebSocket.OPEN){
    try{ws.current.send(JSON.stringify(x));return true}catch{}
  }
  const id=x.call_id||callRef.current?.call_id;
  if(!id)return false;
  try{await api(`/api/calls/${id}/event`,{method:'POST',body:JSON.stringify({type:x.type,target_user_id:x.target_user_id??null,signal:x.signal??null})});return true}catch{return false}
}
async function resetServerCalls(){
  try{
    const active=await api('/api/calls/active');
    await Promise.all((active||[]).map(c=>api(`/api/calls/${c.call_id}/leave`,{method:'POST',body:'{}'}).catch(()=>{})));
  }catch{}
}
async function start(mode){
  if(!chat||callRef.current||invite)return;
  sessionRef.current+=1;
  hardCleanup(false);
  await resetServerCalls();
  try{
    const ice=await api('/api/calls/ice');iceRef.current=ice.iceServers;
    // Доступ к устройствам запрашивается только после явного нажатия кнопки звонка.
    await media(mode);
    const c=await api(`/api/chats/${chat.id}/calls`,{method:'POST',body:JSON.stringify({mode})});
    setCurrentCall(c);setStatus('Ожидание ответа…');startTone('outgoing');
  }catch(e){alert('Не удалось начать звонок: '+e.message);hardCleanup()}
}
async function accept(){
  const incoming=invite;if(!incoming)return;
  sessionRef.current+=1;
  hardCleanup(false);
  setInvite(incoming);
  try{
    const ice=await api('/api/calls/ice');iceRef.current=ice.iceServers;
    // Важно: callRef устанавливается синхронно до отправки call_accept.
    stopTone();setCurrentCall(incoming);setInvite(null);clearRequestedCall?.();setStatus('Подключение…');
    await media(incoming.mode);
    await emit({type:'call_accept',call_id:incoming.call_id});
  }catch(e){
    await api(`/api/calls/${incoming.call_id}/reject`,{method:'POST',body:'{}'}).catch(()=>{});
    hardCleanup(true,true);setInvite(null);alert('Нет доступа к микрофону или камере: '+e.message)
  }
}
async function reject(){
  const id=invite?.call_id;if(!id)return;
  stopTone();setInvite(null);clearRequestedCall?.();
  await emit({type:'call_reject',call_id:id});
  await api(`/api/calls/${id}/reject`,{method:'POST',body:'{}'}).catch(()=>{});
  hardCleanup();
}
async function peer(remoteId,makeOffer=false){
  if(peers.current.has(remoteId))return peers.current.get(remoteId);
  const pc=new RTCPeerConnection({iceServers:iceRef.current,iceCandidatePoolSize:4});peers.current.set(remoteId,pc);
  streamRef.current?.getTracks().forEach(track=>pc.addTrack(track,streamRef.current));
  pc.onicecandidate=e=>{const current=callRef.current;if(e.candidate&&current)emit({type:'webrtc_signal',call_id:current.call_id,target_user_id:remoteId,signal:{candidate:e.candidate}})};
  pc.ontrack=e=>{remoteStreams.current.set(remoteId,e.streams[0]);setStatus('Разговор');renderRemotes()};
  pc.oniceconnectionstatechange=async()=>{
    if(pc.iceConnectionState==='checking')setStatus('Устанавливаем защищённое соединение…');
    if(pc.iceConnectionState==='disconnected')setStatus('Связь прервалась. Восстанавливаем…');
    if(pc.iceConnectionState==='failed'){
      const current=callRef.current;
      if(current&&current.caller?.id===user.id&&!pc.__iceRestarted){
        pc.__iceRestarted=true;setStatus('Переподключение через сеть…');
        try{const offer=await pc.createOffer({iceRestart:true});await pc.setLocalDescription(offer);await emit({type:'webrtc_signal',call_id:current.call_id,target_user_id:remoteId,signal:{description:pc.localDescription}});return}catch{}
      }
      setStatus('Не удалось связаться. Проверьте TURN и UDP-порты');
    }
  };
  pc.onconnectionstatechange=()=>{
    if(pc.connectionState==='connected'){pc.__iceRestarted=false;setStatus('Разговор')}
    if(pc.connectionState==='disconnected')setStatus('Восстанавливаем соединение…');
    if(pc.connectionState==='closed'){remoteStreams.current.delete(remoteId);renderRemotes()}
    if(pc.connectionState==='failed')setStatus('Не удалось установить соединение');
  };
  if(makeOffer){const offer=await pc.createOffer({offerToReceiveAudio:true,offerToReceiveVideo:true});await pc.setLocalDescription(offer);const current=callRef.current;if(current)await emit({type:'webrtc_signal',call_id:current.call_id,target_user_id:remoteId,signal:{description:pc.localDescription}})}
  return pc
}
async function flushIce(remoteId,pc){const list=pendingIce.current.get(remoteId)||[];for(const c of list){try{await pc.addIceCandidate(c)}catch{}}pendingIce.current.delete(remoteId)}
function renderRemotes(){if(!remoteGrid.current)return;remoteGrid.current.innerHTML='';for(const[id,s]of remoteStreams.current){const v=document.createElement('video');v.autoplay=true;v.playsInline=true;v.srcObject=s;v.dataset.uid=id;remoteGrid.current.appendChild(v)}}
async function handleEvent(p){
  const current=callRef.current;
  if(p.type==='call_accept'&&current?.call_id===p.call_id){
    stopTone();setStatus('Соединение…');
    // Инициатор всегда создаёт offer конкретному принявшему участнику.
    // Это исключает зависимость от ID пользователей и гонку после открытия из push.
    if(current.caller?.id===user.id&&p.from?.id&&p.from.id!==user.id){
      await peer(p.from.id,true);
    }
  }else if(p.type==='webrtc_signal'&&current?.call_id===p.call_id){
    const remoteId=p.from.id,pc=await peer(remoteId,false),sig=p.signal||{};
    if(sig.description){
      await pc.setRemoteDescription(sig.description);
      await flushIce(remoteId,pc);
      if(sig.description.type==='offer'){
        const answer=await pc.createAnswer();await pc.setLocalDescription(answer);
        await emit({type:'webrtc_signal',call_id:current.call_id,target_user_id:remoteId,signal:{description:pc.localDescription}})
      }
    }else if(sig.candidate){
      if(pc.remoteDescription){try{await pc.addIceCandidate(sig.candidate)}catch{}}
      else pendingIce.current.set(remoteId,[...(pendingIce.current.get(remoteId)||[]),sig.candidate]);
    }
  }else if((p.type==='call_reject'||p.type==='call_hangup')&&current?.call_id===p.call_id){
    if(p.ended){stopTone();clearRequestedCall?.();setStatus(p.type==='call_reject'?'Вызов отклонён':'Звонок завершён');setTimeout(()=>hardCleanup(true,true),500);return}
    const id=p.from?.id,pc=peers.current.get(id);pc?.close();peers.current.delete(id);remoteStreams.current.delete(id);renderRemotes();
  }
}
function hardCleanup(clearInvite=true,releaseMedia=false){
  stopTone();
  for(const pc of peers.current.values()){try{pc.ontrack=null;pc.onicecandidate=null;pc.close()}catch{}}
  peers.current.clear();remoteStreams.current.clear();pendingIce.current.clear();
  if(remoteGrid.current)remoteGrid.current.innerHTML='';
  if(localVideo.current)localVideo.current.srcObject=null;

  if(releaseMedia){
    streamRef.current?.getTracks().forEach(t=>{try{t.stop()}catch{}});
    streamRef.current=null;
  }else{
    // Сохраняем уже разрешённые дорожки внутри текущего сеанса PWA,
    // но выключаем их между звонками. Это предотвращает повторный
    // запрос разрешений при каждом следующем вызове на iPhone.
    streamRef.current?.getTracks().forEach(t=>{t.enabled=false});
  }

  callRef.current=null;setCall(null);setStatus('');setMuted(false);setCameraOff(false);endingRef.current=false;
  if(clearInvite)setInvite(null);
}
async function hangup(){
  const current=callRef.current;if(!current||endingRef.current){hardCleanup(true,true);return}
  endingRef.current=true;
  await emit({type:'call_hangup',call_id:current.call_id});
  // REST-дублирование гарантирует очистку, даже если WebSocket уже оборван.
  await api(`/api/calls/${current.call_id}/leave`,{method:'POST',body:'{}'}).catch(()=>{});
  clearRequestedCall?.();hardCleanup(true,true);
}
useEffect(()=>{
  const onPageHide=()=>{const current=callRef.current;if(current){try{fetch(`/api/calls/${current.call_id}/leave`,{method:'POST',headers:{Authorization:'Bearer '+localStorage.token,'Content-Type':'application/json'},body:'{}',keepalive:true})}catch{}}hardCleanup(true,true)};
  window.addEventListener('pagehide',onPageHide);return()=>window.removeEventListener('pagehide',onPageHide)
},[]);
function toggleMute(){const next=!muted;streamRef.current?.getAudioTracks().forEach(t=>t.enabled=!next);setMuted(next)}
function toggleCamera(){const next=!cameraOff;streamRef.current?.getVideoTracks().forEach(t=>t.enabled=!next);setCameraOff(next)}
async function switchCamera(){
  if(callRef.current?.mode!=='video')return;
  const next=facingRef.current==='user'?'environment':'user';
  try{
    const replacement=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:next},width:{ideal:1280},height:{ideal:720}},audio:false});
    const newTrack=replacement.getVideoTracks()[0];
    if(!newTrack)throw new Error('Камера недоступна');
    for(const pc of peers.current.values()){const sender=pc.getSenders().find(x=>x.track?.kind==='video');if(sender)await sender.replaceTrack(newTrack)}
    const old=streamRef.current?.getVideoTracks()[0];
    if(streamRef.current&&old){streamRef.current.removeTrack(old);old.stop()}
    streamRef.current?.addTrack(newTrack);facingRef.current=next;
    if(localVideo.current)localVideo.current.srcObject=streamRef.current;
  }catch(e){alert('Не удалось переключить камеру: '+e.message)}
}
if(invite&&!call)return <div className="call-overlay incoming"><div className="call-card"><div className="call-avatar">{invite.caller.username[0].toUpperCase()}</div><h2>{invite.caller.username}</h2><p>Входящий {invite.mode==='video'?'видеозвонок':'аудиозвонок'}</p><div className="call-actions"><button className="call-decline" onClick={reject}>✕</button><button className="call-accept" onClick={accept}><Icon name={invite.mode==='video'?'video':'phone'} size={24}/></button></div></div></div>;
if(!call)return null;
return <div className="call-overlay active-call"><div className="call-stage"><div className="remote-grid" ref={remoteGrid}></div>{call.mode==='video'&&<video className="local-video" ref={localVideo} autoPlay muted playsInline/>}<div className="call-title"><b>{call.chat_name||chat?.name}</b><span>{status}</span></div><div className="call-controls"><button className={muted?'off':''} onClick={toggleMute}><Icon name="mic" size={22}/></button>{call.mode==='video'&&<><button className={cameraOff?'off':''} onClick={toggleCamera}><Icon name="camera" size={22}/></button><button onClick={switchCamera} title="Переключить камеру"><Icon name="switch" size={22}/></button></>}<button className="hangup" onClick={hangup}><Icon name="hangup" size={22}/></button></div></div></div>
}



function StorageModal({close}){
 const[items,setItems]=useState([]),[parent,setParent]=useState(null),[path,setPath]=useState([]),[busy,setBusy]=useState(false),[newFolder,setNewFolder]=useState('');
 const uploadRef=useRef(),listRef=useRef();
 const load=async(id=parent)=>{setBusy(true);try{const r=await api(`/api/storage${id?`?parent_id=${id}`:''}`);setItems(r.items||[])}catch(e){alert(e.message)}finally{setBusy(false)}};
 useEffect(()=>{load(null)},[]);
 const enter=async item=>{if(!item.is_folder)return;setPath(p=>[...p,{id:item.id,name:item.name}]);setParent(item.id);await load(item.id)};
 const up=async()=>{const next=path.slice(0,-1),id=next.length?next[next.length-1].id:null;setPath(next);setParent(id);await load(id)};
 const createFolder=async()=>{const name=newFolder.trim();if(!name)return;try{await api('/api/storage/folders',{method:'POST',body:JSON.stringify({name,parent_id:parent})});setNewFolder('');await load()}catch(e){alert(e.message)}};
 const upload=async files=>{if(!files?.length)return;const data=new FormData();[...files].forEach(f=>data.append('files',f));if(parent!==null)data.append('parent_id',String(parent));setBusy(true);try{await api('/api/storage/upload',{method:'POST',body:data});await load()}catch(e){alert(e.message)}finally{setBusy(false);if(uploadRef.current)uploadRef.current.value=''}};
 const rename=async item=>{const name=prompt('Новое имя',item.name);if(!name||name===item.name)return;try{await api(`/api/storage/${item.id}`,{method:'PATCH',body:JSON.stringify({name})});await load()}catch(e){alert(e.message)}};
 const remove=async item=>{if(!confirm(`Удалить «${item.name}»?`))return;try{await api(`/api/storage/${item.id}`,{method:'DELETE'});await load()}catch(e){alert(e.message)}};
 const share=async item=>{try{const r=await api(`/api/storage/${item.id}/share`,{method:'POST',body:'{}'});const absolute=new URL(r.share_url,window.location.origin).href;await navigator.clipboard?.writeText(absolute).catch(()=>{});prompt('Ссылка создана',absolute)}catch(e){alert(e.message)}};
 const download=async item=>{if(item.is_folder)return enter(item);try{const r=await fetch(API+item.download_url,{headers:{Authorization:'Bearer '+localStorage.token}});if(!r.ok)throw new Error('Не удалось скачать файл');const b=await r.blob(),u=URL.createObjectURL(b),a=document.createElement('a');a.href=u;a.download=item.name;a.click();setTimeout(()=>URL.revokeObjectURL(u),1000)}catch(e){alert(e.message)}};
 const size=n=>n<1024?'':n<1048576?`${Math.round(n/1024)} КБ`:`${(n/1048576).toFixed(1)} МБ`;
 return <div className="modal storage-modal" onPointerDown={close}><div className="storage-card glass-card" onPointerDown={e=>e.stopPropagation()}>
   <div className="storage-head"><div><h3>Личное хранилище</h3><small>{path.length?'Мой диск / '+path.map(x=>x.name).join(' / '):'Мой диск'}</small></div><button onClick={close}>×</button></div>
   <div className="storage-toolbar">{path.length>0&&<button onClick={up}>← Назад</button>}<label className="storage-upload">Загрузить<input ref={uploadRef} hidden type="file" multiple onChange={e=>upload(e.target.files)}/></label><div className="storage-new-folder"><input value={newFolder} onChange={e=>setNewFolder(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')createFolder()}} placeholder="Новая папка"/><button onClick={createFolder}>＋</button></div></div>
   <div className="storage-list" ref={listRef}>{busy&&<div className="storage-empty">Загрузка…</div>}{!busy&&!items.length&&<div className="storage-empty">Папка пуста</div>}{items.map(item=><div className="storage-row" key={item.id}>
     <button className="storage-main" onDoubleClick={()=>download(item)} onClick={()=>item.is_folder&&enter(item)}><span className="storage-icon">{item.is_folder?'📁':'📄'}</span><span><b>{item.name}</b><small>{item.is_folder?'Папка':size(item.size_bytes)}</small></span></button>
     <div className="storage-actions">{!item.is_folder&&<button title="Скачать" onClick={()=>download(item)}>↓</button>}<button title="Создать ссылку" onClick={()=>share(item)}>↗</button><button title="Переименовать" onClick={()=>rename(item)}>✎</button><button className="danger" title="Удалить" onClick={()=>remove(item)}>×</button></div>
   </div>)}</div>
 </div></div>
}



function MobileFilePreview({item,blobUrl,mimeType,busy,error,onClose,onDownload}){
 const isImage=(mimeType||'').startsWith('image/');
 const isVideo=(mimeType||'').startsWith('video/');
 const isAudio=(mimeType||'').startsWith('audio/');
 const isPdf=mimeType==='application/pdf'||String(item?.name||'').toLowerCase().endsWith('.pdf');
 return <div className="mobile-file-preview" role="dialog" aria-modal="true">
   <header className="mobile-file-preview-head">
     <button className="mobile-file-preview-close" onPointerDown={e=>{e.preventDefault();e.stopPropagation()}} onClick={e=>{e.preventDefault();e.stopPropagation();onClose()}} aria-label="Закрыть">‹</button>
     <div><b>{item?.name||'Файл'}</b><small>Просмотр файла</small></div>
     <button className="mobile-file-preview-download" onClick={onDownload} aria-label="Скачать"><Icon name="download" size={21}/></button>
   </header>
   <div className="mobile-file-preview-body">
     {busy&&<div className="mobile-file-preview-state">Загрузка…</div>}
     {!busy&&error&&<div className="mobile-file-preview-state error"><b>Не удалось открыть файл</b><span>{error}</span><button onClick={onDownload}>Скачать файл</button></div>}
     {!busy&&!error&&blobUrl&&isImage&&<img src={blobUrl} alt={item?.name||''}/>} 
     {!busy&&!error&&blobUrl&&isVideo&&<video src={blobUrl} controls playsInline autoPlay/>}
     {!busy&&!error&&blobUrl&&isAudio&&<audio src={blobUrl} controls autoPlay/>}
     {!busy&&!error&&blobUrl&&isPdf&&<iframe title={item?.name||'PDF'} src={blobUrl}/>} 
     {!busy&&!error&&blobUrl&&!isImage&&!isVideo&&!isAudio&&!isPdf&&<div className="mobile-file-preview-state"><Icon name="paperclip" size={38}/><b>Предпросмотр недоступен</b><span>Файл можно скачать на устройство.</span><button onClick={onDownload}>Скачать</button></div>}
   </div>
 </div>
}

function MobileDisk({onBack}){
 const savedDisk=(()=>{try{return JSON.parse(sessionStorage.getItem('workspace.mobileDisk')||'{}')}catch{return {}}})();
 const[items,setItems]=useState([]),[parent,setParent]=useState(savedDisk.parent??null),[path,setPath]=useState(Array.isArray(savedDisk.path)?savedDisk.path:[]),[busy,setBusy]=useState(true),[error,setError]=useState(''),[usage,setUsage]=useState({used:0,quota:10*1024*1024*1024,percent:0});
 const[preview,setPreview]=useState(null),[previewUrl,setPreviewUrl]=useState(''),[previewMime,setPreviewMime]=useState(''),[previewBusy,setPreviewBusy]=useState(false),[previewError,setPreviewError]=useState('');
 const uploadRef=useRef(),listRef=useRef(),savedScrollRef=useRef(Number(savedDisk.scroll)||0);
 const load=async(id=null)=>{setBusy(true);setError('');try{const r=await api(`/api/storage${id!==null?`?parent_id=${id}`:''}`);setItems(r.items||[]);setUsage({used:Number(r.used_bytes)||0,quota:Number(r.quota_bytes)||10*1024*1024*1024,percent:Number(r.usage_percent)||0})}catch(e){setError(e.message||'Не удалось загрузить диск')}finally{setBusy(false)}};
 useEffect(()=>{load(null)},[]);
 useEffect(()=>()=>{if(previewUrl)URL.revokeObjectURL(previewUrl)},[previewUrl]);
 useEffect(()=>{sessionStorage.setItem('workspace.mobileDisk',JSON.stringify({parent,path,scroll:listRef.current?.scrollTop||savedScrollRef.current||0}))},[parent,path,items]);
 const rememberScroll=()=>{const scroll=listRef.current?.scrollTop||0;savedScrollRef.current=scroll;sessionStorage.setItem('workspace.mobileDisk',JSON.stringify({parent,path,scroll}))};
 const enter=async item=>{if(!item.is_folder)return;rememberScroll();const nextPath=[...path,{id:item.id,name:item.name}];setPath(nextPath);setParent(item.id);sessionStorage.setItem('workspace.mobileDisk',JSON.stringify({parent:item.id,path:nextPath,scroll:0}));await load(item.id);requestAnimationFrame(()=>{if(listRef.current)listRef.current.scrollTop=0})};
 const up=async()=>{rememberScroll();const next=path.slice(0,-1),id=next.length?next[next.length-1].id:null;setPath(next);setParent(id);sessionStorage.setItem('workspace.mobileDisk',JSON.stringify({parent:id,path:next,scroll:0}));await load(id);requestAnimationFrame(()=>{if(listRef.current)listRef.current.scrollTop=0})};
 const createFolder=async()=>{const name=prompt('Название новой папки');if(!name?.trim())return;try{await api('/api/storage/folders',{method:'POST',body:JSON.stringify({name:name.trim(),parent_id:parent})});await load(parent)}catch(e){alert(e.message)}};
 const upload=async files=>{if(!files?.length)return;const data=new FormData();[...files].forEach(f=>data.append('files',f));if(parent!==null)data.append('parent_id',String(parent));setBusy(true);try{await api('/api/storage/upload',{method:'POST',body:data});await load(parent)}catch(e){setError(e.message||'Не удалось загрузить файлы')}finally{setBusy(false);if(uploadRef.current)uploadRef.current.value=''}};
 const fetchBlob=async item=>{const r=await fetch(API+item.download_url,{headers:{Authorization:'Bearer '+localStorage.token}});if(!r.ok)throw new Error('Не удалось открыть файл');return r.blob()};
 const download=async item=>{try{const b=await fetchBlob(item),u=URL.createObjectURL(b),a=document.createElement('a');a.href=u;a.download=item.name;a.click();setTimeout(()=>URL.revokeObjectURL(u),1000)}catch(e){alert(e.message)}};
 const openPreview=async item=>{rememberScroll();sessionStorage.setItem('workspace.activeSection','cloud');setPreview(item);setPreviewBusy(true);setPreviewError('');if(previewUrl){URL.revokeObjectURL(previewUrl);setPreviewUrl('')}try{const blob=await fetchBlob(item);setPreviewMime(blob.type||item.mime_type||'');setPreviewUrl(URL.createObjectURL(blob))}catch(e){setPreviewError(e.message||'Не удалось открыть файл')}finally{setPreviewBusy(false)}};
 const closePreview=()=>{sessionStorage.setItem('workspace.activeSection','cloud');sessionStorage.setItem('workspace.mobileDisk',JSON.stringify({parent,path,scroll:savedScrollRef.current||0}));setPreview(null);setPreviewError('');setPreviewBusy(false);if(previewUrl){URL.revokeObjectURL(previewUrl);setPreviewUrl('')}requestAnimationFrame(()=>requestAnimationFrame(()=>{if(listRef.current)listRef.current.scrollTop=savedScrollRef.current}))};
 const size=n=>!n?'0 Б':n<1048576?`${Math.max(1,Math.round(n/1024))} КБ`:n<1073741824?`${(n/1048576).toFixed(1)} МБ`:`${(n/1073741824).toFixed(1)} ГБ`;
 return <section className="mobile-disk-screen">
   <header className="mobile-disk-header"><div><small>{path.length?'Мой диск / '+path.map(x=>x.name).join(' / '):'Igorson Workspace'}</small><h1>{path.length?path[path.length-1].name:'Диск'}</h1></div><div className="mobile-disk-actions"><button onClick={createFolder} aria-label="Новая папка"><Icon name="folder" size={21}/></button><button onClick={()=>uploadRef.current?.click()} aria-label="Загрузить"><span style={{fontSize:28,lineHeight:1}}>＋</span></button></div><input ref={uploadRef} hidden type="file" multiple onChange={e=>upload(e.target.files)}/></header>
   <div className="mobile-disk-usage"><div className="mobile-disk-usage-line"><b>{Math.round(usage.percent)}%</b><span>{size(usage.used)} из {size(usage.quota)}</span></div><div className="mobile-disk-usage-track"><i style={{width:`${Math.min(100,Math.max(0,usage.percent))}%`}}/></div></div>
   {path.length>0&&<button className="mobile-disk-back" onClick={up}>‹ Назад</button>}
   <div className="mobile-disk-list" ref={listRef} onScroll={rememberScroll}>
     {busy&&<div className="mobile-disk-state">Загрузка…</div>}
     {!busy&&error&&<div className="mobile-disk-state error"><b>Не удалось открыть диск</b><span>{error}</span><button onClick={()=>load(parent)}>Повторить</button></div>}
     {!busy&&!error&&!items.length&&<div className="mobile-disk-state"><Icon name="cloud" size={34}/><b>Диск пуст</b><span>Создайте папку или загрузите файлы.</span></div>}
     {!busy&&!error&&items.map(item=><button className="mobile-disk-row" key={item.id} onClick={()=>item.is_folder?enter(item):openPreview(item)}><span className={'mobile-disk-icon '+(item.is_folder?'folder':'file')}><Icon name={item.is_folder?'folder':'paperclip'} size={22}/></span><span className="mobile-disk-copy"><b>{item.name}</b><small>{item.is_folder?'Папка':size(item.size_bytes)}</small></span><span className="mobile-disk-chevron">›</span></button>)}
   </div>
   {preview&&<MobileFilePreview item={preview} blobUrl={previewUrl} mimeType={previewMime} busy={previewBusy} error={previewError} onClose={closePreview} onDownload={()=>download(preview)}/>} 
 </section>
}

function WorkspacePanel({section,user,onOpenApp,onEditApp,onBack}){
  if(section==='cloud')return window.matchMedia('(max-width:900px), (hover:none) and (pointer:coarse)').matches?<MobileDisk onBack={onBack}/>:<CloudWorkspace onBack={onBack}/>;
  if(section==='apps'){
    const source=Array.isArray(user.home_links)?user.home_links:[];
    const saved=source.map((app,i)=>app&&app.url?{...app,_slot:i}:null).filter(Boolean);
    const firstEmpty=Math.max(0,source.findIndex(app=>!app||!app.url));
    const apps=[...saved,null];
    return <section className="desktop-workspace-panel apps-workspace"><header className="workspace-header"><div><small>Igorson Workspace</small><h1>Приложения</h1></div><button className="workspace-back" onClick={onBack}>Вернуться к чатам</button></header><div className="apps-grid">{apps.map((app,i)=>app?<button className="app-tile" key={`${app._slot}-${app.url}`} onClick={()=>onOpenApp({title:app.title||app.name||'Приложение',url:app.url})}><span>{(app.title||app.name||'A')[0].toUpperCase()}</span><div><b>{app.title||app.name}</b><small>{String(app.url||'').replace(/^https?:\/\//,'').replace(/\/$/,'')}</small></div><i>↗</i></button>:<button className="app-tile empty-app" key="add-app" onClick={()=>onEditApp(firstEmpty<0?source.length:firstEmpty)}><span>＋</span><div><b>Добавить приложение</b><small>Сайт или веб-сервис</small></div></button>)}</div></section>
  }
  return <section className="desktop-workspace-panel apps-workspace"><header className="workspace-header"><div><small>Igorson Workspace</small><h1>Избранное</h1></div><button className="workspace-back" onClick={onBack}>Вернуться к чатам</button></header><div className="workspace-empty"><Icon name="star" size={34}/><h2>Здесь появятся избранные материалы</h2><p>Сообщения, файлы и ссылки, которые вы отметите позже.</p></div></section>
}

function CloudWorkspace({onBack}){
 const[items,setItems]=useState([]),[parent,setParent]=useState(null),[path,setPath]=useState([]),[busy,setBusy]=useState(false),[query,setQuery]=useState(''),[mode,setMode]=useState('files'),[layout,setLayout]=useState('list'),[menuOpen,setMenuOpen]=useState(false),[usage,setUsage]=useState({used:0,quota:10*1024*1024*1024,percent:0});
 const uploadRef=useRef(),listRef=useRef();
 const load=async(id=parent)=>{setBusy(true);try{const r=await api(`/api/storage${id?`?parent_id=${id}`:''}`);setItems(r.items||[]);setUsage({used:r.used_bytes||0,quota:r.quota_bytes||10*1024*1024*1024,percent:r.usage_percent||0})}catch(e){alert(e.message)}finally{setBusy(false)}};
 useEffect(()=>{load(null)},[]);
 const enter=async item=>{if(!item.is_folder)return;setMode('files');setPath(p=>[...p,{id:item.id,name:item.name}]);setParent(item.id);await load(item.id)};
 const goRoot=async()=>{setPath([]);setParent(null);setMode('files');await load(null)};
 const up=async()=>{const next=path.slice(0,-1),id=next.length?next[next.length-1].id:null;setPath(next);setParent(id);await load(id)};
 const createFolder=async()=>{setMenuOpen(false);const name=prompt('Название новой папки');if(!name?.trim())return;try{await api('/api/storage/folders',{method:'POST',body:JSON.stringify({name:name.trim(),parent_id:parent})});await load()}catch(e){alert(e.message)}};
 const upload=async files=>{setMenuOpen(false);if(!files?.length)return;const data=new FormData();[...files].forEach(f=>data.append('files',f));if(parent!==null)data.append('parent_id',String(parent));setBusy(true);try{await api('/api/storage/upload',{method:'POST',body:data});await load()}catch(e){alert(e.message)}finally{setBusy(false);if(uploadRef.current)uploadRef.current.value=''}};
 const rename=async item=>{const name=prompt('Новое имя',item.name);if(!name||name===item.name)return;try{await api(`/api/storage/${item.id}`,{method:'PATCH',body:JSON.stringify({name})});await load()}catch(e){alert(e.message)}};
 const remove=async item=>{if(!confirm(`Удалить «${item.name}»?`))return;try{await api(`/api/storage/${item.id}`,{method:'DELETE'});await load()}catch(e){alert(e.message)}};
 const share=async item=>{try{const r=await api(`/api/storage/${item.id}/share`,{method:'POST',body:'{}'});const absolute=new URL(r.share_url,window.location.origin).href;await navigator.clipboard?.writeText(absolute).catch(()=>{});prompt('Ссылка создана на 30 дней',absolute)}catch(e){alert(e.message)}};
 const download=async item=>{if(item.is_folder)return enter(item);try{const r=await fetch(API+item.download_url,{headers:{Authorization:'Bearer '+localStorage.token}});if(!r.ok)throw new Error('Не удалось скачать файл');const b=await r.blob(),u=URL.createObjectURL(b),a=document.createElement('a');a.href=u;a.download=item.name;a.click();setTimeout(()=>URL.revokeObjectURL(u),1000)}catch(e){alert(e.message)}};
 const size=n=>!n?'—':n<1024?`${n} Б`:n<1048576?`${Math.max(1,Math.round(n/1024))} КБ`:n<1073741824?`${(n/1048576).toFixed(n>104857600?0:1)} МБ`:`${(n/1073741824).toFixed(1)} ГБ`;
 const date=x=>x?new Intl.DateTimeFormat('ru-RU',{day:'numeric',month:'short',year:new Date(x).getFullYear()!==new Date().getFullYear()?'numeric':undefined}).format(new Date(x)):'—';
 const typeLabel=item=>{if(item.is_folder)return'Папка';const ext=item.name.split('.').pop()?.toUpperCase();return ext&&ext.length<7?ext:'Файл'};
 const category=item=>{const mime=item.mime_type||'';if(mime.startsWith('image/'))return'images';if(mime.startsWith('video/'))return'videos';if(/pdf|word|excel|sheet|text|dwg|dxf/i.test(mime+' '+item.name))return'documents';if(/zip|rar|7z|tar|gzip/i.test(mime+' '+item.name))return'archive';return'other'};
 const visible=items.filter(x=>x.name.toLowerCase().includes(query.toLowerCase())).filter(x=>{
   if(mode==='files'||mode==='recent')return true;
   if(['documents','images','videos','archive'].includes(mode))return !x.is_folder&&category(x)===mode;
   return false;
 });
 const FIcon=({name,size=22})=>{const p={search:<><circle cx="11" cy="11" r="7"/><path d="m20 20-4.2-4.2"/></>,plus:<path d="M12 5v14M5 12h14"/>,more:<><circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/></>,back:<path d="m15 18-6-6 6-6"/>,grid:<><rect x="4" y="4" width="6" height="6" rx="1"/><rect x="14" y="4" width="6" height="6" rx="1"/><rect x="4" y="14" width="6" height="6" rx="1"/><rect x="14" y="14" width="6" height="6" rx="1"/></>,list:<><path d="M8 6h12M8 12h12M8 18h12"/><circle cx="4" cy="6" r="1"/><circle cx="4" cy="12" r="1"/><circle cx="4" cy="18" r="1"/></>,clock:<><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,link:<><path d="M10 13a5 5 0 0 0 7.5.5l2-2a5 5 0 0 0-7-7l-1.1 1.1"/><path d="M14 11a5 5 0 0 0-7.5-.5l-2 2a5 5 0 0 0 7 7l1.1-1.1"/></>,trash:<><path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13"/><path d="M10 11v5M14 11v5"/></>,upload:<><path d="M12 16V4M7 9l5-5 5 5"/><path d="M5 20h14"/></>,folder:<path d="M3 7h7l2 2h9v10H3Z"/>,download:<><path d="M12 4v11M7 11l5 5 5-5"/><path d="M5 20h14"/></>,edit:<><path d="m4 20 4.5-1 10-10-3.5-3.5-10 10L4 20Z"/><path d="m13.5 7 3.5 3.5"/></>,star:<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9L12 3Z"/>,image:<><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-5-5L5 20"/></>,video:<><rect x="3" y="5" width="14" height="14" rx="2"/><path d="m17 10 4-3v10l-4-3Z"/></>,doc:<><path d="M6 3h8l4 4v14H6Z"/><path d="M14 3v5h5M9 13h6M9 17h6"/></>,archive:<><path d="M4 5h16v4H4ZM6 9h12v11H6Z"/><path d="M10 13h4"/></>};return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">{p[name]}</svg>};
 const fileGlyph=item=>item.is_folder?'folder':category(item)==='images'?'image':category(item)==='videos'?'video':category(item)==='archive'?'archive':'doc';
 const nav=[['recent','Недавние','clock'],['shared','Общие ссылки','link'],['favorites','Избранное','star'],['trash','Корзина','trash']];
 const cats=[['files','Все файлы','folder'],['documents','Документы','doc'],['images','Фото','image'],['videos','Видео','video'],['archive','Архивы','archive']];
 return <section className="desktop-workspace-panel files-v2">
   <aside className="files-v2-sidebar">
     <div className="files-v2-brand"><span><FIcon name="folder" size={25}/></span><b>Files</b></div>
     <nav className="files-v2-nav">{nav.map(([id,label,icon])=><button key={id} className={mode===id?'active':''} onClick={()=>setMode(id)}><FIcon name={icon}/><span>{label}</span></button>)}</nav>
     <div className="files-v2-section-label">Библиотека</div>
     <nav className="files-v2-nav">{cats.map(([id,label,icon])=><button key={id} className={mode===id?'active':''} onClick={()=>{setMode(id);if(id==='files'&&!path.length)load(parent)}}><FIcon name={icon}/><span>{label}</span></button>)}</nav>
     <div className="files-v2-usage"><div className="files-v2-usage-top"><b>{Math.round(usage.percent)}%</b><span>{size(usage.used)} из {size(usage.quota)}</span></div><div className="files-v2-progress"><i style={{width:`${Math.min(100,usage.percent)}%`}}/></div></div>
     <button className="files-v2-back" onClick={onBack}><FIcon name="back" size={19}/>К чатам</button>
   </aside>
   <main className="files-v2-main">
     <header className="files-v2-header">
       <div className="files-v2-title"><h1>{mode==='files'?(path.length?path[path.length-1].name:'Мои файлы'):nav.concat(cats).find(x=>x[0]===mode)?.[1]}</h1><p>{mode==='files'?(path.length?'Мой диск / '+path.map(x=>x.name).join(' / '):'Все ваши файлы и папки'):'Раздел Files'}</p></div>
       <div className="files-v2-tools"><label className="files-v2-search"><FIcon name="search" size={20}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Поиск"/></label><div className="files-v2-layout"><button className={layout==='list'?'active':''} onClick={()=>setLayout('list')}><FIcon name="list" size={20}/></button><button className={layout==='grid'?'active':''} onClick={()=>setLayout('grid')}><FIcon name="grid" size={19}/></button></div><div className="files-v2-create"><button className="files-v2-plus" onClick={()=>setMenuOpen(v=>!v)}><FIcon name="plus" size={22}/></button>{menuOpen&&<div className="files-v2-create-menu"><button onClick={createFolder}><FIcon name="folder" size={19}/>Новая папка</button><button onClick={()=>uploadRef.current?.click()}><FIcon name="upload" size={19}/>Загрузить файлы</button></div>}<input ref={uploadRef} hidden type="file" multiple onChange={e=>upload(e.target.files)}/></div></div>
     </header>
     {mode==='files'&&<div className="files-v2-breadcrumbs"><button onClick={goRoot}>Мой диск</button>{path.map((x,i)=><React.Fragment key={x.id}><span>/</span><button onClick={async()=>{const next=path.slice(0,i+1);setPath(next);setParent(x.id);await load(x.id)}}>{x.name}</button></React.Fragment>)}{path.length>0&&<button className="files-v2-up" onClick={up}><FIcon name="back" size={17}/>Назад</button>}</div>}
     <div className={`files-v2-content ${layout}`}>
       {busy&&<div className="files-v2-empty"><div className="files-v2-loader"/><b>Загружаем файлы</b></div>}
       {!busy&&['shared','favorites','trash'].includes(mode)&&<div className="files-v2-empty"><span><FIcon name={mode==='shared'?'link':mode==='favorites'?'star':'trash'} size={31}/></span><b>{mode==='shared'?'Общие ссылки':mode==='favorites'?'Избранное':'Корзина'}</b><p>{mode==='shared'?'Здесь появятся публичные ссылки на 30 дней.':mode==='favorites'?'Отмеченные файлы появятся здесь.':'Удалённые файлы будут храниться здесь.'}</p></div>}
       {!busy&&!['shared','favorites','trash'].includes(mode)&&!visible.length&&<div className="files-v2-empty"><span><FIcon name="folder" size={32}/></span><b>Здесь пока пусто</b><p>Создайте папку или загрузите файлы.</p></div>}
       {!busy&&!['shared','favorites','trash'].includes(mode)&&layout==='list'&&visible.map(item=><article className="files-v2-row" key={item.id} onDoubleClick={()=>download(item)}><button className={`files-v2-glyph ${fileGlyph(item)}`} onClick={()=>item.is_folder&&enter(item)}><FIcon name={fileGlyph(item)} size={24}/></button><button className="files-v2-file-copy" onClick={()=>item.is_folder&&enter(item)}><b>{item.name}</b><span>{typeLabel(item)} · {item.is_folder?'Папка':size(item.size_bytes)} · {date(item.updated_at||item.created_at)}</span></button><div className="files-v2-row-actions">{!item.is_folder&&<button title="Скачать" onClick={()=>download(item)}><FIcon name="download" size={18}/></button>}<button title="Создать ссылку" onClick={()=>share(item)}><FIcon name="link" size={18}/></button><button title="Переименовать" onClick={()=>rename(item)}><FIcon name="edit" size={18}/></button><button className="danger" title="Удалить" onClick={()=>remove(item)}><FIcon name="trash" size={18}/></button></div></article>)}
       {!busy&&!['shared','favorites','trash'].includes(mode)&&layout==='grid'&&visible.map(item=><article className="files-v2-tile" key={item.id} onDoubleClick={()=>download(item)}><button className={`files-v2-tile-icon ${fileGlyph(item)}`} onClick={()=>item.is_folder&&enter(item)}><FIcon name={fileGlyph(item)} size={31}/></button><button className="files-v2-tile-copy" onClick={()=>item.is_folder&&enter(item)}><b>{item.name}</b><span>{item.is_folder?'Папка':size(item.size_bytes)}</span></button><button className="files-v2-tile-more" onClick={()=>share(item)}><FIcon name="more" size={20}/></button></article>)}
     </div>
   </main>
 </section>
}

function SearchResults({query,kind,setKind,results,busy,onOpenMessage,onOpenChat,onOpenUser,historyItems,onHistory}){
 const filters=[['all','Все'],['users','Пользователи'],['chats','Чаты'],['messages','Сообщения'],['images','Фото'],['files','Файлы'],['links','Ссылки']];
 const empty=!busy&&query.trim()&&!Object.values(results||{}).some(x=>x?.length);
 const ResultMessage=({m,label})=><button className="search-result" onClick={()=>onOpenMessage(m)}><span className="search-result-icon">{label}</span><span><b>{m.chat?.name||'Чат'}</b><small>{m.text||m.file_name||'Вложение'} · {moscowTime(m.created_at)}</small></span></button>;
 return <div className="search-panel">
   <div className="search-filters">{filters.map(([id,label])=><button key={id} className={kind===id?'active':''} onClick={()=>setKind(id)}>{label}</button>)}</div>
   {!query.trim()&&historyItems?.length>0&&<div className="search-section"><div className="search-section-title">Недавние запросы</div>{historyItems.map(x=><button className="recent-search" key={x} onClick={()=>onHistory(x)}>⌕ {x}</button>)}</div>}
   {busy&&<div className="search-state">Поиск…</div>}
   {results?.users?.length>0&&<div className="search-section"><div className="search-section-title">Пользователи</div>{results.users.map(u=><button className="search-result" key={'u'+u.id} onClick={()=>onOpenUser(u)}><Avatar user={u}/><span><b>{u.display_name||u.username}</b><small>@{u.username} · {lastSeenText(u)}</small></span></button>)}</div>}
   {results?.chats?.length>0&&<div className="search-section"><div className="search-section-title">Чаты</div>{results.chats.map(c=><button className="search-result" key={'c'+c.id} onClick={()=>onOpenChat(c)}><Avatar user={c.is_group?{display_name:c.name,avatar_url:c.avatar_url}:c.members?.[0]} name={c.name}/><span><b>{c.name}</b><small>{c.last_message?.text||c.last_message?.file_name||'Нет сообщений'}</small></span></button>)}</div>}
   {results?.messages?.length>0&&<div className="search-section"><div className="search-section-title">Сообщения</div>{results.messages.map(m=><ResultMessage key={'m'+m.id} m={m} label="✉"/>)}</div>}
   {results?.images?.length>0&&<div className="search-section"><div className="search-section-title">Фото</div>{results.images.map(m=><ResultMessage key={'i'+m.id} m={m} label="▧"/>)}</div>}
   {results?.files?.length>0&&<div className="search-section"><div className="search-section-title">Файлы</div>{results.files.map(m=><ResultMessage key={'f'+m.id} m={m} label="⌑"/>)}</div>}
   {results?.links?.length>0&&<div className="search-section"><div className="search-section-title">Ссылки</div>{results.links.map(m=><ResultMessage key={'l'+m.id} m={m} label="↗"/>)}</div>}
   {empty&&<div className="search-state">Ничего не найдено</div>}
 </div>
}

function App(){const[activeSection,setActiveSection]=useState(()=>sessionStorage.getItem('workspace.activeSection')||'chats'),[user,setUser]=useState(null),[chats,setChats]=useState([]),[chat,setChat]=useState(null),[msgs,setMsgs]=useState([]),[text,setText]=useState(''),[showNew,setShowNew]=useState(false),[showProfile,setShowProfile]=useState(false),[showStorage,setShowStorage]=useState(false),[showInspector,setShowInspector]=useState(true),[embeddedApp,setEmbeddedApp]=useState(null),[homeLinkSlot,setHomeLinkSlot]=useState(null),[showGroupEdit,setShowGroupEdit]=useState(false),[quickLinkSlot,setQuickLinkSlot]=useState(null),[showAllQuickLinks,setShowAllQuickLinks]=useState(false),[showAttach,setShowAttach]=useState(false),[selectedFile,setSelectedFile]=useState(null),[mobileChat,setMobileChat]=useState(false),[mobileTab,setMobileTab]=useState('chat'),[pushInfo,setPushInfo]=useState(''),[sending,setSending]=useState(false),[shareUploading,setShareUploading]=useState(false),[invite,setInvite]=useState(null),[requestedCallId,setRequestedCallId]=useState(()=>new URLSearchParams(location.search).get('call')),[device,setDevice]=useState(()=>window.__INITIAL_DEVICE__||detectDevice()),[searchQuery,setSearchQuery]=useState(''),[searchKind,setSearchKind]=useState('all'),[searchResults,setSearchResults]=useState({}),[searchBusy,setSearchBusy]=useState(false),[searchActive,setSearchActive]=useState(false),[chatSearchOpen,setChatSearchOpen]=useState(false),[chatSearchQuery,setChatSearchQuery]=useState(''),[chatSearchResults,setChatSearchResults]=useState([]),[linkPastePending,setLinkPastePending]=useState(false),[manualLinkOpen,setManualLinkOpen]=useState(false),[manualLinkValue,setManualLinkValue]=useState(''),[manualLinkError,setManualLinkError]=useState(''),[searchHistory,setSearchHistory]=useState(()=>{try{return JSON.parse(localStorage.searchHistory||'[]')}catch{return[]}});const file=useRef(),imageFile=useRef(),shareFile=useRef(),bottom=useRef(),messagesRef=useRef(),composerRef=useRef(),searchInput=useRef(),wsRef=useRef(),activeChat=useRef(null),retry=useRef(null),seenCallEvents=useRef(new Set()),lastCallEvent=useRef(0),clipboardReadBusy=useRef(false),shareRequestSeq=useRef(0);
useEffect(()=>{sessionStorage.setItem('workspace.activeSection',activeSection)},[activeSection]);
useEffect(()=>{
  if(!showAttach)return;
  const closeOutside=e=>{
    const target=e.target;
    if(!(target instanceof Element))return;
    if(target.closest('.attach-menu-global')||target.closest('.attach'))return;
    setShowAttach(false);
  };
  const onKey=e=>{if(e.key==='Escape')setShowAttach(false)};
  document.addEventListener('pointerdown',closeOutside,true);
  document.addEventListener('touchstart',closeOutside,true);
  window.addEventListener('keydown',onKey);
  return()=>{
    document.removeEventListener('pointerdown',closeOutside,true);
    document.removeEventListener('touchstart',closeOutside,true);
    window.removeEventListener('keydown',onKey);
  };
},[showAttach]);
useEffect(()=>{
  if(!searchActive)return;
  const closeSearchOutside=e=>{
    const target=e.target;
    if(!(target instanceof Element))return;
    if(target.closest('.search-box')||target.closest('.search-panel'))return;
    closeGlobalSearch();
  };
  const onKey=e=>{if(e.key==='Escape')closeGlobalSearch()};
  document.addEventListener('pointerdown',closeSearchOutside,true);
  document.addEventListener('touchstart',closeSearchOutside,true);
  window.addEventListener('keydown',onKey);
  return()=>{
    document.removeEventListener('pointerdown',closeSearchOutside,true);
    document.removeEventListener('touchstart',closeSearchOutside,true);
    window.removeEventListener('keydown',onKey);
  };
},[searchActive]);
useEffect(()=>{if(localStorage.token)api('/api/me').then(setUser).catch(()=>localStorage.clear())},[]);
useEffect(()=>{
  if(!('serviceWorker' in navigator))return;
  let cancelled=false;
  (async()=>{
    try{
      const previous=localStorage.getItem('appVersion');
      if(previous!==APP_VERSION){
        for(const reg of await navigator.serviceWorker.getRegistrations())await reg.unregister();
        if('caches' in window)for(const key of await caches.keys())await caches.delete(key);
        localStorage.setItem('appVersion',APP_VERSION);
      }
      if(cancelled)return;
      const reg=await navigator.serviceWorker.register(`/sw.js?v=${encodeURIComponent(APP_VERSION)}`,{scope:'/',updateViaCache:'none'});
      await reg.update().catch(()=>{});
    }catch{}
  })();
  return()=>{cancelled=true};
},[]);
useEffect(()=>{let stableHeight=Math.max(window.innerHeight,window.visualViewport?.height||0);let raf=0;let settleTimer=0;const sync=()=>{cancelAnimationFrame(raf);raf=requestAnimationFrame(()=>{const d=detectDevice();setDevice(d);document.documentElement.dataset.device=d.type;document.documentElement.dataset.orientation=d.orientation;const vv=window.visualViewport;const active=document.activeElement;const editable=!!(active&&(['TEXTAREA','INPUT'].includes(active.tagName)||active.isContentEditable));const visibleHeight=vv?.height||window.innerHeight;const visibleTop=vv?.offsetTop||0;const visibleBottom=visibleTop+visibleHeight;if(!editable&&visibleHeight>stableHeight*.78)stableHeight=Math.max(stableHeight,visibleHeight,window.innerHeight);const keyboardDelta=Math.max(0,stableHeight-visibleHeight);const keyboardOpen=!!(d.type==='phone'&&editable&&keyboardDelta>80);const keyboardInset=keyboardOpen?Math.max(0,window.innerHeight-visibleBottom):0;const composer=document.querySelector('.composer-wrap');const composerHeight=Math.ceil(composer?.getBoundingClientRect().height||58);document.documentElement.dataset.keyboardOpen=keyboardOpen?'true':'false';document.documentElement.style.setProperty('--vv-height',`${visibleHeight}px`);document.documentElement.style.setProperty('--vv-top',`${visibleTop}px`);document.documentElement.style.setProperty('--vv-bottom',`${visibleBottom}px`);document.documentElement.style.setProperty('--keyboard-inset',`${keyboardInset}px`);document.documentElement.style.setProperty('--composer-height',`${composerHeight}px`);document.documentElement.style.setProperty('--app-height',`${stableHeight}px`);if(keyboardOpen){window.scrollTo(0,0);if(document.scrollingElement)document.scrollingElement.scrollTop=0;clearTimeout(settleTimer);settleTimer=window.setTimeout(()=>{window.scrollTo(0,0)},60)}})};sync();window.addEventListener('resize',sync);window.addEventListener('orientationchange',sync);window.addEventListener('focusin',sync,true);window.addEventListener('focusout',sync,true);window.visualViewport?.addEventListener('resize',sync);window.visualViewport?.addEventListener('scroll',sync);return()=>{cancelAnimationFrame(raf);clearTimeout(settleTimer);window.removeEventListener('resize',sync);window.removeEventListener('orientationchange',sync);window.removeEventListener('focusin',sync,true);window.removeEventListener('focusout',sync,true);window.visualViewport?.removeEventListener('resize',sync);window.visualViewport?.removeEventListener('scroll',sync)}},[]);

useEffect(()=>{
  if(!('serviceWorker'in navigator))return;
  const onMessage=e=>{const d=e.data||{};if(d.type==='OPEN_NOTIFICATION'){
    const id=d.callId||new URL(d.url||location.href,location.origin).searchParams.get('call');
    if(id)setRequestedCallId(id);
  }};
  navigator.serviceWorker.addEventListener('message',onMessage);
  return()=>navigator.serviceWorker.removeEventListener('message',onMessage)
},[]);
useEffect(()=>{
  const onVisible=()=>{if(document.visibilityState==='visible'){const id=new URLSearchParams(location.search).get('call');if(id)setRequestedCallId(id)}};
  document.addEventListener('visibilitychange',onVisible);window.addEventListener('focus',onVisible);
  return()=>{document.removeEventListener('visibilitychange',onVisible);window.removeEventListener('focus',onVisible)}
},[]);

function extractFileServiceLink(value){
  const raw=String(value||'').trim();
  if(!raw||raw.startsWith('{')||raw.startsWith('['))return null;
  const candidates=raw.split(/\s+/).filter(Boolean);
  for(const candidate of candidates){
    try{const u=new URL(candidate);if(u.protocol==='https:'&&u.hostname.toLowerCase()==='files.igorson.xyz')return u.href}catch{}
  }
  return null;
}
function handleComposerPaste(event){
  const pasted=event.clipboardData?.getData('text/plain')||'';
  const trimmed=pasted.trim();
  if(trimmed.startsWith('{')||trimmed.startsWith('[')){
    event.preventDefault();
    return;
  }
  if(localStorage.getItem('awaitingFileLink')==='1'){
    const link=extractFileServiceLink(pasted);
    if(!link){event.preventDefault();return}
    event.preventDefault();
    setText(current=>current.trimEnd()?`${current.trimEnd()} ${link}`:link);
    localStorage.removeItem('awaitingFileLink');
    setLinkPastePending(false);
  }
}
async function importCopiedFileLink(){
  if(localStorage.getItem('awaitingFileLink')!=='1'||clipboardReadBusy.current)return false;
  clipboardReadBusy.current=true;
  try{
    let raw='';
    if(navigator.clipboard?.readText){
      try{raw=await navigator.clipboard.readText()}catch{}
    }
    const copied=extractFileServiceLink(raw);
    if(!copied){
      setManualLinkError('');
      setManualLinkOpen(true);
      return false;
    }
    setText(current=>{
      if(current.includes(copied))return current;
      const clean=current.trimEnd();
      return clean?`${clean} ${copied}`:copied;
    });
    localStorage.removeItem('awaitingFileLink');
    setLinkPastePending(false);
    return true;
  }finally{clipboardReadBusy.current=false}
}
function closeManualLinkDialog(){
  setManualLinkOpen(false);
  setManualLinkValue('');
  setManualLinkError('');
  localStorage.removeItem('awaitingFileLink');
  setLinkPastePending(false);
}
function submitManualLink(){
  const copied=extractFileServiceLink(manualLinkValue);
  if(!copied){setManualLinkError('Вставьте ссылку вида https://files.igorson.xyz/…');return}
  setText(current=>{
    if(current.includes(copied))return current;
    const clean=current.trimEnd();
    return clean?`${clean} ${copied}`:copied;
  });
  localStorage.removeItem('awaitingFileLink');
  setLinkPastePending(false);
  setManualLinkOpen(false);
  setManualLinkValue('');
  setManualLinkError('');
}
useEffect(()=>{
  if(!linkPastePending)return;
  let timers=[];
  const attempt=()=>{if(document.visibilityState==='visible'){timers.forEach(clearTimeout);timers=[0,350,1000,2200].map(ms=>setTimeout(importCopiedFileLink,ms))}};
  document.addEventListener('visibilitychange',attempt);
  window.addEventListener('focus',attempt);
  window.addEventListener('pageshow',attempt);
  attempt();
  return()=>{timers.forEach(clearTimeout);document.removeEventListener('visibilitychange',attempt);window.removeEventListener('focus',attempt);window.removeEventListener('pageshow',attempt)}
},[linkPastePending]);
useEffect(()=>{activeChat.current=chat},[chat]);
useEffect(()=>{
  if(!user||!requestedCallId)return;
  let cancelled=false;
  api(`/api/calls/by-id/${encodeURIComponent(requestedCallId)}`).then(c=>{
    if(cancelled)return;
    if(c.caller.id===user.id||!isFreshCall(c)){
      closeCallNotifications();
      setInvite(null);setRequestedCallId(null);
      const u=new URL(location.href);u.searchParams.delete('call');history.replaceState(null,'',u.pathname+u.search);
      return;
    }
    setInvite(c);
    const target=chats.find(x=>x.id===c.chat_id);
    if(target)open(target);
  }).catch(()=>{
    if(!cancelled){closeCallNotifications();setInvite(null);setRequestedCallId(null);const u=new URL(location.href);u.searchParams.delete('call');history.replaceState(null,'',u.pathname+u.search)}
  });
  return()=>{cancelled=true}
},[user,requestedCallId,chats]);
useEffect(()=>{const el=messagesRef.current;if(!el)return;requestAnimationFrame(()=>{el.scrollTop=el.scrollHeight})},[msgs,chat?.id]);
useEffect(()=>{if(!user)return;loadChats();let stopped=false;const presencePingRef={current:null};function sendPing(){try{const w=wsRef.current;if(w&&w.readyState===WebSocket.OPEN)w.send(JSON.stringify({type:'ping'}))}catch{}}const connect=()=>{if(stopped)return;const proto=location.protocol==='https:'?'wss':'ws';const ws=new WebSocket(`${proto}://${location.host}/ws?token_q=${encodeURIComponent(localStorage.token)}`);wsRef.current=ws;ws.onopen=()=>{clearInterval(ws._heartbeat);ws._heartbeat=setInterval(()=>{if(ws.readyState===WebSocket.OPEN)ws.send(JSON.stringify({type:'ping'}))},20000);clearInterval(presencePingRef.current);presencePingRef.current=setInterval(sendPing,25000)};ws.onmessage=e=>{const p=JSON.parse(e.data);if(p.event_id){if(seenCallEvents.current.has(p.event_id))return;seenCallEvents.current.add(p.event_id);lastCallEvent.current=Math.max(lastCallEvent.current,p.event_id)}if(p.type==='message'){if(activeChat.current?.id===p.message.chat_id)setMsgs(m=>m.some(x=>x.id===p.message.id)?m.map(x=>x.id===p.message.id?p.message:x):[...m,p.message]);loadChats()}else if(p.type==='message_status'){setMsgs(m=>m.map(x=>x.id===p.message_id?{...x,status:p.status}:x))}else if(p.type==='presence'){setChats(cs=>cs.map(c=>({...c,members:c.members.map(m=>m.id===p.user.id?p.user:m)})));setChat(c=>c?({...c,members:c.members.map(m=>m.id===p.user.id?p.user:m)}):c)}else if(p.type==='call_invite'){if(isFreshCall(p.call)){setInvite(p.call);setRequestedCallId(p.call.call_id)}else closeCallNotifications()}else if(p.type.startsWith('call_')||p.type==='webrtc_signal'){window.__messengerCallEvent?.(p)}};ws.onclose=()=>{clearInterval(ws._heartbeat);if(!stopped)retry.current=setTimeout(connect,1200)}};connect();const poll=setInterval(()=>{loadChats();if(activeChat.current){loadMessages(activeChat.current.id);if(!activeChat.current.is_group){const oid=activeChat.current.members.find(m=>m.id!==user.id)?.id;if(oid)api(`/api/users/${oid}/presence`).then(p=>{setChat(c=>c?({...c,members:c.members.map(m=>m.id===p.id?p:m)}):c);setChats(cs=>cs.map(c=>({...c,members:c.members.map(m=>m.id===p.id?p:m)}))) }).catch(()=>{})}}},5000);api('/api/calls/active').then(calls=>{const c=calls.find(x=>x.caller.id!==user.id&&isFreshCall(x)&&!(x.declined_ids||[]).includes(user.id));if(c){setInvite(c);setRequestedCallId(c.call_id)}else{setInvite(null);closeCallNotifications()}}).catch(()=>{});function onVisibility(){if(document.visibilityState==='visible')sendPing()}function onFocus(){sendPing()}function onPageShow(){sendPing()}document.addEventListener('visibilitychange',onVisibility);window.addEventListener('focus',onFocus);window.addEventListener('pageshow',onPageShow);return()=>{stopped=true;clearInterval(poll);clearTimeout(retry.current);clearInterval(presencePingRef.current);wsRef.current?.close();document.removeEventListener('visibilitychange',onVisibility);window.removeEventListener('focus',onFocus);window.removeEventListener('pageshow',onPageShow)}},[user]);
useEffect(()=>{
  if(!user)return;let stopped=false,busy=false;
  const tick=async()=>{if(stopped||busy)return;busy=true;try{
    const r=await api(`/api/calls/events?after=${lastCallEvent.current}`);
    for(const p of r.events||[]){
      if(seenCallEvents.current.has(p.event_id))continue;
      seenCallEvents.current.add(p.event_id);lastCallEvent.current=Math.max(lastCallEvent.current,p.event_id||0);
      if(p.type==='call_invite'){setInvite(p.call);setRequestedCallId(p.call.call_id)}
      else if(p.type.startsWith('call_')||p.type==='webrtc_signal')window.__messengerCallEvent?.(p);
    }
  }catch{}finally{busy=false}};
  tick();const timer=setInterval(tick,650);return()=>{stopped=true;clearInterval(timer)}
},[user]);
useEffect(()=>{const q=searchQuery.trim();if(!q){setSearchResults({});setSearchBusy(false);return}setSearchBusy(true);const t=setTimeout(async()=>{try{const r=await api(`/api/search?q=${encodeURIComponent(q)}&kind=${encodeURIComponent(searchKind)}`);setSearchResults(r);const next=[q,...searchHistory.filter(x=>x!==q)].slice(0,8);setSearchHistory(next);localStorage.searchHistory=JSON.stringify(next)}catch{}finally{setSearchBusy(false)}},280);return()=>clearTimeout(t)},[searchQuery,searchKind]);
useEffect(()=>{const q=chatSearchQuery.trim();if(!chat||!q){setChatSearchResults([]);return}const t=setTimeout(async()=>{try{const r=await api(`/api/search?q=${encodeURIComponent(q)}&kind=messages&chat_id=${chat.id}`);setChatSearchResults(r.messages||[])}catch{}},250);return()=>clearTimeout(t)},[chatSearchQuery,chat?.id]);
async function openSearchUser(u){try{const c=await api('/api/chats',{method:'POST',body:JSON.stringify({name:null,usernames:[u.username]})});setSearchQuery('');setSearchResults({});await loadChats();open(c)}catch(e){alert(e.message)}}
async function openSearchMessage(m){let c=chats.find(x=>x.id===m.chat.id)||m.chat;setSearchQuery('');setSearchResults({});await open(c);setTimeout(()=>document.getElementById(`message-${m.id}`)?.scrollIntoView({behavior:'smooth',block:'center'}),350)}
function closeGlobalSearch(){setSearchActive(false);setSearchQuery('');setSearchResults({});searchInput.current?.blur();document.documentElement.dataset.searchActive='false';document.documentElement.style.setProperty('--app-height',`${window.visualViewport?.height||window.innerHeight}px`)}
async function loadChats(){try{setChats(await api('/api/chats'))}catch{}}
async function loadMessages(id){try{setMsgs(await api(`/api/chats/${id}/messages`));loadChats()}catch{}}
function clearComposerState(){
  shareRequestSeq.current+=1;
  setText('');
  setSelectedFile(null);
  setShowAttach(false);
  setShareUploading(false);
  setManualLinkOpen(false);
  setManualLinkValue('');
  setManualLinkError('');
  localStorage.removeItem('awaitingFileLink');
  setLinkPastePending(false);
  if(file.current)file.current.value='';
  if(imageFile.current)imageFile.current.value='';
  if(shareFile.current)shareFile.current.value='';
}
async function open(c){clearComposerState();setMobileTab('chat');setChat(c);setMobileChat(true);await loadMessages(c.id);const u=new URL(location.href);u.searchParams.set('chat',c.id);history.replaceState(null,'',u.pathname+u.search)}
function closeChat(){clearComposerState();setMobileTab('chat');setMobileChat(false);setChat(null);setMsgs([]);activeChat.current=null;setChatSearchOpen(false);setChatSearchQuery('');const u=new URL(location.href);u.searchParams.delete('chat');u.searchParams.delete('call');history.replaceState(null,'',u.pathname+u.search)}
useEffect(()=>{if(!user||!chats.length)return;const id=Number(new URLSearchParams(location.search).get('chat'));if(id&&!chat){const c=chats.find(x=>x.id===id);if(c)open(c)}},[user,chats]);
async function createShareLink(selectedFiles){
  const selected=Array.from(selectedFiles||[]);
  if(!selected.length||shareUploading)return;
  const requestId=++shareRequestSeq.current;
  const targetChatId=activeChat.current?.id;
  setShowAttach(false);
  setShareUploading(true);
  try{
    const data=new FormData();
    selected.forEach(item=>data.append('files',item));
    const r=await api('/api/share-upload',{method:'POST',body:data});
    if(!r?.share_url)throw new Error('Сервер не вернул ссылку');
    if(requestId!==shareRequestSeq.current||activeChat.current?.id!==targetChatId)return;
    setText(current=>{const prefix=current.trimEnd();return prefix?`${prefix} ${r.share_url}`:r.share_url});
    requestAnimationFrame(()=>document.querySelector('.composer textarea')?.focus());
  }catch(e){
    if(requestId===shareRequestSeq.current)alert(e.message||'Не удалось создать ссылку');
  }finally{
    if(requestId===shareRequestSeq.current)setShareUploading(false);
    if(shareFile.current)shareFile.current.value='';
  }
}
async function send(){if(!chat||sending)return;setSending(true);try{let attachment={};if(selectedFile){const f=new FormData();f.append('file',selectedFile);attachment=await api('/api/upload',{method:'POST',body:f});setSelectedFile(null);if(file.current)file.current.value='';if(imageFile.current)imageFile.current.value=''}if(!text.trim()&&!attachment.file_url)return;const sent=await api(`/api/chats/${chat.id}/messages`,{method:'POST',body:JSON.stringify({text,...attachment})});setMsgs(m=>m.some(x=>x.id===sent.id)?m:[...m,sent]);setText('');loadChats()}catch(e){alert(e.message)}finally{setSending(false)}}
async function enablePush(){setPushInfo('Проверка…');try{if(!('serviceWorker'in navigator)||!('PushManager'in window))throw new Error('Push-уведомления не поддерживаются этим браузером');if(!window.isSecureContext)throw new Error('Нужен HTTPS-домен');if(!isStandalone())throw new Error('Сначала добавьте сайт на экран «Домой» и откройте его с иконки');const reg=await navigator.serviceWorker.register('/sw.js',{scope:'/'});await navigator.serviceWorker.ready;const perm=await Notification.requestPermission();if(perm!=='granted')throw new Error('Разрешение на уведомления не выдано');const{key,configured}=await api('/api/push/public-key');if(!configured||!key)throw new Error('На сервере не настроены VAPID-ключи');let sub=await reg.pushManager.getSubscription();if(sub)await sub.unsubscribe();sub=await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:b64ToArray(key)});await api('/api/push/subscribe',{method:'POST',body:JSON.stringify(sub.toJSON())});setPushInfo('Уведомления включены')}catch(e){setPushInfo(e.message)}}
async function testPush(){try{await api('/api/push/test',{method:'POST',body:'{}'});setPushInfo('Тест отправлен')}catch(e){setPushInfo(e.message)}}
useEffect(()=>{const el=composerRef.current;if(!el)return;const apply=()=>{const h=Math.ceil(el.getBoundingClientRect().height||58);document.documentElement.style.setProperty('--mobile-composer-height',`${h}px`)};apply();const ro=typeof ResizeObserver!=='undefined'?new ResizeObserver(apply):null;ro?.observe(el);window.addEventListener('resize',apply);return()=>{ro?.disconnect();window.removeEventListener('resize',apply)}},[chat,mobileTab,selectedFile,shareUploading,text]);
if(user?.id)localStorage.userId=String(user.id);if(!user)return <Auth done={setUser}/>;
const other=chat&&!chat.is_group?chat.members.find(m=>m.id!==user.id):null;
const composerView=chat?<footer ref={composerRef} className="composer-wrap"><div className="composer"><button className="attach" disabled={chat.can_write===false} onClick={()=>setMobileTab('attachments')}><Icon name="paperclip" size={22}/></button>{selectedFile&&<div className="selected-file"><span>{selectedFile.name}</span><button onClick={()=>setSelectedFile(null)}>×</button></div>}{shareUploading&&<div className="paste-link-hint share-uploading"><span>Файлы загружаются</span><b>Создаём одну ссылку…</b></div>}<textarea rows="1" disabled={chat.can_write===false} value={text} onChange={e=>setText(e.target.value)} onPaste={handleComposerPaste} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();send()}}} placeholder={chat.can_write===false?"Гостям отправка сообщений недоступна":"Сообщение"}/><button className="send" onClick={send} disabled={sending||shareUploading||chat.can_write===false}><Icon name="send" size={20}/></button></div></footer>:null;
return <div className={`app device-${device.type} orientation-${device.orientation} ${device.standalone?'standalone':''} ${mobileChat?'mobile-chat-open':''} ${searchActive?'search-active':''} ${showGroupEdit?'group-edit-open':''} ${showInspector?'inspector-open':''}`}><nav className="desktop-rail"><button className="rail-avatar" onClick={()=>setShowProfile(true)}><Avatar user={user} className="avatar"/></button><div className="rail-nav"><button className={activeSection==='chats'?'active':''} title="Чаты" onClick={()=>setActiveSection('chats')}><span className="rail-chat-dot"/></button><button className={activeSection==='cloud'?'active':''} title="Моё пространство" onClick={()=>setActiveSection('cloud')}><Icon name="cloud" size={24}/></button><button className={activeSection==='apps'?'active':''} title="Приложения" onClick={()=>setActiveSection('apps')}><Icon name="apps" size={24}/></button><button className={activeSection==='favorites'?'active':''} title="Избранное" onClick={()=>setActiveSection('favorites')}><Icon name="star" size={24}/></button></div><div className="rail-bottom"><button title="Настройки" onClick={()=>setShowProfile(true)}><Icon name="settings" size={24}/></button></div></nav>{activeSection!=='chats'&&<WorkspacePanel section={activeSection} user={user} onOpenApp={setEmbeddedApp} onEditApp={setHomeLinkSlot} onBack={()=>setActiveSection('chats')}/>}<aside className={`chat-sidebar ${activeSection!=='chats'?'workspace-hidden':''}`}><div className="topbar"><button className="profile-button" onClick={()=>setShowProfile(true)}><Avatar user={user} className="avatar"/><span className="profile-copy"><b>{user.display_name||user.username}</b><small>@{user.username}</small></span></button><div className="home-quick-links-mobile-hide"><HomeQuickLinks user={user} onEdit={setHomeLinkSlot}/></div><div className="top-actions"><button className="storage-button mobile-top-cloud" title="Личное хранилище" aria-label="Личное хранилище" onClick={()=>setActiveSection('cloud')}><Icon name="cloud" size={20}/></button><button className="notification-button" title="Уведомления" aria-label="Уведомления" onClick={enablePush}><Icon name="bell" size={20}/></button><button title="Новый чат" onClick={()=>setShowNew(true)}>＋</button></div></div><>{!searchActive&&<div className="search-box"><span>⌕</span><input value="" readOnly onPointerDown={()=>{setSearchActive(true);document.documentElement.dataset.searchActive='true';document.documentElement.style.setProperty('--app-height',`${window.innerHeight}px`);requestAnimationFrame(()=>searchInput.current?.focus())}} placeholder="Поиск"/></div>}</>{pushInfo&&<div className="push-box"><span>{pushInfo}</span><button onClick={testPush}>Тест</button></div>}<div className="chat-list">{chats.map(c=><button className={'chat-row '+(chat?.id===c.id?'active':'')} key={c.id} onClick={()=>open(c)}><span className="chat-avatar-wrap"><Avatar user={c.is_group?{display_name:c.name,avatar_url:c.avatar_url}:c.members.find(m=>m.id!==user.id)} name={c.name}/>{!c.is_group&&c.members.find(m=>m.id!==user.id)?.online&&<i className="online-dot"/>}</span><span className="chat-copy"><span className="chat-title"><b>{c.name}</b><time>{c.last_message?moscowTime(c.last_message.created_at):''}</time></span><span className="preview-row"><span className="preview">{c.last_message?.text||c.last_message?.file_name||'Нет сообщений'}</span>{c.unread_count>0&&<span className="unread-badge" aria-label={`Непрочитанных: ${c.unread_count}`}>{c.unread_count>99?'99+':c.unread_count}</span>}</span></span></button>)}</div></aside><main className={activeSection!=='chats'?'workspace-hidden':''}>{chat?<><header className="chat-header"><button className="back" onClick={closeChat}>‹</button><button className={'group-avatar-button '+(chat.is_group&&chat.can_edit?'editable':'')} onClick={()=>chat.is_group&&chat.can_edit&&setShowGroupEdit(true)} title={chat.is_group&&chat.can_edit?'Изменить группу':''}><Avatar user={chat.is_group?{display_name:chat.name,avatar_url:chat.avatar_url}:other} name={chat.name}/></button><div className="chat-heading"><b>{chat.name}</b><small>{chat.is_group?`${chat.members.filter(m=>m.online).length} в сети из ${chat.members.length}`:(lastSeenText(other)||'статус уточняется…')}</small></div><GroupQuickLinks chat={chat} onEdit={setQuickLinkSlot} onMore={()=>setShowAllQuickLinks(true)}/><div className="call-header-actions"><button title={chat.can_call===false?'Гостям звонки недоступны':'Аудиозвонок'} disabled={chat.can_call===false} onClick={()=>window.__startCall?.('audio')}><Icon name="phone" size={22}/></button><button title={chat.can_call===false?'Гостям звонки недоступны':'Видеозвонок'} disabled={chat.can_call===false} onClick={()=>window.__startCall?.('video')}><Icon name="video" size={23}/></button><button title="Информация" onClick={()=>setShowInspector(v=>!v)}><Icon name="info" size={23}/></button></div></header>{chatSearchOpen&&<div className="chat-search-bar"><input autoFocus value={chatSearchQuery} onChange={e=>setChatSearchQuery(e.target.value)} placeholder="Поиск в этом чате"/><span>{chatSearchResults.length?`${chatSearchResults.length} найдено`:chatSearchQuery?'Нет совпадений':''}</span><button onClick={()=>{setChatSearchOpen(false);setChatSearchQuery('');setChatSearchResults([])}}>×</button>{chatSearchResults.length>0&&<div className="chat-search-results">{chatSearchResults.map(m=><button key={m.id} onClick={()=>document.getElementById(`message-${m.id}`)?.scrollIntoView({behavior:'smooth',block:'center'})}><b>{m.sender.display_name||m.sender.username}</b><span>{m.text||m.file_name}</span><time>{moscowTime(m.created_at)}</time></button>)}</div>}</div>}<section className={`messages ${mobileTab!=='chat'?'mobile-tab-hidden':''}`} ref={messagesRef}>{msgs.map(m=><div className={'message-item '+(m.sender.id===user.id?'mine':'')} key={m.id}><div id={`message-${m.id}`} className={'bubble '+(m.sender.id===user.id?'mine':'')+(chatSearchResults.some(x=>x.id===m.id)?' search-hit':'')}>{chat.is_group&&m.sender.id!==user.id&&<div className="sender">{m.sender.display_name||m.sender.username}</div>}{m.text&&<div className="message-text"><LinkifiedText text={m.text}/></div>}{m.file_url&&(m.mime_type||'').startsWith('image/')?<a href={m.file_url} target="_blank" rel="noreferrer"><img src={m.file_url}/></a>:m.file_url?<a className="file-card" href={m.file_url} target="_blank" rel="noreferrer">📎 <span>{m.file_name}</span></a>:null}</div><span className="message-meta"><time>{moscowTime(m.created_at)}</time>{m.sender.id===user.id&&<MessageTicks status={m.status||'sent'}/>}</span></div>)}<div ref={bottom}/></section><input ref={imageFile} hidden type="file" accept="image/*,video/*" onChange={e=>setSelectedFile(e.target.files?.[0]||null)}/><input ref={file} hidden type="file" accept=".pdf,.doc,.docx,.xls,.xlsx,.zip,.rar,text/*,application/*" onChange={e=>setSelectedFile(e.target.files?.[0]||null)}/><input ref={shareFile} hidden type="file" multiple onChange={e=>createShareLink(e.target.files)}/><MobileChatPanel tab={mobileTab} chat={chat} msgs={msgs} user={user} onOpenLink={link=>setEmbeddedApp({title:link.title||link.name||'Ресурс',url:link.url})} onEditLink={i=>setQuickLinkSlot(i)} onPhoto={()=>imageFile.current?.click()} onFile={()=>file.current?.click()} onShare={()=>shareFile.current?.click()} onSearch={()=>setChatSearchOpen(true)} onInfo={()=>setShowInspector(true)} onGroupEdit={()=>setShowGroupEdit(true)} onPush={enablePush}/>{mobileTab==='chat'&&(device.type==='phone'?createPortal(React.cloneElement(composerView,{className:'composer-wrap viewport-composer'}),document.body):composerView)}<MobileChatTaskbar tab={mobileTab} setTab={setMobileTab}/></>:<div className="empty"><div className="empty-mark">M</div><h2>Messenger</h2><p>Выберите чат или создайте новый</p></div>}</main>{activeSection==='chats'&&chat&&showInspector&&<aside className="desktop-inspector"><div className="inspector-head"><b>Информация</b><button onClick={()=>setShowInspector(false)}>×</button></div><div className="inspector-profile"><Avatar user={chat.is_group?{display_name:chat.name,avatar_url:chat.avatar_url}:other} name={chat.name} className="inspector-avatar"/><div><b>{chat.name}</b><small>{chat.is_group?`Группа · ${chat.members.length} участника`:(lastSeenText(other)||'статус уточняется…')}</small></div></div>{chat.is_group&&<section className="inspector-section"><div className="inspector-title"><b>Участники</b><span>{chat.members.length}</span></div><div className="member-avatars">{chat.members.slice(0,5).map(m=><Avatar key={m.id} user={m} className="mini-avatar"/>)}{chat.can_manage_members&&<button onClick={()=>setShowGroupEdit(true)}>＋</button>}</div></section>}<section className="inspector-section"><div className="inspector-title"><b>Ресурсы</b>{chat.can_edit_links&&<button onClick={()=>setQuickLinkSlot(0)}>＋</button>}</div><div className="resource-list">{(chat.quick_links||[]).filter(Boolean).map((l,i)=><button key={i} className="resource-open-button" onClick={()=>setEmbeddedApp({title:l.title||l.name||'Ресурс',url:l.url})}><span className="resource-icon">{(l.title||l.name||'С')[0].toUpperCase()}</span><span>{l.title||l.name||'Ссылка'}</span><b>›</b></button>)}{!(chat.quick_links||[]).filter(Boolean).length&&<small>Пока нет ресурсов</small>}</div></section><section className="inspector-section"><div className="inspector-title"><b>Медиа</b></div><button className="inspector-row"><span>Фото</span><b>{msgs.filter(m=>(m.mime_type||'').startsWith('image/')).length} ›</b></button><button className="inspector-row"><span>Документы</span><b>{msgs.filter(m=>m.file_url&&!(m.mime_type||'').startsWith('image/')).length} ›</b></button><button className="inspector-row"><span>Ссылки</span><b>{msgs.filter(m=>/(https?:\/\/|\/share\/)/.test(m.text||'')).length} ›</b></button></section><section className="inspector-section"><div className="inspector-title"><b>Настройки чата</b></div><button className="inspector-row"><span>Уведомления</span><span className="fake-toggle on"/></button></section></aside>}{searchActive&&<div className="global-search-overlay" onPointerDown={closeGlobalSearch}><div className="global-search-shell"><div className="search-box active-global" onPointerDown={e=>e.stopPropagation()}><span>⌕</span><input ref={searchInput} autoFocus value={searchQuery} onChange={e=>setSearchQuery(e.target.value)} placeholder="Поиск"/><button onClick={closeGlobalSearch}>×</button></div><div onPointerDown={e=>e.stopPropagation()}><SearchResults query={searchQuery} kind={searchKind} setKind={setSearchKind} results={searchResults} busy={searchBusy} historyItems={searchHistory} onHistory={q=>{setSearchQuery(q);searchInput.current?.focus()}} onOpenMessage={m=>{closeGlobalSearch();openSearchMessage(m)}} onOpenChat={c=>{closeGlobalSearch();open(c)}} onOpenUser={u=>{closeGlobalSearch();openSearchUser(u)}}/></div></div></div>}{showAttach&&<><button className="attach-backdrop" aria-label="Закрыть меню вложений" onPointerDown={e=>{e.preventDefault();e.stopPropagation();setShowAttach(false)}} onClick={e=>{e.preventDefault();e.stopPropagation();setShowAttach(false)}}/><div className="attach-menu attach-menu-global" onPointerDown={e=>e.stopPropagation()} onClick={e=>e.stopPropagation()}><button onClick={()=>{imageFile.current?.click();setShowAttach(false)}}>Фото или видео</button><button onClick={()=>{file.current?.click();setShowAttach(false)}}>Документ</button><button onClick={()=>{setShowAttach(false);shareFile.current?.click()}}>Отправить ссылку</button></div></>}{showGroupEdit&&chat?.is_group&&<GroupEditModal chat={chat} close={()=>setShowGroupEdit(false)} saved={c=>{setChat(c);setChats(xs=>xs.map(x=>x.id===c.id?c:x));setShowGroupEdit(false)}}/>}{showAllQuickLinks&&chat&&<QuickLinksPanel chat={chat} close={()=>setShowAllQuickLinks(false)} onEdit={i=>{setShowAllQuickLinks(false);setQuickLinkSlot(i)}}/>}{quickLinkSlot!==null&&chat&&<QuickLinkModal chat={chat} slot={quickLinkSlot} close={()=>setQuickLinkSlot(null)} saved={c=>{setChat(c);setChats(xs=>xs.map(x=>x.id===c.id?c:x));setQuickLinkSlot(null)}}/>}{homeLinkSlot!==null&&<HomeLinkModal user={user} slot={homeLinkSlot} close={()=>setHomeLinkSlot(null)} saved={u=>{setUser(u);setHomeLinkSlot(null)}}/>}{showProfile&&<ProfileModal user={user} close={()=>setShowProfile(false)} saved={u=>{setUser(u);setShowProfile(false);loadChats()}}/>}{showNew&&<NewChat close={()=>setShowNew(false)} created={c=>{setShowNew(false);loadChats();open(c)}}/>}{manualLinkOpen&&<div className="modal manual-link-modal" onPointerDown={closeManualLinkDialog}><div className="modal-card glass-card" onPointerDown={e=>e.stopPropagation()}><div className="modal-head"><h3>Вставить ссылку</h3><button type="button" aria-label="Закрыть" onClick={closeManualLinkDialog}>×</button></div><p className="manual-link-copy">iPhone не разрешил автоматически прочитать буфер. Вставьте скопированную ссылку сюда:</p><input autoFocus value={manualLinkValue} onChange={e=>{setManualLinkValue(e.target.value);setManualLinkError('')}} onPaste={e=>{const v=e.clipboardData?.getData('text/plain')||'';setManualLinkValue(v);setManualLinkError('')}} placeholder="https://files.igorson.xyz/…" autoCapitalize="none" autoCorrect="off" inputMode="url"/>{manualLinkError&&<div className="error">{manualLinkError}</div>}<div className="manual-link-actions"><button type="button" className="secondary" onClick={closeManualLinkDialog}>Отмена</button><button type="button" className="primary" onClick={submitManualLink}>Вставить</button></div></div></div>}{embeddedApp&&<EmbeddedAppWindow app={embeddedApp} close={()=>setEmbeddedApp(null)}/>}{!chat&&<MobileMainDock section={activeSection} setSection={setActiveSection} onSettings={()=>setShowProfile(true)}/>}<CallLayer user={user} ws={wsRef} chat={chat} invite={invite} setInvite={setInvite} clearRequestedCall={()=>{closeCallNotifications();setRequestedCallId(null);const u=new URL(location.href);u.searchParams.delete('call');history.replaceState(null,'',u.pathname+u.search)}}/></div>}


function MobileChatTaskbar({tab,setTab}){
 const items=[['chat','dockChat','Чат'],['links','link','Ссылки'],['attachments','paperclip','Вложения'],['info','info','Информация'],['more','more','Ещё']];
 const dock=<nav className="mobile-chat-taskbar viewport-dock" aria-label="Разделы чата">{items.map(([id,icon,label])=><button key={id} className={tab===id?'active':''} onClick={()=>setTab(id)}><Icon name={icon} size={30}/><span>{label}</span></button>)}</nav>;
 return createPortal(dock,document.body)
}

function MobileMainDock({section,setSection,onSettings}){
 const items=[['chats','dockChat','Чаты'],['cloud','dockDisk','Диск'],['apps','dockApps','Приложения'],['favorites','dockStar','Избранное'],['settings','dockProfile','Профиль']];
 const dock=<nav className="mobile-main-dock viewport-dock" aria-label="Основные разделы">{items.map(([id,icon,label])=><button key={id} className={(id==='settings'?false:section===id)?'active':''} onClick={()=>id==='settings'?onSettings():setSection(id)}><Icon name={icon} size={30}/><span>{label}</span></button>)}</nav>;
 return createPortal(dock,document.body)
}
function MobileChatPanel({tab,chat,msgs,user,onOpenLink,onEditLink,onPhoto,onFile,onShare,onSearch,onGroupEdit,onPush}){
 if(tab==='chat')return null;
 const links=(chat.quick_links||[]).filter(Boolean);
 const photos=msgs.filter(m=>(m.mime_type||'').startsWith('image/')).length;
 const docs=msgs.filter(m=>m.file_url&&!(m.mime_type||'').startsWith('image/')).length;
 const urlCount=msgs.filter(m=>/(https?:\/\/|\/share\/)/.test(m.text||'')).length;
 return <section className="mobile-chat-panel">
   {tab==='links'&&<><div className="mobile-panel-head"><div><h2>Ссылки</h2><p>Ресурсы этого чата</p></div>{chat.can_edit_links&&<button className="mobile-panel-add" onClick={()=>onEditLink(links.length)}>＋</button>}</div><div className="mobile-link-list">{links.map((link,i)=><article key={i}><button className="mobile-link-open" onClick={()=>onOpenLink(link)}><span className="mobile-link-mark">{quickLinkLetter(link.title||link.name)}</span><span><b>{link.title||link.name||'Ссылка'}</b><small>{String(link.url||'').replace(/^https?:\/\//,'')}</small></span></button>{chat.can_edit_links&&<button className="mobile-row-more" onClick={()=>onEditLink(i)}>⋯</button>}</article>)}{!links.length&&<div className="mobile-panel-empty"><Icon name="link" size={30}/><b>Ссылок пока нет</b><p>Добавьте сайт или приложение для быстрого доступа.</p></div>}</div></>}
   {tab==='attachments'&&<><div className="mobile-panel-head"><div><h2>Вложения</h2><p>Что отправить в чат</p></div></div><div className="mobile-action-list"><button onClick={onPhoto}><Icon name="image" size={23}/><span><b>Фото и видео</b><small>Выбрать из медиатеки</small></span><i>›</i></button><button onClick={onFile}><Icon name="file" size={23}/><span><b>Файл</b><small>Документ, архив или таблица</small></span><i>›</i></button><button onClick={onShare}><Icon name="link" size={23}/><span><b>Отправить ссылкой</b><small>Несколько файлов — одной ссылкой</small></span><i>›</i></button></div></>}
   {tab==='info'&&<><div className="mobile-panel-head"><div><h2>Информация</h2><p>{chat.is_group?`${chat.members.length} участников`:chat.name}</p></div></div>{chat.is_group&&<div className="mobile-section"><h3>Участники</h3><div className="mobile-member-strip">{chat.members.slice(0,8).map(m=><Avatar key={m.id} user={m} className="mini-avatar"/>)}{chat.can_manage_members&&<button onClick={onGroupEdit}>＋</button>}</div></div>}<div className="mobile-action-list compact"><button><Icon name="image" size={22}/><span><b>Фото</b></span><strong>{photos}</strong><i>›</i></button><button><Icon name="file" size={22}/><span><b>Документы</b></span><strong>{docs}</strong><i>›</i></button><button><Icon name="link" size={22}/><span><b>Ссылки</b></span><strong>{urlCount}</strong><i>›</i></button>{chat.is_group&&chat.can_edit&&<button onClick={onGroupEdit}><Icon name="settings" size={22}/><span><b>Настройки группы</b></span><i>›</i></button>}</div></>}
   {tab==='more'&&<><div className="mobile-panel-head"><div><h2>Ещё</h2><p>Дополнительные действия</p></div></div><div className="mobile-action-list"><button onClick={onSearch}><Icon name="search" size={23}/><span><b>Поиск в чате</b><small>Сообщения, файлы и ссылки</small></span><i>›</i></button><button onClick={onPush}><Icon name="bell" size={23}/><span><b>Уведомления</b><small>Настроить push-уведомления</small></span><i>›</i></button><button className="muted"><Icon name="star" size={23}/><span><b>Избранное</b><small>Скоро появится</small></span><i>›</i></button></div></>}
 </section>
}

function quickLinkLetter(title=''){return [...title.trim()][0]?.toLocaleUpperCase('ru-RU')||'+'}
function HomeQuickLinks({user,onEdit}){const source=user?.home_links||[];const slots=Array.from({length:3},(_,i)=>source[i]||null);return <div className="home-quick-links" aria-label="Ссылки главной страницы">{slots.map((link,i)=><button key={i} className={'home-quick-link '+(link?'configured':'empty')} title={link?.title||`Добавить ссылку ${i+1}`} onClick={()=>link?window.open(link.url,'_blank'):onEdit(i)}>{link?<><span>{quickLinkLetter(link.title)}</span><small>{link.title}</small></>:<span>＋</span>}</button>)}</div>}

function HomeLinkModal({user,slot,close,saved}){const current=(user.home_links||[])[slot]||{},[title,setTitle]=useState(current.title||''),[url,setUrl]=useState(current.url||''),[busy,setBusy]=useState(false);async function commit(remove=false){setBusy(true);try{const links=[...(user.home_links||[])];if(remove)links.splice(slot,1);else links[slot]={title:title.trim(),url:url.trim()};saved(await api('/api/me',{method:'PATCH',body:JSON.stringify({home_links:links.filter(Boolean)})}))}catch(e){alert(e.message)}finally{setBusy(false)}}return <div className="modal" onPointerDown={close}><div className="modal-card quick-link-modal glass-card" onPointerDown={e=>e.stopPropagation()}><div className="modal-head"><h3>{current.url?'Изменить приложение':'Добавить приложение'}</h3><button onClick={close}>×</button></div><label className="field-label">Название<input value={title} maxLength="24" onChange={e=>setTitle(e.target.value)} placeholder="Например, Finance"/></label><label className="field-label">Ссылка<input value={url} maxLength="500" onChange={e=>setUrl(e.target.value)} placeholder="https://…" autoCapitalize="none"/></label><div className="quick-link-form-actions">{current.url&&<button className="remove-photo" disabled={busy} onClick={()=>commit(true)}>Удалить</button>}<button className="primary" disabled={busy||!title.trim()||!url.trim()} onClick={()=>commit(false)}>Сохранить</button></div></div></div>}

function normalizeEmbeddedUrl(raw=''){const value=String(raw||'').trim();if(!value)return'';if(/^https?:\/\//i.test(value))return value;if(/^[a-z][a-z0-9+.-]*:\/\//i.test(value))return value;return `https://${value.replace(/^\/+/, '')}`}
function EmbeddedAppWindow({app,close}){const[url,setUrl]=useState(()=>normalizeEmbeddedUrl(app.url)),[key,setKey]=useState(0),[loading,setLoading]=useState(true),[failed,setFailed]=useState(false);useEffect(()=>{setUrl(normalizeEmbeddedUrl(app.url));setKey(k=>k+1);setLoading(true);setFailed(false)},[app.url]);const external=()=>window.open(url,'_blank','noopener,noreferrer');return <div className="embedded-app-layer" role="dialog" aria-modal="true" aria-label={app.title}><section className="embedded-app-window"><header className="embedded-app-toolbar"><div className="embedded-app-title"><span className="embedded-app-badge">{(app.title||'A')[0].toUpperCase()}</span><div><b>{app.title}</b><small>{url.replace(/^https?:\/\//,'').replace(/\/$/,'')}</small></div></div><div className="embedded-app-actions"><button title="Вернуться в мессенджер" onClick={close}>‹</button><button title="Обновить" onClick={()=>{setLoading(true);setFailed(false);setKey(k=>k+1)}}>↻</button><button title="Открыть в браузере" onClick={external}>↗</button><button className="embedded-close" title="Закрыть" onClick={close}>×</button></div></header><div className="embedded-app-body">{loading&&<div className="embedded-loading"><span/><p>Открываем {app.title}…</p></div>}<iframe key={key} src={url} title={app.title} allow="clipboard-read; clipboard-write; camera; microphone; fullscreen" referrerPolicy="strict-origin-when-cross-origin" onLoad={()=>setLoading(false)} onError={()=>{setLoading(false);setFailed(true)}}/>{failed&&<div className="embedded-fallback"><h3>Не удалось встроить приложение</h3><p>Сайт может запрещать открытие внутри других приложений.</p><button onClick={external}>Открыть в браузере</button></div>}</div></section></div>}

function GroupQuickLinks({chat,onEdit,onMore}){const source=chat.quick_links||[];const slots=Array.from({length:5},(_,i)=>source[i]||null);return <div className="group-quick-links" aria-label="Быстрые ссылки">{slots.map((link,i)=><button key={i} className={'group-quick-link '+(link?'configured':'empty')} title={link?.title||`Добавить ссылку ${i+1}`} onClick={()=>{if(link)window.open(link.url,'_blank');else if(chat.can_edit_links)onEdit(i)}}>{link?<><span className="quick-link-letter">{quickLinkLetter(link.title)}</span><small>{link.title}</small></>:<span>＋</span>}</button>)}</div>}
function QuickLinksPanel({chat,close,onEdit}){const links=chat.quick_links||[];return <div className="modal" onPointerDown={close}><div className="modal-card quick-links-panel glass-card" onPointerDown={e=>e.stopPropagation()}><div className="modal-head"><h3>Быстрые ссылки</h3><button onClick={close}>×</button></div><div className="quick-links-list">{links.map((link,i)=>link&&<div className="quick-links-list-row" key={i}><button className="quick-links-list-open" onClick={()=>window.open(link.url,'_blank')}><span>{quickLinkLetter(link.title)}</span><b>{link.title}</b></button>{chat.can_edit_links&&<button className="quick-links-list-edit" onClick={()=>onEdit(i)}>Изменить</button>}</div>)}{chat.can_edit_links&&links.length<10&&<button className="quick-links-add" onClick={()=>onEdit(links.length)}>＋ Добавить ссылку</button>}</div></div></div>}
function QuickLinkModal({chat,slot,close,saved}){const current=(chat.quick_links||[])[slot]||{},[title,setTitle]=useState(current.title||''),[url,setUrl]=useState(current.url||''),[busy,setBusy]=useState(false);async function save(){setBusy(true);try{const links=[...(chat.quick_links||[])].filter(Boolean);const next={title:title.trim(),url:url.trim()};if(slot<links.length)links[slot]=next;else links.push(next);saved(await api(`/api/chats/${chat.id}`,{method:'PATCH',body:JSON.stringify({quick_links:links})}))}catch(e){alert(e.message)}finally{setBusy(false)}}async function remove(){setBusy(true);try{const links=[...(chat.quick_links||[])].filter(Boolean);if(slot<links.length)links.splice(slot,1);saved(await api(`/api/chats/${chat.id}`,{method:'PATCH',body:JSON.stringify({quick_links:links})}))}catch(e){alert(e.message)}finally{setBusy(false)}}return <div className="modal" onPointerDown={close}><div className="modal-card quick-link-modal glass-card" onPointerDown={e=>e.stopPropagation()}><div className="modal-head"><h3>Быстрая ссылка {slot+1}</h3><button onClick={close}>×</button></div><label className="field-label">Название<input value={title} maxLength="24" placeholder="Например, Finance" onChange={e=>setTitle(e.target.value)}/></label><label className="field-label">Ссылка или адрес приложения<input value={url} maxLength="500" placeholder="https://… или telegram://…" autoCapitalize="none" onChange={e=>setUrl(e.target.value)}/></label><small>В иконке отображается первая заглавная буква названия.</small><div className="quick-link-preview"><span>{quickLinkLetter(title)}</span><small>{title||'Название'}</small></div><div className="quick-link-form-actions">{current.url&&<button className="remove-photo" disabled={busy} onClick={remove}>Удалить</button>}<button className="primary" disabled={busy||!title.trim()||!url.trim()} onClick={save}>{busy?'Сохранение…':'Сохранить'}</button></div></div></div>}

function GroupEditModal({chat,close,saved}){
  const[name,setName]=useState(chat.name||''),[avatar,setAvatar]=useState(chat.avatar_url||''),[links,setLinks]=useState(()=>[...(chat.quick_links||[])]),[busy,setBusy]=useState(false),[members,setMembers]=useState(()=>chat.members.map(m=>({...m}))),[roleDrafts,setRoleDrafts]=useState({}),[removedIds,setRemovedIds]=useState([]),[pendingAdds,setPendingAdds]=useState([]),[pickerOpen,setPickerOpen]=useState(false),pick=useRef();
  async function choose(){const f=pick.current?.files?.[0];if(!f)return;setBusy(true);try{const data=new FormData();data.append('file',f);const r=await api('/api/upload',{method:'POST',body:data});setAvatar(r.file_url)}catch(e){alert(e.message)}finally{setBusy(false)}}
  function changeLink(i,key,value){setLinks(xs=>{const n=[...xs];n[i]={...(n[i]||{title:'',url:''}),[key]:value};return n})}
  function stageRole(member,role,expiresAt=''){setRoleDrafts(x=>({...x,[member.id]:{role,expires_at:role==='guest'&&expiresAt?new Date(expiresAt).toISOString():null}}));setMembers(ms=>ms.map(m=>m.id===member.id?{...m,role,role_label:role==='admin'?'Администратор':role==='guest'?'Гость':'Участник',expires_at:expiresAt||null}:m))}
  function stageRemove(member){if(!confirm(`Удалить ${member.display_name||member.username} из группы после сохранения?`))return;setRemovedIds(x=>x.includes(member.id)?x:[...x,member.id]);setMembers(ms=>ms.filter(m=>m.id!==member.id));setPendingAdds(xs=>xs.filter(x=>x.id!==member.id))}
  function addSelected(users){const list=Array.isArray(users)?users:[users];const fresh=list.filter(user=>!members.some(m=>m.id===user.id)).map(user=>({...user,role:'member',role_label:'Участник',expires_at:null}));if(!fresh.length){setPickerOpen(false);return}setPendingAdds(xs=>[...xs,...fresh]);setMembers(ms=>[...ms,...fresh]);setPickerOpen(false)}
  async function save(){setBusy(true);try{let current=chat;const body={};if(chat.can_edit){body.name=name;body.avatar_url=avatar}if(chat.can_edit_links){body.quick_links=links.filter(Boolean).map(x=>({title:String(x.title||'').trim(),url:String(x.url||'').trim()})).filter(x=>x.title&&x.url)}if(Object.keys(body).length)current=await api(`/api/chats/${chat.id}`,{method:'PATCH',body:JSON.stringify(body)});for(const id of removedIds)current=await api(`/api/chats/${chat.id}/members/${id}`,{method:'DELETE'});for(const m of pendingAdds)current=await api(`/api/chats/${chat.id}/members`,{method:'POST',body:JSON.stringify({username:m.username,role:m.role||'member',expires_at:m.role==='guest'&&m.expires_at?new Date(m.expires_at).toISOString():null})});for(const [id,d] of Object.entries(roleDrafts))if(!removedIds.includes(Number(id)))current=await api(`/api/chats/${chat.id}/members/${id}`,{method:'PATCH',body:JSON.stringify(d)});saved(current)}catch(e){alert(e.message)}finally{setBusy(false)}}
  return <div className="modal group-settings-modal" onPointerDown={close}><div className="modal-card profile-card glass-card group-settings-card" onPointerDown={e=>e.stopPropagation()}><div className="modal-head"><h3>Управление группой</h3><button onClick={close}>×</button></div>
    {chat.can_edit&&<div className="settings-section"><b>Название</b><small>Изменить может только создатель</small><button className="profile-avatar-edit" onClick={()=>pick.current?.click()}><Avatar user={{display_name:name||chat.name,avatar_url:avatar}} className="profile-avatar"/><span>Изменить фотографию</span></button><input ref={pick} hidden type="file" accept="image/*" onChange={choose}/>{avatar&&<button className="remove-photo" onClick={()=>setAvatar('')}>Удалить фотографию</button>}<label className="field-label">Название группы<input value={name} maxLength="120" onChange={e=>setName(e.target.value)}/></label></div>}
    {chat.can_edit_links&&<div className="settings-section"><b>Быстрые ссылки</b><small>Любой участник может добавлять и изменять ссылки</small>{Array.from({length:Math.min(10,Math.max(3,links.length+1))},(_,i)=><div className="group-link-editor-row" key={i}><span>{i+1}</span><input value={links[i]?.title||''} maxLength="24" placeholder="Название" onChange={e=>changeLink(i,'title',e.target.value)}/><input value={links[i]?.url||''} maxLength="500" placeholder="https://… или app://…" autoCapitalize="none" onChange={e=>changeLink(i,'url',e.target.value)}/><button type="button" onClick={()=>setLinks(xs=>xs.map((x,n)=>n===i?null:x))}>×</button></div>)}</div>}
    <div className="settings-section members-section"><div className="section-title-row"><div><b>Участники</b><small>{members.length} участников</small></div>{chat.can_manage_members&&<button className="add-member-trigger" onClick={()=>setPickerOpen(true)}><span>＋</span> Добавить участника</button>}</div>{members.map(m=><MemberRow key={m.id} member={m} chat={chat} onRole={stageRole} onRemove={stageRemove}/>)}</div>
    <div className="group-settings-actions"><button className="secondary" onClick={close}>Отмена</button><button className="primary" disabled={busy||(!name.trim()&&chat.can_edit)} onClick={save}>{busy?'Сохранение…':'Сохранить'}</button></div>
  </div>{pickerOpen&&<UserPickerModal excluded={members.map(m=>m.id)} close={()=>setPickerOpen(false)} select={addSelected}/>}</div>
}

function UserPickerModal({excluded,close,select}){const[users,setUsers]=useState([]),[q,setQ]=useState(''),[busy,setBusy]=useState(true),[selected,setSelected]=useState([]),[loadError,setLoadError]=useState('');const loadUsers=()=>{setBusy(true);setLoadError('');api('/api/users').then(r=>setUsers(Array.isArray(r)?r:(r?.users||[]))).catch(e=>setLoadError(e.message||'Не удалось загрузить пользователей')).finally(()=>setBusy(false))};useEffect(()=>{loadUsers()},[]);const shown=users.filter(u=>!excluded.includes(u.id)&&(u.username+' '+(u.display_name||'')).toLowerCase().includes(q.toLowerCase()));function toggle(u){setSelected(xs=>xs.includes(u.id)?xs.filter(id=>id!==u.id):[...xs,u.id])}const chosen=users.filter(u=>selected.includes(u.id));return <div className="modal user-picker-modal" onPointerDown={close}><div className="modal-card glass-card user-picker-card" onPointerDown={e=>e.stopPropagation()}><div className="modal-head user-picker-head"><h3>Добавить участника</h3><button className="icon-close" onClick={close} aria-label="Закрыть">×</button></div><label className="user-search-field"><span>⌕</span><input autoFocus value={q} onChange={e=>setQ(e.target.value)} placeholder="Поиск по имени или логину"/></label><div className="user-picker-list">{busy?<div className="muted">Загрузка…</div>:shown.map(u=>{const active=selected.includes(u.id);return <button className={active?'selected':''} key={u.id} onClick={()=>toggle(u)}><Avatar user={u}/><span><b>{u.display_name||u.username}</b><small>@{u.username}</small></span><i className="user-select-mark">{active?'✓':'＋'}</i></button>})}{loadError&&<div className="picker-load-error"><span>{loadError}</span><button onClick={loadUsers}>Повторить</button></div>}{!busy&&!loadError&&!shown.length&&<div className="muted empty-users">Пользователи не найдены</div>}</div><div className="user-picker-footer"><span>Выбрано: {selected.length}</span><div><button className="secondary picker-cancel" onClick={close}>Отмена</button><button className="primary picker-add" disabled={!selected.length} onClick={()=>select(chosen)}>Добавить</button></div></div></div></div>}

function MemberRow({member,chat,onRole,onRemove}){const[role,setRole]=useState(member.role||'member'),[expiry,setExpiry]=useState(()=>member.expires_at?String(member.expires_at).slice(0,16):'');useEffect(()=>{setRole(member.role||'member');setExpiry(member.expires_at?String(member.expires_at).slice(0,16):'')},[member.role,member.expires_at]);const editable=chat.can_manage_members&&member.role!=='owner'&&member.id!==Number(localStorage.userId||-1)&&!(chat.my_role==='admin'&&member.role==='admin');return <div className="member-row"><Avatar user={member}/><div className="member-copy"><b>{member.display_name||member.username}</b><small>@{member.username} · {member.role_label||role}</small></div>{editable?<div className="member-role-controls"><select value={role} onChange={e=>{const r=e.target.value;setRole(r);onRole(member,r,expiry)}}>{chat.my_role==='owner'&&<option value="admin">Администратор</option>}<option value="member">Участник</option><option value="guest">Гость</option></select>{role==='guest'&&<input type="datetime-local" value={expiry} onChange={e=>{setExpiry(e.target.value);onRole(member,'guest',e.target.value)}}/>}<button className="member-remove-button" onClick={()=>onRemove(member)} aria-label={`Удалить ${member.display_name||member.username}`} title="Удалить участника"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3m-8 0 1 13h8l1-13M10 11v5m4-5v5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/></svg></button></div>:<span className="role-badge">{member.role_label||role}</span>}</div>}

function ProfileModal({user,close,saved}){const[name,setName]=useState(user.display_name||user.username),[avatar,setAvatar]=useState(user.avatar_url||''),[busy,setBusy]=useState(false),pick=useRef();async function choose(){const f=pick.current?.files?.[0];if(!f)return;setBusy(true);try{const data=new FormData();data.append('file',f);const r=await api('/api/upload',{method:'POST',body:data});setAvatar(r.file_url)}catch(e){alert(e.message)}finally{setBusy(false)}}async function save(){setBusy(true);try{saved(await api('/api/me',{method:'PATCH',body:JSON.stringify({display_name:name,avatar_url:avatar})}))}catch(e){alert(e.message)}finally{setBusy(false)}}return <div className="modal" onPointerDown={close}><div className="modal-card profile-card" onPointerDown={e=>e.stopPropagation()}><div className="modal-head"><h3>Профиль</h3><button onClick={close}>×</button></div><button className="profile-avatar-edit" onClick={()=>pick.current?.click()}><Avatar user={{...user,display_name:name,avatar_url:avatar}} className="profile-avatar"/><span>Изменить фото</span></button><input ref={pick} hidden type="file" accept="image/*" onChange={choose}/><label className="field-label">Отображаемое имя<input value={name} maxLength="80" onChange={e=>setName(e.target.value)}/></label><small>Логин для входа: @{user.username}</small><button className="primary" disabled={busy||!name.trim()} onClick={save}>{busy?'Сохранение…':'Сохранить'}</button><div className="profile-danger-zone"><button className="profile-logout" type="button" onClick={()=>{if(confirm('Выйти из аккаунта?')){localStorage.clear();sessionStorage.clear();location.reload()}}}><Icon name="logout" size={19}/><span>Выйти из аккаунта</span></button></div></div></div>}

function NewChat({close,created}){const[users,setUsers]=useState([]),[sel,setSel]=useState([]),[name,setName]=useState(''),[q,setQ]=useState('');useEffect(()=>{api('/api/users').then(setUsers)},[]);const shown=useMemo(()=>users.filter(u=>(u.username+' '+(u.display_name||'')).toLowerCase().includes(q.toLowerCase())),[users,q]);async function make(){const c=await api('/api/chats',{method:'POST',body:JSON.stringify({name:name||null,usernames:sel})});created(c)}return <div className="modal" onPointerDown={close}><div className="modal-card" onPointerDown={e=>e.stopPropagation()}><div className="modal-head"><h3>Новый чат</h3><button onClick={close}>×</button></div><input placeholder="Название группы" value={name} onChange={e=>setName(e.target.value)}/><input placeholder="Поиск пользователя" value={q} onChange={e=>setQ(e.target.value)}/><div className="user-list">{shown.map(u=><label key={u.id}><input type="checkbox" checked={sel.includes(u.username)} onChange={e=>setSel(s=>e.target.checked?[...s,u.username]:s.filter(x=>x!==u.username))}/><Avatar user={u}/><span>{u.display_name||u.username}<small className="username-hint">@{u.username}</small></span></label>)}</div><button className="primary" onClick={make} disabled={!sel.length}>Создать</button></div></div>}
const root=createRoot(document.getElementById('root'));
root.render(<App/>);
requestAnimationFrame(()=>requestAnimationFrame(()=>{document.documentElement.classList.remove('app-booting');document.documentElement.classList.add('app-ready')}));
