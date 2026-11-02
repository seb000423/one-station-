# ONE_STATION — 작업 규칙

ONE_STATION은 웹에서 설비·생산 라인을 꾸미고 시뮬레이션하는 사이트입니다 (https://one-station-beta.vercel.app).
ONE BUILDER = `/console.html` (`/builder`), ONE MONITOR = `/console2.html` (`/monitor`). 사용자는 한국어로 씁니다.
지금 **ONE Twin 개발 기준서 R1**의 V1으로 단계 이행 중입니다 (현재 사이트를 살린 채 바닥부터 교체).

## 구조

| 경로 | 내용 |
|---|---|
| `packages/schema` | machine.json / factory.json / 블록 정의 / spec / 태그 규칙 스키마 (zod), 좌표 변환, UUID v7, 구버전 저장본 변환기 |
| `packages/core` | 편집 API(명령 레이어) + Editor(Undo/Redo, 명령 로그) |
| `schemas/`, `docs/one-twin/edit-api.md`, `assets/one-twin/` | `npm run gen:twin`이 만드는 생성 파일. 직접 고치지 않음 |
| `js/one-twin.js` | 기존 페이지용 브라우저 번들 (`window.OneTwin`), `npm run bundle:twin`으로 생성 |
| `js/*.js`, `console*.html` | 기존 ONE BUILDER / MONITOR (바닐라 JS, three r147 전역). 단계적으로 패키지로 옮김 |
| `api/` | Vercel 함수 (Blob 저장) |
| `rules/` | 레이아웃·그래픽 표준 (v2.0 유효, v2.1 초안) |

명령: `npm run check` (타입 검사 + 테스트), `npm run gen:twin`, `npm run bundle:twin`. 패키지를 바꾸면 세 개 모두 돌리고 생성 파일도 같이 커밋합니다.

## 설계 원칙 (기준서 R1 §2, 바꾸려면 리비전 필요)

1. 단일 데이터 모델: 노드 트리 JSON. 설비는 공장에 `ref: machine@version` 참조 인스턴스로 배치.
2. 시뮬 레이어(신호·기구학·DES·네비)는 신호 테이블로만 통신. 실PLC 태그와는 매핑 테이블로 연결.
3. fidelity L1(카드) / L2(기구·신호) / L3(물리).
4. **모든 편집은 `packages/core`의 명령으로.** UI는 호출자. 새 편집 기능 = 새 명령 + 테스트.
5. 블록은 형식 + 파라미터 + 치수 테이블. 메이커 모델은 블록이 아님 (product.model 메모만).
6. spec 섹션은 처음부터 스키마에 있고 null 허용, 저장·export에 항상 포함.
7. 정식 DES·최적화·AI는 서버, 브라우저는 편집·데모 시뮬.

자체 개발 금지: 물리 엔진, PLC 프로토콜 변환, ROS2 브리지, STEP 변환, 영상 녹화.

## 좌표·단위 (R1 §5, 표준 v2.1 §2)

- 저장: mm, deg, 오른손 **Z-up**, X = 투입 → 배출. 씬: m, rad, Y-up.
- 변환은 `packages/schema/src/units.ts`만 사용 (stored (X, Y, Z) → scene (X, Z, −Y)/1000). 다른 곳에서 축을 직접 뒤집지 않음.
- 공장 원점 기본 = 바닥 좌측 하단(입고). 설비 원점 = 바닥면 중심. 스냅: 공장 500 mm, 설비 5 mm.
- 태그: 대문자·숫자·밑줄, 32자 이내, 인스턴스 접두어 `ST01.M01.` (`packages/schema/src/tags.ts`). 방향은 PLC 기준 (out = PLC 출력).

## 레이아웃·그래픽

`rules/smart-factory-standard-v2.md` (v2.0)이 유효합니다. `rules/smart-factory-standard-v2.1.md`는 승인 대기 초안입니다.
동작 원칙: 의미 없는 움직임·"마법" 금지. 모든 부품은 한 객체로 라인을 끝까지 이동하고, 모든 이동은 로봇·작업자·컨베이어·크레인·지게차가 보이게 처리. 생겼다 사라지거나 순간이동하지 않음. 겹침·관통·공중부양 금지.

## 기밀·라이선스

- 이 저장소와 사이트는 **공개**입니다. 고객사명, 제품 코드명, 완성차·엔진 이름, 부품번호, 도면·CAD 식별자, 공급사명을 코드·메시 이름·커밋 메시지·문서에 넣지 않습니다. 예시는 일반 명칭으로.
- realvirtual(AGPL) 코드는 새 코드에 쓰지 않습니다 (기준서 §11.1). 기존 ONE MONITOR의 realvirtual은 5단계에서 자체 실행 모드로 교체.
- 메이커 CAD·유료 에셋 원본은 새로 넣지 않습니다.

## 배포

`main`은 Vercel이 자동으로 운영 배포합니다. **main 푸시는 사용자의 명시적 승인 후에만.** 작업은 브랜치 + PR(미리보기 배포)로 합니다.
