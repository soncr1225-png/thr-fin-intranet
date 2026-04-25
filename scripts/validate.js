#!/usr/bin/env node
// THE FIN 인트라넷 — CI 검증 스크립트
// 용도: 커밋 전·수정 후 자동 실행. 핵심 구조 파괴 여부를 빠르게 감지.

const fs   = require('fs');
const path = require('path');

const ROOT     = path.join(__dirname, '..');
const HTML_FILE = path.join(ROOT, 'index.html');
const GAS_FILE  = path.join(ROOT, 'unified-gas.js');

const errors   = [];
const warnings = [];

function ok(cond, msg, isWarn = false) {
  if (!cond) (isWarn ? warnings : errors).push(msg);
}

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

// ── 3. 필수 JS 함수 ───────────────────────────────────────────────
[
  'function AUTH_login', 'function AUTH_applyRole',
  'function CAL_render', 'function CAL_init',
  'function loadBulk',   'function applyBulkData',
  'function MSG_send',   'function DRAFT_generate',
].forEach(fn => ok(html.includes(fn), `필수 함수 없음: ${fn}`));

// ── 4. TDZ 검사 — CAL_year 선언이 loadBulk() 호출보다 앞에 있어야 함 ──
const calPos  = html.indexOf('let CAL_year');
const bulkPos = html.indexOf('loadBulk();');
ok(
  calPos !== -1 && bulkPos !== -1 && calPos < bulkPos,
  'TDZ 위험: CAL_year 선언이 loadBulk() 호출보다 뒤에 있음'
);

// ── 5. 보안 — 하드코딩된 시크릿 ─────────────────────────────────
ok(!html.match(/['"]AIza[0-9A-Za-z_-]{35}['"]/),
  '보안: 구글 API 키 하드코딩 감지');
ok(!html.match(/password\s*[:=]\s*['"][^'"]{4,}['"]/i),
  '보안: 비밀번호 하드코딩 의심', true);
ok(!html.match(/주민등록번호|[0-9]{6}-[0-9]{7}/),
  '보안: 주민번호 패턴 감지', true);

// ── 6. GAS 연동 ───────────────────────────────────────────────────
ok(html.includes('GAS_URL') || html.includes('script.google.com'),
  'GAS URL 참조 없음 — GAS 연동이 끊겼을 수 있음');

// ── 7. 브랜드 컬러 일관성 (경고 수준) ────────────────────────────
ok(html.includes('#1a2236') || html.includes('--navy') || html.includes('var(--color'),
  '브랜드 컬러 변수 미사용 — 다크 네이비 하드코딩 확인 필요', true);

// ── 결과 출력 ─────────────────────────────────────────────────────
console.log('\n══ THE FIN 인트라넷 CI 검증 ══');
console.log(`  파일 크기: ${(html.length / 1024).toFixed(0)}KB`);

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
  console.log('\n✅ 오류 없음 (경고 확인 권장)');
}
console.log('');

process.exit(errors.length > 0 ? 1 : 0);
