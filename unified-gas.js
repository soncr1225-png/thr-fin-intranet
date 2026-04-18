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
  try { return Utilities.formatDate(new Date(val), 'Asia/Seoul', 'yyyy-MM-dd'); }
  catch(e) { return ''; }
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
    cases:          loadCases(ss, SH_CASES_ACTIVE),
    archive:        loadCases(ss, SH_CASES_ARCHIVE),
    todos:          loadTodos(ss),
    auction:        aRes.data  || [],
    myeongdoActive: maRes.data || [],
    myeongdoDone:   mdRes.data || [],
    blogList:       blogL.data || [],
    blogArchive:    blogA.data || [],
    ts:             new Date().getTime()
  });
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
  '기일변경': 'changed', '변경': 'changed',
  '낙찰종료': 'closed', '낙찰': 'closed', '종료': 'closed',
  '고객변심': 'cancel', '취소': 'cancel',
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
  var cols  = isArc ? 13 : 12;
  var vals  = sheet.getRange(2, 1, last - 1, cols).getValues();
  return vals.map(function(r) {
    return {
      id:          String(r[0]),
      status:      normalizeStatus(r[1]),
      caseNo:      String(r[2]),
      address:     String(r[3]),
      court:       String(r[4]),
      auctionDate: r[5] ? kstDate(r[5]) : '',
      deadline:    r[6] ? kstDate(r[6]) : '',
      typeMap: {
        '시세조사':   String(r[7]  || ''),
        '현장조사':   String(r[8]  || ''),
        '보고서작성': String(r[9]  || '')
      },
      note:     String(r[10] || ''),
      closedAt: isArc && r[12] ? kstDate(r[12]) : ''
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
    case 'analyzeImage': return json(analyzeImage(d, 'case'));
    default:             return json({ error: 'unknown action' });
  }
}

function addCase(ss, d) {
  var sheet  = sh(ss, SH_CASES_ACTIVE);
  var id     = Utilities.getUuid();
  var types  = d.types || [];
  var tm     = {};
  types.forEach(function(t) { if (t.manager) tm[t.type] = t.manager; });

  sheet.appendRow([
    id,
    d.status       || 'ongoing',
    d.caseNo       || '',
    d.address      || '',
    d.court        || '',
    d.auctionDate  ? new Date(d.auctionDate) : '',
    d.deadline     ? new Date(d.deadline)    : '',
    tm['시세조사']   || '',
    tm['현장조사']   || '',
    tm['보고서작성'] || '',
    d.note         || '',
    new Date()
  ]);
  return { ok: true, id: id };
}

function updateCase(ss, d) {
  var sheet   = sh(ss, SH_CASES_ACTIVE);
  var rowInfo = findRowById(sheet, d.id, 12);
  if (!rowInfo) return { ok: false, error: '사건을 찾을 수 없습니다.' };

  var types = d.types || [];
  var tm    = {};
  types.forEach(function(t) { if (t.manager) tm[t.type] = t.manager; });

  var r = rowInfo.row;
  if (d.status)      sheet.getRange(r, 2).setValue(d.status);
  if (d.caseNo)      sheet.getRange(r, 3).setValue(d.caseNo);
  if (d.address)     sheet.getRange(r, 4).setValue(d.address);
  if (d.court)       sheet.getRange(r, 5).setValue(d.court);
  if (d.auctionDate) sheet.getRange(r, 6).setValue(new Date(d.auctionDate));
  if (d.deadline)    sheet.getRange(r, 7).setValue(new Date(d.deadline));
  if (types.length) {
    sheet.getRange(r, 8).setValue(tm['시세조사']   || '');
    sheet.getRange(r, 9).setValue(tm['현장조사']   || '');
    sheet.getRange(r,10).setValue(tm['보고서작성'] || '');
  }
  if (d.note !== undefined) sheet.getRange(r, 11).setValue(d.note);
  return { ok: true };
}

function archiveCase(ss, d) {
  var active  = sh(ss, SH_CASES_ACTIVE);
  var archive = sh(ss, SH_CASES_ARCHIVE);
  var rowInfo = findRowById(active, d.id, 12);
  if (!rowInfo) return { ok: false, error: '사건을 찾을 수 없습니다.' };

  var vals = rowInfo.vals.slice();
  vals[1]  = d.status;       // 종료 사유로 상태 업데이트
  vals.push(new Date());     // col 13: 종료일
  archive.appendRow(vals);
  active.deleteRow(rowInfo.row);
  return { ok: true };
}

function deleteCase(ss, d) {
  var active  = sh(ss, SH_CASES_ACTIVE);
  var archive = sh(ss, SH_CASES_ARCHIVE);
  var rowInfo = findRowById(active, d.id, 12) || findRowById(archive, d.id, 13);
  if (!rowInfo) return { ok: false, error: '사건을 찾을 수 없습니다.' };
  rowInfo.sheet.deleteRow(rowInfo.row);
  return { ok: true };
}

function restoreCase(ss, d) {
  var active  = sh(ss, SH_CASES_ACTIVE);
  var archive = sh(ss, SH_CASES_ARCHIVE);
  var rowInfo = findRowById(archive, d.id, 13);
  if (!rowInfo) return { ok: false, error: '사건을 찾을 수 없습니다.' };

  var vals = rowInfo.vals.slice(0, 12);
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

  var prompt = (mode === 'blog')
    ? '경매 공고 이미지를 분석해서 아래 JSON 형식으로만 응답해. 코드블록 없이 순수 JSON만.\n{"caseNum":"사건번호","name":"아파트명+동+층+호수(띄어쓰기없이)","date":"YYYY-MM-DD","round":"차수숫자만","minPrice":"최저가(원단위포함)","title1":"블로그추천제목1","title2":"블로그추천제목2","title3":"블로그추천제목3"}'
    : '경매 공고 이미지를 분석해서 아래 JSON 형식으로만 응답해. 코드블록 없이 순수 JSON만.\n{"caseNo":"사건번호","address":"주소 또는 아파트명+동호수","auctionDate":"YYYY-MM-DD","court":"법원명"}';

  var payload = {
    model: 'claude-opus-4-5',
    max_tokens: 800,
    messages: [{
      role: 'user',
      content: [
        {
          type: 'image',
          source: {
            type: 'base64',
            media_type: d.mediaType || d.mimeType || 'image/jpeg',
            data: d.base64 || d.imageBase64
          }
        },
        { type: 'text', text: prompt }
      ]
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
    return { error: '분석 오류: ' + e.message };
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
        date:        r[2] ? kstDate(r[2]) : '',   round:       String(r[3]),
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
  var target  = p.round + '차';

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
  var target = p.round + '차';
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
  sheet.getRange(row, 2).setValue(p.name ? decodeURIComponent(String(p.name)) : '');
  sheet.getRange(row, 3).setValue(p.date);
  sheet.getRange(row, 4).setValue(target);
  sheet.getRange(row, 5).setFormula('=IF(C'+row+'="","",IF(C'+row+'<TODAY(),"종료","D-"&(C'+row+'-TODAY())))');
  [6, 8, 10, 12].forEach(function(c) {
    sheet.getRange(row, c).insertCheckboxes().setValue(false);
    sheet.getRange(row, c+1).setValue('');
  });
  sheet.getRange(row, 14).insertCheckboxes().setValue(false);
  sheet.getRange(row, 15).setValue('');
  sheet.getRange(row, 16).setValue(p.keywords ? decodeURIComponent(String(p.keywords)) : '');
  sheet.getRange(row, 17).setValue('정상');

  styleBlogRows(sheet);
  sortBlogByDate(sheet);
  moveExpiredBlogItems(ss);
  updateBlogStats(ss);
  return { success: true, message: '추가 완료!' };
}

// ============================================================
// BLOG — POST
// ============================================================
function blogPost(b) {
  if (b.action === 'analyze') return json(analyzeImage(b, 'blog'));
  return json({ error: 'unknown blog post action' });
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
  sheet.getRange(2, 1, sheet.getLastRow()-1, 16).sort({ column: 3, ascending: true });
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
// 입찰진행 컬럼(12): id, caseNo(FK), clientName, content,
//   saleDecisionDate, saleDecisionOk, appealDate, appealOk,
//   balanceDate, note, status, createdAt
// → caseNo로 사건목록/종료사건과 조인. 중복 필드 없음.

function auctionGet(p) {
  var ss = casesSS();
  if (p.action === 'list') return json(loadAuction(ss, SH_AUCTION));
  return json({ error: 'unknown auction action' });
}

function loadAuction(ss, shName) {
  var sheet = sh(ss, shName);
  if (sheet.getLastRow() < 2) return { ok: true, data: [] };
  var vals = sheet.getRange(2, 1, sheet.getLastRow() - 1, 12).getValues();
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
    createdAt:        r[11] ? kstDate(r[11]) : ''
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
    new Date()
  ]);
  return { ok: true, id: id };
}

function updateAuction(ss, d) {
  var sheet   = sh(ss, SH_AUCTION);
  var rowInfo = findRowById(sheet, d.id, 12);
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
           '잔금납부기일','비고','상태','등록일'];
  sheet.getRange(1,1,1,12).setValues([h])
    .setBackground('#1a1a2e').setFontColor('#ffffff').setFontWeight('bold').setFontSize(10)
    .setHorizontalAlignment('center').setVerticalAlignment('middle');
  sheet.setRowHeight(1,36); sheet.setFrozenRows(1); sheet.setTabColor('#8B6914');
  var widths=[[1,0],[2,130],[3,90],[4,200],[5,100],[6,70],[7,100],[8,70],[9,100],[10,200],[11,80],[12,90]];
  widths.forEach(function(p){ sheet.setColumnWidth(p[0], p[1]); });
  ['E:E','G:G','I:I','L:L'].forEach(function(col){ sheet.getRange(col).setNumberFormat('yy.M.d'); });
}

// 통계용에서만 사용 — 사건목록에서 해당 사건의 auctionDate 조회
function archiveAuctionByMonth(ss) { /* 입찰 항목은 적으므로 아카이브 불필요 */ }

// ============================================================
// MYEONGDO — GET
// ============================================================
// 명도 컬럼(15): id,clientName,auctionDate,court,caseNo,propertyName,content,
//   commissionRatio,injunctionNo,respondent,warningDate,moveDate,note,status,createdAt

function myeongdoGet(p) {
  var ss = casesSS();
  if (p.action === 'listActive') return json(loadMyeongdo(ss, SH_MYEONGDO_A));
  if (p.action === 'listDone')   return json(loadMyeongdo(ss, SH_MYEONGDO_D));
  return json({ error: 'unknown myeongdo action' });
}

function loadMyeongdo(ss, shName) {
  var sheet = sh(ss, shName);
  if (sheet.getLastRow() < 2) return { ok: true, data: [] };
  var vals = sheet.getRange(2, 1, sheet.getLastRow() - 1, 15).getValues();
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
    content:         String(r[6]  || ''),
    commissionRatio: String(r[7]  || ''),
    injunctionNo:    String(r[8]  || ''),
    respondent:      String(r[9]  || ''),
    warningDate:     r[10] ? kstDate(r[10]) : '',
    moveDate:        r[11] ? kstDate(r[11]) : '',
    note:            String(r[12] || ''),
    status:          String(r[13] || 'active'),
    createdAt:       r[14] ? kstDate(r[14]) : ''
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
    d.court || '', d.caseNo || '', d.propertyName || '', d.content || '',
    d.commissionRatio || '', d.injunctionNo || '', d.respondent || '',
    d.warningDate ? new Date(d.warningDate) : '',
    d.moveDate    ? new Date(d.moveDate)    : '',
    d.note || '', 'active', new Date()
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
  sv(4, d.court); sv(5, d.caseNo); sv(6, d.propertyName); sv(7, d.content);
  sv(8, d.commissionRatio); sv(9, d.injunctionNo); sv(10, d.respondent);
  if (d.warningDate !== undefined) sv(11, d.warningDate ? new Date(d.warningDate) : '');
  if (d.moveDate    !== undefined) sv(12, d.moveDate    ? new Date(d.moveDate)    : '');
  sv(13, d.note); sv(14, d.status);
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
  var h = ['ID','고객명','입찰기일','법원','사건번호','물건명','내용',
           '수수료비율','인도명령번호','피신청인','계고일','이사날짜','특이사항','상태','등록일'];
  var bg = isDone ? '#1a4731' : '#4a0e0e';
  sheet.getRange(1,1,1,15).setValues([h])
    .setBackground(bg).setFontColor('#ffffff').setFontWeight('bold').setFontSize(10)
    .setHorizontalAlignment('center').setVerticalAlignment('middle');
  sheet.setRowHeight(1,36); sheet.setFrozenRows(1);
  sheet.setTabColor(isDone ? '#137333' : '#a61c00');
  var widths=[[1,0],[2,90],[3,90],[4,90],[5,120],[6,160],[7,180],
              [8,100],[9,110],[10,100],[11,90],[12,90],[13,200],[14,70],[15,90]];
  widths.forEach(function(p){ sheet.setColumnWidth(p[0], p[1]); });
  sheet.getRange('C:C').setNumberFormat('yy.M.d');
  sheet.getRange('K:K').setNumberFormat('yy.M.d');
  sheet.getRange('L:L').setNumberFormat('yy.M.d');
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
    aData = aSheet.getRange(2,1,aSheet.getLastRow()-1,12).getValues().map(mapAuctionRow);

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
