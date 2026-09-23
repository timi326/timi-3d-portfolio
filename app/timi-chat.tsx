'use client';

import { useEffect, useRef, useState } from 'react';
import './timi-chat.css';
import Link from 'next/link';
import type { AvatarMood } from './timi-avatar';

type Message = { role: 'user' | 'assistant'; content: string };
export default function TimiChat({ onClose, onPause, inRoom = false, onMoodChange }: { onClose?: () => void; onPause?: () => void; inRoom?: boolean; onMoodChange?: (mood: AvatarMood) => void }) {
  const conversation = useRef('');
  const dialog = useRef<HTMLDialogElement>(null);
  const transcript = useRef<HTMLDivElement>(null);
  const request = useRef<AbortController | null>(null);
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const input = useRef<HTMLTextAreaElement>(null);
  const [speaking, setSpeaking] = useState(false);
  const [canSpeak, setCanSpeak] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [revealed, setRevealed] = useState(0);
  const reply = messages.at(-1)?.role === 'assistant' ? messages.at(-1)!.content : '';
  useEffect(() => {
    if (!inRoom || !reply) return;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const start = performance.now();
    const timer = window.setInterval(() => {
      const count = reducedMotion ? reply.length : Math.floor((performance.now() - start) / 18);
      setRevealed(current => Math.max(current, Math.min(count, reply.length)));
      if (count >= reply.length) window.clearInterval(timer);
    }, 30);
    return () => window.clearInterval(timer);
  }, [reply, inRoom]);

  useEffect(() => {
    const frame = requestAnimationFrame(() => setCanSpeak('speechSynthesis' in window));
    return () => { cancelAnimationFrame(frame); if ('speechSynthesis' in window) window.speechSynthesis.cancel(); };
  }, []);
  useEffect(() => {
    onMoodChange?.(busy ? 'thinking' : speaking || messages.at(-1)?.role === 'assistant' ? 'replying' : 'idle');
    if (!busy && !speaking) { const timer = setTimeout(() => onMoodChange?.('idle'), 4500); return () => clearTimeout(timer); }
  }, [busy, speaking, messages, onMoodChange]);
  function readReply() {
    if (!canSpeak) return;
    window.speechSynthesis.cancel();
    if (speaking) { setSpeaking(false); return; }
    const text = messages.at(-1)?.role === 'assistant' ? messages.at(-1)?.content : undefined;
    if (!text) return;
    const utterance = new SpeechSynthesisUtterance(text); utterance.lang = 'zh-CN'; utterance.rate = 1;
    utterance.onend = () => setSpeaking(false); utterance.onerror = () => setSpeaking(false);
    setSpeaking(true); window.speechSynthesis.speak(utterance);
  }

  useEffect(() => {
    if (onClose) dialog.current?.showModal();
    const controller = new AbortController();
    fetch('/api/timi-chat', { signal: controller.signal }).then(async response => {
      if (!response.ok) throw new Error();
      const data = await response.json() as { configured?: boolean };
      setConfigured(data.configured === true);
    }).catch(() => { if (!controller.signal.aborted) setError('暂时无法检查连接，请重新打开对话。'); });
    return () => { controller.abort(); request.current?.abort(); };
  }, [onClose]);
  useEffect(() => { transcript.current?.scrollTo({ top: transcript.current.scrollHeight }); }, [messages, busy]);

  async function send(text: string) {
    if (!text.trim() || busy || request.current || !configured) return;
    if (!conversation.current) conversation.current = crypto.randomUUID();
    const question: Message = { role: 'user', content: text.trim() };
    if (canSpeak) window.speechSynthesis.cancel(); setSpeaking(false);
    const history = [...messages, question];
    setRevealed(0); setMessages(history); setDraft(''); setError(''); setBusy(true);
    const controller = new AbortController();
    request.current = controller;
    try {
      const response = await fetch('/api/timi-chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messages: history.slice(-21), conversation: conversation.current, noticeVersion: '2026-09-14' }), signal: controller.signal });
      const data = await response.json() as { error?: string; content?: string };
      if (!response.ok) throw new Error(data.error || '发送失败，请重试。');
      if (typeof data.content !== 'string' || !data.content.trim()) throw new Error('没有收到回答，请重试。');
      setMessages([...history, { role: 'assistant', content: data.content }]);
    } catch (cause) {
      setMessages(history.slice(0, -1)); setDraft(question.content);
      setError(controller.signal.aborted ? '已停止，问题保留在输入框中。' : cause instanceof Error ? cause.message : '连接中断，请重试。');
    } finally { request.current = null; setBusy(false); input.current?.focus(); }
  }
  const surface = <section className="timi-chat" aria-labelledby="timi-chat-title">
    <header className="timi-chat-header">
      <div className="timi-chat-monogram" aria-hidden="true">T.</div>
      <div><p className="timi-chat-eyebrow">暮色工作室 / 对话</p><h2 id="timi-chat-title">{inRoom ? '陈楚涛 · 数字分身' : '和 Timi 的数字分身聊聊'}</h2><p className="timi-chat-status">AI 数字分身 · {busy ? '正在思考' : speaking ? '正在朗读' : configured === null ? '正在检查连接' : configured ? '可以开始聊天' : '尚未连接模型'}</p></div>
      {onClose ? <button type="button" onClick={onClose} className="timi-chat-close" aria-label="关闭对话">{inRoom ? '结束交谈' : '×'}</button> : <Link className="timi-chat-back" href="/">返回房间 ↗</Link>}
    </header>
    {inRoom && !showHistory ? <div className="game-dialogue-body">
      {messages.filter(message => message.role === 'user').at(-1) && <p className="game-last-question">你：{messages.filter(message => message.role === 'user').at(-1)?.content}</p>}
      <div className="game-dialogue-line" aria-live="off">{busy ? '让我想一想…' : reply ? reply.slice(0, revealed) : '欢迎来到我的工作室。我是 Timi 的 AI 数字分身，想和我聊些什么？'}</div>
      <p className="game-sr-only" role="status">{busy ? '正在思考' : reply}</p>
      {reply && revealed < reply.length && !busy && <button className="game-reveal" onClick={() => setRevealed(reply.length)}>显示完整回答 ▾</button>}
    </div> : <>
    <div className="timi-chat-transcript" ref={transcript} role="log" aria-label="聊天记录" aria-live="polite">
      {!messages.length && <div className="timi-chat-welcome"><span className="timi-chat-window" aria-hidden="true">✦</span><h3>从一个想法开始。</h3><p>聊聊我的作品、AI 创作，或者这个房间。<br />我是 Timi 的 AI 数字分身，回答依据已整理的个人资料。</p>
        {configured === false ? <p className="timi-chat-notice">数字分身还在准备中。模型连接完成后，就能在这里聊天。</p> : <div className="timi-chat-prompts">{['介绍一下 Timi', '你做过哪些作品？', '这个房间有哪些可以探索的地方？'].map(question => <button key={question} type="button" disabled={!configured || busy} onClick={() => void send(question)}>{question}<span aria-hidden="true">↗</span></button>)}</div>}
      </div>}
      {messages.map((message, i) => <article key={i} className={`timi-chat-message ${message.role}`}><span>{message.role === 'user' ? '你' : 'Timi · AI'}</span><p>{message.content}</p></article>)}
      {busy && <p className="timi-chat-wait" role="status">正在组织回答…</p>}
    </div>
    </>}
    {inRoom && <div className="game-dialogue-choices">{['介绍一下你自己', '你做过哪些作品？', '这个房间有什么可以探索的？'].map((question, index) => <button type="button" key={question} disabled={!configured || busy} onClick={() => { setShowHistory(false); void send(question); }}><span>{index + 1}</span>{question}</button>)}</div>}
    <footer className="timi-chat-footer">
      {canSpeak && messages.at(-1)?.role === 'assistant' && <button className="timi-read-reply" type="button" onClick={readReply}>{speaking ? '停止朗读' : '朗读回答'}</button>}
      {error && <p className="timi-chat-error" role="alert">{error}</p>}
      <form onSubmit={event => { event.preventDefault(); void send(draft); }}>
        <textarea ref={input} value={draft} onChange={event => setDraft(event.target.value)} maxLength={2000} rows={inRoom ? 1 : 2} aria-label="给数字分身的消息" placeholder={configured ? '写下你想聊的事…' : '连接模型后即可聊天'} disabled={!configured || busy} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void send(draft); } }} />
        {busy ? <button type="button" onClick={() => request.current?.abort()}>停止</button> : <button type="submit" disabled={!configured || !draft.trim()}>发送 ↑</button>}
      </form>
      <div className="timi-chat-footnote"><span>聊天记录保留 30 天 · <a href="/privacy" target="_blank" rel="noopener noreferrer">隐私说明</a></span>{inRoom && <button type="button" onClick={() => setShowHistory(value => !value)}>{showHistory ? '返回对白' : '对话记录'}</button>}<button type="button" disabled={busy || !messages.length} onClick={() => { conversation.current = ''; setMessages([]); setError(''); setDraft(''); }}>新对话</button></div>
    </footer>
  </section>;
  return onClose ? <dialog className={`timi-chat-dialog ${inRoom ? 'in-room' : ''}`} ref={dialog} onCancel={event => { event.preventDefault(); (onPause ?? onClose)(); }}>{surface}</dialog> : <main className="timi-chat-page">{surface}</main>;
}
