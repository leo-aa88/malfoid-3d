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
         twist=0.0):
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
    #     back reads as a single mass of hair with no gaps
    nk = 15
    cols = []
    for k in range(nk):
        u = -1.0 + 2.0 * k / (nk - 1)
        th = 180.0 - 54.0 * u                     # wraps the back of the head, ear to ear
        xk = 0.150 * math.copysign(abs(u) ** 0.85, u)
        jag = 0.030 * (k % 2) + rnd.uniform(-0.008, 0.008)
        ctrl = [fit.s(th, -2, 0.0060), fit.s(th, -30, 0.0100), fit.b(xk * 0.80, 1.262, bc - 0.004, BK),
                fit.b(xk * 0.95, 1.170, bc - 0.004, BK), fit.b(xk, 1.080, bc - 0.004, BK),
                fit.b(xk * 0.98, 1.000 + jag, bc, BK), fit.b(xk * 0.93, 0.950 + jag, bc + 0.006, BK)]
        cols.append(catmull(ctrl, 30))
    rows = [[cols[k][i] for k in range(nk)] for i in range(30)]
    md.add_grid(rows, 'mf_hair', closed=False, flip=True)
    md.add_grid(rows, 'mf_hair', closed=False, flip=False)        # visible from both sides

    for sgn in (1.0, -1.0):
        fl = sgn < 0
        ph = 0.0 if sgn > 0 else 2.1

        def L(spec, width, thick, **kw):
            lock(md, fit, fit.resolve(spec, sgn), width, thick, flip=fl, **kw)

        # --- long back locks, outer layer (tile from the centre outwards)
        L([('s', 176, 66, 0.004), ('s', 166, 40, 0.0115), ('s', 166, 4, 0.0130), ('s', 168, -40, 0.0135),
           ('b', 0.026, 1.250, bc + 0.006, BK), ('b', 0.032, 1.110, bc + 0.006, BK),
           ('b', 0.030, 0.985, bc + 0.006, BK), ('b', 0.024, 0.885, bc + 0.014, BK)],
          0.084, 0.015, wave=0.010, phase=ph + 0.0, n=52)
        L([('s', 172, 80, 0.004), ('s', 142, 62, 0.0115), ('s', 139, 28, 0.0130), ('s', 143, -6, 0.0135),
           ('s', 146, -40, 0.0135), ('b', 0.078, 1.250, bc + 0.006, BK), ('b', 0.090, 1.120, bc + 0.006, BK),
           ('b', 0.094, 1.000, bc + 0.006, BK), ('b', 0.086, 0.915, bc + 0.014, BK)],
          0.086, 0.015, wave=0.011, phase=ph + 0.7, n=52)
        L([('s', 8, 84, 0.004), ('s', 40, 72, 0.0115), ('s', 80, 50, 0.0130), ('s', 106, 22, 0.0135),
           ('s', 120, -8, 0.0135), ('s', 125, -36, 0.0130), ('b', 0.122, 1.245, bc + 0.006, BK),
           ('b', 0.140, 1.140, bc + 0.006, BK), ('b', 0.148, 1.040, bc + 0.006, BK),
           ('b', 0.138, 0.950, bc + 0.014, BK)],
          0.082, 0.015, wave=0.011, phase=ph + 1.4, n=54)
        # in-between locks, a little shorter, for a layered edge
        L([('s', 158, 30, 0.0100), ('s', 157, -8, 0.0120), ('s', 158, -42, 0.0125),
           ('b', 0.054, 1.250, bc + 0.012, BK), ('b', 0.062, 1.120, bc + 0.012, BK),
           ('b', 0.064, 1.020, bc + 0.012, BK), ('b', 0.058, 0.955, bc + 0.018, BK)],
          0.070, 0.013, wave=0.011, phase=ph + 0.35, n=46)
        L([('s', 131, 20, 0.0100), ('s', 133, -12, 0.0120), ('s', 135, -38, 0.0125),
           ('b', 0.104, 1.248, bc + 0.012, BK), ('b', 0.118, 1.130, bc + 0.012, BK),
           ('b', 0.124, 1.040, bc + 0.012, BK), ('b', 0.116, 0.985, bc + 0.018, BK)],
          0.068, 0.013, wave=0.011, phase=ph + 1.05, n=46)

        # --- curtain that tucks behind the ear and falls over the shoulder to the chest
        L([('s', 4, 72, 0.004), ('s', 22, 60, 0.0120), ('s', 50, 42, 0.0150), ('s', 76, 22, 0.0150),
           ('s', 95, 4, 0.0135), ('s', 109, -17, 0.0120), ('s', 111, -38, 0.0115),
           ('f', 0.094, 0.030, 1.292), ('f', 0.103, -0.008, 1.262), ('b', 0.100, 1.205, fc, FR),
           ('b', 0.094, 1.130, fc, FR), ('b', 0.090, 1.050, fc + 0.002, FR), ('b', 0.086, 0.985, fc + 0.008, FR)],
          0.058, 0.014, wave=0.008, phase=ph + 0.5, wave_from=1.20, wave_to=1.02, n=58)

        # --- face-framing curtain bang: an inverted V from the part across
        #     the forehead corner, then down the cheek just inside the ear so
        #     the ear and its hoop stay visible
        L([('s', 3, 56, 0.004), ('s', 9, 43, 0.0130), ('s', 19, 32, 0.0180), ('s', 31, 21, 0.0190),
           ('s', 47, 10, 0.0175), ('s', 60, -3, 0.0140), ('s', 66, -17, 0.0100), ('s', 60, -31, 0.0080),
           ('f', 0.0560, -0.040, 1.322), ('b', 0.060, 1.262, fc - 0.004, FR), ('b', 0.068, 1.200, fc - 0.002, FR),
           ('b', 0.070, 1.140, fc + 0.004, FR)],
          0.034, 0.011, wave=0.005, phase=ph + 1.1, wave_from=1.30, wave_to=1.14, n=56, tip_from=0.66)
        # second, shorter bang layered behind it: fills the temple and ends at the cheekbone
        L([('s', 3, 63, 0.004), ('s', 13, 52, 0.0130), ('s', 30, 41, 0.0175), ('s', 47, 29, 0.0180),
           ('s', 61, 16, 0.0160), ('s', 69, 3, 0.0130), ('s', 72, -8, 0.0100)],
          0.040, 0.010, n=40, tip_from=0.6)

    ob = md.to_object('Hair', mats, rig=bpy.data.objects.get('rig'))
    print('MF hair: %d verts, %d faces' % (len(md.v), len(md.f)))
    return ob
