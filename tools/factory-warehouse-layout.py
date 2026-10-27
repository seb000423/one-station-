"""Builds assets/layouts/factory-warehouse.json, ONE BUILDER's example scene: a working factory (22 x 22 m, two
assembly lines) and a warehouse (13 x 22 m, two pallet racks) joined by an 8 m corridor with open doors.

Each process of a line is one model group (params.items, js/factory-unity-groups.js); the belts between processes are
single belt models carrying products (params.flow). Two pallet robots run a one-way loop through both buildings
(finished goods: line end -> warehouse receiving; parts: warehouse -> line start), docking on short two-way spurs; a
forklift puts receiving stock away at the rack end. Workers walk along each line, through the corridor and down the
rack aisle. Rack stock is copied from the warehouse demo scene's racks (assets/models/unity-warehouse/scene-placements.json).
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

def wall(name, x0, z0, x1, z1, h=4):
    L = math.hypot(x1 - x0, z1 - z0)
    return add('wall', name, (x0 + x1) / 2, (z0 + z1) / 2, PI2 if abs(x1 - x0) < 1e-6 else 0, {'length': r3(L), 'thickness': 0.2, 'h': h})

def zone(name, kind, x, z, w, d, **p):
    return add('zone', name, x, z, 0, dict({'kind': kind, 'w': w, 'd': d, 'label': name}, **p))

def route(name, pts, oneway=False):
    return add('route', name, 0, 0, 0, {'points': [[r3(a), r3(b)] for a, b in pts], 'oneway': oneway})

# ---------------------------------------------------------------- buildings: factory x -22..0, corridor 0..8, warehouse 8..21
FX0, FX1, WX0, WX1, Z = -22, 0, 8, 21, 11
wall('공장 북쪽 벽', FX0, -Z, FX1, -Z); wall('공장 남쪽 벽', FX0, Z, FX1, Z); wall('공장 서쪽 벽', FX0, -Z, FX0, Z)
wall('공장 동쪽 벽 북', FX1, -Z, FX1, -2.5); wall('공장 동쪽 벽 남', FX1, 2.5, FX1, Z)
wall('연결 통로 벽 북', FX1, -2.5, WX0, -2.5); wall('연결 통로 벽 남', FX1, 2.5, WX0, 2.5)
wall('창고 북쪽 벽', WX0, -Z, WX1, -Z); wall('창고 남쪽 벽', WX0, Z, WX1, Z)
wall('창고 서쪽 벽 북', WX0, -Z, WX0, -2.5); wall('창고 서쪽 벽 남', WX0, 2.5, WX0, Z)
wall('창고 동쪽 벽 북', WX1, -Z, WX1, -7.9); wall('창고 동쪽 벽 남', WX1, -4.1, WX1, Z)
add('door', '공장 출입문', FX1, 0, PI2, {'width': 4, 'height': 3.2, 'thickness': 0.2, 'open': True})
add('door', '창고 출입문', WX0, 0, PI2, {'width': 4, 'height': 3.2, 'thickness': 0.2, 'open': True})
add('door', '출하 도크 문', WX1, -6, PI2, {'width': 3.6, 'height': 3.6, 'thickness': 0.2})

# ---------------------------------------------------------------- factory: two lines flowing west -> east
for L, z0, s in (('A', -6.5, -1), ('B', 6.5, 1)):
    group(f'{L}라인 1 자재 투입', [('line01', -19.8, 0, z0, 90), ('uf_wagon', -19.8, 0, z0 + s * 1.45, 90), ('product', -19.8, 1.26, z0, 0)])
    model(f'{L}라인 컨베이어 1', 'line05', -18.2, z0, PI2, flow={'speed': 0.25, 'pitch': 1.1, 'item': 'product'})
    group(f'{L}라인 2 가공', [('line06', -16.5, 0, z0, 90), ('ctrl2', -16.5, 0, z0 - s * 1.35, 90), ('product', -16.5, 0.86, z0, 0)])
    model(f'{L}라인 컨베이어 2', 'line04', -13.5, z0, PI2, flow={'speed': 0.25, 'pitch': 1.2, 'item': 'product'})
    model(f'{L}라인 3 로봇 조립', 'cell07', -9.5, z0, 0, cycle=10)
    model(f'{L}라인 컨베이어 3', 'line05', -6.7, z0, PI2, flow={'speed': 0.25, 'pitch': 1.1, 'item': 'product'})
    group(f'{L}라인 4 검사 · 포장', [('line02', -5.1, 0, z0, 90), ('line08', -5.1, 0, z0 - s * 1.25, 90), ('ctrl3', -4.15, 0, z0 - s * 1.3, 0),
                                   ('product', -5.1, 0.89, z0, 0), ('uw_pallet', -4.0, 0, z0 + s * 0.2, 0), ('uw_cardboard_b2', -4.0, 0.13, z0 + s * 0.2, 0)])
    zone(f'자재 투입 {L}', 'dropoff', -19.8, s * 3.0, 2.0, 2.0, track=True, stock=1, cap=4, consume=45)
    zone(f'출하 대기 {L}', 'pickup', -3.5, s * 3.0, 2.0, 2.0, track=True, stock=1, cap=4, supply=40)
    ww = add('walkway', f'{L}라인 작업 통로', -12.0, s * 4.3, 0, {'length': 12.8, 'width': 0.8, 'label': f'{L}라인 작업 통로'})
    add('worker', f'{L}라인 작업자', -12.0, s * 4.3, 0, {'walkway': ww['id'], 'speed': 0.9, 'dwell': 6})

# ---------------------------------------------------------------- warehouse: receiving / parts staging by the door, two racks
zone('입고 구역', 'dropoff', 9.95, -3.2, 2.1, 2.0, track=True, stock=0, cap=6)
zone('자재 출고', 'pickup', 9.95, 3.2, 2.1, 2.0, track=True, stock=3, cap=6, supply=30)
zone('랙 보관', 'storage', 15.75, 9.8, 2.6, 1.6, track=True, stock=0, cap=99, consume=25)
with open(os.path.join(ROOT, 'assets/models/unity-warehouse/scene-placements.json'), encoding='utf-8') as f: demo = json.load(f)['items']
SX, SZ = -6.91, 23.978  # a fully stocked rack of the warehouse demo scene
stock = [i for i in demo if abs(i['x'] - SX) <= 0.82 and abs(i['z'] - SZ) <= 8 and i['catalogKey'] != 'uw_shelf']
pallets = [i for i in stock if i['catalogKey'] == 'uw_pallet']
# one load per pallet: the pallet and the box standing right on it
loads = []
for p in pallets:
    on = [i for i in stock if i['catalogKey'] != 'uw_pallet' and abs(i['y'] - p['y'] - 0.13) < 0.03 and abs(i['z'] - p['z']) < 0.45]
    loads.append(p); loads += on[:1]
for n, rx in ((1, 13.5), (2, 18.0)):
    group(f'파렛트 랙 {n}', [('uw_shelf', rx, 0, -1.0, 0)] + [(i['catalogKey'], rx + i['x'] - SX, i['y'], -1.0 + i['z'] - SZ, i['yawDeg']) for i in loads])
group('빈 팔레트 적치', [('uw_sunoko', 9.9, 0.13 * k, -8.6, 0) for k in range(6)] + [('uw_sunoko', 11.2, 0.13 * k, -8.6, 0) for k in range(4)])
group('롤 대차 대기', [('uw_trolley', 13.6 + 1.3 * k, 0, -9.9, 0) for k in range(3)])
ww = add('walkway', '랙 통로', 15.75, -0.75, PI2, {'length': 12.5, 'width': 0.8, 'label': '랙 통로'})
add('worker', '피킹 작업자', 15.75, -0.75, 0, {'walkway': ww['id'], 'speed': 0.8, 'dwell': 8})
wr = add('walkroute', '공장 ↔ 창고 보행 경로', 0, 0, 0, {'points': [[-4.6, 0], [10.6, 0]]})
add('worker', '운반 담당 작업자', -4.6, 0, 0, {'walkway': wr['id'], 'speed': 1.0, 'dwell': 10})

# ---------------------------------------------------------------- AMR network: one-way loop, small loop by the warehouse door, dock spurs
E, W = -1.2, 1.2  # eastbound lane z, westbound lane z
route('순환 경로', [(-20.5, E), (-19.8, E), (-3.5, E), (8.6, E), (9.95, E), (11.2, E), (11.2, W), (9.95, W), (8.6, W), (-3.5, W), (-19.8, W), (-20.5, W), (-20.5, E)], oneway=True)
route('창고 앞 회차', [(8.6, W), (8.6, E)], oneway=True)
for x, z0, z1, nm in ((-19.8, E, -1.85, '자재 투입 A'), (-3.5, E, -1.85, '출하 대기 A'), (9.95, E, -2.05, '입고 구역'),
                      (-19.8, W, 1.85, '자재 투입 B'), (-3.5, W, 1.85, '출하 대기 B'), (9.95, W, 2.05, '자재 출고')):
    route(f'{nm} 도킹', [(x, z0), (x, z1)])
route('랙 보관 진입로', [(11.2, W), (11.2, 8.2), (15.75, 8.2)])

ref = {o['name']: 'zone:' + o['id'] for o in objects if o['type'] == 'zone'}
stop = lambda at, act, dwell=6: {'at': ref[at], 'act': act, 'dwell': dwell}
add('amr', '운반 로봇 1', 4.0, E, 0, {'model': 'uw_palletrobot', 'length': 1.0, 'width': 0.8, 'speed': 1.0, 'payload': 500, 'dwell': 6,
    'stops': [stop('출하 대기 A', 'load'), stop('입고 구역', 'unload'), stop('자재 출고', 'load'), stop('자재 투입 A', 'unload')]})
add('amr', '운반 로봇 2', -8.0, W, 0, {'model': 'uw_palletrobot', 'length': 1.0, 'width': 0.8, 'speed': 1.0, 'payload': 500, 'dwell': 6,
    'stops': [stop('출하 대기 B', 'load'), stop('입고 구역', 'unload'), stop('자재 출고', 'load'), stop('자재 투입 B', 'unload')]})
add('amr', '지게차 1', 13.0, 8.2, 0, {'model': 'uw_forklift', 'length': 3.2, 'width': 1.5, 'speed': 1.1, 'payload': 1500, 'dwell': 8,
    'stops': [stop('입고 구역', 'load'), stop('랙 보관', 'unload')]})

doc = {'version': 2, 'factory': {'width': 48, 'depth': 28, 'height': 8}, 'objects': objects}
out = os.path.join(ROOT, 'assets/layouts/factory-warehouse.json')
with open(out, 'w', encoding='utf-8') as f: json.dump(doc, f, ensure_ascii=False, separators=(',', ':'))
print(out, len(objects), 'objects,', sum(len(o['params'].get('items', [])) for o in objects), 'grouped models')
