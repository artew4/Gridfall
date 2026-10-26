"""
73.0, the port's industry (docs/ENVIRONMENT_PLAN.md, step 6): Neon Docks' and Old Port's ship-to-shore
cranes in parts the game assembles to each crane's own measures, handrails, pallet racks, a mooring bitt.
Real size, base at Y = 0, centred on X/Z (three.js axes).

  crane_leg     2 m of a box-section leg (1.2 x 2 x 1.2): stiffener ribs, corner angles, a ladder up one
                face (stacked up a leg's height)
  crane_girder  4 m of a box girder (4 x 2 x 1.2, along X): side plates and their stiffeners, a walkway
                on top with its handrails (laid end to end along a boom)
  crane_house   the machinery house (8.4 x 3.2 x 19.2): ribbed walls, windows, a door, roof vents
  trolley       the trolley (4 x 2.2 x 4): frame, wheels, the hoist's sheaves, the operator's cab under it
  bogie         a leg's foot (1.2 x 0.9 x 1.2): the equaliser, two wheels, the rail clamp
  rail_panel    1.6 m of a handrail (1.6 x 1.05 x 0.08, along X): a kick plate, a mesh infill, posts,
                the top tube
  rack_frame    a pallet rack's upright frame (0.1 x 1 x 1, stretched up and across): two posts with
                their slots, the diagonal lacing, base plates
  rack_beam     a pallet rack's pair of step beams (1 x 0.1 x 1, along X)
  bitt          a mooring bitt (0.9 x 0.6 x 0.5): a cast double bollard on its base

Roles: paint, metal, dark, mesh, glass, light.

  Blender -b --factory-startup -P tools/blender/props_port.py -- [--out public/models/props] [--preview DIR] [--only a,b]
"""

import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import gunlib as L  # noqa: E402
from gunlib import box_raw, cut, cut_many, cyl_raw, front_raw, prism_raw, seg_raw, sphere_raw  # noqa: E402
from mathutils import Matrix  # noqa: E402

ROLES = ("paint", "metal", "dark", "mesh", "glass", "light")
NODES = ("crane_leg", "crane_girder", "crane_house", "trolley", "bogie", "rail_panel", "rack_frame", "rack_beam", "bitt")
L.PREVIEW["port"] = {
    "paint": ((0.55, 0.42, 0.05), 0.3, 0.5),
    "metal": ((0.25, 0.25, 0.25), 0.7, 0.4),
    "dark": ((0.04, 0.04, 0.045), 0.3, 0.6),
    "mesh": ((0.2, 0.2, 0.2), 0.6, 0.5),
    "glass": ((0.05, 0.07, 0.08), 0.2, 0.05),
    "light": ((1.0, 0.9, 0.7), 0.0, 0.3),
}


def crane_leg(g):
    n = "crane_leg"
    g.box("paint", 1.2, 2.0, 1.2, 0, 1.0, 0, group=n, bev=0.02, seg=1)
    for y in (0.0, 1.0):
        g.box("paint", 1.28, 0.08, 1.28, 0, y + 0.04, 0, group=n, bev=0.01, seg=1)
    for sx in (-1, 1):
        for sz in (-1, 1):
            g.box("paint", 0.1, 2.0, 0.1, sx * 0.62, 1.0, sz * 0.62, group=n, bev=0.008, seg=1)
    for sx in (-1, 1):
        g.add(cyl_raw(0.018, 2.0, sx * 0.2, 1.0, 0.68, seg=6, axis="y"), "dark", n, bev=0)
    for i in range(7):
        g.add(cyl_raw(0.014, 0.4, 0, 0.15 + i * 0.28, 0.68, seg=6, axis="x"), "dark", n, bev=0)


def crane_girder(g):
    n = "crane_girder"
    Lg, H, W = 4.0, 2.0, 1.2
    body = box_raw(Lg, H, W, 0, H / 2, 0)
    g.add(body, "paint", n, bev=0.02, seg=1)
    for x in (-1.5, -0.5, 0.5, 1.5):
        for s in (-1, 1):
            g.box("paint", 0.06, H - 0.1, 0.06, x, H / 2, s * (W / 2 + 0.03), group=n, bev=0.005, seg=1)
    for s in (-1, 1):
        g.box("paint", Lg, 0.08, 0.12, 0, 0.04, s * (W / 2 + 0.03), group=n, bev=0.01, seg=1)
        g.box("paint", Lg, 0.08, 0.12, 0, H - 0.04, s * (W / 2 + 0.03), group=n, bev=0.01, seg=1)
    # The walkway's grating on top and its handrails.
    g.box("mesh", Lg, 0.04, W - 0.1, 0, H + 0.02, 0, group=n, bev=0)
    for s in (-1, 1):
        for x in (-1.9, -0.95, 0.0, 0.95, 1.9):
            g.add(cyl_raw(0.02, 1.0, x, H + 0.5, s * (W / 2 - 0.06), seg=6, axis="y"), "paint", n, bev=0)
        for y in (H + 0.5, H + 1.0):
            g.add(cyl_raw(0.022, Lg, 0, y, s * (W / 2 - 0.06), seg=6, axis="x"), "paint", n, bev=0)


def crane_house(g):
    n = "crane_house"
    W, H, D = 8.4, 3.2, 19.2
    body = box_raw(W, H, D, 0, H / 2, 0)
    cuts = []
    for s in (-1, 1):
        for i in range(6):
            cuts.append(box_raw(0.1, 0.7, 1.4, s * W / 2, 2.0, -7 + i * 2.8))
    cut_many(body, cuts)
    g.add(body, "paint", n, bev=0.03, seg=1)
    for s in (-1, 1):
        for i in range(6):
            g.box("glass", 0.02, 0.68, 1.38, s * (W / 2 - 0.04), 2.0, -7 + i * 2.8, group=n, bev=0)
        for i in range(32):
            g.box("paint", 0.05, H - 0.3, 0.08, s * (W / 2 + 0.02), H / 2, -D / 2 + 0.3 + i * 0.6, group=n, bev=0)
    g.box("dark", 0.06, 2.1, 1.0, W / 2 + 0.01, 1.05, 8.0, group=n, bev=0.01, seg=1)
    g.box("paint", W + 0.3, 0.15, D + 0.3, 0, H + 0.07, 0, group=n, bev=0.02, seg=1)
    for z in (-6, -2, 2, 6):
        g.box("metal", 1.2, 0.6, 1.2, 0, H + 0.45, z, group=n, bev=0.03, seg=1)
        g.add(cyl_raw(0.35, 0.1, 0, H + 0.8, z, seg=14, axis="y"), "dark", n, bev=0)


def trolley(g):
    n = "trolley"
    W, H, D = 4.0, 2.2, 4.0
    for s in (-1, 1):
        g.box("paint", W, 0.5, 0.4, 0, H - 0.25, s * (D / 2 - 0.2), group=n, bev=0.02, seg=1)
        g.box("paint", 0.4, 0.5, D, s * (W / 2 - 0.2), H - 0.25, 0, group=n, bev=0.02, seg=1)
        for x in (-1.5, 1.5):
            g.add(cyl_raw(0.3, 0.2, x, H + 0.1, s * (D / 2 - 0.2), seg=16, axis="z"), "metal", n, bev=0.01, seg=1)
    for x in (-0.9, 0.9):
        for z in (-0.9, 0.9):
            g.add(cyl_raw(0.35, 0.15, x, H - 0.6, z, seg=16, axis="x"), "metal", n, bev=0.01, seg=1)
    # The operator's cab hanging under its land side.
    cab = box_raw(1.8, 1.6, 2.0, -1.0, 0.8, 0)
    cut(cab, box_raw(1.6, 0.8, 2.2, -1.0, 0.9, 0.2))
    g.add(cab, "paint", n, bev=0.03, seg=1)
    g.box("glass", 1.58, 0.78, 1.95, -1.0, 0.9, 0.2, group=n, bev=0)
    g.box("light", 0.3, 0.1, 0.3, 1.2, H - 0.55, 0, group=n, bev=0.01, seg=1)


def bogie(g):
    n = "bogie"
    g.box("paint", 1.2, 0.35, 1.2, 0, 0.72, 0, group=n, bev=0.02, seg=1)
    g.box("dark", 0.6, 0.3, 1.2, 0, 0.45, 0, group=n, bev=0.02, seg=1)
    for z in (-0.35, 0.35):
        g.add(cyl_raw(0.3, 0.2, 0, 0.3, z, seg=18, axis="x"), "metal", n, bev=0.01, seg=1)
    g.box("light", 0.5, 0.15, 0.04, 0, 0.72, 0.61, group=n, bev=0)
    g.box("dark", 0.9, 0.05, 1.2, 0, 0.02, 0, group=n, bev=0)


def rail_panel(g):
    n = "rail_panel"
    Lr, H, T = 1.6, 1.05, 0.08
    g.box("paint", Lr, 0.15, 0.012, 0, 0.075, 0, group=n, bev=0.002, seg=1)
    # (Its collider is a whole plate that stops rounds and sight: the infill is a closed perforated sheet
    # from the kick plate to the top tube, no gaps to see through.)
    g.box("mesh", Lr - 0.06, 0.88, 0.008, 0, 0.14 + 0.44, 0, group=n, bev=0)
    for x in (-Lr / 2 + 0.03, Lr / 2 - 0.03):
        g.box("paint", 0.05, H, 0.05, x, H / 2, 0, group=n, bev=0.006, seg=1)
    g.add(cyl_raw(0.025, Lr, 0, H - 0.025, 0, seg=8, axis="x"), "paint", n, bev=0)
    g.add(cyl_raw(0.018, Lr, 0, 0.84, 0, seg=8, axis="x"), "paint", n, bev=0)


def rack_frame(g):
    n = "rack_frame"
    for z in (-0.46, 0.46):
        g.add(box_raw(0.1, 1.0, 0.08, 0, 0.5, z), "paint", n, bev=0.004, seg=1)
        g.box("dark", 0.012, 0.95, 0.005, 0, 0.5, z + 0.041, group=n, bev=0)
        g.box("dark", 0.14, 0.01, 0.14, 0, 0.005, z, group=n, bev=0)
    for i in range(4):
        y0, y1 = 0.08 + i * 0.22, 0.08 + (i + 1) * 0.22
        a, b = (-0.42, 0.42) if i % 2 == 0 else (0.42, -0.42)
        g.add(seg_raw((0, y0, a), (0, y1, b), 0.03, 0.02, up=(1, 0, 0)), "metal", n, bev=0)
    g.box("metal", 0.03, 0.03, 0.84, 0, 0.06, 0, group=n, bev=0)


def rack_beam(g):
    n = "rack_beam"
    for z in (-0.46, 0.46):
        g.add(prism_raw([(z - 0.03, 0.0), (z + 0.03, 0.0), (z + 0.03, 0.1), (z - 0.01, 0.1), (z - 0.01, 0.07), (z - 0.03, 0.07)], -0.5, 0.5), "paint", n, bev=0.003, seg=1)
    # The deck between the beams (the shelf's collider is whole: it stops rounds).
    g.box("mesh", 1.0, 0.02, 0.88, 0, 0.09, 0, group=n, bev=0)


def bitt(g):
    n = "bitt"
    g.box("dark", 0.9, 0.12, 0.5, 0, 0.06, 0, group=n, bev=0.03, seg=2)
    for x in (-0.25, 0.25):
        g.add(cyl_raw(0.12, 0.42, x, 0.33, 0, seg=16, axis="y", r2=0.1), "dark", n, bev=0.01, seg=1)
        g.add(cyl_raw(0.16, 0.07, x, 0.57, 0, seg=16, axis="y"), "dark", n, bev=0.02, seg=1)
    for s in (-1, 1):
        g.add(cyl_raw(0.015, 0.02, s * 0.38, 0.12, 0.18, seg=8, axis="y"), "metal", n, bev=0)


BUILDERS = {
    "crane_leg": crane_leg, "crane_girder": crane_girder, "crane_house": crane_house, "trolley": trolley, "bogie": bogie,
    "rail_panel": rail_panel, "rack_frame": rack_frame, "rack_beam": rack_beam, "bitt": bitt,
}


def main():
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    opts = {"out": "public/models/props", "preview": None, "only": None}
    for i in range(0, len(argv), 2):
        opts[argv[i].lstrip("-")] = argv[i + 1]
    names = opts["only"].split(",") if opts["only"] else list(NODES)
    L.reset(ROLES)
    g = L.Gun("props_port", groups=tuple(names))
    for name in names:
        BUILDERS[name](g)
    objs = g.finish(uv=1.0)
    for name, o in objs.items():
        print(f"  {name}: {sum(len(p.vertices) - 2 for p in o.data.polygons)} tris")
    if not opts["only"]:
        os.makedirs(opts["out"], exist_ok=True)
        path = os.path.join(opts["out"], "port.glb")
        L.export_glb(objs, path)
        print(f"PORT: {L.tri_count(objs)} tris -> {path} ({os.path.getsize(path)} bytes)")
    if opts["preview"]:
        os.makedirs(opts["preview"], exist_ok=True)
        for name in names:
            for o in objs.values():
                o.hide_render = o.name != name
            L.preview({name: objs[name]}, os.path.join(opts["preview"], f"port-{name}"), "port", views=("three",), res=(700, 500))
        print("PREVIEW done")


main()
