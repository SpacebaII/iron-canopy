"""Inks the cutscenes' 3D action panels (brief 70) so they sit beside the painted ones: flat colour in a few tones,
black ink on the edges, halftone dots in the shadows, a muted palette and paper grain.
Usage: python3 tools/comic-ink.py [shots/cut] [iron-canopy/art/cut]
Reads 3d-cut-<art>.jpg from the first folder (tools/view3d-shots.js cut --out cut) and writes <art>.jpg to the second."""
import os
import sys

import numpy as np
from PIL import Image, ImageFilter, ImageOps, ImageEnhance

W, H = 1600, 900


def ink(img):
    img = ImageOps.fit(img.convert('RGB'), (W, H), Image.LANCZOS)
    # flat colour: smooth away texture, then a few tones per channel
    flat = img.filter(ImageFilter.MedianFilter(5)).filter(ImageFilter.MedianFilter(5))
    flat = ImageEnhance.Contrast(ImageEnhance.Color(flat).enhance(1.2)).enhance(1.2)
    s0 = np.asarray(flat).astype(np.float32)
    a = np.round(s0 / 255 * 7) / 7 * 255 * 0.4 + s0 * 0.6
    # muted palette: pull the colours a little toward their grey, and warm the paper
    grey = a.mean(axis=2, keepdims=True)
    a = grey + (a - grey) * 0.95
    a = a * np.array([1.0, 0.97, 0.9]) + np.array([10, 8, 4])
    # halftone in the shadows: dots on a 45-degree grid, bigger where it is darker
    lum = np.asarray(img.convert('L').filter(ImageFilter.GaussianBlur(2))).astype(np.float32) / 255
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    p = 7.0
    u, v = (xx + yy) / np.sqrt(2), (xx - yy) / np.sqrt(2)
    d = np.hypot((u % p) - p / 2, (v % p) - p / 2) / (p / 2)
    r = np.clip((0.4 - lum) / 0.4, 0, 1) * 0.8
    dots = d < r
    a[dots] *= 0.7
    # ink: edges of the smoothed picture, thickened, laid on in black
    g = flat.convert('L').filter(ImageFilter.GaussianBlur(1.4))
    e = np.asarray(g.filter(ImageFilter.FIND_EDGES)).astype(np.float32)
    bold = np.asarray(Image.fromarray(((e > 70) * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(3))) > 0
    k = np.clip((e - 18) / 40, 0, 1) * 0.85
    k[bold] = 0.9
    # (bright lights and trails keep their glow through the ink)
    k *= np.clip((0.85 - lum) / 0.3, 0, 1)
    a = a * (1 - k[..., None]) + 10 * k[..., None]
    # paper grain and a soft dark edge
    rng = np.random.default_rng(70)
    a += rng.normal(0, 5, (H, W, 1))
    vig = 1 - 0.18 * (((xx - W / 2) / (W / 2)) ** 2 + ((yy - H / 2) / (H / 2)) ** 2) ** 1.5
    a *= np.clip(vig, 0.55, 1)[..., None]
    return Image.fromarray(np.clip(a, 0, 255).astype(np.uint8))


def main():
    src = sys.argv[1] if len(sys.argv) > 1 else 'shots/cut'
    out = sys.argv[2] if len(sys.argv) > 2 else 'iron-canopy/art/cut'
    os.makedirs(out, exist_ok=True)
    n = 0
    for f in sorted(os.listdir(src)):
        if not (f.startswith('3d-cut-') and f.endswith('.jpg')):
            continue
        name = f[len('3d-cut-'):]
        ink(Image.open(os.path.join(src, f))).save(os.path.join(out, name), quality=86, optimize=True)
        n += 1
        print('inked', name)
    print(n, 'panels')


if __name__ == '__main__':
    main()
