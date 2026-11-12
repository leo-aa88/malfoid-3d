"""Malfoid materials. Colours follow the palette on facial_atlas.png /
blueprint.png. Every material is a plain Principled BSDF so the glTF exporter
reads it directly; the viewer swaps in toon shading at runtime."""
import bpy
import numpy as np

PALETTE = {
    #  name          sRGB hex   rough metal
    'mf_skin':      ('#fde6de', 0.85, 0.0),
    'mf_skin_body': ('#fde6de', 0.85, 0.0),
    'mf_sclera':    ('#f8f8f8', 0.60, 0.0),
    'mf_iris':      ('#2e6b4f', 0.45, 0.0),     # texture is generated below
    'mf_pupil':     ('#0c1c15', 0.45, 0.0),
    'mf_highlight': ('#ffffff', 0.30, 0.0),
    'mf_lash':      ('#1d1715', 0.80, 0.0),
    'mf_brow':      ('#a08462', 0.80, 0.0),
    'mf_lidline':   ('#d79e90', 0.85, 0.0),
    'mf_mouth':     ('#8a3340', 0.80, 0.0),
    'mf_lipline':   ('#7a3f42', 0.85, 0.0),
    'mf_tongue':    ('#e58f95', 0.60, 0.0),
    'mf_teeth':     ('#fffaf5', 0.45, 0.0),
    'mf_hair':      ('#fff3e3', 0.70, 0.0),     # x vertex colour (~0.93) = #F7E5D4
    'mf_hair_dark': ('#d8c0a6', 0.75, 0.0),
    'mf_earring':   ('#1b1b1b', 0.35, 0.8),
    'mf_shirt':        ('#f5f0ef', 0.85, 0.0),
    'mf_sweater':      ('#5c595e', 0.95, 0.0),
    'mf_sweater_trim': ('#4a474c', 0.95, 0.0),
    'mf_tie':          ('#1f5c40', 0.75, 0.0),
    'mf_tie_stripe':   ('#c3c3c6', 0.60, 0.0),
    'mf_skirt':        ('#2e2c30', 0.90, 0.0),
    'mf_skirt_inner':  ('#1e1d20', 0.90, 0.0),
    'mf_sock':         ('#18171a', 0.90, 0.0),
    'mf_shoe':         ('#111012', 0.35, 0.0),
    'mf_robe':         ('#252324', 0.90, 0.0),
    'mf_robe_lining':  ('#1d5a3c', 0.85, 0.0),
    'mf_crest_silver': ('#cfcac0', 0.40, 0.6),
    'mf_crest_green':  ('#226b47', 0.60, 0.0),
    'mf_fx':        ('#ffffff', 1.00, 0.0),     # hidden effect meshes
}

# which head part uses which material
PART_MAT = {
    'face': 'mf_skin', 'ear': 'mf_skin', 'sclera': 'mf_sclera', 'iris': 'mf_iris', 'pupil': 'mf_pupil',
    'highlight': 'mf_highlight', 'lash_upper': 'mf_lash', 'lash_lower': 'mf_lash', 'lash_under': 'mf_lash',
    'lash_tail': 'mf_lash', 'lash_spike': 'mf_fx', 'lash_spike_low': 'mf_fx', 'brow': 'mf_brow',
    'lidline': 'mf_lidline', 'lidshade': 'mf_fx', 'nose_mark': 'mf_fx', 'mouth_inner': 'mf_mouth',
    'lip_line': 'mf_lipline',
    'tongue': 'mf_tongue', 'teeth_upper': 'mf_teeth', 'teeth_lower': 'mf_teeth', 'fx': 'mf_fx',
    'unknown': 'mf_fx',
}


def s2l(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def hex_lin(hx):
    return tuple(s2l(int(hx[i:i + 2], 16) / 255.0) for i in (1, 3, 5))


def iris_image(size=512):
    """Procedural iris: deep green, darker towards the top (lid shadow),
    lighter lower crescent, dark limbal ring, soft pupil."""
    name = 'mf_iris_tex'
    if name in bpy.data.images:
        return bpy.data.images[name]
    y, x = np.mgrid[0:size, 0:size].astype(np.float32)
    u = (x + 0.5) / size * 2 - 1
    v = (y + 0.5) / size * 2 - 1          # +v = up (image rows go bottom->top in Blender)
    r = np.sqrt(u * u + v * v)
    ang = np.arctan2(v, u)

    def sm(a, b, t):
        t = np.clip((t - a) / (b - a), 0, 1)
        return t * t * (3 - 2 * t)

    deep = np.array([0.090, 0.270, 0.190])     # sRGB-ish working values
    mid = np.array([0.180, 0.420, 0.310])      # #2E6B4F
    light = np.array([0.400, 0.760, 0.560])
    rim = np.array([0.040, 0.120, 0.085])
    pupil = np.array([0.025, 0.060, 0.045])
    t_v = sm(-0.75, 0.55, -v)[..., None]       # 0 at top .. 1 at bottom
    col = deep * (1 - t_v) + mid * t_v
    cres = (sm(0.15, 0.80, -v) * sm(0.95, 0.45, r))[..., None]
    col = col * (1 - 0.75 * cres) + light * 0.75 * cres
    streak = (0.5 + 0.5 * np.sin(ang * 46.0 + np.sin(ang * 7.0) * 2.0)) * sm(0.30, 0.55, r) * sm(0.92, 0.6, r)
    col = col * (1.0 - 0.10 * streak[..., None])
    ring = sm(0.80, 0.93, r)[..., None]
    col = col * (1 - ring) + rim * ring
    pm = sm(0.36, 0.30, r)[..., None]
    col = col * (1 - pm) + pupil * pm
    halo = (sm(0.50, 0.36, r) * (1 - sm(0.36, 0.30, r)))[..., None]
    col = col * (1 - 0.35 * halo) + deep * 0.35 * halo
    shadow = sm(0.25, 0.95, v)[..., None]        # upper-lid shadow
    col = col * (1 - 0.45 * shadow)
    rgba = np.concatenate([np.clip(col, 0, 1), np.ones((size, size, 1), np.float32)], axis=2)
    img = bpy.data.images.new(name, size, size, alpha=False)
    img.colorspace_settings.name = 'sRGB'
    img.pixels.foreach_set(rgba.astype(np.float32).ravel())
    img.pack()
    return img


def make():
    mats = {}
    for name, (hx, rough, metal) in PALETTE.items():
        m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
        m.use_nodes = True
        nt = m.node_tree
        nt.nodes.clear()
        out = nt.nodes.new('ShaderNodeOutputMaterial')
        bsdf = nt.nodes.new('ShaderNodeBsdfPrincipled')
        bsdf.name = 'Principled BSDF'
        lin = hex_lin(hx)
        bsdf.inputs['Base Color'].default_value = (*lin, 1.0)
        bsdf.inputs['Roughness'].default_value = rough
        bsdf.inputs['Metallic'].default_value = metal
        nt.links.new(bsdf.outputs[0], out.inputs[0])
        m.diffuse_color = (*lin, 1.0)
        if name == 'mf_iris':
            tex = nt.nodes.new('ShaderNodeTexImage')
            tex.name = 'IrisTex'
            tex.image = iris_image()
            tex.extension = 'EXTEND'
            nt.links.new(tex.outputs['Color'], bsdf.inputs['Base Color'])
        if name in ('mf_hair', 'mf_hair_dark'):
            ca = nt.nodes.new('ShaderNodeVertexColor')
            ca.layer_name = 'Col'
            mul = nt.nodes.new('ShaderNodeMix')
            mul.data_type = 'RGBA'
            mul.blend_type = 'MULTIPLY'
            mul.inputs['Factor'].default_value = 1.0
            mul.inputs['A'].default_value = (*lin, 1.0)
            nt.links.new(ca.outputs['Color'], mul.inputs['B'])
            nt.links.new(mul.outputs['Result'], bsdf.inputs['Base Color'])
        if name == 'mf_fx':
            bsdf.inputs['Alpha'].default_value = 0.0
            m.blend_method = 'BLEND'
        mats[name] = m
    return mats


def assign(head, parts, fparts, mats):
    """rebuild the head's material slots from the part classification"""
    me = head.data
    part_of_vert = {}
    for name, ids in parts.items():
        for i in ids:
            part_of_vert[i] = name
    order = list(PALETTE.keys())
    me.materials.clear()
    for n in order:
        me.materials.append(mats[n])
    slot = {n: i for i, n in enumerate(order)}
    fpart = {}
    for name, ids in fparts.items():
        for i in ids:
            fpart[i] = name
    for p in me.polygons:
        name = fpart.get(p.index) or part_of_vert[p.vertices[0]]
        base = name[:-2] if name.endswith(('_L', '_R')) else name
        p.material_index = slot[PART_MAT[base]]
        p.use_freestyle_mark = PART_MAT[base] == 'mf_fx'
    # planar UVs for the iris discs so the generated texture fits them
    uv = me.uv_layers['UVMap'].data
    for side in ('_L', '_R'):
        ids = set(parts['iris' + side])
        co = [me.vertices[i].co for i in ids]
        cx = (min(c.x for c in co) + max(c.x for c in co)) / 2
        cz = (min(c.z for c in co) + max(c.z for c in co)) / 2
        rx = (max(c.x for c in co) - min(c.x for c in co)) / 2
        rz = (max(c.z for c in co) - min(c.z for c in co)) / 2
        for p in me.polygons:
            if p.vertices[0] in ids:
                for li in p.loop_indices:
                    c = me.vertices[me.loops[li].vertex_index].co
                    uv[li].uv = (0.5 + 0.5 * (c.x - cx) / rx, 0.5 + 0.5 * (c.z - cz) / rz)
