"""Builds assets/layouts/egr-weld-module.json, ONE BUILDER's example of the EGR cooler automatic welding module line: the five
cells of the real line's CAD (assets/models/egr-weld-module/, converted by tools/egr-weld-module/) at their CAD positions, in a
36 x 20 m hall, with the material flow around them done by people and vehicles:

  west shutter --AGV (tote of brazed core assemblies)--> input stand -> operator loads the paste cell ->
  A. core-assy loading & Ni paste (2 lanes: centring, direction/fin vision, barcode, handling robot, laser profiler, dispensing,
     nozzle vision, weight check, NG conveyor) -> B. end-tank assembly (shuttle, 2 tank presses, vision, scan laser welding) ->
  C. tack welding (jig transfer loop, flange feeders, 4 MIG robots, manual MIG booth) -> D. C/F check, external paste, manual check,
  unloading -> operator carries the cooler to E. leak test (barcode, turntable, visual, robot leak jig, laser marking, gasket & bolt,
  OK/NG) -> operator packs the carton on the shipping pallet --forklift--> east shutter.

CAD frame: the line runs along CAD +Y with cell A at Y 0 and cell D ending at Y 17.2 m; here CAD Y is builder +X (offset XS) and
CAD X is builder +Z (offset ZS), so every cell is placed with rot −90° (its GLB keeps the CAD axes, Z up → Y up).
Usage: python tools/egr-weld-module-layout.py   (from the repo root)"""
import json, math, os

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
r3 = lambda v: round(v, 3)
PI2 = r3(math.pi / 2)
objects, seq = [], [0]
W, D, H = 36, 20, 7

def add(type_, name, x, z, rot=0, params=None, **extra):
    seq[0] += 1
    o = {'id': 'ew%03d' % seq[0], 'type': type_, 'name': name, 'x': r3(x), 'z': r3(z), 'rot': rot, 'params': params or {}}
    o.update(extra); objects.append(o); return o

def model(name, key, x, z, rot=0, **params):
    return add('ufmodel', name, x, z, rot, dict({'model': key, 'scale': 1, 'cycle': 12}, **params))

def zone(name, kind, x, z, w=2.2, d=2.0, **p):
    return add('zone', name, x, z, 0, dict({'kind': kind, 'w': w, 'd': d, 'label': name}, **p))

def route(name, pts, oneway=False):
    return add('route', name, 0, 0, 0, {'points': [[r3(a), r3(b)] for a, b in pts], 'oneway': oneway})

def station(name, x, z, w=1.2, d=0.4): zone(name, 'storage', x, z, w=w, d=d)   # a floor label, no stock

# ---------------------------------------------------------------- building shell: clad walls, west inbound and east shipping shutters, columns on 6 m, two roof spans
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

# ---------------------------------------------------------------- the five cells at their CAD positions (GLB boxes measured by tools/egr-weld-module/glb-simplify.mjs)
XS, ZS = -14.0, -4.5                      # builder x = CAD Y + XS, builder z = CAD X + ZS
def cad(X, Y): return (r3(Y + XS), r3(X + ZS))
# cell: key, name, CAD box centre (X, Y) of the GLB; the four line cells keep rot −90° (CAD Y → +X), the leak cell is its own CAD file
CELLS = [('ew_cell_paste', 'A. 코어 Assy 투입 · 페이스트 도포 셀', 0.675, -0.39),
         ('ew_cell_tank', 'B. 엔드 탱크 조립 · 레이저 용접 셀', 0.345, 2.215),
         ('ew_cell_weld', 'C. 쿨러 택 용접 셀 (MIG 로봇 4대)', 1.69, 7.12),
         ('ew_cell_cf', 'D. C/F 검사 · 외부 도포 · 배출 셀', 0.525, 13.825)]
for key, nm, X, Y in CELLS:
    model(nm, key, *cad(X, Y), -PI2)
LEAK = (r3(17.17 + XS + 0.8 + 3.45), r3(ZS + 0.5))   # E: 0.8 m after cell D's end, long axis along +X (its CAD X), inlet at its −X end
model('E. 리크 테스트 셀', 'ew_cell_leak', *LEAK, 0)

# ---------------------------------------------------------------- station labels on the floor (operator side −Z, CAD order inside each cell)
LAB = ZS - 1.9                              # label row north of the line (the operator aisle)
for nm, Y, w in (('코어 Assy 투입 컨베이어 (2레인)', -1.0, 1.6), ('센터링 · 방향 · 핀 비전 · 바코드', -0.2, 1.8), ('핸들링 로봇 → 레이저 프로파일 → 페이스트 도포', 0.4, 2.2), ('노즐 비전 · 중량 검사 · NG', 1.1, 1.6),
                 ('코어 셔틀 · 탱크 공급', 1.6, 1.4), ('탱크 프레스 ×2 · 비전', 2.3, 1.4), ('코어 이재 · 버퍼', 3.3, 1.2), ('스캔 레이저 용접 · NG', 4.3, 1.4),
                 ('투입 피치 컨베이어 · 플랜지 공급', 5.5, 1.8), ('지그 트랜스퍼 (11 지그)', 6.9, 1.4), ('MIG 로봇 용접 ×4', 8.1, 1.4), ('수동 MIG 작업대', 9.6, 1.2), ('배출 컨베이어', 10.3, 1.0),
                 ('2차 C/F 검사', 11.5, 1.2), ('외부 페이스트 도포', 13.2, 1.4), ('수동 검사 · 배출', 15.5, 1.4)):
    station(nm, Y + XS, LAB, w=w)
for nm, dx in (('바코드 · 턴테이블', -2.6), ('외관 검사 · 로봇 리크 지그', -0.6), ('레이저 마킹 · 가스켓 · 볼트', 1.4), ('OK / NG 지그 · NG 보관', 2.9)):
    station(nm, LEAK[0] + dx, LEAK[1] - 1.6, w=1.4)

# ---------------------------------------------------------------- KPI board hung over cell A (assumed values until the field numbers come in)
add('kpi', 'KPI 용접 모듈 라인', *cad(0.6, 0.2), 0, {'title': 'EGR 쿨러 자동 용접 모듈 라인', 'rows': ['라인 피치|40 s|가정', 'UPH|90 개/h|가정', '라인 인원|4 명 (투입 · 수동 MIG · 수동 검사 · 리크 배출)', '도포 검사|노즐 비전 + 중량|CAD', 'MIG 로봇|4 대|CAD', '리크 테스트|로봇 지그 · 레이저 마킹|CAD', 'NG|셀마다 NG 컨베이어|CAD'], 'w': 3.6, 'h': 2.1, 'y': 3.0, 'hang': 7.0})

# ---------------------------------------------------------------- material flow: inbound totes → input stand → cell A operator; cell E → packing → pallet → forklift → shipping
AX, AZ = cad(-1.35, -1.6)                  # cell A's inlet end (the loading conveyors sit at its −Y end)
IN_X = -X0 + 1.6
zone('코어 Assy 상자 입고 (서 셔터)', 'pickup', IN_X, DOORZ - 0.5, w=0.7, d=0.6, track=True, stock=2, cap=3, supply=160, unit='tote', standH=0.62, load='e3_tote_brazed')   # trucks bring them
zone('빈 상자 반납 (서 셔터)', 'dropoff', IN_X, DOORZ + 1.3, w=0.7, d=0.6, track=True, stock=0, cap=3, consume=90, unit='tote', standH=0.62, load='e3_tote_600x400')
STAND = (AX - 1.2, AZ)
zone('코어 Assy 투입대', 'dropoff', *STAND, w=0.7, d=0.5, track=True, stock=1, cap=2, consume=320, unit='tote', standH=0.62, load='e3_tote_brazed')   # the loading operator empties a tote of 8 in 320 s
zone('빈 상자 (투입대 옆)', 'pickup', STAND[0] + 1.0, STAND[1], w=0.7, d=0.5, track=True, stock=0, cap=2, supply=320, unit='tote', standH=0.62, load='e3_tote_600x400')
PAL = (LEAK[0] + 5.6, LEAK[1] - 2.0)      # clear of the leak cell's end and of column C5 (x 12)
zone('출하 팔레트 적재', 'pickup', *PAL, w=1.4, d=1.4, track=True, stock=24, cap=64, supply=40, unitKg=1.5, thresholdKg=96, unit='pallet', perBox=8, layers=2, load='e3_pack_box')
zone('출하 대기 (동 셔터)', 'dropoff', X0 - 2.0, DOORZ, w=1.4, d=1.4, track=True, stock=0, cap=1, consume=80, unit='pallet', layers=2, load='e3_pack_box')
zone('입고 AGV 대기', 'storage', -11.0, 5.5, w=1.0, d=1.0)
zone('지게차 대기', 'storage', 9.0, 5.5, w=1.4, d=1.4)

# people: each works a short walk route between two points, pausing at both ends (no part teleports: the stands and cells sit at the ends)
def worker(name, pts, speed=0.8, dwell=6):
    wr = add('walkroute', name + ' 동선', 0, 0, 0, {'points': [[r3(a), r3(b)] for a, b in pts]})
    add('worker', name, pts[0][0], pts[0][1], 0, {'walkway': wr['id'], 'speed': speed, 'dwell': dwell})
worker('투입 작업자 (상자 → 투입 컨베이어)', [(STAND[0] + 0.5, STAND[1] - 0.7), (AX + 0.6, AZ - 0.9)], 0.7, 12)
MIGX, MIGZ = cad(-1.2, 9.5)                 # the manual MIG booth of cell C (CAD WOPC240)
worker('수동 MIG 작업자', [(MIGX, MIGZ - 1.2), (MIGX + 1.0, MIGZ - 1.2)], 0.5, 40)
CFX, CFZ = cad(-0.3, 15.5)
worker('수동 검사 작업자 (D → E 투입)', [(CFX, CFZ - 1.1), (LEAK[0] - 3.2, LEAK[1] - 1.1)], 0.9, 15)
worker('리크 배출 · 포장 작업자', [(LEAK[0] + 3.2, LEAK[1] - 1.1), (PAL[0] - 0.4, PAL[1] + 0.9)], 0.8, 10)

# vehicles: a deck AGV swaps totes (west shutter ↔ input stand), a forklift takes the full pallet to the east shutter
NL, SL = 4.2, 7.0                          # the aisle north of the line is for people; vehicles drive south of it
DK = IN_X + 0.9                            # docking lane 0.55 m east of the two shutter stands (a route node must sit within 1 m outside a zone's edge)
route('AGV 순환 경로', [(DK, SL), (DK, DOORZ + 1.3), (DK, DOORZ - 0.5), (DK + 1.0, DOORZ - 0.5), (DK + 1.0, SL), (STAND[0], SL), (STAND[0] + 1.0, SL), (-11.0, SL), (-11.0, 8.5), (DK, 8.5), (DK, SL)], oneway=True)
route('도킹', [(-11.0, SL), (-11.0, 5.5)])   # the AGV waits on a dead-end spur off the loop
for x in (STAND[0], STAND[0] + 1.0): route('도킹', [(x, SL), (x, STAND[1] + 0.85)])   # two-way spurs to 0.6 m south of the stands; the AGV backs out
route('지게차 경로', [(PAL[0], PAL[1] + 1.16), (PAL[0], SL), (X0 - 2.0, SL), (X0 - 2.0, DOORZ + 1.16), (X0 - 2.0, SL), (9.0, SL), (9.0, 5.5)])   # forks enter a pallet 1.16 m ahead of the stop
ref = {o['name']: 'zone:' + o['id'] for o in objects if o['type'] == 'zone'}
stop = lambda at, act, dwell=8: {'at': ref[at], 'act': act, 'dwell': dwell}
add('amr', '입고 AGV', -11.0, 5.5, 0, {'model': 'e3_amr_deck_bot', 'length': 1.0, 'width': 0.75, 'speed': 1.2, 'payload': 120, 'dwell': 5, 'load': 'e3_tote_brazed', 'loads': ['e3_tote_brazed', 'e3_tote_600x400'],
                                   'stops': [stop('입고 AGV 대기', 'wait', 1), stop('코어 Assy 상자 입고 (서 셔터)', 'load', 5), stop('코어 Assy 투입대', 'unload', 5), stop('빈 상자 (투입대 옆)', 'load', 5), stop('빈 상자 반납 (서 셔터)', 'unload', 5)]})
add('amr', '출하 지게차', 9.0, 5.5, 0, {'model': 'uw_forklift', 'length': 2.4, 'width': 1.2, 'speed': 1.1, 'payload': 1500, 'dwell': 10, 'load': 'e3_pack_box', 'layers': 2,
                                   'stops': [stop('지게차 대기', 'wait', 1), stop('출하 팔레트 적재', 'load'), stop('출하 대기 (동 셔터)', 'unload', 12)]})

doc = {'version': 2, 'factory': {'width': W, 'depth': D, 'height': H}, 'objects': objects}
out = os.path.join(ROOT, 'assets/layouts/egr-weld-module.json')
with open(out, 'w', encoding='utf-8') as f: json.dump(doc, f, ensure_ascii=False, separators=(',', ':'))
idx = os.path.join(ROOT, 'assets/layouts/index.json')
with open(idx, encoding='utf-8') as f: examples = [e for e in json.load(f) if e['file'] != 'egr-weld-module.json']
examples.insert(1, {'file': 'egr-weld-module.json', 'name': 'EGR 쿨러 자동 용접 모듈 라인 (CAD)', 'note': '36×20 m 공장 · 실제 라인 CAD의 셀 5개를 설계 좌표 그대로 배치 · 코어 Assy 투입 · 페이스트 도포 → 엔드 탱크 프레스 · 레이저 용접 → 택 용접 (MIG 로봇 4대 · 수동 MIG) → C/F 검사 · 외부 도포 → 리크 테스트 · 마킹 · 가스켓 → 포장 → 지게차 → 출하'})
with open(idx, 'w', encoding='utf-8') as f: json.dump(examples, f, ensure_ascii=False)
print(out, len(objects), 'objects')
