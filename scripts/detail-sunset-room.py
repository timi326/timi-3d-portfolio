"""Detail pass; always starts from the preserved v1 source, so reruns are safe."""
import bpy, math, json, ast
import numpy as np
from pathlib import Path
from mathutils import Vector, Matrix
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'public/models/timi-studio'
ART=ROOT/'artifacts/sunset-detail-v2'
bpy.ops.wm.open_mainfile(filepath=str(ART/'before.blend'))
source=(ROOT/'scripts/build-sunset-room.py').read_text(encoding='utf-8-sig')
for node in ast.parse(source).body:
    if isinstance(node,ast.FunctionDef) and node.name in ['pos','finish','box','gridmesh','tube']:
        exec(ast.get_source_segment(source,node),globals())
scene=bpy.context.scene
# Expand the shell and its fitted joinery. Keep the bed at its original human scale.
S=1.12
for o in scene.objects:
    if o.name.startswith(('City /','Horizon /','Sky /','Bed /')): continue
    o.matrix_world=Matrix.Diagonal((S,S,1,1)) @ o.matrix_world
# Pull the sofa forward, leaving a proper viewing aisle in front of the TV.
for o in scene.objects:
    if o.name.startswith('Sofa /'): o.location.y+=.85
# Export real surface-normal maps: colour patterns are not surface height.
# Fine cotton fibres and open wood grain survive the GLB export into WebGL.
rng=np.random.default_rng(41)
n=512
yy,xx=np.mgrid[0:n,0:n]/n
for m in list(bpy.data.materials):
    wood=m.name.startswith(('Cedar /','Oak /','Walnut /'))
    cloth=m.name.startswith(('Linen /','Fabric /','Quilt /','Upholstery /'))
    plaster=m.name.startswith('Plaster /')
    if not (wood or cloth or plaster) or not m.use_nodes: continue
    p=m.node_tree.nodes.get('Principled BSDF')
    if not p: continue
    p.inputs['Roughness'].default_value=.84 if wood else .98 if cloth else .93
    p.inputs['Specular IOR Level'].default_value=.22 if wood else .12
    if cloth: p.inputs['Sheen Weight'].default_value=.16
    if wood:
        h=.45*np.sin(xx*math.tau*62+1.8*np.sin(yy*math.tau*2))+.15*np.sin(xx*math.tau*113+yy*9)+rng.normal(0,.12,(n,n))
        strength=.20
    elif cloth:
        h=np.sin(xx*math.tau*128)*np.sin(yy*math.tau*128)+rng.normal(0,.12,(n,n))
        strength=.16
    else:
        h=rng.normal(0,.2,(n,n)); strength=.12
    dy,dx=np.gradient(h)
    normal=np.stack((-dx*strength,-dy*strength,np.ones_like(h)),axis=-1)
    normal/=np.linalg.norm(normal,axis=-1,keepdims=True)
    pixels=np.ones((n,n,4),np.float32); pixels[:,:,:3]=normal*.5+.5
    im=bpy.data.images.new(m.name+' / surface normal',n,n)
    im.colorspace_settings.name='Non-Color'; im.pixels.foreach_set(pixels.ravel()); im.pack()
    tex=m.node_tree.nodes.new('ShaderNodeTexImage'); tex.image=im
    norm=m.node_tree.nodes.new('ShaderNodeNormalMap')
    m.node_tree.links.new(tex.outputs['Color'],norm.inputs['Color'])
    m.node_tree.links.new(norm.outputs['Normal'],p.inputs['Normal'])
bed_shift=Vector((.30,.26,0))
for o in list(scene.objects):
    if not o.name.startswith('Bed /'): continue
    if o.name.startswith('Bed / flowing'):
        bpy.data.objects.remove(o,do_unlink=True)
    else: o.location+=bed_shift
# Rounded shoulder lies OUTSIDE the mattress and frame; the hem never goes below floor.
# The duvet stops 14 cm before the footboard rather than cutting through its rail.
vertices=[]; uv=[]; faces=[]; nx=100; nz=100
for j in range(nz+1):
    v=j/nz; z=-1.96+1.84*v-.26
    for i in range(nx+1):
        u=i/nx; t=(u-.5)*2; a=abs(t)
        if a<=.76:
            q=t/.76*.755
            y=.646+.007*math.sin(u*19+v*13)+.006*math.sin(v*31-u*8)
        else:
            theta=(a-.76)/.24*math.pi/2
            q=math.copysign(.755+.135*math.sin(theta),t)
            y=.646-.40*(1-math.cos(theta))+.005*math.sin(v*38)*math.sin(theta)
        y+=.035*math.exp(-((v-.045)/.07)**2)
        vertices.append((2.02+q,y,z)); uv.append((u,v*.88))
for j in range(nz):
    for i in range(nx):
        k=j*(nx+1)+i; faces.append((k,k+nx+1,k+nx+2,k+1))
quilt=gridmesh('Bed / flowing tailored indigo quilt',vertices,faces,bpy.data.materials['Quilt / indigo check'],uv)
solid=quilt.modifiers.new('Cotton bound edge','SOLIDIFY'); solid.thickness=.008; solid.offset=0
bpy.context.view_layer.objects.active=quilt
bpy.ops.object.modifier_apply(modifier=solid.name)
seam=bpy.data.materials['Linen / woven ivory']
for col in [0,nx]:
    tube('Bed / stitched side binding',[vertices[j*(nx+1)+col] for j in range(nz+1)],.004,seam)
tube('Bed / folded foot binding',vertices[nz*(nx+1):(nz+1)*(nx+1)],.005,seam)
# A lower foot rail leaves a visible, unobstructed gap beneath the blanket.
for o in scene.objects:
    if o.name.startswith('Bed / foot rail'): o.location.z=.44
# Resize collision map with the shell, then replace the bed envelope including cloth.
COLLIDERS=json.loads((ART/'before-colliders.json').read_text())
for c in COLLIDERS:
    if abs(c['minX']-.905)<.01 and abs(c['minZ']+2.5)<.01:
        c.update(minX=1.10,maxX=2.94,minZ=-2.80,maxZ=-.19)
    else:
        for k in c: c[k]*=S
        if abs(c['minX']+3.08)<.01 and abs(c['minZ']-1.7752)<.01:
            c['minZ']-=.85; c['maxZ']-=.85
camera=scene.camera
camera.location=pos((-.55,1.65,3.08))
camera.rotation_euler=(Vector(pos((.10,1.30,-2.35)))-camera.location).to_track_quat('-Z','Y').to_euler()
camera.data.lens=25
scene.render.resolution_x=1440; scene.render.resolution_y=1080
scene.cycles.samples=32
bpy.ops.wm.save_as_mainfile(filepath=str(ART/'timi-sunset-detail.blend'))
code=source[source.index('# Export by material'):source.index("scene.render.filepath=str(ART/'sunset-room.png')")]
exec(code,globals())
scene.render.filepath=str(ART/'room.png'); bpy.ops.render.render(write_still=True)
camera.location=pos((.2,1.48,.85))
camera.rotation_euler=(Vector(pos((2.02,.55,-1.3)))-camera.location).to_track_quat('-Z','Y').to_euler()
camera.data.lens=34
scene.render.resolution_x=1000; scene.render.resolution_y=900
scene.render.filepath=str(ART/'bed-detail.png'); bpy.ops.render.render(write_still=True)
