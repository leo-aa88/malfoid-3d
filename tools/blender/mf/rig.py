"""Skeleton definition and armature creation."""
import math
from math import sin, cos, radians
import bpy
from mathutils import Vector
from .core import V

ARM_ANGLE = radians(25.0)          # bind pose: arms 25 degrees away from vertical
ARM_DIR_L = Vector((sin(ARM_ANGLE), 0.0, -cos(ARM_ANGLE)))
UPPERARM_LEN = 0.250
FOREARM_LEN = 0.225
HAND_LEN = 0.080

SHOULDER_L = V(0.125, -0.012, 1.360)
ELBOW_L = SHOULDER_L + ARM_DIR_L * UPPERARM_LEN
WRIST_L = ELBOW_L + ARM_DIR_L * FOREARM_LEN
HIP_L = V(0.072, 0.0, 0.920)
KNEE_L = V(0.068, 0.004, 0.500)
ANKLE_L = V(0.064, -0.012, 0.085)
TOE_L = V(0.064, 0.105, 0.020)

HAIR_Z = (1.44, 1.30, 1.15, 0.99)
# hair chains: name -> azimuth in degrees from the front (positive = left)
HAIR_CHAINS = {
    'hair_front_L': 48.0, 'hair_side_L': 100.0, 'hair_back_L': 148.0,
    'hair_back_C': 180.0,
    'hair_back_R': -148.0, 'hair_side_R': -100.0, 'hair_front_R': -48.0,
}
# skirt / robe panel bones: azimuths from the front
PANELS = {'F_L': 32.0, 'S_L': 92.0, 'B_L': 152.0, 'B_R': -152.0, 'S_R': -92.0, 'F_R': -32.0}
SKIRT_PIVOT_Z = 0.93
ROBE_PIVOT_Z = 1.00
ROBE_MID_Z = 0.56
ROBE_HEM_Z = 0.165


def mir(v):
    return Vector((-v.x, v.y, v.z))


def bone_table(hair_env, robe_env):
    """Returns ordered list of (name, head, tail, parent). hair_env(az_deg, z)
    and robe_env(az_deg, z) give rest positions for secondary chains."""
    B = []

    def add(name, head, tail, parent):
        B.append((name, Vector(head), Vector(tail), parent))

    add('root', V(0, 0, 0), V(0, 0.12, 0), None)
    add('hips', V(0, 0, 0.94), V(0, 0, 1.04), 'root')
    add('spine', V(0, 0, 1.04), V(0, 0, 1.17), 'hips')
    add('chest', V(0, 0, 1.17), V(0, -0.010, 1.385), 'spine')
    add('neck', V(0, -0.012, 1.385), V(0, -0.008, 1.455), 'chest')
    add('head', V(0, -0.008, 1.455), V(0, -0.008, 1.668), 'neck')
    for s, m in (('L', lambda v: v), ('R', mir)):
        add('shoulder_' + s, m(V(0.025, -0.010, 1.365)), m(SHOULDER_L), 'chest')
        add('upperarm_' + s, m(SHOULDER_L), m(ELBOW_L), 'shoulder_' + s)
        add('forearm_' + s, m(ELBOW_L), m(WRIST_L), 'upperarm_' + s)
        add('hand_' + s, m(WRIST_L), m(WRIST_L + ARM_DIR_L * HAND_LEN), 'forearm_' + s)
        add('thigh_' + s, m(HIP_L), m(KNEE_L), 'hips')
        add('shin_' + s, m(KNEE_L), m(ANKLE_L), 'thigh_' + s)
        add('foot_' + s, m(ANKLE_L), m(TOE_L), 'shin_' + s)
        add('toe_' + s, m(TOE_L), m(TOE_L + V(0, 0.065, 0)), 'foot_' + s)
    for key, az in PANELS.items():
        a = radians(az)
        # skirt panel bones pivot around the hip line
        head = V(0.072 * (1 if az > 0 else -1), 0.0, SKIRT_PIVOT_Z)
        tail = V(sin(a) * 0.13, cos(a) * 0.11, 0.80)
        add('skirt_' + key, head, tail, 'hips')
        p0 = robe_env(az, ROBE_PIVOT_Z)
        p1 = robe_env(az, ROBE_MID_Z)
        p2 = robe_env(az, ROBE_HEM_Z)
        add('robe_' + key, p0, p1, 'hips')
        add('robe_' + key + '_2', p1, p2, 'robe_' + key)
    for name, az in HAIR_CHAINS.items():
        parent = 'head'
        for i in range(3):
            add('%s_%d' % (name, i + 1), hair_env(az, HAIR_Z[i]), hair_env(az, HAIR_Z[i + 1]), parent)
            parent = '%s_%d' % (name, i + 1)
    return B


def build_armature(bones):
    arm = bpy.data.armatures.new('MalfoidRig')
    ob = bpy.data.objects.new('Malfoid', arm)
    bpy.context.scene.collection.objects.link(ob)
    bpy.context.view_layer.objects.active = ob
    bpy.ops.object.mode_set(mode='EDIT')
    for name, head, tail, parent in bones:
        eb = arm.edit_bones.new(name)
        eb.head = head
        eb.tail = tail
        if parent:
            eb.parent = arm.edit_bones[parent]
            eb.use_connect = False
    bpy.ops.object.mode_set(mode='OBJECT')
    for pb in ob.pose.bones:
        pb.rotation_mode = 'QUATERNION'
    return ob


def attach(ob, arm_ob):
    ob.parent = arm_ob
    mod = ob.modifiers.new('Armature', 'ARMATURE')
    mod.object = arm_ob
    return ob
