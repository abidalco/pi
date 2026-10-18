"""Green-screen key for the generated sheets → RGBA PNGs (plus a gridded preview for picking joints)."""
import sys
import numpy as np
from PIL import Image, ImageDraw


def key(path):
    a = np.asarray(Image.open(path).convert("RGB")).astype(np.float32)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    green = g - np.maximum(r, b)                                   # how much greener than the other channels
    dom = (g > r * 1.22) & (g > b * 1.08)                          # green-dominant hue, any brightness (catches shadows)
    alpha = 1 - np.clip((green - 18) / 40, 0, 1)
    alpha[dom & (green > 30)] = 0
    a[..., 1] = np.where(green > 0, np.maximum(r, b) + np.minimum(green, 0), g)   # despill the fringe
    out = np.dstack([a, alpha * 255]).astype(np.uint8)
    return Image.fromarray(out, "RGBA")


if __name__ == "__main__":
    for f in sys.argv[1:]:
        im = key(f)
        im.save(f.replace(".jpg", "_key.png"))
        print(f, im.size)
