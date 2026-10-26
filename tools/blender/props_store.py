"""
78.0, Night Tokyo's storefronts (docs/TOKYO_PLAN.md, step 1): the fronts laid over a block's face, one per
4 m slot, 3.8 m tall. Width along X (centred), base at Y = 0, the wall at Z = 0, the front towards +Z.
What is under 2.3 m stays within 0.12 m of the wall, handles 0.17 (the block's collider is the wall: nothing to walk
into); signs, eaves, lanterns and awnings stand further out above head height.

  sf_shop      a shop's aluminium front: mullions, an automatic door, a kick plate, a fascia over the
               transom, a lightbox sign (the glass is the map's interior-mapped plane behind)
  sf_izakaya   a wooden front: posts, lattice (koshi) panels, a lattice sliding door, noren on its rod,
               a tiled eave, a wooden signboard, two paper lanterns
  sf_shutter   a closed shop: the roll shutter's housing, guide rails, the corrugated curtain, its
               bottom bar and locks, an unlit sign
  sf_door      a building's entrance: tiled walls, mailboxes, an intercom, a glass door, a tenant
               directory, a canopy with its downlight, the building's name plate
  sf_awning    a retractable awning: striped canvas, valance, arms

Roles: metal, dark, sign, signface, wood, noren, lantern, tile, paper, wtile, dir, light, shutter, canvas.
The game maps `signface`, `dir`, `noren` and `shutter` planar over each part (unique signs per shop).

  Blender -b --factory-startup -P tools/blender/props_store.py -- [--out public/models/props] [--preview DIR] [--only a,b]
"""

import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import bmesh  # noqa: E402
import gunlib as L  # noqa: E402
from gunlib import box_raw, cyl_raw, prism_raw, sphere_raw  # noqa: E402
from mathutils import Matrix  # noqa: E402

ROLES = ("metal", "dark", "sign", "signface", "wood", "noren", "lantern", "tile", "paper", "wtile", "dir", "light", "shutter", "canvas")
NODES = ("sf_shop", "sf_izakaya", "sf_shutter", "sf_door", "sf_awning")
L.PREVIEW["store"] = {
    "metal": ((0.62, 0.64, 0.68), 0.8, 0.35),
    "dark": ((0.03, 0.03, 0.035), 0.3, 0.6),
    "sign": ((0.08, 0.08, 0.09), 0.6, 0.4),
    "signface": ((0.9, 0.3, 0.5), 0.0, 0.4),
    "wood": ((0.22, 0.13, 0.07), 0.0, 0.7),
    "noren": ((0.05, 0.08, 0.25), 0.0, 0.9),
    "lantern": ((0.85, 0.12, 0.08), 0.0, 0.6),
    "tile": ((0.12, 0.12, 0.14), 0.2, 0.6),
    "paper": ((0.9, 0.86, 0.75), 0.0, 0.8),
    "wtile": ((0.7, 0.68, 0.62), 0.0, 0.5),
    "dir": ((0.2, 0.5, 0.8), 0.0, 0.4),
    "light": ((1.0, 0.95, 0.8), 0.0, 0.2),
    "shutter": ((0.45, 0.46, 0.5), 0.6, 0.45),
    "canvas": ((0.6, 0.1, 0.1), 0.0, 0.9),
}
W, H = 4.0, 3.8
IW = 3.6  # between the map's pilasters (0.35 m each at the slot's ends)


def xform(ob, m):
    ob.data.transform(m)
    ob.data.update()
    return ob


def sign_box(g, n, w, h, y0, depth=0.18, face="signface", casing="sign"):
    """A lightbox: its casing on the wall, the face a hair proud of it (mapped to the shop's sign)."""
    g.box(casing, w, h, depth, 0, y0 + h / 2, depth / 2 + 0.03, group=n, bev=0.01, seg=1)
    g.box(face, w - 0.08, h - 0.08, 0.005, 0, y0 + h / 2, depth + 0.033, group=n, bev=0)


# ------------------------------------------------------------------ shop
def sf_shop(g):
    n = "sf_shop"
    # The fascia over the front (covers the plane's top), the lightbox on it.
    g.box("dark", IW, H - 2.9, 0.05, 0, 2.9 + (H - 2.9) / 2, 0.055, group=n, bev=0)
    sign_box(g, n, IW - 0.1, 0.62, 3.05)
    # The frame: head, transom, sill, the verticals (the door's two in the middle).
    for y, h in ((2.9, 0.08), (2.42, 0.07)):
        g.box("metal", IW, h, 0.08, 0, y - h / 2, 0.07, group=n, bev=0.004, seg=1)
    g.box("metal", IW, 0.35, 0.06, 0, 0.175, 0.06, group=n, bev=0.004, seg=1)
    for x in (-IW / 2 + 0.04, -0.62, 0.62, IW / 2 - 0.04):
        g.box("metal", 0.07, 2.86, 0.08, x, 1.43, 0.07, group=n, bev=0.004, seg=1)
    for x in (-1.2, 1.2):
        g.box("metal", 0.04, 2.0, 0.06, x, 1.36, 0.065, group=n, bev=0)
    # The automatic door: two leaves' frames (the glass is the plane), handles, the sensor.
    for s in (-1, 1):
        x0, x1 = s * 0.02, s * 0.58
        cx, w = (x0 + x1) / 2, abs(x1 - x0)
        for yy, hh in ((0.06, 0.12), (2.36, 0.06)):
            g.box("metal", w, hh, 0.05, cx, yy, 0.09, group=n, bev=0)
        g.box("metal", 0.04, 2.36, 0.05, s * 0.04, 1.18, 0.09, group=n, bev=0)
        g.box("metal", 0.04, 2.36, 0.05, s * 0.56, 1.18, 0.09, group=n, bev=0)
        g.box("dark", 0.03, 0.4, 0.03, s * 0.1, 1.05, 0.12, group=n, bev=0)
    g.box("dark", 0.36, 0.08, 0.08, 0, 2.5, 0.1, group=n, bev=0.01, seg=1)
    # Opening hours and a poster on the glass, a mat at the door.
    g.box("paper", 0.24, 0.32, 0.004, 0.85, 1.45, 0.075, group=n, bev=0)
    g.box("paper", 0.5, 0.7, 0.004, -1.55, 1.3, 0.075, group=n, bev=0)


# ------------------------------------------------------------------ izakaya
def sf_izakaya(g):
    n = "sf_izakaya"
    # The wall over the eave in wood, the signboard on it.
    g.box("wood", IW, H - 2.85, 0.05, 0, 2.85 + (H - 2.85) / 2, 0.055, group=n, bev=0)
    sign_box(g, n, 2.6, 0.55, 3.18, depth=0.1, casing="wood")
    # Posts and the beam, the lower boards.
    for x in (-IW / 2 + 0.06, -0.72, 0.72, IW / 2 - 0.06):
        g.box("wood", 0.12, 2.85, 0.12, x, 1.425, 0.09, group=n, bev=0.01, seg=1)
    g.box("wood", IW, 0.14, 0.12, 0, 2.38, 0.09, group=n, bev=0.01, seg=1)
    for s in (-1, 1):
        g.box("wood", 1.0, 0.5, 0.06, s * 1.22, 0.25, 0.07, group=n, bev=0.005, seg=1)
        # Koshi: fine vertical slats over the side windows.
        for i in range(13):
            x = s * (0.78 + 0.075 * i + 0.04)
            if abs(x) > IW / 2 - 0.13:
                continue
            g.box("wood", 0.028, 1.8, 0.035, x, 1.4, 0.11, group=n, bev=0)
        g.box("wood", 1.0, 0.04, 0.04, s * 1.22, 1.0, 0.115, group=n, bev=0)
    # The sliding door: a lattice upper, a board lower; noren on its rod over it.
    g.box("wood", 1.32, 0.9, 0.05, 0, 0.45, 0.08, group=n, bev=0.005, seg=1)
    for i in range(6):
        g.box("wood", 0.025, 1.4, 0.03, -0.55 + i * 0.22, 1.6, 0.1, group=n, bev=0)
    for y in (1.2, 1.6, 2.0):
        g.box("wood", 1.32, 0.025, 0.03, 0, y, 0.1, group=n, bev=0)
    g.add(cyl_raw(0.018, 1.5, 0, 2.28, 0.14, seg=8, axis="x"), "dark", n, bev=0)
    for i in range(3):
        x = -0.48 + i * 0.48

        def build(bm, x=x):
            rows = []
            for k in range(5):
                y = 2.27 - k * 0.15
                row = []
                for j in range(4):
                    xx = x - 0.22 + j * 0.147
                    z = 0.135 + 0.01 * math.sin(j * 2.1 + k)
                    row.append(bm.verts.new((xx, y, z)))
                rows.append(row)
            for k in range(4):
                for j in range(3):
                    bm.faces.new((rows[k][j], rows[k + 1][j], rows[k + 1][j + 1], rows[k][j + 1]))

        bm = bmesh.new()
        build(bm)
        sol = L._link("noren", bm)
        mod = sol.modifiers.new("t", "SOLIDIFY")
        mod.thickness = 0.008
        L.apply_mods(sol)
        g.add(sol, "noren", n, bev=0)
    # The eave: a sloped tiled roof on brackets, ridges of tiles.
    eave = box_raw(IW + 0.2, 0.06, 0.8, 0, 2.95, 0.42)
    xform(eave, Matrix.Translation((0, 2.95, 0.02)) @ Matrix.Rotation(0.32, 4, "X") @ Matrix.Translation((0, -2.95, -0.02)))
    g.add(eave, "tile", n, bev=0)
    for i in range(14):
        x = -IW / 2 + 0.13 + i * 0.27
        rib = cyl_raw(0.04, 0.82, x, 2.99, 0.42, seg=6)
        xform(rib, Matrix.Translation((0, 2.95, 0.02)) @ Matrix.Rotation(0.32, 4, "X") @ Matrix.Translation((0, -2.95, -0.02)))
        g.add(rib, "tile", n, bev=0)
    for x in (-1.5, 0, 1.5):
        g.box("wood", 0.06, 0.06, 0.6, x, 2.8, 0.32, group=n, bev=0)
    # Two paper lanterns hung from the eave (their bottoms 2.3 m up).
    for x in (-1.45, 1.45):
        g.add(sphere_raw(0.2, x, 2.55, 0.42, seg=14, rings=8, sy=1.25), "lantern", n, bev=0)
        g.add(cyl_raw(0.11, 0.05, x, 2.82, 0.42, seg=12, axis="y"), "dark", n, bev=0)
        g.add(cyl_raw(0.11, 0.05, x, 2.29, 0.42, seg=12, axis="y"), "dark", n, bev=0)
        g.add(cyl_raw(0.008, 0.12, x, 2.9, 0.42, seg=4, axis="y"), "dark", n, bev=0)
    # A menu on the post by the door.
    g.box("paper", 0.24, 0.62, 0.01, 0.87, 1.5, 0.155, group=n, bev=0)


# ------------------------------------------------------------------ shutter
def sf_shutter(g):
    n = "sf_shutter"
    g.box("dark", IW, H - 2.9, 0.05, 0, 2.9 + (H - 2.9) / 2, 0.055, group=n, bev=0)
    sign_box(g, n, IW - 0.4, 0.42, 3.33, depth=0.12)
    # The housing over the opening, the guide rails.
    g.box("shutter", IW - 0.1, 0.42, 0.3, 0, 3.05, 0.18, group=n, bev=0.02, seg=1)
    for s in (-1, 1):
        g.box("metal", 0.07, 2.86, 0.07, s * (IW / 2 - 0.1), 1.43, 0.065, group=n, bev=0)
    # The curtain: slats (ridged), the bottom bar, two locks and their handles.
    CW = IW - 0.3

    def build(bm):
        rows = []
        y, k = 0.12, 0
        while y < 2.84:
            for dz, dy in ((0.05, 0.0), (0.075, 0.02), (0.075, 0.06), (0.05, 0.08)):
                rows.append((bm.verts.new((-CW / 2, y + dy, dz)), bm.verts.new((CW / 2, y + dy, dz))))
            y += 0.08
            k += 1
        for i in range(len(rows) - 1):
            a, b = rows[i], rows[i + 1]
            bm.faces.new((a[0], a[1], b[1], b[0]))

    bm = bmesh.new()
    build(bm)
    g.add(L._link("curtain", bm), "shutter", n, bev=0)
    g.box("metal", CW, 0.12, 0.08, 0, 0.06, 0.07, group=n, bev=0.01, seg=1)
    for s in (-1, 1):
        g.box("dark", 0.1, 0.07, 0.04, s * 1.1, 0.07, 0.125, group=n, bev=0.005, seg=1)
        g.add(cyl_raw(0.015, 0.16, s * 0.5, 0.18, 0.13, seg=6, axis="x"), "metal", n, bev=0)


# ------------------------------------------------------------------ building entrance
def sf_door(g):
    n = "sf_door"
    # Tiled walls either side of the door, the panel over it.
    for s in (-1, 1):
        g.box("wtile", 1.2, 2.9, 0.06, s * 1.2, 1.45, 0.06, group=n, bev=0)
        for i in range(1, 12):
            g.box("dark", 1.2, 0.006, 0.004, s * 1.2, i * 0.24, 0.092, group=n, bev=0)
    g.box("wtile", IW, H - 2.9, 0.06, 0, 2.9 + (H - 2.9) / 2, 0.06, group=n, bev=0)
    # The glass door in its frame, its push bar, the glass panel over it.
    for x in (-0.6, 0.6):
        g.box("metal", 0.06, 2.6, 0.1, x, 1.3, 0.08, group=n, bev=0.004, seg=1)
    for y in (0.04, 2.25, 2.6):
        g.box("metal", 1.26, 0.06, 0.1, 0, y, 0.08, group=n, bev=0.004, seg=1)
    g.box("metal", 0.04, 2.2, 0.06, 0, 1.14, 0.08, group=n, bev=0)
    for s in (-1, 1):
        g.add(cyl_raw(0.018, 0.5, s * 0.08, 1.05, 0.14, seg=8, axis="y"), "metal", n, bev=0)
    # Mailboxes (three rows of four), the intercom and its button, the address plate.
    for r in range(3):
        for c in range(4):
            x, y = -1.68 + c * 0.24, 1.05 + r * 0.2
            g.box("metal", 0.22, 0.18, 0.08, x, y, 0.12, group=n, bev=0.004, seg=1)
            g.box("dark", 0.12, 0.012, 0.004, x, y + 0.04, 0.161, group=n, bev=0)
    g.box("dark", 0.2, 0.3, 0.04, -0.85, 1.35, 0.11, group=n, bev=0.006, seg=1)
    g.box("light", 0.05, 0.05, 0.01, -0.85, 1.3, 0.135, group=n, bev=0)
    # The tenant directory: lit, a frame round it.
    g.box("sign", 0.86, 1.2, 0.06, 1.2, 1.55, 0.11, group=n, bev=0.006, seg=1)
    g.box("dir", 0.78, 1.12, 0.004, 1.2, 1.55, 0.142, group=n, bev=0)
    # The canopy and its downlight, the building's name plate over it.
    g.box("dark", 1.7, 0.08, 0.9, 0, 2.72, 0.5, group=n, bev=0.01, seg=1)
    g.add(cyl_raw(0.07, 0.01, 0, 2.675, 0.55, seg=12, axis="y"), "light", n, bev=0)
    sign_box(g, n, 1.7, 0.38, 3.1, depth=0.08)


# ------------------------------------------------------------------ awning
def sf_awning(g):
    n = "sf_awning"
    AW, P = IW - 0.1, 1.0
    # The canvas from the wall (2.95 m) down to its front bar (2.62 m), its valance, the roller box.
    c = box_raw(AW, 0.02, math.hypot(P, 0.33), 0, 0, 0)
    xform(c, Matrix.Translation((0, 2.785, P / 2 + 0.05)) @ Matrix.Rotation(math.atan2(0.33, P), 4, "X"))
    g.add(c, "canvas", n, bev=0)
    g.box("canvas", AW, 0.22, 0.012, 0, 2.52, P + 0.05, group=n, bev=0)
    g.add(cyl_raw(0.025, AW, 0, 2.62, P + 0.05, seg=8, axis="x"), "metal", n, bev=0)
    g.box("metal", AW, 0.14, 0.14, 0, 3.0, 0.1, group=n, bev=0.01, seg=1)
    for s in (-1, 1):
        a = cyl_raw(0.015, 1.05, 0, 0, 0, seg=6)
        xform(a, Matrix.Translation((s * (AW / 2 - 0.3), 2.8, 0.55)) @ Matrix.Rotation(math.atan2(0.33, P) + 0.12, 4, "X"))
        g.add(a, "metal", n, bev=0)


BUILDERS = {k: globals()[k] for k in NODES}


def main():
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    opts = {"out": "public/models/props", "preview": None, "only": None}
    for i in range(0, len(argv), 2):
        opts[argv[i].lstrip("-")] = argv[i + 1]
    names = opts["only"].split(",") if opts["only"] else list(NODES)
    L.reset(ROLES)
    g = L.Gun("props_store", groups=tuple(names))
    for name in names:
        BUILDERS[name](g)
    objs = g.finish(uv=1.0)
    for name, o in objs.items():
        print(f"  {name}: {sum(len(p.vertices) - 2 for p in o.data.polygons)} tris")
    if not opts["only"]:
        os.makedirs(opts["out"], exist_ok=True)
        path = os.path.join(opts["out"], "store.glb")
        L.export_glb(objs, path)
        print(f"STORE: {L.tri_count(objs)} tris -> {path} ({os.path.getsize(path)} bytes)")
    if opts["preview"]:
        os.makedirs(opts["preview"], exist_ok=True)
        for name in names:
            for o in objs.values():
                o.hide_render = o.name != name
            L.preview({name: objs[name]}, os.path.join(opts["preview"], f"store-{name}"), "store", views=("three",), res=(600, 450))
        print("PREVIEW done")


main()
