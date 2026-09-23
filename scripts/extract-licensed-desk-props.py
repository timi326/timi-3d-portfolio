"""Extract only separately CC-BY licensed props, not the reference room geometry.
Vocaloid Figures: A-Z inc., 0b41d83c7cd04d32aa436236414fbe20.
Headphones: Ren, ef7799bcdba043238c4deef9d2832730.
Both original Sketchfab listings verified CC-BY-4.0 on 2026-09-12.
The reference author's README identifies these original sources.
"""
import bpy
from pathlib import Path
R=Path.cwd()
bpy.ops.wm.open_mainfile(filepath=str(R/'artifacts/reference-desk-inspection.blend'))
for kind in ['vocaloid','headphones']:
 bpy.ops.object.select_all(action='DESELECT')
 for o in bpy.context.scene.objects:
  if o.type!='MESH':continue
  chosen=(('Figure.obj' in o.name or o.name.startswith('Gumi.obj') or o.name in ['Circle__0','Circle2__0','Circle3__0','Circle4__0','Circle5__0','Circle6__0']) and not o.name.endswith('.001')) if kind=='vocaloid' else o.name in ['Body1_Carbon Fiber - Twill_0','Object_2.001']
  if chosen:o.select_set(True)
 bpy.ops.export_scene.gltf(filepath=str(R/f'artifacts/figurines/sources/{kind}.glb'),export_format='GLB',use_selection=True,export_apply=True,export_animations=False)
