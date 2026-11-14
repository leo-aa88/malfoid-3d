"""Cho's Ravenclaw ribbon (and Susan's black one): a bow tied where her half-up is gathered at the back of
the head (blueprint 3/4 back and back views, facial atlas 3/4 back-head and hair details).

Built as real geometry, not a card:
- a knot: a short closed band wrapped round the gathered hair;
- two loops: flattened tubes pinched at the knot, swelling into rounded teardrops, tilted
  slightly up, with a soft fold down their middle;
- two tails: thin strips (with thickness) hanging from the knot, spreading a little, with the
  classic V-cut at their ends.

Every cross-section is pushed out to sit just above the hair surface (no clipping). The knot
and loops are rigid on the head bone; each tail vertex copies the skin weights of the hair
under it (blended in from the head at the knot), so the tails sway with the hair.
All sizes in metres; the frame is world space at the rest pose (-Y front, +Y back, Z up).
"""
from math import sin, cos, pi
import bpy
from mathutils import Vector
from mathutils.bvhtree import BVHTree
from mathutils.kdtree import KDTree
from .meshutil import MeshData, sstep

# --- shape (tuned against the blueprint / atlas back views)
LOOP_LEN = 0.050          # knot edge to loop tip, sideways
LOOP_H0 = 0.0072          # half height where the loop leaves the knot (pinched)
LOOP_H1 = 0.0195          # half height at its fullest
LOOP_D = 0.0058           # half depth (front-to-back) at its fullest: a flattened tube
LOOP_LIFT = 0.008         # the tips sit this much higher than the knot
KNOT_W = 0.0095           # knot half width
KNOT_H = 0.0085           # knot half height
KNOT_D = 0.0050           # knot half depth
TAIL_LEN = (0.105, 0.120)  # left, right
TAIL_W = (0.0058, 0.0074)  # half width at the knot, at the end
TAIL_T = 0.0009           # half thickness
TAIL_SPREAD = 0.020       # how far each tail end drifts sideways
CLEAR = 0.0022            # gap kept above the hair surface

# a character's profile may size the whole bow (Susan's is larger than Cho's); Cho's is 1
from .character import P as _P  # noqa: E402
_K = _P.get('ribbon_scale', 1.0)
if _K != 1.0:
    LOOP_LEN, LOOP_H0, LOOP_H1, LOOP_D, LOOP_LIFT = (v * _K for v in (LOOP_LEN, LOOP_H0, LOOP_H1, LOOP_D, LOOP_LIFT))
    KNOT_W, KNOT_H, KNOT_D = KNOT_W * _K, KNOT_H * _K, KNOT_D * _K
    TAIL_LEN = tuple(v * _K for v in TAIL_LEN)
    TAIL_W = tuple(v * _K for v in TAIL_W)
    TAIL_SPREAD *= _K
RINGS = 18                # sections along a loop
SEG = 16                  # points round a loop section


def _hair_surface(hair):
    me = hair.data
    return BVHTree.FromPolygons([v.co.copy() for v in me.vertices], [tuple(p.vertices) for p in me.polygons])


def _lift(ring, bvh, out_dir, min_gap=CLEAR):
    """move a whole cross-section outwards (along out_dir) until its innermost point clears
    the hair surface by min_gap"""
    need = 0.0
    for p in ring:
        hit = bvh.ray_cast(p + out_dir * 0.2, -out_dir, 0.4)
        if hit[0] is None:
            continue
        gap = (p - hit[0]).dot(out_dir)
        need = max(need, min_gap - gap)
    if need > 0:
        for i in range(len(ring)):
            ring[i] = ring[i] + out_dir * need
    return need


def _loop(G, side, bvh):
    """one bow loop on this side (+1: her left = +x, -1: right)"""
    out = Vector((0.0, 1.0, 0.0))
    rows = []
    for i in range(RINGS + 1):
        t = i / RINGS
        x = side * (KNOT_W * 0.7 + LOOP_LEN * t)
        # teardrop: pinched at the knot, fullest past the middle, rounded shut at the tip
        h = (LOOP_H0 + (LOOP_H1 - LOOP_H0) * sstep(0.0, 0.62, t)) * (max(0.0, 1.0 - t ** 3.2)) ** 0.5
        d = (0.0022 + (LOOP_D - 0.0022) * sin(pi * min(1.0, t * 1.15))) * (max(0.0, 1.0 - t ** 3.2)) ** 0.5
        zc = G.z + LOOP_LIFT * t ** 1.4
        # the loop curves back with the head a little, and bulges away from it in the middle
        yc = G.y + 0.0045 * sin(pi * t) - 0.010 * t * t
        ring = []
        for k in range(SEG):
            a = 2 * pi * k / SEG
            # a soft fold down the middle of the visible (back) face
            fold = 1.0 - 0.22 * max(0.0, cos(a)) * max(0.0, 1.0 - abs(sin(a)) * 2.2)
            ring.append(Vector((x, yc + d * cos(a) * fold, zc + h * sin(a))))
        _lift(ring, bvh, out)
        rows.append(ring)
    return rows


def _knot(G, bvh):
    out = Vector((0.0, 1.0, 0.0))
    rows = []
    n = 8
    for i in range(n + 1):
        t = i / n
        z = G.z + KNOT_H * (2 * t - 1)
        bulge = 1.0 + 0.18 * sin(pi * t)                 # wrapped: fuller in the middle
        ring = []
        for k in range(SEG):
            a = 2 * pi * k / SEG
            ring.append(Vector((G.x + KNOT_W * bulge * sin(a), G.y + 0.003 + KNOT_D * bulge * cos(a), z)))
        _lift(ring, bvh, out, CLEAR * 0.6)
        rows.append(ring)
    return rows


def _tail(G, side, bvh):
    """a hanging tail: a thin strip with thickness, V-cut at the end"""
    out = Vector((0.0, 1.0, 0.0))
    L = TAIL_LEN[0 if side > 0 else 1]
    n = 22
    rows = []
    for i in range(n + 1):
        t = i / n
        z = G.z - KNOT_H * 0.4 - L * t
        x = G.x + side * (0.004 + TAIL_SPREAD * t ** 1.3)
        w = TAIL_W[0] + (TAIL_W[1] - TAIL_W[0]) * t
        twist = 0.35 * sin(pi * t * 1.4) * side            # a gentle turn (folds)
        u = Vector((cos(twist), sin(twist) * 0.6, 0.0)).normalized()   # across the strip
        nrm = Vector((-u.y, u.x, 0.0))                        # through the strip (outwards)
        if nrm.y < 0:
            nrm = -nrm
        c = Vector((x, G.y + 0.002, z))
        # V-cut: the strip's centre ends shorter than its edges
        ring = []
        for (a, b) in ((-1, -1), (0, -1), (1, -1), (1, 1), (0, 1), (-1, 1)):
            notch = 0.0 if a else 0.011 * sstep(0.88, 1.0, t)
            ring.append(c + u * (a * w) + nrm * (b * TAIL_T) + Vector((0, 0, notch)))
        _lift(ring, bvh, out)
        rows.append(ring)
    return rows


def build(hair, gather, mats):
    """the bow at the gather point (world, rest pose); returns the object"""
    bvh = _hair_surface(hair)
    G = Vector(gather)
    # the knot sits on the hair surface at the gather
    hit = bvh.ray_cast(Vector((G.x, G.y + 0.3, G.z)), Vector((0, -1, 0)), 0.6)
    if hit[0] is not None:
        G.y = hit[0].y + KNOT_D * 0.6
    md = MeshData()
    knot = _knot(G, bvh)
    md.add_grid(knot, 'mf_ribbon', closed=True, cap_start=sum(knot[0], Vector()) / SEG,
                cap_end=sum(knot[-1], Vector()) / SEG)
    for side in (1, -1):
        rows = _loop(G, side, bvh)
        md.add_grid(rows, 'mf_ribbon', closed=True, flip=side < 0, cap_start=sum(rows[0], Vector()) / SEG,
                    cap_end=sum(rows[-1], Vector()) / SEG)
    rigid = len(md.v)
    for side in (1, -1):
        rows = _tail(G, side, bvh)
        md.add_grid(rows, 'mf_ribbon', closed=True, flip=side < 0,
                    cap_start=sum(rows[0], Vector()) / 6, cap_end=None)
    ob = md.to_object('Ribbon', mats, bone=None, rig=bpy.data.objects.get('rig'))
    _weights(ob, hair, rigid, G)
    print('MF ribbon: bow at %s, %d verts (%d rigid on the head)' %
          (tuple(round(c, 3) for c in G), len(md.v), rigid))
    return ob


def _weights(ob, hair, rigid, G):
    """knot and loops: the head bone; tails: blend from the head (at the knot) to the skin
    weights of the nearest hair vertex"""
    hm = hair.data
    kd = KDTree(len(hm.vertices))
    for v in hm.vertices:
        kd.insert(v.co, v.index)
    kd.balance()
    gname = {g.index: g.name for g in hair.vertex_groups}
    groups = {}

    def add(name, vi, w):
        if w <= 1e-4:
            return
        g = groups.get(name) or ob.vertex_groups.get(name) or ob.vertex_groups.new(name=name)
        groups[name] = g
        g.add([vi], w, 'ADD')

    for v in ob.data.vertices:
        if v.index < rigid:
            add('head.x', v.index, 1.0)
            continue
        k = sstep(G.z - 0.012, G.z - 0.045, v.co.z)         # 0 at the knot .. 1 lower down
        add('head.x', v.index, 1.0 - k)
        if k <= 0:
            continue
        _, hi, _ = kd.find(v.co)
        hv = hm.vertices[hi]
        tot = sum(g.weight for g in hv.groups) or 1.0
        for g in hv.groups:
            add(gname[g.group], v.index, k * g.weight / tot)
