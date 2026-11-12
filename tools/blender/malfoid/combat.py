"""Combat and movement clips: jump, crouch, high/low punch, high/low kick, block.

Same pose language as anim2 (world-axis deltas + two-bone IK). Every clip
starts and ends in (or, for the held ones, starts in) her plain idle pose so
the viewer can cross-fade in and out of it.

Character space via V(x, fwd, z): +x is her left, fwd is in front of her.
"""
from math import sin, pi
from mathutils import Vector
from . import anim2 as A
from .anim2 import V, E, qx, qz, IDENT, sstep, lerp, mirx, rig

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
    'punch_high': 0.55,
    'punch_low': 0.60,
    'kick_high': 0.90,
    'kick_low': 0.75,
    'jump': 0.95,
    'block': 0.22,    # held: plays once and stays in the last frame while the key is down
    'crouch': 0.30,   # held
}
HELD = ('block', 'crouch')


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

def punch_high(sk, t):
    g = env(t, 0.0, 0.07, 0.40, 0.55)
    s = env(t, 0.06, 0.15, 0.23, 0.42)                     # right cross to head height
    spec = base(sk, g, g, arms={'R': (V(-0.015, 0.430, 1.300), V(-0.200, 0.120, 1.200), s, 'world')})
    _twist(spec['D'], s, 32.0, 4.0)
    spec['t'] = spec['t'] + Vector((0.0, -0.03 * s, 0.0))     # weight onto the front foot
    spec['leg_R']['foot'] = spec['leg_R']['foot'] @ qx(18.0 * s)   # rear heel lifts
    return spec


def punch_low(sk, t):
    g = env(t, 0.0, 0.08, 0.45, 0.60)
    s = env(t, 0.07, 0.17, 0.26, 0.46)                     # right body blow, knees bent
    spec = base(sk, g, g, arms={'R': (V(-0.010, 0.400, 1.000), V(-0.190, 0.120, 1.020), s, 'world')})
    _twist(spec['D'], s, 26.0, 18.0)
    spec['t'] = spec['t'] + Vector((0.0, -0.035 * s, -0.085 * s))
    spec['leg_R']['foot'] = spec['leg_R']['foot'] @ qx(14.0 * s)
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
    # arms swing back while loading, up and forward on take-off
    swing = -30.0 * pre + 28.0 * air
    A.arms_down(spec, swing_l=swing, swing_r=swing, add=17.0 + 8.0 * air, elbow=14.0 + 50.0 * air)
    return spec


def clips(sk):
    return [(n, CLIPS[n], (lambda f: (lambda t: f(sk, t)))(globals()[n])) for n in CLIPS]
