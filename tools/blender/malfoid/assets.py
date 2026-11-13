"""Integration of the purchased hair (Bell_Hair_01) and uniform packs.

Both assets are used as authored: topology, UVs and part structure are
kept. The hair is placed with one uniform scale + offset found by measuring
the gap between Malfoid's skull and the hair's inner surface; the uniform is
mapped onto her body by a smooth slice-wise fit (heights by landmarks,
cross-sections scaled to her body plus a clearance), sleeves are rotated from
the pack's A-pose to her T-pose, then a small push-out removes residual
intersections. Skin weights come from her body; the hair keeps its own
physics chains as secondary bones.
"""
import math
import os
from math import sin, cos, radians
import bmesh
import bpy
import numpy as np
from mathutils import Vector, Matrix
from mathutils.bvhtree import BVHTree
from mathutils.kdtree import KDTree
from .meshutil import sstep, lerp

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
HAIR_BLEND = os.path.join(ROOT, 'Bell_Hair_01', 'Bell_Hair_01.blend')
HAIR_PNG = os.path.join(ROOT, 'Bell_Hair_01', 'PNG')
UNIFORM_BLEND = os.path.join(ROOT, 'Girls+Hogwarts+Uniform+Harry+Potter+Uniform+Slytherin+BLEND',
                             'Girls Hogwarts Uniform Harry Potter Uniform Gryffindor.blend')
BUILT = os.path.join(ROOT, 'build', 'textures')

from .character import P as PROFILE, tex  # noqa: E402
HAIR_BONES = []          # (name, head, tail, parent) for rig2.create, filled by import_hair


# ============================================================== utilities
def _append(path, names):
    with bpy.data.libraries.load(path, link=False) as (src, dst):
        dst.objects = [n for n in src.objects if n in names]
    out = []
    for ob in dst.objects:
        bpy.context.scene.collection.objects.link(ob)
        out.append(ob)
    bpy.context.view_layer.update()          # evaluate matrix_world of the appended objects
    return out


def _bvh_world(ob, depsgraph=None, verts=None):
    if verts is None:
        me = ob.data
        M = ob.matrix_world
        verts = [M @ v.co for v in me.vertices]
    return BVHTree.FromPolygons(verts, [tuple(p.vertices) for p in ob.data.polygons])


def _load_px(path):
    """image -> float array (H, W, 4), row 0 = bottom (Blender/UV order)"""
    img = bpy.data.images.load(path, check_existing=False)
    img.colorspace_settings.name = 'Non-Color'          # raw stored values
    w, h = img.size
    px = np.empty(w * h * 4, np.float32)
    img.pixels.foreach_get(px)
    bpy.data.images.remove(img)
    return px.reshape(h, w, 4)


def _save_png(arr, path, name):
    """float array (H, W, 4) in 0..1, row 0 = bottom -> PNG"""
    h, w = arr.shape[:2]
    img = bpy.data.images.get(name) or bpy.data.images.new(name, w, h, alpha=True)
    if tuple(img.size) != (w, h):
        img.scale(w, h)
    img.colorspace_settings.name = 'Non-Color'          # write values as given (already sRGB-encoded)
    img.pixels.foreach_set(np.ascontiguousarray(arr, np.float32).ravel())
    img.filepath_raw = path
    img.file_format = 'PNG'
    img.save()
    return img


# ============================================================== hair
def _hair_texture():
    """Platinum-blonde base colour from the pack's neutral (grey) 'Soft'
    variant: its value structure (root shadow, strand detail, highlights) is
    kept and mapped onto a platinum ramp; the pack's alpha map goes into the
    alpha channel so the cards cut out in glTF."""
    os.makedirs(BUILT, exist_ok=True)
    out = tex('Hair_BaseColor.png')
    g = _load_px(os.path.join(HAIR_PNG, 'Bell_Color_Soft', 'Bell_Hair_Grey.png'))[..., 0]
    a = _load_px(os.path.join(HAIR_PNG, 'Bell_Hair_Alpha_Soft.png'))[..., 0]
    lo, hi = np.percentile(g, 3), np.percentile(g, 97)
    t = np.clip((g - lo) / max(hi - lo, 1e-3), 0, 1)
    ramp_t = [0.0, 0.35, 0.7, 0.92, 1.0]
    # top of the ramp at the atlas platinum (#F7E5D4) instead of near-white: the pack's
    # highlight bands (and the top of one strip, used on the crown) are cut into straight-edged
    # sections by the cards and showed as pale white blocks
    ramp_c = np.array(PROFILE['hair']['ramp'], np.float32)
    # the loaded pixels are linear floats; build the ramp in sRGB and convert
    rgb = np.stack([np.interp(t, ramp_t, ramp_c[:, c]) for c in range(3)], -1) / 255.0
    img = np.concatenate([rgb, a[..., None]], -1)
    _save_png(img, out, 'mf_hair_png')
    return out


def _hair_material():
    m = bpy.data.materials.get('mf_hair_tex') or bpy.data.materials.new('mf_hair_tex')
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    o = nt.nodes.new('ShaderNodeOutputMaterial')
    b = nt.nodes.new('ShaderNodeBsdfPrincipled')
    b.name = 'Principled BSDF'
    t = nt.nodes.new('ShaderNodeTexImage')
    path = _hair_texture()
    t.image = bpy.data.images.load(path, check_existing=False)
    t.image.name = PROFILE['prefix'] + '_Hair_BaseColor'
    t.image.colorspace_settings.name = 'sRGB'
    t.image.alpha_mode = 'STRAIGHT'
    nt.links.new(t.outputs['Color'], b.inputs['Base Color'])
    nt.links.new(t.outputs['Alpha'], b.inputs['Alpha'])
    nt.links.new(b.outputs[0], o.inputs[0])
    b.inputs['Roughness'].default_value = 0.6
    try:
        m.surface_render_method = 'DITHERED'
    except AttributeError:
        m.blend_method = 'CLIP'
    m.use_backface_culling = False
    return m


def _fit_hair(hair_bvh, skull_bvh, centre):
    """Find scale s and offset t (hair-space -> world) so the hair's inner
    surface sits snugly outside the skull over the area the hair covers."""
    dirs = []
    for e in range(10, 90, 8):
        for a in range(0, 360, 15):
            az = a if a <= 180 else a - 360
            if abs(az) < 60 and e < 34:          # forehead/face: the fringe hangs free there
                continue
            er, ar = radians(e), radians(az)
            dirs.append(Vector((sin(ar) * cos(er), -cos(ar) * cos(er), sin(er))))
    dirs.append(Vector((0, 0, 1)))
    skull_d = []
    for d in dirs:
        hit = skull_bvh.ray_cast(centre + d * 0.4, -d)
        skull_d.append((hit[0] - centre).length if hit[0] is not None else 0.09)

    def score(s, ty, tz, kx=1.0):
        t = Vector((0.0, ty, tz))
        S = Vector((s * kx, s, s))
        o = Vector([(centre[i] - t[i]) / S[i] for i in range(3)])
        gaps = []
        for d, sd in zip(dirs, skull_d):
            dl = Vector([d[i] / S[i] for i in range(3)]).normalized()
            hit = hair_bvh.ray_cast(o, dl, 1.0)
            if hit[0] is None:
                continue
            w = Vector([hit[0][i] * S[i] + t[i] for i in range(3)])
            gaps.append((w - centre).length - sd)
        if len(gaps) < len(dirs) * 0.6:
            return 1e9, None
        g = np.array(gaps)
        pen = np.clip(0.0035 - g, 0, None)
        return float(np.mean(np.clip(g, 0, 0.05)) + 60.0 * np.sum(pen ** 1.0) / len(g)), g

    best = (1e9, None)
    for s in np.arange(0.70, 1.10, 0.02):
        for ty in np.arange(-0.04, 0.061, 0.01):
            for tz in np.arange(1.22, 1.42, 0.01):
                sc, _ = score(s, ty, tz)
                if sc < best[0]:
                    best = (sc, (s, ty, tz))
    s0, ty0, tz0 = best[1]
    for s in np.arange(s0 - 0.02, s0 + 0.021, 0.004):
        for ty in np.arange(ty0 - 0.01, ty0 + 0.011, 0.002):
            for tz in np.arange(tz0 - 0.01, tz0 + 0.011, 0.002):
                sc, _ = score(s, ty, tz)
                if sc < best[0]:
                    best = (sc, (s, ty, tz))
    s, ty, tz = best[1]
    best = (best[0], (s, ty, tz, 1.0))
    for kx in (1.03, 1.06, 1.09, 1.12):
        for ds in (-0.02, -0.01, 0.0):
            sc, _ = score(s + ds, ty, tz, kx)
            if sc < best[0]:
                best = (sc, (s + ds, ty, tz, kx))
    s, ty, tz, kx = best[1]
    _, g = score(s, ty, tz, kx)
    print('MF hair fit: scale %.3f (x %.2f) offset (0, %.3f, %.3f); gap min %.1f mm, median %.1f mm, max %.1f mm over %d rays'
          % (s, kx, ty, tz, g.min() * 1000, np.median(g) * 1000, g.max() * 1000, len(g)))
    return s, kx, Vector((0.0, ty, tz))


def import_hair(head, parts):
    """Bell_Hair_01 -> object 'Hair' fitted to the head, weights renamed for
    rig2 (its head bones merge into 'head', physics chains become hair_* bones)."""
    hair_ob, arm = None, None
    for ob in _append(HAIR_BLEND, ('Bell_Hair_01', 'Armature')):
        if ob.type == 'MESH':
            hair_ob = ob
        else:
            arm = ob
    dg = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(hair_ob.evaluated_get(dg), preserve_all_data_layers=True, depsgraph=dg)
    me.name = 'Hair'
    me.transform(hair_ob.matrix_world)                       # hair space, metres, Z up, -Y front
    skull = _bvh_world(head) if parts is None else None
    if parts is not None:
        face = set(parts['face'])
        hm = head.data
        remap = {v: i for i, v in enumerate(parts['face'])}
        skull = BVHTree.FromPolygons([hm.vertices[i].co.copy() for i in parts['face']],
                                     [[remap[v] for v in p.vertices] for p in hm.polygons if p.vertices[0] in face])
    hair_bvh = BVHTree.FromPolygons([v.co.copy() for v in me.vertices], [tuple(p.vertices) for p in me.polygons])
    centre = Vector((0.0, 0.02, 1.43))
    s, kx, t = _fit_hair(hair_bvh, skull, centre)
    F = Matrix.Translation(t) @ Matrix.Diagonal((s * kx, s, s, 1.0))
    me.transform(F)
    # bones (rest = displayed pose)
    A = arm.matrix_world
    HAIR_BONES.clear()
    rename = {}
    for b in arm.data.bones:
        if not b.name.startswith('Hair_Physics'):
            rename[b.name] = 'head.x'
            continue
        nm = 'hair_' + b.name[len('Hair_Physics_'):]
        rename[b.name] = nm
        parent = b.parent.name if b.parent else None
        pname = 'head' if (parent is None or not parent.startswith('Hair_Physics')) else \
            'hair_' + parent[len('Hair_Physics_'):]
        HAIR_BONES.append((nm, F @ (A @ b.head_local), F @ (A @ b.tail_local), pname))
    ob = bpy.data.objects.new('Hair', me)
    bpy.context.scene.collection.objects.link(ob)
    # vertex groups: same order as the source so the stored weights stay valid
    for g in hair_ob.vertex_groups:
        ob.vertex_groups.new(name='src_' + g.name)
    merged = {}
    for v in me.vertices:
        acc = {}
        for gr in v.groups:
            src = hair_ob.vertex_groups[gr.group].name
            acc[rename[src]] = acc.get(rename[src], 0.0) + gr.weight
        merged[v.index] = acc
    for g in list(ob.vertex_groups):
        ob.vertex_groups.remove(g)
    groups = {}
    for vi, acc in merged.items():
        tot = sum(acc.values()) or 1.0
        for nm, w in acc.items():
            vg = groups.get(nm) or ob.vertex_groups.new(name=nm)
            groups[nm] = vg
            vg.add([vi], w / tot, 'REPLACE')
    me.materials.clear()
    me.materials.append(_hair_material())
    for p in me.polygons:
        p.material_index = 0
    rig = bpy.data.objects.get('rig')
    if rig is not None:
        ob.parent = rig
        mod = ob.modifiers.new('rig', 'ARMATURE')
        mod.object = rig
    for o in (hair_ob, arm):
        bpy.data.objects.remove(o, do_unlink=True)
    shrinkwrap_cap(me, skull, centre)
    if PROFILE['hair']['flatten']:
        flatten_crown(me, skull, centre)
    if PROFILE['hair']['slim']:
        slim_hair(me)
    if PROFILE['hair']['part_shift']:
        shift_part(me, PROFILE['hair']['part_shift'])
    if PROFILE['hair']['half_up']:
        half_up(me, skull, centre)
    HAIR_BONES[:] = [(n, slim_point(h), slim_point(t), par) for n, h, t, par in HAIR_BONES]
    _hair_clearance(ob, skull, centre)
    if parts is not None:
        hm = head.data
        ears = []
        for side in ('ear_L', 'ear_R'):
            vs = [hm.vertices[i].co for i in parts[side]]
            ears.append(sum(vs, Vector()) / len(vs))
        tuck_behind_ears(ob, ears)
        _hair_clearance(ob, skull, centre)
    print('MF hair: %d verts, %d faces, %d secondary bones' % (len(me.vertices), len(me.polygons), len(HAIR_BONES)))
    return ob


# the pack's hair stands far out at the sides (eye level 14.9 cm from the centre line,
# 17.5-18 cm from the jaw down: nearly as wide as her shoulders). The atlas has it falling
# close to the face: hair beyond SLIM_X keeps only SLIM_K of its excess width.
SLIM_X = 0.088          # m from the centre line (just outside the head and ears)
SLIM_K = 0.5


def slim_point(p):
    """hair point pulled in towards the centre line (sides only; the crown and the part
    are left alone, the long hair below the chest eases back towards its own fullness)"""
    ax = abs(p.x)
    if ax <= SLIM_X:
        return p.copy()
    w = 1.0 - sstep(1.42, 1.47, p.z)                         # nothing above the brow line
    k = 1.0 - (1.0 - SLIM_K) * w
    k = k + (1.0 - k) * 0.3 * sstep(1.20, 1.00, p.z)        # fuller again at the ends
    x = SLIM_X + (ax - SLIM_X) * k
    return Vector((x if p.x > 0 else -x, p.y, p.z))


def flatten_crown(me, skull, centre, gap=0.004, keep=0.5):
    """The atlas has the hair lying flat on top of the head. shrinkwrap_cap pulls the
    innermost layer onto the skull but keeps the layers stacked on it, so the crown stood
    high and the straight-cut card ends stuck up along it. Above the brow line the stack
    is halved (radially, towards the skull)."""
    n, worst = 0, 0.0
    for v in me.vertices:
        p = v.co
        w = sstep(1.44, 1.50, p.z)
        if w <= 0:
            continue
        d = p - centre
        if d.length < 1e-6:
            continue
        dn = d.normalized()
        hit = skull.ray_cast(centre + dn * 0.4, -dn)
        if hit[0] is None:
            continue
        rs = (hit[0] - centre).length
        excess = d.length - rs - gap
        if excess <= 0:
            continue
        cut = excess * (1.0 - keep) * w
        v.co = p - dn * cut
        n += 1
        worst = max(worst, cut)
    print('MF hair: %d crown verts flattened towards the skull (max %.1f mm)' % (n, worst * 1000))


def shift_part(me, dx):
    """move the parting off-centre: the top front of the hair slides sideways (a smooth
    shear that fades out over the crown and down the sides); the clearance pass afterwards
    keeps every strand outside the skull"""
    n = 0
    for v in me.vertices:
        p = v.co
        # only the front hairline (where the part shows): shifting the crown uncovered the scalp
        w = sstep(1.44, 1.50, p.z) * (1.0 - sstep(-0.06, -0.02, p.y)) * (1.0 - sstep(0.04, 0.09, abs(p.x)))
        if w > 0:
            p.x += dx * w
            n += 1
    print('MF hair: parting moved %.1f mm (%d verts)' % (dx * 1000, n))


HALF_UP_Z = 1.425        # height of the gather at the back of the head (m)
HALF_UP_BACK = 0.012     # the gathered hair sits this far behind the skull


def _islands(me):
    import bmesh as _bm
    bm = _bm.new()
    bm.from_mesh(me)
    bm.verts.ensure_lookup_table()
    seen, out = set(), []
    for v in bm.verts:
        if v.index in seen:
            continue
        stack, comp = [v], []
        seen.add(v.index)
        while stack:
            u = stack.pop()
            comp.append(u.index)
            for e in u.link_edges:
                w = e.other_vert(u)
                if w.index not in seen:
                    seen.add(w.index)
                    stack.append(w)
        out.append(comp)
    bm.free()
    return out


def half_up(me, skull, centre):
    """Ginny's half-up (blueprint / facial atlas back views): the upper section of the hair
    is gathered at the back of the head and falls as a tail over the loose lower hair (no
    hair tie prop). The purchased hair cards are reshaped, not replaced:
    - long back cards whose strand lies on the outside at the gather height (the upper
      layer) converge on the gather and fall from it as a narrower tail;
    - the face-framing front locks and the lower layer stay loose.
    Returns the gather point (world, rest pose)."""
    co = [v.co.copy() for v in me.vertices]
    yb = None
    hit = skull.ray_cast(Vector((0.0, 0.6, HALF_UP_Z)), Vector((0.0, -1.0, 0.0)), 1.0)
    yb = (hit[0].y if hit[0] is not None else 0.085) + HALF_UP_BACK
    tie = Vector((0.0, yb, HALF_UP_Z))
    # 1. classify the long back cards by how far out they lie at the tie height
    back = []
    for comp in _islands(me):
        cs = [co[i] for i in comp]
        top = max(c.z for c in cs)
        bot = min(cs, key=lambda c: c.z)
        if top < 1.46 or bot.z > 1.30 or bot.y < 0.05:
            continue                                       # crown caps, front locks
        band = [c for c in cs if abs(c.z - HALF_UP_Z) < 0.03]
        if not band:
            continue
        out = sum((c - centre).length for c in band) / len(band)
        back.append((out, comp))
    back.sort(key=lambda t: -t[0])
    upper = back[:max(1, int(len(back) * 0.5))]
    moved = 0
    for _, comp in upper:
        for i in comp:
            p = co[i]
            if p.z >= HALF_UP_Z:
                # from the crown down to the tie: converge on the gather line behind the head
                # a gradual sweep towards the gather from high up (a sharp turn left a notch in
                # the profile), pulled in part of the way so the head stays covered
                w = sstep(1.53, HALF_UP_Z, p.z) ** 1.3
                q = Vector((p.x * (1.0 - 0.35 * w), max(p.y, yb * w + p.y * (1 - w)), p.z))
            else:
                # below the tie: a tail, narrow at the tie and spreading a little lower down,
                # lying on top of the loose hair
                d = HALF_UP_Z - p.z
                k = 0.68 + 0.25 * sstep(0.0, 0.30, d)
                # (the offset that lays it over the loose hair ramps in: a jump at the gather
                # left a V-shaped slit in the profile)
                q = Vector((p.x * k, max(p.y, yb * (1.0 - sstep(0.0, 0.12, d)) + p.y * sstep(0.0, 0.12, d)), p.z))
            me.vertices[i].co = q
            moved += 1
    print('MF hair: half-up: %d of %d back cards gathered (%d verts) at %s'
          % (len(upper), len(back), moved, tuple(round(c, 3) for c in tie)))
    return tie


def slim_hair(me):
    n = 0
    for v in me.vertices:
        q = slim_point(v.co)
        if q.x != v.co.x:
            v.co = q
            n += 1
    print('MF hair: %d verts slimmed towards the face' % n)


def _hair_clearance(ob, skull, centre, margin=0.0015, radius=0.025):
    """Hair that ended up inside the head is pushed out radially; the push
    spreads smoothly to neighbouring hair so cards bend instead of tearing."""
    me = ob.data
    co = [v.co.copy() for v in me.vertices]
    need = {}
    for i, p in enumerate(co):
        d = p - centre
        if d.length < 1e-6:
            continue
        dn = d.normalized()
        hit = skull.ray_cast(centre + dn * 0.4, -dn)
        if hit[0] is None:
            continue
        r_skin = (hit[0] - centre).length
        if d.length < r_skin + margin:
            need[i] = r_skin + margin - d.length
    kd = KDTree(len(co))
    for i, p in enumerate(co):
        kd.insert(p, i)
    kd.balance()
    push = np.zeros(len(co))
    for i, n in need.items():
        for _, j, dist in kd.find_range(co[i], radius):
            push[j] = max(push[j], n * (1 - dist / radius) ** 2)
        push[i] = max(push[i], n)
    for i in np.where(push > 0)[0]:
        dn = (co[i] - centre).normalized()
        me.vertices[i].co = co[i] + dn * push[i]
    print('MF hair clearance: %d verts inside the head (max %.1f mm); %d verts eased outwards'
          % (len(need), max(need.values(), default=0) * 1000, int((push > 0).sum())))


def shrinkwrap_cap(me, skull, centre, gap=0.0040, z_full=1.40, z_free=1.29):
    """Pull the crown of the hair in onto her skull. For every direction from
    the head centre the gap between the skull and the innermost hair layer is
    measured; all hair along that direction moves in by the excess gap, so the
    strand layering is preserved. Full effect above z_full, none below z_free
    (the hanging hair keeps its authored fall)."""
    hair_bvh = BVHTree.FromPolygons([v.co.copy() for v in me.vertices], [tuple(p.vertices) for p in me.polygons])
    na, ne = 72, 37
    G = np.full((ne, na), np.nan)
    for i in range(ne):
        el = radians(-60 + 150 * i / (ne - 1))
        for j in range(na):
            az = radians(-180 + 360 * j / na)
            d = Vector((sin(az) * cos(el), -cos(az) * cos(el), sin(el)))
            hs = skull.ray_cast(centre + d * 0.4, -d)
            hh = hair_bvh.ray_cast(centre, d, 0.4)
            if hs[0] is None or hh[0] is None:
                continue
            G[i, j] = hh[3] - (hs[0] - centre).length
    # fill holes (face opening) with 0, then smooth around the sphere
    G = np.where(np.isnan(G), 0.0, G)
    G = np.clip(G - gap, 0.0, 0.08)
    from math import exp
    k = np.array([exp(-0.5 * (t / 1.6) ** 2) for t in range(-4, 5)])
    k /= k.sum()
    for _ in range(2):
        G = np.array([np.convolve(np.r_[r[-4:], r, r[:4]], k, 'valid') for r in G])
        G = np.array([np.convolve(np.r_[[c[0]] * 4, c, [c[-1]] * 4], k, 'valid') for c in G.T]).T
    moved = 0
    worst = 0.0
    for v in me.vertices:
        p = v.co
        # front and sides (fringe, locks beside the face) are drawn in down to the
        # jaw; the long hair at the back keeps its authored fall
        d = p - centre
        az_v = abs(math.degrees(math.atan2(d.x, -d.y)))
        front = 1.0 - sstep(38.0, 62.0, az_v)
        w = max(sstep(z_free, z_full, p.z), front * sstep(1.25, 1.35, p.z))
        if w <= 0:
            continue
        if d.length < 1e-6:
            continue
        dn = d.normalized()
        el = math.degrees(math.asin(max(-1.0, min(1.0, dn.z))))
        az = math.degrees(math.atan2(dn.x, -dn.y))
        fi = (el + 60) / 150 * (ne - 1)
        fj = (az + 180) / 360 * na
        i0 = int(np.clip(np.floor(fi), 0, ne - 2))
        ti = float(np.clip(fi - i0, 0, 1))
        j0 = int(np.floor(fj)) % na
        tj = fj - np.floor(fj)
        j1 = (j0 + 1) % na
        g = ((1 - ti) * ((1 - tj) * G[i0, j0] + tj * G[i0, j1]) + ti * ((1 - tj) * G[i0 + 1, j0] + tj * G[i0 + 1, j1]))
        if g > 0:
            v.co = p - dn * (g * w)
            moved += 1
            worst = max(worst, g * w)
    print('MF hair shrink-wrap: %d verts pulled in towards the skull (max %.1f mm)' % (moved, worst * 1000))


def tuck_behind_ears(ob, ears):
    """Side locks that fall over the ears are moved behind them (smooth
    falloff), so the ears and the hoop earrings stay visible."""
    me = ob.data
    moved = 0
    for v in me.vertices:
        p = v.co
        for e in ears:
            sg = 1.0 if e.x > 0 else -1.0
            if p.x * sg < 0.045:
                continue
            dz = p.z - e.z
            wz = math.exp(-(dz / 0.045) ** 2) if dz < 0 else math.exp(-(dz / 0.035) ** 2)
            wx = sstep(0.045, 0.07, p.x * sg)
            target_y = e.y + 0.030                    # just behind the ear
            if p.y >= target_y or wz * wx < 0.02:
                continue
            w = wz * wx * sstep(e.y - 0.09, e.y - 0.02, p.y) if p.y < e.y - 0.02 else wz * wx
            # locks in front of the face (well forward of the ear) stay where they are
            if p.y < e.y - 0.06:
                continue
            p.y = p.y + (target_y - p.y) * w
            p.x = p.x + sg * 0.006 * w                # a little out, around the ear
            moved += 1
    print('MF hair: %d verts tucked behind the ears' % moved)


# ============================================================== uniform
CLASS_MAT = {
    'shirt': 'mf_shirt', 'sleeve': 'mf_shirt', 'collar': 'mf_shirt', 'button': 'mf_shirt', 'placket': 'mf_shirt',
    'vest': 'mf_sweater', 'vest_rib': 'mf_sweater_trim', 'tie': 'mf_tie', 'skirt': 'mf_skirt',
    'skirt_band': 'mf_skirt', 'socks': 'mf_sock',
}
OBJECT_OF = {
    'shirt': 'Shirt', 'sleeve': 'Shirt', 'collar': 'Shirt', 'button': 'Shirt', 'placket': 'Shirt',
    'vest': 'Vest', 'vest_rib': 'Vest', 'tie': 'Tie', 'skirt': 'Skirt', 'skirt_band': 'Skirt', 'socks': 'Socks',
}
# minimum distance outside the body skin after fitting (metres)
SKIRT_TOP_Z = 0.995       # top of the skirt waistband (fitted)
SKIRT_FLARE = 0.45        # fraction of the pack's skirt flare that is kept
CLEAR = {'shirt': 0.0030, 'sleeve': 0.0035, 'collar': 0.0030, 'button': 0.0045, 'placket': 0.0040,
         'vest': 0.0078, 'vest_rib': 0.0070, 'tie': 0.0035, 'skirt': 0.0050, 'skirt_band': 0.0050,
         'socks': 0.0018, 'drop': 0.003}


def classify_part(mn, mx, n):
    from .uniform_parts import classify
    c = classify(mn, mx, n)
    small = max(mx.x - mn.x, mx.y - mn.y, mx.z - mn.z) < 2.0
    if small and n <= 30 and c not in ('socks', 'skirt'):
        return 'drop'                        # buttons: hidden by vest/robe, only showed as outline marks
    if mx.z < 90 and c in ('torso', 'button', 'placket'):
        return 'skirt'                       # small pieces along the skirt hem
    if c in ('sleeve', 'button') and n <= 160 and abs((mn.x + mx.x) / 2) > 42:
        return 'drop'                        # cuff flap / buttons at the wrist (poke out of the robe sleeve)
    if c in ('placket', 'button'):
        return 'drop'                        # front button strip: hidden by vest and tie, only peeks out beside the tie
    if c == 'tie' and mn.z < 100:
        return 'drop'                        # the tie's narrow back blade (only showed as a second, split blade)
    if c == 'collar' and (mx.x - mn.x) < 5.0 and mn.y < -4.5:
        return 'tie'                         # the pack's own tie knot
    if c == 'torso':
        return 'shirt' if mn.z < 100 else 'vest'
    if c == 'band':
        return 'vest_rib' if mx.z > 109 else 'skirt_band'
    return c


def _uniform_source():
    obs = _append(UNIFORM_BLEND, ('Gryffindor_Girls_Hogwarts_Uniform_Harry_Potter_Uniform',))
    src = obs[0]
    from .uniform_parts import loose_parts
    comps = loose_parts(src)
    me = src.data
    M = src.matrix_world
    co = np.array([tuple(M @ v.co) for v in me.vertices], np.float64)      # cm, world (Z up, -Y front)
    cls = np.empty(len(co), dtype=object)
    for comp, mn, mx in comps:
        c = classify_part(mn, mx, len(comp))
        cls[comp] = c
    # The pack models most panels twice (an outer and an inner layer ~1 mm
    # apart). After fitting they cross and z-fight (dark blotches), so only
    # the outer layer (larger surface area) of each pair is kept.
    comp_of = np.empty(len(co), dtype=np.int64)
    for k, (comp, mn, mx) in enumerate(comps):
        comp_of[comp] = k
    area = np.zeros(len(comps))
    for p in me.polygons:
        area[comp_of[p.vertices[0]]] += p.area
    byn = {}
    for k, (comp, mn, mx) in enumerate(comps):
        byn.setdefault(len(comp), []).append(k)
    used, dropped = set(), 0
    for ids in byn.values():
        for a in ids:
            if a in used:
                continue
            for b in ids:
                if b <= a or b in used:
                    continue
                if max((comps[a][1] - comps[b][1]).length, (comps[a][2] - comps[b][2]).length) < 0.35:
                    if cls[comps[a][0][0]] == 'tie':
                        used |= {a, b}              # the knot needs both layers (no holes)
                        break
                    inner = a if area[a] < area[b] else b
                    cls[comps[inner][0]] = 'drop'
                    used |= {a, b}
                    dropped += 1
                    break
    print('MF uniform: dropped the inner layer of %d duplicated panel pairs' % dropped)
    return src, co, cls


class Body:
    def __init__(self, info, arm):
        self.info = info
        self.co = np.array([tuple(c) for c in info.co])
        self.dom = np.array(info.dom, dtype=object)
        b = arm.data.bones
        W = arm.matrix_world
        self.S = {s: W @ b['upperarm_' + s].head_local for s in 'LR'}
        self.Wr = {s: W @ b['hand_' + s].head_local for s in 'LR'}
        dom = self.dom
        self.is_arm = np.array([d.startswith(('upperarm_', 'forearm_', 'hand_', 'thumb', 'index', 'middle',
                                              'ring', 'pinky')) for d in dom])
        self.is_leg = np.array([d.startswith(('thigh_', 'shin_', 'foot_', 'toe_')) for d in dom])
        self.is_head = np.array([d.startswith(('head',)) for d in dom])

    def torso_slice(self, z, band=0.006):
        m = (np.abs(self.co[:, 2] - z) < band) & ~self.is_arm & ~self.is_head & (np.abs(self.co[:, 0]) < 0.24)
        if z < 1.0:
            m &= ~self.is_leg | (self.co[:, 2] > 0.86)
        c = self.co[m]
        if len(c) < 8:
            return None
        return np.percentile(np.abs(c[:, 0]), 99), np.percentile(c[:, 1], 1), np.percentile(c[:, 1], 99)

    def leg_slice(self, side, z, band=0.006):
        sg = 1 if side == 'L' else -1
        m = (np.abs(self.co[:, 2] - z) < band) & (self.co[:, 0] * sg > 0.005) & self.is_leg
        c = self.co[m]
        if len(c) < 6:
            return None
        return (np.percentile(c[:, 0], 1), np.percentile(c[:, 0], 99), np.percentile(c[:, 1], 1),
                np.percentile(c[:, 1], 99))


def _smooth(y, sigma=2.0):
    """gaussian smoothing of a 1-D profile with NaN gaps"""
    y = np.array(y, np.float64)
    ok = ~np.isnan(y)
    if ok.sum() == 0:
        return y
    x = np.arange(len(y))
    y = np.interp(x, x[ok], y[ok])
    k = np.exp(-0.5 * (np.arange(-6, 7) / sigma) ** 2)
    k /= k.sum()
    pad = np.pad(y, 6, mode='edge')
    return np.convolve(pad, k, mode='valid')


# --- height landmarks (uniform cm -> body m)
Z_TORSO = [(108.0, 0.995), (147.0, 1.252), (148.4, 1.262), (156.8, 1.308)]
Z_SOCK = [(0.5, 0.0), (48.0, 0.455)]


def zmap(z, keys):
    zs = np.array([k[0] for k in keys])
    vs = np.array([k[1] for k in keys])
    out = np.interp(z, zs, vs)
    lo = z < zs[0]
    out[lo] = vs[0] + (z[lo] - zs[0]) * (vs[1] - vs[0]) / (zs[1] - zs[0])
    hi = z > zs[-1]
    out[hi] = vs[-1] + (z[hi] - zs[-1]) * (vs[-1] - vs[-2]) / (zs[-1] - zs[-2])
    return out


def fit_uniform(co, cls, body):
    """returns fitted positions (metres) for every uniform vertex"""
    out = np.zeros_like(co)
    x, y, z = co[:, 0], co[:, 1], co[:, 2]
    upper = np.isin(cls, ['shirt', 'sleeve', 'collar', 'button', 'placket', 'vest', 'vest_rib', 'tie'])
    torso_ref = np.isin(cls, ['shirt', 'vest', 'vest_rib', 'collar'])

    # ---------- torso: slice-wise elliptic fit
    z0, z1 = 90, 158
    bins = np.arange(z0, z1 + 1)
    sx, sf, sb, cyu, cyo = [], [], [], [], []
    for zb in bins:
        m = torso_ref & (np.abs(z - zb) < 0.75) & (np.abs(x) < 20)
        zo = zmap(np.array([float(zb)]), Z_TORSO)[0]
        bs = body.torso_slice(zo) if zo < 1.29 else None
        if zo >= 1.29:
            bs = body.torso_slice(1.288)
        if m.sum() < 8 or bs is None:
            sx.append(np.nan); sf.append(np.nan); sb.append(np.nan); cyu.append(np.nan); cyo.append(np.nan)
            continue
        xu = np.percentile(np.abs(x[m]), 98) * 0.01
        yfu, ybu = np.percentile(y[m], 2) * 0.01, np.percentile(y[m], 98) * 0.01
        xo, yfo, ybo = bs
        if ybu - yfu < 0.10 or xu < 0.04:            # not a full ring of fabric at this height
            sx.append(np.nan); sf.append(np.nan); sb.append(np.nan); cyu.append(np.nan); cyo.append(np.nan)
            continue
        clr = (0.010 if zo < 1.255 else 0.004) if zo > 1.0 else 0.004
        c_u, c_o = (yfu + ybu) / 2, (yfo + ybo) / 2
        sx.append((xo + clr) / xu)
        sf.append((c_o - yfo + clr) / (c_u - yfu))
        sb.append((ybo - c_o + clr) / (ybu - c_u))
        cyu.append(c_u); cyo.append(c_o)
    sx, sf, sb, cyu, cyo = [_smooth(a, 2.5) for a in (sx, sf, sb, cyu, cyo)]
    sx, sf, sb = [np.clip(a, 0.35, 1.5) for a in (sx, sf, sb)]

    def torso_map(idx):
        zi = np.clip(z[idx], z0, z1)
        k = zi - z0
        SX, SF, SB = np.interp(k, np.arange(len(bins)), sx), np.interp(k, np.arange(len(bins)), sf), \
            np.interp(k, np.arange(len(bins)), sb)
        CU, CO = np.interp(k, np.arange(len(bins)), cyu), np.interp(k, np.arange(len(bins)), cyo)
        xm, ym = x[idx] * 0.01, y[idx] * 0.01
        res = np.empty((len(idx), 3))
        res[:, 0] = xm * SX
        res[:, 1] = CO + np.where(ym < CU, (ym - CU) * SF, (ym - CU) * SB)
        res[:, 2] = zmap(z[idx], Z_TORSO)
        return res

    # ---------- arms: A-pose sleeve -> T-pose arm
    arm_res = {}
    for side, sg in (('L', 1), ('R', -1)):
        m = (cls == 'sleeve') & (x * sg > 0)
        P = co[m] * 0.01
        c = P.mean(0)
        u, s_, vt = np.linalg.svd(P - c)
        a_u = vt[0] * (1 if vt[0][0] * sg > 0 else -1)
        t = (P - c) @ a_u
        S_u = c + a_u * t.min()
        L_u = t.max() - t.min()
        S_o = np.array(tuple(body.S[side]))
        W_o = np.array(tuple(body.Wr[side]))
        a_o = (W_o - S_o) / np.linalg.norm(W_o - S_o)
        L_o = np.linalg.norm(W_o - S_o) - 0.012
        fwd = np.array([0, -1.0, 0])

        def frame(a):
            f = fwd - a * (fwd @ a)
            f /= np.linalg.norm(f)
            return f, np.cross(a, f)
        f_u, n_u = frame(a_u)
        f_o, n_o = frame(a_o)
        # radial scale per position along the arm
        tb = np.linspace(0, 1, 21)
        ru = []
        ro = []
        bm = body.is_arm & (body.co[:, 0] * sg > 0)
        BP = body.co[bm]
        bt = (BP - S_o) @ a_o
        br = np.linalg.norm((BP - S_o) - np.outer(bt, a_o), axis=1)
        for tt in tb:
            sel = np.abs(t - t.min() - tt * L_u) < L_u * 0.04
            rr = np.linalg.norm((P[sel] - S_u) - np.outer((P[sel] - S_u) @ a_u, a_u), axis=1)
            ru.append(np.percentile(rr, 90) if len(rr) > 5 else np.nan)
            selb = np.abs(bt - tt * L_o) < L_o * 0.04
            ro.append(np.percentile(br[selb], 90) if selb.sum() > 5 else np.nan)
        k = _smooth((np.array(ro) + 0.0055) / np.array(ru), 1.5)
        arm_res[side] = (S_u, a_u, f_u, n_u, L_u, S_o, a_o, f_o, n_o, L_o, tb, k, _smooth(np.array(ru), 1.5))

    def arm_map(idx, side):
        S_u, a_u, f_u, n_u, L_u, S_o, a_o, f_o, n_o, L_o, tb, k, ru = arm_res[side]
        P = co[idx] * 0.01
        d = P - S_u
        t = d @ a_u
        rf = d @ f_u
        rn = d @ n_u
        tt = np.clip(t / L_u, 0, 1)
        K = np.interp(tt, tb, k)
        t_o = np.where(t >= 0, t * (L_o / L_u), t)
        # how close the point is to the sleeve tube (torso panels are far from it)
        rad = np.sqrt(rf ** 2 + rn ** 2)
        r_sl = np.interp(tt, tb, ru)
        near = 1.0 - np.clip((rad - r_sl * 1.15) / (r_sl * 0.45), 0, 1)
        return S_o + np.outer(t_o, a_o) + np.outer(K * rf, f_o) + np.outer(K * rn, n_o), t / L_u, near

    idx_up = np.where(upper)[0]
    res = torso_map(idx_up)
    # the vest hem reaches ~2 cm further down so it overlaps the skirt band
    vest = np.isin(cls[idx_up], ['vest', 'vest_rib'])
    zz = z[idx_up]
    drop = 0.020 * np.clip((112.0 - zz) / 6.0, 0, 1)
    res[vest, 2] -= drop[vest]
    for side, sg in (('L', 1), ('R', -1)):
        sel = np.where(x[idx_up] * sg > 4.0)[0]
        if len(sel) == 0:
            continue
        am, tt, near = arm_map(idx_up[sel], side)
        w = np.clip((tt + 0.02) / 0.10, 0, 1)
        w = w * w * (3 - 2 * w) * near
        # sleeves themselves always follow the arm
        w = np.where(cls[idx_up[sel]] == 'sleeve', np.maximum(w, np.clip((tt + 0.05) / 0.08, 0, 1)), w)
        res[sel] = res[sel] * (1 - w[:, None]) + am * w[:, None]
    # below the vest hem the shirt (and tie tail) is tucked into the skirt: keep it on the body
    low = res[:, 2] < 1.02
    for i in np.where(low)[0]:
        bs = body.torso_slice(float(res[i, 2]))
        if bs is None:
            continue
        xo, yfo, ybo = bs
        c = 0.0040                       # tucked in: just over the skin, under the skirt band
        res[i, 0] = np.clip(res[i, 0], -(xo + c), xo + c)
        res[i, 1] = np.clip(res[i, 1], yfo - c, ybo + c)
    out[idx_up] = res

    # ---------- skirt: slice-wise; the waist fits her waist, below that the
    #            skirt keeps its own flare but never gets narrower than her hips
    sk = np.isin(cls, ['skirt', 'skirt_band'])
    idx = np.where(sk)[0]
    zs_u = np.arange(np.floor(z[sk].max()), np.floor(z[sk].min()) - 1, -1.0)       # top -> hem
    prof = []
    prev = None
    s_top = None
    waist = None
    for zz in zs_u:
        m = sk & (np.abs(z - zz) < 0.75)
        if m.sum() < 12:
            prof.append(prof[-1] if prof else None)
            continue
        xu = np.percentile(np.abs(x[m]), 98) * 0.01
        yfu, ybu = np.percentile(y[m], 2) * 0.01, np.percentile(y[m], 98) * 0.01
        cu = (yfu + ybu) / 2
        has_l, has_r = (x[m] > 5).any(), (x[m] < -5).any()
        has_f, has_b = (y[m] < cu * 100 - 5).any(), (y[m] > cu * 100 + 5).any()
        if prof and not (has_l and has_r and has_f and has_b and xu > 0.08 and ybu - yfu > 0.12):
            prof.append(prof[-1])                           # partial ring (uneven hem): keep the scale
            continue
        zo = zmap(np.array([zz]), Z_TORSO)[0]
        bs = body.torso_slice(zo) or body.torso_slice(0.9)
        xo, yfo, ybo = bs
        co_ = (yfo + ybo) / 2
        if s_top is None:                                   # waistband: snug on the waist
            s_top = ((xo + 0.0065) / xu, (co_ - yfo + 0.0065) / (cu - yfu), (ybo - co_ + 0.0065) / (ybu - cu))
        # the pack's skirt flares strongly; keep only part of that flare so the
        # skirt stays close to her (slim) hips instead of standing out like a bell
        Xs, Fs, Bs = xu * s_top[0], (cu - yfu) * s_top[1], (ybu - cu) * s_top[2]
        if waist is None:
            waist = (Xs, Fs, Bs)
        Xs = waist[0] + (Xs - waist[0]) * SKIRT_FLARE
        Fs = waist[1] + (Fs - waist[1]) * SKIRT_FLARE
        Bs = waist[2] + (Bs - waist[2]) * SKIRT_FLARE
        X = max(Xs, xo + 0.008)
        F = max(Fs, co_ - yfo + 0.008)
        Bk = max(Bs, ybo - co_ + 0.008)
        if prev is not None:                                # flare never closes in
            X, F, Bk = max(X, prev[0]), max(F, prev[1]), max(Bk, prev[2])
        prev = (X, F, Bk)
        prof.append((X / xu, F / (cu - yfu), Bk / (ybu - cu), cu, co_))
    first = next(p for p in prof if p is not None)
    prof = [p if p is not None else first for p in prof]
    P = np.array(prof)
    order = np.argsort(zs_u)
    zz_sorted = zs_u[order]
    cols = [np.interp(z[idx], zz_sorted, _smooth(P[:, c], 1.5)[order]) for c in range(5)]
    SX, SF, SB, CU, CO = cols
    xm, ym = x[idx] * 0.01, y[idx] * 0.01
    out[idx, 0] = xm * SX
    out[idx, 1] = CO + np.where(ym < CU, (ym - CU) * SF, (ym - CU) * SB)
    out[idx, 2] = zmap(z[idx], Z_TORSO)
    print('MF uniform skirt: waist scale %.3f, hem scale %.3f' % (P[0, 0], P[-1, 0]))

    # ---------- socks: per leg, slice-wise
    for side, sg in (('L', 1), ('R', -1)):
        m = (cls == 'socks') & (x * sg > 0)
        idx = np.where(m)[0]
        zb = np.arange(0, 50)
        prm = []
        for zz in zb:
            s_ = m & (np.abs(z - zz) < 0.75)
            zo = zmap(np.array([float(zz)]), Z_SOCK)[0]
            bs = body.leg_slice(side, max(zo, 0.004))
            if s_.sum() < 6 or bs is None:
                prm.append([np.nan] * 8)
                continue
            xs, ys = x[s_] * 0.01, y[s_] * 0.01
            prm.append([np.percentile(xs, 2), np.percentile(xs, 98), np.percentile(ys, 2), np.percentile(ys, 98),
                        bs[0], bs[1], bs[2], bs[3]])
        prm = np.array(prm)
        prm = np.stack([_smooth(prm[:, c], 1.5) for c in range(8)], 1)
        k = np.clip(z[idx], 0, 49)
        g = [np.interp(k, zb, prm[:, c]) for c in range(8)]
        x0u, x1u, y0u, y1u, x0o, x1o, y0o, y1o = g
        c = 0.0012
        cxu, cyu_, cxo, cyo_ = (x0u + x1u) / 2, (y0u + y1u) / 2, (x0o + x1o) / 2, (y0o + y1o) / 2
        xm, ym = x[idx] * 0.01, y[idx] * 0.01
        out[idx, 0] = cxo + (xm - cxu) * ((x1o - x0o) / 2 + c) / ((x1u - x0u) / 2)
        out[idx, 1] = cyo_ + (ym - cyu_) * ((y1o - y0o) / 2 + c) / ((y1u - y0u) / 2)
        out[idx, 2] = zmap(z[idx], Z_SOCK)
    return out


def push_out(pos, cls, body_ob, faces):
    """move vertices that are closer to the skin than their class clearance
    outwards; the push is shared with nearby vertices (keeps shell thickness)
    and smoothed so the fabric doesn't crumple"""
    from .bust import body_co
    me = body_ob.data
    bvh = BVHTree.FromPolygons([Vector(c) for c in body_co(body_ob)], [tuple(p.vertices) for p in me.polygons])
    n = len(pos)
    need = np.zeros(n)
    nrm = np.zeros((n, 3))
    for i in range(n):
        p = Vector(pos[i])
        hit = bvh.find_nearest(p)
        if hit[0] is None:
            continue
        nv = hit[1]
        d = (p - hit[0]).dot(nv)
        req = CLEAR[cls[i]]
        if cls[i] in ('vest', 'vest_rib'):
            # over the skirt band (6.5 mm + band thickness), ramped smoothly
            req = max(req, 0.0078 + (0.0125 - 0.0078) * sstep(1.035, 0.995, pos[i][2]))
        if d < req:
            need[i] = req - d
            nrm[i] = tuple(nv)
    kd = KDTree(n)
    for i in range(n):
        kd.insert(pos[i], i)
    kd.balance()
    disp = need.copy()
    dirs = nrm.copy()
    for i in np.where(need > 0)[0]:
        for _, j, dist in kd.find_range(pos[i], 0.006):
            if need[i] > disp[j]:
                disp[j] = need[i] * (1 - 0.3 * dist / 0.006)
                dirs[j] = nrm[i]
    # smooth over mesh neighbours
    nb = [[] for _ in range(n)]
    for f in faces:
        for k in range(len(f)):
            a, b = f[k], f[(k + 1) % len(f)]
            nb[a].append(b)
            nb[b].append(a)
    for _ in range(4):
        new = disp.copy()
        for i in range(n):
            if nb[i]:
                new[i] = max(need[i], 0.5 * disp[i] + 0.5 * np.mean(disp[nb[i]]))
        disp = new
    moved = disp > 1e-5
    pos[moved] += dirs[moved] * disp[moved][:, None]
    big = np.argsort(-disp)[:5]
    print('MF uniform push-out: %d of %d verts moved (max %.1f mm; worst at %s)' % (
        moved.sum(), n, disp.max() * 1000, [(cls[i], tuple(np.round(pos[i], 3))) for i in big[:3]]))
    return pos


def _surface_weights(body_ob, info):
    me = body_ob.data
    bvh = BVHTree.FromPolygons([v.co.copy() for v in me.vertices], [tuple(p.vertices) for p in me.polygons])

    def w(p):
        hit = bvh.find_nearest(Vector(p))
        poly = me.polygons[hit[2]]
        acc, tot = {}, 0.0
        for vi in poly.vertices:
            d = (me.vertices[vi].co - hit[0]).length
            k = 1.0 / max(d, 1e-4)
            tot += k
            for g, x in info.w[vi].items():
                acc[g] = acc.get(g, 0.0) + x * k
        return {g: x / tot for g, x in acc.items()}
    return w


def import_uniform(info, arm):
    """build Shirt / Vest / Tie / Skirt / Socks from the purchased uniform"""
    from . import outfit2
    src, co, cls = _uniform_source()
    body = Body(info, arm)
    pos = fit_uniform(co, cls, body)
    faces = [tuple(p.vertices) for p in src.data.polygons]
    pos = push_out(pos, cls, outfit2.body(), faces)
    surf_w = _surface_weights(outfit2.body(), info)
    me_src = src.data
    uv_src = me_src.uv_layers.active.data if me_src.uv_layers else None
    objs = {}
    for obname in sorted(set(OBJECT_OF.values())):
        keep_cls = [c for c, o in OBJECT_OF.items() if o == obname]
        sel = np.isin(cls, keep_cls)
        if obname == 'Tie':
            sel &= pos[:, 2] > 1.072        # the tail below the vest neckline is never visible
        vsel = np.where(sel)[0]
        remap = {int(v): i for i, v in enumerate(vsel)}
        polys = [p for p in me_src.polygons if all(v in remap for v in p.vertices)]
        if obname == 'Shirt':
            # the tucked-in part is under the skirt: never visible, only able to poke through
            polys = [p for p in polys if not all(pos[v][2] < SKIRT_TOP_Z - 0.006 and abs(pos[v][0]) < 0.2
                                                 for v in p.vertices)]
        me = bpy.data.meshes.new(obname)
        me.from_pydata([tuple(pos[v]) for v in vsel], [], [[remap[v] for v in p.vertices] for p in polys])
        uv = me.uv_layers.new(name='UVMap')
        mats = []
        for p_new, p in zip(me.polygons, polys):
            c = cls[p.vertices[0]]
            mname = CLASS_MAT[c]
            if mname not in mats:
                mats.append(mname)
            p_new.material_index = mats.index(mname)
            p_new.use_smooth = True
            if uv_src is not None:
                for k, li in enumerate(p.loop_indices):
                    uv.data[p_new.loop_indices[k]].uv = uv_src[li].uv
        for mname in mats:
            me.materials.append(bpy.data.materials[mname])
        me.update()
        ob = bpy.data.objects.new(obname, me)
        bpy.context.scene.collection.objects.link(ob)
        # skin weights
        groups = {}
        for i, v in enumerate(vsel):
            c = cls[v]
            p = pos[v]
            if c in ('skirt', 'skirt_band'):
                # each part of the skirt follows the leg it covers, more towards
                # the hem; the waistband stays on the hips
                # over the leg the hem follows the thigh fully, so the stepping
                # leg carries the skirt with it instead of passing through
                share = sstep(0.925, 0.78, p[2])
                wl = math.exp(-((p[0] - 0.076) / 0.055) ** 2)
                wr = math.exp(-((p[0] + 0.076) / 0.055) ** 2)
                tot_lr = wl + wr + 1e-6
                w = {'hips': 1.0 - share}
                if share > 0:
                    w['thigh_L'] = share * wl / tot_lr
                    w['thigh_R'] = share * wr / tot_lr
            else:
                w = surf_w(p)
                if c in ('vest', 'vest_rib', 'shirt', 'placket', 'button') and p[2] < 1.04:
                    k = sstep(1.04, 0.995, p[2])     # waist: move with the skirt band (hips)
                    w = {g: x * (1 - k) for g, x in w.items()}
                    w['hips'] = w.get('hips', 0.0) + k
            tot = sum(w.values()) or 1.0
            for g, x in sorted(w.items(), key=lambda kv: -kv[1])[:4]:
                if x / tot < 0.01:
                    continue
                vg = groups.get(g) or ob.vertex_groups.new(name=g)
                groups[g] = vg
                vg.add([i], x / tot, 'REPLACE')
        ob.parent = arm
        mod = ob.modifiers.new('Armature', 'ARMATURE')
        mod.object = arm
        objs[obname] = ob
        print('MF uniform: %-6s %6d verts, materials %s' % (obname, len(me.vertices), mats))
    bpy.data.objects.remove(src, do_unlink=True)
    tie_stripes(objs['Tie'])
    return objs


TIE_GREEN, TIE_SILVER = PROFILE['tie']       # tie base colour and stripe colour (the house colours)


def _tie_texture():
    """diagonal green/silver stripes; UV = (x, z) in metres (see build_tie)"""
    path = tex('Tie_Stripes.png')
    n = 512
    v, u = np.mgrid[0:n, 0:n].astype(np.float64)
    X = (u + 0.5) / n * 0.08 - 0.04                 # 8 cm wide
    Z = (v + 0.5) / n * 0.32 + 1.00                 # 1.00 .. 1.32 m (row 0 = bottom)
    d = X * 0.9 + Z                                 # stripes run down towards her right
    period, w = 0.024, 0.0060
    ph = np.mod(d, period)
    aa = 0.0006
    a = np.clip((w - ph) / aa + 0.5, 0, 1) * np.clip(ph / aa + 0.5, 0, 1)
    thin = np.abs(ph - w * 1.95) - w * 0.22
    a = np.maximum(a, np.clip(-thin / aa + 0.5, 0, 1))
    g, sv = np.array(TIE_GREEN) / 255.0, np.array(TIE_SILVER) / 255.0
    rgb = g * (1 - a[..., None]) + sv * a[..., None]
    img = np.concatenate([rgb, np.ones((n, n, 1))], -1)
    os.makedirs(BUILT, exist_ok=True)
    _save_png(img, path, 'mf_tie_stripes_png')
    m = bpy.data.materials.get('mf_tie_tex') or bpy.data.materials.new('mf_tie_tex')
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    o = nt.nodes.new('ShaderNodeOutputMaterial')
    b = nt.nodes.new('ShaderNodeBsdfPrincipled')
    b.name = 'Principled BSDF'
    t = nt.nodes.new('ShaderNodeTexImage')
    t.image = bpy.data.images.load(path, check_existing=False)
    t.image.name = PROFILE['prefix'] + '_Tie_Stripes'
    t.image.colorspace_settings.name = 'sRGB'
    t.extension = 'EXTEND'
    nt.links.new(t.outputs['Color'], b.inputs['Base Color'])
    nt.links.new(b.outputs[0], o.inputs[0])
    b.inputs['Roughness'].default_value = 0.6
    return m


def build_tie(shirt, ztop, cx, arm):
    """one clean tie: a rounded knot in the collar opening and a single
    blade lying on the shirt, tucked under the knot at the top and into the
    vest at the bottom"""
    me = shirt.data
    sb = BVHTree.FromPolygons([shirt.matrix_world @ v.co for v in me.vertices], [tuple(p.vertices) for p in me.polygons])

    def surf(x, z):
        hit = sb.ray_cast(Vector((x, -1.0, z)), Vector((0, 1, 0)))
        return hit[0].y if hit[0] is not None else -0.08

    verts, faces, uvs = [], [], []

    def uv_of(p):
        return ((p.x + 0.04) / 0.08, (p.z - 1.00) / 0.32)

    def grid(rows, flip=False, closed=False):
        nr, nc = len(rows), len(rows[0])
        b0 = len(verts)
        for r in rows:
            for p in r:
                verts.append(p)
                uvs.append(uv_of(p))
        cols = nc if closed else nc - 1
        for i in range(nr - 1):
            for j in range(cols):
                j2 = (j + 1) % nc
                f = (b0 + i * nc + j, b0 + i * nc + j2, b0 + (i + 1) * nc + j2, b0 + (i + 1) * nc + j)
                faces.append(tuple(reversed(f)) if flip else f)
        return b0

    # --- blade (front and back skin, closed edges)
    z_top, z_bot = ztop - 0.012, 1.020
    nz, nx = 60, 9
    front, back = [], []
    for i in range(nz):
        t = i / (nz - 1)
        z = z_top + (z_bot - z_top) * t
        hw = 0.0072 + (0.0190 - 0.0072) * min(1.0, t * 1.15)
        fr, bk = [], []
        for j in range(nx):
            u = -1 + 2 * j / (nx - 1)
            x = cx + u * hw
            y = surf(x, z) - 0.0032 - 0.0012 * (1 - u * u)
            fr.append(Vector((x, y, z)))
            bk.append(Vector((x, y + 0.0014, z)))
        front.append(fr)
        back.append(bk)
    grid(front)
    grid(back, flip=True)
    # side and end strips
    for j in (0, nx - 1):
        rows = [[front[i][j], back[i][j]] for i in range(nz)]
        grid(rows, flip=(j == 0))
    grid([front[-1], back[-1]], flip=True)
    grid([front[0], back[0]])
    # --- knot: rounded, tapered, slightly forward of the blade top
    z1, z0 = ztop + 0.004, ztop - 0.018
    krows = []
    nk, na = 8, 20
    for i in range(nk):
        t = i / (nk - 1)
        z = z1 + (z0 - z1) * t
        hw = 0.0102 - 0.0040 * t
        dep = 0.0085 - 0.0020 * t
        yb = surf(cx, z) - 0.0010
        ring = []
        for j in range(na):
            a = 2 * math.pi * j / na
            ca, sa = math.cos(a), math.sin(a)
            ring.append(Vector((cx + hw * math.copysign(abs(ca) ** 0.7, ca),
                                yb - dep * 0.5 - dep * 0.5 * math.copysign(abs(sa) ** 0.8, sa), z)))
        krows.append(ring)
    kb = grid(krows, closed=True)
    for zz, r in ((z1 + 0.0012, krows[0]), (z0 - 0.0012, krows[-1])):
        c = sum(r, Vector()) / len(r)
        ci = len(verts)
        verts.append(Vector((c.x, c.y, zz)))
        uvs.append(uv_of(c))
        base = kb if r is krows[0] else kb + (nk - 1) * na
        for j in range(na):
            f = (base + j, base + (j + 1) % na, ci)
            faces.append(f if r is krows[-1] else tuple(reversed(f)))
    # consistent outward winding for the knot (its centre line is known)
    kc = Vector((cx, surf(cx, (z0 + z1) / 2) - 0.0055, (z0 + z1) / 2))
    k_first = len(faces) - (nk - 1) * na - 2 * na
    for fi in range(k_first, len(faces)):
        f = faces[fi]
        a, b, c = verts[f[0]], verts[f[1]], verts[f[2]]
        if (b - a).cross(c - a).dot((a + b + c) / 3 - kc) < 0:
            faces[fi] = tuple(reversed(f))
    mesh = bpy.data.meshes.new('Tie')
    mesh.from_pydata([tuple(v) for v in verts], [], faces)
    uvl = mesh.uv_layers.new(name='UVMap')
    for p in mesh.polygons:
        p.use_smooth = True
        for li in p.loop_indices:
            uvl.data[li].uv = uvs[mesh.loops[li].vertex_index]
    mesh.materials.append(_tie_texture())
    mesh.update()
    ob = bpy.data.objects.new('Tie', mesh)
    bpy.context.scene.collection.objects.link(ob)
    gc, gs, gn = ob.vertex_groups.new(name='chest'), ob.vertex_groups.new(name='spine'), ob.vertex_groups.new(name='neck')
    for i, v in enumerate(verts):
        if v.z > ztop - 0.02:
            gc.add([i], 0.7, 'REPLACE')
            gn.add([i], 0.3, 'REPLACE')
        elif v.z > 1.16:
            gc.add([i], 1.0, 'REPLACE')
        else:
            gc.add([i], 0.7, 'REPLACE')
            gs.add([i], 0.3, 'REPLACE')
    ob.parent = arm
    mod = ob.modifiers.new('Armature', 'ARMATURE')
    mod.object = arm
    print('MF uniform: Tie rebuilt (%d verts), knot z %.3f-%.3f' % (len(verts), z0, z1))
    return ob


def tie_knot(tie, shirt, arm):
    """A rounded four-in-hand knot at the top of the tie blade: tapered,
    domed on top, sitting just in front of the blade and inside the collar."""
    from .meshutil import MeshData
    co = [tie.matrix_world @ v.co for v in tie.data.vertices]
    tb = BVHTree.FromPolygons(co, [tuple(p.vertices) for p in tie.data.polygons])
    ztop = max(c.z for c in co)
    top = [c for c in co if c.z > ztop - 0.012]
    cx = sum(c.x for c in top) / len(top)

    def front(z):
        hit = tb.ray_cast(Vector((cx, -1.0, z)), Vector((0, 1, 0)))
        if hit[0] is not None:
            return hit[0].y
        return min(c.y for c in top)
    body = bpy.data.objects['Body_All']
    from .bust import body_co
    bb = BVHTree.FromPolygons([Vector(c) for c in body_co(body)], [tuple(p.vertices) for p in body.data.polygons])

    def neck(z):
        hit = bb.ray_cast(Vector((cx, -1.0, z)), Vector((0, 1, 0)))
        return hit[0].y if hit[0] is not None else front(z) + 0.02
    md = MeshData()
    rows = []
    na = 24
    z1, z0 = ztop + 0.003, ztop - 0.020
    yf0 = min(front(z0), front(ztop - 0.004))                           # one straight front plane
    for k in range(9):
        t = k / 8
        z = z1 + (z0 - z1) * t
        hw = 0.0100 - 0.0040 * t
        dome = math.sin(math.pi * 0.5 * min(1.0, t / 0.18 + 0.05))      # rounded top
        y_front = yf0 - 0.0030                                          # just in front of the blade
        y_back = min(neck(z) - 0.0015, y_front + 0.0110)                # a real knot is ~1 cm deep
        yc, dep = (y_front + y_back) / 2, (y_back - y_front)
        ring = []
        for j in range(na):
            a = 2 * math.pi * j / na
            ca, sa = math.cos(a), math.sin(a)
            x = cx + hw * dome * math.copysign(abs(ca) ** 0.8, ca)
            y = yc - dep * 0.5 * math.copysign(abs(sa) ** 0.5, sa)
            ring.append(Vector((x, y, z)))
        rows.append(ring)
    md.add_grid(rows, 'mf_tie', closed=True, cap_start=sum(rows[0], Vector()) / na + Vector((0, 0, 0.0008)),
                cap_end=sum(rows[-1], Vector()) / na - Vector((0, 0, 0.0008)))
    cen = Vector((cx, sum(r[0].y + r[na // 2].y for r in rows) / (2 * len(rows)) - 0.002, (z0 + z1) / 2))
    for fi, f in enumerate(md.f):
        a, b, c = md.v[f[0]], md.v[f[1]], md.v[f[2]]
        if (b - a).cross(c - a).dot((a + b + c) / 3 - cen) < 0:
            md.f[fi] = tuple(reversed(f))
    # white filler behind the knot: closes the shirt's opening at the throat
    # (that hole was what showed as a gap around the knot)
    fz0, fz1 = z0 - 0.004, z1 + 0.004
    frow = []
    for k in range(6):
        t = k / 5
        z = fz0 + (fz1 - fz0) * t
        hw = 0.006 + 0.005 * t                                          # only as wide as the knot's back
        yb = min(neck(z) - 0.0012, yf0 + 0.0115)
        frow.append([Vector((cx + hw * (2 * j / 8 - 1), yb, z)) for j in range(9)])
    md.add_grid(frow, 'mf_shirt', closed=False)                    # single sheet (viewer is double-sided)
    ob = md.to_object('TieKnot', bpy.data.materials, bone=None, rig=None)
    for nm, w in (('chest', 0.6), ('neck', 0.4)):
        ob.vertex_groups.new(name=nm).add(list(range(len(md.v))), w, 'REPLACE')
    ob.parent = arm
    mod = ob.modifiers.new('Armature', 'ARMATURE')
    mod.object = arm
    print('MF uniform: TieKnot %d verts at z %.3f-%.3f' % (len(md.v), z0, z1))


def tie_stripes(ob):
    """green tie with diagonal silver stripes, painted into a texture through
    the tie's own UVs (stripe direction is taken from 3D, so it is correct
    regardless of the UV layout)"""
    me = ob.data
    size = 1024
    img = np.zeros((size, size, 3), np.float32)
    green = np.array(TIE_GREEN, np.float32)
    silver = np.array(TIE_SILVER, np.float32)
    img[:] = green
    uv = me.uv_layers['UVMap'].data
    period, width = 0.026, 0.0065
    for p in me.polygons:
        li = list(p.loop_indices)
        vs = [me.vertices[me.loops[l].vertex_index].co for l in li]
        uvs = [uv[l].uv for l in li]
        for tri in ((0, 1, 2), (0, 2, 3)) if len(li) == 4 else ((0, 1, 2),):
            a, b, c = [np.array(uvs[k]) * size for k in tri]
            A, B, C = [np.array(tuple(vs[k])) for k in tri]
            x0, x1 = int(max(min(a[0], b[0], c[0]), 0)), int(min(max(a[0], b[0], c[0]) + 1, size))
            y0, y1 = int(max(min(a[1], b[1], c[1]), 0)), int(min(max(a[1], b[1], c[1]) + 1, size))
            if x1 <= x0 or y1 <= y0:
                continue
            yy, xx = np.mgrid[y0:y1, x0:x1].astype(np.float32) + 0.5
            det = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1])
            if abs(det) < 1e-9:
                continue
            l1 = ((b[1] - c[1]) * (xx - c[0]) + (c[0] - b[0]) * (yy - c[1])) / det
            l2 = ((c[1] - a[1]) * (xx - c[0]) + (a[0] - c[0]) * (yy - c[1])) / det
            l3 = 1 - l1 - l2
            inside = (l1 >= -0.02) & (l2 >= -0.02) & (l3 >= -0.02)
            P = l1[..., None] * A + l2[..., None] * B + l3[..., None] * C
            diag = P[..., 0] * 0.8 + P[..., 2]                     # stripes running down to her right
            ph = np.mod(diag, period)
            st = (ph < width) | (np.abs(ph - width * 1.9) < width * 0.22)
            col = np.where(st[..., None], silver, green)
            blk = img[y0:y1, x0:x1]
            blk[inside] = col[inside]
    os.makedirs(BUILT, exist_ok=True)
    path = tex('Tie_BaseColor.png')
    rgba = np.concatenate([img / 255.0, np.ones(img.shape[:2] + (1,), np.float32)], -1)
    _save_png(rgba, path, 'mf_tie_png')
    m = bpy.data.materials.get('mf_tie_tex') or bpy.data.materials.new('mf_tie_tex')
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    o = nt.nodes.new('ShaderNodeOutputMaterial')
    b = nt.nodes.new('ShaderNodeBsdfPrincipled')
    b.name = 'Principled BSDF'
    t = nt.nodes.new('ShaderNodeTexImage')
    t.image = bpy.data.images.load(path, check_existing=False)
    t.image.name = PROFILE['prefix'] + '_Tie_BaseColor'
    t.image.colorspace_settings.name = 'sRGB'
    nt.links.new(t.outputs['Color'], b.inputs['Base Color'])
    nt.links.new(b.outputs[0], o.inputs[0])
    b.inputs['Roughness'].default_value = 0.6
    me.materials.clear()
    me.materials.append(m)
    for p in me.polygons:
        p.material_index = 0
