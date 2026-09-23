"""Refresh the packed Blender sky without rebuilding the modeled neighborhood."""
import bpy,math
from pathlib import Path
from mathutils import Vector
R=Path.cwd();A=R/'artifacts/exterior-v3';O=R/'public/models/timi-studio'
bpy.ops.wm.open_mainfile(filepath=str(A/'timi-exterior.blend'));s=bpy.context.scene
for image in bpy.data.images:
 if image.name.startswith('blender-sky-360'):
  image.filepath=str(O/'blender-sky-360.png');image.reload();image.pack()
count=108;batches={}
source=(R/'scripts/build-exterior-v3.py').read_text(encoding='utf-8')
exec(source[source.index('bpy.ops.wm.save_as_mainfile'):])
