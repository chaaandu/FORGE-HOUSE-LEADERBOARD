#!/usr/bin/env python3
"""
Prepare house crests for the leaderboard.

Drop the raw crest images into crests-source/ and run:

    python3 tools/prepare-crests.py

It writes web-ready PNGs into public/assets/logos/ and leaves the originals
in crests-source/ untouched.

What it does to each crest:

  1. Makes the background transparent. It flood-fills inwards from the border,
     so dark areas INSIDE the shield are preserved - a naive "delete all black"
     would punch holes through the artwork.
  2. Softens the anti-aliased fringe, so there is no dark halo where the crest
     meets the cream page background.
  3. Trims to the artwork.
  4. Scales every crest to the SAME height and centres it on an identical
     canvas. This is the bit that matters: the source files have different
     proportions and different amounts of built-in padding, so without this
     step the four crests render at visibly different sizes on the cards.
  5. Downscales for the web. The sources are ~500KB each and are displayed at
     between 68px and 190px.

Pure standard library, because this machine has no PIL and the project has a
no-dependencies rule. It handles 8-bit RGB/RGBA/greyscale PNGs. If you have
JPEGs, export them as PNG first.
"""

import os
import struct
import sys
import zlib
from collections import deque

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
SRC_DIR = os.path.join(ROOT, 'crests-source')
OUT_DIR = os.path.join(ROOT, 'public', 'assets', 'logos')

# Output filenames must match the "logo" paths in public/config.js.
HOUSES = ['vikings', 'gladiators', 'samurai', 'knights']

# Every crest ends up on this exact canvas, so they all occupy the same
# footprint on screen no matter what shape the source art was.
CANVAS_W = 420
CANVAS_H = 620
ART_H = 600          # artwork height inside the canvas, leaving a small margin

BG_MAX = 70          # a border-connected pixel this dark counts as background
FRINGE = 150         # below this luma, an edge pixel gets partial alpha


# ----------------------------------------------------------------- PNG I/O

def decode_png(path):
    """Returns (width, height, rows) with rows as RGBA bytearrays."""
    data = open(path, 'rb').read()
    if data[:8] != b'\x89PNG\r\n\x1a\n':
        raise ValueError('not a PNG file')

    pos, idat, plte, trns = 8, b'', None, None
    w = h = bd = ct = None
    while pos < len(data):
        ln = struct.unpack('>I', data[pos:pos + 4])[0]
        tag = data[pos + 4:pos + 8]
        chunk = data[pos + 8:pos + 8 + ln]
        if tag == b'IHDR':
            w, h, bd, ct, _, _, interlace = struct.unpack('>IIBBBBB', chunk)
            if interlace:
                raise ValueError('interlaced PNGs are not supported, re-export without interlacing')
            if bd != 8:
                raise ValueError('only 8-bit PNGs are supported (this one is %d-bit)' % bd)
        elif tag == b'IDAT':
            idat += chunk
        elif tag == b'PLTE':
            plte = chunk
        elif tag == b'tRNS':
            trns = chunk
        pos += 12 + ln

    channels = {0: 1, 2: 3, 3: 1, 4: 2, 6: 4}[ct]
    stride = w * channels
    raw = zlib.decompress(idat)

    rows = []
    prev = bytearray(stride)
    for y in range(h):
        f = raw[y * (stride + 1)]
        line = bytearray(raw[y * (stride + 1) + 1:(y + 1) * (stride + 1)])
        if f:
            for i in range(stride):
                a = line[i - channels] if i >= channels else 0
                b = prev[i]
                c = prev[i - channels] if i >= channels else 0
                if f == 1:
                    line[i] = (line[i] + a) & 255
                elif f == 2:
                    line[i] = (line[i] + b) & 255
                elif f == 3:
                    line[i] = (line[i] + (a + b) // 2) & 255
                elif f == 4:
                    p = a + b - c
                    pa, pb, pc = abs(p - a), abs(p - b), abs(p - c)
                    pr = a if (pa <= pb and pa <= pc) else (b if pb <= pc else c)
                    line[i] = (line[i] + pr) & 255
                else:
                    raise ValueError('bad PNG filter type %d' % f)
        rows.append(line)
        prev = line

    # Normalise everything to RGBA.
    out = []
    for line in rows:
        rgba = bytearray(w * 4)
        for x in range(w):
            o = x * 4
            if ct == 6:
                rgba[o:o + 4] = line[x * 4:x * 4 + 4]
            elif ct == 2:
                rgba[o:o + 3] = line[x * 3:x * 3 + 3]
                rgba[o + 3] = 255
            elif ct == 0:
                v = line[x]
                rgba[o] = rgba[o + 1] = rgba[o + 2] = v
                rgba[o + 3] = 255
            elif ct == 4:
                v = line[x * 2]
                rgba[o] = rgba[o + 1] = rgba[o + 2] = v
                rgba[o + 3] = line[x * 2 + 1]
            elif ct == 3:
                idx = line[x]
                rgba[o:o + 3] = plte[idx * 3:idx * 3 + 3]
                rgba[o + 3] = trns[idx] if (trns and idx < len(trns)) else 255
        out.append(rgba)
    return w, h, out


def encode_png(path, w, h, rows):
    raw = b''.join(b'\x00' + bytes(r) for r in rows)

    def chunk(tag, payload):
        body = tag + payload
        return struct.pack('>I', len(payload)) + body + struct.pack('>I', zlib.crc32(body) & 0xffffffff)

    blob = b'\x89PNG\r\n\x1a\n'
    blob += chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 6, 0, 0, 0))
    blob += chunk(b'IDAT', zlib.compress(raw, 9))
    blob += chunk(b'IEND', b'')
    open(path, 'wb').write(blob)


# ------------------------------------------------------------- processing

def luma(r, g, b):
    return (r * 299 + g * 587 + b * 114) // 1000


def strip_background(w, h, rows):
    """Flood fill the background in from the border and clear it."""
    already_transparent = sum(
        1 for y in range(0, h, 8) for x in range(0, w, 8) if rows[y][x * 4 + 3] == 0
    )
    sampled = len(range(0, h, 8)) * len(range(0, w, 8))
    # If the art already has a transparent background, leave it alone.
    if sampled and already_transparent / float(sampled) > 0.05:
        return False

    bg = bytearray(w * h)
    q = deque()

    def consider(x, y):
        if 0 <= x < w and 0 <= y < h and not bg[y * w + x]:
            o = x * 4
            px = rows[y]
            if px[o + 3] == 0 or luma(px[o], px[o + 1], px[o + 2]) <= BG_MAX:
                bg[y * w + x] = 1
                q.append((x, y))

    for x in range(w):
        consider(x, 0)
        consider(x, h - 1)
    for y in range(h):
        consider(0, y)
        consider(w - 1, y)
    while q:
        x, y = q.popleft()
        consider(x + 1, y)
        consider(x - 1, y)
        consider(x, y + 1)
        consider(x, y - 1)

    for y in range(h):
        for x in range(w):
            if bg[y * w + x]:
                rows[y][x * 4 + 3] = 0

    # Soften the fringe so the crest does not get a hard dark outline.
    for y in range(h):
        for x in range(w):
            i = y * w + x
            if bg[i]:
                continue
            touching = ((x > 0 and bg[i - 1]) or (x < w - 1 and bg[i + 1]) or
                        (y > 0 and bg[i - w]) or (y < h - 1 and bg[i + w]))
            if not touching:
                continue
            o = x * 4
            lu = luma(rows[y][o], rows[y][o + 1], rows[y][o + 2])
            if lu < FRINGE:
                rows[y][o + 3] = max(0, min(255, int(255 * lu / FRINGE)))
    return True


def bounding_box(w, h, rows):
    x0, y0, x1, y1 = w, h, -1, -1
    for y in range(h):
        row = rows[y]
        for x in range(w):
            if row[x * 4 + 3] > 8:
                if x < x0: x0 = x
                if x > x1: x1 = x
                if y < y0: y0 = y
                if y > y1: y1 = y
    if x1 < 0:
        raise ValueError('image is fully transparent after background removal')
    return x0, y0, x1, y1


def resample(rows, sx0, sy0, sw, sh, dw, dh):
    """Box downscale. Premultiplied, so transparent pixels do not darken edges."""
    out = []
    for ny in range(dh):
        ya = sy0 + ny * sh // dh
        yb = max(ya + 1, sy0 + (ny + 1) * sh // dh)
        line = bytearray(dw * 4)
        for nx in range(dw):
            xa = sx0 + nx * sw // dw
            xb = max(xa + 1, sx0 + (nx + 1) * sw // dw)
            ar = ag = ab = aa = n = 0
            for sy in range(ya, yb):
                row = rows[sy]
                for sx in range(xa, xb):
                    o = sx * 4
                    a = row[o + 3]
                    ar += row[o] * a
                    ag += row[o + 1] * a
                    ab += row[o + 2] * a
                    aa += a
                    n += 1
            o = nx * 4
            if aa:
                line[o] = min(255, ar // aa)
                line[o + 1] = min(255, ag // aa)
                line[o + 2] = min(255, ab // aa)
            line[o + 3] = aa // n
        out.append(line)
    return out


def find_source(house):
    """Match a source file to a house name, tolerating case and plurals."""
    if not os.path.isdir(SRC_DIR):
        return None
    best = None
    for fn in sorted(os.listdir(SRC_DIR)):
        stem, ext = os.path.splitext(fn)
        if ext.lower() not in ('.png', '.jpg', '.jpeg', '.webp'):
            continue
        key = ''.join(ch for ch in stem.lower() if ch.isalpha())
        if key == house or key == house + 's' or key.startswith(house) or house.startswith(key):
            if ext.lower() != '.png':
                print('  !  %s is a %s. Export it as PNG and run this again.' % (fn, ext[1:].upper()))
                continue
            best = os.path.join(SRC_DIR, fn)
            if key == house:
                break
    return best


def process(house):
    src = find_source(house)
    if not src:
        print('  -  %-11s no source file found in crests-source/, left as is' % house)
        return False

    w, h, rows = decode_png(src)
    stripped = strip_background(w, h, rows)
    x0, y0, x1, y1 = bounding_box(w, h, rows)
    cw, ch = x1 - x0 + 1, y1 - y0 + 1

    # Scale to a common artwork height, so all four read as the same size.
    scale = float(ART_H) / ch
    dh = ART_H
    dw = max(1, int(round(cw * scale)))
    if dw > CANVAS_W:                      # very wide crest: fit to width instead
        dw = CANVAS_W
        dh = max(1, int(round(ch * float(CANVAS_W) / cw)))

    art = resample(rows, x0, y0, cw, ch, dw, dh)

    # Centre on the shared canvas.
    canvas = [bytearray(CANVAS_W * 4) for _ in range(CANVAS_H)]
    ox = (CANVAS_W - dw) // 2
    oy = (CANVAS_H - dh) // 2
    for y in range(dh):
        canvas[oy + y][ox * 4:(ox + dw) * 4] = art[y]

    out_path = os.path.join(OUT_DIR, house + '.png')
    encode_png(out_path, CANVAS_W, CANVAS_H, canvas)

    print('  ok %-11s %-16s %s  %4dKB -> %3dKB  %s' % (
        house,
        os.path.basename(src),
        '%dx%d' % (CANVAS_W, CANVAS_H),
        os.path.getsize(src) // 1024,
        os.path.getsize(out_path) // 1024,
        'background removed' if stripped else 'already transparent'))
    return True


def main():
    if not os.path.isdir(SRC_DIR):
        print('No crests-source/ folder. Create it and put the crest PNGs inside.')
        return 1
    if not os.path.isdir(OUT_DIR):
        os.makedirs(OUT_DIR)

    print('Reading from crests-source/, writing to public/assets/logos/')
    print('All crests normalised to %dx%d with %dpx artwork height.\n' % (CANVAS_W, CANVAS_H, ART_H))

    done = 0
    for house in HOUSES:
        try:
            if process(house):
                done += 1
        except Exception as exc:
            print('  !  %-11s failed: %s' % (house, exc))

    print('\n%d of %d crests written.' % (done, len(HOUSES)))
    if done < len(HOUSES):
        print('Name the source files after the houses, e.g. Vikings.png, Knights.png.')
    return 0


if __name__ == '__main__':
    sys.exit(main())
