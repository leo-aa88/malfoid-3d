"""Uniform under the robe: shirt, collar, tie, V-neck sweater, pleated skirt,
shirt sleeves and loafers."""
import math
from math import sin, cos, pi, asin, atan2, radians, degrees
from mathutils import Vector
from .core import V, Part, Prof, lerp, clamp, smoothstep, spow, ring, chain_w, mix_w
from . import rig

X = Vector((1, 0, 0))
F = V(0, 1, 0)
Z = Vector((0, 0, 1))

#                 z      rx     rf     rb     e
TORSO = Prof([
    (1.040, 0.100, 0.078, 0.084, 2.3),
    (1.075, 0.097, 0.076, 0.080, 2.3),
    (1.120, 0.088, 0.072, 0.070, 2.3),
    (1.180, 0.096, 0.082, 0.070, 2.3),
    (1.250, 0.112, 0.094, 0.074, 2.4),
    (1.300, 0.122, 0.088, 0.078, 2.5),
    (1.335, 0.130, 0.074, 0.076, 2.6),
    (1.360, 0.118, 0.060, 0.068, 2.4),
    (1.378, 0.090, 0.050, 0.060, 2.2),
    (1.392, 0.058, 0.042, 0.052, 2.0),
])


def torso_c(z):
    return lerp(0.0, -0.010, smoothstep(1.10, 1.39, z))


def torso_pt(a, z, lift=0.0):
    rx, rf, rb, e = TORSO(z)
    s, co = sin(a), cos(a)
    r = rf if co >= 0 else rb
    return V((rx + lift) * spow(s, 2 / e), torso_c(z) + (r + lift) * spow(co, 2 / e), z)


def torso_at_x(x, z, lift=0.0):
    """front torso surface point at lateral position x"""
    rx, rf, rb, e = TORSO(z)
    q = clamp(abs(x) / (rx + lift), 0.0, 1.0)
    a = asin(q ** (e / 2))
    p = torso_pt(a, z, lift)
    return V(x, -p.y, z)


def torso_w(p):
    w = chain_w(p.z, [('hips', 0), ('spine', 1.04), ('chest', 1.17)], 0.08)
    sh = smoothstep(0.075, 0.135, abs(p.x)) * smoothstep(1.26, 1.33, p.z) * 0.7
    if sh > 0:
        w = mix_w(w, {'shoulder_L' if p.x > 0 else 'shoulder_R': 1.0}, sh)
    return w


V_BOTTOM = 1.262


def v_half(z):
    return max(0.0, z - V_BOTTOM) * 0.375


def build_sweater():
    part = Part()
    zs = [1.040, 1.052, 1.064, 1.075, 1.076, 1.095, 1.12, 1.15, 1.18, 1.21, 1.24, 1.262, 1.275,
          1.29, 1.305, 1.32, 1.335, 1.348, 1.36, 1.37, 1.378, 1.386, 1.392]
    n = 48
    angs = [2 * pi * j / n for j in range(n)]
    idx = []
    inside = set()
    for z in zs:
        row = []
        xv = v_half(z)
        rx, rf, rb, e = TORSO(z)
        band = 0.0025 if z <= 1.0755 else 0.0
        pts = [torso_pt(a, z, band) for a in angs]
        ins = [cos(a) > 0 and abs(p.x) < xv - 1e-5 for a, p in zip(angs, pts)]
        for j, a in enumerate(angs):
            p = pts[j]
            if xv > 0 and not ins[j] and cos(a) > 0 and (ins[(j - 1) % n] or ins[(j + 1) % n]):
                av = asin(clamp(xv / rx) ** (e / 2))
                p = torso_pt(av if sin(a) > 0 else -av, z, band)
            vi = part.vert(p)
            if ins[j]:
                inside.add(vi)
            row.append(vi)
        idx.append(row)
    f0 = len(part.f)
    for i in range(len(zs) - 1):
        mat = 'sweater_trim' if zs[i + 1] <= 1.0755 else 'sweater'
        for j in range(n):
            j2 = (j + 1) % n
            q = [idx[i][j], idx[i][j2], idx[i + 1][j2], idx[i + 1][j]]
            uv = [(j / n, i / 22), ((j + 1) / n, i / 22), ((j + 1) / n, (i + 1) / 22), (j / n, (i + 1) / 22)]
            keep = [k for k in range(4) if q[k] not in inside]
            if len(keep) == 4:
                part.face(q, mat, uv)
            elif len(keep) == 3:
                part.face([q[k] for k in keep], mat, [uv[k] for k in keep])
    part.orient(f0, inside=V(0, 0, 1.2))
    # V-neck trim band
    for s in (1, -1):
        rows = []
        zz = [lerp(V_BOTTOM - 0.012, 1.392, i / 14) for i in range(15)]
        for z in zz:
            xv = v_half(max(z, V_BOTTOM)) if z >= V_BOTTOM else 0.0
            off = 0.0 if z >= V_BOTTOM else (V_BOTTOM - z) * 0.0
            x0 = max(xv - 0.0012, 0.0)
            x1 = xv + 0.0095
            if z < V_BOTTOM:
                x0, x1 = 0.0, 0.0095 * (z - (V_BOTTOM - 0.012)) / 0.012 + 0.0005
            rows.append([torso_at_x(s * x0, z, 0.0016), torso_at_x(s * lerp(x0, x1, 0.5), z, 0.0024),
                         torso_at_x(s * x1, z, 0.0012)])
        part.grid(rows, 'sweater_trim', outward=V(0, 1, 0))
    part.weight(torso_w)
    return part


def build_shirt():
    part = Part()
    zs = [1.20, 1.23, 1.26, 1.29, 1.32, 1.345, 1.362, 1.376, 1.386, 1.393]
    n = 40
    rows = [[torso_pt(2 * pi * j / n, z, -0.0042) for j in range(n)] for z in zs]
    # neck band + collar stand
    for z, r in ((1.398, 0.0490), (1.408, 0.0462), (1.419, 0.0455)):
        c = V(0, -0.0135, z)
        rows.append([c + X * (r * sin(2 * pi * j / n)) + F * (r * 0.97 * cos(2 * pi * j / n)) for j in range(n)])
    part.grid(rows, 'shirt', closed=True, centers=[V(0, -0.01, z) for z in zs] + [V(0, -0.0135, z) for z in (1.398, 1.408, 1.419)])
    # collar fall (folded wings), open at the front for the tie knot
    a0 = radians(10.0)
    na = 44
    rows = [[] for _ in range(5)]
    for j in range(na):
        a = lerp(a0, 2 * pi - a0, j / (na - 1))
        da = min(a, 2 * pi - a)                       # angular distance from the front
        tip = smoothstep(radians(70), radians(12), da)
        ztop = lerp(1.4205, 1.4100, smoothstep(radians(110), radians(15), da))
        length = 0.030 + 0.030 * tip
        r_top = 0.0470
        for k, t in enumerate((0.0, 0.25, 0.5, 0.75, 1.0)):
            r = r_top + 0.0035 * sin(pi * min(t * 2, 1.0) * 0.5) + length * t * lerp(0.42, 0.30, tip)
            z = ztop + 0.0025 * sin(pi * min(t * 3, 1.0)) - length * t * lerp(0.92, 0.98, tip)
            fwd_push = 0.010 * tip * t
            rows[k].append(V(r * sin(a), -0.0135 + r * 0.97 * cos(a) + fwd_push, z))
    collar = Part()
    collar.grid(rows, 'shirt', inside=V(0, -0.0135, 1.40))
    collar.solidify(0.0022)
    part.merge(collar)
    part.weight(lambda p: chain_w(p.z, [('chest', 0), ('neck', 1.405)], 0.03))
    return part


def build_tie():
    part = Part()
    # knot
    rows, cents = [], []
    for z, hw, th in ((1.4015, 0.0100, 0.0050), (1.3985, 0.0135, 0.0066), (1.390, 0.0128, 0.0072),
                      (1.380, 0.0110, 0.0068), (1.372, 0.0096, 0.0058), (1.3695, 0.0080, 0.0040)):
        c = V(0, -torso_at_x(0, min(z, 1.39), -0.0042).y + 0.0050 + (1.40 - z) * 0.05, z)
        rows.append(ring(c, X, F, hw, th, 14, e=3.0))
        cents.append(c)
    part.grid(rows, 'tie', closed=True, centers=cents, cap_start=cents[0] + Z * 0.0008,
              cap_end=cents[-1] - Z * 0.0008)
    # blade with diagonal stripes
    slope = 0.85
    step = 0.0042
    pattern = ['tie', 'tie', 'tie', 'tie', 'tie', 'tie_stripe', 'tie', 'tie_stripe']
    ncol = 9
    ztop, zbot = 1.374, 1.205

    def hw(z):
        return lerp(0.0150, 0.0225, clamp((ztop - z) / 0.16))

    q = 1.40
    k = 0
    prev = None
    f0 = len(part.f)
    while q > 1.17:
        row = []
        for j in range(ncol):
            u = lerp(-1, 1, j / (ncol - 1))
            z0 = clamp(q + slope * u * 0.019, zbot, ztop)
            x = u * hw(z0)
            p = torso_at_x(x, z0, -0.0012 + 0.0012 * (1 - u * u))
            row.append(part.vert(p))
        if prev is not None:
            mat = pattern[k % len(pattern)]
            for j in range(ncol - 1):
                part.face((prev[j], prev[j + 1], row[j + 1], row[j]), mat,
                          [(j / 8, q), ((j + 1) / 8, q), ((j + 1) / 8, q - step), (j / 8, q - step)])
            k += 1
        prev = row
        q -= step
    part.orient(f0, outward=V(0, 1, 0))
    part.weight(lambda p: chain_w(p.z, [('spine', 0), ('chest', 1.17)], 0.08))
    return part


def panel_w(az_deg, prefix, closed=True):
    """partition of unity over the 6 panel bones by azimuth (deg, + = left)"""
    order = ['F_L', 'S_L', 'B_L', 'B_R', 'S_R', 'F_R']
    cents = [32.0, 92.0, 152.0, 208.0, 268.0, 328.0]
    a = az_deg % 360.0
    out = {}
    for i in range(6):
        c0, c1 = cents[i], cents[(i + 1) % 6]
        if i == 5:
            c1 += 360.0
        aa = a if a >= cents[0] else a + 360.0
        if c0 <= aa <= c1:
            if i == 5 and not closed:
                # open garment: no blending across the front gap
                k = order[5] if aa < 360.0 else order[0]
                out[prefix + k] = 1.0
                return out
            t = smoothstep(c0, c1, aa)
            out[prefix + order[i]] = 1 - t
            out[prefix + order[(i + 1) % 6]] = out.get(prefix + order[(i + 1) % 6], 0.0) + t
            return out
    return {prefix + 'F_L': 1.0}


SKIRT = Prof([(1.070, 0.088, 0.068, 0.072), (1.035, 0.099, 0.077, 0.083), (0.985, 0.117, 0.093, 0.102),
              (0.900, 0.146, 0.121, 0.132), (0.800, 0.178, 0.152, 0.163)])
SKIRT_HEM = 0.805


def build_skirt():
    part = Part()
    npl = 22
    sub = [0.0, 0.2, 0.4, 0.6, 0.78, 0.86, 0.93]
    zs = [1.070, 1.050, 1.030, 1.005, 0.975, 0.945, 0.915, 0.885, 0.855, 0.830, SKIRT_HEM]
    rows = []
    for z in zs:
        rx, rf, rb = SKIRT(z)
        amp = 0.075 * smoothstep(1.045, 0.86, z)
        row = []
        for k in range(npl):
            for p in sub:
                a = 2 * pi * (k + p) / npl
                saw = (p / 0.86 - 0.5) if p <= 0.86 else (0.5 - (p - 0.86) / 0.14)
                m = 1.0 + amp * saw
                s, co = sin(a), cos(a)
                row.append(V(rx * m * spow(s, 2 / 2.2), (rf if co >= 0 else rb) * m * spow(co, 2 / 2.2), z))
        rows.append(row)
    part.grid(rows, 'skirt', closed=True, centers=[V(0, 0, z) for z in zs])

    def w(p):
        az = degrees(atan2(p.x, -p.y))
        pw = smoothstep(1.02, 0.87, p.z) * 0.94
        return mix_w({'hips': 1.0}, panel_w(az, 'skirt_'), pw)
    part.weight(w)
    part.solidify(0.003, inner_mat='skirt_inner')
    return part


def build_sleeve_shirt():
    """left shirt sleeve with cuff"""
    part = Part()
    d = rig.ARM_DIR_L
    o = rig.SHOULDER_L
    e1 = V(0, 1, 0)
    e2 = d.cross(e1).normalized()
    pr = Prof([(-0.025, 0.038), (0.0, 0.0465), (0.08, 0.0440), (0.25, 0.0385), (0.35, 0.0375),
               (0.425, 0.0355), (0.438, 0.0300), (0.442, 0.0318), (0.478, 0.0310)])
    ss = [-0.025, -0.01, 0.01, 0.04, 0.08, 0.12, 0.16, 0.20, 0.225, 0.25, 0.275, 0.30, 0.34, 0.38,
          0.415, 0.432, 0.438, 0.442, 0.46, 0.478]
    rows, cents = [], []
    for s in ss:
        c = o + d * s
        r = pr(s)
        rows.append(ring(c, e1, e2, r, r, 16))
        cents.append(c)
    part.grid(rows, 'shirt', closed=True, centers=cents, cap_start=o + d * -0.035)
    # cuff end ring folds inwards
    c = o + d * 0.478
    inner = ring(c, e1, e2, 0.0235, 0.0235, 16)
    last = list(range(len(part.v) - 1 - 16, len(part.v) - 1))
    ids = [part.vert(p) for p in inner]
    f0 = len(part.f)
    for j in range(16):
        j2 = (j + 1) % 16
        part.face((last[j], last[j2], ids[j2], ids[j]), 'shirt')
    part.orient(f0, outward=d)
    part.weight(arm_w)
    return part


def arm_s(p):
    return (p - rig.SHOULDER_L).dot(rig.ARM_DIR_L)


def arm_w(p, hand=True):
    s = arm_s(p)
    stops = [('shoulder_L', -9), ('upperarm_L', 0.005), ('forearm_L', rig.UPPERARM_LEN)]
    widths = [0, 0.07, 0.09]
    if hand:
        stops.append(('hand_L', rig.UPPERARM_LEN + rig.FOREARM_LEN + 0.004))
        widths.append(0.03)
    return chain_w(s, stops, widths)


def build_shoe():
    """left loafer + sole"""
    part = Part()
    ax, af = 0.064, -0.012
    hwp = Prof([(-0.066, 0.012), (-0.058, 0.026), (-0.035, 0.0345), (0.0, 0.0375), (0.05, 0.0415),
                (0.10, 0.0460), (0.14, 0.0430), (0.162, 0.0320), (0.172, 0.016)])
    htp = Prof([(-0.066, 0.040), (-0.05, 0.060), (-0.02, 0.065), (0.012, 0.064), (0.04, 0.056),
                (0.07, 0.046), (0.10, 0.038), (0.14, 0.031), (0.162, 0.024), (0.172, 0.014)])
    ss = [-0.066, -0.060, -0.05, -0.035, -0.02, 0.0, 0.02, 0.04, 0.06, 0.08, 0.10, 0.12, 0.14, 0.155,
          0.165, 0.172]
    zs0 = 0.026

    def w(p):
        s = -p.y - af
        return mix_w({'foot_L': 1.0}, {'toe_L': 1.0}, smoothstep(0.095, 0.135, s))

    rows, cents = [], []
    for s in ss:
        c = V(ax + 0.004 * smoothstep(0.0, 0.17, s), af + s, zs0)
        rows.append(ring(c, X, Z, hwp(s), htp(s) - 0.004, 20, e=2.5, rv_neg=0.006))
        cents.append(c)
    part.grid(rows, 'shoe', closed=True, centers=cents, cap_start=V(ax, af - 0.069, zs0 + 0.012),
              cap_end=V(ax + 0.004, af + 0.176, zs0 + 0.004))
    # saddle strap over the vamp
    rows = []
    for s in (0.040, 0.050, 0.066, 0.076):
        row = []
        lift = 0.0028 if 0.045 < s < 0.07 else 0.0005
        for k in range(13):
            a = lerp(radians(8), radians(172), k / 12)
            hw, ht = hwp(s) + lift, htp(s) - 0.004 + lift
            row.append(V(ax + 0.004 * smoothstep(0.0, 0.17, s) + hw * spow(cos(a), 2 / 2.5),
                         af + s, zs0 + ht * spow(sin(a), 2 / 2.5)))
        rows.append(row)
    part.grid(rows, 'shoe', outward=V(0, 0, 1))
    # sole and heel
    rows, cents = [], []
    for s in [-0.070, -0.064, -0.05, -0.03, -0.012, -0.008, 0.02, 0.05, 0.052, 0.08, 0.10, 0.12, 0.14,
              0.158, 0.170, 0.177]:
        arch = 0.009 if -0.010 < s < 0.051 else 0.0
        top = 0.0245
        c = V(ax + 0.004 * smoothstep(0.0, 0.17, s), af + s, (top + arch) / 2)
        hw = hwp(clamp(s, -0.064, 0.170)) + 0.0045
        rows.append(ring(c, X, Z, hw, (top - arch) / 2, 16, e=5.0))
        cents.append(c)
    part.grid(rows, 'shoe_sole', closed=True, centers=cents, cap_start=V(ax, af - 0.072, 0.012),
              cap_end=V(ax + 0.004, af + 0.180, 0.012))
    part.weight(w)
    return part
