"""Refine the saved editable sunset model, then regenerate the web asset and renders."""
import bpy, math, json, random, ast
import numpy as np
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[1]; OUT=ROOT/'public/models/timi-studio'; ART=ROOT/'artifacts/sunset-remodel'
source=(ROOT/'scripts/build-sunset-room.py').read_text(encoding='utf-8-sig')
bpy.ops.wm.open_mainfile(filepath=str(ART/'timi-sunset.blend'))
# Reuse pure geometry helpers without executing the scene reset / assembly.
module=ast.parse(source)
for node in module.body:
    if isinstance(node,ast.FunctionDef) and node.name in ['pos','linear','rgb','mat','finish','box','emission','gridmesh']:
        exec(ast.get_source_segment(source,node),globals())
random.seed(42)
scene=bpy.context.scene; camera=scene.camera
camera.location=pos((-.45,1.62,2.65)); camera.rotation_euler=(Vector(pos((.05,1.28,-2)))-camera.location).to_track_quat('-Z','Y').to_euler()
scene.world.node_tree.nodes['Background'].inputs[1].default_value=.16
for o in scene.objects:
    if o.type!='LIGHT': continue
    if o.name.startswith('Window / cool'): o.data.energy=95
    if o.name.startswith('Sunset /'): o.data.energy=180; o.data.color=rgb('FFAB56')
    if o.name.startswith('Lamp /'): o.data.energy=38
    if o.name.startswith('Interior /'): o.data.energy=25
# Darker timber ceiling, and less exaggerated small folds in the cotton duvet.
ceilingmat=mat('Cedar / smoked ceiling','352B25',.8)
for o in scene.objects:
    if o.name.startswith(('Architecture / dark timber ceiling','Ceiling / exposed beam')): o.data.materials[0]=ceilingmat
    if o.name.startswith('Bed / flowing'):
        # The mesh was generated in world coordinates; reverse top face winding.
        if o.data.polygons[0].normal.z < 0: o.data.flip_normals()
# Lower distant ridges to reveal more of the city, keeping a readable mountain silhouette.
for o in scene.objects:
    if o.name.startswith('Horizon /'): o.location.z=-5.0
# Rebuild the sky with a clear sun away from the window mullions.
for o in list(scene.objects):
    if o.name.startswith('Sky /'): bpy.data.objects.remove(o,do_unlink=True)
start=source.index('# Procedural sunset cloud'); end=source.index('# Consistent world-space')
skycode=source[start:end].replace('u-.465','u-.405').replace("'FFD395'","'FFBE72'").replace("'E8B198'","'F2A374'").replace("'7895B4'","'769EBE'")
exec(skycode,globals())
# Hundreds of distant buildings use four authored window atlases and only a few draw calls.
for o in list(scene.objects):
    if o.name.startswith('City / distant neighborhood'): bpy.data.objects.remove(o,do_unlink=True)
citymats=[]
for k in range(4):
    n=128; h=256; pixels=np.ones((h,n,4),np.float32); glow=np.ones((h,n,4),np.float32)
    pixels[:,:,:3]=rgb(['35485C','3E5061','475768','364956'][k]); glow[:,:,:3]=0
    rng=np.random.default_rng(k+5)
    for row in range(14):
        for col in range(7):
            y=9+row*17; x=8+col*17
            lit=rng.random()>.48; colr=rgb('E7BD83' if rng.random()>.25 else 'A5C9E1') if lit else rgb('273747')
            pixels[y:y+7,x:x+6,:3]=colr
            if lit: glow[y:y+7,x:x+6,:3]=colr
    texs=[]
    for label,px in [('facade',pixels),('lights',glow)]:
        im=bpy.data.images.new(f'Distant city {k} / {label}',n,h); im.colorspace_settings.name='Linear Rec.709'; im.pixels.foreach_set(px.ravel()); im.pack(); texs.append(im)
    m=mat('City atlas / '+str(k),'FFFFFF',.9,texture=texs[0]); p=m.node_tree.nodes.get('Principled BSDF'); p.inputs['Emission Strength'].default_value=1.3
    nn=m.node_tree.nodes.new('ShaderNodeTexImage'); nn.image=texs[1]; m.node_tree.links.new(nn.outputs['Color'],p.inputs['Emission Color']); citymats.append(m)
for row in range(19):
    for col in range(29):
        x=-76+col*5.4+random.uniform(-1,1); z=-42-row*5.7+random.uniform(-1,1)
        riverx=8+13*math.sin(((-z-13)/2.7)*.075)
        if abs(x-riverx)<4: continue
        w=random.uniform(1.3,3.1); d=random.uniform(1.3,2.9); h=random.uniform(1.7,5.7)
        o=box('City / distant neighborhood',(w,h,d),(x,-10.8+h/2,z),citymats[(row+col)%4],0)
        layer=o.data.uv_layers.new()
        for face in o.data.polygons:
            for i,li in enumerate(face.loop_indices): layer.data[li].uv=[(0,0),(1,0),(1,1),(0,1)][i]
# The offline screen receives a calm luminous desktop; its web content is drawn by the app.
p=bpy.data.materials['Screen / replace at runtime'].node_tree.nodes.get('Principled BSDF')
p.inputs['Base Color'].default_value=(*rgb('9CABB3'),1); p.inputs['Emission Color'].default_value=(*rgb('AABCC7'),1); p.inputs['Emission Strength'].default_value=.40
# Keep the source and final image generation reproducible.
bpy.ops.wm.save_as_mainfile(filepath=str(ART/'timi-sunset.blend'))
COLLIDERS=json.loads((OUT/'sunset-colliders.json').read_text())
# Reuse the original material consolidation, export and render steps.
exportcode=source[source.index('# Export by material'):]
exportcode=exportcode.replace("o.name.startswith(('City /','Horizon /','Sky /'))","o.name.startswith(('City /','Horizon /','Sky /'))")
exec(exportcode,globals())
