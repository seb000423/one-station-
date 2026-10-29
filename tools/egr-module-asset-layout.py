"""Builds assets/layouts/egr-module-asset.json, ONE BUILDER's default example: the EGR cooler welding module line rebuilt from generic
equipment (tools/egr-line-v3/module-line.js → assets/models/egr-line-v3/egr_module_line.glb) in the same 36 x 20 m hall and at the same
place as the CAD cells of egr-weld-module.json, with a floor label per station and a KPI board. The line model's frame: x along the flow
from cell A's inlet (x 0) to the leak test outlet (x 26.7), z across (main axis z 1.3); builder x = line x − 15.35, builder z = line z − 4.5.
Usage: python tools/egr-module-asset-layout.py   (from the repo root)"""
import json, math, os

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
r3 = lambda v: round(v, 3)
PI2 = r3(math.pi / 2)
objects, seq = [], [0]
W, D, H = 36, 20, 7

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

# ---------------------------------------------------------------- the line: one baked model, centred on its box (x −1.05 … 26.8, z −2.225 … 4.1 in line coords)
XS, ZS = -15.35, -4.5
L = lambda x, z: (r3(x + XS), r3(z + ZS))
model('EGR 용접 모듈 라인 (A 투입 · 도포 → B 엔드 탱크 · 레이저 → C 택 용접 → D C/F · 외부 도포 → E 리크 테스트)', 'e3_egr_module_line', *L(12.9375, 1.09))   # box −1.05 … 26.925 × −1.925 … 4.104 (build.mjs prints size and min)

# ---------------------------------------------------------------- station labels on the floor, on the aisle side (−Z), in flow order
LAB = -2.9
A = [('1 코어 Assy 투입 컨베이어 (2레인)', 0.5, 1.6), ('2 센터링 · 방향 검사', 0.55, 1.2), ('3 핀 비전 · 바코드', 0.9, 1.0), ('4 핸들링 로봇', 1.45, 0.9), ('5 레이저 프로파일', 1.75, 1.0), ('6 페이스트 도포', 1.9, 1.0), ('7 노즐 비전 · 8 중량 검사', 2.0, 1.4), ('9 NG 컨베이어', 2.5, 1.0)]
B = [('11 코어 셔틀', 3.0, 1.0), ('12 탱크 공급기', 3.3, 1.0), ('13 탱크 프레스 ×2', 4.2, 1.2), ('14 프레스 비전', 5.0, 1.0), ('15 이재기 · 버퍼', 5.0, 1.2), ('16 스캔 레이저 용접', 6.5, 1.4), ('17 레이저 NG 컨베이어', 5.85, 1.4)]
C = [('18 플랜지 공급기 ×2', 7.9, 1.4), ('19 지그 트랜스퍼 (11 지그)', 8.9, 1.6), ('20 MIG 용접 로봇 ×4', 9.3, 1.4), ('21 용접 전원 · 와이어 드럼', 9.3, 1.6), ('22 수동 MIG 작업대', 10.9, 1.2), ('23 배출 피치 컨베이어', 11.2, 1.4)]
Dd = [('24 2차 C/F 검사', 13.0, 1.2), ('25 외부 페이스트 도포', 14.8, 1.4), ('26 페이스트 탱크 ×4', 14.8, 1.2), ('27 수동 검사대', 16.6, 1.0), ('28 배출 컨베이어', 17.8, 1.2)]
E = [('29 리크 투입 컨베이어', 19.8, 1.4), ('30 바코드 · 턴테이블', 20.7, 1.2), ('31 외관 검사', 21.3, 1.0), ('32 리크 테스트 지그 + 로봇', 22.5, 1.6), ('33 레이저 마킹', 23.4, 1.0), ('34 가스켓 · 볼트 조립', 24.5, 1.4), ('35 OK / NG 지그 · NG 보관', 25.7, 1.6), ('36 배출 리프트', 26.4, 1.0)]
rows = {}
for cell, items, dz in (('A', A, 0), ('B', B, 0), ('C', C, -0.7), ('D', Dd, 0.6), ('E', E, 0.6)):
    for nm, x, w in items:
        z = LAB + dz
        while any(abs(x - px) < (w + pw) / 2 + 0.1 for px, pw in rows.get(z, [])): z -= 0.5   # stagger labels that would overlap
        rows.setdefault(z, []).append((x, w)); station(f'{cell} · {nm}', *L(x, z), w=w)

# ---------------------------------------------------------------- KPI board over cell A (assumed values until the field numbers come in)
add('kpi', 'KPI 용접 모듈 라인', *L(1.2, 1.3), 0, {'title': 'EGR 쿨러 자동 용접 모듈 라인', 'rows': ['라인 피치|40 s|가정', 'UPH|90 개/h|가정', '라인 인원|4 명 (투입 · 수동 MIG · 수동 검사 · 배출)', '핸들링 로봇|3 대 (도포 · 레이저 · 리크)', 'MIG 로봇|4 대', 'NG 배출|도포 · 레이저 · 리크 판정 후', '검사|핀 비전 · 노즐 비전 · 중량 · 프레스 비전 · C/F · 외관 · 리크'], 'w': 3.6, 'h': 2.1, 'y': 3.0, 'hang': 7.0})

doc = {'version': 2, 'factory': {'width': W, 'depth': D, 'height': H}, 'objects': objects}
out = os.path.join(ROOT, 'assets/layouts/egr-module-asset.json')
with open(out, 'w', encoding='utf-8') as f: json.dump(doc, f, ensure_ascii=False, separators=(',', ':'))
idx = os.path.join(ROOT, 'assets/layouts/index.json')
with open(idx, encoding='utf-8') as f: examples = [e for e in json.load(f) if e['file'] != 'egr-module-asset.json']
examples.insert(0, {'file': 'egr-module-asset.json', 'name': 'EGR 쿨러 용접 모듈 라인 (에셋 재구성)', 'note': 'CAD 라인과 같은 셀 5개 · 스테이션 35개를 자체 에셋으로 재구성 · 코어 Assy 투입 · 도포 → 엔드 탱크 프레스 · 레이저 용접 → 택 용접 (MIG 로봇 4대 · 수동 MIG) → C/F 검사 · 외부 도포 → 리크 테스트 · 마킹 · 가스켓 · OK/NG'})
with open(idx, 'w', encoding='utf-8') as f: json.dump(examples, f, ensure_ascii=False)
print(out, len(objects), 'objects')
