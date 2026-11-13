"""Which character the build makes, and everything that differs between them.

  MF_CHAR=malfoid (default) | ginny

Pure Python (no bpy): read by the Blender build and by tools/textures/*.py. Malfoid's
profile holds exactly the values the pipeline was written with, so her model is
reproduced bit for bit.
"""
import os

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
CHAR = os.environ.get('MF_CHAR', 'malfoid')

PROFILES = {
    'malfoid': {
        'name': 'Malfoid',
        'prefix': 'Malfoid',                 # texture file prefix, armature object name
        'skin_warm': 0.0,                    # 0 = NeutralFair preset .. 1 = WarmHoney preset
        'iris': {'src': 'Eyes_Color1', 'hue': 148.0 / 360.0, 'sat': 1.10, 'val': 0.92},
        'brow': ((0x86, 0x66, 0x4a), (0xd8, 0xbf, 0xa0)),      # core, fade
        'lashes': 'black',
        'hide_nose_mark': True,
        'scalp': (214, 191, 163),            # hair root tone painted on the scalp
        'freckles': None,
        'face_keys': ('cheek_slim', 'eyes_up', 'eyes_in'),
        'rest_keys': None,                   # face.REST_KEYS
        'extra_keys': (),                    # shape keys kept in the GLB besides export2.KEEP_KEYS
        'earrings': True,
        'hair': {'ramp': ((0x9e, 0x86, 0x6c), (0xd9, 0xc2, 0xa6), (0xf0, 0xdf, 0xc9), (0xf5, 0xe6, 0xd3), (0xf9, 0xec, 0xdc)),
                 'flatten': True, 'slim': True, 'part_shift': 0.0, 'half_up': False},
        'tie': ((0x1f, 0x5c, 0x40), (0xc6, 0xc6, 0xc9)),   # base, stripe
        'palette': {},                       # mats.PALETTE overrides
        'crest': 'Malfoid_Crest.png',
    },
    'ginny': {
        'name': 'Ginny',
        'prefix': 'Ginny',
        # skin #FDE3D9: fair with a warm undertone, between the pack's NeutralFair and WarmHoney
        'skin_warm': 0.55,
        # warm brown #6B3B24 from the pack's own brown iris art (gradient, pupil, sparkles kept)
        'iris': {'src': 'Eyes_Color5', 'hue': 19.0 / 360.0, 'sat': 1.0, 'val': 0.80},
        'brow': ((0x7a, 0x34, 0x1e), (0xc0, 0x62, 0x3c)),  # reddish brown
        'lashes': 'brown',                   # natural dark brown, not Malfoid's black liner
        'hide_nose_mark': True,
        'scalp': (166, 62, 36),              # copper root tone
        'freckles': {'colour': (0xc8, 0x76, 0x58), 'count': 150, 'seed': 7, 'size': (4.0, 7.0), 'alpha': (0.30, 0.55)},
        'face_keys': (),                     # the base face as authored: softer and rounder
        'rest_keys': {'vrc.blink_Straight': 0.08, 'mouthSmileLeft': 0.18, 'mouthSmileRight': 0.18,
                      'browOuterUpLeft': 0.12, 'browOuterUpRight': 0.12},
        'extra_keys': ('Smile1', 'Smile2', 'Excited', 'Shocked', 'Shy', 'Scared', 'Oops!', 'Sad', 'jawOpen',
                       'mouthUpperUpLeft', 'mouthUpperUpRight', 'mouthLowerDownLeft', 'mouthLowerDownRight',
                       'vrc.blink_Joy', 'あ', 'ワ', 'い', 'にこり', 'なごみ', 'びっくり', '照れ', '瞳大', 'cheekPuff',
                       'Exhausted', 'Confused', 'eyeBlinkLeft', 'eyeBlinkRight', 'mouthFunnel', 'お'),
        'earrings': False,                   # natural ears (facial atlas)
        # copper red #C7492A where most of the hair sits in the texture's tone range, darker
        # roots and shadows, a warmer sheen on the highlights
        'hair': {'ramp': ((0x40, 0x10, 0x08), (0x8a, 0x2c, 0x14), (0xbe, 0x46, 0x24), (0xd6, 0x5c, 0x30), (0xe8, 0x7a, 0x46)),
                 'flatten': True, 'slim': False, 'part_shift': -0.012, 'half_up': True},
        'tie': ((0x7a, 0x1f, 0x2b), (0xd4, 0xa1, 0x3a)),
        'palette': {
            'mf_robe': ('#1c1c1c', 0.90, 0.0),
            'mf_robe_lining': ('#7a1f2b', 0.85, 0.0),
            'mf_tie': ('#7a1f2b', 0.75, 0.0),
            'mf_tie_stripe': ('#d4a13a', 0.60, 0.0),
        },
        'crest': 'Ginny_Crest.png',
    },
}

if CHAR not in PROFILES:
    raise SystemExit('MF_CHAR must be one of %s' % ', '.join(PROFILES))
P = PROFILES[CHAR]
BUILT = os.path.join(ROOT, 'build', 'textures')


def tex(name):
    """path of one of this character's built textures, e.g. tex('Head_BaseColor.png')"""
    return os.path.join(BUILT, P['prefix'] + '_' + name)
