"""Builds assets/layouts/egr-factory.json, ONE BUILDER's default example: one 64 x 40 m hall (8 m eave) around the EGR
cooler line, every part at real scale, with material flowing through it continuously:

  inbound dock  --AGV-->  AS/RS cell (two rack rows, stacker crane, I/O loop: totes circulate rack → pick station → rack)
  -> bin picking robot -> vision gate  ->  Ni paste dispensing cell (DMC / weighing, needle, positioner)
  -> NG chute  ->  belt transfer  ->  FR5 stacking cell (4 coolers per tote)  --AMR-->  finished-goods racks
  south half: manual EGR assembly / leak test / inspection-packing benches on a roller line with operators  --forklift-->  shipping dock;
  bracket line: 2-level pallet conveyor with an integrated servo press, a machining cell tended by an FR5 from an AMR tote

Building: clad walls with a window band, two sectional doors (inbound south-west, shipping south-east), H columns on a
6 m grid, two 20 m roof spans with trusses, purlins, skylights and LED high-bays (js/factory-kit.js).
AMR network: a one-way loop (eastbound at z -9, westbound at z 8) with short two-way dock spurs to every zone.
Usage: python tools/egr-factory-layout.py   (from the repo root)"""
import json, math, os

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
r3 = lambda v: round(v, 3)
PI2 = r3(math.pi / 2)
objects, seq = [], [0]
W, D, H = 64, 40, 8

def add(type_, name, x, z, rot=0, params=None, **extra):
    seq[0] += 1
    o = {'id': 'eg%03d' % seq[0], 'type': type_, 'name': name, 'x': r3(x), 'z': r3(z), 'rot': rot, 'params': params or {}}
    o.update(extra); objects.append(o); return o

def model(name, key, x, z, rot=0, **params):
    return add('ufmodel', name, x, z, rot, dict({'model': key, 'scale': 1, 'cycle': 12}, **params))

def zone(name, kind, x, z, w=2.2, d=2.0, **p):
    return add('zone', name, x, z, 0, dict({'kind': kind, 'w': w, 'd': d, 'label': name}, **p))

def route(name, pts, oneway=False):
    return add('route', name, 0, 0, 0, {'points': [[r3(a), r3(b)] for a, b in pts], 'oneway': oneway})

# ---------------------------------------------------------------- building shell
X0, Z0 = W / 2 - 0.1, D / 2 - 0.1
DOORS = (-24.0, 24.0)               # sectional doors in the south wall: inbound (west), shipping (east)
add('wall', '북쪽 벽', 0, -Z0, 0, {'length': W, 'thickness': 0.2, 'h': 0, 'windows': True})
for n, (a, b) in enumerate(((-W / 2, DOORS[0] - 2.2), (DOORS[0] + 2.2, DOORS[1] - 2.2), (DOORS[1] + 2.2, W / 2))):
    add('wall', f'남쪽 벽 {n + 1}', (a + b) / 2, Z0, 0, {'length': r3(b - a), 'thickness': 0.2, 'h': 0, 'windows': True})
for s, nm in ((-1, '서쪽 벽'), (1, '동쪽 벽')):
    add('wall', nm, s * X0, 0, PI2, {'length': D, 'thickness': 0.2, 'h': 0, 'windows': True})
for x, nm in zip(DOORS, ('입고 셔터', '출하 셔터')):
    add('door', nm, x, Z0, 0, {'width': 4, 'height': 4.5, 'thickness': 0.2})
NB = 11                              # roof bays: the columns stand on the rafter lines (x = −32 + k · 64 / 11)
BAY = [r3(-W / 2 + k * W / NB) for k in range(NB + 1)]
for k, x in enumerate(BAY):
    for z in (-19.75, 19.75):
        if z > 0 and any(abs(x - d) < 2.6 for d in DOORS): continue      # the shutter headers carry these frames
        add('column', f'기둥 {"N" if z < 0 else "S"}{k + 1}', x, z, 0, {'w': 0.3, 'd': 0.4, 'h': 0})
    if 0 < k < NB: add('column', f'기둥 C{k}', x, 0, 0, {'w': 0.3, 'd': 0.4, 'h': 0})
for z, nm in ((-10, '지붕 북쪽'), (10, '지붕 남쪽')):
    add('roof', nm, 0, z, 0, {'length': W, 'span': 20, 'h': 0, 'bay': r3(W / NB), 'rise': 1.0, 'sheet': True})  # sheets hide when the camera is above the roof

# ---------------------------------------------------------------- AS/RS (west, north): two rack rows, crane + rail in the aisle
AZ = -15.7
# integrated cell (e3_asrs_cell, turned 180°: I/O loop to the east). Two totes circulate rack → crane → outfeed → pick station
# (x −15.9) → infeed → crane → rack; every slot it serves visibly empties and fills (ASRS_Cycle, 128 s)
model('자동창고 일체형 셀', 'e3_asrs_cell', -23.4, AZ, r3(math.pi))

# ---------------------------------------------------------------- EGR automatic line (north), one model on the AS/RS clock (e3_egr_auto_line, Line_Cycle 128 s):
# picker at the AS/RS pick station → automatic Ni paste dispensing → drying / sintering oven → vision + NG → insert moulding → outfeed into
# the tote on the AMR waiting at its end. The line's local origin sits 1.3 m east of the pick station (x −15.965); its model is centred
# on its bounding box (x −1.7 … 14.545, z −2.65 … 1.035), hence the offsets.
LX0 = -15.965 + 1.3
model('EGR 자동 라인 (도포 → 소성 → 검사 → 인서트 사출)', 'e3_egr_auto_line', LX0 + 6.4225, AZ - 0.8075)
OUT_X, OUT_Z = r3(LX0 + 14.7), r3(AZ + 0.6)   # where the moulded parts drop into the AMR's tote

# ---------------------------------------------------------------- finished goods (east, north): pallet racks, reach truck
add('rack', '완제품 랙 A', 22, -17.9, 0, {'bays': 4, 'levels': 3, 'bayWidth': 2.7, 'depth': 1.1, 'levelHeight': 2.0, 'perSlot': 2, 'fill': 60, 'load': 'carton'})
add('rack', '완제품 랙 B', 22, -14.4, 0, {'bays': 4, 'levels': 3, 'bayWidth': 2.7, 'depth': 1.1, 'levelHeight': 2.0, 'perSlot': 2, 'fill': 45, 'load': 'carton'})
model('리치 지게차 (대기)', 'uw_reachlift', 29.0, -16.2, PI2)

# ---------------------------------------------------------------- EGR assembly line (south): benches on a roller line, operators
LZ = 13.0
benches = []
for k, (name, kind, x) in enumerate((('조립 작업대 1', 'assembly', -14.5), ('조립 작업대 2', 'assembly', -12.0), ('리크 테스트 1', 'leak', -9.5), ('리크 테스트 2', 'leak', -7.0), ('검사 · 포장', 'pack', -4.5))):
    # seated operators on the aisle side (−Z after the turn); each presses the done button every cycle
    benches.append(add('bench', name, x, LZ, math.pi, {'kind': kind, 'length': 1.6, 'depth': 0.8, 'height': 0.9, 'worker': True, 'cycle': 38 + 4 * k}))
add('conveyor', '조립 라인 컨베이어', -8.5, LZ + 1.6, 0, {'shape': 'straight', 'kind': 'roller', 'length': 13, 'width': 0.6, 'height': 0.85, 'speed': 0.12, 'dir': 1, 'source': True, 'interval': 14, 'item': 0.44, 'sink': True})
for k, x in enumerate((-15.5, -13.0, -10.5)):
    add('rack', f'부품 랙 {k + 1}', x, LZ + 3.2, 0, {'bays': 1, 'levels': 3, 'bayWidth': 1.4, 'depth': 0.6, 'levelHeight': 0.45, 'perSlot': 2, 'fill': 80, 'load': 'tote'})
model('완성품 팔레트', 'uw_sunoko', -0.6, LZ)
ww = add('walkway', '조립 라인 작업 통로', -9.0, LZ - 2.0, 0, {'length': 12.0, 'width': 0.8, 'label': '조립 라인 작업 통로'})
add('worker', '라인 반장', -9.0, LZ - 2.0, 0, {'walkway': ww['id'], 'speed': 0.8, 'dwell': 25})
wr = add('walkroute', '도포 셀 점검 동선', 0, 0, 0, {'points': [[-9.5, -12.4], [-3.0, -12.4]]})
add('worker', '도포 셀 담당', -9.5, -12.4, 0, {'walkway': wr['id'], 'speed': 0.9, 'dwell': 20})


# ---------------------------------------------------------------- zones (stock kept: AMRs wait when a pickup is empty / a drop-off is full)
NL, SL = -9.0, 8.0                   # lanes: eastbound north, westbound south
zone('자재 입고', 'pickup', DOORS[0], 17.65, track=True, stock=3, cap=6, supply=30, load='uw_cardboard_a1')
zone('자동창고 입고', 'dropoff', -17.6, NL - 2.65, track=True, stock=0, cap=4, consume=36, load='uw_cardboard_a1')
# the auto line's outfeed: the AMR waits under the belt end while the moulded parts drop into its tote one by one (0.5 kg each); at 4 kg (8) it leaves.
# The line drops a good part at 13.6, 45.6 and 109.6 s of every 128 s (part 3 of 4 is an NG)
outz = zone('사출품 적재 (자동 라인)', 'pickup', OUT_X, OUT_Z, w=1.2, d=1.4, track=True, stock=0, cap=16, supplyAt=[13.6, 45.6, 109.6], supplyPeriod=128, unitKg=0.5, thresholdKg=4, load='e3_insert_part')
outz['perm'] = {'amr': True}   # the AMR parks inside it, under the belt end
zone('완제품 입고', 'dropoff', 16.4, NL - 2.65, track=True, stock=0, cap=6, consume=24, load='e3_tote_600x400')
zone('조립 완료', 'pickup', -0.6, SL + 2.65, track=True, stock=1, cap=4, load='uw_cardboard_c1')  # filled by the weighing AMR
# weighing zone beside the benches: the operators put finished coolers (2.5 kg) on the AMR waiting here; at 20 kg it leaves
zone('조립품 적재 (무게 감지)', 'pickup', -9.5, SL + 1.9, w=2.4, d=1.2, track=True, stock=0, cap=16, supply=9, unitKg=2.5, thresholdKg=20, load='e3_egr_cooler')
zone('출하 대기', 'dropoff', DOORS[1], 17.65, track=True, stock=0, cap=4, consume=70, load='uw_cardboard_c1')
zone('조립 부품 공급', 'dropoff', -17.5, SL + 2.65, track=True, stock=1, cap=3, consume=90, load='e3_tote_600x400')

# ---------------------------------------------------------------- AMR network and movers
# the loop passes through every junction (dock spurs join the network only at route points)
north = sorted({-17.6, 0.0, OUT_X, 11.64, 16.4}); south = sorted({-17.5, -9.5, -0.6, 0.0, 11.64, *DOORS}, reverse=True)  # 0 / 11.64: crossovers between the column lines
route('순환 경로', [(-28, NL)] + [(x, NL) for x in north] + [(28, NL), (28, SL)] + [(x, SL) for x in south] + [(-28, SL), (-28, NL)], oneway=True)
route('남행 연결로', [(11.64, NL), (11.64, SL)], oneway=True)   # crossovers between the lanes, midway between centre columns
route('북행 연결로', [(0.0, SL), (0.0, NL)], oneway=True)
for x in (-17.6, 16.4):
    route('도킹', [(x, NL), (x, NL - 1.25)])
route('도킹', [(OUT_X, NL), (OUT_X, OUT_Z)])   # into the space under the line's outfeed belt end
for x in (-17.5, -9.5, -0.6):
    route('도킹', [(x, SL), (x, SL + 1.25)])
for x in DOORS:
    route('셔터 통로', [(x, SL), (x, 16.4)])
ref = {o['name']: 'zone:' + o['id'] for o in objects if o['type'] == 'zone'}
stop = lambda at, act, dwell=8: {'at': ref[at], 'act': act, 'dwell': dwell}
add('amr', '입고 AGV', -26.0, SL, 0, {'model': 'e3_omron_agv', 'length': 1.3, 'width': 0.8, 'speed': 1.0, 'payload': 250, 'dwell': 8, 'load': 'uw_cardboard_a1',
    'stops': [stop('자재 입고', 'load'), stop('자동창고 입고', 'unload')]})
add('amr', '사출품 AMR 1', -2.0, NL, 0, {'model': 'e3_amr_deck_bot', 'length': 1.0, 'width': 0.75, 'speed': 1.3, 'payload': 120, 'dwell': 6, 'load': 'e3_tote_600x400',
    'stops': [stop('사출품 적재 (자동 라인)', 'wait', 1), stop('사출품 적재 (자동 라인)', 'load', 4), stop('조립 부품 공급', 'unload')]})
add('amr', '사출품 AMR 2', 12.0, SL, 0, {'model': 'e3_amr_deck_bot', 'length': 1.0, 'width': 0.75, 'speed': 1.3, 'payload': 120, 'dwell': 6, 'load': 'e3_tote_600x400',
    'stops': [stop('사출품 적재 (자동 라인)', 'wait', 1), stop('사출품 적재 (자동 라인)', 'load', 4), stop('조립 부품 공급', 'unload')]})
for bnch in benches: bnch['params']['feeds'] = ref['조립품 적재 (무게 감지)']
add('amr', '무게 감지 AMR', -12.0, SL, 0, {'model': 'e3_amr_deck_bot', 'length': 1.0, 'width': 0.75, 'speed': 1.2, 'payload': 120, 'dwell': 6, 'load': 'e3_tote_600x400',
    'stops': [stop('조립품 적재 (무게 감지)', 'wait', 1), stop('조립품 적재 (무게 감지)', 'load', 8), stop('조립 완료', 'unload')]})
add('amr', '출하 지게차', 12.0, SL, 0, {'model': 'uw_forklift', 'length': 2.4, 'width': 1.2, 'speed': 1.3, 'payload': 1500, 'dwell': 10, 'load': 'uw_cardboard_c1',
    'stops': [stop('조립 완료', 'load'), stop('출하 대기', 'unload', 12)]})

doc = {'version': 2, 'factory': {'width': W, 'depth': D, 'height': H}, 'objects': objects}
out = os.path.join(ROOT, 'assets/layouts/egr-factory.json')
with open(out, 'w', encoding='utf-8') as f: json.dump(doc, f, ensure_ascii=False, separators=(',', ':'))
idx = os.path.join(ROOT, 'assets/layouts/index.json')
with open(idx, encoding='utf-8') as f: examples = [e for e in json.load(f) if e['file'] != 'egr-factory.json']
examples.insert(0, {'file': 'egr-factory.json', 'name': 'EGR 쿨러 공장 예시', 'note': '64×40 m 공장 · 자재 입고 → 자동창고 일체형 셀 → 로봇 픽킹 → 비전 → Ni 페이스트 도포 → NG 판정 → 벨트 이송 → FR5 적재 → AMR 운반 → 완제품 랙 · 수작업 조립 라인 → 지게차 출하 · 2층 컨베이어 + 프레스 · AMR → 로봇 → 가공기 셀 · 인서트 사출 셀 → 조립 라인'})
with open(idx, 'w', encoding='utf-8') as f: json.dump(examples, f, ensure_ascii=False)
print(out, len(objects), 'objects')
