import fs from 'node:fs';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
globalThis.ProgressEvent = class { constructor(type, init) { Object.assign(this, init); } };
// Decode the real rig without textures; this check does not need a browser/GPU.
const source = fs.readFileSync(new URL('../public/models/timi-animated.glb', import.meta.url));
const length = source.readUInt32LE(12);
const document = JSON.parse(source.subarray(20, 20 + length));
delete document.images; delete document.textures; delete document.materials;
document.meshes.forEach(mesh => mesh.primitives.forEach(primitive => delete primitive.material));
document.buffers[0].uri = 'data:application/octet-stream;base64,' + source.subarray(28 + length).toString('base64');
const { scene, animations } = await new GLTFLoader().parseAsync(JSON.stringify(document), '');
const idle = animations.find(clip => clip.name === 'NlaTrack.001');
assert.ok(idle, 'Original stationary idle is available');
const mixer = new THREE.AnimationMixer(scene);mixer.clipAction(idle).play();
const bounds = new THREE.Box3();
for(let i=0;i<16;i++) { mixer.update(1);scene.updateMatrixWorld(true);bounds.union(new THREE.Box3().setFromObject(scene,true)); }
assert.ok(bounds.max.x-bounds.min.x < .6, 'Idle must not walk away');
assert.ok(bounds.max.z-bounds.min.z < .9, 'Idle stays within the bedside area');
const room = JSON.parse(fs.readFileSync(new URL('../public/models/timi-studio/sunset-colliders.json',import.meta.url)));
const bed=room[7], x=bed.minX+.55,z=bed.maxZ+.62;
const avatar={minX:x-.28,maxX:x+.28,minZ:z-.28,maxZ:z+.28};
const blocked=(x,z,boxes)=>boxes.some(b=>x+.23>b.minX&&x-.23<b.maxX&&z+.23>b.minZ&&z-.23<b.maxZ);
assert.ok(!blocked(x,z,room),'Standing point clears the bed and other furniture');
for(let z=-1;z<3.4;z+=.1)assert.equal(blocked(.5,z,[...room,avatar]),blocked(.5,z,room),'Central walking lane remains unchanged');
console.log('PASS: original idle remains stationary; bedside point and central walking lane clear.');
