"""Complete Blender-built exterior: modeled streets, varied buildings, terrain and full-sphere sky."""
import bpy,math,random,json,sys
from pathlib import Path
from mathutils import Vector,Matrix
R=Path.cwd();A=R/'artifacts/exterior-v3';A.mkdir(exist_ok=True);O=R/'public/models/timi-studio'
bpy.ops.wm.open_mainfile(filepath=str(R/'artifacts/room-atmosphere/timi-atmosphere.blend'));s=bpy.context.scene
g=bpy.data.objects['asset-exterior']
for ob in list(g.children):bpy.data.objects.remove(ob,do_unlink=True)
rng=random.Random(819);batches={};city_offset=0
def mat(name,c,rough=.85,emission=0,metal=0):
 m=bpy.data.materials.new('ExteriorV3 / '+name);m.use_nodes=True;p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*c,1);p.inputs['Roughness'].default_value=rough;p.inputs['Metallic'].default_value=metal
 if emission:p.inputs['Emission Color'].default_value=(*c,1);p.inputs['Emission Strength'].default_value=emission
 return m
facades=[mat('stucco '+str(i),c) for i,c in enumerate([(.32,.30,.28),(.43,.40,.34),(.25,.29,.32),(.37,.32,.29),(.48,.45,.39),(.25,.26,.24)])]
roof=mat('charcoal roof',(.12,.15,.17));tile=mat('roof tiles',(.25,.17,.14));trim=mat('concrete trim',(.48,.46,.42));asphalt=mat('asphalt',(.095,.11,.12));paving=mat('sidewalk',(.29,.30,.29));soil=mat('landscape earth',(.16,.19,.15));green=mat('tree foliage',(.095,.16,.10));trunk=mat('tree trunks',(.16,.12,.09));glass=mat('cool window glass',(.105,.17,.23),.38,metal=.15);lit=mat('warm apartment windows',(.74,.48,.22),.6,.8);frame=mat('window frames',(.18,.20,.20));mark=mat('road markings',(.61,.60,.52));carpaint=[mat('car '+str(i),c,.35,.0,.3) for i,c in enumerate([(.23,.32,.35),(.51,.43,.32),(.25,.12,.10),(.65,.65,.58)])]
def poly(m,verts,faces):
 vs,fs=batches.setdefault(m,([],[]));start=len(vs);vs.extend([(x,y+city_offset,z) for x,y,z in verts]);fs.extend([tuple(start+i for i in f) for f in faces])
def box(m,x,y,z,w,d,h):
 poly(m,[(x+a*w/2,y+b*d/2,z+c*h/2) for a,b,c in [(-1,-1,-1),(1,-1,-1),(1,1,-1),(-1,1,-1),(-1,-1,1),(1,-1,1),(1,1,1),(-1,1,1)]],[(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)])
def rod(m,a,b,r,n=8):
 a=Vector(a);b=Vector(b);direction=(b-a).normalized();u=direction.cross(Vector((0,0,1)))
 if u.length<.01:u=Vector((1,0,0))
 u.normalize();v=direction.cross(u);points=[tuple(p+r*(math.cos(i*math.tau/n)*u+math.sin(i*math.tau/n)*v)) for p in [a,b] for i in range(n)]
 poly(m,points,[tuple(reversed(range(n))),tuple(range(n,2*n))]+[(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)])
def canopy(x,y,z,r):
 vs=[];nu=10;nv=6
 for j in range(nv+1):
  t=j*math.pi/nv
  for i in range(nu):
   a=i*math.tau/nu;rr=r*(1+.10*math.sin(a*3+j));vs.append((x+rr*math.sin(t)*math.cos(a),y+rr*math.sin(t)*math.sin(a),z+r*.95*math.cos(t)))
 poly(green,vs,[(j*nu+i,j*nu+(i+1)%nu,(j+1)*nu+(i+1)%nu,(j+1)*nu+i) for j in range(nv) for i in range(nu)])
def tree(x,y,size=1):
 rod(trunk,(x,y,-12),(x,y,-12+2.4*size),.10*size)
 for dx,dy,dz,r in [(0,0,3,1.0),(.5,.1,2.7,.7),(-.4,-.2,2.5,.8)]:canopy(x+dx*size,y+dy*size,-12+dz*size,r*size)
# Ground extends beyond the enclosing skyline. The window has a modeled facade below it.
box(soil,0,0,-12.35,1000,1000,.5)
box(facades[1],0,3.48,-6.25,7.4,.22,11.5)
box(trim,0,3.68,-.12,7.5,.65,.20)
for x in [-3.55,3.55]:box(trim,x,3.54,-6,.14,.26,12)
for z in [-3.4,-6.4,-9.4]:
 box(trim,0,3.60,z,7.3,.24,.13)
 for x in [-2.5,-.85,.85,2.5]:box(glass,x,3.605,z+1,1.1,.025,1.55)
# Original city placement retained; sunset framing is controlled separately.
city_offset=0
# Near boulevard, paving and crossings, then block roads into the distance.
for y in [9,34,64,100,144,196]:
 box(asphalt,0,y,-12.01,380,6,.10)
 for side in [-1,1]:box(paving,0,y+side*3.9,-11.90,380,1.7,.28)
 for x in range(-170,171,9):box(mark,x,y,-11.949,3,.10,.005)
for x in [-104,-64,-24,24,64,104]:
 box(asphalt,x,101,-12,5.5,230,.10)
 for side in [-1,1]:box(paving,x+side*3.5,101,-11.91,1.4,230,.24)
 for y in range(5,210,10):box(mark,x,y,-11.944,.10,3,.005)
 for y in [9,34,64]:
  for i in range(6):box(mark,x-2+i*.8,y-1.8,-11.94,.4,3.4,.012)
# Varied neighboring buildings: stepped slabs, pitched roofs, balconies and roof equipment.
count=0
for row,(y0,y1) in enumerate([(16,29),(42,58),(73,91),(111,134),(156,185),(210,248)]):
 for col,x0 in enumerate(range(-153,154,14)):
  if any(abs(x0-x)<7 for x in [-104,-64,-24,24,64,104]):continue
  x=x0+rng.uniform(-1.3,1.3);y=(y0+y1)/2+rng.uniform(-1,1);w=rng.uniform(7,11);d=rng.uniform(7,min(14,y1-y0));floors=rng.randint(2,4) if row==0 else rng.randint(3,6+row*2);h=floors*2.65
  if abs(x)<12 and row==0:floors=2;h=5.3
  m=rng.choice(facades);box(m,x,y,-12+h/2,w,d,h);count+=1
  box(trim,x,y,-12+h+.12,w+.2,d+.2,.24)
  if floors<=4 and count%3==0:
   z=-12+h+.24;peak=z+1.9
   poly(tile,[(x-w*.55,y-d*.55,z),(x+w*.55,y-d*.55,z),(x+w*.55,y+d*.55,z),(x-w*.55,y+d*.55,z),(x,y-d*.55,peak),(x,y+d*.55,peak)],[(0,4,5,3),(4,1,2,5),(0,1,4),(3,5,2)])
   for i in range(6):rod(roof,(x-w*.55+i*w*.22,y-d*.55,z+min(i,5-i)*.65),(x-w*.55+i*w*.22,y+d*.55,z+min(i,5-i)*.65),.045)
  else:
   for side in [-1,1]:
    box(roof,x+side*w*.49,y,-12+h+.38,.13,d,.52);box(roof,x,y+side*d*.49,-12+h+.38,w,.13,.52)
   box(roof,x+w*.17,y,-12+h+.65,w*.25,d*.28,1.1)
   if count%2==0:box(trim,x-w*.23,y+d*.2,-12+h+.4,1.5,1.1,.55)
  # Four-sided window geometry, sparse lit rooms; no repeated building texture atlas.
  for floor in range(floors):
   z=-12+1.35+floor*2.65
   for side in [-1,1]:
    for c in range(max(2,int(w/1.8))):
     xx=x-w*.36+c*(w*.72/(max(2,int(w/1.8))-1));yy=y+side*(d/2+.025);window=lit if rng.random()<.16 else glass
     box(frame,xx,yy,z,1.04,.045,1.45);box(window,xx,yy+side*.025,z,.84,.016,1.22)
     if row<2 and floor>0 and count%4==0:
      box(trim,xx,yy+side*.32,z-.82,1.4,.65,.13);rod(frame,(xx-.63,yy+side*.58,z-.75),(xx-.63,yy+side*.58,z-.15),.025);rod(frame,(xx+.63,yy+side*.58,z-.75),(xx+.63,yy+side*.58,z-.15),.025);rod(frame,(xx-.63,yy+side*.58,z-.15),(xx+.63,yy+side*.58,z-.15),.025)
    for c in range(max(2,int(d/2.1))):
     yy=y-d*.34+c*d*.68/(max(2,int(d/2.1))-1);xx=x+side*(w/2+.028)
     box(glass if rng.random()>.12 else lit,xx,yy,z,.02,.85,1.2)
  if row<2:
   box(roof,x,y-d/2-.65,-9.5,w*.75,1.25,.15)
   for xx in [x-w*.35,x+w*.35]:tree(xx,y-d/2-1.4,.75)
for y in [4.7,13.4,38.2,68.2]:
 for x in range(-100,101,10):
  if abs(x)<4 and y==4.7:continue
  tree(x,y,rng.uniform(.8,1.2))
for x in range(-100,101,18):
 rod(frame,(x,5,-11.8),(x,5,-7.5),.055);rod(frame,(x,5,-7.5),(x,6,-7.5),.045);box(lit,x,6,-7.55,.28,.55,.08)
# Visible parked and moving cars give the street a readable human scale.
for i in range(32):
 x=rng.uniform(-130,130);y=rng.choice([7.7,10.4,32.7,35.4]);m=rng.choice(carpaint)
 box(m,x,y,-11.38,3.4,1.55,.9);box(glass,x-.15,y,-10.75,1.6,1.35,.62)
 for dx in [-1.05,1.05]:
  for dy in [-.77,.77]:rod(roof,(x+dx,y+dy-.09,-11.62),(x+dx,y+dy+.09,-11.62),.33,12)
# Continuous irregular mountain rings close the horizon in all directions.
for layer in range(3):
 m=mat('haze ridge '+str(layer),[(.18,.25,.29),(.25,.31,.36),(.34,.37,.42)][layer]);vs=[];n=192;r=280+layer*55
 for i in range(n+1):
  a=i*math.tau/n;height=15+layer*9+18*(.5+.5*math.sin(a*5+.7*layer))+10*math.sin(a*11+layer)
  for z in [-14,height]:vs.append((r*math.sin(a),r*math.cos(a),z))
 poly(m,vs,[(i*2,i*2+2,i*2+3,i*2+1) for i in range(n)])
for m,(verts,faces) in batches.items():
 mesh=bpy.data.meshes.new(m.name);mesh.from_pydata(verts,[],faces);mesh.update();ob=bpy.data.objects.new(m.name,mesh);s.collection.objects.link(ob);mesh.materials.append(m);world=ob.matrix_world.copy();ob.parent=g;ob.matrix_world=world
# Enclosing sky sphere: full 360 degrees and both poles, no side or lower cut edges.
sky=bpy.data.materials.new('Sky / Blender rendered atmosphere');sky.use_nodes=True;nodes=sky.node_tree.nodes;nodes.clear();out=nodes.new('ShaderNodeOutputMaterial');em=nodes.new('ShaderNodeEmission');em.inputs['Strength'].default_value=.8;tex=nodes.new('ShaderNodeTexImage');tex.image=bpy.data.images.load(str(O/'blender-sky-360.png'));tex.image.pack();sky.node_tree.links.new(tex.outputs['Color'],em.inputs['Color']);sky.node_tree.links.new(em.outputs[0],out.inputs['Surface'])
vs=[];uvs=[];fs=[];nu=128;nv=64
for j in range(nv+1):
 lat=-math.pi/2+j*math.pi/nv
 for i in range(nu+1):
  a=(i/nu-.5)*math.tau;vs.append((480*math.cos(lat)*math.sin(a),480*math.cos(lat)*math.cos(a),480*math.sin(lat)));uvs.append((i/nu,j/nv))
for j in range(nv):
 for i in range(nu):k=j*(nu+1)+i;fs.append((k,k+1,k+nu+2,k+nu+1))
mesh=bpy.data.meshes.new('Full sky sphere');mesh.from_pydata(vs,[],fs);uv=mesh.uv_layers.new()
for f in mesh.polygons:
 for li in f.loop_indices:uv.data[li].uv=uvs[mesh.loops[li].vertex_index]
ob=bpy.data.objects.new('ExteriorV3 / Sky full sphere',mesh);s.collection.objects.link(ob);mesh.materials.append(sky);world=ob.matrix_world.copy();ob.parent=g;ob.matrix_world=world
g['geometrySource']='Original Blender streets, buildings, trees, terrain and Cycles-rendered spherical sky';g['buildingCount']=count
# Broad warm fill for the rendered inspection views; runtime uses an isolated exterior light layer.
bpy.ops.object.light_add(type='AREA',location=(-60,-35,65));fill=bpy.context.object;fill.name='Exterior warm sky bounce';fill.data.energy=45000;fill.data.color=(1,.78,.56);fill.data.shape='DISK';fill.data.size=90;fill.rotation_euler=(Vector((0,55,-4))-fill.location).to_track_quat('-Z','Y').to_euler()
bpy.ops.wm.save_as_mainfile(filepath=str(A/'timi-exterior.blend'))
bpy.ops.object.select_all(action='DESELECT')
for ob in s.objects:
 if ob.type in ['MESH','EMPTY']:ob.select_set(True)
bpy.ops.export_scene.gltf(filepath=str(O/'sunset-exterior.glb'),export_format='GLB',use_selection=True,export_apply=True,export_yup=True,export_extras=True,export_cameras=False,export_lights=False,export_animations=False)
s.camera.data.clip_end=700;s.render.engine='CYCLES';s.cycles.samples=24;s.cycles.use_denoising=True;s.render.resolution_x=1400;s.render.resolution_y=1000;s.render.resolution_percentage=100;s.camera.data.lens=23
views=[('window',(0,3.03,1.62),(0,60,7)),('left',(-.5,3.03,1.62),(-60,70,25)),('right',(.5,3.03,1.62),(60,70,25)),('down',(0,3.03,1.62),(0,8,-12)),('exterior',(-2,5,5.5),(15,80,-1))]
for name,pos,target in (views[:1] if '--quick' in sys.argv else views):
 s.camera.location=pos;s.camera.rotation_euler=(Vector(target)-Vector(pos)).to_track_quat('-Z','Y').to_euler();s.render.filepath=str(A/(name+'.png'));bpy.ops.render.render(write_still=True)
print('EXTERIOR BUILDINGS',count,'MATERIAL BATCHES',len(batches))
