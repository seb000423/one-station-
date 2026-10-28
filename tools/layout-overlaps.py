"""Footprint overlap check for a ONE BUILDER layout: python tools/layout-overlaps.py [assets/layouts/egr-factory.json]
Rotated rectangles (separating axis test) for equipment (ufmodel by catalog size, bench, rack, column, kpi, wall) and for the zones AMRs stop
in; prints every pair that intersects by more than 2 cm, except a zone with its own AMR access over nothing."""
import json, math, re, sys, os
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
doc = json.load(open(sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, 'assets/layouts/egr-factory.json'), encoding='utf-8'))
cat = {}
for m in re.finditer(r"(\w+): \{ label: '([^']*)'[^}]*?size: \[([\d.]+), ([\d.]+), ([\d.]+)\]", open(os.path.join(ROOT, 'js/factory-unity.js'), encoding='utf-8').read()):
    cat[m.group(1)] = (float(m.group(3)), float(m.group(5)))
def rect(o):
    p, t = o.get('params', {}), o['type']
    if t == 'ufmodel': w, d = cat.get(p.get('model'), (0, 0))
    elif t == 'bench': w, d = p.get('length', 1.6), p.get('depth', 0.8)
    elif t == 'rack': w, d = p.get('bays', 1) * p.get('bayWidth', 2.7), p.get('depth', 1.1)
    elif t == 'column': w, d = p.get('w', 0.3), p.get('d', 0.4)
    elif t == 'wall': w, d = p.get('length', 1), p.get('thickness', 0.2)
    elif t == 'zone' and p.get('track'): w, d = p.get('w', 2), p.get('d', 2)
    else: return None
    if not w or not d: return None
    c, s = math.cos(o.get('rot', 0)), math.sin(o.get('rot', 0))
    return [(o['x'] + c * dx - s * dz, o['z'] + s * dx + c * dz) for dx, dz in ((-w / 2, -d / 2), (w / 2, -d / 2), (w / 2, d / 2), (-w / 2, d / 2))]
def overlap(a, b):
    depth = 1e9
    for poly in (a, b):
        for i in range(4):
            (x0, z0), (x1, z1) = poly[i], poly[(i + 1) % 4]; nx, nz = z1 - z0, x0 - x1; L = math.hypot(nx, nz); nx, nz = nx / L, nz / L
            pa = [x * nx + z * nz for x, z in a]; pb = [x * nx + z * nz for x, z in b]
            o = min(max(pa), max(pb)) - max(min(pa), min(pb))
            if o <= 0: return 0
            depth = min(depth, o)
    return depth
items = [(o, rect(o)) for o in doc['objects']]; items = [(o, r) for o, r in items if r]
bad = 0
for i in range(len(items)):
    for j in range(i + 1, len(items)):
        (a, ra), (b, rb) = items[i], items[j]
        if a['type'] == 'wall' and b['type'] in ('wall', 'column') or b['type'] == 'wall' and a['type'] == 'column': continue
        d = overlap(ra, rb)
        if d > 0.02: bad += 1; print(f"{d:5.2f} m  {a['type']}:{a['name']}  ×  {b['type']}:{b['name']}")
print(bad, 'overlaps')
