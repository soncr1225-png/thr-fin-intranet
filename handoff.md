# THE FIN 인트라넷 — 인수인계 메모

> 최종 업데이트: 2026-04-25 (세션 10)

---

## 세션 10 작업 내역 (2026-04-25)

### 🔧 개발 인프라 구축 (CI 게이트 · 도구 경계 · 에이전트)

**`.claude/agents/fin-dev.md`** — THE FIN 전담 서브에이전트 신설
- model: sonnet, permissionMode: acceptEdits, 도구: Read/Write/Edit/Bash/Grep/Glob
- 자율 실행 원칙·아키텍처 개요·TDZ 버그 패턴·개발 규칙 내장

**`scripts/validate.js`** — CI 검증 스크립트 신설
- 7개 항목 자동 검사: 파일 크기(>60KB) · 필수 DOM 12개 · 필수 함수 8개 · TDZ 패턴(CAL_year < loadBulk) · 하드코딩 시크릿 · GAS URL 참조 · 브랜드 컬러 변수
- 오류 시 `exit(1)` → 커밋 차단

**`.claude/settings.json`** — CI 게이트 + 도구 경계
- PostToolUse hook: Edit/Write 실행 후 `node scripts/validate.js` 자동 실행 (즉시 피드백)
- deny list: `rm -rf *`, `git push --force`, `git reset --hard`, `git clean -f`, `git branch -D`, `truncate`, `> index.html`

**`.git/hooks/pre-commit`** — 커밋 전 자동 검증
- index.html 또는 unified-gas.js가 staged 됐을 때만 validate.js 실행
- 검증 실패 시 커밋 차단

### 🤖 자율 실행 원칙 저장

- CLAUDE.md에 `🤖 자율 실행 원칙` 섹션 추가 — 묻지 않고 판단·실행, git push 직전만 한 줄 보고
- fin-dev.md에 동일 원칙 반영
- 메모리 파일(`feedback_autonomous_mode.md`)에도 영구 저장

### 🐛 캘린더 TDZ 버그 수정 (치명적)

**증상**: 캘린더가 "2026년 1월" 빈 그리드로 표시  
**원인**: `let CAL_year` / `let CAL_month`가 line 11979에 선언됐으나 `loadBulk()` 호출(line 7245) 시점에 이미 `applyBulkData → CAL_render`가 실행되어 TDZ ReferenceError 발생  
**수정**: 두 변수 선언을 `loadBulk()` 바로 앞으로 이동  
- validate.js TDZ 검사 항목으로 등록 → 재발 방지

### 🗓 캘린더 툴팁 — 마우스 호버 시 사건 상세 팝업

- 캘린더 칩에 마우스를 가져다 대면 사건 상세 정보 팝업 표시
- `data-cal-label` / `data-cal-tip` 속성으로 칩에 JSON 데이터 임베드
- **DOM 순서 문제 해결**: `getElementById('CAL_tooltip')` null 반환 버그 → `document.createElement('div')` + `document.body.appendChild(tip)` 방식으로 변경 (스크립트 실행 시점과 무관)
- event delegation(`document.addEventListener('mouseover')`) 방식으로 동적 생성 칩도 정상 처리
- 레이블별 표시 필드 정의 (`LABELS` 맵: 경매기일·매각결정·낙찰일·명도 이벤트 등)
- CSS: `position:fixed`, `z-index:9999`, `opacity` transition으로 부드러운 표시/숨김

### 📊 전체 테이블 레이아웃 수정

두줄 표기 방지 + 전체 일관성 개선. ellipsis 적용 셀에는 `title` 속성 추가 (hover 시 전체 내용 확인).

| 탭 | 수정 내용 |
|---|---|
| C_ (물건조사요청표) | 사건번호·법원·경매기일·마감요청일 `white-space:nowrap`; 기타요청 `min-width:220px` |
| A_ (더핀 일정표) | 사건번호·법원·고객명 nowrap; 물건주소 ellipsis (`max-width:180px`) |
| B_ (블로그 물건추천) | 물건내용 ellipsis (`max-width:160px`) |
| M_ (명도) | 피신청인 nowrap; 고객명 ellipsis (`max-width:140px`); 물건명 ellipsis (`max-width:200px`) |
| MBR_ (더핀 회원) | 연락처·담당자·관심물건 nowrap |

---

## 세션 9 작업 내역 (2026-04-23)

### 🗓 캘린더 — 취소선 표시 (비활성 사건)

기일변경·고객변심·취하·종료 상태 사건이 캘린더에 계속 표시되던 문제 개선.
- `CAL_STRIKE_MAP = { changed: '기일변경', cancel: '고객변심', drop: '취하·종료' }` 추가
- `CAL_HIDDEN = ['closed', 'lost']` — 이 두 상태는 완전히 숨김 (이전 `CAL_SKIP`에 `lost` 누락 버그도 수정)
- `struck` 속성이 `true`인 이벤트는 그리드 칩에 `<s>` 태그 + 회색 사유 뱃지 표시
- 사이드바에서도 동일하게 취소선 + 사유 라벨 표시

### 🗓 캘린더 — 잔금납부대기중일 때만 일정 표시

매각결정기일·항고마감·잔금납부기일은 `balance_wait` 상태 사건에서만 캘린더에 표시.
- `A_items` 순회 시 `cas.status !== 'balance_wait'` 조건으로 필터링
- 잔금납부 완료(`balanceOk === 'O'`) 건도 제외

### 🐛 캘린더 — 상태 변경 시 즉시 갱신 안 됨 버그

기일변경으로 상태를 바꿔도 캘린더에 고객변심으로 표시되는 문제.
- **원인**: `C_chStatus()`가 상태 변경 후 `CAL_render()`를 호출하지 않아 이전 렌더 캐시 유지
- **수정**: `C_chStatus` 끝에 `if(typeof CAL_render==='function') CAL_render();` 추가
- `C_restoreToActive`에도 동일 처리

### 🐛 마감요청일 삭제 후 재등장 버그 수정

마감요청일을 지웠는데 새로고침하면 다시 나타나는 문제.
- **원인**: GAS `updateCase`에서 `if (d.deadline)` 조건이 빈 문자열 `''`을 falsy 처리 → 빈 값 저장 안 함
- **수정** (`unified-gas.js`):
  ```javascript
  // 이전 (버그):
  if (d.auctionDate) sheet.getRange(r, 6).setValue(new Date(d.auctionDate));
  if (d.deadline)    sheet.getRange(r, 7).setValue(new Date(d.deadline));

  // 수정 후:
  if (d.auctionDate !== undefined) sheet.getRange(r, 6).setValue(d.auctionDate ? new Date(d.auctionDate) : '');
  if (d.deadline    !== undefined) sheet.getRange(r, 7).setValue(d.deadline    ? new Date(d.deadline)    : '');
  ```
- **⚠ GAS 재배포 필수** — 재배포 전까지 마감요청일 삭제가 시트에 반영되지 않음

### 📊 applyBulkData 로딩 순서 버그 수정

명도 데이터(`M_active`, `M_done`)가 `A_render()` 이후에 세팅되어 명도 이벤트 fallback이 작동 안 하던 문제.
- `M_active = d.myeongdoActive` / `M_done = d.myeongdoDone` 세팅을 `A_render()` 호출 **앞으로** 이동
- 캘린더 탭이 열려있을 때도 `applyBulkData` 완료 후 `CAL_render()` 재실행

### 📈 진행 단계 8·9 추가 (포기·기타)

기존 7단계 → 9단계로 확장.

| 단계 | 이름 | 색상 |
|---|---|---|
| 8 | 포기 | `#6b7280` (회색) |
| 9 | 기타 | `#9ca3af` (연회색) |

- `STAGES` 배열에 8·9 추가
- `FEE_inferStage`: `c.currentStage >= 1 && c.currentStage <= 9`로 범위 확장
- `FEE_SHADOW_FIELDS`에 `'stageNote'` 추가 (수기 내용 shadow 보존)
- `FEE_migrate`에 `stageNote` 복원 로직 추가
- 9단계(기타) 선택 시 `CD_renderPipeline`에서 textarea 수기란 표시
  ```javascript
  const noteHtml = (cur === 9)
    ? `<textarea id="CD_stageNote" rows="2" oninput="CD_saveStageNote(this.value)" ...></textarea>`
    : '';
  ```
- `CD_saveStageNote(val)` 함수 추가 (실시간 저장)
- `CD_save`에서 `CD_stageNote` 값 반영

### 👥 회원 탭 — 사건 히스토리 뷰 개편

"📋 N건" 셀 클릭 시 수수료·수령 정보 대신 **사건 타임라인 히스토리** 표시.

**히스토리 카드 구조 (1사건 = 1카드):**
- 1행: 사건번호 + 법원 + 단계뱃지 + 결과뱃지 | `수정` 버튼
- 2행: 주소
- 3행: 이벤트 가로 칩 (사건접수 › 보고서 › 입찰동행 2025.06.24 › 🏆 낙찰)
- 4행: 메모 (stageNote / note 있을 때만)

**이벤트 추론 로직 (변경이력 없이 현재 상태 기반):**
- 사건접수 (항상)
- 보고서 (stage ≥ 4)
- 입찰동행 + 날짜 (stage ≥ 5 또는 confirmed)
- 대출연결 (stage ≥ 6)
- 잔금납부완료 (A_items balanceOk === 'O')
- 명도 (stage ≥ 7 또는 M_active/M_done에 존재)
- 포기 (stage === 8)
- OUTCOME_MAP 결과 (closed/lost/cancel/changed/drop/lawsuit)

**단계 뱃지 제거**: 이전에 사건 셀에 표시되던 "3. 조사 요청" 등 단계 표기 제거 → "📋 N건"만 표시.

**수정 버튼**: 히스토리 카드에서 `수정` 클릭 시 팝업 닫고 해당 사건 `CD_open()` 호출.

---

## 세션 8 작업 내역 (2026-04-22)

### 이름 정정 — 이이훈 → 이제훈

CLAUDE.md · index.html 전역에서 `이이훈` → `이제훈`으로 치환 (총 9곳).
- `AUTH_BASE_USERS` 키 · 담당자 드롭다운 (7곳) · 파싱 정규식 · 필터 · 명도 담당 설명
- **주의**: 기존에 `thefin_pw_이이훈` localStorage 해시가 있으면 새 이름으로 다시 로그인 시 초기 비밀번호 (`thefin2024!`) 사용 필요

### 모바일 카드 시간 박스 캡처 버그 수정 (AG_ 입찰안내문)

html2canvas 1.4.1이 `display:inline-block` + `display:flex` + `<span margin-right>` 조합을 렌더링 실패하는 문제.
- `display:flex` 제거 → `text-align:center`
- `display:inline-block` → `margin:auto` + `max-width:320px`
- 시간 텍스트 각각에 `white-space:nowrap` (중간 줄바꿈 방지)
- 박스 폭 320px로 확장 + 폰트 크기 미세조정 (16→15px, 14→13px)

### 📊 대시보드 탭 신설 (신규 · panel-dashboard)

상단 네비게이션 캘린더 다음에 **📊 대시보드** 탭 추가.
- **담당자 4명 워크로드 카드**: 담당 사건 · 임박(7일↓) · 이번달 수령 · 미수 지연
- **이번달 수수료 현황**: 사건 수 · 예상 총 수수료 · 수령 완료 · 미수 금액
- **수수료 지연 리스트**: 낙찰 후 30일+ 1차 미수 건
- **사건 목록 테이블**: 7단계 배지 + 1차/2차 수령 상태 + 💰 관리 버튼

### 💰 사건 상세 모달 신설 (CD_modal)

사건 행 · 대시보드 · 회원 팝업에서 `💰` 버튼 클릭 시 열림.
- **7단계 파이프라인 시각화**: 블로그홍보→상담→조사→보고서→입찰동행→대출연결→명도 (클릭하여 단계 변경)
- **물건 유형 → 수수료율 자동**: 아파트 1% / 다가구·빌딩·공장·토지 2% / 특수 3%
- **낙찰가 입력 → 수수료 자동 계산** (50/50 분할)
- **1차(잔금납부일) / 2차(명도 완료) 수령 체크** + 날짜
- **직원 4명 배분율 (%)** — 합계 100% 자동 검증 (색상 피드백)
- **연결 고객 드롭다운** — MBR_members 자동완성

### 🔗 고객(회원) ↔ 업무(사건) 양방향 연동

- 회원 테이블에 **"사건" 열 추가** — 📋 N건 + 7단계 배지 요약
- 회원 행 클릭 → **MBR_caseModal** (해당 고객의 모든 사건 팝업)
- 사건 모달의 `👥 회원 페이지` 버튼 → 회원 탭 이동 + 자동 검색
- 연결 매커니즘:
  - 1순위: `C_case.clientName === m.name`
  - 2순위: `A_items` 경유 (`clientName` → `caseNo` 역조회)

### 📥 ICS 내보내기 (캘린더 탭)

`📥 .ics 내보내기` 버튼 추가 — 구글/애플 캘린더 가져오기용.
- 경매기일 · 마감요청일 · 명도(낙찰일·경고장·강제집행·이사일) 전체 export
- 파일명: `thefin-calendar-YYYY-MM-DD.ics`

### 💾 전체 백업/복원 JSON (A안)

더핀 회원 탭에 **💾 전체 백업(JSON)** / **📂 백업 복원** 버튼 추가.
- `BACKUP_KEYS` 9개 — 회원·사건·수수료·할일·계정·블로그·**약정서 2종** 모두 포함
- 복원 전 현재 상태 자동 safety-backup (`thefin_backup_before_import`)

### ☁️ Google Sheets 양방향 동기화 (B안)

더핀 회원 탭에 **☁️ 구글시트 저장** · **⬇️ 구글시트 불러오기** 버튼 추가.
- 회원 수정 시 3초 debounce로 백그라운드 자동 동기화
- **서버 `회원관리` 시트** 자동 생성 (20컬럼)
- 로컬 delta 우선 병합 (사용자 최신 수정 보호)

### unified-gas.js — 회원 CRUD 핸들러 추가 (신규)

```
var SH_MEMBERS = '회원관리';
var MEMBER_FIELDS = [name, phone, email, ..., joindate];  // 20개

casesGet:  getMembers       → loadMembers(ss)
casesPost: saveMembers      → saveMembersBulk(ss, arr)   // 전체 덮어쓰기
           addMember        → addMember(ss, m)
           updateMember     → updateMember(ss, m)
           deleteMember     → deleteMember(ss, m)
```
`ensureMemberHeader()`로 시트 첫 행 자동 생성 + 프리즈.

### AUTH 자가 복구 로직

`AUTH_loadUsers()` 앞에 preview 체크 추가 — localStorage 데이터가 **계정 0명 초래 시 자동 초기화**.
`AUTH_rebuildSelect()`도 방어적 처리 — AUTH_USERS가 비었으면 `AUTH_BASE_USERS`로 강제 복구 + localStorage 삭제.
로그인 화면 하단에 **🔧 계정 목록 초기화** 링크 추가.

### 🐛 TDZ 버그 수정 (치명적 · 로그인 실패 원인)

`MBR_casesCell`이 `FEE_RATES` const(스크립트 후반부 선언)에 접근하려다 Temporal Dead Zone 에러 발생 → 전체 스크립트 중단 → `AUTH_init` 미실행 → 드롭다운 비어있음.
- **수정**: `MBR_load(); MBR_render();` 호출을 `setTimeout(..., 0)`으로 감싸 스크립트 파싱 완료 후 실행
- `MBR_casesCell` 내부도 try/catch 방어 추가

### 회원 탭 헤더 레이아웃 수정

버튼 7개 추가로 제목 영역이 쭈그러져 한국어가 **글자당 세로로 쌓이는 버그**:
- `.mbr-header-left { flex:0 0 auto; min-width:260px; word-break:keep-all; }`
- `.mbr-title { white-space:nowrap; }`

### FEE shadow 저장소 (GAS 필드 보존용)

GAS 백엔드는 신규 필드(`bidPrice`, `currentStage`, `staffShares`, `clientName` 등)를 모르므로 sync 시 덮어쓰기 방지:
- `thefin_fee_shadow_v1` 별도 localStorage 키에 shadow 저장
- `FEE_migrate()` 시 shadow에서 우선 복원

---

## ⚠️ 다음 세션 필수

### 0. GAS 재배포 (최우선 — 마감요청일 삭제 기능 작동 조건)

`unified-gas.js` 두 가지 변경사항을 Google Apps Script에 반영 후 **새 버전으로 배포**:

1. `updateCase` deadline/auctionDate 빈값 저장 수정 (세션 9)
2. `balanceOk` 컬럼 13 저장 (세션 8)

재배포 전까지 마감요청일·경매기일 삭제가 시트에 저장되지 않음.

### 1. 약정서 구글시트 동기화 (우선순위 높음)
현재 약정서(`ctr_archives` · `ctr_esign_archives`)는 **구글시트 동기화 없음**.
- 회원과 동일한 방식으로 `약정서` · `약정서_전자서명` 시트 추가
- GAS 핸들러: `getContracts`, `saveContracts`, `addContract`, `deleteContract`
- 약정서-회원-사건 3자 링크 강화 (약정서 열면 관련 사건·고객 자동 표시)

### 2. 구글 캘린더 자동 푸시 (OAuth)
지금은 `.ics` 수동 export만. GAS에서 Calendar API 이용한 자동 sync 추가 예정.

### 3. 비밀번호 보안 강화
`AUTH_DEFAULT_PW = 'thefin2024!'` 하드코딩 → GAS Script Properties로 이동.

### 4. KPI 대시보드 · CRM 퍼널
월별 정산 리포트 · 블로그→상담 전환율 추적.

---

## 🆘 데이터 유실 사고 (세션 8)

- 사장님이 회사 PC에서 **신용재** 회원 추가 → 집 PC에서는 안 보임
- **원인**: 회원 데이터가 브라우저 localStorage에만 저장 (기기별 격리)
- **해결**:
  1. 회사 PC에서 인트라넷 열기
  2. **☁️ 구글시트 저장** 클릭 → 전체 회원 시트로 업로드
  3. 집 PC에서 **⬇️ 구글시트 불러오기** 클릭 → 복구
- **약정서는 아직 구글시트 동기화 안 됨** → JSON 백업 파일로만 이동 가능 (다음 세션 최우선 과제)

---

## 세션 7 작업 내역 (2026-04-22)

### 법무비용 계산기 — 공식 요율표 적용 (CALC_legal)

법무사 보수를 기존 근사식에서 「법무사보수규정 I. 부동산등기」 공식 누진 요율표로 교체.
세 개 공유 함수 추가:
- `CALC_lawyerFeeByTable(price)` — 9구간 누진 요율
- `CALC_stampTax(price)` — 인지세 구간표
- `CALC_bondRate(price, isMetro)` — 국민주택채권 매입비율 (수도권/지방 구분)

결과 표시에 **과세표준 구간 라벨** 추가 (예: "3억원 초과 ~ 5억원").

### 종합계산기 — 법무비용 수식 통일 (CALC_total)

CALC_total 내부의 인라인 근사 법무비용 코드를 제거하고 위 세 함수로 교체.
법무비용 세부 항목 3줄 표시 추가:
- 법무사 보수 (+VAT)
- 채권 매입 손실 (매입비율% × 1.5%)
- 인지세 + 등기료 등

### 종합계산기 — 납부합계 불일치 버그 수정

**버그**: 대출금이 클 때(downPayment < 매매가×10%) 계약금을 price×10%로 고정 표시해 세부 합산이 최종 현금과 불일치.

**수정**: 계약금 표시를 `min(price×10%, downPayment)`로 cap → 계약금 + 잔금 + 취득세·법무비 = 최종 필요 현금 항상 일치.

④ 비용 총계 섹션에 `+`/`=` 기호·점선 구분선 추가로 가시성 개선.

### 더핀 회원 폼 — 다중 선택 칩

**희망 물건 유형**, **투자 목적** 두 필드를 다중 선택으로 변경.
- `MBR_chipMulti(el, fieldId)` 함수 추가 — 클릭마다 토글, 활성값을 " / " 구분으로 저장
- `MBR_syncChips` 업데이트 — `data-val` 속성 유무로 단일/다중 자동 감지해 수정 폼 복원
- 두 필드 레이블에 "다중 선택 가능" 힌트 추가

---

## 세션 6 작업 내역 (2026-04-20)

### 탭 네비게이션 전면 개편 — 드롭다운 그룹 방식 (Method A)

기존 9개 플랫 탭 → 1개 단독 + 4개 드롭다운 그룹으로 재구성

| 그룹 | 포함 탭 |
|---|---|
| 사진 분석 (단독) | 사진 분석 |
| 📁 업무 | 물건조사 요청표, 더핀 일정표, 명도 |
| ✍️ 콘텐츠 | 블로그 물건추천, 블로그 대본 |
| 👥 고객 | 더핀 회원, 약정서, 입찰안내문 (이동) |
| 📑 양식 | 경매 양식 (신규) |

- CSS: `.nav-group`, `.nav-group-btn`, `.nav-dropdown`, `.nav-dropdown-item` 추가
- 활성 탭 속한 그룹 버튼도 골드 하이라이트 (`_tabGroupMap` 매핑)
- `.main-tabs`의 `overflow: hidden` → `overflow: visible` 수정 (드롭다운 잘림 버그 수정)
- 초기 로드 시 '물건조사 요청표' + '업무' 그룹 버튼 active 처리 IIFE 추가

### 경매 양식 탭 신설 (panel-forms)

- 위치: `panel-contract` 이후 추가
- 서식 카드 4종 (미리보기 + 인쇄 버튼):
  - 📋 기일입찰표
  - ✉️ 입찰봉투
  - 📜 입찰 위임장
  - 🧾 보증금 영수증
- `FORMS_preview(key)`: 모달로 미리보기
- `FORMS_print(key)`: 새 창 열어 인쇄 다이얼로그 자동 실행
- 서식 내용 HTML로 직접 구현 (외부 파일 의존 없음)

### ⚠️ 미완료 — 경매 양식 서식 추가

두인경매(dooinauction.com) 사이트의 경매서식·동산서식·부동산서식 전체를 인트라넷 내에서 바로 확인·인쇄할 수 있게 HTML로 구현 예정.
- 현재 4종만 구현됨
- 전체 서식 목록 파악 후 순차 추가 필요
- 사이트 서식 목록 확인: https://www.dooinauction.com/study/docu_auct.php
- **경매서식·동산서식·부동산서식 탭 구분**도 panel-forms 내에 구현 예정
- 외부 링크 연동 없이 HTML 내장 방식으로 구현

---

## 세션 5 작업 내역 (2026-04-20)

### 로그인/보안 개선
- **초기 비밀번호 모달**: 취소 버튼 노출 → 강제 변경 아닌 권장으로 변경 ("초기 비밀번호 사용 중 — 보안을 위해 변경 권장")
- **계정 선택 드롭다운**: 장한빛/정은진 → "매니저" 표기 추가

### 권한 필터 수정
- **명도 탭 배지**: `M_active.length` 직접 설정 코드 제거 → `M_render()` 내부에서 필터 기준으로만 업데이트
- **명도 배지 0 표시 수정**: 매니저 계정에서 본인 담당 건만 카운트

### 더핀 회원 탭 UI 개선
- **중복 카드 제거**: 대표/이사 전체 선택 시 "전체" 카드가 "전체 회원"과 중복 → `mbr-stat-mine-card` 숨김 처리
- **통계 카드 그리드**: `repeat(5,1fr)` → `repeat(auto-fit,minmax(140px,1fr))` 자동 조정
- **희망지역 칩 단순화**: 서울/경기/인천 구 단위 전체 제거 → "수도권" 그룹에 서울·경기·인천 3개만 표시
- **지역 태그 표시 간소화**: `서울 강남구` → `강남구`, `서울 전체` → `서울`, `경기 전체` → `경기` 렌더링

### ✍️ 블로그 대본 탭 신설 (신규)
- **탭 위치**: 약정서 탭 바로 앞에 추가
- **입력 폼**:
  - 사건정보 캡처 이미지 붙여넣기 (`Ctrl+V` / 드래그&드롭)
  - 블로그 물건추천 목록 연동 드롭다운
  - 더핀 일정표 사건 연동 드롭다운
  - 단지명·구·경매가·동·평형·층수·매매가·감정가·최저가·차수·물건유형·법원·매각기일·사건번호·특이사항
  - 계정 A/B/C/D 선택 (분석형/교육형/데이터형/현장형)
  - 제목 접미사 (분석/정보/물건)
  - 추천 글 제목 + URL 1개
- **대본 자동 생성 섹션 16개**:
  - ① 제목: `단지명+구+경매가+동+물건유형+경매+분석/정보/물건` (20자 이내)
  - ② 첫 문단 (계정별 톤 적용, 키워드 자연 삽입)
  - ③ 기본 정보 테이블
  - ④ 핵심 포인트 3줄
  - ⑤~⑫ 사진 7장 각각 캡션 자동 생성
  - ⑬ 권리분석 3줄
  - ⑭ Q&A 4문답 (물건유형별 8종 자동 분기)
  - ⑮ 마지막 문단 + CTA (키워드 3회 반복)
  - ⑯ 추천 글 링크 1개
  - ⑰ 해시태그 2개 (지역구+물건유형 자동 생성)
- **섹션별 복사 버튼 + 전체 복사 버튼**
- **포스팅 이력 테이블**: 계정·제목·날짜·URL 기록 (localStorage `thefin_blog_history_v1`)
- **이미지 OCR 파싱**: 사건번호·법원·날짜·감정가·최저가·지역구·단지명 자동 추출
- **블로그 물건추천 연동**: `B_items` 실시간 연동, 선택 시 폼 자동 채움

### JS 오류 수정
- `tag1` 생성 코드의 유니코드 따옴표 혼입 오류 → 단순 문자열 연결로 수정

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
| `DRAFT_init()` | 블로그 대본 탭 초기화 (사건·블로그 목록 로드) |
| `DRAFT_generate()` | 대본 16섹션 자동 생성 |
| `DRAFT_fillFromBlog()` | 블로그 물건추천 목록에서 폼 자동 채우기 |
| `DRAFT_fillFromCase()` | 더핀 일정표 사건에서 폼 자동 채우기 |
| `DRAFT_handlePaste(e)` | 이미지/텍스트 붙여넣기 처리 |
| `DRAFT_parseFromText(text)` | 클립보드 텍스트에서 사건정보 파싱 |
| `DRAFT_copyAll()` | 전체 대본 클립보드 복사 |
| `DRAFT_saveHistory()` | 포스팅 이력 localStorage 저장 |
| `DRAFT_renderHistory()` | 포스팅 이력 테이블 렌더 |
| `CALC_lawyerFeeByTable(price)` | 법무사 보수 공식 요율표 (9구간 누진) |
| `CALC_stampTax(price)` | 인지세 구간표 |
| `CALC_bondRate(price, isMetro)` | 국민주택채권 매입비율 |
| `CALC_acq()` | 취득세 계산기 (별도 탭) |
| `CALC_legal()` | 법무비용 계산기 (별도 탭) |
| `CALC_total()` | 종합계산기 (취득세+법무비+LTV+DSR+최종현금) |
| `MBR_chipToggle(el, fieldId, val)` | 단일선택 칩 |
| `MBR_chipMulti(el, fieldId)` | 다중선택 칩 (data-val 기반) |
| `MBR_syncChips(fieldId, val)` | 폼 로드 시 칩 복원 (단일/다중 자동 감지) |
| `MBR_casesCell(m)` | 회원 테이블 사건 셀 (📋 N건 버튼만 표시) |
| `MBR_showCases(memberName)` | 회원 사건 히스토리 팝업 (타임라인 카드) |
| `CAL_getEvents(dateStr)` | 날짜별 캘린더 이벤트 수집 (취소선/숨김 분리) |
| `CD_renderPipeline(c)` | 9단계 파이프라인 + 기타 수기란 표시 |
| `CD_saveStageNote(val)` | 기타(9단계) 수기 내용 실시간 저장 |
| `CD_setStage(n)` | 파이프라인 단계 클릭 → 저장 |

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
