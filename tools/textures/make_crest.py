"""Paints the Slytherin house crest for the robe (system Python + Pillow).

Layout after the classic house crest: a knight's helm with a red-and-white
torse on top, silver-and-green mantling scrolls on both sides, a green
shield with a silver serpent coiled in an S (head at the upper left,
forked tongue), and a gold scroll reading SLYTHERIN underneath.

Drawn at 4x and downsampled for clean edges.
  python3 tools/textures/make_crest.py [OUT.png]
"""
import math
import os
import sys
from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, 'build', 'textures', 'Malfoid_Crest.png')
S = 4096                       # working size; output is 1024
K = S / 1000.0                 # design units: 1000 x 1000

INK = (22, 30, 26, 255)
SILVER = (205, 208, 206, 255)
SILVER_D = (140, 146, 145, 255)
SILVER_L = (240, 242, 240, 255)
GREEN = (32, 116, 72, 255)
GREEN_D = (14, 70, 42, 255)
GREEN_L = (70, 160, 105, 255)
GOLD = (236, 190, 60, 255)
GOLD_D = (176, 128, 24, 255)
RED = (190, 40, 46, 255)


def P(pts):
    return [(x * K, y * K) for x, y in pts]


def bez(p0, p1, p2, p3, n=40):
    out = []
    for i in range(n + 1):
        t = i / n
        a = (1 - t) ** 3
        b = 3 * (1 - t) ** 2 * t
        c = 3 * (1 - t) * t * t
        d = t ** 3
        out.append((a * p0[0] + b * p1[0] + c * p2[0] + d * p3[0], a * p0[1] + b * p1[1] + c * p2[1] + d * p3[1]))
    return out


def stroke(dr, pts, w, fill):
    pts = P(pts)
    dr.line(pts, fill=fill, width=int(w * K), joint='curve')
    r = w * K / 2
    for x, y in (pts[0], pts[-1]):
        dr.ellipse([x - r, y - r, x + r, y + r], fill=fill)


def tube(dr, pts, w, fill, outline=INK, ow=7):
    stroke(dr, pts, w + ow, outline)
    stroke(dr, pts, w, fill)


def scroll(cx, cy, r, turns, start, sign):
    """spiral points (a mantling curl)"""
    pts = []
    n = 60
    for i in range(n + 1):
        t = i / n
        a = start + sign * turns * 2 * math.pi * t
        rr = r * (1 - 0.82 * t)
        pts.append((cx + rr * math.cos(a), cy + rr * math.sin(a)))
    return pts


def mantling(dr, side):
    """silver/green leafy scrolls on one side (side = -1 left, +1 right)"""
    def X(x):
        return 500 + side * x
    # green leaves behind
    leaves = [[(X(150), 300), (X(330), 230), (X(400), 330), (X(300), 420)],
              [(X(170), 430), (X(360), 420), (X(420), 540), (X(300), 600)],
              [(X(180), 590), (X(340), 620), (X(370), 740), (X(250), 760)]]
    for lf in leaves:
        pts = bez(lf[0], lf[1], lf[2], lf[3]) + bez(lf[3], (lf[3][0], lf[3][1] - 60), (X(200), lf[0][1] + 80), lf[0])
        dr.polygon(P(pts), fill=GREEN, outline=INK)
        vein = bez(lf[0], ((lf[0][0] + lf[2][0]) / 2, (lf[0][1] + lf[2][1]) / 2), lf[2], lf[3], 20)
        stroke(dr, vein[2:-4], 6, GREEN_D)
    # silver scroll ribbons over them
    tube(dr, bez((X(140), 250), (X(260), 160), (X(380), 230), (X(360), 330)), 46, SILVER)
    tube(dr, scroll(X(330), 320, 55, 1.1, -0.3 if side > 0 else math.pi + 0.3, side), 34, SILVER)
    tube(dr, bez((X(165), 380), (X(330), 360), (X(420), 470), (X(350), 560)), 44, SILVER)
    tube(dr, scroll(X(350), 520, 50, 1.0, 0.4 if side > 0 else math.pi - 0.4, side), 30, SILVER)
    tube(dr, bez((X(175), 560), (X(310), 600), (X(360), 700), (X(270), 790)), 40, SILVER)
    tube(dr, scroll(X(285), 735, 45, 1.0, 1.2 if side > 0 else math.pi - 1.2, side), 28, SILVER)
    # highlights
    stroke(dr, bez((X(160), 240), (X(260), 175), (X(360), 230), (X(350), 300), 20), 10, SILVER_L)
    stroke(dr, bez((X(180), 375), (X(320), 360), (X(400), 450), (X(360), 520), 20), 10, SILVER_L)


def helm(dr):
    # torse (red and white twisted band) and helm
    dr.rounded_rectangle(P([(400, 205), (600, 245)])[0] + P([(600, 245)])[0], radius=int(18 * K), fill=INK)
    for i in range(6):
        x0 = 405 + i * 32
        dr.rounded_rectangle(P([(x0, 210), (x0 + 30, 240)])[0] + P([(x0 + 30, 240)])[0], radius=int(10 * K),
                             fill=RED if i % 2 == 0 else SILVER_L)
    body = [(430, 250), (570, 250), (590, 300), (585, 360), (560, 395), (440, 395), (415, 360), (410, 300)]
    dr.polygon(P(body), fill=SILVER, outline=INK, width=int(6 * K))
    dr.polygon(P([(440, 250), (500, 250), (500, 395), (440, 395), (415, 360), (410, 300)]), fill=SILVER_L)
    for y in (300, 318, 336):                          # visor slits
        stroke(dr, [(445, y), (555, y)], 7, INK)
    stroke(dr, [(500, 255), (500, 392)], 6, SILVER_D)
    # plume
    tube(dr, bez((520, 210), (560, 120), (500, 90), (470, 140)), 26, SILVER)
    tube(dr, scroll(478, 140, 30, 0.9, 0.0, -1), 20, SILVER)


def shield(dr):
    sh = [(300, 380), (700, 380), (700, 640), (672, 725), (600, 800), (500, 860), (400, 800), (328, 725), (300, 640)]
    dr.polygon(P(sh), fill=SILVER, outline=INK, width=int(8 * K))
    inner = [(322, 400), (678, 400), (678, 635), (652, 712), (588, 780), (500, 832), (412, 780), (348, 712), (322, 635)]
    dr.polygon(P(inner), fill=GREEN, outline=GREEN_D, width=int(4 * K))
    # light from the upper left
    dr.polygon(P([(322, 400), (500, 400), (500, 832), (412, 780), (348, 712), (322, 635)]), fill=(38, 128, 80, 255))


def serpent(dr):
    # body: head upper left, S curve, coil at the bottom right
    body = (bez((430, 470), (520, 420), (600, 470), (560, 540), 30)
            + bez((560, 540), (520, 610), (400, 600), (420, 680), 30)[1:]
            + bez((420, 680), (440, 770), (620, 760), (610, 680), 30)[1:]
            + bez((610, 680), (600, 630), (530, 650), (545, 700), 20)[1:])
    w = [44 * (1 - 0.65 * (i / len(body)) ** 1.5) for i in range(len(body))]
    # dense resample so round stamps give a smooth tube with a solid outline
    dense, dw = [], []
    for i in range(len(body) - 1):
        (x0, y0), (x1, y1) = body[i], body[i + 1]
        n = max(2, int(math.hypot(x1 - x0, y1 - y0) / 1.5))
        for k in range(n):
            t = k / n
            dense.append((x0 + (x1 - x0) * t, y0 + (y1 - y0) * t))
            dw.append(w[i] + (w[i + 1] - w[i]) * t)
    for (x, y), ww in zip(dense, dw):
        r = ww / 2 + 6
        dr.ellipse(P([(x - r, y - r)])[0] + P([(x + r, y + r)])[0], fill=INK)
    for (x, y), ww in zip(dense, dw):
        r = ww / 2
        dr.ellipse(P([(x - r, y - r)])[0] + P([(x + r, y + r)])[0], fill=SILVER)
    for (x, y), ww in list(zip(dense, dw))[::6]:          # sheen along the upper edge
        r = ww * 0.12
        dr.ellipse(P([(x - r - ww * 0.15, y - r - ww * 0.15)])[0] + P([(x + r - ww * 0.15, y + r - ww * 0.15)])[0],
                   fill=SILVER_L)
    for i in range(2, len(body) - 2, 4):
        x, y = body[i]
        dx = body[i + 1][0] - body[i - 1][0]
        dy = body[i + 1][1] - body[i - 1][1]
        L = math.hypot(dx, dy) or 1
        nx, ny = -dy / L, dx / L
        r = w[i] * 0.42
        stroke(dr, [(x + nx * r, y + ny * r), (x - nx * r * 0.3 + dx / L * 6, y - ny * r * 0.3 + dy / L * 6)], 3,
               SILVER_D)
    # head
    head = [(445, 462), (420, 438), (395, 432), (350, 436), (330, 452), (345, 470), (395, 486), (440, 490)]
    dr.polygon(P(head), fill=SILVER, outline=INK, width=int(6 * K))
    dr.ellipse(P([(372, 446)])[0] + P([(386, 458)])[0], fill=RED)            # eye
    dr.ellipse(P([(377, 447)])[0] + P([(381, 457)])[0], fill=INK)
    stroke(dr, [(338, 462), (300, 470)], 5, RED)                              # forked tongue
    stroke(dr, [(300, 470), (282, 458)], 5, RED)
    stroke(dr, [(300, 470), (284, 484)], 5, RED)


def banner(dr):
    left = [(150, 830), (255, 800), (255, 900), (150, 930), (185, 880)]
    right = [(850, 830), (745, 800), (745, 900), (850, 930), (815, 880)]
    for tail in (left, right):
        dr.polygon(P(tail), fill=GOLD_D, outline=INK, width=int(6 * K))
    main = bez((230, 815), (400, 860), (600, 860), (770, 815), 30) + bez((770, 905), (600, 950), (400, 950), (230, 905), 30)
    dr.polygon(P(main), fill=GOLD, outline=INK, width=int(7 * K))
    dr.line(P(bez((235, 830), (400, 872), (600, 872), (765, 830), 30)), fill=(250, 220, 120, 255), width=int(8 * K))
    try:
        font = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf', int(58 * K))
    except OSError:
        font = ImageFont.load_default()
    text = 'SLYTHERIN'
    # letters follow the banner's curve
    total = sum(dr.textlength(c, font=font) for c in text) + 6 * K * (len(text) - 1)
    x = 500 * K - total / 2
    for c in text:
        cw = dr.textlength(c, font=font)
        u = (x + cw / 2) / K
        t = min(max((u - 230) / 540, 0.0), 1.0)
        yc = 860 + 33.75 * 4 * t * (1 - t)               # centre line of the curved scroll
        bb = font.getbbox(c)
        dr.text((x, yc * K - (bb[1] + bb[3]) / 2), c, font=font, fill=(70, 40, 10, 255))
        x += cw + 6 * K


def main():
    img = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    dr = ImageDraw.Draw(img)
    for side in (-1, 1):
        mantling(dr, side)
    helm(dr)
    shield(dr)
    serpent(dr)
    banner(dr)
    # soft drop shadow so it reads as an embroidered patch on black cloth
    sh = img.split()[3].filter(ImageFilter.GaussianBlur(10 * K))
    base = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    base.putalpha(sh.point(lambda a: int(a * 0.45)))
    base.alpha_composite(img)
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    base.resize((1024, 1024), Image.LANCZOS).save(OUT)
    print('crest written to', OUT)


if __name__ == '__main__':
    main()
