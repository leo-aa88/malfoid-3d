"""Side-by-side sheet: reference | shots... (labels on top), same height."""
import sys
from PIL import Image, ImageDraw
out, items = sys.argv[1], sys.argv[2:]
H = 548
ims = []
for it in items:
    label, _, path = it.partition('=')
    im = Image.open(path).convert('RGB')
    im = im.resize((int(im.width * H / im.height), H), Image.LANCZOS)
    canvas = Image.new('RGB', (im.width, H + 26), (30, 30, 30))
    canvas.paste(im, (0, 26))
    ImageDraw.Draw(canvas).text((6, 6), label, fill=(255, 230, 120))
    ims.append(canvas)
sheet = Image.new('RGB', (sum(i.width for i in ims) + 8 * (len(ims) - 1), H + 26), (60, 60, 60))
x = 0
for i in ims:
    sheet.paste(i, (x, 0)); x += i.width + 8
sheet.save(out)
print(out, sheet.size)
