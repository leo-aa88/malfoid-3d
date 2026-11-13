"""Turns base_character.blend's head into Malfoid.

  blender -b base_character.blend -P tools/blender/build_head.py -- \
      [--out DIR] [--views front,side,q,eyes,mouth] [--stage N] [--save FILE]
"""
import os
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import bpy  # noqa: E402
from mathutils import Vector  # noqa: E402


def args():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    o = {'out': None, 'views': 'front,side,q,eyes,mouth', 'stage': '2', 'save': None, 'res': '900', 'tag': '',
         'keys': None, 'posetest': None, 'glb': None}
    i = 0
    while i < len(argv):
        if argv[i].startswith('--'):
            o[argv[i][2:]] = argv[i + 1]
            i += 1
        i += 1
    return o


def main():
    t0 = time.time()
    o = args()
    stage = int(o['stage'])
    from malfoid import base, mats, render
    head = bpy.data.objects[base.HEAD_OBJ]
    for ob in bpy.data.objects:                       # rig widgets etc. never render
        if ob.name.startswith('cs_') or ob.type == 'EMPTY':
            ob.hide_render = True
    parts, fparts = base.classify(head)
    print('PARTS', {k: len(v) for k, v in sorted(parts.items())})
    print('FACE PARTS', {k: len(v) for k, v in fparts.items()})
    m = mats.make()
    if os.environ.get('MF_FLATMATS') == '1':
        # old path: flat colours, used before the purchased textures were available
        mats.assign(head, parts, fparts, m)
        body = bpy.data.objects[base.BODY_OBJ]
        body.data.materials.clear()
        body.data.materials.append(m['mf_skin_body'])
    else:
        from malfoid import textures
        textures.apply(original=os.environ.get('MF_ORIGINAL_TEX') == '1')
        textures.mark_decals(head, parts)

    if stage >= 1:
        from malfoid import bust
        bust.add_key()                    # smaller bust (shape key, Basis untouched)
        from malfoid import hands
        hands.add_key()                   # 10% smaller hands (shape key, Basis untouched)
        from malfoid import legs
        legs.add_key()                    # 10% thinner legs (shape key, Basis untouched)
        from malfoid import face
        face.apply(head, parts, fparts)
    if stage >= 2:
        from malfoid import earrings
        from malfoid.character import P
        if P['earrings']:
            earrings.build(head, parts, m, P['earrings'])
        variant = os.environ.get('MF_HAIR', 'asset')
        if variant != 'asset':
            # the earlier procedural hair is kept locally only (not in git)
            from malfoid import hair, hair2
        if variant == 'asset':
            from malfoid import assets
            hob = assets.import_hair(head, parts)     # purchased Bell_Hair_01
            for poly in hob.data.polygons:            # alpha cards: no preview line art
                poly.use_freestyle_mark = True
            if P.get('ribbon') and assets.GATHER:
                from malfoid import ribbon            # Cho's bow where the half-up is gathered
                ribbon.build(hob, assets.GATHER[0], m)
        elif variant == 'old':
            hair.build(head, parts, m)
        else:
            hair2.build(head, parts, m, variant)

    arm = None
    if stage >= 3:
        from malfoid import rig2
        skinned = [ob for ob in bpy.data.objects if ob.type == 'MESH' and
                   any(m.type == 'ARMATURE' for m in ob.modifiers)]
        for name in ('Outfit_Underwear_Top',):
            ob = bpy.data.objects.get(name)
            if ob is not None:
                if stage >= 4:            # covered by the uniform from here on
                    skinned.remove(ob)
                    bpy.data.objects.remove(ob, do_unlink=True)
        from malfoid import assets
        arm = rig2.convert(skinned, assets.HAIR_BONES)
        print('MF rig: %d bones, skinned %s' % (len(arm.data.bones), [o.name for o in skinned if o.name in bpy.data.objects]))
    if stage >= 4:
        from malfoid import outfit2
        outfit2.build(head, parts, arm, m)
        from malfoid import bust as _bust
        _bust.report()
    anim_info = None
    if stage >= 5:
        from malfoid import anim2
        anim_info = anim2.build_all(arm)
        print('MF anim:', anim_info)
    if o['posetest'] and arm is not None:
        if ':' in o['posetest']:
            from malfoid import anim2
            name, frame = o['posetest'].split(':')
            anim2.show(arm, name, int(frame))
        else:
            from malfoid import posetest
            posetest.apply(arm, o['posetest'])

    if o['keys']:
        kb = head.data.shape_keys.key_blocks
        for kv in o['keys'].split(','):
            k, _, v = kv.partition('=')
            kb[k].value = float(v) if v else 1.0

    if os.environ.get('MF_NOHAIR') == '1' and bpy.data.objects.get('Hair'):
        bpy.data.objects['Hair'].hide_render = True
    lm = base.landmarks(head, parts)
    H = lm['crown'].z - lm['chin_bottom'].z
    print('LANDMARKS')
    for k, p in lm.items():
        print('   %-12s x=%+.4f y=%+.4f z=%.4f  (%.1f%% of head height above chin)' %
              (k, p.x, p.y, p.z, 100 * (p.z - lm['chin_bottom'].z) / H))
    if o['out']:
        render.head_views(o['out'], lm, o['views'], int(o['res']), tag=o['tag'])
        import json
        hair = bpy.data.objects.get('Hair')
        top = max((v.co.z for v in hair.data.vertices), default=lm['crown'].z) if hair else lm['crown'].z
        with open(os.path.join(o['out'], o['tag'] + 'landmarks.json'), 'w') as f:
            json.dump({'lm': {k: list(p) for k, p in lm.items()}, 'hair_top': top}, f, indent=1)
    if o['save']:
        bpy.ops.wm.save_as_mainfile(filepath=os.path.abspath(o['save']))
    if o['glb']:
        from malfoid import export2
        export2.export(o['glb'], arm, anim_info or {})
    print('DONE %.1fs' % (time.time() - t0))


main()
