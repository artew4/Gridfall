"""
82.0, Night Tokyo's street level (docs/TOKYO_PLAN.md, step 4). Base at Y = 0, centred on X/Z (three.js
axes); a pole's arm reaches out along +X.

  sigpole    a traffic signal pole: galvanised, an arm over the road with a horizontal three-lamp head
             (Japan's), the pedestrian signal (standing, walking), its push-button box, the street's
             blue name plate, backplates and visors
  mirror     a convex traffic mirror on its orange post (the alleys' blind corners)
  manhole    a cast-iron manhole lid: its rim, the city's pattern in relief (flush: 12 mm proud)
  grate      a kerb's drain grate: a cast frame and its slots (flush)
  tactile    a strip of yellow tactile paving: dome blocks for the crossing's edge (flush)

Roles: galv, dark, lampR, lampY, lampG, walkR, walkG, plate, orange, mirror, iron, tactile.

  Blender -b --factory-startup -P tools/blender/props_street.py -- [--out public/models/props] [--preview DIR] [--only a,b]
"""

import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import gunlib as L  # noqa: E402
from gunlib import box_raw, cut_many, cyl_raw, seg_raw, sphere_raw  # noqa: E402
from mathutils import Matrix  # noqa: E402

ROLES = ("galv", "dark", "lampR", "lampY", "lampG", "walkR", "walkG", "plate", "orange", "mirror", "iron", "tactile")
NODES = ("sigarm", "walk", "mirror", "manhole", "grate", "tactile")
L.PREVIEW["street"] = {
    "galv": ((0.55, 0.57, 0.58), 0.7, 0.45),
    "dark": ((0.04, 0.04, 0.045), 0.3, 0.6),
    "lampR": ((1.0, 0.1, 0.05), 0.0, 0.3),
    "lampY": ((1.0, 0.6, 0.05), 0.0, 0.3),
    "lampG": ((0.05, 0.9, 0.7), 0.0, 0.3),
    "walkR": ((1.0, 0.15, 0.1), 0.0, 0.3),
    "walkG": ((0.1, 0.9, 0.6), 0.0, 0.3),
    "plate": ((0.1, 0.25, 0.7), 0.0, 0.4),
    "orange": ((0.95, 0.4, 0.08), 0.0, 0.5),
    "mirror": ((0.8, 0.82, 0.85), 1.0, 0.05),
    "iron": ((0.15, 0.15, 0.16), 0.6, 0.5),
    "tactile": ((0.9, 0.75, 0.1), 0.0, 0.6),
}


def xform(ob, m):
    ob.data.transform(m)
    ob.data.update()
    return ob


def sigarm(g):
    """The signals on a mount (an existing pole's side or a building's corner: no pole of their own, no
    new collider): the clamp at X = 0, Y = 0 the arm's height; the arm out along +X over the road."""
    n = "sigarm"
    ARM = 3.2
    # The clamp plate, the arm and its brace (the brace's foot on the mount, 0.8 m down).
    g.box("galv", 0.06, 0.5, 0.26, 0.03, -0.1, 0, group=n, bev=0.01, seg=1)
    g.add(cyl_raw(0.06, ARM, ARM / 2, 0, 0, seg=10, axis="x"), "galv", n, bev=0)
    g.add(seg_raw((0.05, -0.8, 0), (1.3, -0.03, 0), 0.05, 0.05), "galv", n, bev=0)
    # The vehicle head: a long box, its backplate, three lamps under visors (blue-green, amber, red).
    hx, hy, hz = ARM - 0.7, -0.32, 0.0
    g.box("galv", 1.25, 0.42, 0.62, hx, hy, hz - 0.05, group=n, bev=0.02, seg=1)
    g.box("dark", 1.45, 0.56, 0.03, hx, hy, hz - 0.37, group=n, bev=0.01, seg=1)
    for i, role in enumerate(("lampG", "lampY", "lampR")):
        x = hx - 0.4 + i * 0.4
        g.add(cyl_raw(0.14, 0.03, x, hy, hz + 0.27, seg=20), role, n, bev=0)
        visor = cyl_raw(0.165, 0.2, x, hy, hz + 0.36, seg=16)
        cut_many(visor, [cyl_raw(0.15, 0.3, x, hy, hz + 0.36, seg=16), box_raw(0.4, 0.2, 0.4, x, hy - 0.12, hz + 0.36)])
        g.add(visor, "dark", n, bev=0)
    g.add(cyl_raw(0.03, 0.3, hx, hy + 0.36, hz - 0.05, seg=6, axis="y"), "galv", n, bev=0)
    # The street's name plate on the arm (both faces), its clamps.
    g.box("plate", 1.1, 0.32, 0.02, 1.7, 0.26, 0, group=n, bev=0.005, seg=1)
    for x in (1.3, 2.1):
        g.box("galv", 0.04, 0.12, 0.06, x, 0.12, 0, group=n, bev=0)


def walk(g):
    """The pedestrian signal on its bracket (facing +X: across the road, its back on the mount at X = 0,
    Y = 0 its foot: hung over head height), and the push button's box 1.8 m lower."""
    n = "walk"
    g.box("galv", 0.06, 0.4, 0.2, 0.03, 0.36, 0, group=n, bev=0)
    g.box("galv", 0.3, 0.72, 0.36, 0.2, 0.36, 0, group=n, bev=0.015, seg=1)
    g.box("walkR", 0.01, 0.26, 0.26, 0.355, 0.53, 0, group=n, bev=0)
    g.box("walkG", 0.01, 0.26, 0.26, 0.355, 0.19, 0, group=n, bev=0)
    for y in (0.53, 0.19):
        g.box("dark", 0.12, 0.04, 0.32, 0.41, y + 0.16, 0, group=n, bev=0)
    g.box("galv", 0.1, 0.24, 0.16, 0.05, -1.45, 0, group=n, bev=0.01, seg=1)
    g.add(cyl_raw(0.035, 0.02, 0.1, -1.48, 0, seg=10, axis="x"), "lampY", n, bev=0)


def mirror(g):
    """A convex traffic mirror on a wall bracket (the wall at Z = 0, Y = 0 the mirror's centre)."""
    n = "mirror"
    g.box("orange", 0.2, 0.3, 0.04, 0, 0, 0.02, group=n, bev=0.01, seg=1)
    g.add(cyl_raw(0.03, 0.42, 0, 0, 0.23, seg=8), "orange", n, bev=0)
    g.add(L.torus_raw(0.32, 0.03, 0, 0, 0.47, seg=24, ring=6), "orange", n, bev=0)
    m = sphere_raw(0.32, 0, 0, 0, seg=24, rings=12, sz=0.25)
    cut_many(m, [box_raw(1, 1, 0.5, 0, 0, -0.25)])
    xform(m, Matrix.Translation((0, 0, 0.47)))
    g.add(m, "mirror", n, bev=0)
    hood = cyl_raw(0.34, 0.08, 0, 0, 0.49, seg=24)
    cut_many(hood, [cyl_raw(0.31, 0.2, 0, 0, 0.49, seg=24), box_raw(0.8, 0.5, 0.3, 0, -0.2, 0.49)])
    g.add(hood, "orange", n, bev=0)


def manhole(g):
    n = "manhole"
    R = 0.32
    # The rim, the lid: a flower of raised ribs in rings (the cities' decorated lids), the pick holes.
    g.add(cyl_raw(R + 0.05, 0.012, 0, 0.006, 0, seg=32, axis="y"), "iron", n, bev=0)
    g.add(cyl_raw(R, 0.016, 0, 0.008, 0, seg=32, axis="y"), "iron", n, bev=0)
    for r in (0.12, 0.24):
        g.add(L.torus_raw(r, 0.008, 0, 0, 0, seg=20, ring=3), "iron", n, bev=0)
        xform(g.parts[-1][0], Matrix.Translation((0, 0.016, 0)) @ Matrix.Rotation(math.pi / 2, 4, "X"))
    for k in range(12):
        a = k / 12 * math.pi * 2
        g.add(seg_raw((math.cos(a) * 0.04, 0.017, math.sin(a) * 0.04), (math.cos(a) * 0.29, 0.017, math.sin(a) * 0.29), 0.016, 0.006), "iron", n, bev=0)
    for k in range(6):
        a = k / 6 * math.pi * 2 + 0.26
        g.add(sphere_raw(0.04, math.cos(a) * 0.18, 0.014, math.sin(a) * 0.18, seg=8, rings=4, sy=0.15), "iron", n, bev=0)


def grate(g):
    n = "grate"
    W, D = 0.45, 0.9
    g.box("iron", W + 0.06, 0.012, D + 0.06, 0, 0.006, 0, group=n, bev=0)
    for i in range(9):
        z = -D / 2 + 0.05 + i * (D - 0.1) / 8
        g.box("iron", W - 0.04, 0.016, 0.04, 0, 0.012, z, group=n, bev=0)
    for x in (-W / 2 + 0.02, W / 2 - 0.02):
        g.box("iron", 0.03, 0.016, D, x, 0.012, 0, group=n, bev=0)
    g.box("dark", W - 0.04, 0.004, D - 0.08, 0, 0.004, 0, group=n, bev=0)


def tactile(g):
    """Six 0.3 m blocks in a row (their domes are the game's texture: thousands of bumps nobody sees)."""
    n = "tactile"
    for b in range(6):
        g.box("tactile", 0.29, 0.01, 0.29, -0.75 + b * 0.3, 0.005, 0, group=n, bev=0.002, seg=1)


BUILDERS = {k: globals()[k] for k in NODES}


def main():
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    opts = {"out": "public/models/props", "preview": None, "only": None}
    for i in range(0, len(argv), 2):
        opts[argv[i].lstrip("-")] = argv[i + 1]
    names = opts["only"].split(",") if opts["only"] else list(NODES)
    L.reset(ROLES)
    g = L.Gun("props_street", groups=tuple(names))
    for name in names:
        BUILDERS[name](g)
    objs = g.finish(uv=1.0)
    for name, o in objs.items():
        print(f"  {name}: {sum(len(p.vertices) - 2 for p in o.data.polygons)} tris")
    if not opts["only"]:
        os.makedirs(opts["out"], exist_ok=True)
        path = os.path.join(opts["out"], "street.glb")
        L.export_glb(objs, path)
        print(f"STREET: {L.tri_count(objs)} tris -> {path} ({os.path.getsize(path)} bytes)")
    if opts["preview"]:
        os.makedirs(opts["preview"], exist_ok=True)
        for name in names:
            for o in objs.values():
                o.hide_render = o.name != name
            L.preview({name: objs[name]}, os.path.join(opts["preview"], f"street-{name}"), "street", views=("three",), res=(600, 450))
        print("PREVIEW done")


main()
