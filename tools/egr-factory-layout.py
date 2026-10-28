"""Builds assets/layouts/egr-factory.json, ONE BUILDER's default example: one 64 x 40 m hall (8 m eave) around the EGR
cooler line, every part at real scale, with material flowing through it continuously:

  north shutter  --AGV-->  AS/RS cells (plate kits)  ->  two EGR core lines (A: manual paste, B: ONE STATION robot cell):
  process inspection -> core stacking -> Ni paste (six lines) -> vacuum brazing -> vision + NG  --AMR-->
  welding line (south): Body TIG -> 1st pressure test -> robot MIG -> three manual MIG booths -> C/F final inspection -> DMC, carton
  on the shipping pallet  --forklift-->  finished-goods rack  --forklift-->  shipping dock
The brazed core is a semi-finished part: it only reaches the rack as a finished, packed cooler.

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
NDOOR = 7.0                         # north shutter: inbound totes of plate blanks for the AS/RS cells (empty totes go back out here)
for n, (a, b) in enumerate(((-W / 2, NDOOR - 2.2), (NDOOR + 2.2, W / 2))):
    add('wall', f'북쪽 벽 {n + 1}', (a + b) / 2, -Z0, 0, {'length': r3(b - a), 'thickness': 0.2, 'h': 0, 'windows': True})
add('door', '부품 입고 셔터 (북)', NDOOR, -Z0, 0, {'width': 4, 'height': 4.5, 'thickness': 0.2})
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
        if (z > 0 and any(abs(x - d) < 2.6 for d in DOORS)) or (z < 0 and abs(x - NDOOR) < 2.6): continue      # the shutter headers carry these frames
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
         'B': dict(z=AZB, model='e3_egr_core_line', asrs='e3_asrs_cell', P=32, DT=22, name='EGR 코어 라인 B (ONE STATION 자동 도포)')}
def good_drops(P, DT):   # phases of the line clip (8 P s) at which a good brazed core drops into the AMR tote (mirrors egrCoreLine in models.js)
    out, a0 = set(), 60 + (DT - 12); F0 = a0 + 2 + 2 * P
    for j in range(-9, 9):
        if j % 8 == 5: continue
        b = P * j + 16; a = b + 32 + DT; F = F0 + 4 * P * math.ceil((a - F0 + 1e-6) / (4 * P)); slot = 3 - round((F - 2 - a) / P)
        out.add(round((F + 106 + 6 * slot + 14.6) % (8 * P), 1))   # the outfeed operator lays it into the tote
    return sorted(out)
for k, L in LINES.items():
    # the AS/RS model's box is 0.179 m off centre in Z (the tote lifts on its infeed side; cell A is mirrored), so the pick station stays on the line axis
    model(f'자동창고 일체형 셀 {k}', L['asrs'], -23.4, r3(L['z'] + (0.179 if k == 'A' else -0.179)), r3(math.pi))
    model(L['name'], L['model'], LX0 + 7.45, L['z'] - 0.685)
    L['out'] = (r3(LX0 + 16.95), L['z']); L['good'] = good_drops(L['P'], L['DT'])   # out: just past the belt end (16.6), the outfeed operator turns to it

# ---------------------------------------------------------------- station names on the floor (zones without stock; their labels read right in ONE MONITOR too)
def station(name, x, z, w=1.2, d=0.4): zone(name, 'storage', x, z, w=w, d=d)
for k, L in LINES.items():
    zs = L['z'] + 1.45
    station(f'피킹 스테이션 ({k})', -15.965, r3(L['z'] + 1.45), w=1.0)
    station(f'공정검사대 ({k})', LX0 + 1.0, r3(zs), w=1.2)
    station(f'코어 적층 · 작업자 ({k})', LX0 + 2.7, r3(zs), w=1.6)
    station('수동 도포 · 작업자 (A)' if k == 'A' else 'ONE STATION 자동 도포 셀 (B)', LX0 + 4.6, r3(zs + (0.35 if k == 'B' else 0)), w=1.8)
    station(f'진공 브레이징로 ({k})', LX0 + 10.1, r3(zs), w=1.8)
    station(f'브레이징 후 검사 · NG ({k})', LX0 + 14.4, r3(zs), w=1.6)
    station(f'배출 · AMR 적재 ({k})', LX0 + 16.0, r3(zs + 0.05), w=1.2)

# ---------------------------------------------------------------- KPI boards hung over each line's dispensing station (assumed values until the field numbers come in)
def uph(L): return round(3600 / L['P'] * 7 / 8)
KPI = {'A': ['도포 사이클 (코어 1개)|40 s|가정', '도포 인원|1 명|가정', '라인 피치 · UPH|64 s · %d 개/h|가정' % uph(LINES['A']), '도포 누락 검출|브레이징 후', 'NG|브레이징 후 폐기', '병목 공정|수동 도포', '도포 패턴|선 6줄 (2 × 3)'],
       'B': ['도포 셀 C/T|25 s|실측', '도포 인원 (투입 · 회수)|1 명|실측', '도포 셀 능력|144 개/h', '라인 피치 · UPH|32 s · %d 개/h' % uph(LINES['B']), '도포 누락 검출|도포 직후 비전|실측', 'NG|보관 → Rework', '병목 공정|자동창고 피킹']}
for k, L in LINES.items():
    add('kpi', f'KPI 라인 {k}', LX0 + 4.6, L['z'] + 0.05, 0, {'title': ('라인 A · 작업자 수동 도포' if k == 'A' else '라인 B · ONE STATION 자동 도포'), 'rows': KPI[k], 'w': 3.6, 'h': 2.1, 'y': 3.3, 'hang': 8.0})

# ---------------------------------------------------------------- finished goods (east, north): pallet racks, reach truck
add('rack', '완제품 랙 A', 22, -17.9, 0, {'bays': 4, 'levels': 3, 'bayWidth': 2.7, 'depth': 1.1, 'levelHeight': 2.0, 'perSlot': 2, 'fill': 60, 'load': 'carton'})
add('rack', '완제품 랙 B', 22, -14.4, 0, {'bays': 4, 'levels': 3, 'bayWidth': 2.7, 'depth': 1.1, 'levelHeight': 2.0, 'perSlot': 2, 'fill': 45, 'load': 'carton'})
model('리치 지게차 (대기)', 'uw_reachlift', 29.0, -16.2, PI2)

# ---------------------------------------------------------------- downstream (south): the brazed core is semi-finished; the welding line turns it into the cooler:
# Body TIG (shell over the core) → 1st pressure test → robot MIG (gas flanges) → three manual MIG booths (coolant pipes, bracket) → C/F final
# inspection → DMC marking → carton (8 coolers, 600 × 400 × 300) on the shipping pallet behind the packing operator. One baked model
# (Weld_Cycle 512 s, 21 coolers: the good output of both core lines, one every 24.38 s); its origin sits at (WX0, WZ), its box is centred on
# (x 6.87, z −0.305) in model space. Operators stand on the lane side (−Z).
NL, SL = -8.0, 8.0                   # lanes: eastbound north (south of line B), westbound south
WX0, WZ = -10.0, 12.35
PW = 512 / 21
model('EGR 용접 라인 (Body TIG → 강압 검사 → 로봇 MIG → 수동 MIG → C/F → 포장)', 'e3_egr_weld_line', WX0 + 6.87, WZ - 0.305)
WELD_PICK = [round(1.6 + i * PW, 2) for i in range(21)]                    # the TIG operator takes core i out of the tote (mirrors egrWeldLine in models.js)
WELD_DROP = sorted(round((170.867 + i * PW) % 512, 2) for i in range(21))   # the packing operator lays cooler i into the carton on the pallet
for nm, dx, w in (('Body TIG 용접 셀', 0, 1.4), ('1차 강압 검사', 1.75, 1.2), ('로봇 MIG 용접 셀', 4.3, 1.4), ('수동 MIG 작업대 1', 6.95, 1.5), ('수동 MIG 작업대 2', 8.95, 1.5),
                  ('수동 MIG 작업대 3', 10.95, 1.5), ('C/F 최종 검사', 13.1, 1.0), ('DMC 각인 · 포장', 14.15, 1.0)):
    zone(nm, 'storage', WX0 + dx, WZ + 1.4, w=w, d=0.4)

# ---------------------------------------------------------------- zones (stock kept: AMRs wait when a pickup is empty / a drop-off is full)
# the AMR leaves with the 7 good cores of two furnace batches (one 256 s cycle) and always right before a 110 s gap, so the next AMR is in place
# before the next core drops (the run starts with 2 cores of the previous batch in the tote)
for k, L in LINES.items():   # the AMR leaves with the 7 good cores of one clip (two furnace batches), right before the long gap; 2 cores of the previous run are in it at start
    cz = zone(f'브레이징 코어 적재 (라인 {k})', 'pickup', *L['out'], w=0.8, d=1.2, track=True, stock=2, cap=16, supplyAt=L['good'], supplyPeriod=8 * L['P'], unitKg=0.9, thresholdKg=6.3, unit='part', load='e3_brazed_core')
    cz['perm'] = {'amr': True}
# the input stand: a core AMR rolls a tote of 7 brazed cores onto it; the tote is done when the TIG operator has taken its 7th core
zone('용접 투입대 (브레이징 코어)', 'dropoff', WX0 - 0.8, r3(WZ - 1.3), w=0.7, d=0.5, track=True, stock=2, cap=3, consumeAt=[WELD_PICK[6], WELD_PICK[13], WELD_PICK[20]], consumePeriod=512, unit='tote', standH=0.62, load='e3_tote_brazed')
# the shipping pallet stands behind the packing operator: a carton per 8 coolers, 2 layers of 4 (64 coolers); the forklift's forks enter it 1.16 m ahead of its stop
PALX, PALZ = WX0 + 14.15, r3(WZ - 1.75)
zone('출하 팔레트 적재', 'pickup', PALX, PALZ, w=1.4, d=1.4, track=True, stock=40, cap=64, supplyAt=WELD_DROP, supplyPeriod=512, unitKg=1.5, thresholdKg=96, unit='pallet', perBox=8, layers=2, load='e3_pack_box')
# finished goods: a pallet rack facing the lane; the packing forklift puts each pallet into the middle bay on the bottom deck (0.21 m), the
# shipping forklift takes it out again
FGX, FGZ = 14.0, -11.3
add('rack', '완제품 팔레트 랙', FGX, FGZ, 0, {'bays': 3, 'levels': 2, 'bayWidth': 1.4, 'depth': 1.2, 'levelHeight': 1.8, 'perSlot': 1, 'fill': 0, 'load': 'none'})
zone('완제품 랙 (가운데 칸)', 'storage', FGX, FGZ, w=1.3, d=1.1, track=True, stock=1, cap=1, unit='pallet', standH=0.21, layers=2, load='e3_pack_box')
zone('출하 대기', 'dropoff', DOORS[1], r3(16.4 + 1.16), w=1.4, d=1.4, track=True, stock=0, cap=1, consume=70, unit='pallet', layers=2, load='e3_pack_box')
OXA, OXB = LINES['A']['out'][0], LINES['B']['out'][0]
# AS/RS tote exchange: the cells take a full tote (8 kits) off the inbound lift / put the empty one on the outbound lift at fixed phases of their 512 s clip
EXA, EXB = [214.0, 470.0], [246.0, 502.0]   # every empty tote leaves, a full one replaces it (A: 4 kits / 256 s, B: 8 kits / 256 s; ASRS_Cycle 512 s)
KITLOAD = {'A': 'e3_tote_blanks4', 'B': 'e3_tote_blanks'}
LIFT_IN, LIFT_OUT = -17.065, -18.365
for k, ex, zz in (('A', EXA, AZA + 1.6), ('B', EXB, AZB - 1.6)):
    zone(f'자동창고 {k} 입고 리프트', 'dropoff', LIFT_IN, r3(zz), w=0.7, d=0.6, track=True, stock=1, cap=1, consumeAt=ex, consumePeriod=512, unit='tote', standH=0.62, stand=False, load=KITLOAD[k])
    zone(f'자동창고 {k} 반출 리프트', 'pickup', LIFT_OUT, r3(zz), w=0.7, d=0.6, track=True, stock=0, cap=1, supplyAt=[round(t + 7, 1) for t in ex], supplyPeriod=512, unit='tote', standH=0.62, stand=False, load='e3_tote_600x400')
zone('부품 상자 입고 B (북 셔터)', 'pickup', NDOOR - 1.2, -18.75, w=0.7, d=0.6, track=True, stock=2, cap=3, supply=120, unit='tote', standH=0.62, load='e3_tote_blanks')    # trucks bring them
zone('부품 상자 입고 A (북 셔터)', 'pickup', NDOOR - 0.4, -18.75, w=0.7, d=0.6, track=True, stock=2, cap=3, supply=120, unit='tote', standH=0.62, load='e3_tote_blanks4')
zone('빈 상자 반납 (북 셔터)', 'dropoff', NDOOR + 0.6, -18.75, w=0.7, d=0.6, track=True, stock=0, cap=3, consume=60, unit='tote', standH=0.62, load='e3_tote_600x400')
PARK = {'코어 A': (5.6, -15.0), '코어 B': (0.6, -8.9), '포장 지게차': (9.4, 11.6)}
for nm, (x, z) in PARK.items():
    zone(nm + (' 대기' if '지게차' in nm else ' AMR 대기'), 'storage', x, z, w=1.4 if '지게차' in nm else 1.0, d=1.4 if '지게차' in nm else 1.0)

# ---------------------------------------------------------------- AMR network and movers
north = sorted({0.0, 0.6, OXB, 3.2, 4.4, 11.64, FGX}); south = sorted({WX0 - 0.8, PALX, 9.4, 0.0, 11.64, *DOORS}, reverse=True)  # 0 / 11.64: crossovers
route('순환 경로', [(-28, NL)] + [(x, NL) for x in north] + [(28, NL), (28, SL)] + [(x, SL) for x in south] + [(-28, SL), (-28, NL)], oneway=True)
route('남행 연결로', [(11.64, NL), (11.64, SL)], oneway=True)
route('북행 연결로', [(0.0, SL), (0.0, NL)], oneway=True)
route('도킹', [(FGX, NL), (FGX, r3(FGZ + 1.16))])            # forks into the rack bay
route('도킹', [(OXB, NL), (OXB, AZB)])                     # under line B's outfeed belt end
route('도킹', [(0.6, NL), (0.6, -8.9)])                     # line B's second core AMR waits here
# line A's outfeed is reached by a one-way loop east of the lines: in between them, through the outfeed, out along the north wall
route('A 라인 순환로', [(4.4, NL), (4.4, -13.9), (4.4, -15.0), (4.4, -18.4), (OXA, -18.4), (OXA, AZA), (OXA, -14.9), (3.2, -14.9), (3.2, -13.9), (3.2, NL)], oneway=True)
# inbound corridor (two-way, only the AS/RS AGV drives it): north shutter → between the lines → the AS/RS tote lifts (spurs north to cell A,
# south to cell B; at each cell the inbound lift at x −17.065 and the outbound lift at x −18.365)
route('자동창고 입고 통로', [(NDOOR, -18.0), (NDOOR, -13.9), (4.4, -13.9), (3.2, -13.9), (-16.4, -13.9), (-16.9, -13.2), (LIFT_IN, -13.2), (LIFT_OUT, -13.2)])
for x in (LIFT_IN, LIFT_OUT):
    route('도킹', [(x, -13.2), (x, -13.85)]); route('도킹', [(x, -13.2), (x, -12.55)])
route('도킹', [(4.4, -15.0), (5.6, -15.0)])                 # line A's second core AMR waits here
route('도킹', [(WX0 - 0.8, SL), (WX0 - 0.8, 10.4)])            # the core AMRs roll their tote onto the welding line's input stand
route('도킹', [(PALX, SL), (PALX, r3(PALZ - 1.16))])        # forklift: forks into the pallet beside the packing bench
route('도킹', [(9.4, SL), (9.4, 10.6)])                      # the packing forklift waits here until the pallet is full
route('셔터 통로', [(DOORS[1], SL), (DOORS[1], 16.4)])
ref = {o['name']: 'zone:' + o['id'] for o in objects if o['type'] == 'zone'}
stop = lambda at, act, dwell=8: {'at': ref[at], 'act': act, 'dwell': dwell}
deck = lambda name, x, z, stops: add('amr', name, x, z, 0, {'model': 'e3_amr_deck_bot', 'length': 1.0, 'width': 0.75, 'speed': 1.2, 'payload': 120, 'dwell': 6, 'load': 'e3_tote_600x400', 'stops': stops})
for ln, starts in (('A', ((-4.0, NL), (14.0, SL))), ('B', ((-2.0, NL), (12.0, SL)))):
    for k, (x, z) in enumerate(starts):
        deck(f'코어 AMR {ln}{k + 1}', x, z, [stop(f'코어 {ln} AMR 대기', 'wait', 1), stop(f'브레이징 코어 적재 (라인 {ln})', 'wait', 1), stop(f'브레이징 코어 적재 (라인 {ln})', 'load', 4), stop('용접 투입대 (브레이징 코어)', 'unload', 6)])
fork = lambda name, x, z, stops: add('amr', name, x, z, 0, {'model': 'uw_forklift', 'length': 2.4, 'width': 1.2, 'speed': 1.1, 'payload': 1500, 'dwell': 10, 'load': 'e3_pack_box', 'layers': 2, 'stops': stops})
ex = lambda k: [stop(f'부품 상자 입고 {k} (북 셔터)', 'load', 5), stop(f'자동창고 {k} 입고 리프트', 'unload', 5), stop(f'자동창고 {k} 반출 리프트', 'load', 5), stop('빈 상자 반납 (북 셔터)', 'unload', 5)]
add('amr', '자동창고 입고 AGV', NDOOR, -16.0, 0, {'model': 'e3_amr_deck_bot', 'length': 1.0, 'width': 0.75, 'speed': 1.3, 'payload': 120, 'dwell': 5, 'load': 'e3_tote_blanks', 'loads': ['e3_tote_blanks', 'e3_tote_blanks4', 'e3_tote_600x400'], 'stops': ex('A') + ex('B')})
fork('포장 지게차', 8.0, SL, [stop('포장 지게차 대기', 'wait', 1), stop('출하 팔레트 적재', 'load'), stop('완제품 랙 (가운데 칸)', 'unload')])
fork('출하 지게차', 20.0, SL, [stop('완제품 랙 (가운데 칸)', 'load'), stop('출하 대기', 'unload', 12)])

doc = {'version': 2, 'factory': {'width': W, 'depth': D, 'height': H}, 'objects': objects}
out = os.path.join(ROOT, 'assets/layouts/egr-factory.json')
with open(out, 'w', encoding='utf-8') as f: json.dump(doc, f, ensure_ascii=False, separators=(',', ':'))
idx = os.path.join(ROOT, 'assets/layouts/index.json')
with open(idx, encoding='utf-8') as f: examples = [e for e in json.load(f) if e['file'] != 'egr-factory.json']
examples.insert(0, {'file': 'egr-factory.json', 'name': 'EGR 쿨러 공장 예시', 'note': '64×40 m 공장 · A/B 비교: 라인 A 작업자 수동 도포 / 라인 B ONE STATION 자동 도포 · 자동창고 → 공정검사 → 코어 적층 → 도포 → 진공 브레이징 → 검사 · NG → AMR → Body TIG → 1차 강압 검사 → 로봇 MIG → 수동 MIG → C/F 최종 검사 → DMC · 포장 (팔레트) → 지게차 → 완제품 → 출하'})
with open(idx, 'w', encoding='utf-8') as f: json.dump(examples, f, ensure_ascii=False)
print(out, len(objects), 'objects')
