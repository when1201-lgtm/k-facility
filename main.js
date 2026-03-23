/* =====================================================
   K-Facility — main.js  v4.0  (완전판)
   ─────────────────────────────────────────────────
   ✅ Firebase initializeApp 실제 초기화
   ✅ Firestore 실시간 구독 (onSnapshot)
   ✅ 매뉴얼 추가/수정/삭제 → Firestore
   ✅ 작업기록 추가/수정/삭제 → Firestore + Storage
   ✅ 학습메모 추가/수정/삭제 → Firestore
   ✅ 사진 업로드 → 800px 압축 → Storage → URL 저장
   ✅ 삭제 시 Storage 파일 동시 삭제
   ✅ 게스트 모드 → 로컬 메모리 fallback (샘플 데이터)
   ─────────────────────────────────────────────────
   수정 가이드
     HTML 구조 → index.html
     디자인    → style.css
     로직      → main.js (여기)
===================================================== */

/* =====================================================
   ① FIREBASE 설정
   Firebase Console → 프로젝트 설정 → 웹 앱 → 구성 복사
===================================================== */
const FB_CFG = {
  apiKey:            'AIzaSyCBCG_qBYywBUXBlF47Fg_xXX_nDZTz51Y',
  authDomain:        'k-facility.firebaseapp.com',
  projectId:         'k-facility',
  storageBucket:     'k-facility.firebasestorage.app',
  messagingSenderId: '709908883593',
  appId:             '1:709908883593:web:a56d2220c227cd72783e58',
  measurementId:     'G-CZHK5FQ4Q7',
};

/* Firebase 인스턴스 */
let db      = null;
let storage = null;
let auth    = null;

/* Firestore 실시간 구독 해제 함수 */
let _unsubLogs     = null;
let _unsubMemos    = null;
let _unsubSch      = null;
let _unsubManuals  = null;

/* =====================================================
   ② GLOBAL STATE
===================================================== */
const S = {
  currentPage:      'home',
  user:             null,
  isGuest:          false,
  fbReady:          false,
  /* 편집 중인 문서 ID */
  editLogId:        null,
  editMemoId:       null,
  editSchId:        null,
  editManualCat:    null,
  editManualId:     null,
  /* 현재 보고 있는 매뉴얼 */
  viewManualCat:    null,
  viewManualId:     null,
  /* 필터 */
  logCatFilter:     '전체',
  logStatusFilter:  '전체',
  memoFilter:       '전체',
  activeMonth:      new Date().getMonth() + 1,
  /* 매뉴얼 체크리스트 (로컬) */
  checklistState:   {},
  /* 사진 업로드 버퍼: [{file, url, existing, storagePath}] */
  uploadPhotos:     [],
  /* 모달 현재 사진 input target */
  photoTarget:      null,
};

/* =====================================================
   ③ 메모리 데이터 (Firebase/게스트 모두 여기서 읽음)
===================================================== */
let logs      = [];
let memos     = [];
let schedules = [];
let contacts  = [];
let manuals   = { electric:[], mechanical:[], construction:[], fire:[] };

/* ── 게스트용 샘플 데이터 ── */
const SAMPLE_LOGS = [
  { id:'sl1', title:'3F 전기패널 MCB 교체', cat:'전기', status:'완료', worker:'홍길동', date:'2025-03-19', desc:'분전반 MCB 과부하 트립 반복. B형 30A 차단기 교체 및 부하 재분배 처리.', photos:[], storagePaths:[] },
  { id:'sl2', title:'냉각탑 필터 교체',     cat:'기계', status:'완료', worker:'김철수', date:'2025-03-15', desc:'냉각탑 필터 오염 심각. 신규 필터 교체 및 수질 점검 완료.',              photos:[], storagePaths:[] },
  { id:'sl3', title:'소방 감지기 점검',     cat:'소방', status:'완료', worker:'이영희', date:'2025-03-10', desc:'전층 감지기 동작 시험 완료. 3개소 감도 불량 교체.',                    photos:[], storagePaths:[] },
  { id:'sl4', title:'옥상 방수 균열 보수',  cat:'영선', status:'완료', worker:'홍길동', date:'2025-03-05', desc:'옥상 신축줄눈 균열 에폭시 주입 보수.',                                 photos:[], storagePaths:[] },
  { id:'sl5', title:'보일러 점화 점검',     cat:'기계', status:'진행중',worker:'김철수', date:'2025-03-20', desc:'보일러 버너 점화 불량. 부품 교체 대기 중.',                           photos:[], storagePaths:[] },
  { id:'sl6', title:'1F 화장실 누수 수리',  cat:'기계', status:'대기',  worker:'미정',   date:'2025-03-22', desc:'1F 남자화장실 세면대 배관 누수. 자재 구매 대기.',                     photos:[], storagePaths:[] },
];

const SAMPLE_MEMOS = [
  { id:'sm1', title:'MCB 차단기 종류와 선정 기준', cat:'전기', date:'2025-03-10',
    content:'B형: 일반 부하(모터 미포함), C형: 모터·변압기 포함 회로\n선정 기준: 부하전류 × 1.25 이상의 정격 선택\n설치 시 동일 규격의 차단기만 교체 가능',
    tags:['MCB','차단기','전기기초'] },
  { id:'sm2', title:'냉각탑 점검 주기 및 항목', cat:'기계', date:'2025-03-08',
    content:'월간: 수질 검사(pH, 전기전도도), 필터 청소\n분기: 팬·모터 오일 보충, 벨트 장력 점검\n연간: 완전 청소·소독, 레지오넬라균 검사\n\n*여름철(6~9월)은 격주 수질 검사 권장',
    tags:['냉각탑','기계설비','정기점검'] },
  { id:'sm3', title:'소방 법정 점검 주기 정리', cat:'소방', date:'2025-03-05',
    content:'작동기능점검: 연 1회 이상 (7~9월)\n종합정밀점검: 연 1회 이상 (1~6월)\n소화기 자체점검: 매월\n\n*소방시설법 제25조 기준',
    tags:['소방법','정기점검','법정'] },
  { id:'sm4', title:'균열 폭 기준 및 보수 방법', cat:'영선', date:'2025-03-01',
    content:'0.2mm 미만: 표면 도포 보수\n0.2~0.5mm: 에폭시 주입 보수\n0.5mm 이상: 구조 전문가 진단 필수\n\n*콘크리트 균열 지침서(KCI) 기준',
    tags:['균열','영선','보수'] },
];

const SAMPLE_SCHEDULES = [
  {id:'ds1', month:1,  type:'법정', title:'소방 시설 정기 점검',           desc:'소방 완공검사 증명서, 작동기능점검표 보관 확인'},
  {id:'ds2', month:1,  type:'계절', title:'동파 방지 순찰 강화',            desc:'노출 배관 단열재 점검, 수도 계량기함 보온 상태 확인'},
  {id:'ds3', month:2,  type:'정기', title:'비상 발전기 월간 점검 및 시운전', desc:'냉각수·오일·배터리 상태 확인, 30분 이상 무부하 시운전'},
  {id:'ds4', month:3,  type:'계절', title:'해빙기 건물 점검',               desc:'외벽 균열·누수·기초 침하 확인, 옥상 방수 상태 점검'},
  {id:'ds5', month:3,  type:'법정', title:'승강기 정기 검사 준비',           desc:'관할 기관에 검사 신청, 검사 전 자체 점검 실시'},
  {id:'ds6', month:4,  type:'계절', title:'냉방 설비 가동 전 점검',          desc:'냉각탑 청소, 냉동기 오일·냉매 충전량 확인'},
  {id:'ds7', month:5,  type:'법정', title:'전기 안전 점검',                 desc:'수전설비, 변압기, 배전반 정밀 점검, 절연저항 측정'},
  {id:'ds8', month:6,  type:'계절', title:'우기 대비 방수·배수 점검',        desc:'옥상·지하 방수 상태, 빗물 배수로·집수정 청소'},
  {id:'ds9', month:7,  type:'정기', title:'냉각탑 레지오넬라균 검사 및 청소', desc:'냉각수 수질 검사, 냉각탑 청소·소독 실시'},
  {id:'ds10',month:8,  type:'계절', title:'하절기 전력 피크 대비 점검',       desc:'수변전 설비 과부하 모니터링, 냉방 부하 분산 계획'},
  {id:'ds11',month:9,  type:'계절', title:'난방 설비 가동 전 점검',          desc:'보일러 청소·연소 상태 확인, 온수 배관 밸브 점검'},
  {id:'ds12',month:10, type:'법정', title:'소방 시설 종합 정밀 점검',        desc:'소방 펌프, 수신기, 유도등, 비상 방송 전체 점검'},
  {id:'ds13',month:10, type:'법정', title:'승강기 자체 안전 점검',           desc:'승강기 안전 부품 점검표 작성 및 자체 점검 실시'},
  {id:'ds14',month:11, type:'계절', title:'동파 방지 조치',                 desc:'노출 배관 보온재 설치, 동파 우려 배관 배수 처리'},
  {id:'ds15',month:12, type:'정기', title:'연간 시설 점검 결과 보고서 작성', desc:'연간 점검 이력 정리, 다음 연도 예방 보수 계획 및 예산 요청'},
];

const SAMPLE_CONTACTS = [
  {id:'c1', name:'홍길동',       role:'전기 담당',  company:'K-Facility', phone:'010-1234-5678', email:'hong@kfacility.com'},
  {id:'c2', name:'김철수',       role:'기계 담당',  company:'K-Facility', phone:'010-2345-6789', email:'kim@kfacility.com'},
  {id:'c3', name:'LS전기 AS센터',role:'전기 협력사', company:'LS산전',     phone:'1588-1234',    email:''},
  {id:'c4', name:'삼보소방',     role:'소방 점검',   company:'삼보소방',   phone:'02-555-7890',  email:''},
];

const SAMPLE_MANUALS = {
  electric: [
    { id:'me1', title:'분전반 MCB 차단기 교체', tags:['MCB','차단기'],
      overview:'과부하·단락으로 트립된 MCB를 안전하게 교체하는 절차입니다.',
      supplies:['드라이버(+/-)','절연 장갑','검전기','교체용 MCB','절연 테이프'],
      cautions:['주 차단기 OFF 후 작업','검전기로 무전압 확인','동일 용량 MCB 사용'],
      steps:[
        {title:'전원 차단 및 잠금', desc:'주 차단기를 OFF하고 LOTO를 적용합니다. 검전기로 무전압을 확인합니다.',   youtube:''},
        {title:'기존 MCB 제거',    desc:'상·하단 전선을 순서대로 분리합니다. 단자 위치를 사진으로 기록해두세요.', youtube:''},
        {title:'신규 MCB 설치',    desc:'동일 규격 MCB를 딘레일에 고정하고 전선을 원래 순서대로 재결선합니다.',   youtube:''},
        {title:'투입 테스트',      desc:'주 차단기 투입 후 MCB를 ON 합니다. 정상 전압 공급 여부를 확인합니다.',  youtube:''},
      ],
      checklist:['주 차단기 OFF 확인','검전기 무전압 확인','MCB 사양 메모','결선 사진 촬영','신규 MCB 규격 확인','투입 후 전압 측정'],
      caution:'활선 작업 절대 금지. 반드시 정전 확인 후 진행하십시오.',
      tip:'MCB 교체 후 12시간 모니터링을 권장합니다.' },
  ],
  mechanical: [
    { id:'mm1', title:'냉각탑 필터 청소 및 교체', tags:['냉각탑','필터'],
      overview:'냉각탑 효율 유지를 위한 정기 필터 청소 및 교체 절차입니다.',
      supplies:['고압 세척기','필터 교체품','방수 장갑','안전화'],
      cautions:['냉각탑 전원 차단','고소 작업 시 안전대 착용'],
      steps:[
        {title:'전원 차단',      desc:'냉각탑 제어판에서 전원을 차단하고 잠금합니다.',                          youtube:''},
        {title:'필터 탈거',      desc:'기존 필터를 탈거하고 오염 상태를 확인합니다.',                          youtube:''},
        {title:'청소/교체',      desc:'오염이 경미하면 고압 세척, 심하면 신규 필터로 교체합니다.',              youtube:''},
        {title:'재장착 및 기동', desc:'필터 재장착 후 전원을 투입하고 정상 운전을 확인합니다.',                 youtube:''},
      ],
      checklist:['전원 차단','필터 상태 확인','청소 또는 교체','재장착 완료','정상 운전 확인'],
      caution:'냉각수 온도 확인 후 작업 진행.', tip:'필터는 3개월마다 점검을 권장합니다.' },
  ],
  construction: [
    { id:'mc1', title:'벽면 균열 보수 (에폭시 주입)', tags:['균열','에폭시','방수'],
      overview:'콘크리트 벽 균열에 에폭시를 주입하여 구조적 보강을 수행하는 절차입니다.',
      supplies:['에폭시 주입기','믹서 노즐','표면 처리제','방진 마스크','보호 안경'],
      cautions:['에폭시 피부 접촉 주의','환기 충분히 확보'],
      steps:[
        {title:'균열 정밀 조사', desc:'균열 길이·깊이·방향을 기록하고 사진을 촬영합니다.',                     youtube:''},
        {title:'주입구 설치',   desc:'균열을 따라 20~30cm 간격으로 주입 패커를 설치합니다.',                   youtube:''},
        {title:'표면 실링',     desc:'균열 표면을 에폭시 퍼티로 밀봉합니다.',                                  youtube:''},
        {title:'에폭시 주입',   desc:'저압 주입기로 말단에서 순서대로 에폭시를 주입합니다.',                    youtube:''},
        {title:'경화 및 마감',  desc:'24시간 이상 경화 후 패커를 제거하고 표면을 마감합니다.',                  youtube:''},
      ],
      checklist:['균열 촬영','주입구 간격 확인','표면 실링 완료','에폭시 주입 완료','경화 확인'],
      caution:'기온 5°C 이하에서는 작업을 중단하십시오.', tip:'주입 전 균열에 이물질을 에어건으로 제거하세요.' },
  ],
  fire: [
    { id:'mf1', title:'스프링클러 헤드 교체', tags:['스프링클러','소방'],
      overview:'파손되거나 오작동한 스프링클러 헤드를 교체하는 절차입니다.',
      supplies:['스프링클러 헤드 렌치','교체용 헤드 (동일 규격)','테플론 테이프'],
      cautions:['소방 제어반에 작업 통보','급수 밸브 차단 필수'],
      steps:[
        {title:'소방 제어반 통보', desc:'작업 시작을 통보하고 해당 구역 급수 밸브를 차단합니다.',               youtube:''},
        {title:'기존 헤드 제거',  desc:'스프링클러 렌치로 기존 헤드를 제거합니다.',                            youtube:''},
        {title:'신규 헤드 설치',  desc:'나사산에 테플론 테이프를 감고 신규 헤드를 설치합니다.',                 youtube:''},
        {title:'방수 시험',       desc:'급수 밸브를 천천히 열고 누수 여부를 확인합니다.',                       youtube:''},
        {title:'복구 및 보고',    desc:'소방 제어반에 작업 완료를 통보하고 작업 일지를 작성합니다.',            youtube:''},
      ],
      checklist:['제어반 통보','급수 밸브 차단','헤드 규격 확인','테플론 테이프 적용','누수 없음 확인','제어반 복구 보고'],
      caution:'소방 제어반 통보 없이 작업 시 오경보 발생 위험.', tip:'헤드 교체 후 반드시 방수 시험을 실시하세요.' },
  ],
};

/* =====================================================
   ④ HELPERS
===================================================== */
const $      = id  => document.getElementById(id);
const esc    = s   => String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
const today  = ()  => new Date().toISOString().slice(0, 10);
const genId  = ()  => Math.random().toString(36).slice(2, 9) + Date.now().toString(36);

const MONTH_NAMES   = ['','1월','2월','3월','4월','5월','6월','7월','8월','9월','10월','11월','12월'];
const CAT_ICON      = { 전기:'⚡', 기계:'⚙️', 영선:'🔨', 소방:'🔥', 기타:'📋' };
const CAT_KEY_MAP   = { electric:'전기', mechanical:'기계', construction:'영선', fire:'소방' };
const CAT_KEY_REV   = { 전기:'electric', 기계:'mechanical', 영선:'construction', 소방:'fire' };
const STATUS_COLOR  = { 완료:'var(--green)', 진행중:'var(--blue)', 대기:'var(--amber)' };
const SCH_TYPE_STYLE = {
  법정:{ bg:'rgba(244,63,94,.15)',  border:'rgba(244,63,94,.3)',  color:'var(--red)'   },
  정기:{ bg:'rgba(29,78,216,.15)',  border:'rgba(29,78,216,.3)',  color:'var(--blue)'  },
  계절:{ bg:'rgba(16,185,129,.15)', border:'rgba(16,185,129,.3)', color:'var(--green)' },
};
const MEMO_COLORS = {
  전기:'rgba(224,92,10,.2)', 기계:'rgba(29,78,216,.2)',
  영선:'rgba(245,158,11,.2)', 소방:'rgba(244,63,94,.2)', 일반:'rgba(255,255,255,.1)',
};
const CONTACT_COLORS = ['#e05c0a','#1d4ed8','#10b981','#7c3aed','#f59e0b','#0d9488'];

/* 토스트 */
function toast(msg, dur = 2500) {
  let t = $('kf-toast');
  if (!t) { t = document.createElement('div'); t.id = 'kf-toast'; document.body.appendChild(t); }
  t.textContent = msg;
  t.style.cssText = 'position:fixed;bottom:88px;left:50%;transform:translateX(-50%) translateY(0);background:rgba(12,16,32,.96);color:#fff;padding:11px 22px;border-radius:99px;font-size:14px;font-weight:600;z-index:99999;opacity:1;transition:opacity .3s;white-space:nowrap;border:1px solid rgba(255,255,255,.15);pointer-events:none';
  clearTimeout(t._t);
  t._t = setTimeout(() => { t.style.opacity = '0'; }, dur);
}

/* ── 인증 로딩 스피너 제어 ──
   페이지 진입 시 스피너만 보이다가
   onAuthStateChanged 결과가 오면 정확한 화면으로 전환 */
function hideAuthLoader() {
  const loader = document.getElementById('auth-loader');
  const app    = document.getElementById('app');
  /* ★ class="hidden" 제거 + style 초기화 모두 적용 */
  if (app) {
    app.classList.remove('hidden');
    app.style.display = '';
  }
  if (!loader || loader.style.display === 'none') return;
  loader.style.opacity = '0';
  setTimeout(() => { loader.style.display = 'none'; }, 260);
}

function showLoginScreen() {
  const lov = document.getElementById('lov');
  if (lov) {
    lov.classList.remove('hidden');
    lov.style.display = 'flex';
  }
}

/* 라이트박스 */
function previewPhoto(url) {
  let ov = $('kf-lightbox');
  if (!ov) { ov = document.createElement('div'); ov.id = 'kf-lightbox'; document.body.appendChild(ov); }
  ov.className = 'open';
  ov.innerHTML = `<img src="${url}">`;
  ov.onclick = () => ov.className = '';
}

/* =====================================================
   ⑤ FIREBASE 초기화
===================================================== */
function initFirebase() {
  if (typeof firebase === 'undefined') {
    console.info('[K-Facility] Firebase SDK 없음 → 게스트 모드로 동작');
    hideAuthLoader();          /* SDK 없어도 스피너 반드시 해제 */
    showLoginScreen();
    loadGuestData();
    return;
  }
  try {
    if (!firebase.apps.length) firebase.initializeApp(FB_CFG);
    db      = firebase.firestore();
    storage = firebase.storage();
    auth    = firebase.auth();
    S.fbReady = true;

    /* 오프라인 캐시 */
    db.enablePersistence({ synchronizeTabs: true }).catch(() => {});

    /* ── onAuthStateChanged: 최초 1회 결과가 오면 스피너 숨기고 화면 결정 ── */
    let _firstAuthCheck = true;   /* 첫 번째 콜백 여부 */
    auth.onAuthStateChanged(user => {
      if (user) {
        console.log('%c[K-Facility] ✅ 로그인 감지', 'color:#10b981;font-weight:bold',
          user.displayName, user.uid);
        hideAuthLoader();          /* 스피너 숨기고 #app 표시 */
        doLogin(user, false);
      } else {
        console.log('%c[K-Facility] 👤 미로그인 (onAuthStateChanged null)', 'color:#f59e0b;font-weight:bold');
        hideAuthLoader();          /* 스피너 숨기고 #app 표시 */
        showLoginScreen();         /* 로그인 화면만 표시 */
      }
      _firstAuthCheck = false;
    });

    /* 설정 페이지 상태 표시 */
    updateFbStatusUI(true);

  } catch (e) {
    console.error('[K-Facility] Firebase 초기화 실패:', e);
    hideAuthLoader();          /* 실패해도 스피너 반드시 해제 */
    showLoginScreen();         /* 로그인 화면 표시 */
    loadGuestData();
    updateFbStatusUI(false, e.message);
  }
}

function updateFbStatusUI(ok, msg) {
  const badge = $('fb-status-badge');
  const desc  = $('fb-status');
  if (badge) { badge.textContent = ok ? '연결됨' : '미연결'; badge.style.color = ok ? 'var(--green)' : 'var(--red)'; }
  if (desc)  desc.textContent = ok ? 'Firestore & Storage 활성화' : (msg || 'SDK 미연결');
}

/* =====================================================
   ⑥ 인증
===================================================== */
function loginGoogle() {
  if (!S.fbReady) {
    alert('FB_CFG 값을 입력하고 index.html SDK 4줄 주석을 해제하세요.');
    return;
  }
  const p = new firebase.auth.GoogleAuthProvider();
  firebase.auth().signInWithPopup(p)
    .then(r => doLogin(r.user, false))
    .catch(e => toast('⚠️ 로그인 실패: ' + e.message));
}

function loginGuest() {
  hideAuthLoader();   /* 혹시 스피너가 남아있으면 제거 */
  doLogin({ displayName:'게스트', uid:'guest', email:'' }, true);
}

function doLogin(user, isGuest) {
  console.log('%c[K-Facility] doLogin 진입', 'color:#1d4ed8;font-weight:bold',
    { name: user.displayName, guest: isGuest, fbReady: S.fbReady });
  S.user    = user;
  S.isGuest = isGuest;
  const init = (user.displayName || 'U')[0].toUpperCase();
  const ava  = $('ava');   if (ava)  { ava.textContent = init; if (isGuest) ava.style.background = 'linear-gradient(135deg,#64748b,#475569)'; }
  const un   = $('uname'); if (un)   un.textContent = user.displayName || '사용자';
  const em   = $('settings-user-email'); if (em) em.textContent = user.email || (isGuest ? '게스트 모드' : '');
  /* 로그인 오버레이 닫기 */
  const _lov = document.getElementById('lov');
  if (_lov) { _lov.classList.add('hidden'); _lov.style.display = ''; }

  if (S.fbReady && !isGuest) {
    subscribeFirestore();
  } else {
    loadGuestData();
    goto('home');
  }
}

function logout() {
  unsubAll();
  if (S.fbReady && !S.isGuest && auth) {
    firebase.auth().signOut().then(() => location.reload());
  } else {
    location.reload();
  }
}

/* 게스트 / 오프라인: 샘플 데이터 로드 */
function loadGuestData() {
  logs      = [...SAMPLE_LOGS];
  memos     = [...SAMPLE_MEMOS];
  schedules = [...SAMPLE_SCHEDULES];
  contacts  = [...SAMPLE_CONTACTS];
  manuals   = JSON.parse(JSON.stringify(SAMPLE_MANUALS));
}

/* =====================================================
   ⑦ FIRESTORE 실시간 구독
   ★ 필수 색인 (Firebase Console → Firestore → 색인)
     logs      → date 내림차순
     memos     → date 내림차순
     schedules → month 오름차순
===================================================== */
function subscribeFirestore() {
  console.log('%c[K-Facility] Firestore 실시간 구독 시작 ✨', 'color:#7c3aed;font-weight:bold');

  /* ★ 작업기록 — orderBy 없이 전체 구독 (색인 불필요)
     JS 레벨에서 date 내림차순 정렬 */
  _unsubLogs = db.collection('logs')
    .onSnapshot(snap => {
      logs = snap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
      console.log('[K-Facility] logs 수신:', logs.length + '건');
      renderHome();
      if (S.currentPage === 'records') renderRecords();
    }, e => console.error('[logs 구독 오류]', e));

  /* ★ 학습메모 — 동일하게 JS 정렬 */
  _unsubMemos = db.collection('memos')
    .onSnapshot(snap => {
      memos = snap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
      console.log('[K-Facility] memos 수신:', memos.length + '건');
      if (S.currentPage === 'memo') renderMemo();
    }, e => console.error('[memos 구독 오류]', e));

  /* ★ 연간 로드맵 — orderBy('month') 제거 → JS 정렬 */
  _unsubSch = db.collection('schedules')
    .onSnapshot(snap => {
      console.log('[K-Facility] schedules 수신:', snap.size + '건');
      if (snap.empty) {
        const b = db.batch();
        SAMPLE_SCHEDULES.forEach(s => b.set(db.collection('schedules').doc(s.id), s));
        b.commit();
        schedules = [...SAMPLE_SCHEDULES];
      } else {
        schedules = snap.docs
          .map(d => ({ id: d.id, ...d.data() }))
          .sort((a, b) => (a.month || 0) - (b.month || 0));
      }
      /* 이번 달 일정 디버그 */
      const thisMonth = new Date().getMonth() + 1;
      const thisMonthList = schedules.filter(s => s.month === thisMonth);
      console.log('[K-Facility] 이번 달(' + thisMonth + '월) 일정:', thisMonthList.length + '건');
      renderHome();
      if (S.currentPage === 'roadmap') renderRoadmap();
    }, e => console.error('[schedules 구독 오류]', e));

  /* ★ 매뉴얼 — 그대로 (orderBy 없음, 정상) */
  _unsubManuals = db.collection('manuals')
    .onSnapshot(snap => {
      console.log('[K-Facility] manuals 수신:', snap.size + '건');
      if (snap.empty) {
        const b = db.batch();
        Object.entries(SAMPLE_MANUALS).forEach(([cat, list]) =>
          list.forEach(m => b.set(db.collection('manuals').doc(m.id), { ...m, cat }))
        );
        b.commit();
        manuals = JSON.parse(JSON.stringify(SAMPLE_MANUALS));
      } else {
        manuals = { electric:[], mechanical:[], construction:[], fire:[] };
        snap.docs.forEach(d => {
          const data = d.data();
          const cat  = data.cat || 'electric';
          if (manuals[cat]) manuals[cat].push({ id: d.id, ...data });
        });
      }
      ['electric','mechanical','construction','fire'].forEach(c => {
        if (S.currentPage === c) renderManualCat(c);
      });
    }, e => console.error('[manuals 구독 오류]', e));

  /* ★ 연락처 */
  db.collection('contacts').get().then(snap => {
    console.log('[K-Facility] contacts 수신:', snap.size + '건');
    if (snap.empty) {
      const b = db.batch();
      SAMPLE_CONTACTS.forEach(c => b.set(db.collection('contacts').doc(c.id), c));
      b.commit();
      contacts = [...SAMPLE_CONTACTS];
    } else {
      contacts = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    }
    if (S.currentPage === 'contacts') renderContacts();
  });

  goto('home');
}

function unsubAll() {
  [_unsubLogs, _unsubMemos, _unsubSch, _unsubManuals].forEach(fn => fn && fn());
}

/* =====================================================
   ⑧ 이미지 압축 (800px / JPEG 0.78)
===================================================== */
function compressImage(file, maxPx = 800, q = 0.78) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onerror = () => reject(new Error('파일 읽기 실패'));
    r.onload  = ev => {
      const img = new Image();
      img.onerror = () => reject(new Error('이미지 로드 실패'));
      img.onload  = () => {
        let w = img.width, h = img.height;
        if (w > maxPx || h > maxPx) {
          if (w >= h) { h = Math.round(h * maxPx / w); w = maxPx; }
          else        { w = Math.round(w * maxPx / h); h = maxPx; }
        }
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        canvas.toBlob(blob => {
          if (!blob) { reject(new Error('압축 실패')); return; }
          resolve(blob.size < file.size ? blob : file);
        }, 'image/jpeg', q);
      };
      img.src = ev.target.result;
    };
    r.readAsDataURL(file);
  });
}

/* Storage 업로드 → { url, storagePath } */
async function uploadPhoto(file, storagePath) {
  const blob = await compressImage(file);
  const ref  = storage.ref(storagePath);
  const snap = await ref.put(blob, { contentType:'image/jpeg' });
  const url  = await snap.ref.getDownloadURL();
  return { url, storagePath };
}

/* Storage 파일 삭제 */
async function deleteStorageFile(urlOrPath) {
  if (!storage || !urlOrPath) return;
  try {
    const ref = urlOrPath.startsWith('http') ? storage.refFromURL(urlOrPath) : storage.ref(urlOrPath);
    await ref.delete();
  } catch (e) {
    if (e.code !== 'storage/object-not-found') console.warn('[Storage 삭제]', e.message);
  }
}

/* =====================================================
   ⑨ ROUTER
===================================================== */
function goto(pageId) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  const target = $('page-' + pageId);
  if (target) { target.classList.add('active'); document.getElementById('pages').scrollTop = 0; }
  document.querySelectorAll('.nb').forEach(b => b.classList.toggle('active', b.dataset.p === pageId));
  S.currentPage = pageId;
  switch (pageId) {
    case 'home':         renderHome();                    break;
    case 'electric':     renderManualCat('electric');     break;
    case 'mechanical':   renderManualCat('mechanical');   break;
    case 'construction': renderManualCat('construction'); break;
    case 'fire':         renderManualCat('fire');         break;
    case 'records':      renderRecords();                 break;
    case 'records-detail': /* 데이터는 openLogDetail에서 주입 */ break;
    case 'memo':         renderMemo();                    break;
    case 'memo-detail':  /* openMemoDetail에서 주입 */    break;
    case 'roadmap':      renderRoadmap();                 break;
    case 'contacts':     renderContacts();                break;
    case 'stats':        renderStats();                   break;
    case 'manual-detail':renderManualDetail();            break;
    case 'search':       /* input focus로 트리거 */       break;
  }
}

/* =====================================================
   ⑩ MODAL (공용)
===================================================== */
function openModal(html) {
  $('modal-box').innerHTML = html;
  $('modal-overlay').classList.add('open');
}
function closeModal() {
  $('modal-overlay').classList.remove('open');
  S.uploadPhotos = [];
}

/* =====================================================
   ⑪ HOME
===================================================== */
function renderHome() {
  /* 날짜 */
  const de = $('home-date');
  if (de) de.textContent = new Date().toLocaleDateString('ko-KR', {year:'numeric',month:'long',day:'numeric',weekday:'short'});

  /* 최근 작업 2건 — Before/After 나란히 + 큰 이미지 */
  const mr = $('home-mini-row');
  if (mr) {
    if (logs.length) {
      mr.innerHTML = logs.slice(0, 2).map(l => {
        const beforeSrc = (l.beforePhotos||[])[0] || l.imageUrl || (l.photos||[])[0] || '';
        const afterSrc  = (l.afterPhotos||[])[0]  || (l.photos||[])[1] || '';
        const sc = STATUS_COLOR[l.status] || 'var(--t3)';

        /* Before/After 사진이 모두 있으면 나란히, 하나만 있으면 단독 */
        const photoHtml = (beforeSrc && afterSrc) ? `
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:2px;height:120px">
            <div style="position:relative;overflow:hidden">
              <img src="${beforeSrc}"
                style="width:100%;height:120px;object-fit:cover;display:block">
              <span style="position:absolute;bottom:4px;left:4px;background:rgba(244,63,94,.8);
                color:#fff;font-size:9px;font-weight:700;padding:2px 6px;border-radius:4px">BEFORE</span>
            </div>
            <div style="position:relative;overflow:hidden">
              <img src="${afterSrc}"
                style="width:100%;height:120px;object-fit:cover;display:block">
              <span style="position:absolute;bottom:4px;left:4px;background:rgba(16,185,129,.8);
                color:#fff;font-size:9px;font-weight:700;padding:2px 6px;border-radius:4px">AFTER</span>
            </div>
          </div>` : beforeSrc ? `
          <div style="height:120px;overflow:hidden">
            <img src="${beforeSrc}"
              style="width:100%;height:120px;object-fit:cover;display:block">
          </div>` : `
          <div style="height:80px;background:rgba(255,255,255,.05);
            display:flex;align-items:center;justify-content:center;
            font-size:28px;color:var(--t4)">${CAT_ICON[l.cat]||'📋'}</div>`;

        return `
        <div class="mini" style="cursor:pointer;padding:0;overflow:hidden;border-radius:12px;
             border:1px solid rgba(255,255,255,.1);flex:1;min-width:140px"
             onclick="openLogDetail('${l.id}')">
          ${photoHtml}
          <div style="padding:10px 12px">
            <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px">
              <span style="font-size:10px;font-weight:700;padding:2px 7px;border-radius:99px;
                background:${sc}22;color:${sc};border:1px solid ${sc}44">${esc(l.status||'')}</span>
              <span style="font-size:11px;color:var(--t3)">${esc(l.cat||'')}</span>
            </div>
            <div style="font-size:13px;font-weight:600;color:var(--t1);
              white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(l.title)}</div>
            <div style="font-size:11px;color:var(--t4);margin-top:3px">
              ${l.worker?esc(l.worker)+' · ':''}${l.date||''}
            </div>
          </div>
        </div>`;
      }).join('');
    } else {
      mr.innerHTML = `
        <div class="mini" style="opacity:.5;font-size:13px;color:var(--t3);
          text-align:center;padding:24px;border-radius:12px;
          border:1px dashed rgba(255,255,255,.12);flex:1">
          <div style="font-size:28px;margin-bottom:8px;opacity:.4">📋</div>
          작업기록 없음<br>
          <button class="btn-o" style="margin:12px auto 0;display:flex;font-size:12px;padding:7px 14px"
            onclick="openLogModal()">＋ 첫 기록 작성</button>
        </div>`;
    }
  }

  /* 이번 달 로드맵 */
  const rmm = $('home-rm-month');
  if (rmm) rmm.textContent = MONTH_NAMES[S.activeMonth] + ' 주요 일정';
  const rml = $('home-rm-list');
  if (rml) {
    const list = schedules.filter(s => s.month === S.activeMonth).slice(0, 5);
    rml.innerHTML = list.length ? list.map(s => {
      const done = false;
      return `<div class="ri">
        <div class="rdot ${done ? 'done' : 'todo'}"></div>
        <span class="rtxt">${esc(s.title)}</span>
        <span class="rb rb-todo">${esc(s.type)}</span>
      </div>`;
    }).join('') : '<div class="ri"><div class="rdot todo"></div><span class="rtxt" style="color:var(--t4)">이번 달 일정 없음</span></div>';
  }

  /* 통계 */
  const sv = (id, v) => { const e=$(id); if(e) e.textContent=v; };
  sv('h-stat-done', logs.filter(l=>l.status==='완료').length);
  sv('h-stat-prog', logs.filter(l=>l.status==='진행중').length);
  sv('h-stat-wait', logs.filter(l=>l.status==='대기').length);
  sv('h-stat-memo', memos.length);

  /* 체크리스트 */
  document.querySelectorAll('#home-ck-list .chk').forEach(chk => {
    if (!chk._bound) {
      chk._bound = true;
      chk.onclick = () => {
        chk.classList.toggle('on');
        chk.textContent = chk.classList.contains('on') ? '✓' : '';
        const ct = chk.nextElementSibling;
        if (ct) ct.classList.toggle('done', chk.classList.contains('on'));
        updateHomeProgress();
      };
    }
  });
  updateHomeProgress();
}

function updateHomeProgress() {
  const all  = document.querySelectorAll('#home-ck-list .chk').length;
  const done = document.querySelectorAll('#home-ck-list .chk.on').length;
  const pct  = all ? Math.round(done/all*100) : 0;
  const pf=$('pf'); if(pf) pf.style.width=pct+'%';
  const cc=$('ck-count'); if(cc) cc.textContent=done+' / '+all+' 완료';
  const cp=$('ck-pct');   if(cp) cp.textContent=pct+'%';
}

/* =====================================================
   ⑫ 매뉴얼 카테고리 목록
===================================================== */
function renderManualCat(catKey) {
  const list = manuals[catKey] || [];
  const cnt  = $(catKey + '-count'); if (cnt) cnt.textContent = '매뉴얼 ' + list.length + '건';
  const el   = $('manual-list-' + catKey); if (!el) return;

  el.innerHTML = list.length ? list.map(m => {
    /* ★ imageUrl 있으면 썸네일 표시 */
    const thumb = m.imageUrl
      ? `<img src="${m.imageUrl}" onclick="event.stopPropagation();previewPhoto('${m.imageUrl}')"
           class="mc-thumb" title="매뉴얼 대표 사진">`
      : `<div class="mc-num-badge">${(m.steps||[]).length}<span>단계</span></div>`;
    return `
    <div class="gc manual-card" onclick="viewManual('${catKey}','${m.id}')">
      ${thumb}
      <div class="mc-body">
        <div class="mc-title">${esc(m.title)}</div>
        <div class="mc-meta">
          <span>📦 준비물 ${(m.supplies||[]).length}개</span>
          <span>✅ 체크리스트 ${(m.checklist||[]).length}항목</span>
          <span>🔧 절차 ${(m.steps||[]).length}단계</span>
        </div>
        <div class="mc-tags">${(m.tags||[]).map(t=>`<span class="m-tag">${esc(t)}</span>`).join('')}</div>
      </div>
      <div class="card-actions" onclick="event.stopPropagation()">
        <button class="lc-btn lc-btn-edit" onclick="openManualModal('${catKey}','${m.id}')">✏️</button>
        <button class="lc-btn lc-btn-del"  onclick="deleteManual('${catKey}','${m.id}')">🗑</button>
      </div>
    </div>`;
  }).join('') :
  `<div class="gc" style="padding:48px;text-align:center;color:var(--t4)">
    <div style="font-size:36px;opacity:.3;margin-bottom:12px">📋</div>
    <div style="font-size:15px">등록된 매뉴얼이 없습니다</div>
    <button class="btn-o" style="margin:16px auto 0;display:flex" onclick="openManualModal('${catKey}')">＋ 첫 매뉴얼 추가</button>
  </div>`;
}

function viewManual(catKey, id) {
  S.viewManualCat = catKey;
  S.viewManualId  = id;
  goto('manual-detail');
}

/* =====================================================
   ⑬ 매뉴얼 상세
===================================================== */
function renderManualDetail() {
  const catKey = S.viewManualCat;
  const id     = S.viewManualId;
  if (!catKey || !id) return;
  const m = (manuals[catKey] || []).find(x => x.id === id);
  if (!m) return;
  const ckKey = catKey + '_' + id;
  if (!S.checklistState[ckKey]) S.checklistState[ckKey] = [];

  /* 빵가루 */
  const bc = $('md-bread-cat');
  if (bc) { bc.textContent = CAT_KEY_MAP[catKey] || catKey; bc.onclick = () => goto(catKey); }
  const bt = $('md-bread-title'); if (bt) bt.textContent = m.title;

  /* 헤더 */
  const sv = (id, v) => { const e=$(id); if(e) e.textContent=v; };
  sv('md-cat-badge', (CAT_ICON[CAT_KEY_MAP[catKey]]||'') + ' ' + (CAT_KEY_MAP[catKey]||catKey));
  sv('md-title',          m.title);
  sv('md-stat-steps',     '단계 '       + (m.steps     ||[]).length);
  sv('md-stat-supplies',  '준비물 '     + (m.supplies  ||[]).length);
  sv('md-stat-checklist', '체크리스트 ' + (m.checklist ||[]).length + '항목');
  const tagsEl = $('md-tags'); if (tagsEl) tagsEl.innerHTML = (m.tags||[]).map(t=>`<span class="m-tag">${esc(t)}</span>`).join('');

  /* 개요 */
  const ow = $('md-overview-wrap');
  if (ow) {
    const p = $('md-overview-text');
    if (m.overview) {
      ow.classList.remove('hidden');
      if (p) p.textContent = m.overview;
    } else {
      ow.classList.add('hidden');
    }
  }

  /* ① 준비물 */
  const sw = $('md-supplies-wrap');
  if (sw) {
    (m.supplies||[]).length ? sw.classList.remove('hidden') : sw.classList.add('hidden');
    const sc=$('md-supplies-count'); if(sc) sc.textContent=(m.supplies||[]).length+'개';
    const sl=$('md-supplies-list');
    if (sl) sl.innerHTML = (m.supplies||[]).map((s,i)=>`
      <div class="supply-item"><div class="supply-num">${i+1}</div><div class="supply-name">${esc(s)}</div></div>`).join('');
  }

  /* ② 안전주의사항 */
  const cauW = $('md-cautions-wrap');
  if (cauW) {
    (m.cautions||[]).length ? cauW.classList.remove('hidden') : cauW.classList.add('hidden');
    const cl=$('md-cautions-list');
    if (cl) cl.innerHTML = (m.cautions||[]).map((c,i)=>`
      <div class="caution-row"><div class="caution-num">${i+1}</div><div class="caution-txt">${esc(c)}</div></div>`).join('');
  }

  /* ③ 절차 타임라인 — {text, imgUrl} 신형 / {title, desc} 구형 / 문자열 모두 지원
       출력: 번호 → 설명 → 사진 순서로 1:1 매칭 */
  /* step-container = #step-container (index.html), fallback: md-steps-list */
  /* ③ 절차 — renderSteps()에 위임 */
  renderSteps(m.steps, 'step-container');

  /* ④ 체크리스트 */
  const ckW = $('md-checklist-wrap');
  if (ckW) {
    (m.checklist||[]).length ? ckW.classList.remove('hidden') : ckW.classList.add('hidden');
    updateCkUI(ckKey, m.checklist||[]);
    const rst = $('md-ck-reset');
    if (rst) rst.onclick = () => { S.checklistState[ckKey]=[]; updateCkUI(ckKey,m.checklist||[]); renderCkRows(ckKey,m.checklist||[]); };
    renderCkRows(ckKey, m.checklist||[]);
  }

  /* ⑤ 주의/팁 */
  const cb = $('md-caution-box');
  if (cb) {
    m.caution ? cb.classList.remove('hidden') : cb.classList.add('hidden');
    const ct = $('md-caution-text');
    if (ct) ct.innerHTML = '<strong>주의:</strong> ' + esc(m.caution||'');
  }
  const tb = $('md-tip-box');
  if (tb) {
    m.tip ? tb.classList.remove('hidden') : tb.classList.add('hidden');
    const tt = $('md-tip-text');
    if (tt) tt.innerHTML = '<strong>Tip:</strong> ' + esc(m.tip||'');
  }

  /* 수정/삭제 버튼 */
  const editBtn = $('md-edit-btn');
  const delBtn  = $('md-del-btn');
  if (editBtn) editBtn.onclick = () => openManualModal(catKey, id);
  if (delBtn)  delBtn.onclick  = () => deleteManual(catKey, id);
}

function renderCkRows(ckKey, checklist) {
  const el = $('md-ck-list'); if (!el) return;
  el.innerHTML = checklist.map((c,i) => {
    const done = S.checklistState[ckKey].includes(i);
    return `<div class="ck-row${done?' ck-done':''}" id="ck-row-${ckKey}-${i}" onclick="toggleCk('${ckKey}',${i})">
      <span class="ck-num">${i+1}</span>
      <span class="ck-txt">${esc(c)}</span>
      <span class="ck-chk">${done
        ?'<svg width="18" height="18" viewBox="0 0 24 24" stroke="var(--green)" fill="none" stroke-width="3"><path d="M20 6L9 17l-5-5"/></svg>'
        :'<div class="ck-circle"></div>'
      }</span>
    </div>`;
  }).join('');
}

function toggleCk(ckKey, idx) {
  if (!S.checklistState[ckKey]) S.checklistState[ckKey] = [];
  const arr = S.checklistState[ckKey];
  const pos = arr.indexOf(idx);
  if (pos===-1) arr.push(idx); else arr.splice(pos,1);
  const done = arr.includes(idx);
  const row  = $('ck-row-'+ckKey+'-'+idx);
  if (row) {
    row.classList.toggle('ck-done', done);
    row.querySelector('.ck-chk').innerHTML = done
      ? '<svg width="18" height="18" viewBox="0 0 24 24" stroke="var(--green)" fill="none" stroke-width="3"><path d="M20 6L9 17l-5-5"/></svg>'
      : '<div class="ck-circle"></div>';
  }
  const cat = ckKey.split('_')[0];
  const m   = (manuals[cat]||[]).find(x => x.id === ckKey.split('_')[1]);
  if (m) updateCkUI(ckKey, m.checklist||[]);
}

function updateCkUI(ckKey, checklist) {
  const done  = (S.checklistState[ckKey]||[]).length;
  const total = checklist.length;
  const pct   = total ? Math.round(done/total*100) : 0;
  const c=$('md-ck-counter'); if(c) c.textContent=done+'/'+total;
  const b=$('md-ck-bar');     if(b) b.style.width=pct+'%';
}

/* ── 매뉴얼 추가/수정 모달 (5섹션 + 사진 업로드) ── */
function openManualModal(catKey, id) {
  S.editManualCat  = catKey;
  S.editManualId   = id || null;
  S.uploadPhotos   = [];
  S.photoTarget    = 'mf-photo-preview';
  S.photoSide      = 'main';
  /* ★ 절차 항목 버퍼: [{text, imgUrl, imgPath, file, previewUrl}] */
  S.stepItems      = [];
  const m = id ? (manuals[catKey]||[]).find(x=>x.id===id) : null;

  /* 기존 steps → stepItems 버퍼로 변환 (하위 호환)
     신형: {text, imgUrls:[url,...], imgPaths:[path,...]}
     구형: {text, imgUrl, imgPath} → imgUrls 배열로 업그레이드 */
  const existingSteps = (m?.steps||[]).map(s => {
    if (typeof s === 'string') return { text: s, imgUrls:[], imgPaths:[], files:[], previewUrls:[] };
    const t = typeof s.title === 'string' ? ((s.title||'').trim() + (s.desc ? ' — '+(s.desc||'').trim() : '')) : '';
    const text = s.text !== undefined ? s.text : t;
    /* 구형 단일 imgUrl → 배열로 변환 */
    const imgUrls  = s.imgUrls  || (s.imgUrl  ? [s.imgUrl]  : []);
    const imgPaths = s.imgPaths || (s.imgPath ? [s.imgPath] : []);
    return { text, imgUrls, imgPaths, files:[], previewUrls:[] };
  }).filter(si => si.text);
  S.stepItems = existingSteps.length
    ? existingSteps
    : [{ text:'', imgUrls:[], imgPaths:[], files:[], previewUrls:[] }];

  /* checklist → 줄바꿈 텍스트 */
  const ckText = (m?.checklist||[]).join('\n');

  /* 제목 표시 */
  const _mt = $('form-manual-title');
  if (_mt) _mt.textContent = m ? '매뉴얼 수정' : '매뉴얼 추가';
  /* 카테고리 select 선택 */
  const _mc = $('mf-cat');
  if (_mc) [..._mc.options].forEach(o => { o.selected = o.value === catKey; });

  /* 기본 텍스트 필드 채우기 */
  const _sv = (id, v) => { const e=$(id); if(e) e.value=v; };
  _sv('mf-title',       m?.title   || '');
  _sv('mf-overview',    m?.overview|| '');
  _sv('mf-tags',        (m?.tags||[]).join(', '));
  _sv('mf-supplies',    (m?.supplies||[]).join('\n'));
  _sv('mf-safety',      (m?.cautions||[]).join('\n'));
  _sv('mf-check',       ckText);
  _sv('mf-tip-caution', m?.caution || '');
  _sv('mf-tip',         m?.tip     || '');

  /* 기존 대표 사진 */
  if (m?.imageUrl) {
    S.uploadPhotos = [{ url: m.imageUrl, existing: true, side: 'main', storagePath: m.imageStoragePath||'', file: null }];
  }
  const _pp = $('mf-photo-preview');
  if (_pp) _pp.innerHTML = '';
  if (m?.imageUrl) renderFormPhotoPreview('mf-photo-preview', 'main');

  /* 풀페이지로 이동 */
  goto('form-manual');

  /* steps 렌더는 goto 직후 (DOM 준비 후) */
  setTimeout(() => { renderStepItems(); }, 0);

  /* ── 아래는 사용 안 함 (구 openModal 대체) ── */
    /* 구 openModal 코드 제거 — 풀페이지로 대체됨*/
  /* ← openManualModal 끝 (풀페이지 방식으로 위에서 처리됨) */
}

/* ═══════════════════════════════════════════════════
   절차 항목 동적 UI (설명 + 사진 1:1 세트)
   S.stepItems = [{text, imgUrl, imgPath, file, previewUrl}]
═══════════════════════════════════════════════════ */

/** 항목 전체를 #mf-steps-container에 렌더링 */
function renderStepItems() {
  const container = document.getElementById('mf-steps-container');
  if (!container) return;

  container.innerHTML = S.stepItems.map((item, i) => {
    /* 미리보기: 기존 저장 URL + 새로 선택한 파일 base64 합산 */
    const allPreviews = [
      ...(item.imgUrls   || []).map(url  => ({ src: url,  isNew: false })),
      ...(item.previewUrls || []).map(url => ({ src: url,  isNew: true  })),
    ];
    const thumbsHtml = allPreviews.map((p, pi) => `
      <div class="step-thumb-wrap">
        <img class="step-thumb" src="${p.src}" onclick="previewPhoto('${p.src}')">
        <button type="button" class="step-thumb-del"
          onclick="removeStepPhoto(${i},${pi})">×</button>
      </div>`).join('');

    return `
    <div class="step-item-block" id="step-block-${i}">
      <div class="step-item-block__header">
        <span class="step-item-block__num">${i + 1}</span>
        <span class="step-item-block__label">절차 ${i + 1}</span>
        ${S.stepItems.length > 1
          ? `<button type="button" class="step-item-block__del" onclick="removeStepItem(${i})">삭제</button>`
          : ''}
      </div>
      <div class="step-item-block__body">
        <textarea id="step-text-${i}" class="lf-textarea" rows="2"
          placeholder="예: 주 차단기를 OFF하고 검전기로 무전압 확인"
          oninput="S.stepItems[${i}].text=this.value"
        >${esc(item.text)}</textarea>
      </div>
      <div class="step-item-block__photo">
        <!-- 가로 스크롤 썸네일 행 -->
        ${allPreviews.length ? `<div class="step-thumbs-row">${thumbsHtml}</div>` : ''}
        <!-- 사진 추가 버튼 -->
        <div class="step-item-block__btns">
          <label class="step-item-block__btn">
            📷 카메라
            <input type="file" accept="image/*" capture="environment" multiple
              class="hidden" onchange="handleStepPhoto(event,${i})"/>
          </label>
          <label class="step-item-block__btn">
            🖼 갤러리
            <input type="file" accept="image/*" multiple
              class="hidden" onchange="handleStepPhoto(event,${i})"/>
          </label>
        </div>
      </div>
    </div>`;
  }).join('');
}

/** 절차 항목 추가 */
function addStepItem() {
  S.stepItems.push({ text:'', imgUrls:[], imgPaths:[], files:[], previewUrls:[] });
  renderStepItems();
  /* 새 항목으로 스크롤 */
  const container = document.getElementById('mf-steps-container');
  if (container) container.lastElementChild?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

/** 절차 항목 삭제 */
function removeStepItem(i) {
  S.stepItems.splice(i, 1);
  if (S.stepItems.length === 0)
    S.stepItems.push({ text:'', imgUrls:[], imgPaths:[], files:[], previewUrls:[] });
  renderStepItems();
}

/** 절차 항목 사진 선택 */
function handleStepPhoto(e, idx) {
  const files = [...e.target.files];
  if (!files.length) return;
  const MAX_PER_STEP = 5;
  const item = S.stepItems[idx];
  if (!item.files)       item.files       = [];
  if (!item.previewUrls) item.previewUrls = [];

  files.forEach(file => {
    const total = (item.imgUrls||[]).length + item.files.length;
    if (total >= MAX_PER_STEP) { toast('절차당 최대 ' + MAX_PER_STEP + '장까지 등록 가능합니다'); return; }
    const reader = new FileReader();
    reader.onload = ev => {
      item.files.push(file);
      item.previewUrls.push(ev.target.result);
      renderStepItems();
    };
    reader.readAsDataURL(file);
  });
  e.target.value = '';
}

/** 절차 항목 사진 개별 제거 (stepIdx, photoIdx)
 *  photoIdx < imgUrls.length → 기존 저장 사진 제거
 *  else → 새로 선택한 파일 제거 */
function removeStepPhoto(stepIdx, photoIdx) {
  const item = S.stepItems[stepIdx];
  if (!item) return;
  const existingCount = (item.imgUrls || []).length;
  if (photoIdx < existingCount) {
    item.imgUrls  = item.imgUrls.filter((_,i) => i !== photoIdx);
    item.imgPaths = (item.imgPaths||[]).filter((_,i) => i !== photoIdx);
  } else {
    const newIdx = photoIdx - existingCount;
    item.files       = (item.files||[]).filter((_,i) => i !== newIdx);
    item.previewUrls = (item.previewUrls||[]).filter((_,i) => i !== newIdx);
  }
  renderStepItems();
}

/* 매뉴얼 전용 사진 핸들러 — 모달 내 input에서 직접 호출 */
function handleManualPhoto(e) {
  const files = [...e.target.files];
  if (!files.length) return;
  const MAX = 3;  /* 매뉴얼 대표 사진 최대 3장 */
  files.slice(0, MAX).forEach(file => {
    const reader = new FileReader();
    reader.onload = ev => {
      const cur = S.uploadPhotos.filter(p => p.side === 'main');
      if (cur.length >= MAX) {
        toast('사진은 최대 ' + MAX + '장까지 등록 가능합니다');
        return;
      }
      S.uploadPhotos.push({ file, url: ev.target.result, existing: false, side: 'main', storagePath: '' });
      _refreshManualPhotoPreview();
    };
    reader.readAsDataURL(file);
  });
  e.target.value = '';
}

function removeManualPhoto(idx) {
  /* side=main 인 것 중 idx번째 제거 */
  let mainCount = 0;
  S.uploadPhotos = S.uploadPhotos.filter(p => {
    if (p.side !== 'main') return true;
    return mainCount++ !== idx;
  });
  _refreshManualPhotoPreview();
}

function _refreshManualPhotoPreview() {
  const wrap = $('mf-photo-preview');
  if (!wrap) return;
  const list = S.uploadPhotos.filter(p => p.side === 'main');
  if (!list.length) {
    wrap.innerHTML = '<div style="font-size:12px;color:var(--t4);padding:6px 0">사진 없음</div>';
    return;
  }
  wrap.innerHTML = list.map((p, i) => `
    <div class="photo-preview-item">
      <img src="${p.url}" onclick="previewPhoto('${p.url}')"
        style="width:80px;height:80px;object-fit:cover;border-radius:10px;
               border:1px solid rgba(255,255,255,.15);cursor:zoom-in">
      <button class="photo-preview-del" onclick="removeManualPhoto(${i})">×</button>
    </div>`).join('');
}

async function saveManual() {
  const title = $('mf-title')?.value.trim();
  if (!title) { toast('⚠️ 제목을 입력하세요'); $('mf-title')?.focus(); return; }
  const btn = $('btn-save-manual');
  if (btn) { btn.disabled=true; btn.textContent='저장 중...'; }
  toast('📤 저장 중...');

  /* ★ 카테고리는 select에서 읽음 (사용자가 변경했을 수 있음) */
  const catKey = $('mf-cat')?.value || S.editManualCat;
  S.editManualCat = catKey; /* 동기화 */

  /* ── ① 5섹션 파싱 ── */

  /* 섹션1: 준비물 */
  const supplies = ($('mf-supplies')?.value||'').split('\n').map(s=>s.trim()).filter(Boolean);

  /* 섹션2: 안전주의사항 */
  const cautions = ($('mf-safety')?.value||'').split('\n').map(s=>s.trim()).filter(Boolean);

  /* ★ 섹션3: S.stepItems → imgUrls 배열로 Storage 업로드 */
  const uid_step  = S.user?.uid || 'guest';
  const docIdStep = S.editManualId || (db ? db.collection('manuals').doc().id : 'local_'+genId());
  const steps = [];
  for (let si = 0; si < S.stepItems.length; si++) {
    const item = S.stepItems[si];
    const text = (document.getElementById('step-text-'+si)?.value || item.text || '').trim();
    if (!text) continue;  /* 빈 항목 제외 */

    /* 기존 저장된 URL 유지 */
    const imgUrls  = [...(item.imgUrls  || [])];
    const imgPaths = [...(item.imgPaths || [])];

    /* 새로 선택한 파일들 → Storage 업로드 */
    const newFiles = item.files || [];
    for (let fi = 0; fi < newFiles.length; fi++) {
      const file = newFiles[fi];
      if (S.fbReady && !S.isGuest && storage) {
        try {
          const fname = 'step' + si + '_f' + fi + '_' + Date.now() + '.jpg';
          const spath = 'manuals/' + uid_step + '/' + docIdStep + '/' + fname;
          const res   = await uploadPhoto(file, spath);
          imgUrls.push(res.url);
          imgPaths.push(res.storagePath);
        } catch(se) {
          console.warn('[절차 사진 업로드 실패]', se.message);
        }
      } else {
        /* 게스트: base64 그대로 */
        imgUrls.push((item.previewUrls||[])[fi] || '');
        imgPaths.push('');
      }
    }
    steps.push({ text, imgUrls, imgPaths });
  }

  /* ★ 중복 step 제거: text가 완전히 동일한 항목 제거 */
  const seen = new Set();
  const stepsDeduped = steps.filter(s => {
    if (seen.has(s.text)) return false;
    seen.add(s.text);
    return true;
  });

  /* 섹션4: 체크리스트 */
  const checklist = ($('mf-check')?.value||'').split('\n').map(s=>s.trim()).filter(Boolean);

  /* 섹션5: 주의사항(mf-tip-caution) + Tip(mf-tip) 분리 읽기 */
  const caution = $('mf-tip-caution')?.value.trim() || $('mf-tip')?.value.trim() || '';
  const tip     = $('mf-tip')?.value.trim() || '';

  /* ── ② 대표 사진 Storage 업로드 ── */
  let imageUrl         = '';
  let imageStoragePath = '';
  const photoBuf = S.uploadPhotos.filter(p => p.side === 'main');

  if (photoBuf.length) {
    const p = photoBuf[0];
    if (p.existing) {
      imageUrl         = p.url;
      imageStoragePath = p.storagePath || '';
    } else if (S.fbReady && !S.isGuest && storage && p.file) {
      try {
        const uid_  = S.user?.uid || 'guest';
        const docId = S.editManualId || (db ? db.collection('manuals').doc().id : 'local_'+genId());
        const fname = `manual_${Date.now()}.jpg`;
        const spath = `manuals/${uid_}/${docId}/${fname}`;
        const result = await uploadPhoto(p.file, spath);
        imageUrl         = result.url;
        imageStoragePath = result.storagePath;
      } catch(uploadErr) {
        console.warn('[매뉴얼 사진 업로드 실패]', uploadErr.message);
        toast('⚠️ 사진 업로드 실패 (텍스트만 저장)');
      }
    } else {
      /* 게스트: base64 그대로 */
      imageUrl = p.url;
    }
  }

  /* ── ③ Firestore 저장 객체 구성 ── */
  const data = {
    cat:              catKey,
    title,
    overview:         $('mf-overview')?.value.trim() || '',
    tags:             ($('mf-tags')?.value||'').split(',').map(t=>t.trim()).filter(Boolean),
    /* ★ 5섹션 데이터 */
    supplies,          /* 준비물 배열 */
    cautions,          /* 안전주의사항 배열 */
    steps: stepsDeduped,  /* ★ 중복 제거된 절차 배열 */
    checklist,         /* 체크리스트 배열 */
    caution,           /* 최종 주의 (한 줄) */
    tip,               /* Tip (한 줄) */
    /* ★ 대표 사진 — steps[0].imgUrl 또는 별도 업로드 */
    imageUrl:         imageUrl || (steps[0]?.imgUrl || ''),
    imageStoragePath: imageStoragePath || (steps[0]?.imgPath || ''),
    updatedAt: new Date().toISOString(),
  };

  try {
    if (S.fbReady && !S.isGuest && db) {
      if (S.editManualId) {
        await db.collection('manuals').doc(S.editManualId).update(data);
      } else {
        data.createdAt = new Date().toISOString();
        await db.collection('manuals').add(data);
      }
      /* onSnapshot이 자동으로 manuals 배열 갱신 + 카테고리 목록 재렌더 */
    } else {
      /* 게스트 / 오프라인 */
      if (!manuals[catKey]) manuals[catKey] = [];
      if (S.editManualId) {
        const idx = manuals[catKey].findIndex(x=>x.id===S.editManualId);
        if (idx !== -1) manuals[catKey][idx] = { id: S.editManualId, ...data };
      } else {
        manuals[catKey].push({ id: 'local_'+genId(), ...data });
      }
      renderManualCat(catKey);
    }
    S.uploadPhotos = [];
    toast('✅ 저장됐습니다');
    closeModal();
    goto(catKey);           /* ★ 저장 후 해당 카테고리 목록으로 이동 */
  } catch(e) {
    console.error('[saveManual]', e);
    toast('⚠️ 저장 실패: '+e.message);
    if (btn) { btn.disabled=false; btn.textContent='💾 저장'; }
  }
}

async function deleteManual(catKey, id) {
  if (!confirm('이 매뉴얼을 삭제하시겠습니까?')) return;
  try {
    if (S.fbReady && !S.isGuest && db) {
      await db.collection('manuals').doc(id).delete();
    } else {
      if (manuals[catKey]) manuals[catKey] = manuals[catKey].filter(m=>m.id!==id);
      renderManualCat(catKey);
    }
    toast('🗑 삭제됐습니다');
    goto(catKey);
  } catch(e) { toast('⚠️ 삭제 실패: '+e.message); }
}

/* =====================================================
   ⑭ 작업기록
===================================================== */
const LOG_CATS   = ['전체','전기','기계','영선','소방','기타'];
const LOG_STATUS = ['전체','완료','진행중','대기'];

function renderRecords() {
  const sv = (id,v) => { const e=$(id); if(e) e.textContent=v; };
  sv('log-stat-total', logs.length);
  sv('log-stat-done',  logs.filter(l=>l.status==='완료').length);
  sv('log-stat-prog',  logs.filter(l=>l.status==='진행중').length);
  sv('log-stat-wait',  logs.filter(l=>l.status==='대기').length);

  const cf=$('log-cat-filter');    if(cf) cf.innerHTML = LOG_CATS.map(c=>`<button class="fchip${S.logCatFilter===c?' on':''}" onclick="setLogCat('${c}')">${c}</button>`).join('');
  const sf=$('log-status-filter'); if(sf) sf.innerHTML = LOG_STATUS.map(s=>`<button class="fchip${S.logStatusFilter===s?' on':''}" onclick="setLogStatus('${s}')">${s}</button>`).join('');

  let list = [...logs].sort((a,b)=>(b.date||'').localeCompare(a.date||''));
  if (S.logCatFilter!=='전체')    list = list.filter(l=>l.cat===S.logCatFilter);
  if (S.logStatusFilter!=='전체') list = list.filter(l=>l.status===S.logStatusFilter);

  const lc=$('log-list-count'); if(lc) lc.textContent=list.length+'건';
  const ll=$('log-list');        if(!ll) return;

  ll.innerHTML = list.length ? list.map(l => {
    const sc = STATUS_COLOR[l.status]||'var(--t3)';
    /* ★ imageUrl 우선 → beforePhotos[0] → photos[0] 순으로 썸네일 */
    const thumbUrl = l.imageUrl || (l.beforePhotos||[])[0] || (l.photos||[])[0] || '';
    const thumb = thumbUrl
      ? `<img src="${thumbUrl}" onclick="event.stopPropagation();previewPhoto('${thumbUrl}')"
           style="width:56px;height:56px;border-radius:9px;object-fit:cover;flex-shrink:0;border:1px solid rgba(255,255,255,.14);cursor:zoom-in">`
      : '';
    return `
    <div class="gc log-card" onclick="openLogDetail('${l.id}')">
      <div class="lc-left">
        <div class="lc-cat-icon">${CAT_ICON[l.cat]||'📋'}</div>
        <div class="lc-status-dot" style="background:${sc}"></div>
      </div>
      <div class="lc-body">
        <div class="lc-title">${esc(l.title)}</div>
        <div class="lc-meta">
          <span class="lc-badge" style="background:${sc}22;color:${sc};border:1px solid ${sc}44">${esc(l.status)}</span>
          <span>${esc(l.cat||'')}</span>
          ${l.date?`<span>📅 ${esc(l.date)}</span>`:''}
          ${l.worker?`<span>👤 ${esc(l.worker)}</span>`:''}
        </div>
        ${l.desc?`<div class="lc-desc">${esc(l.desc)}</div>`:''}
      </div>
      ${thumb}
      <div class="lc-actions" onclick="event.stopPropagation()">
        <button class="lc-btn lc-btn-edit" onclick="openLogModal('${l.id}')">✏️</button>
        <button class="lc-btn lc-btn-del"  onclick="deleteLog('${l.id}')">🗑</button>
      </div>
    </div>`;
  }).join('') :
  `<div class="gc" style="padding:48px;text-align:center;color:var(--t4)">
    <div style="font-size:36px;opacity:.3;margin-bottom:12px">📋</div>
    <div style="font-size:15px">해당하는 기록이 없습니다</div>
    <button class="btn-o" style="margin:16px auto 0;display:flex" onclick="openLogModal()">＋ 첫 기록 작성</button>
  </div>`;
}

function setLogCat(f)    { S.logCatFilter=f;    renderRecords(); }
function setLogStatus(f) { S.logStatusFilter=f; renderRecords(); }

/* 작업기록 상세 */
function openLogDetail(id) {
  const l = logs.find(x => x.id === id);
  if (!l) return;
  S.editLogId = id;

  /* ── 텍스트 필드 ── */
  const sc  = STATUS_COLOR[l.status] || 'var(--t3)';
  const set = (elId, val) => { const e = $(elId); if (e) e.textContent = val; };
  set('log-detail-breadcrumb', l.title);
  set('log-detail-title',      l.title);
  set('log-detail-cat',        l.cat    || '-');
  set('log-detail-worker',     l.worker || '-');
  set('log-detail-date',       l.date   || '-');
  set('log-detail-updated',    l.updatedAt ? '수정: ' + l.updatedAt.slice(0, 10) : '');

  const sb = $('log-detail-status-badge');
  if (sb) sb.innerHTML = `<span class="lc-badge"
    style="background:${sc}22;color:${sc};border:1px solid ${sc}44;
           font-size:11px;font-weight:700;padding:3px 10px;border-radius:99px">
    ${esc(l.status)}</span>`;

  const sv2 = $('log-detail-statusval');
  if (sv2) sv2.innerHTML = `<span style="color:${sc};font-weight:700">${esc(l.status)}</span>`;

  /* ── 상세 내용 ── */
  const dw = $('log-detail-desc-wrap');
  const de = $('log-detail-desc');
  if (dw && de) {
    if (l.desc && l.desc.trim()) {
      dw.classList.remove('hidden');
      de.textContent = l.desc;
    } else {
      dw.classList.add('hidden');
    }
  }

  /* ── Before / After 사진 ──────────────────────────────
     ★ 빈 배열 [] 은 truthy → length 로 존재 확인 (|| 사용 금지)
  ─────────────────────────────────────────────────────── */
  const pw = $('log-detail-photos');
  if (pw) {
    /* beforePhotos/afterPhotos 우선, 없으면 photos 전체를 반씩 분할 */
    let before = Array.isArray(l.beforePhotos) && l.beforePhotos.length
      ? l.beforePhotos.filter(u => u && u.trim())
      : [];
    let after  = Array.isArray(l.afterPhotos)  && l.afterPhotos.length
      ? l.afterPhotos.filter(u => u && u.trim())
      : [];

    /* fallback: photos 배열 분할 */
    if (!before.length && !after.length) {
      const all = (l.photos || []).filter(u => u && u.trim());
      const mid = Math.ceil(all.length / 2);
      before = all.slice(0, mid);
      after  = all.slice(mid);
    }

    /* imageUrl 단독인 경우 after에 배치 */
    if (!before.length && !after.length && l.imageUrl) {
      after = [l.imageUrl];
    }

    /* 사진이 하나라도 있으면 표시 */
    if (before.length || after.length) {
      pw.classList.remove('hidden');
      pw.innerHTML = `
        <div class="slbl slbl--mb">📷 작업 전/후 사진 비교</div>
        <div class="ba-detail-grid">

          <!-- BEFORE -->
          <div class="ba-detail-col">
            <div class="ba-col-header ba-col-before">🔴 BEFORE — 작업 전</div>
            <div class="ba-col-body">
              ${before.length
                ? before.map(u => `
                    <img src="${u}" class="ba-detail-img detail-img"
                      onclick="previewPhoto('${u}')" alt="Before 사진"
                      onerror="this.style.display='none'">`).join('')
                : '<div class="ba-no-photo">사진 없음</div>'}
            </div>
          </div>

          <!-- AFTER -->
          <div class="ba-detail-col">
            <div class="ba-col-header ba-col-after">🟢 AFTER — 작업 후</div>
            <div class="ba-col-body">
              ${after.length
                ? after.map(u => `
                    <img src="${u}" class="ba-detail-img detail-img"
                      onclick="previewPhoto('${u}')" alt="After 사진"
                      onerror="this.style.display='none'">`).join('')
                : '<div class="ba-no-photo">사진 없음</div>'}
            </div>
          </div>

        </div>`;
    } else {
      pw.classList.add('hidden');
    }
  }

  /* ── 버튼 ── */
  const eb  = $('btn-log-detail-edit');
  const db2 = $('btn-log-detail-del');
  if (eb)  eb.onclick  = () => openLogModal(id);
  if (db2) db2.onclick = () => deleteLog(id);

  goto('records-detail');
}

/* 작업기록 추가/수정 — 풀페이지 */
function openLogModal(id) {
  S.editLogId    = id || null;
  S.uploadPhotos = [];
  S._formLogBack = S.currentPage;  /* 뒤로 갈 페이지 기억 */
  const l = id ? logs.find(x=>x.id===id) : null;

  /* 제목 */
  const titleEl = $('form-log-title');
  if (titleEl) titleEl.textContent = l ? '작업기록 수정' : '새 작업기록';

  /* 카테고리 select */
  const catSel = $('lm-cat');
  if (catSel) {
    catSel.innerHTML = ['전기','기계','영선','소방','기타']
      .map(c=>`<option${l?.cat===c?' selected':''}>${c}</option>`).join('');
  }
  /* 상태 select */
  const stSel = $('lm-status');
  if (stSel) {
    stSel.innerHTML = ['완료','진행중','대기']
      .map(s=>`<option${l?.status===s?' selected':''}>${s}</option>`).join('');
  }
  /* 필드 채우기 */
  const setV = (id, v) => { const e=$(id); if(e) e.value=v; };
  setV('lm-title',  l?.title  || '');
  setV('lm-worker', l?.worker || '');
  setV('lm-date',   l?.date   || today());
  const desc = $('lm-desc'); if(desc) desc.value = l?.desc || '';

  /* 기존 사진 */
  const before = Array.isArray(l?.beforePhotos) && l.beforePhotos.length
    ? l.beforePhotos.filter(Boolean)
    : (l?.photos||[]).slice(0,1);
  const after  = Array.isArray(l?.afterPhotos)  && l.afterPhotos.length
    ? l.afterPhotos.filter(Boolean)
    : (l?.photos||[]).slice(1);
  S.uploadPhotos = [
    ...before.map((url,i) => ({ url, existing:true, side:'before', storagePath:(l?.storagePaths||[])[i]||'', file:null })),
    ...after.map((url,i)  => ({ url, existing:true, side:'after',  storagePath:(l?.storagePaths||[])[before.length+i]||'', file:null })),
  ];
  renderFormPhotoPreview('lm-before-preview', 'before');
  renderFormPhotoPreview('lm-after-preview',  'after');

  goto('form-log');
}

/* 사진 input 트리거 (type, side, wrapperId 모두 지원) */
function triggerPhotoInput(type, side, wrapperId) {
  S.photoTarget  = wrapperId || 'lm-before-preview';
  S.photoSide    = side || 'before';
  const inp = $(type==='camera' ? 'photo-input-camera' : 'photo-input-gallery');
  if (inp) { inp.onchange = handlePhotoSelect; inp.click(); }
}

function handlePhotoSelect(e) {
  const files  = [...e.target.files];
  const side   = S.photoSide   || 'before';
  const target = S.photoTarget || 'lm-before-preview';
  if (!files.length) return;
  files.forEach(file => {
    const reader = new FileReader();
    reader.onload = ev => {
      S.uploadPhotos.push({ file, url:ev.target.result, existing:false, side, storagePath:'' });
      renderPhotoPreview(target, side);
    };
    reader.readAsDataURL(file);
  });
  e.target.value = '';
}

function renderPhotoPreview(wrapperId, side) {
  const wrap = $(wrapperId); if (!wrap) return;
  /* side가 지정되면 해당 side 사진만, 없으면 전체 표시 */
  const list = side
    ? S.uploadPhotos.map((p,i)=>({...p,_i:i})).filter(p=>p.side===side)
    : S.uploadPhotos.map((p,i)=>({...p,_i:i}));
  wrap.innerHTML = list.length
    ? list.map(p => `
        <div class="photo-preview-item">
          <img src="${p.url}" onclick="previewPhoto('${p.url}')">
          <button class="photo-preview-del" onclick="removeUploadPhoto(${p._i})">×</button>
        </div>`).join('')
    : '<div style="font-size:12px;color:var(--t4);padding:8px 0">사진 없음 — 위 버튼으로 추가</div>';
}

function removeUploadPhoto(i) {
  const removed = S.uploadPhotos.splice(i, 1)[0];
  const side    = removed?.side || 'before';
  const target  = side==='after' ? 'lm-after-preview' : 'lm-before-preview';
  renderPhotoPreview(target, side);
}


/* ══════════════════════════════════════════════════════
   공용 폼 사진 핸들러 — openLogModal / openMemoModal 공유
   handleFormPhoto(e, side, previewId)
   renderFormPhotoPreview(previewId, side)
══════════════════════════════════════════════════════ */

/** 사진 선택 핸들러 (inline label+input 전용) */
function handleFormPhoto(e, side, previewId) {
  const files = [...e.target.files];
  if (!files.length) return;
  const MAX = 3;
  const cur = S.uploadPhotos.filter(p => p.side === side).length;
  if (cur >= MAX) { toast('사진은 최대 ' + MAX + '장까지 등록 가능합니다'); e.target.value=''; return; }

  files.slice(0, MAX - cur).forEach(file => {
    const reader = new FileReader();
    reader.onload = ev => {
      S.uploadPhotos.push({ file, url: ev.target.result, existing: false, side, storagePath: '' });
      renderFormPhotoPreview(previewId, side);
    };
    reader.readAsDataURL(file);
  });
  e.target.value = '';
}

/** 미리보기 렌더링 */
function renderFormPhotoPreview(previewId, side) {
  const wrap = $(previewId);
  if (!wrap) return;
  const list = S.uploadPhotos.map((p, i) => ({...p, _i: i})).filter(p => p.side === side);
  wrap.innerHTML = list.length
    ? list.map(p => `
        <div class="photo-preview-item">
          <img src="${p.url}" onclick="previewPhoto('${p.url}')">
          <button class="photo-preview-del"
            onclick="removeFormPhoto(${p._i},'${previewId}','${side}')">×</button>
        </div>`).join('')
    : '<span class="photo-hint-empty">사진 없음</span>';
}

/** 사진 개별 삭제 */
function removeFormPhoto(idx, previewId, side) {
  S.uploadPhotos.splice(idx, 1);
  renderFormPhotoPreview(previewId, side);
}

/* saveLog: Firestore + Storage 동시 저장 */
async function saveLog() {
  const title = $('lm-title')?.value.trim();
  if (!title) { toast('⚠️ 제목을 입력하세요'); return; }
  const btn = $('btn-save-log');
  if (btn) { btn.disabled=true; btn.textContent='저장 중...'; }
  toast('📤 저장 중...');

  try {
    const uid_   = S.user?.uid || 'guest';
    const docId  = S.editLogId || (db ? db.collection('logs').doc().id : 'local_'+genId());
    const finalPhotos = [];
    const finalPaths  = [];

    /* Before / After 각각 업로드 */
    const beforePhotos = []; const beforePaths = [];
    const afterPhotos  = []; const afterPaths  = [];

    for (const p of S.uploadPhotos) {
      const isBefore = (p.side !== 'after');
      if (p.existing) {
        if (isBefore) { beforePhotos.push(p.url); beforePaths.push(p.storagePath||''); }
        else          { afterPhotos.push(p.url);  afterPaths.push(p.storagePath||''); }
      } else if (S.fbReady && !S.isGuest && storage) {
        const side  = p.side || 'before';
        const fname = `${side}_${Date.now()}_${Math.random().toString(36).slice(2)}.jpg`;
        const spath = `logs/${uid_}/${docId}/${fname}`;
        const { url } = await uploadPhoto(p.file, spath);
        if (isBefore) { beforePhotos.push(url); beforePaths.push(spath); }
        else          { afterPhotos.push(url);  afterPaths.push(spath); }
        finalPhotos.push(url); finalPaths.push(spath);
      } else {
        /* 게스트: base64 그대로 */
        if (isBefore) { beforePhotos.push(p.url); beforePaths.push(''); }
        else          { afterPhotos.push(p.url);  afterPaths.push(''); }
        finalPhotos.push(p.url); finalPaths.push('');
      }
    }
    /* finalPhotos = before + after 합산 */
    finalPhotos.splice(0, finalPhotos.length, ...beforePhotos, ...afterPhotos);
    finalPaths.splice(0, finalPaths.length,   ...beforePaths,  ...afterPaths);

    const data = {
      title,
      cat:          $('lm-cat')?.value    || '기타',
      status:       $('lm-status')?.value || '완료',
      worker:       $('lm-worker')?.value.trim() || '',
      date:         $('lm-date')?.value   || today(),
      desc:         $('lm-desc')?.value.trim()   || '',
      photos:       finalPhotos,
      storagePaths: finalPaths,
      /* ★ imageUrl: 썸네일 (before 첫 번째) */
      imageUrl:     beforePhotos[0] || finalPhotos[0] || '',
      beforePhotos,
      afterPhotos,
      updatedAt:    new Date().toISOString(),
    };

    if (S.fbReady && !S.isGuest && db) {
      if (S.editLogId) {
        await db.collection('logs').doc(S.editLogId).update(data);
      } else {
        data.createdAt = new Date().toISOString();
        await db.collection('logs').doc(docId).set(data);
      }
    } else {
      data.id = docId;
      if (S.editLogId) {
        const idx = logs.findIndex(x=>x.id===S.editLogId);
        if (idx!==-1) logs[idx]=data;
      } else { logs.unshift(data); }
      renderRecords();
    }

    S.editLogId = null;
    toast('✅ 저장됐습니다');
    closeModal();           /* 모달 닫기 */
    goto('records');        /* ★ 무조건 목록으로 이동 (무한 루프 방지) */

  } catch(e) {
    console.error('[saveLog]', e);
    toast('⚠️ 저장 실패: '+e.message, 4000);
    if (btn) { btn.disabled=false; btn.textContent='💾 저장'; }
  }
}

/* deleteLog: Firestore + Storage 동시 삭제 */
async function deleteLog(id) {
  if (!confirm('이 기록을 삭제하시겠습니까?\n첨부 사진도 함께 삭제됩니다.')) return;
  const l = logs.find(x=>x.id===id);
  toast('🗑 삭제 중...');
  try {
    if (l) {
      const paths = l.storagePaths?.length ? l.storagePaths : (l.photos||[]);
      for (const p of paths) if(p) await deleteStorageFile(p);
    }
    if (S.fbReady && !S.isGuest && db) {
      await db.collection('logs').doc(id).delete();
    } else {
      logs = logs.filter(x=>x.id!==id);
      renderRecords();
    }
    toast('🗑 삭제됐습니다');
    if (S.currentPage==='records-detail') goto('records');
  } catch(e) { toast('⚠️ 삭제 실패: '+e.message, 4000); }
}

/* =====================================================
   ⑮ 학습메모
===================================================== */
const MEMO_CATS = ['전체','전기','기계','영선','소방','일반'];

function renderMemo() {
  const fe=$('memo-filter'); if(fe) fe.innerHTML=MEMO_CATS.map(c=>`<button class="fchip${S.memoFilter===c?' on':''}" onclick="setMemoFilter('${c}')">${c}</button>`).join('');
  let list=[...memos].sort((a,b)=>(b.date||'').localeCompare(a.date||''));
  if(S.memoFilter!=='전체') list=list.filter(m=>m.cat===S.memoFilter);
  const lc=$('memo-list-count'); if(lc) lc.textContent=list.length+'건';
  const ll=$('memo-list');       if(!ll) return;

  ll.innerHTML = list.length ? list.map(m => {
    const bg      = MEMO_COLORS[m.cat] || 'rgba(255,255,255,.1)';
    const preview = (m.content||'').slice(0,100) + ((m.content||'').length > 100 ? '…' : '');
    /* 대표 이미지: imgUrls 배열 첫 번째 */
    const thumbUrl = Array.isArray(m.imgUrls) && m.imgUrls[0] ? m.imgUrls[0] : '';
    /* 썸네일: 64px 고정 높이 소형 */
    const thumbHtml = thumbUrl
      ? `<img class="memo-card-thumb" src="${thumbUrl}"
           onclick="event.stopPropagation();previewPhoto('${thumbUrl}')"
           alt="참고 사진" onerror="this.style.display='none'">`
      : '';
    return `
    <div class="gc memo-card" onclick="openMemoDetail('${m.id}')">
      <div class="memo-card-head">
        <span class="memo-cat-badge" style="background:${bg}">${esc(m.cat)}</span>
        <span style="font-size:11px;color:var(--t4)">${m.date||''}</span>
      </div>
      <div class="memo-card-title">${esc(m.title)}</div>
      <div class="memo-card-preview">${esc(preview)}</div>
      <div class="memo-tags">${(m.tags||[]).map(t=>`<span class="m-tag">${esc(t)}</span>`).join('')}</div>
      ${thumbHtml}
      <div class="card-actions" onclick="event.stopPropagation()">
        <button class="lc-btn lc-btn-edit" onclick="openMemoModal('${m.id}')">✏️ 수정</button>
        <button class="lc-btn lc-btn-del"  onclick="deleteMemo('${m.id}')">🗑 삭제</button>
      </div>
    </div>`;
  }).join('') :
  `<div class="gc" style="padding:48px;text-align:center;color:var(--t4);grid-column:1/-1">
    <div style="font-size:36px;opacity:.3;margin-bottom:12px">📒</div>
    <div style="font-size:15px">등록된 메모가 없습니다</div>
    <button class="btn-o" style="margin:16px auto 0;display:flex" onclick="openMemoModal()">＋ 첫 메모 작성</button>
  </div>`;
}

function setMemoFilter(f){ S.memoFilter=f; renderMemo(); }

function openMemoDetail(id) {
  const m = memos.find(x => x.id === id); if (!m) return;
  S.editMemoId = id;
  const bg = MEMO_COLORS[m.cat] || 'rgba(255,255,255,.1)';
  const sv = (el, v) => { const e=$(el); if(e) e.textContent=v; };
  sv('memo-detail-breadcrumb', m.title);
  sv('memo-detail-title',      m.title);
  sv('memo-detail-date',       '📅 ' + (m.date||'-'));
  const cb = $('memo-detail-cat-badge');
  if (cb) { cb.textContent = m.cat; cb.style.background = bg; }
  const tg = $('memo-detail-tags');
  if (tg) tg.innerHTML = (m.tags||[]).map(t=>`<span class="m-tag">${esc(t)}</span>`).join('');
  const co = $('memo-detail-content');
  if (co) co.textContent = m.content || '';

  /* ★ 참고 사진 */
  const pw = $('memo-detail-photos');
  const pg = $('memo-detail-photos-grid');
  if (pw && pg) {
    const imgs = (m.imgUrls||[]).filter(u => u && u.trim());
    if (imgs.length) {
      pw.classList.remove('hidden');
      pg.innerHTML = imgs.map(u => `
        <img src="${u}" class="memo-detail-img"
          onclick="previewPhoto('${u}')"
          alt="참고 사진"
          onerror="this.style.display='none'">`).join('');
    } else {
      pw.classList.add('hidden');
    }
  }

  const eb  = $('btn-memo-detail-edit');
  const db3 = $('btn-memo-detail-del');
  if (eb)  eb.onclick  = () => openMemoModal(id);
  if (db3) db3.onclick = () => deleteMemo(id);
  goto('memo-detail');
}

function openMemoModal(id) {
  S.editMemoId   = id || null;
  S.uploadPhotos = [];
  S._formMemoBack = S.currentPage;
  const m = id ? memos.find(x=>x.id===id) : null;

  const titleEl = $('form-memo-title');
  if (titleEl) titleEl.textContent = m ? '메모 수정' : '새 메모 작성';

  /* 카테고리 */
  const catSel = $('mm-cat');
  if (catSel) {
    [...catSel.options].forEach(o => { o.selected = o.value === (m?.cat||'일반'); });
  }
  const setV = (id, v) => { const e=$(id); if(e) e.value=v; };
  setV('mm-date',    m?.date  || today());
  setV('mm-title',   m?.title || '');
  setV('mm-tags',    (m?.tags||[]).join(', '));
  const co = $('mm-content'); if(co) co.value = m?.content || '';

  /* 기존 사진 */
  if (m && Array.isArray(m.imgUrls) && m.imgUrls.length) {
    S.uploadPhotos = m.imgUrls.filter(Boolean).map((url, i) => ({
      url, existing: true, side: 'memo',
      storagePath: (m.imgPaths||[])[i] || '', file: null,
    }));
    renderFormPhotoPreview('mm-photo-preview', 'memo');
  } else {
    const pw = $('mm-photo-preview'); if (pw) pw.innerHTML = '';
  }

  goto('form-memo');
}

async function saveMemo() {
  const title = $('mm-title')?.value.trim();
  if (!title) { toast('⚠️ 제목을 입력하세요'); return; }
  const btn = $('btn-save-memo');
  if (btn) { btn.disabled=true; btn.textContent='저장 중...'; }
  toast('📤 저장 중...');

  /* ── 사진 업로드 ── */
  const uid_  = S.user?.uid || 'guest';
  const docId = S.editMemoId || (db ? db.collection('memos').doc().id : 'local_'+genId());
  const imgUrls  = [];
  const imgPaths = [];

  for (const p of S.uploadPhotos.filter(x => x.side === 'memo')) {
    if (p.existing) {
      imgUrls.push(p.url);
      imgPaths.push(p.storagePath || '');
    } else if (S.fbReady && !S.isGuest && storage && p.file) {
      try {
        const fname = 'memo_' + Date.now() + '_' + Math.random().toString(36).slice(2) + '.jpg';
        const spath = 'memos/' + uid_ + '/' + docId + '/' + fname;
        const res   = await uploadPhoto(p.file, spath);
        imgUrls.push(res.url);
        imgPaths.push(res.storagePath);
      } catch (ue) {
        console.warn('[메모 사진 업로드 실패]', ue.message);
      }
    } else if (p.file) {
      /* 게스트: base64 그대로 */
      imgUrls.push(p.url);
      imgPaths.push('');
    }
  }

  const data = {
    title,
    content:  $('mm-content')?.value.trim() || '',
    cat:      $('mm-cat')?.value  || '일반',
    date:     $('mm-date')?.value || today(),
    tags:     ($('mm-tags')?.value||'').split(',').map(t=>t.trim()).filter(Boolean),
    imgUrls,    /* ★ 사진 URL 배열 */
    imgPaths,   /* ★ Storage 경로 배열 */
    updatedAt: new Date().toISOString(),
  };

  try {
    if (S.fbReady && !S.isGuest && db) {
      if (S.editMemoId) {
        await db.collection('memos').doc(S.editMemoId).update(data);
      } else {
        data.createdAt = new Date().toISOString();
        await db.collection('memos').doc(docId).set(data);
      }
    } else {
      data.id = docId;
      if (S.editMemoId) {
        const idx = memos.findIndex(x => x.id === S.editMemoId);
        if (idx !== -1) memos[idx] = data; else memos.unshift(data);
      } else { memos.unshift(data); }
      renderMemo();
    }
    S.editMemoId  = null;
    S.uploadPhotos = [];
    toast('✅ 저장됐습니다');
    goto('memo');   /* 저장 후 메모 목록으로 */
  } catch(e) {
    toast('⚠️ 저장 실패: ' + e.message);
    if (btn) { btn.disabled=false; btn.textContent='💾 저장'; }
  }
}

async function deleteMemo(id) {
  if(!confirm('이 메모를 삭제하시겠습니까?')) return;
  try {
    if(S.fbReady&&!S.isGuest&&db){ await db.collection('memos').doc(id).delete(); }
    else { memos=memos.filter(m=>m.id!==id); renderMemo(); }
    toast('🗑 삭제됐습니다');
    if(S.currentPage==='memo-detail') goto('memo');
  } catch(e){ toast('⚠️ 삭제 실패: '+e.message); }
}

/* =====================================================
   ⑯ 연간 로드맵
===================================================== */
function renderRoadmap() {
  const yg=$('rm-year-grid');
  if(yg) yg.innerHTML=Array.from({length:12},(_,i)=>i+1).map(m=>{
    const sl=schedules.filter(s=>s.month===m);
    const types=[...new Set(sl.map(s=>s.type))];
    const active=m===S.activeMonth;
    return `<div class="rm-month-chip${active?' rm-month-active':sl.length?' rm-month-has':''}" onclick="setRmMonth(${m})">
      <span class="rm-chip-label">${MONTH_NAMES[m]}</span>
      ${sl.length?`<span class="rm-chip-count">${sl.length}</span>`:''}
      <div class="rm-chip-dots">
        ${types.includes('법정')?'<span class="rm-dot" style="background:var(--red)"></span>'  :''}
        ${types.includes('정기')?'<span class="rm-dot" style="background:var(--blue)"></span>' :''}
        ${types.includes('계절')?'<span class="rm-dot" style="background:var(--green)"></span>':''}
      </div>
    </div>`;
  }).join('');

  const mt=$('rm-month-tabs');
  if(mt) mt.innerHTML=Array.from({length:12},(_,i)=>i+1).map(m=>{
    const has=schedules.some(s=>s.month===m); const active=m===S.activeMonth;
    return `<button class="rm-tab${active?' rm-tab-active':has?' rm-tab-has':''}" onclick="setRmMonth(${m})">${MONTH_NAMES[m]}</button>`;
  }).join('');

  const list=schedules.filter(s=>s.month===S.activeMonth);
  const lc=$('rm-list-count'); if(lc) lc.textContent=MONTH_NAMES[S.activeMonth]+' 일정 '+list.length+'건';
  const ll=$('rm-list'); if(!ll) return;

  ll.innerHTML = list.length ? list.map(s=>{
    const ts=SCH_TYPE_STYLE[s.type]||{bg:'rgba(255,255,255,.07)',border:'rgba(255,255,255,.12)',color:'var(--t3)'};
    return `<div class="gc rm-sch-card">
      <div class="rm-sch-type" style="background:${ts.bg};border:1px solid ${ts.border};color:${ts.color}">${esc(s.type)}</div>
      <div class="rm-sch-body">
        <div class="rm-sch-title">${esc(s.title)}</div>
        ${s.desc?`<div class="rm-sch-desc">${esc(s.desc)}</div>`:''}
      </div>
      <div class="rm-sch-acts" onclick="event.stopPropagation()">
        <button class="lc-btn lc-btn-edit" onclick="openSchModal('${s.id}')">✏️</button>
        <button class="lc-btn lc-btn-del"  onclick="deleteSchedule('${s.id}')">🗑</button>
      </div>
    </div>`;
  }).join('') :
  `<div class="gc" style="padding:48px;text-align:center;color:var(--t4)">
    <div style="font-size:36px;opacity:.3;margin-bottom:12px">📭</div>
    <div style="font-size:15px">이번 달 일정이 없습니다</div>
    <button class="btn-o" style="margin:16px auto 0;display:flex" onclick="openSchModal()">＋ 일정 추가</button>
  </div>`;
}

function setRmMonth(m){ S.activeMonth=m; renderRoadmap(); }

function openSchModal(id) {
  S.editSchId=id||null;
  const s=id?schedules.find(x=>String(x.id)===String(id)):null;
  openModal(`
    <div class="modal-title">
      ${s?'일정 수정':'일정 추가'}
      <button class="modal-close" onclick="closeModal()">✕</button>
    </div>
    <div class="lf-row">
      <div class="lf-group" style="margin:0">
        <label class="lf-label">월</label>
        <select class="lf-select" id="sm-month">
          ${Array.from({length:12},(_,i)=>i+1).map(m=>`<option value="${m}"${(s?s.month:S.activeMonth)===m?' selected':''}>${MONTH_NAMES[m]}</option>`).join('')}
        </select>
      </div>
      <div class="lf-group" style="margin:0">
        <label class="lf-label">유형</label>
        <select class="lf-select" id="sm-type">
          ${['법정','정기','계절'].map(t=>`<option${s?.type===t?' selected':''}>${t}</option>`).join('')}
        </select>
      </div>
    </div>
    <div class="lf-group">
      <label class="lf-label">일정 제목 *</label>
      <input class="lf-input" id="sm-title" type="text" value="${esc(s?.title||'')}" placeholder="점검·작업 제목"/>
    </div>
    <div class="lf-group">
      <label class="lf-label">설명</label>
      <textarea class="lf-textarea" id="sm-desc" rows="3" placeholder="세부 내용, 준비사항...">${esc(s?.desc||'')}</textarea>
    </div>
    <div class="modal-actions">
      <button class="btn-gh" onclick="closeModal()">취소</button>
      <button class="btn-o" id="btn-save-sch" onclick="saveSchedule()">💾 저장</button>
    </div>`);
}

async function saveSchedule() {
  const title=$('sm-title')?.value.trim();
  if(!title){ toast('⚠️ 제목을 입력하세요'); return; }
  const data={
    month:parseInt($('sm-month')?.value||S.activeMonth),
    type:$('sm-type')?.value||'정기', title,
    desc:$('sm-desc')?.value.trim()||'', updatedAt:new Date().toISOString(),
  };
  try {
    if(S.fbReady&&!S.isGuest&&db){
      if(S.editSchId){ await db.collection('schedules').doc(S.editSchId).update(data); }
      else{ data.createdAt=new Date().toISOString(); await db.collection('schedules').add(data); }
    } else {
      data.id=S.editSchId||genId();
      if(S.editSchId){ const idx=schedules.findIndex(x=>String(x.id)===String(S.editSchId)); if(idx!==-1)schedules[idx]=data; else schedules.push(data); }
      else{ schedules.push(data); }
      renderRoadmap();
    }
    S.editSchId=null; toast('✅ 저장됐습니다'); closeModal();
    if(S.currentPage==='roadmap') renderRoadmap();
  } catch(e){ toast('⚠️ 저장 실패: '+e.message); }
}

async function deleteSchedule(id) {
  if(!confirm('이 일정을 삭제하시겠습니까?')) return;
  try {
    if(S.fbReady&&!S.isGuest&&db){ await db.collection('schedules').doc(String(id)).delete(); }
    else{ schedules=schedules.filter(s=>String(s.id)!==String(id)); renderRoadmap(); }
    toast('🗑 삭제됐습니다');
  } catch(e){ toast('⚠️ 삭제 실패: '+e.message); }
}

/* =====================================================
   ⑰ 연락처
===================================================== */
function renderContacts() {
  const el=$('contacts-list'); if(!el) return;
  el.innerHTML = contacts.length ? contacts.map((c,i)=>`
    <div class="gc contact-card">
      <div class="contact-avatar" style="background:${CONTACT_COLORS[i%CONTACT_COLORS.length]}22;color:${CONTACT_COLORS[i%CONTACT_COLORS.length]}">
        ${(c.name||'?')[0].toUpperCase()}
      </div>
      <div class="contact-info">
        <div class="contact-name">${esc(c.name)}</div>
        <div class="contact-role">${esc(c.role||'')}${c.company?' · '+esc(c.company):''}</div>
        ${c.phone?`<div class="contact-phone">${esc(c.phone)}</div>`:''}
      </div>
      <div style="display:flex;gap:6px">
        ${c.phone?`<a href="tel:${c.phone}" class="lc-btn lc-btn-edit" style="text-decoration:none;display:flex;align-items:center;padding:10px">📞</a>`:''}
        ${c.email?`<a href="mailto:${esc(c.email)}" class="lc-btn lc-btn-edit" style="text-decoration:none;display:flex;align-items:center;padding:10px">✉️</a>`:''}
      </div>
    </div>`).join('') :
  `<div class="gc" style="padding:48px;text-align:center;color:var(--t4)">
    <div style="font-size:36px;opacity:.3;margin-bottom:12px">📇</div>
    <div style="font-size:15px">연락처가 없습니다</div>
  </div>`;
}

function openContactModal() { toast('연락처 추가 기능은 준비 중입니다.'); }

/* =====================================================
   ⑱ 통계
===================================================== */
function renderStats() {
  const sv=(id,v)=>{ const e=$(id); if(e) e.textContent=v; };
  sv('stats-total', logs.length);
  sv('stats-done',  logs.filter(l=>l.status==='완료').length);
  sv('stats-prog',  logs.filter(l=>l.status==='진행중').length);
  sv('stats-memo',  memos.length);
}

/* =====================================================
   ⑲ 검색
===================================================== */
function doSearch(q) {
  const el=$('search-results'); if(!el) return;
  if(!q.trim()){ el.innerHTML='<div style="text-align:center;padding:48px;color:var(--t4)"><div style="font-size:32px;opacity:.3;margin-bottom:12px">🔍</div><div style="font-size:15px">검색어를 입력하세요</div></div>'; return; }
  const ql=q.toLowerCase();
  const results=[];
  ['electric','mechanical','construction','fire'].forEach(cat=>{
    (manuals[cat]||[]).forEach(m=>{
      if(m.title.toLowerCase().includes(ql)||(m.overview||'').toLowerCase().includes(ql)||(m.tags||[]).some(t=>t.toLowerCase().includes(ql)))
        results.push({type:'manual',cat,item:m});
    });
  });
  logs.forEach(l=>{ if((l.title||'').toLowerCase().includes(ql)||(l.desc||'').toLowerCase().includes(ql)) results.push({type:'log',item:l}); });
  memos.forEach(m=>{ if((m.title||'').toLowerCase().includes(ql)||(m.content||'').toLowerCase().includes(ql)) results.push({type:'memo',item:m}); });

  if(!results.length){ el.innerHTML=`<div style="text-align:center;padding:48px;color:var(--t4)"><div style="font-size:32px;opacity:.3;margin-bottom:12px">🔍</div><div style="font-size:15px">"${esc(q)}" 결과 없음</div></div>`; return; }
  const typeEmoji={manual:'📋',log:'📝',memo:'📒'};
  el.innerHTML=`<div style="font-size:13px;color:var(--t3);margin-bottom:12px">${results.length}개 결과</div>`
    +results.map(r=>{
      let title='',sub='',action='';
      if(r.type==='manual'){title=r.item.title;sub=CAT_KEY_MAP[r.cat]+'  매뉴얼';action=`viewManual('${r.cat}','${r.item.id}')`;}
      else if(r.type==='log'){title=r.item.title;sub=`${r.item.status} · ${r.item.cat||''} · ${r.item.date||''}`;action=`openLogDetail('${r.item.id}')`;}
      else{title=r.item.title;sub=`${r.item.cat||''} 메모 · ${r.item.date||''}`;action=`openMemoDetail('${r.item.id}')`;}
      return `<div class="gc" style="padding:14px 16px;cursor:pointer;display:flex;align-items:center;gap:12px;margin-bottom:8px" onclick="${action}">
        <div style="font-size:20px;flex-shrink:0">${typeEmoji[r.type]}</div>
        <div style="flex:1;min-width:0">
          <div style="font-size:15px;font-weight:700;color:var(--t1)">${esc(title)}</div>
          <div style="font-size:12px;color:var(--t3);margin-top:3px">${esc(sub)}</div>
        </div>
        <span style="color:var(--t4)">›</span>
      </div>`;
    }).join('');
}

/* =====================================================
   ⑳ 데이터 내보내기
===================================================== */
function exportData() {
  const data={logs,memos,schedules,contacts};
  const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});
  const a=document.createElement('a');
  a.href=URL.createObjectURL(blob);
  a.download=`kfacility_${today()}.json`;
  a.click();
  toast('📥 내보내기 완료');
}

function clearLocalData() {
  if(!confirm('로컬 임시 데이터를 모두 삭제하시겠습니까?')) return;
  logs=[]; memos=[]; schedules=[...SAMPLE_SCHEDULES]; contacts=[...SAMPLE_CONTACTS];
  manuals=JSON.parse(JSON.stringify(SAMPLE_MANUALS));
  renderHome(); toast('초기화됐습니다');
}

/* =====================================================
   ㉑ 모바일 키보드 대응
===================================================== */
function initMobileInputFix() {
  if (typeof window.visualViewport === 'undefined') return;
  const pages = $('pages');
  if (!pages) return;
  window.visualViewport.addEventListener('resize', () => {
    const vh  = window.visualViewport.height;
    const hdr = $('hdr')?.offsetHeight || 58;
    pages.style.maxHeight = (vh - hdr) + 'px';
  });
}

/* =====================================================
   ㉒ BOOT
===================================================== */
document.addEventListener('DOMContentLoaded', () => {
  /* ★ 안전망: 3초 안에 onAuthStateChanged 응답 없으면 강제로 로그인 화면 표시 */
  const _safetyTimer = setTimeout(() => {
    const app = document.getElementById('app');
    if (app && (app.classList.contains('hidden') || app.style.display === 'none')) {
      console.warn('[K-Facility] ⚠️ 인증 타임아웃 — 로그인 화면으로 강제 전환');
      hideAuthLoader();
      showLoginScreen();
    }
  }, 3000);
  /* onAuthStateChanged가 정상 응답하면 타이머 의미 없어짐 (이미 표시됨) */

  /* 로그인 */
  $('btn-google')?.addEventListener('click', loginGoogle);
  $('btn-guest')?.addEventListener('click',  loginGuest);
  $('btn-logout')?.addEventListener('click', logout);

  /* 사이드바 */
  document.querySelectorAll('.nb[data-p]').forEach(btn => {
    btn.addEventListener('click', () => goto(btn.dataset.p));
  });

  /* data-goto 전역 위임 */
  document.addEventListener('click', e => {
    const el = e.target.closest('[data-goto]');
    if (el && !e.defaultPrevented) goto(el.dataset.goto);
  });

  /* 헤더 검색 */
  const si = $('si');
  if (si) si.addEventListener('focus', () => goto('search'));
  const sInp = $('search-input');
  if (sInp) sInp.addEventListener('input', e => doSearch(e.target.value));

  /* 테마 토글 — light ↔ dark */
  const _tsw = $('tsw');
  if (_tsw) _tsw.addEventListener('click', () => {
    console.log('[K-Facility] 토글 클릭. 현재 light-mode:', document.body.classList.contains('light-mode'));
    toggleTheme();
  });

  initMobileInputFix();
  initFirebase();
});

/* ═══════════════════════════════════════════════
   renderSteps(steps, containerId)
   역할: [{text, imgUrl}] 배열을 받아 step-container에 렌더링
   - 페이지 로드 시 renderManualDetail()이 내부 호출
   - 외부에서도 renderSteps(steps) 로 직접 호출 가능
═══════════════════════════════════════════════ */
function renderSteps(steps, containerId) {
  const el = $(containerId || 'step-container') || $('md-steps-list');
  if (!el) return;

  /* 데이터 정규화: 문자열 / {title,desc} 구형 / {text,imgUrl(s)} 모두 처리 */
  const list = (steps || []).map(s => {
    if (typeof s === 'string') return { text: s, imgUrls: [] };
    const text = s.text !== undefined ? s.text
      : ((s.title||'').trim() + (s.desc ? ' — '+(s.desc||'').trim() : ''));
    /* 구형 단일 imgUrl → 배열로 */
    const imgUrls = s.imgUrls || (s.imgUrl ? [s.imgUrl] : []);
    return { text, imgUrls };
  }).filter(s => s.text.trim());

  if (!list.length) {
    el.innerHTML = '<div class="empty-state"><div class="empty-state__icon">📋</div><div class="empty-state__text">등록된 절차가 없습니다</div></div>';
    return;
  }

  el.innerHTML = list.map((s, i) => `
    <div class="step-row">
      <div class="step-left">
        <div class="step-num-circle">${i + 1}</div>
        ${i < list.length - 1 ? '<div class="step-connector"></div>' : ''}
      </div>
      <div class="glass step-card">
        <div class="step-card-head">
          <div class="step-title">${esc(s.text)}</div>
          ${s.imgUrls.length ? `
            <div class="step-photos-row">
              ${s.imgUrls.map(url => `
                <img class="step-photo-thumb" src="${url}"
                  onclick="previewPhoto('${url}')" alt="절차 ${i+1} 사진">`
              ).join('')}
            </div>` : ''}
        </div>
      </div>
    </div>`).join('');
}


/* ──────────────────────────────────────────
   풀페이지 폼 — 뒤로 가기
   저장 안 하고 이전 페이지로 복귀
────────────────────────────────────────── */
function formBack(type) {
  S.uploadPhotos = [];
  if (type === 'log')    goto(S._formLogBack    || 'records');
  if (type === 'memo')   goto(S._formMemoBack   || 'memo');
  if (type === 'manual') goto(S.editManualCat   || 'electric');
}

/* 전역 노출 */
window.goto             = goto;
window.formBack           = formBack;
window.loginGoogle      = loginGoogle;
window.loginGuest       = loginGuest;
window.logout           = logout;
window.closeModal       = closeModal;
window.openModal        = openModal;
window.openLogModal     = openLogModal;
window.openLogDetail    = openLogDetail;
window.deleteLog        = deleteLog;
window.triggerPhotoInput = triggerPhotoInput;
window.removeUploadPhoto = removeUploadPhoto;
window.previewPhoto     = previewPhoto;
window.saveLog          = saveLog;
window.handleFormPhoto  = handleFormPhoto;
window.renderFormPhotoPreview = renderFormPhotoPreview;
window.removeFormPhoto  = removeFormPhoto;
window.openMemoModal    = openMemoModal;
window.openMemoDetail   = openMemoDetail;
window.deleteMemo       = deleteMemo;
window.saveMemo         = saveMemo;
window.openManualModal  = openManualModal;
window.renderStepItems  = renderStepItems;
window.renderSteps      = renderSteps;
window.addStepItem      = addStepItem;
window.removeStepItem   = removeStepItem;
window.handleStepPhoto  = handleStepPhoto;
window.removeStepPhoto  = removeStepPhoto;
window.handleManualPhoto = handleManualPhoto;
window.removeManualPhoto = removeManualPhoto;
window._refreshManualPhotoPreview = _refreshManualPhotoPreview;
window.saveManual       = saveManual;
window.deleteManual     = deleteManual;
window.viewManual       = viewManual;
window.toggleCk         = toggleCk;
window.setLogCat        = setLogCat;
window.setLogStatus     = setLogStatus;
window.setMemoFilter    = setMemoFilter;
window.setRmMonth       = setRmMonth;
window.openSchModal     = openSchModal;
window.saveSchedule     = saveSchedule;
window.deleteSchedule   = deleteSchedule;
window.openContactModal = openContactModal;
window.exportData       = exportData;
window.clearLocalData   = clearLocalData;
window.doSearch         = doSearch;

/* =====================================================
   ㉓ 테마 토글 — light(기본) ↔ dark
   · body에 light-mode 클래스가 기본으로 있음
   · 토글 클릭 → 클래스 제거 = 다크, 추가 = 라이트
   · localStorage로 새로고침 후에도 유지
===================================================== */
function toggleTheme() {
  const isLight = document.body.classList.toggle('light-mode');
  localStorage.setItem('theme', isLight ? 'light' : 'dark');
  const tsk = document.getElementById('tsk');
  if (tsk) tsk.style.transform = isLight ? 'translateX(20px)' : 'translateX(0)';
  console.log('[K-Facility] 테마 변경 →', isLight ? 'LIGHT' : 'DARK');
}

function initTheme() {
  const saved = localStorage.getItem('theme');
  const tsk   = document.getElementById('tsk');

  // 저장된 값이 'dark'이면 light-mode 제거 (다크로 전환)
  if (saved === 'dark') {
    document.body.classList.remove('light-mode');
    if (tsk) tsk.style.transform = 'translateX(0)';
  } else {
    // 기본 = light-mode (body 태그에 이미 클래스 있음, 혹시 없으면 추가)
    document.body.classList.add('light-mode');
    if (tsk) tsk.style.transform = 'translateX(20px)';
  }
}

/* .tsk 기본 위치를 transform 기준으로 세팅 */
document.addEventListener('DOMContentLoaded', () => {
  initTheme();
});

window.toggleTheme = toggleTheme;
window.initTheme   = initTheme;
