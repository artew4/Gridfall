"""
80.0, Night Tokyo's facades above the street (docs/TOKYO_PLAN.md, step 3). Width along X (centred), base
at Y = 0, the wall at Z = 0, out towards +Z.

  balc_a     an apartment balcony: slab, aluminium railing over a panel, the laundry pole on its hangers
             with shirts and towels, the air conditioner's outdoor unit (2.6 wide, 1.0 out)
  balc_b     the same with a futon over the rail, plant pots, a bicycle's worth of clutter
  rtank      a rooftop water tank: FRP panels on a steel stand, its ladder, manhole, pipes (2.4 x 3.3)
  tatekan    a vertical sign stack (tate-kanban): a steel frame on two arms out from the wall, five
             panels lit both sides (0.8 wide, 6 tall, 1.0 out)

Roles: concrete, metal, panel, laundry, futon, plastic, leaf, pot, frp, signface. The game maps the
laundry, the futon and each sign panel to its own cell.

  Blender -b --factory-startup -P tools/blender/props_facade.py -- [--out public/models/props] [--preview DIR] [--only a,b]
"""

import math
import os
import random
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import bmesh  # noqa: E402
import gunlib as L  # noqa: E402
from gunlib import box_raw, cyl_raw, seg_raw, sphere_raw  # noqa: E402
from mathutils import Matrix  # noqa: E402

ROLES = ("concrete", "metal", "panel", "laundry", "futon", "plastic", "leaf", "pot", "frp", "signface")
NODES = ("balc_a", "balc_b", "rtank", "tatekan")
L.PREVIEW["facade"] = {
    "concrete": ((0.5, 0.5, 0.5), 0.0, 0.85),
    "metal": ((0.6, 0.62, 0.65), 0.8, 0.35),
    "panel": ((0.75, 0.78, 0.8), 0.1, 0.4),
    "laundry": ((0.8, 0.5, 0.4), 0.0, 0.9),
    "futon": ((0.4, 0.5, 0.8), 0.0, 0.9),
    "plastic": ((0.85, 0.85, 0.8), 0.0, 0.5),
    "leaf": ((0.15, 0.35, 0.12), 0.0, 0.7),
    "pot": ((0.5, 0.25, 0.15), 0.0, 0.8),
    "frp": ((0.3, 0.55, 0.75), 0.0, 0.5),
    "signface": ((0.9, 0.4, 0.6), 0.0, 0.4),
}
BW, BD = 2.6, 1.0


def xform(ob, m):
    ob.data.transform(m)
    ob.data.update()
    return ob


def balcony_shell(g, n):
    # The slab with its drip edge, the railing: posts, top rail, a panel under it, side returns.
    g.box("concrete", BW, 0.15, BD, 0, 0.075, BD / 2, group=n, bev=0.01, seg=1)
    g.box("concrete", BW + 0.04, 0.05, 0.05, 0, 0.0, BD + 0.005, group=n, bev=0)
    for x in (-BW / 2 + 0.03, 0, BW / 2 - 0.03):
        g.box("metal", 0.04, 1.0, 0.04, x, 0.65, BD - 0.03, group=n, bev=0)
    g.box("metal", BW, 0.05, 0.07, 0, 1.15, BD - 0.03, group=n, bev=0.01, seg=1)
    g.box("panel", BW - 0.08, 0.7, 0.015, 0, 0.55, BD - 0.03, group=n, bev=0)
    for s in (-1, 1):
        g.box("metal", 0.05, 0.05, BD, s * (BW / 2 - 0.025), 1.15, BD / 2, group=n, bev=0)
        g.box("panel", 0.015, 0.7, BD - 0.06, s * (BW / 2 - 0.025), 0.55, BD / 2, group=n, bev=0)


def balc_a(g):
    n = "balc_a"
    balcony_shell(g, n)
    # The laundry pole on two hangers from the slab above, shirts and towels on it.
    for x in (-1.0, 1.0):
        g.add(cyl_raw(0.012, 0.6, x, 2.15, 0.6, seg=6, axis="y"), "metal", n, bev=0)
    g.add(cyl_raw(0.02, 2.3, 0, 1.85, 0.6, seg=8, axis="x"), "metal", n, bev=0)
    rnd = random.Random(3)
    x = -1.05
    while x < 0.95:
        w = 0.3 + rnd.random() * 0.25
        h = 0.45 + rnd.random() * 0.35
        g.box("laundry", w, h, 0.01, x + w / 2, 1.83 - h / 2, 0.6 + (rnd.random() - 0.5) * 0.04, group=n, bev=0)
        x += w + 0.05
    # The outdoor unit at one end, its fan grille, the pipe into the wall.
    g.box("plastic", 0.8, 0.55, 0.3, 0.8, 0.15 + 0.275, 0.22, group=n, bev=0.02, seg=1)
    g.add(cyl_raw(0.2, 0.02, 0.9, 0.43, 0.38, seg=16), "metal", n, bev=0)
    g.add(seg_raw((0.45, 0.6, 0.1), (0.4, 0.6, 0.0), 0.05, 0.05), "metal", n, bev=0)


def balc_b(g):
    n = "balc_b"
    balcony_shell(g, n)
    # A futon folded over the rail (inside and out), plant pots, a stool.
    g.box("futon", 1.3, 0.05, 0.14, -0.35, 1.2, BD - 0.03, group=n, bev=0.01, seg=1)
    for z in (BD - 0.09, BD + 0.03):
        g.box("futon", 1.3, 0.55, 0.04, -0.35, 0.93, z, group=n, bev=0.01, seg=1)
    for i, x in enumerate((0.55, 0.85, 1.05)):
        r = 0.12 + 0.03 * i
        g.add(cyl_raw(r, 0.25, x, 0.15 + 0.125, 0.35, seg=10, r2=r * 0.8, axis="y"), "pot", n, bev=0)
        g.add(sphere_raw(r * 1.6, x, 0.15 + 0.25 + r * 1.2, 0.35, seg=8, rings=5, sy=1.2), "leaf", n, bev=0)
    g.box("plastic", 0.35, 0.4, 0.35, -1.0, 0.35, 0.3, group=n, bev=0.02, seg=1)


def rtank(g):
    n = "rtank"
    # The stand: four legs, a frame top and bottom, X braces on the sides.
    for sx in (-1, 1):
        for sz in (-1, 1):
            g.box("metal", 0.1, 1.2, 0.1, sx * 1.0, 0.6, sz * 0.8, group=n, bev=0)
    for y in (0.1, 1.2):
        for s in (-1, 1):
            g.box("metal", 2.1, 0.08, 0.08, 0, y, s * 0.8, group=n, bev=0)
            g.box("metal", 0.08, 0.08, 1.7, s * 1.0, y, 0, group=n, bev=0)
    for s in (-1, 1):
        g.add(seg_raw((-1.0, 0.15, s * 0.82), (1.0, 1.15, s * 0.82), 0.04, 0.04), "metal", n, bev=0)
        g.add(seg_raw((-1.0, 1.15, s * 0.82), (1.0, 0.15, s * 0.82), 0.04, 0.04), "metal", n, bev=0)
    # The tank: 2.4 x 2.0 x 2.0 of 1 m panels (raised ribs between), the manhole on top.
    g.box("frp", 2.4, 2.0, 2.0, 0, 1.25 + 1.0, 0, group=n, bev=0.03, seg=1)
    for x in (-0.6, 0.6):
        for s in (-1, 1):
            g.box("frp", 0.06, 2.0, 0.04, x, 2.25, s * 1.01, group=n, bev=0)
    for y in (1.75, 2.75):
        for s in (-1, 1):
            g.box("frp", 2.4, 0.06, 0.04, 0, y, s * 1.01, group=n, bev=0)
            g.box("frp", 0.04, 0.06, 2.0, s * 1.21, y, 0, group=n, bev=0)
    g.add(cyl_raw(0.3, 0.08, 0.5, 3.29, 0.3, seg=14, axis="y"), "frp", n, bev=0.01, seg=1)
    # Its ladder up the side, the pipes down from its foot.
    for x in (-0.85, -0.55):
        g.box("metal", 0.04, 3.2, 0.04, x, 1.6, 1.15, group=n, bev=0)
    for i in range(10):
        g.box("metal", 0.3, 0.03, 0.03, -0.7, 0.3 + i * 0.3, 1.15, group=n, bev=0)
    g.add(cyl_raw(0.05, 1.2, 0.6, 0.6, 0.5, seg=8, axis="y"), "metal", n, bev=0)
    g.add(cyl_raw(0.05, 0.9, 0.6, 0.05, 0.95, seg=8), "metal", n, bev=0)


def tatekan(g):
    """The stack stands out from the wall (its width along Z, 0.25 to 1.05 m out), its panels facing
    along the street both ways (+X and -X), so it reads from up and down the street."""
    n = "tatekan"
    H, W, Z0 = 6.0, 0.8, 0.25
    ZC = Z0 + W / 2
    # Two arms from the wall to the frame, a brace under each.
    for y in (0.4, H - 0.4):
        g.box("metal", 0.08, 0.08, Z0 + 0.05, 0, y, (Z0 + 0.05) / 2, group=n, bev=0)
        g.add(seg_raw((0, y - 0.5, 0.02), (0, y, Z0), 0.04, 0.04), "metal", n, bev=0)
    for z in (Z0, Z0 + W):
        for x in (-0.12, 0.12):
            g.box("metal", 0.05, H, 0.05, x, H / 2, z, group=n, bev=0)
    g.box("metal", 0.34, 0.12, W + 0.1, 0, H + 0.06, ZC, group=n, bev=0.01, seg=1)
    g.box("metal", 0.34, 0.1, W + 0.1, 0, -0.05, ZC, group=n, bev=0.01, seg=1)
    for i in range(6):
        g.box("metal", 0.26, 0.04, W, 0, 0.1 + i * 1.18, ZC, group=n, bev=0)
    for i in range(5):
        y0 = 0.1 + i * 1.18
        for sx in (-1, 1):
            g.box("signface", 0.006, 1.06, W - 0.06, sx * 0.125, y0 + 0.59, ZC, group=n, bev=0)


BUILDERS = {k: globals()[k] for k in NODES}


def main():
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    opts = {"out": "public/models/props", "preview": None, "only": None}
    for i in range(0, len(argv), 2):
        opts[argv[i].lstrip("-")] = argv[i + 1]
    names = opts["only"].split(",") if opts["only"] else list(NODES)
    L.reset(ROLES)
    g = L.Gun("props_facade", groups=tuple(names))
    for name in names:
        BUILDERS[name](g)
    objs = g.finish(uv=1.0)
    for name, o in objs.items():
        print(f"  {name}: {sum(len(p.vertices) - 2 for p in o.data.polygons)} tris")
    if not opts["only"]:
        os.makedirs(opts["out"], exist_ok=True)
        path = os.path.join(opts["out"], "facade.glb")
        L.export_glb(objs, path)
        print(f"FACADE: {L.tri_count(objs)} tris -> {path} ({os.path.getsize(path)} bytes)")
    if opts["preview"]:
        os.makedirs(opts["preview"], exist_ok=True)
        for name in names:
            for o in objs.values():
                o.hide_render = o.name != name
            L.preview({name: objs[name]}, os.path.join(opts["preview"], f"facade-{name}"), "facade", views=("three",), res=(600, 450))
        print("PREVIEW done")


main()
