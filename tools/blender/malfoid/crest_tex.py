"""Paints the Slytherin crest texture (no external art): an ornate silver frame
with a scalloped edge and a small crown, a deep-green shield with a subtle
diamond pattern, and a silver serpent coiled in an S with scales, an eye and a
forked tongue. Drawn with signed distances, anti-aliased, 1024 x 1024 RGBA."""
import math
import numpy as np

SIZE = 1024

SHIELD_HALF = [(0.0, 0.70), (0.18, 0.64), (0.38, 0.70), (0.56, 0.80), (0.64, 0.70), (0.63, 0.30),
               (0.62, 0.0), (0.56, -0.30), (0.42, -0.56), (0.21, -0.76), (0.0, -0.88)]


def _poly(half):
    return np.array(half + [(-u, v) for u, v in reversed(half[1:-1])], np.float64)


def _poly_sdf(P, X, Y):
    """signed distance to a closed polygon (negative inside)"""
    n = len(P)
    d = np.full(X.shape, 1e9)
    inside = np.zeros(X.shape, bool)
    for i in range(n):
        ax, ay = P[i]
        bx, by = P[(i + 1) % n]
        ex, ey = bx - ax, by - ay
        wx, wy = X - ax, Y - ay
        t = np.clip((wx * ex + wy * ey) / (ex * ex + ey * ey), 0, 1)
        dx, dy = wx - ex * t, wy - ey * t
        d = np.minimum(d, dx * dx + dy * dy)
        cond = ((ay > Y) != (by > Y)) & (X < (bx - ax) * (Y - ay) / (by - ay + 1e-12) + ax)
        inside ^= cond
    d = np.sqrt(d)
    return np.where(inside, -d, d)


def _polyline(pts, X, Y):
    """distance to an open polyline and the arc parameter (0..1) of the nearest point"""
    seg = np.diff(pts, axis=0)
    L = np.sqrt((seg ** 2).sum(1))
    acc = np.concatenate([[0], np.cumsum(L)])
    best = np.full(X.shape, 1e9)
    par = np.zeros(X.shape)
    side = np.zeros(X.shape)
    for i in range(len(seg)):
        ax, ay = pts[i]
        ex, ey = seg[i]
        wx, wy = X - ax, Y - ay
        t = np.clip((wx * ex + wy * ey) / (L[i] ** 2), 0, 1)
        dx, dy = wx - ex * t, wy - ey * t
        dd = dx * dx + dy * dy
        m = dd < best
        best = np.where(m, dd, best)
        par = np.where(m, (acc[i] + t * L[i]) / acc[-1], par)
        side = np.where(m, np.sign(ex * wy - ey * wx), side)
    return np.sqrt(best), par, side


def _aa(d, px):
    """coverage of the region d < 0 with one pixel of anti-aliasing"""
    return np.clip(0.5 - d / px, 0, 1)


def _over(img, col, a):
    a = a[..., None]
    img[..., :3] = img[..., :3] * (1 - a) + np.asarray(col, np.float64) * a
    img[..., 3:] = np.maximum(img[..., 3:], a)


def paint(size=SIZE):
    v, u = np.mgrid[size - 1:-1:-1, 0:size].astype(np.float64)
    X = (u + 0.5) / size * 2 - 1
    Y = (v + 0.5) / size * 2 - 1
    px = 2.0 / size
    img = np.zeros((size, size, 4))
    shield = _poly(SHIELD_HALF)
    d_sh = _poly_sdf(shield, X, Y)
    ang = np.arctan2(Y, X)

    # ---- frame: scalloped silver band around the shield, with a small crown
    band = 0.11 + 0.035 * np.abs(np.cos(7.0 * ang))
    d_frame = d_sh - band
    crown = _poly(np.array([(0.0, 0.98), (0.07, 0.86), (0.14, 0.95), (0.20, 0.84), (0.27, 0.92), (0.28, 0.74),
                            (0.0, 0.74)]).tolist())
    d_crown = _poly_sdf(crown, X, Y)
    d_out = np.minimum(d_frame, d_crown)
    # bevel height inside the frame -> shading
    hgt = np.clip(-d_out / 0.05, 0, 1) * np.clip(d_sh / 0.03, 0, 1)
    gy, gx = np.gradient(hgt)
    light = np.clip(0.55 + 6.0 * (-gx * 0.6 + gy * 0.8), 0.25, 1.15)
    silver = np.stack([0.78 * light, 0.79 * light, 0.80 * light], -1) + 0.08
    # engraved scroll lines
    eng = np.abs(np.sin(26 * ang + 6 * np.sin(3 * ang))) < 0.10
    eng &= (d_sh > 0.035) & (d_frame < -0.03)
    silver[eng] *= 0.62
    _over(img, (0.10, 0.10, 0.11), _aa(d_out - 0.012, px))          # dark outer outline
    a = _aa(d_out, px)
    img[..., :3] = img[..., :3] * (1 - a[..., None]) + np.clip(silver, 0, 1) * a[..., None]
    img[..., 3] = np.maximum(img[..., 3], a)
    # gems on the crown points
    for gx_, gy_ in ((0.0, 0.93), (0.20, 0.82), (-0.20, 0.82)):
        d_g = np.hypot(X - gx_, Y - gy_) - 0.028
        _over(img, (0.12, 0.45, 0.28), _aa(d_g, px))

    # ---- green field
    _over(img, (0.10, 0.10, 0.11), _aa(d_sh, px))                     # inner outline
    r = np.hypot(X * 0.9, Y - 0.05)
    g = np.clip(1.0 - r * 0.55, 0.35, 1.0)
    green = np.stack([0.006 + 0.022 * g, 0.045 + 0.110 * g, 0.022 + 0.050 * g], -1)
    diamond = (np.abs(np.sin((X + Y) * 28)) < 0.06) | (np.abs(np.sin((X - Y) * 28)) < 0.06)
    green[diamond] *= 0.86
    a = _aa(d_sh + 0.014, px)
    img[..., :3] = img[..., :3] * (1 - a[..., None]) + green * a[..., None]

    # ---- serpent: head at the upper right, body coiling in an S, tail curling at the bottom
    ctrl = np.array([(0.16, 0.36), (0.02, 0.44), (-0.26, 0.30), (-0.20, 0.06), (0.10, -0.02),
                     (0.30, -0.22), (0.12, -0.46), (-0.16, -0.50), (-0.24, -0.38), (-0.12, -0.32)])
    pts = ctrl
    for _ in range(5):                                  # Chaikin subdivision -> smooth curve
        q = 0.75 * pts[:-1] + 0.25 * pts[1:]
        r_ = 0.25 * pts[:-1] + 0.75 * pts[1:]
        pts = np.vstack([pts[:1], np.stack([q, r_], 1).reshape(-1, 2), pts[-1:]])
    d_s, par, side = _polyline(pts, X, Y)
    wid = 0.072 * np.clip(par / 0.06, 0.55, 1.0) * (1 - 0.88 * np.clip((par - 0.45) / 0.55, 0, 1) ** 1.2)
    body = d_s - wid
    _over(img, (0.03, 0.05, 0.04), _aa(body - 0.014, px))               # outline
    cross = np.clip(d_s / np.maximum(wid, 1e-3), 0, 1) * side
    shade = np.clip(0.95 - 0.60 * cross ** 2 - 0.25 * cross, 0.30, 1.05)
    along = par * 70.0
    diam = np.abs(((along + cross * 1.6) % 1.0) - 0.5) + np.abs(((along - cross * 1.6) % 1.0) - 0.5)
    scales = diam > 0.80
    col = np.stack([0.66 * shade, 0.70 * shade, 0.68 * shade], -1)
    col[scales] *= 0.72
    belly = cross > 0.55
    col[belly] = col[belly] * 0.75 + np.array([0.10, 0.12, 0.08]) * 0.25
    a = _aa(body, px)
    img[..., :3] = img[..., :3] * (1 - a[..., None]) + np.clip(col, 0, 1) * a[..., None]
    # head: a wedge continuing the body's start, pointing away from the coil
    fwd = pts[0] - pts[3]
    fwd /= np.linalg.norm(fwd)
    lat = np.array([-fwd[1], fwd[0]])
    hb = pts[0] - fwd * 0.03
    fx = (X - hb[0]) * fwd[0] + (Y - hb[1]) * fwd[1]          # along the head
    lx = (X - hb[0]) * lat[0] + (Y - hb[1]) * lat[1]          # across the head
    head_poly = np.array([(-0.02, 0.05), (0.06, 0.075), (0.15, 0.052), (0.20, 0.022), (0.21, 0.0),
                          (0.20, -0.020), (0.15, -0.046), (0.06, -0.068), (-0.02, -0.05)])
    d_head = _poly_sdf(head_poly, fx, lx)
    # forked tongue from the snout
    def seg(p0, p1):
        ex, ey = p1[0] - p0[0], p1[1] - p0[1]
        wx, wy = fx - p0[0], lx - p0[1]
        t = np.clip((wx * ex + wy * ey) / (ex * ex + ey * ey), 0, 1)
        return np.hypot(wx - ex * t, wy - ey * t)
    tongue = np.minimum(seg((0.20, 0.0), (0.29, 0.0)),
                        np.minimum(seg((0.29, 0.0), (0.335, 0.03)), seg((0.29, 0.0), (0.335, -0.03)))) - 0.007
    _over(img, (0.55, 0.05, 0.07), _aa(tongue, px))
    _over(img, (0.03, 0.05, 0.04), _aa(d_head - 0.014, px))
    hs = np.clip(0.95 - 0.5 * np.clip(lx / 0.07, -1, 1) ** 2 - 0.2 * np.clip(lx / 0.07, -1, 1), 0.35, 1.05)
    hcol = np.stack([0.70 * hs, 0.74 * hs, 0.72 * hs], -1)
    hsc = (np.abs(np.sin(fx * 90)) < 0.12) & (fx < 0.12)
    hcol[hsc] *= 0.8
    a = _aa(d_head, px)
    img[..., :3] = img[..., :3] * (1 - a[..., None]) + hcol * a[..., None]
    # eye: green with a slit pupil, set back from the snout on the upper side
    d_eye = np.hypot((fx - 0.105) / 1.25, lx - 0.022) - 0.021
    _over(img, (0.03, 0.05, 0.04), _aa(d_eye - 0.006, px))
    _over(img, (0.10, 0.55, 0.20), _aa(d_eye, px))
    d_pup = np.hypot((fx - 0.105) / 0.30, lx - 0.022) - 0.017
    _over(img, (0.01, 0.01, 0.01), _aa(d_pup, px))
    # nostril and mouth line
    _over(img, (0.03, 0.05, 0.04), _aa(np.hypot(fx - 0.185, lx - 0.012) - 0.006, px))
    _over(img, (0.03, 0.05, 0.04), _aa(seg((0.06, -0.022), (0.20, -0.004)) - 0.004, px))

    # gamma-encode for an sRGB PNG
    rgb = np.clip(img[..., :3], 0, 1)
    img[..., :3] = np.where(rgb <= 0.0031308, rgb * 12.92, 1.055 * rgb ** (1 / 2.4) - 0.055)
    return img
