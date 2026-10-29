"""Builds assets/layouts/egr-module-asset.json, ONE BUILDER's default example: the EGR cooler welding module line rebuilt from generic
equipment (tools/egr-line-v3/module-line.js → assets/models/egr-line-v3/egr_module_line.glb) in the same 36 x 20 m hall and at the same
place as the CAD cells of egr-weld-module.json, with a KPI board (no floor labels). The line model's frame: x along the flow
from cell A's inlet (x 0) to the leak test outlet (x 26.7), z across (main axis z 1.3); builder x = line x − 15.35, builder z = line z − 4.5.
Usage: python tools/egr-module-asset-layout.py   (from the repo root)"""
import json, math, os

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
r3 = lambda v: round(v, 3)
PI2 = r3(math.pi / 2)
objects, seq = [], [0]
W, D, H = 40, 20, 7   # 40 m: the line (31.4 m) plus a 2.5 m two-way AGV corridor on the west and a forklift corridor on the east (rule set v2.0 §4)

def add(type_, name, x, z, rot=0, params=None, **extra):
    seq[0] += 1
    o = {'id': 'em%03d' % seq[0], 'type': type_, 'name': name, 'x': r3(x), 'z': r3(z), 'rot': rot, 'params': params or {}}
    o.update(extra); objects.append(o); return o

def model(name, key, x, z, rot=0, **params):
    return add('ufmodel', name, x, z, rot, dict({'model': key, 'scale': 1, 'cycle': 12}, **params))

def zone(name, kind, x, z, w=2.2, d=2.0, **p):
    return add('zone', name, x, z, 0, dict({'kind': kind, 'w': w, 'd': d, 'label': name}, **p))

def station(name, x, z, w=1.2, d=0.4): zone(name, 'storage', x, z, w=w, d=d)   # a floor label, no stock

# ---------------------------------------------------------------- building shell (as egr-weld-module.json)
X0, Z0 = W / 2 - 0.1, D / 2 - 0.1
for s, nm in ((-1, '북쪽 벽'), (1, '남쪽 벽')):
    add('wall', nm, 0, s * Z0, 0, {'length': W, 'thickness': 0.2, 'h': 0, 'windows': True})
DOORZ = 3.0
for s, nm in ((-1, '서쪽 벽'), (1, '동쪽 벽')):
    for n, (a, b) in enumerate(((-D / 2, DOORZ - 2.2), (DOORZ + 2.2, D / 2))):
        add('wall', f'{nm} {n + 1}', s * X0, (a + b) / 2, PI2, {'length': r3(b - a), 'thickness': 0.2, 'h': 0, 'windows': True})
add('door', '부품 입고 셔터 (서)', -X0, DOORZ, PI2, {'width': 4, 'height': 4.5, 'thickness': 0.2})
add('door', '출하 셔터 (동)', X0, DOORZ, PI2, {'width': 4, 'height': 4.5, 'thickness': 0.2})
NB = 6
for k in range(NB + 1):
    x = r3(-W / 2 + k * W / NB)
    for z in (-9.75, 9.75): add('column', f'기둥 {"N" if z < 0 else "S"}{k + 1}', x, z, 0, {'w': 0.3, 'd': 0.4, 'h': 0})
    if 0 < k < NB: add('column', f'기둥 C{k}', x, 0, 0, {'w': 0.3, 'd': 0.4, 'h': 0})
for z, nm in ((-5, '지붕 북쪽'), (5, '지붕 남쪽')):
    add('roof', nm, 0, z, 0, {'length': W, 'span': 10, 'h': 0, 'bay': r3(W / NB), 'rise': 0.6, 'sheet': True})

# ---------------------------------------------------------------- the line: one baked model (pallet conveyor line) + the real catalogue assets around it
# The line model exports its station table (assets/models/egr-line-v3/egr_module_line.json, written by tools/egr-line-v3/build.mjs); the static
# real assets (control panels, cabinets, workbench, parts rack, the four workers) are placed from it so they stay aligned with the stations.
with open(os.path.join(ROOT, 'assets/models/egr-line-v3/egr_module_line.json'), encoding='utf-8') as f: T = json.load(f)
S, LZ, BB = T['S'], T['Z0'], T['bbox']
WALL_IN = W / 2 - 0.2                                       # inner face of the end walls (0.2 m thick, centred 0.1 m inside the floor edge)
FENCE_W = -1.4                                              # the line's west guard fence (line x)
XS, ZS = -WALL_IN + 2.65 - FENCE_W, -4.5                    # 2.65 m clear between the west wall and the west fence
L = lambda x, z: (r3(x + XS), r3(z + ZS))
model('EGR 용접 모듈 라인 (A 투입 · 도포 → B 엔드 탱크 · 레이저 → C 택 용접 → D C/F · 외부 도포 → E 리크 테스트)', 'e3_egr_module_line', *L(BB['min'][0] + BB['size'][0] / 2, BB['min'][2] + BB['size'][2] / 2))
MODEL_X0, MODEL_X1 = BB['min'][0] + XS, BB['min'][0] + BB['size'][0] + XS
FENCE_S = LZ - 2.4                                          # the operator-side (−Z) guard fence, line z
# the four people on the line (the only manual stations, as in the CAD), inside the guard on the operator side, facing the line (+z at rot 0)
for nm, x, z in (('투입 작업자 (코어 상자 보급)', S['tote'], LZ - 1.45), ('수동 MIG 작업자', S['manual'] - 0.1, LZ - 0.8), ('수동 검사 작업자', S['check'], LZ - 0.85), ('포장 작업자', S['pack'], LZ - 1.95)):
    model(nm, 'uf_worker', *L(x, z), 0)
model('검사 보조 테이블 (게이지 · OK/NG 트레이)', 'egr_st05', *L(S['check'], LZ - 1.75), 0)
model('수동 MIG 부품 랙 (파이프 · 브래킷)', 'egr_rack', *L(S['cf'] + 0.1, LZ - 1.85), 0)
# control panels and PLC cabinets OUTSIDE the operator-side guard fence, backs to the fence, fronts to the aisle (rot π) with 0.8 m clear in
# front (rule set v2.0 §4): maintenance without entering the cells; none in front of the fence doors (manual MIG, packing) or the open D section
PANELS = []   # (name, x0, x1, z0, z1 of the service space in builder coords)
# (name, model, line x, width along the fence, depth, front): 'S' = front to the aisle (rot π); 'E' / 'W' = a deep cabinet turned side-on, front along the aisle
for nm, key, x, w, d, front in (('A셀 제어반', 'ctrl1', 3.0, 1.70, 0.47, 'S'), ('PLC 캐비닛 A', 'line08', 5.0, 1.10, 0.71, 'E'), ('B셀 제어반', 'ctrl1', 8.6, 1.70, 0.47, 'S'),
                                 ('C셀 제어반 (MIG 4대)', 'ctrl1', 15.0, 1.70, 0.47, 'S'), ('PLC 캐비닛 E', 'line08', S['dEnd'] + 0.55, 1.10, 0.71, 'W'),
                                 ('D셀 제어반', 'ctrl1', S['dEnd'] + 2.0, 1.70, 0.47, 'S'), ('E셀 제어반', 'ctrl1', S['dEnd'] + 4.0, 1.70, 0.47, 'S')):
    z = FENCE_S - 0.06 - d / 2                              # line z of the cabinet centre, back to the fence
    rot = math.pi if front == 'S' else {'E': -math.pi / 2, 'W': math.pi / 2}[front]   # panel faces are local +z; the side-on cabinets' doors are on their local −z face
    model(nm, key, *L(x, z), round(rot, 4))
    bx0, bx1, bz0, bz1 = x - w / 2 + XS, x + w / 2 + XS, z - d / 2 + ZS, z + d / 2 + ZS
    PANELS.append((nm,) + {'S': (bx0, bx1, bz0 - 0.8, bz0), 'E': (bx1, bx1 + 0.8, bz0, bz1), 'W': (bx0 - 0.8, bx0, bz0, bz1)}[front])

# (no floor labels: the user found the 36 label cards cluttered, 2026-10-29)

# ---------------------------------------------------------------- KPI board over cell A (assumed values until the field numbers come in)
add('kpi', 'KPI 용접 모듈 라인', *L(1.2, 1.3), 0, {'title': 'EGR 쿨러 자동 용접 모듈 라인', 'rows': ['라인 피치|40 s|가정', 'UPH|90 개/h|가정', '라인 인원|4 명 (투입 · 수동 MIG · 수동 검사 · 배출)', '핸들링 로봇|3 대 (도포 · 레이저 · 리크)', 'MIG 로봇|4 대', 'NG 배출|도포 · 레이저 · 리크 판정 후', '검사|핀 비전 · 노즐 비전 · 중량 · 프레스 비전 · C/F · 외관 · 리크'], 'w': 3.6, 'h': 2.1, 'y': 3.0, 'hang': 7.0})

# ---------------------------------------------------------------- material flow around the line: a deck AGV brings totes of brazed core assemblies from the west
# shutter to the input stand north of cell A (the loading operator in the line model works from there) and returns the empties; a forklift takes
# the full shipping pallet east of the leak cell to the east shutter. Vehicles drive north of the line (people work on its −Z side inside the fences).
def zone(name, kind, x, z, w=2.2, d=2.0, **p):
    return add('zone', name, x, z, 0, dict({'kind': kind, 'w': w, 'd': d, 'label': name}, **p))
def route(name, pts, oneway=False):
    return add('route', name, 0, 0, 0, {'points': [[r3(a), r3(b)] for a, b in pts], 'oneway': oneway})
BOX = (MODEL_X0, MODEL_X1, BB['min'][2] + ZS, BB['min'][2] + BB['size'][2] + ZS)   # the line model's footprint in builder coords (x0, x1, z0, z1)
IN_X = -X0 + 1.6
zone('코어 Assy 상자 입고 (서 셔터)', 'pickup', IN_X, DOORZ - 0.5, w=0.7, d=0.6, track=True, stock=2, cap=3, supply=160, unit='tote', standH=0.62, load='e3_tote_brazed')   # trucks bring them
zone('빈 상자 반납 (서 셔터)', 'dropoff', IN_X, DOORZ + 1.3, w=0.7, d=0.6, track=True, stock=0, cap=3, consume=90, unit='tote', standH=0.62, load='e3_tote_600x400')
STAND, EMPTY = (r3(MODEL_X0 + 0.3), -6.45), (r3(MODEL_X0 + 1.4), -6.45)   # just north of cell A's west end, outside the guard (the loader works through the west door)
zone('코어 Assy 투입대', 'dropoff', *STAND, w=0.7, d=0.6, track=True, stock=1, cap=2, consume=400, unit='tote', standH=0.62, load='e3_tote_brazed')   # the loading operator empties a tote of 8 per cycle
zone('빈 상자 (투입대 옆)', 'pickup', *EMPTY, w=0.7, d=0.6, track=True, stock=0, cap=2, supply=400, unit='tote', standH=0.62, load='e3_tote_600x400')
PAL = (r3(MODEL_X1 + 1.6), -3.0)           # east of the packer, between the line and the east wall
zone('출하 팔레트 적재', 'pickup', *PAL, w=1.4, d=1.4, track=True, stock=24, cap=64, supply=50, unitKg=1.5, thresholdKg=96, unit='pallet', perBox=8, layers=2, load='e3_pack_box')
zone('출하 대기 (동 셔터)', 'dropoff', X0 - 2.0, DOORZ, w=1.4, d=1.4, track=True, stock=0, cap=1, consume=80, unit='pallet', layers=2, load='e3_pack_box')
zone('입고 AGV 대기', 'storage', -9.0, -7.3, w=1.0, d=1.0)
zone('지게차 대기', 'storage', 9.0, 5.5, w=1.4, d=1.4)
NLn, SL, CX = -8.3, 7.0, r3(-WALL_IN + 1.3)   # north lane (2.5 m band clear of the north column row), south lane (forklift), west corridor centre (2.65 m wide)
DK = IN_X + 0.9                            # docking lane east of the two shutter stands (a route node must sit within 1 m outside a zone's edge)
route('AGV 경로', [(DK, DOORZ + 1.3), (DK, DOORZ - 0.5), (DK, 1.6), (CX, 1.6), (CX, NLn), (STAND[0], NLn), (EMPTY[0], NLn), (-9.0, NLn)])   # two-way: shutter stands → west corridor → north lane → stands; the AGV drives back the same way (the line blocks a loop)
route('도킹', [(-9.0, NLn), (-9.0, -7.3)])   # the AGV waits on a spur off the lane
for x in (STAND[0], EMPTY[0]): route('도킹', [(x, NLn), (x, STAND[1] - 0.8)])   # two-way spurs to 0.5 m north of the stands; the AGV backs out
route('지게차 경로', [(PAL[0], PAL[1] + 0.7 + 0.46), (PAL[0], SL), (X0 - 2.0, SL), (X0 - 2.0, DOORZ + 1.16), (X0 - 2.0, SL), (9.0, SL), (9.0, 5.5)])   # forks enter a pallet 1.16 m ahead of the stop
ref = {o['name']: 'zone:' + o['id'] for o in objects if o['type'] == 'zone'}
stop = lambda at, act, dwell=8: {'at': ref[at], 'act': act, 'dwell': dwell}
add('amr', '입고 AGV', -9.0, -7.3, 0, {'model': 'e3_amr_deck_bot', 'length': 1.0, 'width': 0.75, 'speed': 1.2, 'payload': 120, 'dwell': 5, 'load': 'e3_tote_brazed', 'loads': ['e3_tote_brazed', 'e3_tote_600x400'],
                                    'stops': [stop('입고 AGV 대기', 'wait', 1), stop('코어 Assy 상자 입고 (서 셔터)', 'load', 5), stop('코어 Assy 투입대', 'unload', 5), stop('빈 상자 (투입대 옆)', 'load', 5), stop('빈 상자 반납 (서 셔터)', 'unload', 5)]})
add('amr', '출하 지게차', 9.0, 5.5, 0, {'model': 'uw_forklift', 'length': 2.4, 'width': 1.2, 'speed': 1.1, 'payload': 1500, 'dwell': 10, 'load': 'e3_pack_box', 'layers': 2,
                                    'stops': [stop('지게차 대기', 'wait', 1), stop('출하 팔레트 적재', 'load'), stop('출하 대기 (동 셔터)', 'unload', 12)]})

# ---------------------------------------------------------------- rule set v2.0 §4 clearance check (fails the build when violated)
ERR = []
cw = BOX[0] - (-WALL_IN); ce = WALL_IN - BOX[1]
if cw < 2.5: ERR.append(f'west AGV corridor {cw:.2f} m < 2.5 m (two-way)')
if ce < 2.5: ERR.append(f'east forklift corridor {ce:.2f} m < 2.5 m (two-way)')
band = (NLn - 1.25, NLn + 1.25)
for o in objects:
    if o['type'] == 'column' and band[0] < o['z'] + 0.2 and o['z'] - 0.2 < band[1]: ERR.append(f"column {o['name']} inside the north lane band")
for nm, x0, x1, z0, z1 in PANELS:                           # the 0.8 m service space in front of each cabinet
    if z0 < band[1] and z1 > band[0]: ERR.append(f'{nm}: service space overlaps the north lane band')
    for o in objects:
        if o['type'] == 'zone' and x0 < o['x'] + o['params']['w'] / 2 and o['x'] - o['params']['w'] / 2 < x1 and z0 < o['z'] + o['params']['d'] / 2 and o['z'] - o['params']['d'] / 2 < z1: ERR.append(f"{nm}: service space overlaps zone {o['name']}")
    for m2, a0, a1, c0, c1 in PANELS:                       # a service space must not run into another cabinet's body or service space
        if m2 != nm and x0 < a1 - 0.01 and a0 < x1 - 0.01 and z0 < c1 - 0.01 and c0 < z1 - 0.01: ERR.append(f'{nm}: service space overlaps that of {m2}')
print('clearance: west corridor %.2f m, east corridor %.2f m, north lane band %.2f … %.2f, panel fronts %.2f' % (cw, ce, band[0], band[1], min(p[3] for p in PANELS)))
if ERR: raise SystemExit('rule set v2.0 violations:\n  ' + '\n  '.join(ERR))

doc = {'version': 2, 'factory': {'width': W, 'depth': D, 'height': H}, 'objects': objects}
out = os.path.join(ROOT, 'assets/layouts/egr-module-asset.json')
with open(out, 'w', encoding='utf-8') as f: json.dump(doc, f, ensure_ascii=False, separators=(',', ':'))
idx = os.path.join(ROOT, 'assets/layouts/index.json')
with open(idx, encoding='utf-8') as f: examples = [e for e in json.load(f) if e['file'] != 'egr-module-asset.json']
examples.insert(0, {'file': 'egr-module-asset.json', 'name': 'EGR 쿨러 용접 모듈 라인 (에셋 재구성)', 'note': 'CAD 라인과 같은 셀 5개 · 스테이션 35개를 자체 에셋으로 재구성 · 코어 Assy 투입 · 도포 → 엔드 탱크 프레스 · 레이저 용접 → 택 용접 (MIG 로봇 4대 · 수동 MIG) → C/F 검사 · 외부 도포 → 리크 테스트 · 마킹 · 가스켓 · OK/NG'})
with open(idx, 'w', encoding='utf-8') as f: json.dump(examples, f, ensure_ascii=False)
print(out, len(objects), 'objects')
