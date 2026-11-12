"""Builds Malfoid (meshes, rig, shape keys, animations) and exports a GLB.

  blender -b --python-use-system-env -P tools/blender/build.py -- \
      [--out public/models/malfoid.glb] [--preview DIR] [--views body,face] \
      [--pose NAME:FRAME] [--no-anim]
"""
import os
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

import bpy  # noqa: E402
from mathutils import Vector  # noqa: E402


def parse_args():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    opts = {'out': None, 'preview': None, 'views': 'body,face', 'pose': None, 'anim': True, 'tag': '',
            'shape': None}
    i = 0
    while i < len(argv):
        a = argv[i]
        if a == '--no-anim':
            opts['anim'] = False
        elif a.startswith('--'):
            opts[a[2:]] = argv[i + 1]
            i += 1
        i += 1
    return opts


def main():
    t0 = time.time()
    opts = parse_args()
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.render.fps = 30
    scene.unit_settings.system = 'METRIC'

    from mf import core, rig, head, body, outfit, robe, hair, materials
    from mf.core import Part

    mats = materials.make_materials()
    arm = rig.build_armature(rig.bone_table(hair.hair_env, robe.robe_env))

    def both(p):
        q = Part()
        q.merge(p)
        q.merge(p.mirrored())
        return q

    # --- skin: head, ears, neck, hands, legs (carries the face shape keys)
    skin = head.build_face()
    skin.merge(head.build_ear(1))
    skin.merge(head.build_ear(-1))
    skin.merge(body.build_neck())
    skin.merge(both(body.build_hand()))
    leg, sock = body.build_leg()
    skin.merge(both(leg))
    ob_body = skin.to_object('Body', mats)

    ob_hair = hair.build_hair().to_object('Hair', mats)

    cloth = outfit.build_sweater()
    cloth.merge(outfit.build_shirt())
    cloth.merge(outfit.build_tie())
    cloth.merge(outfit.build_skirt())
    cloth.merge(body.build_hips())
    cloth.merge(both(outfit.build_sleeve_shirt()))
    cloth.merge(both(sock))
    cloth.merge(both(outfit.build_shoe()))
    ob_cloth = cloth.to_object('Outfit', mats, smooth_angle=48)

    rb = robe.build_robe_body()
    rb.merge(both(robe.build_robe_sleeve()))
    rb.merge(robe.build_hood())
    rb.merge(robe.build_crest())
    ob_robe = rb.to_object('Robe', mats, smooth_angle=48)

    objs = [ob_body, ob_hair, ob_cloth, ob_robe]
    for ob in objs:
        rig.attach(ob, arm)
    print('MESH STATS', {ob.name: (len(ob.data.vertices), len(ob.data.polygons)) for ob in objs},
          'total verts', sum(len(ob.data.vertices) for ob in objs))

    info = None
    if opts['anim']:
        from mf import anim
        info = anim.build_all(arm)
        print('ANIM INFO', info)

    if opts['pose']:
        name, frame = opts['pose'].split(':')
        from mf import anim
        anim.show(arm, name, int(frame))
    if opts['shape']:
        for kv in opts['shape'].split(','):
            k, v = kv.split('=')
            ob_body.data.shape_keys.key_blocks[k].value = float(v)

    if opts['preview']:
        from mf import render
        render.previews(opts['preview'], opts['tag'], opts['views'])

    if opts['out']:
        from mf import export
        export.export_glb(opts['out'], arm, objs)
    print('BUILD DONE in %.1fs' % (time.time() - t0))


main()
