// ============================================================
// THE FIN 통합 경매 관리 시스템 — 단독 GAS 스크립트
// ============================================================
// ★ 배포 전 스크립트 속성(파일 > 프로젝트 속성 > 스크립트 속성)에 설정:
//   ANTHROPIC_KEY  = sk-ant-api03-...
//   TELEGRAM_TOKEN = 8775369714:AAG...
// ============================================================

// ── 스프레드시트 ID ──────────────────────────────────────────
var CASES_SS_ID = '1Mmo3giibc9m3tNa-dRuzsgemytl-2DYMjc7zCC4SI-4';
var BLOG_SS_ID  = '1I2qlzU9JprcwEgc1P0ip8R-yajHHol5vSlMU2tRX-lA';

// ── 사건 관리 시트명 ─────────────────────────────────────────
var SH_CASES_ACTIVE  = '사건목록';
var SH_CASES_ARCHIVE = '종료사건';
var SH_TODOS         = 'ToDo';
var SH_MEMBERS       = '회원관리';  // 신규 — 회원 데이터 영구 저장
var SH_PWHASH        = '비번관리';  // 신규 — 비번 해시 동기화 (PC간 공유)
var SH_FEEDBACK      = '오류제보';  // 신규 — 직원 오류·개선 제보
var DRIVE_FOLDER_FEEDBACK = '1sY51aSaHZSBh54L8JOlZtZjjs56NXhiJ';  // 04-첨부파일 폴더 (Drive)
var SH_FEE_DATA      = '수수료데이터'; // 신규 — 7단계·수수료·입찰정보 (기기간 공유)
var SH_CTR_ARCHIVE   = '약정서보관';  // 신규 — 약정서 보관
var SH_CTR_ESIGN     = '전자서명보관'; // 신규 — 전자서명 보관

// ── 입찰/명도 시트명 ─────────────────────────────────────────
var SH_AUCTION    = '입찰진행';
var SH_MYEONGDO_A = '명도진행';
var SH_MYEONGDO_D = '명도완료';

// ── 블로그 관리 시트명 ───────────────────────────────────────
var SH_BLOG_ACTIVE  = '더핀 블로그 일정표';
var SH_BLOG_ARCHIVE = '보관함';
var SH_BLOG_STATS   = '통계 대시보드';

var BLOGGERS = { A: '자스크', B: '더퀸', C: '인스톨', D: '연예인' };

// ============================================================
// 공통 헬퍼
// ============================================================
function prop(key) {
  return PropertiesService.getScriptProperties().getProperty(key) || '';
}
function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
function casesSS() { return SpreadsheetApp.openById(CASES_SS_ID); }
function blogSS()  { return SpreadsheetApp.openById(BLOG_SS_ID); }
function sh(ss, name) {
  return ss.getSheetByName(name) || ss.insertSheet(name);
}
function kstDate(val) {
  if (!val) return '';
  try {
    var d = (val instanceof Date) ? val : new Date(val);
    if (isNaN(d.getTime())) return '';
    return Utilities.formatDate(d, 'Asia/Seoul', 'yyyy-MM-dd');
  } catch(e) { return ''; }
}
function todayStr() {
  return Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM-dd');
}
function shortDate() {
  var d = new Date();
  return String(d.getFullYear()).slice(2) + '.' + (d.getMonth()+1) + '.' + d.getDate() + '.';
}

// ============================================================
// 메인 라우터
// ============================================================
function doGet(e) {
  var p = (e && e.parameter) ? e.parameter : {};
  if (p.module === 'blog')      return blogGet(p);
  if (p.module === 'auction')   return auctionGet(p);
  if (p.module === 'myeongdo')  return myeongdoGet(p);
  if (p.module === 'stats')     return statsGet(p);
  if (p.module === 'drive')     return driveGet(p);
  if (p.module === 'msg')       return msgGet(p);
  return casesGet(p);
}

function doPost(e) {
  var b;
  try { b = JSON.parse(e.postData.contents); } catch(x) { b = null; }
  // Telegram webhook
  if (b && (b.message || b.update_id !== undefined)) {
    handleTelegram(b);
    return json({ ok: true });
  }
  if (!b) return json({ error: 'no body' });
  if (b.module === 'blog' || b.action === 'analyze') return blogPost(b);
  if (b.module === 'auction')   return auctionPost(b);
  if (b.module === 'myeongdo')  return myeongdoPost(b);
  if (b.module === 'drive')     return drivePost(b);
  if (b.module === 'beta')      return betaPost(b);
  if (b.module === 'msg')       return msgPost(b);
  if (b.module === 'calendar')  return calendarPost(b);
  if (b.action === 'setFeeEntries')  return setFeeEntries(b.entries);
  if (b.action === 'saveCtrArchive') return saveCtrArchive(b.data);
  if (b.action === 'deleteCtrArchive') return deleteCtrRow(SH_CTR_ARCHIVE, b.id);
  if (b.action === 'saveCtrEsign')   return saveCtrEsign(b.data);
  if (b.action === 'deleteCtrEsign') return deleteCtrRow(SH_CTR_ESIGN, b.id);
  return casesPost(b);
}

// ============================================================
// CASES — GET
// ============================================================
function casesGet(p) {
  var ss = casesSS();
  if (p.action === 'getCases')    return json(loadCases(ss, SH_CASES_ACTIVE));
  if (p.action === 'getArchive')  return json(loadCases(ss, SH_CASES_ARCHIVE));
  if (p.action === 'getTodos')    return json(loadTodos(ss));
  if (p.action === 'getCasesAll') {
    return json(loadCases(ss, SH_CASES_ACTIVE).concat(loadCases(ss, SH_CASES_ARCHIVE)));
  }
  if (p.action === 'getBulk')     return getBulk(ss);
  if (p.action === 'getMembers')  return json({ data: loadMembers(ss) });
  if (p.action === 'getPwHashes') return json({ data: loadPwHashes(ss) });
  if (p.action === 'getFeedback')      return json({ data: loadFeedback(ss) });
  if (p.action === 'getFeeData')       return json({ data: loadFeeData(ss) });
  if (p.action === 'getCtrArchives')   return json({ data: loadCtrArchives(ss) });
  if (p.action === 'getCtrEsign')      return json({ data: loadCtrEsign(ss) });
  return json({ error: 'unknown action' });
}

// ── 전체 데이터 일괄 반환 (1회 요청으로 모든 탭 데이터 로드)
function getBulk(ss) {
  if (!ss) ss = casesSS();
  var bss        = blogSS();
  var aRes       = loadAuction(ss, SH_AUCTION);
  var maRes      = loadMyeongdo(ss, SH_MYEONGDO_A);
  var mdRes      = loadMyeongdo(ss, SH_MYEONGDO_D);
  var blogL      = loadBlogList(bss);
  var blogA      = loadBlogArchive(bss);
  return json({
    cases:           loadCases(ss, SH_CASES_ACTIVE),
    archive:         loadCases(ss, SH_CASES_ARCHIVE),
    todos:           loadTodos(ss),
    auction:         aRes.data  || [],
    myeongdoActive:  maRes.data || [],
    myeongdoDone:    mdRes.data || [],
    blogList:        blogL.data || [],
    blogArchive:     blogA.data || [],
    feeData:         loadFeeData(ss),
    ctrArchives:     loadCtrArchives(ss),
    ctrEsignArchives:loadCtrEsign(ss),
    ts:              new Date().getTime()
  });
}

// ============================================================
// 수수료 데이터 (기기 간 공유) — 시트: 수수료데이터
// 컬럼: 1:caseId  2:jsonData  3:updatedAt
// ============================================================
function loadFeeData(ss) {
  var sheet = sh(ss, SH_FEE_DATA);
  var last = sheet.getLastRow();
  if (last < 2) return {};
  var vals = sheet.getRange(2, 1, last - 1, 2).getValues();
  var result = {};
  vals.forEach(function(r) {
    if (r[0]) {
      try { result[String(r[0])] = JSON.parse(r[1]); } catch(e) {}
    }
  });
  return result;
}

function setFeeEntries(entries) {
  if (!entries || !entries.length) return json({ ok: true });
  var ss = casesSS();
  var sheet = sh(ss, SH_FEE_DATA);
  var last = sheet.getLastRow();
  var idMap = {};
  if (last >= 2) {
    var ids = sheet.getRange(2, 1, last - 1, 1).getValues();
    ids.forEach(function(r, i) { if (r[0]) idMap[String(r[0])] = i + 2; });
  }
  var now = new Date().toISOString();
  entries.forEach(function(e) {
    if (!e.id) return;
    var row = idMap[e.id];
    var jsonStr = JSON.stringify(e.data || {});
    if (row) {
      sheet.getRange(row, 2, 1, 2).setValues([[jsonStr, now]]);
    } else {
      sheet.appendRow([e.id, jsonStr, now]);
      idMap[e.id] = sheet.getLastRow();
    }
  });
  return json({ ok: true });
}

// ============================================================
// 약정서 보관 — 시트: 약정서보관 / 전자서명보관
// 컬럼: 1:id  2:jsonData  3:savedAt
// ============================================================
function loadCtrArchives(ss) {
  return loadCtrSheet(ss, SH_CTR_ARCHIVE);
}
function loadCtrEsign(ss) {
  return loadCtrSheet(ss, SH_CTR_ESIGN);
}
function loadCtrSheet(ss, shName) {
  var sheet = sh(ss, shName);
  var last = sheet.getLastRow();
  if (last < 2) return [];
  var vals = sheet.getRange(2, 1, last - 1, 2).getValues();
  var result = [];
  vals.forEach(function(r) {
    if (r[0]) {
      try { result.push(JSON.parse(r[1])); } catch(e) {}
    }
  });
  return result.reverse(); // 최신 순
}

function saveCtrArchive(data) {
  return saveCtrRow(SH_CTR_ARCHIVE, data);
}
function saveCtrEsign(data) {
  return saveCtrRow(SH_CTR_ESIGN, data);
}
function saveCtrRow(shName, data) {
  if (!data || !data.id) return json({ ok: false, error: 'no id' });
  var ss = casesSS();
  var sheet = sh(ss, shName);
  var last = sheet.getLastRow();
  if (last >= 2) {
    var ids = sheet.getRange(2, 1, last - 1, 1).getValues();
    for (var i = 0; i < ids.length; i++) {
      if (String(ids[i][0]) === String(data.id)) {
        sheet.getRange(i + 2, 2, 1, 2).setValues([[JSON.stringify(data), data.savedAt || new Date().toISOString()]]);
        return json({ ok: true });
      }
    }
  }
  sheet.appendRow([data.id, JSON.stringify(data), data.savedAt || new Date().toISOString()]);
  return json({ ok: true });
}
function deleteCtrRow(shName, id) {
  if (!id) return json({ ok: false });
  var ss = casesSS();
  var sheet = sh(ss, shName);
  var last = sheet.getLastRow();
  if (last < 2) return json({ ok: true });
  var ids = sheet.getRange(2, 1, last - 1, 1).getValues();
  for (var i = ids.length - 1; i >= 0; i--) {
    if (String(ids[i][0]) === String(id)) {
      sheet.deleteRow(i + 2);
      break;
    }
  }
  return json({ ok: true });
}

// 사건목록/종료사건 컬럼:
// 1:ID  2:상태  3:사건번호  4:주소지  5:법원  6:경매기일  7:마감요청일
// 8:시세조사담당  9:현장조사담당  10:보고서작성담당  11:기타요청  12:등록일
// 종료사건 추가 → 13:종료일
var STATUS_NORM = {
  '진행': 'ongoing', '진행중': 'ongoing', '조사중': 'ongoing',
  '조사완료': 'done', '완료': 'done',
  '보고서작성': 'report', '보고서': 'report',
  '입찰확정': 'confirmed', '확정': 'confirmed',
  '잔금납부대기': 'balance_wait', '잔금납부대기중': 'balance_wait',
  '소송': 'lawsuit',
  '기일변경': 'changed', '변경': 'changed',
  '낙찰종료': 'closed', '낙찰': 'closed', '종료': 'closed',
  '고객변심': 'cancel', '취소': 'cancel',
  '패찰': 'lost',
  '기타종료': 'drop', '기타': 'drop'
};
function normalizeStatus(raw) {
  if (!raw) return 'ongoing';
  var s = String(raw).trim();
  return STATUS_NORM[s] || s;
}

function loadCases(ss, shName) {
  var sheet   = sh(ss, shName);
  var last    = sheet.getLastRow();
  if (last < 2) return [];
  var isArc = (shName === SH_CASES_ARCHIVE);
  // cols: active=14(+manager,evictionStaff), archive=15(+manager,evictionStaff,closedAt)
  var cols  = isArc ? 15 : 14;
  var hdr   = sheet.getRange(1, 1, 1, cols).getValues()[0];
  if (!hdr[12]) sheet.getRange(1, 13).setValue('담당자');
  if (!hdr[13]) sheet.getRange(1, 14).setValue('명도담당자');
  if (isArc && !hdr[14]) sheet.getRange(1, 15).setValue('종료일');
  var vals  = sheet.getRange(2, 1, last - 1, cols).getValues();
  return vals.map(function(r) {
    return {
      id:            String(r[0]),
      status:        normalizeStatus(r[1]),
      caseNo:        String(r[2]),
      address:       String(r[3]),
      court:         String(r[4]),
      auctionDate:   r[5] ? kstDate(r[5]) : '',
      deadline:      r[6] ? kstDate(r[6]) : '',
      typeMap: {
        '시세조사':   String(r[7]  || ''),
        '현장조사':   String(r[8]  || ''),
        '보고서작성': String(r[9]  || '')
      },
      note:          String(r[10] || ''),
      manager:       String(r[12] || ''),
      evictionStaff: String(r[13] || ''),
      closedAt:      isArc && r[14] ? kstDate(r[14]) : ''
    };
  });
}

// ToDo 컬럼: 1:완료여부  2:우선순위  3:할일내용  4:담당자  5:마감일  6:상태  7:카테고리  8:메모
function loadTodos(ss) {
  var sheet = sh(ss, SH_TODOS);
  var last  = sheet.getLastRow();
  if (last < 2) return [];
  var vals = sheet.getRange(2, 1, last - 1, 8).getValues();
  return vals
    .filter(function(r) { return r[2]; })
    .map(function(r) {
      return {
        done:     r[0] === true,
        priority: String(r[1] || ''),
        text:     String(r[2]),
        manager:  String(r[3] || '')
      };
    });
}

// ============================================================
// CASES — POST
// ============================================================
function casesPost(b) {
  var ss = casesSS();
  var d  = b.data || {};
  switch (b.action) {
    case 'addCase':      return json(addCase(ss, d));
    case 'updateCase':   return json(updateCase(ss, d));
    case 'archiveCase':  return json(archiveCase(ss, d));
    case 'deleteCase':   return json(deleteCase(ss, d));
    case 'restoreCase':  return json(restoreCase(ss, d));
    case 'saveTodos':    return json(saveTodos(ss, b.data));
    case 'analyzeImage':        return json(analyzeImage(d, 'case'));
    case 'analyzeImageGuide':   return json(analyzeImage(d, 'guide'));
    case 'analyzeImageDraft':   return json(analyzeImage(d, 'draft'));
    case 'analyzeImageMember':  return json(analyzeImage(d, 'member'));
    case 'generateLocation':  return json(generateLocationAnalysis(d));
    case 'addAuction':       return json(addAuction(ss, d));
    case 'updateAuction':    return json(updateAuction(ss, d));
    case 'deleteAuction':    return json(deleteAuction(ss, d));
    case 'addMyeongdo':      return json(addMyeongdo(ss, d));
    case 'updateMyeongdo':   return json(updateMyeongdo(ss, d));
    case 'completeMyeongdo': return json(completeMyeongdo(ss, d));
    case 'deleteMyeongdo':   return json(deleteMyeongdo(ss, d));
    case 'saveMembers':      return json(saveMembersBulk(ss, b.data));
    case 'addMember':        return json(addMember(ss, d));
    case 'updateMember':     return json(updateMember(ss, d));
    case 'deleteMember':     return json(deleteMember(ss, d));
    case 'setPwHash':        return json(setPwHash(ss, d));
    case 'deletePwHash':     return json(deletePwHash(ss, d));
    case 'saveFeedback':         return json(saveFeedback(ss, d));
    case 'updateFeedbackStatus': return json(updateFeedbackStatus(ss, d));
    default:             return json({ error: 'unknown action' });
  }
}

// ============================================================
// MEMBERS — 회원관리 시트 (신규 · 20 컬럼)
// ============================================================
// 컬럼:  1:이름  2:연락처  3:이메일  4:생년월일  5:주소
//        6:담당자  7:유형  8:유입경로  9:주택보유  10:생애최초
//        11:관심물건  12:희망지역  13:목적  14:예산  15:시점
//        16:진행상황  17:응답률  18:수수료율  19:메모  20:가입일
var MEMBER_FIELDS = [
  'name','phone','email','birthdate','address',
  'staff','type','source','housing','firsthome',
  'proptype','region','purpose','budget','timeline',
  'status','responseRate','feeRate','memo','joindate'
];

function ensureMemberHeader(sheet) {
  if (sheet.getLastRow() === 0) {
    var header = ['이름','연락처','이메일','생년월일','주소',
                  '담당자','유형','유입경로','주택보유','생애최초',
                  '관심물건','희망지역','목적','예산','시점',
                  '진행상황','응답률','수수료율','메모','가입일'];
    sheet.getRange(1, 1, 1, header.length).setValues([header]).setFontWeight('bold');
    sheet.setFrozenRows(1);
  }
}

function loadMembers(ss) {
  var sheet = sh(ss, SH_MEMBERS);
  ensureMemberHeader(sheet);
  var last = sheet.getLastRow();
  if (last < 2) return [];
  var vals = sheet.getRange(2, 1, last - 1, MEMBER_FIELDS.length).getValues();
  return vals
    .filter(function(r) { return r[0]; })  // 이름 없는 행 제외
    .map(function(r) {
      var obj = { id: 'gas_' + String(r[0]) };
      MEMBER_FIELDS.forEach(function(f, i) {
        var v = r[i];
        if (f === 'birthdate' || f === 'joindate') obj[f] = v ? kstDate(v) : '';
        else obj[f] = String(v || '');
      });
      return obj;
    });
}

// 전체 덮어쓰기 (기존 MBR_syncToSheets 호환)
function saveMembersBulk(ss, members) {
  if (!Array.isArray(members)) return { error: 'data must be array' };
  var sheet = sh(ss, SH_MEMBERS);
  ensureMemberHeader(sheet);
  var last = sheet.getLastRow();
  if (members.length === 0) {
    if (last > 1) sheet.getRange(2, 1, last - 1, MEMBER_FIELDS.length).clearContent();
    return { ok: true, result: 'ok', count: 0 };
  }
  var rows = members.map(function(m) {
    return MEMBER_FIELDS.map(function(f) { return m[f] || ''; });
  });
  // 새 데이터 먼저 쓴 뒤, 초과 행만 지움 (clearContent → setValues 순서 뒤집음 → 데이터 손실 방지)
  sheet.getRange(2, 1, rows.length, MEMBER_FIELDS.length).setValues(rows);
  var newLast = sheet.getLastRow();  // setValues 후 실제 상태로 재조회
  var excess = newLast - 1 - rows.length;
  if (excess > 0) sheet.getRange(rows.length + 2, 1, excess, MEMBER_FIELDS.length).clearContent();
  return { ok: true, result: 'ok', count: rows.length };
}

function addMember(ss, m) {
  if (!m || !m.name) return { error: 'name required' };
  var sheet = sh(ss, SH_MEMBERS);
  ensureMemberHeader(sheet);
  if (!m.joindate) m.joindate = todayStr();
  var row = MEMBER_FIELDS.map(function(f) { return m[f] || ''; });
  sheet.appendRow(row);
  return { ok: true, result: 'ok', name: m.name };
}

function updateMember(ss, m) {
  if (!m || !m.name) return { error: 'name required' };
  var sheet = sh(ss, SH_MEMBERS);
  ensureMemberHeader(sheet);
  var last = sheet.getLastRow();
  if (last < 2) return addMember(ss, m);
  var names = sheet.getRange(2, 1, last - 1, 1).getValues();
  for (var i = 0; i < names.length; i++) {
    if (String(names[i][0]) === String(m.name)) {
      var row = MEMBER_FIELDS.map(function(f) { return m[f] != null ? m[f] : ''; });
      sheet.getRange(i + 2, 1, 1, MEMBER_FIELDS.length).setValues([row]);
      return { ok: true, result: 'ok', name: m.name, updated: true };
    }
  }
  return addMember(ss, m);  // 없으면 추가
}

function deleteMember(ss, m) {
  if (!m || !m.name) return { error: 'name required' };
  var sheet = sh(ss, SH_MEMBERS);
  var last = sheet.getLastRow();
  if (last < 2) return { error: 'no members' };
  var names = sheet.getRange(2, 1, last - 1, 1).getValues();
  for (var i = 0; i < names.length; i++) {
    if (String(names[i][0]) === String(m.name)) {
      sheet.deleteRow(i + 2);
      return { ok: true, result: 'ok', name: m.name, deleted: true };
    }
  }
  return { error: 'not found' };
}

// ============================================================
// PASSWORD HASH — 비번관리 시트 (신규 · 3 컬럼: 이름, 해시, 갱신시각)
// PC간 비밀번호 동기화. localStorage 대신 GAS에 저장.
// ============================================================
function ensurePwHashHeader(sheet) {
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(['이름', '비번해시', '갱신시각']);
    sheet.getRange(1, 1, 1, 3).setFontWeight('bold');
  }
}

function loadPwHashes(ss) {
  var sheet = sh(ss, SH_PWHASH);
  ensurePwHashHeader(sheet);
  var last = sheet.getLastRow();
  if (last < 2) return {};
  var vals = sheet.getRange(2, 1, last - 1, 2).getValues();
  var map = {};
  vals.forEach(function(r) {
    if (r[0]) map[String(r[0])] = String(r[1] || '');
  });
  return map;
}

function setPwHash(ss, m) {
  if (!m || !m.name || !m.hash) return { error: 'name and hash required' };
  var sheet = sh(ss, SH_PWHASH);
  ensurePwHashHeader(sheet);
  var last = sheet.getLastRow();
  if (last >= 2) {
    var names = sheet.getRange(2, 1, last - 1, 1).getValues();
    for (var i = 0; i < names.length; i++) {
      if (String(names[i][0]) === String(m.name)) {
        sheet.getRange(i + 2, 1, 1, 3).setValues([[m.name, m.hash, new Date()]]);
        return { ok: true, name: m.name, updated: true };
      }
    }
  }
  sheet.appendRow([m.name, m.hash, new Date()]);
  return { ok: true, name: m.name, added: true };
}

function deletePwHash(ss, m) {
  if (!m || !m.name) return { error: 'name required' };
  var sheet = sh(ss, SH_PWHASH);
  var last = sheet.getLastRow();
  if (last < 2) return { ok: true, name: m.name, missing: true };
  var names = sheet.getRange(2, 1, last - 1, 1).getValues();
  for (var i = 0; i < names.length; i++) {
    if (String(names[i][0]) === String(m.name)) {
      sheet.deleteRow(i + 2);
      return { ok: true, name: m.name, deleted: true };
    }
  }
  return { ok: true, name: m.name, missing: true };
}

// ============================================================
// FEEDBACK — 오류제보 시트 (신규 · 8 컬럼)
// 직원이 인트라넷에서 버그·개선 사항 텍스트+스크린샷 제보 → 시트 + Drive
// ============================================================
function ensureFeedbackHeader(sheet) {
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(['ID', '작성자', '작성일시', '카테고리', '내용', '첨부URL', '첨부파일명', '상태']);
    sheet.getRange(1, 1, 1, 8).setFontWeight('bold');
  }
}

function getOrCreateChildFolder(parent, name) {
  var iter = parent.getFoldersByName(name);
  if (iter.hasNext()) return iter.next();
  return parent.createFolder(name);
}

function loadFeedback(ss) {
  var sheet = sh(ss, SH_FEEDBACK);
  ensureFeedbackHeader(sheet);
  var last = sheet.getLastRow();
  if (last < 2) return [];
  var vals = sheet.getRange(2, 1, last - 1, 8).getValues();
  return vals.map(function(r) {
    return {
      id:       String(r[0]),
      author:   String(r[1] || ''),
      ts:       r[2] ? new Date(r[2]).toISOString() : '',
      category: String(r[3] || ''),
      text:     String(r[4] || ''),
      fileUrl:  String(r[5] || ''),
      fileName: String(r[6] || ''),
      status:   String(r[7] || 'open')
    };
  }).reverse();  // 최신순
}

function saveFeedback(ss, d) {
  if (!d || (!d.text && !d.attachmentBase64)) return { error: '내용 또는 첨부파일이 필요합니다.' };
  var sheet = sh(ss, SH_FEEDBACK);
  ensureFeedbackHeader(sheet);
  var id = Utilities.getUuid();
  var fileUrl = '';
  var fileName = '';

  if (d.attachmentBase64 && d.attachmentName) {
    try {
      var rootFolder = DriveApp.getFolderById(DRIVE_FOLDER_FEEDBACK);
      var feedbackFolder = getOrCreateChildFolder(rootFolder, '오류제보');
      var bytes = Utilities.base64Decode(d.attachmentBase64);
      var blob = Utilities.newBlob(
        bytes,
        d.attachmentMime || 'application/octet-stream',
        id + '_' + d.attachmentName
      );
      var fileObj = feedbackFolder.createFile(blob);
      fileObj.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
      fileUrl = fileObj.getUrl();
      fileName = fileObj.getName();
    } catch(e) {
      fileName = '[첨부 실패: ' + e.message + ']';
    }
  }

  sheet.appendRow([
    id,
    d.author || '',
    new Date(),
    d.category || '기타',
    d.text || '',
    fileUrl,
    fileName,
    'open'
  ]);

  // 텔레그램 전송 (ADMIN_CHAT_ID 설정 시)
  try {
    var adminChatId = prop('ADMIN_CHAT_ID');
    if (adminChatId) {
      var msg = '🐛 [제보] ' + (d.category || '기타') + '\n' +
        '───────────────\n' +
        '👤 ' + (d.author || '?') + '\n' +
        '🕐 ' + new Date().toLocaleString('ko-KR') + '\n\n' +
        (d.text ? '📝 ' + String(d.text).substring(0, 400) + '\n\n' : '') +
        (fileUrl ? '📎 ' + fileUrl : '');
      sendTelegram(adminChatId, msg.trim());
    }
  } catch(e) {}

  return { ok: true, id: id, fileUrl: fileUrl };
}

function updateFeedbackStatus(ss, d) {
  if (!d || !d.id || !d.status) return { error: 'id and status required' };
  var sheet = sh(ss, SH_FEEDBACK);
  var last = sheet.getLastRow();
  if (last < 2) return { error: 'no feedback' };
  var ids = sheet.getRange(2, 1, last - 1, 1).getValues();
  for (var i = 0; i < ids.length; i++) {
    if (String(ids[i][0]) === String(d.id)) {
      sheet.getRange(i + 2, 8).setValue(d.status);
      return { ok: true, id: d.id, status: d.status };
    }
  }
  return { error: 'not found' };
}

function addCase(ss, d) {
  var sheet  = sh(ss, SH_CASES_ACTIVE);
  var id     = Utilities.getUuid();
  var types  = d.types || [];
  var tm     = {};
  types.forEach(function(t) { if (t.manager) tm[t.type] = t.manager; });

  sheet.appendRow([
    id,
    d.status        || 'ongoing',
    d.caseNo        || '',
    d.address       || '',
    d.court         || '',
    d.auctionDate   ? new Date(d.auctionDate) : '',
    d.deadline      ? new Date(d.deadline)    : '',
    tm['시세조사']    || '',
    tm['현장조사']    || '',
    tm['보고서작성']  || '',
    d.note          || '',
    new Date(),
    d.manager       || '',
    d.evictionStaff || ''
  ]);
  return { ok: true, id: id };
}

function updateCase(ss, d) {
  var activeSheet  = sh(ss, SH_CASES_ACTIVE);
  var archiveSheet = sh(ss, SH_CASES_ARCHIVE);
  var rowInfo = findRowById(activeSheet, d.id, 14);
  var sheet;
  if (rowInfo) {
    sheet = activeSheet;
  } else {
    rowInfo = findRowById(archiveSheet, d.id, 15);
    sheet   = archiveSheet;
  }
  if (!rowInfo) return { ok: false, error: '사건을 찾을 수 없습니다.' };

  var types = d.types || [];
  var tm    = {};
  types.forEach(function(t) { if (t.manager) tm[t.type] = t.manager; });

  var r = rowInfo.row;
  if (d.status)                    sheet.getRange(r,  2).setValue(d.status);
  if (d.caseNo)                    sheet.getRange(r,  3).setValue(d.caseNo);
  if (d.address)                   sheet.getRange(r,  4).setValue(d.address);
  if (d.court)                     sheet.getRange(r,  5).setValue(d.court);
  if (d.auctionDate !== undefined) sheet.getRange(r,  6).setValue(d.auctionDate ? new Date(d.auctionDate) : '');
  if (d.deadline    !== undefined) sheet.getRange(r,  7).setValue(d.deadline    ? new Date(d.deadline)    : '');
  if (types.length) {
    sheet.getRange(r,  8).setValue(tm['시세조사']   || '');
    sheet.getRange(r,  9).setValue(tm['현장조사']   || '');
    sheet.getRange(r, 10).setValue(tm['보고서작성'] || '');
  }
  if (d.note          !== undefined) sheet.getRange(r, 11).setValue(d.note);
  if (d.manager       !== undefined) sheet.getRange(r, 13).setValue(d.manager);
  if (d.evictionStaff !== undefined) sheet.getRange(r, 14).setValue(d.evictionStaff);
  return { ok: true };
}

function archiveCase(ss, d) {
  var active  = sh(ss, SH_CASES_ACTIVE);
  var archive = sh(ss, SH_CASES_ARCHIVE);
  var rowInfo = findRowById(active, d.id, 14);
  if (!rowInfo) return { ok: false, error: '사건을 찾을 수 없습니다.' };

  var vals = rowInfo.vals.slice();
  vals[1]  = d.status;       // 종료 사유로 상태 업데이트
  vals.push(new Date());     // col 15: 종료일
  archive.appendRow(vals);
  active.deleteRow(rowInfo.row);
  return { ok: true };
}

function deleteCase(ss, d) {
  var active  = sh(ss, SH_CASES_ACTIVE);
  var archive = sh(ss, SH_CASES_ARCHIVE);
  var rowInfo = findRowById(active, d.id, 14) || findRowById(archive, d.id, 15);
  if (!rowInfo) return { ok: false, error: '사건을 찾을 수 없습니다.' };
  rowInfo.sheet.deleteRow(rowInfo.row);
  return { ok: true };
}

function restoreCase(ss, d) {
  var active  = sh(ss, SH_CASES_ACTIVE);
  var archive = sh(ss, SH_CASES_ARCHIVE);
  var rowInfo = findRowById(archive, d.id, 15);
  if (!rowInfo) return { ok: false, error: '사건을 찾을 수 없습니다.' };

  var vals = rowInfo.vals.slice(0, 14);  // strip closedAt (col 15)
  vals[1]  = 'ongoing';
  active.appendRow(vals);
  archive.deleteRow(rowInfo.row);
  return { ok: true };
}

function saveTodos(ss, todos) {
  if (!Array.isArray(todos)) return { ok: false };
  var sheet = sh(ss, SH_TODOS);
  // 헤더 보존, 데이터 행만 초기화
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1,1,1,8).setValues([['완료여부','우선순위','할일내용','담당자','마감일','상태','카테고리','메모']]);
  }
  var last = sheet.getLastRow();
  if (last > 1) sheet.getRange(2, 1, last - 1, 8).clearContent();

  var rows = todos
    .filter(function(t) { return t.text && t.text.trim(); })
    .map(function(t) {
      return [t.done||false, t.priority||'', t.text, t.manager||'', '', t.done?'완료':'미완료', '', ''];
    });
  if (rows.length) sheet.getRange(2, 1, rows.length, 8).setValues(rows);
  return { ok: true };
}

// ============================================================
// AI 이미지 분석 (cases/blog 공용)
// ============================================================
function analyzeImage(d, mode) {
  var key = prop('ANTHROPIC_KEY');
  if (!key) return { error: 'ANTHROPIC_KEY가 스크립트 속성에 설정되지 않았습니다.' };

  var prompt = (mode === 'member')
    ? '고객 상담 질문지 또는 고객 정보 이미지를 분석해서 아래 JSON 형식으로만 응답해. 코드블록 없이 순수 JSON만. 없는 항목은 빈 문자열.\n{"name":"성함(한글 2~5자)","phone":"연락처(010-XXXX-XXXX 형식)","email":"이메일주소","birthdate":"생년월일 YYYY-MM-DD(6자리면 앞2자리 00~24는 20xx, 나머지 19xx)","address":"주소(도로명 기준 전체)","housing":"주택보유현황(무주택/1주택/2주택 이상 중 하나만)","firsthome":"생애최초주택구입해당여부(해당/미해당 중 하나만)","proptype":"관심물건종류(아파트/빌라/오피스텔/상가/토지/빌딩/다가구/공장 중 하나)","region":"관심지역(서울/경기/인천 중 해당하는 것, 여러 개면 \' / \'로 구분)","purpose":"투자목적(실거주/투자/임대 중 해당, 여러 개면 \' / \'로 구분)","budget":"예산(예:5억, 10억 2000만)","timeline":"투자시기(1개월 내/3개월 내/6개월 내/미정 중 하나)","source":"유입경로(블로그/지인소개/SNS/재상담 중 하나)"}'
    : (mode === 'blog')
    ? '한국 법원경매 정보 화면 이미지야. 아래 규칙대로 JSON만 응답해. 코드블록 없이 순수 JSON만. 없으면 빈 문자열.\n\n추출 규칙:\n- caseNum: 화면 상단 굵은 제목의 사건번호 (예:2025타경51224)\n- court: 상단 "●" 뒤 법원명에서 시/군 단위 이름만 (예:서울동부, 서울중앙, 수원, 의정부, 인천 등. "지방법원","본원","지원" 제거)\n- date: "매각기일" 옆 날짜 YYYY-MM-DD (연도 반드시 포함, 2026년이면 2026 기재)\n- round: 표에서 현재 굵게 표시된 차수 숫자만 (예:1)\n- name: "소 재 지" 또는 "새 주소"에서 건물명·단지명만 (동·층·호 제외, 예:한남하이츠빌라)\n- gu: 소재지의 구·군 이름 (예:성동구)\n- dong: 소재지의 동번호+호수 (예:가동 2층 204호)\n- floor: 층수 숫자만\n- size: "건물면적" 값 그대로 (예:164.08㎡(49.63평))\n- type: "물건종별" 칸의 텍스트를 아래 변환표대로 매핑해서 출력 (여러 개면 첫 번째만):\n  다세대주택→빌라, 다세대→빌라, 빌라→빌라\n  아파트→아파트\n  오피스텔→오피스텔\n  다가구주택→다가구, 다가구→다가구\n  근린시설→근린시설, 근린생활시설→근린시설, 상가→근린시설\n  공장→공장, 창고→공장\n  토지→토지, 대지→토지, 임야→토지\n  위 매핑에 없으면 원문 그대로 출력\n- appraisal: "감정 가" 원화금액을 억 단위 소수점 (예:21.7)\n- minbid: "최 저 가" 원화금액을 억 단위 소수점 (예:21.7)\n- title1,title2,title3: 이 물건을 검색할 사람이 유입될 블로그 제목 3개 (구·단지명·경매 키워드 포함, 40자 이내)\n\n{"caseNum":"","court":"","date":"","round":"","name":"","gu":"","dong":"","floor":"","size":"","type":"","appraisal":"","minbid":"","title1":"","title2":"","title3":""}'
    : (mode === 'guide')
    ? '경매 입찰 관련 이미지를 분석해서 아래 JSON 형식으로만 응답해. 코드블록 없이 순수 JSON만. 없는 항목은 빈 문자열로.\n{"court":"법원명(예:서울중앙지방법원)","auctionDate":"YYYY-MM-DD","auctionTime":"HH:MM(24시간제,없으면빈값)","room":"법정호수(예:207호 법정,없으면빈값)","caseNo":"사건번호","address":"물건소재지(간략히)","minPrice":"최저매각가격숫자만(콤마없이,없으면빈값)"}'
    : (mode === 'draft')
    ? '이 법원 경매 화면을 분석해서 아래 JSON 형식으로만 응답해. 코드블록 없이 순수 JSON만. 없는 항목은 빈 문자열.\n{"caseNum":"사건번호(예:2025타경5151)","court":"법원 지원명만(예:고양)","auctionDate":"매각기일 YYYY-MM-DD","buildingName":"단지명만(동·층·호 제외, 예:디엠씨자이더리버)","gu":"구이름(예:덕양구)","dong":"동번호(예:104동)","floor":"층수(예:18층)","area":"건물면적(예:84.996㎡(25.71평))","propertyType":"물건종별(아파트/빌라/오피스텔/다가구/토지/공장/근린시설 중 하나)","appraisal":"감정가 억단위 숫자만(예:12.5)","minBid":"최저입찰가 억단위 숫자만(예:8.75)","round":"현재진행차수 숫자만(예:2)"}'
    : '경매 공고 이미지를 분석해서 아래 JSON 형식으로만 응답해. 코드블록 없이 순수 JSON만.\n{"caseNo":"사건번호","address":"주소 또는 아파트명+동호수","auctionDate":"YYYY-MM-DD","court":"법원명"}';

  var mType = (d.mediaType || d.mimeType || 'image/jpeg').toLowerCase();
  var isPdf = mType.indexOf('pdf') !== -1;
  var fileBlock = isPdf
    ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: d.base64 || d.imageBase64 } }
    : { type: 'image',    source: { type: 'base64', media_type: mType,              data: d.base64 || d.imageBase64 } };

  var payload = {
    model: 'claude-sonnet-4-6',
    max_tokens: 800,
    messages: [{
      role: 'user',
      content: [ fileBlock, { type: 'text', text: prompt } ]
    }]
  };

  try {
    var res  = UrlFetchApp.fetch('https://api.anthropic.com/v1/messages', {
      method: 'post',
      headers: {
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json'
      },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    });
    var code = res.getResponseCode();
    var api  = JSON.parse(res.getContentText());
    if (code !== 200) {
      return { error: 'Claude API 오류: ' + (api.error && api.error.message || code) };
    }
    var text  = api.content[0].text;
    var match = text.match(/\{[\s\S]*?\}/);
    if (!match) return { error: 'JSON 파싱 실패' };
    return { ok: true, data: JSON.parse(match[0]) };
  } catch(e) {
    var msg = e.message || '';
    if (msg.indexOf('대역폭') !== -1 || msg.indexOf('bandwidth') !== -1 || msg.indexOf('quota') !== -1) {
      return { error: '이미지가 너무 큽니다. 화면 캡처 후 다시 시도해주세요.' };
    }
    return { error: '분석 오류: ' + msg };
  }
}

// ============================================================
// 입지 분석 AI 생성
// ============================================================
function generateLocationAnalysis(d) {
  var key = prop('ANTHROPIC_KEY');
  if (!key) return { error: 'ANTHROPIC_KEY가 스크립트 속성에 설정되지 않았습니다.' };

  var locationStr = [d.city || '서울', d.gu || '', d.buildingName || d.name || ''].filter(Boolean).join(' ');
  var propType    = d.propertyType || d.type || '아파트';

  var buildingName = d.buildingName || d.name || '';
  var prompt =
    '한국 부동산 블로그에 올릴 입지 소개 글을 써줘. 읽는 사람이 실제로 유용하다고 느끼게.\n\n' +
    '물건: ' + locationStr + '\n' +
    '유형: ' + propType + '\n\n' +
    '아래 4가지를 자연스러운 말투로 350~450자 안에 담아줘. 각 항목을 별도 제목으로 나누지 말고 이어서 써줘.\n' +
    '- 교통: 실제 지하철역명·노선·도보거리, 수도권 주요 거점 이동 시간\n' +
    '- 학군: 배정 학교명, 학원가 분위기\n' +
    '- 주변 시설: 마트·병원·공원·상권 중 실제 시설명 포함\n' +
    '- 투자 포인트: 개발 호재, 재개발·재건축, 교통 호재 등 실질적인 내용\n\n' +
    (buildingName ? '단지명 "' + buildingName + '"을 한두 번 자연스럽게 넣어줘.\n' : '') +
    '확실하지 않은 정보는 쓰지 마. "~로 알려져 있습니다" "~가 우수합니다" 같은 AI 투 표현도 피해줘.';

  var payload = {
    model: 'claude-sonnet-4-6',
    max_tokens: 1000,
    messages: [{ role: 'user', content: prompt }]
  };

  try {
    var res  = UrlFetchApp.fetch('https://api.anthropic.com/v1/messages', {
      method: 'post',
      headers: {
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json'
      },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    });
    var code = res.getResponseCode();
    var api  = JSON.parse(res.getContentText());
    if (code !== 200) return { error: 'Claude API 오류: ' + (api.error && api.error.message || code) };
    return { ok: true, data: { location: api.content[0].text.trim() } };
  } catch(e) {
    return { error: '입지분석 오류: ' + e.message };
  }
}

// ============================================================
// BLOG — GET
// ============================================================
function blogGet(p) {
  var ss = blogSS();
  if (p.action === 'list')          return json(loadBlogList(ss));
  if (p.action === 'getArchive')    return json(loadBlogArchive(ss));
  if (p.action === 'check')         return json(blogCheck(ss, p));
  if (p.action === 'updateStatus')  return json(blogUpdateStatus(ss, p));
  if (p.action === 'add')           return json(blogAdd(ss, p));
  if (p.action === 'delete')        return json(blogDelete(ss, p));
  return json({ error: 'unknown blog action' });
}

function loadBlogList(ss) {
  var sheet = sh(ss, SH_BLOG_ACTIVE);
  var last  = sheet.getLastRow();
  if (last < 2) return { success: true, data: [] };
  var cols = Math.max(sheet.getLastColumn(), 17);
  var vals = sheet.getRange(2, 1, last - 1, cols).getValues();
  var disp = sheet.getRange(2, 1, last - 1, cols).getDisplayValues();
  return {
    success: true,
    data: vals.map(function(r, i) {
      return {
        caseNum:     String(r[0]),  name:        String(r[1]),
        date:        r[2] ? kstDate(r[2]) : '',   round:       String(r[3]).replace(/차$/, ''),
        daysLeft:    disp[i][4],
        blogA:  r[5],  blogADate:  r[6]  instanceof Date ? kstDate(r[6])  : (disp[i][6]  || ''),
        blogB:  r[7],  blogBDate:  r[8]  instanceof Date ? kstDate(r[8])  : (disp[i][8]  || ''),
        blogC:  r[9],  blogCDate:  r[10] instanceof Date ? kstDate(r[10]) : (disp[i][10] || ''),
        blogD:  r[11], blogDDate:  r[12] instanceof Date ? kstDate(r[12]) : (disp[i][12] || ''),
        keyword: r[13], keywordDate: r[14] instanceof Date ? kstDate(r[14]) : (disp[i][14] || ''),
        titles: String(r[15] || ''),
        status: String(r[16] || '정상')
      };
    })
  };
}

function loadBlogArchive(ss) {
  var sheet = sh(ss, SH_BLOG_ARCHIVE);
  var last  = sheet.getLastRow();
  if (last < 2) return { success: true, data: [] };
  var vals = sheet.getRange(2, 1, last - 1, 17).getValues();
  var disp = sheet.getRange(2, 1, last - 1, 17).getDisplayValues();
  return {
    success: true,
    data: vals.map(function(r, i) {
      return {
        caseNum: String(r[0]),  name:   String(r[1]),
        date:    disp[i][2],    round:  String(r[3]),
        blogA:  r[5],  blogADate:  r[6]  instanceof Date ? kstDate(r[6])  : (disp[i][6]  || ''),
        blogB:  r[7],  blogBDate:  r[8]  instanceof Date ? kstDate(r[8])  : (disp[i][8]  || ''),
        blogC:  r[9],  blogCDate:  r[10] instanceof Date ? kstDate(r[10]) : (disp[i][10] || ''),
        blogD:  r[11], blogDDate:  r[12] instanceof Date ? kstDate(r[12]) : (disp[i][12] || ''),
        keyword: r[13], keywordDate: r[14] instanceof Date ? kstDate(r[14]) : (disp[i][14] || ''),
        titles:     String(r[15] || ''),
        archivedAt: disp[i][16]
      };
    })
  };
}

function blogCheck(ss, p) {
  var colMap  = { A: 6, B: 8, C: 10, D: 12, K: 14 };
  var col     = colMap[p.blog];
  if (!col) return { success: false, message: '잘못된 블로그 코드' };
  var sheet   = sh(ss, SH_BLOG_ACTIVE);
  var last    = sheet.getLastRow();
  var checked = (p.checked === 'true');
  var target  = String(p.round).replace(/차$/, '') + '차';

  for (var i = 2; i <= last; i++) {
    if (String(sheet.getRange(i,1).getValue()) === p.caseNum &&
        String(sheet.getRange(i,4).getValue()) === target) {
      sheet.getRange(i, col).setValue(checked);
      if (checked) {
        var ds = shortDate();
        sheet.getRange(i, col+1).setValue(ds)
          .setFontColor('#276221').setFontSize(10).setHorizontalAlignment('center').setFontWeight('bold');
        sheet.getRange(i, col).setBackground('#c6efce');
      } else {
        sheet.getRange(i, col+1).setValue('');
        var bg = (i%2===0) ? '#f8f9ff' : '#ffffff';
        sheet.getRange(i, col).setBackground(col === 14 ? (i%2===0 ? '#edf7f2' : '#f0faf5') : bg);
        sheet.getRange(i, col+1).setFontColor('#000000').setFontWeight('normal');
      }
      updateBlogStats(ss);
      return { success: true };
    }
  }
  return { success: false, message: '물건을 찾을 수 없습니다.' };
}

function blogUpdateStatus(ss, p) {
  var allowed = ['정상', '취하', '매각기일변경', '정지'];
  if (allowed.indexOf(p.status) === -1) return { success: false, message: '잘못된 상태값' };
  var sheet  = sh(ss, SH_BLOG_ACTIVE);
  var last   = sheet.getLastRow();
  var target = String(p.round).replace(/차$/, '') + '차';
  var bgMap  = { '취하': '#fce8e8', '매각기일변경': '#fef9e7', '정지': '#f5f5f5' };

  for (var i = 2; i <= last; i++) {
    if (String(sheet.getRange(i,1).getValue()) === p.caseNum &&
        String(sheet.getRange(i,4).getValue()) === target) {
      var cell = sheet.getRange(i, 17);
      cell.setValue(p.status);
      if (p.status !== '정상') {
        cell.setBackground(bgMap[p.status]).setFontColor('#c0392b').setFontWeight('bold').setHorizontalAlignment('center');
      } else {
        var bg = (i%2===0) ? '#f8f9ff' : '#ffffff';
        cell.setBackground(bg).setFontColor('#1a1a2e').setFontWeight('normal').setHorizontalAlignment('center');
      }
      return { success: true };
    }
  }
  return { success: false, message: '물건을 찾을 수 없습니다.' };
}

function blogAdd(ss, p) {
  var sheet  = sh(ss, SH_BLOG_ACTIVE);
  if (sheet.getLastRow() === 0) setupBlogMainSheet(sheet);
  var last   = sheet.getLastRow();
  var target = p.round + '차';

  for (var i = 2; i <= last; i++) {
    if (sheet.getRange(i,1).getValue() == p.caseNum && sheet.getRange(i,4).getValue() == target) {
      return { success: false, duplicate: true, message: p.caseNum + ' ' + target + '는 이미 등록된 물건입니다!' };
    }
  }
  var row = sheet.getLastRow() + 1;
  sheet.getRange(row, 1).setValue(p.caseNum);
  sheet.getRange(row, 2).setValue(String(p.name || ''));
  sheet.getRange(row, 3).setValue(p.date);
  sheet.getRange(row, 4).setValue(target);
  sheet.getRange(row, 5).setFormula('=IF(C'+row+'="","",IF(C'+row+'<TODAY(),"종료","D-"&(C'+row+'-TODAY())))');
  [6, 8, 10, 12].forEach(function(c) {
    sheet.getRange(row, c).insertCheckboxes().setValue(false);
    sheet.getRange(row, c+1).setValue('');
  });
  sheet.getRange(row, 14).insertCheckboxes().setValue(false);
  sheet.getRange(row, 15).setValue('');
  sheet.getRange(row, 16).setValue(String(p.keywords || ''));
  sheet.getRange(row, 17).setValue('정상');

  styleBlogRows(sheet);
  sortBlogByDate(sheet);
  moveExpiredBlogItems(ss);
  updateBlogStats(ss);
  return { success: true, message: '추가 완료!' };
}

function blogDelete(ss, p) {
  var sheet    = sh(ss, SH_BLOG_ACTIVE);
  var last     = sheet.getLastRow();
  var roundKey = String(p.round).replace(/차$/, '');
  for (var i = 2; i <= last; i++) {
    var cn = String(sheet.getRange(i, 1).getValue());
    var rd = String(sheet.getRange(i, 4).getValue()).replace(/차$/, '');
    if (cn === String(p.caseNum) && rd === roundKey) {
      sheet.deleteRow(i);
      updateBlogStats(ss);
      return { success: true };
    }
  }
  return { success: false, error: '항목을 찾을 수 없습니다.' };
}

// ============================================================
// BLOG — POST
// ============================================================
function blogPost(b) {
  if (b.action === 'analyze') return json(analyzeImage(b, 'blog'));
  if (b.action === 'add')     return json(blogAddJson(blogSS(), b));
  return json({ error: 'unknown blog post action' });
}

// POST JSON 전용 blogAdd — URL 디코딩 불필요
function blogAddJson(ss, b) {
  var sheet  = sh(ss, SH_BLOG_ACTIVE);
  if (sheet.getLastRow() === 0) setupBlogMainSheet(sheet);
  var last   = sheet.getLastRow();
  var target = String(b.round) + '차';
  for (var i = 2; i <= last; i++) {
    if (sheet.getRange(i,1).getValue() == b.caseNum && sheet.getRange(i,4).getValue() == target) {
      return { success: false, duplicate: true, message: b.caseNum + ' ' + target + '는 이미 등록된 물건입니다!' };
    }
  }
  var row = sheet.getLastRow() + 1;
  sheet.getRange(row, 1).setValue(b.caseNum);
  sheet.getRange(row, 2).setValue(b.name || '');
  sheet.getRange(row, 3).setValue(b.date);
  sheet.getRange(row, 4).setValue(target);
  sheet.getRange(row, 5).setFormula('=IF(C'+row+'="","",IF(C'+row+'<TODAY(),"종료","D-"&(C'+row+'-TODAY())))');
  [6, 8, 10, 12].forEach(function(c) {
    sheet.getRange(row, c).insertCheckboxes().setValue(false);
    sheet.getRange(row, c+1).setValue('');
  });
  sheet.getRange(row, 14).insertCheckboxes().setValue(false);
  sheet.getRange(row, 15).setValue('');
  sheet.getRange(row, 16).setValue(b.keywords || '');
  sheet.getRange(row, 17).setValue('정상');
  return { success: true, message: '추가 완료!' };
}

// ============================================================
// TELEGRAM
// ============================================================
function handleTelegram(body) {
  var msg = body.message;
  if (!msg) return;
  var chatId = msg.chat.id;
  var text   = msg.text || '';

  if (msg.photo) { handleAuctionPhoto(msg, chatId); return; }
  if      (text.startsWith('/일정'))   handleSchedule(text, chatId);
  else if (text.startsWith('/업무'))   handleTask(text, chatId);
  else if (text.startsWith('/조회'))   handleSearch(text, chatId);
  else if (text.startsWith('/현황'))   handleStatusMsg(chatId);
  else if (text.startsWith('/도움말') || text === '/start') {
    sendTelegram(chatId,
      '📋 더핀 경매 관리봇\n\n' +
      '📸 사진 전송 → 경매정보 자동 추출 + 시트 저장\n' +
      '/조회 [사건번호] → 물건 검색\n' +
      '/일정 [날짜] [법원] [시간] → 캘린더 등록\n' +
      '/업무 [내용] → ToDo 등록\n' +
      '/현황 → 전체 진행현황 요약\n' +
      '/도움말 → 명령어 목록'
    );
  }
}

function handleAuctionPhoto(msg, chatId) {
  sendTelegram(chatId, '📸 경매물건 사진 분석 중...');
  try {
    var token   = prop('TELEGRAM_TOKEN');
    var fileId  = msg.photo[msg.photo.length - 1].file_id;
    var fileRes = UrlFetchApp.fetch('https://api.telegram.org/bot' + token + '/getFile?file_id=' + fileId);
    var path    = JSON.parse(fileRes.getContentText()).result.file_path;
    var imgUrl  = 'https://api.telegram.org/file/bot' + token + '/' + path;
    var imgData = UrlFetchApp.fetch(imgUrl);
    var base64  = Utilities.base64Encode(imgData.getContent());

    var result = analyzeImage({ base64: base64, mediaType: 'image/jpeg' }, 'blog');
    if (!result.ok) throw new Error(result.error);

    var d = result.data;
    // 블로그 시트에 저장
    blogAdd(blogSS(), {
      caseNum:  d.caseNum  || '',
      name:     d.name     || '',
      date:     d.date     || '',
      round:    d.round    || '1',
      keywords: d.title1   || ''
    });
    sendTelegram(chatId,
      '✅ 저장 완료!\n\n' +
      '📌 사건번호: ' + (d.caseNum  || '—') + '\n' +
      '🏠 물건내용: ' + (d.name     || '—') + '\n' +
      '📅 매각기일: ' + (d.date     || '—') + '\n' +
      '💰 최저가:   ' + (d.minPrice || '—')
    );
  } catch(e) {
    sendTelegram(chatId, '❌ 분석 실패: ' + e.message);
  }
}

function handleSchedule(text, chatId) {
  var parts = text.replace('/일정 ', '').split(' ');
  if (parts.length < 2) { sendTelegram(chatId, '형식: /일정 2025-05-01 수원지법 10:00'); return; }
  var start = new Date(parts[0] + 'T' + (parts[2] || '10:00') + ':00');
  var end   = new Date(start.getTime() + 3600000);
  CalendarApp.getDefaultCalendar().createEvent('경매 — ' + parts[1], start, end, { description: text });
  sendTelegram(chatId, '📅 캘린더 등록 완료!\n' + parts[0] + ' ' + (parts[2]||'10:00') + ' | ' + parts[1]);
}

function handleTask(text, chatId) {
  var task  = text.replace('/업무 ', '').trim();
  var ss    = casesSS();
  var sheet = sh(ss, SH_TODOS);
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1,1,1,8).setValues([['완료여부','우선순위','할일내용','담당자','마감일','상태','카테고리','메모']]);
  }
  sheet.appendRow([false, '중간', task, '', '', '미완료', '', '']);
  sendTelegram(chatId, '📝 업무 등록!\n' + task);
}

function handleSearch(text, chatId) {
  var keyword = text.replace('/조회 ', '').trim();
  var ss      = casesSS();
  var data    = sh(ss, SH_CASES_ACTIVE).getDataRange().getValues();
  var found   = data.slice(1).filter(function(r) {
    return r.some(function(c) { return String(c).includes(keyword); });
  });
  if (!found.length) { sendTelegram(chatId, '"' + keyword + '" 검색 결과 없음'); return; }
  var msg = '🔍 검색결과 (' + found.length + '건)\n\n';
  found.slice(0, 5).forEach(function(r) {
    msg += '📌 ' + r[2] + ' | ' + r[3] + '\n📅 ' + (r[5]||'') + '\n\n';
  });
  sendTelegram(chatId, msg);
}

function handleStatusMsg(chatId) {
  var ss   = casesSS();
  var bss  = blogSS();
  var mCnt = Math.max(sh(ss,  SH_CASES_ACTIVE).getLastRow()  - 1, 0);
  var aCnt = Math.max(sh(ss,  SH_CASES_ARCHIVE).getLastRow() - 1, 0);
  var bCnt = Math.max(sh(bss, SH_BLOG_ACTIVE).getLastRow()   - 1, 0);
  sendTelegram(chatId,
    '📊 더핀 현황\n\n' +
    '📋 진행중 사건: ' + mCnt + '건\n' +
    '📦 종료 사건: '  + aCnt + '건\n' +
    '📝 블로그 진행중: ' + bCnt + '건'
  );
}

function sendTelegram(chatId, text) {
  var token = prop('TELEGRAM_TOKEN');
  if (!token) { Logger.log('TELEGRAM_TOKEN not set'); return; }
  UrlFetchApp.fetch('https://api.telegram.org/bot' + token + '/sendMessage', {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify({ chat_id: chatId, text: text }),
    muteHttpExceptions: true
  });
}

// ============================================================
// D-7 / D-3 / D-1 경매기일 알림 스케줄러
// ★ 설정 방법:
//   Apps Script 편집기 → 트리거(⏰) → 트리거 추가
//   함수: checkAuctionReminders / 이벤트 소스: 시간 기반 / 매일 오전 9시
// ============================================================
function checkAuctionReminders() {
  var chatId = prop('ADMIN_CHAT_ID');
  if (!chatId) { Logger.log('ADMIN_CHAT_ID not set — skipping reminders'); return; }

  var ss = casesSS();
  var todayMs = new Date(todayStr()).getTime();
  var REMIND_DAYS = [7, 3, 1];
  var ACTIVE_STATUS = ['ongoing','done','report','confirmed','balance_wait','lawsuit'];

  var cases = loadCases(ss, SH_CASES_ACTIVE);
  var msgs = [];

  cases.forEach(function(c) {
    if (!ACTIVE_STATUS.includes(c.status)) return;
    if (!c.auctionDate) return;
    var aMs = new Date(c.auctionDate).getTime();
    var diff = Math.round((aMs - todayMs) / 86400000);
    if (REMIND_DAYS.indexOf(diff) === -1) return;

    var typeInfo = Object.entries(c.typeMap || {})
      .filter(function(e) { return e[1]; })
      .map(function(e) { return e[0] + ':' + e[1]; })
      .join(' / ');

    msgs.push(
      '📅 D-' + diff + ' 경매기일 알림\n' +
      '사건번호: ' + (c.caseNo || '—') + '\n' +
      '법원: ' + (c.court || '—') + '\n' +
      '주소: ' + (c.address || '—') + '\n' +
      '경매기일: ' + c.auctionDate + '\n' +
      (typeInfo ? '담당: ' + typeInfo : '') +
      (c.note ? '\n메모: ' + c.note : '')
    );
  });

  // 마감요청일 D-1 알림
  cases.forEach(function(c) {
    if (!ACTIVE_STATUS.includes(c.status)) return;
    if (!c.deadline) return;
    var dMs = new Date(c.deadline).getTime();
    var diff = Math.round((dMs - todayMs) / 86400000);
    if (diff !== 1) return;
    msgs.push(
      '⚠️ 마감 D-1 알림\n' +
      '사건번호: ' + (c.caseNo || '—') + '\n' +
      '주소: ' + (c.address || '—') + '\n' +
      '마감요청일: ' + c.deadline
    );
  });

  if (msgs.length === 0) {
    Logger.log('오늘 알림 없음 (' + todayStr() + ')');
    return;
  }

  msgs.forEach(function(m) { sendTelegram(chatId, m); });
  Logger.log('알림 발송 완료: ' + msgs.length + '건');
}

// 배포 후 웹훅 URL을 이 함수에 실행 (1회)
function setWebhook() {
  var token      = prop('TELEGRAM_TOKEN');
  var webhookUrl = '배포된_GAS_URL_입력'; // ← 배포 후 실제 URL로 교체
  var res = UrlFetchApp.fetch(
    'https://api.telegram.org/bot' + token + '/setWebhook?url=' + encodeURIComponent(webhookUrl)
  );
  Logger.log(res.getContentText());
}

// ============================================================
// BLOG — 시트 유틸리티
// ============================================================

// 행 ID 탐색 헬퍼
function findRowById(sheet, id, cols) {
  var last = sheet.getLastRow();
  if (last < 2) return null;
  var vals = sheet.getRange(2, 1, last - 1, cols).getValues();
  for (var i = 0; i < vals.length; i++) {
    if (String(vals[i][0]) === String(id)) {
      return { row: i + 2, vals: vals[i], sheet: sheet };
    }
  }
  return null;
}

function moveExpiredBlogItems(ss) {
  var main    = sh(ss, SH_BLOG_ACTIVE);
  var archive = sh(ss, SH_BLOG_ARCHIVE);
  if (archive.getLastRow() === 0) setupBlogArchiveSheet(archive);

  for (var i = main.getLastRow(); i >= 2; i--) {
    if (main.getRange(i, 5).getDisplayValue() === '종료') {
      var rowData = main.getRange(i, 1, 1, 17).getValues()[0];
      rowData[16] = new Date().toLocaleDateString('ko-KR');
      archive.appendRow(rowData);
      styleArchiveRow(archive, archive.getLastRow());
      main.deleteRow(i);
    }
  }
  if (main.getLastRow() > 1) styleBlogRows(main);
}

function updateBlogStats(ss) {
  var main    = sh(ss, SH_BLOG_ACTIVE);
  var archive = sh(ss, SH_BLOG_ARCHIVE);
  var stats   = sh(ss, SH_BLOG_STATS);
  stats.clear();
  setupStatsSheet(stats, main, archive);
}

function setupBlogMainSheet(sheet) {
  var h = ['사건번호','물건내용','매각기일','차수','잔여일수',
           '블로그A(자스크)','작성일','블로그B(더퀸)','작성일',
           '블로그C(인스톨)','작성일','블로그D(연예인)','작성일',
           '키워드홍보','등록일','추천 키워드/제목','상태'];
  sheet.getRange(1,1,1,17).setValues([h])
    .setBackground('#1a1a2e').setFontColor('#ffffff')
    .setFontWeight('bold').setFontSize(10)
    .setHorizontalAlignment('center').setVerticalAlignment('middle');
  sheet.setRowHeight(1, 40);
  [[1,120],[2,200],[3,90],[4,60],[5,75],[6,90],[7,90],[8,90],[9,90],
   [10,90],[11,90],[12,90],[13,90],[14,90],[15,90],[16,300],[17,90]]
    .forEach(function(p){ sheet.setColumnWidth(p[0], p[1]); });
  sheet.getRange('C:C').setNumberFormat('yy.M.d');
  sheet.setFrozenRows(1); sheet.setFrozenColumns(2); sheet.setTabColor('#185FA5');
}

function setupBlogArchiveSheet(sheet) {
  var h = ['사건번호','물건내용','매각기일','차수','잔여일수',
           '블로그A(자스크)','작성일','블로그B(더퀸)','작성일',
           '블로그C(인스톨)','작성일','블로그D(연예인)','작성일',
           '키워드홍보','등록일','추천키워드/제목','보관일자'];
  sheet.getRange(1,1,1,17).setValues([h])
    .setBackground('#444444').setFontColor('#ffffff')
    .setFontWeight('bold').setFontSize(10)
    .setHorizontalAlignment('center').setVerticalAlignment('middle');
  sheet.setRowHeight(1, 40); sheet.setFrozenRows(1); sheet.setTabColor('#888888');
}

function styleBlogRows(sheet) {
  var last = sheet.getLastRow();
  for (var i = 2; i <= last; i++) {
    var bg = (i%2===0) ? '#f8f9ff' : '#ffffff';
    sheet.setRowHeight(i, 50);
    sheet.getRange(i,1,1,16).setBackground(bg).setFontSize(10)
      .setVerticalAlignment('middle')
      .setBorder(false,false,true,false,false,false,'#e8e8e8',SpreadsheetApp.BorderStyle.SOLID);
    sheet.getRange(i,1).setFontWeight('bold').setFontColor('#185FA5');
    sheet.getRange(i,3).setHorizontalAlignment('center');
    sheet.getRange(i,4).setHorizontalAlignment('center');
    sheet.getRange(i,5).setHorizontalAlignment('center').setFontWeight('bold');
    [6,8,10,12,14].forEach(function(c){ sheet.getRange(i,c).setHorizontalAlignment('center'); });
    [7,9,11,13,15].forEach(function(c){
      sheet.getRange(i,c).setHorizontalAlignment('center')
        .setFontColor('#276221').setFontSize(10).setFontWeight('bold');
    });
    sheet.getRange(i,14).setBackground(bg==='#f8f9ff' ? '#edf7f2' : '#f0faf5');
    sheet.getRange(i,16).setBackground('#EEF4FF').setFontColor('#1a1a2e').setWrap(true).setVerticalAlignment('top');
  }
}

function sortBlogByDate(sheet) {
  if (sheet.getLastRow() < 3) return;
  sheet.getRange(2, 1, sheet.getLastRow()-1, 17).sort({ column: 3, ascending: true });
  styleBlogRows(sheet);
}

function styleArchiveRow(sheet, row) {
  sheet.getRange(row, 1, 1, 17)
    .setBackground('#f5f5f5').setFontColor('#888888')
    .setFontSize(10).setVerticalAlignment('middle');
  sheet.setRowHeight(row, 34);
}

// ============================================================
// 통계 대시보드
// ============================================================
function setupStatsSheet(stats, main, archive) {
  stats.setTabColor('#1a1a2e');
  var now = new Date(), yr = now.getFullYear(), mo = now.getMonth() + 1;
  stats.getRange(1,1).setValue('더핀 블로그 포스팅 통계 대시보드').setFontSize(16).setFontWeight('bold').setFontColor('#1a1a2e');
  stats.getRange(2,1).setValue(yr + '년 ' + mo + '월 기준').setFontSize(11).setFontColor('#888888');

  var allData     = collectAllData(main, archive);
  var mData       = getMonthlyData(allData, yr, mo);
  var blogKeys    = ['A','B','C','D'];
  var colors      = ['#1e3a5f','#1a4731','#4a2c0a','#4a1040'];
  var daysPassed  = Math.min(now.getDate(), new Date(yr, mo, 0).getDate());

  stats.getRange(4,1).setValue('이번달 담당자별 포스팅 현황');
  stats.getRange(4,1,1,5).setBackground('#1a1a2e').setFontColor('#ffffff').setFontWeight('bold').setFontSize(11).setHorizontalAlignment('center');
  stats.getRange(5,1,1,5).setValues([['담당자','블로그','이번달 포스팅','하루 평균','완료율']]);
  stats.getRange(5,1,1,5).setBackground('#2c2c4a').setFontColor('#cccccc').setFontSize(10).setFontWeight('bold').setHorizontalAlignment('center');

  blogKeys.forEach(function(blog, idx) {
    var row   = 6 + idx;
    var cnt   = mData[blog] || 0;
    var total = allData.filter(function(d){ return d.blog === blog; }).length;
    stats.getRange(row,1,1,5).setValues([[
      BLOGGERS[blog], '블로그' + blog, cnt + '건',
      (cnt / daysPassed).toFixed(1) + '건',
      total > 0 ? Math.round(cnt / total * 100) + '%' : '0%'
    ]]);
    stats.getRange(row,1,1,5).setBackground(colors[idx]).setFontColor('#ffffff').setFontSize(11).setFontWeight('bold').setHorizontalAlignment('center');
    stats.setRowHeight(row, 40);
  });

  var totalMonth = blogKeys.reduce(function(s, b){ return s + (mData[b]||0); }, 0);
  stats.getRange(10,1).setValue('이번달 합계'); stats.getRange(10,3).setValue(totalMonth + '건');
  stats.getRange(10,1,1,5).setBackground('#185FA5').setFontColor('#ffffff').setFontWeight('bold').setFontSize(11).setHorizontalAlignment('center');
  stats.setRowHeight(10, 40);

  // 최근 6개월 추이
  stats.getRange(12,1).setValue('최근 6개월 포스팅 추이');
  stats.getRange(12,1,1,7).setBackground('#1a1a2e').setFontColor('#ffffff').setFontWeight('bold').setFontSize(11).setHorizontalAlignment('center');
  var mHeaders = ['담당자'];
  for (var m = 5; m >= 0; m--) {
    var d = new Date(yr, mo - 1 - m, 1);
    mHeaders.push(d.getFullYear() + '.' + (d.getMonth()+1) + '월');
  }
  stats.getRange(13,1,1,7).setValues([mHeaders]);
  stats.getRange(13,1,1,7).setBackground('#2c2c4a').setFontColor('#cccccc').setFontSize(10).setFontWeight('bold').setHorizontalAlignment('center');

  blogKeys.forEach(function(blog, idx) {
    var row  = 14 + idx;
    var vals = [BLOGGERS[blog]];
    for (var m = 5; m >= 0; m--) {
      var d = new Date(yr, mo - 1 - m, 1);
      vals.push(getMonthlyData(allData, d.getFullYear(), d.getMonth()+1)[blog] || 0);
    }
    stats.getRange(row,1,1,7).setValues([vals]);
    stats.getRange(row,1,1,7).setBackground(colors[idx]).setFontColor('#ffffff').setFontSize(10).setFontWeight('bold').setHorizontalAlignment('center');
    stats.setRowHeight(row, 36);
  });

  // 전체 현황 요약
  var mCnt = Math.max(main.getLastRow()-1, 0);
  var aCnt = Math.max(archive.getLastRow()-1, 0);
  stats.getRange(20,1).setValue('전체 현황 요약');
  stats.getRange(20,1,1,4).setBackground('#1a1a2e').setFontColor('#ffffff').setFontWeight('bold').setFontSize(11).setHorizontalAlignment('center');
  [['진행중 물건', mCnt+'건'], ['보관 물건', aCnt+'건'], ['전체 포스팅', allData.length+'건'], ['이번달 포스팅', totalMonth+'건']]
    .forEach(function(item, idx) {
      var row = 21 + idx;
      stats.getRange(row,1).setValue(item[0]); stats.getRange(row,2).setValue(item[1]);
      stats.getRange(row,1,1,4).setBackground(['#185FA5','#3B6D11','#854F0B','#A32D2D'][idx])
        .setFontColor('#ffffff').setFontWeight('bold').setFontSize(12).setHorizontalAlignment('center');
      stats.setRowHeight(row, 42);
    });

  [1,2,3,4,5,6,7].forEach(function(c, i){
    stats.setColumnWidth(c, [120,90,110,110,90,90,90][i]);
  });
  stats.getRange(26,1).setValue('마지막 업데이트: ' + now.toLocaleString('ko-KR')).setFontColor('#aaaaaa').setFontSize(9);
}

function collectAllData(main, archive) {
  var result  = [];
  var blogMap = { 6: 'A', 8: 'B', 10: 'C', 12: 'D' };
  [main, archive].forEach(function(sheet) {
    var last = sheet.getLastRow();
    for (var i = 2; i <= last; i++) {
      [6,8,10,12].forEach(function(col) {
        var checked = sheet.getRange(i, col).getValue();
        var dt      = sheet.getRange(i, col+1).getValue();
        if (checked === true && dt) result.push({ blog: blogMap[col], date: dt.toString() });
      });
    }
  });
  return result;
}

function getMonthlyData(allData, year, month) {
  var counts = { A: 0, B: 0, C: 0, D: 0 };
  allData.forEach(function(d) {
    var parts = d.date.replace(/\./g, '-').split('-').filter(Boolean);
    if (parts.length >= 2) {
      var y = parseInt(parts[0]), m = parseInt(parts[1]);
      if (y < 100) y += 2000;
      if (y === year && m === month) counts[d.blog]++;
    }
  });
  return counts;
}

// ============================================================
// 트리거
// ============================================================
function setupDailyTrigger() {
  ScriptApp.getProjectTriggers().forEach(function(t) {
    if (t.getHandlerFunction() === 'runDailyArchive') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('runDailyArchive').timeBased().everyDays(1).atHour(1).create();
  Logger.log('✅ 매일 오전 1시 자동 보관 트리거 설정 완료');
}

function runDailyArchive() {
  var bss = blogSS();
  moveExpiredBlogItems(bss);
  updateBlogStats(bss);
  var css = casesSS();
  archiveAuctionByMonth(css);
}

// 기존 사건목록/종료사건 행에 ID 없으면 UUID 채워주는 1회성 함수
function migrateAddCaseIds() {
  var ss      = casesSS();
  var sheets  = [
    sh(ss, SH_CASES_ACTIVE),
    sh(ss, SH_CASES_ARCHIVE)
  ];
  sheets.forEach(function(sheet) {
    var last  = sheet.getLastRow();
    var fixed = 0;
    for (var i = 2; i <= last; i++) {
      var id = sheet.getRange(i, 1).getValue();
      if (!id || String(id).trim() === '') {
        sheet.getRange(i, 1).setValue(Utilities.getUuid());
        fixed++;
      }
    }
    Logger.log(sheet.getName() + ': ' + fixed + '행 ID 추가 완료');
  });
}

// ============================================================
// AUCTION — GET
// ============================================================
// 입찰진행 컬럼(13): id, caseNo(FK), clientName, content,
//   saleDecisionDate, saleDecisionOk, appealDate, appealOk,
//   balanceDate, note, status, createdAt, balanceOk
// → caseNo로 사건목록/종료사건과 조인. 중복 필드 없음.

function auctionGet(p) {
  var ss = casesSS();
  if (p.action === 'list') return json(loadAuction(ss, SH_AUCTION));
  return json({ error: 'unknown auction action' });
}

function loadAuction(ss, shName) {
  var sheet = sh(ss, shName);
  if (sheet.getLastRow() < 2) return { ok: true, data: [] };
  var hdrStyle = function(col, label, width) {
    sheet.getRange(1, col).setValue(label)
         .setBackground('#1a1a2e').setFontColor('#ffffff').setFontWeight('bold').setFontSize(10)
         .setHorizontalAlignment('center').setVerticalAlignment('middle');
    sheet.setColumnWidth(col, width);
  };
  if (sheet.getLastColumn() < 13) hdrStyle(13, '잔금납부확정', 70);
  if (sheet.getLastColumn() < 14) hdrStyle(14, '서브여부', 60);
  if (sheet.getLastColumn() < 15) hdrStyle(15, '서브담당자', 70);
  if (sheet.getLastColumn() < 16) hdrStyle(16, '대출연결', 60);
  if (sheet.getLastColumn() < 17) hdrStyle(17, '카톡전달', 60);
  var cols = Math.min(sheet.getLastColumn(), 17);
  var vals = sheet.getRange(2, 1, sheet.getLastRow() - 1, cols).getValues();
  return { ok: true, data: vals.map(mapAuctionRow) };
}

function mapAuctionRow(r) {
  return {
    id:               String(r[0]),
    caseNo:           String(r[1]  || ''),
    clientName:       String(r[2]  || ''),
    content:          String(r[3]  || ''),
    saleDecisionDate: r[4]  ? kstDate(r[4])  : '',
    saleDecisionOk:   String(r[5]  || ''),
    appealDate:       r[6]  ? kstDate(r[6])  : '',
    appealOk:         String(r[7]  || ''),
    balanceDate:      r[8]  ? kstDate(r[8])  : '',
    note:             String(r[9]  || ''),
    status:           String(r[10] || 'ongoing'),
    createdAt:        r[11] ? kstDate(r[11]) : '',
    balanceOk:        String(r[12] || ''),
    isSub:            r[13] === true || r[13] === 'TRUE' || r[13] === 'true',
    subStaff:         (r[14] instanceof Date) ? '' : String(r[14] || ''),
    loanOk:           r[15] === true || r[15] === 'TRUE' || r[15] === 'true',
    reportSent:       r[16] === true || r[16] === 'TRUE' || r[16] === 'true'
  };
}

// ============================================================
// AUCTION — POST
// ============================================================
function auctionPost(b) {
  var ss = casesSS();
  var d  = b.data || {};
  switch (b.action) {
    case 'add':    return json(addAuction(ss, d));
    case 'update': return json(updateAuction(ss, d));
    case 'delete': return json(deleteAuction(ss, d));
    default:       return json({ error: 'unknown auction action' });
  }
}

function addAuction(ss, d) {
  var sheet = sh(ss, SH_AUCTION);
  if (sheet.getLastRow() === 0) setupAuctionSheet(sheet);
  var id = Utilities.getUuid();
  sheet.appendRow([
    id,
    d.caseNo          || '',
    d.clientName      || '',
    d.content         || '',
    d.saleDecisionDate ? new Date(d.saleDecisionDate) : '',
    d.saleDecisionOk  || '',
    d.appealDate       ? new Date(d.appealDate)       : '',
    d.appealOk         || '',
    d.balanceDate      ? new Date(d.balanceDate)      : '',
    d.note             || '',
    d.status           || 'ongoing',
    new Date(),
    d.balanceOk        || '',
    d.isSub            || false,
    d.subStaff         || '',
    d.loanOk           || false,
    d.reportSent       || false
  ]);
  return { ok: true, id: id };
}

function updateAuction(ss, d) {
  var sheet   = sh(ss, SH_AUCTION);
  var rowInfo = findRowById(sheet, d.id, 13);
  if (!rowInfo) return { ok: false, error: '항목을 찾을 수 없습니다.' };
  var r = rowInfo.row;
  var sv = function(col, val) { if (val !== undefined) sheet.getRange(r, col).setValue(val); };
  sv(2, d.caseNo); sv(3, d.clientName); sv(4, d.content);
  if (d.saleDecisionDate !== undefined) sv(5, d.saleDecisionDate ? new Date(d.saleDecisionDate) : '');
  sv(6, d.saleDecisionOk);
  if (d.appealDate !== undefined) sv(7, d.appealDate ? new Date(d.appealDate) : '');
  sv(8, d.appealOk);
  if (d.balanceDate !== undefined) sv(9, d.balanceDate ? new Date(d.balanceDate) : '');
  sv(10, d.note); sv(11, d.status);
  sv(13, d.balanceOk);
  if (d.isSub !== undefined) sv(14, d.isSub);
  if (d.subStaff !== undefined) sv(15, d.subStaff);
  if (d.loanOk !== undefined) sv(16, d.loanOk);
  if (d.reportSent !== undefined) sv(17, d.reportSent);
  return { ok: true };
}

function deleteAuction(ss, d) {
  var sheet   = sh(ss, SH_AUCTION);
  var rowInfo = findRowById(sheet, d.id, 12);
  if (!rowInfo) return { ok: false, error: '항목을 찾을 수 없습니다.' };
  sheet.deleteRow(rowInfo.row);
  return { ok: true };
}

function setupAuctionSheet(sheet) {
  var h = ['ID','사건번호(FK)','고객명','진행내용',
           '매각결정기일','매각결정확정','항고기간','항고확정',
           '잔금납부기일','비고','상태','등록일','잔금납부확정'];
  sheet.getRange(1,1,1,13).setValues([h])
    .setBackground('#1a1a2e').setFontColor('#ffffff').setFontWeight('bold').setFontSize(10)
    .setHorizontalAlignment('center').setVerticalAlignment('middle');
  sheet.setRowHeight(1,36); sheet.setFrozenRows(1); sheet.setTabColor('#8B6914');
  var widths=[[1,0],[2,130],[3,90],[4,200],[5,100],[6,70],[7,100],[8,70],[9,100],[10,200],[11,80],[12,90],[13,70]];
  widths.forEach(function(p){ sheet.setColumnWidth(p[0], p[1]); });
  ['E:E','G:G','I:I','L:L'].forEach(function(col){ sheet.getRange(col).setNumberFormat('yy.M.d'); });
}

// 통계용에서만 사용 — 사건목록에서 해당 사건의 auctionDate 조회
function archiveAuctionByMonth(ss) { /* 입찰 항목은 적으므로 아카이브 불필요 */ }

// ============================================================
// MYEONGDO — GET
// ============================================================
// 명도 컬럼(15): id,clientName,auctionDate,court,caseNo,propertyName,
//   injunctionNo,respondent,serviceDate,enforcementDate,warningDate,moveDate,note,status,createdAt

function myeongdoGet(p) {
  var ss = casesSS();
  if (p.action === 'listActive') return json(loadMyeongdo(ss, SH_MYEONGDO_A));
  if (p.action === 'listDone')   return json(loadMyeongdo(ss, SH_MYEONGDO_D));
  return json({ error: 'unknown myeongdo action' });
}

function loadMyeongdo(ss, shName) {
  var sheet = sh(ss, shName);
  if (sheet.getLastRow() < 2) return { ok: true, data: [] };
  // 16열(담당자) 자동 추가
  if (sheet.getLastColumn() < 16) {
    sheet.getRange(1, 16).setValue('담당자')
         .setBackground('#1a1a2e').setFontColor('#ffffff').setFontWeight('bold').setFontSize(10)
         .setHorizontalAlignment('center').setVerticalAlignment('middle');
    sheet.setColumnWidth(16, 100);
  }
  var cols = Math.min(sheet.getLastColumn(), 16);
  var vals = sheet.getRange(2, 1, sheet.getLastRow() - 1, cols).getValues();
  return { ok: true, data: vals.map(mapMyeongdoRow) };
}

function mapMyeongdoRow(r) {
  return {
    id:              String(r[0]),
    clientName:      String(r[1]  || ''),
    auctionDate:     r[2]  ? kstDate(r[2])  : '',
    court:           String(r[3]  || ''),
    caseNo:          String(r[4]  || ''),
    propertyName:    String(r[5]  || ''),
    injunctionNo:    String(r[6]  || ''),
    respondent:      String(r[7]  || ''),
    serviceDate:     r[8]  ? kstDate(r[8])  : '',
    enforcementDate: r[9]  ? kstDate(r[9])  : '',
    warningDate:     r[10] ? kstDate(r[10]) : '',
    moveDate:        r[11] ? kstDate(r[11]) : '',
    note:            String(r[12] || ''),
    status:          String(r[13] || 'active'),
    createdAt:       r[14] ? kstDate(r[14]) : '',
    staffList:       String(r[15] || '')
  };
}

// ============================================================
// MYEONGDO — POST
// ============================================================
function myeongdoPost(b) {
  var ss = casesSS();
  var d  = b.data || {};
  switch (b.action) {
    case 'add':      return json(addMyeongdo(ss, d));
    case 'update':   return json(updateMyeongdo(ss, d));
    case 'complete': return json(completeMyeongdo(ss, d));
    case 'delete':   return json(deleteMyeongdo(ss, d));
    default:         return json({ error: 'unknown myeongdo action' });
  }
}

function addMyeongdo(ss, d) {
  var sheet = sh(ss, SH_MYEONGDO_A);
  if (sheet.getLastRow() === 0) setupMyeongdoSheet(sheet, false);
  var id = Utilities.getUuid();
  sheet.appendRow([
    id, d.clientName || '', d.auctionDate ? new Date(d.auctionDate) : '',
    d.court || '', d.caseNo || '', d.propertyName || '',
    d.injunctionNo || '', d.respondent || '',
    d.serviceDate     ? new Date(d.serviceDate)     : '',
    d.enforcementDate ? new Date(d.enforcementDate) : '',
    d.warningDate     ? new Date(d.warningDate)     : '',
    d.moveDate        ? new Date(d.moveDate)        : '',
    d.note || '', 'active', new Date(), d.staffList || ''
  ]);
  return { ok: true, id: id };
}

function updateMyeongdo(ss, d) {
  var active  = sh(ss, SH_MYEONGDO_A);
  var done    = sh(ss, SH_MYEONGDO_D);
  var rowInfo = findRowById(active, d.id, 15) || findRowById(done, d.id, 15);
  if (!rowInfo) return { ok: false, error: '항목을 찾을 수 없습니다.' };
  var r = rowInfo.row; var sheet = rowInfo.sheet;
  var sv = function(col, val) { if (val !== undefined) sheet.getRange(r, col).setValue(val); };
  sv(2, d.clientName);
  if (d.auctionDate !== undefined) sv(3, d.auctionDate ? new Date(d.auctionDate) : '');
  sv(4, d.court); sv(5, d.caseNo); sv(6, d.propertyName);
  sv(7, d.injunctionNo); sv(8, d.respondent);
  if (d.serviceDate     !== undefined) sv(9,  d.serviceDate     ? new Date(d.serviceDate)     : '');
  if (d.enforcementDate !== undefined) sv(10, d.enforcementDate ? new Date(d.enforcementDate) : '');
  if (d.warningDate     !== undefined) sv(11, d.warningDate     ? new Date(d.warningDate)     : '');
  if (d.moveDate        !== undefined) sv(12, d.moveDate        ? new Date(d.moveDate)        : '');
  sv(13, d.note); sv(14, d.status);
  if (d.staffList !== undefined) sv(16, d.staffList);
  return { ok: true };
}

function completeMyeongdo(ss, d) {
  var active  = sh(ss, SH_MYEONGDO_A);
  var done    = sh(ss, SH_MYEONGDO_D);
  if (done.getLastRow() === 0) setupMyeongdoSheet(done, true);
  var rowInfo = findRowById(active, d.id, 15);
  if (!rowInfo) return { ok: false, error: '항목을 찾을 수 없습니다.' };
  var vals = rowInfo.vals.slice();
  vals[13]  = 'done';
  done.appendRow(vals);
  active.deleteRow(rowInfo.row);
  return { ok: true };
}

function deleteMyeongdo(ss, d) {
  var active  = sh(ss, SH_MYEONGDO_A);
  var done    = sh(ss, SH_MYEONGDO_D);
  var rowInfo = findRowById(active, d.id, 15) || findRowById(done, d.id, 15);
  if (!rowInfo) return { ok: false, error: '항목을 찾을 수 없습니다.' };
  rowInfo.sheet.deleteRow(rowInfo.row);
  return { ok: true };
}

function setupMyeongdoSheet(sheet, isDone) {
  var h = ['ID','고객명','입찰기일','법원','사건번호','물건명',
           '인도번호','피신청인','송달일','강제집행신청','계고일','이사날짜','비고','상태','등록일'];
  var bg = isDone ? '#1a4731' : '#4a0e0e';
  sheet.getRange(1,1,1,15).setValues([h])
    .setBackground(bg).setFontColor('#ffffff').setFontWeight('bold').setFontSize(10)
    .setHorizontalAlignment('center').setVerticalAlignment('middle');
  sheet.setRowHeight(1,36); sheet.setFrozenRows(1);
  sheet.setTabColor(isDone ? '#137333' : '#a61c00');
  var widths=[[1,0],[2,90],[3,90],[4,90],[5,120],[6,160],
              [7,110],[8,100],[9,90],[10,110],[11,90],[12,90],[13,200],[14,70],[15,90]];
  widths.forEach(function(p){ sheet.setColumnWidth(p[0], p[1]); });
  ['C:C','I:I','J:J','K:K','L:L'].forEach(function(col){
    sheet.getRange(col).setNumberFormat('yy.M.d');
  });
}

// ============================================================
// 통계
// ============================================================
function statsGet(p) {
  var ss  = casesSS();
  var bss = blogSS();
  var now = new Date();
  var yr  = now.getFullYear();
  var mo  = now.getMonth() + 1;
  if (p.month) {
    var pts = String(p.month).split('-');
    if (pts.length === 2) { yr = parseInt(pts[0]); mo = parseInt(pts[1]); }
  }
  var targetMonth = String(yr) + '-' + String(mo).padStart(2,'0');

  // 입찰 데이터: caseNo로 사건목록과 조인하여 해당 월 경매기일 사건의 입찰 항목만 집계
  var aData = [];
  var aSheet = sh(ss, SH_AUCTION);
  if (aSheet.getLastRow() > 1)
    aData = aSheet.getRange(2,1,aSheet.getLastRow()-1,Math.min(aSheet.getLastColumn(),17)).getValues().map(mapAuctionRow);

  // 사건목록(active+archived)에서 해당 월 auctionDate 사건번호 수집
  var allCases = loadCases(ss, SH_CASES_ACTIVE).concat(loadCases(ss, SH_CASES_ARCHIVE));
  var monthCaseNos = {};
  allCases.forEach(function(c) {
    if (c.auctionDate && c.auctionDate.substring(0,7) === targetMonth) monthCaseNos[c.caseNo] = true;
  });
  var monthAuction = aData.filter(function(a) { return monthCaseNos[a.caseNo]; });

  // 명도 데이터
  var mdA = loadMyeongdo(ss, SH_MYEONGDO_A).data || [];
  var mdD = loadMyeongdo(ss, SH_MYEONGDO_D).data || [];

  // 블로그 이번달 게시수
  var blogItems = (loadBlogList(bss).data || []);
  var bCnt = { A:0, B:0, C:0, D:0 };
  blogItems.forEach(function(item) {
    if (isStatMonth(item.blogADate, yr, mo)) bCnt.A++;
    if (isStatMonth(item.blogBDate, yr, mo)) bCnt.B++;
    if (isStatMonth(item.blogCDate, yr, mo)) bCnt.C++;
    if (isStatMonth(item.blogDDate, yr, mo)) bCnt.D++;
  });

  // 물건조사 현황
  var cases = loadCases(ss, SH_CASES_ACTIVE);
  var actCases = cases.filter(function(c) {
    return ['ongoing','done','report','confirmed'].indexOf(c.status) >= 0;
  });

  return json({
    ok:    true,
    month: targetMonth,
    auction: {
      total:   monthAuction.length,
      won:     monthAuction.filter(function(a){ return a.status==='won'; }).length,
      gaveup:  monthAuction.filter(function(a){ return a.status==='gaveup'; }).length,
      ongoing: aData.filter(function(a){ return a.status==='ongoing'; }).length,
      all:     aData.length
    },
    myeongdo: { active: mdA.length, done: mdD.length },
    blog: {
      total: bCnt.A + bCnt.B + bCnt.C + bCnt.D,
      A: bCnt.A, B: bCnt.B, C: bCnt.C, D: bCnt.D
    },
    cases: { active: actCases.length }
  });
}

function isStatMonth(ds, yr, mo) {
  if (!ds) return false;
  var s = String(ds).trim();
  var m = s.match(/(\d{2,4})[.\-\s]+(\d{1,2})/);
  if (!m) return false;
  var y = parseInt(m[1]); if (y < 100) y += 2000;
  return y === yr && parseInt(m[2]) === mo;
}

// 기존 블로그 GAS 시트에 상태 컬럼 없으면 1회 실행
function migrateAddStatusColumn() {
  var ss    = blogSS();
  var sheet = sh(ss, SH_BLOG_ACTIVE);
  var last  = sheet.getLastRow();
  sheet.getRange(1,17).setValue('상태').setBackground('#4a1040').setFontColor('#ffffff').setFontWeight('bold').setHorizontalAlignment('center');
  sheet.setColumnWidth(17, 90);
  for (var i = 2; i <= last; i++) {
    if (!sheet.getRange(i,17).getValue()) sheet.getRange(i,17).setValue('정상');
  }
  Logger.log('✅ 상태 컬럼 추가 완료! (' + (last-1) + '행 처리됨)');
}

// ============================================================
// DRIVE — 구글 드라이브 연동
// ============================================================
var DRIVE_ROOT_NAME = 'THE FIN 인트라넷';

function driveRoot() {
  var it = DriveApp.getFoldersByName(DRIVE_ROOT_NAME);
  return it.hasNext() ? it.next() : DriveApp.createFolder(DRIVE_ROOT_NAME);
}

function driveCaseFolder(caseNo) {
  var root = driveRoot();
  var it   = root.getFoldersByName('사건');
  var caseParent = it.hasNext() ? it.next() : root.createFolder('사건');
  var it2  = caseParent.getFoldersByName(caseNo);
  return it2.hasNext() ? it2.next() : caseParent.createFolder(caseNo);
}

function driveTypeFolder(caseNo, typeName) {
  var parent = driveCaseFolder(caseNo);
  var it = parent.getFoldersByName(typeName);
  return it.hasNext() ? it.next() : parent.createFolder(typeName);
}

function driveBackupFolder() {
  var root = driveRoot();
  var it   = root.getFoldersByName('백업');
  return it.hasNext() ? it.next() : root.createFolder('백업');
}

function driveGet(p) {
  // 사건 파일 목록
  if (p.action === 'listFiles') {
    try {
      var folder = p.typeName ? driveTypeFolder(p.caseNo, p.typeName) : driveCaseFolder(p.caseNo);
      var it = folder.getFiles();
      var files = [];
      while (it.hasNext()) {
        var f = it.next();
        files.push({
          id:        f.getId(),
          name:      f.getName(),
          size:      f.getSize(),
          url:       f.getUrl(),
          mimeType:  f.getMimeType(),
          createdAt: Utilities.formatDate(f.getDateCreated(), 'Asia/Seoul', 'yyyy-MM-dd HH:mm')
        });
      }
      files.sort(function(a,b){ return b.createdAt.localeCompare(a.createdAt); });
      return json({ ok: true, files: files, folderId: folder.getId(), folderUrl: folder.getUrl() });
    } catch(e) { return json({ ok: false, error: e.message }); }
  }
  // 최신 백업 내용 반환
  if (p.action === 'getBackup') {
    try {
      var folder = driveBackupFolder();
      var it = folder.getFiles();
      var latest = null, latestDate = null;
      while (it.hasNext()) {
        var f = it.next();
        var d = f.getDateCreated();
        if (!latestDate || d > latestDate) { latest = f; latestDate = d; }
      }
      if (!latest) return json({ ok: false, error: '백업 파일 없음' });
      return json({
        ok: true,
        data: JSON.parse(latest.getBlob().getDataAsString()),
        fileName: latest.getName(),
        createdAt: Utilities.formatDate(latestDate, 'Asia/Seoul', 'yyyy-MM-dd HH:mm')
      });
    } catch(e) { return json({ ok: false, error: e.message }); }
  }
  // 백업 목록
  if (p.action === 'listBackups') {
    try {
      var folder = driveBackupFolder();
      var it = folder.getFiles();
      var list = [];
      while (it.hasNext()) {
        var f = it.next();
        list.push({ id: f.getId(), name: f.getName(), size: f.getSize(),
          createdAt: Utilities.formatDate(f.getDateCreated(), 'Asia/Seoul', 'yyyy-MM-dd HH:mm') });
      }
      list.sort(function(a,b){ return b.createdAt.localeCompare(a.createdAt); });
      return json({ ok: true, backups: list });
    } catch(e) { return json({ ok: false, error: e.message }); }
  }
  return json({ error: 'unknown drive action' });
}

function drivePost(b) {
  // 파일 업로드
  if (b.action === 'uploadFile') {
    try {
      var folder = b.typeName ? driveTypeFolder(b.caseNo, b.typeName) : driveCaseFolder(b.caseNo);
      var blob   = Utilities.newBlob(Utilities.base64Decode(b.base64), b.mimeType, b.fileName);
      var file   = folder.createFile(blob);
      file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
      return json({ ok: true, id: file.getId(), name: file.getName(), url: file.getUrl() });
    } catch(e) { return json({ ok: false, error: e.message }); }
  }
  // 파일 삭제 (휴지통으로)
  if (b.action === 'deleteFile') {
    try {
      DriveApp.getFileById(b.fileId).setTrashed(true);
      return json({ ok: true });
    } catch(e) { return json({ ok: false, error: e.message }); }
  }
  // 전체 데이터 백업
  if (b.action === 'backupData') {
    try {
      var folder = driveBackupFolder();
      var ts     = Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM-dd_HH-mm');
      var name   = 'thefin_backup_' + ts + '.json';
      var file   = folder.createFile(Utilities.newBlob(b.jsonData, 'application/json', name));
      // 백업 10개 초과 시 오래된 것 자동 삭제
      var it2  = folder.getFiles();
      var all  = [];
      while (it2.hasNext()) all.push(it2.next());
      if (all.length > 10) {
        all.sort(function(a,b){ return a.getDateCreated() - b.getDateCreated(); });
        for (var i = 0; i < all.length - 10; i++) all[i].setTrashed(true);
      }
      return json({ ok: true, id: file.getId(), name: name });
    } catch(e) { return json({ ok: false, error: e.message }); }
  }
  return json({ error: 'unknown drive action' });
}

// ============================================================
// BETA — 오류 리포팅 (버그 신고 → 시트 저장 + 텔레그램)
// ============================================================
// ★ 텔레그램 전송을 원하면 스크립트 속성에 ADMIN_CHAT_ID 추가:
//   스크립트 편집기 → 프로젝트 설정 → 스크립트 속성
//   키: ADMIN_CHAT_ID  값: 대표님 텔레그램 chat_id
//   (텔레그램 봇에게 먼저 메시지를 보낸 후 @userinfobot 에서 확인 가능)
// ============================================================
var BETA_LOG_SHEET = '오류 로그';

function betaPost(b) {
  if (b.action === 'report') {
    try {
      var ss    = casesSS();
      var sheet = sh(ss, BETA_LOG_SHEET);
      // 헤더가 없으면 생성
      if (sheet.getLastRow() === 0) {
        sheet.appendRow(['시각', '사용자', '역할', '유형', '설명', '오류 메시지', '위치', '스택(요약)', '브라우저', 'URL']);
        sheet.getRange(1, 1, 1, 10).setBackground('#142040').setFontColor('#ffffff').setFontWeight('bold');
        sheet.setFrozenRows(1);
      }
      // 오류 행 저장
      sheet.appendRow([
        b.ts      || todayStr(),
        b.user    || '—',
        b.role    || '—',
        b.type    || '—',
        b.desc    || '',
        b.message || '',
        b.source  || '',
        b.stack   ? b.stack.substring(0, 300) : '',
        b.ua      || '',
        b.url     || ''
      ]);
      // 텔레그램 전송 (ADMIN_CHAT_ID 설정 시)
      var adminChatId = prop('ADMIN_CHAT_ID');
      if (adminChatId) {
        var emoji = b.type === '수동신고' ? '📋' : '🐛';
        var msg   = emoji + ' [베타 오류] ' + (b.type || '') + '\n' +
          '───────────────\n' +
          '👤 ' + (b.user || '?') + ' (' + (b.role || '?') + ')\n' +
          '🕐 ' + (b.ts || '') + '\n\n';
        if (b.desc)    msg += '📝 설명:\n' + b.desc + '\n\n';
        if (b.message) msg += '⚠️ 오류:\n' + b.message.substring(0, 200) + '\n\n';
        if (b.source)  msg += '📍 위치: ' + b.source;
        sendTelegram(adminChatId, msg.trim());
      }
      return json({ ok: true });
    } catch(e) {
      return json({ ok: false, error: e.message });
    }
  }
  return json({ error: 'unknown beta action' });
}

// ============================================================
// MSG — 메시지 / 수정 요청
// ============================================================
var SH_MSG = '메시지';

function msgGet(p) {
  var ss = casesSS();
  if (p.action === 'getMessages') return getMsgs(ss, p);
  return json({ error: 'unknown msg action' });
}

function msgPost(b) {
  var ss = casesSS();
  if (b.action === 'sendMessage') return sendMsg(ss, b);
  if (b.action === 'markRead')    return markMsgRead(ss, b.id);
  return json({ error: 'unknown msg action' });
}

// 스키마 v2: [ID, 보낸사람, 받는사람, 내용, 유형, 전송시각, 읽음]
function getMsgs(ss, p) {
  var sheet = ss.getSheetByName(SH_MSG);
  if (!sheet || sheet.getLastRow() < 2) return json({ ok: true, messages: [], sent: [] });
  var lastRow = sheet.getLastRow() - 1;
  var numCols = sheet.getLastColumn();
  var data = sheet.getRange(2, 1, lastRow, numCols).getValues();
  var user    = (p && p.user)  ? String(p.user)  : '';
  var isAdmin = (p && p.admin) === '1';

  var messages = [], sent = [];
  data.forEach(function(r) {
    // 구형(6열) 호환: to 없으면 '전체'로 간주
    var id, from, to, body, type, time, read;
    var fmtT = function(v) {
      if (!v) return '';
      if (v instanceof Date) return Utilities.formatDate(v, 'Asia/Seoul', 'yyyy-MM-dd HH:mm');
      return String(v);
    };
    if (numCols >= 7) {
      id = r[0]; from = r[1]; to = r[2]; body = r[3]; type = r[4]; time = fmtT(r[5]); read = r[6] === true;
    } else {
      id = r[0]; from = r[1]; to = '전체'; body = r[2]; type = r[3]; time = fmtT(r[4]); read = r[5] === true;
    }
    var obj = { id: id, from: from, to: to, body: body, type: type, time: time, read: read };
    // 수신함: 나에게 온 메시지 (to == user 또는 to == '전체') 또는 관리자는 전체
    if (isAdmin || to === user || to === '전체') messages.push(obj);
    // 발신함: 내가 보낸 메시지
    if (from === user) sent.push(obj);
  });
  messages.reverse();
  sent.reverse();
  return json({ ok: true, messages: messages, sent: sent });
}

function sendMsg(ss, b) {
  var sheet = ss.getSheetByName(SH_MSG);
  if (!sheet) {
    sheet = ss.insertSheet(SH_MSG);
    sheet.appendRow(['ID', '보낸사람', '받는사람', '내용', '유형', '전송시각', '읽음']);
    sheet.setFrozenRows(1);
  }
  var id  = Utilities.getUuid();
  var now = Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM-dd HH:mm');
  sheet.appendRow([id, b.from || '알수없음', b.to || '전체', b.body || '', b.type || '기타', now, false]);

  // 텔레그램 알림 (ADMIN_CHAT_ID 설정 시)
  var chatId = prop('ADMIN_CHAT_ID');
  if (chatId) {
    var txt = '💬 [메시지]\n' +
      '───────────────\n' +
      '👤 보낸사람: ' + (b.from || '?') + '\n' +
      '📩 받는사람: ' + (b.to || '전체') + '\n' +
      '🏷 유형: ' + (b.type || '기타') + '\n' +
      '🕐 시각: ' + now + '\n\n' +
      '📝 내용:\n' + (b.body || '');
    sendTelegram(chatId, txt);
  }
  return json({ ok: true });
}

function markMsgRead(ss, id) {
  var sheet = ss.getSheetByName(SH_MSG);
  if (!sheet) return json({ ok: false });
  var lastRow = Math.max(sheet.getLastRow() - 1, 1);
  var data = sheet.getRange(2, 1, lastRow, 1).getValues();
  var readCol = sheet.getLastColumn(); // 마지막 열이 읽음 여부
  for (var i = 0; i < data.length; i++) {
    if (data[i][0] === id) { sheet.getRange(i + 2, readCol).setValue(true); return json({ ok: true }); }
  }
  return json({ ok: false, error: 'not found' });
}

// ============================================================
// CALENDAR — 구글 캘린더 자동 동기화
// ============================================================
// 스크립트 속성 'THEFIN_CALENDAR_ID' 에 캘린더 ID 자동 저장
// (첫 syncEvents 호출 시 "THE FIN 인트라넷" 캘린더 자동 생성)
//
// 사용 전 1회 설정:
//   1. Google Apps Script 편집기 → 실행 → GCAL_init() 실행
//      (또는 첫 syncEvents 호출 시 자동 생성)
//   2. 생성된 "THE FIN 인트라넷" 캘린더를 직원들에게 공유
//      구글 캘린더 앱 → 다른 캘린더 → 해당 캘린더 → 사람 추가
// ============================================================

// 사용할 캘린더 이름 — 구글 캘린더에 이미 있는 이름과 정확히 일치해야 함
var GCAL_TARGET_NAME = '더핀(the fin) 통합 업무표';

function GCAL_init() {
  // 저장된 ID 초기화 후 재탐색
  PropertiesService.getScriptProperties().deleteProperty('THEFIN_CALENDAR_ID');
  var cal = gcalGetOrCreate();
  Logger.log('캘린더 연결 완료: ' + cal.getName() + ' (' + cal.getId() + ')');
  return cal.getId();
}

// 잘못 생성된 캘린더 ID를 리셋할 때 사용
function GCAL_reset() {
  PropertiesService.getScriptProperties().deleteProperty('THEFIN_CALENDAR_ID');
  Logger.log('캘린더 ID 초기화 완료. GCAL_init()을 다시 실행하세요.');
}

function gcalGetOrCreate() {
  var props = PropertiesService.getScriptProperties();
  var calId = props.getProperty('THEFIN_CALENDAR_ID');

  // 저장된 ID가 있으면 먼저 확인
  if (calId) {
    try {
      var existing = CalendarApp.getCalendarById(calId);
      if (existing && existing.getName() === GCAL_TARGET_NAME) return existing;
    } catch(e) {}
    // 이름이 다르거나 찾을 수 없으면 ID 삭제 후 재탐색
    props.deleteProperty('THEFIN_CALENDAR_ID');
  }

  // 이름으로 기존 캘린더 검색
  var allCals = CalendarApp.getAllCalendars();
  for (var i = 0; i < allCals.length; i++) {
    if (allCals[i].getName() === GCAL_TARGET_NAME) {
      props.setProperty('THEFIN_CALENDAR_ID', allCals[i].getId());
      Logger.log('기존 캘린더 연결: ' + GCAL_TARGET_NAME);
      return allCals[i];
    }
  }

  // 없으면 새로 생성
  var cal = CalendarApp.createCalendar(GCAL_TARGET_NAME, { color: CalendarApp.Color.TEAL });
  props.setProperty('THEFIN_CALENDAR_ID', cal.getId());
  Logger.log('새 캘린더 생성: ' + GCAL_TARGET_NAME);
  return cal;
}

function calendarPost(b) {
  if (b.action === 'syncEvents')    return gcalSyncEvents(b.data);
  if (b.action === 'deleteEvents')  return gcalDeleteEvents(b.ids);
  if (b.action === 'getCalId')      return json({ ok: true, calId: gcalGetOrCreate().getId() });
  return json({ error: 'unknown calendar action' });
}

// d = {
//   caseNo, clientName, court, address, staff,
//   auctionDate, deadline, saleDecisionDate, balanceDate, moveDate,
//   existingIds: { auction, deadline, saleDecision, balance, moveDate }
// }
function gcalSyncEvents(d) {
  try {
    var cal = gcalGetOrCreate();
    var ex  = d.existingIds || {};
    var prefix = '[더핀] ' + (d.clientName || d.caseNo || '');
    var desc = [
      '사건번호: ' + (d.caseNo || ''),
      '법원: '    + (d.court   || ''),
      '주소: '    + (d.address || ''),
      '담당: '    + (d.staff   || '')
    ].filter(function(s){ return s.split(': ')[1]; }).join('\n');

    var ids = {};
    ids.auction      = gcalUpsert(cal, ex.auction,      d.auctionDate,      prefix + ' 경매기일',    desc);
    ids.deadline     = gcalUpsert(cal, ex.deadline,     d.deadline,         prefix + ' 마감요청일',  desc);
    ids.saleDecision = gcalUpsert(cal, ex.saleDecision, d.saleDecisionDate, prefix + ' 매각결정기일', desc);
    ids.balance      = gcalUpsert(cal, ex.balance,      d.balanceDate,      prefix + ' 잔금납부기일', desc);
    ids.moveDate     = gcalUpsert(cal, ex.moveDate,     d.moveDate,         prefix + ' 이사날짜',    desc);

    return json({ ok: true, ids: ids });
  } catch(err) {
    return json({ ok: false, error: err.toString() });
  }
}

// 이벤트 upsert — 날짜 없으면 기존 이벤트 삭제 후 null 반환
function gcalUpsert(cal, existingId, dateStr, title, desc) {
  if (!dateStr) {
    if (existingId) {
      try { cal.getEventById(existingId).deleteEvent(); } catch(e) {}
    }
    return null;
  }
  var d = new Date(dateStr + 'T00:00:00+09:00');
  if (isNaN(d.getTime())) return existingId || null;

  if (existingId) {
    try {
      var ev = cal.getEventById(existingId);
      if (ev) {
        ev.setTitle(title);
        ev.setDescription(desc);
        ev.setAllDayDate(d);
        return existingId;
      }
    } catch(e) {}
  }
  var newEv = cal.createAllDayEvent(title, d, { description: desc });
  return newEv.getId();
}

function gcalDeleteEvents(ids) {
  if (!ids) return json({ ok: true });
  var cal = gcalGetOrCreate();
  var deleted = 0;
  Object.keys(ids).forEach(function(k) {
    if (!ids[k]) return;
    try { cal.getEventById(ids[k]).deleteEvent(); deleted++; } catch(e) {}
  });
  return json({ ok: true, deleted: deleted });
}
