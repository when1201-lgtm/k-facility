/* ════════════════════════════════════════════════
   K-Facility  js/main.js
   Firebase Auth + Page Router + All Renderers
════════════════════════════════════════════════ */

/* ── FIREBASE CONFIG ──────────────────────────
   Firebase 콘솔 https://console.firebase.google.com
   에서 값을 복사해 아래에 붙여넣기 하세요
───────────────────────────────────────────── */
const FB_CFG = {
  apiKey:            'YOUR_API_KEY',
  authDomain:        'YOUR_PROJECT.firebaseapp.com',
  projectId:         'YOUR_PROJECT_ID',
  storageBucket:     'YOUR_PROJECT.appspot.com',
  messagingSenderId: 'YOUR_SENDER_ID',
  appId:             'YOUR_APP_ID',
};

/* ── STATE ────────────────────────────────── */
const S = { page: 'home', user: null, guest: false, fbReady: false, dark: true };

/* ── HELPERS ──────────────────────────────── */
const $   = id => document.getElementById(id);
const ds  = () => new Date().toLocaleDateString('ko-KR', { year:'numeric', month:'long', day:'numeric', weekday:'short' });

/* ════════════════════════════════════════════════
   1. FIREBASE INIT & AUTH
════════════════════════════════════════════════ */
function initFB() {
  if (typeof firebase === 'undefined') {
    console.warn('[K-Facility] Firebase SDK 미로드 — 게스트/오프라인 모드 사용 가능');
    return;
  }
  try {
    firebase.initializeApp(FB_CFG);
    S.fbReady = true;
    firebase.auth().onAuthStateChanged(u => { if (u) onLogin(u, false); });
  } catch (e) { console.error('[K-Facility] Firebase 초기화 실패:', e); }
}

function loginGoogle() {
  if (!S.fbReady) { alert('Firebase 설정이 필요합니다.\njs/main.js 의 FB_CFG 값을 채워주세요.'); return; }
  const p = new firebase.auth.GoogleAuthProvider();
  firebase.auth().signInWithPopup(p)
    .then(r => onLogin(r.user, false))
    .catch(console.error);
}

function loginGuest() {
  onLogin({ displayName: '게스트', uid: 'guest' }, true);
}

function onLogin(user, isGuest) {
  S.user  = user;
  S.guest = isGuest;
  const init = (user.displayName || 'U').charAt(0).toUpperCase();
  $('ava').textContent   = init;
  $('uname').textContent = user.displayName || '사용자';
  if (isGuest) $('ava').style.background = 'linear-gradient(135deg,#64748b,#475569)';
  $('lov').classList.add('hidden');
  goto('home');
}

function logout() {
  if (S.fbReady && !S.guest) {
    firebase.auth().signOut().then(() => { S.user = null; S.guest = false; $('lov').classList.remove('hidden'); });
  } else {
    S.user = null; S.guest = false; $('lov').classList.remove('hidden');
  }
}

/* ════════════════════════════════════════════════
   2. ROUTER
════════════════════════════════════════════════ */
const ROUTES = {
  home, electric, mechanical, construction, fire,
  records, memo, roadmap, search, contacts, stats, settings,
  'ba-detail': baDetail,
};

function goto(p) {
  if (!ROUTES[p]) return;
  S.page = p;

  /* detail-mode 클래스 관리 */
  if (p === 'ba-detail') {
    document.body.classList.add('detail-mode');
  } else {
    document.body.classList.remove('detail-mode');
  }

  /* 사이드바 active 버튼 */
  document.querySelectorAll('.nb').forEach(b => b.classList.toggle('active', b.dataset.p === p));

  ROUTES[p]();

  /* 페이지 최상단으로 스크롤 */
  const pg = $('page');
  if (pg) pg.scrollTop = 0;
}

/* ════════════════════════════════════════════════
   3. TEMPLATE HELPERS
════════════════════════════════════════════════ */
function bc(cur) {
  return `<div class="breadcrumb">
    <span class="bc-home" onclick="goto('home')">🏠</span>
    <span class="bc-sep">/</span>
    <span class="bc-cur">${cur}</span>
    <span class="bc-date">${ds()}</span>
  </div>`;
}

function riItem(cls, txt, dt, badge, bcls) {
  return `<div class="ri">
    <div class="rdot ${cls}"></div>
    <span class="rtxt">${txt}</span>
    <span class="rdt">${dt}</span>
    <span class="rb ${bcls}">${badge}</span>
  </div>`;
}

function ckItem(on, txt) {
  return `<div class="ci">
    <div class="chk${on ? ' on' : ''}">${on ? '✓' : ''}</div>
    <span class="ct${on ? ' done' : ''}">${txt}</span>
  </div>`;
}

function stBox(n, lbl, col) {
  return `<div class="sbox"><div class="snum" style="color:${col}">${n}</div><div class="slb2">${lbl}</div></div>`;
}

function mCard(p, icon, bg, name, sub, bbg, bc2, badge) {
  return `<div class="gc mc" onclick="goto('${p}')">
    <div class="mi" style="background:${bg}">${icon}</div>
    <div class="mn">${name}</div>
    <div class="ms">${sub}</div>
    <span class="mbg" style="background:${bbg};color:${bc2}">${badge}</span>
  </div>`;
}

function spItem(lbl, val, wide) {
  return `<div class="spi${wide ? ' wide' : ''}">
    <div class="spll">${lbl}</div>
    <div class="spvl">${val}</div>
  </div>`;
}

function mcChip(ic, txt) {
  return `<div class="glass mc2">${ic} ${txt}</div>`;
}

/* ════════════════════════════════════════════════
   4. PAGE: HOME
════════════════════════════════════════════════ */
function home() {
  $('page').innerHTML = `<div class="pi">
    ${bc('홈 대시보드')}
    <div class="bento">

      <!-- 작업기록 카드 -->
      <div class="glass wcard fu1">
        <div class="thead">
          <div>
            <div class="slbl" style="margin-bottom:6px">최근 작업기록</div>
            <div class="ctitle">Before / After 요약</div>
          </div>
          <button class="btn-o" onclick="goto('ba-detail')">＋ 새 기록 추가</button>
        </div>
        <div class="trow">
          <div class="thumb">
            <div class="tph"><div class="pi2">📷</div><div class="pt2">Before</div></div>
            <div class="tlbl">BEFORE</div>
          </div>
          <div class="arw">→</div>
          <div class="thumb">
            <div class="tph" style="background:rgba(29,78,216,.08)">
              <div class="pi2">✅</div><div class="pt2">After</div>
            </div>
            <div class="tlbl">AFTER</div>
          </div>
        </div>
        <div class="mini-row">
          <div class="mini">
            <div class="ml">최근 작업</div>
            <div class="mv">3F 전기패널 점검</div>
            <div class="md">2025.03.19</div>
          </div>
          <div class="mini">
            <div class="ml">이전 작업</div>
            <div class="mv">냉각탑 필터 교체</div>
            <div class="md">2025.03.15</div>
          </div>
        </div>
      </div>

      <!-- 로드맵 카드 -->
      <div class="glass rcard fu2">
        <div class="thead">
          <div>
            <div class="slbl" style="margin-bottom:6px">이번 달 로드맵</div>
            <div class="ctitle">3월 주요 일정</div>
          </div>
          <button class="btn-b" onclick="goto('roadmap')">전체 보기 →</button>
        </div>
        ${riItem('done','소방설비 정기 점검','03/05','완료','rb-done')}
        ${riItem('done','전기 안전 검사','03/12','완료','rb-done')}
        ${riItem('prog','냉난방기 필터 교체','03/20','진행중','rb-prog')}
        ${riItem('todo','옥상 방수 점검','03/25','예정','rb-todo')}
        ${riItem('todo','엘리베이터 정기검사','03/28','예정','rb-todo')}
      </div>

      <!-- 체크리스트 + 통계 -->
      <div class="glass ccard fu3">
        <div class="slbl" style="margin-bottom:8px">오늘 체크리스트</div>
        <div style="display:flex;align-items:center;justify-content:space-between">
          <span style="font-size:13px;font-weight:600;color:var(--t1)" id="cc">3 / 7 완료</span>
          <span style="font-size:11px;color:var(--t3)" id="cp">43%</span>
        </div>
        <div class="pw"><div class="pf" id="pf" style="width:43%"></div></div>
        ${ckItem(true,  '소화기 위치 확인')}
        ${ckItem(true,  '3F 전등 교체')}
        ${ckItem(true,  '보일러실 점검')}
        ${ckItem(false, '누수 여부 확인')}
        ${ckItem(false, '냉각탑 수위 체크')}
        ${ckItem(false, '비상구 점등 확인')}
        ${ckItem(false, '일지 기록 업로드')}
        <div class="sdiv"></div>
        <div class="slbl" style="margin-bottom:10px">이번 달 통계</div>
        <div class="sgrid">
          ${stBox(24,'완료 작업','var(--orange)')}
          ${stBox(6, '미완료',   'var(--blue)')}
          ${stBox(8, '작업기록', 'var(--green)')}
          ${stBox(3, '메모 추가','var(--purple)')}
        </div>
      </div>

      <!-- 메뉴 7개 -->
      <div class="msec fu4">
        <div class="slbl" style="margin-bottom:12px">메뉴</div>
        <div class="mgrid">
          ${mCard('electric',     '⚡','rgba(255,243,235,.12)','전기',      '전기설비 관리',  'rgba(255,243,235,.15)','var(--orange)', '기록 3건')}
          ${mCard('mechanical',   '⚙️','rgba(239,246,255,.10)','기계',      '기계설비 관리',  'rgba(239,246,255,.15)','#93c5fd',      '점검 예정')}
          ${mCard('construction', '🔨','rgba(254,249,195,.10)','영선',      '건축·인테리어',  'rgba(254,249,195,.15)','#fde047',      '작업 1건')}
          ${mCard('fire',         '🔥','rgba(252,231,243,.10)','소방',      '소방설비 관리',  'rgba(220,252,231,.15)','#6ee7b7',      '정상')}
          ${mCard('records',      '📋','rgba(240,253,244,.10)','작업기록',  '전체 기록 보기', 'rgba(240,253,244,.15)','#6ee7b7',      '8건')}
          ${mCard('memo',         '📒','rgba(243,232,255,.10)','학습 메모', '노트 & 자료',    'rgba(243,232,255,.15)','#c4b5fd',      '메모 3건')}
          <div class="gc mc mwide" onclick="goto('roadmap')">
            <div class="mwi">
              <div class="mi" style="background:rgba(239,246,255,.10)">📅</div>
              <div style="flex:1">
                <div class="mn">연간 로드맵</div>
                <div class="ms">2025년 전체 계획 · 월별 일정</div>
              </div>
              <div class="bprev">
                <div class="bar" style="height:28px;background:var(--green);opacity:.7"></div>
                <div class="bar" style="height:18px;background:var(--orange);opacity:.7"></div>
                <div class="bar" style="height:22px;background:var(--blue);opacity:.7"></div>
                <div class="bar" style="height:10px;background:rgba(255,255,255,.2)"></div>
              </div>
            </div>
          </div>
        </div>
      </div>

    </div>
  </div>`;
  initChecklist();
}

/* ════════════════════════════════════════════════
   5. PAGE: BA-DETAIL (전체 너비 흰 배경 상세)
════════════════════════════════════════════════ */
function baDetail() {
  $('page').innerHTML = `
  <div class="ba-detail-full">

    <!-- sticky 뒤로가기 바 -->
    <div class="ba-back-bar">
      <button class="ba-back-btn" onclick="goto('records')">← 목록으로 돌아가기</button>
      <span class="ba-back-title">3F 전기패널 MCB 교체 작업 · #2025-0319</span>
      <span class="ba-back-status">완료</span>
    </div>

    <!-- 본문 -->
    <div class="ba-detail-body">

      <!-- 작업 개요 -->
      <div class="ba-sec-title">작업 개요</div>
      <table class="ba-meta-table">
        <tr><th>작업 번호</th><td>#2025-0319</td></tr>
        <tr><th>작업 제목</th><td>3F 전기패널 MCB 교체 작업</td></tr>
        <tr><th>분류</th><td>전기 / 분전반</td></tr>
        <tr><th>작업자</th><td>홍길동</td></tr>
        <tr><th>작업 일자</th><td>2025년 3월 19일 (수)</td></tr>
        <tr><th>소요 시간</th><td>4시간 20분</td></tr>
        <tr><th>우선순위</th><td>⚠ 높음</td></tr>
        <tr><th>현재 상태</th><td style="color:#059669;font-weight:700">✓ 완료</td></tr>
        <tr><th>부품 비용</th><td>₩ 128,000</td></tr>
      </table>

      <!-- 작업 경위 -->
      <div class="ba-sec-title">작업 경위</div>
      <p>3층 분전반에서 MCB(배선용 차단기)의 과부하 트립이 반복 발생하여 현장 출동을 실시하였다. 초기 접수 시각은 오전 9시이며, 최초 신고자는 해당 층 입주사 담당자로, 전원 차단으로 인한 업무 중단이 발생한 상황이었다.</p>
      <p>현장 도착 후 분전반 내부를 확인한 결과, B형 30A 차단기가 과부하로 인해 트립 상태임을 확인하였다. 기존 차단기를 수동으로 재투입 시도하였으나 수 분 내에 재트립되어 부품 교체가 필요한 것으로 판단하였다.</p>

      <!-- BEFORE 사진 -->
      <div class="ba-photo-section">
        <div class="ba-sec-title">Before — 고장 전 상태</div>
        <div class="ba-photo-label before">● 고장 사진</div>

        <!-- 메인 사진 자리 (Firebase Storage URL 연결) -->
        <div class="ba-photo-main">
          <div class="ba-photo-ph" style="height:100%;display:flex">
            <div class="ph-icon">📷</div>
            <div class="ph-txt">메인 Before 사진 (Firebase Storage 연결)</div>
          </div>
        </div>

        <div class="ba-photo-grid">
          <div class="ba-photo-item">
            <div class="ba-photo-ph"><div class="ph-icon">📷</div><div class="ph-txt">분전반 전체</div></div>
          </div>
          <div class="ba-photo-item">
            <div class="ba-photo-ph"><div class="ph-icon">📷</div><div class="ph-txt">트립된 MCB 클로즈업</div></div>
          </div>
          <div class="ba-photo-item">
            <div class="ba-photo-ph"><div class="ph-icon">📷</div><div class="ph-txt">배선 상태</div></div>
          </div>
        </div>
      </div>

      <!-- AFTER 사진 -->
      <div class="ba-photo-section">
        <div class="ba-sec-title">After — 수리 완료 상태</div>
        <div class="ba-photo-label after">● 완료 사진</div>

        <div class="ba-photo-main">
          <div class="ba-photo-ph" style="height:100%;display:flex">
            <div class="ph-icon">📷</div>
            <div class="ph-txt">메인 After 사진 (Firebase Storage 연결)</div>
          </div>
        </div>

        <div class="ba-photo-grid">
          <div class="ba-photo-item">
            <div class="ba-photo-ph"><div class="ph-icon">📷</div><div class="ph-txt">교체된 MCB</div></div>
          </div>
          <div class="ba-photo-item">
            <div class="ba-photo-ph"><div class="ph-icon">📷</div><div class="ph-txt">정상 투입 확인</div></div>
          </div>
          <div class="ba-photo-item">
            <div class="ba-photo-ph"><div class="ph-icon">📷</div><div class="ph-txt">최종 점검표</div></div>
          </div>
        </div>
      </div>

      <!-- 비교 슬라이더 -->
      <div class="ba-sec-title">Before / After 비교</div>
      <div class="ba-compare-wrap">
        <div class="ctk" id="ctk">
          <div class="ctb"><span class="cfl">BEFORE</span></div>
          <div class="cta" id="cta"><span class="cfl">AFTER</span></div>
          <div class="cln" id="cln"></div>
          <div class="chn" id="chn">⇄</div>
        </div>
      </div>
      <p style="text-align:center;font-size:1rem;color:#999;margin-top:-2em;margin-bottom:4em">← 드래그하여 Before / After 비교 →</p>

      <!-- AI 분석 -->
      <div class="ba-sec-title">AI 분석 요약</div>
      <div class="ba-ai-box">
        <div class="ba-ai-header">
          <div class="ba-ai-icon">✦</div>
          <span class="ba-ai-title">AI 분석 요약</span>
          <span class="ba-ai-beta">Beta</span>
        </div>
        <div class="ba-ai-body">
          이 고장 유형(<span class="ba-ai-hi">MCB 과부하 트립</span>)은 최근 <span class="ba-ai-hi">3회 반복 발생</span>했습니다.
          동일 회로에서 계절적 냉방 부하 집중이 주요 원인으로 추정됩니다.
          <div class="ba-ai-rec">
            💡 예방 조치 추천: 해당 회로 부하 분산 재검토 및 40A급 차단기로 규격 상향 검토 → 여름철 냉방 시즌 전 시행 권장
          </div>
        </div>
      </div>

      <!-- 사용 부품 -->
      <div class="ba-sec-title">사용 부품 / 자재</div>
      <table class="ba-parts-table">
        <thead>
          <tr><th>품목명</th><th>규격</th><th>수량</th><th>단가</th><th>금액</th></tr>
        </thead>
        <tbody>
          <tr><td>MCB 차단기 (B형 30A)</td><td>LS산전 / BKN-b 30A</td><td>2</td><td>₩48,000</td><td>₩96,000</td></tr>
          <tr><td>인슐레이션 테이프</td><td>3M 스카치 / 19mm</td><td>1</td><td>₩4,000</td><td>₩4,000</td></tr>
          <tr><td>단자 접속 커버</td><td>범용 / 분전반용</td><td>4</td><td>₩7,000</td><td>₩28,000</td></tr>
        </tbody>
        <tfoot>
          <tr><td colspan="4">총 부품 비용</td><td>₩128,000</td></tr>
        </tfoot>
      </table>

      <!-- 액션 버튼 -->
      <div class="ba-actions-full">
        <button class="ba-btn-primary">✏️ 수정하기</button>
        <button class="ba-btn-ghost">📄 PDF 저장</button>
        <button class="ba-btn-ghost">🔗 공유하기</button>
      </div>

    </div><!-- /ba-detail-body -->
  </div><!-- /ba-detail-full -->
  `;
  initSlider();
}

/* ════════════════════════════════════════════════
   6. PAGE: RECORDS
════════════════════════════════════════════════ */
function records() {
  $('page').innerHTML = `<div class="pi">
    ${bc('작업기록')}
    <div class="glass fu" style="padding:18px;margin-bottom:16px;display:flex;align-items:center;gap:14px">
      <div style="width:50px;height:50px;border-radius:14px;background:rgba(16,185,129,.15);display:flex;align-items:center;justify-content:center;font-size:24px">📋</div>
      <div>
        <div style="font-size:18px;font-weight:700;color:var(--t1)">작업기록</div>
        <div style="font-size:13px;color:var(--t3)">전체 작업 이력 및 Before/After 사진</div>
      </div>
      <button class="btn-o" style="margin-left:auto" onclick="goto('ba-detail')">＋ 새 기록</button>
    </div>
    <div class="slbl fu1" style="margin-bottom:12px">최근 기록</div>
    <div style="display:flex;flex-direction:column;gap:10px">
      ${recItem('3F 전기패널 MCB 교체','전기','홍길동','2025.03.19')}
      ${recItem('냉각탑 필터 교체','기계','김철수','2025.03.15')}
      ${recItem('소방 감지기 점검','소방','이영희','2025.03.10')}
      ${recItem('옥상 방수 균열 보수','영선','홍길동','2025.03.05')}
    </div>
  </div>`;
}

function recItem(t, cat, w, d) {
  return `<div class="gc fu" style="padding:14px 16px;cursor:pointer;display:flex;align-items:center;gap:14px" onclick="goto('ba-detail')">
    <div style="width:42px;height:42px;border-radius:11px;background:rgba(29,78,216,.15);display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0">📋</div>
    <div style="flex:1;min-width:0">
      <div style="font-size:14px;font-weight:600;color:var(--t1);margin-bottom:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${t}</div>
      <div style="font-size:11px;color:var(--t3)">${cat} · ${w} · ${d}</div>
    </div>
    <span class="rb rb-done">완료</span>
    <span style="color:var(--t4);font-size:14px">›</span>
  </div>`;
}

/* ════════════════════════════════════════════════
   7. SIMPLE PAGES (미구현)
════════════════════════════════════════════════ */
function simplePage(icon, title, sub) {
  $('page').innerHTML = `<div class="pi">
    ${bc(title)}
    <div class="glass fu" style="padding:22px;margin-bottom:16px;display:flex;align-items:center;gap:16px">
      <div style="width:56px;height:56px;border-radius:16px;background:rgba(255,255,255,.08);display:flex;align-items:center;justify-content:center;font-size:28px">${icon}</div>
      <div>
        <div style="font-size:20px;font-weight:700;color:var(--t1)">${title}</div>
        <div style="font-size:13px;color:var(--t3);margin-top:3px">${sub}</div>
      </div>
      <button class="btn-o" style="margin-left:auto">＋ 추가</button>
    </div>
    <div class="glass fu1" style="text-align:center;padding:60px 20px;color:var(--t4)">
      <div style="font-size:40px;margin-bottom:12px;opacity:.35">🚧</div>
      <div style="font-size:14px;line-height:2">이 페이지는 준비 중입니다.<br>기능은 순차적으로 구현될 예정입니다.</div>
    </div>
  </div>`;
}
function electric()     { simplePage('⚡', '전기',       '전기설비 점검 및 수리 기록'); }
function mechanical()   { simplePage('⚙️', '기계',       '기계설비 유지보수 기록'); }
function construction() { simplePage('🔨', '영선',       '건축·인테리어 작업 기록'); }
function fire()         { simplePage('🔥', '소방',       '소방설비 점검 및 관리'); }
function memo()         { simplePage('📒', '학습 메모',  '기술 메모 & 학습 자료'); }
function roadmap()      { simplePage('📅', '연간 로드맵','2025년 전체 계획'); }
function search()       { simplePage('🔍', '검색',       '전체 기록 통합 검색'); }
function contacts()     { simplePage('📇', '연락처',     '협력업체 및 담당자'); }
function stats()        { simplePage('📊', '통계',       '작업 완료율 및 현황'); }
function settings()     { simplePage('⚙',  '설정',       '계정 및 앱 설정'); }

/* ════════════════════════════════════════════════
   8. INTERACTIONS
════════════════════════════════════════════════ */

/* 체크리스트 */
function initChecklist() {
  document.querySelectorAll('.chk').forEach(c => {
    c.addEventListener('click', () => {
      c.classList.toggle('on');
      c.textContent = c.classList.contains('on') ? '✓' : '';
      c.nextElementSibling.classList.toggle('done', c.classList.contains('on'));
      const all  = document.querySelectorAll('.chk').length;
      const done = document.querySelectorAll('.chk.on').length;
      const pct  = Math.round(done / all * 100);
      const pf = $('pf'); if (pf) pf.style.width = pct + '%';
      const cc = $('cc'); if (cc) cc.textContent = `${done} / ${all} 완료`;
      const cp = $('cp'); if (cp) cp.textContent = pct + '%';
    });
  });
}

/* 비교 슬라이더 */
function initSlider() {
  const track  = $('ctk');
  const after  = $('cta');
  const line   = $('cln');
  const handle = $('chn');
  if (!track || !after) return;
  let drag = false;

  function set(x) {
    const r   = track.getBoundingClientRect();
    const pct = Math.max(0, Math.min(100, ((x - r.left) / r.width) * 100));
    after.style.clipPath = `inset(0 ${(100 - pct).toFixed(1)}% 0 0)`;
    line.style.left      = pct + '%';
    handle.style.left    = pct + '%';
  }

  track.addEventListener('mousedown',  e => { drag = true; set(e.clientX); });
  window.addEventListener('mousemove', e => { if (drag) set(e.clientX); });
  window.addEventListener('mouseup',   () => { drag = false; });
  track.addEventListener('touchstart', e => { drag = true; set(e.touches[0].clientX); }, { passive: true });
  window.addEventListener('touchmove', e => { if (drag) set(e.touches[0].clientX); }, { passive: true });
  window.addEventListener('touchend',  () => { drag = false; });
}

/* ════════════════════════════════════════════════
   9. THEME TOGGLE
════════════════════════════════════════════════ */
function initTheme() {
  const sw = $('tsw');
  if (!sw) return;
  sw.addEventListener('click', () => {
    S.dark = !S.dark;
    $('tsk').style.left = S.dark ? '22px' : '3px';
    /* 추후 라이트 모드 CSS 변수 전환 로직 추가 */
  });
}

/* ════════════════════════════════════════════════
   10. BOOT
════════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', () => {
  /* 사이드바 클릭 */
  document.querySelectorAll('.nb[data-p]').forEach(b => {
    b.addEventListener('click', () => goto(b.dataset.p));
  });

  /* 로그인 버튼 */
  const bg = $('btn-google');
  const gg = $('btn-guest');
  if (bg) bg.addEventListener('click', loginGoogle);
  if (gg) gg.addEventListener('click', loginGuest);

  initTheme();
  initFB();
});

/* 전역 노출 (onclick 인라인 속성에서 호출) */
window.goto         = goto;
window.loginGoogle  = loginGoogle;
window.loginGuest   = loginGuest;
window.logout       = logout;
