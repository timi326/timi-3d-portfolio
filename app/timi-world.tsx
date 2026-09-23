'use client';

import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { PointerLockControls } from 'three/examples/jsm/controls/PointerLockControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { buildApartment, isBlocked, PLAYER_HEIGHT, ROOM_START, type Collider } from './apartment-scene';
import ProjectDesktop, { type DesktopMode } from './project-desktop';
import { loadTimiAvatar, type AvatarMood } from './timi-avatar';

const RewindGame = lazy(() => import('./games/rewind/rewind-game'));
const OrbitExplorer = lazy(() => import('./orbit-explorer'));
const TimiChat = lazy(() => import('./timi-chat'));
type RoomMode = DesktopMode | 'orbit' | 'chat';

type Quality = 'eco' | 'balanced' | 'ultra';

// Keep normal quality at least one physical render pixel per CSS pixel.
function renderRatio(quality: Quality, width: number, height: number) {
  const dpr = window.devicePixelRatio || 1;
  if (quality === 'eco') return Math.min(dpr, .85);
  if (quality === 'balanced') return 1;
  const budget = 8000000;
  return Math.max(1, Math.min(dpr, 2,
    Math.sqrt(budget / Math.max(1, width * height))));
}
const keyState: Record<string, boolean> = {};

export default function TimiWorld() {
  const mountRef = useRef<HTMLDivElement>(null);
  const controlsRef = useRef<PointerLockControls | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const lightingQualityRef = useRef<((quality: Quality) => void) | null>(null);
  const sunRef = useRef<THREE.DirectionalLight | null>(null);
  const composerRef = useRef<EffectComposer | null>(null);
  const aoRef = useRef<GTAOPass | null>(null);
  const qualityRef = useRef<Quality>('balanced');
  const invalidateRef = useRef(true);
  const playerDotRef = useRef<HTMLSpanElement>(null);
  const touchActiveRef = useRef(false);
  const desktopRef = useRef<RoomMode | null>(null);
  const hotspotRef = useRef<RoomMode | null>(null);
  const avatarMoodRef = useRef<AvatarMood>('idle');
  const focusAvatarRef = useRef<(() => void) | null>(null);
  const restoreCameraRef = useRef<(() => void) | null>(null);
  const [avatarStatus, setAvatarStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const onAvatarMood = useCallback((mood: AvatarMood) => { avatarMoodRef.current = mood; }, []);
  const [desktop, setDesktop] = useState<RoomMode | null>(null);
  const [hotspot, setHotspot] = useState<RoomMode | null>(null);
  const [assetError, setAssetError] = useState(false);
  const [progress, setProgress] = useState(0);
  const [ready, setReady] = useState(false);
  const [active, setActive] = useState(false);
  const [dragLook, setDragLook] = useState(false);
  const [quality, setQuality] = useState<Quality>('balanced');
  const [isTouch] = useState(() => typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches);

  const setMoveKey = useCallback((code: string, pressed: boolean) => {
    keyState[code] = pressed;
  }, []);

  const enter = useCallback(async () => {
    if (isTouch) {
      touchActiveRef.current = true;
      setActive(true);
      return;
    }
    try {
      const canvas = rendererRef.current?.domElement;
      if (!canvas) return;
      await canvas.requestPointerLock();
    } catch {
      touchActiveRef.current = true;
      setDragLook(true);
      setActive(true);
    }
  }, [isTouch]);

  const openDesktop = useCallback((mode: RoomMode) => {
    if (mode === 'chat' && desktopRef.current !== 'chat') focusAvatarRef.current?.();
    desktopRef.current = mode;
    setDesktop(mode);
    touchActiveRef.current = false;
    Object.keys(keyState).forEach((key) => { keyState[key] = false; });
    controlsRef.current?.unlock();
    setActive(false);
  }, []);

  const closeDesktop = useCallback(() => {
    restoreCameraRef.current?.(); restoreCameraRef.current = null;
    avatarMoodRef.current = 'idle';
    desktopRef.current = null;
    invalidateRef.current = true;
    setDesktop(null);
    // Resume exploration immediately; reacquire mouse after the modal unmounts.
    touchActiveRef.current = true;
    setActive(true);
    requestAnimationFrame(() => { void enter(); });
  }, [enter]);

  const pauseChat = useCallback(() => {
    restoreCameraRef.current?.(); restoreCameraRef.current = null;
    avatarMoodRef.current = 'idle';
    desktopRef.current = null;
    touchActiveRef.current = false;
    Object.keys(keyState).forEach(key => { keyState[key] = false; });
    invalidateRef.current = true;
    setDesktop(null);
    setActive(false);
  }, []);

  useEffect(() => {
    qualityRef.current = quality;
    invalidateRef.current = true;
    const renderer = rendererRef.current;
    const sun = sunRef.current;
    lightingQualityRef.current?.(quality);
    if (!renderer) return;
    const size = renderer.getSize(new THREE.Vector2());
    const cappedRatio = renderRatio(quality, size.x, size.y);
    renderer.setPixelRatio(cappedRatio);
    composerRef.current?.setPixelRatio(cappedRatio);
    if (aoRef.current) {
      aoRef.current.enabled = quality === 'ultra';
      aoRef.current.setSize(Math.ceil(size.x * cappedRatio * .5), Math.ceil(size.y * cappedRatio * .5));
    }
    renderer.shadowMap.enabled = quality !== 'eco';
    renderer.shadowMap.needsUpdate = true;
    if (sun) {
      const mapSize = quality === 'ultra' ? 2048 : 1024;
      sun.shadow.mapSize.set(mapSize, mapSize);
      sun.shadow.map?.dispose();
      sun.shadow.map = null;
    }
  }, [quality]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    let disposed = false;
    const colliders: Collider[] = [];
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#71859e');
    scene.fog = new THREE.Fog('#a19389', 100, 650);

    const camera = new THREE.PerspectiveCamera(58, 1, 0.06, 700);
    camera.layers.enable(1);
    camera.position.copy(ROOM_START);
    camera.rotation.order = 'YXZ';
    camera.lookAt(.05, 1.28, -2.0);

    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.AgXToneMapping;
    renderer.toneMappingExposure = 1.08;
    renderer.shadowMap.enabled = true;
    // All furniture and lights are static. Rebuild only on load/quality changes.
    renderer.shadowMap.autoUpdate = false;
    renderer.shadowMap.needsUpdate = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1));
    renderer.domElement.setAttribute('aria-label', 'Timi 的三维 AI 创作房间');
    renderer.domElement.tabIndex = 0;
    mount.appendChild(renderer.domElement);
    rendererRef.current = renderer;
    // Canvas antialiasing does not apply to the composer's offscreen target.
    const sceneTarget = new THREE.WebGLRenderTarget(1, 1, {
      type: THREE.HalfFloatType, samples: Math.min(2, renderer.capabilities.maxSamples),
    });
    const composer = new EffectComposer(renderer, sceneTarget);
    const renderPass = new RenderPass(scene, camera);
    const ao = new GTAOPass(scene, camera, 1, 1);
    ao.enabled = qualityRef.current === 'ultra';
    ao.updateGtaoMaterial({ radius: 0.35, distanceExponent: 2, thickness: 0.8, samples: 8 });
    ao.blendIntensity = 0.85;
    const outputPass = new OutputPass();
    composer.addPass(renderPass); composer.addPass(ao); composer.addPass(outputPass);
    composerRef.current = composer; aoRef.current = ao;
    const pmrem = new THREE.PMREMGenerator(renderer);
    const environmentTarget = pmrem.fromScene(new RoomEnvironment(), 0.04);
    pmrem.dispose();
    scene.environment = environmentTarget.texture;
    scene.environmentIntensity = 0.13;
    setProgress(0.18);

    const controls = new PointerLockControls(camera, renderer.domElement);
    controlsRef.current = controls;
    const onLock = () => { touchActiveRef.current = false; setDragLook(false); setActive(true); };
    const clearKeys = () => Object.keys(keyState).forEach((key) => { keyState[key] = false; });
    const onUnlock = () => { clearKeys(); setActive(false); };
    controls.addEventListener('lock', onLock);
    controls.addEventListener('unlock', onUnlock);

    const built = buildApartment(scene, colliders, (value) => {
      if (!disposed) setProgress(0.24 + value * 0.58);
    });
    sunRef.current = built.sun;
    lightingQualityRef.current = built.setQuality;
    built.setQuality(qualityRef.current);
    setProgress(0.24);

    const resize = () => {
      const width = Math.max(mount.clientWidth, 1);
      const height = Math.max(mount.clientHeight, 1);
      camera.aspect = width / height; camera.fov = camera.aspect > 1.35 ? 49 : 60;
      camera.updateProjectionMatrix();
      const ratio = renderRatio(qualityRef.current, width, height);
      renderer.setPixelRatio(ratio);
      renderer.setSize(width, height, false);
      composer.setPixelRatio(ratio);
      composer.setSize(width, height);
      ao.setSize(Math.ceil(width * ratio * .5), Math.ceil(height * ratio * .5));
      invalidateRef.current = true;
    };
    resize();
    window.addEventListener('resize', resize);

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code === 'Escape' && touchActiveRef.current) {
        touchActiveRef.current = false; setActive(false); clearKeys(); return;
      }
      if (desktopRef.current) return;
      if (event.code === 'KeyE' && !event.repeat && hotspotRef.current && (controls.isLocked || touchActiveRef.current)) {
        event.preventDefault();
        openDesktop(hotspotRef.current);
        return;
      }
      if (controls.isLocked || touchActiveRef.current) keyState[event.code] = true;
    };
    const onKeyUp = (event: KeyboardEvent) => { keyState[event.code] = false; };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', clearKeys);

    let touching = false;
    let touchX = 0;
    let touchY = 0;
    const onPointerDown = (event: PointerEvent) => {
      if (controls.isLocked && hotspotRef.current === 'chat' && event.button === 0) { openDesktop('chat'); return; }
      if (!touchActiveRef.current || (event.pointerType === 'mouse' && event.button !== 0)) return;
      renderer.domElement.setPointerCapture(event.pointerId);
      touching = true;
      touchX = event.clientX;
      touchY = event.clientY;
    };
    const onPointerMove = (event: PointerEvent) => {
      if (!touching || !touchActiveRef.current) return;
      const deltaX = event.clientX - touchX;
      const deltaY = event.clientY - touchY;
      touchX = event.clientX;
      touchY = event.clientY;
      camera.rotation.y -= deltaX * 0.0042;
      camera.rotation.x = THREE.MathUtils.clamp(camera.rotation.x - deltaY * 0.0036, -1.18, 1.18);
    };
    const onPointerUp = () => { touching = false; };
    renderer.domElement.addEventListener('pointerdown', onPointerDown);
    renderer.domElement.addEventListener('pointermove', onPointerMove);
    renderer.domElement.addEventListener('pointerup', onPointerUp);
    renderer.domElement.addEventListener('pointercancel', onPointerUp);

    const timer = new THREE.Timer();
    timer.connect(document);
    const forward = new THREE.Vector3();
    const right = new THREE.Vector3();
    const movement = new THREE.Vector3();
    const raycaster = new THREE.Raycaster();
    raycaster.far = 3.3;
    const center = new THREE.Vector2(0, 0);
    const renderedPosition = new THREE.Vector3(Infinity, Infinity, Infinity);
    const renderedRotation = new THREE.Quaternion();
    let cameraTransition: { position: THREE.Vector3; rotation: THREE.Quaternion } | null = null;
    let lastHotspotCheck = 0;
    let frame = 0;
    const animate = (timestamp: number) => {
      frame = requestAnimationFrame(animate);
      timer.update(timestamp);
      const delta = Math.min(timer.getDelta(), 0.04);
      if (document.hidden || desktopRef.current === 'television' || desktopRef.current === 'orbit') return;
      if (controls.isLocked || touchActiveRef.current) {
        const horizontal = Number(Boolean(keyState.KeyD || keyState.ArrowRight)) - Number(Boolean(keyState.KeyA || keyState.ArrowLeft));
        const vertical = Number(Boolean(keyState.KeyW || keyState.ArrowUp)) - Number(Boolean(keyState.KeyS || keyState.ArrowDown));
        if (horizontal || vertical) {
          camera.getWorldDirection(forward);
          forward.y = 0;
          forward.normalize();
          right.crossVectors(forward, camera.up).normalize();
          movement.set(0, 0, 0).addScaledVector(forward, vertical).addScaledVector(right, horizontal).normalize();
          const speed = keyState.ShiftLeft || keyState.ShiftRight ? 3.2 : 1.85;
          const nextX = camera.position.x + movement.x * speed * delta;
          const nextZ = camera.position.z + movement.z * speed * delta;
          if (!isBlocked(nextX, camera.position.z, colliders)) camera.position.x = nextX;
          if (!isBlocked(camera.position.x, nextZ, colliders)) camera.position.z = nextZ;
        }
      }
      if (cameraTransition) {
        const amount = 1 - Math.exp(-delta * 7);
        camera.position.lerp(cameraTransition.position, amount);
        camera.quaternion.slerp(cameraTransition.rotation, amount);
        if (camera.position.distanceTo(cameraTransition.position) < .002 && camera.quaternion.angleTo(cameraTransition.rotation) < .002) {
          camera.position.copy(cameraTransition.position); camera.quaternion.copy(cameraTransition.rotation); cameraTransition = null;
        }
      }
      camera.position.y = PLAYER_HEIGHT;
      const exploring = !desktopRef.current && (controls.isLocked || touchActiveRef.current);
      let nextHotspot: RoomMode | null = exploring ? hotspotRef.current : null;
      if (exploring && timestamp - lastHotspotCheck >= 100) {
        lastHotspotCheck = timestamp;
        nextHotspot = null;
        raycaster.setFromCamera(center, camera);
        const hit = raycaster.intersectObjects(built.interactionTargets, false)[0];
        if (hit) {
          // Walls and furniture between the player and the screen block interaction.
          const interior = scene.getObjectByName('Timi Studio / Blender interior');
          const blocker = interior ? raycaster.intersectObject(interior, true)[0] : undefined;
          if (!blocker || blocker.distance >= hit.distance - 0.12) nextHotspot = hit.object.userData.desktopMode as RoomMode;
        }
      }
      if (hotspotRef.current !== nextHotspot) {
        hotspotRef.current = nextHotspot;
        setHotspot(nextHotspot);
      }
      if (playerDotRef.current) {
        const x = (camera.position.x + 3.36) / 8.96 * 100;
        const y = (camera.position.z + 3.36) / 7.616 * 100;
        playerDotRef.current.style.left = `${x}%`;
        playerDotRef.current.style.top = `${y}%`;
        playerDotRef.current.style.transform = `translate(-50%, -50%) rotate(${-camera.rotation.y}rad)`;
      }
      const avatarActive = Boolean(avatar && (!desktopRef.current || desktopRef.current === 'chat'));
      if (avatarActive) avatar?.update(delta, avatarMoodRef.current, camera.position, desktopRef.current === 'chat');
      const animated = built.update(exploring) || avatarActive;
      const changed = !renderedPosition.equals(camera.position) || !renderedRotation.equals(camera.quaternion);
      // Menus, a paused camera and hidden tabs do not need continuous GPU work.
      if (!changed && !animated && !invalidateRef.current) return;
      // Balanced uses native canvas MSAA and avoids a second geometry pass for AO.
      if (qualityRef.current === 'ultra') composer.render(delta);
      else renderer.render(scene, camera);
      renderedPosition.copy(camera.position); renderedRotation.copy(camera.quaternion);
      invalidateRef.current = false;
    };
    frame = requestAnimationFrame(animate);

    let avatar: Awaited<ReturnType<typeof loadTimiAvatar>> = null;
    built.furnitureReady
      .then(async () => {
        if (disposed) return;
        try {
          avatar = await loadTimiAvatar(scene, colliders, built.interactionTargets, () => disposed);
          if (!avatar || disposed) return;
          setAvatarStatus('ready');
          focusAvatarRef.current = () => {
            if (!avatar) return;
            const previousPosition = camera.position.clone(); const previousRotation = camera.quaternion.clone();
            restoreCameraRef.current = () => { cameraTransition = null; camera.position.copy(previousPosition); camera.quaternion.copy(previousRotation); };
            const p = avatar.position;
            const spots = [[-1.2,2],[-.8,2.2],[-1.6,1.8],[0,2.3]];
            const spot = spots.find(([x,z]) => !isBlocked(p.x+x,p.z+z,colliders));
            if (spot) camera.position.set(p.x+spot[0],PLAYER_HEIGHT,p.z+spot[1]);
            const aim = new THREE.Vector3(p.x, window.innerWidth < 700 ? .45 : .8, p.z);
            camera.lookAt(aim);
            if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
              cameraTransition = { position: camera.position.clone(), rotation: camera.quaternion.clone() };
              camera.position.copy(previousPosition); camera.quaternion.copy(previousRotation);
            }
            invalidateRef.current = true;
          };
          if (desktopRef.current === 'chat') focusAvatarRef.current();
        } catch { if (!disposed) setAvatarStatus('error'); }
      })
      .catch(() => { if (!disposed) setAssetError(true); })
      .then(() => {
        if (disposed) return;
        // A saved layout may put furniture at the usual entrance.
        if (isBlocked(camera.position.x, camera.position.z, colliders)) {
          const candidates: THREE.Vector3[] = [];
          for (let x = -2.9; x <= 3; x += .25) for (let z = -2.9; z <= 3.9; z += .25) {
            if (!isBlocked(x, z, colliders)) candidates.push(new THREE.Vector3(x, PLAYER_HEIGHT, z));
          }
          candidates.sort((a, b) => a.distanceToSquared(ROOM_START) - b.distanceToSquared(ROOM_START));
          if (candidates[0]) camera.position.copy(candidates[0]);
        }
        renderer.shadowMap.needsUpdate = true;
        invalidateRef.current = true;
        setProgress(0.9);
        return renderer.compileAsync(scene, camera);
      })
      .catch(() => undefined)
      .finally(() => {
        if (disposed) return;
        setProgress(1);
        window.setTimeout(() => {
          if (!disposed) setReady(true);
        }, 120);
      });

    return () => {
      disposed = true;
      focusAvatarRef.current = null; restoreCameraRef.current = null; avatar?.dispose();
      built.dispose();
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', resize);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', clearKeys);
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      renderer.domElement.removeEventListener('pointermove', onPointerMove);
      renderer.domElement.removeEventListener('pointerup', onPointerUp);
      renderer.domElement.removeEventListener('pointercancel', onPointerUp);
      controls.removeEventListener('lock', onLock);
      controls.removeEventListener('unlock', onUnlock);
      controls.disconnect();
      controls.dispose();
      timer.dispose();
      const disposedMaterials = new Set<THREE.Material>();
      scene.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return;
        object.geometry.dispose();
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        materials.forEach((material) => {
          if (!disposedMaterials.has(material)) {
            material.dispose();
            disposedMaterials.add(material);
          }
        });
      });
      built.textures.forEach((texture) => texture.dispose());
      environmentTarget.dispose();
      renderPass.dispose(); ao.dispose(); outputPass.dispose(); composer.dispose();
      renderer.dispose();
      renderer.domElement.remove();
      rendererRef.current = null;
      composerRef.current = null; aoRef.current = null;
      controlsRef.current = null;
      sunRef.current = null;
      lightingQualityRef.current = null;
      Object.keys(keyState).forEach((key) => { keyState[key] = false; });
    };
  }, [openDesktop]);

  return (
    <div className={`apartment-world ${active ? 'is-active' : ''} ${desktop === 'chat' ? 'is-avatar-chat' : ''}`}>
      <div ref={mountRef} className="experience" />

      <header className="scene-header" aria-label="场景信息">
        <div className="brand-lockup">
          <span className="brand-mark">T.</span>
          <div><p>Timi Studio</p><span>AI creator · Chen Chutao</span></div>
        </div>
        <div className="quality-control" aria-label="画质设置">
          <button type="button" onClick={() => openDesktop('chat')}>数字分身</button>
          <a href="/editor" className="scene-editor-link">编辑场景</a>
          {(['eco', 'balanced', 'ultra'] as Quality[]).map((option) => (
            <button
              key={option}
              type="button"
              className={quality === option ? 'selected' : ''}
              onClick={() => setQuality(option)}
            >
              {option === 'eco' ? '省电' : option === 'balanced' ? '平衡' : '精细'}
            </button>
          ))}
        </div>
      </header>

      <div className="reticle" aria-hidden="true" />
      {active && hotspot && !desktop && <button type="button" className="screen-interaction" onClick={() => openDesktop(hotspot)}><kbd>E</kbd>{hotspot === 'chat' ? '和 Timi 对话' : hotspot === 'computer' ? '打开我的电脑' : hotspot === 'orbit' ? '观测星空' : '打开游戏电视'}</button>}
      {desktop === 'computer' && <ProjectDesktop mode={desktop} onClose={closeDesktop} />}
      {desktop === 'chat' && <Suspense fallback={<div className="game-loading-panel" role="status">正在打开对话…</div>}><TimiChat onClose={closeDesktop} onPause={pauseChat} inRoom onMoodChange={onAvatarMood} /></Suspense>}
      {desktop === 'chat' && <div className="avatar-presence" role="status">{avatarStatus === 'ready' ? 'Timi · AI 数字分身' : avatarStatus === 'loading' ? '人物正在走进房间…' : '人物加载失败，仍可文字对话'}</div>}
      {desktop === 'television' && <Suspense fallback={<div className="game-loading-panel" role="status">正在打开《房间倒带》…</div>}><RewindGame onClose={closeDesktop} /></Suspense>}
      {desktop === 'orbit' && <Suspense fallback={<div className="game-loading-panel" role="status">正在打开星空观测室…</div>}><OrbitExplorer onClose={closeDesktop} /></Suspense>}
      {assetError && <p className="asset-load-note" role="status">房间未能完整加载，请刷新重试。你仍可直接查看作品。</p>}

      <aside className="walk-hint" aria-label="操作说明">
        <span className="hint-label">Explore the room</span>
        <p><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> 行走</p>
        <p><kbd>Shift</kbd> 加速 · <kbd>E</kbd> 打开屏幕 · <kbd>Esc</kbd> 暂停</p>
      </aside>

      <div className="mini-map" aria-label="创作房间位置示意">
        <span className="map-label">Timi / Studio</span>
        <i className="room-line room-line-a" />
        <i className="room-line room-line-b" />
        <i className="room-line room-line-c" />
        <span ref={playerDotRef} className="player-dot" />
      </div>

      {(isTouch || dragLook) && active && (
        <div className="touch-controls" aria-label="移动控制">
          <span>拖动画面转向</span>
          <button type="button" aria-label="向前" onPointerDown={() => setMoveKey('KeyW', true)} onPointerUp={() => setMoveKey('KeyW', false)} onPointerCancel={() => setMoveKey('KeyW', false)}>↑</button>
          <button type="button" aria-label="向左" onPointerDown={() => setMoveKey('KeyA', true)} onPointerUp={() => setMoveKey('KeyA', false)} onPointerCancel={() => setMoveKey('KeyA', false)}>←</button>
          <button type="button" aria-label="向后" onPointerDown={() => setMoveKey('KeyS', true)} onPointerUp={() => setMoveKey('KeyS', false)} onPointerCancel={() => setMoveKey('KeyS', false)}>↓</button>
          <button type="button" aria-label="向右" onPointerDown={() => setMoveKey('KeyD', true)} onPointerUp={() => setMoveKey('KeyD', false)} onPointerCancel={() => setMoveKey('KeyD', false)}>→</button>
        </div>
      )}

      <div className={`loading-screen ${ready ? 'finished' : ''}`} aria-hidden={ready}>
        <div className="loading-identity">
          <div className="loading-window-mark" aria-hidden="true"><i /><span /><b /></div>
          <p className="loading-kicker">暮色工作室</p>
          <h1 className="loading-wordmark">Timi<span>.</span></h1>
          <p className="loading-caption">把日落留在房间，把想法变成作品。</p>
          <div className="loading-progress-wrap">
            <div className="loading-progress-label"><span role="status">{assetError ? '加载遇到问题，请刷新重试' : progress < .24 ? '正在打开工作室' : progress < .9 ? '正在载入房间与作品' : progress < 1 ? '正在准备画面' : '准备就绪'}</span><span>{Math.round(progress * 100)}<small>%</small></span></div>
            <div className="loading-track" role="progressbar" aria-label="房间加载进度" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)}><span style={{ transform: `scaleX(${progress})` }} /></div>
          </div>
        </div>
        <div className="loading-footer"><span>Timi Studio</span><span>第一次见面，需要一点时间。</span></div>
      </div>

      {ready && !active && !desktop && (
        <div className="entry-screen">
          <div className="entry-card">
            <p className="entry-eyebrow">Timi · 暮色工作室</p>
            <h1>把日落<br />留在房间</h1>
            <p className="entry-copy">我是陈楚涛，使用 AI 创作的大学生。窗边的电脑里，放着我的作品与实验。</p>
            <button type="button" className="enter-button" onClick={enter} disabled={assetError}>
              <span>{isTouch ? '触控探索' : '进入房间'}</span><i aria-hidden="true">→</i>
            </button>
            <button type="button" className="entry-project-button" onClick={() => openDesktop('computer')}>直接查看我的作品 ↗</button>
            <button type="button" className="entry-project-button" onClick={() => openDesktop('chat')}>和数字分身聊聊 ↗</button>
            <p className="entry-note">{isTouch ? '拖动画面转向，使用方向键移动' : '进入后移动鼠标观察，按 Esc 随时暂停'}</p>
          </div>
        </div>
      )}

      <div className="asset-credit">
        Timi Studio · Blender · <a href="/model-credits.html" target="_blank" rel="noreferrer">模型来源</a>
      </div>
    </div>
  );
}
