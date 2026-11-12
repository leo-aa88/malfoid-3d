"""Procedural animation authoring for the base-mesh skeleton (rig2).

Adapted from the first pipeline's animation code: same pose language
(world-axis deltas, two-bone IK for legs and crossed arms), with the joint
positions read from the new skeleton and the arms posed from its T-pose.

Poses are described in character space and solved with a tiny FK/IK solver;
the result is written as Blender actions (one NLA track each) so the glTF
exporter emits them as separate clips:

  idle, walk, run, turn, idle_annoyed_start, idle_annoyed
"""
import math
from math import sin, cos, pi, radians, degrees, atan2, sqrt
import bpy
from mathutils import Vector, Quaternion, Matrix
from mathutils import Vector as _V
from .meshutil import lerp, sstep as smoothstep
from types import SimpleNamespace


def clamp(x, lo=0.0, hi=1.0):
    return max(lo, min(hi, x))


def V(x, fwd, z):
    return _V((x, -fwd, z))


class Prof:
    """monotone cubic through keys [(t, v0, v1, ...)]"""

    def __init__(self, keys):
        keys = sorted(keys)
        self.t = [k[0] for k in keys]
        self.n = len(keys[0]) - 1
        self.v = [[k[i + 1] for k in keys] for i in range(self.n)]
        self.m = [self._tan(v) for v in self.v]

    def _tan(self, y):
        t = self.t
        d = [(y[i + 1] - y[i]) / (t[i + 1] - t[i]) for i in range(len(t) - 1)]
        m = [d[0]] + [0.0] * (len(t) - 2) + [d[-1]]
        for i in range(1, len(t) - 1):
            if d[i - 1] * d[i] > 0:
                w1 = 2 * (t[i + 1] - t[i]) + (t[i] - t[i - 1])
                w2 = (t[i + 1] - t[i]) + 2 * (t[i] - t[i - 1])
                m[i] = (w1 + w2) / (w1 / d[i - 1] + w2 / d[i])
        return m

    def __call__(self, x):
        t = self.t
        x = clamp(x, t[0], t[-1])
        lo = max(i for i in range(len(t) - 1) if t[i] <= x) if x > t[0] else 0
        hi = lo + 1
        h = t[hi] - t[lo]
        u = (x - t[lo]) / h
        h00, h10 = 2 * u ** 3 - 3 * u ** 2 + 1, u ** 3 - 2 * u ** 2 + u
        h01, h11 = -2 * u ** 3 + 3 * u ** 2, u ** 3 - u ** 2
        out = [h00 * v[lo] + h10 * h * m[lo] + h01 * v[hi] + h11 * h * m[hi] for v, m in zip(self.v, self.m)]
        return out[0] if self.n == 1 else tuple(out)


rig = SimpleNamespace()


def init_rig(arm_ob):
    """read joint positions from the exported skeleton"""
    b = arm_ob.data.bones
    M = arm_ob.matrix_world
    H = lambda n: M @ b[n].head_local
    T = lambda n: M @ b[n].tail_local
    rig.SHOULDER_L = H('upperarm_L')
    rig.ELBOW_L = H('forearm_L')
    rig.WRIST_L = H('hand_L')
    rig.ARM_DIR_L = (rig.ELBOW_L - rig.SHOULDER_L).normalized()
    rig.UPPERARM_LEN = (rig.ELBOW_L - rig.SHOULDER_L).length
    rig.FOREARM_LEN = (rig.WRIST_L - rig.ELBOW_L).length
    rig.HIP_L = H('thigh_L')
    rig.KNEE_L = H('shin_L')
    rig.ANKLE_L = H('foot_L')
    rig.DZ = rig.ANKLE_L.z - 0.085            # the run keys were authored for an ankle at 0.085

FPS = 30
AX = Vector((1, 0, 0))
AY = Vector((0, 1, 0))
AZ = Vector((0, 0, 1))
IDENT = Quaternion()


def qx(deg):
    """+ leans a torso forward / swings a hanging limb backwards"""
    return Quaternion(AX, radians(deg))


def qy(deg):
    """+ tilts the top towards the character's left"""
    return Quaternion(AY, radians(deg))


def qz(deg):
    """+ turns towards the character's left"""
    return Quaternion(AZ, radians(deg))


def E(pitch=0.0, yaw=0.0, roll=0.0):
    return qz(yaw) @ qx(pitch) @ qy(roll)


def softpos(x, k=3.0):
    return 0.5 * (x + sqrt(x * x + k * k)) - 0.5 * k


def sstep(a, b, x):
    return smoothstep(a, b, x)


def periodic(keys):
    ext = []
    for d in (-1.0, 0.0, 1.0):
        for k in keys:
            ext.append((k[0] + d,) + tuple(k[1:]))
    pr = Prof(ext)
    return lambda ph: pr(ph % 1.0)


def _frame(y, hinge):
    y = y.normalized()
    x = hinge - y * hinge.dot(y)
    x.normalize()
    z = x.cross(y)
    return Matrix((x, y, z)).transposed()


def q_between(y_r, h_r, y_p, h_p):
    return (_frame(y_p, h_p) @ _frame(y_r, h_r).transposed()).to_quaternion()


def two_bone(root, target, l1, l2, pole):
    """returns (joint position, unit root->target, unit pole perpendicular)"""
    d = target - root
    dist = d.length
    mx = (l1 + l2) * 0.9995
    if dist > mx:
        target = root + d * (mx / dist)
        d = target - root
        dist = mx
    dist = max(dist, abs(l1 - l2) + 1e-4)
    u = d / d.length
    p = pole - u * pole.dot(u)
    if p.length < 1e-6:
        p = u.orthogonal()
    p.normalize()
    a = (l1 * l1 - l2 * l2 + dist * dist) / (2 * dist)
    h = sqrt(max(l1 * l1 - a * a, 0.0))
    return root + u * a + p * h, target, u, p


class Skel:
    def __init__(self, arm_ob):
        self.order = []
        self.R = {}
        self.head = {}
        self.parent = {}
        for b in arm_ob.data.bones:          # parents always precede children
            self.order.append(b.name)
            self.R[b.name] = b.matrix_local.to_3x3().to_quaternion()
            self.head[b.name] = b.head_local.copy()
            self.parent[b.name] = b.parent.name if b.parent else None
        self.l_thigh = (rig.KNEE_L - rig.HIP_L).length
        self.l_shin = (rig.ANKLE_L - rig.KNEE_L).length


def mirx(v):
    return Vector((-v.x, v.y, v.z))


def solve(sk, spec):
    """spec: {'t': hips translation, 'D': {bone: quat}, 'leg_L'/'leg_R': {...},
    'arm_L'/'arm_R': {...}, 'robe': {...}}. Returns world delta rotations Q
    and joint positions P."""
    D = spec.get('D', {})
    Q, P = {}, {}
    for b in sk.order:
        p = sk.parent[b]
        if p is None:
            Q[b] = IDENT.copy()
            P[b] = sk.head[b].copy()
            continue
        P[b] = P[p] + Q[p] @ (sk.head[b] - sk.head[p])
        if b == 'hips':
            P[b] = P[b] + spec.get('t', Vector((0, 0, 0)))
        side = b[-1] if b[-2:] in ('_L', '_R') else None
        sgn = 1.0 if side == 'L' else -1.0
        base = b[:-2] if side else b
        leg = spec.get('leg_' + side) if side else None
        arm = spec.get('arm_' + side) if side else None
        if base == 'thigh' and leg:
            pole = Q['hips'] @ Vector((sgn * leg.get('knee_out', 0.0), -1.0, 0.0))
            knee, ank, u, pp = two_bone(P[b], leg['ankle'], sk.l_thigh, sk.l_shin, pole)
            hinge = pp.cross(u)
            hip_r, knee_r, ank_r = rig.HIP_L, rig.KNEE_L, rig.ANKLE_L
            if side == 'R':
                hip_r, knee_r, ank_r = mirx(hip_r), mirx(knee_r), mirx(ank_r)
            Q[b] = q_between(knee_r - hip_r, AX, knee - P[b], hinge)
            leg['_shin'] = q_between(ank_r - knee_r, AX, ank - knee, hinge)
        elif base == 'shin' and leg:
            Q[b] = leg['_shin']
        elif base == 'foot' and leg:
            Q[b] = leg.get('foot', IDENT)
        elif base == 'upperarm' and arm:
            wrist, elbow_hint = arm['wrist'], arm['elbow']
            if arm.get('space') == 'chest':
                wrist = P['chest'] + Q['chest'] @ (wrist - sk.head['chest'])
                elbow_hint = P['chest'] + Q['chest'] @ (elbow_hint - sk.head['chest'])
            el, wr, u, pp = two_bone(P[b], wrist, rig.UPPERARM_LEN, rig.FOREARM_LEN, elbow_hint - P[b])
            hinge = pp.cross(u)
            d = rig.ARM_DIR_L if side == 'L' else mirx(rig.ARM_DIR_L)
            h_r = AY.cross(d)
            Q[b] = q_between(d, h_r, el - P[b], hinge)
            arm['_fore'] = q_between(d, h_r, wr - el, hinge)
        elif base == 'forearm' and arm:
            Q[b] = arm['_fore'] @ D.get(b, IDENT)
        elif base.startswith(FINGERS) and b not in D:
            # relaxed curl (fist when spec['curl'] is large); T-pose fingers point
            # along X with the palm down, so flexion is about the forward axis
            c = spec.get('curl', 16.0)
            k = int(base[-1]) if base[-1].isdigit() else 1
            if base.startswith('thumb'):
                Q[b] = Q[p] @ qz(sgn * c * 0.4) @ qy(sgn * c * 0.3)
            else:
                Q[b] = Q[p] @ qy(sgn * c * (1.0 if k == 1 else 1.25))
        else:
            Q[b] = Q[p] @ D.get(b, IDENT)
    return Q, P


# ---------------------------------------------------------------------------
# pose pieces

T_DROP = 63.0       # T-pose -> the old bind pose (arms 27 deg from vertical)


def arm_q(sgn, add, swing, twist=0.0):
    """upper-arm delta from the T-pose: hang the arm down (add), then swing
    it forward/back about the shoulder line"""
    return qx(-swing) @ qy(sgn * (T_DROP + add)) @ qx(sgn * twist)


def elbow_q(sgn, deg):
    return qz(-sgn * deg)


def arms_down(spec, swing_l=0.0, swing_r=0.0, elbow=12.0, add=17.0, breathe=0.0):
    D = spec['D']
    D['upperarm_L'] = arm_q(1, add + breathe, swing_l)
    D['upperarm_R'] = arm_q(-1, add + breathe, swing_r)
    D['forearm_L'] = elbow_q(1, elbow)
    D['forearm_R'] = elbow_q(-1, elbow)


def stand_legs(spec, lx=0.0, rx=0.0):
    spec['leg_L'] = {'ankle': rig.ANKLE_L + Vector((lx, 0, 0)), 'foot': IDENT.copy()}
    spec['leg_R'] = {'ankle': mirx(rig.ANKLE_L) + Vector((rx, 0, 0)), 'foot': IDENT.copy()}


def idle_pose(t):
    b = sin(2 * pi * t / 4.0)
    b2 = sin(2 * pi * t / 4.0 - 0.9)
    spec = {'D': {}, 't': Vector((0.0025 * sin(2 * pi * t / 8.0), 0.0, -0.004 + 0.0012 * b))}
    D = spec['D']
    D['hips'] = E(roll=0.25 * sin(2 * pi * t / 8.0))
    D['spine'] = E(pitch=0.5 + 0.35 * b)
    D['chest'] = E(pitch=-0.8 - 0.75 * b2)
    D['neck'] = E(pitch=0.3 + 0.2 * b2)
    D['head'] = E(pitch=0.4 + 0.25 * b, yaw=0.5 * sin(2 * pi * t / 8.0 + 1.0))
    D['shoulder_L'] = qy(-0.9 * b2)
    D['shoulder_R'] = qy(0.9 * b2)
    arms_down(spec, swing_l=-1.5, swing_r=-1.5, elbow=11.0, add=17.0, breathe=0.35 * b2)
    D['hand_L'] = qx(-4.0)
    D['hand_R'] = qx(-4.0)
    stand_legs(spec)
    return spec


WALK_T = 1.0
WALK_DUTY = 0.60
WALK_REACH = 0.31
WALK_SPEED = 2 * WALK_REACH / (WALK_DUTY * WALK_T)


def _walk_foot(ph, sgn):
    duty, reach = WALK_DUTY, WALK_REACH
    if ph < duty:
        s = ph / duty
        y = lerp(reach, -reach, s)
        up = 15.0 * (1 - sstep(0.0, 0.22, s))
        dn = 34.0 * sstep(0.62, 1.0, s)
        lift = 0.0
        toe = -dn
    else:
        s = (ph - duty) / (1 - duty)
        m = -2 * reach / duty * (1 - duty)
        h00 = 2 * s ** 3 - 3 * s ** 2 + 1
        h10 = s ** 3 - 2 * s ** 2 + s
        h01 = -2 * s ** 3 + 3 * s ** 2
        h11 = s ** 3 - s ** 2
        y = h00 * -reach + h10 * m + h01 * reach + h11 * m
        dn = 34.0 * (1 - sstep(0.0, 0.5, s))
        up = 15.0 * sstep(0.55, 1.0, s)
        lift = 0.050 * sin(pi * s) ** 1.3
        toe = -dn * (1 - sstep(0.0, 0.35, s))
    z = rig.ANKLE_L.z + 0.045 * sin(radians(up)) + 0.112 * sin(radians(dn)) + lift
    y += 0.025 * (1 - cos(radians(dn)))
    return {'ankle': V(sgn * 0.050, y, z), 'foot': qz(sgn * 5.0) @ qx(dn - up), 'toe': toe}


def walk_pose(t):
    ph = (t / WALK_T) % 1.0
    c, s = cos(2 * pi * ph), sin(2 * pi * (ph - 0.05))
    spec = {'D': {}, 't': Vector((0.016 * s, 0.0, -0.045 - 0.018 * cos(4 * pi * ph)))}
    D = spec['D']
    D['hips'] = E(pitch=1.5, yaw=-5.5 * c, roll=-3.2 * s)
    D['spine'] = E(pitch=2.0, yaw=4.0 * c, roll=2.2 * s)
    D['chest'] = E(pitch=0.5, yaw=6.0 * c, roll=1.6 * s)
    D['neck'] = E(pitch=-1.5, yaw=-2.2 * c, roll=-0.4 * s)
    D['head'] = E(pitch=-1.5, yaw=-2.3 * c, roll=-0.4 * s)
    sw_l = -c
    arms_down(spec, swing_l=17.0 * sw_l + 2.0, swing_r=-17.0 * sw_l + 2.0, add=15.0)
    D['forearm_L'] = elbow_q(1, 15.0 + 11.0 * sstep(-1, 1, sw_l))
    D['forearm_R'] = elbow_q(-1, 15.0 + 11.0 * sstep(-1, 1, -sw_l))
    D['shoulder_L'] = qy(-0.8) @ qz(-2.0 * sw_l)
    D['shoulder_R'] = qy(0.8) @ qz(-2.0 * sw_l)
    for side, sgn, off in (('L', 1.0, 0.0), ('R', -1.0, 0.5)):
        f = _walk_foot((ph + off) % 1.0, sgn)
        spec['leg_' + side] = f
        D['toe_' + side] = qx(f['toe'])
    return spec


RUN_T = 0.62
_RUN_KEYS = [
    (0.000, 0.200, 0.092, -6.0),
    (0.080, 0.067, 0.085, 0.0),
    (0.175, -0.090, 0.085, 3.0),
    (0.280, -0.264, 0.108, 24.0),
    (0.350, -0.380, 0.172, 50.0),
    (0.450, -0.465, 0.340, 72.0),
    (0.560, -0.340, 0.470, 76.0),
    (0.680, -0.060, 0.430, 44.0),
    (0.800, 0.220, 0.330, 10.0),
    (0.920, 0.290, 0.175, -10.0),
]
_run_foot = periodic(_RUN_KEYS)
RUN_SPEED = (0.200 + 0.380) / (0.35 * RUN_T)


def run_pose(t):
    ph = (t / RUN_T) % 1.0
    c, s = cos(2 * pi * ph), sin(2 * pi * (ph - 0.04))
    bob = -0.048 - 0.027 * cos(4 * pi * (ph - 0.175))
    spec = {'D': {}, 't': Vector((0.010 * s, -0.0, bob))}
    D = spec['D']
    D['hips'] = E(pitch=6.0, yaw=-9.0 * c, roll=-3.5 * s)
    D['spine'] = E(pitch=6.0, yaw=7.0 * c, roll=2.5 * s)
    D['chest'] = E(pitch=4.0, yaw=11.0 * c, roll=1.5 * s)
    D['neck'] = E(pitch=-6.0, yaw=-4.5 * c)
    D['head'] = E(pitch=-7.0, yaw=-4.5 * c)
    sw_l = -c
    D['upperarm_L'] = arm_q(1, 9.0, 34.0 * sw_l - 10.0)
    D['upperarm_R'] = arm_q(-1, 9.0, -34.0 * sw_l - 10.0)
    D['forearm_L'] = elbow_q(1, 82.0 + 16.0 * sw_l)
    D['forearm_R'] = elbow_q(-1, 82.0 - 16.0 * sw_l)
    D['shoulder_L'] = qz(-5.0 * sw_l) @ qy(-2.0)
    D['shoulder_R'] = qz(-5.0 * sw_l) @ qy(2.0)
    D['hand_L'] = qx(-8.0)
    D['hand_R'] = qx(-8.0)
    for side, sgn, off in (('L', 1.0, 0.0), ('R', -1.0, 0.5)):
        y, z, pitch = _run_foot(ph + off)
        z = 0.085 + (z - 0.085) * 0.72        # lower knee lift than the first rig's run
        spec['leg_' + side] = {'ankle': V(sgn * 0.055, y, z + rig.DZ), 'foot': qz(sgn * 3.0) @ qx(pitch)}
        php = (ph + off) % 1.0
        D['toe_' + side] = qx(-clamp(pitch, 0.0, 45.0) * (1 - sstep(0.35, 0.47, php)))
    return spec


TURN_T = 0.8


def turn_pose(t):
    ph = (t / TURN_T) % 1.0
    spec = idle_pose(0.0)
    D = spec['D']
    s = sin(2 * pi * ph)
    spec['t'] = Vector((-0.014 * sin(2 * pi * (ph - 0.05)), 0.0, -0.016 + 0.004 * cos(4 * pi * ph)))
    D['hips'] = E(roll=1.8 * s, yaw=2.0 * s)
    D['spine'] = E(pitch=1.0, roll=-1.2 * s, yaw=-1.0 * s)
    D['chest'] = E(pitch=0.0, roll=-0.6 * s, yaw=-1.0 * s)
    arms_down(spec, swing_l=3.0 * s, swing_r=-3.0 * s, elbow=14.0, add=15.5)
    for side, sgn, off in (('L', 1.0, 0.0), ('R', -1.0, 0.5)):
        p = (ph + off) % 1.0
        up = sin(pi * clamp(p / 0.42)) ** 1.4 if p < 0.42 else 0.0
        base = rig.ANKLE_L if side == 'L' else mirx(rig.ANKLE_L)
        spec['leg_' + side] = {'ankle': base + Vector((0, -0.012 * up, 0.050 * up)),
                               'foot': qx(16.0 * up)}
        D['toe_' + side] = qx(-4.0 * up)
    return spec


# --- annoyed idle ----------------------------------------------------------
# arm targets in chest space (rest coordinates)
_CROSS = {
    'L': {'wrist': V(-0.050, 0.170, 1.055), 'elbow': V(0.165, 0.070, 0.965)},
    'R': {'wrist': V(0.055, 0.150, 1.035), 'elbow': V(-0.165, 0.065, 0.960)},
}


def _idle_arm_points(sk):
    """wrist / elbow positions of the plain idle pose, in chest rest space"""
    spec = idle_pose(0.0)
    Q, P = solve(sk, spec)
    out = {}
    qc = Q['chest'].inverted()
    for side in ('L', 'R'):
        w = sk.head['chest'] + qc @ (P['hand_' + side] - P['chest'])
        e = sk.head['chest'] + qc @ (P['forearm_' + side] - P['chest'])
        # nudge the elbow hint backwards so the IK bends the natural way
        out[side] = {'wrist': w, 'elbow': e + V(0, -0.03, 0)}
    return out


def annoyed_pose(sk, k_body, k_l, k_r, t_loop=None):
    """k_* in 0..1 blend from the idle pose into the annoyed stance.
    t_loop: time inside the looping part (None while transitioning)."""
    spec = idle_pose(0.0 if t_loop is None else t_loop)
    D = spec['D']
    kb = k_body
    spec['curl'] = lerp(16.0, 48.0, min(k_l, k_r))
    tl = 0.0 if t_loop is None else t_loop
    b = sin(2 * pi * tl / 3.0)                       # annoyed breathing, a little quicker
    # impatient toe tapping (left foot): two bursts in the loop
    tap = 0.0
    for start in (0.9, 3.9):
        u = (tl - start) / 0.36
        if 0.0 <= u < 3.0:
            tap = max(tap, sin(pi * (u % 1.0)) ** 0.8)
    # "hmph": quick head toss
    hm = 0.0
    if t_loop is not None:
        u = (tl - 2.55) / 0.9
        if 0 <= u <= 1:
            hm = sin(pi * u) ** 2
    sigh = 0.0
    if t_loop is not None:
        u = (tl - 5.0) / 0.9
        if 0 <= u <= 1:
            sigh = sin(pi * u) ** 2
    spec['t'] = spec['t'] + Vector((-0.036 * kb, 0.004 * kb, -0.010 * kb - 0.002 * sigh * kb))
    D['hips'] = E(roll=5.0 * kb, yaw=4.0 * kb, pitch=-1.0 * kb)
    D['spine'] = E(pitch=0.5 - 2.0 * kb + 0.3 * b * kb, roll=-3.4 * kb, yaw=-1.0 * kb)
    D['chest'] = E(pitch=-0.8 - 2.2 * kb - 0.9 * b * kb + 2.0 * sigh * kb, roll=-2.4 * kb, yaw=-2.0 * kb)
    D['neck'] = E(pitch=-1.5 * kb, yaw=-5.0 * kb - 4.0 * hm * kb, roll=1.0 * kb)
    D['head'] = E(pitch=-3.5 * kb - 2.5 * hm * kb + 1.5 * sigh * kb, yaw=-8.0 * kb - 7.0 * hm * kb,
                  roll=3.0 * kb)
    D['shoulder_L'] = qy(-2.0 * kb - 0.8 * b * kb - 2.0 * sigh * kb) @ qz(4.0 * kb)
    D['shoulder_R'] = qy(2.0 * kb + 0.8 * b * kb + 2.0 * sigh * kb) @ qz(-4.0 * kb)
    # legs: weight on her right leg, left foot forward and turned out, tapping
    spec['leg_R'] = {'ankle': mirx(rig.ANKLE_L), 'foot': IDENT.copy()}
    la = rig.ANKLE_L + V(0.030 * kb, 0.070 * kb, 0.0)
    la.z += 0.022 * sin(pi * kb) * (1.0 if t_loop is None else 0.0) + 0.016 * tap * kb
    spec['leg_L'] = {'ankle': la, 'foot': qz(20.0 * kb) @ qx(-13.0 * tap * kb), 'knee_out': 0.25 * kb}
    # arms
    idle_pts = annoyed_pose.idle_pts
    for side, k in (('L', k_l), ('R', k_r)):
        sgn = 1.0 if side == 'L' else -1.0
        a, c = idle_pts[side], _CROSS[side]
        ke = k * k * (3 - 2 * k)
        mid_w = (a['wrist'] + c['wrist']) * 0.5 + V(sgn * 0.10, 0.13, -0.04)
        mid_e = (a['elbow'] + c['elbow']) * 0.5 + V(sgn * 0.03, -0.02, 0.0)
        w = a['wrist'] * (1 - ke) ** 2 + mid_w * (2 * ke * (1 - ke)) + c['wrist'] * ke ** 2
        e = a['elbow'] * (1 - ke) ** 2 + mid_e * (2 * ke * (1 - ke)) + c['elbow'] * ke ** 2
        if t_loop is not None:
            w = w + V(0, 0.003 * b, 0.002 * b)
        spec['arm_' + side] = {'wrist': w, 'elbow': e, 'space': 'chest'}
        D['hand_' + side] = qx(-4.0 * (1 - ke)) @ qz(sgn * 14.0 * ke) @ qx(8.0 * ke)
        D.pop('upperarm_' + side, None)
        D.pop('forearm_' + side, None)
    if t_loop is not None:
        # impatient finger/forearm tap of the outer (left) arm
        u = (tl - 1.9) / 0.3
        if 0.0 <= u < 3.0:
            D['hand_L'] = D['hand_L'] @ qx(-7.0 * sin(pi * (u % 1.0)))
    return spec


ANN_START_T = 1.5
ANN_LOOP_T = 6.0


def annoyed_start_pose(sk, t):
    kb = sstep(0.0, 0.85, t)
    kr = sstep(0.25, 1.25, t)
    kl = sstep(0.42, 1.45, t)
    return annoyed_pose(sk, kb, kl, kr, None)


def annoyed_loop_pose(sk, t):
    return annoyed_pose(sk, 1.0, 1.0, 1.0, t % ANN_LOOP_T)


# ---------------------------------------------------------------------------

def _clips(sk):
    annoyed_pose.idle_pts = _idle_arm_points(sk)
    return [
        ('idle', 4.0 * 2, idle_pose),
        ('walk', WALK_T, walk_pose),
        ('run', RUN_T, run_pose),
        ('turn', TURN_T, turn_pose),
        ('idle_annoyed_start', ANN_START_T, lambda t: annoyed_start_pose(sk, t)),
        ('idle_annoyed', ANN_LOOP_T, lambda t: annoyed_loop_pose(sk, t)),
    ]


FINGERS = ('index', 'middle', 'ring', 'pinky', 'thumb')


def _skip(b):
    return b == 'root'


def local_pose(sk, spec):
    Q, P = solve(sk, spec)
    out = {}
    for b in sk.order:
        if _skip(b):
            continue
        p = sk.parent[b]
        r = sk.R[b]
        q = r.inverted() @ (Q[p].inverted() @ Q[b]) @ r
        out[b] = q
    loc = sk.R['hips'].inverted() @ spec.get('t', Vector((0, 0, 0)))
    return out, loc


def build_all(arm_ob):
    init_rig(arm_ob)
    sk = Skel(arm_ob)
    scene = bpy.context.scene
    scene.render.fps = FPS
    arm_ob.animation_data_create()
    info = {'walk_speed': round(WALK_SPEED, 4), 'run_speed': round(RUN_SPEED, 4), 'clips': {}}
    for name, dur, fn in _clips(sk):
        n = int(round(dur * FPS))
        act = bpy.data.actions.new(name)
        act.use_fake_user = True
        rot = {b: [] for b in sk.order if not _skip(b)}
        locs = []
        for f in range(n + 1):
            t = f / FPS
            if name != 'idle_annoyed_start' and f == n:
                t = 0.0                                   # exact loop closure
            q, loc = local_pose(sk, fn(t))
            for b, v in q.items():
                if rot[b] and rot[b][-1].dot(v) < 0:
                    v = -v
                rot[b].append(v)
            locs.append(loc)
        for b, qs in rot.items():
            path = 'pose.bones["%s"].rotation_quaternion' % b
            for i in range(4):
                fc = act.fcurves.new(path, index=i, action_group=b)
                fc.keyframe_points.add(n + 1)
                co = []
                for f, v in enumerate(qs):
                    co += [float(f), v[i]]
                fc.keyframe_points.foreach_set('co', co)
                for kp in fc.keyframe_points:
                    kp.interpolation = 'LINEAR'
                fc.update()
        path = 'pose.bones["hips"].location'
        for i in range(3):
            fc = act.fcurves.new(path, index=i, action_group='hips')
            fc.keyframe_points.add(n + 1)
            co = []
            for f, v in enumerate(locs):
                co += [float(f), v[i]]
            fc.keyframe_points.foreach_set('co', co)
            for kp in fc.keyframe_points:
                kp.interpolation = 'LINEAR'
            fc.update()
        tr = arm_ob.animation_data.nla_tracks.new()
        tr.name = name
        st = tr.strips.new(name, 0, act)
        st.name = name
        assign(st, act)
        tr.mute = True
        info['clips'][name] = round(dur, 4)
    scene.frame_start = 0
    scene.frame_end = 240
    return info


def assign(ad_or_strip, act):
    if hasattr(ad_or_strip, 'action_slot') and len(getattr(act, 'slots', [])):
        ad_or_strip.action_slot = act.slots[0]


def show(arm_ob, name, frame):
    for tr in arm_ob.animation_data.nla_tracks:
        tr.mute = True
    act = bpy.data.actions[name]
    arm_ob.animation_data.action = act
    assign(arm_ob.animation_data, act)
    bpy.context.scene.frame_set(frame)
    bpy.context.view_layer.update()
