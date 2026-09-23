import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { Collider } from './apartment-scene';

export async function loadTelescope(model: THREE.Object3D, colliders: Collider[], targets: THREE.Mesh[], isDisposed: () => boolean) {
  const gltf = await new GLTFLoader().loadAsync('/models/telescope/telescope.glb');
  if (isDisposed()) {
    gltf.scene.traverse(o => { if (o instanceof THREE.Mesh) { o.geometry.dispose(); (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => m.dispose()); } });
    return;
  }
  const scope = new THREE.Group();
  scope.name = 'asset-telescope';
  const body = gltf.scene;
  // Preserve the assembled optics; normalize around its footprint to room metres.
  body.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(body), center = box.getCenter(new THREE.Vector3());
  const scale = 1.60 / (box.max.y - box.min.y);
  body.scale.setScalar(scale);
  body.position.set(-center.x * scale, -box.min.y * scale, -center.z * scale);
  scope.add(body);
  scope.rotation.y = Math.PI;
  scope.position.set(.525, .02, -2.43);
  scope.userData = {editable:true,assetId:'telescope',label:'天文望远镜',colliderIndices:[colliders.length]};
  scope.traverse(o => {
    if (!(o instanceof THREE.Mesh)) return;
    o.castShadow = true; o.receiveShadow = true;
    o.userData.desktopMode = 'orbit'; targets.push(o);
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
      if (m instanceof THREE.MeshStandardMaterial) { m.roughness = Math.max(m.roughness, .42); m.metalness = Math.min(m.metalness, .65); }
    }
  });
  model.add(scope); model.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(scope);
  colliders.push({minX:bounds.min.x,maxX:bounds.max.x,minZ:bounds.min.z,maxZ:bounds.max.z});
  // Thin optical parts are difficult to aim at; use a generous invisible hit volume.
  const size = bounds.getSize(new THREE.Vector3());
  const interaction = new THREE.Mesh(new THREE.BoxGeometry(size.x, size.y, size.z),
    new THREE.MeshBasicMaterial({transparent:true,opacity:0,depthWrite:false,side:THREE.DoubleSide}));
  interaction.name = 'interaction-telescope';
  interaction.position.copy(scope.worldToLocal(bounds.getCenter(new THREE.Vector3())));
  interaction.userData.desktopMode = 'orbit';
  scope.add(interaction); targets.push(interaction); scope.updateMatrixWorld(true);
}
