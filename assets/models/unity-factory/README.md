# Unity Factory 설비 모델 (GLB)

출처: Unity Asset Store **"Unity Factory"** (Unity Technologies Japan, 무료, [Standard Asset Store EULA](https://unity.com/legal/as-terms)).
Unity 에디터에서 임포트한 FBX·텍스처·프리팹 머티리얼 할당을 Blender(bpy)로 GLB로 변환한 것.
EULA상 에셋은 이 사이트에 통합된 형태로만 쓰고, 파일 자체를 따로 재배포하지 않는다.

- 단위 미터, Y-up, 바닥 y = 0. Draco 압축 (`realvirtual/draco/` 디코더로 로드).
- 텍스처 1K JPEG (로봇팔·가공품 2K). ORM = R:AO G:Roughness B:Metallic. 색은 HDRP 커스텀 셰이더의 `_Color`.
- 머티리얼은 Unity 프리팹의 메시별 할당 그대로 (`prefab_materials.json`은 변환 도구에만 필요, 레포에는 없음).

| 파일 | 내용 | 크기 x × y × z (m) |
|---|---|---|
| Line_01.glb | 캐비닛형 벨트 유닛 | 0.93 × 1.26 × 0.90 |
| Line_02.glb | 소형 벨트 유닛 | 0.69 × 0.89 × 0.69 |
| Line_03.glb | 곡선 벨트 유닛 | 0.77 × 0.90 × 0.77 |
| Line_04.glb | 벨트 컨베이어 (아크릴 커버) | 0.60 × 0.85 × 4.65 |
| Line_05.glb | 벨트 컨베이어 (아크릴 커버) | 0.60 × 0.85 × 2.25 |
| Line_06.glb | 알루미늄 프레임 가공 셀 | 1.16 × 2.18 × 1.35 |
| Line_07.glb | 로봇 셀 본체 (콘솔·모니터·로봇 받침) | 3.37 × 2.21 × 2.86 |
| Line_07A/B/C.glb | 로봇 셀 가드 프레임 (램프 포함), 본체와 같은 원점 | ≈ 3.0 × 3.2–3.9 × 2.4–3.6 |
| Arm.glb | 6축 로봇팔, 관절 노드 `Rig_Arm_1`(베이스) `Rig_Arm_2`~`Rig_Arm_5` | 1.30 × 2.95 × 0.71 |
| Product.glb | 가공품 트레이 | 0.40 × 0.21 × 0.63 |
| Controller_1.glb | 제어반 (대형) | 1.70 × 2.27 × 0.47 |
| Controller_2.glb / Controller_3.glb | 조작반 (램프 타워) | 0.40 × 1.25 × 1.5–1.6 |

로봇 셀 조합 (Unity `Line_07.prefab`): Line_07 + 07A + 07B + 07C 는 모두 원점에, Arm 은 (1.42, 0.149, 0) m
(Unity 값 x = −1.42 의 X 미러 — GLB는 Blender FBX 임포트 좌표계).

## 콘솔 1에서

`js/factory-assets.js` 가 `uf_*` 이름으로 등록하고, `js/factory-unity.js` 가 팔레트 **설비 → 설비 모델 (Unity Factory)**
요소 타입(`ufmodel`)으로 노출한다: 모델 선택 · 배율 · 로봇팔 동작 주기. 로봇팔(단독 또는 로봇 셀)은 관절 래퍼
`UF_J1`(베이스 yaw, Z) `UF_J2`~`UF_J4`(피치, Y)로 천천히 흔들리고, 같은 동작이 콘솔 2용 드라이브로 기록된다.
GLB가 아직 로드되지 않은 동안은 같은 크기의 반투명 회색 상자가 자리를 지킨다.

## 재변환

Unity 프로젝트(2022.3 이상, HDRP)에 에셋을 임포트하고 `Assets/Editor/DumpPrefabMaterials.cs`(Tools → Dump Prefab Materials)로
`prefab_materials.json`을 만든 뒤, `prep_textures.py`(텍스처 축소·ORM 생성) → `build_glb.py`(bpy 5.x, FBX → GLB) →
`gltf-transform draco`. 도구 스크립트는 변환 작업 zip(`unity-factory-glb.zip`)의 `tools/`에 있다.
