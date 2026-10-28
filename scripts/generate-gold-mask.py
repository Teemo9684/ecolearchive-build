"""Generate a gold-only alpha mask from the approved source logo.

The original logo is never modified. The sweep highlights only warm gold pixels,
never transparent gaps or dark blue/black background.
"""
from pathlib import Path
from PIL import Image

root = Path(__file__).resolve().parents[1]
source = root / "src/assets/school-logo.png"
target = root / "src/assets/school-logo-gold-mask.png"
im = Image.open(source).convert("RGBA")
out = Image.new("RGBA", im.size)
src = im.load()
dst = out.load()
for y in range(im.height):
    for x in range(im.width):
        r, g, b, alpha = src[x,y]
        gold = max(0.0, min(1.0, (r-g-4)/23)) * max(0.0, min(1.0, (g-b-3)/17)) * max(0.0, min(1.0, (r-70)/65))
        dst[x,y] = (255, 255, 255, round(alpha * gold))
out.save(target, optimize=True)
print(f"Generated original-logo gold-only alpha mask: {target}")
