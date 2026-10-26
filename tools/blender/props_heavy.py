"""
70.0, the heavy props (docs/ENVIRONMENT_PLAN.md, step 3). Each node at its real size, its base at
Y = 0, centred on X/Z, its long side down Z with its front at +Z (three.js axes):

  container    a 20 ft box (6.06 x 2.6 x 2.44): corrugated sides and front end, rails, corner posts and
               castings, the door end's two doors with their lock rods, cams, handles and hinges
  container40  the same at 40 ft (12.19 long)
  truck        a cab-over army truck (2.4 x 2.75 x 7.2): cab, grille, lamps, bumper, mirrors, the bed and
               its canvas over hoops, fuel tank, three axles
  truck_open   the same burnt out: no canvas, the bed's sides down, the glass gone (the convoy)
  apc          an 8x8 armoured carrier (2.6 x 2.9 x 6.0): sloped glacis, skirts, hatches, a turret
  bus          the convoy's burnt bus (2.6 x 3.05 x 10): its doors and windows exactly where the Desert's
               colliders leave them open (Arena.ts), the rest of the windows sooted panels, seat frames
  generator    a diesel genset on its skid (1.2 x 1.2 x 1.8): engine housing, louvres, radiator, exhaust,
               the control panel, lifting eyes
  car          a burnt-out saloon (1.8 x 1.6 x 4.2): body, roof on its pillars, sitting on its rims
  jeep         an open army jeep (1.8 x 1.65 x 4.3): roll bar, the gun on its pintle, the spare
  bowser       a fuel trailer (1.8 x 2.35 x 6.0): the tank on its frame, manhole, ladder, hose reel
  semi         a tractor unit and its trailer's chassis (2.8 x 3.2 x 15): the container rides on it
  forklift     a forklift (2.0 x 2.2 x 3.0): counterweight, overhead guard, the mast, the forks

Roles: paint (the map's colour), metal, rubber, glass, canvas, rust, light, dark, chrome.

  Blender -b --factory-startup -P tools/blender/props_heavy.py -- [--out public/models/props] [--preview DIR] [--only a,b]
"""

import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import bpy  # noqa: E402
import gunlib as L  # noqa: E402
from gunlib import box_raw, cut, cut_many, cyl_raw, front_raw, prism_raw, seg_raw, top_raw  # noqa: E402
from mathutils import Matrix  # noqa: E402

ROLES = ("paint", "metal", "rubber", "glass", "canvas", "rust", "light", "dark", "chrome")
NODES = ("container", "container40", "truck", "truck_open", "apc", "bus", "generator", "car", "jeep", "bowser", "semi", "forklift")
L.PREVIEW["heavy"] = {
    "paint": ((0.25, 0.3, 0.18), 0.3, 0.6),
    "metal": ((0.08, 0.08, 0.08), 0.7, 0.5),
    "rubber": ((0.02, 0.02, 0.02), 0.0, 0.85),
    "glass": ((0.02, 0.025, 0.03), 0.2, 0.1),
    "canvas": ((0.3, 0.3, 0.2), 0.0, 0.95),
    "rust": ((0.25, 0.12, 0.06), 0.3, 0.85),
    "light": ((0.9, 0.85, 0.7), 0.0, 0.2),
    "dark": ((0.03, 0.03, 0.03), 0.1, 0.8),
    "chrome": ((0.6, 0.6, 0.6), 1.0, 0.2),
}


def wheel(g, n, x, y, z, r, w, role="rubber", rim="metal"):
    """A wheel on an axle across X: the tyre (rounded shoulders, tread grooves), the rim and the hub."""
    tyre = cyl_raw(r, w, x, y, z, seg=18, axis="x")
    cut(tyre, cyl_raw(r * 0.6, w + 0.02, x, y, z, seg=12, axis="x"))
    g.add(tyre, role, n, bev=min(0.05, r * 0.12), seg=2)
    g.add(cyl_raw(r * 0.62, w * 0.8, x, y, z, seg=12, axis="x"), rim, n, bev=0.01, seg=1)
    sx = 1 if x > 0 else -1
    g.add(cyl_raw(r * 0.22, 0.06, x + sx * w * 0.42, y, z, seg=8, axis="x"), "chrome" if rim == "metal" else rim, n, bev=0)


def corrugate(length, depth, pitch, t=0.004):
    """A corrugated strip's plan outline (x, z): along z from -length/2, trapezoid ribs out to +x."""
    pts = []
    z = -length / 2
    k = 0
    while z < length / 2 - 1e-6:
        a, b = z, min(length / 2, z + pitch)
        q = (b - a) / 4
        pts += [(0.0, a), (0.0, a + q * 0.6), (depth, a + q * 1.4), (depth, a + q * 2.6), (0.0, a + q * 3.4)]
        z = b
        k += 1
    pts.append((0.0, length / 2))
    back = [(x - t - depth * 0.0 - 0.0, zz) for x, zz in reversed(pts)]
    return pts + [(-t, length / 2)] + [(-t, zz) for _, zz in reversed(pts[:-1])]


# ------------------------------------------------------------------ containers
def container(g, n, Lc):
    W, H = 2.44, 2.6
    rail = 0.16
    # Corrugated long sides (panels between the rails), the corrugated front end.
    for s in (-1, 1):
        side = top_raw(corrugate(Lc - 0.3, 0.035, 0.278), rail, H - rail)
        side.data.transform(Matrix.Translation((s * (W / 2 - 0.045), 0, 0)) @ Matrix.Diagonal((s, 1, 1, 1)))
        g.add(side, "paint", n, bev=0)
    end = top_raw(corrugate(W - 0.3, 0.03, 0.3), rail, H - rail)
    end.data.transform(Matrix.Translation((0, 0, -(Lc / 2 - 0.04))) @ Matrix.Rotation(math.pi / 2, 4, "Y"))
    g.add(end, "paint", n, bev=0)
    # Roof (shallow ribs) and floor.
    g.box("paint", W - 0.1, 0.04, Lc - 0.1, 0, H - 0.04, 0, group=n, bev=0.006, seg=1)
    for i in range(int((Lc - 0.4) / 0.6)):
        g.box("paint", W - 0.2, 0.02, 0.12, 0, H - 0.015, -Lc / 2 + 0.4 + i * 0.6, group=n, bev=0.006, seg=1)
    g.box("dark", W - 0.12, 0.1, Lc - 0.12, 0, 0.1, 0, group=n, bev=0)
    # Rails, corner posts, castings.
    for s in (-1, 1):
        g.box("paint", 0.1, rail, Lc, s * (W / 2 - 0.05), rail / 2, 0, group=n, bev=0.01, seg=1)
        g.box("paint", 0.1, 0.1, Lc, s * (W / 2 - 0.05), H - 0.05, 0, group=n, bev=0.01, seg=1)
        for e in (-1, 1):
            g.box("paint", 0.16, H, 0.16, s * (W / 2 - 0.08), H / 2, e * (Lc / 2 - 0.08), group=n, bev=0.012, seg=1)
            for y in (0.09, H - 0.09):
                c = box_raw(0.18, 0.18, 0.18, s * (W / 2 - 0.09), y, e * (Lc / 2 - 0.09))
                cut(c, box_raw(0.1, 0.06, 0.2, s * (W / 2 - 0.09), y, e * (Lc / 2 - 0.09)))
                g.add(c, "metal", n, bev=0.01, seg=1)
    for e in (-1, 1):
        g.box("paint", W - 0.2, 0.18, 0.1, 0, 0.09, e * (Lc / 2 - 0.05), group=n, bev=0.01, seg=1)
        g.box("paint", W - 0.2, 0.18, 0.1, 0, H - 0.09, e * (Lc / 2 - 0.05), group=n, bev=0.01, seg=1)
    # Forklift pockets (20 ft only).
    if Lc < 7:
        for s in (-1, 1):
            for z in (-1.0, 1.0):
                g.box("dark", 0.04, 0.1, 0.36, s * (W / 2 - 0.02), 0.08, z, group=n, bev=0)
    # The door end (+Z): two doors, ribbed, four lock rods with cams and handles, hinges.
    z = Lc / 2 - 0.035
    for s in (-1, 1):
        door = box_raw(W / 2 - 0.18, H - 0.4, 0.05, s * (W / 4 - 0.02), H / 2, z)
        cut_many(door, [box_raw(W / 2 - 0.3, 0.05, 0.02, s * (W / 4 - 0.02), y, z + 0.03) for y in (0.55, 1.05, 1.55, 2.05)])
        g.add(door, "paint", n, bev=0.008, seg=1)
        for k in (0.28, 0.72):
            x = s * (W / 2 - 0.12) * k + s * 0.06
            g.add(cyl_raw(0.016, H - 0.36, x, H / 2, z + 0.06, seg=8, axis="y"), "metal", n, bev=0)
            for y in (0.3, H - 0.3):
                g.box("metal", 0.06, 0.08, 0.05, x, y, z + 0.06, group=n, bev=0.006, seg=1)
            g.box("metal", 0.035, 0.035, 0.3, x + s * 0.12, 1.2, z + 0.085, ry=0, group=n, bev=0.006, seg=1)
        for y in (0.5, 1.3, 2.1):
            g.box("metal", 0.06, 0.14, 0.07, s * (W / 2 - 0.11), y, z + 0.04, group=n, bev=0.006, seg=1)


# ------------------------------------------------------------------ trucks
def truck(g, n, canvas=True):
    W, Lt = 2.4, 7.2
    zc = Lt / 2
    # Chassis rails and the bumper.
    for s in (-1, 1):
        g.box("dark", 0.14, 0.24, Lt - 0.3, s * 0.45, 0.78, -0.1, group=n, bev=0.01, seg=1)
    g.box("metal", W - 0.1, 0.22, 0.16, 0, 0.62, zc - 0.08, group=n, bev=0.02, seg=1)
    # Cab-over: the box with its rounded front, windscreen, side windows, doors, grille, lamps, mirrors.
    cab = prism_raw([(zc - 0.15, 0.85), (zc - 0.05, 1.6), (zc - 0.22, 2.25), (zc - 0.4, 2.42), (zc - 2.0, 2.42), (zc - 2.0, 0.85)], -W / 2 + 0.05, W / 2 - 0.05)
    cuts = [box_raw(W - 0.4, 0.62, 0.3, 0, 1.92, zc - 0.13, rx=0.2)]
    for s in (-1, 1):
        cuts.append(box_raw(0.2, 0.55, 0.75, s * (W / 2 - 0.02), 1.88, zc - 0.85))
        cuts.append(box_raw(0.012, 1.3, 0.012, s * (W / 2 - 0.05), 1.35, zc - 1.3))
    cut_many(cab, cuts)
    g.add(cab, "paint", n, bev=0.03, seg=2)
    if canvas:
        g.box("glass", W - 0.45, 0.6, 0.02, 0, 1.92, zc - 0.2, rx=0.2, group=n, bev=0)
        for s in (-1, 1):
            g.box("glass", 0.02, 0.53, 0.73, s * (W / 2 - 0.07), 1.88, zc - 0.85, group=n, bev=0)
    else:
        g.box("rust", W - 0.45, 0.02, 0.3, 0, 1.6, zc - 0.25, group=n, bev=0)
    for x in (-0.55, -0.25, 0.05, 0.35):
        g.box("dark", 0.2, 0.36, 0.03, x + 0.1, 1.15, zc - 0.13, group=n, bev=0.005, seg=1)
    for s in (-1, 1):
        g.add(cyl_raw(0.1, 0.06, s * 0.85, 1.12, zc - 0.13, seg=14, axis="z"), "light" if canvas else "dark", n, bev=0.01, seg=1)
        g.add(cyl_raw(0.12, 0.05, s * 0.85, 1.12, zc - 0.17, seg=14, axis="z"), "metal", n, bev=0.01, seg=1)
        g.add(seg_raw((s * (W / 2), 2.0, zc - 0.5), (s * (W / 2 + 0.25), 2.1, zc - 0.45), 0.03, 0.03), "metal", n, bev=0)
        g.box("dark", 0.04, 0.3, 0.16, s * (W / 2 + 0.26), 2.0, zc - 0.45, group=n, bev=0.01, seg=1)
        # Step, fuel tank, mudguards.
        g.box("metal", 0.25, 0.04, 0.5, s * (W / 2 - 0.1), 0.55, zc - 1.3, group=n, bev=0.01, seg=1)
    g.add(cyl_raw(0.26, 1.0, -(W / 2 - 0.3), 0.75, zc - 2.6, seg=16), "paint", n, bev=0.02, seg=1)
    # The bed.
    bz0, bz1 = -Lt / 2 + 0.05, zc - 2.1
    bl = bz1 - bz0
    g.box("paint", W, 0.12, bl, 0, 1.24, (bz0 + bz1) / 2, group=n, bev=0.02, seg=1)
    sides = 0.45 if canvas else 0.0
    if canvas:
        for s in (-1, 1):
            g.box("paint", 0.05, sides, bl, s * (W / 2 - 0.025), 1.3 + sides / 2, (bz0 + bz1) / 2, group=n, bev=0.01, seg=1)
        g.box("paint", W, sides, 0.05, 0, 1.3 + sides / 2, bz0 + 0.025, group=n, bev=0.01, seg=1)
        # The canvas over its hoops: a rounded tunnel, roped down.
        tun = front_raw([(-W / 2 + 0.02, 1.7), (W / 2 - 0.02, 1.7), (W / 2 - 0.02, 2.45), (W / 2 - 0.25, 2.72), (-W / 2 + 0.25, 2.72), (-W / 2 + 0.02, 2.45)], bz0, bz1 - 0.05)
        g.add(tun, "canvas", n, bev=0.06, seg=3)
        for i in range(5):
            z = bz0 + 0.3 + i * (bl - 0.6) / 4
            g.add(front_raw([(-W / 2 + 0.005, 1.72), (W / 2 - 0.005, 1.72), (W / 2 - 0.005, 2.46), (W / 2 - 0.24, 2.74), (-W / 2 + 0.24, 2.74), (-W / 2 + 0.005, 2.46)], z - 0.04, z + 0.04), "canvas", n, bev=0.03, seg=2)
    else:
        for s in (-1, 1):
            # The burnt sides hang open.
            side = box_raw(0.04, 0.45, bl - 0.2, 0, -0.225, 0)
            side.data.transform(Matrix.Translation((s * (W / 2 + 0.02), 1.3, (bz0 + bz1) / 2)) @ Matrix.Rotation(s * 0.28, 4, "Z"))
            g.add(side, "rust", n, bev=0.008, seg=1)
    # Three axles.
    for z in (zc - 1.15, -1.0, -2.45):
        for s in (-1, 1):
            wheel(g, n, s * (W / 2 - 0.17), 0.55, z, 0.55, 0.32, rim="metal" if canvas else "rust")
        g.add(cyl_raw(0.06, W - 0.6, 0, 0.55, z, seg=8, axis="x"), "dark", n, bev=0)
    # The spare behind the cab.
    wheel(g, n, 0, 1.55, zc - 2.25, 0.5, 0.3)
    g.parts[-3][0].data.transform(Matrix.Identity(4))


# ------------------------------------------------------------------ the APC
def apc(g):
    n = "apc"
    W, La = 2.6, 6.0
    hull = prism_raw([(La / 2, 0.75), (La / 2 - 0.2, 1.05), (La / 2 - 1.3, 1.75), (-La / 2 + 0.3, 1.9), (-La / 2, 1.6), (-La / 2, 0.75), (-La / 2 + 0.6, 0.45), (La / 2 - 0.8, 0.45)], -W / 2 + 0.2, W / 2 - 0.2)
    g.add(hull, "paint", n, bev=0.03, seg=2)
    for s in (-1, 1):
        # Sloped side plates over the wheels, the skirts.
        g.add(prism_raw([(La / 2 - 0.5, 1.05), (La / 2 - 1.3, 1.78), (-La / 2 + 0.4, 1.9), (-La / 2 + 0.1, 1.05)], s * (W / 2 - 0.2), s * (W / 2 - 0.02)), "paint", n, bev=0.02, seg=1)
        for z in (2.0, 0.7, -0.6, -1.9):
            wheel(g, n, s * (W / 2 - 0.2), 0.58, z, 0.58, 0.38)
        for i in range(3):
            g.box("dark", 0.03, 0.14, 0.4, s * (W / 2 - 0.01), 1.55, -1.2 + i * 0.9, group=n, bev=0.005, seg=1)
    # Hatches, periscopes, the turret with its gun and smoke launchers.
    g.add(cyl_raw(0.3, 0.06, -0.55, 1.93, -1.6, seg=16, axis="y"), "paint", n, bev=0.01, seg=1)
    g.add(cyl_raw(0.28, 0.06, 0.55, 1.93, -1.6, seg=16, axis="y"), "paint", n, bev=0.01, seg=1)
    for x in (-0.4, 0.0, 0.4):
        g.box("glass", 0.14, 0.06, 0.06, x, 1.82, La / 2 - 1.25, rx=-0.6, group=n, bev=0.005, seg=1)
    tur = prism_raw([(0.75, 1.9), (0.6, 2.35), (-0.55, 2.4), (-0.8, 2.15), (-0.8, 1.9)], -0.7, 0.7)
    tur.data.transform(Matrix.Translation((0, 0, -0.3)))
    g.add(tur, "paint", n, bev=0.03, seg=2)
    g.add(cyl_raw(0.045, 1.9, 0, 2.18, 1.2, seg=10), "dark", n, bev=0)
    g.add(cyl_raw(0.09, 0.4, 0, 2.18, 0.45, seg=12), "dark", n, bev=0.01, seg=1)
    for s in (-1, 1):
        for i in range(3):
            g.add(cyl_raw(0.04, 0.22, s * (0.72 + i * 0.0), 2.05 + i * 0.09, 0.15, seg=8, rx=-0.5), "dark", n, bev=0)
    g.box("light", 0.18, 0.1, 0.05, 0.9, 1.15, La / 2 - 0.15, group=n, bev=0.01, seg=1)
    g.box("light", 0.18, 0.1, 0.05, -0.9, 1.15, La / 2 - 0.15, group=n, bev=0.01, seg=1)


# ------------------------------------------------------------------ the bus
def bus(g):
    n = "bus"
    W, Lb, H = 2.6, 10.0, 2.9
    t = 0.07
    win = (1.2, 2.15)
    # The colliders' openings (Arena.ts, local to the bus: x across from -1.3, z along from -5).
    open_w = [(-2.5, 1.3, 0.0, 2.3), (-0.5, 1.3, *win), (1.8, 1.3, *win), (4.0, 1.3, *win)]
    open_e = [(-2.8, 1.3, *win), (-0.5, 1.3, *win), (1.8, 1.3, *win), (4.0, 1.3, *win)]
    for s, opens in ((-1, open_w), (1, open_e)):
        side = box_raw(t, H - 0.25, Lb - 0.3, s * (W / 2 - t / 2), 0.25 + (H - 0.25) / 2, 0)
        cuts = [box_raw(0.3, y1 - max(y0, 0.2), w, s * (W / 2), (max(y0, 0.2) + y1) / 2, z) for z, w, y0, y1 in opens]
        cut_many(side, cuts)
        g.add(side, "rust", n, bev=0.01, seg=1)
        # The other window bays: sooted panes where the collider is whole, pillars between them.
        for z in (-4.2, -1.7, 2.9):
            g.box("glass", 0.02, win[1] - win[0], 1.0, s * (W / 2 - 0.02), sum(win) / 2, z, group=n, bev=0)
        for z in (-4.75, -3.6, -1.15, 0.65, 2.45, 3.35, 4.7):
            g.box("rust", t + 0.02, win[1] - win[0] + 0.1, 0.08, s * (W / 2 - t / 2), sum(win) / 2, z, group=n, bev=0.008, seg=1)
        # The rubbing strip down each side (broken at the west side's door).
        spans = [(-Lb / 2 + 0.2, -3.15), (-1.85, Lb / 2 - 0.2)] if s < 0 else [(-Lb / 2 + 0.2, Lb / 2 - 0.2)]
        for z0, z1 in spans:
            g.box("dark", 0.02, 0.14, z1 - z0, s * (W / 2 + 0.005), 0.95, (z0 + z1) / 2, group=n, bev=0)
    # The tail with its door (the collider's at x 0, 1.2 wide), the front with the sooted windscreen.
    tail = box_raw(W, H - 0.25, t, 0, 0.25 + (H - 0.25) / 2, -Lb / 2 + t / 2)
    cut(tail, box_raw(1.2, 2.2, 0.3, 0, 1.3, -Lb / 2))
    g.add(tail, "rust", n, bev=0.01, seg=1)
    g.box("rust", W, H - 0.25, t, 0, 0.25 + (H - 0.25) / 2, Lb / 2 - t / 2, group=n, bev=0.01, seg=1)
    g.box("glass", W - 0.3, 0.95, 0.02, 0, 1.75, Lb / 2 + 0.005, group=n, bev=0)
    g.box("metal", W, 0.25, 0.14, 0, 0.45, Lb / 2 + 0.05, group=n, bev=0.03, seg=1)
    g.box("metal", W, 0.25, 0.12, 0, 0.45, -Lb / 2 - 0.04, group=n, bev=0.03, seg=1)
    for s in (-1, 1):
        g.add(cyl_raw(0.09, 0.05, s * 0.95, 0.85, Lb / 2 + 0.03, seg=12, axis="z"), "dark", n, bev=0.01, seg=1)
    # The roof, rounded at its edges, a hatch; the floor; the burnt seat frames along the sides.
    roof = front_raw([(-W / 2, H - 0.05), (W / 2, H - 0.05), (W / 2, H + 0.05), (W / 2 - 0.2, H + 0.15), (-W / 2 + 0.2, H + 0.15), (-W / 2, H + 0.05)], -Lb / 2, Lb / 2)
    g.add(roof, "rust", n, bev=0.03, seg=2)
    g.box("rust", 0.8, 0.06, 0.8, 0, H + 0.17, 1.0, group=n, bev=0.01, seg=1)
    g.box("dark", W - 0.14, 0.05, Lb - 0.14, 0, 0.27, 0, group=n, bev=0)
    for s in (-1, 1):
        for z in (-3.6, -1.4, 0.3, 2.0, 3.6):
            if s < 0 and -3.2 < z < -1.8:
                continue
            x = s * 0.85
            for k in (-1, 1):
                g.add(seg_raw((x + k * 0.22, 0.3, z), (x + k * 0.22, 0.75, z - 0.08), 0.03, 0.03), "metal", n, bev=0)
            g.add(seg_raw((x - 0.25, 0.75, z), (x + 0.25, 0.75, z), 0.04, 0.03), "metal", n, bev=0)
            g.add(seg_raw((x - 0.25, 0.78, z - 0.25), (x - 0.25, 1.25, z - 0.32), 0.03, 0.03), "metal", n, bev=0)
            g.add(seg_raw((x + 0.25, 0.78, z - 0.25), (x + 0.25, 1.25, z - 0.32), 0.03, 0.03), "metal", n, bev=0)
    # Its wheels (outside the hull, on the burnt rims).
    for z in (-3.5, 3.5):
        for s in (-1, 1):
            g.add(cyl_raw(0.42, 0.3, s * (W / 2 + 0.15), 0.42, z, seg=16, axis="x"), "rust", n, bev=0.03, seg=1)


# ------------------------------------------------------------------ small machines
def generator(g):
    n = "generator"
    W, H, Lg = 1.2, 1.2, 1.8
    for s in (-1, 1):
        g.box("dark", 0.1, 0.12, Lg, s * (W / 2 - 0.05), 0.06, 0, group=n, bev=0.01, seg=1)
    g.box("paint", W - 0.04, 0.3, Lg - 0.04, 0, 0.27, 0, group=n, bev=0.015, seg=1)
    body = box_raw(W - 0.06, H - 0.42, Lg - 0.3, 0, 0.42 + (H - 0.42) / 2, -0.1)
    louv = []
    for s in (-1, 1):
        for i in range(6):
            louv.append(box_raw(0.04, 0.03, 0.5, s * (W / 2 - 0.03), 0.62 + i * 0.07, -0.35))
    cut_many(body, louv)
    g.add(body, "paint", n, bev=0.02, seg=2)
    # The radiator (front), the exhaust and its cap, the control panel (back), lifting eyes, a fuel cap.
    g.box("dark", W - 0.2, H - 0.55, 0.12, 0, 0.82, Lg / 2 - 0.12, group=n, bev=0.01, seg=1)
    for i in range(7):
        g.box("metal", W - 0.24, 0.02, 0.02, 0, 0.6 + i * 0.07, Lg / 2 - 0.05, group=n, bev=0)
    g.add(cyl_raw(0.06, 0.45, 0.3, H + 0.15, -0.4, seg=12, axis="y"), "metal", n, bev=0.005, seg=1)
    g.add(cyl_raw(0.075, 0.02, 0.3, H + 0.38, -0.4, seg=12, axis="y", rx=0.3), "metal", n, bev=0)
    g.box("dark", 0.6, 0.45, 0.05, -0.15, 0.82, -Lg / 2 + 0.12, group=n, bev=0.01, seg=1)
    for i, x in enumerate((-0.35, -0.2, -0.05)):
        g.add(cyl_raw(0.03, 0.03, x, 0.92, -Lg / 2 + 0.09, seg=10, axis="z"), "light" if i == 1 else "chrome", n, bev=0)
    for z in (-0.6, 0.4):
        g.add(L.torus_raw(0.06, 0.012, 0, 0, 0, seg=12, ring=6), "metal", n, bev=0)
        g.parts[-1][0].data.transform(Matrix.Translation((0, H + 0.06, z)) @ Matrix.Rotation(math.pi / 2, 4, "Y"))
    g.add(cyl_raw(0.05, 0.05, -0.35, H + 0.02, 0.5, seg=10, axis="y"), "dark", n, bev=0.008, seg=1)


def car(g):
    n = "car"
    W, Lc = 1.8, 4.2
    body = prism_raw([(Lc / 2, 0.35), (Lc / 2 - 0.05, 0.72), (Lc / 2 - 0.9, 0.85), (-Lc / 2 + 0.6, 0.9), (-Lc / 2 + 0.05, 0.85), (-Lc / 2, 0.4), (-Lc / 2 + 0.5, 0.18), (Lc / 2 - 0.5, 0.18)], -W / 2, W / 2)
    cuts = []
    for z in (1.3, -1.25):
        cuts.append(cyl_raw(0.38, W + 0.2, 0, 0.3, z, seg=16, axis="x"))
    cut_many(body, cuts)
    g.add(body, "rust", n, bev=0.04, seg=2)
    # The roof on its pillars (the glass gone), the burnt interior.
    roof = prism_raw([(0.85, 0.9), (0.35, 1.5), (-0.75, 1.52), (-1.25, 0.95)], -W / 2 + 0.12, W / 2 - 0.12)
    holes = [box_raw(W + 0.2, 0.42, 0.55, 0, 1.17, 0.25), box_raw(W + 0.2, 0.42, 0.55, 0, 1.17, -0.62), box_raw(W - 0.5, 0.46, 1.75, 0, 1.15, -0.2), box_raw(W - 0.55, 0.36, 0.5, 0, 1.15, 0.55, rx=-0.75)]
    cut_many(roof, holes)
    g.add(roof, "rust", n, bev=0.02, seg=1)
    g.box("dark", W - 0.3, 0.3, 1.8, 0, 0.75, -0.2, group=n, bev=0.02, seg=1)
    for z in (1.3, -1.25):
        for s in (-1, 1):
            g.add(cyl_raw(0.3, 0.18, s * (W / 2 - 0.12), 0.26, z, seg=14, axis="x"), "rust", n, bev=0.02, seg=1)
    for s in (-1, 1):
        g.add(cyl_raw(0.08, 0.04, s * 0.6, 0.6, Lc / 2 - 0.01, seg=12, axis="z"), "dark", n, bev=0.01, seg=1)


def jeep(g):
    n = "jeep"
    W, Lj = 1.8, 4.3
    body = prism_raw([(Lj / 2, 0.55), (Lj / 2 - 0.05, 1.0), (Lj / 2 - 1.3, 1.05), (Lj / 2 - 1.5, 0.95), (-Lj / 2, 0.95), (-Lj / 2, 0.55), (-Lj / 2 + 0.4, 0.4), (Lj / 2 - 0.4, 0.4)], -W / 2 + 0.05, W / 2 - 0.05)
    cut(body, box_raw(W - 0.3, 0.6, 2.4, 0, 1.15, -0.55))
    g.add(body, "paint", n, bev=0.03, seg=2)
    for s in (-1, 1):
        g.add(prism_raw([(Lj / 2 - 0.2, 0.55), (Lj / 2 - 0.35, 0.92), (Lj / 2 - 1.1, 0.92), (Lj / 2 - 1.3, 0.55)], s * (W / 2 - 0.02), s * (W / 2 + 0.12)), "paint", n, bev=0.015, seg=1)
        for z in (Lj / 2 - 0.75, -Lj / 2 + 0.8):
            wheel(g, n, s * (W / 2 - 0.13), 0.45, z, 0.45, 0.26)
    # Windscreen frame, roll bar, seats, the gun on its pintle, the spare, lamps, grille.
    g.add(front_raw([(-W / 2 + 0.1, 0.95), (W / 2 - 0.1, 0.95), (W / 2 - 0.1, 1.45), (-W / 2 + 0.1, 1.45)], Lj / 2 - 1.52, Lj / 2 - 1.47), "paint", n, bev=0.01, seg=1)
    cut(g.parts[-1][0], box_raw(W - 0.4, 0.4, 0.2, 0, 1.2, Lj / 2 - 1.5))
    for s in (-1, 1):
        g.add(seg_raw((s * 0.75, 0.95, -0.9), (s * 0.75, 1.62, -0.75), 0.05, 0.05), "metal", n, bev=0)
    g.add(seg_raw((-0.75, 1.62, -0.75), (0.75, 1.62, -0.75), 0.05, 0.05), "metal", n, bev=0)
    for s in (-1, 1):
        g.box("dark", 0.5, 0.12, 0.5, s * 0.4, 0.95, 0.15, group=n, bev=0.02, seg=1)
        g.box("dark", 0.5, 0.45, 0.1, s * 0.4, 1.2, -0.12, group=n, bev=0.02, seg=1)
    g.add(cyl_raw(0.04, 0.6, 0, 1.25, -0.9, seg=8, axis="y"), "metal", n, bev=0)
    g.box("dark", 0.16, 0.2, 0.8, 0, 1.62, -0.85, group=n, bev=0.01, seg=1)
    g.add(cyl_raw(0.025, 0.7, 0, 1.66, -0.15, seg=8), "dark", n, bev=0)
    wheel(g, n, 0, 0.85, -Lj / 2 - 0.12, 0.42, 0.24)
    g.parts[-3][0].data.transform(Matrix.Translation((0, 0.85, -Lj / 2 - 0.12)) @ Matrix.Rotation(math.pi / 2, 4, "Y") @ Matrix.Translation((0, -0.85, Lj / 2 + 0.12)))
    for s in (-1, 1):
        g.add(cyl_raw(0.08, 0.05, s * 0.6, 0.8, Lj / 2 + 0.005, seg=12, axis="z"), "light", n, bev=0.01, seg=1)
    for i in range(7):
        g.box("dark", 0.04, 0.3, 0.02, -0.36 + i * 0.12, 0.78, Lj / 2 + 0.002, group=n, bev=0)


def bowser(g):
    n = "bowser"
    W, Lb = 1.8, 6.0
    for s in (-1, 1):
        g.box("dark", 0.14, 0.2, Lb - 0.4, s * 0.55, 0.62, 0, group=n, bev=0.01, seg=1)
    g.add(seg_raw((-0.55, 0.62, Lb / 2 - 0.3), (0, 0.55, Lb / 2 + 0.6), 0.1, 0.1), "dark", n, bev=0.01, seg=1)
    g.add(seg_raw((0.55, 0.62, Lb / 2 - 0.3), (0, 0.55, Lb / 2 + 0.6), 0.1, 0.1), "dark", n, bev=0.01, seg=1)
    tank = cyl_raw(0.88, Lb - 0.5, 0, 1.45, 0, seg=28)
    g.add(tank, "paint", n, bev=0.0, seg=1)
    for e in (-1, 1):
        cap = L.sphere_raw(0.88, 0, 1.45, e * (Lb / 2 - 0.25), seg=28, rings=12, sz=0.25)
        g.add(cap, "paint", n, bev=0)
    for z in (-1.8, 0, 1.8):
        g.add(L.torus_raw(0.885, 0.025, 0, 0, 0, seg=28, ring=6), "paint", n, bev=0)
        g.parts[-1][0].data.transform(Matrix.Translation((0, 1.45, z)))
    g.add(cyl_raw(0.25, 0.12, 0, 2.35, 0.6, seg=16, axis="y"), "metal", n, bev=0.01, seg=1)
    g.add(cyl_raw(0.04, 0.12, 0.2, 2.32, -1.2, seg=8, axis="y"), "metal", n, bev=0)
    for s in (-1, 1):
        g.add(seg_raw((s * 0.25, 2.36, -2.4), (s * 0.25, 2.36, 2.0), 0.03, 0.03), "metal", n, bev=0)
        for z in (-0.5, 0.5):
            wheel(g, n, s * (W / 2 - 0.13), 0.42, z * 2.2 - 0.3 if z < 0 else z * 2.2 - 0.6, 0.42, 0.26)
        g.box("dark", 0.3, 0.04, 2.4, s * (W / 2 - 0.13), 0.92, -0.85, group=n, bev=0.01, seg=1)
    for i in range(6):
        g.box("metal", 0.4, 0.03, 0.06, 0.0, 0.7 + i * 0.25, -Lb / 2 + 0.05, group=n, bev=0)
    g.add(cyl_raw(0.22, 0.4, -0.75, 0.75, -2.4, seg=16, axis="x"), "dark", n, bev=0.01, seg=1)


def semi(g):
    n = "semi"
    W, Ls = 2.6, 15.0
    zc = Ls / 2
    # The tractor: chassis, cab (day cab), grille, lamps, tanks, exhausts, fifth wheel.
    for s in (-1, 1):
        g.box("dark", 0.16, 0.3, 4.8, s * 0.48, 0.85, zc - 2.4, group=n, bev=0.01, seg=1)
    cab = prism_raw([(zc - 0.05, 0.9), (zc, 1.8), (zc - 0.25, 2.95), (zc - 0.6, 3.2), (zc - 2.6, 3.2), (zc - 2.6, 0.9)], -1.25, 1.25)
    cuts = [box_raw(2.1, 0.8, 0.4, 0, 2.45, zc - 0.15, rx=0.25)]
    for s in (-1, 1):
        cuts.append(box_raw(0.2, 0.7, 0.9, s * 1.25, 2.35, zc - 1.0))
    cut_many(cab, cuts)
    g.add(cab, "paint", n, bev=0.04, seg=2)
    g.box("glass", 2.05, 0.78, 0.02, 0, 2.45, zc - 0.2, rx=0.25, group=n, bev=0)
    for s in (-1, 1):
        g.box("glass", 0.02, 0.68, 0.88, s * 1.22, 2.35, zc - 1.0, group=n, bev=0)
        g.add(cyl_raw(0.28, 1.1, s * 1.05, 0.75, zc - 2.0, seg=16), "chrome", n, bev=0.02, seg=1)
        g.add(cyl_raw(0.07, 1.8, s * 1.1, 3.2, zc - 2.7, seg=10, axis="y"), "chrome", n, bev=0)
        g.add(cyl_raw(0.12, 0.05, s * 0.95, 1.2, zc + 0.01, seg=12, axis="z"), "light", n, bev=0.01, seg=1)
    for i in range(8):
        g.box("chrome", 1.4, 0.04, 0.03, 0, 1.15 + i * 0.09, zc + 0.02, group=n, bev=0)
    g.box("metal", W - 0.1, 0.3, 0.2, 0, 0.6, zc + 0.05, group=n, bev=0.03, seg=1)
    for z in (zc - 0.75, zc - 3.6, zc - 4.9):
        for s in (-1, 1):
            wheel(g, n, s * (W / 2 - 0.2), 0.5, z, 0.5, 0.36)
    # The trailer's chassis (the container rides on it at 1.3 m), its landing legs, rear lights.
    tz1 = zc - 3.0
    for s in (-1, 1):
        g.box("dark", 0.2, 0.5, tz1 + Ls / 2, s * 0.5, 1.05, (tz1 - Ls / 2) / 2, group=n, bev=0.01, seg=1)
        g.box("metal", 0.08, 0.08, tz1 + Ls / 2, s * (W / 2 - 0.1), 1.25, (tz1 - Ls / 2) / 2, group=n, bev=0.01, seg=1)
        g.add(cyl_raw(0.06, 0.8, s * 0.6, 0.45, tz1 - 2.0, seg=8, axis="y"), "metal", n, bev=0)
        g.box("metal", 0.25, 0.04, 0.25, s * 0.6, 0.03, tz1 - 2.0, group=n, bev=0.005, seg=1)
        for z in (-Ls / 2 + 1.2, -Ls / 2 + 2.5, -Ls / 2 + 3.8):
            wheel(g, n, s * (W / 2 - 0.2), 0.5, z, 0.5, 0.36)
        g.box("light", 0.3, 0.12, 0.05, s * 0.95, 1.0, -Ls / 2 + 0.02, group=n, bev=0.01, seg=1)
    for i in range(int((tz1 + Ls / 2) / 0.8)):
        g.box("dark", W - 0.4, 0.1, 0.1, 0, 1.2, -Ls / 2 + 0.4 + i * 0.8, group=n, bev=0)


def forklift(g):
    n = "forklift"
    W, Lf = 1.2, 3.0
    body = prism_raw([(0.5, 0.25), (0.55, 0.95), (0.2, 1.15), (-1.3, 1.2), (-1.5, 1.0), (-1.5, 0.2), (-1.2, 0.15)], -W / 2, W / 2)
    g.add(body, "paint", n, bev=0.04, seg=2)
    g.box("dark", W - 0.1, 0.45, 0.4, 0, 0.8, -1.25, group=n, bev=0.04, seg=2)
    for s in (-1, 1):
        g.add(seg_raw((s * 0.5, 1.15, 0.35), (s * 0.5, 2.2, 0.15), 0.06, 0.06), "dark", n, bev=0.01, seg=1)
        g.add(seg_raw((s * 0.5, 1.2, -1.0), (s * 0.5, 2.2, -0.9), 0.06, 0.06), "dark", n, bev=0.01, seg=1)
        wheel(g, n, s * (W / 2 - 0.12), 0.32, 0.25, 0.32, 0.24)
        wheel(g, n, s * (W / 2 - 0.12), 0.27, -1.1, 0.27, 0.2)
    for z in (0.15, -0.4, -0.9):
        g.box("dark", W - 0.1, 0.05, 0.06, 0, 2.2, z, group=n, bev=0.005, seg=1)
    g.box("dark", 0.45, 0.12, 0.45, 0, 1.25, -0.5, group=n, bev=0.03, seg=1)
    g.box("dark", 0.45, 0.5, 0.1, 0, 1.5, -0.75, group=n, bev=0.03, seg=1)
    # The mast (two channels, a crossbar), the carriage and the forks.
    for s in (-1, 1):
        g.box("metal", 0.08, 2.15, 0.12, s * 0.35, 1.1, 0.75, group=n, bev=0.01, seg=1)
        g.add(seg_raw((s * 0.18, 0.08, 0.85), (s * 0.18, 0.08, 1.45), 0.1, 0.04, up=(0, 1, 0)), "metal", n, bev=0.005, seg=1)
        g.box("metal", 0.1, 0.5, 0.04, s * 0.18, 0.3, 0.83, group=n, bev=0.005, seg=1)
    g.box("metal", 0.8, 0.08, 0.1, 0, 2.15, 0.75, group=n, bev=0.01, seg=1)
    g.box("metal", 0.85, 0.4, 0.06, 0, 0.45, 0.8, group=n, bev=0.01, seg=1)
    g.add(cyl_raw(0.05, 0.03, 0.4, 2.25, 0.0, seg=10, axis="y"), "light", n, bev=0)


BUILDERS = {
    "container": lambda g: container(g, "container", 6.06),
    "container40": lambda g: container(g, "container40", 12.19),
    "truck": lambda g: truck(g, "truck", True),
    "truck_open": lambda g: truck(g, "truck_open", False),
    "apc": apc,
    "bus": bus,
    "generator": generator,
    "car": car,
    "jeep": jeep,
    "bowser": bowser,
    "semi": semi,
    "forklift": forklift,
}


def main():
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    opts = {"out": "public/models/props", "preview": None, "only": None}
    for i in range(0, len(argv), 2):
        opts[argv[i].lstrip("-")] = argv[i + 1]
    names = opts["only"].split(",") if opts["only"] else list(NODES)
    L.reset(ROLES)
    g = L.Gun("props_heavy", groups=tuple(names))
    for name in names:
        BUILDERS[name](g)
    # (The many-piece ones collapsed some: Neon Docks' maze is dozens of containers.)
    objs = g.finish(uv=1.0, decimate={"container": 0.22, "container40": 0.2, "truck": 0.6, "truck_open": 0.6, "apc": 0.6, "jeep": 0.6, "bowser": 0.6, "semi": 0.5, "forklift": 0.6})
    for name, o in objs.items():
        print(f"  {name}: {sum(len(p.vertices) - 2 for p in o.data.polygons)} tris")
    if not opts["only"]:
        os.makedirs(opts["out"], exist_ok=True)
        path = os.path.join(opts["out"], "heavy.glb")
        L.export_glb(objs, path)
        print(f"HEAVY: {L.tri_count(objs)} tris -> {path} ({os.path.getsize(path)} bytes)")
    if opts["preview"]:
        os.makedirs(opts["preview"], exist_ok=True)
        for name in names:
            for o in objs.values():
                o.hide_render = o.name != name
            L.preview({name: objs[name]}, os.path.join(opts["preview"], f"heavy-{name}"), "heavy", views=("three", "pov"), res=(1000, 620))
        print("PREVIEW done")


main()
