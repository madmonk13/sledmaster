"""Draws the Just Sled app icons into icons/: a penguin flying its winged red sled through a sunset.

Usage: python3 tools/make_icons.py   (needs Pillow)
Everything important sits inside the central 80% so the icon also works as a
maskable icon on Android.
"""
import os
from PIL import Image, ImageDraw

S = 1024  # draw large, then downscale for smooth edges
OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "icons")

BLACK, WHITE, ORANGE = (0x23, 0x26, 0x2e), (0xf7, 0xf7, 0xf2), (0xff, 0x9a, 0x2e)
RED, RED_DARK, GOLD = (0xd8, 0x3a, 0x2b), (0xa8, 0x2f, 0x23), (0xf5, 0xc5, 0x18)


def lerp(a, b, t):
    return tuple(round(a[i] + (b[i] - a[i]) * t) for i in range(3))


def wing(d, root, tip_dir):
    """A swept wing from the root, layered feathers fanning out along the trailing edge."""
    rx, ry = root
    sx = tip_dir  # -1 spreads left, 1 spreads right
    outline = [(rx, ry), (rx + sx * 330, ry - 210), (rx + sx * 360, ry - 170),
               (rx + sx * 300, ry - 70), (rx + sx * 200, ry + 10), (rx + sx * 60, ry + 70)]
    d.polygon(outline, fill=(0xe9, 0xf1, 0xfa))
    for i, (fx, fy) in enumerate([(300, -110), (240, -50), (170, 10), (95, 55)]):
        cx, cy = rx + sx * fx, ry + fy
        d.ellipse([cx - 62, cy - 30, cx + 62, cy + 30], fill=(0xd2, 0xe0, 0xf0) if i % 2 else (0xff, 0xff, 0xff))
    d.line([(rx, ry), (rx + sx * 345, ry - 195)], fill=(0xc0, 0xd2, 0xe6), width=14)


def flyer():
    """Penguin sitting on its red sled, wings spread wide."""
    layer = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    wing(d, (430, 600), -1)
    wing(d, (600, 600), 1)
    # sled: deck, curled front and runners
    d.rounded_rectangle([290, 700, 760, 760], radius=24, fill=RED)
    d.polygon([(730, 700), (820, 610), (850, 635), (760, 735)], fill=RED_DARK)
    d.line([(300, 800), (770, 800)], fill=(0x6e, 0x75, 0x80), width=16)
    d.line([(770, 800), (850, 735)], fill=(0x6e, 0x75, 0x80), width=16)
    for x in (360, 690):
        d.line([(x, 760), (x, 800)], fill=(0x6e, 0x75, 0x80), width=12)
    # penguin
    d.ellipse([400, 440, 650, 740], fill=BLACK)  # body
    d.ellipse([455, 510, 625, 735], fill=WHITE)  # belly
    d.ellipse([430, 300, 640, 500], fill=BLACK)  # head
    d.ellipse([480, 340, 640, 480], fill=WHITE)  # face
    for ex in (530, 588):
        d.ellipse([ex, 375, ex + 32, 407], fill=BLACK)  # eyes
        d.ellipse([ex + 11, 381, ex + 22, 392], fill=WHITE)
    d.polygon([(560, 425), (612, 425), (586, 470)], fill=ORANGE)  # beak
    d.rounded_rectangle([425, 480, 655, 515], radius=18, fill=(0xe8, 0x4a, 0x3a))  # scarf
    d.polygon([(440, 495), (300, 450), (290, 495), (440, 520)], fill=(0xe8, 0x4a, 0x3a))
    d.ellipse([600, 690, 710, 735], fill=ORANGE)  # feet
    d.ellipse([650, 680, 760, 725], fill=ORANGE)
    return layer


def coin(d, cx, cy, r):
    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=GOLD, outline=(0xc9, 0x96, 0x0c), width=max(3, r // 6))
    d.ellipse([cx - r * 0.45, cy - r * 0.45, cx + r * 0.45, cy + r * 0.45], outline=(0xff, 0xe2, 0x7a), width=max(3, r // 7))


def draw():
    img = Image.new("RGB", (S, S))
    d = ImageDraw.Draw(img)
    top, mid, bottom = (0x4b, 0x2a, 0x7a), (0xf0, 0x6e, 0x5a), (0xff, 0xc8, 0x6b)
    for y in range(S):
        t = y / S
        d.line([(0, y), (S, y)], fill=lerp(top, mid, t / 0.55) if t < 0.55 else lerp(mid, bottom, (t - 0.55) / 0.45))

    # setting sun and drifting cloud bands
    d.ellipse([560, 560, 900, 900], fill=(0xff, 0xe3, 0x8a))
    for x0, y0, w in [(80, 250, 260), (640, 180, 240), (700, 460, 220)]:
        d.rounded_rectangle([x0, y0, x0 + w, y0 + 34], radius=17, fill=(0xff, 0xb3, 0x9a))

    # rolling hills in evening shade
    d.ellipse([-300, 760, 600, 1300], fill=(0xb7, 0xa6, 0xd8))
    d.ellipse([380, 800, 1400, 1360], fill=(0xd9, 0xcc, 0xef))
    d.ellipse([-200, 880, 900, 1400], fill=(0xf4, 0xef, 0xfb))

    # coin trail curving up behind the sled
    for cx, cy, r in [(150, 760, 30), (230, 690, 36), (320, 640, 42)]:
        coin(d, cx, cy, r)

    p = flyer().rotate(14, resample=Image.BICUBIC, center=(512, 600)).resize((760, 760), Image.LANCZOS)
    img.paste(p, (170, 60), p)
    return img


if __name__ == "__main__":
    os.makedirs(OUT, exist_ok=True)
    big = draw()
    for name, size in [("icon-512.png", 512), ("icon-192.png", 192), ("apple-touch-icon.png", 180), ("favicon-32.png", 32)]:
        big.resize((size, size), Image.LANCZOS).save(os.path.join(OUT, name))
    print("wrote", OUT)
