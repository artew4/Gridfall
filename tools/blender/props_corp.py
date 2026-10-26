"""
74.0, Maglev Terminal's corporate kit (docs/ENVIRONMENT_PLAN.md, step 7). Real size, base at Y = 0,
centred on X/Z, front at +Z (three.js axes). The hall's white gloss, brushed steel and one teal.

  cplanter   a gloss planter (1.4 x 0.95 x 0.8, stretched to its box): rounded white shell, a steel
             plinth, its soil and low plants (ferns, a box shrub: under a hand over the rim)
  kiosk      a kiosk pod (3.0 x 2.95 x 3.2): rounded corners, a service window (dark glass: the box is
             solid), its counter, a menu screen, the teal canopy with its light strip
  ticket     a ticket machine (1.0 x 1.9 x 0.75, in a row): its screen, the card slot and keypad, the
             ticket tray, the teal header
  cbench     a bench seat (1.5 x 0.5 x 0.5): white moulded seat on brushed steel cantilevers
  tgate      a ticket gate (1.2 x 1.0 x 0.6, in a row): the cabinet, its reader with a teal glow, the
             glass flaps (folded into the cabinet), the arrow lamp
  lcart      a luggage trolley loaded (2.0 x 1.0 x 2.4): the steel frame, the wheels, the cases on it
  mcart      a maintenance cart in the guideway bed (1.7 x 1.0 x 3.2): its deck on bogies, a tool chest,
             cable drums, a warning beacon
  tdoor      a train door's surround for the 1.6 x 2.1 opening: a rounded frame, the status strip

Roles: white, offwhite, steel, teal, glass, screen, dark, leaf, soil, light, case.

  Blender -b --factory-startup -P tools/blender/props_corp.py -- [--out public/models/props] [--preview DIR] [--only a,b]
"""

import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import gunlib as L  # noqa: E402
from gunlib import box_raw, cut, cut_many, cyl_raw, front_raw, prism_raw, seg_raw, sphere_raw  # noqa: E402
from mathutils import Matrix  # noqa: E402

ROLES = ("white", "offwhite", "steel", "teal", "glass", "screen", "dark", "leaf", "soil", "light", "case")
NODES = ("cplanter", "kiosk", "ticket", "cbench", "tgate", "lcart", "mcart", "tdoor")
L.PREVIEW["corp"] = {
    "white": ((0.85, 0.86, 0.87), 0.1, 0.25),
    "offwhite": ((0.7, 0.72, 0.73), 0.05, 0.4),
    "steel": ((0.6, 0.62, 0.64), 0.85, 0.3),
    "teal": ((0.05, 0.4, 0.45), 0.2, 0.4),
    "glass": ((0.04, 0.06, 0.07), 0.2, 0.05),
    "screen": ((0.2, 0.8, 1.0), 0.0, 0.3),
    "dark": ((0.05, 0.05, 0.06), 0.3, 0.5),
    "leaf": ((0.06, 0.22, 0.08), 0.0, 0.6),
    "soil": ((0.08, 0.06, 0.05), 0.0, 0.95),
    "light": ((1.0, 1.0, 1.0), 0.0, 0.3),
    "case": ((0.15, 0.2, 0.3), 0.2, 0.4),
}


def cplanter(g):
    n = "cplanter"
    W, H, D = 1.4, 0.95, 0.8
    g.box("steel", W - 0.06, 0.06, D - 0.06, 0, 0.03, 0, group=n, bev=0.01, seg=1)
    shell = box_raw(W, H - 0.06, D, 0, 0.06 + (H - 0.06) / 2, 0)
    cut(shell, box_raw(W - 0.1, 0.3, D - 0.1, 0, H, 0))
    g.add(shell, "white", n, bev=0.06, seg=3)
    g.box("soil", W - 0.1, 0.04, D - 0.1, 0, H - 0.07, 0, group=n, bev=0)
    # A box shrub at one end, ferns along the rest (low: under a hand's height over the rim).
    g.add(sphere_raw(0.26, -W / 2 + 0.32, H - 0.02, 0, seg=12, rings=8, sx=1.1, sy=0.6, sz=1.0), "leaf", n, bev=0)
    for i, x in enumerate((-0.05, 0.2, 0.45)):
        for k in range(7):
            a = k / 7 * math.pi * 2 + i
            g.add(seg_raw((x, H - 0.05, 0.0), (x + math.cos(a) * 0.24, H + 0.1, math.sin(a) * 0.24), 0.07, 0.01, up=(0, 1, 0), w1=0.02), "leaf", n, bev=0)


def kiosk(g):
    n = "kiosk"
    W, H, D = 3.0, 2.6, 3.2
    body = box_raw(W, H, D, 0, H / 2, 0)
    cut(body, box_raw(1.8, 1.0, 0.3, 0, 1.45, D / 2))
    g.add(body, "white", n, bev=0.3, seg=4)
    g.box("glass", 1.8, 1.0, 0.02, 0, 1.45, D / 2 - 0.12, group=n, bev=0)
    g.box("offwhite", 2.0, 0.06, 0.32, 0, 0.94, D / 2 + 0.04, group=n, bev=0.02, seg=1)
    g.box("screen", 1.2, 0.5, 0.02, 0, 2.2, D / 2 + 0.005, group=n, bev=0)
    for s in (-1, 1):
        g.box("screen", 0.02, 0.9, 1.4, s * (W / 2 + 0.005), 1.6, 0.2, group=n, bev=0)
    # The canopy: teal band with its light strip.
    can = box_raw(W + 0.3, 0.25, D + 0.4, 0, H + 0.125, 0)
    g.add(can, "teal", n, bev=0.08, seg=2)
    g.box("light", W + 0.3, 0.06, D + 0.4, 0, H + 0.3, 0, group=n, bev=0.03, seg=1)
    g.box("steel", W - 0.2, 0.08, D - 0.2, 0, 0.04, 0, group=n, bev=0.02, seg=1)


def ticket(g):
    n = "ticket"
    W, H, D = 1.0, 1.9, 0.75
    body = box_raw(W - 0.04, H, D, 0, H / 2, 0)
    cut(body, box_raw(0.6, 0.45, 0.3, 0, 1.35, D / 2 + 0.05, rx=0.2))
    g.add(body, "steel", n, bev=0.04, seg=2)
    g.box("screen", 0.58, 0.43, 0.02, 0, 1.35, D / 2 - 0.08, rx=0.2, group=n, bev=0)
    g.box("dark", 0.3, 0.2, 0.05, -0.15, 0.95, D / 2, group=n, bev=0.01, seg=1)
    for i in range(3):
        for k in range(3):
            g.box("offwhite", 0.05, 0.04, 0.02, -0.22 + k * 0.07, 0.9 + i * 0.05, D / 2 + 0.03, group=n, bev=0)
    g.box("teal", 0.08, 0.01, 0.02, 0.22, 1.0, D / 2 + 0.005, group=n, bev=0)
    g.box("dark", 0.4, 0.12, 0.08, 0, 0.55, D / 2 - 0.03, group=n, bev=0.01, seg=1)
    g.box("teal", W - 0.04, 0.12, D + 0.02, 0, H - 0.06, 0, group=n, bev=0.02, seg=1)
    g.box("light", W - 0.1, 0.03, 0.02, 0, H - 0.06, D / 2 + 0.01, group=n, bev=0)


def cbench(g):
    n = "cbench"
    W = 1.5
    seat = prism_raw([(-0.25, 0.42), (0.25, 0.42), (0.27, 0.46), (0.25, 0.5), (-0.25, 0.5), (-0.27, 0.46)], -W / 2, W / 2)
    g.add(seat, "white", n, bev=0.02, seg=2)
    for x in (-W / 2 + 0.2, W / 2 - 0.2):
        g.add(prism_raw([(-0.2, 0.0), (0.2, 0.0), (0.2, 0.02), (0.02, 0.02), (0.05, 0.42), (-0.05, 0.42), (-0.02, 0.02), (-0.2, 0.02)], x - 0.04, x + 0.04), "steel", n, bev=0.006, seg=1)


def tgate(g):
    n = "tgate"
    W, H, D = 1.2, 1.0, 0.6
    cab = box_raw(D * 0.5, H, W, 0, H / 2, 0)
    g.add(cab, "white", n, bev=0.05, seg=3)
    g.add(cab.copy() if False else box_raw(D * 0.5 + 0.01, 0.06, W, 0, H - 0.03, 0), "steel", n, bev=0.01, seg=1)
    g.box("teal", 0.2, 0.02, 0.2, 0, H + 0.005, 0.3, group=n, bev=0.005, seg=1)
    g.box("screen", 0.16, 0.01, 0.16, 0, H + 0.016, 0.3, group=n, bev=0)
    g.box("screen", 0.02, 0.12, 0.12, D * 0.25 + 0.005, 0.85, W / 2 - 0.15, group=n, bev=0)
    for s in (-1, 1):
        g.box("glass", 0.02, 0.6, 0.28, s * (D * 0.25 + 0.06), 0.62, -W / 2 + 0.4, group=n, bev=0.01, seg=1)
    g.box("dark", D * 0.5 - 0.04, 0.04, W - 0.04, 0, 0.02, 0, group=n, bev=0)


def lcart(g):
    n = "lcart"
    W, H, D = 1.0, 1.0, 2.0
    g.box("steel", W, 0.05, D, 0, 0.25, 0, group=n, bev=0.01, seg=1)
    for sx in (-1, 1):
        for sz in (-1, 1):
            g.add(cyl_raw(0.1, 0.06, sx * (W / 2 - 0.1), 0.1, sz * (D / 2 - 0.15), seg=12, axis="x"), "dark", n, bev=0.01, seg=1)
    g.add(seg_raw((-W / 2 + 0.05, 0.27, D / 2 - 0.05), (-W / 2 + 0.05, 1.0, D / 2 + 0.05), 0.03, 0.03), "steel", n, bev=0)
    g.add(seg_raw((W / 2 - 0.05, 0.27, D / 2 - 0.05), (W / 2 - 0.05, 1.0, D / 2 + 0.05), 0.03, 0.03), "steel", n, bev=0)
    g.add(cyl_raw(0.025, W, 0, 1.0, D / 2 + 0.05, seg=8, axis="x"), "dark", n, bev=0)
    # The cases: two hard shells lying, one standing, a duffel.
    g.box("case", 0.75, 0.3, 0.55, 0, 0.43, -0.55, group=n, bev=0.04, seg=2)
    g.box("offwhite", 0.7, 0.28, 0.5, 0.0, 0.72, -0.5, ry=0.15, group=n, bev=0.04, seg=2)
    g.box("case", 0.45, 0.65, 0.28, 0.12, 0.6, 0.35, group=n, bev=0.04, seg=2)
    g.add(cyl_raw(0.17, 0.6, -0.2, 0.45, 0.4, seg=12, axis="z"), "dark", n, bev=0.05, seg=2)


def mcart(g):
    n = "mcart"
    W, H, D = 1.7, 1.0, 3.2
    g.box("offwhite", W, 0.2, D, 0, 0.45, 0, group=n, bev=0.03, seg=1)
    for z in (-1.0, 1.0):
        g.box("dark", W - 0.4, 0.3, 0.8, 0, 0.2, z, group=n, bev=0.03, seg=1)
        for s in (-1, 1):
            g.add(cyl_raw(0.15, 0.08, s * (W / 2 - 0.25), 0.15, z, seg=14, axis="x"), "steel", n, bev=0.01, seg=1)
    g.box("teal", W, 0.06, D, 0, 0.58, 0, group=n, bev=0.01, seg=1)
    g.box("steel", 1.0, 0.35, 0.6, -0.2, 0.78, -0.9, group=n, bev=0.03, seg=2)
    for z in (0.4, 1.1):
        g.add(cyl_raw(0.3, 0.35, 0.2, 0.9, z, seg=16, axis="x"), "dark", n, bev=0.02, seg=1)
    g.add(cyl_raw(0.06, 0.12, W / 2 - 0.15, 1.0, -D / 2 + 0.2, seg=10, axis="y"), "light", n, bev=0.01, seg=1)
    for s in (-1, 1):
        g.add(seg_raw((s * (W / 2 - 0.05), 0.55, D / 2 - 0.1), (s * (W / 2 - 0.05), 1.0, D / 2 - 0.1), 0.04, 0.04), "steel", n, bev=0)
    g.add(cyl_raw(0.025, W - 0.1, 0, 1.0, D / 2 - 0.1, seg=8, axis="x"), "steel", n, bev=0)


def tdoor(g):
    n = "tdoor"
    # Round a 1.6 x 2.1 opening (its sill at y 0): a rounded frame 8 cm wide, 3 cm proud, the status strip.
    Wd, Hd = 1.6, 2.1
    fr = front_raw([(-Wd / 2 - 0.08, 0), (Wd / 2 + 0.08, 0), (Wd / 2 + 0.08, Hd + 0.08), (-Wd / 2 - 0.08, Hd + 0.08)], 0, 0.03)
    cut(fr, front_raw([(-Wd / 2, -0.1), (Wd / 2, -0.1), (Wd / 2, Hd), (-Wd / 2, Hd)], -0.1, 0.2))
    g.add(fr, "steel", n, bev=0.008, seg=2)
    g.box("light", 0.5, 0.04, 0.01, 0, Hd + 0.14, 0.012, group=n, bev=0)
    g.box("teal", Wd + 0.16, 0.02, 0.01, 0, Hd + 0.09, 0.03, group=n, bev=0)


BUILDERS = {"cplanter": cplanter, "kiosk": kiosk, "ticket": ticket, "cbench": cbench, "tgate": tgate, "lcart": lcart, "mcart": mcart, "tdoor": tdoor}


def main():
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    opts = {"out": "public/models/props", "preview": None, "only": None}
    for i in range(0, len(argv), 2):
        opts[argv[i].lstrip("-")] = argv[i + 1]
    names = opts["only"].split(",") if opts["only"] else list(NODES)
    L.reset(ROLES)
    g = L.Gun("props_corp", groups=tuple(names))
    for name in names:
        BUILDERS[name](g)
    objs = g.finish(uv=1.0)
    for name, o in objs.items():
        print(f"  {name}: {sum(len(p.vertices) - 2 for p in o.data.polygons)} tris")
    if not opts["only"]:
        os.makedirs(opts["out"], exist_ok=True)
        path = os.path.join(opts["out"], "corp.glb")
        L.export_glb(objs, path)
        print(f"CORP: {L.tri_count(objs)} tris -> {path} ({os.path.getsize(path)} bytes)")
    if opts["preview"]:
        os.makedirs(opts["preview"], exist_ok=True)
        for name in names:
            for o in objs.values():
                o.hide_render = o.name != name
            L.preview({name: objs[name]}, os.path.join(opts["preview"], f"corp-{name}"), "corp", views=("three",), res=(700, 500))
        print("PREVIEW done")


main()
