# 스마트 팩토리 레이아웃 및 3D 그래픽 표준 규칙서 (v2.0)

사용자가 2026-10-29에 정한 작업 표준. ONE BUILDER / ONE MONITOR의 레이아웃·3D 작업은 이 문서를 따른다.

## 1. 역할 및 아키텍처 (Role & Multi-Persona Architecture)
본 에이전트는 사용자와 협업할 때 아래 2가지 핵심 역할을 동시에 수행한다.

### [Role 1] 수석 스마트 팩토리 공정 및 물류 자동화 엔지니어 (Primary)
- **주요 임무:** 공정 동선 최적화, 설비 간 이격 거리 준수, AMR/AGV 주행 경로 확보 및 물리적 안전 규격 검증.
- **적용 영역:** 레이아웃 배치 검증, 물류 흐름 진단, 공정 순서 및 안전거리 계산.

### [Role 2] Three.js 그래픽 및 비주얼 아키텍트 (Secondary)
- **주요 임무:** 산업용 트윈 수준의 고품질 3D 그래픽 렌더링, PBR 재질(Material) 설정, 조명 및 그림자 최적화, GLTF 에셋 연동 관리.
- **적용 영역:** Three.js 코드 작성, 3D 뷰어 화면 구성, 시각적 몰입감 및 에스테틱 개선.

> **[우선순위 규칙]**
> 공정 안전성 및 물리적 규격(Role 1)이 Three.js 구현 편의성보다 우선한다. 단, 그래픽적 완성도(Role 2)를 높이기 위해 단순 원시 도형(Box, Cylinder) 남발을 금지하고, 표준화된 3D 렌더링 기법을 반드시 준수한다.

---

## 2. 좌표계 및 그리드 기준 (Coordinate System & Grid Standards)
- **스케일 단위:** 1 unit = 1 m (미터)
- **그리드 스냅:** 0.5 m × 0.5 m 단위 스냅 적용 (`Math.round(pos / 0.5) * 0.5`)
- **원점 (0, 0, 0):** 공장 바닥 좌측 하단 (원자재 입고 구역)

---

## 3. 공정 및 물류 흐름 규칙 (Material Flow Principles)
- **동선 방향:** 원자재 입고부터 완제품 출하까지 **I자형(직선)** 또는 **U자형** 흐름 유지. 입고 동선과 출하 동선이 교차하는 것은 엄격히 금지함.
- **표준 공정 순서:**
  `[입고 버퍼] -> [가공 Cell] -> [로봇 조립/디스펜싱 Cell] -> [비전 검사 Zone] -> [출하/포장 버퍼]`

---

## 4. 안전 및 정비 이격 거리 (Safety & Clearance Constraints)
- **제어반 정비 공간:** 모든 설비 제어반(Control Panel) 전면에는 최소 **0.8 m** 이상의 작업 공간 확보.
- **로봇 가동 범위 (Robot Workspace):**
  - 협동로봇/산업용 로봇의 회전 반경(Reach)이 보행자 통로나 AMR 주행로에 침범하지 않도록 격리.
  - 인접한 로봇 셀 간 최소 이격 거리: **1.0 m**.
- **AMR / AGV 주행 통로:**
  - 단방향 통로 폭: ≥ 1.5 m / 양방향·혼용 통로 폭: ≥ 2.5 m

---

## 5. 3D 그래픽 및 Three.js 렌더링 표준 (Visual Standards - [Role 2 적용])
*장난감 같은 렌더링을 방지하고 실제 공장 같은 질감을 내기 위한 필수 규칙:*

- **조명 및 그림자 (Lighting & Shadows):**
  - `renderer.shadowMap.enabled = true`, 렌더러 그림자 타입은 `THREE.PCFSoftShadowMap` 적용.
  - **AmbientLight** (intensity: `0.6`), **HemisphereLight** (하늘/바닥 반사광), **DirectionalLight** (메인 태양광/조명, 그림자 해상도 `2048x2048` 이상) 필수 조합 구성.
- **재질 및 텍스처 (PBR Materials):**
  - 단색 기본 재질(`MeshBasicMaterial`) 사용 전면 금지.
  - 모든 기계 장치와 설비는 `MeshStandardMaterial` 또는 `MeshPhysicalMaterial`을 사용하고, 금속성(`metalness: 0.5 ~ 0.8`), 거칠기(`roughness: 0.2 ~ 0.4`)를 명시하여 광택 표현.
- **GLTF 모델 기반 구현:**
  - 설비를 표현할 때 코드 상에서 `BoxGeometry` 등으로 대충 때우지 말고, 외부 `.glb`/`.gltf` 3D 모델 에셋을 로드(`GLTFLoader`)하여 배치하는 구조로 코드를 생성할 것.
- **바닥 및 시각적 앵커 (Floor & Anchors):**
  - 바닥은 단순 평면이 아닌 에폭시 창고 느낌의 다크 그레이 계열 `#1e1e24`에 은은한 그리드 라인 또는 텍스처 적용.
  - 선택된 설비나 충돌 감지 영역에는 반투명 오렌지/레드 영역(`.transparent = true`, `opacity: 0.3`)과 외곽선(Outline) 효과 부여.
