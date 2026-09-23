import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { RewindState, STATIONS, type Point } from './rewind-state';

export function createRewindScene(scene: THREE.Scene, invalidate: () => void = () => {}) {
  scene.background = new THREE.Color('#253643');
  scene.fog = new THREE.Fog('#334454', 18, 36);
  const textures: THREE.Texture[] = [];
  const material = (color: string, roughness = .7, metalness = 0) => new THREE.MeshStandardMaterial({ color, roughness, metalness });
  const wood = material('#98744f'), edge = material('#5d4335'), plaster = material('#c2bbb0');
  const dark = material('#283d49'), brass = material('#cda967', .4, .55), ceramic = material('#96c8c5', .35);
  const glow = new THREE.MeshStandardMaterial({ color: '#70dad4', emissive: '#45c8c3', emissiveIntensity: .6, roughness: .4 });
  const box = (parent: THREE.Object3D, size: number[], pos: number[], mat: THREE.Material, rounded = .02) => {
    const mesh = new THREE.Mesh(rounded ? new RoundedBoxGeometry(size[0], size[1], size[2], 1, rounded) : new THREE.BoxGeometry(...size as [number, number, number]), mat);
    mesh.position.set(...pos as [number, number, number]); mesh.castShadow = true; mesh.receiveShadow = true; parent.add(mesh); return mesh;
  };
  const sphere = (parent: THREE.Object3D, r: number, pos: number[], mat: THREE.Material) => {
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(r, 14, 10), mat); mesh.position.set(...pos as [number, number, number]); mesh.castShadow = true; parent.add(mesh); return mesh;
  };
  const label = (text: string, pos: number[], width = 1.8) => {
    const canvas = document.createElement('canvas'); canvas.width = 768; canvas.height = 144;
    const ctx = canvas.getContext('2d')!; ctx.fillStyle = '#233b48'; ctx.fillRect(0, 0, 768, 144);
    ctx.strokeStyle = '#bcaa84'; ctx.lineWidth = 3; ctx.strokeRect(7, 7, 754, 130);
    ctx.fillStyle = '#ede6d5'; ctx.font = '38px Microsoft YaHei'; ctx.textAlign = 'center'; ctx.fillText(text, 384, 86);
    const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; textures.push(texture);
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture })); sprite.position.set(...pos as [number, number, number]); sprite.scale.set(width, width * 144 / 768, 1); scene.add(sprite);
  };
  const ambient = new THREE.HemisphereLight('#d2e7ec', '#67503b', 2); scene.add(ambient);
  const sun = new THREE.DirectionalLight('#ffcd93', 3.2); sun.position.set(-3, 7, -4); sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024); Object.assign(sun.shadow.camera, { left: -7, right: 7, top: 7, bottom: -7, near: .5, far: 22 });
  sun.shadow.normalBias = .035; scene.add(sun);
  const floor = new THREE.InstancedMesh(new THREE.BoxGeometry(1.21, .12, 2.45), wood, 32);
  const matrix = new THREE.Matrix4(); let index = 0;
  for (let x = 0; x < 8; x++) for (let z = 0; z < 4; z++) { matrix.makeTranslation(-4.32 + x * 1.235, -.07, -3.7 + z * 2.475); floor.setMatrixAt(index++, matrix); }
  floor.receiveShadow = true; scene.add(floor);
  box(scene, [.2, 4, 10.1], [-5, 2, 0], plaster, 0); box(scene, [.2, 4, 10.1], [5, 2, 0], plaster, 0);
  box(scene, [10, 4, .2], [0, 2, 5], plaster, 0);
  box(scene, [10, .85, .2], [0, .425, -5], plaster, 0); box(scene, [10, .45, .2], [0, 3.775, -5], plaster, 0);
  box(scene, [2.1, 2.7, .2], [-3.95, 2.2, -5], plaster, 0); box(scene, [2.1, 2.7, .2], [3.95, 2.2, -5], plaster, 0);
  box(scene, [10, .14, 10], [0, 4.1, 0], dark, 0);
  for (const x of [-2.94, 0, 2.94]) box(scene, [.09, 2.75, .12], [x, 2.2, -4.94], edge, 0);
  box(scene, [6.1, .12, .3], [0, .88, -4.9], wood); box(scene, [6, .06, .12], [0, 2.1, -4.94], edge);
  const sunset = new THREE.TextureLoader().load('/models/timi-studio/sunset-clouds-v1.png', invalidate); sunset.colorSpace = THREE.SRGBColorSpace; textures.push(sunset);
  const sky = new THREE.Mesh(new THREE.PlaneGeometry(18, 9), new THREE.MeshBasicMaterial({ map: sunset, toneMapped: false })); sky.position.set(0, 2, -6); scene.add(sky);
  for (const x of [-4.86, 4.86]) box(scene, [.07, .16, 10], [x, .12, 0], edge, 0);
  // Original low-poly props, authored for the game; no downloaded model payload.
  const vaseStation = new THREE.Group(); vaseStation.position.set(STATIONS.vase.x, 0, STATIONS.vase.z); scene.add(vaseStation);
  box(vaseStation, [1.5, .12, 1.25], [0, .85, 0], wood);
  for (const x of [-.55, .55]) for (const z of [-.45, .45]) box(vaseStation, [.08, .8, .08], [x, .4, z], edge);
  const vase = new THREE.Mesh(new THREE.LatheGeometry([new THREE.Vector2(.13, 0), new THREE.Vector2(.22, .08), new THREE.Vector2(.27, .28), new THREE.Vector2(.15, .48), new THREE.Vector2(.1, .55), new THREE.Vector2(.14, .58)], 20), ceramic);
  vase.position.y = .92; vase.castShadow = true; vaseStation.add(vase);
  const fragments: THREE.Mesh[] = [];
  for (let i = 0; i < 18; i++) {
    const mesh = new THREE.Mesh(new THREE.IcosahedronGeometry(.065 + i % 3 * .016, 0), ceramic); mesh.scale.set(1.4, .6, 1); mesh.castShadow = true; vaseStation.add(mesh); fragments.push(mesh);
  }
  const key = new THREE.Group(); key.position.set(0, 1.64, 0); vaseStation.add(key);
  const keyRing = new THREE.Mesh(new THREE.TorusGeometry(.075, .016, 6, 18), brass); key.add(keyRing);
  box(key, [.025, .19, .025], [0, -.15, 0], brass, 0); box(key, [.08, .025, .025], [.025, -.2, 0], brass, 0);
  label('01 / 破碎之前', [-2.9, 2, -2.85]);
  const bridgeStation = new THREE.Group(); bridgeStation.position.set(STATIONS.bridge.x, 0, STATIONS.bridge.z); scene.add(bridgeStation);
  for (const x of [-1.05, 1.05]) {
    box(bridgeStation, [.9, .14, 1.05], [x, .86, 0], wood);
    for (const z of [-.35, .35]) box(bridgeStation, [.14, .84, .14], [x, .4, z], edge);
  }
  box(bridgeStation, [3.25, .08, .1], [0, .52, -.46], brass);
  const planks: THREE.Mesh[] = [];
  for (let i = 0; i < 7; i++) planks.push(box(bridgeStation, [.18, .07, .68], [(i - 3) * .195, .93, 0], dark));
  const car = new THREE.Group(); bridgeStation.add(car);
  box(car, [.35, .14, .28], [0, .13, 0], material('#bd604c')); box(car, [.17, .11, .23], [-.035, .245, 0], dark);
  for (const x of [-.1, .1]) for (const z of [-.15, .15]) { const wheel = new THREE.Mesh(new THREE.CylinderGeometry(.06, .06, .045, 10), dark); wheel.rotation.x = Math.PI / 2; wheel.position.set(x, .065, z); car.add(wheel); }
  const receiver = box(bridgeStation, [.12, .5, .18], [1.48, 1.1, -.3], glow);
  label('02 / 暂借一座桥', [1.5, 2, -2.8], 2.1);
  const plate = new THREE.Mesh(new THREE.CylinderGeometry(.65, .72, .09, 36), brass); plate.position.set(STATIONS.plate.x, .045, STATIONS.plate.z); scene.add(plate);
  const plateRing = new THREE.Mesh(new THREE.TorusGeometry(.56, .022, 6, 36), glow); plateRing.rotation.x = Math.PI / 2; plateRing.position.set(STATIONS.plate.x, .101, STATIONS.plate.z); scene.add(plateRing);
  label('03 / 留下你的回声', [-3.2, .6, 2.5], 1.8);
  const ghostMat = new THREE.MeshBasicMaterial({ color: '#91f3e5', transparent: true, opacity: .4, depthWrite: false });
  const ghost = new THREE.Group(); scene.add(ghost);
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(.19, .68, 4, 10), ghostMat); body.position.y = .8; ghost.add(body); sphere(ghost, .16, [0, 1.48, 0], ghostMat);
  for (const x of [-.11, .11]) box(ghost, [.12, .4, .14], [x, .25, 0], ghostMat);
  const hinge = new THREE.Group(); hinge.position.set(4.83, 0, .95); scene.add(hinge);
  const door = box(hinge, [.12, 2.6, 1.5], [0, 1.3, .75], dark);
  box(hinge, [.08, .1, .1], [-.12, 1.22, 1.25], brass);
  const doorLight = box(scene, [.14, .065, 1.5], [4.7, 2.75, 1.7], glow);
  label('出口', [4.2, 2.95, 1.7], .8);
  // A small reading corner gives the chamber a lived-in scale.
  box(scene, [1.5, .2, .65], [1.5, .46, 3.3], wood);
  for (const x of [.9, 2.1]) box(scene, [.12, .4, .5], [x, .2, 3.3], edge);
  for (let i = 0; i < 4; i++) { const book = box(scene, [.35, .045, .46], [1.5, .6 + i * .05, 3.3], i % 2 ? dark : brass); book.rotation.y = i * .12; }
  const blockers = [ { x: -2.9, z: -2.7, w: 1.5, d: 1.25 }, { x: 1.5, z: -2.8, w: 3.25, d: 1.1 }, { x: 1.5, z: 3.3, w: 1.5, d: .65 } ];
  const canMove = (p: Point) => Math.abs(p.x) < 4.5 && Math.abs(p.z) < 4.5 && !blockers.some(b => Math.abs(p.x - b.x) < b.w / 2 + .23 && Math.abs(p.z - b.z) < b.d / 2 + .23);
  return {
    canMove,
    update(state: RewindState, time: number, rewinding: boolean) {
      const t = state.vase;
      vase.visible = t < .08 || state.stage > 0;
      fragments.forEach((fragment, i) => {
        fragment.visible = !vase.visible;
        const a = i * 2.399; const r = .1 + t * (.18 + (i % 4) * .05);
        fragment.position.set(Math.cos(a) * r, .95 + (1 - t) * (.1 + i % 5 * .09) + Math.sin(t * Math.PI) * .18, Math.sin(a) * r);
        fragment.rotation.set(t * i * .7, a, t * i * .2);
      });
      key.visible = state.stage === 0 && t < .12; key.rotation.y = time;
      planks.forEach((plank, i) => { const d = state.stage >= 2 ? 0 : state.bridge; plank.position.y = .93 - d * (.28 + (i % 3) * .12); plank.rotation.z = d * Math.sin(i * 1.7) * 1.3; });
      car.position.set(state.cart, .98 - Math.min(.8, state.cartFall * state.cartFall * 2), 0); car.rotation.z = -state.cartFall;
      receiver.scale.y = state.stage >= 2 ? 1 : .5;
      ghost.visible = !!state.echo && state.stage >= 2;
      if (state.echo) { ghost.position.set(state.echo.x, 0, state.echo.z); ghost.rotation.y = state.echo.yaw; }
      plateRing.scale.setScalar(state.recording ? 1 + Math.sin(time * 5) * .06 : 1);
      hinge.rotation.y = THREE.MathUtils.lerp(hinge.rotation.y, state.doorPowered || state.stage === 3 ? -1.3 : 0, .08);
      doorLight.visible = state.doorPowered || state.stage === 3;
      door.castShadow = state.stage !== 3;
      glow.emissiveIntensity = rewinding ? 1.3 : .5;
    },
    dispose() {
      const materials = new Set<THREE.Material>(); const geometries = new Set<THREE.BufferGeometry>();
      scene.traverse(object => { if (object instanceof THREE.Mesh || object instanceof THREE.Sprite) { if (object instanceof THREE.Mesh) geometries.add(object.geometry); (Array.isArray(object.material) ? object.material : [object.material]).forEach(m => materials.add(m)); } });
      geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose()); textures.forEach(t => t.dispose()); sun.shadow.map?.dispose();
    },
  };
}
