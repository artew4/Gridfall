"""
71.0, the Desert's architecture dressing (docs/ENVIRONMENT_PLAN.md, step 4). Real size, base at Y = 0,
centred on X/Z, front (the side facing out of a wall) at +Z, three.js axes. Nothing here is solid: the
game puts it where it can't be taken for cover (flat on the walls, or over the heads).

  jamb, head, sill   an opening's frame in profiled pieces (a jamb 1 m tall, a head and a sill 1 m
                     long; the game stretches them along their length only): moulded, a keystone
  shutter            a louvred shutter leaf (0.5 x 1.0): its frame, the slats, two strap hinges
  door               a planked door leaf (1.0 x 2.1): boards, a Z brace, strap hinges, a ring pull
  ac                 a wall air conditioner (0.8 x 0.55 x 0.45): the grilled box, its fan, fins, the
                     bracket, the drain pipe
  roof_tank          a rooftop water tank (1.6 x 1.8): ribbed, its lid and outlet, on a low stand
  tower_tank         the water tower's tank (4.0 x 3.0, a cone roof to 3.8): riveted bands, a ladder,
                     a railed walkway round its foot, the roof vent
  brace              a flat steel brace 1 m long (the tower's X braces, over the heads)
  antenna            a radio mast (4.5 m): its sections, the whips, a junction box
  dish               a satellite dish (0.9 m): reflector, arm, feed, mount
  tent               a military tent (3.4 x 2.55 x 3.3): canvas walls, a ridge roof with eaves, poles,
                     a rolled door flap, windows
  awning             3.5 m of scalloped canvas awning on its rods
  palm               a date palm (7.5 m): a ringed trunk leaning a little, the crown's fronds arching
  lamp               a bulb's enamel shade on its bracket (the bulb is the game's: shoot it out)
  pole               a power pole (7.2 m): crossarm, insulators, a transformer can, a step bolt row

Roles: trim, wood, metal, canvas, plastic, bark, frond, enamel, dark.

  Blender -b --factory-startup -P tools/blender/props_desert.py -- [--out public/models/props] [--preview DIR] [--only a,b]
"""

import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import bmesh  # noqa: E402
import gunlib as L  # noqa: E402
from gunlib import box_raw, cut, cut_many, cyl_raw, front_raw, prism_raw, seg_raw, sphere_raw, tube_between  # noqa: E402
from mathutils import Matrix, Vector  # noqa: E402

ROLES = ("trim", "wood", "metal", "canvas", "plastic", "bark", "frond", "enamel", "dark")
NODES = ("jamb", "head", "sill", "shutter", "door", "ac", "roof_tank", "tower_tank", "brace", "antenna", "dish", "tent", "awning", "palm", "lamp", "pole")
L.PREVIEW["desert"] = {
    "trim": ((0.36, 0.25, 0.15), 0.0, 0.8),
    "wood": ((0.3, 0.2, 0.12), 0.0, 0.85),
    "metal": ((0.2, 0.2, 0.19), 0.6, 0.45),
    "canvas": ((0.42, 0.4, 0.28), 0.0, 0.95),
    "plastic": ((0.6, 0.6, 0.58), 0.05, 0.5),
    "bark": ((0.3, 0.22, 0.14), 0.0, 0.95),
    "frond": ((0.2, 0.28, 0.08), 0.0, 0.8),
    "enamel": ((0.15, 0.3, 0.25), 0.2, 0.35),
    "dark": ((0.04, 0.04, 0.04), 0.2, 0.7),
}


# ------------------------------------------------------------------ frames
def jamb(g):
    n = "jamb"
    # A moulded post: a flat face with two steps out from the wall, 1 m tall (stretched in Y only).
    g.add(front_raw([(-0.07, 0.0), (0.07, 0.0), (0.07, 0.025), (0.055, 0.04), (0.04, 0.055), (-0.04, 0.055), (-0.055, 0.04), (-0.07, 0.025)], 0, 1.0), "trim", n, bev=0.004, seg=1)
    n_obj = g.parts[-1][0]
    # front_raw extrudes along Z: turn it to stand up (its section in X, Z out of the wall).
    n_obj.data.transform(Matrix.Rotation(-math.pi / 2, 4, "X"))


def head(g):
    n = "head"
    # A lintel with a cornice lip and a keystone (1 m long, stretched in X only).
    g.add(prism_raw([(0.0, 0.0), (0.06, 0.0), (0.06, 0.12), (0.085, 0.14), (0.085, 0.18), (0.0, 0.18)], -0.5, 0.5), "trim", n, bev=0.004, seg=1)
    g.add(prism_raw([(0.0, 0.0), (0.075, 0.0), (0.075, 0.16), (0.0, 0.2)], -0.06, 0.06), "trim", n, bev=0.004, seg=1)


def sill(g):
    n = "sill"
    g.add(prism_raw([(0.0, 0.05), (0.09, 0.05), (0.1, 0.035), (0.1, 0.0), (0.0, 0.0)], -0.5, 0.5), "trim", n, bev=0.004, seg=1)
    g.add(prism_raw([(0.0, 0.0), (0.06, 0.0), (0.06, -0.05), (0.0, -0.06)], -0.42, 0.42), "trim", n, bev=0.004, seg=1)


def shutter(g):
    n = "shutter"
    W, H, T = 0.5, 1.0, 0.035
    for x in (-W / 2 + 0.03, W / 2 - 0.03):
        g.box("wood", 0.06, H, T, x, H / 2, 0, group=n, bev=0.004, seg=1)
    for y in (0.03, H / 2, H - 0.03):
        g.box("wood", W, 0.06, T, 0, y, 0, group=n, bev=0.004, seg=1)
    for half in (0, 1):
        y0 = 0.06 + half * (H / 2 - 0.03)
        for i in range(7):
            g.box("wood", W - 0.1, 0.05, 0.012, 0, y0 + 0.03 + i * 0.058, 0, rx=-0.6, group=n, bev=0)
    for y in (0.15, H - 0.15):
        g.box("metal", 0.2, 0.025, 0.01, -W / 2 + 0.1, y, T / 2 + 0.004, group=n, bev=0)


def door(g):
    n = "door"
    W, H, T = 1.0, 2.1, 0.045
    for i in range(6):
        b = box_raw(W / 6 - 0.006, H, T, -W / 2 + (i + 0.5) * W / 6, H / 2, 0)
        g.add(b, "wood", n, bev=0.006, seg=1)
    for y in (0.25, H - 0.25):
        g.box("wood", W - 0.06, 0.12, 0.03, 0, y, T / 2 + 0.015, group=n, bev=0.004, seg=1)
    g.add(seg_raw((-W / 2 + 0.08, 0.31, T / 2 + 0.015), (W / 2 - 0.08, H - 0.31, T / 2 + 0.015), 0.11, 0.03, up=(0, 0, 1)), "wood", n, bev=0.004, seg=1)
    for y in (0.25, H - 0.25):
        g.box("metal", 0.45, 0.04, 0.008, -W / 2 + 0.22, y, T / 2 + 0.034, group=n, bev=0)
    g.add(L.torus_raw(0.04, 0.008, 0, 0, 0, seg=12, ring=6), "metal", n, bev=0)
    g.parts[-1][0].data.transform(Matrix.Translation((W / 2 - 0.12, 1.0, T / 2 + 0.04)))


# ------------------------------------------------------------------ on the walls and roofs
def ac(g):
    n = "ac"
    W, H, D = 0.8, 0.55, 0.45
    box = box_raw(W, H, D, 0, H / 2 + 0.05, 0)
    cuts = [box_raw(W - 0.12, 0.04, 0.03, 0, 0.13 + i * 0.06, D / 2) for i in range(7)]
    cuts.append(cyl_raw(0.17, 0.05, 0.12, H / 2 + 0.05, D / 2, seg=20, axis="z"))
    cut_many(box, cuts)
    g.add(box, "plastic", n, bev=0.02, seg=2)
    g.add(cyl_raw(0.165, 0.02, 0.12, H / 2 + 0.05, D / 2 - 0.03, seg=20, axis="z"), "dark", n, bev=0)
    for k in range(3):
        a = k / 3 * math.pi * 2
        g.add(seg_raw((0.12, H / 2 + 0.05, D / 2 - 0.015), (0.12 + math.cos(a) * 0.15, H / 2 + 0.05 + math.sin(a) * 0.15, D / 2 - 0.015), 0.07, 0.008, up=(0, 0, 1)), "metal", n, bev=0)
    for i in range(10):
        g.box("metal", 0.012, H - 0.12, 0.02, -W / 2 + 0.002, H / 2 + 0.05, -D / 2 + 0.05 + i * 0.035, group=n, bev=0)
    for x in (-W / 2 + 0.08, W / 2 - 0.08):
        g.add(seg_raw((x, 0.05, -D / 2), (x, 0.05, D / 2 + 0.02), 0.04, 0.04), "metal", n, bev=0)
        g.add(seg_raw((x, 0.05, D / 2), (x, 0.5, -D / 2 + 0.02), 0.03, 0.03), "metal", n, bev=0)
    g.add(tube_between((-W / 2 + 0.1, 0.05, -D / 2 + 0.05), (-W / 2 + 0.1, -0.6, -D / 2 + 0.05), 0.012, 0.012, seg=6), "dark", n, bev=0)


def roof_tank(g):
    n = "roof_tank"
    R, H = 0.8, 1.8
    g.box("metal", 1.5, 0.12, 1.5, 0, 0.06, 0, group=n, bev=0.01, seg=1)
    t = cyl_raw(R, H - 0.12, 0, 0.12 + (H - 0.12) / 2, 0, seg=24, axis="y")
    g.add(t, "plastic", n, bev=0.05, seg=3)
    for y in (0.5, 0.9, 1.3):
        g.add(L.torus_raw(R, 0.02, 0, 0, 0, seg=24, ring=6), "plastic", n, bev=0)
        g.parts[-1][0].data.transform(Matrix.Translation((0, y, 0)) @ Matrix.Rotation(math.pi / 2, 4, "X"))
    g.add(cyl_raw(0.25, 0.1, 0, H + 0.03, 0, seg=16, axis="y"), "plastic", n, bev=0.02, seg=1)
    g.add(tube_between((R - 0.05, 0.3, 0), (R + 0.2, 0.3, 0), 0.03, 0.03, seg=8), "dark", n, bev=0)
    g.add(tube_between((R + 0.2, 0.3, 0), (R + 0.2, 0.0, 0), 0.03, 0.03, seg=8), "dark", n, bev=0)


def tower_tank(g):
    n = "tower_tank"
    R, H = 2.0, 3.0
    g.add(cyl_raw(R, H, 0, H / 2, 0, seg=32, axis="y"), "metal", n, bev=0.02, seg=1)
    for y in (0.05, 1.0, 2.0, 2.95):
        g.add(L.torus_raw(R + 0.005, 0.03, 0, 0, 0, seg=32, ring=6), "metal", n, bev=0)
        g.parts[-1][0].data.transform(Matrix.Translation((0, y, 0)) @ Matrix.Rotation(math.pi / 2, 4, "X"))
    roof = cyl_raw(R + 0.1, 0.8, 0, H + 0.4, 0, seg=32, r2=0.15, axis="y")
    g.add(roof, "metal", n, bev=0.01, seg=1)
    g.add(cyl_raw(0.18, 0.3, 0, H + 0.95, 0, seg=12, axis="y"), "metal", n, bev=0.01, seg=1)
    g.add(cyl_raw(0.26, 0.04, 0, H + 1.12, 0, seg=12, axis="y"), "metal", n, bev=0)
    # A railed walkway round its foot, a ladder up its side.
    ring = cyl_raw(R + 0.6, 0.05, 0, 0.0, 0, seg=32, axis="y")
    cut(ring, cyl_raw(R - 0.05, 0.2, 0, 0.0, 0, seg=32, axis="y"))
    g.add(ring, "dark", n, bev=0)
    for y in (0.5, 1.0):
        g.add(L.torus_raw(R + 0.58, 0.02, 0, 0, 0, seg=32, ring=4), "dark", n, bev=0)
        g.parts[-1][0].data.transform(Matrix.Translation((0, y, 0)) @ Matrix.Rotation(math.pi / 2, 4, "X"))
    for i in range(16):
        a = i / 16 * math.pi * 2
        g.add(cyl_raw(0.02, 1.0, math.cos(a) * (R + 0.58), 0.5, math.sin(a) * (R + 0.58), seg=6, axis="y"), "dark", n, bev=0)
    for x in (-0.22, 0.22):
        g.add(cyl_raw(0.02, H + 0.5, x, (H + 0.5) / 2, R + 0.12, seg=6, axis="y"), "dark", n, bev=0)
    for i in range(12):
        g.add(cyl_raw(0.015, 0.44, 0, 0.3 + i * 0.28, R + 0.12, seg=6, axis="x"), "dark", n, bev=0)


def brace(g):
    g.box("dark", 1.0, 0.08, 0.012, 0, 0.04, 0, group="brace", bev=0.003, seg=1)


def antenna(g):
    n = "antenna"
    for i, (r, h) in enumerate(((0.05, 2.0), (0.035, 1.6), (0.022, 0.9))):
        y = sum(hh for _, hh in ((0.05, 2.0), (0.035, 1.6), (0.022, 0.9))[:i])
        g.add(cyl_raw(r, h, 0, y + h / 2, 0, seg=10, axis="y"), "metal", n, bev=0)
    for y in (2.8, 3.6):
        for a in (0, math.pi / 2):
            g.add(seg_raw((-0.45 * math.cos(a), y, -0.45 * math.sin(a)), (0.45 * math.cos(a), y, 0.45 * math.sin(a)), 0.015, 0.015), "metal", n, bev=0)
    g.add(cyl_raw(0.008, 0.6, 0, 4.8, 0, seg=6, axis="y"), "metal", n, bev=0)
    g.box("dark", 0.2, 0.28, 0.12, 0, 0.6, 0.1, group=n, bev=0.01, seg=1)
    g.box("metal", 0.4, 0.04, 0.4, 0, 0.02, 0, group=n, bev=0.006, seg=1)


def dish(g):
    n = "dish"
    bm = bmesh.new()
    rings, seg, R, D = 6, 24, 0.45, 0.12
    verts = [[bm.verts.new((R * (k / rings) * math.cos(i / seg * 2 * math.pi), D * (k / rings) ** 2, R * (k / rings) * math.sin(i / seg * 2 * math.pi))) for i in range(seg)] for k in range(1, rings + 1)]
    c = bm.verts.new((0, 0, 0))
    for i in range(seg):
        bm.faces.new((c, verts[0][(i + 1) % seg], verts[0][i]))
    for k in range(rings - 1):
        for i in range(seg):
            bm.faces.new((verts[k][i], verts[k][(i + 1) % seg], verts[k + 1][(i + 1) % seg], verts[k + 1][i]))
    bmesh.ops.solidify(bm, geom=bm.faces[:], thickness=0.012)
    dob = L._link("dish", bm)
    dob.data.transform(Matrix.Translation((0, 0.75, 0.05)) @ Matrix.Rotation(-1.1, 4, "X"))
    g.add(dob, "plastic", n, bev=0)
    g.add(seg_raw((0, 0.55, 0.0), (0, 0.95, 0.42), 0.025, 0.025), "metal", n, bev=0)
    g.box("dark", 0.06, 0.1, 0.06, 0, 0.97, 0.44, group=n, bev=0.005, seg=1)
    g.add(cyl_raw(0.03, 0.75, 0, 0.375, -0.05, seg=8, axis="y"), "metal", n, bev=0)
    g.box("metal", 0.3, 0.03, 0.3, 0, 0.015, -0.05, group=n, bev=0.004, seg=1)


def tent(g):
    n = "tent"
    W, D, Hw, Hr = 3.4, 3.3, 2.0, 2.55
    # Walls (a little in from the footprint at the top), the ridge roof with its eaves.
    body = front_raw([(-W / 2, 0), (W / 2, 0), (W / 2 - 0.08, Hw), (-W / 2 + 0.08, Hw)], -D / 2, D / 2)
    g.add(body, "canvas", n, bev=0.03, seg=2)
    roof = prism_raw([(-D / 2 - 0.15, Hw - 0.12), (0.0, Hr), (D / 2 + 0.15, Hw - 0.12), (D / 2 + 0.12, Hw - 0.16), (0.0, Hr - 0.05), (-D / 2 - 0.12, Hw - 0.16)], -W / 2 - 0.12, W / 2 + 0.12)
    g.add(roof, "canvas", n, bev=0.01, seg=1)
    g.add(prism_raw([(-D / 2 + 0.05, Hw), (0.0, Hr - 0.02), (D / 2 - 0.05, Hw)], -W / 2 + 0.08, W / 2 - 0.08), "canvas", n, bev=0)
    # The door (a dark flap rolled up over it), windows, poles at the corners, guy ropes to stakes.
    g.box("dark", 0.02, 1.7, 1.0, W / 2 - 0.07, 0.85, 0.0, group=n, bev=0)
    g.add(cyl_raw(0.07, 1.05, W / 2 - 0.02, 1.75, 0, seg=10), "canvas", n, bev=0.01, seg=1)
    for z in (-0.9, 0.9):
        g.box("dark", 0.5, 0.4, 0.02, z * 1.1, 1.35, D / 2 + 0.002, group=n, bev=0)
        g.box("dark", 0.5, 0.4, 0.02, z * 1.1, 1.35, -D / 2 - 0.002, group=n, bev=0)
    for sx in (-1, 1):
        for sz in (-1, 1):
            g.add(cyl_raw(0.03, Hw + 0.1, sx * (W / 2 - 0.06), (Hw + 0.1) / 2, sz * (D / 2 + 0.02), seg=6, axis="y"), "wood", n, bev=0)
            g.add(seg_raw((sx * (W / 2 - 0.1), Hw - 0.15, sz * (D / 2 + 0.1)), (sx * (W / 2 - 0.4), 0.02, sz * (D / 2 - 0.1)), 0.012, 0.012), "dark", n, bev=0)
    for sx in (-1, 1):
        g.add(cyl_raw(0.035, Hr + 0.15, sx * (W / 2 + 0.05), (Hr + 0.15) / 2, 0, seg=6, axis="y"), "wood", n, bev=0)


def awning(g):
    n = "awning"
    Lw, D = 3.5, 2.3
    # The canvas sloping out (its back high on the wall), a scalloped valance, the front rod.
    sheet = front_raw([(-Lw / 2, 0.0), (Lw / 2, 0.0), (Lw / 2, 0.04), (-Lw / 2, 0.04)], -D / 2, D / 2)
    sheet.data.transform(Matrix.Rotation(-0.12, 4, "X"))
    g.add(sheet, "canvas", n, bev=0)
    for i in range(7):
        x = -Lw / 2 + (i + 0.5) * Lw / 7
        sc = prism_raw([(0, 0), (0, -0.22), (0.01, -0.22), (0.01, 0)], x - Lw / 14, x + Lw / 14)
        cut(sc, cyl_raw(Lw / 14, 0.1, x, -0.32, 0, seg=14, axis="z"))
        sc.data.transform(Matrix.Translation((0, -D / 2 * math.sin(-0.12) - 0.02, D / 2 - 0.005)))
        g.add(sc, "canvas", n, bev=0)
    g.add(cyl_raw(0.02, Lw, 0, -D / 2 * math.sin(-0.12), D / 2, seg=8, axis="x"), "metal", n, bev=0)
    for x in (-Lw / 2 + 0.05, Lw / 2 - 0.05):
        g.add(seg_raw((x, 0.15, -D / 2), (x, -0.1, D / 2 - 0.05), 0.02, 0.02), "metal", n, bev=0)


def palm(g):
    n = "palm"
    # The trunk: rings of old frond bases, leaning a little, thinner up top.
    h, lean = 6.6, 0.25
    k = 22
    for i in range(k):
        t0, t1 = i / k, (i + 1) / k
        p0 = Vector((lean * t0 ** 1.5, h * t0, 0))
        p1 = Vector((lean * t1 ** 1.5, h * t1, 0))
        r0, r1 = 0.24 - 0.08 * t0, 0.24 - 0.08 * t1
        g.add(tube_between(p0, p1, r0 * 1.08, r1 * 0.92, seg=10), "bark", n, bev=0)
    top = Vector((lean, h, 0))
    g.add(sphere_raw(0.28, top.x, top.y + 0.05, top.z, seg=10, rings=8, sy=0.8), "bark", n, bev=0)
    # The fronds: arching strips of leaflets (each frond a spine and two rows of narrow blades).
    for j in range(14):
        a = j / 14 * math.pi * 2 + (j % 2) * 0.2
        up = 0.6 if j % 2 else 0.25
        d = Vector((math.cos(a), 0, math.sin(a)))
        pts = []
        for s in range(8):
            u = s / 7
            pts.append(top + d * (u * 3.0) + Vector((0, up * 2.2 * u - 2.6 * u * u + 0.15, 0)))
        side = Vector((-d.z, 0, d.x))
        bm = bmesh.new()
        prev = None
        for s, p in enumerate(pts):
            w = 0.05 + 0.55 * math.sin(math.pi * min(1, s / 7 * 1.1)) * (1 - s / 9)
            droop = Vector((0, -0.18 * (s / 7), 0))
            row = (bm.verts.new(p + side * w + droop), bm.verts.new(p), bm.verts.new(p - side * w + droop))
            if prev:
                bm.faces.new((prev[0], prev[1], row[1], row[0]))
                bm.faces.new((prev[1], prev[2], row[2], row[1]))
            prev = row
        fr = L._link("frond", bm)
        g.add(fr, "frond", n, bev=0)


def lamp(g):
    n = "lamp"
    # The shade (an enamel cone over the bulb at the origin's height + 0.06), the cord up to a bracket.
    shade = cyl_raw(0.2, 0.14, 0, 0.13, 0, seg=20, r2=0.06, axis="y")
    cut(shade, cyl_raw(0.18, 0.13, 0, 0.12, 0, seg=20, r2=0.04, axis="y"))
    g.add(shade, "enamel", n, bev=0.004, seg=1)
    g.add(cyl_raw(0.05, 0.06, 0, 0.21, 0, seg=12, axis="y"), "dark", n, bev=0.005, seg=1)
    g.add(cyl_raw(0.008, 0.32, 0, 0.4, 0, seg=6, axis="y"), "dark", n, bev=0)
    g.add(seg_raw((0, 0.56, 0), (0, 0.56, -0.3), 0.025, 0.025), "metal", n, bev=0)
    g.box("metal", 0.08, 0.12, 0.02, 0, 0.56, -0.3, group=n, bev=0.003, seg=1)


def pole(g):
    n = "pole"
    g.add(tube_between((0, 0, 0), (0, 7.2, 0), 0.15, 0.12, seg=12), "bark", n, bev=0)
    g.box("wood", 1.6, 0.1, 0.1, 0, 6.8, 0, group=n, bev=0.008, seg=1)
    for x in (-0.65, -0.25, 0.25, 0.65):
        for k in range(3):
            g.add(cyl_raw(0.05 - k * 0.006, 0.05, x, 6.9 + k * 0.05, 0, seg=10, axis="y"), "enamel", n, bev=0.006, seg=1)
    for s in (-1, 1):
        g.add(seg_raw((0, 6.3, 0), (s * 0.6, 6.78, 0), 0.03, 0.03), "metal", n, bev=0)
    g.add(cyl_raw(0.22, 0.65, 0.0, 5.7, 0.32, seg=14, axis="y"), "metal", n, bev=0.02, seg=1)
    g.add(cyl_raw(0.24, 0.04, 0.0, 6.04, 0.32, seg=14, axis="y"), "metal", n, bev=0)
    for i in range(10):
        a = (i % 2) * math.pi
        g.add(cyl_raw(0.012, 0.18, math.cos(a) * 0.18, 2.2 + i * 0.35, math.sin(a) * 0.18 * 0, seg=6, axis="x"), "metal", n, bev=0)


BUILDERS = {
    "jamb": jamb, "head": head, "sill": sill, "shutter": shutter, "door": door, "ac": ac, "roof_tank": roof_tank,
    "tower_tank": tower_tank, "brace": brace, "antenna": antenna, "dish": dish, "tent": tent, "awning": awning,
    "palm": palm, "lamp": lamp, "pole": pole,
}


def main():
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    opts = {"out": "public/models/props", "preview": None, "only": None}
    for i in range(0, len(argv), 2):
        opts[argv[i].lstrip("-")] = argv[i + 1]
    names = opts["only"].split(",") if opts["only"] else list(NODES)
    L.reset(ROLES)
    g = L.Gun("props_desert", groups=tuple(names))
    for name in names:
        BUILDERS[name](g)
    objs = g.finish(uv=1.0)
    for name, o in objs.items():
        print(f"  {name}: {sum(len(p.vertices) - 2 for p in o.data.polygons)} tris")
    if not opts["only"]:
        os.makedirs(opts["out"], exist_ok=True)
        path = os.path.join(opts["out"], "desert.glb")
        L.export_glb(objs, path)
        print(f"DESERT: {L.tri_count(objs)} tris -> {path} ({os.path.getsize(path)} bytes)")
    if opts["preview"]:
        os.makedirs(opts["preview"], exist_ok=True)
        for name in names:
            for o in objs.values():
                o.hide_render = o.name != name
            L.preview({name: objs[name]}, os.path.join(opts["preview"], f"desert-{name}"), "desert", views=("three",), res=(800, 560))
        print("PREVIEW done")


main()
