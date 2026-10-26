"""
68.0, the military cover kit (docs/ENVIRONMENT_PLAN.md, step 1): the props the Desert's boxes become.

Each prop is a node, modelled at its real size, centred on X/Z with its base at Y = 0 (three.js axes:
+Y up). The game (src/world/Dress.ts) fits them to the map's boxes: a crate or a case stretched to its
box, HESCO cells tiled along a run, sandbags laid in courses, drums where the barrels stood.

  bag    a sandbag (0.5 x 0.13 x 0.27): a filled pillow, its folded, tied end
  hesco  a HESCO cell (1 x 1 x 1): the bulging liner, the wire frame's posts and rim
  crate  a wooden supply crate (1.0 x 0.6 x 0.6): boards, edge battens, cross battens, iron corners,
         rope handles, a panel each side for the stencil (role `label`: the map's crate texture)
  case   a hard equipment case (1.0 x 0.42 x 0.5): the shell, the lid's seam, ribs, latches, a handle
  drum   an oil drum (0.58 x 0.88): rolling hoops, chimes, the lid and its bungs

Roles: wood, metal, rope, label, plastic, paint, canvas, liner, wire.

  Blender -b --factory-startup -P tools/blender/props_military.py -- [--out public/models/props] [--preview DIR]
"""

import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import bmesh  # noqa: E402
import bpy  # noqa: E402
import gunlib as L  # noqa: E402
from gunlib import box_raw, cut, cut_many, cyl_raw, prism_raw, seg_raw  # noqa: E402
from mathutils import Matrix, Vector  # noqa: E402

ROLES = ("wood", "metal", "rope", "label", "plastic", "paint", "canvas", "liner", "wire")
NODES = ("bag", "hesco", "crate", "case", "drum")
L.PREVIEW["props"] = {
    "wood": ((0.36, 0.25, 0.14), 0.0, 0.85),
    "metal": ((0.1, 0.1, 0.095), 0.7, 0.5),
    "rope": ((0.3, 0.24, 0.15), 0.0, 0.95),
    "label": ((0.24, 0.27, 0.15), 0.0, 0.85),
    "plastic": ((0.09, 0.1, 0.075), 0.1, 0.55),
    "paint": ((0.16, 0.2, 0.1), 0.3, 0.6),
    "canvas": ((0.45, 0.38, 0.25), 0.0, 0.95),
    "liner": ((0.5, 0.42, 0.3), 0.0, 0.95),
    "wire": ((0.12, 0.12, 0.12), 0.7, 0.5),
}


def blob(w, h, d, cuts, shape, name="blob"):
    """A subdivided box (w x h x d, base at y = 0) whose vertices `shape(x, y, z)` moves (unit coordinates -1..1, 0..1)."""
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.subdivide_edges(bm, edges=bm.edges[:], cuts=cuts, use_grid_fill=True)
    for v in bm.verts:
        x, y, z = v.co.x * 2, v.co.y + 0.5, v.co.z * 2
        nx, ny, nz = shape(x, y, z)
        v.co = Vector((nx * w / 2, ny * h, nz * d / 2))
    return L._link(name, bm)


# ------------------------------------------------------------------ the props
def bag(g):
    def shape(x, y, z):
        # A filled sack: a rounded slab, its long edges and ends softened, flat where it lies.
        v = 2 * y - 1
        yy = 0.5 + (y - 0.5) * (1 - 0.4 * z * z) * (1 - 0.25 * x ** 4)
        zz = z * (1 - 0.14 * v * v)
        xx = x * (1 - 0.1 * v * v) * (1 - 0.06 * z * z)
        return xx, max(0.0, yy), zz

    # (Low: a wall is hundreds of them; the smooth shading rounds them.)
    g.add(blob(0.5, 0.13, 0.27, 1, shape), "canvas", "bag", bev=0)


def hesco(g):
    def shape(x, y, z):
        # The liner bulges out between the frame's posts, most at mid-height, the top settled.
        b = 0.03 * (1 - (2 * y - 1) ** 2)
        kx = 1 + b * (1 - z * z) * (abs(x) > 0.99)
        kz = 1 + b * (1 - x * x) * (abs(z) > 0.99)
        top = y if y < 0.999 else 0.975
        return x * kx, top, z * kz

    g.add(blob(0.97, 1.0, 0.97, 4, shape), "liner", "hesco", bev=0)
    # The wire frame: corner posts, mid posts, the top and bottom rims.
    for sx in (-1, 1):
        for sz in (-1, 1):
            g.box("wire", 0.018, 1.0, 0.018, sx * 0.49, 0.5, sz * 0.49, group="hesco", bev=0)
    for y in (0.012, 0.99):
        for s in (-1, 1):
            g.box("wire", 1.0, 0.014, 0.014, 0, y, s * 0.495, group="hesco", bev=0)
            g.box("wire", 0.014, 0.014, 1.0, s * 0.495, y, 0, group="hesco", bev=0)


def crate(g):
    n = "crate"
    W, H, D = 1.0, 0.6, 0.6
    g.box("wood", W - 0.04, H - 0.04, D - 0.04, 0, H / 2, 0, group=n, bev=0.004, seg=1)
    # Edge battens round every face (boards 7 cm wide, 2 cm proud), cross battens on the long sides.
    t, e = 0.07, 0.022
    for sy in (0, 1):
        y = e / 2 + sy * (H - e)
        for sz in (-1, 1):
            g.box("wood", W, e, t, 0, y, sz * (D / 2 - t / 2), group=n, bev=0.003, seg=1)
        for sx in (-1, 1):
            g.box("wood", t, e, D - 2 * t, sx * (W / 2 - t / 2), y, 0, group=n, bev=0.003, seg=1)
    for sx in (-1, 1):
        for sz in (-1, 1):
            g.box("wood", t, H - 2 * e, e, sx * (W / 2 - t / 2), H / 2, sz * (D / 2 - e / 2), group=n, bev=0.003, seg=1)
            g.box("wood", e, H - 2 * e, t, sx * (W / 2 - e / 2), H / 2, sz * (D / 2 - t / 2), group=n, bev=0.003, seg=1)
        # A diagonal brace across each end.
        g.add(seg_raw((sx * (W / 2 - e / 2), e + 0.02, -D / 2 + t), (sx * (W / 2 - e / 2), H - e - 0.02, D / 2 - t), e, 0.06, up=(1, 0, 0)), "wood", n, bev=0.003, seg=1)
    # The stencil panels (the map's crate texture), iron corners, rope handles on the ends.
    for sz in (-1, 1):
        g.box("label", 0.58, 0.36, 0.004, 0, H / 2, sz * (D / 2 - 0.018), group=n, bev=0)
    for sx in (-1, 1):
        for sy in (0, 1):
            for sz in (-1, 1):
                g.box("metal", 0.05, 0.05, 0.05, sx * (W / 2 - 0.022), 0.022 + sy * (H - 0.044), sz * (D / 2 - 0.022), group=n, bev=0.004, seg=1)
        g.add(L.torus_raw(0.055, 0.009, 0, 0, 0, seg=14, ring=6), "rope", n, bev=0)
        rope = g.parts[-1][0]
        rope.data.transform(Matrix.Translation((sx * (W / 2 + 0.006), H * 0.62, 0)) @ Matrix.Rotation(math.pi / 2, 4, "Y") @ Matrix.Diagonal((1, 0.6, 1, 1)))


def case(g):
    n = "case"
    W, H, D = 1.0, 0.42, 0.5
    shell = box_raw(W, H, D, 0, H / 2, 0)
    seam = []
    for s in (-1, 1):
        seam.append(box_raw(W + 0.02, 0.008, 0.006, 0, H * 0.62, s * D / 2))
        seam.append(box_raw(0.006, 0.008, D + 0.02, s * W / 2, H * 0.62, 0))
    cut_many(shell, seam)
    g.add(shell, "plastic", n, bev=0.03, seg=3)
    # Ribs on the lid, feet under the corners.
    for x in (-0.3, -0.1, 0.1, 0.3):
        g.box("plastic", 0.05, 0.02, D - 0.08, x, H + 0.006, 0, group=n, bev=0.006, seg=1)
    for sx in (-1, 1):
        for sz in (-1, 1):
            g.box("plastic", 0.08, 0.025, 0.08, sx * (W / 2 - 0.07), 0.006, sz * (D / 2 - 0.07), group=n, bev=0.006, seg=1)
    # Latches and the handle on the front; a pressure valve.
    for x in (-0.3, 0.3):
        g.box("metal", 0.07, 0.07, 0.022, x, H * 0.6, D / 2 + 0.008, group=n, bev=0.004, seg=1)
    g.add(seg_raw((-0.12, H * 0.82, D / 2 + 0.02), (0.12, H * 0.82, D / 2 + 0.02), 0.028, 0.022, up=(0, 1, 0)), "plastic", n, bev=0.006, seg=1)
    for x in (-0.13, 0.13):
        g.box("plastic", 0.03, 0.04, 0.025, x, H * 0.78, D / 2 + 0.01, group=n, bev=0.004, seg=1)
    g.cyl("metal", 0.02, 0.012, 0.4, H * 0.75, D / 2 + 0.004, seg=12, group=n)


def drum(g):
    n = "drum"
    R, H = 0.29, 0.88
    g.add(cyl_raw(R, H, 0, H / 2, 0, seg=24, axis="y"), "paint", n, bev=0.006, seg=2)
    for y in (H * 0.33, H * 0.66):
        g.add(L.torus_raw(R + 0.002, 0.011, 0, 0, 0, seg=24, ring=6), "paint", n, bev=0)
        g.parts[-1][0].data.transform(Matrix.Translation((0, y, 0)) @ Matrix.Rotation(math.pi / 2, 4, "X"))
    for y in (0.012, H - 0.012):
        g.add(L.torus_raw(R - 0.006, 0.013, 0, 0, 0, seg=24, ring=6), "metal", n, bev=0)
        g.parts[-1][0].data.transform(Matrix.Translation((0, y, 0)) @ Matrix.Rotation(math.pi / 2, 4, "X"))
    g.add(cyl_raw(R - 0.02, 0.006, 0, H - 0.008, 0, seg=24, axis="y"), "metal", n, bev=0)
    g.add(cyl_raw(0.03, 0.016, 0.16, H, 0.05, seg=12, axis="y"), "metal", n, bev=0.003, seg=1)
    g.add(cyl_raw(0.02, 0.016, -0.17, H, -0.06, seg=10, axis="y"), "metal", n, bev=0.003, seg=1)


def build():
    L.reset(ROLES)
    g = L.Gun("props_military", groups=NODES)
    bag(g)
    hesco(g)
    crate(g)
    case(g)
    drum(g)
    return g


def main():
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    opts = {"out": "public/models/props", "preview": None}
    for i in range(0, len(argv), 2):
        opts[argv[i].lstrip("-")] = argv[i + 1]
    g = build()
    objs = g.finish(uv=1.0)
    os.makedirs(opts["out"], exist_ok=True)
    path = os.path.join(opts["out"], "military.glb")
    L.export_glb(objs, path)
    for name, o in objs.items():
        print(f"  {name}: {sum(len(p.vertices) - 2 for p in o.data.polygons)} tris")
    print(f"PROPS: {L.tri_count(objs)} tris -> {path} ({os.path.getsize(path)} bytes)")
    if opts["preview"]:
        os.makedirs(opts["preview"], exist_ok=True)
        # Laid out in a row for the stills.
        x = -2.6
        for name in NODES:
            objs[name].data.transform(Matrix.Translation((x, 0, 0)))
            x += 1.3
        L.preview(objs, os.path.join(opts["preview"], "military"), "props", views=("three", "front", "top"), res=(1500, 700))
        print("PREVIEW done")


main()
