"""Paints the Ravenclaw crest for Cho's robe (system Python + Pillow).

After the Cho blueprint's crests: a shield with a peaked top and a gold rim on a Ravenclaw-blue
field (lighter at the upper left), a gold eagle in profile facing right with its beak open,
wings folded with the feather tips fanned out behind it and a long tail sweeping down, standing,
and a small gold laurel sprig below it. Drawn at 4x and downsampled for clean edges.

  python3 tools/textures/make_crest_ravenclaw.py [OUT.png]
"""
import math
import os
import sys
from PIL import Image, ImageDraw, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, 'build', 'textures', 'Cho_Crest.png')
S = 4096
K = S / 1000.0

GOLD = (222, 168, 58, 255)
GOLD_D = (150, 98, 22, 255)
GOLD_L = (250, 214, 120, 255)
BLUE = (46, 72, 120, 255)         # #2E4878
BLUE_L = (58, 90, 148, 255)
BLUE_D = (30, 48, 92, 255)
INK = (40, 26, 10, 255)


XF = None                          # optional (cx, cy, scale, dy) applied to the eagle's points


def P(pts):
    if XF:
        cx, cy, k, dy = XF
        pts = [(cx + (x - cx) * k, cy + (y - cy) * k + dy) for x, y in pts]
    return [(x * K, y * K) for x, y in pts]


def bez(p0, p1, p2, p3, n=40):
    out = []
    for i in range(n + 1):
        t = i / n
        a, b, c, d = (1 - t) ** 3, 3 * (1 - t) ** 2 * t, 3 * (1 - t) * t * t, t ** 3
        out.append((a * p0[0] + b * p1[0] + c * p2[0] + d * p3[0], a * p0[1] + b * p1[1] + c * p2[1] + d * p3[1]))
    return out


def stroke(dr, pts, w, fill):
    pts = P(pts)
    dr.line(pts, fill=fill, width=int(w * K), joint='curve')
    r = w * K / 2
    for x, y in (pts[0], pts[-1]):
        dr.ellipse([x - r, y - r, x + r, y + r], fill=fill)


def tube(dr, pts, w, fill, outline=GOLD_D, ow=10):
    stroke(dr, pts, w + ow, outline)
    stroke(dr, pts, w, fill)


def shield_outline(inset):
    """the shield's outline (peaked top, curved sides, pointed base) shrunk by inset"""
    a = inset
    return bez((150 + a, 150 + a * 0.6), (300, 120 + a), (420, 100 + a), (500, 80 + a * 1.2), 20) \
        + bez((500, 80 + a * 1.2), (580, 100 + a), (700, 120 + a), (850 - a, 150 + a * 0.6), 20)[1:] \
        + bez((850 - a, 150 + a * 0.6), (860 - a, 540), (760 - a * 0.7, 770 - a * 0.3), (500, 930 - a * 1.3), 40)[1:] \
        + bez((500, 930 - a * 1.3), (240 + a * 0.7, 770 - a * 0.3), (140 + a, 540), (150 + a, 150 + a * 0.6), 40)[1:]


def shield(img, dr):
    dr.polygon(P(shield_outline(0)), fill=GOLD, outline=GOLD_D, width=int(8 * K))
    # the field: a soft gradient, lighter towards the upper left
    mask = Image.new('L', (S, S), 0)
    ImageDraw.Draw(mask).polygon(P(shield_outline(55)), fill=255)
    grad = Image.linear_gradient('L').rotate(-35, expand=False).resize((S, S))
    field = Image.composite(Image.new('RGBA', (S, S), BLUE_L), Image.new('RGBA', (S, S), BLUE_D), grad.point(lambda v: 255 - v))
    img.paste(field, (0, 0), mask)
    dr.line(P(shield_outline(55) + shield_outline(55)[:1]), fill=GOLD_D, width=int(5 * K))
    stroke(dr, shield_outline(14)[2:36], 6, GOLD_L)


def laurel(dr):
    """a small laurel sprig below the eagle: two branches in a V, a berry where they meet"""
    for sgn in (-1, 1):
        stem = bez((500, 735), (500 + sgn * 50, 720), (500 + sgn * 115, 690), (500 + sgn * 160, 640), 18)
        stroke(dr, stem, 13, GOLD_D)
        stroke(dr, stem, 8, GOLD)
        for i in range(3, len(stem), 3):
            (x0, y0), (x1, y1) = stem[i - 1], stem[i]
            ang = math.atan2(y1 - y0, x1 - x0)
            for side in (-1, 1):
                a = ang + side * 0.8
                tip = (x1 + 46 * math.cos(a), y1 + 46 * math.sin(a))
                mid = (x1 + 23 * math.cos(a), y1 + 23 * math.sin(a))
                leaf = [(x1, y1), (mid[0] + 10 * math.cos(a + 1.5), mid[1] + 10 * math.sin(a + 1.5)), tip,
                        (mid[0] + 10 * math.cos(a - 1.5), mid[1] + 10 * math.sin(a - 1.5))]
                dr.polygon(P(leaf), fill=GOLD, outline=GOLD_D, width=int(3 * K))
    dr.ellipse(P([(486, 728)])[0] + P([(514, 756)])[0], fill=GOLD, outline=GOLD_D, width=int(3 * K))


def eagle(dr):
    """the eagle facing right: an open hooked beak, a sleek head, a deep chest, the folded
    wing along its back with the primaries fanned out behind, the long tail sweeping down to
    the right, legs and talons. Outlines first, then fills (no seams at the joins)."""
    head = bez((585, 345), (590, 290), (650, 268), (690, 290), 20) + bez((690, 290), (705, 300), (705, 330), (690, 345), 10) \
        + bez((690, 345), (660, 372), (620, 385), (585, 345), 14)
    beak_up = [(688, 296), (730, 300), (762, 312), (752, 318), (722, 318), (695, 322)]
    beak_lo = [(692, 335), (722, 333), (748, 342), (720, 348), (690, 348)]
    body = bez((600, 350), (650, 400), (640, 500), (560, 530), 30) + bez((560, 530), (470, 560), (380, 500), (360, 460), 30) \
        + bez((360, 460), (420, 400), (520, 360), (600, 350), 30)
    wing = bez((600, 365), (560, 360), (470, 380), (400, 420), 20) + [
        (300, 420), (330, 438), (262, 448), (318, 462), (270, 480), (335, 482), (300, 505), (370, 495)] \
        + bez((370, 495), (450, 490), (540, 450), (600, 365), 20)
    tail = [(470, 520), (560, 548), (650, 585), (720, 615), (700, 628), (735, 645), (690, 645), (712, 668),
            (640, 645), (560, 600), (480, 560)]
    legs = [bez((505, 530), (500, 570), (490, 600), (478, 628), 10), bez((550, 525), (560, 565), (565, 595), (568, 625), 10)]
    ow = 12
    for pts in legs:
        stroke(dr, pts, 20 + ow, GOLD_D)
    for poly in (tail, body, wing, head, beak_up, beak_lo):
        dr.polygon(P(poly), fill=GOLD_D, outline=GOLD_D, width=int(ow * K))
    for pts in legs:
        stroke(dr, pts, 20, GOLD)
    dr.polygon(P(tail), fill=(206, 150, 46, 255))
    for poly in (body, wing, head, beak_up, beak_lo):
        dr.polygon(P(poly), fill=GOLD)
    for x, y in ((478, 628), (568, 625)):                       # talons
        for a in (-1.0, 0.0, 1.0):
            stroke(dr, [(x, y), (x + 30 * math.sin(a), y + 18 + 4 * math.cos(a))], 9, GOLD_D)
    # details: eye, wing coverts and feather lines, tail feather lines, sheen
    dr.ellipse(P([(652, 300)])[0] + P([(670, 318)])[0], fill=INK)
    for k in range(4):
        y = 400 + k * 22
        stroke(dr, bez((560 - k * 10, y - 20), (500, y - 10), (440, y), (360 + k * 8, y + 25), 12), 6, GOLD_D)
    for k in range(3):
        stroke(dr, [(520 + k * 40, 540 + k * 16), (690 - k * 6, 628 + k * 8)], 5, GOLD_D)
    stroke(dr, bez((600, 380), (618, 420), (610, 470), (575, 505), 14), 10, GOLD_L)
    stroke(dr, bez((610, 300), (628, 285), (655, 280), (676, 290), 10), 7, GOLD_L)


def main():
    img = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    dr = ImageDraw.Draw(img)
    shield(img, dr)
    dr = ImageDraw.Draw(img)
    global XF
    XF = (0, 0, 1.0, 34)               # the sprig a little lower
    laurel(dr)
    XF = (500, 450, 1.17, -22)         # the eagle larger and higher: it fills the field
    eagle(dr)
    XF = None
    sh = img.split()[3].filter(ImageFilter.GaussianBlur(10 * K))
    base = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    base.putalpha(sh.point(lambda a: int(a * 0.45)))
    base.alpha_composite(img)
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    base.resize((1024, 1024), Image.LANCZOS).save(OUT)
    print('crest written to', OUT)


if __name__ == '__main__':
    main()
