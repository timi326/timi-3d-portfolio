"""Original authored replacement geometry. No supplied Tripo geometry or textures retained."""
import bpy,math,json,random
from pathlib import Path
from mathutils import Vector,Matrix
R=Path.cwd();A=R/'artifacts/authored-furniture';A.mkdir(exist_ok=True);O=R/'public/models/timi-studio'
bpy.ops.wm.open_mainfile(filepath=str(R/'artifacts/tripo-import/timi-tripo-furniture.blend'))
s=bpy.context.scene
ids=['desk','chair','sofa','cabinet','photos','clock']
for id in ids:
 g=bpy.data.objects['asset-'+id]
 for o in list(g.children):bpy.data.objects.remove(o,do_unlink=True)
 g['geometrySource']='Original Blender authored geometry / 2026-09-12'
# New actual material channels; no color-atlas segmentation.
def mat(name,color,rough=.7,metal=0):
 m=bpy.data.materials.new('Authored / '+name);m.use_nodes=True;p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*color,1);p.inputs['Roughness'].default_value=rough;p.inputs['Metallic'].default_value=metal;p.inputs['Specular IOR Level'].default_value=.25;return m
wood=mat('warm oak',(.42,.245,.105),.68);cloth=mat('slate woven fabric',(.13,.22,.29),.94);steel=mat('graphite metal',(.055,.065,.075),.4,.8);ivory=mat('ceramic ivory',(.73,.70,.62),.62);dark=mat('rubber and bezel',(.018,.023,.029),.75);leaf=mat('plant green',(.09,.20,.105),.88);paper=mat('paper',(.72,.70,.63),.95);glass=mat('Glass clear',(.7,.82,.9),.13);p=glass.node_tree.nodes.get('Principled BSDF');p.inputs['Transmission Weight'].default_value=.92;p.inputs['IOR'].default_value=1.45
light=mat('warm LED',(.8,.57,.27),.4);p=light.node_tree.nodes.get('Principled BSDF');p.inputs['Emission Color'].default_value=(1,.72,.4,1);p.inputs['Emission Strength'].default_value=2
# Small deterministic tileable physically neutral surface maps.
import numpy as np
rng=np.random.default_rng(12);N=512;yy,xx=np.mgrid[0:N,0:N]
for m,kind in [(wood,'wood'),(cloth,'cloth')]:
 noise=rng.random((N,N));v=(.5+.18*np.sin(yy*.37+2*np.sin(xx*.013))+.07*np.sin(yy*1.3)+.07*(noise-.5)) if kind=='wood' else (.5+.15*np.sin(xx*np.pi/2)*np.sin(yy*np.pi/2)+.14*(noise-.5))
 for channel in ['color','normal']:
  im=bpy.data.images.new('Authored '+kind+' '+channel,width=N,height=N,alpha=True);rgba=np.ones((N,N,4),dtype=np.float32)
  if channel=='color':
   base=np.array((.57,.40,.23) if kind=='wood' else (.28,.38,.46));rgba[:,:,:3]=base[None,None,:]*(.93+.14*v[:,:,None])
  else:
   dy,dx=np.gradient(v);rgba[:,:,0]=.5-dx*.3;rgba[:,:,1]=.5-dy*.3;rgba[:,:,2]=1;im.colorspace_settings.name='Non-Color'
  im.pixels.foreach_set(rgba.ravel());im.pack();n=m.node_tree.nodes.new('ShaderNodeTexImage');n.image=im;p=m.node_tree.nodes.get('Principled BSDF')
  if channel=='color':m.node_tree.links.new(n.outputs['Color'],p.inputs['Base Color'])
  else:
   normal=m.node_tree.nodes.new('ShaderNodeNormalMap');normal.inputs['Strength'].default_value=.25;m.node_tree.links.new(n.outputs['Color'],normal.inputs['Color']);m.node_tree.links.new(normal.outputs['Normal'],p.inputs['Normal'])

group=None;T=Matrix.Identity(4)
def finish(o,name,m):
 o.name='Authored / '+name;o.data.materials.append(m)
 bpy.context.view_layer.update();o.data.transform(T@o.matrix_world);o.matrix_world=Matrix.Identity(4)
 world=o.matrix_world.copy();o.parent=group;o.matrix_world=world
 return o

def box(name,pos,size,m,bevel=.008):
 bpy.ops.mesh.primitive_cube_add(size=1,location=pos);o=bpy.context.object;o.dimensions=size;bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
 if bevel:
  mod=o.modifiers.new('Machined edge bevel','BEVEL');mod.width=bevel;mod.segments=3;bpy.ops.object.modifier_apply(modifier=mod.name)
  mod=o.modifiers.new('Weighted face normals','WEIGHTED_NORMAL');bpy.ops.object.modifier_apply(modifier=mod.name)
 return finish(o,name,m)
def ell(name,pos,size,m):
 bpy.ops.mesh.primitive_uv_sphere_add(segments=48,ring_count=24,location=pos);o=bpy.context.object;o.scale=size;bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
 for p in o.data.polygons:p.use_smooth=True
 return finish(o,name,m)
def rod(name,a,b,r,m):
 a=Vector(a);b=Vector(b);bpy.ops.mesh.primitive_cylinder_add(vertices=32,radius=r,depth=(b-a).length,location=(a+b)/2);o=bpy.context.object;o.rotation_euler=(b-a).to_track_quat('Z','Y').to_euler()
 for p in o.data.polygons:p.use_smooth=True
 return finish(o,name,m)
def ring(name,pos,r,thickness,m):
 bpy.ops.mesh.primitive_torus_add(major_radius=r,minor_radius=thickness,major_segments=48,minor_segments=10,location=pos,rotation=(math.pi/2,0,0));o=bpy.context.object
 for p in o.data.polygons:p.use_smooth=True
 return finish(o,name,m)
def start(id,pos,rot=0):
 global group,T
 group=bpy.data.objects['asset-'+id];T=Matrix.Translation(Vector(pos))@Matrix.Rotation(rot,4,'Z')
def picture(name,pos,w,h,path):
 m=mat(name,(1,1,1),.9);im=bpy.data.images.load(str(path),check_existing=True);im.pack();n=m.node_tree.nodes.new('ShaderNodeTexImage');n.image=im;m.node_tree.links.new(n.outputs['Color'],m.node_tree.nodes.get('Principled BSDF').inputs['Base Color'])
 bpy.ops.mesh.primitive_plane_add(size=1,location=pos,rotation=(math.pi/2,0,0));o=bpy.context.object;o.scale=(w,h,1);bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);return finish(o,name,m)
start('desk',(-1.17,2.72,0))
box('desk top',(0,0,.78),(2.2,.85,.055),wood,.028)
box('drawer pedestal',(-.8,0,.375),(.52,.74,.75),wood,.014)
for z in [.14,.38,.62]:
 box('drawer front',(-.8,-.38,z),(.47,.025,.215),wood,.009);rod('drawer handle',(-.91,-.409,z+.05),(-.69,-.409,z+.05),.009,steel)
for y in [-.33,.33]:box('desk right leg',(.98,y,.375),(.07,.07,.75),wood,.012)
box('rear apron',(0,.32,.69),(1.6,.055,.12),wood)
box('felt desk mat',(-.1,-.21,.815),(.95,.33,.008),cloth,.01)
box('display housing',(-.22,.2,1.19),(1.02,.033,.47),dark,.012)
screen=picture('screen-computer',(-.22,.179,1.19),.985,.433,R/'public/wallpapers/desktop-pink.jpg');screen.name='screen-computer'
rod('monitor neck',(-.22,.25,.82),(-.22,.25,1.0),.025,steel)
for x in [-.43,0]:rod('V monitor foot',(-.22,.25,.823),(x,.07,.823),.012,steel)
rod('screen lightbar',(-.45,.16,1.437),(.01,.16,1.437),.009,steel)
rose=mat('muted rose keycaps',(.5,.22,.23),.7)
lavender=mat('subtle lavender LED',(.45,.35,.65),.55)
p=lavender.node_tree.nodes.get('Principled BSDF');p.inputs['Emission Color'].default_value=(.65,.42,.8,1);p.inputs['Emission Strength'].default_value=1.2
box('keyboard',(-.18,-.24,.833),(.62,.17,.025),steel,.01)
for row in range(5):
 for col in range(15):box('key',(-.46+col*.039,-.306+row*.032,.853),(.032,.025,.009),rose if row==0 or col in [0,14] else ivory,.003)
ell('mouse',(.29,-.24,.837),(.036,.056,.024),dark)
rod('mouse wheel',(.29,-.26,.858),(.29,-.245,.858),.005,ivory)
# Compact tower on the right; three visible recessed intake fans.
box('PC chassis',(.87,.14,1.075),(.29,.40,.53),steel,.018)
box('PC side inset',(.717,.14,1.08),(.008,.34,.43),dark,.004)
box('PC front',(.87,-.067,1.075),(.25,.012,.48),dark,.01)
for z in [.915,1.075,1.235]:
 ring('PC fan light',(.87,-.079,z),.058,.003,lavender)
 rod('PC fan hub',(.87,-.083,z),(.87,-.075,z),.014,steel)
 for i in range(7):
  a=i*math.tau/7;rod('PC fan vane',(.87+math.cos(a)*.017,-.078,z+math.sin(a)*.017),(.87+math.cos(a+.4)*.05,-.078,z+math.sin(a+.4)*.05),.006,steel)
box('power button',(.96,-.079,1.30),(.017,.004,.017),ivory,.004)
# Speaker bodies keep independent pivots for live rotation in the website.
for index,x in enumerate([-.79,.44]):
 center=Vector((x,.02,.901));before=set(s.objects)
 box('speaker cabinet',center,(.14,.14,.18),dark,.015)
 rod('speaker cone',(x,-.053,.91),(x,-.06,.91),.047,steel)
 ring('speaker luminous rim',(x,-.064,.91),.049,.003,lavender)
 rod('speaker dust cap',(x,-.067,.91),(x,-.072,.91),.018,dark)
 parts=list(set(s.objects)-before);bpy.ops.object.select_all(action='DESELECT')
 for ob in parts:ob.select_set(True)
 bpy.context.view_layer.objects.active=parts[0];bpy.ops.object.join();ob=parts[0]
 pivot=T@center;ob.data.transform(Matrix.Translation(-pivot));ob.matrix_world=Matrix.Translation(pivot);ob.name='speaker-rotor-'+str(index)
# Desk accessories match the reference arrangement with restrained colors.
rod('mug coaster',(-.64,-.21,.809),(-.64,-.21,.817),.065,dark)
rod('blue ceramic mug',(-.64,-.21,.819),(-.64,-.21,.93),.044,cloth)
rod('coffee surface',(-.64,-.21,.931),(-.64,-.21,.932),.037,dark)
ring('mug handle',(-.694,-.21,.878),.026,.007,cloth)
rod('pencil holder',(-.97,.18,.81),(-.97,.18,.91),.036,steel)
for i in range(5):
 x=-.99+i*.01;y=.18+(.012 if i%2 else 0)
 rod('pencil',(x,y,.88),(x+.012,y,1.00+i*.006),.003,rose if i%2 else ivory)
box('desktop photo frame',(-.94,.28,.995),(.19,.025,.28),steel,.005)
picture('desktop framed artwork',(-.94,.264,.995),.167,.256,R/'public/wallpapers/laptop-green.jpg')
box('desk edge accent',(0,-.415,.773),(2.08,.006,.003),light,.001)
# Sculpted continuous chair shell with thickness, no noisy reconstructed surface.
start('chair',(-1.3,1.6,0),math.pi)
rod('chair column',(0,0,.05),(0,0,.43),.035,steel)
for i in range(4):
 a=math.pi/4+i*math.pi/2;end=(.36*math.cos(a),.36*math.sin(a),.035);rod('chair base spoke',(0,0,.12),end,.018,steel);ell('chair foot',end,(.028,.028,.016),dark)
ell('seat cushion',(0,-.025,.46),(.345,.29,.085),cloth)
verts=[];faces=[];nu=64;nv=18
for j in range(nv+1):
 t=j/nv
 for i in range(nu+1):
  a=-.2+(math.pi+.4)*i/nu
  x=(.33+.025*t)*math.cos(a);y=(.26+.035*t)*math.sin(a)
  height=.20+.26*math.sin(a)**2
  verts.append((x,y,.43+t*height))
for j in range(nv):
 for i in range(nu):k=j*(nu+1)+i;faces.append((k,k+1,k+nu+2,k+nu+1))
mesh=bpy.data.meshes.new('Curved upholstered shell');mesh.from_pydata(verts,[],faces);ob=bpy.data.objects.new('shell',mesh);s.collection.objects.link(ob);bpy.context.view_layer.objects.active=ob
mod=ob.modifiers.new('Upholstered thickness','SOLIDIFY');mod.thickness=.055;bpy.ops.object.modifier_apply(modifier=mod.name)
mod=ob.modifiers.new('Soft shell rim','BEVEL');mod.width=.022;mod.segments=3;bpy.ops.object.modifier_apply(modifier=mod.name)
for p in ob.data.polygons:p.use_smooth=True
finish(ob,'chair curved back',cloth)
# Smooth closed beanbag with controlled seat depression and cloth seams.
start('sofa',(-1.95,-1.45,0))
verts=[];faces=[];nu=96;nv=48
for j in range(nv+1):
 theta=math.pi*j/nv
 for i in range(nu):
  a=math.tau*i/nu;r=math.sin(theta);x=.56*r*math.cos(a);y=.55*r*math.sin(a);z=.46+.46*math.cos(theta)
  if z>.45:z-=.33*math.exp(-(x/.4)**2-((y+.10)/.36)**2);z+=.12*(y/.55)*math.sin(theta)
  z=max(.012,z);wave=.004*math.sin(a*12+theta*5)*math.sin(theta)**2;verts.append((x*(1+wave),y*(1+wave),z))
for j in range(nv):
 for i in range(nu):a=j*nu+i;b=j*nu+(i+1)%nu;faces.append((a,b,b+nu,a+nu))
mesh=bpy.data.meshes.new('Tailored beanbag');mesh.from_pydata(verts,[],faces);ob=bpy.data.objects.new('beanbag',mesh);s.collection.objects.link(ob)
import bmesh
bm=bmesh.new();bm.from_mesh(mesh);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(mesh);bm.free()
for p in mesh.polygons:p.use_smooth=True
finish(ob,'beanbag sculpt',cloth)
# Solid cabinetry, distinct shelves, true glass, original small collectible robots.
start('cabinet',(-2.975,1.22,0),math.pi/2)
for x in [-.5,.5]:box('cabinet side',(x,0,.95),(.035,.46,1.85),wood)
box('cabinet back',(0,.215,.95),(1.03,.025,1.85),wood)
for z in [.045,.45,.92,1.39,1.88]:box('cabinet shelf',(0,0,z),(1.03,.46,.03),wood)
for x in [-.245,.245]:
 box('lower cabinet door',(x,-.23,.24),(.475,.027,.37),wood,.01)
 for z in [.475,1.865]:box('glass door rail',(x,-.244,z),(.49,.022,.023),steel,.003)
 for xx in [x-.234,x+.234]:box('glass door stile',(xx,-.244,1.17),(.02,.022,1.4),steel,.003)
 box('Glass cabinet pane',(x,-.241,1.17),(.45,.007,1.35),glass,.002)
 rod('cabinet handle',(x*.13,-.274,1.03),(x*.13,-.274,1.20),.009,steel)
for z in [.91,1.38,1.865]:box('shelf LED',(0,-.16,z),( .91,.015,.009),light,.001)
# Reserved bases for licensed online anime figurines; no placeholder robots.
for n in range(6):
 x=(-.25 if n%2==0 else .25);z=[1.405,.935,.465][n//2]
 rod('figure plinth',(x,0,z),(x,0,z+.018),.115,steel)
# Photo surfaces use the existing site's own project images, not Tripo textures.
start('photos',(-3.17,-.55,1.15),math.pi/2)
frames=[(-.5,.5,.27,.35),(0,.64,.42,.49),(.48,.7,.28,.44),(-.52,.10,.3,.23),(-.16,.10,.25,.31),(.21,.12,.35,.26),(.56,.24,.25,.33)]
paths=list((R/'public/projects').glob('*.png'))
for i,(x,z,w,h) in enumerate(frames):
 box('photo frame',(x,0,z),(w,.04,h),wood if i%2==0 else steel,.006)
 box('photo mat',(x,-.024,z),(w-.024,.007,h-.024),paper,.002)
 picture('project photo '+str(i),(x,-.029,z),w-.06,h-.065,paths[i%len(paths)])
# Crisp modeled clock rim, markers and hands.
start('clock',(-3.15,-1.8,2.0),math.pi/2)
rod('clock oak rim',(0,.03,.225),(0,-.03,.225),.225,wood)
rod('clock face',(0,-.031,.225),(0,-.038,.225),.202,ivory)
for i in range(60):
 a=math.tau*i/60;v=Vector((math.sin(a),0,math.cos(a)));end=Vector((0,-.043,.225))+v*.184;begin=end-v*(.025 if i%5==0 else .012);rod('clock tick',begin,end,.0025 if i%5==0 else .0012,steel)
for a,length,r in [(math.radians(120),.12,.005),(math.radians(10),.165,.0035)]:rod('clock hand',(0,-.052,.225),(math.sin(a)*length,-.052,.225+math.cos(a)*length),r,steel)
ell('clock center',(0,-.055,.225),(.011,.008,.011),steel)
# Remove orphan Tripo materials and images by export selection; join parts by material per asset.
for id in ids:
 g=bpy.data.objects['asset-'+id];batches={}
 for ob in list(g.children):
  if ob.type!='MESH' or ob.name=='screen-computer' or ob.name.startswith('speaker-rotor-'):continue
  batches.setdefault(ob.data.materials[0].name,[]).append(ob)
 for batch in batches.values():
  if len(batch)<2:continue
  bpy.ops.object.select_all(action='DESELECT')
  for ob in batch:ob.select_set(True)
  bpy.context.view_layer.objects.active=batch[0];bpy.ops.object.join()
# Floor collisions follow the authored asset footprints.
coll=json.loads((O/'sunset-tripo-colliders.json').read_text());bpy.context.view_layer.update()
for id,index in [('desk',5),('chair',6),('sofa',9),('cabinet',8)]:
 g=bpy.data.objects['asset-'+id];pts=[ob.matrix_world@Vector(v) for ob in g.children if ob.type=='MESH' for v in ob.bound_box];coll[index]={'minX':min(p.x for p in pts)-.02,'maxX':max(p.x for p in pts)+.02,'minZ':min(-p.y for p in pts)-.02,'maxZ':max(-p.y for p in pts)+.02}
(O/'sunset-authored-colliders.json').write_text(json.dumps(coll,indent=2))
bpy.ops.wm.save_as_mainfile(filepath=str(A/'timi-authored-furniture.blend'))
bpy.ops.object.select_all(action='DESELECT')
for ob in s.objects:
 if ob.type in ['MESH','EMPTY']:ob.select_set(True)
bpy.ops.export_scene.gltf(filepath=str(O/'sunset-authored.glb'),export_format='GLB',use_selection=True,export_apply=True,export_yup=True,export_extras=True,export_cameras=False,export_lights=False)
s.render.engine='CYCLES';s.cycles.samples=20;s.cycles.use_denoising=True;s.render.resolution_x=1200;s.render.resolution_y=900;s.render.resolution_percentage=100
s.render.filepath=str(A/'room.png');bpy.ops.render.render(write_still=True)
cam=s.camera;cam.location=(1.8,-.2,1.7);cam.rotation_euler=(Vector((-3,.1,1.4))-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.lens=30;s.render.filepath=str(A/'wall.png');bpy.ops.render.render(write_still=True)
