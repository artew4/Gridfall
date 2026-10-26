"""
66.0, the guns' workbench in Blender: hard-surface parts built from code (headless), so a model is a
script that can be read, diffed and run again.

Everything is modelled in the game's gun space (three.js: +Y up, -Z down the barrel, metres, the same
numbers as the old box models in src/entities/weapons/*.ts), then turned +90 deg about X at export so
the glTF (+Y up) comes out in exactly those coordinates.

A part is a mesh with one material named by its role (frame, steel, polymer, furniture, trim, glow):
the game gives each role the map's finish (theme.ts). Parts go to one of three groups, exported as
the GLB's three nodes: `body`, `slide` (what cycles) and `mag` (what drops on a reload).
"""

import math

import bmesh
import bpy
from mathutils import Matrix, Vector

ROLES = ("frame", "steel", "polymer", "furniture", "trim", "glow")

# Preview colours (linear-ish sRGB, metallic, roughness): the military and the neon finishes.
PREVIEW = {
    "military": {
        "frame": ((0.13, 0.135, 0.13), 0.55, 0.5),
        "steel": ((0.24, 0.245, 0.235), 0.7, 0.42),
        "polymer": ((0.24, 0.26, 0.19), 0.05, 0.8),
        "furniture": ((0.42, 0.36, 0.25), 0.05, 0.75),
        "trim": ((0.33, 0.34, 0.31), 0.7, 0.4),
        "glow": ((0.17, 0.17, 0.165), 0.6, 0.5),
    },
    "blaster": {
        "frame": ((0.36, 0.38, 0.44), 0.8, 0.3),
        "steel": ((0.16, 0.17, 0.2), 0.7, 0.35),
        "polymer": ((0.14, 0.15, 0.18), 0.25, 0.5),
        "furniture": ((0.11, 0.12, 0.14), 0.35, 0.45),
        "trim": ((0.69, 0.71, 0.75), 0.9, 0.18),
        "glow": ((0.1, 0.8, 1.0), 0.0, 0.5),
    },
}


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    for r in ROLES:
        m = bpy.data.materials.new(r)
        m.use_nodes = True


def role_mat(role):
    m = bpy.data.materials.get(role)
    assert m is not None, role
    return m


def _link(name, bm):
    me = bpy.data.meshes.new(name)
    bm.normal_update()
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    return ob


def _xf(bm, m):
    bmesh.ops.transform(bm, matrix=m, verts=bm.verts)


def _rot(rx=0.0, ry=0.0, rz=0.0):
    # three.js Euler 'XYZ': R = Rx * Ry * Rz.
    return Matrix.Rotation(rx, 4, "X") @ Matrix.Rotation(ry, 4, "Y") @ Matrix.Rotation(rz, 4, "Z")


def _override(ob):
    return bpy.context.temp_override(object=ob, active_object=ob, selected_objects=[ob], selected_editable_objects=[ob])


def apply_mods(ob):
    with _override(ob):
        for m in list(ob.modifiers):
            bpy.ops.object.modifier_apply(modifier=m.name)


# ------------------------------------------------------------------ primitives (raw, not finished)
def box_raw(w, h, d, x=0.0, y=0.0, z=0.0, rx=0.0, ry=0.0, rz=0.0, name="box"):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    _xf(bm, Matrix.Translation((x, y, z)) @ _rot(rx, ry, rz) @ Matrix.Diagonal((w, h, d, 1)))
    return _link(name, bm)


def prism_raw(pts, x0, x1, name="prism", rx=0.0, origin=(0.0, 0.0, 0.0)):
    """A side outline (pts: (z, y) pairs, three.js gun space) pushed across X from x0 to x1."""
    bm = bmesh.new()
    vs = [bm.verts.new((x0, y, z)) for z, y in pts]
    f = bm.faces.new(vs)
    r = bmesh.ops.extrude_face_region(bm, geom=[f])
    moved = [e for e in r["geom"] if isinstance(e, bmesh.types.BMVert)]
    bmesh.ops.translate(bm, vec=(x1 - x0, 0, 0), verts=moved)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    if rx:
        o = Vector(origin)
        _xf(bm, Matrix.Translation(o) @ Matrix.Rotation(rx, 4, "X") @ Matrix.Translation(-o))
    return _link(name, bm)


def top_raw(pts, y0, y1, name="plan"):
    """A plan outline (pts: (x, z) pairs) pushed up Y from y0 to y1."""
    bm = bmesh.new()
    vs = [bm.verts.new((x, y0, z)) for x, z in pts]
    f = bm.faces.new(vs)
    r = bmesh.ops.extrude_face_region(bm, geom=[f])
    moved = [e for e in r["geom"] if isinstance(e, bmesh.types.BMVert)]
    bmesh.ops.translate(bm, vec=(0, y1 - y0, 0), verts=moved)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return _link(name, bm)


def cyl_raw(r, length, x=0.0, y=0.0, z=0.0, seg=24, r2=None, axis="z", name="cyl", rx=0.0):
    """A cylinder (a cone if r2) along three's Z (down the barrel), X or Y, centred at (x, y, z)."""
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=seg, radius1=r, radius2=r if r2 is None else r2, depth=length)
    # create_cone runs along +Z with radius1 at -Z: the barrel's far end (-Z) gets r.
    m = Matrix.Identity(4)
    if axis == "x":
        m = Matrix.Rotation(math.pi / 2, 4, "Y")
    elif axis == "y":
        m = Matrix.Rotation(-math.pi / 2, 4, "X")
    _xf(bm, Matrix.Translation((x, y, z)) @ Matrix.Rotation(rx, 4, "X") @ m)
    return _link(name, bm)


def tube_raw(r_out, r_in, length, x=0.0, y=0.0, z=0.0, seg=24, name="tube"):
    outer = cyl_raw(r_out, length, x, y, z, seg, name=name)
    inner = cyl_raw(r_in, length + 0.01, x, y, z, seg, name=name + "_hole")
    cut(outer, inner)
    return outer


def torus_raw(R, r, x=0.0, y=0.0, z=0.0, seg=24, ring=8, name="torus"):
    bm = bmesh.new()
    verts = []
    for i in range(seg):
        a = 2 * math.pi * i / seg
        row = []
        for j in range(ring):
            b = 2 * math.pi * j / ring
            rr = R + r * math.cos(b)
            row.append(bm.verts.new((rr * math.cos(a), rr * math.sin(a), r * math.sin(b))))
        verts.append(row)
    for i in range(seg):
        for j in range(ring):
            a = verts[i][j]
            b = verts[(i + 1) % seg][j]
            c = verts[(i + 1) % seg][(j + 1) % ring]
            d = verts[i][(j + 1) % ring]
            bm.faces.new((a, b, c, d))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    _xf(bm, Matrix.Translation((x, y, z)))
    return _link(name, bm)


# ------------------------------------------------------------------ operations
def cut(target, *cutters, solver="EXACT"):
    """Boolean difference; the cutters are deleted."""
    for c in cutters:
        m = target.modifiers.new("cut", "BOOLEAN")
        m.operation = "DIFFERENCE"
        m.solver = solver
        m.object = c
        apply_mods(target)
        bpy.data.objects.remove(c, do_unlink=True)
    return target


def union(target, *others):
    for c in others:
        m = target.modifiers.new("join", "BOOLEAN")
        m.operation = "UNION"
        m.solver = "EXACT"
        m.object = c
        apply_mods(target)
        bpy.data.objects.remove(c, do_unlink=True)
    return target


def bevel(ob, width=0.0012, seg=3, angle=40.0):
    if width <= 0:
        return ob
    m = ob.modifiers.new("bevel", "BEVEL")
    m.width = width
    m.segments = seg
    m.limit_method = "ANGLE"
    m.angle_limit = math.radians(angle)
    m.profile = 0.5
    m.miter_outer = "MITER_ARC"
    m.use_clamp_overlap = True
    apply_mods(ob)
    return ob


def taper(ob, axis="y", factor=0.2):
    m = ob.modifiers.new("taper", "SIMPLE_DEFORM")
    m.deform_method = "TAPER"
    m.deform_axis = axis.upper()
    m.factor = factor
    apply_mods(ob)
    return ob


# ------------------------------------------------------------------ the gun
class Gun:
    def __init__(self, gid):
        self.id = gid
        self.parts = []  # (object, group)

    def add(self, ob, role, group="body", bev=0.0012, seg=3, angle=40.0):
        """Finish a raw part: bevel its hard edges, give it its role; it joins `group` at export."""
        bevel(ob, bev, seg, angle)
        ob.data.materials.clear()
        ob.data.materials.append(role_mat(role))
        self.parts.append((ob, group))
        return ob

    # Shorthands: raw primitive + finish.
    def box(self, role, w, h, d, x=0.0, y=0.0, z=0.0, rx=0.0, ry=0.0, rz=0.0, group="body", bev=0.0012, seg=3):
        return self.add(box_raw(w, h, d, x, y, z, rx, ry, rz), role, group, bev, seg)

    def prism(self, role, pts, x0, x1, group="body", bev=0.0012, seg=3, rx=0.0, origin=(0, 0, 0)):
        return self.add(prism_raw(pts, x0, x1, rx=rx, origin=origin), role, group, bev, seg)

    def cyl(self, role, r, length, x=0.0, y=0.0, z=0.0, seg=24, r2=None, axis="z", group="body", bev=0.0006, rx=0.0):
        return self.add(cyl_raw(r, length, x, y, z, seg, r2, axis, rx=rx), role, group, bev, 2)

    def finish(self, decimate=None):
        """Join each group into one object (smooth shading, weighted normals, box UVs), in glTF axes.
        `decimate`: a collapse ratio for the bots' low-detail copy."""
        out = {}
        for group in ("body", "slide", "mag"):
            obs = [o for o, g in self.parts if g == group]
            if not obs:
                continue
            for o in obs:
                for p in o.data.polygons:
                    p.use_smooth = True
            main = obs[0]
            if len(obs) > 1:
                with bpy.context.temp_override(object=main, active_object=main, selected_objects=obs, selected_editable_objects=obs):
                    bpy.ops.object.join()
            main.name = group
            main.data.name = group
            # Merge doubles left by booleans, then hard edges by angle and weighted normals.
            bm = bmesh.new()
            bm.from_mesh(main.data)
            bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-6)
            bm.to_mesh(main.data)
            bm.free()
            if decimate:
                d = main.modifiers.new("lod", "DECIMATE")
                d.decimate_type = "COLLAPSE"
                d.ratio = decimate
                d.use_collapse_triangulate = True
                apply_mods(main)
            with _override(main):
                bpy.ops.object.shade_smooth_by_angle(angle=math.radians(38), keep_sharp_edges=True)
            wn = main.modifiers.new("wn", "WEIGHTED_NORMAL")
            wn.keep_sharp = True
            wn.weight = 50
            apply_mods(main)
            box_uv(main, 0.12)
            # three.js gun space -> Blender (Z up): +90 deg about X; the glTF exporter turns it back.
            main.data.transform(Matrix.Rotation(math.pi / 2, 4, "X"))
            main.data.update()
            out[group] = main
        return out


def box_uv(ob, size):
    """Box-projected UVs, `size` m to one texture repeat (the camo and the carbon weave tile on it)."""
    me = ob.data
    uv = me.uv_layers.new(name="UVMap")
    for poly in me.polygons:
        n = poly.normal
        ax = max(range(3), key=lambda i: abs(n[i]))
        for li in poly.loop_indices:
            co = me.vertices[me.loops[li].vertex_index].co
            if ax == 0:
                u, v = co.z, co.y
            elif ax == 1:
                u, v = co.x, co.z
            else:
                u, v = co.x, co.y
            uv.data[li].uv = (u / size, v / size)


def tri_count(objs):
    n = 0
    for o in objs.values():
        for p in o.data.polygons:
            n += len(p.vertices) - 2
    return n


def export_glb(objs, path):
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs.values():
        o.select_set(True)
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format="GLB",
        use_selection=True,
        export_yup=True,
        export_apply=True,
        export_texcoords=True,
        export_normals=True,
        export_materials="EXPORT",
        export_animations=False,
        export_extras=False,
    )


# ------------------------------------------------------------------ preview renders
def preview(objs, path, finish="military", views=("side", "three", "top"), res=(1400, 800)):
    """Cycles stills of the finished gun (its objects as exported: Blender axes, -Y down the barrel)."""
    sc = bpy.context.scene
    sc.render.engine = "CYCLES"
    sc.cycles.samples = 48
    sc.cycles.use_denoising = True
    sc.render.resolution_x, sc.render.resolution_y = res
    sc.render.film_transparent = False
    sc.view_settings.view_transform = "AgX"
    for r, (col, met, rough) in PREVIEW[finish].items():
        m = role_mat(r)
        b = m.node_tree.nodes.get("Principled BSDF")
        b.inputs["Base Color"].default_value = (*col, 1)
        b.inputs["Metallic"].default_value = met
        b.inputs["Roughness"].default_value = rough
        if r == "glow" and finish == "blaster":
            b.inputs["Emission Color"].default_value = (*col, 1)
            b.inputs["Emission Strength"].default_value = 6
    world = bpy.data.worlds.new("w")
    sc.world = world
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs["Color"].default_value = (0.05, 0.055, 0.06, 1)
    world.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.6
    # Bounds.
    lo = Vector((1e9, 1e9, 1e9))
    hi = -lo
    for o in objs.values():
        for v in o.data.vertices:
            lo = Vector(map(min, lo, v.co))
            hi = Vector(map(max, hi, v.co))
    c = (lo + hi) / 2
    size = max(hi - lo)
    for name, energy, loc in (("key", 60, (0.6, -0.4, 0.8)), ("fill", 18, (-0.8, 0.3, 0.3)), ("rim", 45, (0.0, 0.9, 0.6))):
        ld = bpy.data.lights.new(name, "AREA")
        ld.energy = energy * size * size
        ld.size = size * 1.2
        lo_ = bpy.data.objects.new(name, ld)
        sc.collection.objects.link(lo_)
        lo_.location = c + Vector(loc) * size * 2.2
        lo_.rotation_euler = (c - lo_.location).to_track_quat("-Z", "Y").to_euler()
    cam_d = bpy.data.cameras.new("cam")
    cam_d.lens = 85
    cam = bpy.data.objects.new("cam", cam_d)
    sc.collection.objects.link(cam)
    sc.camera = cam
    dirs = {
        "side": Vector((1, 0, 0.02)),
        "left": Vector((-1, 0, 0.02)),
        "three": Vector((0.8, 0.55, 0.35)),
        "front": Vector((0.35, -1, 0.15)),
        "top": Vector((0.25, 0.1, 1)),
        "pov": Vector((0.3, -1, 0.32)),
    }
    files = []
    for v in views:
        d = dirs[v].normalized()
        dist = size * (3.6 if v != "pov" else 1.6)
        cam.location = c + d * dist
        cam.rotation_euler = (c - cam.location).to_track_quat("-Z", "Y").to_euler()
        f = f"{path}-{v}.png"
        sc.render.filepath = f
        bpy.ops.render.render(write_still=True)
        files.append(f)
    return files


def cut_many(target, cutters):
    """One boolean for many cutters: a collection operand (each cutter its own closed mesh, so cutters
    may overlap: joined into one mesh they made a self-intersecting cutter and the exact solver lost
    the whole part)."""
    cutters = [c for c in cutters if c is not None]
    if not cutters:
        return target
    col = bpy.data.collections.new("cutters")
    bpy.context.scene.collection.children.link(col)
    for c in cutters:
        for uc in list(c.users_collection):
            uc.objects.unlink(c)
        col.objects.link(c)
    m = target.modifiers.new("cut", "BOOLEAN")
    m.operation = "DIFFERENCE"
    m.solver = "EXACT"
    m.operand_type = "COLLECTION"
    m.collection = col
    apply_mods(target)
    for c in cutters:
        bpy.data.objects.remove(c, do_unlink=True)
    bpy.data.collections.remove(col)
    return target


def front_raw(pts, z0, z1, name="section"):
    """A cross-section (pts: (x, y) pairs) pushed along Z (down the barrel) from z0 to z1."""
    bm = bmesh.new()
    vs = [bm.verts.new((x, y, z0)) for x, y in pts]
    f = bm.faces.new(vs)
    r = bmesh.ops.extrude_face_region(bm, geom=[f])
    moved = [e for e in r["geom"] if isinstance(e, bmesh.types.BMVert)]
    bmesh.ops.translate(bm, vec=(0, 0, z1 - z0), verts=moved)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return _link(name, bm)


def octagon(w, h, c, cx=0.0, cy=0.0):
    """A w x h rectangle's outline with its corners cut by c (x, y pairs)."""
    x, y = w / 2, h / 2
    return [(cx - x + c, cy - y), (cx + x - c, cy - y), (cx + x, cy - y + c), (cx + x, cy + y - c), (cx + x - c, cy + y), (cx - x + c, cy + y), (cx - x, cy + y - c), (cx - x, cy - y + c)]


def rail_raw(z0, z1, y, w=0.021, h=0.0075, pitch=0.01):
    """A Picatinny rail: its bevelled top cut across every `pitch` m."""
    r = front_raw([(-w / 2, y), (w / 2, y), (w / 2, y + h * 0.45), (w / 2 + 0.0015, y + h * 0.7), (w / 2 - 0.001, y + h), (-w / 2 + 0.001, y + h), (-w / 2 - 0.0015, y + h * 0.7), (-w / 2, y + h * 0.45)], z0, z1)
    lo, hi = min(z0, z1), max(z0, z1)
    cs = []
    z = lo + pitch * 0.75
    while z < hi - pitch * 0.4:
        cs.append(box_raw(w + 0.01, h * 0.5, pitch * 0.48, 0, y + h * 0.95, z))
        z += pitch
    return cut_many(r, cs)
