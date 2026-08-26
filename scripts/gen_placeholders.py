#!/usr/bin/env python3
"""One-off generator for lightweight SVG placeholder imagery.
Not part of the deployed site logic — run manually if placeholders
need regenerating. Real photography/video should replace these files
before launch (see README.md for expected filenames and dimensions).
"""
import os

OUT = os.path.join(os.path.dirname(__file__), "..", "images")
os.makedirs(OUT, exist_ok=True)

BG = "#131315"
BG2 = "#1a1a1d"
BORDER = "#2a2a2d"
TEXT = "#8c8b8a"
TEXT2 = "#cfcdc9"
ACCENT = "#ee4236"

TEMPLATE = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" width="{w}" height="{h}" role="img" aria-label="{alt}">
  <rect width="{w}" height="{h}" fill="{bg}"/>
  <rect x="0.5" y="0.5" width="{wm1}" height="{hm1}" fill="none" stroke="{border}" stroke-width="1"/>
  <line x1="0" y1="{h}" x2="{w}" y2="0" stroke="{border}" stroke-width="1"/>
  <rect x="{cx0}" y="{cy0}" width="{cw}" height="6" fill="{accent}"/>
  <text x="{cx}" y="{ty}" fill="{text2}" font-family="Arial, Helvetica, sans-serif" font-size="{fs}" font-weight="700" letter-spacing="2" text-anchor="middle">{label}</text>
  <text x="{cx}" y="{ty2}" fill="{text}" font-family="Arial, Helvetica, sans-serif" font-size="{fs2}" letter-spacing="1" text-anchor="middle">{sub}</text>
</svg>"""


def make(path, w, h, label, sub, alt):
    fs = max(18, min(w, h) // 14)
    fs2 = max(12, fs // 2)
    cx = w / 2
    cy = h / 2
    svg = TEMPLATE.format(
        w=w, h=h, wm1=w - 1, hm1=h - 1, bg=BG, border=BORDER,
        accent=ACCENT, text=TEXT, text2=TEXT2,
        cx0=cx - 40, cy0=cy - fs, cw=80,
        cx=cx, ty=cy + fs * 0.15, ty2=cy + fs * 0.15 + fs2 + 14,
        fs=fs, fs2=fs2, label=label, sub=sub, alt=alt,
    )
    with open(path, "w") as f:
        f.write(svg)
    print("wrote", path)


# name, w, h, label, sub, alt-text
items = [
    ("hero-placeholder.svg", 1920, 1200, "HERO — LIVE AT THE DECKS",
     "REPLACE: photo of Rick Duncan actively mixing on Technics turntables",
     "Placeholder hero image: Rick Duncan performing on Technics turntables"),
    ("showreel-poster.svg", 1920, 1080, "SHOWREEL POSTER",
     "REPLACE: video poster frame, 1920x1080",
     "Placeholder poster image for the Just:DJ showreel video"),
    ("studio-placeholder.svg", 1600, 1000, "BROADCAST STUDIO",
     "REPLACE: full studio / OBS output photo, 1600x1000",
     "Placeholder image of the Just:DJ broadcast studio setup"),
    ("vinyl-placeholder.svg", 1600, 1000, "TURNTABLES + DVS",
     "REPLACE: close-up of Technics turntables and control vinyl",
     "Placeholder image of Technics turntables with control vinyl"),
    ("intro-turntables.svg", 800, 600, "TURNTABLES",
     "REPLACE: Technics 1210-style turntable detail",
     "Placeholder image of turntables"),
    ("intro-mixer.svg", 800, 600, "MIXER",
     "REPLACE: DJ mixer detail shot",
     "Placeholder image of a DJ mixer"),
    ("intro-hands.svg", 800, 600, "HANDS ON VINYL",
     "REPLACE: hands on vinyl / control vinyl",
     "Placeholder image of hands mixing on vinyl"),
    ("intro-broadcast.svg", 800, 600, "BROADCAST FEED",
     "REPLACE: finished multi-camera broadcast feed",
     "Placeholder image of the finished broadcast feed"),
    ("performance-01.svg", 1280, 720, "HOUSE / TECHNO",
     "REPLACE: performance still, 1280x720",
     "Placeholder thumbnail for a house and techno performance"),
    ("performance-02.svg", 1280, 720, "TRANCE / HARDER",
     "REPLACE: performance still, 1280x720",
     "Placeholder thumbnail for a trance and harder dance performance"),
    ("performance-03.svg", 1280, 720, "JUNGLE / D&B / HARDCORE",
     "REPLACE: performance still, 1280x720",
     "Placeholder thumbnail for a jungle, drum and bass and hardcore performance"),
    ("performance-04.svg", 1280, 720, "FEATURED PERFORMANCE",
     "REPLACE: featured performance still, 1280x720",
     "Placeholder thumbnail for the featured performance"),
    ("performance-05.svg", 1280, 720, "HOUSE / TECHNO — SET 2",
     "REPLACE: performance still, 1280x720",
     "Placeholder thumbnail for a further house and techno performance"),
    ("performance-06.svg", 1280, 720, "TRANCE / HARD DANCE — SET 2",
     "REPLACE: performance still, 1280x720",
     "Placeholder thumbnail for a further trance and hard dance performance"),
    ("performance-07.svg", 1280, 720, "SCRATCH / TURNTABLISM",
     "REPLACE: performance still, 1280x720",
     "Placeholder thumbnail for a scratch and turntablism routine"),
    ("performance-08.svg", 1280, 720, "HARDCORE / OLDSKOOL",
     "REPLACE: performance still, 1280x720",
     "Placeholder thumbnail for a hardcore and oldskool performance"),
]

squares = [
    ("show-01.svg", "FREQUENCY"),
    ("show-02.svg", "SOLAR STATE"),
    ("show-03.svg", "N:PULSE"),
    ("show-04.svg", "FOUR FOUR"),
    ("show-05.svg", "TRANSMISSION"),
    ("show-06.svg", "HYPER DRIVE"),
    ("show-07.svg", "TRANCE ARENA"),
    ("show-08.svg", "VIVA BOUNCE"),
]

for name, w, h, label, sub, alt in items:
    make(os.path.join(OUT, name), w, h, label, sub, alt)

for name, label in squares:
    make(os.path.join(OUT, name), 1200, 1200, label,
         "PLACEHOLDER ARTWORK — replace with existing show artwork",
         "Placeholder square artwork for the " + label.title() + " show edition")

print("done")
