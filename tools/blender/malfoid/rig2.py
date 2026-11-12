"""A clean humanoid skeleton for export, built at the base rig's joints.

The base file uses Auto-Rig Pro: deform bones are split into twist/stretch
segments and parented to control bones, which does not survive a plain glTF
export as a usable FK hierarchy. This module creates a standard skeleton at
the same joint positions and remaps the existing skin weights onto it
(twist/stretch segments are merged into their limb), so every mesh keeps its
authored weights and shape keys.
"""
import bpy
from mathutils import Vector

ARP = 'rig'
NEW = 'Malfoid'


def _arp_pts():
    arm = bpy.data.objects[ARP]
    M = arm.matrix_world
    h = {b.name: M @ b.head_local for b in arm.data.bones}
    t = {b.name: M @ b.tail_local for b in arm.data.bones}
    return h, t


def bone_table():
    from .hands import HAND_SCALE
    h, t = _arp_pts()
    B = []
    wrists = {'L': h['hand.l'], 'R': h['hand.r']}
    FINGERS = ('index', 'middle', 'ring', 'pinky', 'thumb')

    def add(name, head, tail, parent):
        head, tail = Vector(head), Vector(tail)
        side = name[-1]
        if name.startswith(FINGERS) or name.startswith('hand_'):
            # joints follow the smaller hands (mf_hands_small shape key)
            w = wrists[side]
            if not name.startswith('hand_'):
                head = w + (head - w) * HAND_SCALE
            tail = w + (tail - w) * HAND_SCALE
        B.append((name, head, tail, parent))

    add('root', (0, 0, 0), (0, -0.1, 0), None)
    add('hips', (0, h['root.x'].y, 0.925), h['spine_01.x'], 'root')
    add('spine', h['spine_01.x'], t['spine_01.x'], 'hips')
    add('chest', h['spine_02.x'], t['spine_02.x'], 'spine')
    add('neck', h['neck.x'], t['neck.x'], 'chest')
    add('head', h['head.x'], t['head.x'], 'neck')
    for s, a in (('L', 'l'), ('R', 'r')):
        add('shoulder_' + s, h['shoulder.' + a], t['shoulder.' + a], 'chest')
        add('upperarm_' + s, t['shoulder.' + a], t['arm_stretch.' + a], 'shoulder_' + s)
        add('forearm_' + s, h['forearm_stretch.' + a], t['forearm_twist.' + a], 'upperarm_' + s)
        add('hand_' + s, h['hand.' + a], t['hand.' + a], 'forearm_' + s)
        for f in ('index', 'middle', 'ring', 'pinky'):
            add('%s1_%s' % (f, s), h['%s1.%s' % (f, a)], t['%s1.%s' % (f, a)], 'hand_' + s)
            add('%s2_%s' % (f, s), h['c_%s2.%s' % (f, a)], t['c_%s2.%s' % (f, a)], '%s1_%s' % (f, s))
            add('%s3_%s' % (f, s), h['c_%s3.%s' % (f, a)], t['c_%s3.%s' % (f, a)], '%s2_%s' % (f, s))
        add('thumb1_' + s, h['thumb1.' + a], t['thumb1.' + a], 'hand_' + s)
        add('thumb2_' + s, h['c_thumb2.' + a], t['c_thumb2.' + a], 'thumb1_' + s)
        add('thumb3_' + s, h['c_thumb3.' + a], t['c_thumb3.' + a], 'thumb2_' + s)
        add('thigh_' + s, h['thigh_twist.' + a], t['thigh_stretch.' + a], 'hips')
        add('shin_' + s, h['leg_stretch.' + a], t['leg_twist.' + a], 'thigh_' + s)
        add('foot_' + s, h['foot.' + a], t['foot.' + a], 'shin_' + s)
        add('toe_' + s, h['toes_01.' + a], t['toes_01.' + a], 'foot_' + s)
    return B


def group_map():
    """ARP vertex group -> new bone"""
    m = {'root.x': 'hips', 'c_bot_bend.l': 'hips', 'c_bot_bend.r': 'hips', 'spine_01.x': 'spine',
         'spine_02.x': 'chest', 'chest.Root': 'chest', 'neck.x': 'neck', 'head.x': 'head'}
    for s, a in (('L', 'l'), ('R', 'r')):
        m.update({
            'shoulder.' + a: 'shoulder_' + s,
            'c_arm_twist_offset.' + a: 'upperarm_' + s, 'arm_twist.' + a: 'upperarm_' + s,
            'arm_stretch.' + a: 'upperarm_' + s,
            'forearm_stretch.' + a: 'forearm_' + s, 'forearm_twist.' + a: 'forearm_' + s,
            'hand.' + a: 'hand_' + s,
            'thigh_twist.' + a: 'thigh_' + s, 'thigh_stretch.' + a: 'thigh_' + s,
            'leg_stretch.' + a: 'shin_' + s, 'leg_twist.' + a: 'shin_' + s,
            'foot.' + a: 'foot_' + s, 'toes_01.' + a: 'toe_' + s,
            'chest_' + s: 'chest', 'chest_001_' + s: 'chest', 'chest_002_' + s: 'chest',
            'thumb1.' + a: 'thumb1_' + s, 'c_thumb2.' + a: 'thumb2_' + s, 'c_thumb3.' + a: 'thumb3_' + s,
        })
        for f in ('index', 'middle', 'ring', 'pinky'):
            m['c_%s1_base.%s' % (f, a)] = 'hand_' + s
            m['%s1.%s' % (f, a)] = '%s1_%s' % (f, s)
            m['c_%s2.%s' % (f, a)] = '%s2_%s' % (f, s)
            m['c_%s3.%s' % (f, a)] = '%s3_%s' % (f, s)
    return m


def create(extra_bones=()):
    """Builds the new armature. extra_bones: [(name, head, tail, parent)]"""
    bones = bone_table() + list(extra_bones)
    data = bpy.data.armatures.new(NEW + 'Rig')
    ob = bpy.data.objects.new(NEW, data)
    bpy.context.scene.collection.objects.link(ob)
    bpy.context.view_layer.objects.active = ob
    for o in bpy.context.selected_objects:
        o.select_set(False)
    ob.select_set(True)
    bpy.ops.object.mode_set(mode='EDIT')
    for name, head, tail, parent in bones:
        eb = data.edit_bones.new(name)
        eb.head, eb.tail = head, tail
        # keep a consistent roll: bone Z points backwards/up
        eb.align_roll(Vector((0, 1, 0)) if abs((tail - head).normalized().z) > 0.7 else Vector((0, 0, 1)))
        if parent:
            eb.parent = data.edit_bones[parent]
    bpy.ops.object.mode_set(mode='OBJECT')
    for pb in ob.pose.bones:
        pb.rotation_mode = 'QUATERNION'
    return ob


def remap_weights(ob, gmap):
    """Re-express ARP weights in new-bone groups (sums merged segments)."""
    old = {g.index: g.name for g in ob.vertex_groups}
    acc = {}
    for v in ob.data.vertices:
        for g in v.groups:
            nb = gmap.get(old[g.group])
            if nb is None or g.weight <= 0:
                continue
            acc.setdefault(nb, {})
            acc[nb][v.index] = acc[nb].get(v.index, 0.0) + g.weight
    for g in list(ob.vertex_groups):
        if g.name in gmap.values() or g.name in gmap:
            ob.vertex_groups.remove(g)
    for nb, d in acc.items():
        g = ob.vertex_groups.get(nb) or ob.vertex_groups.new(name=nb)
        for vi, w in d.items():
            g.add([vi], min(w, 1.0), 'REPLACE')


def bind(ob, arm):
    for m in list(ob.modifiers):
        if m.type == 'ARMATURE':
            ob.modifiers.remove(m)
    mw = ob.matrix_world.copy()
    ob.parent = arm
    ob.matrix_world = mw
    mod = ob.modifiers.new('Armature', 'ARMATURE')
    mod.object = arm


def convert(objects, extra_bones=()):
    """Create the new skeleton, move every skinned object onto it and remove
    the ARP rig and its widgets."""
    arm = create(extra_bones)
    gmap = group_map()
    for ob in objects:
        remap_weights(ob, gmap)
        bind(ob, arm)
    old = bpy.data.objects.get(ARP)
    for o in list(bpy.data.objects):
        if o.name.startswith('cs_') or o.name in ('cs_grp', 'char_grp') or o is old:
            bpy.data.objects.remove(o, do_unlink=True)
    return arm
