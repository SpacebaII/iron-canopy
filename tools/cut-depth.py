#!/usr/bin/env python3
"""Iron Canopy: depth maps for the painted cutscene panels, for the viewer's parallax (render-cutlife.js).

For every iron-canopy/art/cut/<name>.jpg without a depth map, writes iron-canopy/art/cut/depth/<name>.jpg:
a grey picture at 960 x 540, white near the camera and black far away. Run it again after adding paintings.

Uses Depth Anything V2 Small (Apache 2.0) through onnxruntime, on the CPU:
  pip install onnxruntime pillow numpy
  curl -L -o model.onnx https://huggingface.co/onnx-community/depth-anything-v2-small/resolve/main/onnx/model.onnx
  python3 tools/cut-depth.py --model model.onnx [--force] [names...]
"""
import argparse, os, sys
import numpy as np
from PIL import Image, ImageFilter

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'iron-canopy', 'art', 'cut')
W, H = 924, 518            # the model's input: multiples of 14 at 16:9
OUT = (960, 540)
MEAN, STD = np.array([0.485, 0.456, 0.406]), np.array([0.229, 0.224, 0.225])

def depth(sess, path):
    im = Image.open(path).convert('RGB')
    x = (np.asarray(im.resize((W, H), Image.BICUBIC), dtype=np.float32) / 255 - MEAN) / STD
    d = sess.run(None, {'pixel_values': x.transpose(2, 0, 1)[None].astype(np.float32)})[0][0]
    lo, hi = np.percentile(d, 2), np.percentile(d, 98)    # the model's depth is relative: stretch each panel's own range
    d = np.clip((d - lo) / max(hi - lo, 1e-6), 0, 1) ** 0.8
    g = Image.fromarray((d * 255).astype(np.uint8)).resize(OUT, Image.BICUBIC)
    # a slight blur and a grow of the near side, so an edge's near part carries its own border when it slides
    return g.filter(ImageFilter.MaxFilter(5)).filter(ImageFilter.GaussianBlur(1.5))

def main():
    a = argparse.ArgumentParser()
    a.add_argument('--model', required=True); a.add_argument('--force', action='store_true'); a.add_argument('names', nargs='*')
    o = a.parse_args()
    import onnxruntime as ort
    sess = ort.InferenceSession(o.model, providers=['CPUExecutionProvider'])
    os.makedirs(os.path.join(ROOT, 'depth'), exist_ok=True)
    names = o.names or sorted(f[:-4] for f in os.listdir(ROOT) if f.endswith('.jpg'))
    for n in names:
        src, dst = os.path.join(ROOT, n + '.jpg'), os.path.join(ROOT, 'depth', n + '.jpg')
        if not os.path.exists(src) or (os.path.exists(dst) and not o.force): continue
        depth(sess, src).save(dst, quality=88)
        print('depth', n, file=sys.stderr)

if __name__ == '__main__':
    main()
