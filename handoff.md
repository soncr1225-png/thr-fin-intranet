# THE FIN 인트라넷 — 인수인계 메모

> 최종 업데이트: 2026-04-19 (세션 4)

---

## 세션 4 작업 내역 (2026-04-19)

### 더핀 회원 노션 전체 동기화 완료
- `MBR_NOTION_DATA`에 **총 50명** 등록 (이번 세션 신규 14명: 차정연·박성진·김은영·조현포·이지연·강지애·김태헌·김태열·이경미·구영철·정종우·장원산·김종걸·홍율경)

### localStorage 저장 공간 부족 문제 해결
- **원인**: BULK 캐시(2-3MB) + cases 중복 캐시 → 5MB 초과
- **해결**: `applyBulkData`에서 cases/todos 중복 저장 제거
- **자동 복구**: 저장 실패 시 BULK 캐시 자동 삭제 후 재시도
- **MBR 델타 저장**: 기본 50명은 HTML 하드코딩, localStorage엔 수정분만 저장
- **⚠ 버튼 클릭 → 확인**: 수동 저장공간 정리 (BULK만 삭제, 회원/사건 보존)

### 구글시트 회원 동기화 버튼 추가
- 더핀 회원 탭 > **📊 구글시트 저장** 버튼 → `MBR_syncToSheets()` 호출
- **⚠ GAS에 `saveMembers` 액션 추가 필요** (아래 참고)

---

## ⚠️ 다음 세션 필수: GAS에 saveMembers 추가

`doPost` 스위치에 아래 케이스 추가 후 재배포:

```javascript
case 'saveMembers': {
  const sheet = SpreadsheetApp.getActive().getSheetByName('더핀회원')
    || SpreadsheetApp.getActive().insertSheet('더핀회원');
  const members = data;
  const headers = ['이름','연락처','이메일','생년월일','주소','담당자','유형','주택보유',
    '생애최초','관심물건','희망지역','투자목적','예산','타임라인','상태','응답률','수수료율','메모','등록일'];
  if (sheet.getLastRow() === 0) sheet.appendRow(headers);
  const lastRow = sheet.getLastRow();
  if (lastRow > 1) sheet.deleteRows(2, lastRow - 1);
  members.forEach(m => sheet.appendRow([
    m.name,m.phone,m.email,m.birthdate,m.address,m.staff,m.type,m.housing,
    m.firsthome,m.proptype,m.region,m.purpose,m.budget,m.timeline,m.status,
    m.responseRate,m.feeRate,m.memo,m.joindate
  ]));
  return ContentService.createTextOutput(JSON.stringify({result:'ok',count:members.length}))
    .setMimeType(ContentService.MimeType.JSON);
}
```

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
- **필터 스코프 버그 수정**: `querySelectorAll('.filter-btn')` → C_ 탭 ID로 스코프 제한
- **필터 카운트 배지**: `전체 (n) / 미게시 (n) / 완료 (n)` 실시간 표시
- **완료 기준 변경**: 하나라도 체크 = 완료
- **보관함 레이아웃 개편**: 사건번호+물건내용 통합, 보관사유 색상 배지

### C_ 탭 (물건조사요청표)
- **헤더 색상**: 다크 네이비 + 골드 하단선 + 흰 텍스트

### AG_ 탭 (입찰안내문) ← 세션 3 신규
- **탭 신설**: 📋 입찰안내문 탭 추가 (index.html)
- **입력 폼**: 법원명·날짜·시간·마감시간·사건번호·주소·최저가·보증금·고객유형·담당자
- **법원 드롭다운**: 전국 50개 법원·지원, 지역별 optgroup
- **법원 자동입력**: 법원 선택 시 주소·입찰시작·마감시간 자동 세팅 (`AG_applyCourtData`)
- **서울/경기/인천 입찰시간 확정 데이터** (`AG_COURT_TIMES`):
  - 서울 5개: 10:00 ~ 11:10
  - 수원 본원: 10:00 ~ 11:00
  - 수원 성남·평택: 10:00 ~ 11:20
  - 수원 여주·안양: 10:00 ~ 11:10
  - 수원 안산: 10:30 ~ 11:40
  - 의정부 본원·남양주: 10:30 ~ 11:50
  - 의정부 고양: 10:00 ~ 11:20
  - 인천 본원: 10:00 ~ 11:20
  - 인천 부천: 10:00 ~ 11:10
- **AI 사진 분석**: 경매 화면 Ctrl+V/드래그 → Claude API로 법원·날짜·시간·금액 자동 추출 (`analyzeImageGuide` GAS 액션)
- **안내 카드 생성**: 입찰기일 강조·시작→마감 시간 박스·준비서류·체크리스트 표시
- **모바일 캡처**: 📸 버튼 → 390px 모바일 최적화 카드 캡처 → 클립보드 복사(카톡 Ctrl+V) 또는 파일 다운로드
- **개인/법인 × 직접/대리 4조합** 준비서류 자동 변경
- **담당자 선택**: 손청락·이제훈·장한빛·정은진
- **Ctrl+V paste 수정**: `window.addEventListener('paste')` + paste zone `tabindex="0"` + `onpaste` 이중 보강

### GAS (`unified-gas.js`)
- `casesPost` 스위치에 경매·명도 액션 7개 추가
- `analyzeImageGuide` 액션 추가 — `guide` 모드 프롬프트 (법원·날짜·시간·법정·사건번호·주소·최저가 추출)
- `mapMyeongdoRow` 새 스키마 반영 (15컬럼)
- `addMyeongdo` / `updateMyeongdo` 새 컬럼 순서 반영

---

## ⚠️ GAS 재배포 필수 (가장 중요)

`unified-gas.js`의 변경사항이 Google Apps Script에 반영되지 않으면 **모든 저장 및 AI 분석이 실패**함.

**재배포 방법:**
1. Google Apps Script 편집기 열기
2. `unified-gas.js` 전체 내용 교체
3. 배포 → 새 버전으로 배포
4. GAS 스크립트 속성에 `ANTHROPIC_KEY` = `sk-ant-api03-...` 설정 확인

---

## 파일 구조

```
the fin intranet/
├── index.html              ← 프론트엔드 전체 (SPA)
├── unified-gas.js          ← GAS 백엔드 (Google Apps Script에 복사 후 배포)
├── CLAUDE.md               ← 프로젝트 컨텍스트
└── handoff.md              ← 이 파일
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
| `A_caseRow(cas, cust, isFirst)` | 더핀 일정표 행 렌더 |
| `C_chStatus(id, ns)` | 사건 상태 변경 + 양탭 렌더 + 낙찰종료 시 명도 연동 |
| `M_gasPost(action, data)` | 명도 탭 저장 |
| `M_inlineEdit(id, field, curVal, isDate)` | 명도 탭 인라인 편집 |
| `B_render()` | 블로그 탭 렌더 + 필터 카운트 업데이트 |
| `applyBulkData(data)` | GAS getBulk 응답 전체 적용 |
| `AG_generate()` | 입찰안내문 카드 생성 |
| `AG_applyCourtData(name)` | 법원명으로 주소·시작·마감시간 일괄 세팅 |
| `AG_analyzeImage(b64, type)` | 사진 → GAS analyzeImageGuide → 폼 자동입력 |
| `AG_capture(btn)` | 모바일 카드 html2canvas 캡처 → 클립보드/다운로드 |
| `_handlePasteImg(e)` | 전역 paste 이미지 라우터 |

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

| 상태 | 배경색 |
|---|---|
| 낙찰종료 (closed) | `#cff0f8` 청록 |
| 진행중 (ongoing) | `#ffffff` 흰색 |
| 조사완료/입찰확정 | `#f0fdf4` 연초록 |
| 보고서작성 | `#fdf4ff` 연보라 |
| 기일변경/고객변심/기타종료 | `#f3f4f6` 회색 |

## 블로그 필터 기준

| 필터 | 조건 |
|---|---|
| 전체 | 진행중 상태 전체 |
| 미게시 | 4개 블로그 모두 미체크 |
| 완료 | 1개 이상 체크 |

## 입찰안내문 준비서류 조합

| 유형 | 서류 |
|---|---|
| 개인·직접 | 신분증, 도장, 보증금, 주민등록초본 |
| 개인·대리 | 위임장(인감), 인감증명서, 대리인 신분증·도장, 보증금, 초본 |
| 법인·직접 | 법인인감, 인감증명서, 등기사항증명서, 대표자 신분증, 보증금 |
| 법인·대리 | 위임장(법인인감), 인감증명서, 등기사항증명서, 대리인 신분증·도장, 보증금 |
