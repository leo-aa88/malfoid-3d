"""Quick deformation checks on the new skeleton (not exported)."""
from math import radians
import bpy
from mathutils import Quaternion, Vector


def _world_rot(arm, bone, axis, deg):
    """rotate a pose bone about a world axis (rest-relative)"""
    pb = arm.pose.bones[bone]
    R = arm.data.bones[bone].matrix_local.to_3x3().to_quaternion()
    q = Quaternion(Vector(axis), radians(deg))
    pb.rotation_quaternion = R.inverted() @ q @ R


def apply(arm, name):
    if name in ('arms_down', 'walk'):
        _world_rot(arm, 'upperarm_L', (0, 1, 0), 72)
        _world_rot(arm, 'upperarm_R', (0, 1, 0), -72)
        _world_rot(arm, 'forearm_L', (1, 0, 0), -15)
        _world_rot(arm, 'forearm_R', (1, 0, 0), -15)
    if name == 'walk':
        _world_rot(arm, 'thigh_L', (1, 0, 0), -35)
        _world_rot(arm, 'shin_L', (1, 0, 0), 40)
        _world_rot(arm, 'thigh_R', (1, 0, 0), 20)
        _world_rot(arm, 'head', (0, 0, 1), 20)
    bpy.context.view_layer.update()
