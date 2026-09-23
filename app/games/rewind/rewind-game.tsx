'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import * as THREE from 'three';
import { createRewindScene } from './rewind-scene';
import { RewindState, STATIONS, distance } from './rewind-state';
import './rewind.css';

type Phase = 'intro' | 'playing' | 'paused' | 'won' | 'error';
type View = { stage: number; message: string; nearby: string; progress: number; recording: boolean; hasEcho: boolean; powered: boolean; seconds: number; failures: number };
const initialView: View = { stage: 0, message: '先去左侧的碎花瓶旁。', nearby: '', progress: 0, recording: false, hasEcho: false, powered: false, seconds: 0, failures: 0 };
const chapters = ['破碎之前', '暂借一座桥', '留下你的回声'];

export default function RewindGame({ onClose }: { onClose?: () => void }) {
  const mount = useRef<HTMLDivElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const keys = useRef(new Set<string>());
  const phaseRef = useRef<Phase>('intro');
  const [phase, setPhase] = useState<Phase>('intro');
  const [view, setView] = useState<View>(initialView);
  const [hint, setHint] = useState(false);
  const [epoch, setEpoch] = useState(0);
  const actions = useRef({ interact: () => {}, record: () => {}, restart: () => {} });
  const changePhase = useCallback((next: Phase) => { keys.current.clear(); phaseRef.current = next; setPhase(next); }, []);
  const start = () => { actions.current.restart(); setHint(false); changePhase('playing'); };

  useEffect(() => { const element = dialog.current; element?.showModal(); return () => element?.close(); }, []);
  useEffect(() => {
    const host = mount.current;
    if (!host) return;
    let renderer: THREE.WebGLRenderer;
    try { renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' }); }
    catch { const task = window.setTimeout(() => changePhase('error'), 0); return () => window.clearTimeout(task); }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.25));
    renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.domElement.setAttribute('aria-label', '房间倒带三维游戏画面，拖动转向，WASD 移动');
    host.appendChild(renderer.domElement);
    const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(60, 1, .08, 45);
    camera.rotation.order = 'YXZ';
    let state = new RewindState();
    let dirty = true, frame = 0, last = 0, uiAt = 0;
    const world = createRewindScene(scene, () => { dirty = true; });
    const heldKeys = keys.current;
    const resetCamera = () => { camera.position.set(0, 1.65, 3.7); camera.rotation.set(-.07, 0, 0); dirty = true; };
    resetCamera();
    const updateView = () => {
      const target = state.stage === 0 ? STATIONS.vase : state.stage === 1 ? STATIONS.bridge : STATIONS.door;
      const near = distance(camera.position, target) < (state.stage === 1 ? 2.45 : state.stage === 2 ? 1.85 : 2.2);
      setView({ stage: state.stage, message: state.message,
        nearby: near ? (state.stage === 0 ? state.vase < .03 ? 'E 取走钥匙' : '按住 R 倒带花瓶' : state.stage === 1 ? state.cartRunning ? '按住 R 维持桥面' : 'E 启动小车' : 'E 打开出口') : '',
        progress: state.stage === 0 ? 1 - state.vase : state.stage === 1 ? (state.cart + 1.25) / 2.5 : state.recordTime / 8,
        recording: state.recording, hasEcho: !!state.echo, powered: state.doorPowered, seconds: Math.floor(state.elapsed), failures: state.failures });
    };
    actions.current = {
      interact: () => { if (phaseRef.current !== 'playing') return; state.interact(camera.position); updateView(); if (state.stage === 3) changePhase('won'); dirty = true; },
      record: () => { if (phaseRef.current !== 'playing') return; state.toggleRecording(camera.position, camera.rotation.y); updateView(); },
      restart: () => { state = new RewindState(); heldKeys.clear(); resetCamera(); updateView(); },
    };
    const resize = () => {
      const w = Math.max(1, host.clientWidth), h = Math.max(1, host.clientHeight);
      renderer.setSize(w, h, false); camera.aspect = w / h; camera.fov = w < 600 ? 70 : 58; camera.updateProjectionMatrix(); dirty = true;
    };
    const observer = new ResizeObserver(resize); observer.observe(host); resize();
    const down = (event: KeyboardEvent) => {
      if (phaseRef.current !== 'playing') return;
      if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyR', 'KeyQ', 'KeyE'].includes(event.code)) {
        event.preventDefault(); heldKeys.add(event.code);
        if (!event.repeat && event.code === 'KeyE') actions.current.interact();
        if (!event.repeat && event.code === 'KeyQ') actions.current.record();
      }
    };
    const up = (event: KeyboardEvent) => heldKeys.delete(event.code);
    const blur = () => { heldKeys.clear(); dragging = false; if (phaseRef.current === 'playing') changePhase('paused'); dirty = true; };
    const visibility = () => { if (document.hidden) blur(); };
    const lost = (event: Event) => { event.preventDefault(); changePhase('error'); };
    let dragging = false, pointer = -1, px = 0, py = 0;
    const pointerDown = (event: PointerEvent) => {
      if (phaseRef.current !== 'playing' || event.button !== 0) return;
      dragging = true; pointer = event.pointerId; px = event.clientX; py = event.clientY; renderer.domElement.setPointerCapture(pointer);
    };
    const pointerMove = (event: PointerEvent) => {
      if (!dragging || event.pointerId !== pointer || phaseRef.current !== 'playing') return;
      camera.rotation.y -= (event.clientX - px) * .004;
      camera.rotation.x = THREE.MathUtils.clamp(camera.rotation.x - (event.clientY - py) * .003, -.95, .9);
      px = event.clientX; py = event.clientY;
    };
    const pointerUp = () => { dragging = false; };
    window.addEventListener('keydown', down); window.addEventListener('keyup', up); window.addEventListener('blur', blur);
    document.addEventListener('visibilitychange', visibility);
    renderer.domElement.addEventListener('pointerdown', pointerDown); renderer.domElement.addEventListener('pointermove', pointerMove);
    renderer.domElement.addEventListener('pointerup', pointerUp); renderer.domElement.addEventListener('pointercancel', pointerUp);
    renderer.domElement.addEventListener('webglcontextlost', lost);
    const forward = new THREE.Vector3(), right = new THREE.Vector3(), move = new THREE.Vector3();
    const animate = (now: number) => {
      frame = requestAnimationFrame(animate); const dt = Math.min(.05, Math.max(0, (now - last) / 1000)); last = now;
      if (document.hidden) return;
      if (phaseRef.current === 'playing') {
        const x = Number(heldKeys.has('KeyD') || heldKeys.has('ArrowRight')) - Number(heldKeys.has('KeyA') || heldKeys.has('ArrowLeft'));
        const z = Number(heldKeys.has('KeyW') || heldKeys.has('ArrowUp')) - Number(heldKeys.has('KeyS') || heldKeys.has('ArrowDown'));
        camera.getWorldDirection(forward); forward.y = 0; forward.normalize(); right.crossVectors(forward, camera.up).normalize();
        move.set(0, 0, 0).addScaledVector(forward, z).addScaledVector(right, x).normalize().multiplyScalar(dt * 2.35);
        const nx = camera.position.x + move.x, nz = camera.position.z + move.z;
        if (world.canMove({ x: nx, z: camera.position.z })) camera.position.x = nx;
        if (world.canMove({ x: camera.position.x, z: nz })) camera.position.z = nz;
        state.update(dt, camera.position, camera.rotation.y, heldKeys.has('KeyR'));
        world.update(state, state.elapsed, heldKeys.has('KeyR'));
        if (now - uiAt > 100) { updateView(); uiAt = now; }
        dirty = true;
      }
      if (dirty) { world.update(state, state.elapsed, heldKeys.has('KeyR')); renderer.render(scene, camera); dirty = false; }
    };
    frame = requestAnimationFrame(animate);
    return () => {
      cancelAnimationFrame(frame); heldKeys.clear(); observer.disconnect();
      window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); window.removeEventListener('blur', blur);
      document.removeEventListener('visibilitychange', visibility);
      renderer.domElement.removeEventListener('pointerdown', pointerDown); renderer.domElement.removeEventListener('pointermove', pointerMove);
      renderer.domElement.removeEventListener('pointerup', pointerUp); renderer.domElement.removeEventListener('pointercancel', pointerUp);
      renderer.domElement.removeEventListener('webglcontextlost', lost);
      world.dispose(); renderer.dispose(); renderer.domElement.remove();
    };
  }, [changePhase, epoch]);

  const holdDown = (event: React.PointerEvent<HTMLButtonElement>) => {
    event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId);
    const code = event.currentTarget.dataset.key;
    if (code && phaseRef.current === 'playing') keys.current.add(code);
  };
  const holdUp = (event: React.PointerEvent<HTMLButtonElement>) => {
    const code = event.currentTarget.dataset.key;
    if (code) keys.current.delete(code);
  };
  const hints = ['走到左侧桌子前，按住 R 直到花瓶完整。保持 R，再按 E 取钥匙。', '右侧桌子前先按 E 启动车辆，立刻按住 R，直到车开到另一端。失败可按 E 重试。', '去左侧地面光圈，按 Q 开始记录，站稳一秒后再按 Q。回声会留在光圈内；走到右侧门边按 E。'];
  const close = onClose ? <button onClick={onClose}>返回房间 ↗</button> : <Link href="/">返回房间 ↗</Link>;
  return <dialog ref={dialog} className="rewind-game" aria-label="房间倒带：三维时间解谜" onCancel={event => { event.preventDefault(); if (phase === 'playing') changePhase('paused'); else if (phase === 'paused') changePhase('playing'); }}>
    <div className="rewind-viewport" ref={mount} />
    <header className="rewind-top"><span className="rewind-brand">Timi <small>PLAYROOM</small></span><nav>{phase === 'playing' && <button onClick={() => changePhase('paused')}>暂停 <kbd>Esc</kbd></button>}{close}</nav></header>
    {(phase === 'playing') && <>
      <div className="rewind-chapter"><span>时间碎片 / {Math.min(3, view.stage + 1)}</span><h1>{chapters[view.stage]}</h1><ol>{chapters.map((name, i) => <li key={name} className={i < view.stage ? 'done' : i === view.stage ? 'current' : ''} aria-current={i === view.stage ? 'step' : undefined}>{i < view.stage ? '✓' : `0${i + 1}`}<span>{name}</span></li>)}</ol></div>
      <div className="rewind-crosshair" aria-hidden="true">+</div>
      <div className="rewind-objective"><p role="status">{view.message}</p><div className="rewind-meter"><span style={{ width: `${Math.max(0, Math.min(1, view.progress)) * 100}%` }} /></div><small>{view.stage < 2 ? view.nearby || '靠近标记的桌子 · 拖动画面转向' : view.recording ? `记录中 ${view.progress * 8 < 1 ? '<1' : Math.floor(view.progress * 8)} / 8 秒` : view.powered ? '回声已踩住机关 · 前往右侧出口' : view.hasEcho ? '回声正在重演' : 'Q 记录自己的行动'}</small></div>
      <div className="rewind-assist"><button onClick={() => setHint(!hint)} aria-expanded={hint}>解谜提示 {hint ? '−' : '+'}</button>{hint && <p>{hints[view.stage]}</p>}</div>
      <footer className="rewind-controls"><div className="rewind-move"><button aria-label="向前移动" data-key="KeyW" onPointerDown={holdDown} onPointerUp={holdUp} onPointerCancel={holdUp} onLostPointerCapture={holdUp}>W</button><div><button aria-label="向左移动" data-key="KeyA" onPointerDown={holdDown} onPointerUp={holdUp} onPointerCancel={holdUp} onLostPointerCapture={holdUp}>A</button><button aria-label="向后移动" data-key="KeyS" onPointerDown={holdDown} onPointerUp={holdUp} onPointerCancel={holdUp} onLostPointerCapture={holdUp}>S</button><button aria-label="向右移动" data-key="KeyD" onPointerDown={holdDown} onPointerUp={holdUp} onPointerCancel={holdUp} onLostPointerCapture={holdUp}>D</button></div></div><span className="rewind-control-note">拖动转向<br />WASD 行走</span><div className="rewind-actions">{view.stage < 2 ? <button className="rewind-primary" data-key="KeyR" onPointerDown={holdDown} onPointerUp={holdUp} onPointerCancel={holdUp} onLostPointerCapture={holdUp}>按住倒带 <kbd>R</kbd></button> : <button className={view.recording ? 'rewind-recording' : ''} onClick={() => actions.current.record()}>{view.recording ? '结束记录' : view.hasEcho ? '重新记录' : '记录行动'} <kbd>Q</kbd></button>}<button onClick={() => actions.current.interact()}>互动 <kbd>E</kbd></button></div></footer>
    </>}
    {phase === 'intro' && <div className="rewind-overlay"><section className="rewind-intro"><p className="rewind-eyebrow">一间房间 · 三段时间 · 一个出口</p><h1>房间<span>倒带</span><i>Rewind Room</i></h1><p className="rewind-lead">日落停在了窗外。<br />让物品回到过去，让过去的自己留下。</p><div className="rewind-instructions"><span><kbd>WASD</kbd> 行走</span><span>拖动画面转向</span><span><kbd>R</kbd> 倒带物品</span><span><kbd>E</kbd> 互动</span></div><button className="rewind-start" onClick={start} autoFocus>进入时间 <span>↗</span></button><p className="rewind-footnote">约 5 分钟 · 无需下载 · 支持屏幕按键</p></section><div className="rewind-cover-stamp" aria-hidden="true">↶<span>倒退物品的时间<br />继续自己的故事</span></div></div>}
    {phase === 'paused' && <div className="rewind-modal"><section><p className="rewind-eyebrow">时间暂时停下</p><h2>休息一下。</h2><p>当前进度保留在本次游戏中。</p><button className="rewind-start" onClick={() => changePhase('playing')} autoFocus>继续游戏 →</button><button onClick={start}>重新开始</button></section></div>}
    {phase === 'won' && <div className="rewind-modal"><section><p className="rewind-eyebrow">三段时间，终于接上。</p><h2>日落之后，<br />故事继续。</h2><p>你把钥匙从过去带回，让小车穿过断桥，<br />也学会了与过去的自己合作。</p><div className="rewind-result"><span>{Math.floor(view.seconds / 60)}分{view.seconds % 60}秒 <small>解谜用时</small></span><span>3 / 3 <small>时间机关</small></span></div><button className="rewind-start" onClick={start}>再走一次 ↶</button>{close}</section></div>}
    {phase === 'error' && <div className="rewind-modal"><section><h2>画面暂时中断</h2><p>浏览器未能继续运行三维画面。可以重新加载游戏，或返回房间。</p><button className="rewind-start" onClick={() => { changePhase('intro'); setEpoch(value => value + 1); }}>重新加载游戏</button>{close}</section></div>}
  </dialog>;
}
