# ADR-20260515 — 명도 ↔ 사건 객체 담당자 양방향 동기화

## 컨텍스트
- 사건 c에 두 가지 명도 담당자 필드: `c.evictionStaff`(주 담당, 시트 영속) + `c.coParticipants.evictionStaff`(추가 담당 배열, **localStorage shadow only**).
- 명도 시트 행에 `m.staffList` 콤마구분 다중 담당자(시트 영속, ADR-20260515-myeongdo-multistaff에서 신설).
- 기존엔 `FEE_getAllStaff(c)`가 두 출처 union해서 대시보드 표시만 했고, 명도 ↔ 사건 객체 양방향 자동 sync는 없었음.
- 사용자 시나리오: 까치마을 김동희 사건의 대시보드 참여자에는 이제훈·장한빛 두 명 표시 / 명도 탭은 수동 재입력. 양방향 자동 연동 요구.

## 결정
1. **헬퍼 함수**: `C_getEvictionStaffList(c)` 단일 진실 추출(c.evictionStaff + c.coParticipants.evictionStaff Set union).
2. **명도 → 사건**: `C_syncFromMyeongdo(caseNo, staffArr)` — `M_saveForm` 직후 자동 호출. c.evictionStaff = list[0], c.coParticipants.evictionStaff = list.slice(1). `FEE_saveShadow` + `C_apiBg('updateCase')` + `C_render` + `DASH_render`.
3. **사건 → 명도**: `M_mirrorFromCase(c)` — `C_setEvictionStaff` / `PART_addCo` / `PART_removeCo`(field='evictionStaff') 진입점에서 호출. 같은 caseNo 명도 row의 staffList/staffName 갱신 + `M_gasPost('update')` 비동기. `setSync('loading'/'ok'/'err')` 시각 피드백.
4. **prefill**: `M_prefillFromCase()` — 명도 신규 등록 폼의 사건번호 input `onblur`. picker가 비어있고 매칭 사건 있으면 c.evictionStaff list로 prefill. 주소도 비어있으면 c.address로.
5. **낙찰 자동등록**: `A_autoAddMyeongdo` — 사건 evictionStaff list를 staffList로 prefill, GAS add 호출에도 포함.
6. **무한 루프 방지**: 두 함수 모두 before/after 비교 후 변경 없으면 early return. 또 `C_syncFromMyeongdo`는 c.evictionStaff를 직접 할당(setter 미경유)해서 `C_setEvictionStaff → M_mirrorFromCase` 재진입 차단.
7. **다른 PC 영속성 복구**: `M_reconcileCoParticipantsFromSheet()` — `applyBulkData`에서 명도 시트 staffList → c.coParticipants.evictionStaff 자동 재구성. coParticipants가 shadow-only라 다른 PC에서 비어있어도 명도 시트(SoT)로부터 복구.

## 근거
- 명도 시트 staffList가 GAS 영속 SoT. coParticipants는 임시 shadow. 두 곳을 일관 유지하되, 충돌 시 **명도 시트 우선**.
- 모든 진입점(사건탭 select, 참여자 모달, 명도 폼)이 단일 헬퍼 거치도록 해서 sync 누락 방지.
- 회원 탭(MBR_members.staff) ↔ 사건 manager 양방향은 이번 스코프에서 제외 — 1:N 관계 + 변경 사이드이펙트 너무 큼.

## 대안 (검토 후 기각)
- **coParticipants를 GAS 시트에 정식 컬럼 추가**: 마이그레이션 부담 + 다른 필드(blogStaff, subStaff)도 같은 처리 요구 발생 → 범위 폭발. 기각.
- **명도 staffList를 사건 c의 derived field로 두고 시트 명도만 유지**: 사건 모달에서 evictionStaff 변경 시 명도 시트 직접 update 필요 — 데이터 분산 어색. 기각.
- **manager / typeMap / blogStaff까지 일괄 양방향**: 사용자 요구는 명도 중심. 범위 폭발 + 회귀 위험. 기각.

## 영향
- **클라이언트만 수정** (unified-gas.js 변경 없음). GAS 재배포 불필요.
- **다른 PC 동기화**: applyBulkData에서 자동 reconcile하므로 데이터 손실 방지.
- **회귀 위험**: M_active.unshift/filter 인터랙션, M_syncFromCases 자동 등록, PART_render 호출 순서 등 모두 영향 받지 않음(추가만, 기존 경로 보존).
- **알려진 한계**:
  - C_setEvictionStaff 등이 async 아니라 M_mirrorFromCase await 안 함 — setSync 시각 피드백으로 대신함. 시각적 표시 외에 race 가능성 매우 낮음.
  - 사건 manager / blogStaff / subStaff는 양방향 안 함 — 별도 PR 대상.
  - M_prefillFromCase는 onblur만 트리거 — 사건번호 재수정 시 picker 자동 갱신 안 됨 (UX polish).
