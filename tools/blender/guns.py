"""
66.0: the four guns, modelled in Blender from code. Run (from the repo root):

  /Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup -P tools/blender/guns.py -- \
      [--only kitsune9,hornet,jackal,shotgun] [--out public/models/guns] [--preview DIR] [--finish military|blaster]

Each gun is laid out on its old box model's numbers (src/entities/weapons/*.ts: the sight line, the
muzzle, the grip under the hand, the magazine's well), so the hands, the aim and the flash still fit.
Gun space: +Y up, -Z down the barrel, metres; the right side is +X.
"""

import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import gunlib as L  # noqa: E402
from gunlib import box_raw, cut, cut_many, cyl_raw, front_raw, octagon, prism_raw, rail_raw  # noqa: E402


def serrations(n, z0, step, w, depth, y0, y1, side_x, rx=0.0):
    """Cutters for slide serrations on both sides: n slanted slots from z0, `step` apart."""
    out = []
    for i in range(n):
        z = z0 + i * step
        for s in (-1, 1):
            out.append(box_raw(depth * 2, y1 - y0, w, s * side_x, (y0 + y1) / 2, z, rx=rx))
    return out


# ================================================================== KITSUNE-9 (pistol)
def kitsune9():
    g = L.Gun("kitsune9")
    W = 0.016  # half the slide's width
    # ---- Slide: a nose that slopes off at the front, a chamfered rear, a raised rib on top.
    slide = prism_raw([(0.095, 0.0075), (0.095, 0.0335), (0.0915, 0.0375), (-0.096, 0.0375), (-0.1055, 0.031), (-0.1055, 0.0075)], -W, W)
    # Its upper edges taper in (a sleek, faceted top): two long chamfers.
    for s in (-1, 1):
        cut(slide, box_raw(0.01, 0.01, 0.24, s * (W + 0.0012), 0.0395, 0, rz=math.radians(45)))
    cuts = []
    cuts += serrations(7, 0.058, 0.0052, 0.0022, 0.0011, 0.012, 0.035, W, rx=-0.18)
    cuts += serrations(4, -0.094, 0.0052, 0.0022, 0.0011, 0.014, 0.035, W, rx=-0.18)
    # Ejection port (right), three ports over the barrel, the display's recess at the back.
    cuts.append(box_raw(0.02, 0.016, 0.036, 0.01, 0.031, -0.018))
    for i in range(3):
        cuts.append(box_raw(0.009, 0.02, 0.007, 0, 0.042, -0.086 + i * 0.011, rx=0.35))
    cuts.append(box_raw(0.025, 0.0135, 0.004, 0, 0.0235, 0.0955))
    # The accent strips' grooves down each side.
    for s in (-1, 1):
        cuts.append(box_raw(0.0022, 0.003, 0.108, s * W, 0.0175, -0.012))
    # Rear sight's dovetail (the sight sits in it).
    cut_many(slide, cuts)
    g.add(slide, "frame", "slide", bev=0.0007)
    # Strips in their grooves (glow: neon, an LED, or plain metal), the display's bezel.
    for s in (-1, 1):
        g.box("glow", 0.0012, 0.0022, 0.106, s * (W - 0.0004), 0.0175, -0.012, group="slide", bev=0)
    # Front sight: a post with the dot's cup; rear sight: a notch.
    g.prism("frame", [(-0.1005, 0.037), (-0.1005, 0.0445), (-0.0995, 0.046), (-0.0955, 0.046), (-0.0945, 0.0445), (-0.094, 0.037)], -0.0028, 0.0028, group="slide", bev=0.0004)
    g.cyl("glow", 0.0015, 0.0012, 0, 0.0475, -0.0958, seg=12, group="slide", bev=0)
    rear = prism_raw([(0.0915, 0.037), (0.0915, 0.0465), (0.0895, 0.0472), (0.0835, 0.0472), (0.082, 0.0445), (0.081, 0.037)], -0.013, 0.013)
    cut(rear, box_raw(0.0056, 0.008, 0.03, 0, 0.0455, 0.087))
    g.add(rear, "steel", "slide", bev=0.0005)
    # Rib on top between the sights (trim): the ports run through it.
    rib = prism_raw([(0.079, 0.0375), (0.077, 0.0405), (-0.08, 0.0405), (-0.084, 0.0375)], -0.0055, 0.0055)
    cut_many(rib, [box_raw(0.009, 0.02, 0.007, 0, 0.042, -0.086 + i * 0.011, rx=0.35) for i in range(3)])
    g.add(rib, "trim", "slide", bev=0.0005)
    # Display bezel (the canvas sits in its window).
    bez = box_raw(0.028, 0.017, 0.0016, 0, 0.0235, 0.0958)
    cut(bez, box_raw(0.0232, 0.0122, 0.01, 0, 0.0235, 0.0958))
    g.add(bez, "trim", "slide", bev=0.0003)

    # ---- Barrel: through the slide's nose, a hood showing in the port, a compensator with a ring.
    g.cyl("steel", 0.0082, 0.11, 0, 0.0205, -0.05, seg=28)
    g.box("steel", 0.0165, 0.012, 0.034, 0, 0.0275, -0.018, bev=0.0006)
    comp = cyl_raw(0.0108, 0.02, 0, 0.0205, -0.1155, seg=32)
    cut_many(comp, [cyl_raw(0.0045, 0.03, 0, 0.0205, -0.116, seg=16)] + [box_raw(0.0026, 0.012, 0.0028, x, 0.028, -0.117 + dz, rx=0) for x in (0,) for dz in (-0.004, 0.0015)])
    g.add(comp, "frame", bev=0.0006)
    g.add(L.torus_raw(0.0104, 0.0012, 0, 0.0205, -0.1235, seg=32, ring=8), "glow", bev=0)

    # ---- Frame (polymer): dust cover, the grip raked back, a beavertail under the slide.
    frame = prism_raw(
        [
            (-0.099, 0.0075), (-0.099, -0.009), (-0.095, -0.0155), (-0.044, -0.0155),
            (-0.04, -0.0175), (0.012, -0.0175), (0.016, -0.023), (0.022, -0.036),
            (0.032, -0.07), (0.038, -0.1), (0.041, -0.106), (0.088, -0.11),
            (0.09, -0.104), (0.084, -0.072), (0.079, -0.044), (0.081, -0.026),
            (0.096, -0.013), (0.099, -0.008), (0.096, -0.004), (0.088, 0.0), (0.088, 0.0075),
        ],
        -0.0148, 0.0148,
    )
    fc = []
    # Rail slots under the dust cover, finger grooves on the front strap, stippled panels each side.
    for i in range(3):
        fc.append(box_raw(0.04, 0.004, 0.006, 0, -0.0145, -0.088 + i * 0.012))
    for s in (-1, 1):
        fc.append(box_raw(0.003, 0.0035, 0.06, s * 0.0148, -0.0105, -0.068))
        # A recessed grip panel, raked with the grip, ribbed across.
        fc.append(prism_raw([(0.041, -0.04), (0.047, -0.098), (0.08, -0.101), (0.075, -0.04)], s * 0.0148 - 0.0008, s * 0.0148 + 0.0008))
    cut_many(frame, fc)
    rc = []
    for i in range(7):
        y = -0.047 - i * 0.0076
        rc.append(box_raw(0.0316, 0.0024, 0.03, 0, y, 0.061 + (y + 0.045) * -0.2, rx=-0.12))
    # Front strap: the same ribs across it.
    for i in range(8):
        y = -0.04 - i * 0.0075
        rc.append(box_raw(0.02, 0.0024, 0.006, 0, y, 0.0255 + (-0.04 - y) * 0.205))
    cut_many(frame, rc)
    g.add(frame, "polymer", bev=0.0011)
    # Trigger guard: a loop, its front squared off for a finger.
    tg = prism_raw([(-0.044, -0.0155), (-0.046, -0.03), (-0.04, -0.039), (-0.03, -0.0415), (0.008, -0.0415), (0.022, -0.036), (0.016, -0.023), (0.012, -0.0175), (-0.04, -0.0175)], -0.0052, 0.0052)
    cut(tg, prism_raw([(-0.039, -0.018), (-0.041, -0.029), (-0.036, -0.0355), (-0.029, -0.037), (0.006, -0.037), (0.014, -0.033), (0.011, -0.022), (0.008, -0.018)], -0.01, 0.01))
    g.add(tg, "polymer", bev=0.0009)
    # Trigger: a curved blade with a safety tab.
    g.prism("trim", [(-0.0035, -0.0175), (-0.0075, -0.024), (-0.0095, -0.031), (-0.0085, -0.034), (-0.0055, -0.0335), (-0.004, -0.027), (-0.0005, -0.0195)], -0.0028, 0.0028, bev=0.0004)
    g.box("steel", 0.0012, 0.006, 0.0018, 0, -0.0275, -0.0072, rx=0.4, bev=0)
    # Controls: slide stop and takedown (left), a magazine release each side, pins.
    g.prism("steel", [(-0.012, -0.0005), (-0.012, 0.0045), (0.012, 0.0045), (0.016, 0.0015), (0.016, -0.0005)], -0.0168, -0.0148, bev=0.0003)
    g.box("steel", 0.0022, 0.0035, 0.009, -0.0158, -0.0085, -0.036, bev=0.0003)
    for s in (-1, 1):
        g.box("trim", 0.0024, 0.0075, 0.0075, s * 0.0152, -0.027, 0.022, rx=0.2, bev=0.0005)
    for x, y, z in ((0.0, -0.0045, -0.03), (0.0, -0.006, 0.05)):
        g.cyl("steel", 0.0016, 0.031, x, y, z, seg=12, axis="x", bev=0)

    # ---- Magazine: its body in the grip, a flared baseplate (trim).
    mag = prism_raw([(0.047, -0.03), (0.04, -0.104), (0.083, -0.108), (0.079, -0.03)], -0.011, 0.011)
    g.add(mag, "steel", "mag", bev=0.0006)
    g.prism("trim", [(0.038, -0.1065), (0.036, -0.1135), (0.044, -0.117), (0.088, -0.118), (0.092, -0.114), (0.09, -0.1095)], -0.0158, 0.0158, group="mag", bev=0.0012)
    g.box("glow", 0.0222, 0.0016, 0.024, 0, -0.1176, 0.064, bev=0, group="mag")
    return g


# ================================================================== HORNET (SMG)
def hornet():
    g = L.Gun("hornet")
    # ---- Upper receiver (frame): faceted top edges, the ejection port right, lightening flutes.
    up = prism_raw([(0.05, -0.008), (0.05, 0.034), (0.045, 0.04), (-0.204, 0.04), (-0.21, 0.033), (-0.21, -0.008)], -0.022, 0.022)
    for s_ in (-1, 1):
        cut(up, box_raw(0.012, 0.012, 0.3, s_ * 0.0235, 0.0405, -0.08, rz=math.radians(45)))
    uc = [box_raw(0.02, 0.016, 0.05, 0.016, 0.022, -0.045)]
    for s_ in (-1, 1):
        for i in range(3):
            uc.append(box_raw(0.003, 0.005, 0.034, s_ * 0.022, 0.006 + i * 0.0 , -0.115 - i * 0.042))
        uc.append(box_raw(0.003, 0.0028, 0.15, s_ * 0.022, 0.0215, -0.13))
    cut_many(up, uc)
    g.add(up, "frame", bev=0.0009)
    g.box("steel", 0.026, 0.012, 0.046, 0.006, 0.022, -0.045, bev=0.0005)  # bolt face in the port
    g.add(rail_raw(-0.2, 0.034, 0.04), "steel", bev=0.0003, seg=2)
    # ---- Lower (polymer): the flared magazine well and the trigger guard.
    lo = prism_raw([(0.046, -0.008), (0.046, -0.03), (0.012, -0.036), (-0.062, -0.036), (-0.066, -0.05), (-0.072, -0.058), (-0.111, -0.058), (-0.116, -0.05), (-0.12, -0.036), (-0.184, -0.03), (-0.186, -0.008)], -0.02, 0.02)
    cut(lo, box_raw(0.025, 0.06, 0.035, 0, -0.05, -0.09, rx=0.06))
    g.add(lo, "polymer", bev=0.001)
    tg = prism_raw([(-0.062, -0.036), (-0.056, -0.054), (-0.046, -0.058), (0.004, -0.058), (0.016, -0.05), (0.012, -0.036)], -0.005, 0.005)
    cut(tg, prism_raw([(-0.054, -0.037), (-0.05, -0.051), (-0.044, -0.0535), (0.0, -0.0535), (0.009, -0.047), (0.008, -0.037)], -0.01, 0.01))
    g.add(tg, "polymer", bev=0.0008)
    g.prism("trim", [(-0.014, -0.036), (-0.0175, -0.042), (-0.019, -0.0495), (-0.0175, -0.0515), (-0.015, -0.0505), (-0.0135, -0.044), (-0.011, -0.036)], -0.0026, 0.0026, bev=0.0003)
    # Pistol grip, raked back, ribbed.
    gr = prism_raw([(0.012, -0.034), (0.016, -0.05), (0.024, -0.1), (0.029, -0.112), (0.066, -0.115), (0.07, -0.108), (0.058, -0.06), (0.052, -0.034)], -0.0152, 0.0152)
    cut_many(gr, [box_raw(0.034, 0.0022, 0.006, 0, -0.052 - i * 0.0085, 0.0175 + i * 0.0018) for i in range(6)] + [prism_raw([(0.026, -0.05), (0.034, -0.104), (0.06, -0.106), (0.052, -0.05)], sx * 0.0152 - 0.0007, sx * 0.0152 + 0.0007) for sx in (-1, 1)])
    g.add(gr, "polymer", bev=0.0012)
    # Selector (left), magazine release, bolt catch, pins.
    g.prism("trim", [(0.026, -0.016), (0.03, -0.012), (0.044, -0.014), (0.044, -0.018), (0.03, -0.02)], -0.0225, -0.02, bev=0.0003)
    g.cyl("steel", 0.0045, 0.0032, -0.0215, -0.016, 0.028, axis="x", seg=16)
    g.box("trim", 0.0042, 0.009, 0.009, 0.0205, -0.026, -0.062, bev=0.0006)
    for z in (-0.02, 0.03, -0.165):
        g.cyl("steel", 0.0018, 0.0412, 0, -0.019, z, axis="x", seg=12, bev=0)
    # ---- Charging handle at the back (cycles).
    g.box("trim", 0.012, 0.009, 0.026, 0, 0.0365, 0.044, group="slide", bev=0.0006)
    g.prism("trim", [(0.052, 0.033), (0.052, 0.042), (0.058, 0.042), (0.061, 0.036), (0.058, 0.033)], -0.017, 0.017, group="slide", bev=0.0006)
    # ---- Shroud (furniture): an octagon with vents, the strips' grooves.
    sh = front_raw(octagon(0.04, 0.046, 0.009, 0, 0.01), -0.205, -0.362)
    sc = []
    for i in range(4):
        z = -0.232 - i * 0.03
        for s_ in (-1, 1):
            sc.append(box_raw(0.008, 0.012, 0.018, s_ * 0.02, 0.019, z))
        sc.append(box_raw(0.01, 0.01, 0.018, 0, 0.034, z))
    for s_ in (-1, 1):
        sc.append(box_raw(0.0024, 0.0034, 0.124, s_ * 0.02, -0.004, -0.285))
    sc.append(box_raw(0.06, 0.012, 0.004, 0, 0.012, -0.362))
    cut_many(sh, sc)
    g.add(sh, "furniture", bev=0.0009)
    for s_ in (-1, 1):
        g.box("glow", 0.0012, 0.0024, 0.122, s_ * 0.0196, -0.004, -0.285, bev=0)
    g.cyl("steel", 0.0072, 0.17, 0, 0.012, -0.3, seg=20)
    g.add(rail_raw(-0.36, -0.215, -0.0145 - 0.0075, w=0.016), "steel", bev=0.0003, seg=2)
    # Muzzle: a compensator with ports.
    comp = cyl_raw(0.0115, 0.044, 0, 0.012, -0.424, seg=28)
    cuts = [cyl_raw(0.0048, 0.06, 0, 0.012, -0.43, seg=16)]
    for k in range(3):
        cuts.append(box_raw(0.03, 0.005, 0.0045, 0, 0.012, -0.412 - k * 0.01))
        cuts.append(box_raw(0.004, 0.03, 0.0045, 0, 0.022, -0.412 - k * 0.01))
    cut_many(comp, cuts)
    g.add(comp, "frame", bev=0.0006)
    g.cyl("frame", 0.0095, 0.01, 0, 0.012, -0.399, seg=24, bev=0.0008)
    # Front sight on the shroud's rail end.
    g.prism("frame", [(-0.352, 0.033), (-0.35, 0.052), (-0.347, 0.054), (-0.341, 0.054), (-0.338, 0.04), (-0.334, 0.033)], -0.003, 0.003, bev=0.0004)
    # ---- Vertical foregrip on the shroud's lower rail.
    fg = cyl_raw(0.0125, 0.068, 0, -0.054, -0.29, seg=24, r2=0.0135, axis="y", rx=-0.08)
    cut_many(fg, [cyl_raw(0.02, 0.0025, 0, -0.04 - i * 0.012, -0.29 + (0.04 + i * 0.012) * 0.08, seg=24, axis="y", r2=0.02) for i in range(4)] if False else [])
    g.add(fg, "polymer", bev=0.001)
    g.box("polymer", 0.018, 0.008, 0.032, 0, -0.022, -0.29, bev=0.0008)
    g.cyl("trim", 0.0142, 0.006, 0, -0.091, -0.293, seg=24, axis="y", bev=0.0012)
    # ---- Stock: two struts, a butt with a rubber pad, a sling loop.
    for s_ in (-1, 1):
        g.cyl("steel", 0.0048, 0.15, s_ * 0.012, 0.004, 0.12, seg=16)
    g.box("steel", 0.034, 0.016, 0.012, 0, 0.004, 0.052, bev=0.001)
    butt = prism_raw([(0.178, 0.016), (0.2, 0.02), (0.204, 0.01), (0.204, -0.04), (0.198, -0.045), (0.186, -0.045), (0.178, -0.03)], -0.018, 0.018)
    cut(butt, box_raw(0.05, 0.022, 0.012, 0, -0.012, 0.188))
    g.add(butt, "furniture", bev=0.0014)
    g.prism("polymer", [(0.204, 0.018), (0.212, 0.018), (0.212, -0.041), (0.204, -0.041)], -0.019, 0.019, bev=0.0016)
    g.add(L.torus_raw(0.006, 0.0014, 0, 0.0, 0.0), "steel", bev=0) if False else None
    # ---- Holo sight on the rail: a hooded window round the 26 mm opening.
    hood = prism_raw([(-0.034, 0.056), (-0.034, 0.093), (-0.04, 0.097), (-0.082, 0.097), (-0.089, 0.091), (-0.089, 0.056)], -0.0175, 0.0175)
    cut(hood, box_raw(0.026, 0.026, 0.1, 0, 0.078, -0.06))
    for s_ in (-1, 1):
        cut(hood, box_raw(0.008, 0.008, 0.1, s_ * 0.0175, 0.097, -0.06, rz=math.radians(45)))
    g.add(hood, "frame", bev=0.0008)
    g.box("frame", 0.026, 0.008, 0.05, 0, 0.052, -0.06, bev=0.0006)
    g.box("steel", 0.03, 0.006, 0.012, 0, 0.0505, -0.045, bev=0.0005)
    g.cyl("trim", 0.0042, 0.006, 0.0205, 0.068, -0.05, axis="x", seg=16, bev=0.0005)
    g.cyl("trim", 0.0036, 0.005, 0.0, 0.0995, -0.05, axis="y", seg=16, bev=0.0005)
    # ---- Magazine: a stick, ribbed, a baseplate (drops on reload).
    mg = prism_raw([(-0.074, -0.03), (-0.0765, -0.168), (-0.1095, -0.168), (-0.107, -0.03)], -0.0118, 0.0118)
    cut_many(mg, [box_raw(0.026, 0.0016, 0.03, 0, -0.07 - i * 0.012, -0.092) for i in range(7)] if False else [box_raw(0.0034, 0.07, 0.006, sx * 0.0118, -0.115, -0.09) for sx in (-1, 1)])
    g.add(mg, "steel", "mag", bev=0.0008)
    g.prism("trim", [(-0.072, -0.167), (-0.073, -0.176), (-0.0775, -0.179), (-0.111, -0.179), (-0.113, -0.174), (-0.111, -0.167)], -0.014, 0.014, group="mag", bev=0.0012)
    return g


# ================================================================== JACKAL (assault rifle)
def jackal():
    g = L.Gun("jackal")
    # ---- Upper receiver: faceted, the ejection port and its brass deflector on the right.
    up = prism_raw([(0.075, 0.0), (0.075, 0.035), (0.07, 0.041), (-0.19, 0.041), (-0.196, 0.035), (-0.196, 0.0)], -0.023, 0.023)
    for s_ in (-1, 1):
        cut(up, box_raw(0.012, 0.012, 0.32, s_ * 0.0245, 0.0415, -0.06, rz=math.radians(45)))
    uc = [box_raw(0.02, 0.016, 0.062, 0.018, 0.02, -0.035)]
    for s_ in (-1, 1):
        uc.append(box_raw(0.003, 0.003, 0.11, s_ * 0.023, 0.006, -0.125))
    cut_many(up, uc)
    g.add(up, "frame", bev=0.001)
    g.box("steel", 0.03, 0.014, 0.058, 0.006, 0.02, -0.035, bev=0.0006)  # bolt in the port
    g.prism("frame", [(0.0, 0.01), (0.0, 0.034), (0.012, 0.034), (0.016, 0.022), (0.012, 0.01)], 0.022, 0.029, bev=0.0006)  # deflector
    g.add(rail_raw(-0.215, 0.07, 0.041, w=0.022, h=0.008), "steel", bev=0.0003, seg=2)
    # ---- Lower: the flared magazine well, the trigger guard, a pistol grip raked back.
    lo = prism_raw([(0.07, 0.0), (0.07, -0.022), (0.03, -0.026), (-0.058, -0.026), (-0.094, -0.034), (-0.096, -0.052), (-0.166, -0.052), (-0.168, -0.034), (-0.19, -0.022), (-0.19, 0.0)], -0.0215, 0.0215)
    lc = [box_raw(0.03, 0.06, 0.066, 0, -0.06, -0.13)]
    for s_ in (-1, 1):
        lc.append(prism_raw([(-0.1, -0.03), (-0.102, -0.047), (-0.16, -0.047), (-0.162, -0.03)], s_ * 0.0215 - 0.0008, s_ * 0.0215 + 0.0008))
    cut_many(lo, lc)
    g.add(lo, "frame", bev=0.001)
    tg = prism_raw([(-0.058, -0.026), (-0.054, -0.044), (-0.046, -0.048), (0.006, -0.048), (0.016, -0.04), (0.012, -0.026)], -0.0055, 0.0055)
    cut(tg, prism_raw([(-0.05, -0.027), (-0.047, -0.0415), (-0.042, -0.0435), (0.002, -0.0435), (0.009, -0.037), (0.007, -0.027)], -0.01, 0.01))
    g.add(tg, "frame", bev=0.0008)
    g.prism("trim", [(-0.018, -0.026), (-0.021, -0.033), (-0.0225, -0.04), (-0.021, -0.0425), (-0.0185, -0.0415), (-0.0165, -0.034), (-0.0145, -0.026)], -0.0026, 0.0026, bev=0.0003)
    gr = prism_raw([(0.008, -0.024), (0.014, -0.05), (0.022, -0.098), (0.027, -0.11), (0.068, -0.114), (0.072, -0.106), (0.058, -0.056), (0.05, -0.024)], -0.0158, 0.0158)
    cut_many(gr, [box_raw(0.036, 0.0024, 0.006, 0, -0.05 - i * 0.0095, 0.0155 + i * 0.0021) for i in range(6)] + [prism_raw([(0.025, -0.046), (0.032, -0.1), (0.06, -0.103), (0.051, -0.046)], sx * 0.0158 - 0.0007, sx * 0.0158 + 0.0007) for sx in (-1, 1)])
    g.add(gr, "furniture", bev=0.0012)
    # Selector, magazine release, bolt catch, pins.
    g.prism("trim", [(0.028, -0.008), (0.032, -0.003), (0.048, -0.005), (0.048, -0.01), (0.032, -0.012)], -0.0235, -0.021, bev=0.0003)
    g.cyl("steel", 0.005, 0.0032, -0.022, -0.0075, 0.03, axis="x", seg=16)
    g.box("trim", 0.0042, 0.01, 0.01, 0.0215, -0.03, -0.075, bev=0.0006)
    g.box("steel", 0.0035, 0.016, 0.009, -0.0225, -0.008, -0.088, bev=0.0005)
    for z in (-0.005, 0.055, -0.175):
        g.cyl("steel", 0.0019, 0.0442, 0, -0.012, z, axis="x", seg=12, bev=0)
    # ---- Bolt carrier and charging handle on the right (cycles).
    g.box("steel", 0.006, 0.016, 0.07, 0.0235, 0.021, -0.03, group="slide", bev=0.0006)
    g.prism("trim", [(0.0, 0.012), (0.0, 0.026), (0.016, 0.026), (0.02, 0.022), (0.02, 0.016), (0.016, 0.012)], 0.026, 0.04, group="slide", bev=0.0008)
    # ---- Handguard (furniture): free-floated, vent slots, the strips' grooves, a lower rail.
    hg = front_raw(octagon(0.054, 0.058, 0.012, 0, 0.01), -0.193, -0.43)
    hc = []
    for i in range(5):
        z = -0.232 - i * 0.04
        for s_ in (-1, 1):
            hc.append(box_raw(0.01, 0.014, 0.026, s_ * 0.027, 0.0055, z))
            hc.append(box_raw(0.012, 0.012, 0.026, s_ * 0.0235, -0.016, z, rz=s_ * math.radians(45)))
    for s_ in (-1, 1):
        hc.append(box_raw(0.0026, 0.0038, 0.205, s_ * 0.027, 0.026, -0.315))
    cut_many(hg, hc)
    g.add(hg, "furniture", bev=0.001)
    for s_ in (-1, 1):
        g.box("glow", 0.0012, 0.0026, 0.203, s_ * 0.0266, 0.026, -0.315, bev=0)
    g.box("frame", 0.05, 0.05, 0.012, 0, 0.012, -0.199, bev=0.0012)  # barrel nut ring
    g.add(rail_raw(-0.43, -0.2, 0.039, w=0.022, h=0.007), "steel", bev=0.0003, seg=2)
    g.add(rail_raw(-0.42, -0.25, -0.019 - 0.007, w=0.018, h=0.007), "steel", bev=0.0003, seg=2)
    # ---- Barrel, gas block with the front sight, a muzzle brake.
    g.cyl("steel", 0.0088, 0.2, 0, 0.018, -0.5, seg=24)
    g.cyl("steel", 0.0098, 0.026, 0, 0.018, -0.448, seg=24, bev=0.0006)
    g.prism("frame", [(-0.418, 0.04), (-0.416, 0.064), (-0.412, 0.067), (-0.406, 0.067), (-0.403, 0.05), (-0.398, 0.04)], -0.004, 0.004, bev=0.0005)
    br = cyl_raw(0.0128, 0.056, 0, 0.018, -0.59, seg=28)
    bc = [cyl_raw(0.005, 0.08, 0, 0.018, -0.59, seg=16)]
    for k in range(3):
        bc.append(box_raw(0.04, 0.007, 0.006, 0, 0.018, -0.574 - k * 0.012))
    bc.append(box_raw(0.006, 0.02, 0.03, 0, 0.032, -0.585))
    cut_many(br, bc)
    g.add(br, "frame", bev=0.0007)
    # ---- Buffer tube and an adjustable stock with a cheek riser.
    g.cyl("steel", 0.0135, 0.12, 0, 0.0, 0.135, seg=24)
    g.cyl("frame", 0.0165, 0.008, 0, 0.0, 0.079, seg=24, bev=0.0008)
    st = prism_raw([(0.13, 0.016), (0.16, 0.026), (0.28, 0.028), (0.296, 0.022), (0.296, -0.046), (0.285, -0.052), (0.24, -0.046), (0.18, -0.03), (0.135, -0.018)], -0.0215, 0.0215)
    stc = [prism_raw([(0.19, -0.014), (0.24, -0.026), (0.27, -0.03), (0.27, -0.014)], -0.04, 0.04)]
    for s_ in (-1, 1):
        stc.append(prism_raw([(0.165, 0.016), (0.28, 0.019), (0.28, 0.008), (0.17, 0.006)], s_ * 0.0215 - 0.0008, s_ * 0.0215 + 0.0008))
    cut_many(st, stc)
    g.add(st, "furniture", bev=0.0014)
    g.prism("polymer", [(0.296, 0.026), (0.308, 0.026), (0.31, 0.02), (0.31, -0.048), (0.306, -0.054), (0.296, -0.05)], -0.023, 0.023, bev=0.0016)
    g.box("steel", 0.006, 0.012, 0.03, -0.024, -0.005, 0.27, bev=0.0006)  # sling slot
    # ---- Red-dot sight: an open tube on a mount (the lens and the dot are the game's).
    tube = front_raw(octagon(0.034, 0.036, 0.007, 0, 0.086), -0.016, -0.084)
    cut(tube, front_raw(octagon(0.0262, 0.0262, 0.004, 0, 0.086), 0.0, -0.1))
    g.add(tube, "frame", bev=0.0008)
    g.box("frame", 0.026, 0.01, 0.052, 0, 0.064, -0.05, bev=0.0006)
    g.box("steel", 0.032, 0.007, 0.014, 0, 0.0585, -0.04, bev=0.0005)
    g.cyl("trim", 0.0048, 0.007, 0.0205, 0.086, -0.048, axis="x", seg=16, bev=0.0005)
    g.cyl("trim", 0.0042, 0.006, 0.0, 0.106, -0.048, axis="y", seg=16, bev=0.0005)
    g.cyl("steel", 0.0175, 0.004, 0, 0.086, -0.0855, seg=28, bev=0.0005) if False else None
    # ---- Curved magazine, ribbed, a baseplate (drops on reload).
    mg = prism_raw([(-0.098, -0.025), (-0.099, -0.08), (-0.104, -0.125), (-0.116, -0.165), (-0.131, -0.198), (-0.197, -0.205), (-0.184, -0.173), (-0.17, -0.13), (-0.163, -0.08), (-0.162, -0.025)], -0.0135, 0.0135)
    mc = []
    for s_ in (-1, 1):
        for i in range(4):
            y = -0.07 - i * 0.03
            mc.append(box_raw(0.003, 0.004, 0.05, s_ * 0.0135, y, -0.13 - i * 0.012 * (i > 1), rx=0.06 + 0.1 * i))
    cut_many(mg, mc)
    g.add(mg, "steel", "mag", bev=0.0009)
    g.prism("trim", [(-0.128, -0.196), (-0.131, -0.204), (-0.134, -0.212), (-0.202, -0.219), (-0.203, -0.211), (-0.198, -0.203)], -0.0155, 0.0155, group="mag", bev=0.0012)
    return g


# ================================================================== SHOTGUN (pump)
def shotgun():
    g = L.Gun("shotgun")
    # ---- Receiver: a stepped top, the ejection port right, a loading port under, panel lines.
    rc = prism_raw([(0.06, -0.025), (0.06, 0.03), (0.054, 0.037), (-0.17, 0.037), (-0.18, 0.03), (-0.18, -0.025)], -0.025, 0.025)
    for s_ in (-1, 1):
        cut(rc, box_raw(0.012, 0.012, 0.3, s_ * 0.0265, 0.0375, -0.06, rz=math.radians(45)))
    cc = [box_raw(0.02, 0.022, 0.07, 0.02, 0.016, -0.06), box_raw(0.03, 0.02, 0.09, 0, -0.026, -0.08)]
    for s_ in (-1, 1):
        cc.append(box_raw(0.002, 0.0022, 0.2, s_ * 0.025, -0.008, -0.06))
        cc.append(prism_raw([(0.04, 0.025), (0.04, -0.002), (-0.0, -0.002), (-0.012, 0.025)], s_ * 0.025 - 0.0008, s_ * 0.025 + 0.0008) if s_ < 0 else None)
    cut_many(rc, cc)
    g.add(rc, "frame", bev=0.0011)
    g.box("steel", 0.03, 0.016, 0.066, 0.004, 0.016, -0.06, bev=0.0006)  # bolt in the port
    g.box("steel", 0.024, 0.006, 0.08, 0, -0.022, -0.08, bev=0.0005)  # lifter
    g.add(rail_raw(-0.16, 0.04, 0.037, w=0.02, h=0.007), "steel", bev=0.0003, seg=2)
    # Trigger guard plate, trigger, safety on top.
    tg = prism_raw([(-0.03, -0.025), (-0.032, -0.04), (-0.026, -0.048), (0.028, -0.048), (0.04, -0.04), (0.036, -0.025)], -0.0058, 0.0058)
    cut(tg, prism_raw([(-0.025, -0.026), (-0.026, -0.038), (-0.021, -0.0435), (0.024, -0.0435), (0.032, -0.037), (0.03, -0.026)], -0.01, 0.01))
    g.add(tg, "frame", bev=0.0008)
    g.prism("trim", [(0.006, -0.025), (0.003, -0.033), (0.002, -0.04), (0.004, -0.0425), (0.0065, -0.0415), (0.0085, -0.033), (0.011, -0.025)], -0.0028, 0.0028, bev=0.0003)
    g.cyl("trim", 0.004, 0.006, 0, 0.039, 0.03, axis="y", seg=16, bev=0.0006)
    # ---- Barrel under a perforated heat shield; the vent rib with its accent lines (the bead is the game's).
    g.cyl("frame", 0.0128, 0.5, 0, 0.03, -0.42, seg=28)
    hs = front_raw([(-0.0165, 0.026), (-0.0165, 0.038), (-0.011, 0.045), (0.011, 0.045), (0.0165, 0.038), (0.0165, 0.026), (0.0142, 0.026), (0.0142, 0.037), (0.0098, 0.0425), (-0.0098, 0.0425), (-0.0142, 0.037), (-0.0142, 0.026)], -0.19, -0.44)
    hc = []
    for i in range(7):
        z = -0.215 - i * 0.031
        for s_ in (-1, 1):
            hc.append(cyl_raw(0.0042, 0.02, s_ * 0.0155, 0.034, z, seg=12, axis="x"))
    cut_many(hs, hc)
    g.add(hs, "steel", bev=0.0005)
    g.box("steel", 0.012, 0.004, 0.2, 0, 0.0465, -0.55, bev=0.0004)
    for s_ in (-1, 1):
        g.box("glow", 0.0012, 0.0022, 0.2, s_ * 0.0062, 0.0462, -0.55, bev=0)
    for i in range(6):
        g.box("steel", 0.006, 0.006, 0.004, 0, 0.0425, -0.47 - i * 0.035, bev=0.0003)
    g.cyl("frame", 0.0142, 0.012, 0, 0.03, -0.667, seg=28, bev=0.0008)
    # ---- Magazine tube, its clamp and cap with a sling loop.
    g.cyl("steel", 0.012, 0.43, 0, -0.004, -0.385, seg=24)
    cl = prism_raw([(-0.58, 0.044), (-0.58, -0.017), (-0.592, -0.017), (-0.592, 0.044)], -0.009, 0.009)
    g.add(cl, "frame", bev=0.001)
    g.cyl("frame", 0.0138, 0.02, 0, -0.004, -0.608, seg=24, bev=0.0012)
    g.add(L.torus_raw(0.007, 0.0016, 0, 0, 0, seg=20, ring=8), "steel", bev=0) if False else None
    # ---- Pump (cycles): a ribbed fore-end on the action bars.
    pump = front_raw(octagon(0.052, 0.05, 0.014, 0, -0.008), -0.24, -0.4)
    pc = [cyl_raw(0.0128, 0.2, 0, -0.004, -0.32, seg=24)]
    for i in range(6):
        z = -0.262 - i * 0.023
        pc.append(box_raw(0.06, 0.003, 0.008, 0, -0.033, z))
        for s_ in (-1, 1):
            pc.append(box_raw(0.003, 0.022, 0.008, s_ * 0.026, -0.008, z))
    cut_many(pump, pc)
    g.add(pump, "furniture", "slide", bev=0.0012)
    for s_ in (-1, 1):
        g.box("steel", 0.0075, 0.008, 0.16, s_ * 0.0185, 0.012, -0.2, group="slide", bev=0.0006)
    # ---- Pistol-grip stock: the grip, a raked comb, a recoil pad; a side saddle for four shells.
    gp = prism_raw([(0.06, 0.03), (0.12, 0.024), (0.29, 0.02), (0.3, 0.026), (0.3, -0.058), (0.285, -0.062), (0.13, -0.037), (0.114, -0.042), (0.112, -0.104), (0.106, -0.11), (0.072, -0.108), (0.066, -0.098), (0.056, -0.045), (0.05, -0.025), (0.06, -0.025)], -0.0205, 0.0205)
    gpc = [prism_raw([(0.155, -0.004), (0.27, -0.006), (0.27, -0.042), (0.165, -0.03)], -0.04, 0.04)]
    for i in range(6):
        gpc.append(box_raw(0.044, 0.0024, 0.006, 0, -0.056 - i * 0.0085, 0.0605 + i * 0.0015))
    for s_ in (-1, 1):
        gpc.append(prism_raw([(0.12, 0.016), (0.28, 0.013), (0.28, 0.004), (0.13, 0.006)], s_ * 0.0205 - 0.0008, s_ * 0.0205 + 0.0008))
    cut_many(gp, gpc)
    g.add(gp, "furniture", bev=0.0016)
    g.prism("polymer", [(0.3, 0.028), (0.314, 0.028), (0.318, 0.02), (0.318, -0.056), (0.312, -0.064), (0.299, -0.062)], -0.022, 0.022, bev=0.0018)
    sd = box_raw(0.008, 0.026, 0.07, -0.029, 0.004, -0.05)
    cut_many(sd, [cyl_raw(0.0108, 0.08, -0.034, 0.004 + 0.0 * i, -0.05, seg=16, axis="y") for i in range(1)] if False else [])
    g.add(sd, "polymer", bev=0.0008)
    for i in range(4):
        g.cyl("trim", 0.0105, 0.022, -0.036, 0.004, -0.074 + i * 0.016, axis="y", seg=16, bev=0.0006)
    return g


BUILDERS = {"kitsune9": kitsune9, "hornet": hornet, "jackal": jackal, "shotgun": shotgun}


def main():
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    opts = {"only": None, "out": "public/models/guns", "preview": None, "finish": "military", "views": "side,three,top"}
    i = 0
    while i < len(argv):
        k = argv[i].lstrip("-")
        opts[k] = argv[i + 1]
        i += 2
    ids = opts["only"].split(",") if opts["only"] else list(BUILDERS)
    os.makedirs(opts["out"], exist_ok=True)
    for gid in ids:
        # The bots' copy first (decimated to about 2,500 triangles), then the viewmodel's.
        L.reset()
        g = BUILDERS[gid]()
        n = sum(len(o.data.polygons) for o, _ in g.parts)
        objs = g.finish(decimate=min(1.0, 2500 / max(1, n * 2.2)))
        path = os.path.join(opts["out"], f"{gid}_lod.glb")
        L.export_glb(objs, path)
        print(f"LOD {gid}: {L.tri_count(objs)} tris -> {path} ({os.path.getsize(path)} bytes)")
        if opts["preview"]:
            os.makedirs(opts["preview"], exist_ok=True)
            L.preview(objs, os.path.join(opts["preview"], f"{gid}_lod-{opts['finish']}"), opts["finish"], views=["three"], res=(900, 520))
        L.reset()
        g = BUILDERS[gid]()
        objs = g.finish()
        path = os.path.join(opts["out"], f"{gid}.glb")
        L.export_glb(objs, path)
        print(f"GUN {gid}: {L.tri_count(objs)} tris -> {path} ({os.path.getsize(path)} bytes)")
        if opts["preview"]:
            os.makedirs(opts["preview"], exist_ok=True)
            files = L.preview(objs, os.path.join(opts["preview"], f"{gid}-{opts['finish']}"), opts["finish"], views=opts["views"].split(","))
            print("PREVIEW", " ".join(files))


main()
