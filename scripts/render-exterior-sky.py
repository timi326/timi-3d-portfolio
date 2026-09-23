"""Render a seamless full-sphere sky in Blender Cycles, not a rectangular backdrop."""
import bpy,math
from pathlib import Path
R=Path.cwd();A=R/'artifacts/exterior-v3';A.mkdir(exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True);s=bpy.context.scene
world=bpy.data.worlds.new('Physical sunset atmosphere');s.world=world;world.use_nodes=True
n=world.node_tree.nodes;n.clear();out=n.new('ShaderNodeOutputWorld');bg=n.new('ShaderNodeBackground');sky=n.new('ShaderNodeTexSky');sky.sky_type='MULTIPLE_SCATTERING';sky.sun_elevation=math.radians(7);sky.sun_rotation=math.radians(-20);sky.altitude=.15;sky.air_density=1.8;sky.aerosol_density=4;sky.ozone_density=1.1;sky.sun_size=math.radians(.9)
warm=n.new('ShaderNodeMixRGB');warm.blend_type='MULTIPLY';warm.inputs[0].default_value=.65;warm.inputs[2].default_value=(1,.64,.36,1)
world.node_tree.links.new(sky.outputs['Color'],warm.inputs[1]);world.node_tree.links.new(warm.outputs[0],bg.inputs['Color']);world.node_tree.links.new(bg.outputs[0],out.inputs['Surface']);bg.inputs['Strength'].default_value=.25
# Sparse high cloud layer, procedurally shaded and rendered once into the panorama.
bpy.ops.mesh.primitive_cube_add(size=1,location=(0,0,850));cloud=bpy.context.object;cloud.name='High cloud volume';cloud.scale=(7000,7000,220);bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
m=bpy.data.materials.new('Procedural cloud density');m.use_nodes=True;n=m.node_tree.nodes;n.clear();out=n.new('ShaderNodeOutputMaterial');volume=n.new('ShaderNodeVolumePrincipled');volume.inputs['Color'].default_value=(.88,.90,1,1);volume.inputs['Anisotropy'].default_value=.35
geom=n.new('ShaderNodeTexCoord');noise=n.new('ShaderNodeTexNoise');noise.inputs['Scale'].default_value=.0025;noise.inputs['Detail'].default_value=4;noise.inputs['Roughness'].default_value=.7;m.node_tree.links.new(geom.outputs['Object'],noise.inputs['Vector'])
ramp=n.new('ShaderNodeValToRGB');ramp.color_ramp.elements[0].position=.58;ramp.color_ramp.elements[0].color=(0,0,0,1);ramp.color_ramp.elements[1].position=.72;ramp.color_ramp.elements[1].color=(.012,.012,.012,1);m.node_tree.links.new(noise.outputs['Fac'],ramp.inputs[0]);m.node_tree.links.new(ramp.outputs[0],volume.inputs['Density']);m.node_tree.links.new(volume.outputs[0],out.inputs['Volume']);cloud.data.materials.append(m)
bpy.ops.object.camera_add(location=(0,0,0),rotation=(math.pi/2,0,0));s.camera=bpy.context.object;s.camera.data.type='PANO';s.camera.data.panorama_type='EQUIRECTANGULAR';s.camera.data.clip_end=10000
s.render.engine='CYCLES';s.cycles.samples=24;s.cycles.use_denoising=True;s.cycles.volume_step_rate=4;s.cycles.volume_max_steps=128
s.render.resolution_x=2560;s.render.resolution_y=1280;s.render.resolution_percentage=100;s.view_settings.view_transform='AgX';s.view_settings.look='AgX - Medium High Contrast';s.view_settings.exposure=0
# Keep the user's original sunset art direction, reprojected inside a closed sphere.
# Fade both the longitudinal join and the poles to one continuous dusk color.
cloud.hide_render=True
verts=[];faces=[];coords=[];nu=128;nv=64
for j in range(nv+1):
 lat=-math.pi/2+j*math.pi/nv
 for i in range(nu+1):
  angle=(i/nu-.5)*math.tau+.52;verts.append((2000*math.cos(lat)*math.sin(angle),2000*math.cos(lat)*math.cos(angle),2000*math.sin(lat)));coords.append((i/nu,max(0,min(1,j/nv-.065))))
for j in range(nv):
 for i in range(nu):k=j*(nu+1)+i;faces.append((k,k+1,k+nu+2,k+nu+1))
mesh=bpy.data.meshes.new('Seamless art-directed sky');mesh.from_pydata(verts,[],faces);uv=mesh.uv_layers.new()
for p in mesh.polygons:
 for li in p.loop_indices:uv.data[li].uv=coords[mesh.loops[li].vertex_index]
ob=bpy.data.objects.new('Complete sunset sky shell',mesh);s.collection.objects.link(ob)
material=bpy.data.materials.new('Continuous original sunset');material.use_nodes=True;n=material.node_tree.nodes;n.clear();out=n.new('ShaderNodeOutputMaterial');em=n.new('ShaderNodeEmission');tex=n.new('ShaderNodeTexImage');tex.image=bpy.data.images.load(str(R/'public/models/timi-studio/sunset-clouds-v1.png'));tex.image.pack()
coord=n.new('ShaderNodeTexCoord');sep=n.new('ShaderNodeSeparateXYZ');material.node_tree.links.new(coord.outputs['UV'],sep.inputs[0])
def mathnode(operation,a,b):
 node=n.new('ShaderNodeMath');node.operation=operation
 for i,value in enumerate([a,b]):
  if isinstance(value,(int,float)):node.inputs[i].default_value=value
  else:material.node_tree.links.new(value,node.inputs[i])
 return node.outputs[0]
edge=mathnode('MINIMUM',sep.outputs['X'],mathnode('SUBTRACT',1,sep.outputs['X']));pole=mathnode('MINIMUM',sep.outputs['Y'],mathnode('SUBTRACT',1,sep.outputs['Y']));minimum=mathnode('MINIMUM',edge,pole)
fade=n.new('ShaderNodeMapRange');fade.clamp=True;fade.inputs['From Min'].default_value=0;fade.inputs['From Max'].default_value=.06;material.node_tree.links.new(minimum,fade.inputs['Value'])
mix=n.new('ShaderNodeMixRGB');mix.inputs[1].default_value=(.13,.19,.28,1);material.node_tree.links.new(fade.outputs['Result'],mix.inputs[0]);material.node_tree.links.new(tex.outputs[0],mix.inputs[2]);material.node_tree.links.new(mix.outputs[0],em.inputs[0]);material.node_tree.links.new(em.outputs[0],out.inputs['Surface']);mesh.materials.append(material)
s.view_settings.view_transform='Standard';s.view_settings.look='None';s.cycles.samples=4
s.render.image_settings.file_format='PNG';s.render.filepath=str(R/'public/models/timi-studio/blender-sky-360.png')
bpy.ops.wm.save_as_mainfile(filepath=str(A/'sky-source.blend'));bpy.ops.render.render(write_still=True)
