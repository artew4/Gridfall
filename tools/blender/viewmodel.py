"""
67.0: a gun in the hands, previewed: the gun's GLB and the hands' (public/models), the hands placed
by src/entities/weapons/handFit.json as the game places them, rendered from the player's eye and the
sides. For tuning the hands' fit without the game.

  Blender -b --factory-startup -P tools/blender/viewmodel.py -- --preview DIR [--only jackal] [--finish military|blaster]
"""

import json
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import bpy  # noqa: E402
import gunlib as L  # noqa: E402
from mathutils import Euler, Matrix, Vector  # noqa: E402

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
FIT = json.load(open(os.path.join(ROOT, "src/entities/weapons/handFit.json")))
# Where the gun sits in front of the eye at rest (the specs' `rest`).
REST = {"kitsune9": (0.15, -0.145, -0.36), "hornet": (0.17, -0.19, -0.36), "jackal": (0.18, -0.2, -0.36), "shotgun": (0.17, -0.2, -0.36)}
C = Matrix.Rotation(math.pi / 2, 4, "X")


def load(path):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=path)
    return [o for o in bpy.data.objects if o not in before]


def main():
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    opts = {"preview": "/tmp/vm", "finish": "military", "only": ",".join(FIT)}
    for i in range(0, len(argv), 2):
        opts[argv[i].lstrip("-")] = argv[i + 1]
    os.makedirs(opts["preview"], exist_ok=True)
    for gid in opts["only"].split(","):
        bpy.ops.wm.read_factory_settings(use_empty=True)
        gun = [o for o in load(os.path.join(ROOT, f"public/models/guns/{gid}.glb")) if o.type == "MESH"]
        hands = {o.name: o for o in load(os.path.join(ROOT, "public/models/hands.glb")) if o.type == "MESH"}
        objs = {o.name: o for o in gun}
        for f in FIT[gid]:
            src = hands[f["pose"]]
            ob = src.copy()
            ob.data = src.data.copy()
            bpy.context.scene.collection.objects.link(ob)
            m3 = Matrix.Translation(f["at"]) @ Euler((f["rx"], 0, f["rz"]), "XYZ").to_matrix().to_4x4()
            ob.matrix_world = C @ m3 @ C.inverted() @ src.matrix_world
            objs[f["pose"] + "_fit"] = ob
        for h in hands.values():
            h.hide_render = True
        base = os.path.join(opts["preview"], f"vm-{gid}-{opts['finish']}")
        L.preview({k: _baked(v) for k, v in objs.items()}, base, opts["finish"], views=("side", "left", "front"), res=(1000, 620))
        # The eye's view: the camera where the eye is with the gun at rest.
        sc = bpy.context.scene
        cam = sc.camera
        rx, ry, rz = REST[gid]
        cam.data.lens = 18
        cam.location = C @ Vector((-rx, -ry, -rz))
        cam.rotation_euler = (C @ Vector((0, 0, -1))).to_track_quat("-Z", "Y").to_euler()
        sc.render.filepath = base + "-eye.png"
        bpy.ops.render.render(write_still=True)
        print("VM", gid, base)


class _baked:
    """The preview reads `data.vertices` for its bounds: world positions of an object."""

    def __init__(self, ob):
        self.data = type("D", (), {"vertices": [type("V", (), {"co": ob.matrix_world @ v.co})() for v in ob.data.vertices]})()


main()
