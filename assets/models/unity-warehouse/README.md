# Unity Warehouse 창고 모델 (GLB)

출처: Unity Asset Store **"Unity Warehouse"** (Unity Technologies Japan, 무료, [Standard Asset Store EULA](https://unity.com/legal/as-terms)).
Unity 에디터에 임포트한 프리팹을 에디터 스크립트(`GlbExport.cs`)로 지오메트리·노드 계층 그대로 GLB로 내보내고,
머티리얼은 HDRP Shader Graph 속성(`_MainTex`, `_MSAo_Map`, `_Normal_Map`, `_Color`, Smoothness/Metallic Min·Max …)에서 다시 만든 것.
EULA상 에셋은 이 사이트에 통합된 형태로만 쓰고, 파일 자체를 따로 재배포하지 않는다.

- 단위 미터, Y-up, 원점 = Unity 프리팹 피벗 (바닥 y = 0). GLB 좌표는 Unity 좌표의 X 미러 (`x_glb = −x_unity`) — Unity Factory GLB와 같다.
- Draco 압축 (`realvirtual/draco/` 디코더로 로드). 텍스처 1K JPEG (지게차·리치 지게차 2K), ORM = R:AO G:Roughness B:Metallic,
  타일링은 `KHR_texture_transform`.
- LOD0만, 그림자용 평면(`*_shadow`)은 뺐다. 건물은 Unity 씬 전용인 `Skybox`(안쪽을 향한 상자)와 `Outside`(검은 외피·지붕)를 빼서
  위에서 내려다보면 철골·조명·바닥이 보인다.
- 작업자는 스킨드 메시를 `Standing2` 애니메이션 첫 프레임 포즈로 구워 정적 메시로 담았다.
- 골판지 상자 라벨(Shader Graph의 라벨 합성)은 빠지고 바탕 텍스처만 있다.

| 파일 | 내용 | 크기 x × y × z (m) |
|---|---|---|
| Building.glb | 창고 건물 (철골·벽·셔터·조명·바닥, 지붕 없음) | 37.66 × 9.80 × 65.03 |
| Shelf.glb | 파렛트 랙 (5단, 길이 15.5 m) | 1.14 × 7.06 × 15.52 |
| Forklift.glb | 지게차. 노드 `Rig_root` › `Rig_mast_2`(외측 마스트) › `Rig_mast_1`(포크), `Rig_tire_F/RL/RR`, `Rig_handle_pos/rot` | 1.49 × 2.79 × 4.74 |
| Reachlift.glb | 리치 지게차. 노드 `Rig_mast_1` › `Rig_mast_2` › `Rig_mast_3` › `Rig4mast_4`(포크), `Rig_tire_F/R` | 1.20 × 2.48 × 2.57 |
| Palletrobot.glb | 팔레트 운반 로봇 (저상 AGV). 노드 `Rig_root` › `Rig_tire`, `Rig_rubber`(리프트 패드) | 0.76 × 0.13 × 0.99 |
| Trolley.glb | 롤 대차 | 1.24 × 1.83 × 1.12 |
| Pallet.glb | 플라스틱 팔레트 | 1.07 × 0.13 × 1.06 |
| Sunoko.glb | 목재 팔레트 | 1.06 × 0.13 × 1.06 |
| Pedestal.glb | 팔레트 받침대 (프레임) | 1.10 × 0.18 × 1.13 |
| PlasticBox_A.glb | 플라스틱 박스 적재 (대, 팔레트 1단) | 1.04 × 0.80 × 1.05 |
| PlasticBox_B.glb | 플라스틱 박스 적재 (소) | 1.03 × 0.34 × 1.04 |
| Cardboard_A1/A2/A3.glb | 골판지 상자 적재 A (흰색·갈색 2종) | 1.05 × 0.82 × 1.03 |
| Cardboard_B1/B2/B3.glb | 골판지 상자 적재 B | 0.93 × 0.33 × 1.04 |
| Cardboard_C1/C2/C3.glb | 골판지 상자 적재 C | 1.05 × 0.37 × 1.04 |
| Worker.glb | 작업자 (서 있는 자세) | 0.79 × 1.89 × 0.40 |
| Tablet.glb | 태블릿 (원점 = 중심) | 0.31 × 0.22 × 0.01 |

합계 약 10.6 MB.

## 데모 씬 배치 — `scene-placements.json`

Unity `WarehouseSceneSample.unity`의 프리팹 인스턴스 3,003개 (`../unity-factory/scene-placements.json`은 `FactorySceneSample.unity`, 893개).

```json
{ "bounds": {"min": [x,y,z], "max": [x,y,z]},
  "items": [ {"prefab": "Reachlift", "catalogKey": "uw_reachlift", "x": -15.3, "y": 0, "z": 17.747, "yawDeg": 0, "scale": 1, "pivot": [-15.3, 0, 17]} ] }
```

- `x, y, z`: 콘솔 1 카탈로그 객체 위치 (`FactoryAssets.placed()` 래퍼 원점 = 모델의 x/z 중심·바닥). 그대로
  `position.set(x, y, z)`, `rotation.y = yawDeg · π/180`, `scale`. 기울어진 물체(손에 든 태블릿)는 `quat` [x, y, z, w]도 있다.
- `pivot`: Unity 프리팹 피벗 (같은 X 미러 좌표). `catalogKey`가 null인 항목은 없다.
- 빠진 것: 조명·스카이박스·콜라이더·플레이어, 그림자 쿼드, 비활성 인스턴스, 건물에 이미 들어 있는 `Light`·`Outside` FBX.
- 지게차는 씬에 언팩된 상태라 `Lift_body` 위치에서 프리팹 원점을 역산했다. 리치 지게차(와 운전자)는 Timeline이 움직여서
  씬 원본 위치가 (0, 0, 0)이므로, `Reachlift.anim` 첫 키 위치 (15.3, 0, 17)를 적용했다 (`"note": "Timeline start pose"`).
- 태블릿 위치는 원래 `UsingTablet` 애니메이션 손 위치라 서 있는 포즈 작업자 옆에 떠 보일 수 있다.

## 재변환

도구: `one_station/unity-warehouse-glb/tools/` (레포 밖).
1. Unity 6 HDRP 프로젝트(`C:\Users\seb00\UnityFactoryExtract`)에 에셋을 임포트하고 `GlbExport.cs`를 `Assets/Editor/`에 둔다.
   `<프로젝트>/glb_export_request.json`에 `prefab|<에셋 경로>|<out.glb>` · `scene|<씬 경로>|<out.json>` 줄을 쓰고 에디터를 켜 두거나
   `Unity.exe -batchmode -projectPath <프로젝트> -executeMethod GlbExport.RunBatch -quit`.
2. `python -I prep.py <프로젝트> <tex dir> raw/*.mats.json` (Pillow, numpy): 텍스처 축소·ORM 생성, `materials.json`.
3. `node build.cjs <gltf-transform node_modules> <tex dir> raw/X.glb X.glb [simplify ratio] [error]`: 머티리얼, 그림자·스카이박스 제거, Draco.
4. `node placements.cjs <repo> scene_warehouse.json scene_factory.json` → 두 `scene-placements.json`. 썸네일은 `tools/render-thumbs.cjs`.
