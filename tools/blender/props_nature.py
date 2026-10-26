"""
75.0, nature and ruin (docs/ENVIRONMENT_PLAN.md, step 8): the jungle's plants and trees, the Desert's
rocks. Base at Y = 0, centred on X/Z (three.js axes).

  bush       a broadleaf shrub (about 1.6 across): lumps of leaves with leaf tips breaking their outline
  fern       a fern (about 1.8 across): fronds arching out, each a spine with its leaflets
  bigleaf    an elephant-ear plant (about 2 across): big curved blades with their midribs on long stalks
  crown      a tree's crown (2 across, 1.3 tall, unit-sized: scaled to each tree): clumped leaf masses
  trunk      a giant's trunk (radius 1 at its foot, 1 tall: scaled to its height): bark ridges,
             swellings, tapering
  buttress   a giant's root flare (radius 1, 1 tall: scaled to its flare and height): seven plank
             roots winding out, the trunk's foot between them
  slim       a slim tree's trunk (radius 1 at its foot, 1 tall): rings, knots, a slight lean
  rock_a/b/c sandstone boulders (inside a radius 1 cylinder, 1 tall: never past their colliders):
             layered strata, cracks, a tilted top

The game colours the plants per instance (white leaf material) and paints the trunks and rocks in the
map's bark and rock. Roles: leaf, bark, rock.

  Blender -b --factory-startup -P tools/blender/props_nature.py -- [--out public/models/props] [--preview DIR] [--only a,b]
"""

import math
import os
import random
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import bmesh  # noqa: E402
import gunlib as L  # noqa: E402
from mathutils import Matrix, Vector, noise  # noqa: E402

ROLES = ("leaf", "bark", "rock")
NODES = ("bush", "fern", "bigleaf", "crown", "trunk", "buttress", "slim", "rock_a", "rock_b", "rock_c")
L.PREVIEW["nature"] = {
    "leaf": ((0.12, 0.3, 0.08), 0.0, 0.7),
    "bark": ((0.25, 0.18, 0.12), 0.0, 0.95),
    "rock": ((0.55, 0.38, 0.25), 0.0, 0.95),
}


def lump(r, x, y, z, seed, sy=0.7, sub=1, amp=0.25):
    """A lumpy, flat-shaded mass: an icosphere pushed in and out by noise."""
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=sub, radius=r)
    for v in bm.verts:
        n = noise.noise(v.co * (2.5 / r) + Vector((seed, seed * 1.7, seed * 0.3)))
        v.co *= 1 + amp * n
        v.co.y *= sy
        v.co += Vector((x, y, z))
    return L._link("lump", bm)


def strip(points, widths, side, up=Vector((0, 1, 0)), name="blade", fold=0.0):
    """A blade along `points`: `widths` each side across `side`; `fold` lifts its edges (a midrib's V)."""
    bm = bmesh.new()
    prev = None
    for p, w in zip(points, widths):
        row = (bm.verts.new(p + side * w + up * (fold * w)), bm.verts.new(p), bm.verts.new(p - side * w + up * (fold * w)))
        if prev:
            bm.faces.new((prev[0], prev[1], row[1], row[0]))
            bm.faces.new((prev[1], prev[2], row[2], row[1]))
        prev = row
    return L._link(name, bm)


# ------------------------------------------------------------------ plants
def bush(g):
    n = "bush"
    rnd = random.Random(11)
    # Ten small masses in a loose mound (a ring of six round a raised core), so its facets stay small.
    for k in range(10):
        a = k / 6 * math.pi * 2 + rnd.random() * 0.5
        d = 0.15 * rnd.random() if k >= 6 else 0.5 + rnd.random() * 0.15
        r = 0.3 + rnd.random() * 0.12
        y = 0.65 + rnd.random() * 0.2 if k >= 6 else 0.3 + rnd.random() * 0.15
        g.add(lump(r, math.cos(a) * d, y, math.sin(a) * d, k * 3.1, sy=0.75), "leaf", n, bev=0)
    # Leaf tips poking out of the masses (its outline breaks: not a ball).
    for k in range(22):
        a = rnd.random() * math.pi * 2
        y = 0.3 + rnd.random() * 0.7
        base = Vector((math.cos(a) * 0.45, y, math.sin(a) * 0.45))
        out = Vector((math.cos(a), 0.25 + rnd.random() * 0.4, math.sin(a))).normalized()
        side = out.cross(Vector((0, 1, 0))).normalized()
        g.add(strip([base, base + out * 0.22, base + out * 0.4], [0.07, 0.08, 0.0], side), "leaf", n, bev=0)


def fern(g):
    """Fronds arching out: each one strip down its spine whose width alternates leaflet / notch (a
    serrated outline at about 24 triangles a frond: the jungle has thousands of these)."""
    n = "fern"
    rnd = random.Random(5)
    for k in range(7):
        a = k / 7 * math.pi * 2 + rnd.random() * 0.3
        d = Vector((math.cos(a), 0, math.sin(a)))
        side = Vector((-d.z, 0, d.x))
        LEN = 0.75 + rnd.random() * 0.25
        lift = 0.55 + rnd.random() * 0.3
        us = [i / 12 for i in range(13)]
        spine = [d * (LEN * u) + Vector((0, lift * math.sin(u * 2.4) * (1 - u * 0.3), 0)) for u in us]
        ws = [(0.17 * math.sin(math.pi * u) + 0.02) * (1.0 if i % 2 else 0.35) for i, u in enumerate(us)]
        ws[0] = 0.015
        ws[-1] = 0.0
        g.add(strip(spine, ws, side, fold=-0.15), "leaf", n, bev=0)


def bigleaf(g):
    n = "bigleaf"
    rnd = random.Random(7)
    for k in range(6):
        a = k / 6 * math.pi * 2 + rnd.random() * 0.4
        d = Vector((math.cos(a), 0, math.sin(a)))
        side = Vector((-d.z, 0, d.x))
        h = 0.6 + rnd.random() * 0.5
        stalk_top = d * 0.25 + Vector((0, h, 0))
        g.add(L.tube_between((0, 0, 0), stalk_top, 0.025, 0.018, seg=5), "leaf", n, bev=0)
        pts = [stalk_top + d * (0.9 * u) + Vector((0, 0.12 * math.sin(u * math.pi) - 0.3 * u * u, 0)) for u in [i / 7 for i in range(8)]]
        ws = [0.38 * math.sin(math.pi * (0.15 + 0.85 * u)) * (1.05 - u * 0.3) for u in [i / 7 for i in range(8)]]
        ws[-1] = 0.0
        g.add(strip(pts, ws, side, fold=0.25), "leaf", n, bev=0)


def crown(g):
    n = "crown"
    rnd = random.Random(3)
    for k in range(9):
        a = rnd.random() * math.pi * 2
        d = rnd.random() * 0.55
        g.add(lump(0.42 + rnd.random() * 0.2, math.cos(a) * d, 0.35 + rnd.random() * 0.45, math.sin(a) * d, k * 1.9, sy=0.65, amp=0.3), "leaf", n, bev=0)


# ------------------------------------------------------------------ trunks
def column(n, radius_at, rings, seg, height=1.0, ridge=0.0, ridges=10, lean=0.0, role="bark", seed=0.0):
    """A trunk as stacked rings: `radius_at(t)` (t 0..1 up it), vertical bark ridges, a lean in X."""
    bm = bmesh.new()
    rows = []
    for i in range(rings + 1):
        t = i / rings
        row = []
        for j in range(seg):
            a = j / seg * math.pi * 2
            r = radius_at(t) * (1 + ridge * (0.5 + 0.5 * math.cos(a * ridges)) + 0.05 * noise.noise(Vector((a * 2, t * 6, seed))))
            row.append(bm.verts.new((math.cos(a) * r + lean * t * t, t * height, math.sin(a) * r)))
        rows.append(row)
    for i in range(rings):
        for j in range(seg):
            bm.faces.new((rows[i][j], rows[i][(j + 1) % seg], rows[i + 1][(j + 1) % seg], rows[i + 1][j]))
    top = bm.verts.new((lean, height, 0))
    for j in range(seg):
        bm.faces.new((rows[-1][j], rows[-1][(j + 1) % seg], top))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return L._link(n, bm)


def trunk(g):
    g.add(column("trunk", lambda t: 1.0 - 0.38 * t + 0.015 * math.sin(t * 9), 14, 16, ridge=0.08, ridges=9, seed=1.0), "bark", "trunk", bev=0)


def buttress(g):
    n = "buttress"
    # The trunk's foot (radius 0.5 of the flare), the plank roots winding out to the flare's edge.
    g.add(column("foot", lambda t: 0.52 - 0.04 * t, 4, 14, ridge=0.04, ridges=7, seed=2.0), "bark", n, bev=0)
    rnd = random.Random(2)
    for k in range(7):
        a = k / 7 * math.pi * 2 + rnd.random() * 0.3
        bend = (rnd.random() - 0.5) * 0.5
        pts = []
        for i in range(7):
            u = i / 6
            r = 0.45 + 0.53 * u
            ang = a + bend * u
            pts.append((r, ang, 1.0 - 0.92 * u ** 0.8))
        bm = bmesh.new()
        prev = None
        for r, ang, h in pts:
            d = Vector((math.cos(ang), 0, math.sin(ang)))
            side = Vector((-d.z, 0, d.x)) * (0.035 + 0.05 * (1.0 - u))
            row = [bm.verts.new(d * r + side), bm.verts.new(d * r - side), bm.verts.new(d * r - side + Vector((0, h, 0))), bm.verts.new(d * r + side + Vector((0, h, 0)))]
            if prev:
                for q in range(4):
                    bm.faces.new((prev[q], prev[(q + 1) % 4], row[(q + 1) % 4], row[q]))
            prev = row
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        g.add(L._link("root", bm), "bark", n, bev=0)


def slim(g):
    g.add(column("slim", lambda t: 1.0 - 0.32 * t + 0.04 * max(0.0, math.sin(t * 23)) ** 8, 12, 10, ridge=0.02, ridges=5, lean=0.04, seed=3.0), "bark", "slim", bev=0)


# ------------------------------------------------------------------ rocks
def rock(g, n, seed):
    """A sandstone boulder: strata stacked up it (each a ledge in from the one under it, bulging a little
    at its middle), a few vertical cracks, a tilted top; every vertex inside the radius 1 cylinder and
    the 0..1 height (its collider)."""
    rnd = random.Random(seed)
    seg, rings = 18, 15
    layers = 3 + seed % 2
    tilt = (rnd.uniform(-0.18, 0.18), rnd.uniform(-0.18, 0.18))
    cracks = [rnd.random() * math.pi * 2 for _ in range(3)]
    base = [0.9 + 0.08 * noise.noise(Vector((math.cos(j / seg * 6.283) * 1.3, math.sin(j / seg * 6.283) * 1.3, seed))) for j in range(seg)]
    bm = bmesh.new()
    rows = []
    for i in range(rings + 1):
        t = i / rings
        layer = min(int(t * layers), layers - 1)
        f = t * layers - layer
        row = []
        for j in range(seg):
            a = j / seg * math.pi * 2
            ledge = 0.05 + 0.05 * noise.noise(Vector((math.cos(a) * 1.5, layer * 2.3 + seed, math.sin(a) * 1.5)))
            r = base[j] * (1.0 - ledge * layer - 0.02 * (2 * f - 1) ** 2 - 0.1 * t * t)
            r *= 1 + 0.09 * noise.noise(Vector((math.cos(a) * 2.5, t * 2 + seed, math.sin(a) * 2.5)))
            for c in cracks:
                d = abs((a - c + math.pi) % (2 * math.pi) - math.pi)
                r -= 0.08 * max(0.0, 1 - d * 6)
            r = min(r, 0.98)
            y = t * (1.0 - 0.18 - tilt[0] * math.cos(a) - tilt[1] * math.sin(a)) if i == rings else t * 0.82
            row.append(bm.verts.new((math.cos(a) * r, max(0.0, min(1.0, y)), math.sin(a) * r)))
        rows.append(row)
    for i in range(rings):
        for j in range(seg):
            bm.faces.new((rows[i][j], rows[i][(j + 1) % seg], rows[i + 1][(j + 1) % seg], rows[i + 1][j]))
    # The top: a weathered cap, slightly domed, below the 1.0 line.
    cap = [bm.verts.new((v.co.x * 0.55, min(1.0, v.co.y + 0.06), v.co.z * 0.55)) for v in rows[-1]]
    for j in range(seg):
        bm.faces.new((rows[-1][j], rows[-1][(j + 1) % seg], cap[(j + 1) % seg], cap[j]))
    mid = bm.verts.new((0, min(1.0, sum(v.co.y for v in cap) / seg + 0.03), 0))
    for j in range(seg):
        bm.faces.new((cap[j], cap[(j + 1) % seg], mid))
    bm.faces.new(list(reversed(rows[0])))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    g.add(L._link(n, bm), "rock", n, bev=0)


BUILDERS = {
    "bush": bush, "fern": fern, "bigleaf": bigleaf, "crown": crown, "trunk": trunk, "buttress": buttress, "slim": slim,
    "rock_a": lambda g: rock(g, "rock_a", 1), "rock_b": lambda g: rock(g, "rock_b", 2), "rock_c": lambda g: rock(g, "rock_c", 3),
}


def main():
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    opts = {"out": "public/models/props", "preview": None, "only": None}
    for i in range(0, len(argv), 2):
        opts[argv[i].lstrip("-")] = argv[i + 1]
    names = opts["only"].split(",") if opts["only"] else list(NODES)
    L.reset(ROLES)
    g = L.Gun("props_nature", groups=tuple(names))
    for name in names:
        BUILDERS[name](g)
    objs = g.finish(uv=1.0)
    for name, o in objs.items():
        print(f"  {name}: {sum(len(p.vertices) - 2 for p in o.data.polygons)} tris")
    if not opts["only"]:
        os.makedirs(opts["out"], exist_ok=True)
        path = os.path.join(opts["out"], "nature.glb")
        L.export_glb(objs, path)
        print(f"NATURE: {L.tri_count(objs)} tris -> {path} ({os.path.getsize(path)} bytes)")
    if opts["preview"]:
        os.makedirs(opts["preview"], exist_ok=True)
        for name in names:
            for o in objs.values():
                o.hide_render = o.name != name
            L.preview({name: objs[name]}, os.path.join(opts["preview"], f"nature-{name}"), "nature", views=("three",), res=(600, 450))
        print("PREVIEW done")


main()
