"""Splits the purchased uniform mesh into garments by its loose parts.

The pack ships one mesh (centimetres, A-pose, -Y front) whose loose parts
come in outer/inner shell pairs. Each part is classified from its bounds.
"""
import bmesh
from mathutils import Vector


def loose_parts(ob):
    """[(vertex index list, (min, max) in object-world cm)]"""
    M = ob.matrix_world
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    bm.verts.ensure_lookup_table()
    seen = {}
    comps = []
    for v in bm.verts:
        if v.index in seen:
            continue
        st = [v]
        comp = [v.index]
        seen[v.index] = 1
        while st:
            a = st.pop()
            for e in a.link_edges:
                o = e.other_vert(a)
                if o.index not in seen:
                    seen[o.index] = 1
                    st.append(o)
                    comp.append(o.index)
        ws = [M @ bm.verts[k].co for k in comp]
        mn = Vector([min(w[i] for w in ws) for i in range(3)])
        mx = Vector([max(w[i] for w in ws) for i in range(3)])
        comps.append((comp, mn, mx))
    bm.free()
    return comps


def classify(mn, mx, n):
    cx, cy = (mn.x + mx.x) / 2, (mn.y + mx.y) / 2
    w, d, h = mx.x - mn.x, mx.y - mn.y, mx.z - mn.z
    if mx.z < 50:
        return 'socks'
    if mx.z <= 109 and mn.z < 90:
        return 'skirt'
    if abs(cx) > 25 or (abs(cx) > 14 and w < 40 and h > 30 and mn.z > 100 and abs(mn.x) > 14):
        return 'sleeve'
    if mn.z > 146:
        return 'collar'
    if w < 8 and mx.y < 0 and h > 30:
        return 'tie' if w > 2.5 or mn.z > 108 else 'placket'
    if mn.z >= 99 and mx.z <= 114 and h < 11:
        return 'band'
    return 'torso'
