"""Reshapes the base head into Malfoid's face while keeping its topology,
rig weights and all shape keys.

Two layers are applied on top of the base 'Basis':

  S  structural changes (feature heights, eye slant, iris size, brows,
     canines). Added to every shape key so they all stay valid.
  E  her resting expression (half-lidded eyes, smug asymmetric smile),
     built from the base mesh's own shape keys and baked into the Basis.
     Keys that put the eyelids in an absolute state (blink, wink, ...)
     are re-targeted so they still close exactly.
"""
import math
import numpy as np
import bpy
from mathutils import Vector
from mathutils.bvhtree import BVHTree

# --- tunables ---------------------------------------------------------------
# vertical feature remap: (base height, upward shift). Chin/neck and crown stay.
Z_REMAP = [(1.290, 0.0), (1.304, 0.0), (1.3327, 0.0090), (1.361, 0.0120), (1.384, 0.0225),
           (1.4227, 0.0120), (1.470, -0.0010), (1.500, -0.0080), (1.534, -0.0140)]
FACE_WIDEN = 0.105                # the atlas face is broader across the cheeks
EYE_INSET = 0.0010                # eyes sit a little closer together
EYE_SLANT_OUTER = 1.28            # extra upsweep on the outer half: sharp corners
WING = 0.0024                     # longer, sharper outer lash wing
CHIN_SOFTEN = 0.14                # widen the very tip of the chin a little
EYE_C = (0.0420, 1.3843)          # eye centre (x, z) in the base
EYE_SLANT = 0.15                  # shear: outer corner up (tsurime)
IRIS_SCALE = 0.73
BROW_DROP = 0.0080                # brows sit closer to the eyes
BROW_TILT = 0.23                  # inner end lower, outer end higher
CANINE = 0.0013                   # extra canine length (subtle, human)
# resting expression, from the base's own keys
EXPR = {
    'lids': {'vrc.blink_Straight': 0.57},
    'mouth': {'mouthSmileLeft': 1.10, 'mouthSmileRight': 0.15, 'mouthDimpleLeft': 0.70, 'mouthLeft': 0.20,
              '口横広げ': 0.55},
    'brow': {},
}
LID_STATE_KEYS = ['vrc.blink', 'vrc.blink_Joy', 'vrc.blink_Straight', 'eyeBlinkLeft', 'eyeBlinkRight',
                  'まばたき', 'ウィンク２', 'ウィンク２右', '笑い', 'ウィンク', 'ウィンク右', 'なごみ', 'Smile2',
                  'Exhausted', 'Crying', 'Oops!', 'eyeBlinkLeft_Joy', 'eyeBlinkRight_Joy']


def _pchip(keys):
    xs = np.array([k[0] for k in keys])
    ys = np.array([k[1] for k in keys])
    h = np.diff(xs)
    d = np.diff(ys) / h
    m = np.zeros_like(xs)
    for i in range(1, len(xs) - 1):
        if d[i - 1] * d[i] > 0:
            w1, w2 = 2 * h[i] + h[i - 1], h[i] + 2 * h[i - 1]
            m[i] = (w1 + w2) / (w1 / d[i - 1] + w2 / d[i])

    def f(x):
        x = np.clip(x, xs[0], xs[-1])
        i = np.clip(np.searchsorted(xs, x, side='right') - 1, 0, len(xs) - 2)
        t = (x - xs[i]) / h[i]
        h00 = 2 * t ** 3 - 3 * t ** 2 + 1
        h10 = t ** 3 - 2 * t ** 2 + t
        h01 = -2 * t ** 3 + 3 * t ** 2
        h11 = t ** 3 - t ** 2
        return h00 * ys[i] + h10 * h[i] * m[i] + h01 * ys[i + 1] + h11 * h[i] * m[i + 1]
    return f


def sm(a, b, x):
    t = np.clip((x - a) / (b - a), 0.0, 1.0)
    return t * t * (3 - 2 * t)


def get_keys(me):
    kb = me.shape_keys.key_blocks
    n = len(me.vertices)
    out = {}
    for k in kb:
        a = np.empty(n * 3, np.float64)
        k.data.foreach_get('co', a)
        out[k.name] = a.reshape(n, 3)
    return out


def set_keys(me, keys):
    kb = me.shape_keys.key_blocks
    for k in kb:
        k.data.foreach_set('co', keys[k.name].ravel())
    me.vertices.foreach_set('co', keys['Basis'].ravel())
    me.update()


def idx(parts, *names):
    out = []
    for n in names:
        out += parts[n]
    return np.array(sorted(set(out)), dtype=np.int64)


def structural(head, parts, fparts, B):
    """returns the new basis coordinates S(B)"""
    me = head.data
    P = B.copy()
    n = len(P)
    dz = _pchip(Z_REMAP)
    zc_new = EYE_C[1] + float(dz(np.array([EYE_C[1]]))[0])

    # 1. feature heights
    P[:, 2] += dz(B[:, 2])

    # 1a. slightly broader face; fades out at the neck so the body seam is untouched
    P[:, 0] *= 1.0 + FACE_WIDEN * sm(1.306, 1.345, B[:, 2])

    # 1b. soften the chin tip (short, softly tapered rather than a point)
    wchin = (1.0 - sm(1.305, 1.334, B[:, 2])) * (B[:, 1] < -0.02) * (np.abs(B[:, 0]) < 0.05)
    P[:, 0] *= 1.0 + CHIN_SOFTEN * wchin

    # 2. eye slant (shear about each eye centre), everything but the iris
    eye_parts = idx(parts, 'iris_L', 'iris_R', 'pupil_L', 'pupil_R', 'highlight_L', 'highlight_R', 'fx')
    mask = np.ones(n, bool)
    mask[eye_parts] = False
    mask &= B[:, 1] < 0.0
    for sgn in (1.0, -1.0):
        dx = (P[:, 0] - sgn * EYE_C[0]) * sgn            # + towards the outer corner
        dzz = P[:, 2] - zc_new
        r = np.sqrt((dx / 0.031) ** 2 + (dzz / 0.024) ** 2)
        w = (1.0 - sm(1.0, 2.0, r)) * mask * (P[:, 0] * sgn > 0)
        slope = EYE_SLANT * (1.0 + (EYE_SLANT_OUTER - 1.0) * sm(0.0, 0.020, dx))
        P[:, 2] += slope * dx * w
        P[:, 0] -= sgn * EYE_INSET * w
        # outer lash wing: drawn out and upwards to a point
        wing = np.zeros(n, bool)
        wing[idx(parts, 'lash_upper' + ('_L' if sgn > 0 else '_R'), 'lash_tail' + ('_L' if sgn > 0 else '_R'))] = True
        u = np.clip((dx - 0.016) / 0.016, 0.0, 1.3) ** 1.5 * wing
        P[:, 0] += sgn * WING * u
        P[:, 2] += WING * 0.62 * u
        P[:, 1] += WING * 0.55 * u

    # 3. smaller irises (the base has very large, round moe irises)
    for side, sgn in (('_L', 1.0), ('_R', -1.0)):
        ids = idx(parts, 'iris' + side, 'pupil' + side, 'highlight' + side)
        ir = idx(parts, 'iris' + side)
        c = (P[ir].min(axis=0) + P[ir].max(axis=0)) / 2
        P[ids] = c + (P[ids] - c) * np.array([IRIS_SCALE, 1.0, IRIS_SCALE])
        # highlights: the base has four per eye. Keep a main one and a small
        # one, on the same screen side in both eyes and inside the part of
        # the iris the half-lowered lid leaves visible; tuck the rest away.
        R = (P[ir, 2].max() - P[ir, 2].min()) / 2
        hl = parts['highlight' + side]
        groups = [hl[i:i + 17] for i in range(0, len(hl), 17)]
        groups.sort(key=lambda g: -(P[g, 0].max() - P[g, 0].min()) * (P[g, 2].max() - P[g, 2].min()))
        spots = [(-0.42, -0.06, 1.20), (0.38, -0.30, 0.80)]
        for gi, g in enumerate(groups):
            g = np.array(g)
            gc = P[g].mean(axis=0)
            if gi < len(spots):
                ox, oz, sc = spots[gi]
                tgt = np.array([c[0] + ox * R, gc[1], c[2] + oz * R])
                P[g] = tgt + (P[g] - gc) * sc
            else:
                P[g] = np.array([c[0], c[1] + 0.004, c[2]]) + (P[g] - gc) * 0.01

    # 4. brows: lower, angled down towards the nose, kept on the skin surface
    face_ids = parts['face']
    remap = {v: i for i, v in enumerate(face_ids)}
    polys = [[remap[v] for v in p.vertices] for p in me.polygons if p.vertices[0] in remap]

    def tree(coords):
        return BVHTree.FromPolygons([Vector(coords[i]) for i in face_ids], polys)

    t_old = tree(B)
    t_new = tree(P)

    def skin_hit(t, x, z):
        hit = t.ray_cast(Vector((x, -0.5, z)), Vector((0, 1, 0)))
        if hit[0] is None:
            return None, None
        nrm = hit[1] if hit[1].y < 0 else -hit[1]
        return hit[0], nrm

    for side, sgn in (('_L', 1.0), ('_R', -1.0)):
        ids = parts['brow' + side]
        xs = B[ids, 0] * sgn
        x0, x1 = xs.min(), xs.max()
        for i in ids:
            t = (B[i, 0] * sgn - x0) / (x1 - x0)                 # 0 inner .. 1 outer
            # keep each vertex at its original height above the skin, measured
            # along the surface normal so the brow never sinks in on the temple
            near = t_old.find_nearest(Vector(B[i]))
            lift = max(near[3] if near[0] is not None else 0.0, 0.0007)
            z = P[i, 2] - BROW_DROP + BROW_TILT * (t - 0.5) * (x1 - x0)
            x = P[i, 0] - sgn * 0.0015 * (1 - t)
            hit, nrm = skin_hit(t_new, x, z)
            if hit is not None:
                P[i] = hit + nrm * lift

    # 4b. the double-eyelid strip is drawn wide in the base (it relied on a
    #     texture); slim it down to a crease line
    for side in ('_L', '_R'):
        ids = np.array(parts['lidline' + side])
        L = P[ids]
        order = np.argsort(L[:, 0])
        xs = L[order, 0]
        zs = L[order, 2]
        nb = 12
        edges = np.linspace(xs.min(), xs.max() + 1e-9, nb + 1)
        mid = np.zeros(nb)
        for b in range(nb):
            sel = (xs >= edges[b]) & (xs < edges[b + 1])
            mid[b] = zs[sel].mean() if sel.any() else np.nan
        good = ~np.isnan(mid)
        cx = (edges[:-1] + edges[1:]) / 2
        zmid = np.interp(L[:, 0], cx[good], mid[good])
        P[ids, 2] = zmid + (L[:, 2] - zmid) * 0.28 + 0.0012

    # 5. slightly prominent, rounded canines on the existing upper teeth
    ids = np.array(parts['teeth_upper'])
    T = P[ids]
    ax = np.abs(T[:, 0])
    zmin = T[:, 2].min()
    low = sm(zmin + 0.0045, zmin + 0.0012, T[:, 2] - 0.045 * ax)     # lower edge of the tooth band
    bump = np.exp(-((ax - 0.0100) / 0.0017) ** 2)
    P[ids, 2] -= CANINE * bump * low
    return P


def _env_expr():
    import os
    for grp in ('lids', 'mouth', 'brow'):
        v = os.environ.get('MF_' + grp.upper())
        if v is not None:
            EXPR[grp] = {k: float(w) for k, w in (kv.split('=') for kv in v.split(',') if kv)}


# Default: the base mesh's geometry is left exactly as authored. Her resting
# expression is only a set of shape-key values on the existing keys, so the
# Basis and every key stay untouched. RESHAPE=True restores the rejected
# landmark-driven reshape (kept only for comparison).
RESHAPE = False
REST_KEYS = {
    # neutral, haughty face matched to facial_atlas2.png Front (0) / Neutral in
    # the real viewer (tools/qa/face_batch.mjs): heavy flat upper lids, low
    # brows angled down towards the nose, small flat mouth slightly down
    'mf_cheek_slim': 1.0,
    'vrc.blink_Straight': 0.36,
    'browDownLeft': 1.4,
    'browDownRight': 1.4,
    '怒り': 0.45,
    '真面目': 0.2,
    'ｷﾘｯ': 0.3,
    'eyeSquintLeft': 0.2,
    'eyeSquintRight': 0.2,
    '口角下げ': 0.5,
    'mouthPressLeft': 0.25,
    'mouthPressRight': 0.25,
}


CHEEK_SLIM = 0.11      # how much narrower the cheeks get (fraction of their width)


def add_cheek_slim(head, parts):
    """Adds a shape key that slims the cheeks and lower face. The Basis and
    every authored key stay untouched; the key is only switched on in her
    resting expression (and can be dialled down or off)."""
    me = head.data
    if 'mf_cheek_slim' in me.shape_keys.key_blocks:
        return
    kb = head.shape_key_add(name='mf_cheek_slim', from_mix=False)
    ears = set(parts['ear_L']) | set(parts['ear_R'])
    moved = 0
    for i, v in enumerate(me.vertices):
        if i in ears:
            continue
        p = v.co
        ax = abs(p.x)
        # cheeks between the jaw and the lower eyelid, front half of the face only
        wz = float(sm(1.296, 1.316, p.z) * (1.0 - sm(1.350, 1.372, p.z)))
        wy = float(1.0 - sm(-0.030, 0.002, p.y))
        wx = float(sm(0.012, 0.045, ax))
        w = wz * wy * wx
        if w <= 0:
            continue
        kb.data[i].co.x = p.x * (1.0 - CHEEK_SLIM * w)
        moved += 1
    print('MF face: cheek-slim key on %d verts (basis untouched)' % moved)


def apply(head, parts, fparts):
    import os
    if not RESHAPE and os.environ.get('MF_RESHAPE') != '1':
        add_cheek_slim(head, parts)
        kb = head.data.shape_keys.key_blocks
        for k in kb:
            k.value = 0.0
        rest = dict(REST_KEYS)
        if os.environ.get('MF_REST') is not None:
            rest = {k: float(v) for k, v in (kv.split('=') for kv in os.environ['MF_REST'].split(',') if kv)}
        for k, v in rest.items():
            kb[k].slider_max = max(kb[k].slider_max, v)     # browDown is extrapolated past 1
            kb[k].value = v
        print('MF face: geometry untouched; rest keys %s' % rest)
        return
    _env_expr()
    me = head.data
    keys = get_keys(me)
    B = keys['Basis'].copy()
    S = structural(head, parts, fparts, B)
    off = S - B
    for name in keys:
        keys[name] = keys[name] + off
    # resting expression from the base's own keys
    n = len(B)
    e_lid = np.zeros((n, 3))
    e_rest = np.zeros((n, 3))
    orig = get_keys(me)
    for k, w in EXPR['lids'].items():
        e_lid += w * (orig[k] - B)
    for grp in ('mouth', 'brow'):
        for k, w in EXPR[grp].items():
            e_rest += w * (orig[k] - B)
    lid_support = np.linalg.norm(e_lid, axis=1) > 1e-6
    E = e_lid + e_rest
    for name in keys:
        if name in LID_STATE_KEYS:
            add = E.copy()
            add[lid_support] = e_rest[lid_support]
            if name != 'Basis':
                keys[name] = keys[name] + add
        else:
            keys[name] = keys[name] + E
    set_keys(me, keys)
    print('MF face: structural max shift %.4f, expression max shift %.4f' %
          (np.abs(off).max(), np.abs(E).max()))
