"""The gameplay clip as a GIF, for places that do not play video: python3 tools/clip-gif.py [frames.mjpeg] [out.gif]

Reads the frames tools/clip.js keeps when run with KEEP=1 (docs/release/iron-canopy-clip.mjpeg), takes every fourth one
(7.5 fps), shrinks them to 432 x 243 (under 10 MB) and writes docs/release/iron-canopy-clip.gif, with one palette
for the whole clip so colours do not flicker. Needs Pillow (pip install pillow); Playwright's ffmpeg has no GIF encoder.
"""
import io
import os
import sys

from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
src = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, '../docs/release/iron-canopy-clip.mjpeg')
out = sys.argv[2] if len(sys.argv) > 2 else os.path.join(HERE, '../docs/release/iron-canopy-clip.gif')
STEP, SIZE = int(os.environ.get('STEP', 4)), (432, 243)

data = open(src, 'rb').read()
# a JPEG starts with FF D8 FF; the file is one after another
jpegs = [b'\xff\xd8\xff' + p for p in data.split(b'\xff\xd8\xff') if p]
frames = [Image.open(io.BytesIO(j)).convert('RGB').resize(SIZE, Image.LANCZOS) for j in jpegs[::STEP]]
# one palette from a spread of frames
sample = Image.new('RGB', (SIZE[0], SIZE[1] * 8))
for k in range(8):
    sample.paste(frames[k * len(frames) // 8], (0, SIZE[1] * k))
pal = sample.quantize(colors=255, method=Image.Quantize.MEDIANCUT)
gif = [f.quantize(palette=pal, dither=Image.Dither.NONE) for f in frames]
gif[0].save(out, save_all=True, append_images=gif[1:], duration=1000 * STEP // 30, loop=0, optimize=True, disposal=1)
print(f'saved {out}: {len(gif)} frames, {os.path.getsize(out) / 1048576:.1f} MB')
