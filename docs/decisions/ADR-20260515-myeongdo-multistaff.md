# ADR-20260515 — 명도 페이지 다중 담당자 + 정은진 동적화

## 컨텍스트
- 명도 1건당 담당자 1명 가정으로 등록 폼이 단일 `<select id="M_staffName">`.
- 사용자(대표) 피드백: "담당자 2명일 경우도 있으니 추가 기능"
- 같은 세션에 정은진 매니저 퇴사 정보 공유. 향후 직원 추가 채용 예정.
- 기존 코드는 이미 다른 페이지(CAL_·FEE_getAllStaff·LW_·MBR_)에서 `m.staffList` 콤마 구분 다중 담당자를 가정하고 있었으나, 명도 폼/테이블/저장만 단일 가정이라 데이터 모델 불일치 상태.

## 결정
1. **데이터 모델**: 명도 시트에 `staffList`(콤마 구분 문자열) 컬럼 12번째 추가. `staffName`은 유지하되 항상 `staffList[0]`과 동기화.
2. **UI**: 등록 폼 단일 select → "드롭다운+칩 누적" 패턴. 추가된 직원은 옵션에서 제외, × 버튼으로 제거. 직원이 늘어도 확장 가능.
3. **마이그레이션**: 클라이언트는 `staffList` 없으면 `staffName`으로 자연 fallback(`M_normalizeStaff`). GAS는 `mapMeongdoRow`에서 동일 fallback + 1회용 시트 마이그레이션 함수(`addMeongdoStaffListCol`) 제공.
4. **정은진**: `VALID` 집합(`FEE_getAllStaff` 안)을 정적 4명 → `C_MANAGERS || [3명]` 동적 참조로 전환. 색상 맵(소송탭 line 9027)의 정은진 항목은 fallback 안전망으로 유지(과거 명도 데이터 보호). CLAUDE.md·handoff.md 등 문서의 정은진 흔적은 **별도 PR로 분리** (이번 PR diff 노이즈 방지).
5. **호환성**: GAS 시트 마이그레이션 미실행 상태에서도 `sv(12, value)`가 Apps Script에서 12열을 자동 확장하므로 데이터 손실 없음. 단 헤더 라벨 가독성 위해 1회 실행 권장.

## 근거
- 다중 담당자 패턴(드롭다운+칩)은 GitHub Reviewer, Asana Assignee 등에서 검증된 UX. 직원이 3명에서 20명으로 늘어도 화면 안 깨짐.
- `staffName` 보존 + `staffList[0]` 동기화는 단일 담당자를 가정하는 기존 코드 경로(예: `addCaseHistory` 인자, 일부 알림 로직) 회귀 방지.
- 정은진 정적 제거를 한 곳(`VALID` set)에 국한한 이유: 과거 명도 데이터에 정은진이 담당자로 박힌 행이 있다면 `VALID` 필터에서 떨어져 누락될 수 있음 → 동적화로 자동 정리. 색상 맵의 정은진 fallback은 데이터 표시 시점에 회색 대신 원색 매핑이라 무해.

## 대안 (검토 후 기각)
- **칩 토글 전체 노출**(직원 N명 칩 다 보여주고 클릭 토글): 3-5명일 때 빠르지만 10명+ 화면 비효율 → 기각.
- **체크박스 다중**: 모달 띄워야 깔끔, 폼 단일 화면 UX와 안 맞음 → 기각.
- **`staffName` 컬럼을 콤마 다중으로 의미 변경**: 단일 가정 코드 회귀 위험 → 기각, `staffList` 별도 컬럼 채택.
- **정은진 일괄 삭제**: 과거 데이터 손실 + 다수 문서 동시 수정으로 diff 노이즈 → 별도 PR로 분리.

## 영향
- **시트 스키마 변경**: 11열 → 12열. GAS 재배포 + `addMeongdoStaffListCol()` 1회 수동 실행 필요.
- **클라이언트 코드**: index.html 약 80줄, unified-gas.js 약 50줄. 다른 페이지 영향 없음(CAL_·FEE_·LW_는 이미 `staffList` 기반).
- **후속 작업**:
  - 정은진 흔적 정리 PR (CLAUDE.md, handoff.md, 에이전트 정의 등)
  - 칩 XSS 보강 (M_esc를 표준 HTML escape로) — C_MANAGERS 동적 로드 도입 시 함께
  - 색상 맵 일관화 — CLAUDE.md §11.2 브랜드 색상 vs 코드 실측 차이 통일 ADR
