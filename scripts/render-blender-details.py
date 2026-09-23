"""Render the two enclosed rooms for geometry/layout verification."""
import bpy
from pathlib import Path
from mathutils import Vector

root = Path(__file__).resolve().parents[1]
out = root / 'artifacts/blender-remodel'
bpy.ops.wm.open_mainfile(filepath=str(out / 'timi-studio.blend'))
scene = bpy.context.scene
scene.render.resolution_x = 1000
scene.render.resolution_y = 800
scene.cycles.samples = 20
camera = scene.camera
camera.data.lens = 20
def p(v): return Vector((v[0], -v[2], v[1]))
for name, location, target in [
    ('bedroom', (2.15, 1.65, .23), (2.85, .85, -2.95)),
    ('bathroom', (5.65, 1.65, .22), (6.45, 1.10, -3.0)),
]:
    camera.location = p(location)
    camera.rotation_euler = (p(target) - camera.location).to_track_quat('-Z', 'Y').to_euler()
    scene.render.filepath = str(out / (name + '-preview.png'))
    bpy.ops.render.render(write_still=True)
