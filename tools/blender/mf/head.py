"""Head: skull/face surface with a real mouth opening, mouth interior, teeth,
eyes, lashes, brows, ears and hoop earrings. Shape keys: blink, annoyed,
blink_annoyed, pout."""
import math
from math import sin, cos, pi, exp, radians
from mathutils import Vector
from .core import V, Part, Prof, lerp, clamp, smoothstep, spow, ring

Z_CHIN = 1.452
Z_TOP = 1.668
# Feature heights follow facial_atlas.png's key ratios, measured from the
# hairline (0.00) to the chin (1.00): brow 0.32, eye 0.40, nose base 0.62,
# mouth 0.72. Face width is about 0.78 of that height.
Z_HAIRLINE = 1.638
FACE_H = Z_HAIRLINE - Z_CHIN
# (the atlas drawing places features a little lower than its ratio table;
#  these sit between the two)
Z_EYE = Z_HAIRLINE - 0.45 * FACE_H
Z_NOSE = Z_HAIRLINE - 0.63 * FACE_H
Z_MOUTH = round(Z_HAIRLINE - 0.76 * FACE_H, 4)
HEAD_C = V(0.0, -0.008, 1.575)
# The head is authored at design size and then enlarged about HEAD_PIV to get
# the reference sheet's anime proportions.
HEAD_S = 1.07
HEAD_SV = Vector((HEAD_S * 1.045, HEAD_S, HEAD_S))     # a touch wider than tall
HEAD_PIV = V(0.0, -0.010, 1.497)


def hx(p):
    d = p - HEAD_PIV
    return HEAD_PIV + Vector((d.x * HEAD_SV.x, d.y * HEAD_SV.y, d.z * HEAD_SV.z))


#   z       centre  front    back    half-w  exp-front exp-back
_KEYS = [
    (1.4520, 0.0600, 0.0600, -0.0600, 0.0000, 1.70, 2.0),
    (1.4535, 0.0550, 0.0665, -0.0440, 0.0066, 1.70, 2.0),
    (1.4560, 0.0490, 0.0702, -0.0340, 0.0114, 1.70, 2.0),
    (1.4600, 0.0400, 0.0726, -0.0200, 0.0174, 1.70, 2.0),
    (1.4660, 0.0280, 0.0742, -0.0020, 0.0250, 1.72, 2.0),
    (1.4750, 0.0140, 0.0750, 0.0200, 0.0345, 1.78, 2.0),
    (1.4850, 0.0050, 0.0756, 0.0400, 0.0430, 1.88, 2.0),
    (1.4966, 0.0000, 0.0780, 0.0580, 0.0510, 2.02, 2.05),
    (1.5040, -0.0015, 0.0800, 0.0670, 0.0556, 2.15, 2.1),
    (1.5120, -0.0022, 0.0800, 0.0750, 0.0592, 2.40, 2.1),
    (1.5220, -0.0030, 0.0798, 0.0830, 0.0636, 2.75, 2.15),
    (1.5400, -0.0040, 0.0796, 0.0920, 0.0692, 3.30, 2.2),
    (1.5560, -0.0048, 0.0798, 0.0970, 0.0722, 3.60, 2.2),
    (1.5750, -0.0056, 0.0828, 0.0998, 0.0740, 3.35, 2.2),
    (1.6050, -0.0065, 0.0862, 0.1000, 0.0750, 2.90, 2.2),
    (1.6300, -0.0075, 0.0822, 0.0950, 0.0705, 2.50, 2.15),
    (1.6500, -0.0080, 0.0660, 0.0800, 0.0560, 2.15, 2.1),
    (1.6620, -0.0080, 0.0400, 0.0540, 0.0340, 2.00, 2.0),
    (1.6680, -0.0080, -0.0080, 0.0080, 0.0000, 2.00, 2.0),
]
_P = Prof(_KEYS)
NOSE_TIP = Z_NOSE + 0.0050


def _feature(x, z):
    d = 0.0
    lo, hi = Z_NOSE - 0.0030, Z_EYE + 0.0020
    if lo < z < hi:                    # small pointed nose
        if z >= NOSE_TIP:
            t = (hi - z) / (hi - NOSE_TIP)
            h = 0.0098 * t ** 1.8
        else:
            t = (z - lo) / (NOSE_TIP - lo)
            h = 0.0098 * smoothstep(0.0, 1.0, t)
        sx = lerp(0.0040, 0.0064, t)
        d += h * exp(-(x / sx) ** 2)
    # eye socket depression
    d -= 0.0026 * exp(-((abs(x) - 0.042) / 0.024) ** 2 - ((z - Z_EYE) / 0.013) ** 2)
    # soft muzzle
    d += 0.0012 * exp(-(x / 0.020) ** 2 - ((z - (Z_MOUTH + 0.002)) / 0.011) ** 2)
    return d


def _ring_xy(a, z):
    c, f, b, w, ef, eb = _P(z)
    s, co = sin(a), cos(a)
    if co >= 0:
        return w * spow(s, 2.0 / ef), c + (f - c) * spow(co, 2.0 / ef)
    return w * spow(s, 2.0 / eb), c + (c + b) * spow(co, 2.0 / eb)


def head_point(a, z):
    z = clamp(z, Z_CHIN, Z_TOP)
    x, y = _ring_xy(a, z)
    fr = smoothstep(0.25, 0.65, cos(a))
    if fr > 0:
        y += _feature(x, z) * fr
    return V(x, y, z)


def face_fwd(x, z):
    """forward coordinate of the face surface at (x, z)"""
    ax = abs(x)
    lo, hi = 0.0, pi / 2
    for _ in range(26):
        mid = (lo + hi) / 2
        if _ring_xy(mid, z)[0] < ax:
            lo = mid
        else:
            hi = mid
    a = (lo + hi) / 2
    _, y = _ring_xy(a, z)
    return y + _feature(x, z) * smoothstep(0.25, 0.65, cos(a))


def surf(x, z, lift=0.0):
    """point on the face at (x, z), lifted along the surface normal"""
    e = 0.0012
    f0 = face_fwd(x, z)
    dfx = (face_fwd(x + e, z) - face_fwd(x - e, z)) / (2 * e)
    dfz = (face_fwd(x, z + e) - face_fwd(x, z - e)) / (2 * e)
    n = Vector((-dfx, -1.0, -dfz)).normalized()   # blender coords, front = -y
    return V(x, f0, z) + n * lift


def column_angles(nh=44):
    """column azimuths, dense at the face. index 0 = front centre"""
    half = [pi * (0.45 * u + 0.55 * u ** 2.2) for u in [i / nh for i in range(nh + 1)]]
    return half + [2 * pi - a for a in reversed(half[1:-1])]


def row_heights():
    below = [0.0431, 0.0406, 0.0371, 0.0331, 0.0286, 0.0241, 0.0196, 0.0151, 0.0111, 0.0076,
             0.0046, 0.0022]
    zs = [round(Z_MOUTH - d, 4) for d in below] + [Z_MOUTH]
    zs += [round(Z_MOUTH + d, 4) for d in (0.0022, 0.0046, 0.0074, 0.0104)]
    z = zs[-1] + 0.003
    while z < 1.5965:
        zs.append(round(z, 4))
        z += 0.003
    zs += [1.602, 1.609, 1.617, 1.625, 1.633, 1.641, 1.648, 1.654, 1.659, 1.663, 1.666]
    return zs


# -- mouth ------------------------------------------------------------------
MOUTH_K = 9          # columns each side of the centre that form the opening
_FALL = [1.0, 0.78, 0.56, 0.36, 0.2, 0.08]


FANG_U = 0.50      # where the canine peeks out of the smirk


def _mouth_curves(u, expr):
    """(centre z offset, upper rim offset, lower rim offset, fwd push)"""
    uu = clamp(abs(u), 0.0, 1.0)
    if expr == 'neutral':
        # smug closed smirk: her left corner curls up and parts just enough
        # to show the tip of one canine
        zc = 0.0008 * u * u + 0.0036 * max(0.0, u) ** 1.6 - 0.0004
        thin = 0.0011 * (1 - uu * uu) ** 0.6
        fang = 0.0025 * exp(-((u - FANG_U) / 0.20) ** 2) * (1 - uu ** 6)
        return zc, 0.35 * thin, -(0.65 * thin + fang), 0.0
    # pout: small closed mouth, corners down, pushed slightly forward
    zc = 0.0010 - 0.0032 * u * u - 0.0005 * u
    gap = 0.0011 * (1 - uu * uu) ** 0.6
    return zc, gap * 0.5, -gap * 0.5, 0.0015


_SQUEEZE = {'neutral': 0.0, 'pout': 0.50}


def build_head(side_sign=1):
    part = Part()
    A = column_angles()
    Z = row_heights()
    n = len(A)
    im = Z.index(Z_MOUTH)
    # mouth half width in x from the neutral corner column
    hw = _ring_xy(A[MOUTH_K], Z_MOUTH)[0]

    def vert_pos(i, j, expr, lower=False):
        a = A[j]
        z = Z[i]
        x0 = _ring_xy(a, Z_MOUTH)[0]
        u = x0 / hw
        di = i - im
        front = cos(a) > 0.3
        if not front or abs(di) >= len(_FALL) and not (di == 0):
            return head_point(a, z)
        g = _FALL[abs(di)] if abs(di) < len(_FALL) else 0.0
        zc, up, lo, push = _mouth_curves(u, expr)
        lat = 1.0 if abs(u) <= 1.0 else exp(-((abs(u) - 1.0) / 0.55) ** 2)
        if abs(u) > 1.0:
            zc_e, _, _, _ = _mouth_curves(math.copysign(1.0, u), expr)
            zc = zc_e
        dz = zc * lat * g
        if di > 0 or (di == 0 and not lower):
            dz += up * g
        else:
            dz += lo * g
        sq = _SQUEEZE[expr] * g * (1.0 if abs(u) <= 1.0 else smoothstep(2.3, 1.0, abs(u)))
        a2 = a if a <= pi else a - 2 * pi
        a2 *= (1.0 - sq)
        p = head_point(a2, z + dz)
        if push:
            p += V(0, push * g * exp(-(u / 1.4) ** 2), 0)
        return p

    rows = [[vert_pos(i, j, 'neutral') for j in range(n)] for i in range(len(Z))]
    centers = [V(0, _P(z)[0], z) for z in Z]
    idx = part.grid(rows, 'skin', closed=True, centers=centers,
                    cap_start=V(0, 0.058, Z_CHIN), cap_end=V(0, -0.008, Z_TOP))
    # --- cut the mouth: duplicate the rim for the lower lip
    cols = list(range(-MOUTH_K, MOUTH_K + 1))
    upper = {k: idx[im][k % n] for k in cols}
    lower = {}
    for k in cols:
        if abs(k) == MOUTH_K:
            lower[k] = upper[k]
        else:
            lower[k] = part.vert(vert_pos(im, k % n, 'neutral', lower=True))
    remap = {upper[k]: lower[k] for k in cols}
    below = set(idx[im - 1])
    for fi, f in enumerate(part.f):
        if any(i in below for i in f) and any(i in remap for i in f):
            part.f[fi] = tuple(remap.get(i, i) for i in f)
    # --- pout shape key for the skin
    for i in range(max(0, im - 6), min(len(Z), im + 7)):
        for j in range(n):
            if cos(A[j]) <= 0.3:
                continue
            d = vert_pos(i, j, 'pout') - vert_pos(i, j, 'neutral')
            if d.length > 1e-6:
                part.shape('pout', idx[i][j], d)
    for k in cols:
        if abs(k) != MOUTH_K:
            d = vert_pos(im, k % n, 'pout', lower=True) - vert_pos(im, k % n, 'neutral', lower=True)
            part.shape('pout', lower[k], d)
    part.rigid('head')

    # --- mouth interior (separate verts so the lip edge stays crisp)
    def rim_loop(expr):
        up = [vert_pos(im, k % n, expr) for k in cols]
        lo = [vert_pos(im, k % n, expr, lower=True) for k in reversed(cols[1:-1])]
        return up + lo

    def bag_rings(expr):
        loop = rim_loop(expr)
        c = sum(loop, Vector((0, 0, 0))) / len(loop)
        rings = []
        for depth, sc in ((0.0, 1.0), (0.0035, 1.25), (0.0100, 1.45), (0.0160, 0.9)):
            rings.append([Vector((p.x, p.y + depth, c.z + (p.z - c.z) * sc)) for p in loop])
        return rings, c + Vector((0, 0.0185, 0))

    v0 = len(part.v)
    f0 = len(part.f)
    rn, capn = bag_rings('neutral')
    rp, capp = bag_rings('pout')
    bidx = part.grid(rn, 'mouth', closed=True, flip=False, cap_end=capn)
    # make the bag face its own inside
    cb = sum(rn[2], Vector((0, 0, 0))) / len(rn[2])
    score = sum(part._fnormal(fi).dot(part._fcenter(fi) - cb) for fi in range(f0, len(part.f)))
    if score > 0:
        part.flip_faces(f0)
    for r in range(len(rn)):
        for q in range(len(rn[r])):
            part.shape('pout', bidx[r][q], rp[r][q] - rn[r][q])
    part.shape('pout', len(part.v) - 1, capp - capn)
    part.rigid('head', v0)

    # --- upper teeth: hidden behind the lip except for one slightly
    #     prominent, softly rounded canine (no vampire fangs)
    v0 = len(part.v)
    nt = 41
    trow = [[], [], [], []]
    prow = [[], [], [], []]
    for q in range(nt):
        u = lerp(-0.84, 0.84, q / (nt - 1))
        x = u * hw
        zc, up, lo, _ = _mouth_curves(u, 'neutral')
        ztop = Z_MOUTH + zc + up + 0.0012
        length = 0.0007 + 0.0037 * exp(-((u - FANG_U) / 0.085) ** 2)
        zc_p, up_p, _, _ = _mouth_curves(u * 0.5, 'pout')
        for r, t in enumerate((0.0, 0.4, 0.8, 1.0)):
            z = ztop - length * t
            setback = 0.0016 + 0.0005 * t + (0.0008 if r == 3 else 0.0)
            trow[r].append(V(x, face_fwd(x, z) - setback, z))
            prow[r].append(V(x * 0.5, face_fwd(x * 0.5, Z_MOUTH + 0.004) - 0.0065,
                             Z_MOUTH + zc_p + 0.0035 - 0.0004 * t))
    tidx = part.grid(trow, 'teeth', outward=V(0, 1, 0))
    for r in range(4):
        for q in range(nt):
            part.shape('pout', tidx[r][q], prow[r][q] - trow[r][q])
    part.rigid('head', v0)
    # --- nose: a tiny tick, as drawn in the atlas
    v0 = len(part.v)
    rows = [[surf(-0.00032 * k, z, 0.0004), surf(0.00032 * k, z, 0.0004)]
            for z, k in ((NOSE_TIP + 0.0005, 0.3), (NOSE_TIP + 0.0018, 1.0), (NOSE_TIP + 0.0034, 1.0),
                         (NOSE_TIP + 0.0046, 0.3))]
    part.grid(rows, 'skin_line', outward=V(0, 1, 0))
    part.rigid('head', v0)
    return part


# -- eyes -------------------------------------------------------------------
EYE_HW = 0.0245                 # wide eyes reaching almost to the face edge
EYE_XC = 0.0420
EYE_SLANT = 0.0043              # outer corner sits higher (sharp, tsurime)
EYE_HU = 0.0072
EYE_HL = 0.0064


def _eye_curves(ex, mode='open'):
    e = clamp(ex, -1.0, 1.0)
    z0 = Z_EYE + EYE_SLANT * e
    # nearly straight, heavy upper lid; soft lower lid
    zu = z0 + EYE_HU * (1 - abs(e) ** 2.6) ** 0.55 * (1 + 0.12 * e)
    zl = z0 - EYE_HL * (1 - e * e) ** 0.85 * (1 - 0.12 * e)
    if mode == 'annoyed':
        zu = min(zu, z0 + EYE_HU * (0.46 + 0.26 * e))
        zu = max(zu, zl)
    elif mode == 'closed':
        zu = zl
    return z0, zu, zl


def build_eye(s):
    """s = +1 left eye, -1 right eye"""
    part = Part()
    WHITE = (0.965, 0.955, 0.95)
    SHADE = (0.80, 0.79, 0.86)

    def P(ex, z, lift):
        return surf(s * (EYE_XC + ex * EYE_HW), z, lift)

    def add_keys(vi, ex, zrel_fn, lift, base):
        """zrel_fn(mode) -> z for the given lid mode"""
        za = zrel_fn('annoyed')
        zc = zrel_fn('closed')
        pa = P(ex, za, lift)
        pc = P(ex, zc, lift)
        if (pa - base).length > 1e-7:
            part.shape('annoyed', vi, pa - base)
        part.shape('blink', vi, pc - base)
        part.shape('blink_annoyed', vi, pc - pa)

    # eye white
    nx, nz = 25, 8
    rows = []
    meta = []
    for r in range(nz + 1):
        t = r / nz
        row = []
        for q in range(nx):
            ex = lerp(-1.0, 1.0, q / (nx - 1))
            _, zu, zl = _eye_curves(ex)
            row.append(P(ex, lerp(zl, zu, t), 0.0003))
            meta.append((ex, t))
        rows.append(row)
    idx = part.grid(rows, 'eye_white', outward=V(0, 1, 0))
    k = 0
    for r in range(nz + 1):
        for q in range(nx):
            ex, t = meta[k]
            k += 1
            vi = idx[r][q]
            sh = smoothstep(0.50, 1.0, t)
            part.col[vi] = tuple(lerp(WHITE[c], SHADE[c], sh) for c in range(3))

            def zf(mode, ex=ex, t=t):
                _, zu, zl = _eye_curves(ex)
                _, zm, _ = _eye_curves(ex, mode)
                return min(lerp(zl, zu, t), zm)
            add_keys(vi, ex, zf, 0.0003, part.v[vi])

    # iris + pupil (polar grid clipped by the lids)
    icx, icz, ir = -0.05, 0.0006, 0.0112

    def disc(cx_m, cz_m, rx, rz, rings, nseg, mat, lift, colfn):
        """cx_m: metres offset from eye centre in x (already signed for world)"""
        def place(dx, dz, mode):
            xw = s * EYE_XC + cx_m + dx
            ex = (s * xw - EYE_XC) / EYE_HW
            exc = clamp(ex, -0.985, 0.985)
            z0, zu, zl = _eye_curves(exc, mode)
            z = clamp(Z_EYE + cz_m + dz, zl + 0.0002, max(zu - 0.0002, zl + 0.0002))
            xw2 = s * (EYE_XC + exc * EYE_HW)
            return surf(xw2, z, lift)
        cidx = part.vert(place(0, 0, 'open'), col=colfn(0.0, 0.0, rings[0][1]))
        part.shape('annoyed', cidx, place(0, 0, 'annoyed') - part.v[cidx])
        part.shape('blink', cidx, place(0, 0, 'closed') - part.v[cidx])
        part.shape('blink_annoyed', cidx, place(0, 0, 'closed') - place(0, 0, 'annoyed'))
        prev = None
        f0 = len(part.f)
        for (rf, tag) in rings:
            cur = []
            for q in range(nseg):
                a = 2 * pi * q / nseg
                dx, dz = rx * rf * cos(a), rz * rf * sin(a)
                base = place(dx, dz, 'open')
                vi = part.vert(base, col=colfn(rf, sin(a), tag))
                pa = place(dx, dz, 'annoyed')
                pc = place(dx, dz, 'closed')
                if (pa - base).length > 1e-7:
                    part.shape('annoyed', vi, pa - base)
                part.shape('blink', vi, pc - base)
                part.shape('blink_annoyed', vi, pc - pa)
                cur.append(vi)
            for q in range(nseg):
                q2 = (q + 1) % nseg
                if prev is None:
                    part.face((cidx, cur[q], cur[q2]), mat)
                else:
                    part.face((prev[q], cur[q], cur[q2], prev[q2]), mat)
            prev = cur
        part.orient(f0, outward=V(0, 1, 0))

    PUPIL = (0.03, 0.06, 0.045)
    G_IN = (0.27, 0.66, 0.44)
    G_MID = (0.18, 0.44, 0.31)
    G_RIM = (0.06, 0.19, 0.13)

    def iris_col(rf, sa, tag):
        if tag == 'p':
            return PUPIL
        base = G_IN if tag == 'i' else (G_MID if tag == 'm' else G_RIM)
        k = lerp(1.12, 0.60, smoothstep(-0.6, 0.9, sa * rf))   # darker towards the top
        return tuple(clamp(c * k) for c in base)

    disc(s * icx * EYE_HW, icz, ir, ir,
         [(0.20, 'p'), (0.36, 'p'), (0.37, 'i'), (0.58, 'i'), (0.80, 'm'), (0.90, 'r'), (1.0, 'r')],
         32, 'eye_iris', 0.0006, iris_col)
    # highlights: same screen side for both eyes
    hlx = s * icx * EYE_HW - 0.0046
    disc(hlx, icz + 0.0026, 0.0023, 0.0025, [(0.55, 0), (1.0, 0)], 14, 'eye_highlight', 0.0009,
         lambda rf, sa, tag: (1, 1, 1))
    disc(s * icx * EYE_HW + 0.0052, icz - 0.0036, 0.0012, 0.0012, [(1.0, 0)], 10, 'eye_highlight',
         0.0009, lambda rf, sa, tag: (1, 1, 1))

    # upper lash: thick, nearly straight line with a long outer wing and a
    # pointed inner corner
    nl = 40
    rows = [[], [], []]
    info = []
    for q in range(nl):
        ex = lerp(-1.16, 1.42, q / (nl - 1))
        info.append(ex)

    def lash_pts(ex, mode):
        e = clamp(ex, -1.0, 1.0)
        z0, zu, zl = _eye_curves(e, mode)
        th = lerp(0.0022, 0.0042, ((e + 1) / 2) ** 0.8)
        if ex < -1.0:
            w = (-1.0 - ex) / 0.16
            mid = zu + th * 0.35 * (1 - w) - (-1.0 - ex) * EYE_HW * 0.55
            half = lerp(th * 0.45, 0.00005, w ** 0.7)
            bot, top = mid - half, mid + half
        elif ex <= 1.0:
            bot, top = zu - 0.0006, zu + th
        else:
            w = (ex - 1.0) / 0.42
            mid = zu + th * 0.5 + (ex - 1.0) * EYE_HW * 0.50
            half = lerp(th * 0.5 + 0.0003, 0.00005, w ** 0.75)
            bot, top = mid - half, mid + half
        return [P(ex, bot, 0.0012), P(ex, (bot + top) / 2, 0.0013), P(ex, top, 0.0012)]

    for ex in info:
        pts = lash_pts(ex, 'open')
        for r in range(3):
            rows[r].append(pts[r])
    lidx = part.grid(rows, 'lash', outward=V(0, 1, 0))
    for q, ex in enumerate(info):
        pa = lash_pts(ex, 'annoyed')
        pc = lash_pts(ex, 'closed')
        for r in range(3):
            vi = lidx[r][q]
            base = part.v[vi]
            if (pa[r] - base).length > 1e-7:
                part.shape('annoyed', vi, pa[r] - base)
            part.shape('blink', vi, pc[r] - base)
            part.shape('blink_annoyed', vi, pc[r] - pa[r])

    # lower lash line (outer half, thickening into the corner)
    rows = [[], []]
    for q in range(22):
        ex = lerp(-0.15, 1.0, q / 21)
        _, zu, zl = _eye_curves(ex)
        th = lerp(0.00030, 0.0011, smoothstep(0.1, 0.95, ex)) * clamp((ex + 0.15) / 0.2)
        rows[0].append(P(ex, zl - th, 0.0011))
        rows[1].append(P(ex, zl + 0.0003, 0.0011))
    part.grid(rows, 'lash', outward=V(0, 1, 0))

    # eyelid crease
    rows = [[], []]
    cinfo = []
    for q in range(20):
        ex = lerp(-0.55, 0.90, q / 19)
        cinfo.append(ex)

    def crease_pts(ex, mode):
        _, zu, zl = _eye_curves(ex)
        _, zm, _ = _eye_curves(ex, mode)
        drop = (zu - zm) * 0.55
        tap = clamp(min(ex + 0.55, 0.90 - ex) / 0.25)
        zc = zu + 0.0066 - drop
        return [P(ex, zc - 0.00035 * tap, 0.0004), P(ex, zc + 0.00035 * tap, 0.0004)]

    for ex in cinfo:
        pts = crease_pts(ex, 'open')
        rows[0].append(pts[0])
        rows[1].append(pts[1])
    cidx = part.grid(rows, 'skin_line', outward=V(0, 1, 0))
    for q, ex in enumerate(cinfo):
        pa = crease_pts(ex, 'annoyed')
        pc = crease_pts(ex, 'closed')
        for r in range(2):
            vi = cidx[r][q]
            base = part.v[vi]
            if (pa[r] - base).length > 1e-7:
                part.shape('annoyed', vi, pa[r] - base)
            part.shape('blink', vi, pc[r] - base)
            part.shape('blink_annoyed', vi, pc[r] - pa[r])

    # eyebrow: thin, long, angled down towards the nose
    nb = 24
    rows = [[], [], []]
    arows = [[], [], []]
    for q in range(nb):
        b = q / (nb - 1)
        x = lerp(0.0130, 0.0690, b)
        z = Z_EYE + 0.0112 + 0.0150 * b - 0.0030 * b * b
        th = lerp(0.0030, 0.0007, b ** 1.1) * clamp(b / 0.05 + 0.4)
        xa = x - 0.0016 * (1 - b)
        za = z - 0.0046 * (1 - b) ** 1.3 + 0.0014 * b
        for r, o in enumerate((-0.5, 0.0, 0.5)):
            rows[r].append(surf(s * x, z + th * o, 0.0007))
            arows[r].append(surf(s * xa, za + th * o, 0.0007))
    bidx = part.grid(rows, 'brow', outward=V(0, 1, 0))
    for r in range(3):
        for q in range(nb):
            part.shape('annoyed', bidx[r][q], arows[r][q] - rows[r][q])
    part.rigid('head')
    return part


# -- ears & earrings --------------------------------------------------------

def build_ear(s):
    part = Part()
    c = V(0.0712, -0.0160, 1.5400)
    fl = radians(30.0)
    e_u = V(sin(fl), -cos(fl), 0.0).normalized()          # towards the back, flaring out
    e_v = V(0.0, -0.14, 1.0).normalized()                 # up, tilted back
    e_n = e_u.cross(e_v)
    if e_n.x < 0:
        e_n = -e_n
    e_n.normalize()

    def outline(phi):
        a, b = 0.0238, 0.0124
        r = 1.0 / math.sqrt((cos(phi) / a) ** 2 + (sin(phi) / b) ** 2)
        lobe = smoothstep(-0.2, -1.0, cos(phi))
        return r * (1 - 0.10 * lobe)

    nseg = 24

    def pt(rho, q, back=False):
        phi = 2 * pi * q / nseg
        r = outline(phi) * rho
        u, v = r * sin(phi), r * cos(phi)
        rim_mask = 0.35 + 0.65 * smoothstep(-0.75, 0.2, cos(phi)) * smoothstep(-1.0, -0.2, -sin(phi) * 0.0 + 0.5)
        front_fade = smoothstep(-1.0, -0.3, sin(phi))      # fade ridge where ear joins the head
        if back:
            h = -0.0045 * math.sqrt(max(0.0, 1 - rho * rho)) - 0.0008
        else:
            h = (0.0040 * exp(-((rho - 0.84) / 0.13) ** 2) * rim_mask * (0.4 + 0.6 * front_fade)
                 - 0.0032 * exp(-((rho - 0.32) / 0.30) ** 2) + 0.0008)
            if rho >= 0.999:
                h = 0.0
        return c + e_u * (u + 0.004) + e_v * v + e_n * h

    front_rho = [0.16, 0.34, 0.52, 0.68, 0.80, 0.90, 0.96, 1.0]
    rows = [[pt(rho, q) for q in range(nseg)] for rho in front_rho]
    rows += [[pt(rho, q, True) for q in range(nseg)] for rho in (0.92, 0.70, 0.40)]
    cen = c + e_u * 0.004
    part.grid(rows, 'skin', closed=True, cap_start=cen + e_n * (-0.0024), cap_end=cen + e_n * (-0.0055),
              centers=[cen - e_n * 0.002] * len(rows))
    lobe = c + e_u * 0.004 + e_v * (-outline(pi) * 0.93)
    # hoop earring through the lobe
    R, r = 0.0098, 0.0021
    axis = V(0.60, 0.80, 0.0).normalized()
    ax_a = Vector((0, 0, 1.0))
    ax_b = axis.cross(ax_a).normalized()
    rc = lobe + Vector((0.0012, 0, -(R - 0.0022)))
    rows = []
    cents = []
    for i in range(32):
        t = 2 * pi * i / 32
        d = ax_a * cos(t) + ax_b * sin(t)
        cc = rc + d * R
        rows.append(ring(cc, d, axis, r, r, 10))
        cents.append(cc)
    part.grid(rows, 'earring', closed=True, centers=cents, loop=True)
    part.rigid('head')
    if s < 0:
        part = part.mirrored()
    part.scale_about(HEAD_PIV, HEAD_SV)
    return part


def build_face():
    part = build_head()
    part.merge(build_eye(1))
    part.merge(build_eye(-1))
    part.scale_about(HEAD_PIV, HEAD_SV)
    return part
