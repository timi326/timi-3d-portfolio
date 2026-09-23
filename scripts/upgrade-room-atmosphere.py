"""Second pass: clean lounge seat, reference-inspired chess table, oak floor and distant panorama."""
import bpy,math,json,random
from pathlib import Path
from mathutils import Vector,Matrix
R=Path.cwd();A=R/'artifacts/room-atmosphere';A.mkdir(exist_ok=True);O=R/'public/models/timi-studio'
bpy.ops.wm.open_mainfile(filepath=str(R/'artifacts/figurines/timi-furniture-figurines.blend'));s=bpy.context.scene
source=(R/'scripts/build-authored-furniture.py').read_text(encoding='utf-8')
exec(source[source.index('def mat('):source.index("start('desk',")])
def clear(id):
 g=bpy.data.objects['asset-'+id]
 for ob in list(g.children):bpy.data.objects.remove(ob,do_unlink=True)
 return g
def tube(name,points,r,m):
 curve=bpy.data.curves.new(name,'CURVE');curve.dimensions='3D';curve.bevel_depth=r;curve.bevel_resolution=2
 spline=curve.splines.new('POLY');spline.points.add(len(points)-1)
 for p,co in zip(spline.points,points):p.co=(*co,1)
 ob=bpy.data.objects.new(name,curve);s.collection.objects.link(ob);bpy.ops.object.select_all(action='DESELECT');ob.select_set(True);bpy.context.view_layer.objects.active=ob;bpy.ops.object.convert(target='MESH');return finish(ob,name,m)
# Soft tailored lounge beanbag, with a real supported back and inset seat.
clear('sofa');start('sofa',(-1.95,-1.40,0));group['label']='蓝色布艺懒人椅'
cloth.node_tree.nodes.get('Principled BSDF').inputs['Roughness'].default_value=.95
ell('lounge lower body',(0,0,.24),(.56,.56,.235),cloth)
ell('lounge supported back',(0,.28,.55),(.51,.245,.39),cloth)
ell('lounge seat cushion',(0,-.15,.405),(.435,.375,.105),cloth)
for x in [-.44,.44]:ell('lounge side bolster',(x,-.04,.38),(.125,.37,.18),cloth)
seam=mat('fabric piping',(.17,.25,.29),.95)
for z,rx,ry,cy in [(.26,.555,.55,0),(.423,.43,.365,-.15)]:
 tube('tailored piping',[(rx*math.cos(a),cy+ry*math.sin(a),z) for a in [i*math.tau/120 for i in range(121)]],.003,seam)
box('beanbag label',(.565,-.05,.23),(.003,.05,.018),ivory,.002)
# Main floor: individual slim staggered planks, quiet natural variation.
group=bpy.data.objects['asset-floor'];T=Matrix.Identity(4)
for ob in list(group.children):
 if 'Cedar' in ob.name:bpy.data.objects.remove(ob,do_unlink=True)
rng=random.Random(47);floor_mats=[]
for i in range(7):
 m=wood.copy();m.name='Natural oak floor / '+str(i);p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Roughness'].default_value=.76;p.inputs['Specular IOR Level'].default_value=.20
 # Reuse subtle grain through a mapped tint; no giant concentric bands.
 tex=next(n for n in m.node_tree.nodes if n.type=='TEX_IMAGE' and n.image.colorspace_settings.name!='Non-Color')
 mix=m.node_tree.nodes.new('ShaderNodeMixRGB');mix.blend_type='MULTIPLY';mix.inputs[0].default_value=1;mix.inputs[2].default_value=(.73+i*.023,.77+i*.018,.80+i*.015,1)
 m.node_tree.links.new(tex.outputs['Color'],mix.inputs[1]);m.node_tree.links.new(mix.outputs[0],p.inputs['Base Color']);floor_mats.append(m)
for row in range(38):
 x=-3.33+row*.18
 if x>3.34:continue
 y=-4.24-rng.random()*1.4
 while y<3.35:
  length=rng.uniform(1.05,1.75);lo=max(y,-4.24);hi=min(y+length,3.35)
  if hi>lo:
   ob=box('staggered oak plank',(x,(lo+hi)/2,-.019),(.176,hi-lo-.003,.035),floor_mats[rng.randrange(7)],.0015)
   uv=ob.data.uv_layers.active
   for poly in ob.data.polygons:
    for li in poly.loop_indices:
     v=ob.data.vertices[ob.data.loops[li].vertex_index].co;uv.data[li].uv=((v.y+row*.53)*.35,v.x*7)
  y+=length
# Reference-inspired white-top table; original modeled geometry, no copied room mesh.
group=bpy.data.objects.new('asset-coffee-table',None);s.collection.objects.link(group)
group.location=(-1.55,-2.62,0);group['assetId']='coffee-table';group['label']='棋盘茶几';group['editable']=True;group['colliderIndices']=[18]
T=Matrix.Translation(Vector((-1.55,-2.62,0)))
top=mat('matte ivory table',(.77,.74,.70),.58);terracotta=mat('muted terracotta legs',(.33,.12,.075),.68)
box('coffee table top',(0,0,.47),(1.08,.66,.055),top,.038)
for x in [-.40,.40]:box('table slab leg',(x,0,.23),(.115,.54,.46),terracotta,.018)
box('lower magazine shelf',(0,0,.13),(.78,.46,.025),top,.012)
box('chessboard frame',(-.12,-.05,.507),(.51,.51,.025),terracotta,.006)
white=mat('ivory chess pieces',(.86,.83,.75),.32);black=mat('ebony chess pieces',(.016,.021,.023),.3)
for r in range(8):
 for c in range(8):box('chess square',(-.12+(c-3.5)*.058,-.05+(r-3.5)*.058,.523),(.058,.058,.007),white if (r+c)%2==0 else black,0)
def lathe(name,x,y,profile,m):
 verts=[];faces=[];n=32
 for z,r in profile:
  for i in range(n):a=i*math.tau/n;verts.append((x+r*math.cos(a),y+r*math.sin(a),.529+z))
 for j in range(len(profile)-1):
  for i in range(n):a=j*n+i;b=j*n+(i+1)%n;faces.append((a,b,b+n,a+n))
 faces.extend([tuple(reversed(range(n))),tuple((len(profile)-1)*n+i for i in range(n))])
 mesh=bpy.data.meshes.new(name);mesh.from_pydata(verts,[],faces);ob=bpy.data.objects.new(name,mesh);s.collection.objects.link(ob)
 for p in mesh.polygons:p.use_smooth=True
 finish(ob,name,m)
for side,m in [(0,white),(1,black)]:
 for c in range(8):
  for rank in [0,1]:
   r=rank if side==0 else 7-rank
   if rank==1 and c in [3,4]:r+=1 if side==0 else -1
   x=-.12+(c-3.5)*.058;y=-.05+(r-3.5)*.058
   kind='pawn' if rank==1 else ['rook','knight','bishop','queen','king','bishop','knight','rook'][c]
   h={'pawn':.035,'rook':.043,'knight':.046,'bishop':.052,'queen':.060,'king':.064}[kind]
   lathe(kind,x,y,[(0,.017),(.004,.018),(.008,.014),(.013,.009),(h*.63,.006),(h*.72,.012),(h*.78,.011)],m)
   if kind=='knight':
    ell('knight neck',(x,y,.529+h*.82),(.007,.009,.015),m);ell('knight muzzle',(x,y-.007,.529+h),(.008,.014,.007),m)
   elif kind=='rook':
    for a in range(4):box('rook battlement',(x+math.cos(a*math.pi/2)*.008,y+math.sin(a*math.pi/2)*.008,.529+h),(.007,.007,.01),m,.001)
   else:ell('chess crown',(x,y,.529+h*.90),(.010 if kind=='pawn' else .008,.010 if kind=='pawn' else .008,h*.16),m)
   if kind=='king':
    rod('king cross vertical',(x,y,.529+h),(x,y,.529+h+.012),.002,m);rod('king cross arms',(x-.005,y,.529+h+.009),(x+.005,y,.529+h+.009),.002,m)
phone=mat('phone green case',(.12,.24,.15),.52)
box('phone case',(.34,.10,.508),(.12,.24,.014),phone,.012)
box('phone black glass',(.34,.10,.517),(.107,.224,.003),dark,.009)
phone_display=mat('phone wallpaper',(1,1,1),.4)
n=phone_display.node_tree.nodes.new('ShaderNodeTexImage');n.image=bpy.data.images.load(str(R/'public/wallpapers/laptop-green.jpg'),check_existing=True);n.image.pack();phone_display.node_tree.links.new(n.outputs['Color'],phone_display.node_tree.nodes.get('Principled BSDF').inputs['Base Color'])
bpy.ops.mesh.primitive_plane_add(size=1,location=(.34,.10,.519));ob=bpy.context.object;ob.scale=(.092,.191,1);bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);finish(ob,'phone screen',phone_display)
box('earbud case',(.34,-.18,.524),(.095,.07,.047),dark,.018)
box('earbud lid seam',(.34,-.18,.537),(.096,.071,.002),steel,.001)
# Restore the previous true 3D city and sunset from the source blend.
# Push city geometry farther away and soften repeated atlas detail with distance haze.
exterior=bpy.data.objects['asset-exterior'];modified=set()
for ob in exterior.children:
 if ob.type!='MESH' or not any(k in ob.name for k in ['City /','City atlas','River /']):continue
 inverse=ob.matrix_world.inverted()
 for v in ob.data.vertices:
  p=ob.matrix_world@v.co;p.x*=1.15;p.y=p.y*1.3+10;p.z-=2;v.co=inverse@p
 for m in ob.data.materials:
  if not m or m in modified or not m.use_nodes:continue
  modified.add(m)
  for shader in m.node_tree.nodes:
   if shader.type=='EMISSION':shader.inputs['Strength'].default_value=.65 if 'atlas' in m.name.lower() else .85
# Batch per material within changed semantic groups.
for id in ['floor','sofa','coffee-table']:
 g=bpy.data.objects['asset-'+id];batches={}
 for ob in g.children:
  if ob.type=='MESH':batches.setdefault(ob.data.materials[0].name,[]).append(ob)
 for parts in batches.values():
  bpy.ops.object.select_all(action='DESELECT')
  for ob in parts:ob.select_set(True)
  bpy.context.view_layer.objects.active=parts[0]
  if len(parts)>1:bpy.ops.object.join()
coll=json.loads((O/'sunset-authored-colliders.json').read_text());coll=coll[:18]
coll.append({'minX':-2.11,'maxX':-.99,'minZ':2.27,'maxZ':2.97});coll[9]={'minX':-2.54,'maxX':-1.36,'minZ':.82,'maxZ':1.98}
(O/'sunset-atmosphere-colliders.json').write_text(json.dumps(coll,indent=2))
bpy.ops.wm.save_as_mainfile(filepath=str(A/'timi-atmosphere.blend'))
bpy.ops.object.select_all(action='DESELECT')
for ob in s.objects:
 if ob.type in ['MESH','EMPTY']:ob.select_set(True)
bpy.ops.export_scene.gltf(filepath=str(O/'sunset-atmosphere.glb'),export_format='GLB',use_selection=True,export_apply=True,export_yup=True,export_extras=True,export_cameras=False,export_lights=False,export_animations=False)
s.render.engine='CYCLES';s.cycles.samples=24;s.cycles.use_denoising=True;s.render.resolution_x=1400;s.render.resolution_y=950;s.render.resolution_percentage=100
s.camera.location=(.15,-.15,1.65);s.camera.rotation_euler=(Vector((-1.65,-2.15,.50))-s.camera.location).to_track_quat('-Z','Y').to_euler();s.camera.data.lens=43;s.render.filepath=str(A/'lounge.png');bpy.ops.render.render(write_still=True)
