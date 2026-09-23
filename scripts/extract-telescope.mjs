import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { prune, dedup } from '@gltf-transform/functions';
import { mkdir } from 'node:fs/promises';
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read('artifacts/orbit/observatory.glb');
const scene = doc.getRoot().listScenes()[0];
const root = scene.listChildren()[0];
const keep = ['049-', '050-', '051-', '052-', '053-', '056-'];
for (const child of root.listChildren()) {
  if (!keep.some(prefix => child.getName().startsWith(prefix))) root.removeChild(child);
}
root.setName('Timi observatory telescope');
await doc.transform(prune(),dedup());
await mkdir('public/models/telescope', {recursive:true});
await io.write('public/models/telescope/telescope.glb',doc);
console.log('Extracted refractor, pier, mount, counterweight, focuser and finder.');
