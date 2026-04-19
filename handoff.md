# THE FIN 인트라넷 — 인수인계 메모

> 최종 업데이트: 2026-04-19 (세션 2)

---

## 완료된 작업 목록

### A_ 탭 (더핀 일정표)
- **저장 실패 수정**: `A_gasPost` → `addAuction/updateAuction/deleteAuction` 액션명 (casesPost 호환)
- **경매기일 수기 수정**: 셀 클릭 → 인라인 날짜 편집 → 매각결정기일/항고기간/잔금납부기일 자동 재계산
- **진행내용 단일 배지**: `C_SM` 기반 클릭 가능 상태 배지 → `C_chStatus()` 호출
- **쌍방향 연동**: `C_chStatus()` → `C_render()` + `A_render()` 동시 호출
- **확인 체크**: 매각결정기일·항고기간 ✓ 토글 버튼
- **낙찰종료 → 명도 자동 등록 버튼**: A_ 탭에서 "명도 등록" 버튼 표시
- **비활성 케이스 날짜 계산 skip**: 기일변경/고객변심/기타종료 상태에서 경매기일 수정 시 날짜 자동계산 안 함
- **비활성 케이스 셀 숨김**: 기일변경/고객변심/기타종료 행에서 매각결정기일·항고기간·잔금납부기일 + 체크박스 표시 안 함
- **컬럼 순서**: 고객명 | 사건번호 | 법원 | 물건(주소) | 경매기일 | 진행내용 | 매각결정기일 | 항고기간 | 잔금납부기일 | 비고
- **진행내용 셀 정렬**: 상태 배지 + 내용 텍스트를 flex 가로 배치 (같은 라인)
- **행 색상 구분**: 낙찰종료=청록, 진행중=흰색, 보고서=연보라, 완료=연초록, 비활성=회색
- **헤더 색상**: 다크 네이비 + 골드 하단선 + 흰 텍스트
- **비고 확장**: `min-width:180px`

### M_ 탭 (명도)
- **저장 실패 수정**: `M_gasPost` → `addMyeongdo/updateMyeongdo/completeMyeongdo/deleteMyeongdo`
- **컬럼 개편**: 고객명/사건번호(서브텍스트) | 입찰기일 | 물건명/인도번호(서브텍스트) | 피신청인 | 송달일 | 강제집행신청 | 계고일 | 이사날짜 | 비고
- **7개 필드 인라인 편집**: 셀 클릭 → 직접 입력 → Enter/blur 저장
- **수정 버튼 제거**: 인라인 편집으로 대체
- **이사날짜**: 완료 시 초록색·굵게 강조
- **헤더 색상**: 다크 네이비 + 골드 하단선 + 흰 텍스트

### B_ 탭 (블로그 물건추천)
- **필터 스코프 버그 수정**: `querySelectorAll('.filter-btn')` → C_ 탭 ID로 스코프 제한 (B_ 탭 버튼 active 상태가 C_ 탭 동작으로 초기화되던 문제)
- **필터 카운트 배지**: `전체 (n) / 미게시 (n) / 완료 (n)` 실시간 표시
- **완료 기준 변경**: ~~4개 모두~~ → **하나라도 체크** = 완료
- **미게시 기준**: 4개 모두 미체크 = 미게시
- **빈 결과 메시지**: 필터 상태에 따라 구분 ("완료된 물건이 없습니다" 등)
- **보관함 레이아웃 개편**:
  - 사건번호+물건내용 한 셀 통합
  - "매각기일변경" → "기일변경" 축약 + 색상 배지 (1칸)
  - 복원 버튼 `white-space:nowrap` 한 줄 표시
  - 블로그 체크 ✓ 아이콘 + 날짜 정렬
  - 보관사유 색상 구분: 취하(빨강)/정지(주황)/기일변경(보라)/기간종료(회색)
- **헤더 색상**: 다크 네이비 + 골드 하단선 + 흰 텍스트 (물건조사요청표·명도·더핀일정표 동일)

### C_ 탭 (물건조사요청표)
- **헤더 색상**: 다크 네이비 + 골드 하단선 + 흰 텍스트

### GAS (`unified-gas.js`)
- `casesPost` 스위치에 경매·명도 액션 7개 추가
- `mapMyeongdoRow` 새 스키마 반영 (15컬럼)
- `addMyeongdo` / `updateMyeongdo` 새 컬럼 순서 반영
- `setupMyeongdoSheet` 헤더·날짜 포맷 업데이트

---

## ⚠️ GAS 재배포 필수 (가장 중요)

`unified-gas.js`의 변경사항이 Google Apps Script에 반영되지 않으면 **모든 저장이 실패**함.

**재배포 방법:**
1. Google Apps Script 편집기 열기
2. `unified-gas.js` 전체 내용 교체
3. 배포 → 새 버전으로 배포

---

## 파일 구조

```
the fin intranet/
├── index.html          ← 프론트엔드 전체 (SPA)
├── unified-gas.js      ← GAS 백엔드 (Google Apps Script에 복사 후 배포)
├── CLAUDE.md           ← 프로젝트 컨텍스트
└── handoff.md          ← 이 파일
```

---

## 주요 함수 위치 (index.html)

| 함수 | 역할 |
|---|---|
| `A_gasPost(action, data)` | 더핀 일정표 저장 |
| `A_showCaseStatusBtns(casId)` | A_ 탭 상태 버튼 팝업 |
| `A_startEditAuctionDate` | 경매기일 인라인 편집 |
| `A_editAuctionDate` | 비활성 케이스 skip 포함 날짜 저장 |
| `A_toggleOk(id, field)` | 매각결정기일/항고기간 확인 체크 토글 |
| `A_autoAddMyeongdo(cas)` | 낙찰종료 시 명도 자동 등록 |
| `A_caseRow(cas, cust, isFirst)` | 더핀 일정표 행 렌더 (색상·정렬·조건부 셀 포함) |
| `A_caseBg(status)` | 상태별 행 배경색 |
| `C_chStatus(id, ns)` | 사건 상태 변경 + 양탭 렌더 + 낙찰종료 시 명도 연동 |
| `M_gasPost(action, data)` | 명도 탭 저장 |
| `M_inlineEdit(id, field, curVal, isDate)` | 명도 탭 인라인 편집 |
| `M_row(item)` | 명도 테이블 행 렌더 |
| `B_render()` | 블로그 탭 렌더 + 필터 카운트 업데이트 |
| `B_archiveRow(item, canRestore)` | 보관함 행 렌더 |
| `applyBulkData(data)` | GAS getBulk 응답 전체 적용 |

---

## 쌍방향 연동 구조

```
applyBulkData()
  └── A_allCases = C_cases = allCases  ← 동일 배열 참조

C_chStatus(casId, newStatus)
  ├── cas.status = newStatus
  ├── casesPost('update', {...})
  ├── C_render()
  ├── A_render()
  └── if newStatus === 'closed'
        └── A_autoAddMyeongdo(cas)
```

---

## 행 색상 체계 (더핀 일정표)

| 상태 | 배경색 | CSS 클래스 |
|---|---|---|
| 낙찰종료 (closed) | `#cff0f8` 청록 | `a-row-closed` |
| 진행중 (ongoing) | `#ffffff` 흰색 | — |
| 조사완료/입찰확정 | `#f0fdf4` / `#ecfdf5` 연초록 | — |
| 보고서작성 | `#fdf4ff` 연보라 | — |
| 기일변경/고객변심/기타종료 | `#f3f4f6` 회색 | `a-row-inactive` |

## 블로그 필터 기준

| 필터 | 조건 |
|---|---|
| 전체 | 진행중 상태(정상) + 기간 미종료 전체 |
| 미게시 | 4개 블로그 모두 미체크 |
| 완료 | 1개 이상 체크 |
