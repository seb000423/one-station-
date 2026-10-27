"""Builds assets/layouts/unity-factory-warehouse.json: the Unity Factory and Unity Warehouse demo scenes side by side
as one console 1 factory document, from assets/models/unity-*/scene-placements.json (exported from the demo scenes).

Big pieces are their own 'ufmodel' objects (the two buildings, forklifts, pallet robots, roll trolleys, warehouse
workers); everything else becomes model groups ('ufmodel' with params.items, js/factory-unity-groups.js): the factory's
4 x 4 production blocks, the warehouse's pallet racks with the stock on them, and the floor stock areas.
Usage: python tools/unity-demo-layout.py   (from the repo root)"""
import json, math, os

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
GAP = 4.0  # m between the factory building and the warehouse building
r3 = lambda v: round(v, 3)
def scene(name):
    with open(os.path.join(ROOT, 'assets/models', name, 'scene-placements.json'), encoding='utf-8') as f: return json.load(f)['items']
with open(os.path.join(ROOT, 'js/factory-unity.js'), encoding='utf-8') as f: src = f.read()
def size(key):  # catalog size [x, y, z] from js/factory-unity.js
    i = src.index(key + ': {'); s = src[src.index('size: [', i) + 7:]; return [float(v) for v in s[:s.index(']')].split(',')]

fac, wh = scene('unity-factory'), scene('unity-warehouse')
fb = next(i for i in fac if i['catalogKey'] == 'uf_building'); wb = next(i for i in wh if i['catalogKey'] == 'uw_building')
fs, ws = size('uf_building'), size('uw_building')
# warehouse to the right (+X) of the factory, both buildings' near walls GAP apart, z kept from the scenes
dx = (fb['x'] + fs[0] / 2 + GAP) - (wb['x'] - ws[0] / 2)
x0, x1 = fb['x'] - fs[0] / 2, wb['x'] + dx + ws[0] / 2
z0, z1 = min(fb['z'] - fs[2] / 2, wb['z'] - ws[2] / 2), max(fb['z'] + fs[2] / 2, wb['z'] + ws[2] / 2)
cx, cz = (x0 + x1) / 2, (z0 + z1) / 2
W, D = math.ceil(x1 - x0) + 2, math.ceil(z1 - z0) + 2

objects, seq = [], [0]
def oid(): seq[0] += 1; return 'u%03d' % seq[0]
def single(it, name, shift=0):
    o = {'id': oid(), 'type': 'ufmodel', 'name': name, 'x': r3(it['x'] + shift - cx), 'z': r3(it['z'] - cz), 'rot': r3(math.radians(it['yawDeg'])),
         'params': {'model': it['catalogKey'], 'scale': 1, 'cycle': 12}}
    if abs(it['y']) > 0.01: o['y'] = r3(it['y'])
    objects.append(o)
def group(items, name, shift=0):
    if not items: return
    xs = [i['x'] for i in items]; zs = [i['z'] for i in items]
    def ext(i):  # half extents of the rotated footprint
        w, _, d = size(i['catalogKey']); a = math.radians(i['yawDeg']); return (abs(math.cos(a)) * w + abs(math.sin(a)) * d) / 2, (abs(math.sin(a)) * w + abs(math.cos(a)) * d) / 2
    gx = (min(i['x'] - ext(i)[0] for i in items) + max(i['x'] + ext(i)[0] for i in items)) / 2
    gz = (min(i['z'] - ext(i)[1] for i in items) + max(i['z'] + ext(i)[1] for i in items)) / 2
    out = []
    for i in items:
        row = [i['catalogKey'], r3(i['x'] - gx), r3(i['y']), r3(i['z'] - gz), r3(i['yawDeg'])]
        if i.get('quat') or isinstance(i['scale'], list):
            row += [i.get('quat') or [0, math.sin(math.radians(i['yawDeg']) / 2), 0, math.cos(math.radians(i['yawDeg']) / 2)], i['scale'] if isinstance(i['scale'], list) else [i['scale']] * 3]
        out.append(row)
    objects.append({'id': oid(), 'type': 'ufmodel', 'name': name, 'x': r3(gx + shift - cx), 'z': r3(gz - cz), 'rot': 0, 'params': {'model': 'line01', 'scale': 1, 'cycle': 12, 'items': out}})

# ---- factory: the building + 4 x 4 production blocks (rows A-D along z, columns 1-4 along x)
single(fb, '공장 건물')
bx0, bz0 = fb['x'] - fs[0] / 2, fb['z'] - fs[2] / 2
blocks = {}
for i in fac:
    if i is fb: continue
    c = min(3, max(0, int((i['x'] - bx0) / (fs[0] / 4)))); r = min(3, max(0, int((i['z'] - bz0) / (fs[2] / 4))))
    blocks.setdefault((r, c), []).append(i)
for (r, c) in sorted(blocks): group(blocks[(r, c)], '생산 블록 %s%d' % ('ABCD'[r], c + 1))

# ---- warehouse: the building, vehicles and workers on their own, racks with their stock, floor stock areas
single(wb, '창고 건물', dx)
SOLO = {'uw_forklift': '지게차', 'uw_reachlift': '리치 지게차', 'uw_palletrobot': '팔레트 운반 로봇', 'uw_trolley': '롤 대차', 'uw_worker': '작업자'}
count = {}
for i in wh:
    k = i['catalogKey']
    if k in SOLO and not i.get('quat'):
        count[k] = count.get(k, 0) + 1; single(i, '%s %d' % (SOLO[k], count[k]), dx)
rest = [i for i in wh if i is not wb and not (i['catalogKey'] in SOLO and not i.get('quat'))]
shelves = sorted([i for i in rest if i['catalogKey'] == 'uw_shelf'], key=lambda s: (round(s['z']), s['x']))
# back-to-back racks (closer than 2 m, same row) form one rack group
racks = []
for s in shelves:
    if racks and abs(racks[-1][-1]['x'] - s['x']) < 2 and abs(racks[-1][-1]['z'] - s['z']) < 0.5 and racks[-1][-1]['yawDeg'] == s['yawDeg']: racks[-1].append(s)
    else: racks.append([s])
def on(s, i):  # item inside a shelf's footprint (0.25 m margin)
    w, _, d = size('uw_shelf'); a = math.radians(s['yawDeg']); hx = (abs(math.cos(a)) * w + abs(math.sin(a)) * d) / 2 + 0.25; hz = (abs(math.sin(a)) * w + abs(math.cos(a)) * d) / 2 + 0.25
    return abs(i['x'] - s['x']) <= hx and abs(i['z'] - s['z']) <= hz
stock = [i for i in rest if i['catalogKey'] != 'uw_shelf']
for n, rk in enumerate(racks, 1):
    mine = [i for i in stock if any(on(s, i) for s in rk)]
    stock = [i for i in stock if not any(on(s, i) for s in rk)]
    group(rk + mine, '파렛트 랙 %d' % n, dx)
# floor stock: single-linkage clusters (items within 2.5 m), tiny clusters join their nearest bigger one
cl = []
for i in stock:
    near = [c for c in cl if any(math.hypot(i['x'] - j['x'], i['z'] - j['z']) < 2.5 for j in c)]
    merged = [i] + [j for c in near for j in c]; cl = [c for c in cl if c not in near] + [merged]
big = [c for c in cl if len(c) >= 6] or cl
for c in [c for c in cl if c not in big]:
    best = min(big, key=lambda b: min(math.hypot(c[0]['x'] - j['x'], c[0]['z'] - j['z']) for j in b)); best.extend(c)
for n, c in enumerate(sorted(big, key=lambda c: (min(j['z'] for j in c), min(j['x'] for j in c))), 1): group(c, '적재 구역 %d' % n, dx)

doc = {'version': 2, 'factory': {'width': W, 'depth': D, 'height': 10}, 'objects': objects}
out = os.path.join(ROOT, 'assets/layouts/unity-factory-warehouse.json')
os.makedirs(os.path.dirname(out), exist_ok=True)
with open(out, 'w', encoding='utf-8') as f: json.dump(doc, f, ensure_ascii=False, separators=(',', ':'))
print(out, W, 'x', D, 'm,', len(objects), 'objects,', sum(len(o['params'].get('items', [])) for o in objects), 'grouped items')
