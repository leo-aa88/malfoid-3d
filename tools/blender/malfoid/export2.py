"""Exports the finished character to public/models/malfoid.glb."""
import json
import os
import bpy

# shape keys the viewer drives (everything else is dropped to keep the file small)
KEEP_KEYS = [
    'vrc.blink', 'vrc.blink_Straight',
    'browDownLeft', 'browDownRight', 'browOuterUpLeft', 'browInnerUp',
    'mouthSmileLeft', 'mouthSmileRight', 'mouthPressLeft', 'mouthPressRight', 'mouthDimpleLeft',
    'mouthFrownLeft', 'mouthFrownRight', 'mouthPucker', 'eyeSquintLeft', 'eyeSquintRight',
    'Sulk', 'Angry',
]
TEX_SIZE = 2048


def prune_keys():
    ob = bpy.data.objects['Body']
    kb = ob.data.shape_keys.key_blocks
    for k in list(kb)[1:]:
        if k.name not in KEEP_KEYS:
            ob.shape_key_remove(k)
    ob.active_shape_key_index = 0
    return {k.name: round(k.value, 3) for k in ob.data.shape_keys.key_blocks[1:]}


def bake_hair_colour():
    """multiply the hair's vertex colours by the hair base colour and feed the
    colour attribute straight into Base Color (what glTF can express)"""
    ob = bpy.data.objects.get('Hair')
    if ob is None or 'Col' not in ob.data.color_attributes or 'mf_hair' not in bpy.data.materials:
        return                      # purchased hair: colour comes from its texture
    me = ob.data
    m = bpy.data.materials['mf_hair']
    base = m.node_tree.nodes['Principled BSDF']
    mix = next(n for n in m.node_tree.nodes if n.type == 'MIX')
    col = list(mix.inputs['A'].default_value)[:3]
    ca = me.color_attributes['Col']
    for d in ca.data:
        c = d.color
        d.color = (c[0], c[1], c[2], 1.0)       # tone only; the viewer supplies the hair colour
    nt = m.node_tree
    vc = next(n for n in nt.nodes if n.type == 'VERTEX_COLOR')
    nt.links.new(vc.outputs['Color'], base.inputs['Base Color'])


def shrink_textures():
    for img in bpy.data.images:
        if img.size[0] > TEX_SIZE:
            img.scale(TEX_SIZE, TEX_SIZE)
            img.pack()


def export(path, arm, info):
    path = os.path.abspath(path)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    rest = prune_keys()
    bake_hair_colour()
    shrink_textures()
    # rest pose, no active action
    if arm.animation_data:
        arm.animation_data.action = None
    for pb in arm.pose.bones:
        pb.rotation_quaternion = (1, 0, 0, 0)
        pb.location = (0, 0, 0)
    bpy.context.scene.frame_set(0)
    for ob in list(bpy.data.objects):
        if ob.type == 'MESH' and ob.hide_render:
            bpy.data.objects.remove(ob, do_unlink=True)
    kw = dict(filepath=path, export_format='GLB', export_yup=True, export_apply=False, export_texcoords=True,
              export_normals=True, export_tangents=False, export_materials='EXPORT', export_cameras=False,
              export_lights=False, export_animations=True, export_animation_mode='ACTIONS',
              export_force_sampling=True, export_frame_step=1, export_skins=True, export_def_bones=True,
              export_all_influences=False, export_morph=True, export_morph_normal=False,
              export_morph_tangent=False, use_selection=False, export_extras=False,
              export_image_format='AUTO', export_vertex_color='ACTIVE')
    try:
        bpy.ops.export_scene.gltf(**kw)
    except TypeError as e:
        print('MF export: retry without', e)
        kw.pop('export_vertex_color', None)
        bpy.ops.export_scene.gltf(**kw)
    meta = dict(info)
    meta['rest_expression'] = rest
    with open(os.path.splitext(path)[0] + '.json', 'w') as f:
        json.dump(meta, f, indent=1)
    print('MF export: %s (%.1f MB)' % (path, os.path.getsize(path) / 1e6))
