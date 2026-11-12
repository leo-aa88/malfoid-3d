"""Malfoid's hair, designed from facial_atlas2.png's layer breakdown:

  1 crown volume      underlayer that covers the painted scalp
  2 part & roots      centre part, roots low and darker, hair lifts away
  3 front fringe      curtains swept from the part over the forehead corners
                      and back over the ears; thin strands framing the face
  4 side locks        behind the ears, falling forward over the shoulders
  5 back layers       long, layered, softly wavy

Three constructions of the back mass are available for comparison:
  A  tapered ribbon clumps only
  B  one continuous shell per side, fanned from the part, with notched tips
  C  B plus an outer layer of shorter ribbon clumps (tiers)
The fringe, side locks and underlayer are shared.
"""
import math
import random
from math import sin, cos, pi, radians, degrees
import numpy as np
import bpy
from mathutils import Vector
from mathutils.bvhtree import BVHTree
from .meshutil import MeshData, catmull, sstep, lerp
from .hair import Fit, SKULL_C, BODY_AXIS_Y

ROOT_COL = (0.80, 0.75, 0.68)     # root shadow (#C7B7A1 family after the base colour)
MID_COL = (0.955, 0.955, 0.955)
TIP_COL = (1.0, 1.0, 1.0)
UNDER_COL = (0.82, 0.78, 0.74)    # underside / inner layers


# ---------------------------------------------------------------- scalp mask
class Scalp:
    """The base head texture paints the hair-covered scalp a darker pink.
    The hair is fitted to exactly that region."""

    def __init__(self, head, parts):
        me = head.data
        face = set(parts['face'])
        self.polys = [p.index for p in me.polygons if p.vertices[0] in face]
        remap = {}
        verts = []
        for p in self.polys:
            for v in me.polygons[p].vertices:
                if v not in remap:
                    remap[v] = len(verts)
                    verts.append(me.vertices[v].co.copy())
        self.bvh = BVHTree.FromPolygons(verts, [[remap[v] for v in me.polygons[p].vertices] for p in self.polys])
        img = bpy.data.images['Body_BaseColor.png']
        w, h = img.size
        px = np.empty(w * h * 4, np.float32)
        img.pixels.foreach_get(px)
        self.px = px.reshape(h, w, 4)
        uv = me.uv_layers['UVMap'].data
        self.puv = {}
        for p in self.polys:
            ls = me.polygons[p].loop_indices
            self.puv[p] = (sum(uv[i].uv[0] for i in ls) / len(ls), sum(uv[i].uv[1] for i in ls) / len(ls))
        self.scalp_c = self._sample_dir(Vector((0, 0.15, 1.0)).normalized())
        self.skin_c = self._sample_dir(Vector((0, -1.0, -0.05)).normalized())
        hl = []
        for th in range(0, 181, 5):
            e_found = -70.0
            for e10 in range(850, -700, -5):
                e = e10 / 10.0
                if not self.is_scalp(th, e):
                    e_found = e + 0.5
                    break
            hl.append((th, e_found))
        self.hl = hl
        print('MF hairline (azimuth, elevation):', [(t, round(e, 1)) for t, e in hl])

    def _hit(self, d):
        hit = self.bvh.ray_cast(SKULL_C + d * 0.5, -d)
        return hit

    def _sample_dir(self, d):
        hit = self._hit(d)
        if hit[0] is None:
            return None
        u, v = self.puv[self.polys[hit[2]]]
        h, w = self.px.shape[:2]
        return self.px[min(int(v * h), h - 1), min(int(u * w), w - 1), :3].copy()

    def is_scalp(self, th, e):
        t, p = radians(th), radians(e)
        d = Vector((sin(t) * cos(p), -cos(t) * cos(p), sin(p)))
        c = self._sample_dir(d)
        if c is None:
            return False
        a, b = self.skin_c, self.scalp_c
        k = float(np.dot(c - a, b - a) / max(np.dot(b - a, b - a), 1e-9))
        return k > 0.5

    def elev(self, th):
        th = abs(th) % 360
        th = 360 - th if th > 180 else th
        for (t0, e0), (t1, e1) in zip(self.hl, self.hl[1:]):
            if th <= t1:
                return lerp(e0, e1, (th - t0) / (t1 - t0))
        return self.hl[-1][1]


# ---------------------------------------------------------------- primitives
def _outward(p):
    o_head = (p - SKULL_C).normalized()
    o_body = Vector((p.x, p.y - BODY_AXIS_Y, 0))
    o_body = o_body.normalized() if o_body.length > 1e-6 else Vector((0, 1, 0))
    return o_head.lerp(o_body, sstep(1.37, 1.29, p.z)).normalized()


def ribbon(md, pts, width, thick, n=48, seg=12, root=0.25, grow=0.22, tip_from=0.70, wave=0.0,
           wave_len=0.19, phase=0.0, wave_from=1.26, wave_to=1.04, flip=False, bend=0.5, curl=0.0,
           curl_side=1.0, root_len=0.10, mat='mf_hair', shade=1.0, width_fn=None):
    """One tapered hair clump with a crescent cross-section along a smooth
    path. Vertex colours: root shadow -> body -> tip, darker underside."""
    path = catmull(pts, n)
    if wave:
        for i, p in enumerate(path):
            a = wave * sstep(wave_from, wave_to, p.z)
            if a > 0:
                o = Vector((p.x, p.y - BODY_AXIS_Y, 0))
                o = o.normalized() if o.length > 1e-6 else Vector((0, 1, 0))
                tan = Vector((-o.y, o.x, 0))
                psi = 2 * pi * (wave_from - p.z) / wave_len + phase
                path[i] = p + tan * (a * sin(psi)) + o * (a * 0.35 * cos(psi + 0.8))
    if curl:
        for i, p in enumerate(path):
            c = sstep(0.8, 1.0, i / (n - 1)) ** 2 * curl
            if c > 0:
                o = Vector((p.x, p.y - BODY_AXIS_Y, 0))
                o = o.normalized() if o.length > 1e-6 else Vector((0, 1, 0))
                path[i] = p + o * c + Vector((-o.y, o.x, 0)) * (c * 0.8 * curl_side) + Vector((0, 0, c * 0.4))
    rows, cols = [], []
    for i, p in enumerate(path):
        k = i / (n - 1)
        t = (path[min(i + 1, n - 1)] - path[max(i - 1, 0)]).normalized()
        o = _outward(p)
        nr = o - t * o.dot(t)
        if nr.length < 1e-6:
            nr = t.orthogonal()
        nr.normalize()
        bn = t.cross(nr).normalized()
        if width_fn is not None:
            wf = width_fn(k)
        else:
            wf = lerp(root, 1.0, sstep(0.0, grow, k)) * (1.0 - 0.97 * sstep(tip_from, 1.0, k) ** 1.5)
        W = width * wf
        T = thick * (0.35 + 0.65 * min(wf, 1.0) ** 0.7) * lerp(0.55, 1.0, sstep(1.42, 1.32, p.z))
        ring, rc = [], []
        base = [lerp(ROOT_COL[c], MID_COL[c], sstep(0.0, root_len, k)) for c in range(3)]
        base = [lerp(base[c], TIP_COL[c], sstep(0.75, 1.0, k)) * shade for c in range(3)]
        for q in range(seg):
            ang = 2 * pi * q / seg
            cb, sn = cos(ang), sin(ang)
            h = (sn if sn > 0 else sn * 0.30) * T * 0.5 - bend * T * cb * cb
            ring.append(p + bn * (cb * W * 0.5) + nr * h)
            under = 1.0 if sn > 0.15 else (UNDER_COL[0] / MID_COL[0])
            rc.append(tuple(min(1.0, base[c] * (under if sn <= 0.15 else 1.0)) for c in range(3)))
        rows.append(ring)
        cols.append(rc)
    tip = path[-1] + (path[-1] - path[-2]) * 0.6
    start = path[0] - (path[1] - path[0]) * 0.4
    md.add_grid(rows, mat, closed=True, cap_start=start, cap_end=tip, flip=flip, cols=cols)


def sheet(md, grid, thick_fn, cols_fn, mat='mf_hair'):
    """A thick sheet from a grid of points rows[i][j] (i along the hair, j
    across). Outer surface faces away from the head/body; the inner surface
    gets the darker underside colour; all four borders are closed."""
    ni, nj = len(grid), len(grid[0])
    nrm = [[None] * nj for _ in range(ni)]
    for i in range(ni):
        for j in range(nj):
            du = grid[min(i + 1, ni - 1)][j] - grid[max(i - 1, 0)][j]
            dv = grid[i][min(j + 1, nj - 1)] - grid[i][max(j - 1, 0)]
            nv = du.cross(dv)
            nv = nv.normalized() if nv.length > 1e-9 else _outward(grid[i][j])
            if nv.dot(_outward(grid[i][j])) < 0:
                nv = -nv
            nrm[i][j] = nv
    base = len(md.v)
    outer = [[None] * nj for _ in range(ni)]
    inner = [[None] * nj for _ in range(ni)]
    for i in range(ni):
        for j in range(nj):
            outer[i][j] = len(md.v)
            md.v.append(grid[i][j].copy())
            md.c.append(cols_fn(i / (ni - 1), j / (nj - 1)))
    for i in range(ni):
        for j in range(nj):
            inner[i][j] = len(md.v)
            md.v.append(grid[i][j] - nrm[i][j] * thick_fn(i / (ni - 1)))
            md.c.append(UNDER_COL)

    def quad(a, b, c, d, out_dir_pt):
        f = [a, b, c, d]
        pa, pb, pc = md.v[a], md.v[b], md.v[c]
        if (pb - pa).cross(pc - pa).dot(_outward(out_dir_pt)) < 0:
            f.reverse()
        md.f.append(tuple(f))
        md.fm.append(mat)

    for i in range(ni - 1):
        for j in range(nj - 1):
            P = grid[i][j]
            quad(outer[i][j], outer[i + 1][j], outer[i + 1][j + 1], outer[i][j + 1], P)
            # inner surface faces the head
            f = [inner[i][j], inner[i + 1][j], inner[i + 1][j + 1], inner[i][j + 1]]
            pa, pb, pc = md.v[f[0]], md.v[f[1]], md.v[f[2]]
            if (pb - pa).cross(pc - pa).dot(_outward(P)) > 0:
                f.reverse()
            md.f.append(tuple(f))
            md.fm.append(mat)
    # rims
    for i in range(ni - 1):
        for j in (0, nj - 1):
            a, b = outer[i][j], outer[i + 1][j]
            c, d = inner[i + 1][j], inner[i][j]
            side = (grid[i][j] - grid[i][1 if j == 0 else nj - 2])
            f = [a, b, c, d]
            pa, pb, pc = md.v[a], md.v[b], md.v[c]
            if (pb - pa).cross(pc - pa).dot(side) < 0:
                f.reverse()
            md.f.append(tuple(f))
            md.fm.append(mat)
    for i in (0, ni - 1):
        for j in range(nj - 1):
            a, b = outer[i][j], outer[i][j + 1]
            c, d = inner[i][j + 1], inner[i][j]
            side = grid[i][j] - grid[1 if i == 0 else ni - 2][j]
            f = [a, b, c, d]
            pa, pb, pc = md.v[a], md.v[b], md.v[c]
            if (pb - pa).cross(pc - pa).dot(side) < 0:
                f.reverse()
            md.f.append(tuple(f))
            md.fm.append(mat)


# ---------------------------------------------------------------- design
class Design:
    def __init__(self, head, parts, variant='C', seed=5):
        self.fit = Fit(head, parts, bpy.data.objects.get('Body_All'))
        import os
        self.fit.EXTRA = float(os.environ.get('MF_HAIR_CLEAR', '0.016'))     # room for the robe
        self.scalp = Scalp(head, parts)
        self.variant = variant
        self.rnd = random.Random(seed)
        self.md = MeshData()
        self.ef = self.scalp.elev(0)            # hairline elevation at the front centre

    # helpers ------------------------------------------------------------
    def dir(self, th, e):
        t, p = radians(th), radians(e)
        return Vector((sin(t) * cos(p), -cos(t) * cos(p), sin(p)))

    def sk(self, th, e, lift):
        return self.fit.s(th, e, lift)

    def part(self, a, lift, sgn):
        """point on the centre part, `a` degrees along the midline measured
        from the front horizon over the top (90 = top, >90 = towards the back)"""
        if a <= 90:
            return self.sk(sgn * 1.5, a, lift)
        return self.sk(sgn * 178.5, 180 - a, lift)

    def sk_dir(self, d, lift):
        hit = self.fit.skull.ray_cast(SKULL_C + d * 0.5, -d)
        p = hit[0] if hit[0] is not None else SKULL_C + d * 0.09
        return p + d * lift

    # underlayer ---------------------------------------------------------
    def underlayer(self):
        nth = 72
        ts = [0.0, 0.04, 0.10, 0.2, 0.32, 0.46, 0.6, 0.74, 0.86, 0.95]
        rows, cols = [], []
        for t in ts:
            row = []
            for j in range(nth):
                th = -180.0 + 360.0 * j / nth
                e0 = self.scalp.elev(th) - 2.5
                e = lerp(e0, 89.0, t ** 0.9)
                row.append(self.sk(th, e, lerp(0.0015, 0.0075, sstep(0.0, 0.3, t))))
            rows.append(row)
            cols.append(UNDER_COL)
        top = self.sk(0, 90, 0.0075)
        self.md.add_grid(rows, 'mf_hair', closed=True, cap_end=top, flip=True, cols=cols)

    # back mass ----------------------------------------------------------
    W_HANG = [(1.36, 0.096), (1.30, 0.110), (1.22, 0.132), (1.12, 0.150), (1.02, 0.160), (0.92, 0.160), (0.85, 0.155)]

    def w_hang(self, z):
        k = self.W_HANG
        for (z0, w0), (z1, w1) in zip(k, k[1:]):
            if z >= z1:
                return lerp(w0, w1, (z0 - z) / (z0 - z1))
        return k[-1][1]

    def column(self, u, sgn, tip_extra=0.0, lift_extra=0.0, ridge=True, clumps=4):
        """control points for a back-hair column; u=0 at the side (behind the
        ear), u=1 at the back centre"""
        a_root = lerp(68.0, 121.0, u ** 0.9)
        th_top = lerp(96.0, 180.0, u)
        th_low = max(th_top, lerp(116.0, 180.0, u))
        fr = (u * clumps) % 1.0
        tooth = abs(2 * fr - 1)                          # 0 at a clump centre
        d0 = self.part_dir(a_root, sgn)
        if a_root > 90:
            d0 = self.dir(sgn * lerp(178.5, 180.0, sstep(0.75, 1.0, u)), 180 - a_root)
        d1 = self.dir(sgn * th_top, 6.0)
        L = lift_extra
        # roots sit low along the part; past the crown there is no part, so
        # the back-centre columns start at full volume
        root_lift = lerp(0.0045, 0.0115, sstep(0.72, 1.0, u)) + L
        if a_root > 90:
            # the back-centre columns of both halves meet exactly on the midline
            pts = [self.sk(sgn * lerp(178.5, 180.0, sstep(0.75, 1.0, u)), 180 - a_root, root_lift)]
        else:
            pts = [self.part(a_root, root_lift, sgn)]
        for t, lift in ((0.3, 0.0125), (0.62, 0.0155), (1.0, 0.0150)):
            pts.append(self.sk_dir((d0 * (1 - t) + d1 * t).normalized(), lift + L))
        last = self.sk(sgn * th_low, -14.0, 0.0145 + L)
        pts.append(last)
        w = 1.0 - u
        z_base = lerp(0.90, 1.04, w ** 1.3)
        z_tip = z_base + (0.055 * tooth ** 1.5 * lerp(0.35, 1.0, sstep(0.0, 0.3, u)) if ridge else 0.0) + tip_extra
        rr = (0.0065 * (1 - tooth) ** 2) if ridge else 0.0
        # from the widest point of the back of the head the hair falls
        # nearly straight: it may approach the body only gently (no pinch at
        # the nape), and never closer than the clearance
        zs = [z for z in (1.34, 1.28, 1.20, 1.11, 1.03, 0.96) if z > z_tip + 0.02] + [z_tip]
        for z in zs:
            x = sgn * self.w_hang(z) * math.sin(w * pi / 2) ** 0.85
            p = self.fit.b(x, z, 0.022 + L + rr * sstep(1.27, 1.12, z), 'back')
            # back of the curtain (u near 1) keeps its depth; sides follow the body
            hang_y = last.y - 0.22 * (last.z - z)
            p.y = max(p.y, lerp(p.y, hang_y, u ** 0.7))
            p.x = lerp(p.x, last.x, sstep(1.30, 1.40, z))
            pts.append(p)
        return pts, tooth

    def part_dir(self, a, sgn):
        if a <= 90:
            return self.dir(sgn * 1.5, a)
        return self.dir(sgn * 178.5, 180 - a)

    def shell(self, nj=26, ni=60):
        """one continuous sheet from behind the left ear, round the back,
        to behind the right ear (no seam at the back centre)"""
        cols_pts = []
        order = [(j / (nj - 1), 1.0) for j in range(nj)] + [((nj - 2 - j) / (nj - 1), -1.0) for j in range(nj - 1)]
        for idx, (u, sgn) in enumerate(order):
            pts, tooth = self.column(u, sgn)
            path = catmull(pts, ni)
            # soft S-waves on the hanging part, continuous across the sheet
            ph = idx / (len(order) - 1) * 10.0
            for i, p in enumerate(path):
                a = 0.013 * sstep(1.22, 1.00, p.z) * lerp(0.25, 1.0, sstep(0.0, 0.3, u))
                if a > 0:
                    o = Vector((p.x, p.y - BODY_AXIS_Y, 0)).normalized()
                    tan = Vector((-o.y, o.x, 0))
                    psi = 2 * pi * (1.22 - p.z) / 0.20 + ph
                    path[i] = p + tan * (a * sin(psi)) + o * (a * 0.3 * cos(psi))
            cols_pts.append(path)
        grid = [[cols_pts[j][i] for j in range(len(order))] for i in range(ni)]

        def col(k, uu):
            c = [lerp(ROOT_COL[q], MID_COL[q], sstep(0.0, 0.08, k)) for q in range(3)]
            return tuple(lerp(c[q], TIP_COL[q], sstep(0.8, 1.0, k)) for q in range(3))
        sheet(self.md, grid, lambda k: lerp(0.004, 0.009, sstep(0, 0.3, k)) * (1 - 0.75 * sstep(0.7, 1.0, k)), col)

    def back_ribbons(self, sgn, us, width, tip_extra, lift_extra, thick=0.015):
        ph = 0.0 if sgn > 0 else 2.1
        for i, u in enumerate(us):
            pts, _ = self.column(u, sgn, tip_extra=tip_extra + self.rnd.uniform(-0.015, 0.015),
                                 lift_extra=lift_extra, ridge=False)
            if self.variant == 'C':
                # tier locks run under the shell over the head and surface
                # gradually below the occiput, so they have no visible roots
                for k, p in enumerate(pts):
                    sink = 0.009 * sstep(1.33, 1.43, p.z)
                    if sink > 0:
                        pts[k] = p - (p - SKULL_C).normalized() * sink
            ribbon(self.md, pts, width + self.rnd.uniform(-0.004, 0.004), thick, n=60, wave=0.015,
                   phase=ph + 1.3 * i + self.rnd.uniform(-0.3, 0.3), wave_from=1.24, wave_to=1.02,
                   flip=sgn < 0, tip_from=0.62, curl=0.010, curl_side=sgn if i % 2 else -sgn, root_len=0.08)

    # front ----------------------------------------------------------------
    def fringe(self, sgn):
        f = self.fit
        left = sgn > 0
        zf = 1.503                       # painted hairline height at the front centre
        drop = 0.0 if left else 0.008    # her right curtain falls a little lower (asymmetry)
        fl = sgn < 0
        P = lambda a, lift: self.part(a, lift, sgn)
        X = lambda x, z, lift: f.x(sgn * x, z, lift)
        S = lambda th, e, lift: self.sk(sgn * th, e, lift)
        Y = lambda y, z, lift, xmin=0.0: f.y(sgn, y, z, lift, xmin)
        B = lambda x, z, clr, where: f.b(sgn * x, z, clr, where)
        F = lambda x, y, z: Vector((sgn * x, y, z))
        ef = self.ef
        # 3rd curtain (furthest back on the part): over the top, behind the ear, behind the shoulder
        ribbon(self.md, [P(ef + 34, 0.005), S(30, 50, 0.0150), S(62, 34, 0.0165), S(90, 16, 0.0160),
                         S(112, 0, 0.0150), S(124, -22, 0.0145), S(128, -38, 0.0140),
                         B(0.128, 1.26, 0.030, 'back'), B(0.150, 1.16, 0.030, 'back'),
                         B(0.158, 1.06, 0.032, 'back'), B(0.150, 0.99 if left else 1.02, 0.036, 'back')],
               0.070, 0.015, n=64, flip=fl, wave=0.014, phase=1.1 if left else 2.6, tip_from=0.6, curl=0.012)
        # 2nd curtain: from the part, over the temple and the top of the ear,
        # tucked behind it, then forward over the shoulder onto the chest
        ribbon(self.md, [P(ef + 17, 0.0055), S(16, 40, 0.0165), S(45, 25, 0.0180), S(76, 9, 0.0170),
                         S(100, -2, 0.0160), S(118, -18, 0.0150), S(124, -36, 0.0140),
                         B(0.118, 1.275, 0.026, 'back'), B(0.138, 1.19, 0.028, 'back'),
                         B(0.146, 1.10, 0.030, 'back'), B(0.140, 1.03 if left else 1.00, 0.034, 'back')],
               0.060, 0.014, n=66, flip=fl, wave=0.012, phase=0.4 if left else 1.9, wave_from=1.20,
               wave_to=1.04, tip_from=0.62, curl=0.010)
        # front curtain: its front edge draws the hairline; sweeps over the
        # forehead corner and back over the ear, falling to the chest
        ribbon(self.md, [P(ef + 3, 0.0060), X(0.024, zf - 0.006 - drop, 0.0140),
                         X(0.047, zf - 0.024 - drop, 0.0160), X(0.065, zf - 0.052 - drop, 0.0160),
                         X(0.076, 1.425 - drop, 0.0140), S(88, -4 - drop * 300, 0.0150), S(104, -10, 0.0165),
                         S(120, -24, 0.0160), S(124, -42, 0.0150), F(0.098, 0.016, 1.300),
                         B(0.106, 1.235, 0.012, 'front'), B(0.100, 1.16, 0.016, 'front'), B(0.095, 1.09, 0.018, 'front'),
                         B(0.088, 1.03 if left else 1.06, 0.022, 'front')],
               0.052, 0.012, n=72, flip=fl, wave=0.010, phase=0.0 if left else 1.5, wave_from=1.18,
               wave_to=1.04, tip_from=0.64, curl=0.008, bend=0.45,
               width_fn=lambda k: lerp(0.25, 1.0, sstep(0, 0.2, k)) * lerp(1.0, 0.72, sstep(0.42, 0.55, k))
               * (1 - 0.97 * sstep(0.64, 1.0, k) ** 1.5))
        # thin strands framing the face: from under the curtain at the temple,
        # down in front of the ear along the cheek, tapering below the jaw
        ribbon(self.md, [P(ef + 6, 0.0050), X(0.022, zf - 0.010, 0.0100), X(0.046, zf - 0.030, 0.0115),
                         X(0.064, 1.452, 0.0110), X(0.072, 1.420, 0.0095), Y(-0.018, 1.392, 0.0070),
                         Y(-0.026, 1.362, 0.0055), Y(-0.031, 1.332, 0.0055, 0.058),
                         Y(-0.035, 1.300, 0.0060, 0.058), Y(-0.038, 1.262 if left else 1.245, 0.0065, 0.059)],
               0.018, 0.006, n=56, flip=fl, root=0.5, tip_from=0.55, bend=0.35,
               width_fn=lambda k: (0.5 + 0.5 * sstep(0, 0.15, k)) * (1 - 0.6 * sstep(0.45, 0.62, k))
               * (1 - 0.95 * sstep(0.62, 1.0, k) ** 1.3))
        ribbon(self.md, [P(ef + 10, 0.0050), X(0.030, zf - 0.004, 0.0115), X(0.056, zf - 0.024, 0.0125),
                         X(0.074, 1.462, 0.0120), S(84, 4, 0.0100), Y(-0.010, 1.400, 0.0080),
                         Y(-0.016, 1.370, 0.0070), Y(-0.020, 1.340 if left else 1.330, 0.0070)],
               0.014, 0.005, n=44, flip=fl, root=0.5, tip_from=0.5, bend=0.3)
        if not left:
            # a stray strand on her right, crossing the forehead corner
            ribbon(self.md, [P(ef + 1, 0.0070), X(0.014, zf - 0.014, 0.0150), X(0.030, 1.474, 0.0150),
                             X(0.043, 1.446, 0.0130), X(0.053, 1.418, 0.0105), X(0.060, 1.395, 0.0085),
                             X(0.064, 1.374, 0.0070)],
                   0.012, 0.004, n=40, flip=fl, root=0.6, tip_from=0.45, bend=0.25)

    # ---------------------------------------------------------------------
    def build(self):
        self.underlayer()
        v = self.variant
        if v in ('B', 'C'):
            self.shell()
        for sgn in (1.0, -1.0):
            if v == 'A':
                self.back_ribbons(sgn, [0.0, 0.17, 0.34, 0.5, 0.66, 0.83, 1.0], 0.080, 0.0, 0.0)
                self.back_ribbons(sgn, [0.08, 0.42, 0.75, 0.95], 0.070, 0.05, 0.004)
            if v == 'C':
                self.back_ribbons(sgn, [0.12, 0.45, 0.78], 0.072, 0.07, 0.0045, thick=0.013)
            self.fringe(sgn)
        ob = self.md.to_object('Hair', bpy.data.materials, rig=bpy.data.objects.get('rig'))
        print('MF hair2 variant %s: %d verts, %d faces' % (v, len(self.md.v), len(self.md.f)))
        return ob


def build(head, parts, mats, variant='C'):
    return Design(head, parts, variant).build()
