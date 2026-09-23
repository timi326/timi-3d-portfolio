"""Preserve semantic furniture groups while batching meshes within each asset."""
import bpy, json
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'public/models/timi-studio'
bpy.ops.wm.open_mainfile(filepath=str(ROOT/'artifacts/sunset-detail-v2/timi-sunset-detail.blend'))
LABELS={'desk':'窗边书桌与电脑','bed':'木床与床品','chair':'书桌椅','sofa':'双人沙发','television':'电视与电视柜','wardrobe':'衣柜','bookcase':'落地书架','rug':'条纹地毯','fan':'吊扇','air-conditioner':'空调','wall-shelf':'床头置物架','notes':'墙面手记','curtain-left':'左窗帘','curtain-right':'右窗帘','plant-bed':'床边绿植','plant-rear':'电视旁绿植','vanity':'洗手台与镜子','shower':'淋浴区','toilet':'马桶'}
COLLIDERS={'desk':[5],'chair':[6],'bed':[7],'bookcase':[8],'sofa':[9],'television':[10],'wardrobe':[11],'vanity':[15],'shower':[16],'toilet':[17]}
def center(o):
    points=[o.matrix_world @ Vector(v) for v in o.bound_box]
    return sum(points,Vector())/len(points)
def classify(o):
    name=o.name; p=center(o); x,y,z=p.x,p.z,-p.y
    if name.startswith(('City /','Horizon /','Sky /')): return 'exterior'
    if name.startswith('Floor /'): return 'floor'
    for prefix,key in [('Bed /','bed'),('Desk /','desk'),('Laptop /','desk'),('Lamp /','desk'),('screen-computer','desk'),('Chair /','chair'),('Sofa /','sofa'),('Media /','television'),('TV /','television'),('screen-television','television'),('Wardrobe /','wardrobe'),('Bookcase /','bookcase'),('Rug /','rug'),('Fan /','fan'),('Air conditioner /','air-conditioner'),('Bedside /','wall-shelf'),('Wall /','notes')]:
        if name.startswith(prefix): return key
    if name.startswith('Curtain /'): return 'curtain-left' if x<0 else 'curtain-right'
    if name.startswith('Books /'):
        if y>3.0 or (y>2.8 and z<-2.5): return 'shell'
        if x>2: return 'wall-shelf'
        if z<-2.1: return 'desk'
        return 'bookcase'
    if name.startswith(('Plant /','Basket /')):
        if z<-2: return 'desk'
        return 'plant-bed' if x>0 else 'plant-rear'
    if name.startswith('Bathroom /'):
        if any(s in name for s in ['vanity','sink','tap','mirror']): return 'vanity'
        if 'shower' in name: return 'shower'
        if any(s in name for s in ['toilet','cistern']): return 'toilet'
        if 'floor' in name: return 'floor'
    return 'shell'
bpy.ops.object.select_all(action='DESELECT')
for o in list(bpy.context.scene.objects):
    if o.type=='CURVE':
        o.select_set(True); bpy.context.view_layer.objects.active=o
        bpy.ops.object.convert(target='MESH'); o.select_set(False)
groups={}
for o in list(bpy.context.scene.objects):
    if o.type=='MESH': groups.setdefault(classify(o),[]).append(o)
manifest=[]
for key,objects in groups.items():
    vertices=[o.matrix_world @ Vector(v) for o in objects for v in o.bound_box]
    pivot=Vector(((min(v.x for v in vertices)+max(v.x for v in vertices))/2,(min(v.y for v in vertices)+max(v.y for v in vertices))/2,min(v.z for v in vertices))) if key in LABELS else Vector()
    parent=bpy.data.objects.new('asset-'+key,None); bpy.context.collection.objects.link(parent); parent.location=pivot
    parent['assetId']=key; parent['label']=LABELS.get(key,key); parent['editable']=key in LABELS
    parent['colliderIndices']=COLLIDERS.get(key,[])
    batches={}
    for o in objects:
        if o.name.startswith('screen-'): batches[o.name]=[o]
        else: batches.setdefault(o.data.materials[0].name,[]).append(o)
    for material,items in batches.items():
        bpy.ops.object.select_all(action='DESELECT')
        for o in items: o.select_set(True)
        bpy.context.view_layer.objects.active=items[0]
        if len(items)>1: bpy.ops.object.join()
        o=items[0]
        if not o.name.startswith('screen-'): o.name=('Exterior / ' if key=='exterior' else key+' / ')+material
        matrix=o.matrix_world.copy(); o.parent=parent; o.matrix_world=matrix
    manifest.append({'id':key,'label':LABELS.get(key,key),'editable':key in LABELS,'colliderIndices':COLLIDERS.get(key,[])})
bpy.ops.object.select_all(action='DESELECT')
for o in bpy.context.scene.objects:
    if o.type in ['MESH','EMPTY']: o.select_set(True)
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'artifacts/sunset-detail-v2/timi-editable.blend'))
bpy.ops.export_scene.gltf(filepath=str(OUT/'sunset-editable.glb'),export_format='GLB',use_selection=True,export_apply=True,export_yup=True,export_cameras=False,export_lights=False,export_extras=True)
(OUT/'asset-manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf-8')
print('EDITABLE ASSETS:',len(LABELS))
