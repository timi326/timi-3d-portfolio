'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import './orbit-explorer.css';

export default function OrbitExplorer({ onClose }: { onClose?: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const frame = useRef<HTMLIFrameElement>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    dialog.current?.showModal();
    const receive = (event: MessageEvent) => {
      if (event.origin !== location.origin || event.source !== frame.current?.contentWindow) return;
      if (event.data?.type === 'timi-orbit-ready') setStatus('ready');
      if (event.data?.type === 'timi-orbit-error') setStatus('error');
    };
    window.addEventListener('message', receive);
    const timeout = window.setTimeout(() => setStatus(current => current === 'loading' ? 'error' : current), 60000);
    return () => { window.clearTimeout(timeout); window.removeEventListener('message', receive); };
  }, [attempt]);
  return <dialog ref={dialog} className="orbit-explorer" aria-label="Timi 星空观测室" onCancel={event => {
    event.preventDefault(); onClose?.();
  }}>
    <header className="orbit-room-bar"><span><b>Timi</b> / 星空观测室</span>
      {onClose ? <button onClick={onClose}>返回房间 ×</button> : <Link href="/">返回房间 ×</Link>}
    </header>
    <iframe key={attempt} ref={frame} title="ORBIT 宇宙探索" src="/orbit-runtime/index.html" allow="fullscreen" />
    {status === 'loading' && <div className="orbit-room-loading" role="status">正在打开星空…</div>}
    {status === 'error' && <div className="orbit-room-error" role="alert"><h2>星空暂时没有加载完成</h2><p>可以重试，或返回房间继续探索。</p><button onClick={() => { setStatus('loading'); setAttempt(value => value + 1); }}>重新加载</button></div>}
  </dialog>;
}
