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
    Image.fromarray(np.clip(head, 0, 255).astype(np.uint8), 'RGBA').save(os.path.join(OUT, 'Malfoid_Head_BaseColor.png'))
    body = load(os.path.join(ASSET, 'PNG', 'Body_All_BaseColor.png'))
    body = over(body, load(os.path.join(pre, 'Body_Texture_Presets', 'BodyAll_BaseColor2_NeutralFair.png')))
    Image.fromarray(np.clip(body, 0, 255).astype(np.uint8), 'RGBA').save(os.path.join(OUT, 'Malfoid_Body_BaseColor.png'))
    print('textures written to', OUT)


if __name__ == '__main__':
    main()
