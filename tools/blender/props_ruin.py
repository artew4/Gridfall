"""
76.0, Favelas and wreckage (docs/ENVIRONMENT_PLAN.md, step 8, its rest): the hill's houses and street,
the jungle's wrecks. Base at Y = 0, centred on X/Z (three.js axes), length along Z.

Favelas (instanced: each one geometry in one material, coloured per instance where the map does):
  ftank      a polyethylene water tank (a Fortlev): ribbed, a lid, its inlet (r 0.75, 1.2 tall)
  fdoor      a stamped steel door in its frame, a vent grille, a handle (0.1 x 2.0 x 0.9: both faces)
  fgrille    a window's iron grille: frame, bars, a sunburst (0.04 x 0.9 x 0.85)
  zinc       a corrugated roofing sheet (1 x 0.06 x 1: stretched over a tower)
  rebar      bare block's waiting rebar: four bars out of a column's head, tied, bent over
  fdish      a satellite dish on its wall bracket (its back at Z = 0, facing +Z)
Favelas (dressed: roles in the map's materials):
  fusca      a Beetle (1.8 x 1.45 x 4.2), its glass, chrome, lamps
  kombi      a split-window Kombi (1.75 x 1.95 x 4.5), two-tone
  fstall     a market stall: plank counter, fruit crates, a striped awning on two posts (2.8 x 2.3 x 2.5)
Wreckage:
  heli_tail  a helicopter's tail boom torn off: fin, tail rotor, stabiliser
  heli_blade a main rotor blade, bent
  panel      a torn skin panel lying curled on the ground (under 0.2 m: walked over)

  Blender -b --factory-startup -P tools/blender/props_ruin.py -- [--out public/models/props] [--preview DIR] [--only a,b]
"""

import math
import os
import random
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import bmesh  # noqa: E402
import gunlib as L  # noqa: E402
from gunlib import box_raw, cut_many, cyl_raw, front_raw, prism_raw, seg_raw, sphere_raw, tube_between  # noqa: E402
from mathutils import Matrix, Vector  # noqa: E402

ROLES = ("plastic", "paint", "metal", "rust", "glass", "chrome", "rubber", "dark", "light", "white", "wood", "canvas", "fruit", "red")
NODES = ("ftank", "fdoor", "fgrille", "zinc", "rebar", "fdish", "fusca", "kombi", "fstall", "heli_tail", "heli_blade", "panel")
L.PREVIEW["ruin"] = {
    "plastic": ((0.12, 0.3, 0.6), 0.0, 0.5),
    "paint": ((0.55, 0.12, 0.1), 0.2, 0.5),
    "metal": ((0.5, 0.5, 0.5), 0.7, 0.45),
    "rust": ((0.35, 0.18, 0.1), 0.3, 0.85),
    "glass": ((0.04, 0.05, 0.06), 0.2, 0.1),
    "chrome": ((0.8, 0.8, 0.8), 1.0, 0.2),
    "rubber": ((0.03, 0.03, 0.03), 0.0, 0.9),
    "dark": ((0.05, 0.05, 0.05), 0.2, 0.7),
    "light": ((0.9, 0.85, 0.7), 0.1, 0.2),
    "white": ((0.85, 0.84, 0.8), 0.1, 0.5),
    "wood": ((0.45, 0.3, 0.18), 0.0, 0.85),
    "canvas": ((0.15, 0.45, 0.25), 0.0, 0.9),
    "fruit": ((0.85, 0.45, 0.05), 0.0, 0.6),
    "red": ((0.7, 0.06, 0.04), 0.1, 0.5),
}


def bm_obj(name, build):
    bm = bmesh.new()
    build(bm)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return L._link(name, bm)


def xform(ob, m):
    ob.data.transform(m)
    ob.data.update()
    return ob


# ------------------------------------------------------------------ Favelas: instanced
def ftank(g):
    n = "ftank"
    # The body: a cone, wider at its shoulder, then ribs round it; the lid a low dome.
    g.add(cyl_raw(0.66, 0.95, 0, 0.475, 0, seg=20, r2=0.74, axis="y"), "plastic", n, bev=0.02, seg=1)
    for y in (0.25, 0.5, 0.75):
        rib = L.torus_raw(0.66 + 0.08 * y / 0.95 + 0.005, 0.012, seg=20, ring=4)
        g.add(xform(rib, Matrix.Translation((0, y, 0)) @ Matrix.Rotation(math.pi / 2, 4, "X")), "plastic", n, bev=0)
    g.add(cyl_raw(0.75, 0.06, 0, 0.98, 0, seg=20, axis="y"), "plastic", n, bev=0.015, seg=1)
    g.add(sphere_raw(0.7, 0, 1.01, 0, seg=20, rings=6, sy=0.24), "plastic", n, bev=0)
    for k in range(6):
        a = k / 6 * math.pi * 2
        g.box("plastic", 0.06, 0.05, 0.14, math.cos(a) * 0.72, 1.0, math.sin(a) * 0.72, ry=-a, group=n, bev=0.01, seg=1)
    # The inlet and outlet.
    g.add(cyl_raw(0.04, 0.2, 0.0, 0.88, 0.76, seg=10), "plastic", n, bev=0)
    g.add(cyl_raw(0.04, 0.16, 0.25, 0.1, 0.68, seg=10), "plastic", n, bev=0)


def fdoor(g):
    n = "fdoor"
    W, H, T = 0.9, 2.0, 0.1
    # The frame (both faces: the door is seen from whichever side faces out), the leaf a little in.
    for s in (-1, 1):
        g.box("paint", T, H, 0.06, 0, H / 2, s * (W / 2 - 0.03), group=n, bev=0)
    g.box("paint", T, 0.06, W, 0, H - 0.03, 0, group=n, bev=0)
    g.box("paint", T - 0.03, H - 0.08, W - 0.1, 0, (H - 0.08) / 2 + 0.02, 0, group=n, bev=0)
    # Stamped panels: raised rectangles both faces, a vent grille up top, the handle.
    for s in (-1, 1):
        x = s * (T - 0.03) / 2
        for y0, y1 in ((0.15, 0.85), (0.95, 1.45)):
            g.box("paint", 0.012, y1 - y0, W - 0.3, x + s * 0.006, (y0 + y1) / 2, 0, group=n, bev=0)
        for i in range(4):
            g.box("paint", 0.016, 0.025, W - 0.36, x + s * 0.008, 1.62 + i * 0.07, 0, group=n, bev=0)
        g.box("paint", 0.02, 0.04, 0.14, x + s * 0.02, 1.0, W / 2 - 0.16, group=n, bev=0)
        g.add(cyl_raw(0.03, 0.03, x + s * 0.012, 1.0, W / 2 - 0.12, seg=6, axis="x"), "paint", n, bev=0)


def fgrille(g):
    n = "fgrille"
    W, H, T = 0.85, 0.9, 0.04
    for s in (-1, 1):
        g.box("metal", T, H, 0.03, 0, H / 2, s * (W / 2 - 0.015), group=n, bev=0)
        g.box("metal", T, 0.03, W, 0, H / 2 + s * (H / 2 - 0.015), 0, group=n, bev=0)
    for i in range(1, 6):
        z = -W / 2 + i * W / 6
        g.box("metal", T, H - 0.04, 0.016, 0, H / 2, z, group=n, bev=0)
    g.box("metal", T, 0.016, W - 0.04, 0, H * 0.42, 0, group=n, bev=0)
    # A sunburst in the top: rays from the middle of the bar.
    for k in range(5):
        a = math.pi * (k + 0.5) / 5
        p0 = (0, H * 0.42, 0)
        p1 = (0, H * 0.42 + math.sin(a) * (H * 0.55), math.cos(a) * W * 0.47)
        p1 = (0, min(p1[1], H - 0.03), p1[2])
        g.add(seg_raw(p0, p1, 0.012, T, up=(1.0, 0.0, 0.0)), "metal", n, bev=0)
    g.add(L.torus_raw(0.1, T / 2, 0, H * 0.42, 0, seg=10, ring=3), "metal", n, bev=0)
    xform(g.parts[-1][0], Matrix.Translation((0, H * 0.42, 0)) @ Matrix.Rotation(math.pi / 2, 4, "Y") @ Matrix.Translation((0, -H * 0.42, 0)))


def zinc(g):
    n = "zinc"
    RIB = 22

    def build(bm):
        nz = RIB * 6
        top, bot = [], []
        for i in range(nz + 1):
            z = -0.5 + i / nz
            y = 0.03 + 0.025 * math.sin(i / 6 * math.pi * 2)
            top.append((bm.verts.new((-0.5, y + 0.005, z)), bm.verts.new((0.5, y + 0.005, z))))
            bot.append((bm.verts.new((-0.5, y - 0.005, z)), bm.verts.new((0.5, y - 0.005, z))))
        for i in range(nz):
            bm.faces.new((top[i][0], top[i + 1][0], top[i + 1][1], top[i][1]))
            bm.faces.new((bot[i][1], bot[i + 1][1], bot[i + 1][0], bot[i][0]))
            for k in (0, 1):
                f = (top[i][k], bot[i][k], bot[i + 1][k], top[i + 1][k])
                bm.faces.new(f if k else f[::-1])
        for i in (0, nz):
            bm.faces.new((top[i][0], top[i][1], bot[i][1], bot[i][0]))

    g.add(bm_obj("zinc", build), "metal", n, bev=0)


def rebar(g):
    n = "rebar"
    rnd = random.Random(4)
    # The column's head (a stub of concrete), four bars out of it, tied with a stirrup, bent over.
    g.box("rust", 0.2, 0.06, 0.2, 0, 0.03, 0, group=n, bev=0.01, seg=1)
    for sx in (-1, 1):
        for sz in (-1, 1):
            x, z = sx * 0.06, sz * 0.06
            h = 0.5 + rnd.random() * 0.3
            g.add(cyl_raw(0.008, h, x, h / 2, z, seg=6, axis="y"), "rust", n, bev=0)
            a = rnd.random() * math.pi * 2
            tip = (x + math.cos(a) * 0.12, h + 0.04, z + math.sin(a) * 0.12)
            g.add(tube_between((x, h, z), tip, 0.008, 0.008, seg=6), "rust", n, bev=0)
    for y in (0.15, 0.35):
        for s in (-1, 1):
            g.add(cyl_raw(0.004, 0.13, s * 0.06, y, 0, seg=4), "rust", n, bev=0)
            g.add(cyl_raw(0.004, 0.13, 0, y, s * 0.06, seg=4, axis="x"), "rust", n, bev=0)


def fdish(g):
    n = "fdish"
    # The bracket (on the wall at Z = 0), the arm, the dish facing out and up a little, the LNB.
    g.box("white", 0.12, 0.2, 0.02, 0, 0.1, 0.01, group=n, bev=0.004, seg=1)
    g.add(cyl_raw(0.018, 0.3, 0, 0.1, 0.16, seg=8), "white", n, bev=0)
    dish = sphere_raw(0.24, 0, 0, 0, seg=20, rings=10, sz=0.35)
    cut_many(dish, [box_raw(1, 1, 0.5, 0, 0, -0.25)])
    xform(dish, Matrix.Translation((0, 0.18, 0.3)) @ Matrix.Rotation(math.radians(160), 4, "X"))
    g.add(dish, "white", n, bev=0)
    g.add(seg_raw((0, 0.08, 0.32), (0, 0.22, 0.52), 0.015, 0.015), "white", n, bev=0)
    g.box("white", 0.05, 0.05, 0.08, 0, 0.23, 0.53, group=n, bev=0.01, seg=1)


# ------------------------------------------------------------------ Favelas: dressed
def wheel(g, n, x, y, z, r, w):
    g.add(cyl_raw(r, w, x, y, z, seg=20, axis="x"), "rubber", n, bev=0.02, seg=2)
    s = 1 if x > 0 else -1
    g.add(cyl_raw(r * 0.6, 0.03, x + s * w / 2, y, z, seg=16, axis="x"), "chrome", n, bev=0.006, seg=1)
    g.add(sphere_raw(r * 0.28, x + s * (w / 2 + 0.01), y, z, seg=12, rings=6, sx=0.4), "chrome", n, bev=0)


def fusca(g):
    n = "fusca"
    # The tub (below the belt), the fenders' bulges, the domed cabin, its glass, running boards.
    body = prism_raw([(2.05, 0.32), (2.0, 0.5), (1.6, 0.68), (1.05, 0.85), (-1.2, 0.87), (-1.75, 0.78), (-2.05, 0.52), (-2.02, 0.3), (-1.6, 0.22), (1.6, 0.22)], -0.74, 0.74)
    g.add(body, "paint", n, bev=0.12, seg=3, angle=30)
    for z, zr in ((1.3, 0.5), (-1.2, 0.55)):
        for s in (-1, 1):
            f = sphere_raw(1.0, s * 0.7, 0.5, z, seg=18, rings=10, sx=0.22, sy=0.34, sz=zr)
            cut_many(f, [box_raw(1, 0.6, 2, s * 0.7, 0.05, z)])
            g.add(f, "paint", n, bev=0)
            wheel(g, n, s * 0.72, 0.3, z, 0.3, 0.18)
    for s in (-1, 1):
        g.add(sphere_raw(0.1, s * 0.66, 0.7, 1.68, seg=12, rings=6, sz=0.6), "light", n, bev=0)
    cabin = prism_raw([(1.0, 0.85), (0.5, 1.38), (-0.15, 1.45), (-0.75, 1.4), (-1.05, 1.15), (-1.2, 0.85)], -0.68, 0.68)
    g.add(cabin, "paint", n, bev=0.14, seg=3, angle=30)
    for s in (-1, 1):
        g.add(prism_raw([(0.82, 0.95), (0.45, 1.3), (-0.65, 1.33), (-0.98, 1.05), (-0.98, 0.95)], s * 0.67, s * 0.695), "glass", n, bev=0.005, seg=1)
        g.add(seg_raw((s * 0.69, 0.95, -0.12), (s * 0.69, 1.33, -0.12), 0.02, 0.04), "chrome", n, bev=0)
        g.box("dark", 0.14, 0.04, 2.0, s * 0.82, 0.24, 0.05, group=n, bev=0.01, seg=1)
        g.add(cyl_raw(0.03, 0.08, s * 0.72, 0.62, -1.9, seg=8, axis="y"), "paint", n, bev=0)
        g.box("light", 0.08, 0.12, 0.03, s * 0.6, 0.66, -2.0, group=n, bev=0.01, seg=1)
    g.add(prism_raw([(0.97, 0.9), (0.53, 1.35), (0.5, 1.33), (0.94, 0.88)], -0.6, 0.6), "glass", n, bev=0)
    g.add(prism_raw([(-0.77, 1.38), (-1.04, 1.15), (-1.02, 1.13), (-0.75, 1.36)], -0.45, 0.45), "glass", n, bev=0)
    for z in (2.08, -2.08):
        g.box("chrome", 1.6, 0.07, 0.06, 0, 0.36, z, group=n, bev=0.02, seg=2)
    # Engine-lid louvres at the back, the hood's handle and badge.
    for i in range(4):
        g.box("dark", 0.36, 0.015, 0.02, 0, 0.66 + i * 0.03, -1.93 + i * 0.03, group=n, bev=0)
    g.add(cyl_raw(0.04, 0.02, 0, 0.83, 1.4, seg=10, axis="y"), "chrome", n, bev=0)


def kombi(g):
    n = "kombi"
    W2 = 0.86
    lower = prism_raw([(2.25, 0.32), (2.3, 0.7), (2.28, 1.1), (-2.28, 1.1), (-2.3, 0.4), (-2.0, 0.28), (2.0, 0.28)], -W2, W2)
    g.add(lower, "paint", n, bev=0.12, seg=3, angle=30)
    upper = prism_raw([(2.28, 1.08), (2.22, 1.6), (2.0, 1.92), (-2.05, 1.93), (-2.26, 1.7), (-2.28, 1.08)], -W2 + 0.01, W2 - 0.01)
    g.add(upper, "white", n, bev=0.14, seg=3, angle=30)
    # The V on its nose, the badge, the split windscreen.
    for s in (-1, 1):
        g.add(seg_raw((0, 0.62, 2.31), (s * 0.7, 1.12, 2.29), 0.12, 0.02), "white", n, bev=0)
        g.add(prism_raw([(2.26, 1.22), (2.18, 1.62), (2.17, 1.62), (2.25, 1.22)], s * 0.05, s * 0.74), "glass", n, bev=0)
    g.add(cyl_raw(0.13, 0.03, 0, 0.92, 2.31, seg=20), "chrome", n, bev=0.005, seg=1)
    # Side windows (a row), the cargo doors' seams, wheels in their arches, bumpers, lamps.
    for s in (-1, 1):
        for i in range(4):
            z = 1.35 - i * 0.82
            g.box("glass", 0.02, 0.38, 0.66, s * (W2 + 0.002), 1.45, z, group=n, bev=0.03, seg=2)
        for z in (0.35, -0.55):
            g.box("dark", 0.01, 0.75, 0.012, s * (W2 + 0.003), 0.7, z, group=n, bev=0)
        for z in (1.45, -1.45):
            wheel(g, n, s * 0.74, 0.33, z, 0.33, 0.2)
        g.add(cyl_raw(0.11, 0.04, s * 0.62, 0.95, 2.3, seg=14), "light", n, bev=0.01, seg=1)
        g.add(cyl_raw(0.12, 0.03, s * 0.62, 0.95, 2.28, seg=14), "chrome", n, bev=0)
        g.box("light", 0.08, 0.16, 0.03, s * 0.7, 0.75, -2.3, group=n, bev=0.01, seg=1)
    for z in (2.38, -2.38):
        g.box("chrome", 1.7, 0.1, 0.08, 0, 0.42, z, group=n, bev=0.02, seg=2)
    # Rear engine louvres.
    for s in (-1, 1):
        for i in range(6):
            g.box("dark", 0.012, 0.012, 0.2, s * (W2 + 0.004), 1.17 + i * 0.03, -1.9, group=n, bev=0)


def fstall(g):
    n = "fstall"
    X, Z, H = 2.8, 2.5, 2.3
    # The counter: planks on a frame (its collider 1.0 tall), fruit crates in its top.
    g.box("wood", X, 0.84, Z, 0, 0.42, 0, group=n, bev=0.02, seg=1)
    for i in range(7):
        y = 0.08 + i * 0.11
        for s in (-1, 1):
            g.box("wood", X + 0.01, 0.01, 0.02, 0, y, s * (Z / 2 + 0.002), group=n, bev=0)
            g.box("wood", 0.02, 0.01, Z + 0.01, s * (X / 2 + 0.002), y, 0, group=n, bev=0)
    rnd = random.Random(9)
    for i in range(4):
        for k in range(3):
            cx, cz = -X / 2 + 0.35 + i * 0.7, -Z / 2 + 0.42 + k * 0.83
            g.box("plastic", 0.6, 0.1, 0.7, cx, 0.89, cz, group=n, bev=0.01, seg=1)
            for f in range(4):
                fx, fz = cx - 0.13 + (f % 2) * 0.26, cz - 0.16 + (f // 2) * 0.32
                g.add(sphere_raw(0.1, fx, 0.945 + rnd.random() * 0.005, fz, seg=7, rings=4, sy=0.6), "fruit", n, bev=0)
    # Two posts (diagonal corners: where the map's are), the awning sloping a little, striped.
    for x, z in ((-X / 2 + 0.1, -Z / 2 + 0.1), (X / 2 - 0.1, Z / 2 - 0.1)):
        g.box("metal", 0.06, H - 1.0, 0.06, x, 1.0 + (H - 1.0) / 2, z, group=n, bev=0.005, seg=1)
    for i in range(8):
        z = -Z / 2 + (i + 0.5) * Z / 8
        aw = box_raw(X + 0.1, 0.03, Z / 8, 0, H - 0.04, z, rx=0.0)
        xform(aw, Matrix.Translation((0, H - 0.04, 0)) @ Matrix.Rotation(0.06, 4, "Z") @ Matrix.Translation((0, -(H - 0.04), 0)))
        g.add(aw, "canvas" if i % 2 else "white", n, bev=0)
    for s in (-1, 1):
        for i in range(10):
            x = -X / 2 + (i + 0.5) * X / 10
            g.add(prism_raw([(s * (Z / 2 + 0.03), H - 0.06), (s * (Z / 2 + 0.03), H - 0.2), (s * (Z / 2 + 0.03) - s * 0.0, H - 0.06)], x - X / 22, x + X / 22), "canvas" if i % 2 else "white", n, bev=0)


# ------------------------------------------------------------------ wreckage
def heli_tail(g):
    n = "heli_tail"
    # The boom from its torn root (Z = 0) aft to the fin; ragged skin at the tear, ribs showing.
    g.add(tube_between((0, 0, 0), (0, 0.35, -6.2), 0.5, 0.2, seg=16), "paint", n, bev=0)
    rnd = random.Random(6)
    for k in range(9):
        a = k / 9 * math.pi * 2
        r = 0.5
        tip = (math.cos(a) * (r + 0.05), math.sin(a) * (r + 0.05), 0.15 + rnd.random() * 0.35)
        g.add(seg_raw((math.cos(a) * r * 0.97, math.sin(a) * r * 0.97, -0.05), tip, 0.18, 0.012, up=(math.cos(a), math.sin(a), 0)), "paint", n, bev=0)
    for z in (-0.02, -0.5):
        g.add(L.torus_raw(0.47 + 0.01 * z, 0.025, 0, 0.03 * -z, z, seg=16, ring=4), "rust", n, bev=0)
    g.add(cyl_raw(0.05, 1.2, 0.1, 0.1, 0.3, seg=6), "dark", n, bev=0)
    g.add(cyl_raw(0.03, 0.9, -0.15, -0.12, 0.25, seg=6, rx=0.3), "dark", n, bev=0)
    # Stabilisers, the fin, the tail rotor's gearbox and two blades.
    g.add(prism_raw([(-4.6, 0.22), (-4.7, 0.26), (-5.3, 0.26), (-5.25, 0.22)], -1.0, 1.0), "paint", n, bev=0.01, seg=1)
    g.add(prism_raw([(-5.6, 0.35), (-6.0, 1.8), (-6.55, 1.85), (-6.45, 0.3)], -0.04, 0.04), "paint", n, bev=0.01, seg=1)
    g.add(cyl_raw(0.12, 0.3, 0.18, 1.55, -6.25, seg=12, axis="x"), "dark", n, bev=0.01, seg=1)
    for a in (0.3, 0.3 + math.pi):
        bl = box_raw(0.03, 1.4, 0.16, 0.36, 1.55, -6.25)
        xform(bl, Matrix.Translation((0.36, 1.55, -6.25)) @ Matrix.Rotation(a, 4, "X") @ Matrix.Translation((-0.36, -1.55, 6.25)) @ Matrix.Translation((0, 0.7, 0)))
        g.add(bl, "dark", n, bev=0)
    # 77.0: seen from the clearing: red and white bands round the boom by the fin, the fin striped both
    # sides, the anti-collision beacon's housing on its top (the map lights it).
    def boom(z):
        u = -z / 6.2
        return (0, 0.35 * u, z), 0.5 + (0.2 - 0.5) * u + 0.012

    for i in range(5):
        z0, z1 = -3.6 - i * 0.4, -4.0 - i * 0.4
        (p0, r0), (p1, r1) = boom(z0), boom(z1)
        g.add(tube_between(p0, p1, r0, r1, seg=16), "red" if i % 2 == 0 else "white", n, bev=0)
    for s in (-1, 1):
        for i, (y0, y1) in enumerate(((0.45, 0.75), (0.75, 1.05), (1.05, 1.35), (1.35, 1.65))):
            # The fin's outline between those heights (its leading edge leans aft), a skin thick.
            def edge(y, a, b):
                t = (y - a[1]) / (b[1] - a[1])
                return a[0] + (b[0] - a[0]) * t
            zf0, zf1 = edge(y0, (-5.6, 0.35), (-6.0, 1.8)), edge(y1, (-5.6, 0.35), (-6.0, 1.8))
            zb0, zb1 = edge(y0, (-6.45, 0.3), (-6.55, 1.85)), edge(y1, (-6.45, 0.3), (-6.55, 1.85))
            g.add(prism_raw([(zf0 - 0.02, y0), (zf1 - 0.02, y1), (zb1 + 0.02, y1), (zb0 + 0.02, y0)], s * 0.04, s * 0.05), "red" if i % 2 == 0 else "white", n, bev=0)
    g.add(cyl_raw(0.07, 0.1, 0, 1.9, -6.28, seg=10, axis="y"), "dark", n, bev=0)


def heli_blade(g):
    n = "heli_blade"
    # Two lengths, bent where it hit; an aerofoil section (flat), its tip cap.
    def piece(p0, p1, w):
        return seg_raw(p0, p1, w, 0.035)

    g.add(piece((0, 0.03, 0), (0, 0.03, 2.6), 0.36), "dark", n, bev=0.008, seg=1)
    g.add(piece((0, 0.03, 2.6), (0.9, 0.12, 4.9), 0.36), "dark", n, bev=0.008, seg=1)
    g.add(piece((0.86, 0.12, 4.75), (0.94, 0.12, 4.95), 0.37), "white", n, bev=0)
    g.add(cyl_raw(0.09, 0.3, 0, 0.06, -0.1, seg=10), "metal", n, bev=0.01, seg=1)


def panel(g):
    n = "panel"
    # A curved, torn sheet, its frame rib showing: low (it lies on the ground), its edges ragged.
    rnd = random.Random(8)

    def build(bm):
        nx, nz = 6, 5
        rows = []
        for i in range(nx + 1):
            row = []
            for k in range(nz + 1):
                x = -0.8 + 1.6 * i / nx
                z = -0.5 + 1.0 * k / nz
                if i in (0, nx) or k in (0, nz):
                    x += (rnd.random() - 0.5) * 0.12
                    z += (rnd.random() - 0.5) * 0.12
                y = 0.02 + 0.14 * (1 - (x / 0.85) ** 2) * (0.6 + 0.4 * k / nz)
                row.append(bm.verts.new((x, y, z)))
            rows.append(row)
        for i in range(nx):
            for k in range(nz):
                bm.faces.new((rows[i][k], rows[i + 1][k], rows[i + 1][k + 1], rows[i][k + 1]))

    sheet = bm_obj("panel", build)
    sol = sheet.modifiers.new("t", "SOLIDIFY")
    sol.thickness = 0.012
    L.apply_mods(sheet)
    g.add(sheet, "paint", n, bev=0)
    g.add(seg_raw((-0.7, 0.03, 0.05), (0.7, 0.03, 0.05), 0.04, 0.03), "rust", n, bev=0)


BUILDERS = {k: globals()[k] for k in NODES}


def main():
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    opts = {"out": "public/models/props", "preview": None, "only": None}
    for i in range(0, len(argv), 2):
        opts[argv[i].lstrip("-")] = argv[i + 1]
    names = opts["only"].split(",") if opts["only"] else list(NODES)
    L.reset(ROLES)
    g = L.Gun("props_ruin", groups=tuple(names))
    for name in names:
        BUILDERS[name](g)
    objs = g.finish(uv=1.0)
    for name, o in objs.items():
        print(f"  {name}: {sum(len(p.vertices) - 2 for p in o.data.polygons)} tris")
    if not opts["only"]:
        os.makedirs(opts["out"], exist_ok=True)
        path = os.path.join(opts["out"], "ruin.glb")
        L.export_glb(objs, path)
        print(f"RUIN: {L.tri_count(objs)} tris -> {path} ({os.path.getsize(path)} bytes)")
    if opts["preview"]:
        os.makedirs(opts["preview"], exist_ok=True)
        for name in names:
            for o in objs.values():
                o.hide_render = o.name != name
            L.preview({name: objs[name]}, os.path.join(opts["preview"], f"ruin-{name}"), "ruin", views=("three",), res=(600, 450))
        print("PREVIEW done")


main()
