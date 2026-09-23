import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { weld, simplifyPrimitive, meshopt } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer';
await Promise.all([MeshoptDecoder.ready, MeshoptEncoder.ready, MeshoptSimplifier.ready]);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.decoder':MeshoptDecoder,'meshopt.encoder':MeshoptEncoder});
// Always rebuild from the full-resolution Blender export, preserving editor nodes.
const doc = await io.read('public/models/timi-studio/sunset-exterior.glb');
const count=()=>doc.getRoot().listMeshes().reduce((n,m)=>n+m.listPrimitives().reduce((a,p)=>a+(p.getIndices()?.getCount()||p.getAttribute('POSITION').getCount())/3,0),0);
const before=count();
await doc.transform(weld());
const done=new Set();
for(const node of doc.getRoot().listNodes()) {
 const mesh=node.getMesh(); if(!mesh||done.has(mesh))continue;done.add(mesh);
 const name=node.getName();
 if(/Figurine|screen-|interaction-|Sky|haze ridge/.test(name))continue;
 for(const p of mesh.listPrimitives()) {
  if((p.getIndices()?.getCount()||0)<3000)continue;
  simplifyPrimitive(p,{simplifier:MeshoptSimplifier,ratio:.3,error:/ExteriorV3/.test(name)?.0002:.002});
 }
}
const after=count();
await doc.transform(meshopt({encoder:MeshoptEncoder,level:'medium',quantizePosition:16}));
await io.write('public/models/timi-studio/sunset-exterior-web.glb',doc);
console.log(JSON.stringify({before,after,reduction:1-after/before}));
