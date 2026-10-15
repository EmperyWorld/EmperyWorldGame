#!/usr/bin/env python3
"""Ad-hoc real-ish render of Haven: ground tiles + real house webp thumbnails + prop boxes.
Not part of the pipeline — throwaway visual sanity check."""
import json
import re
from pathlib import Path
from PIL import Image, ImageDraw

root = Path("/home/owned/EmperyWorldGame")
TW = 64
W, H = 80, 56
SCALE = 3  # render at 3x tile res for clarity

tiled = json.loads((root / "apps/client/public/maps/empery_haven.json").read_text())
layer0 = tiled["layers"][0]["data"]

fill = {
    1: (150, 130, 95), 5: (150, 130, 95), 6: (150, 130, 95),
    2: (120, 112, 100), 7: (120, 112, 100), 8: (120, 112, 100),
    3: (35, 60, 90), 4: (55, 55, 63),
}

pw, ph = W * TW * SCALE // TW, H * TW * SCALE // TW  # placeholder, recompute
tile_px = SCALE * 16  # render each tile as 16*SCALE px block (downsample factor 4 from 64)
pw, ph = W * tile_px, H * tile_px
img = Image.new("RGB", (pw, ph), (10, 10, 12))
draw = ImageDraw.Draw(img, "RGBA")

for i, g in enumerate(layer0):
    tx, ty = i % W, i // W
    c = fill.get(g, (20, 20, 24))
    x0, y0 = tx * tile_px, ty * tile_px
    draw.rectangle([x0, y0, x0 + tile_px, y0 + tile_px], fill=c)

# props
src = (root / "packages/shared/src/haven-city-data.ts").read_text()
m = re.search(r"HAVEN_CITY_PROPS.*?=\s*\[(.*)\];", src, re.S)
body = m.group(1)
rows = re.findall(r"\[\s*\"([^\"]+)\",\s*([\-\d.]+),\s*([\-\d.]+),\s*([\-\d.]+),\s*([\-\d.]+)\s*\]", body)
props = [(r[0], float(r[1]), float(r[2]), float(r[3]), float(r[4])) for r in rows]
print("props:", len(props))

assets_dir = root / "data/generated/assets"
img_cache = {}

def get_thumb(prop_id, px_size):
    key = (prop_id, px_size)
    if key in img_cache:
        return img_cache[key]
    p = assets_dir / f"{prop_id}.webp"
    if not p.exists():
        img_cache[key] = None
        return None
    im = Image.open(p).convert("RGBA")
    im = im.resize((px_size, px_size), Image.LANCZOS)
    img_cache[key] = im
    return im

def world_to_px(x, y):
    return x / TW * tile_px, y / TW * tile_px

props_sorted = sorted(props, key=lambda p: p[2])  # painter's algo by y

missing = set()
for pid, x, y, size, depth in props_sorted:
    px_size = max(2, int(size / TW * tile_px))
    thumb = get_thumb(pid, px_size)
    px, py = world_to_px(x, y)
    if thumb:
        left = int(px - px_size * 0.5)
        top = int(py - px_size * 0.72)
        img.paste(thumb, (left, top), thumb)
    else:
        missing.add(pid)
        hs = px_size / 2
        col = (255, 80, 220) if size >= 120 else (120, 120, 130)
        draw.rectangle([px - hs, py - hs, px + hs, py + hs], outline=col, width=1)

print("missing art for", len(missing), "prop ids:", sorted(missing)[:40])

img.save(root / "svodka/haven-real-render.png")
print("wrote svodka/haven-real-render.png", img.size)
