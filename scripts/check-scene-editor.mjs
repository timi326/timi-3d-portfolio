import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import ts from 'typescript';
import * as THREE from 'three';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';

const out = new URL('../artifacts/editor-check/', import.meta.url);
await mkdir(out, { recursive: true });
const source = await readFile(new URL('../app/scene-layout.ts', import.meta.url), 'utf8');
await writeFile(new URL('scene-layout.mjs', out), ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText);
const { SceneLayout, validateLayout } = await import(new URL('scene-layout.mjs', out));
await MeshoptDecoder.ready;
const document = await new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder }).read('public/models/timi-studio/sunset-editable-web.glb');
const model = new THREE.Group();
const nodes = document.getRoot().listNodes();
for (const node of nodes.filter(n => n.getExtras().editable)) {
  const group = new THREE.Group(); group.userData = node.getExtras(); group.name = node.getName();
  group.applyMatrix4(new THREE.Matrix4().fromArray(node.getWorldMatrix()));
  for (const child of node.listChildren()) {
    for (const primitive of child.getMesh()?.listPrimitives() || []) {
      const position = primitive.getAttribute('POSITION');
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(position.getArray(), 3, position.getNormalized()));
      const mesh = new THREE.Mesh(geometry);
      const local = new THREE.Matrix4().fromArray(node.getWorldMatrix()).invert().multiply(new THREE.Matrix4().fromArray(child.getWorldMatrix()));
      mesh.applyMatrix4(local); group.add(mesh);
    }
  }
  model.add(group);
}
const colliders = JSON.parse(await readFile('public/models/timi-studio/sunset-colliders.json', 'utf8'));
const layout = new SceneLayout(model, colliders);
const initial = layout.snapshot();
assert.equal(initial.assets.length, 19);
assert.equal(new Set(initial.assets.map(a => a.id)).size, initial.assets.length);
validateLayout(initial, initial.assets.map(a => a.id));
for (const id of ['bookcase','desk','sofa','television','wardrobe']) assert.ok(initial.assets.some(a => a.id === id));
const changed = structuredClone(initial);
changed.assets.find(a => a.id === 'desk').position[0] += .2;
layout.apply(changed);
assert.equal(layout.snapshot().assets.find(a => a.id === 'desk').position[0], changed.assets.find(a => a.id === 'desk').position[0]);
layout.apply(initial);
const before = structuredClone(colliders);
const moved = structuredClone(initial);
const sofa = moved.assets.find(a => a.id === 'sofa'); sofa.position[0] += .7;
const sofaCollider = layout.assets.find(a => a.id === 'sofa').collision[0].index;
const bedCollider = layout.assets.find(a => a.id === 'bed').collision[0].index;
layout.apply(moved);
assert.ok(Math.abs(colliders[sofaCollider].minX - before[sofaCollider].minX - .7) < 1e-5, 'Sofa collider follows translation');
assert.deepEqual(colliders[bedCollider], before[bedCollider], 'Moving sofa must not change bed collider');
sofa.rotation[1] = 90; sofa.scale[0] = 1.5; layout.apply(moved);
assert.ok(Math.abs((colliders[sofaCollider].maxZ - colliders[sofaCollider].minZ) - (before[sofaCollider].maxX - before[sofaCollider].minX)*1.5) < 1e-5, 'Rotation and scale propagate to collision bounds');
assert.deepEqual(layout.snapshot(), moved, 'Transforms round trip without unit changes');
const malformed = structuredClone(moved); malformed.assets[0].scale[0] = 0;
assert.throws(() => layout.apply(malformed));
assert.deepEqual(layout.snapshot(), moved, 'Invalid import must be atomic');
const duplicate = structuredClone(initial); duplicate.assets[0].id = duplicate.assets[1].id;
assert.throws(() => layout.apply(duplicate));
const incompatible = structuredClone(initial); incompatible.model = 'other-room';
assert.throws(() => layout.apply(incompatible));
const notFinite = structuredClone(initial); notFinite.assets[0].position[0] = Infinity;
assert.throws(() => layout.apply(notFinite));
layout.apply(JSON.parse(JSON.stringify(initial)));
for (let i = 0; i < before.length; i++) for (const key in before[i]) assert.ok(Math.abs(colliders[i][key]-before[i][key]) < 1e-5);
await writeFile(new URL('default-layout.json', out), JSON.stringify(initial, null, 2));
model.traverse(o => { if (o instanceof THREE.Mesh) { o.geometry.dispose(); o.material.dispose(); } });
console.log(`PASS: ${initial.assets.length} semantic assets, JSON round-trip, atomic validation, translation/rotation/scale collisions and reset.`);
