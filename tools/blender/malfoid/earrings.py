"""Earrings through both ear lobes: Malfoid's black hoops, Cho's small dangling silver stars
(facial atlas: a short drop from the lobe, a four-point star below it), or Susan's small gold
studs (her facial atlas: a round bead on the front of the lobe)."""
from math import sin, cos, pi
import bpy
from mathutils import Vector
from .meshutil import MeshData

R_MAJOR = 0.0088
R_MINOR = 0.0018
# star earrings (m)
DROP = 0.0065             # lobe to the star's top point
WIRE = 0.00055            # wire radius
STAR_R = 0.0058           # point radius
STAR_IN = 0.0018          # radius between the points
STAR_T = 0.0015           # half thickness at the centre ridge
SILVER = 'mf_earring_silver'
GOLD = 'mf_earring_gold'
STUD_R = 0.0017           # stud bead radius (m)


def _lobes(head, parts):
    me = head.data
    for side, sgn in (('_L', 1.0), ('_R', -1.0)):
        co = [me.vertices[i].co for i in parts['ear' + side]]
        zmin = min(c.z for c in co)
        low = [c for c in co if c.z < zmin + 0.004]
        lobe = sum(low, Vector()) / len(low)
        axis = Vector((0.62 * sgn, -0.78, 0.0)).normalized()     # faces front-outward
        up = Vector((0, 0, 1))
        sidev = axis.cross(up).normalized()
        yield sgn, lobe, axis, up, sidev


def _hoops(md, head, parts):
    for sgn, lobe, axis, up, sidev in _lobes(head, parts):
        centre = lobe + Vector((0.0030 * sgn, 0, -(R_MAJOR - 0.0030)))
        rows = []
        for i in range(36):
            t = 2 * pi * i / 36
            d = up * cos(t) + sidev * sin(t)
            c = centre + d * R_MAJOR
            rows.append([c + d * (R_MINOR * cos(2 * pi * k / 10)) + axis * (R_MINOR * sin(2 * pi * k / 10))
                         for k in range(10)])
        rows.append(rows[0])
        md.add_grid(rows, 'mf_earring', closed=True, flip=sgn < 0)


def _stars(md, head, parts):
    for sgn, lobe, axis, up, sidev in _lobes(head, parts):
        top = lobe + Vector((0.0022 * sgn, 0, -0.0012))           # through the lobe
        bottom = top - up * DROP
        # the drop: a thin wire with a bead where it leaves the lobe
        rows = []
        for i in range(5):
            c = top.lerp(bottom, i / 4)
            rows.append([c + sidev * (WIRE * cos(2 * pi * k / 8)) + axis * (WIRE * sin(2 * pi * k / 8)) for k in range(8)])
        md.add_grid(rows, SILVER, closed=True, flip=sgn < 0, cap_start=top, cap_end=bottom)
        bead = [[top + (sidev * cos(b) * sin(a) + axis * sin(b) * sin(a) + up * cos(a)) * 0.0010
                 for b in [2 * pi * k / 8 for k in range(8)]] for a in [pi * i / 6 for i in range(1, 6)]]
        md.add_grid(bead, SILVER, closed=True, flip=sgn < 0, cap_start=top + up * 0.001, cap_end=top - up * 0.001)
        # the star: four long points with concave sides, ridged front and back
        c = bottom - up * STAR_R
        ring = []
        for k in range(8):
            a = pi * k / 4
            r = STAR_R if k % 2 == 0 else STAR_IN
            ring.append(c + (up * cos(a) + sidev * sin(a)) * r)
        n = len(md.v)
        md.v.extend(ring)
        md.v.append(c + axis * STAR_T)
        md.v.append(c - axis * STAR_T)
        md.c.extend([(1.0, 1.0, 1.0)] * 10)
        front, back = n + 8, n + 9
        for k in range(8):
            a, b = n + k, n + (k + 1) % 8
            for tri in ((a, b, front), (b, a, back)):
                md.f.append(tuple(reversed(tri)) if sgn < 0 else tri)
                md.fm.append(SILVER)


def _studs(md, head, parts):
    for sgn, lobe, axis, up, sidev in _lobes(head, parts):
        # on the front of the lobe, a little proud of it (a slightly flattened bead)
        c = lobe + Vector((0.0024 * sgn, 0, 0.0004)) + axis * 0.0012
        rings = []
        for i in range(1, 8):
            a = pi * i / 8
            rings.append([c + (sidev * cos(b) * sin(a) + up * sin(b) * sin(a)) * STUD_R + axis * (cos(a) * STUD_R * 0.75)
                          for b in [2 * pi * k / 10 for k in range(10)]])
        md.add_grid(rings, GOLD, closed=True, flip=sgn < 0, cap_start=c + axis * STUD_R * 0.75, cap_end=c - axis * STUD_R * 0.75)


def build(head, parts, mats, style=True):
    md = MeshData()
    {'star': _stars, 'stud': _studs}.get(style, _hoops)(md, head, parts)
    return md.to_object('Earrings', mats, rig=bpy.data.objects.get('rig'))
