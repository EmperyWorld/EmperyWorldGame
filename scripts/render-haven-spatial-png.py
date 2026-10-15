#!/usr/bin/env python3
import json
from pathlib import Path
from PIL import Image, ImageDraw

root = Path("/home/owned/EmperyWorldGame")
data = json.loads(Path("/home/owned/EmperyWorldGame/svodka/haven-spatial-audit.json").read_text())
W, H, tw = 80, 56, 64
scale = 0.18
pw, ph = int(W * tw * scale), int(H * tw * scale)
img = Image.new("RGB", (pw, ph), (10, 12, 16))
draw = ImageDraw.Draw(img, "RGBA")
gids = data["tiles"]["data"]
fill = {1: (45, 74, 50), 2: (106, 96, 80), 3: (26, 48, 72), 4: (58, 58, 66)}
twp = tw * scale
for i, g in enumerate(gids):
    tx, ty = i % W, i // W
    c = fill.get(g)
    if not c: continue
    x0, y0 = tx * twp, ty * twp
    draw.rectangle([x0, y0, x0 + twp + 0.5, y0 + twp + 0.5], fill=c)

def P(x, y):
    return (x * scale, y * scale)

for d in data["districts"]:
    x, y, w, h = d["x"], d["y"], d["w"], d["h"]
    box = [P(x - w/2, y - h/2), P(x + w/2, y + h/2)]
    draw.ellipse([box[0], box[1]], outline=(200, 180, 80, 180), width=2)
    draw.text(P(d["signX"], d["signY"]), d["label"], fill=(230, 220, 180))

for b in data["buildings"]:
    a = b["aabb"]
    draw.rectangle([P(a["L"], a["T"]), P(a["R"], a["B"])], outline=(240, 180, 60), width=2)
    draw.rectangle([P(b["x"]-4, b["y"]-4), P(b["x"]+4, b["y"]+4)], fill=(240, 200, 80))
    draw.text(P(b["x"]+6, b["y"]-10), b["prop"].replace("prop_", ""), fill=(255, 220, 120))

for n in data["npcs"]:
    col = (90, 160, 255) if n["gid"] in (1, 2) else (224, 70, 70)
    draw.ellipse([P(n["x"]-10, n["y"]-10), P(n["x"]+10, n["y"]+10)], fill=col)
    draw.text(P(n["x"]+8, n["y"]-14), n["id"].replace("town_", ""), fill=(255, 255, 255))

sp = data["spawn"]
draw.rectangle([P(sp["x"]-8, sp["y"]-8), P(sp["x"]+8, sp["y"]+8)], fill=(255, 204, 136))

img.save("/home/owned/EmperyWorldGame/svodka/haven-spatial-audit.png")
print("wrote", "/home/owned/EmperyWorldGame/svodka/haven-spatial-audit.png")
