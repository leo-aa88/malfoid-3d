"""Visible body: neck, legs, hands, plus the hip block under the skirt."""
from math import sin, cos, pi, radians
from mathutils import Vector
from .core import V, Part, Prof, lerp, clamp, smoothstep, ring, chain_w, mix_w
from . import rig

X = Vector((1, 0, 0))
F = V(0, 1, 0)
Z = Vector((0, 0, 1))


def build_neck():
    part = Part()
    pr = Prof([(1.335, 0.052, 0.049), (1.375, 0.044, 0.043), (1.42, 0.0395, 0.039),
               (1.47, 0.0400, 0.040), (1.51, 0.043, 0.043)])
    zs = [1.335 + (1.51 - 1.335) * i / 11 for i in range(12)]
    rows, cents = [], []
    for z in zs:
        rx, rf = pr(z)
        c = V(0, lerp(-0.020, -0.010, (z - 1.335) / 0.175), z)
        rows.append(ring(c, X, F, rx, rf, 22))
        cents.append(c)
    part.grid(rows, 'skin', closed=True, centers=cents)
    part.weight(lambda p: chain_w(p.z, [('chest', 0), ('neck', 1.385), ('head', 1.458)], 0.05))
    return part


LEG_C = Prof([(0.96, 0.075, 0.0), (0.92, 0.072, 0.0), (0.50, 0.068, 0.004), (0.085, 0.064, -0.012),
              (0.03, 0.064, -0.012)])
LEG_R = Prof([
    (0.955, 0.056, 0.058, 0.060), (0.88, 0.0615, 0.062, 0.066), (0.80, 0.0585, 0.060, 0.062),
    (0.68, 0.052, 0.054, 0.053), (0.56, 0.0445, 0.047, 0.044), (0.50, 0.042, 0.046, 0.041),
    (0.455, 0.039, 0.041, 0.041), (0.38, 0.040, 0.037, 0.049), (0.30, 0.037, 0.034, 0.045),
    (0.20, 0.030, 0.030, 0.035), (0.12, 0.0255, 0.028, 0.030), (0.085, 0.026, 0.030, 0.031),
    (0.05, 0.028, 0.034, 0.032)])
SOCK_TOP = 0.478


def leg_w(p):
    w = chain_w(-p.z, [('thigh_L', -9), ('shin_L', -0.50), ('foot_L', -0.085)], [0, 0.085, 0.05])
    h = smoothstep(0.885, 0.955, p.z) * 0.65
    return mix_w(w, {'hips': 1.0}, h)


def leg_rows(zs, grow=0.0, n=20):
    rows, cents = [], []
    for z in zs:
        cx, cf = LEG_C(z)
        rx, rf, rb = LEG_R(z)
        g = grow(z) if callable(grow) else grow
        c = V(cx, cf, z)
        rows.append(ring(c, X, F, rx + g, rf + g, n, e=2.1, rv_neg=rb + g))
        cents.append(c)
    return rows, cents


def build_leg():
    """left leg skin + sock"""
    skin = Part()
    zs = [0.955, 0.92, 0.88, 0.84, 0.80, 0.76, 0.72, 0.68, 0.64, 0.60, 0.57, 0.545, 0.525, 0.505,
          0.485, 0.465, 0.45]
    rows, cents = leg_rows(zs)
    skin.grid(rows, 'skin', closed=True, centers=cents)
    skin.weight(leg_w)
    sock = Part()
    zs = [SOCK_TOP, 0.470, 0.458, 0.452, 0.43, 0.40, 0.37, 0.34, 0.31, 0.28, 0.25, 0.22, 0.19, 0.16,
          0.13, 0.105, 0.085, 0.065, 0.05]
    rows, cents = leg_rows(zs, grow=lambda z: 0.0022 + 0.0016 * smoothstep(0.452, 0.458, z))
    # close the top band onto the leg
    cx, cf = LEG_C(SOCK_TOP + 0.001)
    top_rows, top_c = leg_rows([SOCK_TOP + 0.001], grow=0.0003)
    sock.grid(top_rows + rows, 'sock', closed=True, centers=top_c + cents)
    sock.weight(leg_w)
    return skin, sock


def build_hips():
    part = Part()
    pr = Prof([(1.075, 0.082, 0.066, 0.064), (1.00, 0.098, 0.075, 0.080), (0.94, 0.108, 0.080, 0.092),
               (0.89, 0.105, 0.078, 0.088), (0.86, 0.086, 0.062, 0.072), (0.845, 0.052, 0.036, 0.042)])
    zs = [1.075, 1.04, 1.0, 0.97, 0.94, 0.915, 0.89, 0.872, 0.858, 0.845]
    rows, cents = [], []
    for z in zs:
        rx, rf, rb = pr(z)
        c = V(0, 0, z)
        rows.append(ring(c, X, F, rx, rf, 28, e=2.3, rv_neg=rb))
        cents.append(c)
    part.grid(rows, 'shorts', closed=True, centers=cents, cap_start=V(0, 0, 1.08), cap_end=V(0, 0, 0.836))

    def w(p):
        t = smoothstep(0.94, 0.86, p.z) * 0.5 * smoothstep(0.008, 0.05, abs(p.x))
        side = 'thigh_L' if p.x > 0 else 'thigh_R'
        base = chain_w(p.z, [('hips', 0), ('spine', 1.05)], 0.06)
        return mix_w(base, {side: 1.0}, t)
    part.weight(w)
    return part


def build_hand():
    """left hand in the bind pose (relaxed, fingers gently curled)"""
    part = Part()
    L = rig.ARM_DIR_L.copy()
    W = V(0, 1, 0)
    T = L.cross(W).normalized()         # palm normal, faces the thigh
    o = rig.WRIST_L

    def P(l, w, t):
        return o + L * l + W * w + T * t

    # palm + wrist
    secs = [(-0.034, 0.0200, 0.0165, 0.0), (-0.012, 0.0205, 0.0160, 0.0), (0.004, 0.0225, 0.0145, 0.0),
            (0.020, 0.0290, 0.0130, 0.001), (0.042, 0.0350, 0.0120, 0.001), (0.062, 0.0365, 0.0110, 0.0005),
            (0.076, 0.0350, 0.0092, 0.0)]
    rows, cents = [], []
    for l, hw, ht, sh in secs:
        c = P(l, sh, 0.0)
        rows.append(ring(c, W, T, hw, ht, 18, e=2.7))
        cents.append(c)
    part.grid(rows, 'skin', closed=True, centers=cents, cap_start=P(-0.036, 0, 0), cap_end=P(0.079, 0, 0))

    def finger(base_l, base_w, length, rad, curl0, curl1, spread, base_t=0.0):
        n = 9
        pts, ups = [], []
        p = P(base_l, base_w, base_t)
        seg = length / (n - 1)
        for i in range(n):
            th = radians(curl0 + curl1 * (i / (n - 1)) ** 1.15)
            d = (L * cos(th) + T * sin(th))
            d = (d + W * spread).normalized()
            pts.append(p.copy())
            ups.append((T * cos(th) - L * sin(th)).normalized())
            p = p + d * seg
        rws, cts = [], []
        for i in range(n):
            a = pts[max(i - 1, 0)]
            b = pts[min(i + 1, n - 1)]
            t = (b - a).normalized()
            u = ups[i]
            s = t.cross(u).normalized()
            k = i / (n - 1)
            r = rad * lerp(1.0, 0.80, k) * (1.0 + 0.07 * sin(k * pi * 3) ** 2)
            if i == n - 1:
                r *= 0.72
            rws.append(ring(pts[i], s, u, r, r * 0.92, 8))
            cts.append(pts[i])
        tip = pts[-1] + (pts[-1] - pts[-2]).normalized() * rad * 0.55
        part.grid(rws, 'skin', closed=True, centers=cts, cap_start=pts[0] - (pts[1] - pts[0]) * 0.3,
                  cap_end=tip)

    finger(0.070, 0.0265, 0.064, 0.0080, 14, 46, 0.05)
    finger(0.074, 0.0090, 0.071, 0.0083, 16, 50, 0.0)
    finger(0.072, -0.0085, 0.066, 0.0079, 18, 56, -0.04)
    finger(0.066, -0.0250, 0.052, 0.0069, 20, 62, -0.10)
    # thumb
    n = 7
    base = P(0.018, 0.028, 0.004)
    d0 = (L * 0.62 + W * 0.62 + T * 0.48).normalized()
    pts = []
    p = base
    for i in range(n):
        k = i / (n - 1)
        d = (d0 + L * 0.5 * k + T * 0.25 * k).normalized()
        pts.append(p.copy())
        p = p + d * (0.054 / (n - 1))
    rws, cts = [], []
    for i in range(n):
        a = pts[max(i - 1, 0)]
        b = pts[min(i + 1, n - 1)]
        t = (b - a).normalized()
        u = t.cross(W).normalized()
        s = t.cross(u).normalized()
        r = lerp(0.0105, 0.0078, i / (n - 1)) * (0.75 if i == n - 1 else 1.0)
        rws.append(ring(pts[i], s, u, r, r * 0.9, 8))
        cts.append(pts[i])
    part.grid(rws, 'skin', closed=True, centers=cts, cap_start=pts[0] - d0 * 0.004,
              cap_end=pts[-1] + (pts[-1] - pts[-2]).normalized() * 0.005)
    part.rigid('hand_L')
    part.scale_about(o, 0.90)
    return part
