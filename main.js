/* =====================================================
   K-Facility — main.js  v3.0
   ─────────────────────────────────────────────────
   실제 Firebase 연동 완성본
   · Firestore 실시간 구독 (logs / memos / schedules)
   · Storage 사진 업로드 (800px 리사이징 + JPEG 압축)
   · 삭제 시 Storage 파일 동시 삭제
   · 오프라인/게스트: 로컬 배열로 fallback
   ─────────────────────────────────────────────────
   수정 가이드
     HTML 구조  → index.html
     디자인     → style.css
     로직       → main.js (여기)
===================================================== */

/* =====================================================
   ① FIREBASE 설정
   아래 값을 Firebase 콘솔 → 프로젝트 설정 → 웹 앱에서 복사
   index.html 상단 Firebase SDK 4개 주석도 해제 필요
===================================================== */
const FB_CFG = {
  apiKey:            'YOUR_API_KEY',
  authDomain:        'YOUR_PROJECT.firebaseapp.com',
  projectId:         'YOUR_PROJECT_ID',
  storageBucket:     'YOUR_PROJECT.appspot.com',
  messagingSenderId: 'YOUR_SENDER_ID',
  appId:             'YOUR_APP_ID',
};

/* Firebase 인스턴스 (initFirebase()에서 채워짐) */
let db      = null;   // Firestore
let storage = null;   // Storage
let auth    = null;   // Auth

/* Firestore 실시간 구독 해제 함수 */
let _unsubLogs  = null;
let _unsubMemos = null;
let _unsubSch   = null;

/* =====================================================
   ② GLOBAL STATE
===================================================== */
const S = {
  currentPage:     'home',
  user:            null,
  isGuest:         false,
  fbReady:         false,
  /* 편집 중인 문서 ID */
  editLogId:       null,
  editMemoId:      null,
  editSchId:       null,
  /* 필터 */
  logCatFilter:    '전체',
  logStatusFilter: '전체',
  memoFilter:      '전체',
  activeMonth:     new Date().getMonth() + 1,
  /* 매뉴얼 체크리스트 상태 (로컬) */
  checklistState:  {},
  currentManualCat: null,
  currentManualId:  null,
  /* 사진 업로드 임시 버퍼: [{ file, url, existing, storagePath }] */
  logPhotos:  [],
  memoPhotos: [],
};

/* =====================================================
   ③ 메모리 데이터 (Firestore 구독이 채워줌)
===================================================== */
let logs      = [];
let memos     = [];
let schedules = [];
let contacts  = [];

/* ── 기본 연간 일정 (Firestore 첫 실행 시 자동 저장) ── */
const DEFAULT_SCHEDULES = [
  { id:'ds1',  month:1,  type:'법정', title:'소방 시설 정기 점검',           desc:'소방 완공검사 증명서, 작동기능점검표 보관 확인' },
  { id:'ds2',  month:1,  type:'계절', title:'동파 방지 순찰 강화',            desc:'노출 배관 단열재 점검, 수도 계량기함 보온 상태 확인' },
  { id:'ds3',  month:2,  type:'정기', title:'비상 발전기 월간 점검 및 시운전', desc:'냉각수·오일·배터리 상태 확인, 30분 이상 무부하 시운전' },
  { id:'ds4',  month:3,  type:'계절', title:'해빙기 건물 점검',               desc:'외벽 균열·누수·기초 침하 확인, 옥상 방수 상태 점검' },
  { id:'ds5',  month:3,  type:'법정', title:'승강기 정기 검사 준비',           desc:'관할 기관에 검사 신청, 검사 전 자체 점검 실시' },
  { id:'ds6',  month:4,  type:'계절', title:'냉방 설비 가동 전 점검',          desc:'냉각탑 청소, 냉동기 오일·냉매 충전량 확인' },
  { id:'ds7',  month:5,  type:'법정', title:'전기 안전 점검',                 desc:'수전설비, 변압기, 배전반 정밀 점검, 절연저항 측정' },
  { id:'ds8',  month:6,  type:'계절', title:'우기 대비 방수·배수 점검',        desc:'옥상·지하 방수 상태, 빗물 배수로·집수정 청소' },
  { id:'ds9',  month:7,  type:'정기', title:'냉각탑 레지오넬라균 검사 및 청소', desc:'냉각수 수질 검사, 냉각탑 청소·소독 실시' },
  { id:'ds10', month:8,  type:'계절', title:'하절기 전력 피크 대비 점검',       desc:'수변전 설비 과부하 모니터링, 냉방 부하 분산 계획' },
  { id:'ds11', month:9,  type:'계절', title:'난방 설비 가동 전 점검',          desc:'보일러 청소·연소 상태 확인, 온수 배관 밸브 점검' },
  { id:'ds12', month:10, type:'법정', title:'소방 시설 종합 정밀 점검',        desc:'소방 펌프, 수신기, 유도등, 비상 방송 전체 점검' },
  { id:'ds13', month:10, type:'법정', title:'승강기 자체 안전 점검',           desc:'승강기 안전 부품 점검표 작성 및 자체 점검 실시' },
  { id:'ds14', month:11, type:'계절', title:'동파 방지 조치',                 desc:'노출 배관 보온재 설치, 동파 우려 배관 배수 처리' },
  { id:'ds15', month:12, type:'정기', title:'연간 시설 점검 결과 보고서 작성', desc:'연간 점검 이력 정리, 다음 연도 예방 보수 계획 및 예산 요청' },
];

/* ── 기본 연락처 ── */
const DEFAULT_CONTACTS = [
  { id:'c1', name:'홍길동',       role:'전기 담당',  company:'K-Facility', phone:'010-1234-5678', email:'hong@kfacility.com' },
  { id:'c2', name:'김철수',       role:'기계 담당',  company:'K-Facility', phone:'010-2345-6789', email:'kim@kfacility.com'  },
  { id:'c3', name:'LS전기 AS',   role:'전기 협력사', company:'LS산전',      phone:'1588-1234',    email:'' },
  { id:'c4', name:'삼보소방',     role:'소방 점검',   company:'삼보소방',    phone:'02-555-7890',  email:'' },
];

/* ── 매뉴얼 (내장 데이터, Firestore 미연동) ── */
const MANUALS = {
  electric: [
    { id:'e1', title:'분전반 MCB 차단기 교체', tags:['MCB','차단기'],
      overview:'과부하·단락으로 트립된 MCB를 안전하게 교체하는 절차입니다.',
      supplies:['드라이버(+/-)','절연 장갑','검전기','교체용 MCB','절연 테이프'],
      cautions:['주 차단기 OFF 후 작업','검전기로 무전압 확인','동일 용량 MCB 사용'],
      steps:[
        { title:'전원 차단 및 잠금', desc:'주 차단기를 OFF하고 LOTO를 적용합니다. 검전기로 무전압을 확인합니다.', youtube:'' },
        { title:'기존 MCB 제거',    desc:'상·하단 전선을 순서대로 분리합니다. 단자 위치를 사진으로 기록해두세요.', youtube:'' },
        { title:'신규 MCB 설치',    desc:'동일 규격 MCB를 딘레일에 고정하고 전선을 원래 순서대로 재결선합니다.', youtube:'' },
        { title:'투입 테스트',      desc:'주 차단기 투입 후 MCB를 ON 합니다. 정상 전압 공급 여부를 확인합니다.', youtube:'' },
      ],
      checklist:['주 차단기 OFF 확인','검전기 무전압 확인','MCB 사양 메모','결선 사진 촬영','신규 MCB 규격 확인','투입 후 전압 측정'],
      caution:'활선 작업 절대 금지. 반드시 정전 확인 후 진행하십시오.',
      tip:'MCB 교체 후 12시간 모니터링을 권장합니다.' },
    { id:'e2', title:'형광등·LED 교체', tags:['조명','전기'],
      overview:'형광등 또는 LED 조명을 교체하는 절차입니다.',
      supplies:['교체용 전구','사다리','절연 장갑'],
      cautions:['전원 차단 후 작업','사다리 고정 확인'],
      steps:[
        { title:'차단기 OFF',    desc:'해당 조명 회로 차단기를 내립니다.', youtube:'' },
        { title:'기존 램프 제거', desc:'냉각 후 기존 램프를 비틀어 제거합니다.', youtube:'' },
        { title:'신규 램프 설치', desc:'규격에 맞는 램프를 소켓에 고정합니다.', youtube:'' },
        { title:'점등 확인',     desc:'차단기를 올리고 정상 점등을 확인합니다.', youtube:'' },
      ],
      checklist:['전원 차단 확인','규격 동일 확인','점등 정상'],
      caution:'수은등·고압나트륨등은 전문 업체에 의뢰하세요.',
      tip:'LED로 교체 시 안정기 제거 여부를 확인하세요.' },
  ],
  mechanical: [
    { id:'m1', title:'냉각탑 필터 청소 및 교체', tags:['냉각탑','필터'],
      overview:'냉각탑 효율 유지를 위한 정기 필터 청소 및 교체 절차입니다.',
      supplies:['고압 세척기','필터 교체품','방수 장갑','안전화'],
      cautions:['냉각탑 전원 차단','고소 작업 시 안전대 착용'],
      steps:[
        { title:'전원 차단',      desc:'냉각탑 제어판에서 전원을 차단하고 잠금합니다.', youtube:'' },
        { title:'필터 탈거',      desc:'기존 필터를 탈거하고 오염 상태를 확인합니다.', youtube:'' },
        { title:'청소 / 교체',   desc:'오염이 경미하면 고압 세척, 심하면 신규 필터로 교체합니다.', youtube:'' },
        { title:'재장착 및 기동', desc:'필터 재장착 후 전원을 투입하고 정상 운전을 확인합니다.', youtube:'' },
      ],
      checklist:['전원 차단','필터 상태 확인','청소 또는 교체','재장착 완료','정상 운전 확인'],
      caution:'냉각수 온도 확인 후 작업 진행.',
      tip:'필터는 3개월마다 점검을 권장합니다.' },
  ],
  construction: [
    { id:'c1', title:'벽면 균열 보수 (에폭시 주입)', tags:['균열','에폭시','방수'],
      overview:'콘크리트 벽 균열에 에폭시를 주입하여 구조적 보강을 수행하는 절차입니다.',
      supplies:['에폭시 주입기','믹서 노즐','표면 처리제','방진 마스크','보호 안경'],
      cautions:['에폭시 피부 접촉 주의','환기 충분히 확보'],
      steps:[
        { title:'균열 정밀 조사', desc:'균열 길이·깊이·방향을 기록하고 사진을 촬영합니다.', youtube:'' },
        { title:'주입구 설치',   desc:'균열을 따라 20~30cm 간격으로 주입 패커를 설치합니다.', youtube:'' },
        { title:'표면 실링',     desc:'균열 표면을 에폭시 퍼티로 밀봉합니다.', youtube:'' },
        { title:'에폭시 주입',   desc:'저압 주입기로 말단에서 순서대로 에폭시를 주입합니다.', youtube:'' },
        { title:'경화 및 마감',  desc:'24시간 이상 경화 후 패커를 제거하고 표면을 마감합니다.', youtube:'' },
      ],
      checklist:['균열 촬영','주입구 간격 확인','표면 실링 완료','에폭시 주입 완료','경화 확인','표면 마감'],
      caution:'기온 5°C 이하에서는 작업을 중단하십시오.',
      tip:'주입 전 균열에 먼지·이물질을 에어건으로 제거하세요.' },
  ],
  fire: [
    { id:'f1', title:'스프링클러 헤드 교체', tags:['스프링클러','소방'],
      overview:'파손되거나 오작동한 스프링클러 헤드를 교체하는 절차입니다.',
      supplies:['스프링클러 헤드 렌치','교체용 헤드 (동일 규격)','테플론 테이프'],
      cautions:['소방 제어반에 작업 통보','급수 밸브 차단 필수'],
      steps:[
        { title:'소방 제어반 통보', desc:'작업 시작을 통보하고 해당 구역 급수 밸브를 차단합니다.', youtube:'' },
        { title:'기존 헤드 제거',  desc:'스프링클러 렌치로 기존 헤드를 제거합니다.', youtube:'' },
        { title:'신규 헤드 설치',  desc:'나사산에 테플론 테이프를 감고 신규 헤드를 설치합니다.', youtube:'' },
        { title:'방수 시험',       desc:'급수 밸브를 천천히 열고 누수 여부를 확인합니다.', youtube:'' },
        { title:'복구 및 보고',    desc:'소방 제어반에 작업 완료를 통보하고 작업 일지를 작성합니다.', youtube:'' },
      ],
      checklist:['제어반 통보','급수 밸브 차단','헤드 규격 확인','테플론 테이프 적용','누수 없음 확인','제어반 복구 보고','작업 일지 기록'],
      caution:'소방 제어반 통보 없이 작업 시 오경보 발생 위험.',
      tip:'헤드 교체 후 반드시 방수 시험을 실시하세요.' },
  ],
};

/* =====================================================
   ④ HELPERS
===================================================== */
const $    = id  => document.getElementById(id);
const esc  = s   => String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
const today = () => new Date().toISOString().slice(0, 10);
const uid   = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36);

const MONTH_NAMES   = ['','1월','2월','3월','4월','5월','6월','7월','8월','9월','10월','11월','12월'];
const CAT_ICON      = { 전기:'⚡', 기계:'⚙️', 영선:'🔨', 소방:'🔥', 기타:'📋' };
const STATUS_COLOR  = { 완료:'var(--green)', 진행중:'var(--blue)', 대기:'var(--amber)' };
const CAT_KEY_MAP   = { electric:'전기', mechanical:'기계', construction:'영선', fire:'소방' };
const SCH_TYPE_STYLE = {
  법정: { bg:'rgba(244,63,94,.15)',  border:'rgba(244,63,94,.3)',  color:'var(--red)'   },
  정기: { bg:'rgba(29,78,216,.15)',  border:'rgba(29,78,216,.3)',  color:'var(--blue)'  },
  계절: { bg:'rgba(16,185,129,.15)', border:'rgba(16,185,129,.3)', color:'var(--green)' },
};
const MEMO_COLORS = {
  전기:'rgba(224,92,10,.18)', 기계:'rgba(29,78,216,.18)',
  영선:'rgba(245,158,11,.18)', 소방:'rgba(244,63,94,.18)', 일반:'rgba(255,255,255,.10)',
};

/* 토스트 메시지 */
function toast(msg, duration = 2500) {
  let t = $('kf-toast');
  if (!t) {
    t = document.createElement('div');
    t.id = 'kf-toast';
    t.style.cssText = [
      'position:fixed', 'bottom:88px', 'left:50%',
      'transform:translateX(-50%) translateY(10px)',
      'background:rgba(12,16,32,.96)', 'color:#fff',
      'padding:11px 22px', 'border-radius:99px',
      'font-size:14px', 'font-weight:600', 'z-index:99999',
      'opacity:0', 'transition:all .22s', 'white-space:nowrap',
      'border:1px solid rgba(255,255,255,.15)',
      'box-shadow:0 4px 20px rgba(0,0,0,.4)',
      'pointer-events:none',
    ].join(';');
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.style.opacity = '1';
  t.style.transform = 'translateX(-50%) translateY(0)';
  clearTimeout(t._timer);
  t._timer = setTimeout(() => {
    t.style.opacity = '0';
    t.style.transform = 'translateX(-50%) translateY(10px)';
  }, duration);
}

/* =====================================================
   ⑤ FIREBASE 초기화 & 인증
===================================================== */
function initFirebase() {
  if (typeof firebase === 'undefined') {
    /* SDK 미로드 → 오프라인 모드 */
    console.info('[K-Facility] Firebase SDK 없음 — 오프라인 모드');
    schedules = [...DEFAULT_SCHEDULES];
    contacts  = [...DEFAULT_CONTACTS];
    return;
  }
  try {
    if (!firebase.apps.length) firebase.initializeApp(FB_CFG);
    db      = firebase.firestore();
    storage = firebase.storage();
    auth    = firebase.auth();
    S.fbReady = true;

    /* 오프라인 캐시 활성화 (네트워크 끊겨도 마지막 데이터 유지) */
    db.enablePersistence({ synchronizeTabs: true }).catch(err => {
      if (err.code === 'failed-precondition') console.warn('다중 탭 환경: 캐시는 하나의 탭에서만 활성화됩니다.');
      else if (err.code === 'unimplemented')  console.warn('이 브라우저는 오프라인 캐시를 지원하지 않습니다.');
    });

    /* 로그인 상태 감지 → 이미 로그인되어 있으면 자동 진입 */
    auth.onAuthStateChanged(user => {
      if (user) loginSuccess(user, false);
    });

  } catch (e) {
    console.error('[K-Facility] Firebase 초기화 실패:', e);
    schedules = [...DEFAULT_SCHEDULES];
    contacts  = [...DEFAULT_CONTACTS];
  }
}

/* Google 로그인 */
function loginGoogle() {
  if (!S.fbReady) {
    alert('Firebase 설정이 필요합니다.\nFB_CFG 값을 입력하고 index.html SDK 주석을 해제하세요.');
    return;
  }
  const provider = new firebase.auth.GoogleAuthProvider();
  firebase.auth().signInWithPopup(provider)
    .then(r => loginSuccess(r.user, false))
    .catch(e => { console.error(e); toast('⚠️ 로그인 실패: ' + e.message); });
}

/* 게스트 로그인 (데이터 로컬 저장, Firebase 미사용) */
function loginGuest() {
  loginSuccess({ displayName:'게스트', uid:'guest', email:'' }, true);
}

/* 로그인 공통 처리 */
function loginSuccess(user, isGuest) {
  S.user    = user;
  S.isGuest = isGuest;
  const init = (user.displayName || 'U').charAt(0).toUpperCase();
  $('ava').textContent   = init;
  $('uname').textContent = user.displayName || '사용자';
  if (isGuest) $('ava').style.background = 'linear-gradient(135deg,#64748b,#475569)';
  $('lov').classList.add('hidden');

  if (S.fbReady && !isGuest) {
    subscribeFirestore();   /* 실시간 구독 시작 */
  } else {
    /* 게스트/오프라인: 기본 데이터 사용 */
    schedules = [...DEFAULT_SCHEDULES];
    contacts  = [...DEFAULT_CONTACTS];
    goto('home');
  }
}

/* 로그아웃 */
function logout() {
  if (S.fbReady && !S.isGuest) {
    unsubscribeAll();
    firebase.auth().signOut().then(() => {
      S.user = null; S.isGuest = false;
      $('lov').classList.remove('hidden');
    });
  } else {
    S.user = null; S.isGuest = false;
    $('lov').classList.remove('hidden');
  }
}

/* =====================================================
   ⑥ FIRESTORE 실시간 구독
   ★ 필수 색인 (Firebase Console → Firestore → 색인)
     컬렉션 logs      필드: date 내림차순
     컬렉션 memos     필드: date 내림차순
     컬렉션 schedules 필드: month 오름차순
===================================================== */
function subscribeFirestore() {
  /* ── 작업기록 구독 ── */
  _unsubLogs = db.collection('logs')
    .orderBy('date', 'desc')
    .onSnapshot(
      snap => {
        logs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        /* 현재 보고 있는 페이지 즉시 반영 */
        if (S.currentPage === 'home')    renderHome();
        if (S.currentPage === 'records') renderRecords();
      },
      err => console.error('[logs 구독 오류]', err)
    );

  /* ── 학습메모 구독 ── */
  _unsubMemos = db.collection('memos')
    .orderBy('date', 'desc')
    .onSnapshot(
      snap => {
        memos = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        if (S.currentPage === 'memo') renderMemo();
      },
      err => console.error('[memos 구독 오류]', err)
    );

  /* ── 연간 로드맵 구독 ── */
  _unsubSch = db.collection('schedules')
    .orderBy('month')
    .onSnapshot(
      snap => {
        if (snap.empty) {
          /* 첫 실행: 기본 일정을 Firestore에 일괄 저장 */
          const batch = db.batch();
          DEFAULT_SCHEDULES.forEach(s => {
            batch.set(db.collection('schedules').doc(s.id), s);
          });
          batch.commit().catch(console.error);
          schedules = [...DEFAULT_SCHEDULES];
        } else {
          schedules = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        }
        if (S.currentPage === 'roadmap') renderRoadmap();
      },
      err => console.error('[schedules 구독 오류]', err)
    );

  /* ── 연락처 (단순 1회 조회) ── */
  db.collection('contacts').get()
    .then(snap => {
      if (snap.empty) {
        /* 첫 실행: 기본 연락처 저장 */
        const batch = db.batch();
        DEFAULT_CONTACTS.forEach(c => {
          batch.set(db.collection('contacts').doc(c.id), c);
        });
        return batch.commit().then(() => { contacts = [...DEFAULT_CONTACTS]; });
      }
      contacts = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      if (S.currentPage === 'contacts') renderContacts();
    })
    .catch(console.error);

  goto('home');
}

/* 구독 일괄 해제 */
function unsubscribeAll() {
  if (_unsubLogs)  { _unsubLogs();  _unsubLogs  = null; }
  if (_unsubMemos) { _unsubMemos(); _unsubMemos = null; }
  if (_unsubSch)   { _unsubSch();   _unsubSch   = null; }
}

/* =====================================================
   ⑦ 이미지 압축 유틸
   · maxPx: 긴 변 최대 800px (용량 절감 핵심)
   · quality: JPEG 0.78
   · 압축 결과가 원본보다 크면 원본 반환
===================================================== */
function compressImage(file, maxPx = 800, quality = 0.78) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('파일 읽기 실패'));
    reader.onload  = ev => {
      const img = new Image();
      img.onerror = () => reject(new Error('이미지 로드 실패'));
      img.onload  = () => {
        let w = img.width;
        let h = img.height;
        /* 리사이즈 계산 */
        if (w > maxPx || h > maxPx) {
          if (w >= h) { h = Math.round(h * maxPx / w); w = maxPx; }
          else        { w = Math.round(w * maxPx / h); h = maxPx; }
        }
        const canvas = document.createElement('canvas');
        canvas.width  = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        /* 흰 배경 (PNG 투명→JPEG 변환 시 검게 되는 문제 방지) */
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        canvas.toBlob(
          blob => {
            if (!blob) { reject(new Error('canvas.toBlob 실패')); return; }
            /* 압축 결과가 원본보다 크면 원본 사용 */
            resolve(blob.size < file.size ? blob : file);
          },
          'image/jpeg',
          quality
        );
      };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
  });
}

/* Firebase Storage 업로드 → 다운로드 URL 반환 */
async function uploadPhoto(file, storagePath) {
  if (!storage) throw new Error('Firebase Storage 미연결');
  const compressed = await compressImage(file);          /* 800px 리사이징 */
  const ref        = storage.ref(storagePath);
  const snap       = await ref.put(compressed, {
    contentType: 'image/jpeg',
    customMetadata: {
      originalName: file.name,
      uploadedBy:   S.user?.uid || 'guest',
      compressedSize: String(compressed.size),
    },
  });
  const url = await snap.ref.getDownloadURL();
  return { url, storagePath };                           /* path도 반환 → 삭제 시 사용 */
}

/* Storage 파일 삭제 (URL 또는 path 둘 다 허용) */
async function deleteStorageFile(urlOrPath) {
  if (!storage || !urlOrPath) return;
  try {
    const ref = (typeof urlOrPath === 'string' && urlOrPath.startsWith('http'))
      ? storage.refFromURL(urlOrPath)
      : storage.ref(urlOrPath);
    await ref.delete();
  } catch (e) {
    /* 이미 없는 파일이면 무시 (404 에러는 정상 처리) */
    if (e.code !== 'storage/object-not-found') {
      console.warn('[Storage 삭제 경고]', e.message);
    }
  }
}

/* =====================================================
   ⑧ ROUTER — 페이지 show / hide
===================================================== */
function goto(pageId) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  const target = $('page-' + pageId);
  if (target) {
    target.classList.add('active');
    document.getElementById('pages').scrollTop = 0;
  }
  document.querySelectorAll('.nb').forEach(b =>
    b.classList.toggle('active', b.dataset.p === pageId)
  );
  S.currentPage = pageId;
  onPageEnter(pageId);
}

function onPageEnter(pageId) {
  switch (pageId) {
    case 'home':         renderHome();                    break;
    case 'electric':     renderManualCat('electric');     break;
    case 'mechanical':   renderManualCat('mechanical');   break;
    case 'construction': renderManualCat('construction'); break;
    case 'fire':         renderManualCat('fire');         break;
    case 'records':      renderRecords();                 break;
    case 'records-form': initLogForm();                   break;
    case 'memo':         renderMemo();                    break;
    case 'memo-form':    initMemoForm();                  break;
    case 'roadmap':      renderRoadmap();                 break;
    case 'roadmap-form': initSchForm();                   break;
    case 'contacts':     renderContacts();                break;
    case 'stats':        renderStats();                   break;
    case 'ba-detail':    initSlider();                    break;
    case 'manual-detail':renderManualDetail();            break;
  }
}

/* =====================================================
   ⑨ HOME
===================================================== */
function renderHome() {
  const dateEl = $('home-date');
  if (dateEl) dateEl.textContent = new Date().toLocaleDateString('ko-KR',
    { year:'numeric', month:'long', day:'numeric', weekday:'short' });

  /* 최근 작업 2건 홈 카드에 반영 */
  const miniRow = $('home-mini-row');
  if (miniRow) {
    const recent = logs.slice(0, 2);
    if (recent.length) {
      miniRow.innerHTML = recent.map(l => `
        <div class="mini" style="cursor:pointer" onclick="openLogDetail('${l.id}')">
          <div class="ml">최근 ${esc(l.cat || '')} 작업</div>
          <div class="mv">${esc(l.title)}</div>
          <div class="md">${l.date || ''}</div>
        </div>`).join('');
    }
  }

  /* 체크리스트 클릭 이벤트 */
  document.querySelectorAll('#page-home .chk').forEach(chk => {
    chk.onclick = () => {
      chk.classList.toggle('on');
      chk.textContent = chk.classList.contains('on') ? '✓' : '';
      if (chk.nextElementSibling) chk.nextElementSibling.classList.toggle('done', chk.classList.contains('on'));
      updateHomeProgress();
    };
  });
  updateHomeProgress();
}

function updateHomeProgress() {
  const all  = document.querySelectorAll('#page-home .chk').length;
  const done = document.querySelectorAll('#page-home .chk.on').length;
  const pct  = all ? Math.round(done / all * 100) : 0;
  const pf = $('pf');       if (pf) pf.style.width       = pct + '%';
  const cc = $('ck-count'); if (cc) cc.textContent        = done + ' / ' + all + ' 완료';
  const cp = $('ck-pct');   if (cp) cp.textContent        = pct + '%';
}

/* =====================================================
   ⑩ 작업기록 (RECORDS)
===================================================== */
const LOG_CATS   = ['전체','전기','기계','영선','소방','기타'];
const LOG_STATUS = ['전체','완료','진행중','대기'];

function renderRecords() {
  /* 통계 카드 */
  const el = (id, val) => { const e = $(id); if (e) e.textContent = val; };
  el('log-stat-total', logs.length);
  el('log-stat-done',  logs.filter(l => l.status === '완료').length);
  el('log-stat-prog',  logs.filter(l => l.status === '진행중').length);
  el('log-stat-wait',  logs.filter(l => l.status === '대기').length);

  /* 필터 칩 렌더 */
  const catBar = $('log-cat-filter');
  if (catBar) catBar.innerHTML = LOG_CATS.map(c =>
    `<button class="fchip${S.logCatFilter === c ? ' on' : ''}" onclick="setLogCatFilter('${c}')">${c}</button>`
  ).join('');

  const statusBar = $('log-status-filter');
  if (statusBar) statusBar.innerHTML = LOG_STATUS.map(s =>
    `<button class="fchip${S.logStatusFilter === s ? ' on' : ''}" onclick="setLogStatusFilter('${s}')">${s}</button>`
  ).join('');

  /* 필터 적용 후 목록 렌더 */
  let list = [...logs].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  if (S.logCatFilter    !== '전체') list = list.filter(l => l.cat    === S.logCatFilter);
  if (S.logStatusFilter !== '전체') list = list.filter(l => l.status === S.logStatusFilter);

  const countEl = $('log-list-count');
  if (countEl) countEl.textContent = list.length + '건';

  const listEl = $('log-list');
  if (!listEl) return;
  listEl.innerHTML = list.length ? list.map(l => {
    const sc    = STATUS_COLOR[l.status] || 'var(--t3)';
    const thumb = (l.photos || [])[0]
      ? `<img src="${l.photos[0]}" onclick="event.stopPropagation();previewPhoto('${l.photos[0]}')"
           style="width:56px;height:56px;border-radius:9px;object-fit:cover;flex-shrink:0;border:1px solid rgba(255,255,255,.12);cursor:zoom-in">`
      : '';
    return `
    <div class="gc log-card" onclick="openLogDetail('${l.id}')">
      <div class="lc-left">
        <div class="lc-cat-icon">${CAT_ICON[l.cat] || '📋'}</div>
        <div class="lc-status-dot" style="background:${sc}"></div>
      </div>
      <div class="lc-body">
        <div class="lc-title">${esc(l.title)}</div>
        <div class="lc-meta">
          <span class="lc-badge" style="background:${sc}22;color:${sc};border:1px solid ${sc}44">${esc(l.status)}</span>
          <span>${esc(l.cat || '')}</span>
          ${l.date   ? `<span>📅 ${esc(l.date)}</span>`         : ''}
          ${l.worker ? `<span>👤 ${esc(l.worker)}</span>`       : ''}
        </div>
        ${l.desc ? `<div class="lc-desc">${esc(l.desc)}</div>` : ''}
      </div>
      ${thumb}
      <div class="lc-actions" onclick="event.stopPropagation()">
        <button class="lc-btn lc-btn-edit" onclick="openLogForm('${l.id}')">✏️</button>
        <button class="lc-btn lc-btn-del"  onclick="deleteLog('${l.id}')">🗑</button>
      </div>
    </div>`;
  }).join('') :
  `<div class="gc" style="padding:48px;text-align:center;color:var(--t4)">
    <div style="font-size:36px;opacity:.3;margin-bottom:12px">📋</div>
    <div style="font-size:15px">해당하는 기록이 없습니다</div>
    <button class="btn-o" style="margin:16px auto 0;display:flex" data-goto="records-form">＋ 첫 기록 작성</button>
  </div>`;
}

function setLogCatFilter(f)    { S.logCatFilter = f;    renderRecords(); }
function setLogStatusFilter(f) { S.logStatusFilter = f; renderRecords(); }

/* ── 작업기록 상세 ── */
function openLogDetail(id) {
  const l = logs.find(x => x.id === id);
  if (!l) return;
  S.editLogId = id;
  const sc = STATUS_COLOR[l.status] || 'var(--t3)';

  /* 빵가루 & 상태 뱃지 */
  const brd = $('log-detail-breadcrumb'); if (brd) brd.textContent = l.title;
  const sbdg = $('log-detail-status-badge');
  if (sbdg) sbdg.innerHTML = `<span style="background:${sc}22;color:${sc};border:1px solid ${sc}44;font-size:11px;font-weight:700;padding:3px 10px;border-radius:99px">${esc(l.status)}</span>`;

  /* 정보 필드 */
  const f = (id, val) => { const e = $(id); if (e) e.textContent = val; };
  f('log-detail-title',     l.title);
  f('log-detail-cat',       l.cat || '-');
  f('log-detail-worker',    l.worker || '-');
  f('log-detail-date',      l.date   || '-');
  const svEl = $('log-detail-statusval');
  if (svEl) svEl.innerHTML = `<span style="color:${sc};font-weight:700">${esc(l.status)}</span>`;

  /* 상세 내용 */
  const descWrap = $('log-detail-desc-wrap');
  const descEl   = $('log-detail-desc');
  if (descWrap && descEl) {
    if (l.desc) { descWrap.style.display = ''; descEl.textContent = l.desc; }
    else { descWrap.style.display = 'none'; }
  }

  /* 첨부 사진 */
  const photoWrap = $('log-detail-photos');
  if (photoWrap) {
    const photos = l.photos || [];
    if (photos.length) {
      photoWrap.style.display = '';
      /* 라벨 + 이미지 그리드 */
      photoWrap.innerHTML = `
        <div class="slbl" style="margin-bottom:12px">📷 현장 사진 ${photos.length}장</div>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:8px">
          ${photos.map(url =>
            `<img src="${url}" onclick="previewPhoto('${url}')"
              style="width:100%;aspect-ratio:1;object-fit:cover;border-radius:10px;cursor:zoom-in;border:1px solid rgba(255,255,255,.1)">`
          ).join('')}
        </div>`;
    } else {
      photoWrap.style.display = 'none';
    }
  }

  /* 수정/삭제 버튼 연결 */
  const editBtn = $('btn-log-detail-edit');
  const delBtn  = $('btn-log-detail-del');
  if (editBtn) editBtn.onclick = () => openLogForm(id);
  if (delBtn)  delBtn.onclick  = () => deleteLog(id);

  goto('records-detail');
}

/* ── 작업기록 폼 (새 기록 / 수정) ── */
function openLogForm(id) {
  S.editLogId = id || null;
  S.logPhotos = [];
  const titleEl = $('log-form-title');
  if (titleEl) titleEl.textContent = id ? '작업기록 수정' : '새 기록';
  goto('records-form');

  if (id) {
    const l = logs.find(x => x.id === id);
    if (!l) return;
    setTimeout(() => {
      const f = (el, val) => { const e = $(el); if (e) e.value = val || ''; };
      f('lf-cat',    l.cat    || '전기');
      f('lf-status', l.status || '완료');
      f('lf-title',  l.title  || '');
      f('lf-worker', l.worker || '');
      f('lf-date',   l.date   || today());
      f('lf-desc',   l.desc   || '');
      /* 기존 사진 미리보기 버퍼에 등록 */
      S.logPhotos = (l.photos || []).map((url, i) => ({
        url,
        existing:    true,
        storagePath: (l.storagePaths || [])[i] || null,
        file:        null,
      }));
      renderLogPhotoPreview();
    }, 60);
  }
}

function initLogForm() {
  if (!S.editLogId) {
    /* 새 기록: 초기화 */
    const f = (id, val) => { const e = $(id); if (e) e.value = val; };
    f('lf-cat', '전기'); f('lf-status', '완료'); f('lf-date', today());
    ['lf-title','lf-worker','lf-desc'].forEach(id => { const e=$(id); if(e) e.value=''; });
    S.logPhotos = [];
    renderLogPhotoPreview();
  }
  /* 버튼 연결 */
  const saveBtn   = $('btn-save-log');    if (saveBtn)   saveBtn.onclick   = saveLog;
  const camBtn    = $('btn-log-camera');  if (camBtn)    camBtn.onclick    = () => $('log-photo-camera') && $('log-photo-camera').click();
  const galBtn    = $('btn-log-gallery'); if (galBtn)    galBtn.onclick    = () => $('log-photo-input')  && $('log-photo-input').click();
  const camInp    = $('log-photo-camera');if (camInp)    camInp.onchange   = handleLogPhotoSelect;
  const galInp    = $('log-photo-input'); if (galInp)    galInp.onchange   = handleLogPhotoSelect;
}

/* 사진 선택 핸들러 (카메라 / 갤러리 공용) */
function handleLogPhotoSelect(e) {
  const files = [...e.target.files];
  if (!files.length) return;
  files.forEach(file => {
    /* FileReader로 로컬 미리보기 URL 생성 */
    const reader = new FileReader();
    reader.onload = ev => {
      S.logPhotos.push({ file, url: ev.target.result, existing: false, storagePath: null });
      renderLogPhotoPreview();
    };
    reader.readAsDataURL(file);
  });
  e.target.value = ''; /* 같은 파일 재선택 허용 */
}

/* 사진 미리보기 렌더 */
function renderLogPhotoPreview() {
  const wrap = $('log-photo-preview');
  if (!wrap) return;
  if (!S.logPhotos.length) { wrap.innerHTML = ''; return; }
  wrap.innerHTML = S.logPhotos.map((p, i) => `
    <div style="position:relative;display:inline-block">
      <img src="${p.url}"
           style="width:80px;height:80px;object-fit:cover;border-radius:10px;border:1px solid rgba(255,255,255,.15);display:block">
      <button onclick="removeLogPhoto(${i})"
        style="position:absolute;top:-7px;right:-7px;width:22px;height:22px;border-radius:50%;
               background:var(--red);color:#fff;border:none;font-size:13px;cursor:pointer;
               display:flex;align-items:center;justify-content:center;font-weight:800;
               box-shadow:0 2px 6px rgba(0,0,0,.4);z-index:1">×</button>
    </div>`).join('');
}

function removeLogPhoto(i) { S.logPhotos.splice(i, 1); renderLogPhotoPreview(); }

/* ── saveLog: Firestore + Storage 동시 저장 ── */
async function saveLog() {
  const titleEl = $('lf-title');
  const title   = titleEl ? titleEl.value.trim() : '';
  if (!title) { toast('⚠️ 제목을 입력하세요'); if (titleEl) titleEl.focus(); return; }

  const saveBtn = $('btn-save-log');
  if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = '저장 중...'; }
  toast('📤 저장 중...');

  try {
    /* ① 신규 사진만 Storage에 업로드 (800px 압축 포함) */
    const finalPhotos      = [];  /* 다운로드 URL 배열 */
    const finalStoragePaths = []; /* Storage 경로 배열 (삭제 시 사용) */
    const uid_  = S.user?.uid || 'guest';
    const docId = S.editLogId || db ? db.collection('logs').doc().id : ('local_' + Date.now());

    for (const p of S.logPhotos) {
      if (p.existing) {
        /* 기존 사진: URL과 경로 그대로 유지 */
        finalPhotos.push(p.url);
        finalStoragePaths.push(p.storagePath || '');
      } else {
        /* 신규 사진: Storage 업로드 */
        if (S.fbReady && !S.isGuest && storage) {
          const filename  = `${Date.now()}_${Math.random().toString(36).slice(2)}.jpg`;
          const spath     = `logs/${uid_}/${docId}/${filename}`;
          const { url }   = await uploadPhoto(p.file, spath);  /* 800px 압축 */
          finalPhotos.push(url);
          finalStoragePaths.push(spath);
        } else {
          /* 오프라인/게스트: Base64 URL 그대로 사용 */
          finalPhotos.push(p.url);
          finalStoragePaths.push('');
        }
      }
    }

    /* ② Firestore 문서 데이터 구성 */
    const data = {
      title,
      cat:          $('lf-cat')    ? $('lf-cat').value    : '기타',
      status:       $('lf-status') ? $('lf-status').value : '완료',
      worker:       $('lf-worker') ? $('lf-worker').value.trim() : '',
      date:         $('lf-date')   ? $('lf-date').value   : today(),
      desc:         $('lf-desc')   ? $('lf-desc').value.trim() : '',
      photos:       finalPhotos,
      storagePaths: finalStoragePaths,   /* ★ 삭제 연동에 필수 */
      updatedAt:    new Date().toISOString(),
    };

    /* ③ Firestore 저장 */
    if (S.fbReady && !S.isGuest && db) {
      if (S.editLogId) {
        /* 수정: 기존 문서 업데이트 */
        await db.collection('logs').doc(S.editLogId).update(data);
      } else {
        /* 신규: 새 문서 추가 (createdAt 포함) */
        data.createdAt = new Date().toISOString();
        await db.collection('logs').doc(docId).set(data);
      }
      /* → Firestore onSnapshot이 자동으로 화면 갱신 */
    } else {
      /* 오프라인/게스트: 로컬 배열 직접 수정 */
      data.id = S.editLogId || docId;
      if (S.editLogId) {
        const idx = logs.findIndex(x => x.id === S.editLogId);
        if (idx !== -1) logs[idx] = data;
      } else {
        logs.unshift(data);
      }
    }

    S.editLogId = null;
    toast('✅ 저장됐습니다');
    goto('records');

  } catch (e) {
    console.error('[saveLog 오류]', e);
    toast('⚠️ 저장 실패: ' + e.message, 4000);
  } finally {
    if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = '💾 저장하기'; }
  }
}

/* ── deleteLog: Firestore + Storage 동시 삭제 ── */
async function deleteLog(id) {
  if (!confirm('이 기록을 삭제하시겠습니까?\n첨부 사진 파일도 함께 삭제됩니다.')) return;
  const l = logs.find(x => x.id === id);
  toast('🗑 삭제 중...');

  try {
    /* ① Storage 파일 먼저 삭제
       storagePaths 배열이 있으면 경로로 삭제 (더 정확)
       없으면 photos URL로 시도                              */
    if (l) {
      const paths = l.storagePaths && l.storagePaths.length
        ? l.storagePaths
        : (l.photos || []);
      for (const p of paths) {
        if (p) await deleteStorageFile(p);
      }
    }

    /* ② Firestore 문서 삭제 */
    if (S.fbReady && !S.isGuest && db) {
      await db.collection('logs').doc(id).delete();
      /* → onSnapshot이 자동으로 목록 갱신 */
    } else {
      logs = logs.filter(x => x.id !== id);
      renderRecords();
    }

    toast('🗑 삭제됐습니다');
    if (S.currentPage === 'records-detail') goto('records');

  } catch (e) {
    console.error('[deleteLog 오류]', e);
    toast('⚠️ 삭제 실패: ' + e.message, 4000);
  }
}

/* =====================================================
   ⑪ 학습메모 (MEMO)
===================================================== */
const MEMO_CATS = ['전체','전기','기계','영선','소방','일반'];

function renderMemo() {
  const filterEl = $('memo-filter');
  if (filterEl) filterEl.innerHTML = MEMO_CATS.map(c =>
    `<button class="fchip${S.memoFilter === c ? ' on' : ''}" onclick="setMemoFilter('${c}')">${c}</button>`
  ).join('');

  let list = [...memos].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  if (S.memoFilter !== '전체') list = list.filter(m => m.cat === S.memoFilter);

  const countEl = $('memo-list-count'); if (countEl) countEl.textContent = list.length + '건';
  const listEl  = $('memo-list');       if (!listEl) return;

  listEl.innerHTML = list.length ? list.map(m => {
    const bg      = MEMO_COLORS[m.cat] || 'rgba(255,255,255,.08)';
    const preview = (m.content || '').slice(0, 100) + ((m.content || '').length > 100 ? '…' : '');
    return `
    <div class="gc memo-card" onclick="openMemoDetail('${m.id}')">
      <div class="memo-card-head">
        <span class="memo-cat-badge" style="background:${bg}">${esc(m.cat)}</span>
        <span style="font-size:11px;color:var(--t4)">${m.date || ''}</span>
      </div>
      <div class="memo-card-title">${esc(m.title)}</div>
      <div class="memo-card-preview">${esc(preview)}</div>
      <div class="memo-tags">${(m.tags || []).map(t => `<span class="m-tag">${esc(t)}</span>`).join('')}</div>
    </div>`;
  }).join('') :
  `<div class="gc" style="padding:48px;text-align:center;color:var(--t4);grid-column:1/-1">
    <div style="font-size:36px;opacity:.3;margin-bottom:12px">📒</div>
    <div style="font-size:15px">등록된 메모가 없습니다</div>
    <button class="btn-o" style="margin:16px auto 0;display:flex" data-goto="memo-form">＋ 첫 메모 작성</button>
  </div>`;
}

function setMemoFilter(f) { S.memoFilter = f; renderMemo(); }

function openMemoDetail(id) {
  const m = memos.find(x => x.id === id); if (!m) return;
  S.editMemoId = id;
  const bg = MEMO_COLORS[m.cat] || 'rgba(255,255,255,.08)';
  const f  = (el, val) => { const e = $(el); if (e) e.textContent = val; };
  f('memo-detail-breadcrumb', m.title);
  f('memo-detail-title',      m.title);
  f('memo-detail-date',       '📅 ' + (m.date || '-'));
  const badge = $('memo-detail-cat-badge');
  if (badge) { badge.textContent = m.cat; badge.style.background = bg; }
  const tagsEl = $('memo-detail-tags');
  if (tagsEl) tagsEl.innerHTML = (m.tags || []).map(t => `<span class="m-tag">${esc(t)}</span>`).join('');
  const contentEl = $('memo-detail-content');
  if (contentEl) contentEl.textContent = m.content || '';
  const editBtn = $('btn-memo-detail-edit'); if (editBtn) editBtn.onclick = () => openMemoForm(id);
  const delBtn  = $('btn-memo-detail-del');  if (delBtn)  delBtn.onclick  = () => deleteMemo(id);
  goto('memo-detail');
}

function openMemoForm(id) {
  S.editMemoId = id || null;
  const titleEl = $('memo-form-title'); if (titleEl) titleEl.textContent = id ? '메모 수정' : '새 메모';
  goto('memo-form');
  if (id) {
    const m = memos.find(x => x.id === id); if (!m) return;
    setTimeout(() => {
      const f = (el, val) => { const e = $(el); if (e) e.value = val || ''; };
      f('mf-cat',     m.cat || '일반');
      f('mf-date',    m.date || today());
      f('mf-title',   m.title || '');
      f('mf-tags',    (m.tags || []).join(', '));
      f('mf-content', m.content || '');
    }, 60);
  }
}

function initMemoForm() {
  if (!S.editMemoId) {
    const f = (id, val) => { const e = $(id); if (e) e.value = val; };
    f('mf-cat', '일반'); f('mf-date', today());
    ['mf-title','mf-tags','mf-content'].forEach(id => { const e=$(id); if(e) e.value=''; });
  }
  const saveBtn = $('btn-save-memo'); if (saveBtn) saveBtn.onclick = saveMemo;
}

async function saveMemo() {
  const titleEl   = $('mf-title');
  const contentEl = $('mf-content');
  const title     = titleEl   ? titleEl.value.trim()   : '';
  const content   = contentEl ? contentEl.value.trim() : '';
  if (!title) { toast('⚠️ 제목을 입력하세요'); if (titleEl) titleEl.focus(); return; }

  const data = {
    title, content,
    cat:       $('mf-cat')  ? $('mf-cat').value  : '일반',
    date:      $('mf-date') ? $('mf-date').value : today(),
    tags:      $('mf-tags') ? $('mf-tags').value.split(',').map(t => t.trim()).filter(Boolean) : [],
    updatedAt: new Date().toISOString(),
  };

  try {
    if (S.fbReady && !S.isGuest && db) {
      if (S.editMemoId) {
        await db.collection('memos').doc(S.editMemoId).update(data);
      } else {
        data.createdAt = new Date().toISOString();
        await db.collection('memos').add(data);
      }
    } else {
      data.id = S.editMemoId || ('local_' + Date.now());
      if (S.editMemoId) {
        const idx = memos.findIndex(x => x.id === S.editMemoId);
        if (idx !== -1) memos[idx] = data; else memos.push(data);
      } else { memos.unshift(data); }
    }
    S.editMemoId = null;
    toast('✅ 저장됐습니다');
    goto('memo');
  } catch (e) {
    console.error('[saveMemo 오류]', e);
    toast('⚠️ 저장 실패: ' + e.message, 4000);
  }
}

async function deleteMemo(id) {
  if (!confirm('이 메모를 삭제하시겠습니까?')) return;
  try {
    if (S.fbReady && !S.isGuest && db) {
      await db.collection('memos').doc(id).delete();
    } else {
      memos = memos.filter(m => m.id !== id);
      renderMemo();
    }
    toast('🗑 삭제됐습니다');
    if (S.currentPage === 'memo-detail') goto('memo');
  } catch (e) {
    toast('⚠️ 삭제 실패: ' + e.message, 4000);
  }
}

/* =====================================================
   ⑫ 연간 로드맵 (ROADMAP)
===================================================== */
function renderRoadmap() {
  /* 연간 미니맵 */
  const yearGrid = $('rm-year-grid');
  if (yearGrid) yearGrid.innerHTML = Array.from({length:12}, (_, i) => i + 1).map(m => {
    const sList = schedules.filter(s => s.month === m);
    const types = [...new Set(sList.map(s => s.type))];
    const active = m === S.activeMonth;
    return `
    <div class="rm-month-chip${active ? ' rm-month-active' : sList.length ? ' rm-month-has' : ''}"
         onclick="setRmMonth(${m})">
      <span class="rm-chip-label">${MONTH_NAMES[m]}</span>
      ${sList.length ? `<span class="rm-chip-count">${sList.length}</span>` : ''}
      <div class="rm-chip-dots">
        ${types.includes('법정') ? '<span class="rm-dot" style="background:var(--red)"></span>'   : ''}
        ${types.includes('정기') ? '<span class="rm-dot" style="background:var(--blue)"></span>'  : ''}
        ${types.includes('계절') ? '<span class="rm-dot" style="background:var(--green)"></span>' : ''}
      </div>
    </div>`;
  }).join('');

  /* 월 탭 */
  const tabsEl = $('rm-month-tabs');
  if (tabsEl) tabsEl.innerHTML = Array.from({length:12}, (_, i) => i + 1).map(m => {
    const has    = schedules.some(s => s.month === m);
    const active = m === S.activeMonth;
    return `<button class="rm-tab${active ? ' rm-tab-active' : has ? ' rm-tab-has' : ''}"
                    onclick="setRmMonth(${m})">${MONTH_NAMES[m]}</button>`;
  }).join('');

  /* 선택 월 일정 목록 */
  const list    = schedules.filter(s => s.month === S.activeMonth);
  const countEl = $('rm-list-count');
  if (countEl) countEl.textContent = MONTH_NAMES[S.activeMonth] + ' 일정 ' + list.length + '건';
  const listEl  = $('rm-list'); if (!listEl) return;

  listEl.innerHTML = list.length ? list.map(s => {
    const ts = SCH_TYPE_STYLE[s.type] || { bg:'rgba(255,255,255,.07)', border:'rgba(255,255,255,.12)', color:'var(--t3)' };
    return `
    <div class="gc rm-sch-card">
      <div class="rm-sch-type" style="background:${ts.bg};border:1px solid ${ts.border};color:${ts.color}">${esc(s.type)}</div>
      <div class="rm-sch-body">
        <div class="rm-sch-title">${esc(s.title)}</div>
        ${s.desc ? `<div class="rm-sch-desc">${esc(s.desc)}</div>` : ''}
      </div>
      <div class="rm-sch-acts" onclick="event.stopPropagation()">
        <button class="lc-btn lc-btn-edit" onclick="openSchForm('${s.id}')">✏️</button>
        <button class="lc-btn lc-btn-del"  onclick="deleteSchedule('${s.id}')">🗑</button>
      </div>
    </div>`;
  }).join('') :
  `<div class="gc" style="padding:48px;text-align:center;color:var(--t4)">
    <div style="font-size:36px;opacity:.3;margin-bottom:12px">📭</div>
    <div style="font-size:15px">이번 달 등록된 일정이 없습니다</div>
    <button class="btn-o" style="margin:16px auto 0;display:flex" onclick="openSchForm()">＋ 일정 추가</button>
  </div>`;
}

function setRmMonth(m) { S.activeMonth = m; renderRoadmap(); }

function openSchForm(id) {
  S.editSchId = id || null;
  const titleEl = $('rm-form-title');
  if (titleEl) titleEl.textContent = id ? '일정 수정' : '일정 추가';
  goto('roadmap-form');
  if (id) {
    const s = schedules.find(x => String(x.id) === String(id)); if (!s) return;
    setTimeout(() => {
      const f = (el, val) => { const e = $(el); if (e) e.value = val; };
      f('sf-month', s.month); f('sf-type', s.type);
      f('sf-title', s.title || ''); f('sf-desc', s.desc || '');
    }, 60);
  }
}

function initSchForm() {
  const monthEl = $('sf-month');
  if (monthEl) monthEl.innerHTML = Array.from({length:12}, (_, i) => i + 1)
    .map(m => `<option value="${m}"${m === S.activeMonth ? ' selected' : ''}>${MONTH_NAMES[m]}</option>`)
    .join('');
  if (!S.editSchId) {
    const f = (id, val) => { const e=$(id); if(e) e.value=val; };
    f('sf-type','법정'); f('sf-title',''); f('sf-desc','');
  }
  const saveBtn = $('btn-save-schedule'); if (saveBtn) saveBtn.onclick = saveSchedule;
}

async function saveSchedule() {
  const titleEl = $('sf-title');
  const title   = titleEl ? titleEl.value.trim() : '';
  if (!title) { toast('⚠️ 제목을 입력하세요'); if(titleEl) titleEl.focus(); return; }

  const data = {
    month:     parseInt($('sf-month') ? $('sf-month').value : S.activeMonth),
    type:      $('sf-type')  ? $('sf-type').value        : '정기',
    title,
    desc:      $('sf-desc')  ? $('sf-desc').value.trim() : '',
    updatedAt: new Date().toISOString(),
  };

  try {
    if (S.fbReady && !S.isGuest && db) {
      if (S.editSchId) {
        await db.collection('schedules').doc(S.editSchId).update(data);
      } else {
        data.createdAt = new Date().toISOString();
        await db.collection('schedules').add(data);
      }
    } else {
      data.id = S.editSchId || uid();
      if (S.editSchId) {
        const idx = schedules.findIndex(x => String(x.id) === String(S.editSchId));
        if (idx !== -1) schedules[idx] = data; else schedules.push(data);
      } else { schedules.push(data); }
      renderRoadmap();
    }
    S.editSchId = null;
    toast('✅ 저장됐습니다');
    goto('roadmap');
  } catch (e) {
    toast('⚠️ 저장 실패: ' + e.message, 4000);
  }
}

async function deleteSchedule(id) {
  if (!confirm('이 일정을 삭제하시겠습니까?')) return;
  try {
    if (S.fbReady && !S.isGuest && db) {
      await db.collection('schedules').doc(String(id)).delete();
    } else {
      schedules = schedules.filter(s => String(s.id) !== String(id));
      renderRoadmap();
    }
    toast('🗑 삭제됐습니다');
  } catch (e) {
    toast('⚠️ 삭제 실패: ' + e.message, 4000);
  }
}

/* =====================================================
   ⑬ 연락처 (CONTACTS)
===================================================== */
const CONTACT_COLORS = ['#e05c0a','#1d4ed8','#10b981','#7c3aed','#f59e0b','#0d9488'];

function renderContacts() {
  const listEl = $('contacts-list'); if (!listEl) return;
  listEl.innerHTML = contacts.length ? contacts.map((c, i) => `
    <div class="gc contact-card">
      <div class="contact-avatar" style="background:${CONTACT_COLORS[i % CONTACT_COLORS.length]}22;color:${CONTACT_COLORS[i % CONTACT_COLORS.length]}">
        ${(c.name || '?')[0].toUpperCase()}
      </div>
      <div class="contact-info">
        <div class="contact-name">${esc(c.name)}</div>
        <div class="contact-role">${esc(c.role || '')}${c.company ? ' · ' + esc(c.company) : ''}</div>
        ${c.phone ? `<div class="contact-phone">${esc(c.phone)}</div>` : ''}
      </div>
      <div style="display:flex;gap:6px">
        ${c.phone ? `<a href="tel:${c.phone}" class="lc-btn lc-btn-edit" style="text-decoration:none;display:flex;align-items:center">📞</a>` : ''}
        ${c.email ? `<a href="mailto:${esc(c.email)}" class="lc-btn lc-btn-edit" style="text-decoration:none;display:flex;align-items:center">✉️</a>` : ''}
      </div>
    </div>`) .join('') :
  `<div class="gc" style="padding:48px;text-align:center;color:var(--t4)">
    <div style="font-size:36px;opacity:.3;margin-bottom:12px">📇</div>
    <div style="font-size:15px">연락처가 없습니다</div>
  </div>`;
}

/* =====================================================
   ⑭ 통계 (STATS)
===================================================== */
function renderStats() {
  const f = (id, val) => { const e=$(id); if(e) e.textContent = val; };
  f('stats-total', logs.length);
  f('stats-done',  logs.filter(l => l.status === '완료').length);
  f('stats-prog',  logs.filter(l => l.status === '진행중').length);
  f('stats-memo',  memos.length);
}

/* =====================================================
   ⑮ 매뉴얼 카테고리 & 상세
===================================================== */
function renderManualCat(catKey) {
  const catManuals = MANUALS[catKey] || [];
  const countEl = $(catKey + '-count');
  if (countEl) countEl.textContent = '매뉴얼 ' + catManuals.length + '건';
  const listEl = $('manual-list-' + catKey);
  if (!listEl) return;
  listEl.innerHTML = catManuals.length ? catManuals.map(m => `
    <div class="gc manual-card" onclick="openManualDetail('${catKey}','${m.id}')">
      <div class="mc-num-badge">${(m.steps || []).length}<span>단계</span></div>
      <div class="mc-body">
        <div class="mc-title">${esc(m.title)}</div>
        <div class="mc-meta">
          <span>준비물 ${(m.supplies || []).length}개</span>
          <span>체크리스트 ${(m.checklist || []).length}항목</span>
        </div>
        <div class="mc-tags">${(m.tags || []).map(t => `<span class="m-tag">${esc(t)}</span>`).join('')}</div>
      </div>
      <div class="mc-arrow">›</div>
    </div>`).join('') :
  `<div class="gc" style="padding:40px;text-align:center;color:var(--t4)">
    <div style="font-size:32px;opacity:.3;margin-bottom:10px">📋</div>
    <div style="font-size:14px">등록된 매뉴얼이 없습니다</div>
  </div>`;
}

function openManualDetail(catKey, id) {
  S.currentManualCat = catKey;
  S.currentManualId  = id;
  goto('manual-detail');
}

function renderManualDetail() {
  const catKey = S.currentManualCat;
  const id     = S.currentManualId;
  if (!catKey || !id) return;
  const m = (MANUALS[catKey] || []).find(x => x.id === id);
  if (!m) return;
  const ckKey = catKey + '_' + id;
  if (!S.checklistState[ckKey]) S.checklistState[ckKey] = [];

  /* 브레드크럼 */
  const bCat   = $('md-bread-cat');   if (bCat)   { bCat.textContent = CAT_KEY_MAP[catKey] || catKey; bCat.dataset.goto = catKey; }
  const bTitle = $('md-bread-title'); if (bTitle) bTitle.textContent = m.title;

  /* 헤더 */
  const catBadge = $('md-cat-badge'); if (catBadge) catBadge.textContent = (CAT_ICON[CAT_KEY_MAP[catKey]] || '') + ' ' + (CAT_KEY_MAP[catKey] || catKey);
  const mTitle   = $('md-title');     if (mTitle)   mTitle.textContent   = m.title;
  const sSt = $('md-stat-steps');     if (sSt)   sSt.textContent   = '단계 '       + (m.steps     || []).length;
  const sSu = $('md-stat-supplies');  if (sSu)   sSu.textContent   = '준비물 '     + (m.supplies  || []).length;
  const sCk = $('md-stat-checklist'); if (sCk)   sCk.textContent   = '체크리스트 ' + (m.checklist || []).length + '항목';
  const tagsEl = $('md-tags'); if (tagsEl) tagsEl.innerHTML = (m.tags || []).map(t => `<span class="m-tag">${esc(t)}</span>`).join('');

  /* 개요 */
  const ovWrap = $('md-overview-wrap');
  if (ovWrap) { ovWrap.style.display = m.overview ? '' : 'none'; const p=$('md-overview-text'); if(p) p.textContent = m.overview || ''; }

  /* ① 준비물 */
  const supWrap = $('md-supplies-wrap');
  if (supWrap) {
    if ((m.supplies || []).length) {
      supWrap.style.display = '';
      const cntEl = $('md-supplies-count'); if(cntEl) cntEl.textContent = m.supplies.length + '개';
      const supList = $('md-supplies-list');
      if (supList) supList.innerHTML = m.supplies.map((s, i) => `
        <div class="supply-item">
          <div class="supply-num">${i + 1}</div>
          <div class="supply-name">${esc(s)}</div>
        </div>`).join('');
    } else { supWrap.style.display = 'none'; }
  }

  /* ② 안전주의사항 */
  const cauWrap = $('md-cautions-wrap');
  if (cauWrap) {
    if ((m.cautions || []).length) {
      cauWrap.style.display = '';
      const cauList = $('md-cautions-list');
      if (cauList) cauList.innerHTML = m.cautions.map((c, i) => `
        <div class="caution-row">
          <div class="caution-num">${i + 1}</div>
          <div class="caution-txt">${esc(c)}</div>
        </div>`).join('');
    } else { cauWrap.style.display = 'none'; }
  }

  /* ③ 작업 절차 타임라인 */
  const stepsEl = $('md-steps-list');
  if (stepsEl) stepsEl.innerHTML = (m.steps || []).map((s, i) => `
    <div class="step-row">
      <div class="step-left">
        <div class="step-num-circle">${i + 1}</div>
        ${i < (m.steps.length - 1) ? '<div class="step-connector"></div>' : ''}
      </div>
      <div class="glass step-card">
        <div class="step-card-head">
          <div class="step-title">${esc(s.title)}</div>
          <div class="step-desc">${esc(s.desc)}</div>
          ${s.youtube ? `<a href="${esc(s.youtube)}" target="_blank" class="step-yt-link">▶ YouTube 영상 보기</a>` : ''}
        </div>
        <div class="step-photo-zone">
          <div class="step-photo-ph">📷 <span>사진 추가 (Firebase 연동 후 활성화)</span></div>
        </div>
      </div>
    </div>`).join('');

  /* ④ 체크리스트 */
  const ckWrap  = $('md-checklist-wrap');
  const ckTotal = (m.checklist || []).length;
  if (ckWrap) {
    if (ckTotal) {
      ckWrap.style.display = '';
      updateCkUI(ckKey, m.checklist);
      const resetBtn = $('md-ck-reset');
      if (resetBtn) resetBtn.onclick = () => { S.checklistState[ckKey] = []; updateCkUI(ckKey, m.checklist); renderCkRows(ckKey, m.checklist); };
      renderCkRows(ckKey, m.checklist);
    } else { ckWrap.style.display = 'none'; }
  }

  /* ⑤ 주의·팁 */
  const cBox = $('md-caution-box');
  if (cBox) { cBox.style.display = m.caution ? '' : 'none'; const t=$('md-caution-text'); if(t) t.innerHTML = '<strong>주의:</strong> ' + esc(m.caution || ''); }
  const tBox = $('md-tip-box');
  if (tBox) { tBox.style.display = m.tip ? '' : 'none'; const t=$('md-tip-text'); if(t) t.innerHTML = '<strong>Tip:</strong> ' + esc(m.tip || ''); }
}

function renderCkRows(ckKey, checklist) {
  const el = $('md-ck-list'); if (!el) return;
  el.innerHTML = checklist.map((c, i) => {
    const done = S.checklistState[ckKey].includes(i);
    return `
    <div class="ck-row${done ? ' ck-done' : ''}" id="ck-row-${ckKey}-${i}" onclick="toggleCk('${ckKey}',${i})">
      <span class="ck-num">${i + 1}</span>
      <span class="ck-txt">${esc(c)}</span>
      <span class="ck-chk">${done
        ? '<svg width="18" height="18" viewBox="0 0 24 24" stroke="var(--green)" fill="none" stroke-width="3"><path d="M20 6L9 17l-5-5"/></svg>'
        : '<div class="ck-circle"></div>'
      }</span>
    </div>`;
  }).join('');
}

function toggleCk(ckKey, idx) {
  if (!S.checklistState[ckKey]) S.checklistState[ckKey] = [];
  const arr = S.checklistState[ckKey];
  const pos = arr.indexOf(idx);
  if (pos === -1) arr.push(idx); else arr.splice(pos, 1);
  const done = arr.includes(idx);
  const row  = $('ck-row-' + ckKey + '-' + idx);
  if (row) {
    row.classList.toggle('ck-done', done);
    row.querySelector('.ck-chk').innerHTML = done
      ? '<svg width="18" height="18" viewBox="0 0 24 24" stroke="var(--green)" fill="none" stroke-width="3"><path d="M20 6L9 17l-5-5"/></svg>'
      : '<div class="ck-circle"></div>';
  }
  const parts  = ckKey.split('_');
  const m = (MANUALS[parts[0]] || []).find(x => x.id === parts[1]);
  if (m) updateCkUI(ckKey, m.checklist);
}

function updateCkUI(ckKey, checklist) {
  const total = checklist.length;
  const done  = (S.checklistState[ckKey] || []).length;
  const pct   = total ? Math.round(done / total * 100) : 0;
  const c = $('md-ck-counter'); if (c) c.textContent = done + '/' + total;
  const b = $('md-ck-bar');     if (b) b.style.width  = pct + '%';
}

/* =====================================================
   ⑯ Before/After 비교 슬라이더
===================================================== */
function initSlider() {
  const track  = $('ctk');
  const after  = $('cta');
  const line   = $('cln');
  const handle = $('chn');
  if (!track || !after) return;
  let drag = false;
  function setPos(x) {
    const r   = track.getBoundingClientRect();
    const pct = Math.max(0, Math.min(100, ((x - r.left) / r.width) * 100));
    after.style.clipPath       = `inset(0 ${(100 - pct).toFixed(1)}% 0 0)`;
    if (line)   line.style.left   = pct + '%';
    if (handle) handle.style.left = pct + '%';
  }
  track.addEventListener('mousedown',  e => { drag = true;  setPos(e.clientX); });
  window.addEventListener('mousemove', e => { if (drag) setPos(e.clientX); });
  window.addEventListener('mouseup',   ()=> { drag = false; });
  track.addEventListener('touchstart', e => { drag = true;  setPos(e.touches[0].clientX); }, { passive: true });
  window.addEventListener('touchmove', e => { if (drag) setPos(e.touches[0].clientX); },     { passive: true });
  window.addEventListener('touchend',  ()=> { drag = false; });
}

/* =====================================================
   ⑰ 사진 라이트박스 미리보기
===================================================== */
function previewPhoto(url) {
  let ov = $('kf-lightbox');
  if (!ov) {
    ov = document.createElement('div');
    ov.id = 'kf-lightbox';
    ov.style.cssText = [
      'position:fixed', 'inset:0', 'background:rgba(0,0,0,.92)',
      'z-index:99998', 'display:flex', 'align-items:center', 'justify-content:center',
      'cursor:zoom-out', 'padding:20px',
    ].join(';');
    ov.onclick = () => { ov.style.display = 'none'; };
    document.body.appendChild(ov);
  }
  ov.innerHTML = `<img src="${url}"
    style="max-width:100%;max-height:90vh;border-radius:12px;object-fit:contain;
           box-shadow:0 8px 40px rgba(0,0,0,.6)">`;
  ov.style.display = 'flex';
}

/* =====================================================
   ⑱ 모바일 키보드 대응
   visualViewport resize → #pages 높이 동적 조정
===================================================== */
function initMobileInputFix() {
  if (typeof window.visualViewport === 'undefined') return;
  const pages = document.getElementById('pages');
  if (!pages) return;
  window.visualViewport.addEventListener('resize', () => {
    const vh   = window.visualViewport.height;
    const hdrH = document.getElementById('hdr')?.offsetHeight || 58;
    pages.style.maxHeight = (vh - hdrH) + 'px';
  });
  /* resize 이벤트 종료 후 원래대로 복원 */
  window.visualViewport.addEventListener('scroll', () => {
    pages.style.maxHeight = '';
  });
}

/* =====================================================
   ⑲ 테마 토글
===================================================== */
function initTheme() {
  const tsw = $('tsw');
  if (!tsw) return;
  tsw.addEventListener('click', () => {
    const knob   = $('tsk');
    const isRight = knob && knob.style.left === '22px';
    if (knob) knob.style.left = isRight ? '3px' : '22px';
  });
}

/* =====================================================
   ⑳ BOOT — DOMContentLoaded
===================================================== */
document.addEventListener('DOMContentLoaded', () => {
  /* 로그인 버튼 */
  const bg = $('btn-google'); if (bg) bg.addEventListener('click', loginGoogle);
  const gg = $('btn-guest');  if (gg) gg.addEventListener('click', loginGuest);

  /* 사이드바 nav 버튼 */
  document.querySelectorAll('.nb[data-p]').forEach(btn => {
    btn.addEventListener('click', () => goto(btn.dataset.p));
  });

  /* data-goto 전역 클릭 위임 */
  document.addEventListener('click', e => {
    const el = e.target.closest('[data-goto]');
    if (el) goto(el.dataset.goto);
  });

  /* 헤더 검색창 포커스 → 검색 페이지 */
  const si = $('si');
  if (si) si.addEventListener('focus', () => goto('search'));

  initTheme();
  initMobileInputFix();
  initFirebase();
});

/* ── 전역 노출 (HTML onclick 속성용) ── */
window.goto               = goto;
window.loginGoogle        = loginGoogle;
window.loginGuest         = loginGuest;
window.logout             = logout;
window.openLogDetail      = openLogDetail;
window.openLogForm        = openLogForm;
window.deleteLog          = deleteLog;
window.removeLogPhoto     = removeLogPhoto;
window.handleLogPhotoSelect = handleLogPhotoSelect;
window.openMemoDetail     = openMemoDetail;
window.openMemoForm       = openMemoForm;
window.deleteMemo         = deleteMemo;
window.openSchForm        = openSchForm;
window.deleteSchedule     = deleteSchedule;
window.openManualDetail   = openManualDetail;
window.toggleCk           = toggleCk;
window.setLogCatFilter    = setLogCatFilter;
window.setLogStatusFilter = setLogStatusFilter;
window.setMemoFilter      = setMemoFilter;
window.setRmMonth         = setRmMonth;
window.previewPhoto       = previewPhoto;
