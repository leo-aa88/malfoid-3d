"""Slytherin uniform fitted to the base body (blueprint.png, "Uniform & Props").

Close-fitting garments (shirt, sweater vest, socks, shoes, the robe's upper
part and sleeves) are extracted from the body mesh itself: the region's faces
are copied, pushed out along the normals and given thickness. They keep the
body's topology and skin weights, so they deform exactly like the body.
Loose garments (pleated skirt, lower robe, collar, tie, crest) are built from
the body's measured silhouette and get their weights from the nearest body
vertices.
"""
import math
from math import sin, cos, pi, radians
import bmesh
import bpy
from mathutils import Vector
from mathutils.kdtree import KDTree
from .meshutil import MeshData, sstep, lerp

FRONT = Vector((0, -1, 0))     # the base model faces -Y
ARM_Z, ARM_Y = 1.235, 0.035    # T-pose arm axis
COLLAR_Z = 1.268               # top of the shirt on the neck

HANDS = ('hand_', 'thumb', 'index', 'middle', 'ring', 'pinky')
ARMS = ('upperarm_', 'forearm_') + HANDS


def body():
    return bpy.data.objects['Body_All']


class Info:
    """per-vertex data of the body"""

    def __init__(self):
        ob = body()
        me = ob.data
        names = {g.index: g.name for g in ob.vertex_groups}
        self.co = [v.co.copy() for v in me.vertices]
        self.no = [v.normal.copy() for v in me.vertices]
        self.dom = []
        self.w = []
        for v in me.vertices:
            gs = [(names[g.group], g.weight) for g in v.groups if g.weight > 0]
            self.w.append(dict(gs))
            self.dom.append(max(gs, key=lambda t: t[1])[0] if gs else '')
        self.kd = KDTree(len(self.co))
        for i, c in enumerate(self.co):
            self.kd.insert(c, i)
        self.kd.balance()

    def is_(self, i, prefixes):
        return self.dom[i].startswith(prefixes)

    def weights_near(self, p, k=4):
        out = {}
        tot = 0.0
        for co, i, d in self.kd.find_n(p, k):
            w = 1.0 / max(d, 1e-4)
            tot += w
            for g, x in self.w[i].items():
                out[g] = out.get(g, 0.0) + x * w
        return {g: x / tot for g, x in out.items()}

    def envelope(self, z, band=0.012, xmax=0.24):
        """half-width, front and back extent of the body (no arms) at height z"""
        xs, ys = [], []
        for i, c in enumerate(self.co):
            if abs(c.z - z) < band and abs(c.x) < xmax and not self.is_(i, ARMS):
                xs.append(abs(c.x))
                ys.append(c.y)
        return max(xs), min(ys), max(ys)


# ------------------------------------------------------------------ helpers
def shell(bm, thick):
    """constant-thickness inner shell + rim faces (bmesh solidify spikes on
    the body's tiny, sharply angled faces)"""
    bm.normal_update()
    faces = list(bm.faces)
    verts = list(bm.verts)
    boundary = [e for e in bm.edges if len(e.link_faces) == 1]
    dl = bm.verts.layers.deform.active
    twin = {}
    for v in verts:
        nv = bm.verts.new(v.co - v.normal * thick, v)
        twin[v] = nv
    for f in faces:
        nf = bm.faces.new([twin[v] for v in reversed(f.verts)], f)
        nf.material_index = f.material_index
    for e in boundary:
        f = e.link_faces[0]
        # orient the rim like the face's own winding along this edge
        loop = next(l for l in f.loops if l.edge == e)
        a, b = loop.vert, loop.link_loop_next.vert
        try:
            bm.faces.new((b, a, twin[a], twin[b]), f)
        except ValueError:
            pass
    bm.normal_update()


def extract(name, info, keep, offset, thick, mat, inner_mat=None, smooth=0, post=None, snap=None, cut=None):
    """Copy the body faces whose vertices all satisfy keep(i), offset them
    along the normals by offset(i) and solidify. Returns the new object."""
    src = body()
    me = src.data.copy()
    me.name = name
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    ob.parent = src.parent
    ob.matrix_world = src.matrix_world
    # vertex weights live in the mesh data; matching group names/order keeps them
    for vg in src.vertex_groups:
        ob.vertex_groups.new(name=vg.name)
    if me.shape_keys:
        ob.shape_key_clear()
    bm = bmesh.new()
    bm.from_mesh(me)
    bm.verts.ensure_lookup_table()
    keepv = [keep(i) for i in range(len(bm.verts))]
    dead = [f for f in bm.faces if not all(keepv[v.index] for v in f.verts)
            or (cut is not None and cut(f.calc_center_median()))]
    bmesh.ops.delete(bm, geom=dead, context='FACES')
    loose = [v for v in bm.verts if not v.link_faces]
    bmesh.ops.delete(bm, geom=loose, context='VERTS')
    bm.verts.ensure_lookup_table()
    dl = bm.verts.layers.deform.verify()
    orig = bm.verts.layers.int.new('orig')
    # original indices are lost after deletes; recover them by position
    for v in bm.verts:
        _, i, _ = info.kd.find(v.co)
        v[orig] = i
    if snap:
        # straighten cut edges: move boundary vertices onto the intended line
        bnd = {v for e in bm.edges if len(e.link_faces) == 1 for v in e.verts}
        for v in bnd:
            snap(v.co)
    if smooth:
        for _ in range(smooth):
            bmesh.ops.smooth_vert(bm, verts=bm.verts, factor=0.5, use_axis_x=True, use_axis_y=True,
                                  use_axis_z=True)
    bm.normal_update()
    for v in bm.verts:
        v.co += v.normal * offset(v[orig])
    if post:
        post(bm)
    bm.normal_update()
    nf = len(bm.faces)
    outer = list(bm.faces)
    if thick:
        shell(bm, thick)
    bm.faces.ensure_lookup_table()
    for f in bm.faces:
        f.material_index = 0
        f.smooth = True
    if inner_mat:
        for f in bm.faces:
            c = f.calc_center_median()
            ref = Vector((c.x, ARM_Y, ARM_Z)) if abs(c.x) > 0.17 and c.z > 1.14 else Vector((0, 0.01, c.z))
            if f.normal.dot(c - ref) < 0:
                f.material_index = 1
    bm.to_mesh(me)
    bm.free()
    me.materials.clear()
    me.materials.append(bpy.data.materials[mat])
    if inner_mat:
        me.materials.append(bpy.data.materials[inner_mat])
    for m in list(ob.modifiers):
        ob.modifiers.remove(m)
    mod = ob.modifiers.new('Armature', 'ARMATURE')
    mod.object = src.find_armature() or src.parent
    print('MF outfit: %-12s %6d verts (from %d body faces)' % (name, len(me.vertices), nf))
    return ob


def proc_object(name, md, info, wfn=None):
    """MeshData -> skinned object; weights from nearest body vertices unless
    wfn(point) returns a dict"""
    arm = body().parent
    ob = md.to_object(name, bpy.data.materials, bone=None, rig=None)
    groups = {}
    for i, p in enumerate(md.v):
        w = wfn(p) if wfn else None
        if w is None:
            w = info.weights_near(p)
        tot = sum(w.values())
        for g, x in sorted(w.items(), key=lambda t: -t[1])[:4]:
            if x / tot < 0.01:
                continue
            vg = groups.get(g) or ob.vertex_groups.get(g) or ob.vertex_groups.new(name=g)
            groups[g] = vg
            vg.add([i], x / tot, 'REPLACE')
    ob.parent = arm
    mod = ob.modifiers.new('Armature', 'ARMATURE')
    mod.object = arm
    print('MF outfit: %-12s %6d verts' % (name, len(md.v)))
    return ob


def ring_pts(z, rx, yf, yb, n, flare=0.0, e=2.2, wobble=None):
    """superellipse ring at height z between front yf (<0) and back yb (>0)"""
    cy = (yf + yb) / 2
    ry = (yb - yf) / 2
    pts = []
    for j in range(n):
        a = 2 * pi * j / n
        s, c = sin(a), cos(a)
        m = 1.0 + (wobble(a) if wobble else 0.0)
        x = (rx + flare) * m * math.copysign(abs(s) ** (2 / e), s)
        y = cy - (ry + flare) * m * math.copysign(abs(c) ** (2 / e), c)
        pts.append(Vector((x, y, z)))
    return pts


# ------------------------------------------------------------------ garments
def shirt(info):
    def keep(i):
        c = info.co[i]
        return (c.z > 0.94 and (c.z < COLLAR_Z or abs(c.x) > 0.10) and abs(c.x) < 0.488
                and not info.is_(i, HANDS + ('head', 'neck')))

    def off(i):
        c = info.co[i]
        return 0.0028 + 0.0015 * sstep(0.17, 0.30, abs(c.x)) + 0.0025 * sstep(0.44, 0.485, abs(c.x))
    return extract('Shirt', info, keep, off, 0.0012, 'mf_shirt')


V_BOTTOM = 1.085


def vest(info):
    def keep(i):
        c = info.co[i]
        if not (0.953 < c.z < 1.262) or abs(c.x) > 0.16 or info.is_(i, ARMS):
            return False
        if info.is_(i, ('shoulder_',)) and abs(c.x) > 0.105:
            return False                                   # armhole
        return True

    def off(i):
        return 0.0075 + 0.002 * sstep(0.99, 0.955, info.co[i].z)

    def snap(co):
        if co.y < 0.0 and co.z > V_BOTTOM - 0.02 and abs(co.x) < 0.06:
            co.x = math.copysign(max((co.z - V_BOTTOM) * 0.42, 0.0), co.x)
        elif co.z < 0.975:
            co.z = 0.953
    ob = extract('Vest', info, keep, off, 0.0025, 'mf_sweater', inner_mat='mf_sweater', snap=snap,
                 cut=lambda c: c.y < 0.0 and c.z > V_BOTTOM and abs(c.x) < (c.z - V_BOTTOM) * 0.42)
    # ribbed trims: hem, V-neck, armholes
    me = ob.data
    me.materials.append(bpy.data.materials['mf_sweater_trim'])
    for p in me.polygons:
        c = p.center
        v_edge = c.y < 0.0 and c.z > V_BOTTOM - 0.012 and abs(c.x) < (c.z - V_BOTTOM) * 0.42 + 0.013
        arm_edge = abs(c.x) > 0.093 and c.z > 1.16
        if c.z < 0.985 or v_edge or arm_edge:
            if p.material_index == 0:
                p.material_index = 2
    return ob


def socks(info):
    def keep(i):
        return 0.045 < info.co[i].z < 0.455

    def off(i):
        c = info.co[i]
        return 0.0022 + 0.0015 * sstep(0.44, 0.455, c.z)

    def snap(co):
        if co.z > 0.43:
            co.z = 0.455
    return extract('Socks', info, keep, off, 0.0012, 'mf_sock', snap=snap)


def shoes(info):
    """loafers fitted to the measured foot shape"""
    md = MeshData()
    for sgn in (1.0, -1.0):
        foot = [c for i, c in enumerate(info.co) if c.z < 0.095 and c.x * sgn > 0.02]
        y0 = min(c.y for c in foot) - 0.006          # toe
        y1 = max(c.y for c in foot) + 0.006          # heel
        n = 18
        rows = []
        for k in range(n + 1):
            t = k / n
            y = lerp(y1, y0, t)
            band = [c for c in foot if abs(c.y - y) < 0.009]
            if not band:
                band = foot
            xs = [c.x for c in band]
            cx = (max(xs) + min(xs)) / 2
            hw = (max(xs) - min(xs)) / 2 + 0.0065
            top = min(max(c.z for c in band) + 0.006, 0.072)
            end = sstep(0.0, 0.07, t) * sstep(1.0, 0.90, t)           # round off heel and toe
            hw *= lerp(0.55, 1.0, end ** 0.5)
            top = lerp(top * 0.75, top, end ** 0.5)
            ring = []
            for j in range(20):
                a = 2 * pi * j / 20
                ca, sa = cos(a), sin(a)
                z = top / 2 + top / 2 * math.copysign(abs(sa) ** 0.7, sa)
                ring.append(Vector((cx + hw * math.copysign(abs(ca) ** 0.7, ca), y, max(z, 0.0))))
            rows.append(ring)
        md.add_grid(rows, 'mf_shoe', closed=True, cap_start=Vector((rows[0][0].x - 0.006 * sgn, y1 + 0.004, 0.03)),
                    cap_end=Vector((rows[-1][0].x - 0.006 * sgn, y0 - 0.004, 0.02)), flip=sgn > 0)

    def wfn(p):
        side = 'L' if p.x > 0 else 'R'
        t = sstep(-0.045, -0.075, p.y)
        return {'foot_' + side: 1 - t, 'toe_' + side: t} if t > 0 else {'foot_' + side: 1.0}
    return proc_object('Shoes', md, info, wfn)


def robe_open(z):
    """half-width of the robe's front opening at height z"""
    return lerp(0.040, 0.062, sstep(1.25, 0.95, z))


def robe_upper(info):
    def keep(i):
        c = info.co[i]
        if c.z < 0.975 or (c.z > COLLAR_Z + 0.004 and abs(c.x) < 0.10) or abs(c.x) > 0.465 \
                or info.is_(i, HANDS + ('head', 'neck')):
            return False
        return True

    def snap(co):
        if co.y < 0.01 and abs(co.x) < 0.12 and co.z < COLLAR_Z - 0.004:
            co.x = math.copysign(robe_open(co.z), co.x)

    def off(i):
        c = info.co[i]
        ax = abs(c.x)
        torso = 0.017 + 0.004 * sstep(1.22, 1.26, c.z) * (1 - sstep(0.15, 0.2, ax))
        return torso + 0.030 * sstep(0.22, 0.465, ax) ** 1.6
    ob = extract('RobeUpper', info, keep, off, 0.0035, 'mf_robe', inner_mat='mf_robe_lining', snap=snap,
                 cut=lambda c: c.y < 0.01 and abs(c.x) < robe_open(c.z))
    _facing(ob)
    return ob


def _facing(ob):
    """green facing along the front opening and the sleeve ends"""
    me = ob.data
    for p in me.polygons:
        c = p.center
        if p.material_index == 0:
            if c.y < 0.0 and abs(c.x) < robe_open(c.z) + 0.016 and abs(c.x) < 0.16:
                p.material_index = 1
            if abs(c.x) > 0.448:
                p.material_index = 1


def robe_lower(info):
    md = MeshData()
    zs = [1.19, 1.15, 1.10, 1.05, 1.00, 0.95, 0.90, 0.85, 0.79, 0.72, 0.64, 0.56, 0.48, 0.40, 0.33, 0.27, 0.22]
    n = 64
    rows = []
    env_max = None
    for z in zs:
        rx, yf, yb = info.envelope(z) if z > 0.55 else (None, None, None)
        if rx is not None:
            env_max = (max(env_max[0], rx), min(env_max[1], yf), max(env_max[2], yb)) if env_max else (rx, yf, yb)
        rx, yf, yb = env_max
        skirt_out = 0.006 + 0.045 * sstep(0.985, 0.74, z) + 0.022 * sstep(0.98, 0.86, z)
        fl = max(0.020 + 0.080 * sstep(1.12, 0.22, z) ** 1.2, skirt_out + 0.010)
        def wob(a, z=z):
            return 0.035 * sstep(0.95, 0.5, z) * cos(7 * a + 0.6 * sin(3 * a) + 0.3)
        ring = ring_pts(z, rx, yf, yb, n, flare=fl, wobble=wob)
        # open at the front: drop the columns inside the opening
        rows.append(ring)
    # reorder so the seam is at the front centre; keep only columns outside the opening
    keep = []
    for j in range(n):
        a = 2 * pi * j / n
        keep.append(a)
    order = sorted(range(n), key=lambda j: (2 * pi * j / n) % (2 * pi))
    out_rows = []
    for zi, z in enumerate(zs):
        ring = rows[zi]
        ow = robe_open(min(z, 1.0)) + 0.012 * sstep(1.0, 0.25, z)
        pts = [ring[j] for j in order if not (ring[j].y < 0 and abs(ring[j].x) < ow)]
        out_rows.append(pts)
    m = min(len(r) for r in out_rows)
    out_rows = [_resample(r, m) for r in out_rows]
    # hem: gentle unevenness
    md_rows = out_rows
    _thick_grid(md, md_rows, 0.0035, 'mf_robe', 'mf_robe_lining', facing_cols=1)

    def wfn(p):
        side = 'thigh_L' if p.x > 0 else 'thigh_R'
        t = 0.38 * sstep(0.95, 0.55, p.z) * sstep(0.02, 0.10, abs(p.x))
        w = {'hips': 1.0 - t}
        if t > 0:
            w[side] = t
        if p.z > 0.98:
            u = sstep(0.98, 1.17, p.z)
            w = {'hips': 0.5 * (1 - u), 'spine': 0.5, 'chest': 0.5 * u}
        return w
    return proc_object('RobeLower', md, info, wfn)


def _resample(pts, m):
    """resample an open polyline to m points evenly by length"""
    acc = [0.0]
    for i in range(1, len(pts)):
        acc.append(acc[-1] + (pts[i] - pts[i - 1]).length)
    out = []
    j = 0
    for k in range(m):
        d = acc[-1] * k / (m - 1)
        while j < len(acc) - 2 and acc[j + 1] < d:
            j += 1
        seg = acc[j + 1] - acc[j]
        t = 0 if seg < 1e-9 else (d - acc[j]) / seg
        out.append(pts[j].lerp(pts[j + 1], t))
    return out


def _thick_grid(md, rows, th, mat, inner, closed=False, facing_cols=0):
    """open grid (rows across) with an inner shell and closed borders.
    The inner shell is offset towards the body axis."""
    ni, nj = len(rows), len(rows[0])
    inner_rows = []
    for r in rows:
        ir = []
        for p in r:
            d = Vector((p.x, p.y - 0.01, 0))
            d = d.normalized() if d.length > 1e-6 else Vector((0, 1, 0))
            ir.append(p - d * th)
        inner_rows.append(ir)
    base = len(md.v)
    for r in rows:
        md.v.extend(r)
        md.c.extend([(1.0, 1.0, 1.0)] * nj)
    ib = len(md.v)
    for r in inner_rows:
        md.v.extend(r)
        md.c.extend([(1.0, 1.0, 1.0)] * nj)
    O = lambda i, j: base + i * nj + j
    I = lambda i, j: ib + i * nj + j
    nc = nj if closed else nj - 1

    def add(f, m, out_ref):
        a, b, c = md.v[f[0]], md.v[f[1]], md.v[f[2]]
        if (b - a).cross(c - a).dot(out_ref) < 0:
            f = tuple(reversed(f))
        md.f.append(tuple(f))
        md.fm.append(m)
    for i in range(ni - 1):
        for j in range(nc):
            j2 = (j + 1) % nj
            p = rows[i][j]
            o = Vector((p.x, p.y - 0.01, 0)).normalized()
            edge = j < facing_cols or j >= nc - facing_cols
            add((O(i, j), O(i + 1, j), O(i + 1, j2), O(i, j2)), inner if edge else mat, o)
            add((I(i, j), I(i + 1, j), I(i + 1, j2), I(i, j2)), inner, -o)
    for i in range(ni - 1):
        for j in ((0, nj - 1) if not closed else ()):
            p = rows[i][j]
            side = rows[i][j] - rows[i][1 if j == 0 else nj - 2]
            add((O(i, j), O(i + 1, j), I(i + 1, j), I(i, j)), inner, side)
    for i in (0, ni - 1):
        for j in range(nc):
            j2 = (j + 1) % nj
            side = Vector((0, 0, 1 if i == 0 else -1))
            add((O(i, j), O(i, j2), I(i, j2), I(i, j)), inner if i == ni - 1 else mat, side)


def skirt(info):
    md = MeshData()
    npl = 24
    sub = [0.0, 0.2, 0.4, 0.6, 0.78, 0.86, 0.93]
    zs = [0.990, 0.972, 0.952, 0.930, 0.905, 0.880, 0.855, 0.830, 0.805, 0.780, 0.755, 0.735]
    rows = []
    env = None
    for z in zs:
        rx, yf, yb = info.envelope(z)
        env = (max(env[0], rx), min(env[1], yf), max(env[2], yb)) if env else (rx, yf, yb)
        rx, yf, yb = env
        cy, ry = (yf + yb) / 2, (yb - yf) / 2
        fl = 0.006 + 0.045 * sstep(0.985, 0.74, z) ** 1.1
        amp = 0.050 * sstep(0.975, 0.86, z)
        row = []
        for k in range(npl):
            for pp in sub:
                a = 2 * pi * (k + pp) / npl
                saw = (pp / 0.86 - 0.5) if pp <= 0.86 else (0.5 - (pp - 0.86) / 0.14)
                m = 1.0 + amp * saw
                s, c = sin(a), cos(a)
                row.append(Vector(((rx + fl) * m * math.copysign(abs(s) ** (2 / 2.3), s),
                                   cy - (ry + fl) * m * math.copysign(abs(c) ** (2 / 2.3), c), z)))
        rows.append(row)
    _thick_grid(md, rows, 0.003, 'mf_skirt', 'mf_skirt_inner', closed=True)
    # waistband
    def wfn(p):
        side = 'thigh_L' if p.x > 0 else 'thigh_R'
        t = 0.55 * sstep(0.95, 0.74, p.z) * sstep(0.01, 0.07, abs(p.x))
        w = {'hips': 1.0 - t}
        if t > 0:
            w[side] = t
        return w
    return proc_object('Skirt', md, info, wfn)


def collar(info):
    """shirt collar: stand around the neck and two folded points"""
    xs, ys = [], []
    for i, c in enumerate(info.co):
        if abs(c.z - COLLAR_Z) < 0.006 and abs(c.x) < 0.075 and info.is_(i, ('neck', 'chest')):
            xs.append(c.x)
            ys.append(c.y)
    cx, cy = 0.0, (min(ys) + max(ys)) / 2
    rx, ry = (max(xs) - min(xs)) / 2 + 0.004, (max(ys) - min(ys)) / 2 + 0.004
    md = MeshData()
    # stand
    rows = []
    for z in (COLLAR_Z - 0.008, COLLAR_Z + 0.004, COLLAR_Z + 0.014):
        k = 1.0 - 0.06 * sstep(COLLAR_Z, COLLAR_Z + 0.014, z)
        rows.append([Vector((cx + rx * k * sin(2 * pi * j / 40), cy - ry * k * cos(2 * pi * j / 40), z))
                     for j in range(40)])
    md.add_grid(rows, 'mf_shirt', closed=True)
    md.add_grid([list(reversed(r)) for r in rows], 'mf_shirt', closed=True)
    # folded wings
    na = 36
    a0 = radians(12)
    wing = []
    for t in (0.0, 0.3, 0.65, 1.0):
        row = []
        for j in range(na):
            a = lerp(a0, 2 * pi - a0, j / (na - 1))
            da = min(a, 2 * pi - a)
            tip = sstep(radians(75), radians(14), da)
            length = 0.020 + 0.026 * tip
            out = 0.004 + length * t * lerp(0.55, 0.35, tip)
            z = COLLAR_Z + 0.014 - length * t * lerp(0.80, 0.95, tip)
            fwd = 0.010 * tip * t
            row.append(Vector((cx + (rx + out) * sin(a), cy - (ry + out) * cos(a) - fwd, z)))
        wing.append(row)
    md.add_grid(wing, 'mf_shirt', closed=False)
    md.add_grid([list(reversed(r)) for r in wing], 'mf_shirt', closed=False)
    return proc_object('Collar', md, info, lambda p: {'chest': 0.6, 'neck': 0.4})


def _front_surface():
    """BVH of the shirt surface for laying the tie on"""
    from mathutils.bvhtree import BVHTree
    ob = bpy.data.objects['Shirt']
    me = ob.data
    return BVHTree.FromPolygons([v.co.copy() for v in me.vertices], [tuple(p.vertices) for p in me.polygons])


def tie(info):
    bvh = _front_surface()

    def on(x, z, lift):
        hit = bvh.ray_cast(Vector((x, -1, z)), Vector((0, 1, 0)))
        y = hit[0].y if hit[0] is not None else -0.08
        return Vector((x, y - lift, z))
    md = MeshData()
    # knot
    rows = []
    for z, hw, th in ((COLLAR_Z + 0.002, 0.0085, 0.004), (COLLAR_Z - 0.004, 0.0110, 0.0055),
                      (COLLAR_Z - 0.012, 0.0100, 0.006), (COLLAR_Z - 0.020, 0.0075, 0.0045)):
        c = on(0, z, 0.006)
        rows.append([c + Vector((hw * sin(2 * pi * j / 14), -th * cos(2 * pi * j / 14), 0)) for j in range(14)])
    md.add_grid(rows, 'mf_tie', closed=True, cap_start=on(0, COLLAR_Z + 0.004, 0.006),
                cap_end=on(0, COLLAR_Z - 0.022, 0.006))
    # blade with diagonal stripes
    ztop, zbot = COLLAR_Z - 0.018, 1.02
    step = 0.0040
    pattern = ['mf_tie'] * 5 + ['mf_tie_stripe', 'mf_tie', 'mf_tie_stripe']
    ncol = 9
    q = COLLAR_Z
    k = 0
    prev = None
    while q > zbot - 0.03:
        row = []
        for j in range(ncol):
            u = lerp(-1, 1, j / (ncol - 1))
            z = min(max(q + 0.85 * u * 0.018, zbot), ztop)
            hw = lerp(0.012, 0.019, (ztop - z) / (ztop - zbot))
            row.append(on(u * hw, z, 0.0045 - 0.0015 * u * u))
        if prev is not None:
            mat = pattern[k % len(pattern)]
            md.add_grid([prev, row], mat, closed=False)
            back = [[p + Vector((0, 0.0012, 0)) for p in r] for r in (prev, row)]
            md.add_grid(back, 'mf_tie', closed=False, flip=True)
            k += 1
        prev = row
        q -= step
    return proc_object('Tie', md, info, lambda p: {'chest': 0.7, 'spine': 0.3} if p.z < 1.16 else {'chest': 1.0})


def crest(info):
    from mathutils.bvhtree import BVHTree
    ob = bpy.data.objects['RobeUpper']
    me = ob.data
    bvh = BVHTree.FromPolygons([v.co.copy() for v in me.vertices], [tuple(p.vertices) for p in me.polygons])
    cx, cz = 0.088, 1.150
    hit = bvh.ray_cast(Vector((cx, -1, cz)), Vector((0, 1, 0)))
    p0, n = hit[0], hit[1]
    if n.y > 0:
        n = -n
    eu = Vector((1, 0, 0)) - n * n.x
    eu.normalize()
    ev = n.cross(eu).normalized()
    if ev.z < 0:
        ev = -ev
    P = lambda u, v, h: p0 + eu * u + ev * v + n * h
    md = MeshData()
    half = [(0.0, 0.021), (0.006, 0.019), (0.012, 0.021), (0.017, 0.024), (0.0195, 0.021),
            (0.019, 0.010), (0.0185, 0.000), (0.0165, -0.009), (0.0120, -0.017), (0.006, -0.0225),
            (0.0, -0.0255)]
    outline = half + [(-u, v) for u, v in reversed(half[1:-1])]

    def plate(sc, h0, h1, mat):
        top = [P(u * sc, v * sc, h1) for u, v in outline]
        bot = [P(u * sc * 1.03, v * sc * 1.03, h0) for u, v in outline]
        md.add_grid([bot, top], mat, closed=True, cap_end=P(0, 0, h1 + 0.0004))
    plate(1.0, -0.0004, 0.0018, 'mf_crest_silver')
    plate(0.80, 0.0014, 0.0030, 'mf_crest_green')
    # serpent
    pts = []
    for i in range(25):
        t = i / 24
        v = lerp(0.0115, -0.0140, t)
        u = -0.0060 * sin(2 * pi * t * 1.02 + 0.25) * lerp(0.75, 1.0, t)
        pts.append(P(u, v, 0.0037))
    rows = []
    for i, p in enumerate(pts):
        t = (pts[min(i + 1, 24)] - pts[max(i - 1, 0)]).normalized()
        s = t.cross(n).normalized()
        k = i / 24
        r = 0.0017 * (1.5 if k < 0.08 else 1.0) * lerp(1.0, 0.35, sstep(0.75, 1.0, k))
        rows.append([p + s * (r * cos(2 * pi * q / 6)) + n * (r * 0.8 * sin(2 * pi * q / 6)) for q in range(6)])
    md.add_grid(rows, 'mf_crest_silver', closed=True, cap_start=pts[0] + (pts[0] - pts[1]) * 0.6,
                cap_end=pts[-1] + (pts[-1] - pts[-2]) * 0.5)
    w = info.weights_near(p0)
    return proc_object('Crest', md, info, lambda p: dict(w))


def _bvh(name):
    from mathutils.bvhtree import BVHTree
    me = bpy.data.objects[name].data
    return BVHTree.FromPolygons([v.co.copy() for v in me.vertices], [tuple(p.vertices) for p in me.polygons])


def _strip(md, bvh, line, w_in, w_out, lift, th, mat, mat_back=None):
    """trim band on a surface along line [(x, z)]; spans w_in towards the
    centre and w_out outwards (in x), fixed to the surface seen from the front"""
    rows = []
    last_y = None
    for x, z in line:
        sg = 1.0 if x >= 0 else -1.0
        row = []
        for u in (x - sg * w_in, x, x + sg * w_out):
            hit = bvh.ray_cast(Vector((u, -1, z)), Vector((0, 1, 0)))
            if hit[0] is None or hit[0].y > -0.03:          # went through the opening to the back
                hit = bvh.ray_cast(Vector((x + sg * w_out, -1, z)), Vector((0, 1, 0)))
            if hit[0] is not None and hit[0].y < -0.03:
                last_y = hit[0].y
            y = last_y if last_y is not None else -0.1
            row.append(Vector((u, y - lift, z)))
        rows.append(row)
    back = [[p + Vector((0, th, 0)) for p in r] for r in rows]
    md.add_grid(rows, mat, closed=False, flip=True)
    md.add_grid(back, mat_back or mat, closed=False)
    for i in range(len(rows) - 1):        # outer edge
        for j in (0, 2):
            q = [rows[i][j], rows[i + 1][j], back[i + 1][j], back[i][j]]
            b0 = len(md.v)
            md.v.extend(q)
            md.c.extend([(1.0, 1.0, 1.0)] * 4)
            md.f.append((b0, b0 + 1, b0 + 2, b0 + 3) if j == 2 else (b0 + 3, b0 + 2, b0 + 1, b0))
            md.fm.append(mat)


def trims(info):
    # vest V-neck rib
    md = MeshData()
    bvh = _bvh('Vest')
    for sg in (1.0, -1.0):
        line = [(sg * max((z - V_BOTTOM) * 0.42, 0.0015), z) for z in
                [V_BOTTOM - 0.004 + k * (1.262 - V_BOTTOM) / 24 for k in range(25)]]
        _strip(md, bvh, line, 0.0, 0.012, 0.0012, 0.002, 'mf_sweater_trim')
    proc_object('VestTrim', md, info)
    # robe front facings (green), covering the cut edge of the opening
    md = MeshData()
    bvh = _bvh('RobeUpper')
    for sg in (1.0, -1.0):
        zs = [0.975 + k * (1.25 - 0.975) / 20 for k in range(21)]
        line = [(sg * robe_open(z), z) for z in zs]
        _strip(md, bvh, line, 0.002, 0.020, 0.0016, 0.003, 'mf_robe_lining')
    proc_object('RobeFacing', md, info)


def hood(info):
    """folded hood lying round the neck on the shoulders; its ends become
    the lapels. Black outside, green lining on the underside."""
    xs, ys = [], []
    for i, c in enumerate(info.co):
        if abs(c.z - (COLLAR_Z - 0.02)) < 0.008 and abs(c.x) < 0.09 and info.is_(i, ('neck', 'chest')):
            xs.append(c.x)
            ys.append(c.y)
    cy = (min(ys) + max(ys)) / 2
    rx = (max(xs) - min(xs)) / 2
    ry = (max(ys) - min(ys)) / 2
    md = MeshData()
    na, nq = 64, 14
    a0 = radians(26)
    rows = []
    mats_row = []
    for k in range(na):
        a = lerp(a0, 2 * pi - a0, k / (na - 1))              # 0 = front centre
        da = min(a, 2 * pi - a)
        back = sstep(radians(70), radians(170), da)
        front = sstep(radians(110), radians(30), da)
        w = lerp(0.030, 0.052, back) * lerp(1.0, 0.75, front)  # radial width of the fold
        h = lerp(0.010, 0.020, back)                            # thickness of the fold
        drop = 0.10 * front ** 1.6                             # lapel ends run down the chest
        r0x, r0y = rx + 0.022, ry + 0.022
        cx_, cy_ = r0x * sin(a), cy - r0y * cos(a)
        z0 = COLLAR_Z - 0.008 - drop + 0.006 * back
        out = Vector((sin(a), -cos(a), 0)).normalized()
        if front > 0:
            # lapel: follow the robe opening edge downwards
            ox = math.copysign(robe_open(z0) + 0.006, sin(a))
            cx_ = lerp(cx_, ox, front)
            cy_ = lerp(cy_, -0.10 - 0.02 * front, front * 0.6)
        ring = []
        for q in range(nq):
            t = 2 * pi * q / nq
            ring.append(Vector((cx_, cy_, z0)) + out * (w * 0.5 * (1 + cos(t))) +
                        Vector((0, 0, h * 0.5 * sin(t) + 0.012 * (1 - cos(t)) * 0.5 * back)))
        rows.append(ring)
    md.add_grid(rows, 'mf_robe', closed=True)
    # underside (lower half of the section) shows the lining
    nf = (na - 1) * nq
    for fi in range(nf):
        q = fi % nq
        if q >= nq // 2:
            md.fm[fi] = 'mf_robe_lining'
    # winding: make faces point away from the fold's core
    for fi, f in enumerate(md.f):
        a, b, c = md.v[f[0]], md.v[f[1]], md.v[f[2]]
        k = (fi // nq) if fi < nf else 0
        core = sum(rows[min(k, na - 1)], Vector()) / nq
        cen = (a + b + c) / 3
        if (b - a).cross(c - a).dot(cen - core) < 0:
            md.f[fi] = tuple(reversed(f))
    return proc_object('Hood', md, info, lambda p: {'chest': 0.8, 'neck': 0.2} if p.z > 1.2 else {'chest': 1.0})


def hide_covered_body(info):
    """remove body faces that are always covered (torso and arms under the
    shirt, legs under the socks) so skin can't poke through while animating"""
    ob = body()
    me = ob.data
    if me.shape_keys:
        ob.shape_key_clear()
    bm = bmesh.new()
    bm.from_mesh(me)
    bm.verts.ensure_lookup_table()

    def covered(i):
        c = info.co[i]
        if info.is_(i, HANDS + ('head', 'neck')):
            return False
        torso = 0.985 < c.z and (c.z < COLLAR_Z - 0.012 or abs(c.x) > 0.11) and abs(c.x) < 0.47
        legs = c.z < 0.43
        return torso or legs
    cov = [covered(i) for i in range(len(bm.verts))]
    dead = [f for f in bm.faces if all(cov[v.index] for v in f.verts)]
    bmesh.ops.delete(bm, geom=dead, context='FACES_ONLY')
    bm.to_mesh(me)
    bm.free()
    print('MF outfit: removed %d covered body faces' % len(dead))


def build(head, parts, arm, mats):
    info = Info()
    shirt(info)
    vest(info)
    socks(info)
    shoes(info)
    robe_upper(info)
    robe_lower(info)
    skirt(info)
    collar(info)
    tie(info)
    crest(info)
    trims(info)
    hide_covered_body(info)
    reweight_hair()


def reweight_hair():
    """hair on the head follows the head; below the neck it lies on the
    back/shoulders and follows the chest, then the spine"""
    ob = bpy.data.objects.get('Hair')
    if ob is None:
        return
    for g in list(ob.vertex_groups):
        ob.vertex_groups.remove(g)
    G = {n: ob.vertex_groups.new(name=n) for n in ('head', 'neck', 'chest', 'spine')}
    for v in ob.data.vertices:
        z = v.co.z
        h = sstep(1.27, 1.36, z)
        sp = sstep(1.08, 0.94, z)
        w = {'head': h, 'chest': (1 - h) * (1 - sp), 'spine': (1 - h) * sp}
        for n, x in w.items():
            if x > 1e-3:
                G[n].add([v.index], x, 'REPLACE')
