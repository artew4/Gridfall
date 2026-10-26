"""
67.0: the first-person hands, gloved, in three poses (one GLB, a node each):

  grip_R  the right hand on a pistol grip: the grip runs up the local Y axis through the origin (about
          3 cm wide, 4.5 cm front to back), the palm on its right side and back strap, three fingers
          round the front strap, the index finger out along the trigger guard, the thumb over the top
          and down the left side; the forearm back towards the eye.
  grip_L  the left hand round a vertical grip (the SMG's foregrip, the pistol's support): grip_R
          mirrored, every finger round it.
  cup_L   the left hand under a fore-end that runs down the local Z axis (about 6 cm across: the
          rifle's handguard, the shotgun's pump): the palm under it, the fingers up its right side,
          the thumb along its left.

The game places a pose per gun (src/entities/weapons/hands.ts). Roles: glove, pad (the knuckle and
back-of-hand armour), sleeve, cuff (the glove's wrist band: the neon stripe on the blaster finish).

  Blender -b --factory-startup -P tools/blender/hands.py -- [--out public/models] [--preview DIR] [--finish military|blaster]
"""

import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import gunlib as L  # noqa: E402
from gunlib import box_raw, cyl_raw, seg_raw, sphere_raw, tube_between  # noqa: E402
from mathutils import Matrix, Vector  # noqa: E402

GROUPS = ("grip_R", "grip_L", "cup_L")


def finger(g, node, base, d0, axis, lens, angles, w, h, up, role="glove", pads=True):
    """A finger: segments from `base` along `d0`, bending by `angles` (rad) about `axis` before each."""
    p = Vector(base)
    d = Vector(d0).normalized()
    ax = Vector(axis).normalized()
    for i, (ln, ang) in enumerate(zip(lens, angles)):
        d = (Matrix.Rotation(ang, 3, ax) @ d).normalized()
        q = p + d * ln
        g.add(seg_raw(p, q, w, h, up=up, w1=w * 0.94, h1=h * 0.94), role, node, bev=min(w, h) * 0.32, seg=2)
        g.add(sphere_raw(min(w, h) * 0.5, *p, seg=10, rings=6), role, node, bev=0)
        # A grip pad on the first segment's back (the glove's armour).
        if pads and i == 0:
            g.add(seg_raw(p + d * ln * 0.2 + Vector(up) * h * 0.5, p + d * ln * 0.8 + Vector(up) * h * 0.5, w * 0.8, h * 0.28, up=up), "pad", node, bev=0.0012, seg=2)
        p = q
        w *= 0.93
        h *= 0.93
    g.add(sphere_raw(min(w, h) * 0.5, *p, seg=10, rings=6), role, node, bev=0)
    return p


def forearm(g, node, wrist, direction, length=0.3):
    """The glove's gauntlet, its wrist band (cuff) and the sleeve back towards the eye."""
    d = Vector(direction).normalized()
    w = Vector(wrist)
    g.add(tube_between(w - d * 0.012, w + d * 0.05, 0.025, 0.029, seg=18), "glove", node, bev=0.002, seg=2)
    g.add(tube_between(w + d * 0.026, w + d * 0.04, 0.0302, 0.031, seg=18), "cuff", node, bev=0.001, seg=2)
    # The sleeve: a tapered tube with a rolled edge and two folds.
    g.add(tube_between(w + d * 0.05, w + d * length, 0.032, 0.043, seg=18), "sleeve", node, bev=0.002, seg=2)
    g.add(tube_between(w + d * 0.05, w + d * 0.066, 0.035, 0.035, seg=18), "sleeve", node, bev=0.003, seg=2)
    for t, r in ((0.13, 0.0385), (0.2, 0.041)):
        g.add(tube_between(w + d * t, w + d * (t + 0.014), r, r + 0.001, seg=18), "sleeve", node, bev=0.003, seg=2)


def grip_hand(g, node, sx, trigger):
    """A hand round a vertical grip; sx 1 the right hand, -1 the left (mirrored); `trigger`: the index out."""
    X = lambda x, y, z: (x * sx, y, z)  # noqa: E731
    Y = (0, 1, 0)
    up = lambda x, y, z: (x * sx, y, z)  # noqa: E731
    # Palm on the grip's side and back strap, the thenar mound, the back plate, the knuckle guard.
    g.add(seg_raw(X(0.026, -0.04, 0.02), X(0.026, 0.03, 0.006), 0.05, 0.022, up=up(1, 0, 0), w1=0.056, h1=0.024), "glove", node, bev=0.006, seg=3)
    g.add(sphere_raw(0.016, *X(0.014, 0.02, 0.028), sx=1.0, sy=1.2, sz=1.0), "glove", node, bev=0)
    g.add(seg_raw(X(0.0385, -0.018, 0.01), X(0.0385, 0.022, 0.001), 0.026, 0.005, up=up(1, 0, 0), w1=0.032), "pad", node, bev=0.0018, seg=2)
    g.add(seg_raw(X(0.031, 0.032, -0.012), X(0.033, -0.04, -0.004), 0.014, 0.017, up=up(1, 0, 0)), "pad", node, bev=0.003, seg=2)
    # Fingers round the front strap (bending about +Y for the right hand, -Y for the left).
    ax = (0, sx, 0)
    rows = [(-0.012, 1.0), (-0.03, 0.97), (-0.045, 0.82)]
    if not trigger:
        rows = [(0.012, 1.0)] + rows
    for y, k in rows:
        finger(g, node, X(0.03, y + 0.004, -0.006), X(0, 0, -1), ax, (0.042 * k, 0.026 * k, 0.02 * k), (math.radians(46), math.radians(55), math.radians(60)), 0.0185 * k, 0.017 * k, up(1, 0, 0))
    if trigger:
        # The index out along the trigger guard, curling a little towards the trigger.
        finger(g, node, X(0.028, 0.026, -0.006), X(-0.1, 0, -1), ax, (0.042, 0.026, 0.02), (math.radians(4), math.radians(22), math.radians(25)), 0.018, 0.017, up(0, 1, 0))
    # The thumb over the top, down the far side.
    finger(g, node, X(0.016, 0.03, 0.022), X(-1, 0.1, -0.25), ax, (0.03, 0.028, 0.022), (0, math.radians(26), math.radians(20)), 0.021, 0.019, Y)
    forearm(g, node, X(0.024, -0.04, 0.042), X(0.12, -0.32, 1.0))


def cup_hand(g, node):
    """The left hand under a fore-end along Z: palm under it, fingers up its right side, thumb along its left."""
    Z = (0, 0, 1)
    g.add(seg_raw((-0.012, -0.042, 0.04), (-0.006, -0.041, -0.03), 0.052, 0.022, up=(0.35, 1, 0), w1=0.056, h1=0.024), "glove", node, bev=0.006, seg=3)
    g.add(sphere_raw(0.016, -0.032, -0.03, 0.02, sx=1.1, sy=1.2, sz=1.3), "glove", node, bev=0)
    g.add(seg_raw((-0.014, -0.0555, 0.02), (-0.009, -0.055, -0.016), 0.026, 0.005, up=(0.35, 1, 0), w1=0.032), "pad", node, bev=0.0018, seg=2)
    g.add(seg_raw((0.016, -0.045, -0.034), (0.019, -0.046, 0.024), 0.014, 0.017, up=(0, -1, 0)), "pad", node, bev=0.003, seg=2)
    for z, k in ((-0.03, 1.0), (-0.011, 1.03), (0.008, 0.98), (0.026, 0.84)):
        finger(g, node, (0.014, -0.04, z), (1, 0, 0), Z, (0.042 * k, 0.026 * k, 0.02 * k), (math.radians(36), math.radians(50), math.radians(34)), 0.0175 * k, 0.017 * k, (0, -1, 0))
    finger(g, node, (-0.03, -0.024, 0.016), (0.02, 0.3, -1), (1, 0, 0), (0.032, 0.028, 0.022), (0, math.radians(10), math.radians(10)), 0.021, 0.019, (-1, 0, 0))
    forearm(g, node, (-0.03, -0.048, 0.046), (-0.55, -0.45, 0.7))


def build():
    L.reset(L.HAND_ROLES)
    g = L.Gun("hands", groups=GROUPS)
    grip_hand(g, "grip_R", 1, True)
    grip_hand(g, "grip_L", -1, False)
    cup_hand(g, "cup_L")
    return g


def proxies():
    """What the hands hold, for the previews only (not exported): a grip, a fore-end."""
    out = []
    out.append(box_raw(0.03, 0.12, 0.044, 0, 0, 0, name="proxy"))
    out.append(cyl_raw(0.03, 0.2, 0, 0, 0, seg=24, name="proxy2"))
    return out


def main():
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    opts = {"out": "public/models", "preview": None, "finish": "military"}
    for i in range(0, len(argv), 2):
        opts[argv[i].lstrip("-")] = argv[i + 1]
    g = build()
    objs = g.finish()
    os.makedirs(opts["out"], exist_ok=True)
    path = os.path.join(opts["out"], "hands.glb")
    L.export_glb(objs, path)
    print(f"HANDS: {L.tri_count(objs)} tris -> {path} ({os.path.getsize(path)} bytes)")
    if opts["preview"]:
        os.makedirs(opts["preview"], exist_ok=True)
        # Each pose alone, with what it holds.
        for name in GROUPS:
            for o in objs.values():
                o.hide_render = o.name != name
            for p in [o for o in L.bpy.data.objects if o.name.startswith("proxy")]:
                L.bpy.data.objects.remove(p, do_unlink=True)
            px = proxies()[0 if name != "cup_L" else 1]
            px.data.transform(Matrix.Rotation(math.pi / 2, 4, "X"))
            L.preview({name: objs[name]}, os.path.join(opts["preview"], f"hands-{name}-{opts['finish']}"), opts["finish"], views=("side", "left", "three", "pov"), res=(900, 600))
        print("PREVIEW done")


main()
