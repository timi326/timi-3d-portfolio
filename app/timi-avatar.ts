import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { isBlocked, type Collider } from './apartment-scene';

export type AvatarMood = 'idle' | 'thinking' | 'replying';

export async function loadTimiAvatar(scene: THREE.Scene, colliders: Collider[], targets: THREE.Mesh[], disposed: () => boolean) {
  const gltf = await new GLTFLoader().loadAsync('/models/timi-animated.glb');
  const model = gltf.scene;
  const release = () => {
    const textures = new Set<THREE.Texture>();
    model.traverse(object => {
      if (!(object instanceof THREE.Mesh)) return;
      object.geometry.dispose();
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
        for (const value of Object.values(material)) if (value instanceof THREE.Texture) textures.add(value);
        material.dispose();
      }
      if (object instanceof THREE.SkinnedMesh) object.skeleton.dispose();
    });
    textures.forEach(texture => texture.dispose());
  };
  if (disposed()) { release(); return null; }
  let bed: THREE.Object3D | undefined;
  scene.traverse(o => { if (o.userData.assetId === 'bed') bed = o; });
  const bedBounds = bed && colliders[bed.userData.colliderIndices?.[0]];
  if (!bedBounds) { release(); throw new Error('Cannot locate the bedside'); }
  const candidates = [.55,.85,1.15].map(offset => new THREE.Vector3(bedBounds.minX+offset,0,bedBounds.maxZ+.62));
  const position = candidates.find(p => [-.27,0,.27].every(x => [-.27,0,.27].every(z => !isBlocked(p.x+x,p.z+z,colliders))));
  if (!position) { release(); throw new Error('No clear bedside standing space'); }
  const mixer = new THREE.AnimationMixer(model);
  const idle = gltf.animations.find(clip => clip.name === 'NlaTrack.001') ?? gltf.animations[0];
  if (idle) mixer.clipAction(idle).setEffectiveTimeScale(.6).play();
  mixer.update(0);
  const head = model.getObjectByName('Head');
  const group = new THREE.Group(); group.name = 'Timi / bedside digital human';
  group.position.copy(position);
  group.rotation.y = -.4;
  model.rotation.y = -Math.PI / 2;
  model.scale.setScalar(1.76);
  model.position.y = .018;
  model.traverse(object => {
    if (object instanceof THREE.Mesh) { object.castShadow = false; object.receiveShadow = true; object.frustumCulled = false; }
  });
  group.add(model); scene.add(group); scene.updateMatrixWorld(true);
  const target = new THREE.Mesh(new THREE.CapsuleGeometry(.32, 1.1, 4, 8), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }));
  target.position.set(0,.92,.03); target.userData.desktopMode = 'chat'; target.name = 'Timi conversation target'; group.add(target); targets.push(target);
  const collider = { minX:position.x-.28,maxX:position.x+.28,minZ:position.z-.28,maxZ:position.z+.28 };
  colliders.push(collider);
  let elapsed = 0, attention = 0;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const localViewer = new THREE.Vector3(), parentRotation = new THREE.Quaternion();
  const yaw = new THREE.Quaternion(), nod = new THREE.Quaternion();
  const headRest = head?.quaternion.clone();
  return {
    position,
    update(delta: number, mood: AvatarMood, viewer: THREE.Vector3, engaged = false) {
      elapsed += delta;
      group.getWorldPosition(position);
      attention = THREE.MathUtils.damp(attention, engaged ? 1 : 0, 3, delta);
      group.worldToLocal(localViewer.copy(viewer));
      const look = THREE.MathUtils.clamp(Math.atan2(localViewer.x,localViewer.z), -.65,.65) * attention;
      if (head && headRest) head.quaternion.copy(headRest);
      mixer.update(reducedMotion.matches ? 0 : delta);
      if (!head) return;
      model.updateWorldMatrix(true, true);
      // Express world-up rotation in the head parent's frame, avoiding neck roll.
      head.parent!.getWorldQuaternion(parentRotation).invert();
      yaw.setFromAxisAngle(new THREE.Vector3(0,1,0).applyQuaternion(parentRotation),look);
      head.quaternion.premultiply(yaw);
      if (!reducedMotion.matches) {
        const phase = elapsed % 9;
        const amount = engaged && mood === 'replying' && phase < 1.4 ? .025 : 0;
        nod.setFromAxisAngle(new THREE.Vector3(1,0,0).applyQuaternion(parentRotation),Math.sin(elapsed * (mood === 'replying' ? 2.1 : 1.15))*amount);
        head.quaternion.premultiply(nod);

      }
    },
    dispose() {
      const c=colliders.indexOf(collider); if(c>=0)colliders.splice(c,1);
      mixer.stopAllAction(); mixer.uncacheRoot(model);
      group.removeFromParent(); release(); target.geometry.dispose(); target.material.dispose();
      const i=targets.indexOf(target); if(i>=0)targets.splice(i,1);
    },
  };
}
