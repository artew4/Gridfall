"""
83.0, Night Tokyo's landmarks (docs/TOKYO_PLAN.md, step 5): the railway overpass, its train, the metro's
canopy. Base at Y = 0, three.js axes.

The overpass (along X; laid by the city on its concrete deck):
  girder     a 3 m module of the riveted plate girder on the deck's side (the face at Z = 0, out +Z):
             web, flanges, two stiffeners, rivet rows (1.5 m tall: under the deck's top)
  pier       a pier (1.2 x 1.8 at its foot, 6.4 tall): chamfered shaft, its cap, bearings
  cmast      a catenary mast on the deck (3.5 m): an H beam, its cantilever over the track,
             insulators, the registration arm
The train (a car 19 m along X, 2.9 wide; Y = 0 the car body's middle, as Train.ts places its boxes):
  roof       the curved roof over the body, two air-conditioning units, vents, conduits
  panto      a single-arm pantograph and its base
  gangway    the bellows between two cars
  cab        a cab end (its front at X = 0, out -X): the windscreen, the destination box, the lamp housings,
             the coupler, the skirt
The metro:
  mcanopy    the entrance's canopy: steel arches on six posts, a curved glass roof, gutters, a lit sign
             box at its open end (3.6 x 10.6, 2.9 m to its eaves)

Roles: steel, rivet, concrete, bearing, insul, body, dark, glass, lamp, sign, gutter.

  Blender -b --factory-startup -P tools/blender/props_landmark.py -- [--out public/models/props] [--preview DIR] [--only a,b]
"""

import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import bmesh  # noqa: E402
import gunlib as L  # noqa: E402
from gunlib import box_raw, cyl_raw, front_raw, seg_raw  # noqa: E402

ROLES = ("steel", "rivet", "concrete", "bearing", "insul", "body", "dark", "glass", "lamp", "sign", "gutter")
NODES = ("girder", "pier", "cmast", "roof", "panto", "gangway", "cab", "mcanopy")
L.PREVIEW["landmark"] = {
    "steel": ((0.25, 0.27, 0.3), 0.7, 0.5),
    "rivet": ((0.3, 0.3, 0.32), 0.7, 0.45),
    "concrete": ((0.5, 0.5, 0.52), 0.0, 0.85),
    "bearing": ((0.2, 0.2, 0.22), 0.8, 0.4),
    "insul": ((0.6, 0.35, 0.2), 0.0, 0.3),
    "body": ((0.7, 0.72, 0.75), 0.8, 0.3),
    "dark": ((0.05, 0.05, 0.06), 0.4, 0.5),
    "glass": ((0.05, 0.06, 0.08), 0.3, 0.05),
    "lamp": ((1.0, 0.95, 0.8), 0.0, 0.2),
    "sign": ((0.2, 0.8, 0.4), 0.0, 0.3),
    "gutter": ((0.35, 0.37, 0.4), 0.7, 0.4),
}


def xform(ob, m):
    ob.data.transform(m)
    ob.data.update()
    return ob


# ------------------------------------------------------------------ the overpass
def girder(g):
    n = "girder"
    W, H = 3.0, 1.5
    g.box("steel", W, H, 0.03, 0, H / 2, 0.05, group=n, bev=0)
    for y in (0.02, H - 0.02):
        g.box("steel", W, 0.04, 0.3, 0, y, 0.15, group=n, bev=0.005, seg=1)
    for x in (-W / 2 + 0.06, 0.0):
        g.box("steel", 0.12, H - 0.08, 0.02, x, H / 2, 0.075, group=n, bev=0)
        g.box("steel", 0.02, H - 0.08, 0.18, x, H / 2, 0.15, group=n, bev=0)
    # Rivets: a row along each flange, one up each stiffener.
    for y in (0.09, H - 0.09):
        for i in range(10):
            g.box("rivet", 0.03, 0.03, 0.02, -W / 2 + 0.15 + i * 0.3, y, 0.075, group=n, bev=0)
    for x in (-W / 2 + 0.06, 0.0):
        for k in range(4):
            g.box("rivet", 0.03, 0.03, 0.02, x, 0.35 + k * 0.27, 0.095, group=n, bev=0)


def pier(g):
    n = "pier"
    # The shaft (its foot the collider's 1.2 x 1.8, chamfered in), the cap over the head (6 m up), bearings.
    s = front_raw([(-0.6, 0), (0.6, 0), (0.6, 5.6), (-0.6, 5.6)], -0.9, 0.9)
    g.add(s, "concrete", n, bev=0.06, seg=2, angle=30)
    g.add(front_raw([(-0.6, 5.55), (0.6, 5.55), (0.85, 6.0), (-0.85, 6.0)], -1.05, 1.05), "concrete", n, bev=0.03, seg=1)
    for z in (-0.6, 0.6):
        g.box("bearing", 0.5, 0.2, 0.5, 0, 6.1, z, group=n, bev=0.02, seg=1)
        g.box("bearing", 0.6, 0.06, 0.6, 0, 6.03, z, group=n, bev=0)
    # A drain pipe half sunk in its side (2 cm out of the collider).
    g.add(cyl_raw(0.06, 5.5, 0.56, 2.8, 0.5, seg=8, axis="y"), "gutter", n, bev=0)


def cmast(g):
    n = "cmast"
    H = 3.5
    # The H beam (its flanges and web), its base plate.
    for z in (-0.08, 0.08):
        g.box("steel", 0.2, H, 0.02, 0, H / 2, z, group=n, bev=0)
    g.box("steel", 0.02, H, 0.16, 0, H / 2, 0, group=n, bev=0)
    g.box("steel", 0.36, 0.03, 0.36, 0, 0.015, 0, group=n, bev=0)
    # The cantilever over the track (+Z: towards the deck's middle), its stay, insulators, the arm down.
    g.add(seg_raw((0, H - 0.4, 0.1), (0, H - 0.25, 2.2), 0.05, 0.05), "steel", n, bev=0)
    g.add(seg_raw((0, H - 0.05, 0.1), (0, H - 0.3, 1.8), 0.035, 0.035), "steel", n, bev=0)
    for z, y in ((0.3, H - 0.38), (0.3, H - 0.07)):
        for k in range(4):
            g.add(cyl_raw(0.06, 0.03, 0, y, z + k * 0.05, seg=10), "insul", n, bev=0)
    # The dropper to the contact wire (11.2 m: the mast's foot at 7.85).
    g.add(seg_raw((0, H - 0.25, 2.2), (0, H - 0.15, 2.2), 0.025, 0.025), "steel", n, bev=0)


# ------------------------------------------------------------------ the train
CL, CW = 19.0, 2.9


def roof(g):
    n = "roof"
    # The roof's curve (its edges on the body's top at Y = 1.25), gutters along it.

    def build(bm):
        rows = []
        for i in range(13):
            a = -math.pi / 2 + i / 12 * math.pi
            z = math.sin(a) * CW / 2
            y = 1.25 + math.cos(a) * 0.42
            rows.append((bm.verts.new((-CL / 2, y, z)), bm.verts.new((CL / 2, y, z))))
        for i in range(12):
            a, b = rows[i], rows[i + 1]
            bm.faces.new((a[0], a[1], b[1], b[0]))
        for k in (0, 1):
            bm.faces.new([r[k] for r in rows] if k else [r[k] for r in reversed(rows)])

    bm = bmesh.new()
    build(bm)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    g.add(L._link("roof", bm), "body", n, bev=0)
    for s in (-1, 1):
        g.box("body", CL, 0.05, 0.06, 0, 1.27, s * (CW / 2 - 0.02), group=n, bev=0)
    # Two air-conditioning units (their grilles), vents, a conduit along the roof.
    for x in (-5.0, 5.0):
        g.box("body", 2.6, 0.36, 1.9, x, 1.78, 0, group=n, bev=0.05, seg=2)
        for k in range(2):
            g.add(cyl_raw(0.32, 0.04, x - 0.6 + k * 1.2, 1.98, 0, seg=16, axis="y"), "dark", n, bev=0)
    for x in (-8.2, -2.0, 2.0, 8.2):
        g.box("body", 0.6, 0.12, 0.5, x, 1.7, 0, group=n, bev=0.02, seg=1)
    g.add(cyl_raw(0.05, CL - 1.0, 0, 1.72, 0.7, seg=8, axis="x"), "dark", n, bev=0)


def panto(g):
    """A single-arm pantograph folded low: its collector at Y = 2.05 (the contact wire, 11.2 m: the car's
    middle at 9.15)."""
    n = "panto"
    g.box("dark", 1.6, 0.08, 1.4, 0, 1.72, 0, group=n, bev=0.01, seg=1)
    for x in (-0.6, 0.6):
        for z in (-0.5, 0.5):
            g.add(cyl_raw(0.06, 0.1, x, 1.66, z, seg=10, axis="y"), "insul", n, bev=0)
    g.add(seg_raw((-0.55, 1.77, 0), (0.55, 1.93, 0), 0.07, 0.07), "dark", n, bev=0)
    g.add(seg_raw((0.55, 1.93, 0), (-0.25, 2.03, 0), 0.05, 0.05), "dark", n, bev=0)
    g.add(seg_raw((-0.5, 1.79, 0.15), (0.5, 1.92, 0.15), 0.025, 0.025), "dark", n, bev=0)
    g.box("dark", 0.15, 0.04, 1.6, -0.25, 2.05, 0, group=n, bev=0.01, seg=1)
    for z in (-0.8, 0.8):
        g.add(seg_raw((-0.25, 2.05, z), (-0.25, 2.0, z + (0.12 if z > 0 else -0.12)), 0.03, 0.03), "dark", n, bev=0)


def gangway(g):
    n = "gangway"
    # Bellows: ribs round the passage between two cars (0.7 m long, along X).
    for i in range(7):
        x = -0.3 + i * 0.1
        g.box("dark", 0.06, 2.2, 2.3, x, -0.05, 0, group=n, bev=0.02, seg=1)
    g.box("dark", 0.7, 2.1, 2.2, 0, -0.05, 0, group=n, bev=0)


def cab(g):
    n = "cab"
    # The front (at X = 0, out -X): a slightly raked face, the windscreen, the destination box, lamp
    # housings at the corners low down, the coupler, the skirt, a stripe.
    g.add(box_raw(0.35, 2.5, CW, 0.17, 0, 0), "body", n, bev=0.06, seg=2)
    g.box("glass", 0.04, 0.95, CW - 0.5, -0.02, 0.55, 0, group=n, bev=0.02, seg=1)
    g.box("dark", 0.05, 0.08, CW - 0.4, -0.03, 0.04, 0, group=n, bev=0)
    g.box("sign", 0.03, 0.22, 1.1, -0.04, 1.1, 0, group=n, bev=0)
    for z in (-0.95, 0.95):
        g.box("dark", 0.06, 0.34, 0.5, -0.02, -0.7, z, group=n, bev=0.02, seg=1)
    g.box("sign", 0.02, 0.12, CW - 0.1, -0.02, -0.25, 0, group=n, bev=0)
    g.box("dark", 0.5, 0.25, 0.3, -0.25, -1.2, 0, group=n, bev=0.02, seg=1)
    g.box("dark", 0.08, 0.5, CW - 0.3, -0.05, -1.45, 0, group=n, bev=0.02, seg=1)
    g.add(cyl_raw(0.04, 0.6, -0.02, 0.3, CW / 2 - 0.1, seg=6, axis="y"), "dark", n, bev=0)


# ------------------------------------------------------------------ the metro
def mcanopy(g):
    n = "mcanopy"
    W, LEN, EAVE = 3.6, 10.6, 2.9
    # Six posts (at the old ones' places), arches over each pair, purlins, the curved glass, gutters.
    for z in (-5.0 + 0.1, -0.0, 4.9):
        for x in (-1.6, 1.6):
            g.box("steel", 0.1, EAVE, 0.1, x, EAVE / 2, z, group=n, bev=0.01, seg=1)
        pts = []
        for i in range(9):
            a = -math.pi / 2 + i / 8 * math.pi
            pts.append((math.sin(a) * 1.75, EAVE + math.cos(a) * 0.55))
        for i in range(8):
            (x0, y0), (x1, y1) = pts[i], pts[i + 1]
            g.add(seg_raw((x0, y0, z), (x1, y1, z), 0.08, 0.12), "steel", n, bev=0)
    for i in range(9):
        a = -math.pi / 2 + i / 8 * math.pi
        g.add(cyl_raw(0.025, LEN, math.sin(a) * 1.75, EAVE + math.cos(a) * 0.55 + 0.05, 0, seg=6), "steel", n, bev=0)

    def build(bm):
        rows = []
        for i in range(17):
            a = -math.pi / 2 + i / 16 * math.pi
            x, y = math.sin(a) * 1.8, EAVE + math.cos(a) * 0.56 + 0.08
            rows.append((bm.verts.new((x, y, -LEN / 2)), bm.verts.new((x, y, LEN / 2))))
        for i in range(16):
            a, b = rows[i], rows[i + 1]
            bm.faces.new((a[0], b[0], b[1], a[1]))

    bm = bmesh.new()
    build(bm)
    gl = L._link("glass", bm)
    mod = gl.modifiers.new("t", "SOLIDIFY")
    mod.thickness = 0.02
    L.apply_mods(gl)
    g.add(gl, "glass", n, bev=0)
    for x in (-1.8, 1.8):
        g.box("gutter", 0.14, 0.12, LEN + 0.1, x, EAVE + 0.04, 0, group=n, bev=0.01, seg=1)
    # The lit sign box over the open end (-Z), its frame.
    g.box("steel", 3.3, 0.9, 0.18, 0, EAVE + 0.5, -LEN / 2 - 0.05, group=n, bev=0.02, seg=1)
    g.box("sign", 3.2, 0.8, 0.02, 0, EAVE + 0.5, -LEN / 2 - 0.15, group=n, bev=0)


BUILDERS = {k: globals()[k] for k in NODES}


def main():
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    opts = {"out": "public/models/props", "preview": None, "only": None}
    for i in range(0, len(argv), 2):
        opts[argv[i].lstrip("-")] = argv[i + 1]
    names = opts["only"].split(",") if opts["only"] else list(NODES)
    L.reset(ROLES)
    g = L.Gun("props_landmark", groups=tuple(names))
    for name in names:
        BUILDERS[name](g)
    objs = g.finish(uv=1.0)
    for name, o in objs.items():
        print(f"  {name}: {sum(len(p.vertices) - 2 for p in o.data.polygons)} tris")
    if not opts["only"]:
        os.makedirs(opts["out"], exist_ok=True)
        path = os.path.join(opts["out"], "landmark.glb")
        L.export_glb(objs, path)
        print(f"LANDMARK: {L.tri_count(objs)} tris -> {path} ({os.path.getsize(path)} bytes)")
    if opts["preview"]:
        os.makedirs(opts["preview"], exist_ok=True)
        for name in names:
            for o in objs.values():
                o.hide_render = o.name != name
            L.preview({name: objs[name]}, os.path.join(opts["preview"], f"landmark-{name}"), "landmark", views=("three",), res=(600, 450))
        print("PREVIEW done")


main()
