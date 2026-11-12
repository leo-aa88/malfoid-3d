"""Black hoop earrings through both ear lobes."""
from math import sin, cos, pi
import bpy
from mathutils import Vector
from .meshutil import MeshData

R_MAJOR = 0.0088
R_MINOR = 0.0018


def build(head, parts, mats):
    me = head.data
    md = MeshData()
    for side, sgn in (('_L', 1.0), ('_R', -1.0)):
        co = [me.vertices[i].co for i in parts['ear' + side]]
        zmin = min(c.z for c in co)
        low = [c for c in co if c.z < zmin + 0.004]
        lobe = sum(low, Vector()) / len(low)
        axis = Vector((0.62 * sgn, -0.78, 0.0)).normalized()     # ring faces front-outward
        up = Vector((0, 0, 1))
        sidev = axis.cross(up).normalized()
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
    ob = md.to_object('Earrings', mats, rig=bpy.data.objects.get('rig'))
    return ob
