"""Hogwarts robe: open-front body shell with real thickness and green lining,
bell sleeves, draped hood and the Slytherin crest."""
import math
from math import sin, cos, pi, asin, atan2, radians, degrees
from mathutils import Vector
from .core import V, Part, Prof, lerp, clamp, smoothstep, spow, ring, chain_w, mix_w
from . import rig
from .outfit import panel_w, arm_s

X = Vector((1, 0, 0))
F = V(0, 1, 0)
Z = Vector((0, 0, 1))

#               z      rx     rf     rb     xe     e
ROBE = Prof([
    (1.398, 0.066, 0.044, 0.060, 0.040, 2.0),
    (1.378, 0.100, 0.058, 0.072, 0.044, 2.2),
    (1.356, 0.138, 0.071, 0.086, 0.048, 2.3),
    (1.320, 0.160, 0.087, 0.097, 0.054, 2.4),
    (1.250, 0.164, 0.103, 0.105, 0.062, 2.5),
    (1.150, 0.160, 0.105, 0.113, 0.068, 2.4),
    (1.050, 0.165, 0.110, 0.126, 0.075, 2.3),
    (0.900, 0.185, 0.127, 0.156, 0.090, 2.25),
    (0.600, 0.215, 0.160, 0.205, 0.112, 2.2),
    (0.350, 0.235, 0.182, 0.240, 0.126, 2.2),
    (0.150, 0.246, 0.196, 0.264, 0.134, 2.2),
])
HEM = rig.ROBE_HEM_Z
THICK = 0.007


def robe_c(z):
    return lerp(0.0, -0.008, smoothstep(1.10, 1.39, z))


def robe_pt(a, z, fold=True):
    rx, rf, rb, xe, e = ROBE(z)
    s, co = sin(a), cos(a)
    m = 1.0
    if fold:
        m += 0.040 * smoothstep(1.06, 0.45, z) * cos(7 * a + 0.7 * sin(3 * a) + 0.4)
        m += 0.012 * smoothstep(1.3, 0.9, z) * cos(13 * a + 1.3)
    return V(rx * m * spow(s, 2 / e), robe_c(z) + (rf if co >= 0 else rb) * m * spow(co, 2 / e), z)


def robe_edge_angle(z):
    rx, rf, rb, xe, e = ROBE(z)
    return asin(clamp(xe / rx) ** (e / 2))


def robe_at_x(x, z):
    rx, rf, rb, xe, e = ROBE(z)
    a = asin(clamp(abs(x) / rx) ** (e / 2))
    p = robe_pt(a, z, fold=False)
    return V(x, -p.y, z)


def robe_env(az_deg, z):
    """robe surface point for secondary bone placement"""
    return robe_pt(radians(az_deg), z, fold=False)


def robe_w(p):
    torso = chain_w(p.z, [('hips', 0), ('spine', 1.04), ('chest', 1.17)], 0.08)
    side = 'L' if p.x > 0 else 'R'
    sh = smoothstep(0.085, 0.150, abs(p.x)) * smoothstep(1.24, 1.33, p.z)
    if sh > 0:
        up = smoothstep(0.135, 0.165, abs(p.x)) * 0.45
        torso = mix_w(torso, {'shoulder_' + side: 1.0 - up, 'upperarm_' + side: up}, sh * 0.8)
    pw = smoothstep(1.03, 0.84, p.z)
    if pw <= 0:
        return torso
    az = degrees(atan2(p.x, -p.y))
    pan = panel_w(az, 'robe_', closed=False)
    low = smoothstep(0.70, 0.42, p.z)
    pan2 = {}
    for k, v in pan.items():
        pan2[k] = v * (1 - low)
        pan2[k + '_2'] = v * low
    return mix_w(torso, pan2, pw)


def build_robe_body():
    part = Part()
    zs = [1.398, 1.388, 1.378, 1.367, 1.356, 1.340, 1.320, 1.290, 1.250, 1.20, 1.15, 1.10, 1.05,
          1.00, 0.94, 0.88, 0.81, 0.74, 0.67, 0.60, 0.53, 0.46, 0.39, 0.32, 0.25, HEM]
    n = 72
    rows = []
    for z in zs:
        ae = robe_edge_angle(z)
        row = []
        for j in range(n):
            a = lerp(ae, 2 * pi - ae, j / (n - 1))
            zz = z
            if z == HEM:
                zz = HEM + 0.012 * cos(5 * a + 1.0) - 0.010 * smoothstep(0.5, 1.0, abs(sin(a / 2)))
            p = robe_pt(a, zz)
            row.append(p)
        rows.append(row)
    part.grid(rows, 'robe', centers=[V(0, 0, z) for z in zs])
    part.weight(robe_w)
    part.solidify(THICK, inner_mat='robe_lining')
    return part


def build_robe_sleeve():
    """left sleeve"""
    part = Part()
    d = rig.ARM_DIR_L
    o = rig.SHOULDER_L
    e_f = V(0, 1, 0)
    e_o = e_f.cross(d).normalized()
    if e_o.x < 0:
        e_o = -e_o                       # outward (away from the body)
    pr = Prof([(-0.03, 0.040, 0.046, 0.000), (0.05, 0.057, 0.056, 0.000), (0.15, 0.063, 0.058, 0.004),
               (0.25, 0.069, 0.061, 0.008), (0.35, 0.078, 0.066, 0.014), (0.45, 0.092, 0.072, 0.020),
               (0.53, 0.104, 0.078, 0.025)])
    ss = [-0.03, 0.0, 0.03, 0.07, 0.11, 0.15, 0.19, 0.22, 0.25, 0.28, 0.31, 0.35, 0.39, 0.43, 0.47, 0.505]
    n = 24
    rows, cents = [], []
    for i, s in enumerate(ss):
        ro, rf, off = pr(s)
        c = o + d * s + e_o * off + e_f * (-0.006 * smoothstep(0.2, 0.5, s))
        row = []
        last = i == len(ss) - 1
        for j in range(n):
            th = 2 * pi * j / n
            fold = 1.0 + 0.045 * smoothstep(0.15, 0.5, s) * cos(5 * th + 0.8)
            p = c + e_o * (ro * fold * cos(th)) + e_f * (rf * fold * sin(th))
            if last:
                p = p + d * (0.030 * cos(th) + 0.010 * cos(2 * th + 1.0))
            row.append(p)
        rows.append(row)
        cents.append(c)
    part.grid(rows, 'robe', closed=True, centers=cents, cap_start=o + d * -0.045)

    def w(p):
        s = arm_s(p)
        return chain_w(s, [('shoulder_L', -9), ('upperarm_L', 0.01), ('forearm_L', rig.UPPERARM_LEN)],
                       [0, 0.09, 0.11])
    part.weight(w)
    part.solidify(0.006, inner_mat='robe_lining')
    return part


def build_hood():
    part = Part()
    axis_f = -0.012
    bag = [(0.060, 1.402), (0.100, 1.338), (0.113, 1.245), (0.128, 1.205), (0.148, 1.232),
           (0.154, 1.286), (0.147, 1.300)]
    nphi = 49
    nt = len(bag)
    cols = []
    for j in range(nphi):
        phi = radians(lerp(-152.0, 152.0, j / (nphi - 1)))       # 0 = back centre
        ap = abs(phi)
        D = smoothstep(radians(100), radians(25), ap)
        lap = smoothstep(radians(105), radians(152), ap)          # front lapel
        wband = lerp(1.0, 0.35, lap)
        col = []
        for k in range(nt):
            t = k / (nt - 1)
            r_band = 0.062 + 0.060 * t * wband
            z_band = 1.403 - 0.014 * t + 0.007 * sin(pi * t) - lap * (0.030 + 0.050 * t)
            rb_, zb_ = bag[k]
            r = lerp(r_band, rb_, D)
            z = lerp(z_band, zb_, D)
            stretch = 1.0 + 0.30 * sin(phi) ** 2 * (1 - lap * 0.6)
            x = r * stretch * sin(phi)
            f = axis_f - r * cos(phi) * lerp(1.0, 0.80, lap)
            col.append(V(x, f, z))
        cols.append(col)
    rows = [[cols[j][k] for j in range(nphi)] for k in range(nt)]
    f0 = len(part.f)
    idx = part.grid(rows, 'robe', flip=False)
    # the outer layer at the back centre must face backwards (+Y in Blender)
    probe = None
    target = (idx[nt - 3][nphi // 2], idx[nt - 2][nphi // 2])
    for fi in range(f0, len(part.f)):
        if target[0] in part.f[fi] and target[1] in part.f[fi]:
            probe = fi
            break
    if part._fnormal(probe).y < 0:
        part.flip_faces(f0)

    def w(p):
        base = chain_w(p.z, [('spine', 0), ('chest', 1.17)], 0.08)
        sh = smoothstep(0.085, 0.150, abs(p.x)) * smoothstep(1.30, 1.36, p.z) * 0.6
        if sh > 0:
            base = mix_w(base, {'shoulder_L' if p.x > 0 else 'shoulder_R': 1.0}, sh)
        return base
    part.weight(w)
    part.solidify(0.006, inner_mat='robe_lining')
    return part


def build_crest():
    part = Part()
    cx, cz = 0.108, 1.262
    e = 0.004
    p0 = robe_at_x(cx, cz)
    px = robe_at_x(cx + e, cz) - robe_at_x(cx - e, cz)
    pz = robe_at_x(cx, cz + e) - robe_at_x(cx, cz - e)
    n = px.cross(pz).normalized()
    if n.y > 0:
        n = -n
    eu = px.normalized()
    ev = n.cross(eu).normalized()
    if ev.z < 0:
        ev = -ev

    def P(u, v, h):
        return p0 + eu * u + ev * v + n * h

    half = [(0.0, 0.0235), (0.0055, 0.0215), (0.0120, 0.0230), (0.0185, 0.0262), (0.0215, 0.0240),
            (0.0212, 0.0120), (0.0210, 0.0010), (0.0190, -0.0090), (0.0140, -0.0180),
            (0.0070, -0.0245), (0.0, -0.0285)]
    outline = half + [(-u, v) for u, v in reversed(half[1:-1])]

    def plate(scale, h0, h1, mat):
        f0 = len(part.f)
        top = [part.vert(P(u * scale, v * scale, h1)) for u, v in outline]
        bot = [part.vert(P(u * scale * 1.03, v * scale * 1.03, h0)) for u, v in outline]
        c = part.vert(P(0, 0, h1 + 0.0006))
        m = len(outline)
        for i in range(m):
            i2 = (i + 1) % m
            part.face((c, top[i], top[i2]), mat)
            part.face((top[i], bot[i], bot[i2], top[i2]), mat)
        part.orient(f0, inside=P(0, 0, h0 - 0.002))

    plate(1.0, -0.0005, 0.0022, 'crest_silver')
    plate(0.80, 0.0018, 0.0034, 'crest_green')
    # serpent
    pts = []
    for i in range(25):
        t = i / 24
        v = lerp(0.0125, -0.0150, t)
        u = -0.0068 * sin(2 * pi * t * 1.02 + 0.25) * lerp(0.75, 1.0, t)
        pts.append(P(u, v, 0.0042))
    rows, cents = [], []
    for i, p in enumerate(pts):
        a = pts[max(i - 1, 0)]
        b = pts[min(i + 1, len(pts) - 1)]
        t = (b - a).normalized()
        s = t.cross(n).normalized()
        k = i / 24
        r = 0.0019 * (1.55 if k < 0.08 else 1.0) * lerp(1.0, 0.35, smoothstep(0.75, 1.0, k))
        rows.append(ring(p, s, n, r, r * 0.8, 6))
        cents.append(p)
    part.grid(rows, 'crest_silver', closed=True, centers=cents, cap_start=pts[0] + (pts[0] - pts[1]) * 0.6,
              cap_end=pts[-1] + (pts[-1] - pts[-2]) * 0.5)
    w = robe_w(p0)
    part.weight(lambda p: dict(w))
    return part
