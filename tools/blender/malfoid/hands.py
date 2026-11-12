"""Smaller hands as a shape key on the body (the original Basis is untouched).

Every hand vertex moves towards its wrist joint by HAND_SCALE, weighted by
its hand/finger skin weight so the wrist blends smoothly into the forearm.
rig2 scales the finger joints by the same factor so the bones stay inside
the smaller fingers.
"""
import bpy

KEY = 'mf_hands_small'
HAND_SCALE = 0.90
HAND_PREFIX = ('hand.', 'thumb', 'c_thumb', 'index', 'c_index', 'middle', 'c_middle', 'ring', 'c_ring',
               'pinky', 'c_pinky')


def wrist(side):
    """wrist joint of the base (ARP) rig, side 'l' / 'r'"""
    arm = bpy.data.objects['rig']
    return arm.matrix_world @ arm.data.bones['hand.' + side].head_local


def add_key():
    ob = bpy.data.objects['Body_All']
    me = ob.data
    if me.shape_keys and KEY in me.shape_keys.key_blocks:
        return
    groups = {}
    for g in ob.vertex_groups:
        if g.name.startswith(HAND_PREFIX) and g.name[-2:] in ('.l', '.r'):
            groups[g.index] = g.name[-1]
    W = {'l': wrist('l'), 'r': wrist('r')}
    if not me.shape_keys:
        ob.shape_key_add(name='Basis', from_mix=False)
    kb = ob.shape_key_add(name=KEY, from_mix=False)
    moved = 0
    for v in me.vertices:
        acc = {'l': 0.0, 'r': 0.0}
        for g in v.groups:
            s = groups.get(g.group)
            if s:
                acc[s] += g.weight
        side = 'l' if acc['l'] >= acc['r'] else 'r'
        w = min(1.0, acc[side])
        if w <= 1e-4:
            continue
        k = 1.0 - (1.0 - HAND_SCALE) * w
        kb.data[v.index].co = W[side] + (v.co - W[side]) * k
        moved += 1
    kb.value = 1.0
    print('MF hands: shape key %s on %d verts (scale %.2f about the wrists; Basis untouched)' % (KEY, moved, HAND_SCALE))
