# ADR-20260515-lw-inline-edit

## 상태
- 채택 (2026-05-15)

## 컨텍스트
- 대표가 소송 페이지(LW_render)에서 박희권 사건의 연락처·메모를 즉시 편집하고 싶다고 요청
- 기존: 연락처는 회원관리 패널, 메모는 사건관리 패널에서만 편집 가능 — 매니저가 LW 페이지에서 회원관리 패널로 왕복하는 동선
- 멀티 페르소나 모드 첫 실전 작업 (셋업 직후): consultant·pm·dev·lawyer 4 직군 병렬 의견 수렴
- 소송 단계 사건의 데이터는 분쟁 증거로 제출될 가능성이 평소보다 높음

### 직군별 입장 요약
| 직군 | 입장 | 핵심 주장 |
|---|---|---|
| consultant | 조건부 찬성 | 보조 연락처(가족·대리인) 케이스 실재. 영업 메모 ≠ 소송 메모. **별도 필드** + 폴백 권장 |
| pm | 조건부 찬성 | SSOT 깨지면 4화면 stale UI. **in-place 수정** 권장, 별도 필드 신설 반대 |
| dev | 조건부 찬성 | 별도 필드 + **폴백 체인**(`lawsuitContact ?? MBR.phone`)으로 SSOT 깨지지 않음. 마이그레이션 0 |
| lawyer | 조건부 찬성 | 분쟁 증거능력 보호 — **변경 이력 영구 기록**, 즉시 저장 X 2단계 보호, 메모는 append-only 권장 |

### 핵심 충돌
1. **데이터 저장 위치**: 3:1 (분리 vs in-place) — dev의 폴백 체인이 pm의 SSOT 우려 해소
2. **편집 UX**: lawyer "2단계 저장(사유 입력)" vs 다른 직군 "인라인 즉시"
3. **메모 append-only**: lawyer 단독 강한 주장 vs 다른 직군 자유 편집

## 결정
**별도 필드(`c.lawsuitContact`, `c.lawsuitMemo`) 신설 + 폴백 체인으로 표시, 인라인 편집 + 확인 다이얼로그 + 이력 자동 기록**

### 핵심 사양
1. **신규 필드** — active 시트 col16(`소송연락처`), col17(`소송메모`). GAS `loadCases`가 헤더 자동 set (수동 마이그레이션 불필요)
2. **표시 폴백 체인**:
   - phone: `c.lawsuitContact || MBR_members.find(m=>m.name===c.clientName)?.phone || ''`
   - memo: `c.lawsuitMemo || c.note || M_active.memo || ''`
3. **편집 UX**: 데스크탑 인라인 input/textarea, 모바일은 `prompt()` 폴백 (가로 스크롤 충돌 회피)
4. **확인 다이얼로그**: 저장 직전 `confirm("이 변경은 영구 기록됩니다")` 1단계. 사유 입력은 강제하지 않음
5. **권한 가드**: `C_isAssigned`로 매니저 직급은 본인 사건만 편집. 진입점·저장 직전 두 번 체크 (UI 우회 방어)
6. **이력 기록**: GAS `updateCase` 안에서 변경 감지 시 `addCaseHistory` 자동 호출. action: `소송연락처변경`·`소송메모변경`. 옛값→새값 보존
7. **XSS 방어**: `LW_esc` 헬퍼로 표시 시 escape

## 근거
- **§6.7 충돌 해결 우선순위**: 법적·세무적 리스크 → 보수적 입장 채택. lawyer 보호 요구를 핵심으로 채택하되 매니저 4명 운영의 마찰을 절충
- **별도 필드 + 폴백 체인**: 가장 많은 직군(consultant·dev·lawyer 3:1) 지지, pm의 SSOT 우려는 폴백으로 해소. 보조 연락처·소송 전용 메모라는 영업적 필요(consultant)와 분쟁 증거능력(lawyer)을 양립
- **확인 다이얼로그 1단계 + 이력 로그**: lawyer "2단계 저장" 요구는 매니저 4명 외근 환경에서 마찰 과다. 이력 영구 기록이 사후 조작 의심 방어 핵심 — 2단계가 1단계로 완화돼도 보호 목적 달성
- **append-only 메모 거절**: lawyer가 가장 보수적 옵션으로 제안했으나, 매니저 일상 메모 갱신 흐름과 충돌. 이력 로그가 옛값을 보존하므로 사후에 "어느 시점 메모가 어땠는지" 추적 가능 — append-only의 실질 기능을 대체
- **별도 필드 vs note 통합**: c.note는 7단계 워크플로우 전반에서 사용되는 영업 메모. 소송 단계 진입 후 메모가 c.note를 덮어쓰면 상담·보고서 단계 영업 메모가 디스커버리 대상 확장 (lawyer 우려). 분리가 안전

## 대안 (검토했으나 채택하지 않은 것)
1. **pm의 in-place 수정**: SSOT 일관성 우수하나 보조 연락처 케이스 표현 불가, 영업 메모와 소송 메모 분리 불가. 폴백 체인이 채택되며 사실상 등가
2. **lawyer의 append-only 메모**: 이상적 분쟁 방어이나 매니저 사용성 마찰 과다. 이력 로그로 실질 기능 대체
3. **lawyer의 2단계 저장(사유 입력 강제)**: 외근 모바일에서 입력 부담 큼. confirm 1단계 + 자동 이력 기록으로 절충
4. **GAS Sheets 미수정, localStorage 섀도 스토리지 저장**: 매니저 4명 간 데이터 공유 불가 — 불채택

## 영향
- **코드**: `unified-gas.js` (loadCases·updateCase, +50줄), `index.html` (LW_render·LW_inlineEdit·LW_saveField·LW_esc 신규, +100줄)
- **시트**: 사건목록 시트에 col16/col17 추가. **GAS가 자동으로 헤더 set하므로 매니저 수동 작업 불필요**
- **사용자**: 매니저(장한빛·정은진)는 본인 담당 소송 사건만 편집 가능. 대표·이사는 전사 편집
- **운영**: GAS 새 버전 배포 필요 (수동). 배포 전엔 LW 페이지에서 편집 시 무시됨
- **후속 작업**:
  - `alert` → 비차단 토스트 UX (별도 PR)
  - `c.caseNo`·`c.clientName`·`c.address`도 LW 외 다른 곳에서 escape 일관성 점검 (별도)
  - 통지 발송 시점 phone 스냅샷 동결 (별도, 통지 발송 기능 자체 미구현 상태)
  - 개인정보 로그 마스킹(`010-****-1234`) — addCaseHistory에 phone 풀값 들어가는 게 이번 작업 부산물. 별도 점검
- **리스크**: 만약 이 결정이 잘못됐다면 — 매니저들이 소송 페이지 편집을 거의 안 쓰고 회원관리 패널로 회귀하는 신호. 3개월 후 사용 빈도 측정

## 참조
- 커밋: `f45682e` (feature/lw-inline-edit)
- 멀티 페르소나 셋업 ADR: 본 ADR이 첫 실전 적용
- 관련 페르소나: `.claude/agents/consultant.md`, `pm.md`, `dev.md`, `lawyer.md`
- 코드 위치: index.html `LW_render`(L8968~), `LW_inlineEdit`/`LW_saveField`/`LW_esc`(L9059~), unified-gas.js `loadCases`(L285~), `updateCase`(L669~)
