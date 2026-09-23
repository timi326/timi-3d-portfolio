import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import type { Collider } from './apartment-scene';
import { SceneLayout } from './scene-layout';
import { loadTelescope } from './telescope';

function awardTexture(index: number) {
  const canvas = document.createElement('canvas');
  canvas.width = 768;
  const aspect = [.21 / .285, .22 / .375, .24 / .165, .19 / .245, .29 / .195, .19 / .265][index % 6];
  canvas.height = Math.round(768 / aspect);
  const h = canvas.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Cannot draw award card.');
  ctx.fillStyle = '#f3ecd9'; ctx.fillRect(0, 0, 768, h);
  ctx.strokeStyle = '#b1904c'; ctx.lineWidth = 5; ctx.strokeRect(30, 30, 708, h - 60);
  ctx.lineWidth = 1; ctx.strokeRect(45, 45, 678, h - 90);
  ctx.textAlign = 'center'; ctx.fillStyle = '#8a6b30';
  ctx.font = '24px Georgia'; ctx.fillText('TIMI STUDIO', 384, h * .15);
  ctx.font = '52px Microsoft YaHei'; ctx.fillText('荣誉展示', 384, h * .28);
  ctx.beginPath(); ctx.arc(384, h * .46, Math.min(80, h * .11), 0, Math.PI * 2); ctx.stroke();
  ctx.font = '90px Georgia'; ctx.fillText('✦', 384, h * .46 + 30);
  ctx.fillStyle = '#403c35'; ctx.font = '36px Microsoft YaHei';
  ctx.fillText(['创意设计', 'AI 创作', '视觉表达', '作品展示', '创新实践', '个人成长'][index % 6], 384, h * .70);
  ctx.font = '22px Microsoft YaHei'; ctx.fillStyle = '#887b66';
  ctx.fillText('获奖信息待补充', 384, h * .86);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace; texture.flipY = false;
  return texture;
}

function framedPhoto(image: HTMLImageElement, aspect: number) {
  // Fit the whole picture on a paper mat; no crop or stretched faces.
  const canvas = document.createElement('canvas');
  canvas.width = aspect >= 1 ? 1024 : Math.round(1024 * aspect);
  canvas.height = aspect >= 1 ? Math.round(1024 / aspect) : 1024;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Cannot draw photo mat.');
  ctx.fillStyle = '#eee8dc'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  const scale = Math.min(canvas.width / image.width, canvas.height / image.height);
  const w = image.width * scale, h = image.height * scale;
  ctx.drawImage(image, (canvas.width - w) / 2, (canvas.height - h) / 2, w, h);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace; texture.flipY = false; texture.anisotropy = 4;
  return texture;
}

/** Blender is the source of truth for both metre-scale geometry and collision bounds. */
export async function loadBlenderInterior(
  scene: THREE.Scene,
  colliders: Collider[],
  targets: THREE.Mesh[],
  textures: THREE.Texture[],
  isDisposed: () => boolean,
  progress: (value: number) => void,
) {
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  const loadModel = async () => {
    let failure: unknown;
    for (const path of ['/models/timi-studio/sunset-exterior-web.glb', '/models/timi-studio/sunset-editable-web.glb']) {
      try {
        return await loader.loadAsync(path, (event) => {
          if (event.total) progress(Math.min(event.loaded / event.total, 1) * 0.85);
        });
      } catch (error) { failure = error; }
    }
    throw failure ?? new Error('Cannot load an apartment model.');
  };
  const loadColliders = async () => {
    let failure: unknown;
    for (const path of ['/models/timi-studio/sunset-atmosphere-colliders.json', '/models/timi-studio/sunset-colliders.json']) {
      try {
        const response = await fetch(path);
        if (!response.ok) throw new Error('Cannot load apartment collision map.');
        const data: unknown = await response.json();
        if (!Array.isArray(data) || !data.every((item) =>
          item && ['minX', 'maxX', 'minZ', 'maxZ'].every((key) => Number.isFinite(item[key]))
          && item.minX < item.maxX && item.minZ < item.maxZ)) {
          throw new Error('Invalid apartment collision map.');
        }
        return data as Collider[];
      } catch (error) { failure = error; }
    }
    throw failure ?? new Error('Cannot load apartment collision map.');
  };
  const result = await Promise.allSettled([
    loadModel(),
    loadColliders(),
    new THREE.TextureLoader().loadAsync('/wallpapers/desktop-user.jpg'),
    new THREE.TextureLoader().loadAsync('/wallpapers/portrait-user.jpg'),
    ...[1, 2, 3, 4, 5].map(id => new THREE.TextureLoader().loadAsync(id === 3 ? '/wallpapers/wall-memory-3-books.jpg' : `/wallpapers/wall-memory-${id}.jpg`)),
  ]);
  const model = result[0].status === 'fulfilled' ? result[0].value.scene : undefined;
  const wallpaper = result[2].status === 'fulfilled' ? result[2].value : undefined;
  const portrait = result[3].status === 'fulfilled' ? result[3].value : undefined;
  const importedTextures = new Set<THREE.Texture>();
  if (portrait) importedTextures.add(portrait);
  const memories = result.slice(4).map(entry => entry.status === 'fulfilled' ? entry.value as THREE.Texture : undefined);
  memories.forEach(texture => { if (texture) importedTextures.add(texture); });
  model?.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      Object.values(material).forEach((value) => {
        if (value instanceof THREE.Texture) importedTextures.add(value);
      });
    }
  });
  if (isDisposed() || result.some((entry) => entry.status === 'rejected')) {
    model?.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      object.geometry.dispose();
      (Array.isArray(object.material) ? object.material : [object.material]).forEach((material) => material.dispose());
    });
    importedTextures.forEach((texture) => texture.dispose());
    wallpaper?.dispose();
    if (!isDisposed()) throw new Error('The Blender apartment could not be loaded.');
    return;
  }
  if (!model || !wallpaper || !portrait || result[1].status !== 'fulfilled') return;
  wallpaper.colorSpace = THREE.SRGBColorSpace;
  wallpaper.anisotropy = 4;
  // Screen UVs below are projected directly in world space, unlike glTF photo UVs.
  portrait.colorSpace = THREE.SRGBColorSpace; portrait.flipY = false;
  portrait.anisotropy = 4;
  const portraitAspect = .36 / .425;
  portrait.repeat.x = portraitAspect / (portrait.image.width / portrait.image.height);
  portrait.offset.x = (1 - portrait.repeat.x) * .44;
  const display = new THREE.MeshBasicMaterial({ map: wallpaper, toneMapped: false });
  const tvCanvas = document.createElement('canvas');
  tvCanvas.width = 1024; tvCanvas.height = 576;
  const ctx = tvCanvas.getContext('2d');
  if (ctx) {
    const background = ctx.createLinearGradient(0, 0, 1024, 576);
    background.addColorStop(0, '#244e64'); background.addColorStop(.65, '#355a6b'); background.addColorStop(1, '#a77e67');
    ctx.fillStyle = background; ctx.fillRect(0, 0, 1024, 576);
    // Bright game cover stays readable in the dark room without another live 3D render.
    ctx.fillStyle = '#eac394'; ctx.beginPath(); ctx.arc(820, 230, 105, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#dce8e466'; ctx.lineWidth = 5; ctx.strokeRect(685, 85, 265, 335);
    ctx.beginPath(); ctx.moveTo(816, 85); ctx.lineTo(816, 420); ctx.moveTo(685, 295); ctx.lineTo(950, 295); ctx.stroke();
    ctx.fillStyle = '#d8e5e8'; ctx.font = '23px Segoe UI'; ctx.fillText('Timi  /  PLAYROOM', 62, 74);
    ctx.fillStyle = '#fff3da'; ctx.font = 'bold 76px Microsoft YaHei'; ctx.fillText('房间倒带', 58, 239);
    ctx.fillStyle = '#d8e5e8'; ctx.font = 'italic 30px Georgia'; ctx.fillText('Rewind Room', 64, 295);
    ctx.font = '23px Microsoft YaHei'; ctx.fillText('倒带物品，与过去的自己合作。', 64, 352);
    ctx.fillStyle = '#f1d5ac'; ctx.fillRect(63, 430, 328, 65);
    ctx.fillStyle = '#233e4d'; ctx.font = 'bold 26px Microsoft YaHei'; ctx.fillText('按 E 开始游戏  →', 87, 472);
    ctx.fillStyle = '#d7e0dd'; ctx.font = '18px Microsoft YaHei'; ctx.fillText('3D 解谜 · 约 5 分钟', 64, 537);
  }
  const tvTexture = new THREE.CanvasTexture(tvCanvas); tvTexture.colorSpace = THREE.SRGBColorSpace;
  const tvDisplay = new THREE.MeshBasicMaterial({ map: tvTexture, toneMapped: false, fog: false, side: THREE.DoubleSide });
  const replaced = new Set<THREE.Material>();
  model.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    object.castShadow = !object.name.startsWith('Exterior'); object.receiveShadow = !object.name.startsWith('Exterior');
    if (object.name.startsWith('ExteriorV3')) {
      object.layers.set(1);
      object.castShadow = !/Sky/.test(object.name);
      object.receiveShadow = !/Sky/.test(object.name);
    }
    // Compress the distant silhouette vertically, keeping its base below the street.
    // glTF uses Y-up; these Blender ridge meshes contain world-space vertices.
    if (/haze.ridge/i.test(object.name)) {
      object.scale.y *= .42;
      object.position.y = object.position.y * .42 - 8.12;
      object.castShadow = false;
    }
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) {
      if (/Sky/i.test(object.name) || /^Sky\s*\//i.test(material.name)) material.fog = false;
      if (material instanceof THREE.MeshStandardMaterial) {
        if (material.map) material.map.anisotropy = 8;
        if (/haze ridge/i.test(material.name)) {
          const layer = Number(material.name.match(/(\d+)$/)?.[1] || 0);
          material.color.set(['#6e6866', '#827975', '#968982'][Math.min(layer, 2)]);
          material.roughness = 1;
        }
        if (material.name.startsWith('AT010303 /')) material.color.set('#c8c0b1');
        // Fine fibre/grain relief stays subtle at walking distance.
        if (!material.normalMap && material.map && /woven|Upholstery|Plaster|Oak|Walnut|Limestone|Cedar|Quilt/.test(material.name)) {
          material.bumpMap = material.map;
          material.bumpScale = /woven|Upholstery|Quilt/.test(material.name) ? 0.003 : 0.0012;
        }
        if (/Glass/.test(material.name)) {
          object.castShadow = false;
          if (material instanceof THREE.MeshPhysicalMaterial) {
            material.transmission = 0;
            material.transparent = true; material.opacity = 0.12;
            material.depthWrite = false;
          }
        }
      }
    }
    const photoMatch = object.name.match(/project_photo_(\d+)$/);
    if (photoMatch) {
      const index = Number(photoMatch[1]);
      // Landscape frames hold the group and game images; the tall frame holds the book photograph.
      const memoryIndex: Record<number, number> = { 0: 1, 2: 2, 3: 0, 4: 4, 5: 3 };
      const source = memories[memoryIndex[index]];
      const aspects = [.21 / .285, .36 / .425, .22 / .375, .24 / .165, .19 / .245, .29 / .195, .19 / .265];
      const map = index === 1 ? portrait : source
        ? framedPhoto(source.image as HTMLImageElement, aspects[index])
        : awardTexture(index > 1 ? index - 1 : index);
      if (index !== 1) importedTextures.add(map);
      materials.forEach(material => replaced.add(material));
      object.material = new THREE.MeshStandardMaterial({ map, roughness: .92, metalness: 0 });
      object.castShadow = false;
    }
    if (/phone_screen$/.test(object.name)) {
      materials.forEach(material => replaced.add(material));
      object.material = new THREE.MeshStandardMaterial({ color: '#050608', roughness: .27, metalness: 0 });
    }
    if (object.name === 'interaction-computer') {
      object.material = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide });
      object.castShadow = false; object.receiveShadow = false;
      object.userData.desktopMode = 'computer'; targets.push(object); return;
    }
    if (!object.name.startsWith('screen-')) return;
    materials.forEach((material) => replaced.add(material));
    const computer = object.name === 'screen-computer';
    const positions = object.geometry.getAttribute('position');
    object.geometry.computeBoundingBox();
    const bounds = object.geometry.boundingBox!;
    // GLTF rotates Blender's XY floor into the website's XZ floor. Screen
    // mesh vertices remain in Blender-local XY/Z, so project in world space.
    object.updateWorldMatrix(true, false);
    const points = Array.from({ length: positions.count }, (_, index) =>
      new THREE.Vector3().fromBufferAttribute(positions, index).applyMatrix4(object.matrixWorld));
    const minX = Math.min(...points.map((point) => point.x));
    const maxX = Math.max(...points.map((point) => point.x));
    const minY = Math.min(...points.map((point) => point.y));
    const maxY = Math.max(...points.map((point) => point.y));
    if (bounds.isEmpty() || maxX <= minX || maxY <= minY) throw new Error('Invalid screen mesh.');
    object.geometry.setAttribute('uv', new THREE.Float32BufferAttribute(points.flatMap((point) => {
      const u = (point.x - minX) / (maxX - minX);
      return [computer ? u : 1 - u, (point.y - minY) / (maxY - minY)];
    }), 2));
    object.material = computer ? display : tvDisplay;
    object.castShadow = false;
    object.userData.desktopMode = computer ? 'computer' : 'television';
    targets.push(object);
  });
  // The fitted canvases are uploaded; release the full-size source images from GPU tracking.
  memories.forEach(texture => { if (texture) { texture.dispose(); importedTextures.delete(texture); } });
  replaced.forEach((material) => material.dispose());
  textures.push(...importedTextures, wallpaper, tvTexture);
  colliders.push(...result[1].value);
  model.name = 'Timi Studio / Blender interior';
  scene.add(model);
  await loadTelescope(model, colliders, targets, isDisposed);
  if (isDisposed()) return;
  const layout = new SceneLayout(model, colliders);
  layout.restoreSaved();
  progress(1);
  return layout;
}
