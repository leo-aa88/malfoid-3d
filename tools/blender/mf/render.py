"""Workbench preview renders used while iterating on the model."""
import math
import os
import bpy
from mathutils import Vector, Matrix


def setup(scene, w, h):
    scene.render.engine = 'BLENDER_WORKBENCH'
    scene.render.resolution_x = w
    scene.render.resolution_y = h
    scene.render.resolution_percentage = 100
    scene.render.film_transparent = False
    scene.render.image_settings.file_format = 'PNG'
    sh = scene.display.shading
    sh.light = 'STUDIO'
    sh.color_type = 'MATERIAL'
    sh.show_object_outline = True
    sh.object_outline_color = (0.05, 0.04, 0.04)
    sh.show_cavity = True
    sh.cavity_type = 'BOTH'
    sh.show_shadows = False
    sh.show_backface_culling = True
    scene.display.render_aa = '8'
    scene.view_settings.view_transform = 'Standard'
    if scene.world is None:
        scene.world = bpy.data.worlds.new('W')
    scene.world.color = (0.36, 0.38, 0.42)


VCOL_MATS = ('hair', 'eye_white', 'eye_iris')


def setup_eevee(scene, w, h):
    scene.render.engine = 'BLENDER_EEVEE'
    scene.render.resolution_x = w
    scene.render.resolution_y = h
    scene.render.resolution_percentage = 100
    scene.eevee.taa_render_samples = 16
    scene.view_settings.view_transform = 'Standard'
    if scene.world is None:
        scene.world = bpy.data.worlds.new('W')
    scene.world.use_nodes = True
    bg = scene.world.node_tree.nodes.get('Background')
    bg.inputs[0].default_value = (0.55, 0.57, 0.62, 1)
    bg.inputs[1].default_value = 0.9
    if 'PreviewSun' not in bpy.data.objects:
        ld = bpy.data.lights.new('PreviewSun', 'SUN')
        ld.energy = 2.2
        lo = bpy.data.objects.new('PreviewSun', ld)
        scene.collection.objects.link(lo)
        lo.rotation_euler = (math.radians(55), 0, math.radians(-25))
    for name in VCOL_MATS:
        m = bpy.data.materials.get(name)
        if m is None or m.node_tree.nodes.get('PV_attr'):
            continue
        nt = m.node_tree
        bsdf = nt.nodes.get('Principled BSDF')
        at = nt.nodes.new('ShaderNodeAttribute')
        at.name = 'PV_attr'
        at.attribute_name = 'Col'
        mx = nt.nodes.new('ShaderNodeMixRGB')
        mx.name = 'PV_mix'
        mx.blend_type = 'MULTIPLY'
        mx.inputs[0].default_value = 1.0
        mx.inputs[2].default_value = bsdf.inputs['Base Color'].default_value
        nt.links.new(at.outputs['Color'], mx.inputs[1])
        nt.links.new(mx.outputs[0], bsdf.inputs['Base Color'])


def teardown_eevee():
    for name in VCOL_MATS:
        m = bpy.data.materials.get(name)
        if m is None:
            continue
        nt = m.node_tree
        for n in ('PV_attr', 'PV_mix'):
            node = nt.nodes.get(n)
            if node:
                nt.nodes.remove(node)
    lo = bpy.data.objects.get('PreviewSun')
    if lo:
        bpy.data.objects.remove(lo)


def shot(scene, path, target, yaw_deg, ortho_scale, pitch_deg=0.0, dist=6.0):
    cam_data = bpy.data.cameras.new('cam')
    cam_data.type = 'ORTHO'
    cam_data.ortho_scale = ortho_scale
    cam_data.clip_start = 0.01
    cam_data.clip_end = 50
    cam = bpy.data.objects.new('cam', cam_data)
    scene.collection.objects.link(cam)
    yaw = math.radians(yaw_deg)
    pitch = math.radians(pitch_deg)
    # yaw 0 = looking at the character's front (camera on -Y side)
    d = Vector((math.sin(yaw) * math.cos(pitch), -math.cos(yaw) * math.cos(pitch), math.sin(pitch)))
    cam.location = Vector(target) + d * dist
    look = (Vector(target) - cam.location).normalized()
    cam.rotation_euler = look.to_track_quat('-Z', 'Y').to_euler()
    scene.camera = cam
    scene.render.filepath = path
    bpy.ops.render.render(write_still=True)
    bpy.data.objects.remove(cam)
    bpy.data.cameras.remove(cam_data)


def previews(out_dir, tag='', views=None):
    scene = bpy.context.scene
    os.makedirs(out_dir, exist_ok=True)
    views = views or 'body,face'
    if 'body' in views:
        setup(scene, 420, 900)
        for name, yaw in (('front', 0), ('q_front', 40), ('side', 90), ('q_back', 140), ('back', 180)):
            shot(scene, os.path.join(out_dir, '%sbody_%s.png' % (tag, name)), (0, 0, 0.86), yaw, 1.80)
    if 'face' in views:
        setup_eevee(scene, 560, 560)
        for name, yaw, pitch in (('front', 0, 0), ('q', 38, 5), ('side', 90, 0)):
            shot(scene, os.path.join(out_dir, '%sface_%s.png' % (tag, name)), (0, 0, 1.545), yaw, 0.30, pitch)
    if 'bust' in views:
        setup_eevee(scene, 560, 700)
        for name, yaw, pitch in (('front', 0, 0), ('q', 35, 8), ('back', 180, 10)):
            shot(scene, os.path.join(out_dir, '%sbust_%s.png' % (tag, name)), (0, 0, 1.33), yaw, 0.75, pitch)
    if 'eye' in views:
        setup_eevee(scene, 800, 480)
        shot(scene, os.path.join(out_dir, '%seye.png' % tag), (0.0, 0, 1.535), 0, 0.15, 0)
    teardown_eevee()
