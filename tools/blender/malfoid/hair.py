"""Malfoid's hair, sculpted around the reshaped base head.

Structure (see facial_atlas.png, "Hair Details"):
  * a smooth base volume that follows the skull, with a centre part and a
    soft "M" hairline;
  * broad, softly curved locks with a crescent cross-section that taper to
    a point: curtain bangs sweeping from the part, face-framing locks in
    front of the ears, long layered back hair that gets wavy at the ends.

Every lock is one smooth surface; roots start inside the base volume and
neighbours overlap like roof tiles, so there are no exposed ends or gaps.
"""
import math
import random
from math import sin, cos, pi, radians
import bpy
from mathutils import Vector
from .meshutil import MeshData, bvh_of, catmull, sstep, lerp

SKULL_C = Vector((0.0, 0.028, 1.445))
BODY_AXIS_Y = 0.02
# hairline elevation (deg above the skull centre) by azimuth from the front
HAIRLINE = [(0, 33.0), (10, 33.8), (30, 34.0), (48, 27.0), (63, 13.0), (76, -4.0), (86, -13.0),
            (95, -15.0), (108, -18.0), (122, -40.0), (150, -52.0), (180, -52.0)]
CAP_LIFT = 0.0105
BACK_CLEAR = 0.020           # room for the robe / hood under the back hair
FRONT_CLEAR = 0.014


def _interp(keys, x):
    for (x0, y0), (x1, y1) in zip(keys, keys[1:]):
        if x <= x1:
            t = (x - x0) / (x1 - x0)
            t = t * t * (3 - 2 * t)
            return lerp(y0, y1, t)
    return keys[-1][1]


class Fit:
    def __init__(self, head, parts, body):
        self.skull = bvh_of(head, parts['face'])
        self.body = bvh_of(body) if body is not None else None

    def s(self, theta, phi, lift=0.0):
        """point on the skull at azimuth theta (0 front, + character's left)
        and elevation phi, lifted radially"""
        th, ph = radians(theta), radians(phi)
        d = Vector((sin(th) * cos(ph), -cos(th) * cos(ph), sin(ph)))
        hit = self.skull.ray_cast(SKULL_C + d * 0.5, -d)
        p = hit[0] if hit[0] is not None else SKULL_C + d * 0.09
        return p + d * lift

    def x(self, x, z, lift=0.0):
        """point over the front of the skull that appears at (x, z) in the
        front view, lifted radially. Lets the fringe be laid out directly
        against the reference's front view."""
        tx = x
        p = None
        for _ in range(3):
            hit = self.skull.ray_cast(Vector((tx, -1.0, z)), Vector((0, 1, 0)))
            if hit[0] is None:
                break
            d = (hit[0] - SKULL_C).normalized()
            p = hit[0] + d * lift
            tx += x - p.x
        return p if p is not None else self.s(60 if x > 0 else -60, 0, lift)

    def c(self, theta, z, lift=0.0):
        """point on the side of the head at height z, found with a
        horizontal ray (stable on the cheek / jaw where s() and x() graze)"""
        th = radians(theta)
        d = Vector((sin(th), -cos(th), 0.0))
        o = Vector((0.0, SKULL_C.y, z))
        hit = self.skull.ray_cast(o + d * 0.5, -d)
        p = hit[0] if hit[0] is not None else o + d * 0.07
        return p + d * lift

    def y(self, sgn, y, z, lift=0.0, xmin=0.0):
        """point beside the head at depth y and height z: just outside the
        head's side silhouette there (never closer to the centre than xmin,
        so a strand keeps hanging straight once it passes the jaw)"""
        hit = self.skull.ray_cast(Vector((sgn * 1.0, y, z)), Vector((-sgn, 0, 0)))
        xs = abs(hit[0].x) if hit[0] is not None else 0.0
        return Vector((sgn * max(xs + lift, xmin), y, z))

    def b(self, x, z, clear, where, default_y=None):
        """point hanging in front of / behind the body at (x, z)"""
        if self.body is not None:
            if where == 'front':
                hit = self.body.ray_cast(Vector((x, -1.0, z)), Vector((0, 1, 0)))
                if hit[0] is not None:
                    return Vector((x, hit[0].y - clear, z))
            else:
                hit = self.body.ray_cast(Vector((x, 1.0, z)), Vector((0, -1, 0)))
                if hit[0] is not None:
                    return Vector((x, hit[0].y + clear, z))
        if default_y is None:
            default_y = -0.06 if where == 'front' else 0.10
        return Vector((x, default_y, z))

    def resolve(self, spec, sgn):
        out = []
        for p in spec:
            k = p[0]
            if k == 's':
                out.append(self.s(p[1] * sgn, p[2], p[3]))
            elif k == 'f':
                out.append(Vector((p[1] * sgn, p[2], p[3])))
            elif k == 'x':
                out.append(self.x(p[1] * sgn, p[2], p[3]))
            elif k == 'c':
                out.append(self.c(p[1] * sgn, p[2], p[3]))
            elif k == 'y':
                out.append(self.y(sgn, p[1], p[2], p[3], p[4] if len(p) > 4 else 0.0))
            else:
                out.append(self.b(p[1] * sgn, p[2], p[3], p[4]))
        return out


def cap(md, fit):
    """smooth base volume following the skull"""
    nth = 72
    ts = [0.0, 0.035, 0.09, 0.17, 0.27, 0.38, 0.5, 0.62, 0.74, 0.85, 0.93, 0.975]
    rows = []
    for t in ts:
        row = []
        for j in range(nth):
            th = -180.0 + 360.0 * j / nth
            ph0 = _interp(HAIRLINE, abs(th))
            ph = lerp(ph0, 90.0, t ** 0.92)
            lift = lerp(0.0015, CAP_LIFT, sstep(0.0, 0.2, t))
            # the centre part: a shallow groove running front to back
            groove = 0.0032 * math.exp(-(sin(radians(th)) * cos(radians(ph)) / 0.055) ** 2) * sstep(0.1, 0.4, t)
            row.append(fit.s(th, ph, lift - groove))
        rows.append(row)
    top = fit.s(0, 90, CAP_LIFT - 0.0032)
    # the rows at the hairline are the shadowed roots under the bangs
    md.add_grid(rows[:4], 'mf_hair_dark', closed=True, flip=True)
    md.add_grid(rows[3:], 'mf_hair', closed=True, cap_end=top, flip=True)
    # mark the first rows (roots at the hairline) so they read slightly darker
    return len(rows) * nth


def lock(md, fit, pts, width, thick, mat='mf_hair', n=44, seg=14, root=0.22, tip_from=0.72,
         wave=0.0, wave_len=0.17, phase=0.0, wave_from=1.24, wave_to=1.02, flip=False, bend=0.55,
         twist=0.0, curl=0.0, curl_side=1.0):
    """one tapered lock with a crescent cross-section along a smooth path"""
    path = catmull(pts, n)
    # gentle S-waves on the hanging part (wavy towards the ends)
    if wave:
        for i, p in enumerate(path):
            a = wave * sstep(wave_from, wave_to, p.z)
            if a > 0:
                out = Vector((p.x, p.y - BODY_AXIS_Y, 0))
                out = out.normalized() if out.length > 1e-6 else Vector((0, 1, 0))
                tan = Vector((-out.y, out.x, 0))
                psi = 2 * pi * (wave_from - p.z) / wave_len + phase
                path[i] = p + tan * (a * sin(psi)) + out * (a * 0.45 * cos(psi + 0.8))
    # tapered ends flick outwards / sideways
    if curl:
        for i, p in enumerate(path):
            c = sstep(0.78, 1.0, i / (n - 1)) ** 2 * curl
            if c > 0:
                out = Vector((p.x, p.y - BODY_AXIS_Y, 0))
                out = out.normalized() if out.length > 1e-6 else Vector((0, 1, 0))
                tan = Vector((-out.y, out.x, 0)) * curl_side
                path[i] = p + out * c + tan * (c * 0.8) + Vector((0, 0, c * 0.5))
    rows = []
    for i, p in enumerate(path):
        k = i / (n - 1)
        a = path[max(i - 1, 0)]
        b = path[min(i + 1, n - 1)]
        t = (b - a).normalized()
        # outward direction: from the skull centre on the head, from the body axis below
        o_head = (p - SKULL_C).normalized()
        o_body = Vector((p.x, p.y - BODY_AXIS_Y, 0))
        o_body = o_body.normalized() if o_body.length > 1e-6 else Vector((0, 1, 0))
        w = sstep(1.37, 1.29, p.z)
        o = o_head.lerp(o_body, w)
        nr = o - t * o.dot(t)
        if nr.length < 1e-6:
            nr = t.orthogonal()
        nr.normalize()
        bn = t.cross(nr).normalized()
        if twist:
            ang = twist * sin(k * pi)
            bn, nr = bn * cos(ang) + nr * sin(ang), nr * cos(ang) - bn * sin(ang)
        wf = lerp(root, 1.0, sstep(0.0, 0.22, k)) * (1.0 - sstep(tip_from, 1.0, k) ** 1.6 * 0.97)
        W = width * wf
        T = thick * (0.35 + 0.65 * wf ** 0.7) * lerp(0.60, 1.0, w)     # flatter where it lies on the skull
        ring = []
        for q in range(seg):
            ang = 2 * pi * q / seg
            cb, sn = cos(ang), sin(ang)
            u = cb * W * 0.5
            h = (sn if sn > 0 else sn * 0.30) * T * 0.5
            h -= bend * T * cb * cb                      # edges droop towards the head: crescent
            ring.append(p + bn * u + nr * h)
        rows.append(ring)
    tip = path[-1] + (path[-1] - path[-2]) * 0.6
    start = path[0] - (path[1] - path[0]) * 0.4
    md.add_grid(rows, mat, closed=True, cap_start=start, cap_end=tip, flip=flip)


def build(head, parts, mats, seed=11):
    rnd = random.Random(seed)
    body = bpy.data.objects.get('Body_All')
    fit = Fit(head, parts, body)
    md = MeshData()
    cap(md, fit)
    BK, FR = 'back', 'front'
    bc, fc = BACK_CLEAR, FRONT_CLEAR

    # --- back curtain: one continuous sheet under the long locks, so the
    #     back reads as a single mass of hair with no gaps. It stops higher
    #     than the locks so their tapered ends separate below it.
    nk = 15
    cols = []
    for k in range(nk):
        u = -1.0 + 2.0 * k / (nk - 1)
        th = 180.0 - 54.0 * u                     # wraps the back of the head, ear to ear
        xk = 0.158 * math.copysign(abs(u) ** 0.85, u)
        jag = 0.040 * (k % 2) + rnd.uniform(-0.010, 0.010) - 0.070 * math.exp(-(u / 0.35) ** 2)
        ctrl = [fit.s(th, -2, 0.0060), fit.s(th, -30, 0.0100), fit.b(xk * 0.78, 1.262, bc - 0.004, BK),
                fit.b(xk * 0.93, 1.180, bc - 0.004, BK), fit.b(xk, 1.110, bc - 0.004, BK),
                fit.b(xk * 1.02, 1.050 + jag, bc, BK), fit.b(xk * 1.00, 1.005 + jag, bc + 0.006, BK)]
        cols.append(catmull(ctrl, 30))
    rows = [[cols[k][i] for k in range(nk)] for i in range(30)]
    md.add_grid(rows, 'mf_hair', closed=False, flip=True)
    md.add_grid(rows, 'mf_hair', closed=False, flip=False)        # visible from both sides

    RL = 0.0205      # root lift: hair rises from the part before it falls (the soft "M")
    for sgn in (1.0, -1.0):
        fl = sgn < 0
        left = sgn > 0
        ph = 0.0 if left else 2.3
        jit = (lambda a, b: rnd.uniform(a, b))

        def L(spec, width, thick, **kw):
            kw.setdefault('curl_side', sgn)
            lock(md, fit, fit.resolve(spec, sgn), width, thick, flip=fl, **kw)

        # ---------------- long back hair: layered, S-waved, tapered ends
        back = [
            # root (theta, phi)      skull path                          x at z=1.25/1.12/1.00/tip, tip z
            ((176, 66), [(166, 40), (166, 4), (168, -40)], (0.026, 0.034, 0.038, 0.030), 0.880 if left else 0.905),
            ((172, 80), [(150, 60), (149, 26), (151, -8), (153, -40)], (0.062, 0.076, 0.084, 0.078), 0.935 if left else 0.915),
            ((170, 84), [(132, 66), (128, 30), (133, -6), (137, -38)], (0.096, 0.114, 0.128, 0.124), 0.900 if left else 0.945),
            ((8, 84), [(40, 72), (80, 50), (106, 22), (120, -8), (125, -36)], (0.122, 0.146, 0.164, 0.162), 0.960 if left else 0.925),
        ]
        for i, (root, sk, xs, ztip) in enumerate(back):
            spec = [('s', root[0], root[1], 0.004)]
            for j, (th, phh) in enumerate(sk):
                spec.append(('s', th, phh, 0.0145 if j == 0 else 0.0135))
            spec += [('b', xs[0], 1.250, bc + 0.006, BK), ('b', xs[1], 1.120, bc + 0.006, BK),
                     ('b', xs[2], 1.000, bc + 0.008, BK), ('b', xs[3], ztip, bc + 0.016, BK)]
            L(spec, 0.082 + jit(-0.004, 0.006), 0.015, wave=0.017, wave_len=0.19 + jit(-0.01, 0.02),
              phase=ph + 0.75 * i + jit(-0.2, 0.2), wave_from=1.30, wave_to=1.06, n=58, tip_from=0.56,
              curl=0.014, curl_side=sgn if i % 2 == 0 else -sgn)
        # outer flare: shorter side lock that kicks outwards, widening the silhouette
        L([('s', 100, 30, 0.0120), ('s', 116, 4, 0.0135), ('s', 123, -30, 0.0130), ('b', 0.132, 1.240, bc + 0.010, BK),
           ('b', 0.160, 1.150, bc + 0.010, BK), ('b', 0.178, 1.075, bc + 0.010, BK),
           ('b', 0.182, 1.020 if left else 0.985, bc + 0.016, BK)],
          0.066, 0.013, wave=0.015, phase=ph + 2.6, wave_from=1.28, wave_to=1.08, n=46, tip_from=0.52, curl=0.020)
        # in-between layer, a little shorter
        L([('s', 160, 30, 0.0100), ('s', 159, -8, 0.0120), ('s', 160, -42, 0.0125),
           ('b', 0.046, 1.250, bc + 0.012, BK), ('b', 0.056, 1.130, bc + 0.012, BK),
           ('b', 0.060, 1.040, bc + 0.014, BK), ('b', 0.054, 0.975 if left else 0.990, bc + 0.020, BK)],
          0.066, 0.013, wave=0.016, phase=ph + 0.4, wave_from=1.30, wave_to=1.06, n=46, tip_from=0.5, curl=0.012)
        L([('s', 140, 20, 0.0100), ('s', 141, -12, 0.0120), ('s', 143, -38, 0.0125),
           ('b', 0.082, 1.248, bc + 0.012, BK), ('b', 0.096, 1.140, bc + 0.012, BK),
           ('b', 0.106, 1.060, bc + 0.014, BK), ('b', 0.102, 1.000 if left else 0.972, bc + 0.020, BK)],
          0.064, 0.013, wave=0.016, phase=ph + 1.15, wave_from=1.30, wave_to=1.06, n=46, tip_from=0.5, curl=0.012,
          curl_side=-sgn)

        # ---------------- hair tucked behind the ear, falling over the shoulder to the chest
        L([('s', 4, 72, 0.004), ('s', 20, 61, RL), ('s', 50, 42, 0.0160), ('s', 76, 22, 0.0150),
           ('s', 96, 4, 0.0135), ('s', 110, -17, 0.0120), ('s', 112, -38, 0.0115),
           ('f', 0.094, 0.030, 1.292), ('f', 0.103, -0.008, 1.262), ('b', 0.100, 1.205, fc, FR),
           ('b', 0.094, 1.130, fc, FR), ('b', 0.090, 1.050, fc + 0.002, FR),
           ('b', 0.086, 0.985 if left else 1.010, fc + 0.008, FR)],
          0.056, 0.014, wave=0.012, phase=ph + 0.5, wave_from=1.22, wave_to=1.04, n=60, tip_from=0.6, curl=0.010)
        L([('s', 118, 4, 0.0100), ('s', 116, -20, 0.0115), ('s', 116, -40, 0.0115), ('f', 0.106, 0.034, 1.290),
           ('f', 0.118, 0.000, 1.262), ('b', 0.122, 1.200, fc, FR), ('b', 0.118, 1.130, fc + 0.002, FR),
           ('b', 0.112, 1.075 if left else 1.045, fc + 0.008, FR)],
          0.046, 0.012, wave=0.012, phase=ph + 1.6, wave_from=1.22, wave_to=1.06, n=46, tip_from=0.52, curl=0.014)

        # ---------------- front fringe (facial_atlas2.png, layer 3): long
        #   face-framing strands. They rise from the part, arc out over the
        #   forehead corner, pass outside the eye and run down beside the
        #   cheek edge in front of the ear, tapering below the jaw. They
        #   follow the jawline inwards so the hoop stays visible outside them.
        ztip = 1.215 if left else 1.185
        L([('s', 3, 57, 0.004), ('s', 10, 46, RL), ('s', 20, 34, 0.0185), ('s', 31, 22, 0.0170),
           ('s', 41, 10, 0.0160), ('s', 52, -2, 0.0145), ('s', 61, -13, 0.0130), ('s', 67, -23, 0.0115),
           ('y', -0.0160, 1.390, 0.0085), ('y', -0.0260, 1.369, 0.0065), ('y', -0.0335, 1.347, 0.0060),
           ('y', -0.0365, 1.323, 0.0065, 0.061), ('y', -0.0390, 1.292, 0.0075, 0.062),
           ('y', -0.0420, 1.255, 0.0085, 0.064), ('y', -0.0450, ztip, 0.0085, 0.065)],
          0.034, 0.010, n=64, tip_from=0.46, wave=0.005, wave_from=1.32, wave_to=1.22, phase=ph + 0.8,
          twist=0.18 * sgn, bend=0.45)
        # shorter layer over it: same sweep, ends at the jaw angle
        L([('s', 3, 62, 0.004), ('s', 12, 52, RL + 0.0015), ('s', 25, 41, 0.0205), ('s', 38, 29, 0.0195),
           ('s', 50, 16, 0.0180), ('s', 61, 3, 0.0160), ('s', 70, -10, 0.0140), ('s', 77, -22, 0.0120),
           ('s', 80, -31 if left else -28, 0.0105)],
          0.034, 0.010, n=52, tip_from=0.5, bend=0.45)
        if not left:
            # a loose extra strand on her right, for the asymmetry in the reference
            L([('s', 4, 59, 0.004), ('s', 9, 49, RL + 0.003), ('s', 17, 38, 0.0225), ('s', 27, 26, 0.0215),
               ('s', 37, 13, 0.0200), ('s', 47, 1, 0.0180), ('s', 57, -11, 0.0160), ('s', 66, -24, 0.0140),
               ('s', 69, -36, 0.0125)],
              0.020, 0.008, n=46, tip_from=0.45, bend=0.4)

    ob = md.to_object('Hair', mats, rig=bpy.data.objects.get('rig'))
    print('MF hair: %d verts, %d faces' % (len(md.v), len(md.f)))
    return ob
