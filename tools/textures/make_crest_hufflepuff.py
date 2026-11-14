"""Paints the Hufflepuff crest for Susan's robe (system Python + Pillow).

After the Susan atlas's crest: the same peaked shield and gold rim as the Ravenclaw crest
(its shape and laurel are reused from make_crest_ravenclaw.py); the field gold at the upper
left and black elsewhere, a gold pale running down the lower half; a badger's head and neck in
profile facing right (cream face and muzzle, the dark band through the eye up over the head, a
pale stripe above it, a black nose), a fringe of fur at the neck, and the gold laurel below.
Drawn at 4x and downsampled for clean edges.

  python3 tools/textures/make_crest_hufflepuff.py [OUT.png]
"""
import os
import sys
from PIL import Image, ImageDraw, ImageFilter

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import make_crest_ravenclaw as R  # noqa: E402  (shield outline, curves, strokes, laurel)

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, 'build', 'textures', 'Susan_Crest.png')
S, K, P, bez, stroke = R.S, R.K, R.P, R.bez, R.stroke

BLACK = (34, 31, 28, 255)
BLACK_L = (58, 54, 50, 255)
GOLD = (226, 176, 62, 255)        # #E1B241, the atlas's Hufflepuff gold
GOLD_D = R.GOLD_D
CREAM = (240, 228, 206, 255)
CREAM_D = (196, 178, 150, 255)
FUR_D = (40, 36, 34, 255)
INK = (18, 16, 14, 255)


def shield(img, dr):
    dr.polygon(P(R.shield_outline(0)), fill=GOLD, outline=GOLD_D, width=int(8 * K))
    mask = Image.new('L', (S, S), 0)
    ImageDraw.Draw(mask).polygon(P(R.shield_outline(55)), fill=255)
    field = Image.new('RGBA', (S, S), BLACK)
    fd = ImageDraw.Draw(field)
    # a faint sheen on the black towards the upper right
    fd.polygon(P([(500, 60), (900, 60), (900, 420), (500, 300)]), fill=BLACK_L)
    fd.polygon(P([(0, 0), (500, 0), (500, 470), (0, 470)]), fill=GOLD)                 # upper left
    fd.polygon(P([(478, 470), (522, 470), (514, 900), (486, 900)]), fill=GOLD)          # the pale
    img.paste(field, (0, 0), mask)
    dr.line(P(R.shield_outline(55) + R.shield_outline(55)[:1]), fill=GOLD_D, width=int(5 * K))
    stroke(dr, R.shield_outline(14)[2:36], 6, R.GOLD_L)


def badger(dr):
    """a sturdy head and neck facing right, from the lower left up to the snout: a rounded
    crown, a short tapering muzzle, a fringe of fur where the neck ends"""
    outline = [(335, 600)] + bez((335, 600), (320, 470), (350, 360), (430, 318), 20) \
        + bez((430, 318), (500, 282), (580, 290), (630, 312), 16)[1:] \
        + bez((630, 312), (680, 330), (720, 336), (748, 348), 12)[1:] \
        + bez((748, 348), (762, 356), (760, 376), (742, 382), 8)[1:] \
        + bez((742, 382), (700, 396), (650, 404), (610, 418), 12)[1:] \
        + bez((610, 418), (560, 438), (530, 500), (548, 600), 16)[1:]
    fringe = [(548, 600), (526, 586), (514, 616), (488, 592), (470, 626), (446, 598), (428, 630), (402, 602),
              (384, 632), (360, 604), (335, 600)]
    body = outline + fringe
    dr.polygon(P(body), fill=GOLD_D, outline=GOLD_D, width=int(12 * K))
    dr.polygon(P(body), fill=CREAM)
    # shade under the jaw and down the front of the neck
    dr.polygon(P(bez((612, 418), (560, 440), (532, 500), (548, 598), 14) + [(500, 596)]
                 + bez((500, 596), (496, 520), (530, 460), (612, 418), 12)[1:]), fill=CREAM_D)
    # the dark cap over the crown and the back of the head
    cap = bez((327, 480), (330, 400), (370, 340), (430, 318), 12) + bez((430, 318), (500, 282), (580, 290), (630, 312), 12)[1:] \
        + bez((630, 312), (680, 330), (720, 336), (744, 347), 10)[1:] \
        + bez((736, 352), (680, 342), (600, 326), (520, 336), 12) + bez((520, 336), (450, 346), (385, 392), (327, 480), 12)[1:]
    dr.polygon(P(cap), fill=FUR_D)
    # the dark band through the eye, from the muzzle back towards the ear
    band = bez((715, 352), (660, 350), (580, 352), (500, 392), 12) + bez((488, 430), (560, 392), (640, 376), (715, 364), 12)
    dr.polygon(P(band), fill=FUR_D)
    # ear, eye, nose, mouth
    dr.ellipse(P([(424, 360)])[0] + P([(474, 404)])[0], fill=FUR_D, outline=CREAM_D, width=int(4 * K))
    dr.polygon(P([(600, 366), (634, 358), (648, 366), (620, 374)]), fill=(250, 244, 232, 255))
    dr.ellipse(P([(738, 346)])[0] + P([(764, 372)])[0], fill=INK)
    stroke(dr, bez((742, 384), (705, 394), (675, 398), (648, 396), 8), 4, (120, 100, 80, 255))


def main():
    img = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    dr = ImageDraw.Draw(img)
    shield(img, dr)
    dr = ImageDraw.Draw(img)
    R.GOLD = GOLD                      # the laurel in the same gold as the field
    R.XF = (500, 735, 1.3, 20)        # the sprig a wreath under the badger, as large as the atlas's
    R.laurel(dr)
    R.XF = None
    badger(dr)
    sh = img.split()[3].filter(ImageFilter.GaussianBlur(10 * K))
    base = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    base.putalpha(sh.point(lambda a: int(a * 0.45)))
    base.alpha_composite(img)
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    base.resize((1024, 1024), Image.LANCZOS).save(OUT)
    print('crest written to', OUT)


if __name__ == '__main__':
    main()
