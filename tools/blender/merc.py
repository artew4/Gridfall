"""
67.0: the TDM operator (the cyber-merc both teams wear), modelled in Blender for its rig.

One node per pivot of the merc rig (src/entities/enemies/operators.ts), its geometry in that pivot's
own space (three.js axes: +Y up, the body faces +Z, the left side is +X), so the animation, the IK
and the hitboxes are the rig's as before:

  body (pelvis, 1.0 m up)  torso (at the pelvis)  head (0, 0.72, 0.02 on the torso)
  armL/armR (+-0.19, 0.57, 0.03 on the torso)  foreL/foreR (0, -0.32)  handL/handR (0, -0.37)
  legL/legR (+-0.11, -0.02 on the pelvis)  kneeL/kneeR (0, -0.46)

Materials are the rig's layers: armor, cloth, team (the kit's team colour blocks), webbing, boots
(vertex colours by the kit and the team in the game), glow (the team accents), visor.

  Blender -b --factory-startup -P tools/blender/merc.py -- [--out public/models] [--preview DIR]
"""

import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import bpy  # noqa: E402
import gunlib as L  # noqa: E402
from gunlib import box_raw, cut, cut_many, cyl_raw, front_raw, prism_raw, seg_raw, sphere_raw, tube_between  # noqa: E402
from mathutils import Matrix, Vector  # noqa: E402

LAYERS = ("armor", "cloth", "team", "webbing", "boots", "glow", "visor")
PIVOTS = ("body", "torso", "head", "armL", "armR", "foreL", "foreR", "handL", "handR", "legL", "legR", "kneeL", "kneeR")
# Where each pivot sits in the body (for the previews: the rig in its rest pose).
REST = {
    "body": ((0, 1.0, 0), None),
    "torso": ((0, 0, 0), "body"),
    "head": ((0, 0.72, 0.02), "torso"),
    "armL": ((0.19, 0.57, 0.03), "torso"),
    "armR": ((-0.19, 0.57, 0.03), "torso"),
    "foreL": ((0, -0.32, 0), "armL"),
    "foreR": ((0, -0.32, 0), "armR"),
    "handL": ((0, -0.37, 0), "foreL"),
    "handR": ((0, -0.37, 0), "foreR"),
    "legL": ((0.11, -0.02, 0), "body"),
    "legR": ((-0.11, -0.02, 0), "body"),
    "kneeL": ((0, -0.46, 0), "legL"),
    "kneeR": ((0, -0.46, 0), "legR"),
}
PREVIEW_COL = {
    "armor": ((0.035, 0.038, 0.045), 0.06, 0.85),
    "cloth": ((0.012, 0.012, 0.015), 0.0, 0.9),
    "team": ((0.016, 0.045, 0.085), 0.0, 0.85),
    "webbing": ((0.018, 0.02, 0.024), 0.0, 0.9),
    "boots": ((0.007, 0.007, 0.009), 0.0, 0.8),
    "glow": ((0.2, 0.9, 2.0), 0.0, 0.5),
    "visor": ((0.003, 0.003, 0.004), 0.2, 0.25),
}


def hexa(w, h, c, cx=0.0, cy=0.0):
    """A w x h section with its four corners cut by c (an octagon) as (x, y) pairs."""
    return L.octagon(w, h, c, cx, cy)


# ------------------------------------------------------------------ pivots
def pelvis(g):
    n = "body"
    g.add(front_raw(hexa(0.33, 0.17, 0.05, 0, 0.02), -0.12, 0.12), "cloth", n, bev=0.01, seg=2)
    # The belt with its buckle, pouches and a drop holster's strap; the groin plate.
    g.add(front_raw(hexa(0.37, 0.055, 0.015, 0, 0.1), -0.135, 0.135), "webbing", n, bev=0.004, seg=1)
    g.box("armor", 0.06, 0.04, 0.012, 0, 0.1, 0.138, bev=0.004, seg=1, group=n)
    g.add(prism_raw([(0.12, 0.07), (0.135, 0.04), (0.13, -0.06), (0.11, -0.085)], -0.065, 0.065), "armor", n, bev=0.006, seg=1)
    for sx in (-1, 1):
        g.box("webbing", 0.07, 0.085, 0.07, sx * 0.17, 0.045, 0.05, bev=0.008, seg=1, group=n)
        g.box("webbing", 0.06, 0.02, 0.072, sx * 0.17, 0.09, 0.05, bev=0.004, seg=1, group=n)
    g.box("webbing", 0.11, 0.07, 0.06, 0, 0.06, -0.145, bev=0.008, seg=1, group=n)


def torso(g):
    n = "torso"
    # The body under the armour: an abdomen and a chest widening to the shoulders.
    g.add(front_raw(hexa(0.29, 0.24, 0.06, 0, 0.14), -0.105, 0.105), "cloth", n, bev=0.01, seg=2)
    chest = prism_raw([(0.13, 0.25), (0.145, 0.42), (0.125, 0.56), (0.05, 0.62), (-0.08, 0.62), (-0.125, 0.56), (-0.13, 0.25)], -0.2, 0.2)
    g.add(chest, "cloth", n, bev=0.02, seg=2)
    # The plate carrier: the front plate (angled out at the top, its corners cut), the back plate.
    front = front_raw([(-0.165, 0.27), (0.165, 0.27), (0.18, 0.43), (0.12, 0.575), (-0.12, 0.575), (-0.18, 0.43)], 0.13, 0.19)
    front.data.transform(Matrix.Translation((0, 0.42, 0.16)) @ Matrix.Rotation(-0.06, 4, "X") @ Matrix.Translation((0, -0.42, -0.16)))
    g.add(front, "armor", n, bev=0.008, seg=2)
    back = front_raw([(-0.17, 0.26), (0.17, 0.26), (0.19, 0.44), (0.13, 0.58), (-0.13, 0.58), (-0.19, 0.44)], -0.205, -0.15)
    g.add(back, "armor", n, bev=0.008, seg=2)
    # Cummerbund round the sides, shoulder straps over the top.
    for sx in (-1, 1):
        g.box("webbing", 0.05, 0.16, 0.3, sx * 0.165, 0.34, -0.005, bev=0.008, seg=1, group=n)
        g.add(seg_raw((sx * 0.12, 0.575, 0.16), (sx * 0.13, 0.6, -0.17), 0.07, 0.025, up=(0, 1, 0)), "webbing", n, bev=0.006, seg=1)
    # MOLLE webbing across the plate above the pouches.
    for y in (0.43, 0.47, 0.51):
        g.box("webbing", 0.26, 0.016, 0.012, 0, y, 0.19 + (y - 0.42) * -0.06, bev=0.002, seg=1, group=n)
    # The chest rig in the team's colour: a band and three magazine pouches with flaps.
    g.box("team", 0.36, 0.1, 0.04, 0, 0.3, 0.205, bev=0.008, seg=2, group=n)
    for x in (-0.105, 0, 0.105):
        g.box("team", 0.085, 0.12, 0.05, x, 0.31, 0.24, bev=0.008, seg=2, group=n)
        g.box("webbing", 0.088, 0.03, 0.055, x, 0.37, 0.243, bev=0.005, seg=1, group=n)
    # A radio on the left strap, its antenna; the collar.
    g.box("webbing", 0.05, 0.08, 0.035, 0.1, 0.48, 0.2, bev=0.006, seg=1, group=n)
    g.cyl("webbing", 0.004, 0.16, 0.115, 0.6, 0.2, axis="y", seg=6, group=n)
    g.add(front_raw(hexa(0.3, 0.07, 0.025, 0, 0.6), -0.11, 0.12), "armor", n, bev=0.01, seg=2)
    # The pack on the back plate and the spine accents below it.
    g.box("webbing", 0.24, 0.24, 0.1, 0, 0.42, -0.255, bev=0.015, seg=2, group=n)
    g.box("webbing", 0.2, 0.05, 0.1, 0, 0.29, -0.26, bev=0.008, seg=1, group=n)
    for y in (0.53, 0.42, 0.31):
        g.box("glow", 0.055, 0.075, 0.012, 0, y, -0.307, bev=0.002, seg=1, group=n)


def head(g):
    n = "head"
    g.add(tube_between((0, -0.09, 0), (0, 0.03, 0.005), 0.065, 0.06, seg=10), "cloth", n, bev=0.006, seg=1)
    g.add(sphere_raw(0.1, 0, 0.09, 0.0, seg=14, rings=10, sx=0.92, sy=1.0, sz=1.0), "cloth", n, bev=0)
    # The helmet (team colour): a cut shell over the head, ear guards, a rail each side.
    shell = front_raw([(-0.135, 0.12), (-0.13, 0.205), (-0.09, 0.262), (0.09, 0.262), (0.13, 0.205), (0.135, 0.12)], -0.15, 0.13)
    shell.data.transform(Matrix.Translation((0, 0, -0.005)))
    cut(shell, box_raw(0.3, 0.07, 0.08, 0, 0.12, 0.13, rx=-0.5))
    g.add(shell, "team", n, bev=0.012, seg=2)
    for sx in (-1, 1):
        g.add(prism_raw([(0.05, 0.15), (0.07, 0.07), (0.03, 0.02), (-0.06, 0.03), (-0.08, 0.1), (-0.06, 0.15)], sx * 0.12, sx * 0.152), "armor", n, bev=0.006, seg=1)
        g.cyl("webbing", 0.022, 0.012, sx * 0.157, 0.09, -0.005, axis="x", seg=10, group=n)
        g.box("webbing", 0.012, 0.016, 0.1, sx * 0.137, 0.175, -0.01, bev=0.002, seg=1, group=n)
    # The visor wrapping round the front, its strip (the eyes: the target), the respirator and filters.
    vis = front_raw([(-0.12, 0.095), (0.12, 0.095), (0.125, 0.15), (-0.125, 0.15)], 0.05, 0.135)
    cut(vis, sphere_raw(0.105, 0, 0.12, 0.0, seg=16, rings=10, sx=1.1, sy=1, sz=1.15))
    vis.data.transform(Matrix.Translation((0, 0.12, 0.09)) @ Matrix.Rotation(-0.12, 4, "X") @ Matrix.Translation((0, -0.12, -0.09)))
    g.add(vis, "visor", n, bev=0.006, seg=2)
    g.box("glow", 0.2, 0.024, 0.012, 0, 0.125, 0.142, bev=0.002, seg=1, group=n)
    g.add(prism_raw([(0.06, 0.07), (0.12, 0.06), (0.135, 0.02), (0.12, -0.02), (0.06, -0.03)], -0.065, 0.065), "armor", n, bev=0.008, seg=2)
    for sx in (-1, 1):
        g.add(tube_between((sx * 0.05, 0.015, 0.11), (sx * 0.085, 0.0, 0.14), 0.022, 0.022, seg=10), "webbing", n, bev=0.003, seg=1)


def arm(g, side, sx):
    a, f, h = f"arm{side}", f"fore{side}", f"hand{side}"
    # Upper arm: the sleeve from the shoulder ball to the elbow; the shoulder pad (team) and its patch.
    g.add(sphere_raw(0.062, 0, -0.01, 0, seg=12, rings=8), "cloth", a, bev=0)
    g.add(tube_between((0, -0.02, 0), (0, -0.3, 0), 0.058, 0.047, seg=10), "cloth", a, bev=0.004, seg=1)
    pad = front_raw([(-0.11, -0.02), (0.11, -0.02), (0.1, 0.035), (0.05, 0.07), (-0.05, 0.07), (-0.1, 0.035)], -0.095, 0.095)
    pad.data.transform(Matrix.Translation((sx * 0.03, 0.01, 0)) @ Matrix.Rotation(sx * -0.35, 4, "Z") @ Matrix.Diagonal((0.9, 1, 1, 1)))
    g.add(pad, "team", a, bev=0.008, seg=2)
    g.add(box_raw(0.012, 0.07, 0.12, sx * 0.118, -0.02, 0, rz=sx * -0.35), "glow", a, bev=0.002, seg=1)
    g.add(seg_raw((sx * 0.04, -0.12, 0.0), (sx * 0.045, -0.22, 0.0), 0.06, 0.015, up=(sx, 0, 0)), "webbing", a, bev=0.004, seg=1)
    # Forearm: the elbow, the sleeve, a bracer with its display.
    g.add(sphere_raw(0.05, 0, 0.0, 0, seg=10, rings=8), "cloth", f, bev=0)
    g.add(sphere_raw(0.04, 0, -0.005, -0.04, seg=10, rings=6, sx=1.2, sy=1.2, sz=0.6), "armor", f, bev=0)
    g.add(tube_between((0, -0.02, 0), (0, -0.34, 0), 0.047, 0.038, seg=10), "cloth", f, bev=0.004, seg=1)
    g.add(tube_between((0, -0.13, 0), (0, -0.29, 0), 0.052, 0.045, seg=8), "armor", f, bev=0.006, seg=1)
    # The gloved hand: the back of the hand, four curled fingers, the knuckle guard, the thumb, the cuff.
    g.add(seg_raw((0, 0.025, 0.0), (sx * 0.004, -0.06, 0.0), 0.05, 0.068, up=(0, 0, 1), w1=0.052, h1=0.072), "boots", h, bev=0.012, seg=2)
    for i, z in enumerate((0.027, 0.009, -0.009, -0.026)):
        k = 0.92 if i == 3 else 1.0
        g.add(seg_raw((sx * 0.004, -0.06, z), (sx * -0.016, -0.085 * k, z), 0.018, 0.019 * k, up=(0, 0, 1)), "boots", h, bev=0.006, seg=2)
        g.add(seg_raw((sx * -0.016, -0.085 * k, z), (sx * -0.03, -0.06, z), 0.017, 0.018 * k, up=(0, 0, 1)), "boots", h, bev=0.006, seg=2)
    g.add(seg_raw((sx * 0.026, -0.052, 0.035), (sx * 0.026, -0.052, -0.035), 0.012, 0.016, up=(1, 0, 0)), "armor", h, bev=0.003, seg=1)
    g.add(seg_raw((sx * -0.012, -0.005, 0.03), (sx * -0.03, -0.045, 0.038), 0.02, 0.022, up=(0, 0, 1)), "boots", h, bev=0.007, seg=2)
    g.add(tube_between((0, 0.035, 0), (0, -0.0, 0), 0.04, 0.038, seg=10), "boots", h, bev=0.004, seg=1)

def leg(g, side, sx):
    lg, kn = f"leg{side}", f"knee{side}"
    # Thigh: the hip ball, the trouser leg, a thigh plate, a pouch on the outside.
    g.add(sphere_raw(0.085, 0, -0.03, 0, seg=12, rings=8, sx=0.95, sy=1.0, sz=1.05), "cloth", lg, bev=0)
    g.add(tube_between((0, -0.03, 0), (0, -0.44, 0.005), 0.085, 0.065, seg=10), "cloth", lg, bev=0.004, seg=1)
    tp = front_raw([(-0.055, -0.3), (0.055, -0.3), (0.065, -0.12), (0.045, -0.08), (-0.045, -0.08), (-0.065, -0.12)], 0.07, 0.095)
    g.add(tp, "armor", lg, bev=0.006, seg=1)
    g.box("webbing", 0.05, 0.12, 0.11, sx * 0.09, -0.24, 0.0, bev=0.008, seg=1, group=lg)
    g.box("webbing", 0.012, 0.025, 0.2, sx * 0.07, -0.16, 0.0, bev=0.003, seg=1, group=lg)
    # Shin: the knee, the trouser leg, a knee pad, a shin guard, the boot with its sole and toe cap.
    g.add(sphere_raw(0.066, 0, 0.0, 0.0, seg=12, rings=8), "cloth", kn, bev=0)
    g.add(tube_between((0, -0.02, 0), (0, -0.38, 0), 0.066, 0.052, seg=10), "cloth", kn, bev=0.004, seg=1)
    g.add(sphere_raw(0.06, 0, -0.025, 0.055, seg=12, rings=8, sx=1.05, sy=1.05, sz=0.55), "armor", kn, bev=0)
    g.add(front_raw([(-0.045, -0.3), (0.045, -0.3), (0.05, -0.12), (0.035, -0.08), (-0.035, -0.08), (-0.05, -0.12)], 0.045, 0.07), "armor", kn, bev=0.005, seg=1)
    boot = prism_raw([(-0.075, -0.39), (-0.06, -0.33), (0.03, -0.33), (0.06, -0.37), (0.15, -0.41), (0.165, -0.45), (0.16, -0.47), (-0.08, -0.47)], -0.062, 0.062)
    g.add(boot, "boots", kn, bev=0.012, seg=2)
    g.add(prism_raw([(-0.085, -0.465), (0.168, -0.465), (0.17, -0.475), (0.16, -0.5), (-0.08, -0.5), (-0.088, -0.48)], -0.066, 0.066), "webbing", kn, bev=0.005, seg=1)
    g.add(tube_between((0, -0.3, 0), (0, -0.37, 0), 0.06, 0.064, seg=10), "boots", kn, bev=0.004, seg=1)


def build():
    L.reset(LAYERS)
    g = L.Gun("merc", groups=PIVOTS)
    pelvis(g)
    torso(g)
    head(g)
    for side, sx in (("L", 1), ("R", -1)):
        arm(g, side, sx)
        leg(g, side, sx)
    return g


def pose_rest(objs):
    """The pivots placed in the body (Blender axes), arms down a little, for the previews."""
    C = Matrix.Rotation(math.pi / 2, 4, "X")
    world = {}
    for name in PIVOTS:
        at, parent = REST[name]
        m = Matrix.Translation(at)
        if name.startswith("arm"):
            m = m @ Matrix.Rotation(0.12 if name.endswith("L") else -0.12, 4, "Z")
        world[name] = (world[parent] if parent else Matrix.Identity(4)) @ m
    for name, ob in objs.items():
        ob.matrix_world = C @ world[name] @ C.inverted()


class _baked:
    def __init__(self, ob):
        self.data = type("D", (), {"vertices": [type("V", (), {"co": ob.matrix_world @ v.co})() for v in ob.data.vertices]})()


def main():
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    opts = {"out": "public/models", "preview": None}
    for i in range(0, len(argv), 2):
        opts[argv[i].lstrip("-")] = argv[i + 1]
    g = build()
    objs = g.finish()
    os.makedirs(opts["out"], exist_ok=True)
    path = os.path.join(opts["out"], "merc.glb")
    L.export_glb(objs, path)
    print(f"MERC: {L.tri_count(objs)} tris -> {path} ({os.path.getsize(path)} bytes)")
    if opts["preview"]:
        L.PREVIEW["merc"] = PREVIEW_COL
        pose_rest(objs)
        os.makedirs(opts["preview"], exist_ok=True)
        L.preview({k: _baked(v) for k, v in objs.items()}, os.path.join(opts["preview"], "merc"), "merc", views=("front", "three", "side", "pov"), res=(800, 1000))
        print("PREVIEW done")


main()
