import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import * as THREE from 'three';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
await MeshoptDecoder.ready;

const root = new URL('../public/models/timi-studio/', import.meta.url);
const document = await new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder }).read(fileURLToPath(new URL(process.argv[2] || 'sunset-editable-web.glb', root)));
const nodes = document.getRoot().listNodes();
for (const name of ['screen-computer', 'screen-television']) {
  const node = nodes.find((item) => item.getName() === name);
  assert(node?.getMesh(), `${name} must survive Blender export as an independent mesh`);
  const matrix = node.getWorldMatrix();
  const positions = node.getMesh().listPrimitives()[0].getAttribute('POSITION');
  const bounds = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] };
  for (let index = 0; index < positions.getCount(); index++) {
    const [x, y, z] = positions.getElement(index, []);
    const world = [matrix[0]*x+matrix[4]*y+matrix[8]*z+matrix[12], matrix[1]*x+matrix[5]*y+matrix[9]*z+matrix[13], matrix[2]*x+matrix[6]*y+matrix[10]*z+matrix[14]];
    world.forEach((v, i) => { bounds.min[i] = Math.min(bounds.min[i], v); bounds.max[i] = Math.max(bounds.max[i], v); });
  }
  assert(bounds.min[1] > 0.65 && bounds.max[1] < 2, `${name} must be at reachable eye height`);
  assert(bounds.max[0] - bounds.min[0] > (name === 'screen-computer' ? .65 : .8), `${name} must retain horizontal orientation`);
  console.log(name, bounds);
}

const colliders = JSON.parse(await readFile(new URL('sunset-atmosphere-colliders.json', root), 'utf8')
  .catch(() => readFile(new URL('sunset-colliders.json', root), 'utf8')));
const radius = .23;
const blocked = (x,z) => {
  const inMain=x>=-3.0404&&x<=3.3824&&z>=-3.0404&&z<=3.9364;
  const inBath=x>=3.136&&x<=5.2804&&z>=.3196&&z<=3.2644;
  return (!inMain&&!inBath)||colliders.some(b=>x+radius>b.minX&&x-radius<b.maxX&&z+radius>b.minZ&&z-radius<b.maxZ);
};
assert(!blocked(-.55,3.08), 'Entry camera must not spawn in furniture');// Flood-fill physical walkable space at 10 cm resolution, including narrow doorways.
const queue = [[-5,31]], seen = new Set(['-5,31']);
for (let cursor=0; cursor<queue.length; cursor++) {
  const [x,z] = queue[cursor];
  for (const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1]]) {
    const nx=x+dx,nz=z+dz,key=`${nx},${nz}`;
    if (seen.has(key) || blocked(nx/10,nz/10)) continue;
    seen.add(key); queue.push([nx,nz]);
  }
}
for (const [name,x,z] of [['desk',-.4,-1.6],['television',-.56,3.136],['bedroom',.5,-.4],['wardrobe',1.8,2.5],['bathroom',3.808,1.792]]) {
  assert(seen.has(`${Math.round(x*10)},${Math.round(z*10)}`), `${name} must be reachable from entry`);
}
// Check the actual exported geometry cannot occlude the two interaction targets.
const rayMeshes = nodes.flatMap(node => (node.getMesh()?.listPrimitives() ?? []).map(primitive => {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(primitive.getAttribute('POSITION').getArray(), 3, primitive.getAttribute('POSITION').getNormalized()));
  if (primitive.getIndices()) geometry.setIndex(new THREE.BufferAttribute(primitive.getIndices().getArray(), 1));
  const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
  mesh.name = node.getName(); mesh.applyMatrix4(new THREE.Matrix4().fromArray(node.getWorldMatrix()));
  mesh.updateMatrixWorld(); return mesh;
}));
for (const [name,origin,target] of [
  ['screen-computer',[-.448,1.62,-1.792],[-1.39,1.19,-2.899]],
  ['screen-television',[-.56,1.62,3.136],[-1.5232,1.2,3.84832]],
]) {
  const start = new THREE.Vector3(...origin);
  const ray = new THREE.Raycaster(start,new THREE.Vector3(...target).sub(start).normalize(),0,3);
  assert.equal(ray.intersectObjects(rayMeshes,false)[0]?.object.name, name, `${name} must be the first hit from its reachable interaction position`);
}
rayMeshes.forEach(mesh => { mesh.geometry.dispose(); mesh.material.dispose(); });
const materials = document.getRoot().listMaterials();
assert(materials.some(m => m.getMetallicFactor() > .7), 'PBR metals must be retained');
assert(document.getRoot().listTextures().length >= 6, 'Authored material textures must be embedded');
console.log(`PASS: ${nodes.length} nodes, ${materials.length} materials, ${colliders.length} colliders; all five areas reachable.`);
