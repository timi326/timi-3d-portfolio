'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { TransformControls, type TransformControlsMode } from 'three/examples/jsm/controls/TransformControls.js';
import { buildApartment, type Collider } from './apartment-scene';
import { readTransform, type AssetTransform, type LayoutDocument, type SceneAsset, type SceneLayout } from './scene-layout';
import './scene-editor.css';

type Selection = AssetTransform & { label: string; dimensions: number[] };
type API = {
  select: (id: string) => void; mode: (mode: TransformControlsMode) => void;
  value: (key: 'position' | 'rotation' | 'scale', axis: number, value: number) => void;
  focus: () => void; view: (top: boolean) => void; cutaway: (on: boolean) => void; snap: (on: boolean) => void;
  undo: () => void; redo: () => void; reset: () => void; save: () => void; reload: () => void;
  export: () => void; import: (json: string) => void;
};
const MODES = [['translate', '移动', 'W'], ['rotate', '旋转', 'E'], ['scale', '缩放', 'R']] as const;

export default function SceneEditor() {
  const mount = useRef<HTMLDivElement>(null);
  const api = useRef<API | null>(null);
  const file = useRef<HTMLInputElement>(null);
  const exportDialog = useRef<HTMLDialogElement>(null);
  const exportUrl = useRef('');
  const dirtyRef = useRef(false);
  const [assets, setAssets] = useState<{ id: string; label: string }[]>([]);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [mode, setMode] = useState<TransformControlsMode>('translate');
  const [query, setQuery] = useState('');
  const [progress, setProgress] = useState(0);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('正在加载场景资产…');
  const [dirty, setDirty] = useState(false);
  const [history, setHistory] = useState({ undo: false, redo: false });
  const [cutaway, setCutaway] = useState(true);
  const [snap, setSnap] = useState(false);
  const [exportData, setExportData] = useState({ json: '', url: '' });
  const [copyMessage, setCopyMessage] = useState('');

  useEffect(() => {
    const host = mount.current;
    if (!host) return;
    let disposed = false, invalid = true, selected: SceneAsset | undefined;
    let layout: SceneLayout | undefined, saved = '', dragBefore: LayoutDocument | undefined;
    const past: LayoutDocument[] = [], future: LayoutDocument[] = [];
    const scene = new THREE.Scene(); scene.background = new THREE.Color('#151f2a');
    const camera = new THREE.PerspectiveCamera(45, 1, .05, 700);
    camera.layers.enable(1);
    camera.position.set(9, 9, 12);
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.AgXToneMapping;
    renderer.toneMappingExposure = 1.15;
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.shadowMap.autoUpdate = false;
    renderer.domElement.setAttribute('aria-label', '可编辑的三维房间，点击家具选择资产');
    renderer.domElement.tabIndex = 0; host.appendChild(renderer.domElement);
    const orbit = new OrbitControls(camera, renderer.domElement);
    orbit.target.set(.5, .6, .2); orbit.minDistance = .5; orbit.maxDistance = 35;
    orbit.maxPolarAngle = Math.PI * .49; orbit.update();
    const transform = new TransformControls(camera, renderer.domElement);
    transform.setSize(.85); scene.add(transform.getHelper());
    const bounds = new THREE.Box3Helper(new THREE.Box3(), '#79d5ea');
    bounds.visible = false; scene.add(bounds);
    scene.add(new THREE.HemisphereLight('#c7d6e3', '#6a655b', 1.0));
    const colliders: Collider[] = [];
    const built = buildApartment(scene, colliders, p => { if (!disposed) setProgress(p); });
    const redraw = () => { invalid = true; };
    const refresh = () => {
      if (!layout) return;
      layout.updateCollisions(); renderer.shadowMap.needsUpdate = true; invalid = true;
      if (selected) {
        bounds.box.setFromObject(selected.object); bounds.visible = true;
        setSelection({ ...readTransform(selected), label: selected.label, dimensions: bounds.box.getSize(new THREE.Vector3()).toArray() });
      } else { bounds.visible = false; setSelection(null); }
      const changed = JSON.stringify(layout.snapshot()) !== saved;
      dirtyRef.current = changed; setDirty(changed);
      setHistory({ undo: past.length > 0, redo: future.length > 0 });
    };
    const remember = (before: LayoutDocument) => {
      if (!layout || JSON.stringify(before) === JSON.stringify(layout.snapshot())) return;
      past.push(before); if (past.length > 60) past.shift(); future.length = 0;
    };
    const commit = (mutate: () => void) => {
      if (!layout) return;
      const before = layout.snapshot();
      try { mutate(); remember(before); refresh(); setMessage('布局已修改，保存后会应用到本机网站。'); }
      catch (e) { setMessage(e instanceof Error ? e.message : '操作失败。'); }
    };
    const select = (id: string) => {
      selected = layout?.assets.find(a => a.id === id);
      if (selected) transform.attach(selected.object); else transform.detach();
      refresh();
    };
    const setCut = (on: boolean) => {
      const shell = layout?.model.getObjectByName('asset-shell');
      const exterior = layout?.model.getObjectByName('asset-exterior');
      if (shell) shell.visible = !on;
      if (exterior) exterior.visible = !on;
      renderer.shadowMap.needsUpdate = true; redraw();
    };
    const focus = () => {
      if (!selected) return;
      const box = new THREE.Box3().setFromObject(selected.object);
      const center = box.getCenter(new THREE.Vector3());
      const size = Math.max(box.getSize(new THREE.Vector3()).length(), 1);
      orbit.target.copy(center);
      camera.position.copy(center).add(new THREE.Vector3(1, .75, 1).normalize().multiplyScalar(size * 1.35));
      orbit.update(); redraw();
    };
    const switchMode = (next: TransformControlsMode) => { transform.setMode(next); setMode(next); redraw(); };
    orbit.addEventListener('change', redraw);
    transform.addEventListener('change', redraw);
    transform.addEventListener('dragging-changed', event => { orbit.enabled = !event.value; });
    transform.addEventListener('mouseDown', () => { dragBefore = layout?.snapshot(); });
    transform.addEventListener('objectChange', () => {
      if (selected) {
        for (const key of ['x', 'y', 'z'] as const) {
          selected.object.scale[key] = THREE.MathUtils.clamp(selected.object.scale[key], .05, 10);
          selected.object.position[key] = THREE.MathUtils.clamp(selected.object.position[key], -50, 50);
        }
      }
      refresh();
    });
    transform.addEventListener('mouseUp', () => { if (dragBefore) remember(dragBefore); dragBefore = undefined; refresh(); });
    let pointerStart = new THREE.Vector2(), gizmoClick = false;
    const pointerDown = (e: PointerEvent) => { pointerStart = new THREE.Vector2(e.clientX, e.clientY); gizmoClick = Boolean(transform.axis); };
    const pointerUp = (e: PointerEvent) => {
      if (e.button !== 0 || gizmoClick || transform.dragging || pointerStart.distanceTo(new THREE.Vector2(e.clientX, e.clientY)) > 5 || !layout) return;
      const rect = renderer.domElement.getBoundingClientRect();
      const ray = new THREE.Raycaster();
      ray.setFromCamera(new THREE.Vector2((e.clientX - rect.left) / rect.width * 2 - 1, -(e.clientY - rect.top) / rect.height * 2 + 1), camera);
      for (const hit of ray.intersectObject(layout.model, true)) {
        let o: THREE.Object3D | null = hit.object, id = '', visible = true;
        while (o) { if (!o.visible) visible = false; if (o.userData.editable) id = o.userData.assetId; o = o.parent; }
        if (!visible) continue;
        select(id); return;
      }
      select('');
    };
    renderer.domElement.addEventListener('pointerdown', pointerDown);
    renderer.domElement.addEventListener('pointerup', pointerUp);
    const resize = () => {
      const width = Math.max(1, host.clientWidth), height = Math.max(1, host.clientHeight);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5, Math.sqrt(1800000 / (width * height))));
      renderer.setSize(width, height, false); camera.aspect = width / height; camera.updateProjectionMatrix(); redraw();
    };
    const observer = new ResizeObserver(resize); observer.observe(host); resize();
    let frame = 0;
    const animate = () => { frame = requestAnimationFrame(animate); if (invalid && !document.hidden) { renderer.render(scene, camera); invalid = false; } };
    animate();
    const warn = (event: BeforeUnloadEvent) => { if (dirtyRef.current) event.preventDefault(); };
    window.addEventListener('beforeunload', warn);
    built.furnitureReady.then(result => {
      if (disposed || !result) return;
      layout = result; saved = JSON.stringify(layout.snapshot());
      setAssets(layout.assets.map(({ id, label }) => ({ id, label })));
      setCut(true); setReady(true); setMessage(layout.notice || '选择一件资产，开始调整布局。');
      api.current = {
        select, mode: switchMode, focus, cutaway: setCut,
        view: top => { orbit.target.set(.5, .6, .2); camera.position.set(top ? .5 : 9, top ? 13 : 9, top ? .21 : 12); orbit.update(); redraw(); },
        snap: on => { transform.setTranslationSnap(on ? .1 : null); transform.setRotationSnap(on ? Math.PI / 12 : null); transform.setScaleSnap(on ? .1 : null); },
        value: (key, axis, value) => commit(() => {
          if (!selected || !layout) return;
          const data = layout.snapshot(); data.assets.find(a => a.id === selected!.id)![key][axis] = value; layout.apply(data);
        }),
        undo: () => { if (!layout || !past.length) return; future.push(layout.snapshot()); layout.apply(past.pop()); refresh(); setMessage('已撤销'); },
        redo: () => { if (!layout || !future.length) return; past.push(layout.snapshot()); layout.apply(future.pop()); refresh(); setMessage('已重做'); },
        reset: () => commit(() => { if (layout && selected) { const data = layout.snapshot(); data.assets = data.assets.map(a => a.id === selected!.id ? structuredClone(selected!.initial) : a); layout.apply(data); } }),
        save: () => { try { layout!.save(); saved = JSON.stringify(layout!.snapshot()); refresh(); setMessage('已保存到本机浏览器，网站将使用此布局。'); } catch { setMessage('保存失败：浏览器存储不可用。请导出 JSON 备份。'); } },
        reload: () => commit(() => { layout!.apply(JSON.parse(saved)); }),
        export: () => {
          const json = JSON.stringify(layout!.snapshot(), null, 2);
          if (exportUrl.current) URL.revokeObjectURL(exportUrl.current);
          const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
          exportUrl.current = url; setExportData({ json, url }); setCopyMessage('');
          exportDialog.current?.showModal();
          setMessage('JSON 已生成，可下载文件或复制内容。');
        },
        import: json => commit(() => { layout!.apply(JSON.parse(json)); }),
      };
      refresh();
    }).catch(() => { if (!disposed) { setError('场景加载失败，请刷新页面重试。'); setMessage('场景加载失败'); } });
    const keys = (e: KeyboardEvent) => {
      if (exportDialog.current?.open) return;
      if (e.target instanceof HTMLElement && (e.target.matches('input,textarea,select') || e.target.isContentEditable)) return;
      if ((e.ctrlKey || e.metaKey) && ['s', 'z', 'y'].includes(e.key.toLowerCase())) {
        e.preventDefault();
        if (e.key.toLowerCase() === 's') api.current?.save();
        else if (e.key.toLowerCase() === 'y' || e.shiftKey) api.current?.redo(); else api.current?.undo();
      } else if (!e.ctrlKey && !e.metaKey && !e.altKey) {
        const key = e.key.toLowerCase();
        if (key === 'w') api.current?.mode('translate');
        if (key === 'e') api.current?.mode('rotate');
        if (key === 'r') api.current?.mode('scale');
        if (key === 'f') focus();
        if (key === 'escape') select('');
      }
    };
    window.addEventListener('keydown', keys);
    return () => {
      disposed = true; api.current = null; built.dispose(); observer.disconnect(); cancelAnimationFrame(frame);
      if (exportUrl.current) URL.revokeObjectURL(exportUrl.current);
      window.removeEventListener('keydown', keys); window.removeEventListener('beforeunload', warn);
      renderer.domElement.removeEventListener('pointerdown', pointerDown); renderer.domElement.removeEventListener('pointerup', pointerUp);
      transform.dispose(); orbit.dispose(); scene.remove(transform.getHelper());
      const materials = new Set<THREE.Material>();
      scene.traverse(o => {
        if (o instanceof THREE.Mesh || o instanceof THREE.LineSegments) {
          o.geometry.dispose(); (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => materials.add(m));
        }
      });
      materials.forEach(m => m.dispose()); built.textures.forEach(t => t.dispose()); built.sun.shadow.dispose();
      renderer.dispose(); renderer.domElement.remove();
    };
  }, []);

  const changeMode = (next: TransformControlsMode) => { setMode(next); api.current?.mode(next); };
  return <main className="scene-editor">
    <header className="editor-header">
      <div className="editor-title"><span className="editor-logo">T.</span><div><h1>场景编辑器</h1><p>TIMI STUDIO / LAYOUT</p></div></div>
      <span className={`editor-save-state ${dirty ? 'is-dirty' : ''}`}>{!ready ? '等待场景加载' : dirty ? '● 有未保存修改' : '布局已同步'}</span>
      <nav aria-label="布局操作">
        <Link href="/" onClick={e => { if (dirtyRef.current && !window.confirm('当前修改尚未保存。放弃这些修改并返回房间？')) e.preventDefault(); }}>返回房间</Link>
        <button disabled={!ready} onClick={() => file.current?.click()}>导入 JSON</button>
        <button disabled={!ready} onClick={() => api.current?.export()}>导出 JSON</button>
        <button className="editor-primary" disabled={!ready} onClick={() => api.current?.save()}>保存布局</button>
      </nav>
      <input ref={file} type="file" accept=".json,application/json" aria-label="导入布局文件" hidden onChange={async e => {
        const chosen = e.currentTarget.files?.[0]; e.currentTarget.value = '';
        if (!chosen) return;
        if (chosen.size > 1024 * 1024) { setMessage('布局文件不能超过 1 MB。'); return; }
        try { api.current?.import(await chosen.text()); } catch { setMessage('文件无法读取，请检查 JSON。'); }
      }} />
    </header>
    <aside className="editor-assets" aria-label="场景资产">
      <div className="editor-panel-heading"><h2>场景资产</h2><span>{assets.length} 件</span></div>
      <input className="editor-search" aria-label="搜索资产" placeholder="搜索家具、设备…" value={query} onChange={e => setQuery(e.target.value)} />
      <div className="editor-asset-list">
        {assets.filter(a => a.label.includes(query) || a.id.includes(query.toLowerCase())).map(a => <button key={a.id} className={selection?.id === a.id ? 'selected' : ''} aria-pressed={selection?.id === a.id} onClick={() => api.current?.select(a.id)}><span className="asset-symbol">◇</span><span>{a.label}</span></button>)}
        {ready && !assets.some(a => a.label.includes(query) || a.id.includes(query.toLowerCase())) && <p className="editor-empty">没有匹配的资产</p>}
      </div>
      <div className="editor-static-note">房间墙体与地板已锁定<br />家具按整件选择，部件一起移动</div>
    </aside>
    <section className="editor-stage" aria-label="三维编辑视图">
      <div className="editor-toolbar" role="toolbar" aria-label="变换工具">
        <div>{MODES.map(([value, label, key]) => <button disabled={!ready} key={value} className={mode === value ? 'selected' : ''} aria-pressed={mode === value} onClick={() => changeMode(value)}>{label}<kbd>{key}</kbd></button>)}</div>
        <div><button disabled={!history.undo} onClick={() => api.current?.undo()} title="Ctrl+Z">撤销</button><button disabled={!history.redo} onClick={() => api.current?.redo()} title="Ctrl+Shift+Z">重做</button></div>
      </div>
      <div ref={mount} className="editor-canvas" />
      <div className="editor-view-tools"><button disabled={!ready} onClick={() => api.current?.view(false)}>全景</button><button disabled={!ready} onClick={() => api.current?.view(true)}>俯视</button><button disabled={!selection} onClick={() => api.current?.focus()}>聚焦 F</button></div>
      <div className="editor-view-options"><label><input type="checkbox" checked={cutaway} onChange={e => { setCutaway(e.target.checked); api.current?.cutaway(e.target.checked); }} />隐藏墙顶</label><label><input type="checkbox" checked={snap} onChange={e => { setSnap(e.target.checked); api.current?.snap(e.target.checked); }} />吸附 0.1m / 15°</label></div>
      {!ready && <div className="editor-loading" role="status">{error || `正在加载场景 ${Math.round(progress * 100)}%`}{error && <button onClick={() => window.location.reload()}>重新加载</button>}</div>}
      <p className="editor-navigation-hint">点击选择 · 拖动旋转视角 · 右键平移 · 滚轮缩放</p>
    </section>
    <aside className="editor-inspector" aria-label="资产属性">
      <div className="editor-panel-heading"><h2>资产属性</h2><span>XYZ</span></div>
      {selection ? <>
        <div className="editor-selection"><span>当前选择</span><h3>{selection.label}</h3><code>{selection.id}</code></div>
        {(['position', 'rotation', 'scale'] as const).map((key, groupIndex) => <fieldset key={key} className="editor-transform"><legend>{['位置', '旋转', '缩放'][groupIndex]}<span>{['米 · 世界坐标', '度 · XYZ', '倍'][groupIndex]}</span></legend><div>
          {(['X', 'Y', 'Z'] as const).map((axis, index) => <label key={axis} className={`axis-${axis.toLowerCase()}`}><span>{axis}</span><input key={`${selection.id}-${key}-${selection[key][index]}`} type="number" step={key === 'rotation' ? 1 : .1} min={key === 'scale' ? .05 : key === 'rotation' ? -3600 : -50} max={key === 'scale' ? 10 : key === 'rotation' ? 3600 : 50} defaultValue={Number(selection[key][index].toFixed(4))} aria-label={`${['位置', '旋转', '缩放'][groupIndex]} ${axis}`} onBlur={e => { const value = e.currentTarget.valueAsNumber; e.currentTarget.value = String(Number(selection[key][index].toFixed(4))); if (Number.isFinite(value)) api.current?.value(key, index, value); else { e.currentTarget.value = String(selection[key][index]); setMessage('请输入有效数值。'); } }} onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }} /></label>)}
        </div></fieldset>)}
        <div className="editor-dimensions"><span>当前包围尺寸 · 米</span><p>{selection.dimensions.map(v => v.toFixed(2)).join(' × ')}</p></div>
        <button className="editor-reset" onClick={() => api.current?.reset()}>重置此资产</button>
      </> : <div className="editor-empty-selection"><span>◇</span><h3>选择一件资产</h3><p>点击场景中的家具，或从左侧列表选择。拖动操作轴，或输入精确数值。</p></div>}
      <div className="editor-save-note"><strong>布局保存在本机浏览器</strong><p>保存后返回房间即可查看。换设备或长期备份，请导出 JSON。</p><button disabled={!ready || !dirty} onClick={() => api.current?.reload()}>恢复上次保存</button></div>
    </aside>
    <footer className="editor-status" role="status"><span>{message}</span><span>Y 轴向上 · 单位：米</span></footer>
    <dialog ref={exportDialog} className="editor-export-dialog" aria-labelledby="export-title">
      <header><div><h2 id="export-title">导出场景布局</h2><p>{assets.length} 件资产 · 位置 / 旋转 / 缩放</p></div><button aria-label="关闭导出窗口" onClick={() => exportDialog.current?.close()}>关闭</button></header>
      <textarea aria-label="布局 JSON" readOnly value={exportData.json} spellCheck={false} />
      <footer><span role="status">{copyMessage || '保存为 .json 文件，即可随时重新导入。'}</span><button onClick={async () => { try { await navigator.clipboard.writeText(exportData.json); setCopyMessage('完整 JSON 已复制'); } catch { setCopyMessage('请在上方文本框中全选并复制。'); } }}>复制 JSON</button><a href={exportData.url} download="timi-scene-layout.json">下载 .json</a></footer>
    </dialog>
  </main>;
}
