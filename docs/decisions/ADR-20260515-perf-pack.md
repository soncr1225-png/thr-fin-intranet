# ADR-20260515 — 성능 + UX 통합 개선 묶음

## 컨텍스트
사용자 피드백:
1. 인트라넷 반응속도가 느림 — 클릭 후 1~2초 멍.
2. 전체 탭에서 삭제 누르면 간혹 다시 나타남 (정확한 재현 시점 불명).
3. 물건 등록 시 마감요청일 자동 세팅 단순화 요구 — "보통 입찰기일 7일 전, 주말이면 앞 평일, 7일 이내면 오늘".
4. 진행 상태 메뉴에 "1회 유찰 후 진행" 추가 요구.

## 결정 (4개 영역 통합)

### A. 진행 상태 `failed_continue` 신설
- `C_SM`에 추가: 라벨 "1회 유찰 후 진행", 클래스 `s-failed-continue` (앰버 #fef3c7/#b45309).
- `C_ACTIVE` · `C_AUCTION_BADGE_STATUS` · `A_caseRow.isCaseActive` 모두 포함.
- 사건탭 상태 메뉴 + `A_showCaseStatusBtns` 옵션에 추가.
- `A_caseBg`에 행 배경색 매핑.

### B. 마감요청일 자동계산 단순화 (`C_calcDL`)
- 기존: -9일 시작 + 영업일 7일 확보 (결과가 -7~-9일 사이 변동, 복잡).
- 변경: 단순 -7일 + 토/일이면 금요일로. 7일 이내면 오늘 (기존 동작 유지).

### C. 삭제 후 재등장 버그 — pending 마커 + rollback
- 원인: 일부 delete가 fire-and-forget. `SYNC_pullData`(3분 주기)가 GAS 옛 데이터로 복원.
- 헬퍼: `SYNC_pendingDeletes` Map (id→ts), `SYNC_markDeleted` / `SYNC_filterPendingDeleted`. 5분 자동 만료.
- `applyBulkData`에서 cases·archive·auction·myeongdoActive/Done·blog·members 모두 pending id 필터.
- `C_delCase` / `A_deleteRow` / `M_deleteRow` / `MBR_delete` 4곳에 일관 패턴 적용 — backup + GAS await + 실패 시 rollback + 사용자 알림.

### D. 반응속도 quick win 3건
- `C_chStatus`: CAL_render / M_render를 활성 탭일 때만 호출 (비활성은 탭 클릭 시 재렌더). 상태 변경 클릭당 200~400ms 절감.
- `C_cacheSave`: 800ms 디바운스. 빠른 연속 변경 시 마지막만 localStorage 저장. `beforeunload`로 pending 강제 저장 → 유실 방지.
- `SYNC_autoStart` 폴링에 `Page Visibility` 가드. 백그라운드 탭일 때 push/pull 중단, 복귀 시 즉시 pull.

## 근거
- A, B는 사용자 명시 요구. 직접 매핑.
- C: 다양한 delete 패턴이 있어 일관 정규화보다 보호 레이어(`applyBulkData` 필터링)가 broader fix. 모든 delete 경로 보호.
- D: dev 서브에이전트 분석에서 TOP 5 병목 추출, 회귀 위험 낮은 quick win 3건만 적용. 가상 스크롤·렌더 엔진 리팩터링은 ROI 낮아 보류.

## 대안 (검토 후 기각)
- **C_chStatus 전체 render 통합 (rAF 배치)**: 코드 침습 큼. 활성 탭 가드만으로 비슷한 효과.
- **사건 시트 컬럼에 deletedAt 표시 + tombstone 패턴**: GAS 시트 스키마 변경 필요, 범위 폭발. 클라이언트 pending 마커로 충분.
- **rectangular render diff/가상 스크롤**: Vanilla SPA 원칙(빌드 도구 없음) 위배. 보류.
- **localStorage → IndexedDB**: 마이그레이션 복잡. 디바운싱으로 일단 충분.

## 영향
- **클라이언트만 수정** (`index.html`만). GAS 재배포 불필요.
- **데이터 호환**: 기존 사건 데이터 그대로 작동. `failed_continue` 신규 상태 + 기존 미사용.
- **회귀 위험**:
  - 마감요청일 자동계산 결과가 기존과 약간 다를 수 있음 (영업일 vs 캘린더일). 사용자 명시 요구로 수용.
  - C_chStatus의 CAL/M 즉시 렌더 안 함 → 비활성 탭에서 데이터 보면서 변경 시 일시적 불일치. 활성 탭 들어가면 정상.
  - C_cacheSave 디바운스로 800ms 이내 새로고침/닫기 시 마지막 변경 누락 가능 → `beforeunload`로 방어.

## 미해결 trade-off
- `SYNC_pendingDeletes`는 클라이언트 메모리만. 새로고침하면 마커 사라짐. 단 새로고침 시점에 GAS 응답이 처리됐을 가능성 높아 실용상 문제 없음.
- Page Visibility 가드: 백그라운드 탭에서 데이터 변경 못 봄. 복귀 시 즉시 pull로 보완.

## 후속 개선 (별도 PR)
- B_deleteItem · CTR_deleteEsign 등 다른 delete 함수에도 `SYNC_markDeleted` 일관 적용.
- 가상 스크롤(사건 500건+) — 데이터 늘어나면 검토.
- C_render 부분 업데이트 (diff 기반) — 200~400ms 추가 절감 가능.
