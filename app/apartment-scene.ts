import * as THREE from 'three';
import { RectAreaLightUniformsLib } from 'three/examples/jsm/lights/RectAreaLightUniformsLib.js';
import { loadBlenderInterior } from './blender-interior';

export type Collider = { minX: number; maxX: number; minZ: number; maxZ: number };
export const PLAYER_HEIGHT = 1.62;
export const PLAYER_RADIUS = 0.23;
export const ROOM_START = new THREE.Vector3(-.55, PLAYER_HEIGHT, 3.08);

export function buildApartment(scene: THREE.Scene, list: Collider[], onAssetProgress: (progress: number) => void = () => undefined) {
  RectAreaLightUniformsLib.init();
  // Exterior lighting is isolated so improving the street does not wash out the room.
  const exteriorFill = new THREE.HemisphereLight('#c3d0e1', '#786752', .8);
  exteriorFill.layers.set(1); scene.add(exteriorFill);
  const exteriorSun = new THREE.DirectionalLight('#ffd1a1', 2.0);
  exteriorSun.layers.set(1); exteriorSun.position.set(-70, 90, 35);
  exteriorSun.target.position.set(0, -5, -85); scene.add(exteriorSun.target);
  exteriorSun.castShadow = true; exteriorSun.shadow.mapSize.set(2048, 2048);
  Object.assign(exteriorSun.shadow.camera, { left: -180, right: 180, top: 110, bottom: -110, near: 1, far: 450 });
  exteriorSun.shadow.camera.layers.enable(1);
  exteriorSun.shadow.camera.updateProjectionMatrix(); exteriorSun.shadow.bias = -.00015; exteriorSun.shadow.normalBias = .12;
  scene.add(exteriorSun);
  const windowLight = new THREE.RectAreaLight('#ffd2a0', 2.1, 5.38, 1.8);
  windowLight.position.set(0, 1.9, -3.18); windowLight.lookAt(0, .8, 1); scene.add(windowLight);
  const bounce = new THREE.RectAreaLight('#b6c4d9', .38, 3, 2);
  bounce.position.set(-3.02, 2.4, 1.12); bounce.lookAt(1, .8, 0); scene.add(bounce);
  const deskLight = new THREE.PointLight('#ffd394', 3.8, 4.0, 2);
  deskLight.position.set(-.75, 1.95, -2.20);
  deskLight.castShadow = true; deskLight.shadow.mapSize.set(1024, 1024);
  deskLight.shadow.bias = -.0001; deskLight.shadow.normalBias = .01;
  deskLight.shadow.camera.near = .08; scene.add(deskLight);
  const bathLight = new THREE.PointLight('#ffe2b8', 2.4, 4.0, 2);
  bathLight.position.set(4.48, 2.6, 2.016); scene.add(bathLight);
  scene.add(new THREE.HemisphereLight('#9ebce9', '#63432d', .16));
  const sun = new THREE.DirectionalLight('#ffbd83', 3.6);
  sun.position.set(-4.2, 4.6, -13); sun.target.position.set(1, .3, 1); scene.add(sun.target);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -6, right: 6, top: 5, bottom: -5, near: .1, far: 28 });
  sun.shadow.camera.updateProjectionMatrix();
  sun.shadow.bias = -.00012; sun.shadow.normalBias = .018; sun.shadow.radius = 2;
  scene.add(sun);
  const loadedTextures: THREE.Texture[] = [];
  const interactionTargets: THREE.Mesh[] = [];
  const speakerRotors: { object: THREE.Object3D; angle: number }[] = [];
  const displayLights = [.69, 1.16, 1.63].map(height => {
    const light = new THREE.PointLight('#ffe0b5', .16, 1.1, 2);
    light.position.set(-2.70, height, -1.22);
    scene.add(light);
    return light;
  });
  const motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)');
  let elapsed = 0;
  let lastTime = performance.now();
  let disposed = false;
  const furnitureReady = loadBlenderInterior(scene, list, interactionTargets, loadedTextures, () => disposed, onAssetProgress).then(layout => {
    layout?.bindLight('desk', deskLight);
    displayLights.forEach(light => layout?.bindLight('cabinet', light));
    scene.traverse(object => {
      if (object.name.startsWith('speaker-rotor-')) speakerRotors.push({ object, angle: object.rotation.y });
    });
    return layout;
  });
  const setQuality = (quality: 'eco' | 'balanced' | 'ultra') => {
    const detailed = quality === 'ultra';
    // Keep the warm key lights; reserve secondary fill and six-face point shadows for ultra.
    displayLights.forEach(light => { light.visible = detailed; });
    bounce.visible = detailed;
    deskLight.castShadow = detailed;
    sun.shadow.mapSize.set(detailed ? 2048 : 1024, detailed ? 2048 : 1024);
    sun.shadow.map?.dispose(); sun.shadow.map = null;
  };
  return { setQuality, textures: loadedTextures, interactionTargets, sun, furnitureReady, dispose: () => { disposed = true; }, update: (active = true) => {
    const now = performance.now();
    const delta = Math.min((now - lastTime) / 1000, .05);
    lastTime = now;
    if (disposed || !active || motionPreference.matches || speakerRotors.length === 0) return false;
    elapsed += delta;
    speakerRotors.forEach(({ object, angle }, index) => {
      object.rotation.y = angle + Math.sin(elapsed * .7 + index * Math.PI) * .3;
    });
    return true;
  } };
}

export function isBlocked(x: number, z: number, colliders: Collider[]) {
  const r = PLAYER_RADIUS;
  const inMain = x >= -3.2704+r && x <= 3.3824 && z >= -3.2704+r && z <= 4.1664-r;
  const inBath = x >= 3.136 && x <= 5.5104-r && z >= .0896+r && z <= 3.4944-r;
  if (!inMain && !inBath) return true;
  return colliders.some((b) => x+r>b.minX && x-r<b.maxX && z+r>b.minZ && z-r<b.maxZ);
}
