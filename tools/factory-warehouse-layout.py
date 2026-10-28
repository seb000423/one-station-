"""Builds assets/layouts/factory-warehouse.json, ONE BUILDER's example scene: a factory and a warehouse, both real
Asset Store buildings at real scale, cropped to a workable size (params.crop, js/factory-unity-groups.js) and
joined across a yard through doorways cut into their walls (params.cut): one 6 m vehicle door and one
pedestrian door per building, facing each other.

Material flow, so that every mover has a job:
  parts pallets   warehouse 자재 출고 --(pallet robots)--> factory 자재 투입 A / B (consumed by the lines)
  the lines       투입 → belt (egr-line-v3 2 m belts) → 가공 → belt → 로봇 조립 (pick & place in time with the belt) → belt → 포장
                  (trays stack on a pallet, 적재 n / 8) → a full pallet appears in 출하 대기
  finished goods  출하 대기 A / B --(forklift, forks up at the rack)--> warehouse 랙 보관
  people          line operators tend 가공 ↔ 로봇 셀, packers stand at the pallet, a picker walks the rack
                  aisle with a cart, a checker pushes a cart between the buildings on the pedestrian path
AMR network: a one-way loop through both vehicle doors (westbound lane north, eastbound south), a one-way inner
loop along the factory's north wall for line B, and short two-way dock spurs.
Usage: python tools/factory-warehouse-layout.py   (from the repo root)"""
import json, math, os

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
r3 = lambda v: round(v, 3)
PI2 = r3(math.pi / 2)
objects, seq = [], [0]

def add(type_, name, x, z, rot=0, params=None, **extra):
    seq[0] += 1
    o = {'id': 'fw%02d' % seq[0], 'type': type_, 'name': name, 'x': r3(x), 'z': r3(z), 'rot': rot, 'params': params or {}}
    o.update(extra); objects.append(o); return o

def model(name, key, x, z, rot=0, **params):
    return add('ufmodel', name, x, z, rot, dict({'model': key, 'scale': 1, 'cycle': 12}, **params))

def group(name, items):
    """items: (catalog key, x, y, z, yaw deg) in world metres; the group sits at the items' centre"""
    gx = sum(i[1] for i in items) / len(items); gz = sum(i[3] for i in items) / len(items)
    return add('ufmodel', name, gx, gz, 0, {'model': 'line01', 'scale': 1, 'cycle': 12,
               'items': [[k, r3(x - gx), r3(y), r3(z - gz), r3(yaw)] for k, x, y, z, yaw in items]})

def zone(name, kind, x, z, w, d, **p):
    return add('zone', name, x, z, 0, dict({'kind': kind, 'w': w, 'd': d, 'label': name}, **p))

def route(name, pts, oneway=False):
    return add('route', name, 0, 0, 0, {'points': [[r3(a), r3(b)] for a, b in pts], 'oneway': oneway})

# ---------------------------------------------------------------- buildings (model-local crop / cut boxes, metres)
# factory: the asset's north-east quarter (34 x 34 m); its east wall (local x 33) faces the yard at world x = -7
# warehouse: the asset's north half (38 x 33 m); its west wall (local x -18.7) faces the yard at world x = 9.3
VDOOR, PDOOR = 10.0, 14.5   # world z of the vehicle door (6 m wide: two lanes 4.2 m apart, so the forklift's safety circle never spans both) and the pedestrian door
FX, FZ, WX, WZ = -40, 17, 28, 16.5
model('공장 건물', 'uf_building', FX, FZ, 0, crop=[-1, 34, -34, 0],
      cut=[[31.5, 34.5, r3(VDOOR - FZ - 3), r3(VDOOR - FZ + 3), 3.5], [31.5, 34.5, r3(PDOOR - FZ - 1), r3(PDOOR - FZ + 1), 3.0]])
model('창고 건물', 'uw_building', WX, WZ, 0, crop=[-19, 19, -33, 0],
      cut=[[-20.2, -17.2, r3(VDOOR - WZ - 3), r3(VDOOR - WZ + 3), 3.6], [-20.2, -17.2, r3(PDOOR - WZ - 1), r3(PDOOR - WZ + 1), 3.0]])

# ---------------------------------------------------------------- AMR lanes (world z): westbound W, eastbound E, inner loop N
W, E, N = VDOOR - 2.1, VDOOR + 2.1, -14.0
XIN, XPACK, XW, XE, XOUT, XRACK = -36.0, -20.0, -38.5, 44.0, 14.0, 30.0  # dock / junction x

# ---------------------------------------------------------------- factory: two lines flowing west -> east
# A: zones on its south side (W lane), B: zones on its north side (inner lane)
for L, z0, s, zzone in (('A', 2.0, 1, W - 2.65), ('B', -7.0, -1, N + 3.0)):
    zw = z0 - s * 2.5  # the operators' side
    group(f'{L}라인 1 자재 투입', [('line01', XIN, 0, z0, 90), ('uf_wagon', XIN, 0, z0 - s * 1.45, 90), ('product', XIN, 1.26, z0, 0)])
    model(f'{L}라인 컨베이어 1', 'e3_belt_conveyor_2m', -34.0, z0, 0, flow={'speed': 0.15, 'pitch': 1.0, 'item': 'product'})
    group(f'{L}라인 2 가공', [('line06', -31.7, 0, z0, 90), ('ctrl2', -31.7, 0, z0 + s * 1.35, 90), ('product', -31.7, 0.86, z0, 0)])
    for k, dx in enumerate((-1.02, 1.02)): model(f'{L}라인 컨베이어 2-{k + 1}', 'e3_belt_conveyor_2m', -28.3 + dx, z0, 0, flow={'speed': 0.15, 'pitch': 1.0, 'item': 'product'})
    model(f'{L}라인 3 로봇 조립', 'cell07', -23.8, z0, 0, cycle=7.5)  # one pick & place per tray leaving belt 2 (4.65 m / 0.15 m/s / 4 trays)
    # belt 3 ends at the packing table; trays stack 8 to a pallet beside it (dx/dz in the belt's frame: local +z = world +x)
    model(f'{L}라인 컨베이어 3', 'e3_belt_conveyor_2m', -20.6, z0, 0, flow={'speed': 0.15, 'pitch': 1.0, 'item': 'product'}, pack={'n': 8, 'dx': 0.6, 'dz': r3(s * 1.6), 'item': 'product'})  # dx/dz in the belt's frame (rot 0: = world x / z)
    group(f'{L}라인 4 검사 · 포장', [('line02', -18.8, 0, z0, 90), ('line08', -18.8, 0, z0 + s * 1.25, 90), ('ctrl3', -17.9, 0, z0 + s * 1.3, 0), ('product', -18.8, 0.89, z0, 0)])
    zone(f'자재 투입 {L}', 'dropoff', XIN, zzone, 2.2, 2.0, track=True, stock=1, cap=3, consume=120, load='uw_cardboard_a1')
    zone(f'출하 대기 {L}', 'pickup', XPACK, zzone, 2.2, 2.0, track=True, stock=0, cap=3, supply=60, load='tray')  # a pallet every 8 trays x 7.5 s
    ww = add('walkway', f'{L}라인 작업 통로', -27.75, zw, 0, {'length': 9.5, 'width': 0.8, 'label': f'{L}라인 작업 통로'})
    add('worker', f'{L}라인 가공 담당', -31.7, zw, 0, {'walkway': ww['id'], 'speed': 0.9, 'dwell': 25})
    wr = add('walkroute', f'{L}라인 포장 동선', 0, 0, 0, {'points': [[-18.6, r3(z0 + s * 1.3)], [XPACK + 1.3, r3(z0 + s * 2.3)]]})
    add('worker', f'{L}라인 포장 담당', -18.6, z0 + s * 1.3, 0, {'walkway': wr['id'], 'speed': 0.8, 'dwell': 12})

# ---------------------------------------------------------------- warehouse: parts staging by the door, two racks with an aisle
zone('자재 출고', 'pickup', XOUT, W - 2.65, 2.2, 2.0, track=True, stock=4, cap=6, supply=40, load='uw_cardboard_a1')
zone('랙 보관', 'storage', XRACK, W - 2.65, 2.6, 2.0, track=True, stock=0, cap=6, consume=90, load='tray')
with open(os.path.join(ROOT, 'assets/models/unity-warehouse/scene-placements.json'), encoding='utf-8') as f: demo = json.load(f)['items']
SX, SZ = -6.91, 23.978  # a fully stocked rack of the warehouse demo scene
stock = [i for i in demo if abs(i['x'] - SX) <= 0.82 and abs(i['z'] - SZ) <= 8 and i['catalogKey'] != 'uw_shelf']
pallets = [i for i in stock if i['catalogKey'] == 'uw_pallet']
loads = []  # one load per pallet: the pallet and the box standing right on it
for p in pallets:
    on = [i for i in stock if i['catalogKey'] != 'uw_pallet' and abs(i['y'] - p['y'] - 0.13) < 0.03 and abs(i['z'] - p['z']) < 0.45]
    loads.append(p); loads += on[:1]
RZ = -3.25  # rack centre z: the racks run from z 4.5 down to -11, the aisle between them at x = XRACK
for n, rx in ((1, XRACK - 2.8), (2, XRACK + 2.8)):
    group(f'파렛트 랙 {n}', [('uw_shelf', rx, 0, RZ, 0)] + [(i['catalogKey'], rx + i['x'] - SX, i['y'], RZ + i['z'] - SZ, i['yawDeg']) for i in loads])
group('빈 팔레트 적치', [('uw_sunoko', 12.0, 0.13 * k, -2.0, 0) for k in range(6)] + [('uw_sunoko', 13.3, 0.13 * k, -2.0, 0) for k in range(4)])
group('롤 대차 대기', [('uw_trolley', 12.0 + 1.3 * k, 0, 1.5, 0) for k in range(3)])
model('리치 지게차 (대기)', 'uw_reachlift', 41.0, 2.0, PI2)
ww = add('walkway', '랙 통로', XRACK, -3.5, PI2, {'length': 13.0, 'width': 0.8, 'label': '랙 통로'})
add('worker', '피킹 작업자', XRACK, -3.5, 0, {'walkway': ww['id'], 'speed': 0.8, 'dwell': 10, 'prop': 'uw_trolley'})
wr = add('walkroute', '공장 ↔ 창고 보행 경로', 0, 0, 0, {'points': [[-16.0, PDOOR], [24.0, PDOOR]]})
add('worker', '자재 검수 담당', 24.0, PDOOR, 0, {'walkway': wr['id'], 'speed': 1.0, 'dwell': 20, 'prop': 'uw_trolley'})

# ---------------------------------------------------------------- AMR network
route('순환 경로', [(XW, E), (-10, E), (XE, E), (XE, W), (XRACK, W), (XOUT, W), (XPACK, W), (XIN, W), (XW, W), (XW, E)], oneway=True)
route('공장 북쪽 순환', [(XW, W), (XW, N), (XIN, N), (XPACK, N), (-10, N), (-10, E)], oneway=True)
for x, z0, z1, nm in ((XIN, W, W - 1.25, '자재 투입 A'), (XPACK, W, W - 1.25, '출하 대기 A'), (XOUT, W, W - 1.25, '자재 출고'), (XRACK, W, W - 1.25, '랙 보관'),
                      (XIN, N, N + 1.6, '자재 투입 B'), (XPACK, N, N + 1.6, '출하 대기 B')):
    route(f'{nm} 도킹', [(x, z0), (x, z1)])

ref = {o['name']: 'zone:' + o['id'] for o in objects if o['type'] == 'zone'}
stop = lambda at, act, dwell=8: {'at': ref[at], 'act': act, 'dwell': dwell}
add('amr', '운반 로봇 1', 20.0, W, 0, {'model': 'uw_palletrobot', 'length': 1.0, 'width': 0.8, 'speed': 1.0, 'payload': 500, 'dwell': 8, 'load': 'uw_cardboard_a1',
    'stops': [stop('자재 출고', 'load'), stop('자재 투입 A', 'unload')]})
add('amr', '운반 로봇 2', -30.0, W, 0, {'model': 'uw_palletrobot', 'length': 1.0, 'width': 0.8, 'speed': 1.0, 'payload': 500, 'dwell': 8, 'load': 'uw_cardboard_a1',
    'stops': [stop('자재 출고', 'load'), stop('자재 투입 B', 'unload')]})
add('amr', '지게차 1', 0.0, E, 0, {'model': 'uw_forklift', 'length': 3.0, 'width': 1.5,  # length: the traffic footprint (the drawn model is 4.7 m with the forks) 'speed': 1.4, 'payload': 1500, 'dwell': 10, 'load': 'tray', 'lift': 1.6, 'liftAt': '랙',
    'stops': [stop('출하 대기 A', 'load'), stop('랙 보관', 'unload', 12), stop('출하 대기 B', 'load'), stop('랙 보관', 'unload', 12)]})

doc = {'version': 2, 'factory': {'width': 110, 'depth': 50, 'height': 12}, 'objects': objects}
out = os.path.join(ROOT, 'assets/layouts/factory-warehouse.json')
with open(out, 'w', encoding='utf-8') as f: json.dump(doc, f, ensure_ascii=False, separators=(',', ':'))
print(out, len(objects), 'objects,', sum(len(o['params'].get('items', [])) for o in objects), 'grouped models')
