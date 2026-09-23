import bpy,json
from pathlib import Path
bpy.ops.wm.read_factory_settings(use_empty=True)
for name in ['furina','march7','miku']:
 bpy.ops.wm.read_factory_settings(use_empty=True);bpy.ops.import_scene.gltf(filepath=str(Path.cwd()/'artifacts/figurines/sources'/f'{name}.glb'))
 print('FIGURE',name)
 for o in bpy.context.scene.objects:
  if o.type=='ARMATURE':print('BONES',o.name,[b.name for b in o.pose.bones])
 print('ACTIONS',[a.name for a in bpy.data.actions])
