import bpy,math,json
from pathlib import Path
from mathutils import Vector,Matrix
R=Path.cwd();A=R/'artifacts/figurines';O=R/'public/models/timi-studio'
bpy.ops.wm.open_mainfile(filepath=str(R/'artifacts/authored-furniture/timi-authored-furniture.blend'));s=bpy.context.scene;g=bpy.data.objects['asset-cabinet']
converted=set()
placements=[('miku',-.25,1.405,.37),('furina',.25,1.405,.39),('march7',-.25,.935,.39),('luffy',.25,.935,.37)]
for name,x,z,height in placements:
 path=A/'sources'/f'{name}.glb'
 if not path.exists():continue
 before=set(s.objects);bpy.ops.import_scene.gltf(filepath=str(path));added=set(s.objects)-before
 for arm in added:
  if arm.type!='ARMATURE':continue
  for p in arm.pose.bones:
   match=('Left arm_' in p.name or 'Right arm_' in p.name) if name=='furina' else (p.name.startswith('Shoulder_L_') or p.name.startswith('Shoulder_R_'))
   if not match:continue
   s.view_layers[0].update();sign=1 if ('Left' in p.name or '_L_' in p.name) else -1
   direction=arm.matrix_world.to_3x3().inverted()@Vector((sign*.3,-.16,-.9));q=(p.tail-p.head).normalized().rotation_difference(direction.normalized());p.matrix=Matrix.Translation(p.head)@q.to_matrix().to_4x4()@Matrix.Translation(-p.head)@p.matrix
 s.view_layers[0].update();dg=bpy.context.evaluated_depsgraph_get();meshes=[]
 for o in added:
  if o.type!='MESH' or o.hide_render or 'Icosphere' in o.name or 'custom' in o.name.lower() or (name=='march7' and any('Weapon' in m.name for m in o.data.materials if m)):continue
  mesh=bpy.data.meshes.new_from_object(o.evaluated_get(dg),depsgraph=dg);mesh.transform(o.matrix_world);ob=bpy.data.objects.new('Figurine / '+name+' / '+o.name,mesh);s.collection.objects.link(ob);meshes.append(ob)
 for o in added:bpy.data.objects.remove(o,do_unlink=True)
 pts=[v.co.copy() for ob in meshes for v in ob.data.vertices];lo=Vector(tuple(min(v[i] for v in pts) for i in range(3)));hi=Vector(tuple(max(v[i] for v in pts) for i in range(3)));size=hi-lo
 scale=min(height/size.z,.40/max(size.x,.001),.35/max(size.y,.001));center=Vector(((lo.x+hi.x)/2,(lo.y+hi.y)/2,lo.z))
 T=Matrix.Translation(Vector((-2.975,1.22,0)))@Matrix.Rotation(math.pi/2,4,'Z')@Matrix.Translation(Vector((x,0,z+.023)))@Matrix.Diagonal((scale,scale,scale,1))@Matrix.Translation(-center)
 for ob in meshes:
  ob.data.transform(T);world=ob.matrix_world.copy();ob.parent=g;ob.matrix_world=world;ob['sourceAsset']=name
  for m in ob.data.materials:
   if not m or m in converted:continue
   converted.add(m);m.use_nodes=True
   base=tuple(m.diffuse_color)
   tex=next((n.image for n in m.node_tree.nodes if n.type=='TEX_IMAGE' and n.image),None)
   m.node_tree.nodes.clear();p=m.node_tree.nodes.new('ShaderNodeBsdfPrincipled');out=m.node_tree.nodes.new('ShaderNodeOutputMaterial');m.node_tree.links.new(p.outputs['BSDF'],out.inputs['Surface'])
   p.inputs['Roughness'].default_value=.73;p.inputs['Metallic'].default_value=0;p.inputs['Specular IOR Level'].default_value=.22
   p.inputs['Base Color'].default_value=base
   if tex:
    n=m.node_tree.nodes.new('ShaderNodeTexImage');n.image=tex;m.node_tree.links.new(n.outputs['Color'],p.inputs['Base Color'])
  if len(ob.data.polygons)>100000:
   bpy.context.view_layer.objects.active=ob;mod=ob.modifiers.new('Web figurine detail','DECIMATE');mod.ratio=90000/len(ob.data.polygons);bpy.ops.object.modifier_apply(modifier=mod.name)
 print('PLACED',name,'size',list(size),'scale',scale)
# Exact separately licensed tabletop props from the reference's credited sources.
for name,target,width,height in [('vocaloid',(-1.39,2.765,.81),.64,.14),('headphones',(-2.10,2.49,.81),.18,.20)]:
 before=set(s.objects);bpy.ops.import_scene.gltf(filepath=str(A/'sources'/f'{name}.glb'));added=set(s.objects)-before
 bpy.context.view_layer.update();meshes=[]
 for ob in added:
  if ob.type!='MESH':continue
  mesh=ob.data.copy();mesh.transform(ob.matrix_world);item=bpy.data.objects.new('Desk collectible / '+name+' / '+ob.name,mesh);s.collection.objects.link(item);meshes.append(item)
 for ob in added:bpy.data.objects.remove(ob,do_unlink=True)
 pts=[v.co.copy() for ob in meshes for v in ob.data.vertices];lo=Vector(tuple(min(v[i] for v in pts) for i in range(3)));hi=Vector(tuple(max(v[i] for v in pts) for i in range(3)));size=hi-lo
 factor=min(width/size.x,height/size.z);center=Vector(((lo.x+hi.x)/2,(lo.y+hi.y)/2,lo.z))
 T=Matrix.Translation(Vector(target))@Matrix.Rotation(math.pi,4,'Z')@Matrix.Diagonal((factor,factor,factor,1))@Matrix.Translation(-center)
 for ob in meshes:
  ob.data.transform(T);world=ob.matrix_world.copy();ob.parent=bpy.data.objects['asset-desk'];ob.matrix_world=world;ob['sourceAsset']=name
  for m in ob.data.materials:
   if not m:continue
   for p in m.node_tree.nodes:
    if p.type=='BSDF_PRINCIPLED':p.inputs['Roughness'].default_value=.65;p.inputs['Metallic'].default_value=0
 print('DESK PROP',name,'size',list(size),'scale',factor)
for m in bpy.data.materials:
 if 'Authored / Glass' in m.name:
  p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Roughness'].default_value=.015;p.inputs['Base Color'].default_value=(1,1,1,1)
# Shelf fill lights, behind the front rails.
for z in [.86,1.33,1.80]:
 data=bpy.data.lights.new('Cabinet display fill','AREA');data.energy=3;data.color=(1,.87,.72);data.shape='RECTANGLE';data.size=.8;data.size_y=.2;ob=bpy.data.objects.new('Cabinet display fill',data);s.collection.objects.link(ob);ob.location=(-2.83,1.22,z)
for im in bpy.data.images:
 if im.has_data:im.pack()
bpy.ops.wm.save_as_mainfile(filepath=str(A/'timi-furniture-figurines.blend'))
bpy.ops.object.select_all(action='DESELECT')
for ob in s.objects:
 if ob.type in ['MESH','EMPTY']:ob.select_set(True)
bpy.ops.export_scene.gltf(filepath=str(O/'sunset-authored.glb'),export_format='GLB',use_selection=True,export_apply=True,export_yup=True,export_extras=True,export_cameras=False,export_lights=False,export_animations=False)
s.render.engine='CYCLES';s.cycles.samples=24;s.cycles.use_denoising=True;s.render.resolution_x=1000;s.render.resolution_y=1000;s.render.resolution_percentage=100
s.camera.location=(-.85,1.2,1.38);s.camera.rotation_euler=(Vector((-2.97,1.22,1.14))-s.camera.location).to_track_quat('-Z','Y').to_euler();s.camera.data.lens=48;s.render.filepath=str(A/'cabinet-preview.png');bpy.ops.render.render(write_still=True)
s.render.resolution_x=1400;s.render.resolution_y=900;s.camera.location=(-.15,.7,1.82);s.camera.rotation_euler=(Vector((-1.2,2.7,1.05))-s.camera.location).to_track_quat('-Z','Y').to_euler();s.camera.data.lens=48;s.render.filepath=str(A/'desk-preview.png');bpy.ops.render.render(write_still=True)
