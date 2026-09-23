"""Blender-authored desk pose: distribute forearm roll, bake corrected rest mesh."""
import bpy, math, json
from mathutils import Vector, Matrix, Quaternion
from pathlib import Path
R=Path(__file__).resolve().parents[1]; OUT=R/'artifacts/avatar-desk';OUT.mkdir(exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(R/'public/models/timi-animated.glb'))
a=next(o for o in bpy.context.scene.objects if o.type=='ARMATURE')
a.animation_data_clear()
for old_action in list(bpy.data.actions):bpy.data.actions.remove(old_action)
for p in a.pose.bones:p.matrix_basis.identity()
for ob in list(bpy.context.scene.objects):
 if ob.type=='MESH' and len(ob.data.vertices)<100:bpy.data.objects.remove(ob,do_unlink=True)
bpy.context.view_layer.update()
mesh=next(o for o in bpy.context.scene.objects if o.type=='MESH')
# Weld duplicated seam vertices before relaxation, retaining per-corner UVs.
bpy.ops.object.select_all(action='DESELECT');mesh.select_set(True);bpy.context.view_layer.objects.active=mesh
bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT');bpy.ops.mesh.remove_doubles(threshold=.000001);bpy.ops.object.mode_set(mode='OBJECT')
def update():bpy.context.view_layer.update()
def point(n):return a.pose.bones[n].head.copy()
def rotate(n,q):
 p=a.pose.bones[n];m=p.matrix.copy();p.matrix=Matrix.Translation(m.translation)@q.to_matrix().to_4x4()@m.to_3x3().to_4x4();update()
def aim(n,child,direction):rotate(n,(point(child)-point(n)).normalized().rotation_difference(Vector(direction).normalized()))
def orient(n,q):
 p=a.pose.bones[n];p.matrix=Matrix.LocRotScale(p.head.copy(),q,p.matrix.to_scale());update()
# Mild forward engagement, with pelvis kept supported by the chair.
rotate('Spine01',Quaternion((0,1,0),.065))
report={}
for side,sign in [('L',1),('R',-1)]:
 thigh=side+'_Thigh';calf=side+'_Calf';foot=side+'_Foot'
 footrest=a.pose.bones[foot].matrix.to_quaternion()
 aim(thigh,calf,(.90,sign*.055,-.43));aim(calf,foot,(.045,sign*.015,-1));orient(foot,footrest)
 upper=side+'_Upperarm';fore=side+'_Forearm';hand=side+'_Hand'
 # Source palm basis measured from the actual hand surface in its bind pose.
 handrest=a.data.bones[hand].matrix_local.to_quaternion()
 normal=Vector((.764,-sign*.638,-.10)).normalized()
 forward=Vector((.039,sign*.043,-.029));forward=(forward-normal*forward.dot(normal)).normalized()
 source=Matrix((forward,normal.cross(forward).normalized(),normal)).transposed()
 dstforward=Vector((1,0,-.055)).normalized();down=Vector((-.055,0,-1)).normalized()
 desired=Matrix((dstforward,down.cross(dstforward).normalized(),down)).transposed().to_quaternion()@source.to_quaternion().inverted()@handrest
 shoulder=point(upper);wrist=Vector((.17,sign*.085,.605))
 length1=(point(fore)-shoulder).length;length2=(point(hand)-point(fore)).length
 line=wrist-shoulder;distance=line.length;line.normalize()
 assert distance < length1+length2, 'Keyboard wrist target must be reachable'
 along=(length1**2-length2**2+distance**2)/(2*distance)
 bend=Vector((-.45,sign,-.25));bend=(bend-line*bend.dot(line)).normalized()
 elbow=shoulder+line*along+bend*math.sqrt(max(0,length1**2-along**2))
 aim(upper,fore,elbow-shoulder);aim(fore,hand,wrist-point(fore))
 # Rotate the forearm along its long axis before setting the wrist. This avoids
 # concentrating pronation at a single wrist joint (the old web pose's pinch).
 axis=(point(hand)-point(fore)).normalized();q=desired@a.pose.bones[hand].matrix.to_quaternion().inverted()
 proj=axis*Vector((q.x,q.y,q.z)).dot(axis);twist=Quaternion((q.w,proj.x,proj.y,proj.z));twist.normalize()
 if twist.w<0:twist.negate()
 rotate(fore,twist)
 # Upper forearm gets less roll; lower forearm blends progressively into hand.
 angle=twist.angle
 if Vector((twist.x,twist.y,twist.z)).dot(axis)<0:angle=-angle
 rotate(side+'_ForearmTwist01',Quaternion(axis,-angle*.70))
 rotate(side+'_ForearmTwist02',Quaternion(axis,angle*.40))
 orient(hand,desired)
 report[side]={'forearm_roll_degrees':math.degrees(angle),'wrist':list(point(hand))}
# Dual-quaternion deformation + local smoothing are baked into the new rest mesh.
# The website then uses a neutral rest rig, not the problematic extreme pose.
mod=next(m for m in mesh.modifiers if m.type=='ARMATURE');mod.use_deform_preserve_volume=True
bpy.ops.object.select_all(action='DESELECT');mesh.select_set(True);bpy.context.view_layer.objects.active=mesh
bpy.ops.object.modifier_apply(modifier=mod.name)
# Relax the fixed fingers slightly, preserving the wrist and palm volume.
for side,sign in [('L',1),('R',-1)]:
 vg=mesh.vertex_groups.get(side+'_Hand');wrist=point(side+'_Hand')
 for v in mesh.data.vertices:
  weight=next((g.weight for g in v.groups if g.group==vg.index),0)
  if weight<.5:continue
  delta=v.co-wrist;t=max(0,min(1,(delta.x-.025)/.08))
  v.co.y-=delta.y*.10*t*weight
  v.co.z-=.004*t*t*weight
smooth=mesh.vertex_groups.new(name='Wrist elbow corrective smoothing')
for v in mesh.data.vertices:
 influence=0
 for g in v.groups:
  name=mesh.vertex_groups[g.group].name
  if any(x in name for x in ['Forearm','Hand','Calf','Thigh']):influence+=g.weight
 if influence>.05:smooth.add([v.index],min(1,influence),'REPLACE')
mod=mesh.modifiers.new('Local surface relaxation','SMOOTH');mod.factor=.22;mod.iterations=3;mod.vertex_group=smooth.name
bpy.ops.object.modifier_apply(modifier=mod.name)
for p in mesh.data.polygons:p.use_smooth=True
# Apply pose as rest only after baking mesh deformation.
bpy.ops.object.select_all(action='DESELECT');a.select_set(True);bpy.context.view_layer.objects.active=a
bpy.ops.object.mode_set(mode='POSE');bpy.ops.pose.armature_apply(selected=False);bpy.ops.object.mode_set(mode='OBJECT')
mod=mesh.modifiers.new('Desk avatar skin','ARMATURE');mod.object=a;mod.use_deform_preserve_volume=False
# Quiet looping head motion. Arms stay planted on the keyboard.
a.animation_data_create();action=bpy.data.actions.new('DeskIdle');a.animation_data.action=action
head=a.pose.bones['Head'];head.rotation_mode='QUATERNION'
for frame,angle in [(1,0),(46,.004),(91,0),(136,-.004),(181,0)]:
 head.rotation_quaternion=Quaternion((1,0,0),angle);head.keyframe_insert('rotation_quaternion',frame=frame)
bpy.context.scene.render.fps=30;bpy.context.scene.frame_start=1;bpy.context.scene.frame_end=181;bpy.context.scene.frame_set(1)
# Asset exported in native coordinates; the room places it on the existing chair.
bpy.ops.object.select_all(action='DESELECT');a.select_set(True);mesh.select_set(True);bpy.context.view_layer.objects.active=a
bpy.ops.export_scene.gltf(filepath=str(R/'public/models/timi-desk.glb'),export_format='GLB',use_selection=True,export_animations=True,export_animation_mode='ACTIONS',export_skins=True,export_yup=True)
# Add actual desk/chair geometry to the editable Blender scene for contact review.
with bpy.data.libraries.load(str(R/'artifacts/room-atmosphere/timi-atmosphere.blend'),link=False) as (src,dst):dst.objects=src.objects
loaded=[o for o in dst.objects if o]
def relevant(o):
 while o:
  if o.get('assetId') in ['desk','chair']:return True
  o=o.parent
 return False
keep=[o for o in loaded if relevant(o)]
for o in keep:bpy.context.scene.collection.objects.link(o)
for o in loaded:
 if o not in keep:bpy.data.objects.remove(o,do_unlink=True)
chair=next(o for o in keep if o.get('assetId')=='chair');chair.location.y+=.48
# Blender: native forward +X becomes room +Y (toward the computer).
placement=bpy.data.objects.new('Timi seated at computer',None);bpy.context.scene.collection.objects.link(placement)
placement.location=(-1.3,2.08,-.1784);placement.rotation_euler.z=math.pi/2;placement.scale=(1.76,)*3
for o in [a]:o.parent=placement
# Skin mesh is already parented to armature by the importer.
if mesh.parent!=a:mesh.parent=placement
scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=24
scene.world=bpy.data.worlds.new('Review world');scene.world.color=(.25,.25,.25)
def area(name,loc,power,size,target):
 d=bpy.data.lights.new(name,'AREA');d.energy=power;d.shape='DISK';d.size=size;o=bpy.data.objects.new(name,d);scene.collection.objects.link(o);o.location=loc;o.rotation_euler=(Vector(target)-o.location).to_track_quat('-Z','Y').to_euler()
area('Soft key',(-3,0,4),450,4,(-1.3,2.2,.8));area('Wrist fill',(1,2,3),300,3,(-1.3,2.4,.9))
bpy.ops.mesh.primitive_plane_add(size=200,location=(0,0,0));floor=bpy.context.object;floor.name='Review floor';mat=bpy.data.materials.new('Neutral review floor');mat.diffuse_color=(.17,.19,.21,1);floor.data.materials.append(mat)
camdata=bpy.data.cameras.new('Review camera');cam=bpy.data.objects.new('Review camera',camdata);scene.collection.objects.link(cam);scene.camera=cam
scene.render.resolution_x=1000;scene.render.resolution_y=900;scene.render.resolution_percentage=100
scene.view_settings.view_transform='AgX'
def render(name,loc,target,lens):
 cam.location=loc;cam.rotation_euler=(Vector(target)-cam.location).to_track_quat('-Z','Y').to_euler();camdata.lens=lens;scene.render.filepath=str(OUT/name);bpy.ops.render.render(write_still=True)
# Save the editable source with its real furniture context and rig.
# Save after setting the review camera below.
render('desk-side.png',(.9,.8,2.05),(-1.3,2.2,.83),48)
render('hands-detail.png',(-.45,2.1,1.4),(-1.3,2.43,.87),60)
cam.location=(.9,.8,2.05);cam.rotation_euler=(Vector((-1.3,2.2,.83))-cam.location).to_track_quat('-Z','Y').to_euler();camdata.lens=48
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'timi-desk-optimized.blend'))
(OUT/'pose-report.json').write_text(json.dumps(report,indent=2))
print('DONE avatar desk optimization',report)
