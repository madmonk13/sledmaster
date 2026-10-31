"""Draws the Just Sled app icons into icons/ (penguin on a red sled on a snowy slope).

Usage: python3 tools/make_icons.py   (needs Pillow)
Everything important sits inside the central 80% so the icon also works as a
maskable icon on Android.
"""
import os
from PIL import Image, ImageDraw

S = 1024  # draw large, then downscale for smooth edges
OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "icons")


def lerp(a, b, t):
    return tuple(round(a[i] + (b[i] - a[i]) * t) for i in range(3))


def draw():
    img = Image.new("RGB", (S, S))
    d = ImageDraw.Draw(img)
    top, bottom = (0x4f, 0xa3, 0xe3), (0xd4, 0xec, 0xff)
    for y in range(S):
        d.line([(0, y), (S, y)], fill=lerp(top, bottom, y / S))

    # mountains and a cloud behind
    d.polygon([(90, 640), (330, 300), (560, 640)], fill=(0xa9, 0xbf, 0xd6))
    d.polygon([(260, 380), (330, 300), (395, 380), (360, 400), (330, 375), (295, 400)], fill="white")
    d.polygon([(480, 640), (760, 250), (1000, 640)], fill=(0x93, 0xab, 0xc6))
    d.polygon([(680, 360), (760, 250), (835, 355), (795, 380), (760, 350), (720, 385)], fill="white")
    for cx, cy, r in [(250, 215, 62), (320, 190, 80), (400, 215, 60)]:
        d.ellipse([cx - r, cy - r, cx + r, cy + r], fill="white")

    # snow slope
    d.polygon([(0, 700), (S, 560), (S, S), (0, S)], fill=(0xf7, 0xfb, 0xff))
    d.polygon([(0, 760), (S, 640), (S, 660), (0, 790)], fill=(0xe4, 0xed, 0xf6))

    # sled (tilted with the slope) and runners
    d.polygon([(250, 742), (790, 672), (802, 712), (262, 784)], fill=(0xc0, 0x39, 0x2b))
    d.polygon([(790, 672), (850, 620), (868, 640), (802, 712)], fill=(0xa8, 0x2f, 0x23))
    d.line([(255, 822), (812, 750)], fill=(0x6e, 0x75, 0x80), width=16)
    d.line([(812, 750), (862, 700)], fill=(0x6e, 0x75, 0x80), width=16)
    for x, y in [(330, 785), (700, 735)]:
        d.line([(x, y), (x + 4, y + 28)], fill=(0x6e, 0x75, 0x80), width=12)

    # penguin sitting on the sled
    black, white, orange = (0x23, 0x26, 0x2e), (0xf7, 0xf7, 0xf2), (0xff, 0x9a, 0x2e)
    d.ellipse([400, 440, 650, 760], fill=black)  # body
    d.ellipse([455, 520, 625, 755], fill=white)  # belly
    d.ellipse([430, 300, 640, 500], fill=black)  # head
    d.ellipse([480, 340, 640, 480], fill=white)  # face
    d.ellipse([530, 375, 562, 407], fill=black)  # eye
    d.ellipse([588, 375, 620, 407], fill=black)
    d.ellipse([541, 381, 552, 392], fill="white")
    d.ellipse([599, 381, 610, 392], fill="white")
    d.polygon([(560, 425), (612, 425), (586, 470)], fill=orange)  # beak
    d.rounded_rectangle([425, 480, 655, 515], radius=18, fill=(0xe8, 0x4a, 0x3a))  # scarf
    d.polygon([(440, 495), (330, 470), (320, 510), (440, 520)], fill=(0xe8, 0x4a, 0x3a))  # scarf tail
    d.ellipse([610, 700, 720, 745], fill=orange)  # feet out front
    d.ellipse([660, 690, 770, 735], fill=orange)
    return img


if __name__ == "__main__":
    os.makedirs(OUT, exist_ok=True)
    big = draw()
    for name, size in [("icon-512.png", 512), ("icon-192.png", 192), ("apple-touch-icon.png", 180), ("favicon-32.png", 32)]:
        big.resize((size, size), Image.LANCZOS).save(os.path.join(OUT, name))
    print("wrote", OUT)
