"""Combat and movement clips: combo openers and finishers, jump, crouch, block.

Same pose language as anim2 (world-axis deltas + two-bone IK). Every clip
starts and ends in (or, for the held ones, starts in) her plain idle pose so
the viewer can cross-fade in and out of it.

Character space via V(x, fwd, z): +x is her left, fwd is in front of her.
"""
from math import sin, cos, pi, radians
from mathutils import Vector
from . import anim2 as A
from .anim2 import V, E, qx, qy, qz, IDENT, sstep, lerp, mirx, rig

# fists up near the chin (chest rest space)
GUARD = {
    'L': {'wrist': V(0.075, 0.170, 1.255), 'elbow': V(0.165, 0.010, 1.080)},
    'R': {'wrist': V(-0.060, 0.195, 1.285), 'elbow': V(-0.160, 0.030, 1.085)},
}
# forearms raised in front of the face (chest rest space)
BLOCK = {
    'L': {'wrist': V(0.035, 0.185, 1.390), 'elbow': V(0.115, 0.140, 1.170)},
    'R': {'wrist': V(-0.040, 0.205, 1.370), 'elbow': V(-0.115, 0.150, 1.165)},
}

CLIPS = {             # name: duration (s)
    # combo openers
    'jab': 0.40,           # J  left lead jab to the head
    'body_jab': 0.42,      # U  left jab to the body
    'kick_low': 0.75,      # I  low shin kick
    'kick_high': 0.90,     # K  high roundhouse
    # combo finishers
    'cross': 0.55,         # J>J
    'body_hook': 0.60,     # U>U
    'uppercut': 0.65,      # U>J
    'heavy_body': 0.70,    # J>U
    'leg_sweep': 0.85,     # I>I and K>I
    'spin_kick': 0.95,     # K>K
    'rising_kick': 0.85,   # I>K
    # spells (cast with the wand in the right hand)
    'cast_confringo': 0.65,   # wand thrust; the projectile leaves at CAST_RELEASE
    # reactions (to a hit / to a disarming spell) and the wand pick-up
    'hit': 0.40,           # flinch
    'stagger': 0.75,       # stumbles a step back
    'knockback': 0.95,     # thrown back, knees give, recovers
    'disarmed': 0.85,      # wand hand flung back and open
    'pickup': 0.95,        # crouches, picks something up with the right hand
    # stances
    'wand_ready': 0.30,    # held: wand pointed at the opponent, guard up
    'confident': 8.0,      # looping idle: weight on one leg, hand on the hip
    # movement
    'jump': 0.95,
    'block': 0.22,    # held: plays once and stays in the last frame while the key is down
    'crouch': 0.30,   # held
}
HELD = ('block', 'crouch', 'wand_ready')
LOOPING = ('confident',)           # cyclic clips (the rest play once)


def env(t, a, b, c, d):
    """0 before a, rises a->b, 1 until c, falls c->d"""
    return sstep(a, b, t) * (1.0 - sstep(c, d, t))


def _vl(a, b, k):
    return a + (b - a) * k


def base(sk, k_guard, k_stance, arms=None, curl=None):
    """idle pose blended into a fighting stance by k_guard (arms) / k_stance
    (feet). arms: {side: (wrist, elbow, weight, space)} overrides; space
    'chest' (rest chest space) or 'world'."""
    spec = A.idle_pose(0.0)
    D = spec['D']
    idle = A.annoyed_pose.idle_pts
    for side in ('L', 'R'):
        g = GUARD[side]
        w = _vl(idle[side]['wrist'], g['wrist'], k_guard)
        e = _vl(idle[side]['elbow'], g['elbow'], k_guard)
        arm = {'wrist': w, 'elbow': e, 'space': 'chest'}
        if arms and side in arms:
            tw, te, k, space = arms[side]
            if space == 'world':
                arm['world_wrist'], arm['world_elbow'], arm['world_k'] = tw, te, k
            else:
                arm['wrist'], arm['elbow'] = _vl(w, tw, k), _vl(e, te, k)
        spec['arm_' + side] = arm
        D.pop('upperarm_' + side, None)
        D.pop('forearm_' + side, None)
        D['hand_' + side] = qx(-4.0 * (1 - k_guard))
    spec['curl'] = lerp(16.0, 70.0, k_guard) if curl is None else curl      # fists
    # stance: left foot forward, right back and turned out, knees soft
    s = k_stance
    spec['leg_L'] = {'ankle': rig.ANKLE_L + V(0.0, 0.075 * s, 0.0), 'foot': qz(6.0 * s)}
    spec['leg_R'] = {'ankle': mirx(rig.ANKLE_L) + V(-0.012 * s, -0.070 * s, 0.0), 'foot': qz(-16.0 * s)}
    spec['t'] = spec['t'] + Vector((0.0, 0.0, -0.025 * s))
    D['hips'] = E(yaw=-6.0 * s)
    D['head'] = E(pitch=3.0 * s, yaw=6.0 * s)
    return spec


def _twist(D, k, yaw, pitch=0.0):
    """turn the torso (towards her left for +yaw), head keeps facing forward"""
    D['hips'] = D.get('hips', IDENT) @ E(yaw=0.30 * yaw * k)
    D['spine'] = E(yaw=0.30 * yaw * k, pitch=0.5 * pitch * k)
    D['chest'] = E(yaw=0.40 * yaw * k, pitch=0.5 * pitch * k)
    D['neck'] = E(yaw=-0.40 * yaw * k)
    D['head'] = D.get('head', IDENT) @ E(yaw=-0.55 * yaw * k, pitch=-0.4 * pitch * k)


# --- strikes -----------------------------------------------------------------

def _strike(sk, t, side, target, elbow, guard, hit, twist, pitch=0.0, dip=0.0, fwd=0.0):
    """one arm strike: guard=(in, out_start, out_end) envelope of the stance,
    hit=(start, full, hold, back) envelope of the extension"""
    g = env(t, 0.0, guard[0], guard[1], guard[2])
    s = env(t, *hit)
    spec = base(sk, g, g, arms={side: (target, elbow, s, 'world')})
    _twist(spec['D'], s, twist, pitch)
    spec['t'] = spec['t'] + Vector((0.0, -fwd * s, -dip * s))
    rear = 'leg_R' if side == 'R' else 'leg_L'
    spec[rear]['foot'] = spec[rear]['foot'] @ qx(14.0 * s)        # rear heel lifts into the punch
    return spec, s, g


def jab(sk, t):
    spec, s, g = _strike(sk, t, 'L', V(0.050, 0.440, 1.300), V(0.200, 0.120, 1.200),
                         (0.05, 0.28, 0.40), (0.03, 0.10, 0.14, 0.28), twist=-12.0, pitch=2.0, fwd=0.015)
    return spec


def body_jab(sk, t):
    spec, s, g = _strike(sk, t, 'L', V(0.040, 0.400, 1.020), V(0.190, 0.120, 1.020),
                         (0.06, 0.30, 0.42), (0.04, 0.11, 0.16, 0.30), twist=-14.0, pitch=14.0, dip=0.07)
    return spec


def cross(sk, t):
    spec, s, g = _strike(sk, t, 'R', V(-0.015, 0.430, 1.300), V(-0.200, 0.120, 1.200),
                         (0.07, 0.40, 0.55), (0.06, 0.15, 0.23, 0.42), twist=32.0, pitch=4.0, fwd=0.03)
    return spec


def heavy_body(sk, t):
    spec, s, g = _strike(sk, t, 'R', V(-0.010, 0.450, 1.000), V(-0.190, 0.130, 1.020),
                         (0.07, 0.52, 0.70), (0.08, 0.22, 0.32, 0.55), twist=42.0, pitch=22.0, dip=0.10, fwd=0.06)
    spec['leg_L']['ankle'] = spec['leg_L']['ankle'] + V(0.0, 0.08 * s, 0.0)    # step in
    return spec


def body_hook(sk, t):
    a = sstep(0.06, 0.18, t)                                # fist travels round from the side
    target = V(lerp(-0.30, -0.02, a), lerp(0.16, 0.33, a), 1.06)
    spec, s, g = _strike(sk, t, 'R', target, V(-0.300, 0.220, 1.120),
                         (0.07, 0.45, 0.60), (0.06, 0.18, 0.26, 0.45), twist=45.0, pitch=14.0, dip=0.06)
    return spec


def uppercut(sk, t):
    load = env(t, 0.0, 0.10, 0.10, 0.24)                    # dip, then drive upwards
    a = sstep(0.10, 0.24, t)
    target = V(-0.060, lerp(0.20, 0.27, a), lerp(0.98, 1.31, a))
    elbow = V(-0.110, 0.240, lerp(0.80, 0.98, a))           # elbow low, under the fist: forearm near vertical
    spec, s, g = _strike(sk, t, 'R', target, elbow, (0.07, 0.50, 0.65), (0.05, 0.24, 0.32, 0.50),
                         twist=28.0, pitch=14.0 * load - 12.0 * a)
    spec['t'] = spec['t'] + Vector((0.0, 0.0, -0.08 * load + 0.03 * a * s))
    return spec


def _kick(sk, t, chamber, extend, times, lean, foot_pitch, drop):
    t_ch, t_ex0, t_ex1, t_back, t_end = times
    g = env(t, 0.0, 0.10, t_back, t_end)
    up = env(t, 0.04, t_ch, t_back, t_end)                  # leg off the ground
    ex = env(t, t_ch, t_ex0, t_ex1, t_back)                 # extension
    spec = base(sk, g, g)
    D = spec['D']
    rest = mirx(rig.ANKLE_L) + V(-0.012 * g, -0.070 * g, 0.0)
    ankle = _vl(rest, _vl(chamber, extend, ex), up)
    spec['leg_R'] = {'ankle': ankle, 'foot': qz(-16.0 * g * (1 - up)) @ qx(foot_pitch * ex),
                     'knee_out': -0.2 * up}
    D['hips'] = E(yaw=-6.0 * g + 14.0 * ex, pitch=-lean * 0.5 * ex)
    D['spine'] = E(pitch=-lean * 0.3 * ex)
    D['chest'] = E(pitch=-lean * 0.2 * ex, yaw=-6.0 * ex)
    D['head'] = E(pitch=3.0 * g + lean * 0.6 * ex, yaw=-6.0 * ex)
    spec['t'] = spec['t'] + Vector((0.012 * up, 0.02 * ex, -drop * up))
    return spec


def kick_high(sk, t):
    return _kick(sk, t, chamber=V(-0.060, 0.280, 0.640), extend=V(-0.040, 0.700, 1.080),
                 times=(0.20, 0.32, 0.46, 0.68, 0.90), lean=22.0, foot_pitch=-25.0, drop=0.02)


def kick_low(sk, t):
    return _kick(sk, t, chamber=V(-0.070, 0.220, 0.340), extend=V(-0.030, 0.600, 0.230),
                 times=(0.16, 0.27, 0.38, 0.56, 0.75), lean=6.0, foot_pitch=-10.0, drop=0.05)


def rising_kick(sk, t):
    spec = _kick(sk, t, chamber=V(-0.060, 0.260, 0.700), extend=V(-0.050, 0.600, 1.280),
                 times=(0.18, 0.30, 0.44, 0.64, 0.85), lean=30.0, foot_pitch=-30.0, drop=0.0)
    hop = env(t, 0.22, 0.30, 0.42, 0.54)                    # small hop off the support leg
    spec['t'] = spec['t'] + Vector((0.0, 0.0, 0.07 * hop))
    spec['leg_L']['ankle'] = spec['leg_L']['ankle'] + V(0.0, 0.0, 0.07 * hop)
    spec['leg_L']['foot'] = spec['leg_L']['foot'] @ qx(25.0 * hop)
    return spec


def _rz(v, deg):
    """rotate a point about the vertical axis through her feet (+ towards her left)"""
    return qz(deg) @ v


def leg_sweep(sk, t):
    c = env(t, 0.0, 0.14, 0.62, 0.85)                       # drop low
    ex = env(t, 0.14, 0.22, 0.48, 0.64)                     # leg out
    a = lerp(-95.0, 25.0, sstep(0.20, 0.48, t))             # sweep from her right side to the front
    spec = base(sk, c, 0.0)
    D = spec['D']
    spec['t'] = spec['t'] + Vector((0.0, 0.03 * c, -0.33 * c))
    out = V(0.58 * sin(radians(a)), 0.58 * cos(radians(a)), 0.09)    # a<0: her right side, a>0: front-left
    rest = mirx(rig.ANKLE_L)
    spec['leg_R'] = {'ankle': _vl(rest, out, ex), 'foot': qz(-a * 0.6 * ex) @ qx(-15.0 * ex), 'knee_out': 0.0}
    spec['leg_L']['knee_out'] = 0.25 * c
    D['hips'] = E(yaw=0.35 * a * ex, pitch=10.0 * c)
    D['spine'] = E(pitch=14.0 * c, yaw=0.15 * a * ex)
    D['chest'] = E(pitch=8.0 * c)
    D['head'] = E(pitch=-14.0 * c, yaw=-0.4 * a * ex)
    return spec


def spin_kick(sk, t):
    g = env(t, 0.0, 0.08, 0.80, 0.95)
    y = -360.0 * sstep(0.10, 0.62, t)                       # full turn to her right
    up = env(t, 0.16, 0.30, 0.66, 0.84)
    ex = env(t, 0.30, 0.42, 0.60, 0.74)
    spec = base(sk, g, 0.0)
    D = spec['D']
    pivot_l = V(0.03, 0.0, rig.ANKLE_L.z)                   # turn on the ball of the left foot
    spec['leg_L'] = {'ankle': _rz(_vl(rig.ANKLE_L, pivot_l, g), y), 'foot': qz(y)}
    rest_r = mirx(rig.ANKLE_L)
    rel = _vl(rest_r, _vl(V(-0.080, 0.200, 0.620), V(-0.420, 0.420, 1.050), ex), up)
    spec['leg_R'] = {'ankle': _rz(rel, y), 'foot': qz(y) @ qx(-25.0 * ex), 'knee_out': -0.2 * up}
    D['hips'] = E(yaw=y + 18.0 * ex, pitch=-10.0 * ex)
    D['spine'] = E(pitch=-6.0 * ex)
    D['head'] = E(yaw=-14.0 * ex)
    spec['t'] = spec['t'] + Vector((0.0, 0.0, 0.02 * up))
    return spec


# --- spells -------------------------------------------------------------------

CAST_RELEASE = 0.42     # s: wand fully thrust, the spell leaves its tip (viewer: CONFRINGO_RELEASE)


def cast_confringo(sk, t):
    """Confringo with the wand (held in the right hand, along the hand): turn towards the
    target, raise the wand up and forward while the fire gathers at its tip, thrust it at
    the target (release), settle back."""
    g = env(t, 0.0, 0.10, 0.50, 0.65)                      # stance
    up = env(t, 0.03, 0.16, 0.46, 0.63)                    # arm raised, wand up
    thrust = env(t, 0.32, CAST_RELEASE, 0.47, 0.60)        # wand thrust at the target
    charge_w, charge_e = V(-0.140, 0.210, 1.330), V(-0.260, 0.040, 1.180)
    out_w, out_e = V(-0.070, 0.470, 1.300), V(-0.200, 0.240, 1.250)
    wrist = _vl(charge_w, out_w, thrust)
    elbow = _vl(charge_e, out_e, thrust)
    spec = base(sk, 0.45 * g, g, arms={'R': (wrist, elbow, up, 'world')})
    arm = spec['arm_R']
    # the wand runs along the hand: point the hand up-forward while charging, at the target
    # on the thrust
    arm['hand_dir'] = _vl(V(0.0, 0.45, 1.0), V(0.02, 1.0, 0.0), thrust)
    arm['hand_k'] = up
    _twist(spec['D'], up, 16.0 + 18.0 * thrust, pitch=3.0)
    spec['t'] = spec['t'] + Vector((0.0, -0.025 * thrust, -0.01 * up))
    spec['leg_L']['foot'] = spec['leg_L']['foot'] @ qx(8.0 * thrust)
    spec['leg_R']['foot'] = spec['leg_R']['foot'] @ qx(12.0 * thrust)     # rear heel lifts into it
    return spec


# --- reactions -----------------------------------------------------------------

def _recoil(spec, k, back=0.03, lean=10.0, head=14.0, yaw=0.0):
    D = spec['D']
    D['spine'] = D.get('spine', IDENT) @ E(pitch=-0.5 * lean * k, yaw=0.4 * yaw * k)
    D['chest'] = D.get('chest', IDENT) @ E(pitch=-0.5 * lean * k, yaw=0.6 * yaw * k)
    D['head'] = D.get('head', IDENT) @ E(pitch=-head * k, yaw=0.5 * yaw * k)
    spec['t'] = spec['t'] + Vector((0.0, back * k, -0.01 * k))      # +y: backwards


def hit(sk, t):
    """flinch: head and chest snap back, shoulders up, back in place"""
    k = env(t, 0.0, 0.05, 0.10, CLIPS['hit'])
    spec = A.idle_pose(0.0)
    _recoil(spec, k, back=0.025, lean=12.0, head=16.0, yaw=6.0)
    A.arms_down(spec, swing_l=5.0 * k, swing_r=3.0 * k, add=17.0 - 4.0 * k, elbow=11.0 + 18.0 * k)
    D = spec['D']
    D['shoulder_L'] = qy(-6.0 * k)                         # shoulders hunch
    D['shoulder_R'] = qy(6.0 * k)
    return spec


def stagger(sk, t):
    """stumbles: a step back with the right foot, arms out for balance, steadies"""
    k = env(t, 0.0, 0.08, 0.32, CLIPS['stagger'])
    step = env(t, 0.06, 0.22, 0.45, CLIPS['stagger'])
    spec = A.idle_pose(0.0)
    _recoil(spec, k, back=0.05, lean=16.0, head=10.0, yaw=-10.0)
    spec['leg_R']['ankle'] = spec['leg_R']['ankle'] + V(-0.02 * step, -0.17 * step, 0.03 * env(t, 0.06, 0.14, 0.14, 0.22))
    spec['t'] = spec['t'] + Vector((0.0, 0.0, -0.04 * step))
    A.arms_down(spec, swing_l=-18.0 * k, swing_r=-12.0 * k, add=17.0 - 34.0 * k, elbow=11.0 + 25.0 * k)
    return spec


def knockback(sk, t):
    """thrown back: big recoil, knees give, arms forward, gets her balance back"""
    T = CLIPS['knockback']
    k = env(t, 0.0, 0.07, 0.40, T)
    sink = env(t, 0.10, 0.30, 0.50, T)
    spec = A.idle_pose(0.0)
    _recoil(spec, k, back=0.07, lean=22.0, head=18.0, yaw=8.0)
    spec['t'] = spec['t'] + Vector((0.0, 0.0, -0.12 * sink))
    D = spec['D']
    D['hips'] = D.get('hips', IDENT) @ E(pitch=10.0 * sink)
    for side in ('L', 'R'):
        spec['leg_' + side]['knee_out'] = 0.10 * sink
    A.arms_down(spec, swing_l=38.0 * k, swing_r=30.0 * k, add=17.0 - 14.0 * k, elbow=12.0 + 45.0 * k)
    return spec


def disarmed(sk, t):
    """the wand is blasted out of her hand: the right arm flung back and out with the hand
    open, the body twisted after it"""
    T = CLIPS['disarmed']
    k = env(t, 0.0, 0.07, 0.30, T)
    arm = env(t, 0.0, 0.06, 0.38, T)
    spec = A.idle_pose(0.0)
    _recoil(spec, k, back=0.04, lean=12.0, head=14.0, yaw=-22.0)
    D = spec['D']
    D['upperarm_L'] = A.arm_q(1, 17.0 - 8.0 * k, 10.0 * k)
    D['forearm_L'] = A.elbow_q(1, 11.0 + 40.0 * k)
    D['upperarm_R'] = A.arm_q(-1, 17.0 - 40.0 * arm, -35.0 * arm)
    D['forearm_R'] = A.elbow_q(-1, 11.0 - 6.0 * arm)
    D['hand_R'] = qx(-30.0 * arm)
    spec['curl'] = lerp(16.0, 4.0, arm)                   # hand open
    return spec


def pickup(sk, t):
    """crouches and picks something up from the floor in front of her right foot"""
    T = CLIPS['pickup']
    k = env(t, 0.0, 0.32, 0.52, T)
    spec = base(sk, 0.0, 0.0, arms={'R': (V(-0.12, 0.30, 0.16), V(-0.22, 0.12, 0.45), k, 'world')})
    D = spec['D']
    spec['t'] = spec['t'] + Vector((0.0, 0.06 * k, -0.40 * k))
    D['hips'] = E(pitch=24.0 * k)
    D['spine'] = E(pitch=26.0 * k)
    D['chest'] = E(pitch=10.0 * k)
    D['head'] = E(pitch=-24.0 * k)
    spec['leg_L']['knee_out'] = 0.18 * k
    spec['leg_R']['knee_out'] = 0.10 * k
    spec['curl'] = lerp(16.0, 55.0, env(t, 0.40, 0.48, 0.80, T))   # closes on it
    return spec


# --- stances -------------------------------------------------------------------

def wand_ready(sk, t):
    """held: fighting stance with the wand pointed at the opponent, left hand up"""
    k = sstep(0.0, CLIPS['wand_ready'], t)
    spec = base(sk, k, k, arms={'R': (V(-0.090, 0.400, 1.210), V(-0.230, 0.160, 1.110), k, 'world')})
    arm = spec['arm_R']
    arm['hand_dir'] = V(0.02, 1.0, 0.18)                  # wand along the hand, at the target
    arm['hand_k'] = k
    _twist(spec['D'], k, 14.0, 2.0)
    return spec


def confident(sk, t):
    """looping idle: weight on her right leg, left hand on the hip, chin up"""
    spec = base(sk, 0.0, 0.0, arms={'L': (V(0.165, 0.005, 0.975), V(0.275, -0.050, 1.110), 1.0, 'chest')})
    D = spec['D']
    b = sin(2 * pi * t / 4.0)
    D['hips'] = D.get('hips', IDENT) @ E(roll=-4.0, yaw=-8.0)
    D['spine'] = E(roll=2.0, pitch=0.5 + 0.35 * b)
    D['chest'] = E(roll=2.0, pitch=-1.5 - 0.6 * b)
    D['head'] = E(pitch=-5.0 + 0.4 * b, yaw=10.0 + 1.5 * sin(2 * pi * t / 8.0), roll=-3.0)
    spec['t'] = spec['t'] + Vector((-0.025, 0.0, -0.006))
    spec['leg_L']['ankle'] = spec['leg_L']['ankle'] + V(0.035, 0.05, 0.0)
    spec['leg_L']['foot'] = qz(12.0)
    spec['curl'] = 30.0
    return spec


# --- held poses --------------------------------------------------------------

def block(sk, t):
    k = sstep(0.0, CLIPS['block'], t)
    spec = base(sk, k, k, arms={'L': (BLOCK['L']['wrist'], BLOCK['L']['elbow'], k, 'chest'),
                                'R': (BLOCK['R']['wrist'], BLOCK['R']['elbow'], k, 'chest')})
    D = spec['D']
    D['chest'] = E(pitch=6.0 * k)
    D['head'] = E(pitch=9.0 * k)                            # chin tucked behind the arms
    spec['t'] = spec['t'] + Vector((0.0, 0.0, -0.025 * k))
    return spec


def crouch(sk, t):
    k = sstep(0.0, CLIPS['crouch'], t)
    spec = base(sk, k, 0.4 * k)
    D = spec['D']
    spec['t'] = spec['t'] + Vector((0.0, 0.05 * k, -0.30 * k))     # hips down and back
    D['hips'] = E(pitch=14.0 * k)
    D['spine'] = E(pitch=10.0 * k)
    D['chest'] = E(pitch=6.0 * k)
    D['head'] = E(pitch=-16.0 * k)                          # eyes stay level
    for side in ('L', 'R'):
        spec['leg_' + side]['knee_out'] = 0.12 * k
    return spec


# --- jump --------------------------------------------------------------------

def jump(sk, t):
    T = CLIPS['jump']
    pre = env(t, 0.0, 0.14, 0.14, 0.24)                     # crouch to load
    air_t = (t - 0.22) / (0.70 - 0.22)                      # 0..1 while airborne
    air = sin(pi * min(max(air_t, 0.0), 1.0))
    land = env(t, 0.68, 0.76, 0.76, T)                      # absorb the landing
    tuck = env(t, 0.24, 0.36, 0.52, 0.70)
    spec = A.idle_pose(0.0)
    D = spec['D']
    h = 0.32 * air                                          # height of the jump
    down = 0.13 * pre + 0.11 * land
    spec['t'] = spec['t'] + Vector((0.0, 0.0, h - down))
    lift = max(0.0, h - 0.02) + 0.16 * tuck
    for side, base_a in (('L', rig.ANKLE_L), ('R', mirx(rig.ANKLE_L))):
        spec['leg_' + side] = {'ankle': base_a + V(0.0, 0.03 * tuck, lift),
                               'foot': qx(-10.0 * tuck + 22.0 * air * (1 - tuck))}
    D['spine'] = E(pitch=10.0 * pre + 6.0 * land - 4.0 * air)
    D['chest'] = E(pitch=4.0 * pre + 3.0 * land - 3.0 * air)
    D['head'] = E(pitch=-6.0 * pre - 4.0 * land + 2.0 * air)
    # arms swing back while loading, then forward-up and out to the sides in the air
    # (balance); elbows stay only lightly bent so the hands stay outside her shoulders
    # instead of meeting in front of her chest
    swing = -32.0 * pre + 32.0 * air - 8.0 * land
    spread = 24.0 * air                                     # away from the body
    A.arms_down(spec, swing_l=swing, swing_r=swing, add=17.0 - spread, elbow=14.0 + 16.0 * air + 12.0 * land)
    D['hand_L'] = qx(-6.0 * air)
    D['hand_R'] = qx(-6.0 * air)
    return spec


# --- Cho -----------------------------------------------------------------------
# Built only into the models whose profile lists them (character.py 'extra_clips'), so the
# other characters' models stay as they were. Movement clips are in place: the game moves
# her through the world while they play.

def cho_idle(sk, t):
    """looping idle: balanced and composed, shoulders easy, the wand held lightly low in her
    right hand, a slow shift of weight between her feet and a calm, observant tilt of the head"""
    b = sin(2 * pi * t / 8.0)                       # the weight shift (one cycle per loop)
    br = sin(2 * pi * t / 4.0)                      # breathing
    spec = base(sk, 0.0, 0.0, arms={'R': (V(-0.115, 0.125, 0.985), V(-0.200, 0.025, 1.120), 1.0, 'chest')})
    arm = spec['arm_R']
    arm['hand_dir'] = V(0.30, 0.55, -0.78)          # wand along the hand: down, forward, a little in
    arm['hand_k'] = 1.0
    D = spec['D']
    D['hips'] = D.get('hips', IDENT) @ E(roll=1.6 * b, yaw=-4.0)
    D['spine'] = E(roll=-0.8 * b, pitch=0.3 + 0.3 * br)
    D['chest'] = E(roll=-0.6 * b, pitch=-1.2 - 0.5 * br, yaw=3.0)
    D['neck'] = E(pitch=0.6)
    D['head'] = E(pitch=2.0 + 0.3 * br, yaw=-4.0 + 1.2 * sin(2 * pi * t / 8.0 + 1.3), roll=2.5)
    D['shoulder_L'] = qy(-0.6 * br)
    D['shoulder_R'] = qy(0.6 * br)
    spec['t'] = spec['t'] + Vector((0.012 * b, 0.0, -0.004))
    spec['leg_L']['ankle'] = spec['leg_L']['ankle'] + V(0.012, 0.045, 0.0)   # left foot a little forward
    spec['leg_L']['foot'] = qz(8.0)
    spec['leg_R']['foot'] = qz(-10.0)
    spec['curl'] = 34.0                             # a light grip
    return spec


def _dodge(sk, t, side):
    """a quick sidestep to her left (side +1) or right (-1): drops, the lead foot reaches out,
    the body leans into the step with the head level, then she gathers back into her stance"""
    T = CLIPS['dodge_left' if side > 0 else 'dodge_right']
    k = env(t, 0.0, 0.10, 0.24, T)
    reach = env(t, 0.02, 0.12, 0.20, 0.36)
    spec = base(sk, 0.6 * k, k, arms={'R': (V(-0.10, 0.36, 1.20), V(-0.23, 0.15, 1.11), k, 'world')})
    arm = spec['arm_R']
    arm['hand_dir'] = V(0.02, 1.0, 0.25)            # the wand stays on the opponent
    arm['hand_k'] = k
    D = spec['D']
    D['hips'] = D.get('hips', IDENT) @ E(roll=6.0 * side * k)       # leaning into the step
    D['spine'] = E(roll=5.0 * side * k, pitch=4.0 * k)
    D['chest'] = E(roll=4.0 * side * k, pitch=3.0 * k)
    D['head'] = E(roll=-7.0 * side * k, pitch=-3.0 * k)     # eyes stay level
    spec['t'] = spec['t'] + Vector((0.045 * side * reach, 0.0, -0.075 * k))
    lead, trail = ('leg_L', 'leg_R') if side > 0 else ('leg_R', 'leg_L')
    spec[lead]['ankle'] = spec[lead]['ankle'] + V(0.13 * side * reach, 0.0, 0.03 * env(t, 0.02, 0.07, 0.10, 0.16))
    spec[lead]['knee_out'] = 0.10 * k
    spec[trail]['ankle'] = spec[trail]['ankle'] + V(0.03 * side * reach, 0.0, 0.0)
    spec[trail]['foot'] = spec[trail]['foot'] @ qx(18.0 * reach)        # pushing off the trailing toes
    spec['curl'] = lerp(16.0, 40.0, k)
    return spec


def dodge_left(sk, t):
    return _dodge(sk, t, 1)


def dodge_right(sk, t):
    return _dodge(sk, t, -1)


def dodge_back(sk, t):
    """a quick step back out of reach: the right foot steps back, she sinks into it with the
    chest upright and the wand still on the opponent, then settles into her stance"""
    T = CLIPS['dodge_back']
    k = env(t, 0.0, 0.12, 0.28, T)
    step = env(t, 0.02, 0.14, 0.26, 0.42)
    spec = base(sk, 0.6 * k, k, arms={'R': (V(-0.10, 0.34, 1.21), V(-0.23, 0.14, 1.11), k, 'world')})
    arm = spec['arm_R']
    arm['hand_dir'] = V(0.02, 1.0, 0.25)
    arm['hand_k'] = k
    D = spec['D']
    D['spine'] = E(pitch=-5.0 * step + 3.0 * k)
    D['chest'] = E(pitch=-3.0 * step)
    D['head'] = E(pitch=5.0 * step)
    spec['t'] = spec['t'] + Vector((0.0, 0.05 * step, -0.06 * k))
    spec['leg_R']['ankle'] = spec['leg_R']['ankle'] + V(0.0, -0.14 * step, 0.025 * env(t, 0.02, 0.07, 0.10, 0.17))
    spec['leg_R']['foot'] = spec['leg_R']['foot'] @ qx(14.0 * step)
    spec['leg_L']['knee_out'] = 0.06 * k
    spec['curl'] = lerp(16.0, 40.0, k)
    return spec


def protego(sk, t):
    """held: the shield charm, the wand raised upright before her chest, the left hand open
    and forward, braced in her stance"""
    k = sstep(0.0, CLIPS['protego'], t)
    spec = base(sk, 0.5 * k, k, arms={'R': (V(-0.035, 0.330, 1.300), V(-0.190, 0.150, 1.170), k, 'world'),
                                      'L': (V(0.090, 0.300, 1.190), V(0.200, 0.110, 1.110), k, 'world')})
    arm = spec['arm_R']
    arm['hand_dir'] = V(0.12, 0.40, 1.0)            # the wand points up
    arm['hand_k'] = k
    _twist(spec['D'], k, 10.0, 3.0)
    spec['D']['head'] = spec['D'].get('head', IDENT) @ E(pitch=3.0 * k)
    spec['t'] = spec['t'] + Vector((0.0, 0.015 * k, -0.02 * k))
    spec['curl'] = lerp(16.0, 24.0, k)              # open hands (the wand still gripped)
    return spec


def cast_quick(sk, t):
    """Stupefy: a fast flick of the wand from the hip at the target (release at QUICK_RELEASE)"""
    g = env(t, 0.0, 0.07, 0.30, 0.45)
    up = env(t, 0.0, 0.08, 0.27, 0.43)
    thrust = env(t, 0.10, QUICK_RELEASE, 0.27, 0.40)
    wrist = _vl(V(-0.150, 0.180, 1.250), V(-0.060, 0.470, 1.290), thrust)
    elbow = _vl(V(-0.260, 0.020, 1.150), V(-0.190, 0.240, 1.240), thrust)
    spec = base(sk, 0.4 * g, g, arms={'R': (wrist, elbow, up, 'world')})
    arm = spec['arm_R']
    arm['hand_dir'] = _vl(V(0.0, 0.6, 0.8), V(0.02, 1.0, 0.02), thrust)
    arm['hand_k'] = up
    _twist(spec['D'], up, 12.0 + 16.0 * thrust, pitch=2.0)
    spec['t'] = spec['t'] + Vector((0.0, -0.02 * thrust, -0.01 * up))
    spec['leg_R']['foot'] = spec['leg_R']['foot'] @ qx(10.0 * thrust)
    return spec


def cast_ventus(sk, t):
    """Ventus: wound up to her right, the wand sweeps across in front of her and the left
    palm pushes forward as the gust leaves (VENTUS_RELEASE), then she recovers"""
    g = env(t, 0.0, 0.10, 0.50, 0.70)
    up = env(t, 0.0, 0.12, 0.48, 0.68)
    sweep = sstep(0.12, VENTUS_RELEASE, t)
    push = env(t, 0.20, VENTUS_RELEASE, 0.44, 0.62)
    # the wand arm from wound-up at her right to extended straight ahead; the left palm
    # pushes out ahead of her left shoulder (beside the wand arm, not across it)
    wrist = _vl(V(-0.300, 0.150, 1.260), V(-0.030, 0.480, 1.270), sweep)
    elbow = _vl(V(-0.300, -0.050, 1.180), V(-0.170, 0.250, 1.230), sweep)
    spec = base(sk, 0.4 * g, g, arms={'R': (wrist, elbow, up, 'world'),
                                      'L': (V(0.150, 0.440, 1.200), V(0.230, 0.210, 1.160), push, 'world')})
    arm = spec['arm_R']
    arm['hand_dir'] = _vl(V(-0.6, 0.6, 0.3), V(0.12, 1.0, 0.04), sweep)
    arm['hand_k'] = up
    _twist(spec['D'], up, -18.0 + 40.0 * sweep, pitch=2.0)
    spec['t'] = spec['t'] + Vector((0.0, -0.03 * push, -0.02 * up))
    spec['leg_L']['foot'] = spec['leg_L']['foot'] @ qx(8.0 * push)
    spec['curl'] = 16.0
    return spec


QUICK_RELEASE = 0.20    # s: Stupefy leaves the wand tip (viewer: STUPEFY.release)
VENTUS_RELEASE = 0.34   # s: the gust leaves (viewer: VENTUS.release)
EXTRA_CLIPS = {
    'cho_idle': 8.0,       # looping idle: composed, the wand held low
    'dodge_left': 0.42,    # quick sidestep to her left (the game slides her)
    'dodge_right': 0.42,
    'dodge_back': 0.48,    # quick step back
    'protego': 0.22,       # held: the shield, wand raised
    'cast_quick': 0.45,    # Stupefy flick
    'cast_ventus': 0.70,   # Ventus sweep
}
from .character import P as _P  # noqa: E402
for _n in _P.get('extra_clips', ()):
    CLIPS[_n] = EXTRA_CLIPS[_n]
if 'cho_idle' in CLIPS:
    LOOPING = LOOPING + ('cho_idle',)
if 'protego' in CLIPS:
    HELD = HELD + ('protego',)


def clips(sk):
    return [(n, CLIPS[n], (lambda f: (lambda t: f(sk, t)))(globals()[n])) for n in CLIPS]
