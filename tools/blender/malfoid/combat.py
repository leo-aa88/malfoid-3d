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


# --- Susan -----------------------------------------------------------------------
# (she also uses Cho's cast_quick for Impedimenta and cast_ventus for Depulso)

def susan_idle(sk, t):
    """looping idle: planted and patient, feet a little wider than Cho's, the wand held ready
    in front of her waist pointing at the floor ahead, slow even breathing, head level"""
    b = sin(2 * pi * t / 6.0)                       # a small weight shift
    br = sin(2 * pi * t / 4.0)                      # breathing
    spec = base(sk, 0.0, 0.0, arms={'R': (V(-0.105, 0.170, 1.000), V(-0.205, 0.040, 1.110), 1.0, 'chest')})
    arm = spec['arm_R']
    arm['hand_dir'] = V(0.22, 0.80, -0.55)          # wand forward and down: ready, not raised
    arm['hand_k'] = 1.0
    D = spec['D']
    D['hips'] = D.get('hips', IDENT) @ E(roll=0.9 * b, yaw=-3.0)
    D['spine'] = E(roll=-0.5 * b, pitch=0.6 + 0.3 * br)
    D['chest'] = E(roll=-0.4 * b, pitch=-0.8 - 0.5 * br, yaw=2.0)
    D['neck'] = E(pitch=0.4)
    D['head'] = E(pitch=1.0 + 0.3 * br, yaw=-2.0 + 0.8 * sin(2 * pi * t / 6.0 + 1.1))
    D['shoulder_L'] = qy(-0.6 * br)
    D['shoulder_R'] = qy(0.6 * br)
    spec['t'] = spec['t'] + Vector((0.006 * b, 0.0, -0.008))
    spec['leg_L']['ankle'] = spec['leg_L']['ankle'] + V(0.022, 0.035, 0.0)   # left foot forward and out
    spec['leg_R']['ankle'] = spec['leg_R']['ankle'] + V(-0.018, -0.010, 0.0)
    spec['leg_L']['foot'] = qz(10.0)
    spec['leg_R']['foot'] = qz(-12.0)
    spec['curl'] = 38.0                             # a firm grip
    return spec


def episkey(sk, t):
    """Episkey, healing herself (EPISKEY_TIME s, interruptible): the wand comes in to touch
    her chest over the heart, the left hand rests beside it, the head bows; near the end the
    chest lifts as the charm takes (the game heals her at the end of the clip)"""
    T = CLIPS['episkey']
    k = env(t, 0.0, 0.30, T - 0.22, T)
    lift = env(t, T - 0.45, T - 0.25, T - 0.12, T)
    spec = base(sk, 0.2 * k, k, arms={'R': (V(-0.055, 0.205, 1.215), V(-0.205, 0.060, 1.110), k, 'world'),
                                      'L': (V(0.045, 0.175, 1.190), V(0.195, 0.040, 1.105), k, 'world')})
    arm = spec['arm_R']
    arm['hand_dir'] = V(0.45, -0.45, 0.55)          # the wand tip turned in, onto her chest
    arm['hand_k'] = k
    D = spec['D']
    D['spine'] = E(pitch=3.0 * k - 3.0 * lift)
    D['chest'] = E(pitch=2.0 * k - 4.0 * lift)
    D['head'] = E(pitch=11.0 * k - 6.0 * lift, roll=2.0 * k)          # bowed, lifting at the end
    spec['t'] = spec['t'] + Vector((0.0, 0.0, -0.012 * k))
    spec['curl'] = lerp(16.0, 30.0, k)
    return spec


# --- side-step walk (Cho circling her opponent while facing her)
# A duelling-stance shuffle to her left: the lead (left) foot steps out, the trailing (right)
# foot closes to it; the feet never cross. Played reversed it moves her right (the trail foot
# leads). Feet land at phase 0 (left) and 0.5 (right), like the walk. In place: the game moves
# her at STRAFE_SPEED.
STRAFE_T = 0.5            # s per cycle (one step-together pair)
STRAFE_STRIDE = 0.32      # m the body moves per cycle (STRAFE_SPEED = stride / T = 0.64 m/s)
STRAFE_C = 0.145          # m: each foot's mean distance from her centre line (gap 13 cm, widest 45 cm)
STRAFE_DUTY = 0.6         # stance fraction of a foot's cycle
STRAFE_LIFT = 0.035       # m foot clearance in the swing


def _strafe_foot(ph, sgn):
    """x offset (m, + = her left) and lift of one foot; ph 0 = this foot lands"""
    S, d = STRAFE_STRIDE, STRAFE_DUTY
    land = sgn * STRAFE_C + 0.5 * d * S              # mean of its stance is at sgn * C
    if ph < d:                                      # planted: moves with the ground (body moves +x)
        return land - S * ph, 0.0
    s = (ph - d) / (1 - d)                          # swing: back out to the landing spot
    k = s * s * (3 - 2 * s)
    return (land - S * d) + S * d * k, STRAFE_LIFT * sin(pi * s) ** 1.2


def strafe(sk, t):
    ph = (t / STRAFE_T) % 1.0
    spec = A.idle_pose(0.0)
    D = spec['D']
    # weight shifts onto each foot as it takes the load; the hips dip as the feet come together
    shift = 0.018 * sin(2 * pi * ph)
    bob = -0.030 - 0.010 * cos(4 * pi * ph)
    spec['t'] = Vector((shift, 0.0, bob))
    D['hips'] = E(roll=2.5 * sin(2 * pi * ph), yaw=0.0, pitch=2.0)
    D['spine'] = E(roll=-1.6 * sin(2 * pi * ph), pitch=2.0)
    D['chest'] = E(roll=-0.8 * sin(2 * pi * ph))
    D['head'] = E(roll=-0.6 * sin(2 * pi * ph))
    A.arms_down(spec, swing_l=-2.0, swing_r=-2.0, add=22.0 + 3.0 * sin(2 * pi * ph), elbow=16.0)
    for side, sgn, off in (('L', 1.0, 0.0), ('R', -1.0, 0.5)):
        x, lift = _strafe_foot((ph - off) % 1.0, sgn)
        # flat-footed side steps, toes turned out a little, knees soft and over the toes
        spec['leg_' + side] = {'ankle': V(x, 0.0, rig.ANKLE_L.z + lift), 'foot': qz(sgn * 8.0), 'knee_out': 0.05}
    return spec


# --- Luna -------------------------------------------------------------------------
# (she also uses Cho's cast_quick for Confundo, the side-step and the dodges)

def luna_idle(sk, t):
    """looping idle: dreamy and unhurried, a slow sway of her weight, the head tilted and lifted
    a little, gazing about at nothing in particular; the wand dangles loosely low in her right
    hand, the left hand easy at her side, toes turned in a touch"""
    b = sin(2 * pi * t / 8.0)                       # the sway (one cycle per loop)
    br = sin(2 * pi * t / 4.0)                      # breathing
    look = sin(2 * pi * t / 8.0 + 0.8)              # her gaze drifting from side to side
    spec = base(sk, 0.0, 0.0, arms={'R': (V(-0.125, 0.085, 0.955), V(-0.195, 0.010, 1.115), 1.0, 'chest')})
    arm = spec['arm_R']
    arm['hand_dir'] = V(0.18, 0.35, -0.92)          # the wand hangs, tip down and a little forward
    arm['hand_k'] = 1.0
    D = spec['D']
    D['hips'] = D.get('hips', IDENT) @ E(roll=2.4 * b, yaw=-3.0 + 1.5 * b)
    D['spine'] = E(roll=-1.2 * b, pitch=0.2 + 0.3 * br)
    D['chest'] = E(roll=-0.9 * b, pitch=-1.6 - 0.5 * br, yaw=2.0)
    D['neck'] = E(pitch=-1.5, yaw=3.0 * look)
    D['head'] = E(pitch=-5.0 + 1.5 * sin(2 * pi * t / 8.0 + 2.1) + 0.3 * br, yaw=7.0 * look, roll=5.0 + 1.5 * b)
    D['shoulder_L'] = qy(-0.6 * br)
    D['shoulder_R'] = qy(0.6 * br)
    spec['t'] = spec['t'] + Vector((0.016 * b, 0.0, -0.004))
    spec['leg_L']['ankle'] = spec['leg_L']['ankle'] + V(-0.006, 0.030, 0.0)   # left foot a little forward
    spec['leg_L']['foot'] = qz(-5.0)                # toes turned in a touch
    spec['leg_R']['foot'] = qz(2.0)
    spec['curl'] = 20.0                             # a loose grip
    return spec


def distracted(sk, t):
    """looping: distracted mid-duel. The wand drops to her side, she looks up and follows
    something drifting through the air (a Wrackspurt?) from her right to her left and back,
    her left hand lifted halfway, fingers reaching for it"""
    T = CLIPS['distracted']
    ph = 2 * pi * t / T
    follow = sin(ph)                                # the thing she watches, side to side
    reach = 0.75 + 0.25 * sin(ph + 0.9)
    # (the left hand up and out in front of her, above her eyes: lower and closer it read as a
    # hand to her mouth)
    spec = base(sk, 0.0, 0.0, arms={'R': (V(-0.135, 0.060, 0.930), V(-0.190, 0.000, 1.110), 1.0, 'chest'),
                                    'L': (V(0.230 - 0.06 * follow, 0.400, 1.560), V(0.250, 0.160, 1.300), reach, 'world')})
    spec['arm_L']['hand_dir'] = V(0.10, 0.55, 0.85)  # fingers up and forward, reaching
    arm = spec['arm_R']
    arm['hand_dir'] = V(0.10, 0.10, -1.0)           # the wand hangs, forgotten
    arm['hand_k'] = 1.0
    D = spec['D']
    D['hips'] = D.get('hips', IDENT) @ E(roll=1.2 * follow, yaw=3.0 * follow)
    D['spine'] = E(pitch=-2.0, yaw=4.0 * follow)
    D['chest'] = E(pitch=-4.0, yaw=6.0 * follow)    # leaning back a little to look up
    D['neck'] = E(pitch=-5.0, yaw=8.0 * follow)
    D['head'] = E(pitch=-14.0 + 3.0 * cos(ph), yaw=14.0 * follow, roll=6.0 * follow)
    spec['t'] = spec['t'] + Vector((0.008 * follow, -0.010, -0.002))
    spec['leg_L']['foot'] = qz(-4.0)
    spec['curl'] = 12.0                             # open hands (the wand still held)
    return spec


ILLUSIO_RELEASE = 0.55  # s: her copies appear (viewer: ILLUSIO.release)


def cast_illusio(sk, t):
    """Illusio: the wand draws a circle above her head, then both arms sweep open wide at
    the release (ILLUSIO_RELEASE) as her copies appear, and she gathers back into her stance"""
    T = CLIPS['cast_illusio']
    up = env(t, 0.0, 0.14, 0.50, 0.62)              # the wand raised and circling
    spread = env(t, 0.48, ILLUSIO_RELEASE + 0.04, 0.74, T)
    a = 2 * pi * sstep(0.12, 0.50, t)               # once round the circle
    circ = V(-0.05 + 0.12 * cos(a + pi), 0.10 + 0.08 * sin(a + pi), 1.70 + 0.04 * sin(a))
    # opened wide, down and forward at ~45 deg, a presenting gesture (at shoulder height, or just
    # below it, the straight arms read as a T-pose)
    wide_r, wide_l = V(-0.42, 0.32, 1.02), V(0.42, 0.32, 1.02)
    k_r = max(up, spread)
    wrist_r = _vl(circ, wide_r, spread / max(k_r, 1e-4))
    elbow_r = _vl(V(-0.22, 0.04, 1.47), V(-0.28, 0.14, 1.20), spread / max(k_r, 1e-4))
    spec = base(sk, 0.3 * k_r, k_r, arms={'R': (wrist_r, elbow_r, k_r, 'world'),
                                          'L': (wide_l, V(0.28, 0.14, 1.20), spread, 'world')})
    spec['arm_L']['hand_dir'] = V(0.55, 0.65, 0.30)  # palm open, fingers out
    arm = spec['arm_R']
    arm['hand_dir'] = _vl(V(0.05, 0.25, 1.0), V(-0.6, 0.6, 0.35), spread / max(k_r, 1e-4))
    arm['hand_k'] = k_r
    D = spec['D']
    D['chest'] = E(pitch=-4.0 * up + 2.0 * spread)
    D['head'] = E(pitch=-8.0 * up + 3.0 * spread, roll=4.0 * up)
    spec['t'] = spec['t'] + Vector((0.0, 0.0, 0.012 * up - 0.025 * spread))
    spec['curl'] = lerp(20.0, 10.0, spread)
    return spec


OPPUGNO_RELEASE = 0.42  # s: the birds leave (viewer: OPPUGNO.release)


def cast_oppugno(sk, t):
    """Oppugno: the wand lifted high above her head, tip up, calling the birds (the left hand
    rising open beside it), then flung forward at the target as they leave (OPPUGNO_RELEASE)"""
    T = CLIPS['cast_oppugno']
    g = env(t, 0.0, 0.10, 0.52, T)
    rise = env(t, 0.0, 0.18, 0.30, 0.44)
    fling = env(t, 0.30, OPPUGNO_RELEASE, 0.52, T - 0.05)
    k = max(rise, fling)
    f = fling / max(k, 1e-4)
    wrist = _vl(V(-0.10, 0.10, 1.74), V(-0.05, 0.50, 1.30), f)
    elbow = _vl(V(-0.20, 0.02, 1.48), V(-0.19, 0.25, 1.26), f)
    spec = base(sk, 0.3 * g, g, arms={'R': (wrist, elbow, k, 'world'),
                                      'L': (V(0.20, 0.20, 1.52), V(0.25, 0.08, 1.28), rise, 'world')})
    arm = spec['arm_R']
    arm['hand_dir'] = _vl(V(0.0, 0.15, 1.0), V(0.02, 1.0, -0.05), f)
    arm['hand_k'] = k
    _twist(spec['D'], k, 6.0 + 18.0 * fling, pitch=-6.0 * rise + 4.0 * fling)
    spec['t'] = spec['t'] + Vector((0.0, -0.025 * fling, 0.010 * rise - 0.015 * fling))
    spec['leg_R']['foot'] = spec['leg_R']['foot'] @ qx(10.0 * fling)
    spec['curl'] = lerp(16.0, 26.0, rise)
    return spec


# --- Luna's skip: a light, bouncy skipping gait in place of the run (the run cycle's foot paths
# with a shorter stride on a slower loop, a higher knee lift, two bounces per cycle, upright, arms
# swinging loose and a little out). In place: the game moves her at SKIP_SPEED = the stance travel
# / its duration. (At the run's full stride it read as a lunge.)
SKIP_T = 0.70
SKIP_STRIDE = 0.70                               # of the run's foot travel
SKIP_SPEED = SKIP_STRIDE * (0.200 + 0.380) / (0.35 * SKIP_T)   # 1.66 m/s


def luna_skip(sk, t):
    ph = (t / SKIP_T) % 1.0
    c, s = cos(2 * pi * ph), sin(2 * pi * (ph - 0.04))
    hop = max(0.0, sin(4 * pi * (ph - 0.10)))       # up off the ground twice per cycle
    spec = {'D': {}, 't': Vector((0.012 * s, 0.0, -0.040 + 0.045 * hop - 0.012 * cos(4 * pi * ph)))}
    D = spec['D']
    D['hips'] = E(pitch=2.0, yaw=-7.0 * c, roll=-3.0 * s)
    D['spine'] = E(pitch=1.0, yaw=5.0 * c, roll=2.0 * s)
    D['chest'] = E(pitch=-1.0, yaw=8.0 * c, roll=1.5 * s)
    D['neck'] = E(pitch=-2.0, yaw=-3.0 * c)
    D['head'] = E(pitch=-4.0 + 2.0 * hop, yaw=-3.0 * c, roll=4.0)
    sw_l = -c
    # loose arms: a wide, easy swing a little out from the body, elbows soft
    A.arms_down(spec, swing_l=30.0 * sw_l + 4.0, swing_r=-30.0 * sw_l + 4.0, add=24.0 + 6.0 * hop, elbow=30.0)
    D['hand_L'] = qx(-6.0)
    D['hand_R'] = qx(-6.0)
    for side, sgn, off in (('L', 1.0, 0.0), ('R', -1.0, 0.5)):
        y, z, pitch = A._run_foot(ph + off)
        y *= SKIP_STRIDE
        z = 0.085 + (z - 0.085) * 1.15              # knees up: a higher lift than the run
        spec['leg_' + side] = {'ankle': V(sgn * 0.060, y, z + rig.DZ), 'foot': qz(sgn * 4.0) @ qx(pitch)}
        php = (ph + off) % 1.0
        D['toe_' + side] = qx(-A.clamp(pitch, 0.0, 45.0) * (1 - sstep(0.35, 0.47, php)))
    return spec


QUICK_RELEASE = 0.20    # s: Stupefy leaves the wand tip (viewer: STUPEFY.release)
VENTUS_RELEASE = 0.34   # s: the gust leaves (viewer: VENTUS.release)
EPISKEY_TIME = 1.5      # s: Episkey's cast (viewer: EPISKEY.castTime)
# --- Petrificus Totalus (Malfoid's, when Hermione binds her): she goes rigid and topples
# backwards like a plank (accelerating, like a falling board), lies flat (the clip ends lying;
# the game holds her down), then gets up. Getting up from where she fell leaves her about
# half a metre back: the get-up is authored from a root GETUP_SHIFT m further back, and the game
# moves her root there as it starts (Malfoid.GETUP_SHIFT), so nothing jumps.
PETRIFY_FALL = 0.55       # s: from the bind's snap to the floor
GETUP_SHIFT = 0.55        # m (viewer: GETUP_SHIFT)
LIE_LIFT = 0.11           # m: the hips lifted off the floor by the back's thickness when flat


def _plank(sk, spec, th, lift):
    """the whole body rotated rigidly backwards by th degrees about the heels, lifted `lift` m"""
    R = qx(-th)
    P0 = Vector((0.0, rig.ANKLE_L.y + 0.05, 0.0))
    up = Vector((0.0, 0.0, lift))
    hips = sk.head['hips']
    spec['t'] = (P0 + R @ (hips + spec['t'] - P0)) - hips + up
    spec['D']['hips'] = R @ spec['D'].get('hips', IDENT)
    for side in ('L', 'R'):
        leg = spec['leg_' + side]
        leg['ankle'] = P0 + R @ (leg['ankle'] - P0) + up
        leg['foot'] = R @ leg.get('foot', IDENT)


def _bound(spec, k):
    """rigid: arms snapped to her sides, hands stiff, legs together, chin up a little"""
    D = spec['D']
    for b in ('spine', 'chest', 'neck'):
        D[b] = IDENT.slerp(D.get(b, IDENT), 1.0 - k)
    D['head'] = IDENT.slerp(D.get('head', IDENT), 1.0 - k) @ E(pitch=-5.0 * k)
    A.arms_down(spec, swing_l=-1.5 * (1 - k), swing_r=-1.5 * (1 - k), elbow=lerp(11.0, 3.0, k), add=lerp(17.0, 5.0, k))
    D['hand_L'] = qx(-4.0 * (1 - k))
    D['hand_R'] = qx(-4.0 * (1 - k))
    spec['leg_L']['ankle'] = rig.ANKLE_L + V(-0.035 * k, 0.0, 0.0)
    spec['leg_R']['ankle'] = mirx(rig.ANKLE_L) + V(0.035 * k, 0.0, 0.0)
    spec['curl'] = lerp(16.0, 4.0, k)


def petrified(sk, t):
    """the bind takes her (snap rigid, a sway), she topples backwards like a plank and lands
    flat with a small bounce; ends lying"""
    k = sstep(0.0, 0.08, t)
    u = min(1.0, max(0.0, (t - 0.12) / PETRIFY_FALL))
    th = 90.0 * u * u                                   # slowly, then fast
    land = min(1.0, max(0.0, (t - 0.12 - PETRIFY_FALL) / 0.2))
    th -= 4.0 * sin(pi * land)                          # a small bounce off the floor
    spec = A.idle_pose(0.0)
    _bound(spec, k)
    spec['D']['hips'] = E(pitch=-1.5 * sin(pi * min(1.0, t / 0.12)))   # the sway as she locks up
    _plank(sk, spec, th, LIE_LIFT * sin(radians(th)))
    return spec


def get_up(sk, t):
    """from lying flat (the petrified clip's end, seen from the shifted root): she sits up
    pushing on the floor behind her, draws her feet in under her, rocks forward over them into a
    crouch and stands"""
    T = CLIPS['get_up']
    a = sstep(0.0, 0.40, t)                 # sitting up, feet drawn in
    b = sstep(0.34, 0.74, t)                # rocking forward over the feet
    c = sstep(0.70, T, t)                   # standing up
    hips = sk.head['hips']
    # lying (the petrified clip's last pose, the root GETUP_SHIFT further back)
    lie = A.idle_pose(0.0)
    _bound(lie, 1.0)
    _plank(sk, lie, 90.0, LIE_LIFT)
    back = Vector((0.0, -GETUP_SHIFT, 0.0))             # (+Y is behind her: the body is that much nearer the root)
    lie_h = hips + lie['t'] + back
    stand = A.idle_pose(0.0)
    sit_h = Vector((0.0, lie_h.y - 0.02, 0.17))         # sitting on the floor where she lay
    crouch_h = Vector((0.0, rig.ANKLE_L.y - 0.10, 0.50))  # her weight over her feet
    stand_h = hips + stand['t']
    h = lie_h.lerp(sit_h, a).lerp(crouch_h, b).lerp(stand_h, c)
    spec = A.idle_pose(0.0)
    _bound(spec, 1.0 - max(a, c))
    D = spec['D']
    # the trunk: flat on her back, sitting up (leaning back on her hands), forward over her
    # feet, upright
    pitch = lerp(lerp(lerp(-90.0, -28.0, a), 32.0, b), 0.0, c)
    D['hips'] = qx(pitch)
    D['spine'] = E(pitch=8.0 * a * (1 - c))
    D['head'] = E(pitch=-5.0 * (1 - a) + 10.0 * b * (1 - c))
    spec['t'] = h - hips
    # the feet: from where they lay to planted under her (dragged, a little off the floor)
    for side, rest in (('L', rig.ANKLE_L), ('R', mirx(rig.ANKLE_L))):
        la = lie['leg_' + side]['ankle'] + back
        ank = la.lerp(rest + V(0.03 if side == 'L' else -0.03, 0.0, 0.0), a)
        ank = ank + Vector((0.0, 0.0, 0.05 * sin(pi * a)))
        spec['leg_' + side] = {'ankle': ank, 'foot': lie['leg_' + side]['foot'].slerp(IDENT, a),
                               'knee_out': 0.12 * a * (1 - c)}
    # the arms: pushing on the floor behind her, then forward for balance, then down
    sw = -48.0 * a * (1 - b) + 34.0 * b * (1 - c)
    A.arms_down(spec, swing_l=sw, swing_r=sw, elbow=lerp(3.0, 18.0, a) * (1 - c) + 11.0 * c,
                add=lerp(5.0, 26.0, a) * (1 - c) + 17.0 * c)
    spec['curl'] = lerp(4.0, 16.0, max(a, c))
    return spec


# --- Hermione: composed and alert at rest, the wand held ready; the plates (a long wind-up and
# a conducted barrage) and Accio (a reach for a wand on the floor, a catch)
PLATES_RELEASE = 1.10     # s: the first plate flies (viewer: PLATES_RELEASE)
ACCIO_RELEASE = 0.50      # s: the wand leaves the floor (viewer: ACCIO_RELEASE)


def hermione_idle(sk, t):
    """looping idle: upright and alert, the wand held ready across her front at the waist
    (tip up and forward), the left hand easy at her side, a small shift of weight, a slight
    tilt of the head as she studies her opponent"""
    b = sin(2 * pi * t / 6.0)
    br = sin(2 * pi * t / 4.0 + 0.4)
    spec = base(sk, 0.0, 0.0, arms={'R': (V(-0.095, 0.195, 1.035), V(-0.205, 0.045, 1.115), 1.0, 'chest')})
    arm = spec['arm_R']
    arm['hand_dir'] = V(0.30, 0.70, 0.45)           # tip forward, a little up and in: ready
    arm['hand_k'] = 1.0
    D = spec['D']
    D['hips'] = D.get('hips', IDENT) @ E(roll=1.0 * b, yaw=-3.0)
    D['spine'] = E(roll=-0.5 * b, pitch=0.2 + 0.3 * br)
    D['chest'] = E(roll=-0.4 * b, pitch=-1.5 - 0.5 * br, yaw=3.0)
    D['neck'] = E(pitch=0.4)
    D['head'] = E(pitch=1.5 + 0.3 * br, yaw=-3.0 + 1.5 * sin(2 * pi * t / 6.0 + 1.2), roll=-3.0 + 1.0 * b)
    D['shoulder_L'] = qy(-0.6 * br)
    D['shoulder_R'] = qy(0.6 * br)
    spec['t'] = spec['t'] + Vector((0.008 * b, 0.0, -0.006))
    spec['leg_L']['ankle'] = spec['leg_L']['ankle'] + V(0.015, 0.05, 0.0)    # left foot a little forward
    spec['leg_R']['ankle'] = spec['leg_R']['ankle'] + V(-0.012, -0.02, 0.0)
    spec['leg_L']['foot'] = qz(9.0)
    spec['leg_R']['foot'] = qz(-11.0)
    spec['curl'] = 36.0
    return spec


def cast_plates(sk, t):
    """the plate barrage: both arms rise, the wand high and the left hand open, lifting the
    plates off the tables (the wind-up: PLATES_RELEASE), then the wand conducts them at the
    target, sweep after sweep, the left hand still raised over the ones to come"""
    T = CLIPS['cast_plates']
    rise = env(t, 0.0, 0.28, T - 0.3, T)                      # the arms up (left) / wand high
    lift = sstep(0.3, PLATES_RELEASE, t) * (1 - sstep(PLATES_RELEASE, PLATES_RELEASE + 0.2, t))
    cond = env(t, PLATES_RELEASE - 0.08, PLATES_RELEASE + 0.04, T - 0.32, T - 0.1)
    beat = 0.5 + 0.5 * sin(2 * pi * 2.8 * (t - PLATES_RELEASE))   # the sweeps (~3 a second)
    hi_w, hi_e = V(-0.13, 0.10, 1.70 + 0.04 * lift), V(-0.22, 0.02, 1.46)
    # (topping out at 1.52 m the forearm crossed her face from the front)
    sw_w = _vl(V(-0.13, 0.33, 1.40), V(-0.05, 0.50, 1.24), beat)
    sw_e = V(-0.21, 0.18, 1.30)
    k = max(rise, cond)
    f = cond / max(k, 1e-4)
    wrist = _vl(hi_w, sw_w, f)
    elbow = _vl(hi_e, sw_e, f)
    # the left hand held out to her side a little above the shoulder, open, fingers out (lifting
    # the plates; fingers up, it read as a wave)
    spec = base(sk, 0.3 * k, k, arms={'R': (wrist, elbow, k, 'world'),
                                      'L': (V(0.44, 0.20, 1.30 + 0.05 * lift), V(0.30, 0.05, 1.20), rise, 'world')})
    spec['arm_L']['hand_dir'] = V(0.75, 0.55, 0.25)
    arm = spec['arm_R']
    arm['hand_dir'] = _vl(V(0.0, 0.2, 1.0), _vl(V(0.02, 0.75, 0.35), V(0.0, 1.0, -0.25), beat), f)
    arm['hand_k'] = k
    _twist(spec['D'], k, 6.0 + 12.0 * cond, pitch=-5.0 * rise * (1 - cond) + 3.0 * cond)
    spec['D']['head'] = E(pitch=-6.0 * rise * (1 - cond) + 2.0 * cond)
    spec['t'] = spec['t'] + Vector((0.0, -0.015 * cond, 0.01 * lift))
    spec['curl'] = lerp(16.0, 8.0, rise)
    return spec


def cast_accio(sk, t):
    """Accio: the wand points at the wand on the floor ahead, the left hand reaching open
    towards it; at the release it flies to her and her left hand closes on it and draws it in"""
    T = CLIPS['cast_accio']
    k = env(t, 0.0, 0.18, T - 0.18, T)
    catch = sstep(ACCIO_RELEASE + 0.25, ACCIO_RELEASE + 0.42, t)
    spec = base(sk, 0.3 * k, k, arms={'R': (V(-0.10, 0.42, 1.18), V(-0.21, 0.18, 1.18), k, 'world'),
                                      'L': (_vl(V(0.14, 0.46, 1.10), V(0.12, 0.22, 1.16), catch),
                                            _vl(V(0.22, 0.18, 1.22), V(0.22, 0.04, 1.10), catch), k, 'world')})
    spec['arm_L']['hand_dir'] = _vl(V(0.1, 0.9, 0.1), V(0.3, 0.6, 0.6), catch)
    arm = spec['arm_R']
    arm['hand_dir'] = V(0.02, 1.0, -0.45)            # at the floor ahead
    arm['hand_k'] = k
    _twist(spec['D'], k, 8.0, pitch=4.0 * k)
    spec['t'] = spec['t'] + Vector((0.0, -0.02 * k, -0.01 * k))
    spec['curl'] = lerp(10.0, 50.0, catch)
    return spec


EXTRA_CLIPS = {
    'cho_idle': 8.0,       # looping idle: composed, the wand held low
    'dodge_left': 0.42,    # quick sidestep to her left (the game slides her)
    'dodge_right': 0.42,
    'dodge_back': 0.48,    # quick step back
    'protego': 0.22,       # held: the shield, wand raised
    'cast_quick': 0.45,    # Stupefy flick
    'cast_ventus': 0.70,   # Ventus sweep
    'strafe': STRAFE_T,    # looping side-step to her left (reversed: to her right)
    'susan_idle': 6.0,     # looping idle: planted, the wand ready low
    'episkey': EPISKEY_TIME,   # healing herself (the game heals at the end)
    'luna_idle': 8.0,      # looping idle: dreamy, swaying, gazing about
    'luna_skip': SKIP_T,   # looping skip (in place of the run; the game moves her at SKIP_SPEED)
    'distracted': 3.0,     # looping: gazing up, following something drifting by
    'cast_illusio': 0.95,  # the wand circles overhead, arms sweep open (copies at ILLUSIO_RELEASE)
    'cast_oppugno': 0.75,  # the wand raised high, then flung forward (birds at OPPUGNO_RELEASE)
    'petrified': 0.95,     # Malfoid bound by Petrificus: falls like a plank, ends lying (held)
    'get_up': 1.10,        # ... and back on her feet (from a root GETUP_SHIFT m further back)
    'hermione_idle': 6.0,  # looping idle: alert, the wand held ready
    'cast_plates': 2.75,   # the plates: lifted (to PLATES_RELEASE), then conducted at the target
    'cast_accio': 0.90,    # Accio: a reach for the wand on the floor, a catch
}
from .character import P as _P  # noqa: E402
for _n in _P.get('extra_clips', ()):
    CLIPS[_n] = EXTRA_CLIPS[_n]
if 'cho_idle' in CLIPS:
    LOOPING = LOOPING + ('cho_idle',)
if 'strafe' in CLIPS:
    LOOPING = LOOPING + ('strafe',)
if 'susan_idle' in CLIPS:
    LOOPING = LOOPING + ('susan_idle',)
for _n in ('luna_idle', 'luna_skip', 'distracted', 'hermione_idle'):
    if _n in CLIPS:
        LOOPING = LOOPING + (_n,)
if 'protego' in CLIPS:
    HELD = HELD + ('protego',)


def clips(sk):
    return [(n, CLIPS[n], (lambda f: (lambda t: f(sk, t)))(globals()[n])) for n in CLIPS]
