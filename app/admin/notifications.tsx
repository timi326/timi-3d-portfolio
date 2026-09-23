'use client';
import {useEffect,useRef,useState} from 'react';
type Feed={cursor:number;unread:number;items:{seq:number;conversation:string}[]};
export default function Notifications({onOpen,onRefresh,onExpired}:{onOpen:(id:string)=>void;onRefresh:()=>void;onExpired:()=>void}) {
 const callbacks=useRef({onOpen,onRefresh,onExpired});
 useEffect(()=>{callbacks.current={onOpen,onRefresh,onExpired};},[onOpen,onRefresh,onExpired]);
 const [enabled,setEnabled]=useState(false),[status,setStatus]=useState('正在连接消息提醒…'),[unread,setUnread]=useState(0),[latest,setLatest]=useState('');
 const enabledRef=useRef(false),audio=useRef<AudioContext|null>(null),notices=useRef<Notification[]>([]);
 async function enable(){
  try{
   audio.current??=new AudioContext();await audio.current.resume();
   const permission='Notification' in window?await Notification.requestPermission():'denied';
   enabledRef.current=true;setEnabled(true);
   setStatus(permission==='granted'?'桌面通知和提示音已开启':'提示音已开启；桌面通知需在浏览器设置中允许');
  }catch{setStatus('无法开启提醒，请检查浏览器的通知与声音权限。');}
 }
 useEffect(()=>{
  let stopped=false,timer:ReturnType<typeof setTimeout>,cursor:number|undefined;
  async function poll(){try{
   const r=await fetch('/api/admin/notifications'+(cursor===undefined?'':'?after='+cursor),{cache:'no-store',signal:AbortSignal.timeout(10000)});
   if(stopped)return;
   if(r.status===401){callbacks.current.onExpired();return;}
   if(!r.ok)throw Error();
   const feed=await r.json() as Feed;if(stopped)return;
   const initial=cursor===undefined;cursor=feed.cursor;setUnread(feed.unread);
   document.title=feed.unread?`(${feed.unread}) 新消息 · Timi`:'对话管理台 · Timi';
   if(initial)setStatus('消息检测已连接 · 点击开启桌面提醒');
   if(feed.items.length&&!initial){
    const id=feed.items.at(-1)!.conversation;setLatest(id);callbacks.current.onRefresh();
    setStatus(`收到 ${feed.items.length} 条新消息`);
    if(enabledRef.current){
     try{const ctx=audio.current;if(ctx&&ctx.state==='running'){const oscillator=ctx.createOscillator(),gain=ctx.createGain();oscillator.connect(gain);gain.connect(ctx.destination);oscillator.frequency.value=740;gain.gain.setValueAtTime(.12,ctx.currentTime);gain.gain.exponentialRampToValueAtTime(.001,ctx.currentTime+.3);oscillator.start();oscillator.stop(ctx.currentTime+.3);}}catch{}
     if('Notification' in window&&Notification.permission==='granted')try{
      const n=new Notification('Timi · 收到新消息',{body:feed.items.length>1?`访客发来了 ${feed.items.length} 条新消息，点击查看。`:'有访客正在和数字人聊天，点击查看。',tag:'timi-new-message'});
      notices.current.push(n);n.onclose=()=>{notices.current=notices.current.filter(item=>item!==n);};
      n.onclick=()=>{window.focus();callbacks.current.onOpen(id);n.close();};
     }catch{setStatus('收到新消息；系统通知不可用，请在窗口内查看。');}
    }
   }
  }catch{if(!stopped)setStatus('提醒连接暂时中断，正在重试…');}
  finally{if(!stopped)timer=setTimeout(poll,5000);}}
  void poll();
  return()=>{stopped=true;clearTimeout(timer);for(const n of notices.current)n.close();notices.current=[];void audio.current?.close();audio.current=null;document.title='对话管理台 · Timi';};
 },[]);
 return <div className="admin-notifications"><div><strong>{unread} 条未读</strong><span role="status">{status}</span><small>保持工具开启并登录；最小化可提醒，关闭后不提醒。</small></div><div>{latest&&<button onClick={()=>onOpen(latest)}>查看新消息</button>}<button onClick={()=>{if(enabled){enabledRef.current=false;setEnabled(false);setStatus('提示音和桌面通知已暂停');}else void enable();}}>{enabled?'暂停提醒':'开启桌面提醒'}</button></div></div>;
}
