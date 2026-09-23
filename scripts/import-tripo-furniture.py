import bpy,json,math,hashlib,sys
from pathlib import Path
from mathutils import Vector,Matrix
R=Path.cwd();A=R/'artifacts/tripo-import';O=R/'public/models/timi-studio';S=A/'sources';S.mkdir(exist_ok=True)
argv=sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else []
downloads=Path(argv[0]).expanduser().resolve() if argv else Path.home()/'Downloads'
files={'desk':'木质桌子3d模型.glb','sofa':'蓝色豆袋3d模型.glb','cabinet':'3d模型收藏柜.glb','chair':'蓝色椅子3d模型.glb','photos':'照片墙3d模型.glb','clock':'木质圆形时钟3d模型.glb'}
bpy.ops.wm.open_mainfile(filepath=str(R/'artifacts/reference-swap/timi-reference-furniture.blend'))
s=bpy.context.scene;coll=json.loads((O/'sunset-reference-colliders.json').read_text())
def clear(id):
 g=bpy.data.objects.get('asset-'+id)
 if g:
  for ob in list(g.children):bpy.data.objects.remove(ob,do_unlink=True)
 return g
# Remove bookcase completely; its old collision slot becomes cabinet's.
g=clear('bookcase');bpy.data.objects.remove(g,do_unlink=True)
settings={'desk':(2.25,-90,(-1.17,2.72,0),100000,'窗边书桌与电脑',5),'chair':(.98,90,(-1.3,1.65,0),45000,'蓝色布艺椅',6),'sofa':(1.12,-90,(-1.95,-1.45,0),12000,'蓝色豆袋沙发',9),'cabinet':(1.9,0,(-2.975,1.22,0),160000,'手办收藏柜',8),'photos':(1.55,0,(-3.17,-.55,1.15),40000,'照片墙',None),'clock':(.46,0,(-3.15,-1.8,2.0),16000,'木质圆形时钟',None)}
report={}
for id,(scale,angle,pos,budget,label,ci) in settings.items():
 src=downloads/files[id];raw=src.read_bytes();(S/files[id]).write_bytes(raw)
 group=clear(id)
 if not group:
  group=bpy.data.objects.new('asset-'+id,None);s.collection.objects.link(group);group.location=pos
 group['assetId']=id;group['label']=label;group['editable']=True;group['colliderIndices']=[] if ci is None else [ci];group['geometrySource']='User supplied Tripo GLB'
 before=set(s.objects);bpy.ops.import_scene.gltf(filepath=str(src));meshes=[o for o in s.objects if o not in before and o.type=='MESH']
 transform=Matrix.Translation(Vector(pos))@Matrix.Rotation(math.radians(angle),4,'Z')@Matrix.Scale(scale,4)
 for i,ob in enumerate(meshes):
  original=ob.matrix_world.copy();ob.parent=None;ob.matrix_world=Matrix.Identity(4);ob.data.transform(transform@original)
  count=len(ob.data.polygons)
  if count>budget:
   bpy.context.view_layer.objects.active=ob;mod=ob.modifiers.new('Web optimized silhouette','DECIMATE');mod.ratio=budget/count;bpy.ops.object.modifier_apply(modifier=mod.name)
  ob.name='Tripo / '+id+' / '+str(i)
  for mat in ob.data.materials:
   mat.name='Tripo / '+id+' / material';p=mat.node_tree.nodes.get('Principled BSDF') if mat.use_nodes else None
   if p:
    p.inputs['Roughness'].default_value=.85 if id in ['chair','sofa'] else .65
    p.inputs['Specular IOR Level'].default_value=.22
  bpy.context.view_layer.update();world=ob.matrix_world.copy();ob.parent=group;ob.matrix_world=world
 bpy.context.view_layer.update()
 pts=[ob.matrix_world@Vector(v) for ob in meshes for v in ob.bound_box]
 if ci is not None:
  coll[ci]={'minX':min(p.x for p in pts)-.025,'maxX':max(p.x for p in pts)+.025,'minZ':min(-p.y for p in pts)-.025,'maxZ':max(-p.y for p in pts)+.025}
 report[id]={'source':files[id],'sha256':hashlib.sha256(raw).hexdigest(),'triangles':sum(len(o.data.polygons) for o in meshes),'bounds':[[min(p[i] for p in pts) for i in range(3)],[max(p[i] for p in pts) for i in range(3)]]}
# Invisible raycast surface preserves the computer action while retaining supplied screen art.
bpy.ops.mesh.primitive_plane_add(size=1,location=(-1.32,2.71,1.1),rotation=(math.pi/2,0,0));ob=bpy.context.object;ob.name='interaction-computer';ob.scale=(.85,.48,1);bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
m=bpy.data.materials.new('Interaction proxy');m.diffuse_color=(0,0,0,0);ob.data.materials.append(m);bpy.context.view_layer.update();world=ob.matrix_world.copy();ob.parent=bpy.data.objects['asset-desk'];ob.matrix_world=world
for ob in s.objects:
 if ob.type=='LIGHT' and 'Lamp' in ob.name:ob.location=(-.23,2.78,1.25)
# Keep a reusable editable source and export the exact user models with their maps.
bpy.ops.wm.save_as_mainfile(filepath=str(A/'timi-tripo-furniture.blend'))
bpy.ops.object.select_all(action='DESELECT')
for ob in s.objects:
 if ob.type in ['MESH','EMPTY']:ob.select_set(True)
bpy.ops.export_scene.gltf(filepath=str(O/'sunset-tripo.glb'),export_format='GLB',use_selection=True,export_apply=True,export_yup=True,export_extras=True,export_cameras=False,export_lights=False)
(O/'sunset-tripo-colliders.json').write_text(json.dumps(coll,indent=2));(A/'manifest.json').write_text(json.dumps(report,indent=2))
s.render.engine='CYCLES';s.cycles.samples=20;s.cycles.use_denoising=True;s.render.resolution_x=1200;s.render.resolution_y=900;s.render.resolution_percentage=100
s.render.filepath=str(A/'room.png');bpy.ops.render.render(write_still=True)
cam=s.camera;cam.location=(1.8,-.2,1.7);cam.rotation_euler=(Vector((-3,.1,1.4))-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.lens=30;s.render.filepath=str(A/'wall.png');bpy.ops.render.render(write_still=True)
