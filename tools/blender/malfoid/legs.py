"""Thinner legs as a shape key on the body (the original Basis is untouched).

Thigh and shin vertices move towards the leg's bone axis (hip -> knee ->
ankle) by LEG_SCALE, weighted by their leg skin weight; the effect fades out
over the upper thigh so the hips (and the skirt fit) are unchanged. Feet are
not scaled. Socks and shoes are fitted to the body with this key applied.
"""
import bpy
from mathutils import Vector
from mathutils.geometry import intersect_point_line

KEY = 'mf_legs_thin'
LEG_SCALE = 0.90
GROUPS = ('thigh_twist', 'thigh_stretch', 'leg_stretch', 'leg_twist')
Z_FADE = (0.86, 0.80)        # full effect below 0.80, none above 0.86


def _axis(side):
    arm = bpy.data.objects['rig']
    M = arm.matrix_world
    b = arm.data.bones
    return [M @ b['thigh_twist.' + side].head_local, M @ b['thigh_stretch.' + side].tail_local,
            M @ b['leg_twist.' + side].tail_local]


def add_key():
    ob = bpy.data.objects['Body_All']
    me = ob.data
    if me.shape_keys and KEY in me.shape_keys.key_blocks:
        return
    gi = {}
    for g in ob.vertex_groups:
        base, _, side = g.name.rpartition('.')
        if base in GROUPS and side in ('l', 'r'):
            gi[g.index] = side
    axes = {'l': _axis('l'), 'r': _axis('r')}
    if not me.shape_keys:
        ob.shape_key_add(name='Basis', from_mix=False)
    kb = ob.shape_key_add(name=KEY, from_mix=False)
    moved = 0
    for v in me.vertices:
        acc = {'l': 0.0, 'r': 0.0}
        for g in v.groups:
            s = gi.get(g.group)
            if s:
                acc[s] += g.weight
        side = 'l' if acc['l'] >= acc['r'] else 'r'
        w = min(1.0, acc[side])
        z0, z1 = Z_FADE
        t = min(max((z0 - v.co.z) / (z0 - z1), 0.0), 1.0)
        w *= t * t * (3 - 2 * t)
        if w <= 1e-4:
            continue
        # closest point on the hip-knee-ankle polyline
        best, bd = None, 1e9
        A = axes[side]
        for a, b in zip(A, A[1:]):
            p, f = intersect_point_line(v.co, a, b)
            f = min(max(f, 0.0), 1.0)
            p = a + (b - a) * f
            d = (v.co - p).length
            if d < bd:
                best, bd = p, d
        k = 1.0 - (1.0 - LEG_SCALE) * w
        kb.data[v.index].co = best + (v.co - best) * k
        moved += 1
    kb.value = 1.0
    print('MF legs: shape key %s on %d verts (scale %.2f towards the leg axis; Basis untouched)' % (KEY, moved, LEG_SCALE))
