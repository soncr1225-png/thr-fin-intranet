#!/usr/bin/env node
// THE FIN 인트라넷 — CI 검증 스크립트
// 용도: 커밋 전·수정 후 자동 실행. 핵심 구조 파괴 여부를 빠르게 감지.
// 사용:
//   node scripts/validate.js           — 오류 시 exit 1, 경고는 무시
//   node scripts/validate.js --strict  — 경고도 exit 1

const fs   = require('fs');
const path = require('path');

const STRICT    = process.argv.includes('--strict');
const ROOT      = path.join(__dirname, '..');
const HTML_FILE = path.join(ROOT, 'index.html');
const GAS_FILE  = path.join(ROOT, 'unified-gas.js');

const errors   = [];
const warnings = [];

function ok(cond, msg, isWarn = false) {
  if (!cond) (isWarn ? warnings : errors).push(msg);
}
function fail(msg, isWarn = false) { ok(false, msg, isWarn); }

// ── 파일 읽기 ──────────────────────────────────────────────────────
let html = '', gas = '';
try { html = fs.readFileSync(HTML_FILE, 'utf8'); }
catch(e) { errors.push('index.html 읽기 실패: ' + e.message); }

try { gas = fs.readFileSync(GAS_FILE, 'utf8'); }
catch(e) { warnings.push('unified-gas.js 읽기 실패 (선택적)'); }

// ── 1. 파일 크기 — 6만 자 이하면 비정상 ──────────────────────────
ok(html.length > 60000, `index.html 크기 이상 (${html.length}자) — 파일이 잘렸을 수 있음`);

// ── 2. 필수 DOM 요소 ──────────────────────────────────────────────
[
  'panel-cal', 'panel-cases', 'panel-draft', 'panel-blog',
  'mainTab-cal', 'mainTab-cases', 'mainTab-draft',
  'auth-overlay', 'CAL_grid', 'CAL_monthLabel',
  'MSG_sendBtn', 'MSG_body',
].forEach(id => ok(html.includes(`id="${id}"`), `필수 DOM 요소 없음: #${id}`));

// ── 2b. 중복 DOM ID ───────────────────────────────────────────────
const idCount = {};
const idRe = /\sid="([^"]+)"/g;
let m;
while ((m = idRe.exec(html)) !== null) {
  idCount[m[1]] = (idCount[m[1]] || 0) + 1;
}
// 템플릿 리터럴(${...})로 동적 생성되는 ID는 제외 — 같은 리터럴이라도 런타임에 서로 다름
Object.entries(idCount)
  .filter(([id, c]) => c > 1 && !id.includes('${'))
  .forEach(([id, c]) => fail(`중복 DOM ID: #${id} (${c}회) — querySelector 충돌 위험`));

// ── 3. 필수 JS 함수 ───────────────────────────────────────────────
[
  'function AUTH_login', 'function AUTH_applyRole',
  'function CAL_render', 'function CAL_init',
  'function loadBulk',   'function applyBulkData',
  'function MSG_send',   'function DRAFT_generate',
].forEach(fn => ok(html.includes(fn), `필수 함수 없음: ${fn}`));

// ── 4. TDZ 검사 — CAL_year 선언이 loadBulk() 호출보다 앞에 있어야 함 ──
// 줄 시작 앵커(^)로 주석/문자열 내 우연 일치 회피
const calMatch  = html.match(/^\s*let CAL_year/m);
const bulkMatch = html.match(/^\s*loadBulk\(\);/m);
const calPos    = calMatch  ? calMatch.index  : -1;
const bulkPos   = bulkMatch ? bulkMatch.index : -1;
ok(
  calPos !== -1 && bulkPos !== -1 && calPos < bulkPos,
  'TDZ 위험: CAL_year 선언이 loadBulk() 호출보다 뒤에 있음'
);

// ── 5. 보안 — 하드코딩된 시크릿 (index.html) ─────────────────────
ok(!html.match(/['"]AIza[0-9A-Za-z_-]{35}['"]/),
  '보안: 구글 API 키 하드코딩 감지');
ok(!html.match(/['"]sk-ant-[A-Za-z0-9_-]{20,}['"]/),
  '보안: Anthropic API 키 하드코딩 감지');
// URL 안에 박힌 토큰(`https://api.telegram.org/bot123:abc/...`)도 잡도록 따옴표 비강제
ok(!html.match(/\bbot\d{6,}:[A-Za-z0-9_-]{30,}\b/),
  '보안: Telegram 봇 토큰 하드코딩 감지');
ok(!html.match(/['"]AKfyc[A-Za-z0-9_-]{50,}['"]/),
  '보안: GAS 배포 ID 하드코딩 의심', true);
ok(!html.match(/password\s*[:=]\s*['"][^'"]{4,}['"]/i),
  '보안: 비밀번호 하드코딩 의심', true);
ok(!html.match(/주민등록번호|[0-9]{6}-[0-9]{7}/),
  '보안: 주민번호 패턴 감지', true);

// ── 6. GAS 연동 ───────────────────────────────────────────────────
ok(html.includes('GAS_URL') || html.includes('script.google.com'),
  'GAS URL 참조 없음 — GAS 연동이 끊겼을 수 있음');

// ── 7. 브랜드 컬러 일관성 ────────────────────────────────────────
// 공식 다크 네이비: #0a1628 (CLAUDE.md §11.2)
ok(html.includes('#0a1628') || html.includes('--navy') || html.includes('var(--color'),
  '브랜드 컬러 변수/공식색(#0a1628) 미사용 — 다크 네이비 하드코딩 확인 필요', true);
const oldNavyCount = (html.match(/#1a2236/g) || []).length;
ok(oldNavyCount === 0,
  `옛 다크 네이비 #1a2236 ${oldNavyCount}회 사용 — 공식색 #0a1628로 통일 권장`, true);

// ── 8. 콘솔 잔재 (디버그 코드) ───────────────────────────────────
// 임계값 5: 운영 코드에 의도적 정보 로그가 1~2개 있을 수 있음을 감안.
// error/warn은 운영용 로깅이라 의도적 제외.
const consoleCount = (html.match(/console\.(log|debug|info)/g) || []).length;
ok(consoleCount <= 5,
  `console.log/debug/info 잔재 ${consoleCount}개 (임계값 5) — 디버그 코드 정리 권장`, true);

// ── 9. GAS 측 검사 ───────────────────────────────────────────────
if (gas) {
  // 9a. 진입점(doGet/doPost) try-catch 강제 — 실패 시 500 아닌 {ok,error} 보장
  const dGetPos  = gas.indexOf('function doGet');
  const dPostPos = gas.indexOf('function doPost');
  const dGetSlice  = dGetPos  >= 0 ? gas.substr(dGetPos,  200) : '';
  const dPostSlice = dPostPos >= 0 ? gas.substr(dPostPos, 200) : '';
  ok(dGetSlice.includes('try'),  '진입점: doGet에 외곽 try-catch 없음 — 에러 시 500 응답');
  ok(dPostSlice.includes('try'), '진입점: doPost에 외곽 try-catch 없음 — 에러 시 500 응답');

  // 9b. 전체 try-catch 비율 — 헬퍼 함수까지 둘러쌀 필요는 없으므로 25% 임계
  const gasFuncCount = (gas.match(/function\s+\w+/g) || []).length;
  const gasTryCount  = (gas.match(/try\s*\{/g) || []).length;
  const tryRatio     = gasFuncCount > 0 ? gasTryCount / gasFuncCount : 1;
  ok(tryRatio >= 0.25,
    `GAS try-catch 비율 ${(tryRatio*100).toFixed(0)}% (${gasTryCount}/${gasFuncCount}) — 진입점 외 실패 처리 부족`,
    true);

  const okReturns = (gas.match(/return\s*\{\s*ok\s*:/g) || []).length;
  ok(okReturns >= 5,
    `GAS 응답 구조 {ok,data,error} 패턴 ${okReturns}회 — 컨벤션 적용 빈약`, true);

  ok(!gas.match(/['"]AIza[0-9A-Za-z_-]{35}['"]/),
    '보안(GAS): 구글 API 키 하드코딩 감지');
  ok(!gas.match(/['"]sk-ant-[A-Za-z0-9_-]{20,}['"]/),
    '보안(GAS): Anthropic API 키 하드코딩 감지');
  ok(!gas.match(/\bbot\d{6,}:[A-Za-z0-9_-]{30,}\b/),
    '보안(GAS): Telegram 봇 토큰 하드코딩 감지');
}

// ── 10. GAS_URL HTTPS 강제 ───────────────────────────────────────
ok(!html.match(/GAS_URL\s*=\s*['"]http:\/\//),
  '보안: GAS_URL이 HTTP 평문 — HTTPS 필수');
ok(!html.match(/fetch\(\s*['"]http:\/\/script\.google\.com/),
  '보안: fetch에 HTTP GAS URL 직접 사용 — HTTPS 필수');

// ── 11. localStorage 키 prefix 일관성 ───────────────────────────
// 모든 localStorage 키는 `thefin_` prefix 사용 (다른 사이트 충돌·일괄 정리 위함)
const lsKeyMatches = [...html.matchAll(/localStorage\.(?:getItem|setItem|removeItem)\(['"]([^'"]+)['"]/g)];
const lsKeys      = lsKeyMatches.map(m => m[1]);
const lsViolators = [...new Set(lsKeys.filter(k => !k.startsWith('thefin_')))];
ok(lsViolators.length === 0,
  `localStorage prefix 미준수 ${lsViolators.length}종: ${lsViolators.join(', ')} — thefin_ prefix 필수`);

// ── 12. XSS 의심 — innerHTML에 변수/템플릿 직접 주입 ─────────────
// 정적 문자열 innerHTML은 안전. 변수·템플릿 리터럴(${...}) 주입은 사용자 입력 시 위험.
// 임계값 60은 2026-05-15 baseline(53건) + 마진 7. 신규 도입 금지 + 점진 축소 목표.
// Phase 2(고객 자가 조회) 진입 전 escapeHtml() 도입으로 30 이하로 낮춰야 함.
const xssVarInjection = (html.match(/\.innerHTML\s*=\s*[a-zA-Z_$][\w.]*\s*[;)]/g) || []).length;
const xssTplInjection = (html.match(/\.innerHTML\s*=\s*`[^`]*\$\{/g) || []).length;
const xssSuspicious = xssVarInjection + xssTplInjection;
ok(xssSuspicious <= 60,
  `XSS 의심: innerHTML에 변수/템플릿 주입 ${xssSuspicious}건 (변수 ${xssVarInjection} + 템플릿 ${xssTplInjection}, 임계 60) — escapeHtml() 적용 권장`,
  true);

// ── 13. GAS 응답 ok 분기 처리 비율 ──────────────────────────────
// gasPost/gasGet 호출 대비 res.ok 검사 비율. 30% 미만이면 실패 분기 누락 다수.
const gasCallCount = (html.match(/(?:gasPost|gasGet)\(/g) || []).length;
const okCheckCount = (html.match(/\.ok\s*(?:===?\s*false|\)|\s*&&|\s*\|\|)|!\s*\w+\.ok/g) || []).length;
const okRatio = gasCallCount > 0 ? okCheckCount / gasCallCount : 1;
ok(okRatio >= 0.3,
  `GAS 응답 ok 검사 비율 ${(okRatio*100).toFixed(0)}% (${okCheckCount}/${gasCallCount}) — 30% 이상 권장`,
  true);

// ── 결과 출력 ─────────────────────────────────────────────────────
console.log('\n══ THE FIN 인트라넷 CI 검증 ══');
console.log(`  index.html: ${(html.length / 1024).toFixed(0)}KB`);
if (gas) console.log(`  unified-gas.js: ${(gas.length / 1024).toFixed(0)}KB`);
if (STRICT) console.log(`  모드: --strict (경고도 실패 처리)`);

if (errors.length > 0) {
  console.log(`\n❌ 오류 ${errors.length}개:`);
  errors.forEach(e => console.log('  · ' + e));
}
if (warnings.length > 0) {
  console.log(`\n⚠️  경고 ${warnings.length}개:`);
  warnings.forEach(w => console.log('  · ' + w));
}
if (errors.length === 0 && warnings.length === 0) {
  console.log('\n✅ 모든 항목 통과');
} else if (errors.length === 0) {
  console.log(STRICT
    ? '\n❌ --strict 모드: 경고가 있어 실패 처리'
    : '\n✅ 오류 없음 (경고 확인 권장)');
}
console.log('');

const exitFail = errors.length > 0 || (STRICT && warnings.length > 0);
process.exit(exitFail ? 1 : 0);
