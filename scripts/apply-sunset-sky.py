import bpy, json
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]; OUT=ROOT/'public/models/timi-studio'; ART=ROOT/'artifacts/sunset-remodel'
bpy.ops.wm.open_mainfile(filepath=str(ART/'timi-sunset.blend'))
scene=bpy.context.scene; camera=scene.camera
sky=bpy.data.images.load(str(OUT/'sunset-clouds-v1.png'),check_existing=True); sky.pack()
for material in bpy.data.materials:
    if not material.name.startswith('Sky /'): continue
    for node in material.node_tree.nodes:
        if node.type=='TEX_IMAGE': node.image=sky
# Match the 2:1 image aspect ratio so the sun remains circular.
for obj in scene.objects:
    if obj.name.startswith('Sky /') and obj.type=='MESH':
        zs=[v.co.z for v in obj.data.vertices]; low=min(zs); span=max(zs)-low
        for vertex in obj.data.vertices: vertex.co.z=(vertex.co.z-low)/span*230-99.5
bpy.ops.wm.save_as_mainfile(filepath=str(ART/'timi-sunset.blend'))
# Export without rendering twice; final render uses the shared model and lights.
source=(ROOT/'scripts/build-sunset-room.py').read_text(encoding='utf-8-sig')
COLLIDERS=json.loads((OUT/'sunset-colliders.json').read_text())
code=source[source.index('# Export by material'):source.index("scene.render.filepath=str(ART/'sunset-room.png')")]
exec(code,globals())
scene.render.filepath=str(ART/'sunset-room.png'); bpy.ops.render.render(write_still=True)
