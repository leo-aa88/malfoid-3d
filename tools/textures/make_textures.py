"""Builds Malfoid's texture set from the purchased base mesh's textures.

Only colour changes, no geometry: pale "NeutralFair" skin preset, the base's
own iris art recoloured to deep green, and blonde-brown brows.

  python3 tools/textures/make_textures.py [ASSET_DIR] [OUT_DIR]
"""
import os
import sys
import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
ASSET = sys.argv[1] if len(sys.argv) > 1 else os.path.join(
    ROOT, 'Gumroad_Anime_Female_BaseMesh', 'Gumroad_Anime_Female_BaseMesh', 'Textures')
OUT = sys.argv[2] if len(sys.argv) > 2 else os.path.join(ROOT, 'build', 'textures')

IRIS_HUE = 148.0 / 360.0          # deep emerald (#2E6B4F family)
IRIS_SAT = 1.10
IRIS_VAL = 0.92
BROW_DARK = np.array([0x86, 0x66, 0x4a], np.float32)     # brow core
BROW_LIGHT = np.array([0xd8, 0xbf, 0xa0], np.float32)    # brow fade, close to her hair colour
BROW_BOX = (2600, 2780, 3935, 3000)                      # x0, y0, x1, y1 in the 4096 head texture


def load(p):
    return np.asarray(Image.open(p).convert('RGBA')).astype(np.float32)


def over(dst, src):
    a = src[..., 3:4] / 255.0
    out = dst.copy()
    out[..., :3] = src[..., :3] * a + dst[..., :3] * (1 - a)
    out[..., 3] = np.maximum(dst[..., 3], src[..., 3])
    return out


def rgb_to_hsv(c):
    r, g, b = c[..., 0], c[..., 1], c[..., 2]
    mx = c.max(-1)
    mn = c.min(-1)
    d = mx - mn
    h = np.zeros_like(mx)
    m = d > 1e-6
    rr = m & (mx == r)
    gg = m & (mx == g) & ~rr
    bb = m & ~rr & ~gg
    h[rr] = ((g - b)[rr] / d[rr]) % 6
    h[gg] = (b - r)[gg] / d[gg] + 2
    h[bb] = (r - g)[bb] / d[bb] + 4
    h = h / 6.0
    s = np.where(mx > 1e-6, d / np.maximum(mx, 1e-6), 0)
    return h, s, mx


def hsv_to_rgb(h, s, v):
    i = np.floor(h * 6).astype(int) % 6
    f = h * 6 - np.floor(h * 6)
    p, q, t = v * (1 - s), v * (1 - f * s), v * (1 - (1 - f) * s)
    out = np.zeros(h.shape + (3,), np.float32)
    for k, (a, b, c) in enumerate(((v, t, p), (q, v, p), (p, v, t), (p, q, v), (t, p, v), (v, p, q))):
        m = i == k
        out[m] = np.stack([a[m], b[m], c[m]], -1)
    return out


# cheek blush (pink patch, hatch lines, white dots) baked into the skin preset
BLUSH = [(1772, 1590, 255, 105), (2332, 1590, 255, 105)]
RIM_BOTTOM = 1508                                          # lowest texel of the pink lower-lid rim     # centre x, y, radius x, y


def remove_blush(img):
    """Fill the blush ellipses from the surrounding skin by normalised
    convolution, so the painted skin gradient continues smoothly."""
    from scipy.ndimage import gaussian_filter
    for cx, cy, rx, ry in BLUSH:
        x0, x1, y0, y1 = cx - 2 * rx, cx + 2 * rx, cy - 3 * ry, cy + 3 * ry
        reg = img[y0:y1, x0:x1]
        yy, xx = np.mgrid[y0:y1, x0:x1].astype(np.float32)
        d = np.sqrt(((xx - cx) / rx) ** 2 + ((yy - cy) / ry) ** 2)
        hole = (d < 1.0) & (yy > RIM_BOTTOM)
        # sources: skin around the patch, but not the pink lower-lid rim above it
        rim = (yy < RIM_BOTTOM + 20) & (np.abs(xx - cx) < 1.25 * rx)
        w = (~hole & ~rim).astype(np.float64)
        fill = np.empty(reg.shape[:2] + (3,), np.float64)
        ws = gaussian_filter(w, 70)
        for c in range(3):
            fill[..., c] = gaussian_filter(reg[..., c].astype(np.float64) * w, 70) / np.maximum(ws, 1e-30)
        a = (np.clip((1.0 - d) / 0.40, 0, 1) * np.clip((yy - RIM_BOTTOM) / 6.0, 0, 1))[..., None]
        reg[..., :3] = reg[..., :3] * (1 - a) + fill * a


SCALP_RGB = np.array([237, 193, 185], np.float32)   # flat scalp colour of the base texture
HAIR_RGB = np.array([214, 191, 163], np.float32)    # root tone of her hair
EAR_UV_X = 3480                                     # the ear islands sit right of this (not under hair)


def paint_scalp(img):
    """The scalp is painted one flat pink in the base texture; gaps between
    the hair cards would show it. Recolour it to her hair's root tone (ears
    excluded)."""
    d = np.abs(img[..., :3] - SCALP_RGB).max(-1)
    m = (d <= 6) & (img[..., 3] > 0)
    m[:, EAR_UV_X:] = False
    img[m, :3] = HAIR_RGB
    print('scalp recoloured: %d px' % m.sum())


LASH_BOX = (2560, 2960, 4096, 4096)       # x0, y0, x1, y1: lash / liner cards in the head texture
LASH_INK = np.array([24, 21, 23], np.float32)
CREASE_RGB = np.array([214, 168, 158], np.float32)     # faint crease line, like the atlas


def black_lashes(img):
    """The atlas draws her lashes and liner black; the base texture paints
    them maroon. Only the dark lash/liner shapes are recoloured (pink lower
    lid and white highlight strips are kept)."""
    x0, y0, x1, y1 = LASH_BOX
    reg = img[y0:y1, x0:x1]
    lum = (reg[..., :3] @ np.array([0.299, 0.587, 0.114], np.float32)) / 255.0
    sel = (reg[..., 3] > 0) & (lum < 0.45) & (reg[..., 0] >= reg[..., 2])
    # the double-eyelid crease is a long thin arc (low fill of its bounding
    # box); it stays a faint skin-shadow line, otherwise it reads as a second brow
    from scipy import ndimage
    lab, n = ndimage.label(sel)
    crease = np.zeros_like(sel)
    for i, sl in enumerate(ndimage.find_objects(lab), 1):
        comp = lab[sl] == i
        h, w = sl[0].stop - sl[0].start, sl[1].stop - sl[1].start
        if comp.sum() > 5000 and comp.sum() / float(h * w) < 0.15:
            crease[sl] |= comp
    # the small stroke above the inner eye (between brow and lid) is not in the
    # atlas and reads as a third brow: make it fully transparent
    sx0, sy0, sx1, sy1 = 2580 - x0, 2998 - y0, 3095 - x0, 3232 - y0
    stroke = np.zeros_like(sel)
    stroke[sy0:sy1, sx0:sx1] = reg[sy0:sy1, sx0:sx1, 3] > 0
    stroke &= ~crease
    reg[stroke, 3] = 0
    lash = sel & ~crease & ~stroke
    reg[lash, :3] = LASH_INK + (reg[lash, :3] - LASH_INK) * 0.18
    reg[crease, :3] = CREASE_RGB
    print('lashes recoloured: %d px, crease softened: %d px, inner-lid stroke removed: %d px'
          % (lash.sum(), crease.sum(), stroke.sum()))


NOSE_BOX = (2440, 3260, 2580, 3590)       # pink nose-tip card in the head texture


def hide_nose_mark(img):
    """The atlas nose is a small line with no pink tip: the base's pink
    nose-tip card is painted the surrounding skin colour."""
    x0, y0, x1, y1 = NOSE_BOX
    reg = img[y0:y1, x0:x1]
    skin = img[1560:1580, 2040:2060, :3].reshape(-1, 3).mean(0)       # skin beside the nose
    sel = (reg[..., 3] > 0) & (reg[..., 0] > reg[..., 1] + 20)
    reg[sel, :3] = skin
    print('nose mark recoloured: %d px' % sel.sum())


def main():
    os.makedirs(OUT, exist_ok=True)
    pre = os.path.join(ASSET, 'Preset')
    head = load(os.path.join(ASSET, 'PNG', 'Body_BaseColor.png'))
    head = over(head, load(os.path.join(pre, 'Head_Texture_Presets', 'Head_BaseColor2_NeutralFair.png')))
    # green irises: hue-rotate the base's own (pink) iris art, keeping its
    # value structure, gradient and sparkles
    eyes = load(os.path.join(pre, 'Head_Texture_Presets', 'Eyes_Color1.png'))
    m = eyes[..., 3] > 0
    h, s, v = rgb_to_hsv(eyes[..., :3] / 255.0)
    rgb = hsv_to_rgb(np.full_like(h, IRIS_HUE), np.clip(s * IRIS_SAT, 0, 1), v * IRIS_VAL) * 255.0
    eyes[..., :3] = np.where(m[..., None], rgb, eyes[..., :3])
    head = over(head, eyes)
    # brows: maroon -> blonde-brown, mapped by luminance so the stroke's
    # taper and soft fade are kept
    x0, y0, x1, y1 = BROW_BOX
    reg = head[y0:y1, x0:x1]
    lum = (reg[..., :3] @ np.array([0.299, 0.587, 0.114], np.float32)) / 255.0
    t = np.clip((lum - 0.15) / 0.75, 0, 1)[..., None]
    col = BROW_DARK * (1 - t) + BROW_LIGHT * t
    sel = (reg[..., 3:4] > 0) & (lum[..., None] < 0.92)
    reg[..., :3] = np.where(sel, col, reg[..., :3])
    remove_blush(head)
    paint_scalp(head)
    black_lashes(head)
    hide_nose_mark(head)
    Image.fromarray(np.clip(head, 0, 255).astype(np.uint8), 'RGBA').save(os.path.join(OUT, 'Malfoid_Head_BaseColor.png'))
    body = load(os.path.join(ASSET, 'PNG', 'Body_All_BaseColor.png'))
    body = over(body, load(os.path.join(pre, 'Body_Texture_Presets', 'BodyAll_BaseColor2_NeutralFair.png')))
    Image.fromarray(np.clip(body, 0, 255).astype(np.uint8), 'RGBA').save(os.path.join(OUT, 'Malfoid_Body_BaseColor.png'))
    print('textures written to', OUT)


if __name__ == '__main__':
    main()
