import bpy,json,sys
from pathlib import Path
from mathutils import Vector
R=Path.cwd(); A=R/'artifacts/tripo-import';A.mkdir(exist_ok=True)
argv=sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else []
downloads=Path(argv[0]).expanduser().resolve() if argv else Path.home()/'Downloads'
files={'desk':'木质桌子3d模型.glb','sofa':'蓝色豆袋3d模型.glb','cabinet':'3d模型收藏柜.glb','chair':'蓝色椅子3d模型.glb','photos':'照片墙3d模型.glb','clock':'木质圆形时钟3d模型.glb'}
report={}
for key,file in files.items():
 bpy.ops.wm.read_factory_settings(use_empty=True);bpy.ops.import_scene.gltf(filepath=str(downloads/file))
 obs=[o for o in bpy.context.scene.objects if o.type=='MESH'];pts=[o.matrix_world@Vector(v) for o in obs for v in o.bound_box];lo=Vector([min(p[i] for p in pts) for i in range(3)]);hi=Vector([max(p[i] for p in pts) for i in range(3)])
 report[key]={'bounds':[list(lo),list(hi)],'meshes':[(o.name,len(o.data.polygons)) for o in obs],'materials':[m.name for m in bpy.data.materials]}
 center=(lo+hi)/2;extent=max(hi-lo)
 bpy.ops.object.camera_add(location=center+Vector((1.4,-2.8,1.0))*extent);cam=bpy.context.object;cam.rotation_euler=(center-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.type='ORTHO';cam.data.ortho_scale=extent*1.35
 s=bpy.context.scene;s.camera=cam;s.world=bpy.data.worlds.new('world');s.world.use_nodes=True;s.world.node_tree.nodes['Background'].inputs[0].default_value=(.65,.65,.65,1);s.world.node_tree.nodes['Background'].inputs[1].default_value=.7
 bpy.ops.object.light_add(type='AREA',location=center+Vector((1,-2,3))*extent);bpy.context.object.data.energy=450*extent**2;bpy.context.object.data.shape='DISK';bpy.context.object.data.size=extent*3
 s.render.engine='CYCLES';s.cycles.samples=8;s.cycles.use_denoising=True;s.render.resolution_x=600;s.render.resolution_y=600;s.render.resolution_percentage=100;s.render.filepath=str(A/(key+'.png'));bpy.ops.render.render(write_still=True)
(A/'inspection.json').write_text(json.dumps(report,indent=2))
bpy.ops.wm.open_mainfile(filepath=str(R/'artifacts/reference-swap/timi-reference-furniture.blend'))
for o in bpy.context.scene.objects:
 if o.get('editable'):print('ASSET',o.name,list(o.location),dict(o.items()))
