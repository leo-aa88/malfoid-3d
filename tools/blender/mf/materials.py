"""Material palette (sRGB hex sampled from blueprint.png's colour palette)."""
import bpy

PALETTE = {
    #  name            hex        rough  metal
    'skin':          ('#fbe2d6', 0.85, 0.0),
    'skin_line':     ('#dfa594', 0.85, 0.0),
    'hair':          ('#f6e2cb', 0.70, 0.0),
    'brow':          ('#94734f', 0.80, 0.0),
    'lash':          ('#2a1f1c', 0.80, 0.0),
    'eye_white':     ('#ffffff', 0.60, 0.0),
    'eye_iris':      ('#ffffff', 0.50, 0.0),
    'eye_highlight': ('#ffffff', 0.30, 0.0),
    'mouth':         ('#7c2c34', 0.80, 0.0),
    'teeth':         ('#fffaf4', 0.50, 0.0),
    'earring':       ('#1b1b1d', 0.35, 0.8),
    'shirt':         ('#f5eced', 0.85, 0.0),
    'sweater':       ('#5f5c61', 0.95, 0.0),
    'sweater_trim':  ('#4d4a4f', 0.95, 0.0),
    'tie':           ('#2a5d45', 0.75, 0.0),
    'tie_stripe':    ('#b8b8bc', 0.60, 0.0),
    'skirt':         ('#302e32', 0.90, 0.0),
    'skirt_inner':   ('#1f1e21', 0.90, 0.0),
    'shorts':        ('#232226', 0.90, 0.0),
    'sock':          ('#19181a', 0.90, 0.0),
    'shoe':          ('#131214', 0.35, 0.0),
    'shoe_sole':     ('#0c0c0d', 0.70, 0.0),
    'robe':          ('#2b2929', 0.90, 0.0),
    'robe_lining':   ('#255039', 0.85, 0.0),
    'crest_silver':  ('#c8c6c0', 0.40, 0.6),
    'crest_green':   ('#2a6a4b', 0.60, 0.0),
}


def srgb_to_linear(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def make_materials():
    mats = {}
    for name, (hx, rough, metal) in PALETTE.items():
        r, g, b = [int(hx[i:i + 2], 16) / 255.0 for i in (1, 3, 5)]
        lin = (srgb_to_linear(r), srgb_to_linear(g), srgb_to_linear(b), 1.0)
        m = bpy.data.materials.new(name)
        m.use_nodes = True
        bsdf = m.node_tree.nodes.get('Principled BSDF')
        bsdf.inputs['Base Color'].default_value = lin
        bsdf.inputs['Roughness'].default_value = rough
        bsdf.inputs['Metallic'].default_value = metal
        if 'Specular' in bsdf.inputs:
            bsdf.inputs['Specular'].default_value = 0.2
        m.diffuse_color = lin
        m.roughness = rough
        m.metallic = metal
        mats[name] = m
    return mats
