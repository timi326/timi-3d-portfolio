import bpy,json
from pathlib import Path
ROOT=Path.cwd(); OUT=ROOT/'artifacts/material-directions'; OUT.mkdir(exist_ok=True)
variants=[
 dict(id='01-cream-daylight',furniture=(.72,.74,.72),ceiling=(.68,.7,.72),wall=(.78,.77,.71),floor=(.37,.4,.42),fabric=(.38,.44,.49),metal=.12,sky=(.42,.61,.78),sun=(1,.9,.75),sunpower=150,fill=110,window=150),
 dict(id='02-blue-night',furniture=(.12,.15,.2),ceiling=(.08,.105,.15),wall=(.25,.3,.39),floor=(.13,.16,.21),fabric=(.12,.2,.33),metal=.25,sky=(.018,.045,.11),sun=(.23,.4,1),sunpower=28,fill=18,window=45),
 dict(id='03-silver-studio',furniture=(.43,.48,.53),ceiling=(.34,.38,.43),wall=(.65,.69,.74),floor=(.26,.3,.34),fabric=(.21,.25,.31),metal=.68,sky=(.3,.42,.55),sun=(.75,.86,1),sunpower=100,fill=80,window=120)
]
def flat(m,color,metal=0,rough=.65):
 m.use_nodes=True;n=m.node_tree.nodes;n.clear();p=n.new('ShaderNodeBsdfPrincipled');p.inputs['Base Color'].default_value=(*color,1);p.inputs['Metallic'].default_value=metal;p.inputs['Roughness'].default_value=rough;o=n.new('ShaderNodeOutputMaterial');m.node_tree.links.new(p.outputs['BSDF'],o.inputs['Surface'])
for v in variants:
 bpy.ops.wm.open_mainfile(filepath=str(ROOT/'artifacts/reference-swap/timi-reference-furniture.blend'))
 s=bpy.context.scene
 for m in bpy.data.materials:
  name=m.name
  if name.startswith('Cedar'): flat(m,v['ceiling'] if 'ceiling' in name else v['furniture'],v['metal'],.42 if v['metal']>.5 else .68)
  elif name.startswith('Plaster'): flat(m,v['wall'])
  elif name.startswith('Fabric'): flat(m,v['fabric'],0,.94)
  elif name.startswith('Metal / brushed'): flat(m,v['furniture'],.7,.38)
  elif name.startswith('Sky /'):
   m.use_nodes=True;n=m.node_tree.nodes;n.clear();e=n.new('ShaderNodeEmission');e.inputs['Color'].default_value=(*v['sky'],1);e.inputs['Strength'].default_value=.8;o=n.new('ShaderNodeOutputMaterial');m.node_tree.links.new(e.outputs[0],o.inputs['Surface'])
 # Give floor its own continuous concrete finish instead of timber material.
 floor=bpy.data.materials.new('Floor / matte mineral '+v['id']);flat(floor,v['floor'],0,.9)
 for o in s.objects:
  if o.type=='MESH' and any(k in o.name.lower() for k in ['floor','plank']):
   o.data.materials.clear();o.data.materials.append(floor)
  if o.type=='LIGHT':
   if 'Sunset' in o.name:o.data.color=v['sun'];o.data.energy=v['sunpower']
   elif 'cool skylight' in o.name:o.data.color=(.65,.78,1);o.data.energy=v['window']
   elif 'soft bounce' in o.name:o.data.color=(.78,.85,1);o.data.energy=v['fill']
   elif 'Lamp' in o.name:o.data.energy=48 if 'night' in v['id'] else 20
 s.render.engine='CYCLES';s.cycles.samples=20;s.cycles.use_denoising=True
 s.render.resolution_x=1200;s.render.resolution_y=900;s.render.resolution_percentage=100
 s.render.image_settings.file_format='PNG';s.render.filepath=str(OUT/(v['id']+'.png'))
 bpy.ops.wm.save_as_mainfile(filepath=str(OUT/(v['id']+'.blend')))
 bpy.ops.render.render(write_still=True)
(OUT/'presets.json').write_text(json.dumps(variants,indent=2))
