import * as THREE from 'three';

export const DESK_TOP_Y = 0.735;

function prepareAccessory(source: THREE.Object3D) {
  source.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    const original = Array.isArray(object.material) ? object.material : [object.material];
    const materials = original.map((material) => {
      const clone = material.clone();
      if (clone instanceof THREE.MeshStandardMaterial) {
        clone.flatShading = false;
        if (clone.map) clone.map.anisotropy = 8;
        if (clone.normalMap) clone.normalMap.anisotropy = 8;
      }
      return clone;
    });
    object.material = Array.isArray(object.material) ? materials : materials[0];
    object.castShadow = materials.some((material) => !material.transparent);
    object.receiveShadow = true;
  });
  return source;
}

export function createDeskLamp(source: THREE.Object3D) {
  const lamp = new THREE.Group();
  lamp.name = 'selected-white-desk-lamp';
  lamp.add(prepareAccessory(source));
  lamp.scale.setScalar(0.42 / 0.4400810838561926);
  // The original lamp points along +Z. Turn it over the keyboard, not the screen.
  lamp.rotation.y = -Math.PI / 2;
  lamp.updateMatrixWorld(true);

  // Anchor the round base, not the overall bounds, which include the long cord.
  const baseContact = new THREE.Vector3(0.00012433022015262418, 0.0007658206382039623, -0.01619229179546977);
  baseContact.applyMatrix4(lamp.matrixWorld);
  lamp.position.copy(new THREE.Vector3(5.22, DESK_TOP_Y, 4.07).sub(baseContact));

  const taskLight = new THREE.SpotLight('#fff0dc', 0.9, 1.6, Math.PI / 3, 0.75, 2);
  taskLight.name = 'desk-lamp-task-light';
  taskLight.position.set(0.00012433022015262418, 0.4285, 0.201364829991439);
  taskLight.target.position.set(0.00012433022015262418, 0.001, 0.201364829991439);
  lamp.add(taskLight, taskLight.target);
  lamp.updateMatrixWorld(true);
  return lamp;
}
