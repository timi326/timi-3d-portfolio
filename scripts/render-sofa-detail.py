import bpy
from mathutils import Vector
from pathlib import Path
root=Path.cwd(); art=root/'artifacts/sunset-detail-v2'
bpy.ops.wm.open_mainfile(filepath=str(art/'timi-sunset-detail.blend'))
s=bpy.context.scene; c=s.camera
c.location=(.7,.9,1.9)
c.rotation_euler=(Vector((-1.4,-2.9,.9))-c.location).to_track_quat('-Z','Y').to_euler()
c.data.lens=25
s.render.resolution_x=1100; s.render.resolution_y=850;s.cycles.samples=16
s.render.filepath=str(art/'sofa-tv.png')
bpy.ops.render.render(write_still=True)
