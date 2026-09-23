import * as THREE from 'three';
import type { Collider } from './apartment-scene';

export const LAYOUT_KEY = 'timi.scene-layout.v1';
export const MODEL_VERSION = 'sunset-editable-v1';
export type Triple = [number, number, number];
export type AssetTransform = { id: string; position: Triple; rotation: Triple; scale: Triple };
export type LayoutDocument = { version: 1; model: typeof MODEL_VERSION; units: 'meters'; rotationUnit: 'degrees'; assets: AssetTransform[] };
export type SceneAsset = { id: string; label: string; object: THREE.Object3D; initial: AssetTransform; baseMatrix: THREE.Matrix4; collision: { index: number; box: THREE.Box3 }[] };

export function validateLayout(input: unknown, ids: string[]): LayoutDocument {
  if (!input || typeof input !== 'object') throw new Error('JSON 必须是布局对象。');
  const data = input as LayoutDocument;
  if (data.version !== 1 || data.model !== MODEL_VERSION || data.units !== 'meters' || data.rotationUnit !== 'degrees') throw new Error('布局版本或坐标单位不匹配，请导入本编辑器导出的 JSON。');
  if (!Array.isArray(data.assets) || data.assets.length !== ids.length) throw new Error('布局中的资产数量与当前场景不一致。');
  const seen = new Set<string>();
  for (const asset of data.assets) {
    if (!asset || !ids.includes(asset.id) || seen.has(asset.id)) throw new Error('布局包含未知或重复资产。');
    seen.add(asset.id);
    for (const key of ['position', 'rotation', 'scale'] as const) {
      const values = asset[key];
      if (!Array.isArray(values) || values.length !== 3 || !values.every(value => typeof value === 'number' && Number.isFinite(value))) throw new Error('位置、旋转和缩放必须各包含三个有效数值。');
      if (key === 'position' && values.some(v => Math.abs(v) > 50)) throw new Error('位置范围为 -50 至 50 米。');
      if (key === 'rotation' && values.some(v => Math.abs(v) > 3600)) throw new Error('旋转范围为 -3600 至 3600 度。');
      if (key === 'scale' && values.some(v => v < .05 || v > 10)) throw new Error('缩放范围为 0.05 至 10 倍。');
    }
  }
  return structuredClone(data);
}

export function readTransform(asset: SceneAsset): AssetTransform {
  const o = asset.object;
  return { id: asset.id, position: o.position.toArray() as Triple, rotation: [o.rotation.x, o.rotation.y, o.rotation.z].map(THREE.MathUtils.radToDeg) as Triple, scale: o.scale.toArray() as Triple };
}

export class SceneLayout {
  assets: SceneAsset[] = [];
  notice = '';
  constructor(public model: THREE.Object3D, private colliders: Collider[]) {
    model.updateMatrixWorld(true);
    const groups: THREE.Object3D[] = [];
    model.traverse(o => { if (o.userData.editable === true) groups.push(o); });
    for (const object of groups) {
      model.attach(object);
      object.rotation.order = 'XYZ';
      object.updateMatrixWorld(true);
      const bounds = new THREE.Box3().setFromObject(object);
      const indices: number[] = object.userData.colliderIndices || [];
      const asset: SceneAsset = {
        id: object.userData.assetId, label: object.userData.label, object,
        initial: { id: '', position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
        baseMatrix: object.matrixWorld.clone(),
        collision: indices.map(index => {
          const c = colliders[index];
          return { index, box: new THREE.Box3(new THREE.Vector3(c.minX, bounds.min.y, c.minZ), new THREE.Vector3(c.maxX, bounds.max.y, c.maxZ)) };
        }),
      };
      asset.initial = readTransform(asset);
      this.assets.push(asset);
    }
    this.assets.sort((a, b) => a.id.localeCompare(b.id));
  }
  snapshot(): LayoutDocument {
    return { version: 1, model: MODEL_VERSION, units: 'meters', rotationUnit: 'degrees', assets: this.assets.map(readTransform) };
  }
  updateCollisions() {
    this.model.updateMatrixWorld(true);
    for (const asset of this.assets) {
      const delta = asset.object.matrixWorld.clone().multiply(asset.baseMatrix.clone().invert());
      for (const { index, box } of asset.collision) {
        const transformed = box.clone().applyMatrix4(delta);
        // Furniture above the player or entirely below the floor no longer blocks walking.
        const clear = transformed.min.y > 1.8 || transformed.max.y < 0;
        Object.assign(this.colliders[index], { minX: clear ? 1000 : transformed.min.x, maxX: clear ? 1001 : transformed.max.x, minZ: clear ? 1000 : transformed.min.z, maxZ: clear ? 1001 : transformed.max.z });
      }
    }
  }
  apply(input: unknown) {
    let candidate = input;
    // Validate old layouts before dropping the bookcase and adding new assets.
    const legacy = input as Partial<LayoutDocument> | null;
    const added = ['cabinet', 'photos', 'clock', 'coffee-table', 'telescope'];
    if (legacy && Array.isArray(legacy.assets) && legacy.assets.some(a => a?.id === 'bookcase') && this.assets.some(a => a.id === 'cabinet')) {
      const oldIds = [...this.assets.filter(a => !added.includes(a.id)).map(a => a.id), 'bookcase'];
      const valid = validateLayout(input, oldIds);
      candidate = { ...valid, assets: this.assets.map(a => valid.assets.find(v => v.id === a.id) ?? structuredClone(a.initial)) };
    }
    const previous = candidate as Partial<LayoutDocument> | null;
    if (previous && Array.isArray(previous.assets) && !previous.assets.some(a => a?.id === 'telescope') && this.assets.some(a => a.id === 'telescope')) {
      // Migrate saved room layouts without resetting any existing furniture.
      const oldIds = this.assets.filter(a => a.id !== 'telescope' && (a.id !== 'coffee-table' || previous.assets!.some(v => v.id === 'coffee-table'))).map(a => a.id);
      const valid = validateLayout(candidate, oldIds);
      candidate = { ...valid, assets: this.assets.map(a => valid.assets.find(v => v.id === a.id) ?? structuredClone(a.initial)) };
    }
    if (candidate === previous && previous && Array.isArray(previous.assets) && !previous.assets.some(a => a?.id === 'coffee-table') && this.assets.some(a => a.id === 'coffee-table')) {
      const valid = validateLayout(candidate, this.assets.filter(a => a.id !== 'coffee-table').map(a => a.id));
      candidate = { ...valid, assets: this.assets.map(a => valid.assets.find(v => v.id === a.id) ?? structuredClone(a.initial)) };
    }
    const data = validateLayout(candidate, this.assets.map(a => a.id));
    for (const state of data.assets) {
      const o = this.assets.find(a => a.id === state.id)!.object;
      o.position.fromArray(state.position);
      o.rotation.set(...state.rotation.map(THREE.MathUtils.degToRad) as Triple, 'XYZ');
      o.scale.fromArray(state.scale);
    }
    this.updateCollisions();
  }
  restoreSaved() {
    try {
      const raw = localStorage.getItem(LAYOUT_KEY);
      if (raw) { this.apply(JSON.parse(raw)); this.notice = '已载入本机保存的布局'; }
    } catch { this.notice = '本机布局无法读取，已使用原始布局。'; }
  }
  save() { localStorage.setItem(LAYOUT_KEY, JSON.stringify(this.snapshot())); }
  bindLight(id: string, light: THREE.Object3D) {
    const asset = this.assets.find(a => a.id === id);
    if (!asset) return;
    const local = light.position.clone().applyMatrix4(asset.baseMatrix.clone().invert());
    asset.object.add(light); light.position.copy(local);
  }
}
