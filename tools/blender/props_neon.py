"""
72.0, the neon street kit (docs/ENVIRONMENT_PLAN.md, step 5): Tokyo's district (PropKit), Neon Block,
and the electrical cabinets every map shoots out. Real size, base at Y = 0, centred on X/Z, front at +Z
(three.js axes).

  vending       a drinks machine (1.05 x 1.9 x 0.8): rounded body, a rain hood, side vents, the kick
                plate, feet (its lit front is the game's canvas, on the +Z face)
  ac_roof       a rooftop condenser (1.4 x 1.0 x 1.1): its fan behind a guard, fins, pipes, feet
  ac_wall       a wall-hung outdoor unit (0.75 x 0.55 x 0.28): fan guard, louvres, brackets, the pipes
  garbage       a tied garbage bag (0.6)
  dumpster      a wheeled bin (1.8 x 1.3 x 1.1): lid, lifting pockets, handles, wheels
  planter       a concrete trough with shrubs (1.5 x 0.9 x 0.6, tiled along a run)
  lantern_caps  a paper lantern's wooden caps, its ribs' hoops, the cord and a tassel (the lantern's
                lit paper is the game's; this frame sits round it, its centre at the origin)
  ecab          an electrical cabinet (1.2 x 1.9 x 0.5): two doors, vents, a hazard plate, the conduit
  bike          a city bike (1.7): wheels with spokes, the frame, basket, saddle, the stand
  bench         a bench (1.8 x 0.45 x 0.5): slats on cast legs
  bollard       a steel bollard (0.2 x 0.85) with its reflective band
  upole         a concrete utility pole (10 m): crossarms, insulators, a transformer, a lamp, step bolts
  yatai         a ramen stall (3.6 x 2.6 x 1.6): the counter, its roof, poles, stools, a hanging lantern frame

Roles: paint, metal, dark, plastic, rubber, chrome, glass, light, concrete, wood, leaf, glow.

  Blender -b --factory-startup -P tools/blender/props_neon.py -- [--out public/models/props] [--preview DIR] [--only a,b]
"""

import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import bmesh  # noqa: E402
import gunlib as L  # noqa: E402
from gunlib import box_raw, cut, cut_many, cyl_raw, front_raw, prism_raw, seg_raw, sphere_raw, tube_between  # noqa: E402
from mathutils import Matrix, Vector  # noqa: E402

ROLES = ("paint", "metal", "dark", "plastic", "rubber", "chrome", "glass", "light", "concrete", "wood", "leaf", "glow")
NODES = ("vending", "ac_roof", "ac_wall", "garbage", "dumpster", "planter", "lantern_caps", "ecab", "bike", "bench", "bollard", "upole", "yatai")
L.PREVIEW["neon"] = {
    "paint": ((0.5, 0.05, 0.08), 0.3, 0.35),
    "metal": ((0.3, 0.3, 0.3), 0.7, 0.4),
    "dark": ((0.03, 0.03, 0.035), 0.2, 0.6),
    "plastic": ((0.55, 0.55, 0.5), 0.05, 0.5),
    "rubber": ((0.02, 0.02, 0.02), 0.0, 0.85),
    "chrome": ((0.7, 0.7, 0.7), 1.0, 0.15),
    "glass": ((0.05, 0.07, 0.08), 0.2, 0.05),
    "light": ((1.0, 0.9, 0.7), 0.0, 0.3),
    "concrete": ((0.35, 0.35, 0.33), 0.0, 0.9),
    "wood": ((0.35, 0.22, 0.12), 0.0, 0.8),
    "leaf": ((0.06, 0.18, 0.06), 0.0, 0.7),
    "glow": ((0.2, 0.9, 1.0), 0.0, 0.5),
}


def blob(w, h, d, cuts, shape, name="blob"):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.subdivide_edges(bm, edges=bm.edges[:], cuts=cuts, use_grid_fill=True)
    for v in bm.verts:
        x, y, z = v.co.x * 2, v.co.y + 0.5, v.co.z * 2
        nx, ny, nz = shape(x, y, z)
        v.co = Vector((nx * w / 2, ny * h, nz * d / 2))
    return L._link(name, bm)


def fan_guard(g, n, x, y, z, r, axis="z"):
    """A round fan guard: rings and spokes, the blades behind it."""
    for k in (0.35, 0.68, 1.0):
        t = L.torus_raw(r * k, 0.007, 0, 0, 0, seg=24, ring=4)
        if axis == "z":
            t.data.transform(Matrix.Translation((x, y, z)))
        else:
            t.data.transform(Matrix.Translation((x, y, z)) @ Matrix.Rotation(math.pi / 2, 4, "X"))
        g.add(t, "dark", n, bev=0)
    for i in range(4):
        a = i / 4 * math.pi
        dx, dy = math.cos(a) * r, math.sin(a) * r
        if axis == "z":
            g.add(seg_raw((x - dx, y - dy, z), (x + dx, y + dy, z), 0.012, 0.012), "dark", n, bev=0)
        else:
            g.add(seg_raw((x - dx, y, z - dy), (x + dx, y, z + dy), 0.012, 0.012), "dark", n, bev=0)
    for i in range(3):
        a = i / 3 * math.pi * 2
        if axis == "z":
            g.add(seg_raw((x, y, z - 0.04), (x + math.cos(a) * r * 0.9, y + math.sin(a) * r * 0.9, z - 0.04), r * 0.35, 0.01, up=(0, 0, 1)), "dark", n, bev=0)
        else:
            g.add(seg_raw((x, y - 0.04, z), (x + math.cos(a) * r * 0.9, y - 0.04, z + math.sin(a) * r * 0.9), r * 0.35, 0.01, up=(0, 1, 0)), "dark", n, bev=0)


# ------------------------------------------------------------------ the props
def vending(g):
    n = "vending"
    W, H, D = 1.05, 1.9, 0.8
    body = box_raw(W, H - 0.06, D - 0.02, 0, 0.06 + (H - 0.06) / 2, -0.01)
    vents = [box_raw(0.04, 0.03, 0.4, s * W / 2, 0.3 + i * 0.06, -0.15) for s in (-1, 1) for i in range(5)]
    cut_many(body, vents)
    g.add(body, "paint", n, bev=0.035, seg=3)
    g.box("dark", W - 0.08, 0.06, D - 0.1, 0, 0.03, -0.01, group=n, bev=0.01, seg=1)
    g.add(prism_raw([(D / 2 + 0.06, H), (D / 2 + 0.06, H + 0.03), (-D / 2, H + 0.06), (-D / 2, H)], -W / 2 - 0.02, W / 2 + 0.02), "paint", n, bev=0.01, seg=1)
    g.box("glow", W - 0.1, 0.04, 0.02, 0, H - 0.02, D / 2 + 0.06, group=n, bev=0)
    for s in (-1, 1):
        g.box("chrome", 0.02, H - 0.2, 0.03, s * (W / 2 - 0.005), H / 2, D / 2 - 0.02, group=n, bev=0.005, seg=1)
    for sx in (-1, 1):
        for sz in (-1, 1):
            g.box("dark", 0.08, 0.04, 0.08, sx * (W / 2 - 0.08), 0.0, sz * (D / 2 - 0.08), group=n, bev=0.01, seg=1)


def ac_roof(g):
    n = "ac_roof"
    W, H, D = 1.4, 1.0, 1.1
    body = box_raw(W, H - 0.1, D, 0, 0.1 + (H - 0.1) / 2, 0)
    cut(body, cyl_raw(0.36, 0.1, -0.15, 0.55, D / 2, seg=28, axis="z"))
    g.add(body, "plastic", n, bev=0.025, seg=2)
    fan_guard(g, n, -0.15, 0.55, D / 2 + 0.01, 0.36)
    for i in range(14):
        g.box("metal", 0.012, H - 0.3, 0.03, W / 2 - 0.02, 0.55, -D / 2 + 0.1 + i * 0.065, group=n, bev=0)
    g.box("dark", 0.28, 0.5, 0.02, 0.48, 0.55, D / 2 + 0.005, group=n, bev=0.005, seg=1)
    for y in (0.3, 0.45):
        g.add(tube_between((0.55, y, D / 2 - 0.1), (0.85, y, D / 2 - 0.1), 0.02, 0.02, seg=8), "chrome", n, bev=0)
    for sx in (-1, 1):
        g.box("dark", 0.08, 0.1, D, sx * (W / 2 - 0.15), 0.05, 0, group=n, bev=0.01, seg=1)


def ac_wall(g):
    n = "ac_wall"
    W, H, D = 0.75, 0.55, 0.28
    body = box_raw(W, H, D, 0, H / 2, 0)
    cut(body, cyl_raw(0.2, 0.06, -0.1, H / 2, D / 2, seg=24, axis="z"))
    g.add(body, "plastic", n, bev=0.02, seg=2)
    fan_guard(g, n, -0.1, H / 2, D / 2 + 0.005, 0.2)
    for i in range(6):
        g.box("dark", 0.18, 0.012, 0.02, 0.24, 0.12 + i * 0.06, D / 2 + 0.002, group=n, bev=0)
    for x in (-W / 2 + 0.08, W / 2 - 0.08):
        g.add(seg_raw((x, -0.05, -D / 2), (x, -0.05, D / 2), 0.04, 0.04), "metal", n, bev=0)
    g.add(tube_between((W / 2 - 0.06, 0.15, -D / 2 + 0.08), (W / 2 + 0.05, 0.15, -D / 2 + 0.08), 0.015, 0.015, seg=6), "chrome", n, bev=0)
    g.add(tube_between((W / 2 + 0.05, 0.15, -D / 2 + 0.08), (W / 2 + 0.05, -0.6, -D / 2 + 0.08), 0.015, 0.015, seg=6), "dark", n, bev=0)


def garbage(g):
    n = "garbage"

    def shape(x, y, z):
        r = (1 - 0.35 * y ** 2) * (1 - 0.15 * abs(math.sin(x * 3 + z * 2)))
        return x * r, y * (0.85 + 0.1 * math.cos(x * 4)), z * r

    g.add(blob(0.6, 0.55, 0.55, 5, shape), "plastic", n, bev=0)
    g.add(tube_between((0, 0.5, 0), (0.04, 0.68, 0.02), 0.06, 0.02, seg=8), "plastic", n, bev=0)
    for a in (0.5, 2.6):
        g.add(seg_raw((0.03, 0.66, 0.02), (0.03 + math.cos(a) * 0.1, 0.7, 0.02 + math.sin(a) * 0.1), 0.05, 0.012, up=(0, 1, 0)), "plastic", n, bev=0)


def dumpster(g):
    n = "dumpster"
    W, H, D = 1.8, 1.2, 1.1
    body = prism_raw([(-D / 2, 0.18), (D / 2, 0.18), (D / 2 + 0.06, H), (-D / 2 - 0.02, H)], -W / 2, W / 2)
    g.add(body, "paint", n, bev=0.02, seg=2)
    for s in (-1, 1):
        g.box("paint", 0.06, 0.12, D + 0.1, s * (W / 2 - 0.25), H - 0.25, 0.02, group=n, bev=0.01, seg=1)
        g.box("dark", 0.2, 0.08, 0.18, s * (W / 2 + 0.05), 0.75, 0.0, group=n, bev=0.01, seg=1)
    g.add(seg_raw((-W / 2 + 0.2, H - 0.05, D / 2 + 0.12), (W / 2 - 0.2, H - 0.05, D / 2 + 0.12), 0.03, 0.03), "metal", n, bev=0)
    lid = prism_raw([(-D / 2 - 0.05, H), (D / 2 + 0.1, H - 0.02), (D / 2 + 0.1, H + 0.06), (-D / 2 - 0.05, H + 0.1)], -W / 2 - 0.02, W / 2 + 0.02)
    g.add(lid, "plastic", n, bev=0.02, seg=1)
    for sx in (-1, 1):
        for sz in (-1, 1):
            g.add(cyl_raw(0.08, 0.05, sx * (W / 2 - 0.15), 0.08, sz * (D / 2 - 0.12), seg=12, axis="x"), "rubber", n, bev=0.01, seg=1)
            g.box("dark", 0.08, 0.06, 0.12, sx * (W / 2 - 0.15), 0.17, sz * (D / 2 - 0.12), group=n, bev=0.005, seg=1)


def planter(g):
    n = "planter"
    W, H, D = 1.5, 0.9, 0.6
    tr = box_raw(W, H, D, 0, H / 2, 0)
    cut(tr, box_raw(W - 0.14, 0.3, D - 0.14, 0, H, 0))
    g.add(tr, "concrete", n, bev=0.02, seg=2)
    g.box("dark", W - 0.14, 0.04, D - 0.14, 0, H - 0.1, 0, group=n, bev=0)
    # Shrubs: clumps of leaves (low: never above the trough by more than a hand's spread).
    for i, x in enumerate((-0.48, -0.1, 0.3, 0.55)):
        z = 0.06 * (-1) ** i
        g.add(sphere_raw(0.2, x, H - 0.02, z, seg=8, rings=6, sx=1.1, sy=0.7, sz=0.9), "leaf", n, bev=0)
        g.add(sphere_raw(0.14, x + 0.12, H + 0.04, z - 0.05, seg=8, rings=6, sy=0.8), "leaf", n, bev=0)


def lantern_caps(g):
    n = "lantern_caps"
    # Round the game's lathe (radius 0.31 at its waist, 0.42 up and down): hoops, caps, a cord, a tassel.
    for y in (-0.42, 0.42):
        g.add(cyl_raw(0.085, 0.07, 0, y + (0.035 if y > 0 else -0.035), 0, seg=16, axis="y"), "wood", n, bev=0.01, seg=1)
    for y, r in ((-0.3, 0.255), (-0.15, 0.3), (0.0, 0.312), (0.15, 0.3), (0.3, 0.255)):
        t = L.torus_raw(r, 0.006, 0, 0, 0, seg=24, ring=4)
        t.data.transform(Matrix.Translation((0, y, 0)) @ Matrix.Rotation(math.pi / 2, 4, "X"))
        g.add(t, "dark", n, bev=0)
    g.add(cyl_raw(0.006, 0.35, 0, 0.66, 0, seg=6, axis="y"), "dark", n, bev=0)
    g.add(cyl_raw(0.01, 0.1, 0, -0.52, 0, seg=6, axis="y"), "paint", n, bev=0)
    g.add(cyl_raw(0.03, 0.16, 0, -0.65, 0, seg=8, r2=0.012, axis="y"), "paint", n, bev=0)


def ecab(g):
    n = "ecab"
    W, H, D = 1.2, 1.9, 0.5
    g.box("dark", W, 0.1, D, 0, 0.05, 0, group=n, bev=0.01, seg=1)
    body = box_raw(W, H - 0.1, D, 0, 0.1 + (H - 0.1) / 2, 0)
    cuts = [box_raw(0.006, H - 0.3, 0.02, 0, H / 2 + 0.05, D / 2)]
    for s in (-1, 1):
        for i in range(6):
            cuts.append(box_raw(0.3, 0.025, 0.02, s * 0.3, 0.3 + i * 0.05, D / 2))
    cut_many(body, cuts)
    g.add(body, "paint", n, bev=0.015, seg=1)
    g.add(prism_raw([(D / 2 + 0.06, H), (D / 2 + 0.06, H + 0.03), (-D / 2 - 0.02, H + 0.08), (-D / 2 - 0.02, H)], -W / 2 - 0.03, W / 2 + 0.03), "paint", n, bev=0.01, seg=1)
    for s in (-1, 1):
        g.box("chrome", 0.03, 0.14, 0.03, s * 0.06, 1.05, D / 2 + 0.015, group=n, bev=0.005, seg=1)
        for y in (0.4, 1.6):
            g.box("dark", 0.025, 0.1, 0.02, s * (W / 2 - 0.02), y, D / 2 + 0.005, group=n, bev=0)
    plate = prism_raw([(0, 0), (0.12, 0.2), (-0.12, 0.2)], -0.004, 0.004)
    plate.data.transform(Matrix.Translation((0.3, 1.4, D / 2 + 0.006)) @ Matrix.Rotation(-math.pi / 2, 4, "Y"))
    g.add(plate, "light", n, bev=0)
    g.add(cyl_raw(0.05, 0.3, -0.35, H + 0.2, -D / 2 + 0.08, seg=10, axis="y"), "metal", n, bev=0)
    g.add(tube_between((-0.35, H + 0.33, -D / 2 + 0.08), (-0.35, H + 0.33, -D / 2 - 0.05), 0.05, 0.05, seg=10), "metal", n, bev=0)


def bike(g):
    n = "bike"
    # Along Z: the front wheel at +Z.
    for z in (0.52, -0.52):
        t = L.torus_raw(0.33, 0.022, 0, 0, 0, seg=24, ring=6)
        t.data.transform(Matrix.Translation((0, 0.35, z)) @ Matrix.Rotation(math.pi / 2, 4, "Y"))
        g.add(t, "rubber", n, bev=0)
        for i in range(8):
            a = i / 8 * math.pi * 2
            g.add(seg_raw((0, 0.35, z), (0, 0.35 + math.sin(a) * 0.31, z + math.cos(a) * 0.31), 0.004, 0.004), "chrome", n, bev=0)
        g.add(cyl_raw(0.03, 0.08, 0, 0.35, z, seg=8, axis="x"), "chrome", n, bev=0)
    pts = {"bb": (0, 0.32, -0.02), "seat": (0, 0.8, -0.2), "head": (0, 0.85, 0.36), "rear": (0, 0.35, -0.52), "front": (0, 0.35, 0.52)}
    for a, b in (("bb", "seat"), ("bb", "head"), ("seat", "rear"), ("bb", "rear"), ("head", "front")):
        g.add(seg_raw(pts[a], pts[b], 0.03, 0.03, up=(1, 0, 0)), "paint", n, bev=0)
    g.add(seg_raw((0, 0.8, -0.2), (0, 0.93, -0.24), 0.025, 0.025), "chrome", n, bev=0)
    g.box("dark", 0.14, 0.05, 0.24, 0, 0.95, -0.25, group=n, bev=0.02, seg=1)
    g.add(seg_raw((0, 0.85, 0.36), (0, 1.02, 0.32), 0.025, 0.025), "chrome", n, bev=0)
    g.add(seg_raw((-0.28, 1.02, 0.32), (0.28, 1.02, 0.32), 0.022, 0.022), "chrome", n, bev=0)
    bask = box_raw(0.32, 0.22, 0.26, 0, 0.88, 0.62)
    cut(bask, box_raw(0.28, 0.22, 0.22, 0, 0.92, 0.62))
    g.add(bask, "chrome", n, bev=0.005, seg=1)
    g.add(seg_raw((0, 0.32, -0.25), (0.15, 0.02, -0.35), 0.02, 0.02), "chrome", n, bev=0)


def bench(g):
    n = "bench"
    for i in range(4):
        g.box("wood", 1.8, 0.035, 0.1, 0, 0.45, -0.18 + i * 0.12, group=n, bev=0.006, seg=1)
    for x in (-0.7, 0.7):
        g.add(prism_raw([(-0.22, 0.0), (-0.18, 0.43), (0.2, 0.43), (0.24, 0.0), (0.16, 0.0), (0.0, 0.3), (-0.14, 0.0)], x - 0.03, x + 0.03), "dark", n, bev=0.008, seg=1)


def bollard(g):
    n = "bollard"
    g.add(cyl_raw(0.1, 0.8, 0, 0.4, 0, seg=14, r2=0.09, axis="y"), "paint", n, bev=0.01, seg=1)
    g.add(sphere_raw(0.09, 0, 0.8, 0, seg=14, rings=6, sy=0.5), "paint", n, bev=0)
    g.add(cyl_raw(0.102, 0.06, 0, 0.66, 0, seg=14, axis="y"), "light", n, bev=0)
    g.add(cyl_raw(0.13, 0.03, 0, 0.015, 0, seg=14, axis="y"), "dark", n, bev=0)


def upole(g):
    n = "upole"
    H = 10.0
    g.add(tube_between((0, 0, 0), (0, H, 0), 0.18, 0.13, seg=14), "concrete", n, bev=0)
    for y, w in ((H - 0.8, 1.6), (H - 1.5, 1.3)):
        g.box("dark", w, 0.1, 0.1, 0, y, 0, group=n, bev=0.01, seg=1)
        for x in (-w / 2 + 0.1, 0, w / 2 - 0.1):
            for k in range(3):
                g.add(cyl_raw(0.05 - k * 0.008, 0.045, x, y + 0.08 + k * 0.045, 0, seg=10, axis="y"), "plastic", n, bev=0.005, seg=1)
    g.add(cyl_raw(0.28, 0.8, 0.35, H - 2.4, 0, seg=14, axis="y"), "metal", n, bev=0.02, seg=1)
    g.add(cyl_raw(0.3, 0.04, 0.35, H - 1.98, 0, seg=14, axis="y"), "metal", n, bev=0)
    for k in (-1, 1):
        g.add(cyl_raw(0.04, 0.12, 0.35 + k * 0.12, H - 1.9, 0, seg=8, axis="y"), "plastic", n, bev=0)
    # A street lamp on an arm, step bolts, the yellow guard at its foot.
    g.add(seg_raw((0, 6.0, 0), (0, 6.3, 1.2), 0.05, 0.05), "dark", n, bev=0)
    g.box("dark", 0.2, 0.08, 0.5, 0, 6.28, 1.4, group=n, bev=0.02, seg=1)
    g.box("light", 0.16, 0.02, 0.4, 0, 6.23, 1.4, group=n, bev=0)
    for i in range(14):
        a = (i % 2) * math.pi
        g.add(cyl_raw(0.012, 0.22, math.cos(a) * 0.2, 2.2 + i * 0.4, 0, seg=6, axis="x"), "metal", n, bev=0)
    g.add(cyl_raw(0.2, 1.6, 0, 0.8, 0, seg=14, axis="y"), "paint", n, bev=0.01, seg=1)
    for y in (0.3, 0.7, 1.1, 1.5):
        g.add(cyl_raw(0.205, 0.12, 0, y, 0, seg=14, axis="y"), "dark", n, bev=0)


def yatai(g):
    n = "yatai"
    W, D = 3.2, 1.0
    g.box("wood", W, 1.0, D, 0, 0.5, 0, group=n, bev=0.02, seg=1)
    for i in range(8):
        g.box("dark", 0.02, 0.9, 0.02, -W / 2 + 0.2 + i * 0.4, 0.5, D / 2 + 0.005, group=n, bev=0)
    g.box("dark", W + 0.2, 0.06, D + 0.2, 0, 1.05, 0, group=n, bev=0.01, seg=1)
    g.box("metal", 0.6, 0.25, 0.4, -0.9, 1.2, -0.2, group=n, bev=0.02, seg=1)
    g.add(cyl_raw(0.18, 0.3, 0.6, 1.23, -0.25, seg=16, axis="y"), "metal", n, bev=0.01, seg=1)
    for s in (-1.5, 1.5):
        g.box("wood", 0.1, 2.4, 0.1, s, 1.2, -0.45, group=n, bev=0.01, seg=1)
    g.add(prism_raw([(-0.95, 2.35), (0.75, 2.6), (0.75, 2.66), (-0.95, 2.41)], -1.8, 1.8), "paint", n, bev=0.01, seg=1)
    for i in range(4):
        x = -1.2 + i * 0.8
        g.add(cyl_raw(0.17, 0.05, x, 0.6, 0.95, seg=14, axis="y"), "paint", n, bev=0.01, seg=1)
        g.add(cyl_raw(0.03, 0.58, x, 0.29, 0.95, seg=8, axis="y"), "chrome", n, bev=0)
        g.add(cyl_raw(0.15, 0.02, x, 0.01, 0.95, seg=12, axis="y"), "chrome", n, bev=0)


BUILDERS = {
    "vending": vending, "ac_roof": ac_roof, "ac_wall": ac_wall, "garbage": garbage, "dumpster": dumpster, "planter": planter,
    "lantern_caps": lantern_caps, "ecab": ecab, "bike": bike, "bench": bench, "bollard": bollard, "upole": upole, "yatai": yatai,
}


def main():
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    opts = {"out": "public/models/props", "preview": None, "only": None}
    for i in range(0, len(argv), 2):
        opts[argv[i].lstrip("-")] = argv[i + 1]
    names = opts["only"].split(",") if opts["only"] else list(NODES)
    L.reset(ROLES)
    g = L.Gun("props_neon", groups=tuple(names))
    for name in names:
        BUILDERS[name](g)
    objs = g.finish(uv=1.0, decimate={"bike": 0.6, "upole": 0.6})
    for name, o in objs.items():
        print(f"  {name}: {sum(len(p.vertices) - 2 for p in o.data.polygons)} tris")
    if not opts["only"]:
        os.makedirs(opts["out"], exist_ok=True)
        path = os.path.join(opts["out"], "neon.glb")
        L.export_glb(objs, path)
        print(f"NEON: {L.tri_count(objs)} tris -> {path} ({os.path.getsize(path)} bytes)")
    if opts["preview"]:
        os.makedirs(opts["preview"], exist_ok=True)
        for name in names:
            for o in objs.values():
                o.hide_render = o.name != name
            L.preview({name: objs[name]}, os.path.join(opts["preview"], f"neon-{name}"), "neon", views=("three",), res=(800, 560))
        print("PREVIEW done")


main()
