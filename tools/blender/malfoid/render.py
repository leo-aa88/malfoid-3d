"""Validation renders (Cycles, cel-style preview shading + line art)."""
import math
import os
import bpy
from mathutils import Vector


FLAT = ('mf_crest_tex', 'mf_highlight', 'mf_sclera', 'mf_iris', 'mf_pupil', 'mf_lash', 'mf_brow', 'mf_lidline',
        'mf_teeth', 'mf_lipline')
FLAT += ('Eye', 'Highlight', 'Alpha', 'Tear')
SHADE_TINT = {'mf_hair_tex': (0.84, 0.76, 0.70), 'mf_skin': (0.86, 0.74, 0.76), 'mf_skin_body': (0.86, 0.74, 0.76), 'mf_hair': (0.84, 0.76, 0.70),
              'mf_hair_dark': (0.84, 0.76, 0.70), 'Body': (0.88, 0.78, 0.80), 'Body_All': (0.88, 0.78, 0.80)}
BASE_MATS = ('Body', 'Body_All', 'Eye', 'Highlight', 'Alpha', 'Tear', 'Underwear', 'mf_hair_tex', 'mf_tie_tex', 'mf_crest_tex')


def _toon_on():
    """Temporarily route every mf_ material through a two-tone cel shader:
    N.L against a per-shot light direction, hard ramp, emitted as flat colour
    (the same idea as the viewer's toon material)."""
    for m in bpy.data.materials:
        if not m.use_nodes or not (m.name.startswith('mf_') or m.name in BASE_MATS):
            continue
        nt = m.node_tree
        out = next(n for n in nt.nodes if n.type == 'OUTPUT_MATERIAL')
        bsdf = nt.nodes.get('Principled BSDF')
        if nt.nodes.get('PV_out') or bsdf is None:
            continue
        alpha = bsdf.inputs['Alpha'].links[0].from_socket if bsdf.inputs['Alpha'].links else None
        if m.name == 'mf_fx':
            tr = nt.nodes.new('ShaderNodeBsdfTransparent')
            tr.name = 'PV_out'
            nt.links.new(tr.outputs[0], out.inputs[0])
            continue
        em = nt.nodes.new('ShaderNodeEmission')
        em.name = 'PV_out'
        src = bsdf.inputs['Base Color']
        base = src.links[0].from_socket if src.links else None
        if m.name in FLAT:
            if base is not None:
                nt.links.new(base, em.inputs['Color'])
            else:
                em.inputs['Color'].default_value = src.default_value
        else:
            geo = nt.nodes.new('ShaderNodeNewGeometry')
            geo.name = 'PV_geo'
            L = nt.nodes.new('ShaderNodeCombineXYZ')
            L.name = 'PV_L'
            dot = nt.nodes.new('ShaderNodeVectorMath')
            dot.name = 'PV_dot'
            dot.operation = 'DOT_PRODUCT'
            nt.links.new(geo.outputs['Normal'], dot.inputs[0])
            nt.links.new(L.outputs[0], dot.inputs[1])
            ramp = nt.nodes.new('ShaderNodeMapRange')
            ramp.name = 'PV_ramp'
            ramp.interpolation_type = 'SMOOTHSTEP'
            ramp.inputs['From Min'].default_value = 0.16
            ramp.inputs['From Max'].default_value = 0.22
            nt.links.new(dot.outputs['Value'], ramp.inputs['Value'])
            mix = nt.nodes.new('ShaderNodeMix')
            mix.name = 'PV_mix'
            mix.data_type = 'RGBA'
            mix.blend_type = 'MULTIPLY'
            mix.inputs['Factor'].default_value = 1.0
            tint = SHADE_TINT.get(m.name, (0.72, 0.70, 0.74))
            tone = nt.nodes.new('ShaderNodeMix')
            tone.name = 'PV_tone'
            tone.data_type = 'RGBA'
            tone.inputs['A'].default_value = (*tint, 1.0)
            tone.inputs['B'].default_value = (1.0, 1.0, 1.0, 1.0)
            nt.links.new(ramp.outputs['Result'], tone.inputs['Factor'])
            if base is not None:
                nt.links.new(base, mix.inputs['A'])
            else:
                mix.inputs['A'].default_value = src.default_value
            nt.links.new(tone.outputs['Result'], mix.inputs['B'])
            nt.links.new(mix.outputs['Result'], em.inputs['Color'])
        if alpha is not None:
            tr = nt.nodes.new('ShaderNodeBsdfTransparent')
            tr.name = 'PV_tr'
            cut = nt.nodes.new('ShaderNodeMixShader')
            cut.name = 'PV_cut'
            nt.links.new(alpha, cut.inputs['Fac'])
            nt.links.new(tr.outputs[0], cut.inputs[1])
            nt.links.new(em.outputs[0], cut.inputs[2])
            nt.links.new(cut.outputs[0], out.inputs[0])
        else:
            nt.links.new(em.outputs[0], out.inputs[0])


def _set_light(L):
    for m in bpy.data.materials:
        if m.use_nodes and m.node_tree.nodes.get('PV_L'):
            n = m.node_tree.nodes['PV_L']
            n.inputs[0].default_value, n.inputs[1].default_value, n.inputs[2].default_value = L


def _toon_off():
    for m in bpy.data.materials:
        if not m.use_nodes or not (m.name.startswith('mf_') or m.name in BASE_MATS):
            continue
        nt = m.node_tree
        out = next(n for n in nt.nodes if n.type == 'OUTPUT_MATERIAL')
        for n in list(nt.nodes):
            if n.name.startswith('PV_'):
                nt.nodes.remove(n)
        bsdf = nt.nodes.get('Principled BSDF')
        if bsdf:
            nt.links.new(bsdf.outputs[0], out.inputs[0])


def setup(scene, lines=True, samples=8):
    scene.render.engine = 'CYCLES'
    scene.cycles.device = 'CPU'
    scene.cycles.samples = samples
    scene.cycles.use_denoising = False
    scene.cycles.max_bounces = 2
    scene.cycles.transparent_max_bounces = 16
    scene.render.film_transparent = False
    scene.view_settings.view_transform = 'Standard'
    scene.render.image_settings.file_format = 'PNG'
    w = bpy.data.worlds.get('mf_world') or bpy.data.worlds.new('mf_world')
    w.use_nodes = True
    bg = w.node_tree.nodes['Background']
    bg.inputs[0].default_value = (0.83, 0.82, 0.80, 1)      # neutral, contrasts with pale hair
    bg.inputs[1].default_value = 1.0
    scene.world = w
    # the background should not light the model (keeps cel shading clean)
    scene.world.cycles_visibility.diffuse = False
    scene.world.cycles_visibility.glossy = False
    scene.render.use_freestyle = lines
    if lines:
        scene.render.line_thickness = 1.25
        vl = scene.view_layers[0]
        fs = vl.freestyle_settings
        while len(fs.linesets) > 0:
            fs.linesets.remove(fs.linesets[0])
        ls = fs.linesets.new('mf_lines')
        ls.select_silhouette = True
        ls.select_border = True
        ls.select_crease = False
        ls.select_external_contour = True
        ls.select_material_boundary = False
        ls.select_by_face_marks = True                 # hidden effect meshes / hair cards draw no lines
        ls.face_mark_negation = 'EXCLUSIVE'
        ls.face_mark_condition = 'ONE'
        ls.linestyle.color = (0.22, 0.13, 0.11)
        ls.linestyle.thickness = 1.25


def shot(scene, path, target, yaw_deg, ortho_scale, pitch_deg=0.0, res=(900, 900), persp=False, dist=5.0):
    cd = bpy.data.cameras.new('mf_cam')
    if persp:
        cd.type = 'PERSP'
        cd.lens = 85
        dist = ortho_scale * 85 / 36 * 1.0
    else:
        cd.type = 'ORTHO'
        cd.ortho_scale = ortho_scale
    cd.clip_start = 0.01
    cam = bpy.data.objects.new('mf_cam', cd)
    scene.collection.objects.link(cam)
    yaw, pitch = math.radians(yaw_deg), math.radians(pitch_deg)
    d = Vector((math.sin(yaw) * math.cos(pitch), -math.cos(yaw) * math.cos(pitch), math.sin(pitch)))
    cam.location = Vector(target) + d * dist
    cam.rotation_euler = (Vector(target) - cam.location).to_track_quat('-Z', 'Y').to_euler()
    scene.camera = cam
    # key light travels with the camera: above and a little to its left
    ly, lp = yaw - math.radians(24), pitch + math.radians(30)
    _set_light((math.sin(ly) * math.cos(lp), -math.cos(ly) * math.cos(lp), math.sin(lp)))
    scene.render.resolution_x, scene.render.resolution_y = res
    scene.render.resolution_percentage = 100
    scene.render.filepath = path
    bpy.ops.render.render(write_still=True)
    bpy.data.objects.remove(cam)
    bpy.data.cameras.remove(cd)


def head_views(out_dir, lm, views='front,side,q,eyes,mouth', res=900, lines=True, tag=''):
    """lm: landmark dict (world space)."""
    scene = bpy.context.scene
    os.makedirs(out_dir, exist_ok=True)
    setup(scene, lines)
    _toon_on()
    try:
        cz = (lm['crown'].z + lm['chin_bottom'].z) / 2 + 0.005
        span = (lm['crown'].z - lm['chin_bottom'].z) * 1.42
        ey = (lm['eye_L'].z + lm['eye_R'].z) / 2
        if os.environ.get('MF_FRAME') == 'fixed':
            # identical cameras for every variant, independent of the mesh
            cz, span, ey = 1.425, 0.355, 1.388
            lm = dict(lm, mouth=Vector((0, 0, 1.337)))
        v = views.split(',')
        if 'front' in v:
            shot(scene, os.path.join(out_dir, tag + 'front.png'), (0, 0, cz), 0, span, res=(res, res))
        if 'side' in v:
            shot(scene, os.path.join(out_dir, tag + 'side.png'), (0, 0.02, cz), 90, span, res=(res, res))
        if 'q' in v:
            shot(scene, os.path.join(out_dir, tag + 'q.png'), (0, 0, cz), 38, span, 4, res=(res, res))
        if 'back' in v:
            shot(scene, os.path.join(out_dir, tag + 'back.png'), (0, 0, cz - 0.1), 180, span * 1.9, res=(res, res))
        if 'full' in v:
            shot(scene, os.path.join(out_dir, tag + 'full_front.png'), (0, 0, 0.78), 0, 1.75, res=(res, res))
            shot(scene, os.path.join(out_dir, tag + 'full_q.png'), (0, 0, 0.78), 35, 1.75, 4, res=(res, res))
            shot(scene, os.path.join(out_dir, tag + 'full_side.png'), (0, 0, 0.78), 90, 1.75, res=(res, res))
            shot(scene, os.path.join(out_dir, tag + 'full_back.png'), (0, 0, 0.78), 180, 1.75, res=(res, res))
        if 'validation' in v:
            for nm, yaw, pitch in (('1_front', 0, 0), ('2_three_quarter_front', 35, 4), ('3_side', 90, 0),
                                   ('4_three_quarter_back', 145, 4), ('5_back', 180, 0)):
                shot(scene, os.path.join(out_dir, tag + nm + '.png'), (0, 0, 0.80), yaw, 1.70, pitch,
                     res=(res, res))
            shot(scene, os.path.join(out_dir, tag + '6_head_front.png'), (0, -0.02, 1.40), 0, 0.42, 0, res=(res, res))
            shot(scene, os.path.join(out_dir, tag + '7_head_three_quarter.png'), (0, -0.02, 1.40), 35, 0.42, 4,
                 res=(res, res))
            shot(scene, os.path.join(out_dir, tag + '8_crest_uniform.png'), (0.03, -0.1, 1.13), 15, 0.36, 3,
                 res=(res, res))
        if 'waist' in v:
            shot(scene, os.path.join(out_dir, tag + 'waist_front.png'), (0, -0.05, 0.99), 0, 0.26, 5, res=(res, res))
            shot(scene, os.path.join(out_dir, tag + 'waist_q.png'), (0, -0.05, 0.99), 30, 0.26, 8, res=(res, res))
        if 'shoulder' in v:
            shot(scene, os.path.join(out_dir, tag + 'shoulder_back.png'), (0.12, 0.03, 1.20), 150, 0.30, 15, res=(res, res))
            shot(scene, os.path.join(out_dir, tag + 'shoulder_side.png'), (0.12, 0.03, 1.20), 100, 0.30, 10, res=(res, res))
        if 'cuff' in v:
            shot(scene, os.path.join(out_dir, tag + 'cuff.png'), (0.20, -0.02, 0.86), 25, 0.22, 0, res=(res, res))
        if 'neck' in v:
            shot(scene, os.path.join(out_dir, tag + 'neck_front.png'), (0, -0.04, 1.26), 0, 0.22, 8, res=(res, res))
            shot(scene, os.path.join(out_dir, tag + 'neck_q.png'), (0, -0.04, 1.26), 40, 0.22, 10, res=(res, res))
        if 'chest' in v:
            for nm, yaw, pitch in (('chest_front', 0, 0), ('chest_q', 35, 10), ('chest_side', 90, 0),
                                   ('chest_top', 10, 55)):
                shot(scene, os.path.join(out_dir, tag + nm + '.png'), (0, -0.02, 1.13), yaw, 0.55, pitch,
                     res=(res, res))
        if 'qback' in v:
            shot(scene, os.path.join(out_dir, tag + 'qback.png'), (0, 0, cz - 0.12), 140, span * 2.0, 5,
                 res=(res, res))
        if 'bust' in v:
            shot(scene, os.path.join(out_dir, tag + 'bust.png'), (0, 0, cz - 0.11), 0, span * 2.1, res=(res, res))
        if 'face' in v:
            shot(scene, os.path.join(out_dir, tag + 'face.png'), (0, 0, 1.372), 0, 0.17, res=(res, res))
        if 'eyes' in v:
            shot(scene, os.path.join(out_dir, tag + 'eyes.png'), (0, 0, ey + 0.004), 0, 0.165,
                 res=(res, int(res * 0.5)))
        if 'mouth' in v:
            mz = lm.get('mouth', lm['chin'] + Vector((0, 0, 0.03))).z
            shot(scene, os.path.join(out_dir, tag + 'mouth.png'), (0, 0, mz), 0, 0.085,
                 res=(res, int(res * 0.5)))
    finally:
        _toon_off()
