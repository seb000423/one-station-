# ONE Twin 편집 API 명령 목록

자동 생성 파일입니다 (`npm run gen:twin`). 원본: `packages/core/src/commands.ts`.

모든 편집은 이 명령으로만 합니다 (기준서 R1 §2 원칙 4). 좌표는 mm, 각도는 deg, Z-up (`packages/schema/src/units.ts`).
`Editor.exec(name, args)`가 인자를 검증하고 실행하며, 모든 명령은 Undo/Redo가 됩니다.

## 공장 (factory)

| 명령 | 설명 | 인자 (?는 생략 가능) |
|---|---|---|
| `place_machine` | 설비 인스턴스를 공장에 배치 (machine@version 참조). 반환: 새 id | `ref`, `name?`, `position`, `yaw?`, `tagPrefix?`, `params?` |
| `add_block` | 공장 블록(펜스·계단·안돈·용기 …) 배치. 반환: 새 id | `type`, `name?`, `position`, `yaw?`, `params?` |
| `draw_wall` | 벽을 선으로 그림 (from → to, mm). 반환: 새 id | `from`, `to`, `thickness?`, `height?`, `name?` |
| `add_column` | 기둥 배치 | `position`, `size?`, `height?`, `name?` |
| `add_column_grid` | 기둥을 X×Y 간격 격자로 자동 배치. 반환: 새 id 목록 | `origin`, `nx`, `ny`, `dx`, `dy`, `size?` |
| `add_opening` | 문·셔터·도크·비상구 (벽 위에 두면 wall에 벽 id) | `kind`, `position`, `yaw?`, `wall?`, `params?`, `name?` |
| `add_marking` | 바닥 마킹: 통로선(aisle, polyline) · 구역(zone) · 안전 구역(safety, polygon) | `kind`, `polygon?`, `polyline?`, `params?`, `name?` |
| `add_mover` | 이동체 배치 (작업자 · AMR · 지게차) | `kind`, `position`, `yaw?`, `params?`, `name?` |
| `add_path` | 동선(AMR · 보행 · 지게차) 폴리라인 | `kind`, `points`, `oneway?`, `name?` |
| `add_storage` | 랙 · 바닥 보관 · 버퍼 | `kind`, `position`, `yaw?`, `capacity?`, `params?`, `name?` |
| `add_drop` | 유틸리티 드롭 (전원 · 에어 · 가스 · 물) | `kind`, `position`, `params?`, `name?` |
| `connect_flow` | 자재 흐름: 설비 출구 → 설비 입구 ("인스턴스id.소켓id"), 분기 비율 | `from`, `to`, `ratio?` |
| `set_meta` | 공장 이름 · 사이트 변경 | `name?`, `site?` |
| `set_slab` | 바닥 슬래브 외곽(다각형, mm) 설정. id가 없으면 첫 슬래브, 슬래브가 없으면 새로 만듦. 반환: 슬래브 id | `id?`, `polygon`, `thickness?`, `finish?` |
| `add_roof` | 지붕 배치 (position = 지붕 중심, params: w·d mm, eave 처마 높이, type flat|gable). 반환: 새 id | `position`, `yaw?`, `params?`, `name?` |
| `set_reference` | 평면도 레퍼런스(DXF·이미지) 설정, null이면 제거 | `reference` |
| `move` | 객체 이동·회전 (position mm, yaw deg). 벽은 두 끝점이 함께 이동 | `id`, `position?`, `by?`, `yaw?` |
| `snap` | 객체 위치를 그리드에 맞춤 (기본 500 mm, 표준 v2.1) | `id`, `grid?` |
| `set_param` | 객체 설정값 하나 변경 (params.key = value, value가 null이면 삭제) | `id`, `key`, `value` |
| `rename` | 객체 이름 변경 | `id`, `name` |
| `set_card` | 설비 인스턴스의 카드 값 덮어쓰기 (사이클·가동률·불량률·작업자 수) | `id`, `card` |
| `delete` | 객체 삭제 (그 객체에 연결된 자재 흐름도 함께 삭제) | `id` |
| `duplicate` | 객체 복사 (offset mm 만큼 옮겨서). 반환: 새 id | `id`, `offset?` |
| `mirror` | 객체를 세로선 x = axis (또는 가로선 y = axis) 기준으로 대칭 복사. 반환: 새 id | `id`, `axis`, `along?` |
| `array` | 선형 배열 복사: count개를 step(mm) 간격으로. 반환: 새 id 목록 | `id`, `count`, `step` |

## 설비 (machine)

| 명령 | 설명 | 인자 (?는 생략 가능) |
|---|---|---|
| `add_block` | 블록 배치 (blockType = 라이브러리 블록 id, mm 좌표). 반환: 새 노드 id | `blockType`, `name?`, `parent?`, `position`, `rotation?`, `params?`, `sockets?`, `joints?`, `io?` |
| `move` | 노드 이동·회전 (position mm, 5 mm 스냅 / rotation deg) | `id`, `position?`, `rotation?` |
| `rename` | 노드 이름 변경 | `id`, `name` |
| `set_meta` | 설비 이름 · 외곽 크기(W × D × H mm) · fidelity 변경 | `name?`, `bbox?`, `fidelity?` |
| `set_card` | 설비 카드 값 변경 (사이클 s · 양품률 · 작업자 수 · 투입/배출 소켓) | `cycle_time?`, `ok_rate?`, `operators?`, `inlet?`, `outlet?` |
| `set_param` | 블록 파라미터 변경 | `id`, `key`, `value` |
| `add_joint` | 노드에 동작 축 추가 (vmax·amax 필수) | `id`, `node`, `type`, `axis`, `mode`, `min`, `max`, `home?`, `vmax`, `amax`, `jmax?`, `effort?`, `cushion_time?`, `verified?` |
| `bind_tag` | 신호 태그 추가 또는 변경 (같은 tag면 덮어씀) | `tag`, `dir`, `type`, `binding?`, `default?` |
| `delete` | 노드 삭제 (자식 노드와 그 축·태그 바인딩도 함께) | `id` |

## 이후 단계에서 추가

| 명령 | 단계 |
|---|---|
| `run_scenario` | 5단계 (시뮬 엔진) |
| `add_socket`, `set_joint`, `add_sequence_step` | 3단계 (머신빌더) |
| `add_level` | 4단계 (팩토리빌더) |
