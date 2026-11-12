"""Loading and understanding the base character's head mesh.

The head ('Body' object) is one mesh made of many loose parts: the face
skin, ears, iris discs, lashes, brows, teeth, tongue and a set of effect
meshes parked inside the skull. The original textures are not shipped with
the file, so every part is identified geometrically and given its own
material slot.
"""
import bpy
import bmesh
from mathutils import Vector

HEAD_OBJ = 'Body'
BODY_OBJ = 'Body_All'
RIG_OBJ = 'rig'


def components(bm):
    """connected components -> list of vertex index lists, largest first"""
    comp_of = {}
    comps = []
    for v in bm.verts:
        if v.index in comp_of:
            continue
        cid = len(comps)
        stack = [v]
        comp = []
        comp_of[v.index] = cid
        while stack:
            a = stack.pop()
            comp.append(a.index)
            for e in a.link_edges:
                o = e.other_vert(a)
                if o.index not in comp_of:
                    comp_of[o.index] = cid
                    stack.append(o)
        comps.append(comp)
    comps.sort(key=lambda c: -len(c))
    return comps


def uv_islands(bm, faces, uv):
    def key(l):
        return (round(l[uv].uv.x, 5), round(l[uv].uv.y, 5))
    fid = {f.index: None for f in faces}
    isl = []
    for f in faces:
        if fid[f.index] is not None:
            continue
        i = len(isl)
        st = [f]
        fid[f.index] = i
        cur = [f]
        while st:
            a = st.pop()
            for l in a.loops:
                for l2 in l.edge.link_loops:
                    g = l2.face
                    if g.index in fid and fid[g.index] is None:
                        ka = {key(x) for x in a.loops if x.vert in l.edge.verts}
                        kb = {key(x) for x in g.loops if x.vert in l.edge.verts}
                        if ka == kb:
                            fid[g.index] = i
                            st.append(g)
                            cur.append(g)
        isl.append(cur)
    return isl


def classify(head):
    """Returns {part_name: [vertex indices]} and {part_name: [face indices]}.
    Sided parts get _L / _R (character's left is +X)."""
    me = head.data
    bm = bmesh.new()
    bm.from_mesh(me)
    bm.verts.ensure_lookup_table()
    bm.faces.ensure_lookup_table()
    uv = bm.loops.layers.uv['UVMap']
    comps = components(bm)
    parts = {}
    fparts = {}

    def add(name, vids):
        parts.setdefault(name, []).extend(vids)

    for ci, comp in enumerate(comps):
        n = len(comp)
        vs = [bm.verts[i] for i in comp]
        cen = sum((v.co for v in vs), Vector()) / n
        mats = {f.material_index for v in vs for f in v.link_faces}
        mat = min(mats) if mats else 0
        side = '_L' if cen.x > 0.004 else ('_R' if cen.x < -0.004 else '')
        hidden = cen.y > -0.012
        if ci == 0:
            name = 'face'
        elif n == 409:
            name = 'ear' + side
        elif mat in (3, 4) or (hidden and mat != 1 and n not in (386, 100)):
            name = 'fx'
        elif mat == 1:
            name = ('iris' if n > 50 else 'pupil') + side if not hidden else 'fx'
        elif mat == 2:
            name = 'highlight' + side
        elif n == 386:
            name = 'tongue'
        elif n == 100:
            name = 'teeth_upper' if cen.z > 1.334 else 'teeth_lower'
        elif n == 33 and cen.z > 1.41:
            name = 'brow' + side
        elif n == 60:
            name = 'lidline' + side
        elif n == 43:
            name = 'lidshade' + side
        elif n == 19:
            name = 'nose_mark'
        elif n == 99:
            name = 'lash_upper' + side
        elif n == 24:
            name = 'lash_lower' + side
        elif n == 40:
            name = 'lash_under' + side
        elif n == 29:
            name = 'lash_tail' + side
        elif n == 21:
            name = ('lash_spike_low' if cen.z < 1.385 else 'lash_spike') + side
        elif n == 8:
            name = 'lash_spike_low' + side
        else:
            name = 'unknown'
        add(name, comp)
    # face skin: UV islands separate the eye sockets and the mouth lining
    face_set = set(parts['face'])
    ffaces = [f for f in bm.faces if f.verts[0].index in face_set]
    for isl in uv_islands(bm, ffaces, uv):
        cs = [f.calc_center_median() for f in isl]
        cen = sum(cs, Vector()) / len(cs)
        if len(isl) == 143:
            fparts.setdefault('sclera_L' if cen.x > 0 else 'sclera_R', []).extend(f.index for f in isl)
        elif len(isl) == 254:
            fparts.setdefault('mouth_inner', []).extend(f.index for f in isl)
        elif len(isl) == 32 and abs(cen.x) < 0.002:
            # hair-thin strip of faces right on the lip seam: the base mesh's
            # own mouth line
            fparts.setdefault('lip_line', []).extend(f.index for f in isl)
    # lip rim: the loop where the visible lips meet the mouth lining
    inner = set(fparts['mouth_inner'])
    in_v, out_v = set(), set()
    for f in ffaces:
        (in_v if f.index in inner else out_v).update(v.index for v in f.verts)
    parts['lip_rim'] = sorted(in_v & out_v)
    bm.free()
    return parts, fparts


def landmarks(head, parts, key=None):
    """Named facial landmarks (object space) measured from the mesh. `key`
    selects a shape key's coordinates (default: basis / current mesh)."""
    me = head.data
    if key is not None:
        co = [d.co.copy() for d in me.shape_keys.key_blocks[key].data]
    else:
        co = [v.co.copy() for v in me.vertices]
    face = parts['face']

    def cen(name):
        ids = parts[name]
        return sum((co[i] for i in ids), Vector()) / len(ids)

    front = [co[i] for i in face if co[i].y < -0.02]
    mid = [p for p in front if abs(p.x) < 0.004]
    lm = {}
    lm['crown'] = max((co[i] for i in face), key=lambda p: p.z)
    lm['chin'] = min(mid, key=lambda p: p.z + 0.6 * p.y)     # lowest-front point
    lm['chin_bottom'] = min(mid, key=lambda p: p.z)
    lm['nose_tip'] = min(mid, key=lambda p: p.y)
    lm['eye_L'] = cen('iris_L')
    lm['eye_R'] = cen('iris_R')
    lm['brow_L'] = cen('brow_L')
    lm['brow_R'] = cen('brow_R')
    lm['cheek_L'] = max((p for p in front if 1.33 < p.z < 1.40), key=lambda p: p.x)
    lm['cheek_R'] = min((p for p in front if 1.33 < p.z < 1.40), key=lambda p: p.x)
    lm['ear_L'] = cen('ear_L')
    lm['mouth'] = cen('lip_rim')
    up = parts['lash_upper_L']
    lo = parts['lash_lower_L']
    lm['lid_top_L'] = max((co[i] for i in up), key=lambda p: p.z)
    lm['lid_bot_L'] = min((co[i] for i in lo), key=lambda p: p.z)
    lm['eye_in_L'] = min((co[i] for i in up), key=lambda p: p.x)
    lm['eye_out_L'] = max((co[i] for i in up), key=lambda p: p.x)
    return lm
