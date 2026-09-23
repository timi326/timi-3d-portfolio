"""Reproducible, metre-scale apartment. Blender 5.2, no external model inputs.
Run with blender --background --python scripts/build-blender-apartment.py.
Coordinates below use website X / height / Z; the helpers convert to Blender.
"""
import bpy, math, json, random
import numpy as np
from pathlib import Path
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'public/models/timi-studio'
ART = ROOT / 'artifacts/sunset-remodel'
OUT.mkdir(parents=True, exist_ok=True)
ART.mkdir(parents=True, exist_ok=True)
random.seed(19)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
COLLIDERS = []

def pos(p): return (p[0], -p[2], p[1])
def linear(c): return ((c + .055) / 1.055)**2.4 if c > .04045 else c / 12.92
def rgb(h): return tuple(linear(int(h[i:i+2],16)/255) for i in (0,2,4))

def mat(name, color, rough=.5, metal=0, texture=None):
    m=bpy.data.materials.new(name); m.diffuse_color=(*rgb(color),1); m.use_nodes=True
    p=m.node_tree.nodes.get('Principled BSDF')
    p.inputs['Base Color'].default_value=m.diffuse_color
    p.inputs['Roughness'].default_value=rough; p.inputs['Metallic'].default_value=metal
    if texture:
        n=m.node_tree.nodes.new('ShaderNodeTexImage'); n.image=texture
        m.node_tree.links.new(n.outputs['Color'],p.inputs['Base Color'])
    return m

def tex(name, color, kind):
    n=512; y,x=np.mgrid[0:n,0:n]/n
    rng=np.random.default_rng(17)
    noise=rng.random((n,n))-.5
    if kind=='wood':
        v=.022*np.sin(2*math.pi*(x*54+1.4*np.sin(y*6.28)+.4*np.sin(y*25.13)))+.009*np.sin(x*1759)+noise*.015
    elif kind=='cloth':
        v=.012*np.sin(x*math.pi*256)*np.sin(y*math.pi*256)+noise*.024
    else:
        v=.009*np.sin(x*31+y*17)*np.cos(y*27)+noise*.014
    pixels=np.ones((n,n,4),dtype=np.float32)
    for i,channel in enumerate(rgb(color)): pixels[:,:,i]=np.clip(channel*(1+v*3),0,1)
    image=bpy.data.images.new(name,n,n); image.colorspace_settings.name='Linear Rec.709'
    image.pixels.foreach_set(pixels.ravel()); image.filepath_raw=str(OUT/(name+'.png')); image.file_format='PNG'; image.save(); image.pack()
    return image

oak=mat('Oak / longitudinal grain','B18A60',.48,texture=tex('oak-grain','B18A60','wood'))
walnut=mat('Walnut / open pore','69503B',.46,texture=tex('walnut-grain','69503B','wood'))
linen=mat('Linen / woven ivory','D8D4C9',.94,texture=tex('linen-weave','D8D4C9','cloth'))
blue=mat('Upholstery / mineral blue','536A74',.89,texture=tex('blue-weave','536A74','cloth'))
stone=mat('Limestone / honed','B9B4A8',.62,texture=tex('limestone','B9B4A8','stone'))
plaster=mat('Plaster / chalk','E1DFD7',.88,texture=tex('plaster','E1DFD7','stone'))
white=mat('Porcelain / glazed','ECEDE7',.22)
black=mat('Metal / graphite','242B30',.34,.78)
brass=mat('Metal / brushed champagne','A39376',.32,.78)
green=mat('Leaves / olive','405B3B',.61)
terracotta=mat('Clay / smoke','8A7261',.86)
paper=mat('Paper / natural','C8C6BB',.94)
seam=mat('Seams / oatmeal','AAA497',.95)
glass=mat('Glass / clear','E0EEF1',.07)
gp=glass.node_tree.nodes.get('Principled BSDF'); gp.inputs['Transmission Weight'].default_value=.94; gp.inputs['IOR'].default_value=1.45
mirror=mat('Mirror / silver','D8E0DF',.055,1)
screen=mat('Screen / replace at runtime','13222D',.3)
glow=mat('Light / warm diffuser','FFF0D8',.45)
gp=glow.node_tree.nodes.get('Principled BSDF'); gp.inputs['Emission Color'].default_value=(*rgb('FFE4B9'),1); gp.inputs['Emission Strength'].default_value=2

def finish(obj,name,m):
    obj.name=name; obj.data.materials.append(m)
    return obj

def box(name, size, p, m, bevel=.015, rot=0):
    sx,sy,sz=size[0]/2,size[2]/2,size[1]/2
    me=bpy.data.meshes.new(name)
    me.from_pydata([(-sx,-sy,-sz),(-sx,-sy,sz),(-sx,sy,-sz),(-sx,sy,sz),(sx,-sy,-sz),(sx,-sy,sz),(sx,sy,-sz),(sx,sy,sz)],[],[(2,6,4,0),(5,7,3,1),(4,5,1,0),(3,7,6,2),(1,3,2,0),(6,7,5,4)])
    me.update(); o=bpy.data.objects.new(name,me); bpy.context.collection.objects.link(o); o.location=pos(p)
    bpy.context.view_layer.objects.active=o
    if bevel:
        mod=o.modifiers.new('Crafted edge radii','BEVEL'); mod.width=min(bevel,min(size)*.45); mod.segments=3
        bpy.ops.object.modifier_apply(modifier=mod.name)
        mod=o.modifiers.new('Weighted corner normals','WEIGHTED_NORMAL'); mod.keep_sharp=True
        bpy.ops.object.modifier_apply(modifier=mod.name)
    o.rotation_euler.z=rot
    return finish(o,name,m)

def ellipsoid(name,size,p,m):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=24,ring_count=12,location=pos(p))
    o=bpy.context.object; o.scale=(size[0],size[2],size[1])
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    for f in o.data.polygons: f.use_smooth=True
    return finish(o,name,m)

def cyl(name,r,h,p,m,r2=None):
    bpy.ops.mesh.primitive_cone_add(vertices=32,radius1=r if r2 is None else r2,radius2=r,depth=h,location=pos(p))
    o=bpy.context.object
    mod=o.modifiers.new('Edge glint','BEVEL'); mod.width=min(.008,h*.15); mod.segments=2
    bpy.ops.object.modifier_apply(modifier=mod.name)
    for f in o.data.polygons: f.use_smooth=len(f.vertices)==4
    return finish(o,name,m)

def tube(name,points,r,m):
    curve=bpy.data.curves.new(name,'CURVE'); curve.dimensions='3D'; curve.bevel_depth=r; curve.bevel_resolution=2
    s=curve.splines.new('POLY'); s.points.add(len(points)-1)
    for v,p in zip(s.points,points): v.co=(*pos(p),1)
    o=bpy.data.objects.new(name,curve); bpy.context.collection.objects.link(o); curve.materials.append(m)
    return o

def lathe(name,profile,p,m,aspect=1):
    vertices=[]; faces=[]; n=48
    for r,h in profile:
        for j in range(n):
            a=j*2*math.pi/n; vertices.append(pos((p[0]+r*math.cos(a),p[1]+h,p[2]+r*math.sin(a)*aspect)))
    for i in range(len(profile)-1):
        for j in range(n): faces.append((i*n+j,i*n+(j+1)%n,(i+1)*n+(j+1)%n,(i+1)*n+j))
    mesh=bpy.data.meshes.new(name); mesh.from_pydata(vertices,[],faces); mesh.update()
    o=bpy.data.objects.new(name,mesh); bpy.context.collection.objects.link(o); finish(o,name,m)
    for f in mesh.polygons: f.use_smooth=True
    return o

def cushion(name,size,p,m,rot=0):
    o=box(name,size,p,m,min(size)*.40,rot)
    # Subdivision and small directional deformation avoid rigid box-shaped upholstery.
    bpy.context.view_layer.objects.active=o
    mod=o.modifiers.new('Soft upholstery','SUBSURF'); mod.levels=2
    bpy.ops.object.modifier_apply(modifier=mod.name)
    for v in o.data.vertices:
        v.co.z+=.007*math.sin(v.co.x*43+v.co.y*17)*math.sin(v.co.y*28)
    for f in o.data.polygons: f.use_smooth=True
    return o

def block(x,z,w,d): COLLIDERS.append(dict(minX=x-w/2,maxX=x+w/2,minZ=z-d/2,maxZ=z+d/2))
def wall(x,z,w,d):
    box('Architecture / plaster wall',(w,2.82,d),(x,1.41,z),plaster,.008); block(x,z,w,d)
    along=w>d
    for side in [-1,1]:
        box('Architecture / oak skirting',(w if along else .018,.075,.018 if along else d),(x if along else x+side*(w/2+.009),.0375,z+side*(d/2+.009) if along else z),oak,.004)


# Sunset room: an intimate timber bedroom / workspace, with a bathroom annex.
# Authored geometry, UV cloth, city and sky are shared by Blender and the browser.
def emission(name,color,strength=1):
    m=mat(name,color); n=m.node_tree.nodes; n.clear()
    e=n.new('ShaderNodeEmission'); e.inputs[0].default_value=(*rgb(color),1); e.inputs[1].default_value=strength
    out=n.new('ShaderNodeOutputMaterial'); m.node_tree.links.new(e.outputs[0],out.inputs['Surface'])
    return m

def gridmesh(name,vertices,faces,m,uvs=None):
    me=bpy.data.meshes.new(name); me.from_pydata([pos(v) for v in vertices],[],faces); me.update()
    o=bpy.data.objects.new(name,me); bpy.context.collection.objects.link(o); finish(o,name,m)
    if uvs:
        layer=me.uv_layers.new()
        for f in me.polygons:
            for li in f.loop_indices: layer.data[li].uv=uvs[me.loops[li].vertex_index]
    for f in me.polygons: f.use_smooth=True
    return o

# Tactile dark woods and warm grey plaster; linen remains cool in the window light.
wood=mat('Cedar / aged grain','624934',.6,texture=tex('cedar-grain','624934','wood'))
woodlight=mat('Cedar / worn edges','927452',.54,texture=tex('cedar-light','927452','wood'))
wallmat=mat('Plaster / dusk ivory','AFA89B',.93,texture=tex('dusk-plaster','AFA89B','stone'))
curtainmat=mat('Linen / blue grey woven','82929D',.97,texture=tex('curtain-fibre','82929D','cloth'))
navy=mat('Fabric / ink indigo','293E50',.94)
rust=mat('Book / faded terracotta','A76B50',.8)
sage=mat('Book / faded sage','687970',.85)
leafmat=mat('Leaves / deep jade','314D3E',.75)
# Woven blue plaid is UV mapped continuously over the draped surface.
n=1024; yy,xx=np.mgrid[0:n,0:n]/n
plaid=np.ones((n,n,4),dtype=np.float32)
base=np.array(rgb('385C77'))
for c in range(3): plaid[:,:,c]=base[c]
a=(xx*6)%1; b=(yy*8)%1
broad=(a<.28)|(b<.24); plaid[broad,:3]*=.50
stripe=(a>.38)&(a<.46)|(b>.36)&(b<.44)
plaid[stripe,:3]=np.array(rgb('B5C1C4'))
fine=((xx*36)%1<.045)|((yy*48)%1<.045)
plaid[fine,:3]=np.array(rgb('D8D7CA'))
weave=1+.075*np.sin(xx*math.pi*800)*np.sin(yy*math.pi*900)
plaid[:,:,:3]*=weave[:,:,None]
im=bpy.data.images.new('Indigo plaid / woven cotton',n,n); im.colorspace_settings.name='Linear Rec.709'; im.pixels.foreach_set(plaid.ravel()); im.filepath_raw=str(OUT/'indigo-plaid.png'); im.file_format='PNG'; im.save(); im.pack()
quiltmat=mat('Quilt / indigo check','FFFFFF',.96,texture=im)

# Architecture: main room 6 x 6.8 m; front wall opens onto a deep city view.
for row in range(24):
    x=-2.875+row*.25
    for k in range(5):
        z0=max(-3,-3.8+(row%3)*.45+k*1.6); z1=min(3.8,-3.8+(row%3)*.45+(k+1)*1.6)
        if z1>z0: box('Floor / cedar boards',(.247,.055,z1-z0-.006),(x,-.028,(z0+z1)/2),wood if row%4 else woodlight,.002)
box('Architecture / dark timber ceiling',(6.18,.12,6.98),(0,3.08,.4),wood,.01)
# Side / rear walls and bathroom passage.
for x,z,w,d in [(-3,.4,.16,6.8),(0,3.8,6,.16),(3,-1.5,.16,3),(3,3.2,.16,1.2)]:
    box('Architecture / plaster',(w,3.0,d),(x,1.5,z),wallmat,.008); block(x,z,w,d)
# Low window apron + solid upper header and narrow side returns.
for x,y,w,h in [(0,.43,6,.86),(0,2.91,6,.18),(-2.77,1.84,.46,1.96),(2.77,1.84,.46,1.96)]:
    box('Window / plaster returns',(w,h,.16),(x,y,-3),wallmat,.008)
block(0,-3,6,.16)
for z in [-2.96,3.71]:
    box('Joinery / crown rail',(6,.13,.14),(0,2.9,z),wood,.012)
    box('Joinery / skirting',(6,.14,.045),(0,.07,z),woodlight,.006)
for x in [-2.92,2.92]:
    box('Joinery / side crown',(.14,.13,6.8),(x,2.9,.4),wood,.01)
    box('Joinery / side skirting',(.045,.14,6.8),(x,.07,.4),woodlight,.005)
for x in [-2.9,-1.45,0,1.45,2.9]: box('Ceiling / exposed beam',(.095,.13,6.8),(x,2.99,.4),wood,.012)
for x in [-2.56,-.88,.88,2.56]: box('Window / cedar mullion',(.065,1.95,.13),(x,1.84,-2.94),wood,.008)
for y in [.89,2.8]: box('Window / cedar frame',(5.20,.075,.16),(0,y,-2.94),wood,.008)
box('Window / sliding transom',(3.42,.04,.11),(.85,1.72,-2.92),woodlight,.006)
box('Window / deep sill',(5.34,.06,.36),(0,.865,-2.87),woodlight,.014)
for x in [-.82,.94]: box('Window / latch',(.014,.09,.025),(x,1.47,-2.845),brass,.003)
# Linen drapes with gathered waist, hem and actual continuous folds.
for side in [-1,1]:
    vertices=[]; faces=[]; uv=[]; nx=40; ny=40
    for iy in range(ny+1):
        t=iy/ny; y=.13+2.70*t
        width=.65-.23*math.exp(-((t-.45)/.19)**2)
        for ix in range(nx+1):
            u=ix/nx; x=side*2.39+(u-.5)*width
            z=-2.71+.065*math.sin(u*math.pi*12)+.035*math.sin(t*5+u*12)
            vertices.append((x,y,z)); uv.append((u*2,t*5))
    for iy in range(ny):
        for ix in range(nx):
            k=iy*(nx+1)+ix; faces.append((k,k+1,k+nx+2,k+nx+1))
    gridmesh('Curtain / gathered linen',vertices,faces,curtainmat,uv)
    tube('Curtain / woven tie',[(side*2.39-.23,1.34,-2.64),(side*2.39,1.3,-2.58),(side*2.39+.23,1.34,-2.64)],.016,linen)
# Shelf above the window, with boxes and books.
box('Window / overhead shelf',(5.45,.045,.32),(0,2.82,-2.76),woodlight,.009)

bookmats=[paper,navy,rust,sage,woodlight]
def book(x,y,z,w=.055,h=.25,d=.18,idx=0,flat=False):
    cover=bookmats[idx%len(bookmats)]
    if flat:
        box('Books / stacked cover',(h,w,d),(x,y+w/2,z),cover,.004,rot=(idx%3-1)*.05)
        box('Books / page block',(h-.013,w*.62,d-.008),(x,y+w/2,z+.005),paper,.002)
    else:
        box('Books / cloth cover',(w,h,d),(x,y+h/2,z),cover,.003)
        box('Books / gilded spine band',(w*.82,.012,.003),(x,y+h*.78,z+d/2+.002),brass,.001)
    return w
for i in range(16): book(-1.9+i*.11,2.85,-2.76,.08,.10+random.random()*.12,.15,i)

print('PHASE: furniture',flush=True)
# Desk: aged oak, drawers, open storage and a laptop facing the room.
box('Desk / thick rounded top',(2.65,.065,.76),(-1.03,.765,-2.40),woodlight,.025)
for x in [-2.22,.16]:
    for z in [-2.67,-2.13]: box('Desk / tapered leg',(.075,.73,.075),(x,.365,z),wood,.013)
box('Desk / rear stretcher',(2.40,.09,.06),(-1.03,.20,-2.64),wood,.008)
block(-1.03,-2.4,2.65,.76)
for i in range(4):
    box('Desk / paper drawer',(.42,.125,.54),(.00,.12+i*.145,-2.39),curtainmat,.007)
    box('Desk / drawer pull',(.15,.021,.025),(.00,.13+i*.145,-2.10),black,.004)
box('Laptop / aluminum base',(.91,.025,.48),(-1.34,.815,-2.34),black,.013)
box('Laptop / display shell',(.93,.59,.028),(-1.34,1.108,-2.54),black,.016)
box('screen-computer',(.89,.55,.004),(-1.34,1.108,-2.523),screen,.001)
for row in range(5):
    for col in range(14): box('Laptop / individual keycap',(.046,.006,.026),(-1.67+col*.050,.832,-2.47+row*.034),paper,.003)
box('Laptop / trackpad',(.24,.002,.085),(-1.34,.83,-2.17),stone,.005)
for i in range(7): book(-.34+i*.06,.80,-2.57,.05,.19+random.random()*.17,.17,i)
for i in range(4): book(-.43,.80+i*.031,-2.18,.03,.34,.23,i,True)
lathe('Desk / glazed mug',[(0,0),(.048,0),(.054,.105),(.048,.112),(.040,.107),(.037,.017),(0,.017)],(-1.98,.80,-2.25),white)
tube('Desk / mug handle',[(-2.025,.89,-2.25),(-2.08,.89,-2.25),(-2.09,.84,-2.25),(-2.025,.825,-2.25)],.009,white)
cyl('Desk / pencil pot',.047,.11,(-2.12,.85,-2.62),wood)
for i in range(7): tube('Desk / pencils',[(-2.15+i*.009,.83,-2.62),(-2.16+i*.013,1.03+random.random()*.05,-2.62)],.003,bookmats[i%5])
# Brass articulated task lamp: shade, arm, hinges and warm diffuser.
cyl('Lamp / weighted foot',.10,.024,(.22,.813,-2.44),black)
tube('Lamp / articulated arms',[(.22,.83,-2.44),(.37,1.17,-2.46),(.11,1.40,-2.35)],.012,brass)
for p in [(.37,1.17,-2.46),(.11,1.40,-2.35)]: ellipsoid('Lamp / hinge',(.023,.023,.023),p,black)
lathe('Lamp / spun shade',[(.13,0),(.13,.01),(.075,.11),(.027,.14)],(.10,1.24,-2.35),woodlight)
cyl('Lamp / golden diffuser',.104,.008,(.10,1.24,-2.35),glow)
# Timber desk chair, pulled back, facing the laptop.
box('Chair / seat',(.53,.065,.49),(-1.15,.46,-1.32),woodlight,.03)
for x in [-1.37,-.93]:
    for z in [-1.51,-1.13]: tube('Chair / splayed legs',[(x,.46,z),(x+(.025 if x> -1 else -.025),.02,z+.025)],.023,wood)
for x in [-1.37,-.93]: tube('Chair / back stile',[(x,.25,-1.10),(x,.96,-1.09)],.023,wood)
for y in [.66,.84,.96]: box('Chair / back slat',(.49,.06,.042),(-1.15,y,-1.09),woodlight,.012)
cushion('Chair / woven seat pad',(.47,.055,.43),(-1.15,.505,-1.32),navy)
block(-1.15,-1.31,.57,.57)
# Single bed along right wall, lattice headboard and a genuinely draped duvet.
box('Bed / timber frame',(1.53,.18,2.48),(1.72,.28,-1.24),wood,.04)
for x in [1.06,2.38]:
    for z in [-2.30,-.18]: box('Bed / turned feet',(.09,.26,.09),(x,.13,z),woodlight,.016)
cushion('Bed / mattress',(1.46,.25,2.32),(1.72,.47,-1.24),linen)
for x in [.91,2.53]: box('Bed / headboard posts',(.07,1.16,.075),(x,.58,-2.49),woodlight,.015)
for y in [.47,.77,1.08]: box('Bed / horizontal rail',(1.65,.065,.065),(1.72,y,-2.49),woodlight,.01)
for i in range(9): box('Bed / lattice spindle',(.038,.62,.043),(.99+i*.18,.76,-2.49),woodlight,.006)
for x in [.95,2.49]: box('Bed / footpost',(.075,.76,.075),(x,.38,.025),woodlight,.012)
box('Bed / foot rail',(1.61,.10,.08),(1.72,.61,.025),woodlight,.014)
cushion('Bed / pillow',(.93,.20,.47),(1.73,.69,-2.11),linen,-.06)
vertices=[]; faces=[]; uv=[]; nx=72; nz=80
for iz in range(nz+1):
    v=iz/nz; z=-1.96+2.21*v
    for ix in range(nx+1):
        u=ix/nx; q=(u-.5)*2.08; x=1.72+q
        drop=max(0,abs(q)-.68)*1.34 + max(0,z+.18)*.55
        wave=.023*math.sin(u*49+v*16)+.016*math.sin(v*52-u*11)+.018*math.sin(u*23+v*29)
        y=.66-drop+wave+.06*math.exp(-((v-.07)/.11)**2)
        vertices.append((x,y,z)); uv.append((u,v))
for iz in range(nz):
    for ix in range(nx):
        k=iz*(nx+1)+ix; faces.append((k,k+1,k+nx+2,k+nx+1))
quilt=gridmesh('Bed / flowing indigo plaid quilt',vertices,faces,quiltmat,uv)
solid=quilt.modifiers.new('Cotton thickness','SOLIDIFY'); solid.thickness=.009
bpy.context.view_layer.objects.active=quilt; bpy.ops.object.modifier_apply(modifier=solid.name)
block(1.72,-1.2,1.63,2.60)
# Wall shelf, books, framed notes and air conditioner.
box('Bedside / floating shelf',(.35,.045,2.26),(2.73,1.92,-1.62),woodlight,.012)
for i in range(10): book(2.70,1.95,-2.45+i*.10,.20,.14+random.random()*.11,.074,i)
box('Air conditioner / rounded case',(.28,.41,1.48),(2.76,2.52,-1.66),white,.12)
for i in range(6): box('Air conditioner / vent',(.008,.012,1.22),(2.605,2.39+i*.024,-1.66),stone,.003)
# Papers on the wall are textured with drawn lines and diagrams, not blank tiles.
papertex=np.ones((512,512,4),dtype=np.float32); papertex[:,:,:3]=np.array(rgb('C7C1AB'))
for j in range(9): papertex[65+j*38:67+j*38,48:440,:3]=np.array(rgb('817F77'))
for j in range(6): papertex[210:402,65+j*65:67+j*65,:3]=np.array(rgb('817F77'))
im2=bpy.data.images.new('Notes / ruled journal',512,512); im2.colorspace_settings.name='Linear Rec.709'; im2.pixels.foreach_set(papertex.ravel()); im2.pack()
notes=mat('Paper / sketches and calendar','FFFFFF',.95,texture=im2)
for i in range(7):
    z=-2.18+(i%3)*.48; y=.95+(i//3)*.38
    box('Wall / pinned journal',(.007,.30,.32),(2.9,y,z),notes,.001)
    ellipsoid('Wall / brass pin',(.015,.012,.012),(2.885,y+.12,z),brass)
# Tall bookcase to left, linen boxes, horizontal and standing books.
for x in [-2.84,-2.27]: box('Bookcase / upright',(.05,2.72,.43),(x,1.36,-1.17),wood,.008)
for y in [.10,.59,1.08,1.57,2.06,2.66]:
    box('Bookcase / shelf',(.62,.04,.43),(-2.555,y,-1.17),woodlight,.006)
for level in range(5):
    for i in range(7): book(-2.77+i*.069,.12+level*.49,-1.12,.056,.23+random.random()*.13,.28,i+level)
block(-2.55,-1.17,.63,.46)
# Woven striped rug in the aisle.
for i in range(65):
    box('Rug / woven stripe',(2.02,.012,.033),(-.65,.009,.13+i*.034),[rust,linen,navy,woodlight,curtainmat][(i//2)%5],.001)
# Back of room: low sofa and a quiet media console, retained portfolio TV.
box('Sofa / timber plinth',(1.75,.17,.75),(-1.83,.21,2.05),wood,.025)
cushion('Sofa / seat',(1.64,.19,.72),(-1.83,.38,2.05),curtainmat)
cushion('Sofa / back',(1.70,.53,.16),(-1.83,.67,1.73),navy)
for x in [-2.62,-1.04]: cushion('Sofa / arm',(.13,.40,.78),(x,.49,2.06),woodlight)
cushion('Sofa / throw pillow',(.40,.40,.17),(-2.31,.68,1.92),linen,.13)
block(-1.83,2.03,1.84,.89)
box('Media / cabinet',(1.87,.49,.44),(-1.36,.27,3.44),wood,.02)
for i in range(3): box('Media / drawer',(.59,.35,.025),(-1.98+i*.62,.28,3.207),woodlight,.007)
box('TV / frame',(1.49,.87,.055),(-1.36,1.20,3.47),black,.018)
box('screen-television',(1.43,.81,.004),(-1.36,1.20,3.439),screen,.001)
block(-1.36,3.44,1.9,.47)
# Wardrobe and storage basket keep the rear usable.
box('Wardrobe / carcass',(1.58,2.42,.58),(1.92,1.21,3.42),wood,.014)
for i in range(3):
    box('Wardrobe / paneled door',(.502,2.28,.036),(1.40+i*.52,1.21,3.10),woodlight,.01)
    tube('Wardrobe / handle',[(1.58+i*.52,1.02,3.07),(1.58+i*.52,1.24,3.07)],.008,brass)
block(1.92,3.42,1.6,.61)

def plant(x,z,h=1.0,y=0):
    lathe('Basket / wicker pot',[(0,0),(.19,0),(.25,.32),(.24,.34),(.21,.33),(.16,.04),(0,.04)],(x,y,z),woodlight)
    for j in range(13):
        r=.195+j*.004
        tube('Basket / woven coil',[(x+r*math.cos(a*math.tau/40),y+.02+j*.024,z+r*math.sin(a*math.tau/40)) for a in range(41)],.005,wood)
    for i in range(18):
        a=i*2.399; top=y+.40+h*(.35+.65*(i/18)); dx=math.cos(a)*(.22+.13*(i%3)); dz=math.sin(a)*.32
        tube('Plant / stems',[(x,y+.3,z),(x+dx*.3,top-.22,z+dz*.4),(x+dx,top,z+dz)],.005,leafmat)
        o=ellipsoid('Plant / waxy leaves',(.085,.016,.20),(x+dx,top,z+dz),leafmat); o.rotation_euler=(.25,a,.3)
plant(2.46,.79,1.02); plant(-2.54,2.94,.78)
plant(-2.22,-2.72,.38,.88)
# Ceiling fan, modeled blades and motor.
cyl('Fan / stem',.023,.25,(.3,2.86,.1),black)
lathe('Fan / motor',[(0,0),(.12,0),(.15,.055),(.11,.12),(0,.12)],(.3,2.61,.1),black)
for i in range(4):
    a=i*math.pi/2+.23
    blade=box('Fan / timber blade',(.22,.025,.82),(.3+.48*math.sin(a),2.65,.1+.48*math.cos(a)),woodlight,.012,rot=-a)
# Bathroom annex, reached through a 1.2m doorway on the right.
for x,z,w,d in [(4,0,2,.16),(5,1.6,.16,3.2),(4,3.2,2,.16)]:
    box('Bathroom / plaster',(w,3,d),(x,1.5,z),wallmat,.008); block(x,z,w,d)
box('Bathroom / ceiling',(2,.10,3.2),(4,3.05,1.6),wallmat,.004)
for x in [3.25,3.75,4.25,4.75]:
    for z in [.26,.78,1.30,1.82,2.34,2.86]: box('Bathroom / floor stone',(.493,.025,.51),(x,.00,z),stone,.002)
for z in [.03,2.62]: box('Door / trim',(.12,2.40,.055),(3,1.20,z),woodlight,.008)
box('Door / lintel',(.16,.57,2.64),(3,2.715,1.3),wood,.008)
box('Bathroom / vanity',(.60,.57,.88),(4.59,.45,2.55),wood,.018)
lathe('Bathroom / hollow sink',[(0,0),(.18,0),(.26,.06),(.27,.14),(.25,.14),(.22,.05),(0,.025)],(4.57,.75,2.55),white,1.25)
tube('Bathroom / tap',[(4.82,.76,2.55),(4.82,1.05,2.55),(4.63,1.05,2.55)],.012,brass)
box('Bathroom / mirror',(.025,1.03,.78),(4.88,1.50,2.55),mirror,.01)
block(4.59,2.55,.65,.95)
box('Bathroom / shower tray',(1.1,.065,1.1),(4.34,.04,.66),stone,.014)
tube('Bathroom / shower riser',[(4.88,1.03,.66),(4.88,2.24,.66),(4.48,2.24,.66)],.015,brass)
cyl('Bathroom / shower head',.15,.025,(4.48,2.23,.66),black)
box('Bathroom / shower glass',(1.10,2.18,.012),(4.34,1.14,1.22),glass,.004)
block(4.34,.66,1.15,1.16)
lathe('Bathroom / toilet',[(0,0),(.15,0),(.17,.2),(.25,.4),(.26,.43),(.18,.45),(0,.35)],(3.48,.02,2.72),white,1.30)
box('Bathroom / cistern',(.41,.55,.19),(3.48,.48,3.00),white,.06)
block(3.48,2.75,.56,.75)

print('PHASE: exterior',flush=True)
# Exterior is real 3D geometry: city below, a winding river, distant layered ridges.
citymats=[mat('City / slate facade','344758',.92),mat('City / dusk facade','4B5666',.95),mat('City / pale facade','66717D',.91)]
citylight=emission('City / illuminated windows','FFC589',2.0)
coollight=emission('City / cool windows','9FBED7',1.1)
roadmat=mat('City / asphalt','273846',.95)
river=mat('River / dusk reflection','B08887',.28,.4)
box('City / ground',(260,.5,180),(0,-15.4,-88),roadmat,0)
verts=[]
for i in range(55):
    z=-13-i*2.7; x=8+13*math.sin(i*.075)
    verts.extend([(x-2.9,-15.10,z),(x+2.9,-15.10,z)])
gridmesh('City / winding river',verts,[(i*2,i*2+1,i*2+3,i*2+2) for i in range(54)],river)
for i in range(140):
    x=random.uniform(-85,85); z=random.uniform(-132,-15)
    riverx=8+13*math.sin(((-z-13)/2.7)*.075)
    if abs(x-riverx)<5: continue
    w=random.uniform(1.4,4.7); d=random.uniform(1.9,4.5); h=random.uniform(2,12)
    # Keep foreground roofs below the window horizon.
    if z>-35: h=min(h,9)
    box('City / apartment block',(w,h,d),(x,-15+h/2,z),citymats[i%3],.03)
    box('City / roof utility',(w*.35,.34,d*.3),(x,-15+h+.17,z),citymats[(i+1)%3],.02)
    for row in range(max(1,int(h/.85))):
        for col in range(max(1,int(w/.7))):
            if random.random()<.43: continue
            box('City / window',(.23,.30,.02),(x-w*.38+col*.70,-14.6+row*.85,z+d/2+.018),citylight if random.random()<.72 else coollight,0)
for lane in [-1,1]:
    for i in range(66):
        z=-15-i*2.1; x=8+13*math.sin(((-z-13)/2.7)*.075)+lane*3.45
        box('City / riverside lights',(.07,.06,.12),(x,-14.8,z),citylight,0)
for layer in range(3):
    m=emission('Horizon / ridge '+str(layer),['667084','515F78','3D526A'][layer],.65)
    verts=[]
    for i in range(81):
        x=-170+i*4.25; h=2.0+3.8*math.sin(i*.078+layer*.7)**2+1.2*math.sin(i*.24+layer)
        verts.extend([(x,-16,-158+layer*12),(x,h-layer*1.3,-158+layer*12)])
    gridmesh('Horizon / layered mountains',verts,[(i*2,i*2+2,i*2+3,i*2+1) for i in range(80)],m)
print('PHASE: sky',flush=True)
# Procedural sunset cloud panorama. Only the sky is a backdrop; city has parallax.
w,h=2048,1024; yy,xx=np.mgrid[0:h,0:w]; u=xx/w; v=yy/h
stops=[(0,'DC8577'),(.28,'F1A074'),(.40,'FFD395'),(.48,'E8B198'),(.65,'7895B4'),(1,'2C506E')]
img=np.ones((h,w,4),np.float32)
for c in range(3): img[:,:,c]=np.interp(v,[s[0] for s in stops],[rgb(s[1])[c] for s in stops])
def noise2(freqx,freqy,seed):
    rng=np.random.default_rng(seed); ar=rng.random((freqy+2,freqx+2)); X=u*freqx; Y=v*freqy; ix=X.astype(int); iy=Y.astype(int); fx=X-ix; fy=Y-iy; fx=fx*fx*(3-2*fx); fy=fy*fy*(3-2*fy)
    return (ar[iy,ix]*(1-fx)+ar[iy,ix+1]*fx)*(1-fy)+(ar[iy+1,ix]*(1-fx)+ar[iy+1,ix+1]*fx)*fy
cloud=noise2(12,18,12)*.53+noise2(28,45,25)*.27+noise2(70,100,8)*.13+noise2(150,210,5)*.07
mask=np.clip((cloud-.51)*7,0,.87)*np.clip((v-.41)*6,0,1)*np.clip((.92-v)*7,0,1)
cloudcolor=np.zeros((h,w,3),np.float32)
for c in range(3): cloudcolor[:,:,c]=np.interp(v,[.4,.6,.9],[rgb('E5A281')[c],rgb('576175')[c],rgb('304B65')[c]])
img[:,:,:3]=img[:,:,:3]*(1-mask[:,:,None])+cloudcolor*mask[:,:,None]
sunDist=np.sqrt(((u-.465)*2.5)**2+((v-.485)*1)**2)
halo=np.exp(-sunDist*35)*.50
img[:,:,:3]+=halo[:,:,None]*np.array(rgb('FFBA61'))
img[sunDist<.006,:3]=np.array(rgb('FFF3BC'))*2.0
skyimg=bpy.data.images.new('Sunset / cloud panorama',w,h); skyimg.colorspace_settings.name='Linear Rec.709'; skyimg.pixels.foreach_set(img.ravel()); skyimg.filepath_raw=str(OUT/'sunset-sky.png'); skyimg.file_format='PNG'; skyimg.save(); skyimg.pack()
sky=emission('Sky / sunset panorama','FFFFFF',1)
nod=sky.node_tree.nodes.new('ShaderNodeTexImage'); nod.image=skyimg; sky.node_tree.links.new(nod.outputs['Color'],sky.node_tree.nodes.get('Emission').inputs[0])
gridmesh('Sky / luminous clouds',[(-230,-58,-190),(230,-58,-190),(230,82,-190),(-230,82,-190)],[(0,1,2,3)],sky,[(0,0),(1,0),(1,1),(0,1)])

# Consistent world-space wood/stone UVs; preserve authored plaid and curtain UVs.
for o in bpy.context.scene.objects:
    if o.type!='MESH' or o.name.startswith(('screen-','Curtain','Bed / flowing','Sky /')): continue
    m=o.data.materials[0]
    if not m.use_nodes or not any(n.type=='TEX_IMAGE' for n in m.node_tree.nodes): continue
    uv=o.data.uv_layers.active or o.data.uv_layers.new(name='Metre UV')
    for f in o.data.polygons:
        axis=max(range(3),key=lambda i:abs(f.normal[i]))
        for li in f.loop_indices:
            p=o.matrix_world @ o.data.vertices[o.data.loops[li].vertex_index].co
            a,b=((p.x,p.y) if axis==2 else (p.x,p.z) if axis==1 else (p.y,p.z))
            uv.data[li].uv=(a*1.7,b*1.7)

scene=bpy.context.scene; scene.world.use_nodes=True
scene.world.node_tree.nodes['Background'].inputs[0].default_value=(*rgb('819DC2'),1)
scene.world.node_tree.nodes['Background'].inputs[1].default_value=.32

def area(name,p,target,power,size,color):
    data=bpy.data.lights.new(name,'AREA'); data.energy=power; data.shape='DISK'; data.size=size; data.color=rgb(color)
    o=bpy.data.objects.new(name,data); bpy.context.collection.objects.link(o); o.location=pos(p); o.rotation_euler=(Vector(pos(target))-o.location).to_track_quat('-Z','Y').to_euler()
area('Window / cool skylight',(0,2.1,-2.85),(0,.7,.5),210,4.3,'ABC7F2')
area('Sunset / amber window',(-1.8,2.2,-3.4),(.8,.15,.9),390,.5,'FFBB70')
area('Lamp / bedside pool',(.10,1.23,-2.35),(.25,.68,-2),23,.19,'FFD18D')
area('Interior / soft bounce',(-1.8,2.55,1.8),(0,1,0),65,3,'B5C4DB')
area('Bathroom / warm ceiling',(4,2.8,1.7),(4,0,1.7),50,1.3,'FFE0AD')
bpy.ops.object.camera_add(location=pos((-.45,1.62,2.65)))
camera=bpy.context.object; camera.name='Camera / sunset room'; camera.rotation_euler=(Vector(pos((.10,1.30,-2.0)))-camera.location).to_track_quat('-Z','Y').to_euler(); camera.data.lens=23; scene.camera=camera
scene.render.engine='CYCLES'; scene.cycles.samples=32; scene.cycles.use_denoising=True
scene.render.resolution_x=1440; scene.render.resolution_y=1080; scene.render.resolution_percentage=100
scene.view_settings.view_transform='AgX'
bpy.ops.wm.save_as_mainfile(filepath=str(ART/'timi-sunset.blend'))
# Export by material, retaining screens and exterior separation for runtime shadows.
bpy.ops.object.select_all(action='DESELECT')
for o in list(scene.objects):
    if o.type=='CURVE':
        o.select_set(True); bpy.context.view_layer.objects.active=o; bpy.ops.object.convert(target='MESH'); o.select_set(False)
groups={}
for o in list(scene.objects):
    if o.type=='MESH' and not o.name.startswith('screen-'):
        exterior=o.name.startswith(('City /','Horizon /','Sky /'))
        groups.setdefault(('Exterior / ' if exterior else '')+o.data.materials[0].name,[]).append(o)
for name,objects in groups.items():
    bpy.ops.object.select_all(action='DESELECT')
    for o in objects: o.select_set(True)
    bpy.context.view_layer.objects.active=objects[0]; bpy.ops.object.join(); objects[0].name=name
bpy.ops.object.select_all(action='DESELECT')
for o in scene.objects:
    if o.type=='MESH': o.select_set(True)
bpy.ops.export_scene.gltf(filepath=str(OUT/'sunset-room.glb'),export_format='GLB',use_selection=True,export_apply=True,export_yup=True,export_cameras=False,export_lights=False)
(OUT/'sunset-colliders.json').write_text(json.dumps(COLLIDERS,indent=2))
stats={'meshes':sum(o.type=='MESH' for o in scene.objects),'triangles':sum(sum(len(p.vertices)-2 for p in o.data.polygons) for o in scene.objects if o.type=='MESH'),'bytes':(OUT/'sunset-room.glb').stat().st_size,'colliders':len(COLLIDERS)}
(ART/'model-report.json').write_text(json.dumps(stats,indent=2)); print('MODEL_REPORT',json.dumps(stats),flush=True)
scene.render.filepath=str(ART/'sunset-room.png'); bpy.ops.render.render(write_still=True)
camera.location=pos((-.65,1.62,.8)); camera.rotation_euler=(Vector(pos((.30,1.17,-2.0)))-camera.location).to_track_quat('-Z','Y').to_euler(); camera.data.lens=22
scene.render.filepath=str(ART/'window-detail.png'); bpy.ops.render.render(write_still=True)
