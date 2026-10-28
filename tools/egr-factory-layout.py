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

# ---------------------------------------------------------------- A/B: two identical EGR core lines side by side, each fed by its own AS/RS cell; they differ only in the
# Ni paste dispensing: line A (north, z −16.2) an operator with a handheld dispenser (40 s per core, a kit every 64 s), line B (south,
# z −10.2) the ONE STATION automatic cell (12 s, a kit every 32 s). One model per line on the AS/RS clock (Core_Cycle 512 / 256 s):
# picker at the pick station (plate blanks) → servo press → core stacking into a clamping jig (operator) → Ni paste → loader → vacuum
# brazing furnace (batch of 4, two trays) → unloader (jig off) → post-braze vision + NG → outfeed into the tote on the waiting AMR.
# Each line's origin sits 1.3 m east of its pick station (x −15.965); the models are centred on their bounding boxes (x −1.7 … 16.6,
# z −2.96 … 1.59), hence the offsets. Core 6 of 8 fails the post-braze check on both lines.
LX0 = -15.965 + 1.3
AZA, AZB = -16.2, -10.2
LINES = {'A': dict(z=AZA, model='e3_egr_core_line_manual', asrs='e3_asrs_cell_a', P=64, DT=40, name='EGR 코어 라인 A (작업자 수동 도포)'),
         'B': dict(z=AZB, model='e3_egr_core_line', asrs='e3_asrs_cell', P=32, DT=12, name='EGR 코어 라인 B (ONE STATION 자동 도포)')}
def good_drops(P, DT):   # phases of the line clip (8 P s) at which a good brazed core drops into the AMR tote (mirrors egrCoreLine in models.js)
    out, a0 = set(), 60 + (DT - 12); F0 = a0 + 2 + 2 * P
    for j in range(-9, 9):
        if j % 8 == 5: continue
        b = P * j + 16; a = b + 32 + DT; F = F0 + 4 * P * math.ceil((a - F0 + 1e-6) / (4 * P)); slot = 3 - round((F - 2 - a) / P)
        out.add(round((F + 106 + 6 * slot + 13.4) % (8 * P), 1))
    return sorted(out)
for k, L in LINES.items():
    model(f'자동창고 일체형 셀 {k}', L['asrs'], -23.4, L['z'], r3(math.pi))
    model(L['name'], L['model'], LX0 + 7.45, L['z'] - 0.685)
    L['out'] = (r3(LX0 + 16.85), L['z']); L['good'] = good_drops(L['P'], L['DT'])

# ---------------------------------------------------------------- KPI boards hung over each line's dispensing station (assumed values until the field numbers come in)
def uph(L): return round(3600 / L['P'] * 7 / 8)
KPI = {'A': ['Ni 페이스트 도포 사이클 (쿨러 1개)|40 s', '도포 인원|1 명', '라인 피치 (코어 1개)|64 s', 'UPH (양품)|%d 개/h' % uph(LINES['A']), '도포 불량 (누락 · 과다) 검출|브레이징 후', '병목 공정|수동 도포', '현장 수치 입력 전 가정값|'],
       'B': ['Ni 페이스트 도포 사이클 (쿨러 1개)|12 s', '도포 인원|0 명 (자동 셀)', '라인 피치 (코어 1개)|32 s', 'UPH (양품)|%d 개/h' % uph(LINES['B']), '도포 불량 (누락 · 과다) 검출|도포 직후 비전', '병목 공정|자동창고 피킹 (32 s)', '현장 수치 입력 전 가정값|']}
for k, L in LINES.items():
    add('kpi', f'KPI 라인 {k}', LX0 + 4.6, L['z'] + 0.05, 0, {'title': ('라인 A · 작업자 수동 도포' if k == 'A' else '라인 B · ONE STATION 자동 도포'), 'rows': KPI[k], 'w': 3.6, 'h': 2.1, 'y': 3.3, 'hang': 8.0})

# ---------------------------------------------------------------- finished goods (east, north): pallet racks, reach truck
add('rack', '완제품 랙 A', 22, -17.9, 0, {'bays': 4, 'levels': 3, 'bayWidth': 2.7, 'depth': 1.1, 'levelHeight': 2.0, 'perSlot': 2, 'fill': 60, 'load': 'carton'})
add('rack', '완제품 랙 B', 22, -14.4, 0, {'bays': 4, 'levels': 3, 'bayWidth': 2.7, 'depth': 1.1, 'levelHeight': 2.0, 'perSlot': 2, 'fill': 45, 'load': 'carton'})
model('리치 지게차 (대기)', 'uw_reachlift', 29.0, -16.2, PI2)

# ---------------------------------------------------------------- downstream (south): the brazed core is semi-finished; it goes to assembly (flanges, pipes, bracket) and
# leak test (gas / coolant side), then DMC marking, final inspection and packing (8 coolers per 600 × 400 × 300 carton) onto the shipping
# pallet, and only then to the finished-goods area. Benches face south (rot π), operators sit on the lane side at z 11.22.
NL, SL = -8.0, 8.0                   # lanes: eastbound north (south of line B), westbound south
BZ, OPZ = 12.0, 11.22
PER = round(512 / 21, 3)                               # A: 7 good cores per 512 s, B: 14 → one every 24.381 s on average
def cell(x0, kinds, cycle, names):
    out = []
    for (kind, dx, side, ph), nm in zip(((kinds[0], -1.1, -1, 0), (kinds[1], 1.1, 1, round(cycle / 2, 3))), names):
        out.append(add('bench', nm, x0 + dx, BZ, math.pi, {'kind': kind, 'length': 1.2, 'depth': 0.8, 'height': 0.9, 'worker': True, 'cycle': cycle, 'side': side, 'phase': ph}))
    return out
AX = -7.0; ACYC = round(2 * PER, 3)                    # two stations, each assembles and leak-tests one cooler per 48.8 s
asm = cell(AX, ('assembly', 'leak'), ACYC, ('조립 (플랜지 · 파이프 · 브래킷)', '리크 테스트 (가스 · 냉각수)'))
PX = 4.0                                              # DMC marking, final inspection, packing: the operator lays each cooler into the carton on the pallet beside the bench
pack = add('bench', 'DMC 각인 · 최종 검사 · 포장', PX, BZ, math.pi, {'kind': 'pack', 'length': 1.2, 'depth': 0.8, 'height': 0.9, 'worker': True, 'cycle': PER, 'side': -1, 'phase': 0})

# ---------------------------------------------------------------- zones (stock kept: AMRs wait when a pickup is empty / a drop-off is full)
# the AMR leaves with the 7 good cores of two furnace batches (one 256 s cycle) and always right before a 110 s gap, so the next AMR is in place
# before the next core drops (the run starts with 2 cores of the previous batch in the tote)
for k, L in LINES.items():   # the AMR leaves with the 7 good cores of one clip (two furnace batches), right before the long gap; 2 cores of the previous run are in it at start
    cz = zone(f'브레이징 코어 적재 (라인 {k})', 'pickup', *L['out'], w=1.2, d=1.4, track=True, stock=2, cap=16, supplyAt=L['good'], supplyPeriod=8 * L['P'], unitKg=0.9, thresholdKg=6.3, unit='part', load='e3_brazed_core')
    cz['perm'] = {'amr': True}
az = zone('조립 · 리크 완료 적재', 'pickup', AX, OPZ, w=0.9, d=1.2, track=True, stock=0, cap=16, supplyAt=[round(ACYC - 2.5, 3), round(ACYC / 2 - 2.5, 3)], supplyPeriod=ACYC, unitKg=1.5, thresholdKg=12, unit='part', load='e3_egr_cooler')
az['perm'] = {'amr': True}
zone('조립 투입대 (브레이징 코어)', 'dropoff', AX - 2.3, 11.05, w=0.7, d=0.5, track=True, stock=1, cap=3, consume=round(8 * PER, 1), unit='tote', standH=0.62, load='e3_tote_brazed')
zone('포장 투입대 (EGR 쿨러)', 'dropoff', PX - 1.2, 11.05, w=0.7, d=0.5, track=True, stock=1, cap=3, consume=round(8 * PER, 1), unit='tote', standH=0.62, load='e3_tote_coolers')
# the shipping pallet is built beside the packing bench: a carton per 8 coolers, 2 layers of 4 (64 coolers); the forklift's forks enter it 1.16 m ahead of its stop
PALX, PALZ = PX + 1.35, 11.4
zone('출하 팔레트 적재', 'pickup', PALX, PALZ, w=1.4, d=1.4, track=True, stock=40, cap=64, supplyAt=[round(PER - 2.5, 3)], supplyPeriod=PER, unitKg=1.5, thresholdKg=96, unit='pallet', perBox=8, layers=2, load='e3_pack_box')
zone('완제품 랙 입고', 'storage', 19.6, r3(NL - 1.25 - 1.16), w=1.4, d=1.4, track=True, stock=1, cap=1, unit='pallet', layers=2, load='e3_pack_box')
zone('출하 대기', 'dropoff', DOORS[1], r3(16.4 + 1.16), w=1.4, d=1.4, track=True, stock=0, cap=1, consume=70, unit='pallet', layers=2, load='e3_pack_box')
OXA, OXB = LINES['A']['out'][0], LINES['B']['out'][0]
PARK = {'코어 A': (5.6, -15.0), '코어 B': (0.6, -8.9), '조립품': (AX + 2.6, 10.2), '포장 지게차': (9.4, 11.6)}
for nm, (x, z) in PARK.items():
    zone(nm + (' 대기' if '지게차' in nm else ' AMR 대기'), 'storage', x, z, w=1.4 if '지게차' in nm else 1.0, d=1.4 if '지게차' in nm else 1.0)

# ---------------------------------------------------------------- AMR network and movers
north = sorted({0.0, 0.6, OXB, 3.2, 4.4, 11.64, 19.6}); south = sorted({AX, AX - 2.3, AX + 2.6, PX - 1.2, PALX, 9.4, 0.0, 11.64, *DOORS}, reverse=True)  # 0 / 11.64: crossovers
route('순환 경로', [(-28, NL)] + [(x, NL) for x in north] + [(28, NL), (28, SL)] + [(x, SL) for x in south] + [(-28, SL), (-28, NL)], oneway=True)
route('남행 연결로', [(11.64, NL), (11.64, SL)], oneway=True)
route('북행 연결로', [(0.0, SL), (0.0, NL)], oneway=True)
route('도킹', [(19.6, NL), (19.6, NL - 1.25)])
route('도킹', [(OXB, NL), (OXB, AZB)])                     # under line B's outfeed belt end
route('도킹', [(0.6, NL), (0.6, -8.9)])                     # line B's second core AMR waits here
# line A's outfeed is reached by a one-way loop east of the lines: in between them, through the outfeed, out along the north wall
route('A 라인 순환로', [(3.2, NL), (3.2, -13.9), (OXA, -13.9), (OXA, AZA), (OXA, -18.4), (4.4, -18.4), (4.4, -15.0), (4.4, NL)], oneway=True)
route('도킹', [(4.4, -15.0), (5.6, -15.0)])                 # line A's second core AMR waits here
route('도킹', [(AX, SL), (AX, OPZ)])                        # between the two operators of the assembly cell
for x in (AX - 2.3, PX - 1.2):
    route('도킹', [(x, SL), (x, 10.4)])
route('도킹', [(AX + 2.6, SL), (AX + 2.6, 9.6)])
route('도킹', [(PALX, SL), (PALX, r3(PALZ - 1.16))])        # forklift: forks into the pallet beside the packing bench
route('도킹', [(9.4, SL), (9.4, 10.6)])                      # the packing forklift waits here until the pallet is full
route('셔터 통로', [(DOORS[1], SL), (DOORS[1], 16.4)])
ref = {o['name']: 'zone:' + o['id'] for o in objects if o['type'] == 'zone'}
stop = lambda at, act, dwell=8: {'at': ref[at], 'act': act, 'dwell': dwell}
deck = lambda name, x, z, stops: add('amr', name, x, z, 0, {'model': 'e3_amr_deck_bot', 'length': 1.0, 'width': 0.75, 'speed': 1.2, 'payload': 120, 'dwell': 6, 'load': 'e3_tote_600x400', 'stops': stops})
for ln, starts in (('A', ((-4.0, NL), (14.0, SL))), ('B', ((-2.0, NL), (12.0, SL)))):
    for k, (x, z) in enumerate(starts):
        deck(f'코어 AMR {ln}{k + 1}', x, z, [stop(f'코어 {ln} AMR 대기', 'wait', 1), stop(f'브레이징 코어 적재 (라인 {ln})', 'wait', 1), stop(f'브레이징 코어 적재 (라인 {ln})', 'load', 4), stop('조립 투입대 (브레이징 코어)', 'unload', 6)])
for k, (x, z) in enumerate(((-12.0, SL), (6.0, SL))):
    deck(f'조립품 AMR {k + 1}', x, z, [stop('조립품 AMR 대기', 'wait', 1), stop('조립 · 리크 완료 적재', 'wait', 1), stop('조립 · 리크 완료 적재', 'load', 4), stop('포장 투입대 (EGR 쿨러)', 'unload', 6)])
for bnch in asm: bnch['params']['feeds'] = ref['조립 · 리크 완료 적재']
pack['params']['feeds'] = ref['출하 팔레트 적재']
fork = lambda name, x, z, stops: add('amr', name, x, z, 0, {'model': 'uw_forklift', 'length': 2.4, 'width': 1.2, 'speed': 1.1, 'payload': 1500, 'dwell': 10, 'load': 'e3_pack_box', 'layers': 2, 'stops': stops})
fork('포장 지게차', 8.0, SL, [stop('포장 지게차 대기', 'wait', 1), stop('출하 팔레트 적재', 'load'), stop('완제품 랙 입고', 'unload')])
fork('출하 지게차', 20.0, SL, [stop('완제품 랙 입고', 'load'), stop('출하 대기', 'unload', 12)])

doc = {'version': 2, 'factory': {'width': W, 'depth': D, 'height': H}, 'objects': objects}
out = os.path.join(ROOT, 'assets/layouts/egr-factory.json')
with open(out, 'w', encoding='utf-8') as f: json.dump(doc, f, ensure_ascii=False, separators=(',', ':'))
idx = os.path.join(ROOT, 'assets/layouts/index.json')
with open(idx, encoding='utf-8') as f: examples = [e for e in json.load(f) if e['file'] != 'egr-factory.json']
examples.insert(0, {'file': 'egr-factory.json', 'name': 'EGR 쿨러 공장 예시', 'note': '64×40 m 공장 · A/B 비교: 라인 A 작업자 수동 도포 / 라인 B ONE STATION 자동 도포 · 자동창고 → 프레스 → 코어 적층 → 도포 → 진공 브레이징 → 검사 · NG → AMR → 조립 · 리크 테스트 → DMC · 포장 (팔레트) → 지게차 → 완제품 → 출하'})
with open(idx, 'w', encoding='utf-8') as f: json.dump(examples, f, ensure_ascii=False)
print(out, len(objects), 'objects')
