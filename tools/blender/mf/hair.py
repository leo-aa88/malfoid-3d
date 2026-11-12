"""Hair: scalp cap plus individually modelled clumps flowing from a centre
part, behind the ears and down the back, wavy towards the ends."""
import math
import random
from math import sin, cos, pi, radians, degrees
from mathutils import Vector
from .core import V, Part, Prof, lerp, clamp, smoothstep, spow, chain_w
from .head import head_point, HEAD_C, Z_TOP, hx, HEAD_S, HEAD_PIV
from . import rig

Z = Vector((0, 0, 1))
ENV_C = -0.012
#              z     EX     EF     EB
ENV = Prof([
    (1.52, 0.094, 0.050, 0.104),
    (1.44, 0.104, 0.056, 0.112),
    (1.39, 0.124, 0.074, 0.128),
    (1.34, 0.162, 0.104, 0.150),
    (1.28, 0.182, 0.130, 0.166),
    (1.20, 0.190, 0.137, 0.166),
    (1.10, 0.198, 0.141, 0.166),
    (1.00, 0.206, 0.144, 0.174),
    (0.90, 0.212, 0.148, 0.184),
])
# hairline height (design space) by azimuth: centre part with a soft "M"
HAIRLINE = Prof([(0, 1.6340), (10, 1.6400), (28, 1.6410), (45, 1.6260), (60, 1.6030), (72, 1.5800),
                 (82, 1.5660), (88, 1.5740), (100, 1.5720), (112, 1.5200), (125, 1.4880), (180, 1.4790)])
HEAD_CW = hx(HEAD_C)


def zw(zd):
    """design-space head height -> world height"""
    return HEAD_PIV.z + (zd - HEAD_PIV.z) * HEAD_S


def zd(z):
    return HEAD_PIV.z + (z - HEAD_PIV.z) / HEAD_S


def env_pt(a, z, off=0.0):
    ex, ef, eb = ENV(z)
    s, co = sin(a), cos(a)
    return V((ex + off) * spow(s, 2 / 2.1), ENV_C + ((ef if co >= 0 else eb) + off) * spow(co, 2 / 2.1), z)


def hair_env(az_deg, z):
    return env_pt(radians(az_deg), z, 0.004)


def skull_pt(a, z_design, off):
    p = head_point(a, min(z_design, Z_TOP - 0.0005))
    d = (p - HEAD_C).normalized()
    return hx(p + d * off)


def build_cap():
    part = Part()
    nh = 30
    angs = [180.0 * i / nh for i in range(nh + 1)]
    angs = angs + [-a for a in reversed(angs[1:-1])]
    ts = [0.0, 0.05, 0.12, 0.22, 0.35, 0.5, 0.65, 0.8, 0.9, 0.96]
    rows = []
    for t in ts:
        row = []
        for a in angs:
            zh = HAIRLINE(abs(a))
            z = lerp(zh, Z_TOP, t ** 0.9)
            row.append(skull_pt(radians(a), z, lerp(0.0025, 0.0105, smoothstep(0.0, 0.3, t))))
        rows.append(row)
    idx = part.grid(rows, 'hair', closed=True, inside=HEAD_CW, cap_end=hx(V(0, -0.008, Z_TOP + 0.0107)),
                    col=(0.965, 0.965, 0.965))
    # shadowed roots along the hairline (the darker "M" in the reference)
    for r, t in enumerate(ts):
        g = lerp(0.74, 0.965, smoothstep(0.0, 0.30, t))
        for vi in idx[r]:
            part.col[vi] = (g, g * 0.985, g * 0.97)
    part.rigid('head')
    return part


def _strand(part, path, normals, width, thick, col, wfn, taper_root=0.85, tip_from=0.80, nseg=8,
            tscale=None):
    n = len(path)
    rows, cents = [], []
    for i in range(n):
        a = path[max(i - 1, 0)]
        b = path[min(i + 1, n - 1)]
        t = (b - a).normalized()
        nr = normals[i] - t * normals[i].dot(t)
        if nr.length < 1e-6:
            nr = t.orthogonal()
        nr.normalize()
        bn = t.cross(nr).normalized()
        k = i / (n - 1)
        wf = lerp(taper_root, 1.0, smoothstep(0.0, 0.14, k)) * lerp(1.0, 0.05, smoothstep(tip_from, 1.0, k) ** 1.5)
        w = width * wf
        th = thick * (0.30 + 0.70 * wf ** 0.6) * (tscale[i] if tscale else 1.0)
        row = []
        for q in range(nseg):
            ang = 2 * pi * q / nseg
            cn = sin(ang)
            row.append(path[i] + bn * (w * 0.5 * cos(ang)) + nr * (th * 0.5 * (cn if cn > 0 else cn * 0.45)))
        rows.append(row)
        cents.append(path[i])
    v0 = len(part.v)
    part.grid(rows, 'hair', closed=True, centers=cents, cap_start=path[0] - (path[1] - path[0]) * 0.3,
              cap_end=path[-1] + (path[-1] - path[-2]) * 0.4, col=col)
    part.weight(wfn, v0)


def build_hair(seed=7):
    rnd = random.Random(seed)
    part = build_cap()
    chains = rig.HAIR_CHAINS

    def chain_for(az_deg):
        best, bd = None, 1e9
        for name, c in chains.items():
            d = abs((az_deg - c + 180) % 360 - 180)
            if d < bd:
                best, bd = name, d
        return best

    def make(side, a_k, az_f, tau, z_tip, width, layer, shade, wave_amp=0.015, face=False,
             z_k=1.578, thick=0.013, phase=0.0, tip_from=0.80, curtain=0.0):
        """side: +1 left / -1 right. Angles in degrees from the front."""
        ph = phase
        lam = rnd.uniform(0.155, 0.175)
        # --- skull phase: root on the part -> anchor
        if tau < 0.5:
            a_r, z_r = 6.0, lerp(1.6435, 1.6672, (tau / 0.5) ** 0.7)
        else:
            a_r, z_r = 173.0, lerp(1.6672, 1.628, ((tau - 0.5) / 0.5) ** 1.3)
        path, nrm, tsc = [], [], []
        ns = 9
        for i in range(ns):
            t = i / (ns - 1)
            a = lerp(a_r, a_k, t ** 0.85)
            z = lerp(z_r, z_k, t ** 1.25) - 0.030 * curtain * sin(pi * t) ** 1.1
            lift = (0.0100 + layer * 0.25) * lerp(0.6, 1.0, smoothstep(0.0, 0.2, t)) \
                + (0.0012 + 0.0050 * curtain) * sin(pi * min(t * 1.6, 1.0))
            p = skull_pt(radians(a) * side, z, lift)
            path.append(p)
            nrm.append((p - HEAD_CW).normalized())
            tsc.append(0.36)
        # --- hanging phase
        z_start = zw(z_k)
        nh = max(6, int((z_start - z_tip) / 0.020))
        chain = chain_for(az_f * side)
        for i in range(1, nh + 1):
            t = i / nh
            z = lerp(z_start, z_tip, t)
            if face:
                a = lerp(a_k, az_f, t)
                hp = skull_pt(radians(a) * side, max(zd(z), 1.515), 0.0055 + 0.010 * t * t)
                p = Vector((hp.x, hp.y, z))
                out = Vector((p.x, p.y, 0)).normalized()
                p += out * (0.003 * sin(t * 3.0 + ph))
                path.append(p)
                nrm.append(out)
                tsc.append(0.6)
                continue
            a = lerp(a_k, az_f, smoothstep(1.53, 1.30, z))
            ar = radians(a) * side
            hp = skull_pt(ar, max(zd(z), 1.556), 0.0100 + layer * 0.25)
            hp = Vector((hp.x, hp.y, z))
            ep = env_pt(ar, z, 0.006 + layer)
            wgt = smoothstep(1.54, 1.44, z)
            p = hp.lerp(ep, wgt)
            out = Vector((p.x, p.y + ENV_C, 0)).normalized()   # radial from the body axis
            tan = Vector((-out.y, out.x, 0)) * side
            amp = wave_amp * smoothstep(1.42, 1.05, z)
            psi = 2 * pi * (1.42 - z) / lam + ph
            curl = smoothstep(0.80, 1.0, t)
            p = p + tan * (amp * sin(psi)) + out * (amp * 0.35 * cos(psi * 0.9 + 0.6) + 0.020 * curl * curl)
            p.z += 0.010 * curl * curl
            path.append(p)
            nrm.append((out + Z * 0.15).normalized())
            tsc.append(lerp(0.36, 1.0, smoothstep(1.56, 1.40, z)))

        zs = rig.HAIR_Z

        def wfn(p, chain=chain, face=face):
            if face:
                return {'head': 1.0}
            return chain_w(-p.z, [('head', -9), (chain + '_1', -1.452), (chain + '_2', -zs[1]),
                                  (chain + '_3', -zs[2])], [0, 0.05, 0.09, 0.09])
        g = clamp(shade * rnd.uniform(0.965, 1.02))
        _strand(part, path, nrm, width, thick, (g, g, g), wfn, tip_from=tip_from, tscale=tsc)

    def free(side, pts, width, thick, shade, n, tip_from=0.78, wave=0.0):
        """strand through control points (x, fwd, z, in_head_space). In head
        space `fwd` is a lift above the face/skull surface."""
        ctrl = []
        for x, f, z, hs in pts:
            if hs:
                from .head import surf
                ctrl.append(hx(surf(x * side, z, f)))
            else:
                ctrl.append(V(x * side, f, z))
        d = [0.0]
        for i in range(1, len(ctrl)):
            d.append(d[-1] + (ctrl[i] - ctrl[i - 1]).length)
        pr = Prof([(d[i], ctrl[i].x, ctrl[i].y, ctrl[i].z) for i in range(len(ctrl))])
        path, nrm = [], []
        for i in range(n):
            k = i / (n - 1)
            p = Vector(pr(d[-1] * k))
            if p.z > 1.46:
                nr = (p - HEAD_CW).normalized()
            else:
                nr = (Vector((p.x, p.y + ENV_C, 0)).normalized() + Z * 0.1).normalized()
            if wave:
                p = p + Vector((side, 0, 0)) * (wave * sin(k * 9.0 + 0.6) * smoothstep(0.25, 0.6, k))
            path.append(p)
            nrm.append(nr)
        chain = 'hair_front_L' if side > 0 else 'hair_front_R'
        zs = rig.HAIR_Z

        def wfn(p):
            return chain_w(-p.z, [('head', -9), (chain + '_1', -1.452), (chain + '_2', -zs[1]),
                                  (chain + '_3', -zs[2])], [0, 0.05, 0.09, 0.09])
        g = clamp(shade * rnd.uniform(0.97, 1.02))
        _strand(part, path, nrm, width, thick, (g, g, g), wfn, tip_from=tip_from, taper_root=0.7)

    for side in (1, -1):
        base_ph = 0.0 if side > 0 else 1.9
        # main outer layer: back and sides
        nb = 13
        for i in range(nb):
            k = i / (nb - 1)
            make(side, lerp(120, 177, k) + rnd.uniform(-1.5, 1.5), lerp(122, 175, k) + rnd.uniform(-2, 2),
                 lerp(0.10, 0.93, k), lerp(1.075, 0.975, k ** 0.7) + rnd.uniform(-0.018, 0.018),
                 rnd.uniform(0.064, 0.074), 0.0040, 1.0, phase=base_ph + 2.2 * k + rnd.uniform(-0.35, 0.35),
                 curtain=max(0.0, 1.0 - k * 3.2))
        # inner layer filling the gaps
        ni = 9
        for i in range(ni):
            k = (i + 0.5) / ni
            make(side, lerp(123, 174, k), lerp(126, 171, k) + rnd.uniform(-2, 2),
                 lerp(0.22, 0.90, k), lerp(1.11, 1.02, k) + rnd.uniform(-0.015, 0.015),
                 rnd.uniform(0.066, 0.076), -0.0020, 0.90, wave_amp=0.011,
                 phase=base_ph + 2.2 * k + 0.5 + rnd.uniform(-0.3, 0.3))
        # front locks: tucked behind the ear, falling over the collarbone to the chest
        make(side, 121, 50, 0.045, 1.110 + rnd.uniform(-0.01, 0.01), 0.060, 0.0045, 1.0, wave_amp=0.013,
             phase=base_ph + 0.3)
        make(side, 123, 37, 0.085, 1.165 + rnd.uniform(-0.01, 0.01), 0.050, 0.0065, 0.97, wave_amp=0.011,
             phase=base_ph + 0.9)
        make(side, 125, 64, 0.11, 1.075, 0.058, 0.0020, 0.93, wave_amp=0.013, phase=base_ph + 0.0)
        # curtain strands sweeping from the part over the forehead corner
        make(side, 122, 49, 0.02, 1.125, 0.050, 0.0075, 1.02, wave_amp=0.012, phase=base_ph + 0.5,
             curtain=1.15)
        make(side, 126, 58, 0.06, 1.090, 0.046, 0.0060, 0.99, wave_amp=0.012, phase=base_ph + 0.2,
             curtain=0.85)
        # face-framing locks: an inverted-V opening over the forehead, then
        # down the cheek edge (inside the ear, so the hoops stay visible),
        # over the collarbone to the chest
        free(side, [(0.004, 0.006, 1.6500, 1), (0.020, 0.010, 1.6340, 1), (0.036, 0.011, 1.6160, 1),
                    (0.052, 0.010, 1.5960, 1), (0.0640, 0.008, 1.5740, 1), (0.0690, 0.006, 1.5500, 1),
                    (0.0665, 0.006, 1.5240, 1), (0.0610, 0.007, 1.4980, 1), (0.0570, 0.009, 1.4740, 1),
                    (0.064, 0.058, 1.440, 0), (0.080, 0.086, 1.385, 0),
                    (0.094, 0.110, 1.320, 0), (0.098, 0.124, 1.250, 0), (0.090, 0.130, 1.180, 0)],
             0.019, 0.0070, 1.0, 40, wave=0.004)
        free(side, [(0.005, 0.004, 1.6480, 1), (0.030, 0.007, 1.6400, 1), (0.050, 0.007, 1.6220, 1),
                    (0.066, 0.006, 1.6000, 1), (0.0745, 0.004, 1.5800, 1)],
             0.030, 0.0060, 0.97, 16, tip_from=0.55)
        # a few thinner strands on top for silhouette
        for i in range(3):
            k = rnd.uniform(0.15, 0.9)
            make(side, lerp(118, 170, k), lerp(124, 168, k), lerp(0.2, 0.85, k), rnd.uniform(1.0, 1.08),
                 0.024, 0.0080, 1.03, wave_amp=0.019, thick=0.008, phase=base_ph + 2.2 * k + 1.2)
    return part
