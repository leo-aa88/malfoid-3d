"""Hooks the base mesh's own materials up to Malfoid's texture set.

The original materials are kept (same node setup, same UVs); only the image
each one reads is swapped, and the texture alpha is connected so the lash
and decal cut-outs render as authored (the Unity version relied on lilToon
for that).
"""
import os
import bpy

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
ASSET = os.path.join(ROOT, 'Gumroad_Anime_Female_BaseMesh', 'Gumroad_Anime_Female_BaseMesh', 'Textures', 'PNG')
BUILT = os.path.join(ROOT, 'build', 'textures')
from .character import P, tex  # noqa: E402

IMAGES = {
    'Body_BaseColor.png': tex('Head_BaseColor.png'),
    'Body_All_BaseColor.png': tex('Body_BaseColor.png'),
    'Underwear_BaseColor.png': os.path.join(ASSET, 'Underwear_BaseColor.png'),
    'Tear.png': os.path.join(ASSET, 'Tear.png'),
}
ORIGINAL = {
    'Body_BaseColor.png': os.path.join(ASSET, 'Body_BaseColor.png'),
    'Body_All_BaseColor.png': os.path.join(ASSET, 'Body_All_BaseColor.png'),
}
CUTOUT = ('Body', 'Eye', 'Highlight', 'Alpha', 'Body_All')


def apply(original=False):
    for img in bpy.data.images:
        src = (ORIGINAL.get(img.name) if original else None) or IMAGES.get(img.name)
        if src:
            if not os.path.exists(src):
                raise FileNotFoundError(src + ' (run tools/textures/make_textures.py first)')
            img.filepath = src
            img.reload()
    for name in CUTOUT:
        m = bpy.data.materials.get(name)
        if m is None:
            continue
        nt = m.node_tree
        tex = next(n for n in nt.nodes if n.type == 'TEX_IMAGE')
        bsdf = nt.nodes['Principled BSDF']
        if not bsdf.inputs['Alpha'].links:
            nt.links.new(tex.outputs['Alpha'], bsdf.inputs['Alpha'])
    print('MF textures: %s set' % ('ORIGINAL' if original else P['name']))


def mark_decals(head, parts):
    """Freestyle draws outlines only on the skin; decal cards (lashes, brows,
    irises, highlights, teeth, effects) are excluded."""
    me = head.data
    skin = set(parts['face']) | set(parts['ear_L']) | set(parts['ear_R'])
    for p in me.polygons:
        p.use_freestyle_mark = p.vertices[0] not in skin
