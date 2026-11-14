"""Which character the build makes, and everything that differs between them.

  MF_CHAR=malfoid (default) | ginny | cho | susan | luna

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
        # shape keys kept in the GLB besides export2.KEEP_KEYS: mouth shapes for her voice lines
        'extra_keys': ('あ', 'お', 'jawOpen'),
        'earrings': True,
        'hair': {'ramp': ((0x9e, 0x86, 0x6c), (0xd9, 0xc2, 0xa6), (0xf0, 0xdf, 0xc9), (0xf5, 0xe6, 0xd3), (0xf9, 0xec, 0xdc)),
                 'flatten': True, 'slim': True, 'part_shift': 0.0, 'half_up': False},
        'tie': ((0x1f, 0x5c, 0x40), (0xc6, 0xc6, 0xc9)),   # base, stripe
        'palette': {},                       # mats.PALETTE overrides
        'crest': 'Malfoid_Crest.png',
        # her Protego (learned from Cho): the held shield pose. Clips only add to her model
        'extra_clips': ('protego',),
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
        # side-step (legs follow her when she moves while facing Malfoid) and quick dodges
        # (her sidestep from a bolt, in place of running sideways); combat.EXTRA_CLIPS
        'extra_clips': ('strafe', 'dodge_left', 'dodge_right', 'dodge_back'),
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
    'cho': {
        'name': 'Cho',
        'prefix': 'Cho',
        # skin #F8E2D6: fair with a gentle peach undertone (a little warmer than Ginny's)
        'skin_warm': 0.65,
        # dark brown #5B3A28 from the pack's brown iris art (gradient, pupil, sparkles kept)
        'iris': {'src': 'Eyes_Color5', 'hue': 21.0 / 360.0, 'sat': 0.92, 'val': 0.44},
        'brow': ((0x24, 0x1b, 0x1c), (0x44, 0x38, 0x3a)),  # dark brown to black, natural
        'lashes': 'soft_black',              # black and elegant, softer than Malfoid's liner
        'hide_nose_mark': True,
        'scalp': (28, 32, 44),               # black-blue root tone
        'freckles': None,
        'face_keys': ('cheek_slim',),        # a slightly tapered jaw (added key, Basis untouched)
        # calm and attentive: lids a touch lower and the lower lid up a little (a soft almond
        # opening, not Ginny's wide eyes or Malfoid's heavy glare), a faint smile
        'rest_keys': {'mf_cheek_slim': 0.5, 'vrc.blink_Straight': 0.16, 'eyeSquintLeft': 0.30, 'eyeSquintRight': 0.30,
                      'mouthSmileLeft': 0.10, 'mouthSmileRight': 0.10},
        'extra_keys': ('Smile1', 'Smile2', 'Shy', 'Sad', 'Teary_Eyes', 'Crying', 'Scared', 'Confused', 'Shocked',
                       'Excited', 'jawOpen', 'mouthUpperUpLeft', 'mouthUpperUpRight', 'mouthLowerDownLeft',
                       'mouthLowerDownRight', 'vrc.blink_Joy', 'あ', 'い', 'お', 'ワ', 'にこり', 'なごみ', 'びっくり',
                       '照れ', '瞳大', 'eyeBlinkLeft', 'eyeBlinkRight', 'mouthFunnel', 'eyeLookInLeft', 'eyeLookInRight',
                       'eyeLookOutLeft', 'eyeLookOutRight'),
        'earrings': 'star',                  # small dangling silver stars (facial atlas)
        # black-blue #1A2436 where most of the hair sits in the texture's tone range: near-black
        # roots and shadows, cool blue sheen on the highlights (never bright blue or flat black)
        # (the toon shading lifts the mid tones, so the ramp sits darker than #1A2436 itself)
        # (more neutral than the swatch: as rendered, a bluer ramp read navy and the blue bow
        # vanished against it at gameplay distance)
        'hair': {'ramp': ((0x03, 0x03, 0x05), (0x07, 0x08, 0x0d), (0x0e, 0x11, 0x19), (0x1a, 0x20, 0x2e), (0x33, 0x3c, 0x52)),
                 'flatten': True, 'slim': True, 'part_shift': -0.005, 'half_up': True,
                 'frame_locks': True},
        'ribbon': True,                      # the Ravenclaw bow where the half-up is gathered
        'tie': ((0x1f, 0x2c, 0x55), (0xc4, 0xc8, 0xd0)),   # navy, silver
        'palette': {
            'mf_robe': ('#1c1c1c', 0.90, 0.0),
            'mf_robe_lining': ('#2e4878', 0.85, 0.0),
            'mf_tie': ('#1f2c55', 0.75, 0.0),
            'mf_tie_stripe': ('#c4c8d0', 0.60, 0.0),
            'mf_earring_silver': ('#dfe3ea', 0.30, 0.0),   # silver (toon shaded: no metal)
            'mf_ribbon': ('#2e4878', 0.75, 0.0),           # Ravenclaw blue
        },
        'crest': 'Cho_Crest.png',
        # her own clips (combat.EXTRA_CLIPS), built into her model only
        'extra_clips': ('cho_idle', 'dodge_left', 'dodge_right', 'dodge_back', 'protego', 'cast_quick', 'cast_ventus',
                        'strafe'),
    },
    'susan': {
        'name': 'Susan',
        'prefix': 'Susan',
        # skin #FBE6D8: fair, a gentle warm undertone (between Ginny's and Cho's)
        'skin_warm': 0.5,
        # hazel brown #7B4E2E from the pack's brown iris art: lighter and more golden than Ginny's
        'iris': {'src': 'Eyes_Color5', 'hue': 26.0 / 360.0, 'sat': 0.82, 'val': 0.74},
        'brow': ((0x8a, 0x5c, 0x30), (0xcc, 0x98, 0x5c)),  # honey brown, a shade darker than her hair
        'lashes': 'brown',                   # natural and soft (facial atlas: "natural, elegant")
        'hide_nose_mark': True,
        'scalp': (176, 128, 70),             # honey root tone
        'freckles': None,
        'face_keys': (),                     # the base face as authored: soft and round (atlas)
        # composed and kind: a warm closed smile, the lids relaxed a touch (a soft almond opening)
        'rest_keys': {'vrc.blink_Straight': 0.08, 'eyeSquintLeft': 0.15, 'eyeSquintRight': 0.15,
                      'mouthSmileLeft': 0.22, 'mouthSmileRight': 0.22},
        'extra_keys': ('Smile1', 'Smile2', 'Shy', 'Sad', 'Teary_Eyes', 'Crying', 'Scared', 'Confused', 'Shocked',
                       'Excited', 'jawOpen', 'mouthUpperUpLeft', 'mouthUpperUpRight', 'mouthLowerDownLeft',
                       'mouthLowerDownRight', 'vrc.blink_Joy', 'あ', 'い', 'お', 'ワ', 'にこり', 'なごみ', 'びっくり',
                       '照れ', '瞳大', 'eyeBlinkLeft', 'eyeBlinkRight', 'mouthFunnel', 'eyeLookInLeft', 'eyeLookInRight',
                       'eyeLookOutLeft', 'eyeLookOutRight'),
        'earrings': 'stud',                  # small gold studs (facial atlas)
        # honey blonde #D8A65F where most of the hair sits in the texture's tone range: warm
        # golden-brown roots and shadows, light honey highlights (warmer and darker than
        # Malfoid's platinum, so the two never read alike). Long, wavy and full like Ginny's
        # (not slimmed), half-up with a black bow, a soft off-centre part.
        # (as rendered the toon shading lifts and saturates the mid tones: the first ramp read
        # marigold, so it sits more tan than the swatch)
        'hair': {'ramp': ((0x5e, 0x40, 0x26), (0x98, 0x70, 0x46), (0xbe, 0x96, 0x62), (0xd0, 0xac, 0x7a), (0xe6, 0xcc, 0xa2)),
                 'flatten': True, 'slim': False, 'part_shift': -0.008, 'half_up': True},
        'ribbon': True,                      # the black ribbon bow where the half-up is gathered
        'ribbon_scale': 1.2,                 # a larger bow than Cho's (atlas back views)
        'tie': ((0x2b, 0x2b, 0x2b), (0xe1, 0xb2, 0x41)),   # black, Hufflepuff gold
        'palette': {
            'mf_robe': ('#1c1c1c', 0.90, 0.0),
            'mf_robe_lining': ('#e1b241', 0.85, 0.0),
            'mf_tie': ('#2b2b2b', 0.75, 0.0),
            'mf_tie_stripe': ('#e1b241', 0.60, 0.0),
            'mf_earring_gold': ('#e0b65c', 0.30, 0.0),     # gold (toon shaded: no metal)
            'mf_ribbon': ('#1e1e1e', 0.75, 0.0),           # black ribbon
        },
        'crest': 'Susan_Crest.png',
        # her clips (combat.EXTRA_CLIPS), built into her model only: her idle and Episkey;
        # Cho's flick (Impedimenta) and sweep (Depulso); the side-step for moving while facing
        'extra_clips': ('susan_idle', 'episkey', 'cast_quick', 'cast_ventus', 'strafe', 'protego'),
    },
    'luna': {
        'name': 'Luna',
        'prefix': 'Luna',
        # skin #FBE7DC: fair, a soft warm undertone
        'skin_warm': 0.45,
        # lavender-blue (facial atlas #9A8FC9, character atlas blue-grey #8EA6BD): the pack's own
        # blue-grey iris art turned a little towards violet and lifted (wide, pale, dreamy eyes)
        # (toon shaded, a 1.25x saturation read a bright violet-blue: kept near the art's own)
        'iris': {'src': 'Eyes_Color2', 'hue': 240.0 / 360.0, 'sat': 1.05, 'val': 1.06},
        'brow': ((0xa8, 0x8a, 0x5e), (0xdc, 0xc6, 0x9c)),  # pale blonde brows: soft, light (atlas)
        'lashes': 'brown',                   # long and natural (atlas: "long, natural")
        'hide_nose_mark': True,
        'scalp': (214, 190, 140),            # pale golden root tone
        # light freckles across the bridge of the nose and the cheeks (atlases): fainter and
        # fewer than Ginny's
        'freckles': {'colour': (0xd6, 0x98, 0x7c), 'count': 90, 'seed': 13, 'size': (3.5, 6.0), 'alpha': (0.20, 0.38)},
        'face_keys': (),                     # the base face as authored: soft and oval (atlas)
        # dreamy and serene: the lids lowered a touch, the outer brows lifted a little (a far-away
        # look), a faint soft smile
        'rest_keys': {'vrc.blink_Straight': 0.14, 'browOuterUpLeft': 0.18, 'browOuterUpRight': 0.18,
                      'mouthSmileLeft': 0.16, 'mouthSmileRight': 0.16},
        'extra_keys': ('Smile1', 'Smile2', 'Shy', 'Sad', 'Teary_Eyes', 'Crying', 'Scared', 'Confused', 'Shocked',
                       'Excited', 'jawOpen', 'mouthUpperUpLeft', 'mouthUpperUpRight', 'mouthLowerDownLeft',
                       'mouthLowerDownRight', 'vrc.blink_Joy', 'あ', 'い', 'お', 'ワ', 'にこり', 'なごみ', 'びっくり',
                       '照れ', '瞳大', 'eyeBlinkLeft', 'eyeBlinkRight', 'mouthFunnel', 'eyeLookInLeft', 'eyeLookInRight',
                       'eyeLookOutLeft', 'eyeLookOutRight', 'eyeLookUpLeft', 'eyeLookUpRight', 'browInnerUp',
                       'browOuterUpLeft', 'browOuterUpRight', 'browDownLeft', 'browDownRight'),
        'earrings': 'radish',                # radish earrings: gold hook, leaves, pink-red root (atlases)
        # pale golden blonde: the atlases' drawn hair is a warm peach-gold (hue ~28 deg, saturation
        # ~0.30, light tones #EDC9A4; the #E8D7B6 swatch is paler than the art), so the ramp is
        # built from those tones (the rendered hue follows the ramp; a first ramp at hue 40 read
        # yellow). Twice as saturated as Malfoid's platinum, so the two never read alike. Long, voluminous and
        # wavy (not slimmed), half-up where her two loose braids meet at the back, with a dusty
        # blue ribbon there; a centre to slightly off-centre part.
        # (lifted a notch after a first render measured value 0.80-0.83 against the art's 0.82-0.96)
        'hair': {'ramp': ((0x94, 0x72, 0x56), (0xd2, 0xaa, 0x88), (0xea, 0xc6, 0xa2), (0xf3, 0xd4, 0xb0), (0xfa, 0xe8, 0xd0)),
                 'flatten': True, 'slim': False, 'part_shift': -0.004, 'half_up': True},
        'ribbon': True,                      # the dusty blue ribbon where the half-up is gathered
        'tie': ((0x2f, 0x4d, 0x96), (0xc7, 0xcc, 0xda)),   # navy blue, silver (character atlas)
        'palette': {
            'mf_robe': ('#1d1d1f', 0.90, 0.0),
            'mf_robe_lining': ('#2f4d96', 0.85, 0.0),
            'mf_tie': ('#2f4d96', 0.75, 0.0),
            'mf_tie_stripe': ('#c7ccda', 0.60, 0.0),
            'mf_sweater': ('#6b6f79', 0.95, 0.0),          # grey vest (character atlas)
            'mf_earring_gold': ('#d7c08a', 0.30, 0.0),     # antique gold hook (toon shaded: no metal)
            'mf_radish': ('#d2456a', 0.55, 0.0),           # pink-red root
            'mf_radish_tip': ('#f6eef0', 0.55, 0.0),       # its white tail
            'mf_radish_leaf': ('#5b9a3c', 0.65, 0.0),      # leaves
            'mf_ribbon': ('#7897d6', 0.75, 0.0),           # dusty blue (facial atlas accessory)
        },
        'crest': 'Luna_Crest.png',
        # her clips (combat.EXTRA_CLIPS), built into her model only: her dreamy idle, her skip (in
        # place of the run), distracted, Illusio and Oppugno; Cho's flick (Confundo), the
        # side-step and quick dodges for her erratic movement, and the Protego pose
        'extra_clips': ('luna_idle', 'luna_skip', 'distracted', 'cast_illusio', 'cast_oppugno', 'cast_quick',
                        'strafe', 'dodge_left', 'dodge_right', 'dodge_back', 'protego'),
    },
}

if CHAR not in PROFILES:
    raise SystemExit('MF_CHAR must be one of %s' % ', '.join(PROFILES))
P = PROFILES[CHAR]
BUILT = os.path.join(ROOT, 'build', 'textures')


def tex(name):
    """path of one of this character's built textures, e.g. tex('Head_BaseColor.png')"""
    return os.path.join(BUILT, P['prefix'] + '_' + name)
