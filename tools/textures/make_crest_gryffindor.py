"""Paints the Gryffindor crest for Ginny's robe (system Python + Pillow).

After the Ginny blueprint / facial atlas crest: a heater shield with a gold rim on a deep red
field and a gold lion rampant (rearing on its hind legs, facing left, forepaws raised, mane,
tail curled up behind it). Drawn at 4x and downsampled for clean edges.

  python3 tools/textures/make_crest_gryffindor.py [OUT.png]
"""
import math
import os
import sys
from PIL import Image, ImageDraw, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, 'build', 'textures', 'Ginny_Crest.png')
S = 4096
K = S / 1000.0

GOLD = (222, 168, 58, 255)
GOLD_D = (150, 98, 22, 255)
GOLD_L = (250, 214, 120, 255)
RED = (122, 31, 43, 255)          # #7A1F2B
RED_D = (84, 18, 28, 255)
INK = (52, 22, 12, 255)


def P(pts):
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


def shield(dr):
    outer = bez((150, 110), (150, 110), (850, 110), (850, 110), 2) + bez((850, 110), (860, 520), (760, 760), (500, 920), 40) \
        + bez((500, 920), (240, 760), (140, 520), (150, 110), 40)
    dr.polygon(P(outer), fill=GOLD, outline=GOLD_D, width=int(8 * K))
    inner = bez((205, 165), (205, 165), (795, 165), (795, 165), 2) + bez((795, 165), (800, 510), (715, 715), (500, 855), 40) \
        + bez((500, 855), (285, 715), (200, 510), (205, 165), 40)
    dr.polygon(P(inner), fill=RED, outline=GOLD_D, width=int(5 * K))
    # light from the upper left on the field
    hi = bez((205, 165), (205, 165), (500, 165), (500, 165), 2) + [(500 * K / K, 855)] + bez((500, 855), (285, 715), (200, 510), (205, 165), 40)
    dr.polygon(P(hi), fill=(140, 38, 50, 255))
    # rim highlight
    stroke(dr, bez((165, 125), (165, 125), (835, 125), (835, 125), 2), 6, GOLD_L)


def lion(dr):
    """lion rampant as in the atlas: head turned to the right with the jaw open and a full
    mane, forepaws raised to the upper left, a powerful body on the diagonal, hind legs
    planted low, tail curling up on the right. Drawn as one silhouette: every part's
    outline first, then every fill, so no seams show at the joints."""
    tubes = [  # (points, width)
        (bez((560, 640), (670, 670), (735, 560), (705, 455)), 26),             # tail
        (bez((705, 455), (690, 395), (735, 365), (760, 400)), 20),
        (bez((515, 600), (450, 660), (400, 690), (370, 760)), 62),             # hind leg (back)
        ([(370, 760), (318, 778)], 40),
        (bez((560, 630), (610, 690), (620, 745), (600, 795)), 60),             # hind leg (front)
        ([(600, 795), (652, 808)], 38),
        (bez((560, 400), (500, 355), (450, 300), (405, 245)), 46),             # foreleg (upper)
        (bez((560, 460), (500, 455), (450, 425), (395, 405)), 44),             # foreleg (lower)
    ]
    locks = [((600, 240), (550, 345), 64), ((580, 265), (525, 380), 58), ((615, 290), (570, 410), 58),
             ((640, 300), (615, 400), 50), ((565, 235), (530, 300), 46)]
    for (x0, y0), (x1, y1), w in locks:
        tubes.append((bez((x0, y0), ((x0 + x1) / 2 - 18, (y0 + y1) / 2), ((x0 + x1) / 2 + 12, (y0 + y1) / 2 + 10), (x1, y1)), w))
    body = bez((555, 345), (665, 380), (670, 530), (585, 650), 30) + bez((585, 650), (540, 715), (440, 690), (452, 590), 30) \
        + bez((452, 590), (462, 495), (480, 405), (555, 345), 30)
    head = [(580, 240), (625, 218), (668, 228), (700, 250), (722, 272), (705, 285), (680, 289), (695, 306),
            (718, 320), (694, 334), (650, 326), (618, 318), (590, 298)]
    tuft = [(760, 400), (800, 380), (785, 415), (812, 432), (772, 440), (782, 470), (745, 440)]
    ear = [(602, 238), (610, 198), (632, 230)]
    ow = 12
    # pass 1: outlines
    for pts, w in tubes:
        stroke(dr, pts, w + ow, GOLD_D)
    for poly in (body, head, tuft, ear):
        dr.polygon(P(poly), fill=GOLD_D, outline=GOLD_D, width=int(ow * K))
    # pass 2: fills
    for pts, w in tubes:
        stroke(dr, pts, w, GOLD)
    for poly in (body, head, tuft, ear):
        dr.polygon(P(poly), fill=GOLD)
    # claws
    for (x, y), base in (((405, 245), math.atan2(245 - 300, 405 - 450)), ((395, 405), math.atan2(405 - 425, 395 - 450))):
        for a in (-0.75, 0.0, 0.75):
            ang = base + a
            stroke(dr, [(x, y), (x + 34 * math.cos(ang), y + 34 * math.sin(ang))], 11, GOLD)
    # details: open mouth, eye, mane strands, sheen
    dr.polygon(P([(678, 292), (716, 318), (688, 314)]), fill=RED_D)
    dr.ellipse(P([(652, 246)])[0] + P([(667, 260)])[0], fill=INK)
    for (x0, y0), (x1, y1) in (((590, 270), (548, 350)), ((610, 300), (575, 385)), ((585, 300), (545, 370))):
        stroke(dr, [(x0, y0), (x1, y1)], 6, GOLD_D)
    stroke(dr, bez((575, 395), (625, 425), (625, 505), (585, 600), 20), 12, GOLD_L)
    stroke(dr, bez((500, 380), (470, 340), (445, 310), (425, 280), 12), 8, GOLD_L)


def main():
    img = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    dr = ImageDraw.Draw(img)
    shield(dr)
    lion(dr)
    sh = img.split()[3].filter(ImageFilter.GaussianBlur(10 * K))
    base = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    base.putalpha(sh.point(lambda a: int(a * 0.45)))
    base.alpha_composite(img)
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    base.resize((1024, 1024), Image.LANCZOS).save(OUT)
    print('crest written to', OUT)


if __name__ == '__main__':
    main()
