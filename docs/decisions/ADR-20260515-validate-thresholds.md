# ADR-20260515-validate-thresholds

## 상태
- 채택

## 컨텍스트
- `scripts/validate.js`에 4종 신규 룰 도입 (HTTPS·LS prefix·XSS 의심·GAS ok 분기 비율)
- 일부 룰은 boolean이 아닌 **카운트·비율 임계값**. 임계값 숫자가 합리적이지 않으면 CI가 의미 없어지거나 신규 정상 코드를 막음
- Phase 1 인트라넷은 882KB SPA + 17,000줄. 즉시 0건 만들기 불가능한 항목 존재 (XSS 의심 53건 등) — baseline 인정 후 점진 축소가 현실적

## 결정
신규 4종 룰의 임계값을 아래와 같이 정한다.

- **§10 GAS_URL HTTPS**: boolean (HTTP 평문 0건)
- **§11 localStorage prefix**: boolean (`thefin_` 외 0건). 마이그레이션 IIFE 통과 후 위반 0건 보장
- **§12 XSS 의심 카운트**: **60건 이하 (경고)**. 2026-05-15 baseline 53건 + 마진 7
- **§13 GAS 응답 ok 검사 비율**: **30% 이상 (경고)**. 2026-05-15 baseline 31% (29/93)

## 근거
- **§12 = 60**: baseline 53건. 마진 0이면 신규 PR이 정상 코드 추가만 해도 깨짐. 마진 7은 약 2~3건의 신규 정적 템플릿 innerHTML을 허용하는 수치 (정적 템플릿은 위험 0). 7이라는 숫자 자체는 보수적인 추정 — 더 적게 잡으면 일상 작업 마찰, 더 많이 잡으면 baseline 보호 약화.
- **§13 = 30%**: baseline 31%. 마진 1%p는 측정 노이즈 흡수용 (정규식이 부정확하면 ±2건 변동). 50% 같은 야심 임계는 즉시 깨짐 → 룰 무의미해짐. 30%는 "최소한 회귀 방지" 수준.
- **Phase 2 게이트**: 고객 자가 조회(Phase 2) 진입 전 §12 임계 30 이하로 낮추는 것을 목표로 함 — 이는 별도 ADR로 결정 예정.

## 대안
- **대안 1: §12 = 50 (Subagent 1차 제안)**. 채택 안 함 — baseline 53건이라 즉시 false fail.
- **대안 2: §12 = 100, §13 = 0% (느슨)**. 채택 안 함 — 검사 의미 무력화. 회귀 보호 못 함.
- **대안 3: §12·§13을 errors로 격상**. 채택 안 함 — baseline 자체가 통과 가능한 수준이 아니라 CI가 영구 차단됨.

## 영향
- **코드**: `코드/scripts/validate.js` 임계값 60·30%로 설정
- **사용자**: 매니저 4명에 직접 영향 없음 (개발자만 봄)
- **운영**: GAS 배포 불필요. `npm run validate` 실행 시 baseline 통과
- **후속 작업**:
  - escapeHtml() 헬퍼 도입 + 메시지/메모/이름 필드에서 innerHTML → textContent 점진 교체. 1주 단위로 §12 측정값 추적
  - Phase 2 게이트 ADR 작성 (임계 30 이하 목표·기한)
  - §13 ok 검사 비율 정규식 정밀화 (현재 `res?.ok`도 잡음 → 정밀 측정 필요)
- **리스크**:
  - 신규 PR이 §12 60건 임계를 무자비하게 갉아먹으면 baseline 보호가 약해진다. 이 경우 임계를 baseline 측정값에 매주 자동 갱신하는 PostMerge 훅 도입 검토

## 참조
- 관련 코드: `코드/scripts/validate.js` §10~§13
- 관련 IIFE: `코드/index.html` L6118~L6140 (localStorage 마이그레이션)
- 검토 의견: Subagent general-purpose 2회 (TDZ 앵커·토큰 패턴·`fail()` 헬퍼·임계값 근거 요구 등 반영)
