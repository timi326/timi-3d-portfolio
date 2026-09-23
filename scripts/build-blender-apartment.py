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
ART = ROOT / 'artifacts/blender-remodel'
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
    bpy.ops.mesh.primitive_cube_add(size=1,location=pos(p)); o=bpy.context.object
    o.scale=(size[0],size[2],size[1]); bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
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

# Floorboards have individual seams and subtly varied UV offsets.
for row in range(40):
    z=-4.875+row*.25
    start=-8-(row%3)*.8
    for j in range(8):
        a=max(-8,start+j*2.4); b=min(8,start+(j+1)*2.4)
        if b-a<.01: continue
        o=box('Floor / laid oak plank',(b-a-.003,.045,.247),((a+b)/2,-.025,z),oak,.0015)
        if o.data.uv_layers.active:
            for uv in o.data.uv_layers.active.data: uv.uv.x+=random.random()*.005
box('Architecture / ceiling',(16,.10,10),(0,2.87,0),plaster,.004)
for spec in [(0,-4.91,16,.18),(7.91,0,.18,10),(1.2,-2.92,.14,4),(1.2,.5,.14,.62),(1.42,.82,.45,.14),(3.78,.82,2.75,.14),(7.02,.82,1.95,.14),(4.43,-2.05,.14,5.72)]: wall(*spec)
for spec in [(-6.85,4.91,2.3,.18),(3,4.91,10,.18),(-7.91,-4.3625,.18,1.275),(-7.91,-.3,.18,2.15),(-7.91,4.3125,.18,1.375)]: wall(*spec)
for x,z,w,west in [(-7.91,-2.55,2.35,True),(-7.91,2.2,2.85,True),(-3.85,4.91,3.7,False)]:
    for y,h in [(.145,.29),(2.69,.26)]: box('Window / wall return',(.18,h,w) if west else (w,h,.18),(x,y,z),plaster,.004)
    # Slim bronze profiles, deep stone sill, and open glass view.
    for i in range(4):
        offset=-w/2+i*w/3
        box('Window / mullion',(.07,2.3,.036) if west else (.036,2.3,.07),(x,1.42,z+offset) if west else (x+offset,1.42,z),black,.006)
    for y in [.29,2.55]: box('Window / frame',(.08,.04,w+.08) if west else (w+.08,.04,.08),(x,y,z),black,.005)
    box('Window / stone sill',(.32,.05,w+.12) if west else (w+.12,.05,.32),(x+.03 if west else x,.29,z if west else z-.03),stone,.008)
    # Curtains are actual pleated surfaces, not rectangles.
    for side in [-1,1]:
        verts=[]; faces=[]; nx=32; ny=16
        for iy in range(ny+1):
            t=iy/ny; y=.07+t*2.55
            for ix in range(nx+1):
                u=ix/nx; offset=side*(w/2-.22)+(u-.5)*.48
                fold=.055*math.cos(u*math.pi*10)*(1-.18*t)
                verts.append(pos((x+.17+fold,y,z+offset) if west else (x+offset,y,z-.17-fold)))
        for iy in range(ny):
            for ix in range(nx):
                k=iy*(nx+1)+ix; faces.append((k,k+1,k+nx+2,k+nx+1))
        me=bpy.data.meshes.new('Pleated linen'); me.from_pydata(verts,[],faces); me.update()
        o=bpy.data.objects.new('Window / tailored linen curtain',me); bpy.context.collection.objects.link(o); finish(o,o.name,linen)
        for f in me.polygons: f.use_smooth=True
block(0,4.91,16,.18); block(-7.91,0,.18,10)

def plant(x,z,h=1.55):
    lathe('Planter / ceramic',[(0,0),(.21,0),(.25,.07),(.28,.40),(.26,.42),(.23,.40),(.21,.06),(0,.06)],(x,0,z),terracotta)
    cyl('Planter / soil',.23,.025,(x,.37,z),walnut)
    for i in range(9):
        a=i*2.399; top=.65+h*.55*(i/9); dx=math.cos(a)*(.25+.12*(i%2)); dz=math.sin(a)*.35
        tube('Plant / stem',[(x,.36,z),(x+dx*.3,top*.65,z+dz*.3),(x+dx,top,z+dz)],.008,green)
        leaf=ellipsoid('Plant / curved leaf',(.12,.025,.26),(x+dx,top,z+dz),green); leaf.rotation_euler=(.35,a,.4)

# Living: two-seat upholstered frame, stitched cushions and oval stone table.
box('Living / woven rug',(3.75,.018,3.0),(-3.45,.005,-2.26),linen,.008)
box('Sofa / walnut plinth',(2.85,.16,1.03),(-3.45,.20,-1.28),walnut,.045)
for x in [-4.65,-2.25]:
    for z in [-1.66,-.90]: cyl('Sofa / foot',.035,.18,(x,.09,z),black)
for i in [-1,1]:
    cushion('Sofa / seat',(1.27,.25,.85),(-3.45+i*.65,.45,-1.38),linen)
    cushion('Sofa / back',(1.29,.66,.25),(-3.45+i*.65,.80,-.86),linen)
    cushion('Sofa / arm',(.19,.53,1.05),(-3.45+i*1.43,.60,-1.28),linen)
    cushion('Sofa / scatter cushion',(.45,.44,.15),(-3.45+i*1.03,.80,-1.08),blue,i*.15)
    tube('Sofa / seat piping',[(x,.52,z) for x,z in [(-3.45+i*.65-.59,-1.80),(-3.45+i*.65+.59,-1.80),(-3.45+i*.65+.59,-1.0)]],.003,seam)
block(-3.45,-1.28,3.06,1.14)
table=box('Coffee table / rounded limestone',(1.60,.085,.85),(-3.45,.42,-2.80),stone,.04)
for x in [-3.95,-2.95]: cyl('Coffee table / turned oak base',.18,.37,(x,.185,-2.80),oak)
block(-3.45,-2.80,1.60,.85)
box('Coffee table / art book',(.35,.034,.26),(-3.73,.48,-2.79),blue,.004,rot=.12)
lathe('Coffee table / bowl',[(0,0),(.13,0),(.19,.05),(.20,.075),(.18,.072),(.12,.023),(0,.023)],(-3.15,.47,-2.80),white)
plant(-6.72,-3.8)

# TV wall, fluted cabinetry, flush door gaps.
for i in range(43): box('TV wall / oak slat',(.045,2.56,.045),(-5.03+i*.075,1.33,-4.77),oak,.006)
box('TV cabinet / shadow plinth',(2.56,.09,.45),(-3.45,.045,-4.35),black,.01)
box('TV cabinet / carcass',(2.76,.42,.54),(-3.45,.30,-4.35),walnut,.022)
for i in range(4): box('TV cabinet / drawer',(.678,.36,.024),(-4.48+i*.69,.31,-4.068),oak,.006)
box('TV cabinet / stone cap',(2.79,.035,.57),(-3.45,.528,-4.35),stone,.01)
box('TV / metal frame',(1.91,1.08,.057),(-3.45,1.38,-4.56),black,.018)
box('screen-television',(1.84,1.01,.006),(-3.45,1.38,-4.526),screen,.001)
block(-3.45,-4.35,2.79,.57)

# Dining: racetrack timber top with four sculpted upholstered chairs.
box('Dining / solid oak top',(2.45,.07,1.02),(-2.2,.76,2.55),oak,.033)
for x in [-2.99,-1.41]: box('Dining / trestle',(.12,.69,.65),(x,.345,2.55),walnut,.03)
block(-2.2,2.55,2.45,1.02)
for x in [-2.98,-1.42]:
    for z,sgn in [(1.74,-1),(3.36,1)]:
        cushion('Dining chair / upholstered seat',(.49,.10,.49),(x,.46,z),blue)
        cushion('Dining chair / curved back',(.51,.40,.10),(x,.72,z+sgn*.22),blue)
        for dx in [-.18,.18]:
            for dz in [-.17,.17]: tube('Dining chair / tapered leg',[(x+dx*1.15,.02,z+dz*1.15),(x+dx,.45,z+dz)],.021,walnut)
        block(x,z,.53,.56)
lathe('Dining / ceramic vase',[(0,0),(.11,0),(.14,.1),(.11,.25),(.045,.32),(.043,.35),(.033,.35),(.033,.30)],(-2.2,.80,2.55),white)
for i in range(3): tube('Dining / dried stems',[(-2.2,.95,2.55),(-2.3+i*.10,1.37,2.59)],.003,walnut)

# Workspace: one desktop, no duplicate computers. Monitor is interactive.
box('Studio / acoustic wall',(5.9,2.5,.04),(4.55,1.33,4.79),blue,.008)
box('Studio / rug',(3.8,.018,2.3),(4.6,.008,3.65),linen,.008)
box('Desk / rounded oak slab',(2.3,.065,.8),(4.55,.765,4.20),oak,.026)
for x in [3.51,5.59]:
    for z in [3.94,4.46]: cyl('Desk / steel leg',.026,.73,(x,.365,z),black)
box('Desk / modesty beam',(2.13,.06,.04),(4.55,.60,4.49),black,.006)
block(4.55,4.2,2.30,.80)
box('Desk / leather mat',(.98,.008,.43),(4.55,.803,4.04),blue,.004)
box('Monitor / weighted base',(.34,.025,.22),(4.55,.819,4.35),black,.012)
box('Monitor / riser',(.055,.24,.045),(4.55,.94,4.37),black,.008)
box('Monitor / aluminum shell',(1.04,.61,.043),(4.55,1.25,4.36),black,.016)
box('screen-computer',(1.00,.563,.005),(4.55,1.25,4.334),screen,.001)
box('Keyboard / aluminum tray',(.46,.018,.15),(4.49,.82,4.03),black,.008)
for row in range(5):
    for col in range(14): box('Keyboard / keycap',(.026,.012,.022),(4.285+col*.031,.835,3.973+row*.026),paper,.004)
ellipsoid('Desk / mouse',(.034,.018,.055),(4.91,.824,4.02),paper)
lathe('Desk / ceramic cup',[(0,0),(.035,0),(.044,.085),(.041,.09),(.035,.09),(.030,.013),(0,.013)],(5.29,.80,4.17),white)
lathe('Desk / task light shade',[(.15,0),(.15,.012),(.065,.10),(.025,.11)],(3.70,1.30,4.3),black)
tube('Desk / articulated lamp',[(3.75,.80,4.42),(3.75,1.10,4.42),(3.70,1.36,4.30)],.013,brass)
cyl('Desk / lamp foot',.10,.024,(3.75,.812,4.42),black)
cyl('Desk / light source',.10,.008,(3.70,1.302,4.3),glow)
cushion('Office chair / seat',(.56,.12,.53),(4.65,.47,3.25),blue)
cushion('Office chair / back',(.55,.56,.115),(4.65,.83,3.0),blue)
cyl('Office chair / gas lift',.027,.33,(4.65,.24,3.25),black)
for i in range(5):
    a=i*math.tau/5
    tube('Office chair / five star base',[(4.65,.17,3.25),(4.65+.32*math.cos(a),.10,3.25+.32*math.sin(a))],.018,black)
    ellipsoid('Office chair / caster',(.036,.045,.028),(4.65+.32*math.cos(a),.055,3.25+.32*math.sin(a)),black)
block(4.65,3.21,.68,.67)
for x in [1.93,2.83]: box('Bookcase / upright',(.04,2.20,.34),(x,1.10,4.58),walnut,.009)
for y in [.12,.59,1.06,1.53,2.18]: box('Bookcase / shelf',(.94,.032,.34),(2.38,y,4.58),oak,.008)
for level in range(4):
    for i in range(8-level):
        h=.20+random.random()*.14
        box('Bookcase / bound volume',(.045,h,.19),(2.04+i*.067,.14+level*.47+h/2,4.54),[paper,blue,walnut][i%3],.003)
block(2.38,4.58,.96,.36)
plant(6.85,4.05,1.35)

# Bedroom: floating base, mattress piping and folded bedding.
box('Bed / inset base',(1.48,.18,1.90),(2.75,.13,-2.55),walnut,.035)
box('Bed / timber surround',(1.72,.19,2.16),(2.75,.28,-2.55),oak,.045)
cushion('Bed / mattress',(1.62,.24,2.02),(2.75,.485,-2.55),linen)
cushion('Bed / channel headboard',(1.84,1.08,.15),(2.75,.65,-3.61),blue)
for x in [2.09,2.31,2.53,2.75,2.97,3.19,3.41]: tube('Bed / headboard stitching',[(x,.19,-3.523),(x,1.1,-3.523)],.002,black)
cushion('Bed / down duvet',(1.66,.16,1.52),(2.75,.64,-2.29),linen)
for x in [2.33,3.17]: cushion('Bed / pillow',(.72,.17,.43),(x,.675,-3.17),linen,.03)
cushion('Bed / folded throw',(1.68,.065,.51),(2.75,.74,-1.88),blue)
block(2.75,-2.55,1.84,2.25)
for x in [1.60,3.90]:
    box('Nightstand / body',(.43,.45,.42),(x,.235,-3.2),oak,.025)
    box('Nightstand / drawer reveal',(.37,.006,.015),(x,.29,-2.986),black,.001)
    cyl('Nightstand / lamp stem',.018,.21,(x,.60,-3.2),brass)
    lathe('Nightstand / linen shade',[(.14,0),(.15,.01),(.10,.19),(.09,.19)],(x,.66,-3.2),linen)
    block(x,-3.2,.43,.42)
box('Wardrobe / carcass',(1.65,2.38,.52),(3.40,1.19,.49),oak,.012)
for i in range(3):
    box('Wardrobe / door',(.537,2.28,.027),(2.85+i*.55,1.20,.214),linen,.009)
    tube('Wardrobe / bronze pull',[(3.04+i*.55,.97,.19),(3.04+i*.55,1.24,.19)],.006,brass)
block(3.40,.49,1.65,.54)

# Bathroom: large format limestone, hollow basin, real rim and shower fittings.
for ix in range(5):
    for iz in range(9): box('Bathroom / floor tile',(.635,.035,.593),(4.86+ix*.64,.014,-4.41+iz*.598),stone,.002)
for i in range(5):
    for j in range(4): box('Bathroom / wall tile',(.635,.645,.022),(4.86+i*.64,.34+j*.65,-4.797),stone,.002)
box('Shower / tray',(1.70,.075,1.76),(6.86,.07,-3.78),stone,.018)
box('Shower / glass side',(.012,2.11,1.76),(6.0,1.16,-3.78),glass,.003)
box('Shower / glass front',(1.70,2.11,.012),(6.86,1.16,-2.90),glass,.003)
for x in [6.0,7.71]: tube('Shower / bronze channel',[(x,.10,-2.90),(x,2.22,-2.90)],.012,brass)
tube('Shower / handle',[(6.94,.99,-2.872),(6.94,1.30,-2.872)],.012,brass)
tube('Shower / rain pipe',[(7.70,1.06,-3.8),(7.70,2.16,-3.8),(7.33,2.16,-3.8)],.018,brass)
cyl('Shower / rain head',.15,.022,(7.33,2.14,-3.8),black)
for i in range(12):
    a=i*math.tau/12; cyl('Shower / nozzle',.006,.006,(7.33+.10*math.cos(a),2.126,-3.8+.10*math.sin(a)),white)
box('Shower / linear drain',(.04,.004,.56),(7.52,.110,-3.78),black,.002)
block(6.86,-3.78,1.74,1.80)
box('Toilet / cistern',(.46,.60,.21),(5.25,.47,-4.46),white,.08)
lathe('Toilet / sculpted pedestal',[(0,0),(.16,0),(.19,.07),(.17,.24),(.24,.39),(.25,.43),(.18,.44),(0,.38)],(5.25,.02,-4.04),white,1.35)
lathe('Toilet / seat rim',[(.20,0),(.27,0),(.28,.022),(.27,.045),(.20,.045),(.19,.022),(.20,0)],(5.25,.465,-4.03),white,1.30)
box('Toilet / flush plate',(.13,.009,.055),(5.25,.777,-4.46),brass,.004)
block(5.25,-4.15,.61,.88)
box('Vanity / floating cabinet',(.62,.51,1.46),(7.37,.50,-1.25),oak,.02)
box('Vanity / countertop',(.73,.045,1.52),(7.32,.78,-1.25),stone,.015)
for z in [-1.62,-.88]: box('Vanity / inset front',(.024,.43,.70),(7.046,.51,z),walnut,.009)
lathe('Basin / hollow porcelain',[(0,0),(.21,0),(.28,.045),(.30,.14),(.292,.155),(.271,.14),(.245,.055),(.16,.025),(0,.025)],(7.29,.807,-1.25),white,1.25)
cyl('Basin / drain',.027,.008,(7.29,.837,-1.25),brass)
tube('Basin / swan neck tap',[(7.57,.82,-1.25),(7.57,1.12,-1.25),(7.54,1.16,-1.25),(7.40,1.16,-1.25),(7.37,1.12,-1.25)],.013,brass)
box('Vanity / mirror bronze frame',(.043,1.12,1.36),(7.76,1.65,-1.25),brass,.018)
box('Vanity / mirror',(.006,1.065,1.30),(7.732,1.65,-1.25),mirror,.002)
box('Vanity / light bar',(.055,.028,1.19),(7.69,2.24,-1.25),glow,.009)
block(7.32,-1.25,.74,1.54)
tube('Bathroom / towel rail',[(4.57,1.1,-.92),(4.66,1.1,-.92),(4.66,1.1,-.14),(4.57,1.1,-.14)],.012,brass)
box('Bathroom / folded towel',(.035,.47,.42),(4.69,.86,-.57),linen,.016)

# Trimmed door openings; preserve the two existing clear passages.
for a,b,z in [(1.645,2.405,.82),(5.155,6.045,.82)]:
    for x in [a,b]: box('Doorway / jamb',(.045,2.36,.20),(x,1.18,z),oak,.006)
    box('Doorway / lintel',(b-a+.08,.45,.17),((a+b)/2,2.59,z),plaster,.008)

# Recessed fixtures and a suspended dining luminaire.
for x,z in [(-3.45,-2),(-2.2,2.55),(4.55,3.1),(2.75,-2.15),(6.15,-2.15)]:
    cyl('Ceiling / bronze trim',.09,.015,(x,2.798,z),brass)
    cyl('Ceiling / diffuser',.07,.012,(x,2.786,z),glow)
for x in [-2.80,-1.60]:
    tube('Pendant / suspension',[(x,2.80,2.55),(x,2.05,2.55)],.003,black)
    lathe('Pendant / turned shade',[(.22,0),(.22,.018),(.15,.14),(.045,.20)],(x,1.91,2.55),oak)
    cyl('Pendant / diffuser',.18,.008,(x,1.91,2.55),glow)

# Metre-scale UV projection keeps fibres and wood grain consistent across parts.
for o in bpy.context.scene.objects:
    if o.type!='MESH' or o.name.startswith('screen-'): continue
    m=o.data.materials[0]
    if m not in [oak,walnut,linen,blue,stone,plaster]: continue
    uv=o.data.uv_layers.active or o.data.uv_layers.new(name='Material scale / metres')
    density=5 if m in [linen,blue] else 1.2
    for face in o.data.polygons:
        normal=o.matrix_world.to_3x3() @ face.normal
        axis=max(range(3),key=lambda i:abs(normal[i]))
        for li in face.loop_indices:
            v=o.matrix_world @ o.data.vertices[o.data.loops[li].vertex_index].co
            a,b=((v.y,v.x) if axis==2 else (v.x,v.z) if axis==1 else (v.y,v.z))
            uv.data[li].uv=(a*density,b*density)

# Save source before joining so every part remains editable in Blender.
scene=bpy.context.scene
scene.world.use_nodes=True
scene.world.node_tree.nodes['Background'].inputs[0].default_value=(.65,.76,.88,1)
scene.world.node_tree.nodes['Background'].inputs[1].default_value=.40
def area(name,p,target,power,size,color):
    data=bpy.data.lights.new(name,'AREA'); data.energy=power; data.shape='DISK'; data.size=size; data.color=rgb(color)
    o=bpy.data.objects.new(name,data); bpy.context.collection.objects.link(o); o.location=pos(p); o.rotation_euler=(Vector(pos(target))-o.location).to_track_quat('-Z','Y').to_euler()
for p,t in [((-7.6,1.7,-2.55),(-2,0,-2)),((-7.6,1.7,2.2),(-2,0,2)),((-3.85,1.8,4.65),(-3,0,0))]: area('Daylight / window',p,t,420,2.6,'E2EBFF')
for x,z in [(-3.45,-2),(-2.2,2.55),(4.55,3.1),(2.75,-2.15),(6.15,-2.15)]: area('Interior / ceiling fill',(x,2.73,z),(x,0,z),55,1.8,'FFE6C9')
area('Studio / wall wash',(4.5,2.4,2.2),(4.5,1,4.6),65,2,'FFF0D9')
bpy.ops.object.camera_add(location=pos((-.25,1.64,2.3)))
camera=bpy.context.object; camera.name='Camera / entrance'; camera.rotation_euler=(Vector(pos((4.0,1.18,4.15)))-camera.location).to_track_quat('-Z','Y').to_euler(); camera.data.lens=23
scene.camera=camera
scene.render.engine='CYCLES'; scene.cycles.samples=24; scene.cycles.use_denoising=True
scene.render.resolution_x=1200; scene.render.resolution_y=800; scene.render.resolution_percentage=100
scene.view_settings.view_transform='AgX'
bpy.ops.wm.save_as_mainfile(filepath=str(ART/'timi-studio.blend'))

# Flatten by material for the web, leaving interaction surfaces independent.
bpy.ops.object.select_all(action='DESELECT')
for o in list(scene.objects):
    if o.type=='CURVE':
        o.select_set(True); bpy.context.view_layer.objects.active=o; bpy.ops.object.convert(target='MESH'); o.select_set(False)
groups={}
for o in list(scene.objects):
    if o.type=='MESH' and not o.name.startswith('screen-'):
        groups.setdefault(o.data.materials[0].name,[]).append(o)
for name,objects in groups.items():
    bpy.ops.object.select_all(action='DESELECT')
    for o in objects: o.select_set(True)
    bpy.context.view_layer.objects.active=objects[0]; bpy.ops.object.join(); objects[0].name=name
bpy.ops.object.select_all(action='DESELECT')
for o in scene.objects:
    if o.type=='MESH': o.select_set(True)
bpy.ops.export_scene.gltf(filepath=str(OUT/'apartment.glb'),export_format='GLB',use_selection=True,export_apply=True,export_yup=True,export_cameras=False,export_lights=False)
(OUT/'colliders.json').write_text(json.dumps(COLLIDERS,indent=2))
stats={'meshCount':sum(o.type=='MESH' for o in scene.objects),'triangles':sum(sum(len(p.vertices)-2 for p in o.data.polygons) for o in scene.objects if o.type=='MESH'),'bytes':(OUT/'apartment.glb').stat().st_size,'colliders':len(COLLIDERS)}
(ART/'model-report.json').write_text(json.dumps(stats,indent=2))
print('MODEL_REPORT',json.dumps(stats),flush=True)
scene.render.filepath=str(ART/'studio-preview.png'); bpy.ops.render.render(write_still=True)
camera.location=pos((-.1,1.62,.1)); camera.rotation_euler=(Vector(pos((-3.65,1.0,-3)))-camera.location).to_track_quat('-Z','Y').to_euler()
scene.render.filepath=str(ART/'living-preview.png'); bpy.ops.render.render(write_still=True)
