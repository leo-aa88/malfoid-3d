"""Smaller bust as a shape key on the body (the original Basis is untouched).

The base mesh's own breast weight groups (chest_L/R, chest_001_*, chest_002_*)
are the mask. Inside it, the forward projection in front of the chest wall
(a line from the underbust to the upper chest) is reduced to BUST_KEEP of its
original size; nothing moves sideways or vertically, and the edges blend out
through the mask weights. The clothing is fitted to the body with this key
applied (see body_co()).
"""
import os
import numpy as np
import bpy

KEY = 'mf_bust_small'
BUST_KEEP = float(os.environ.get('MF_BUST_KEEP', '0.45'))   # 1.0 = original bust
WALL = ((1.090, -0.0898), (1.215, -0.0560))                  # (z, y) of the chest wall at the midline
GROUPS = ('chest_L', 'chest_R', 'chest_001_L', 'chest_001_R', 'chest_002_L', 'chest_002_R')


def add_key():
    ob = bpy.data.objects['Body_All']
    me = ob.data
    if me.shape_keys and KEY in me.shape_keys.key_blocks:
        return
    gi = {g.index for g in ob.vertex_groups if g.name in GROUPS}
    n = len(me.vertices)
    w = np.zeros(n)
    for v in me.vertices:
        w[v.index] = min(1.0, sum(g.weight for g in v.groups if g.group in gi))
    # soften the mask edge over the mesh (2 passes of neighbour averaging)
    nb = [[] for _ in range(n)]
    for e in me.edges:
        a, b = e.vertices
        nb[a].append(b)
        nb[b].append(a)
    for _ in range(2):
        w = np.array([0.5 * w[i] + 0.5 * (w[nb[i]].mean() if nb[i] else w[i]) for i in range(n)])
    if not me.shape_keys:
        ob.shape_key_add(name='Basis', from_mix=False)
    kb = ob.shape_key_add(name=KEY, from_mix=False)
    (z0, y0), (z1, y1) = WALL
    moved = 0
    for i, v in enumerate(me.vertices):
        if w[i] < 1e-3 or v.co.y > 0.0:
            continue
        t = min(max((v.co.z - z0) / (z1 - z0), 0.0), 1.0)
        wall = y0 + (y1 - y0) * t
        proj = wall - v.co.y                      # forward projection in front of the wall (+)
        if proj <= 0:
            continue
        kb.data[i].co.y = v.co.y + proj * (1.0 - BUST_KEEP) * w[i]
        moved += 1
    kb.value = 1.0
    print('MF bust: shape key %s on %d verts (keep %.2f of the projection; Basis untouched)' % (KEY, moved, BUST_KEEP))


def body_co(ob=None):
    """body vertex positions with its mf_ shape keys applied at their values
    (smaller bust, smaller hands, thinner legs), rest pose. Each key's
    offset is measured from the Basis, so the keys add up."""
    ob = ob or bpy.data.objects['Body_All']
    me = ob.data
    base = np.array([tuple(v.co) for v in me.vertices])
    co = base.copy()
    if me.shape_keys:
        for kb in list(me.shape_keys.key_blocks)[1:]:
            if kb.value > 0 and kb.name.startswith('mf_'):
                K = np.empty(len(me.vertices) * 3)
                kb.data.foreach_get('co', K)
                co += (K.reshape(-1, 3) - base) * kb.value
    return co


def report():
    """bust projection over the underbust for each chest layer (mm); printed
    on every build so a regression cannot go unnoticed"""
    out = {}
    for name in ('Shirt', 'Vest', 'RobeUpper'):
        ob = bpy.data.objects.get(name)
        if ob is None:
            continue
        V = np.array([tuple(ob.matrix_world @ v.co) for v in ob.data.vertices])

        def fwd(z):
            s = (np.abs(V[:, 2] - z) < 0.005) & (np.abs(V[:, 0]) < 0.11)
            return -V[s, 1].min() * 1000 if s.any() else float('nan')
        out[name] = fwd(1.135) - fwd(1.085)
    print('MF CHECK bust projection over underbust (mm): ' + ', '.join('%s %.1f' % kv for kv in out.items()))
    return out
