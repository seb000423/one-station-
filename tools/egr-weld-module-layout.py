"""Builds assets/layouts/egr-weld-module.json, ONE BUILDER's example of the EGR cooler automatic welding module line: the five
cells of the real line's CAD (assets/models/egr-weld-module/, converted by tools/egr-weld-module/) at their CAD positions, in a
36 x 20 m hall, and nothing else (the user wants only what the STEP design contains):

  A. core-assy loading & Ni paste (2 lanes: centring, direction/fin vision, barcode, handling robot, laser profiler, dispensing,
     nozzle vision, weight check, NG conveyor) -> B. end-tank assembly (shuttle, 2 tank presses, vision, scan laser welding) ->
  C. tack welding (jig transfer loop, flange feeders, 4 MIG robots, manual MIG booth) -> D. C/F check, external paste, manual check,
  unloading -> E. leak test (barcode, turntable, visual, robot leak jig, laser marking, gasket & bolt, OK/NG).

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

# Only what the CAD contains is placed: no floor labels, people, vehicles or boards (removed on the user's request, 2026-10-28).

doc = {'version': 2, 'factory': {'width': W, 'depth': D, 'height': H}, 'objects': objects}
out = os.path.join(ROOT, 'assets/layouts/egr-weld-module.json')
with open(out, 'w', encoding='utf-8') as f: json.dump(doc, f, ensure_ascii=False, separators=(',', ':'))
idx = os.path.join(ROOT, 'assets/layouts/index.json')
with open(idx, encoding='utf-8') as f: examples = [e for e in json.load(f) if e['file'] != 'egr-weld-module.json']
examples.insert(1, {'file': 'egr-weld-module.json', 'name': 'EGR 쿨러 자동 용접 모듈 라인 (CAD)', 'note': '36×20 m 공장 · 실제 라인 CAD의 셀 5개만 설계 좌표 그대로 배치 · 코어 Assy 투입 · 페이스트 도포 → 엔드 탱크 프레스 · 레이저 용접 → 택 용접 (MIG 로봇 4대 · 수동 MIG) → C/F 검사 · 외부 도포 → 리크 테스트 · 마킹 · 가스켓'})
with open(idx, 'w', encoding='utf-8') as f: json.dump(examples, f, ensure_ascii=False)
print(out, len(objects), 'objects')
