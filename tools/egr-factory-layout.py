"""Builds assets/layouts/egr-factory.json, ONE BUILDER's default example: one 64 x 40 m hall (8 m eave) around the EGR
cooler line, every part at real scale, with material flowing through it continuously:

  inbound dock  --AGV-->  AS/RS cell (two rack rows, stacker crane, I/O loop: totes circulate rack → pick station → rack)
  -> EGR auto line: pick -> Ni paste dispensing -> drying / sintering -> vision + NG -> insert moulding  --AMR-->
  assembly parts supply -> manual assembly / leak test / inspection-packing benches (south)  --weighing AMR-->  assembled
  --forklift-->  finished-goods racks  --forklift-->  shipping dock
The brazed core is a semi-finished part: it only reaches the racks after assembly and the leak test.

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
# on its bounding box (x −1.7 … 14.545, z −2.65 … 1.84), hence the offsets.
LX0 = -15.965 + 1.3
model('EGR 자동 라인 (도포 → 소성 → 검사 → 인서트 사출)', 'e3_egr_auto_line', LX0 + 6.4225, AZ - 0.405)
OUT_X, OUT_Z = r3(LX0 + 14.7), r3(AZ + 0.6)   # where the moulded parts drop into the AMR's tote

# ---------------------------------------------------------------- finished goods (east, north): pallet racks, reach truck
add('rack', '완제품 랙 A', 22, -17.9, 0, {'bays': 4, 'levels': 3, 'bayWidth': 2.7, 'depth': 1.1, 'levelHeight': 2.0, 'perSlot': 2, 'fill': 60, 'load': 'carton'})
add('rack', '완제품 랙 B', 22, -14.4, 0, {'bays': 4, 'levels': 3, 'bayWidth': 2.7, 'depth': 1.1, 'levelHeight': 2.0, 'perSlot': 2, 'fill': 45, 'load': 'carton'})
model('리치 지게차 (대기)', 'uw_reachlift', 29.0, -16.2, PI2)

# ---------------------------------------------------------------- manual cells (south): two seated operators per cell, the AMR waiting between them
# takes each finished part into the tote on its deck (8 per tote) and leaves when it is full. Benches face south (rot π), operators sit on
# the lane side at z 11.22, the AMR parks between them at the same z.
NL, SL = -9.0, 8.0                   # lanes: eastbound north, westbound south
BZ, OPZ = 12.0, 11.22
def cell(x0, kinds, cycle, names):
    out = []
    for (kind, dx, side, ph), nm in zip(((kinds[0], -1.1, -1, 0), (kinds[1], 1.1, 1, round(cycle / 2, 3))), names):
        out.append(add('bench', nm, x0 + dx, BZ, math.pi, {'kind': kind, 'length': 1.2, 'depth': 0.8, 'height': 0.9, 'worker': True, 'cycle': cycle, 'side': side, 'phase': ph}))
    return out
# manual Ni paste dispensing: 64 s per substrate and operator, one part every 32 s into the AMR tote (the operators lay it in at 29.5 / 61.5 s)
MX = -18.0
man = cell(MX, ('dispense', 'dispense'), 64, ('수동 도포 작업대 1', '수동 도포 작업대 2'))
# assembly / inspection-packing of the moulded parts: 6 good parts per 128 s from the auto line → 42.667 s per part and operator
AX = -7.0; ACYC = round(128 / 3, 3)
asm = cell(AX, ('assembly', 'pack'), ACYC, ('조립 작업대 (사출품)', '검사 · 포장 작업대'))
add('rack', '수동 도포 기판 랙', MX, BZ + 1.4, 0, {'bays': 1, 'levels': 3, 'bayWidth': 2.4, 'depth': 0.6, 'levelHeight': 0.45, 'perSlot': 3, 'fill': 80, 'load': 'tote'})

# ---------------------------------------------------------------- zones (stock kept: AMRs wait when a pickup is empty / a drop-off is full)
# the auto line's outfeed: the AMR waits under the belt end while the moulded parts drop into its tote one by one; at 8 it leaves.
# Good parts drop at these phases of the line's 128 s clock (auto part 3 and manual part 2 of every four are NG)
outz = zone('사출품 적재 (자동 라인)', 'pickup', OUT_X, OUT_Z, w=1.2, d=1.4, track=True, stock=0, cap=16, supplyAt=[12.7, 28.7, 44.7, 92.7, 108.7, 124.7], supplyPeriod=128, unitKg=0.5, thresholdKg=4, load='e3_insert_part')
outz['perm'] = {'amr': True}
mz = zone('수동 도포 적재', 'pickup', MX, OPZ, w=0.9, d=1.2, track=True, stock=0, cap=16, supplyAt=[29.5, 61.5], supplyPeriod=64, unitKg=0.1, thresholdKg=0.8, load='e3_dispensed_sub')
mz['perm'] = {'amr': True}
az = zone('조립 완료 적재', 'pickup', AX, OPZ, w=0.9, d=1.2, track=True, stock=0, cap=16, supplyAt=[round(ACYC - 2.5, 3), round(ACYC / 2 - 2.5, 3)], supplyPeriod=ACYC, unitKg=0.5, thresholdKg=4, load='e3_insert_part')
az['perm'] = {'amr': True}
# roller stands at deck height (0.62 m): the AMR rolls the full tote on; the operator there takes the parts out one by one
INF_X, INF_Z = r3(LX0 + 4.4), r3(AZ + 1.6)
zone('소성로 투입대 (수동 도포품)', 'dropoff', INF_X, INF_Z, w=0.7, d=0.5, track=True, stock=1, cap=1, consume=256, standH=0.62, stand=False, load='e3_tote_dispensed')  # the line's stand; 8 parts, one every 32 s
zone('조립 투입대 (사출품)', 'dropoff', AX - 2.3, 11.05, w=0.7, d=0.5, track=True, stock=1, cap=2, consume=round(8 * ACYC / 2, 1), standH=0.62, load='e3_tote_moulded')
zone('완제품 입고대', 'dropoff', 16.4, NL - 1.95, w=1.4, d=0.6, track=True, stock=0, cap=2, consume=200, standH=0.62, load='e3_tote_moulded')  # the reach truck stores the totes in the FG racks
# pallets: built at the FG area (palletising operator), forklift forks into the pockets 1.16 m ahead of its stop, carries it to the shutter
zone('출하 팔레트', 'pickup', 19.6, r3(NL - 1.25 - 1.16), w=1.4, d=1.4, track=True, stock=1, cap=1, supply=300, load='uw_cardboard_c1')
zone('출하 대기', 'dropoff', DOORS[1], r3(16.4 + 1.16), w=1.4, d=1.4, track=True, stock=0, cap=1, consume=70, load='uw_cardboard_c1')
# parking spots next to each batch zone: the second AMR of a pair waits here (off the lanes) while the first is being filled
PARK = {'사출품': (r3(OUT_X + 1.6), r3(NL - 2.3)), '수동 도포': (MX + 2.6, 10.2), '조립품': (AX + 2.6, 10.2)}
for nm, (x, z) in PARK.items():
    zone(nm + ' AMR 대기', 'storage', x, z, w=1.0, d=1.0)
wr2 = add('walkroute', '팔레타이징 동선', 0, 0, 0, {'points': [[16.4, -10.2], [19.6, -10.2]]})
add('worker', '팔레타이징 작업자', 16.4, -10.2, 0, {'walkway': wr2['id'], 'speed': 0.8, 'dwell': 25})

# ---------------------------------------------------------------- AMR network and movers
# the loop passes through every junction (dock spurs join the network only at route points)
north = sorted({INF_X, 0.0, OUT_X, PARK['사출품'][0], 11.64, 16.4, 19.6}); south = sorted({MX, MX + 2.6, AX, AX - 2.3, AX + 2.6, 0.0, 11.64, *DOORS}, reverse=True)  # 0 / 11.64: crossovers between the column lines
route('순환 경로', [(-28, NL)] + [(x, NL) for x in north] + [(28, NL), (28, SL)] + [(x, SL) for x in south] + [(-28, SL), (-28, NL)], oneway=True)
route('남행 연결로', [(11.64, NL), (11.64, SL)], oneway=True)   # crossovers between the lanes, midway between centre columns
route('북행 연결로', [(0.0, SL), (0.0, NL)], oneway=True)
for x in (16.4, 19.6):
    route('도킹', [(x, NL), (x, NL - 1.25)])
route('도킹', [(OUT_X, NL), (OUT_X, OUT_Z)])          # into the space under the line's outfeed belt end
route('도킹', [(INF_X, NL), (INF_X, r3(INF_Z + 0.8))])  # up to the infeed stand
for x in (MX, AX):
    route('도킹', [(x, SL), (x, OPZ)])                 # between the two operators of a cell
route('도킹', [(AX - 2.3, SL), (AX - 2.3, 10.4)])
route('도킹', [(PARK['사출품'][0], NL), (PARK['사출품'][0], NL - 1.6)])
for x in (MX + 2.6, AX + 2.6):
    route('도킹', [(x, SL), (x, 9.6)])
route('셔터 통로', [(DOORS[1], SL), (DOORS[1], 16.4)])
ref = {o['name']: 'zone:' + o['id'] for o in objects if o['type'] == 'zone'}
stop = lambda at, act, dwell=8: {'at': ref[at], 'act': act, 'dwell': dwell}
deck = lambda name, x, z, stops: add('amr', name, x, z, 0, {'model': 'e3_amr_deck_bot', 'length': 1.0, 'width': 0.75, 'speed': 1.2, 'payload': 120, 'dwell': 6, 'load': 'e3_tote_600x400', 'stops': stops})
for k, (x, z) in enumerate(((-2.0, NL), (12.0, SL))):
    deck(f'사출품 AMR {k + 1}', x, z, [stop('사출품 AMR 대기', 'wait', 1), stop('사출품 적재 (자동 라인)', 'wait', 1), stop('사출품 적재 (자동 라인)', 'load', 4), stop('조립 투입대 (사출품)', 'unload', 6)])
for k, (x, z) in enumerate(((-24.0, SL), (-26.0, NL))):
    deck(f'수동 도포 AMR {k + 1}', x, z, [stop('수동 도포 AMR 대기', 'wait', 1), stop('수동 도포 적재', 'wait', 1), stop('수동 도포 적재', 'load', 4), stop('소성로 투입대 (수동 도포품)', 'unload', 6)])
for k, (x, z) in enumerate(((-12.0, SL), (6.0, SL))):
    deck(f'조립품 AMR {k + 1}', x, z, [stop('조립품 AMR 대기', 'wait', 1), stop('조립 완료 적재', 'wait', 1), stop('조립 완료 적재', 'load', 4), stop('완제품 입고대', 'unload', 6)])
for bnch in man: bnch['params']['feeds'] = ref['수동 도포 적재']
for bnch in asm: bnch['params']['feeds'] = ref['조립 완료 적재']
add('amr', '출하 지게차', 20.0, SL, 0, {'model': 'uw_forklift', 'length': 2.4, 'width': 1.2, 'speed': 1.1, 'payload': 1500, 'dwell': 10, 'load': 'uw_cardboard_c1',
    'stops': [stop('출하 팔레트', 'load'), stop('출하 대기', 'unload', 12)]})

doc = {'version': 2, 'factory': {'width': W, 'depth': D, 'height': H}, 'objects': objects}
out = os.path.join(ROOT, 'assets/layouts/egr-factory.json')
with open(out, 'w', encoding='utf-8') as f: json.dump(doc, f, ensure_ascii=False, separators=(',', ':'))
idx = os.path.join(ROOT, 'assets/layouts/index.json')
with open(idx, encoding='utf-8') as f: examples = [e for e in json.load(f) if e['file'] != 'egr-factory.json']
examples.insert(0, {'file': 'egr-factory.json', 'name': 'EGR 쿨러 공장 예시', 'note': '64×40 m 공장 · 자동창고 → 자동 도포 셀 / 수동 도포 작업대 (AMR) → 건조 · 소성로 → 비전 · NG → 인서트 사출 → AMR → 조립 · 검사 포장 (AMR) → 완제품 입고대 → 팔레트 → 지게차 출하'})
with open(idx, 'w', encoding='utf-8') as f: json.dump(examples, f, ensure_ascii=False)
print(out, len(objects), 'objects')
