"""Robe fold check: how much of the lower robe turns over (shows its lining) in each
clip that moves the legs, and whether the lining ever crosses the outer shell.

  blender -b -t 4 build/malfoid.blend -P tools/qa/robe_folds.py      (or build/ginny.blend, build/cho.blend)

Prints ROBEFOLDS {clip: {fold_area_%, at_frame, crossed_verts}}; all zeros is clean.
"""
import bpy, sys, json
import os
sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "blender"))
from malfoid import anim2
arm = next(o for o in bpy.data.objects if o.type == 'ARMATURE' and o.name in ('Malfoid', 'Ginny', 'Cho'))
ob = bpy.data.objects['RobeLower']
me = ob.data
N = len(me.vertices) // 2
rest_co = [v.co.copy() for v in me.vertices]
gap = sum((rest_co[i] - rest_co[i + N]).length for i in range(0, N, 7)) / len(range(0, N, 7))
mats = [m.name for m in me.materials]
outer_faces = [p.index for p in me.polygons if all(v < N for v in p.vertices)]
rest_n = {i: me.polygons[i].normal.copy() for i in outer_faces}
area = {i: me.polygons[i].area for i in outer_faces}
tot_area = sum(area.values())
deps = bpy.context.evaluated_depsgraph_get()
fps = 30
CLIPS = ['kick_high', 'kick_low', 'rising_kick', 'spin_kick', 'leg_sweep', 'walk', 'run', 'jump', 'crouch', 'turn',
         'idle_annoyed_start']
# a character's own movement clips, when her model has them (Cho's dodges and Ventus)
CLIPS += [c for c in ('dodge_left', 'dodge_right', 'dodge_back', 'cast_ventus', 'cho_idle', 'strafe') if c in bpy.data.actions]
out = {'twin_gap_mm': round(gap * 1000, 2)}
worst = {}
for name in CLIPS:
    act = bpy.data.actions[name]
    n = int(act.frame_range[1])
    fold_max, cross_max, fmax_at = 0.0, 0, 0
    for f in range(0, n + 1, 1):
        anim2.show(arm, name, f)
        deps.update()
        pb = arm.pose.bones['hips']
        R = (pb.matrix @ pb.bone.matrix_local.inverted()).to_quaternion()
        m = ob.evaluated_get(deps).to_mesh()
        folded = sum(area[i] for i in outer_faces if m.polygons[i].normal.dot(R @ rest_n[i]) < 0.0) / tot_area
        crossed = 0
        for i in range(N):
            d = m.vertices[i].co - m.vertices[i + N].co
            if d.dot(R @ (rest_co[i] - rest_co[i + N])) < 0:
                crossed += 1
        ob.evaluated_get(deps).to_mesh_clear()
        if folded > fold_max:
            fold_max, fmax_at = folded, f
        cross_max = max(cross_max, crossed)
    out[name] = {'fold_area_%': round(100 * fold_max, 2), 'at_frame': fmax_at, 'crossed_verts': cross_max}
print('ROBEFOLDS ' + json.dumps(out))
