"""Small helpers for building new meshes (hair, earrings) around the head."""
import math
from math import sin, cos, pi
import bpy
from mathutils import Vector
from mathutils.bvhtree import BVHTree


def sstep(a, b, x):
    if a == b:
        return 0.0 if x < a else 1.0
    t = max(0.0, min(1.0, (x - a) / (b - a)))
    return t * t * (3 - 2 * t)


def lerp(a, b, t):
    return a + (b - a) * t


def bvh_of(ob, vert_ids=None):
    """BVH of an object's current mesh (object space == world here)."""
    me = ob.data
    if vert_ids is None:
        return BVHTree.FromPolygons([v.co.copy() for v in me.vertices], [tuple(p.vertices) for p in me.polygons])
    remap = {v: i for i, v in enumerate(vert_ids)}
    polys = [[remap[v] for v in p.vertices] for p in me.polygons if p.vertices[0] in remap]
    return BVHTree.FromPolygons([me.vertices[i].co.copy() for i in vert_ids], polys)


def catmull(points, n):
    """centripetal Catmull-Rom through points, resampled to n points evenly
    spaced along the curve"""
    pts = [Vector(p) for p in points]
    ext = [pts[0] * 2 - pts[1]] + pts + [pts[-1] * 2 - pts[-2]]
    dense = []
    for i in range(1, len(ext) - 2):
        p0, p1, p2, p3 = ext[i - 1], ext[i], ext[i + 1], ext[i + 2]

        def tj(ti, a, b):
            return ti + max((b - a).length, 1e-6) ** 0.5
        t0 = 0.0
        t1 = tj(t0, p0, p1)
        t2 = tj(t1, p1, p2)
        t3 = tj(t2, p2, p3)
        for k in range(24):
            t = lerp(t1, t2, k / 24)
            a1 = p0 * ((t1 - t) / (t1 - t0)) + p1 * ((t - t0) / (t1 - t0))
            a2 = p1 * ((t2 - t) / (t2 - t1)) + p2 * ((t - t1) / (t2 - t1))
            a3 = p2 * ((t3 - t) / (t3 - t2)) + p3 * ((t - t2) / (t3 - t2))
            b1 = a1 * ((t2 - t) / (t2 - t0)) + a2 * ((t - t0) / (t2 - t0))
            b2 = a2 * ((t3 - t) / (t3 - t1)) + a3 * ((t - t1) / (t3 - t1))
            dense.append(b1 * ((t2 - t) / (t2 - t1)) + b2 * ((t - t1) / (t2 - t1)))
    dense.append(pts[-1].copy())
    acc = [0.0]
    for i in range(1, len(dense)):
        acc.append(acc[-1] + (dense[i] - dense[i - 1]).length)
    out = []
    j = 0
    for k in range(n):
        d = acc[-1] * k / (n - 1)
        while j < len(acc) - 2 and acc[j + 1] < d:
            j += 1
        seg = acc[j + 1] - acc[j]
        t = 0.0 if seg < 1e-9 else (d - acc[j]) / seg
        out.append(dense[j].lerp(dense[j + 1], max(0.0, min(1.0, t))))
    return out


class MeshData:
    def __init__(self):
        self.v = []
        self.f = []
        self.fm = []

    def add_grid(self, rows, mat, closed=True, cap_start=None, cap_end=None, flip=False):
        n = len(rows[0])
        base = len(self.v)
        for r in rows:
            self.v.extend(Vector(p) for p in r)
        nc = n if closed else n - 1
        for i in range(len(rows) - 1):
            for j in range(nc):
                j2 = (j + 1) % n
                q = (base + i * n + j, base + i * n + j2, base + (i + 1) * n + j2, base + (i + 1) * n + j)
                self.f.append(tuple(reversed(q)) if flip else q)
                self.fm.append(mat)
        for cap, ring_i, rev in ((cap_start, 0, True), (cap_end, len(rows) - 1, False)):
            if cap is None:
                continue
            ci = len(self.v)
            self.v.append(Vector(cap))
            for j in range(nc):
                j2 = (j + 1) % n
                a, b = base + ring_i * n + j, base + ring_i * n + j2
                tri = (b, a, ci) if rev else (a, b, ci)
                self.f.append(tuple(reversed(tri)) if flip else tri)
                self.fm.append(mat)

    def to_object(self, name, mats, bone='head.x', rig=None):
        me = bpy.data.meshes.new(name)
        me.from_pydata([tuple(v) for v in self.v], [], self.f)
        names = []
        for m in self.fm:
            if m not in names:
                names.append(m)
        for n in names:
            me.materials.append(mats[n])
        for p, m in zip(me.polygons, self.fm):
            p.material_index = names.index(m)
            p.use_smooth = True
        me.update()
        ob = bpy.data.objects.get(name)
        if ob is not None:
            bpy.data.objects.remove(ob)
        ob = bpy.data.objects.new(name, me)
        bpy.context.scene.collection.objects.link(ob)
        if bone:
            g = ob.vertex_groups.new(name=bone)
            g.add(list(range(len(self.v))), 1.0, 'REPLACE')
        if rig is not None:
            ob.parent = rig
            mod = ob.modifiers.new('rig', 'ARMATURE')
            mod.object = rig
        return ob
