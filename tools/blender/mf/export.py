"""GLB export."""
import os
import bpy


def export_glb(path, arm, objs):
    path = os.path.abspath(path)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    scene = bpy.context.scene
    if arm.animation_data:
        arm.animation_data.action = None
        for tr in arm.animation_data.nla_tracks:
            tr.mute = False
    for pb in arm.pose.bones:
        pb.rotation_quaternion = (1, 0, 0, 0)
        pb.location = (0, 0, 0)
    for ob in objs:
        if ob.data.shape_keys:
            for kb in ob.data.shape_keys.key_blocks:
                kb.value = 0.0
    scene.frame_set(0)
    bpy.ops.object.select_all(action='DESELECT')
    bpy.ops.export_scene.gltf(
        filepath=path, export_format='GLB', export_yup=True, export_apply=False,
        export_texcoords=True, export_normals=True, export_tangents=False,
        export_materials='EXPORT', export_colors=True, export_cameras=False, export_lights=False,
        export_animations=True, export_frame_range=False, export_frame_step=1,
        export_force_sampling=True, export_nla_strips=True, export_def_bones=False,
        export_current_frame=False, export_skins=True, export_all_influences=False,
        export_morph=True, export_morph_normal=False, export_morph_tangent=False,
        use_selection=False, export_extras=False)
    print('EXPORTED', path, os.path.getsize(path), 'bytes')
