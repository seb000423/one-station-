"""Home hero scene: builds assets/hero/hero-line.glb with Blender (bpy).

Run:  python3 tools/hero-scene/build_hero_glb.py   (pip install bpy)  or  blender -b -P tools/hero-scene/build_hero_glb.py
then shrink (≈450 KB → ≈290 KB; KHR_mesh_quantization, no decoder needed in three.js):
      npx @gltf-transform/cli weld assets/hero/hero-line.glb /tmp/w.glb
      npx @gltf-transform/cli quantize /tmp/w.glb assets/hero/hero-line.glb --pattern '*'

One small single-colour model of a generic line, read by js/home-hero.js:
  rack (infeed) -> conveyor A -> robot R1 -> conveyor B -> robot R2 (fenced cell) -> inspection table -> outbound pallet
Coordinates below are written in three.js space (metres, Y up, flow along +X, +Z towards the viewer);
P() converts to Blender (Z up). Named nodes the page uses:
  R1/R2: <R>_base, <R>_j1 (yaw, Y), <R>_j2 / <R>_j3 / <R>_j4 (pitch, local Z), <R>_tip (tool point)
  <R>_pickA / <R>_pickB  grip points of the two fixtures the robot moves its part between
  <R>_part               the part, starts at pickA
  glow_*                 lamps (emissive; the only things that bloom besides the interlock rings)
Materials: charcoal, grey, ivory, sand, glass, amber (lamp). Matte, no textures, no outlines.
"""
import math
import os
import bpy
import bmesh
from mathutils import Matrix, Vector

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'assets', 'hero', 'hero-line.glb')

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene

# ------------------------------------------------------------------ materials
def mat(name, rgb, rough=0.8, metal=0.0, emit=None):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (*rgb, 1)
    b.inputs['Roughness'].default_value = rough
    b.inputs['Metallic'].default_value = metal
    if emit:
        b.inputs['Emission Color'].default_value = (*emit, 1)
        b.inputs['Emission Strength'].default_value = 1.0
    return m

def srgb(h):
    c = [int(h[i:i + 2], 16) / 255 for i in (1, 3, 5)]
    return tuple(x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c)

M = {
    'charcoal': mat('charcoal', srgb('#2b2c30'), 0.7, 0.2),
    'grey': mat('grey', srgb('#6f7176'), 0.75, 0.1),
    'ivory': mat('ivory', srgb('#e2dfd6'), 0.8),
    'sand': mat('sand', srgb('#bdb4a2'), 0.85),
    'glass': mat('glass', srgb('#16181c'), 0.35, 0.3),
    'amber': mat('amber', srgb('#3a2508'), 0.5, 0.0, emit=srgb('#ffb547')),
}

# ------------------------------------------------------------------ helpers (three.js coords in, Blender out)
def P(x, y, z):
    return Vector((x, -z, y))

def _obj(name, bm, m, loc):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    me.materials.append(m)
    ob = bpy.data.objects.new(name, me)
    ob.location = loc
    scene.collection.objects.link(ob)
    return ob

def box(name, c, s, m):
    """c = centre (three), s = size (sx, sy, sz) (three)."""
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1)
    bmesh.ops.scale(bm, vec=Vector((s[0], s[2], s[1])), verts=bm.verts)
    return _obj(name, bm, M[m], P(*c))

def cyl(name, c, r, length, axis, m, seg=16):
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=seg, radius1=r, radius2=r, depth=length)
    if axis == 'x':
        bmesh.ops.rotate(bm, verts=bm.verts, matrix=Matrix.Rotation(math.pi / 2, 3, 'Y'))
    elif axis == 'z':
        bmesh.ops.rotate(bm, verts=bm.verts, matrix=Matrix.Rotation(math.pi / 2, 3, 'X'))
    return _obj(name, bm, M[m], P(*c))

def empty(name, c, parent=None):
    e = bpy.data.objects.new(name, None)
    e.empty_display_size = 0.1
    e.location = P(*c)
    scene.collection.objects.link(e)
    if parent:
        parent_to(e, parent)
    return e

def world_loc(ob):
    v = ob.location.copy()
    while ob.parent:
        ob = ob.parent
        v += ob.location
    return v

def parent_to(ob, parent):
    """Parent keeping the world position (nothing here is rotated): the node's own origin stays at its pivot."""
    w = world_loc(ob)
    ob.parent = parent
    ob.location = w - world_loc(parent)

STATIC = []   # merged by material at the end

def s(ob):
    STATIC.append(ob)
    return ob

# ------------------------------------------------------------------ pieces
def part(name, x, y, z):
    """Machined block (0.30 x 0.18 x 0.30) with four bosses; y = bottom."""
    b = box(name, (x, y + 0.09, z), (0.30, 0.18, 0.30), 'ivory')
    for i, (dx, dz) in enumerate(((-0.08, -0.08), (0.08, -0.08), (-0.08, 0.08), (0.08, 0.08))):
        k = cyl(f'{name}_boss{i}', (x + dx, y + 0.205, z + dz), 0.035, 0.05, 'y', 'grey', 10)
        k.select_set(True)
    for o in bpy.context.selected_objects:
        o.select_set(False)
    bosses = [o for o in scene.objects if o.name.startswith(name + '_boss')]
    join(b, bosses)
    return b

def join(target, others):
    if not others:
        return target
    for o in bpy.context.selected_objects:
        o.select_set(False)
    for o in others:
        o.select_set(True)
    target.select_set(True)
    bpy.context.view_layer.objects.active = target
    bpy.ops.object.join()
    return target

def conveyor(name, x0, x1, z, h=0.80, w=0.62):
    L = x1 - x0
    cx = (x0 + x1) / 2
    for side in (-1, 1):
        s(box(f'{name}_rail{side}', (cx, h - 0.06, z + side * (w / 2 - 0.03)), (L, 0.12, 0.06), 'ivory'))
    for i, lx in enumerate((x0 + 0.15, x1 - 0.15)):
        for side in (-1, 1):
            s(box(f'{name}_leg{i}{side}', (lx, (h - 0.12) / 2, z + side * (w / 2 - 0.05)), (0.06, h - 0.12, 0.06), 'ivory'))
            s(box(f'{name}_foot{i}{side}', (lx, 0.01, z + side * (w / 2 - 0.05)), (0.14, 0.02, 0.14), 'grey'))
        s(box(f'{name}_tie{i}', (lx, 0.25, z), (0.05, 0.05, w - 0.1), 'ivory'))
    n = int(L / 0.2)
    for i in range(n):
        rx = x0 + 0.1 + i * (L - 0.2) / max(1, n - 1)
        s(cyl(f'{name}_roller{i}', (rx, h - 0.035, z), 0.035, w - 0.08, 'z', 'grey', 10))

def table(name, cx, cz, sx, sz, h=0.80):
    s(box(f'{name}_top', (cx, h - 0.03, cz), (sx, 0.06, sz), 'charcoal'))
    for i, (dx, dz) in enumerate(((-1, -1), (1, -1), (-1, 1), (1, 1))):
        s(box(f'{name}_leg{i}', (cx + dx * (sx / 2 - 0.06), (h - 0.06) / 2, cz + dz * (sz / 2 - 0.06)), (0.06, h - 0.06, 0.06), 'ivory'))

def robot(R, bx, bz, ped=0.45, L1=0.85, L2=0.80, LT=0.24):
    """6-axis-style arm. Rest pose: upper arm straight up, forearm along +X, tool pointing down."""
    s(box(f'{R}_pedestal', (bx, ped / 2, bz), (0.56, ped, 0.56), 'grey'))
    s(cyl(f'{R}_flange', (bx, ped + 0.02, bz), 0.27, 0.04, 'y', 'charcoal', 24))
    base = empty(f'{R}_base', (bx, ped, bz))
    m = cyl(f'{R}_basecyl', (bx, ped + 0.09, bz), 0.21, 0.14, 'y', 'charcoal', 24)
    parent_to(m, base)
    lamp = cyl(f'glow_{R}', (bx + 0.2, ped + 0.17, bz + 0.0), 0.025, 0.05, 'y', 'amber', 10)
    parent_to(lamp, base)
    sh_y = ped + 0.16 + 0.28   # shoulder height
    j1 = empty(f'{R}_j1', (bx, ped + 0.16, bz), base)
    parent_to(cyl(f'{R}_turret', (bx, ped + 0.28, bz), 0.17, 0.24, 'y', 'charcoal', 24), j1)
    j2 = empty(f'{R}_j2', (bx, sh_y, bz), j1)
    parent_to(cyl(f'{R}_shoulder', (bx, sh_y, bz), 0.15, 0.34, 'z', 'charcoal', 24), j2)
    parent_to(box(f'{R}_upper', (bx, sh_y + L1 / 2, bz - 0.1), (0.15, L1, 0.12), 'ivory'), j2)
    j3 = empty(f'{R}_j3', (bx, sh_y + L1, bz), j2)
    parent_to(cyl(f'{R}_elbow', (bx, sh_y + L1, bz), 0.12, 0.30, 'z', 'charcoal', 24), j3)
    parent_to(box(f'{R}_fore', (bx + L2 / 2, sh_y + L1, bz + 0.08), (L2, 0.12, 0.11), 'ivory'), j3)
    j4 = empty(f'{R}_j4', (bx + L2, sh_y + L1, bz), j3)
    parent_to(cyl(f'{R}_wrist', (bx + L2, sh_y + L1, bz), 0.08, 0.24, 'z', 'charcoal', 20), j4)
    parent_to(cyl(f'{R}_tool', (bx + L2, sh_y + L1 - 0.09, bz), 0.06, 0.10, 'y', 'charcoal', 16), j4)
    parent_to(box(f'{R}_palm', (bx + L2, sh_y + L1 - 0.16, bz), (0.10, 0.04, 0.22), 'grey'), j4)
    for side in (-1, 1):
        parent_to(box(f'{R}_finger{side}', (bx + L2, sh_y + L1 - 0.21, bz + side * 0.17), (0.07, 0.10, 0.025), 'charcoal'), j4)
    empty(f'{R}_tip', (bx + L2, sh_y + L1 - LT, bz), j4)
    return dict(sh_y=sh_y)

def fence_panel(name, a, b, h=1.6, post='sand'):
    """Panel between floor points a=(x,z) and b=(x,z): posts + charcoal mesh bars."""
    ax, az = a
    bx, bz = b
    L = math.hypot(bx - ax, bz - az)
    ux, uz = (bx - ax) / L, (bz - az) / L
    along_x = abs(ux) > 0.5
    s(box(f'{name}_p0', (ax, h / 2, az), (0.06, h, 0.06), post))
    s(box(f'{name}_p1', (bx, h / 2, bz), (0.06, h, 0.06), post))
    cx, cz = (ax + bx) / 2, (az + bz) / 2
    sz = (L - 0.06, 0.03, 0.025) if along_x else (0.025, 0.03, L - 0.06)
    for i, y in enumerate((0.18, h - 0.06)):
        s(box(f'{name}_frame{i}', (cx, y, cz), (sz[0], 0.04, sz[2]), 'charcoal'))
    n = int((L - 0.1) / 0.06)
    for i in range(1, n):
        t = i / n
        px, pz = ax + ux * L * t, az + uz * L * t
        s(box(f'{name}_v{i}', (px, (0.18 + h - 0.06) / 2, pz), (0.014, h - 0.24, 0.014), 'charcoal'))
    m = int((h - 0.24) / 0.06)
    for j in range(1, m):
        y = 0.18 + (h - 0.24) * j / m
        s(box(f'{name}_h{j}', (cx, y, cz), (sz[0], 0.014, 0.014) if along_x else (0.014, 0.014, sz[2]), 'charcoal'))

def carton(name, c, sz=(0.5, 0.4, 0.4)):
    s(box(name, c, sz, 'sand'))
    s(box(name + '_tape', (c[0], c[1] + sz[1] / 2 + 0.002, c[2]), (sz[0] + 0.002, 0.004, 0.06), 'ivory'))

def rack(name, cx, cz, w=1.3, d=0.62, h=2.5, levels=4):
    for i, (dx, dz) in enumerate(((-1, -1), (1, -1), (-1, 1), (1, 1))):
        s(box(f'{name}_post{i}', (cx + dx * w / 2, h / 2, cz + dz * d / 2), (0.06, h, 0.06), 'charcoal'))
    for k in range(levels):
        y = 0.12 + k * (h - 0.2) / (levels - 1) if levels > 1 else 0.1
        for dz in (-1, 1):
            s(box(f'{name}_beam{k}{dz}', (cx, y, cz + dz * d / 2), (w, 0.08, 0.05), 'charcoal'))
        s(box(f'{name}_deck{k}', (cx, y + 0.045, cz), (w - 0.04, 0.01, d - 0.04), 'grey'))
        if k < levels - 1:
            for j, ox in enumerate((-0.31, 0.31)):
                if (k + j) % 3 != 2:
                    carton(f'{name}_box{k}{j}', (cx + ox, y + 0.05 + 0.25, cz), (0.52, 0.5, 0.5))
    for dz in (-1, 1):   # cross bracing on the sides
        s(box(f'{name}_brace{dz}', (cx - w / 2, h / 2, cz + dz * 0.0), (0.03, 0.03, d), 'charcoal'))

def amr(name, cx, cz, cargo=True):
    s(box(f'{name}_body', (cx, 0.16, cz), (0.9, 0.22, 0.65), 'charcoal'))
    s(box(f'{name}_skirt', (cx, 0.04, cz), (0.84, 0.06, 0.58), 'glass'))
    s(box(f'{name}_deck', (cx, 0.285, cz), (0.86, 0.03, 0.6), 'grey'))
    if cargo:
        carton(f'{name}_load', (cx, 0.30 + 0.25, cz), (0.62, 0.5, 0.46))

# ------------------------------------------------------------------ layout (flow along +X)
H = 0.80   # conveyor / table top

# infeed racks (back left)
rack('rackA', -5.6, -2.3)
rack('rackB', -4.15, -2.3)

# conveyor A with parts waiting, R1, conveyor B, R2 in a fenced cell, inspection table, outbound pallet
conveyor('convA', -4.4, -1.55, 0.0, H)
for i, x in enumerate((-3.9, -3.3, -2.7)):
    s(part(f'waitA{i}', x, H, 0.0))
conveyor('convB', -0.25, 2.45, 0.0, H)
for i, x in enumerate((0.75, 1.35)):
    s(part(f'waitB{i}', x, H, 0.0))

r1 = robot('R1', -0.9, -0.95)
empty('R1_pickA', (-1.8, H + 0.18, 0.0))
empty('R1_pickB', (0.05, H + 0.18, 0.0))
part('R1_part', -1.8, H, 0.0)

r2 = robot('R2', 3.3, 0.85)
table('inspect', 4.45, 0.0, 0.9, 0.7, H)
empty('R2_pickA', (2.2, H + 0.18, 0.0))
empty('R2_pickB', (4.35, H + 0.18, 0.0))
part('R2_part', 2.2, H, 0.0)
s(part('inspectDone', 4.65, H, 0.18))

# fenced cell around R2 (open towards the line, door gap in front)
fence_panel('fL1', (1.45, 0.55), (1.45, 1.65))
fence_panel('fL2', (1.45, 1.65), (1.45, 2.75))
fence_panel('fF1', (1.45, 2.75), (2.45, 2.75))
fence_panel('fF2', (2.45, 2.75), (3.45, 2.75))
fence_panel('fF3', (4.25, 2.75), (5.25, 2.75))   # gap 3.45..4.25 = door
fence_panel('fR1', (5.25, 2.75), (5.25, 1.65))
fence_panel('fR2', (5.25, 1.65), (5.25, 0.55))

# machining centre behind R1 (out of the robot's reach)
s(box('cnc_body', (-1.0, 1.1, -3.6), (2.0, 2.2, 1.6), 'ivory'))
s(box('cnc_plinth', (-1.0, 0.05, -3.6), (2.06, 0.1, 1.66), 'charcoal'))
s(box('cnc_opening', (-0.85, 0.95, -2.79), (1.2, 1.05, 0.04), 'glass'))
s(box('cnc_bed', (-0.85, 0.62, -2.95), (1.0, 0.12, 0.35), 'grey'))
s(cyl('cnc_spindle', (-0.75, 1.25, -2.95), 0.11, 0.45, 'y', 'grey', 16))
s(box('cnc_panel', (-1.88, 1.3, -2.78), (0.22, 1.0, 0.06), 'glass'))
s(box('cnc_top', (-1.0, 2.35, -3.8), (0.6, 0.3, 0.6), 'charcoal'))
lamp = cyl('glow_cnc', (-0.1, 2.27, -2.9), 0.03, 0.14, 'y', 'amber', 10)

# control cabinet + lamp
s(box('cab_body', (5.9, 0.95, -1.1), (0.8, 1.9, 0.5), 'ivory'))
s(box('cab_screen', (5.9, 1.45, -0.84), (0.34, 0.24, 0.02), 'glass'))
s(box('cab_plinth', (5.9, 0.04, -1.1), (0.84, 0.08, 0.54), 'charcoal'))
for i in range(3):
    s(cyl(f'cab_btn{i}', (5.72 + i * 0.09, 1.18, -0.84), 0.025, 0.03, 'z', 'charcoal', 10))
cyl('glow_cab', (6.15, 1.97, -1.1), 0.035, 0.08, 'y', 'amber', 10)

# outbound pallet
s(box('pallet', (6.3, 0.07, 1.2), (1.2, 0.14, 1.0), 'sand'))
for i, (ox, oz) in enumerate(((-0.3, -0.25), (0.3, -0.25), (-0.3, 0.25), (0.3, 0.25))):
    carton(f'out{i}', (6.3 + ox, 0.14 + 0.2, 1.2 + oz), (0.56, 0.4, 0.46))
for i, (ox, oz) in enumerate(((-0.3, -0.25), (0.3, -0.25))):
    carton(f'out_t{i}', (6.3 + ox, 0.54 + 0.2, 1.2 + oz), (0.56, 0.4, 0.46))

# parked AMRs (front left)
amr('amr1', -4.3, 1.8)
amr('amr2', -2.8, 2.6)

# ------------------------------------------------------------------ merge static geometry per material, export
by_mat = {}
for ob in STATIC:
    if ob.name in bpy.data.objects:
        by_mat.setdefault(ob.data.materials[0].name, []).append(ob)
for name, obs in by_mat.items():
    tgt = obs[0]
    join(tgt, obs[1:])
    tgt.name = f'static_{name}'
    tgt.data.name = tgt.name

for o in bpy.context.selected_objects:
    o.select_set(False)
os.makedirs(os.path.dirname(OUT), exist_ok=True)
bpy.ops.export_scene.gltf(
    filepath=OUT, export_format='GLB', export_yup=True, export_apply=True,
    export_texcoords=False, export_normals=True, export_materials='EXPORT',
    export_draco_mesh_compression_enable=False, export_extras=False, export_cameras=False, export_lights=False)
print('wrote', os.path.abspath(OUT), os.path.getsize(OUT), 'bytes')
