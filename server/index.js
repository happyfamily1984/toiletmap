'use strict';

const path = require('path');
const crypto = require('crypto');
const { createApp } = require('./app');
const { createStore } = require('./store');

const env = process.env;

// 화장실 등록·수정용 편집 코드. 기본 6511 (ACCESS_CODE 환경변수로 변경 가능)
// 저장소가 공개라면 Render 환경변수 ACCESS_CODE 로 다른 번호를 쓰는 것을 권장
const DEFAULT_ACCESS_CODE = '6511';
const accessCode = env.ACCESS_CODE || DEFAULT_ACCESS_CODE;
if (!/^\d{4}$/.test(accessCode)) {
  console.error('ACCESS_CODE 는 4자리 숫자여야 합니다. (예: ACCESS_CODE=6511)');
  process.exit(1);
}

if (!env.ADMIN_PASSWORD) {
  console.warn('알림: ADMIN_PASSWORD 가 없어 관리자(가입신청 확인) 기능이 꺼져 있습니다.');
}

if (!env.NAVER_MAP_CLIENT_ID) {
  console.warn('경고: NAVER_MAP_CLIENT_ID 가 비어 있어 지도가 표시되지 않습니다.');
}

let sessionSecret = env.SESSION_SECRET;
if (!sessionSecret) {
  sessionSecret = crypto.randomBytes(32).toString('hex');
  console.warn('경고: SESSION_SECRET 이 없어 임시 값을 사용합니다. 서버를 재시작하면 모두 다시 로그인해야 합니다.');
}

const store = createStore({
  databaseUrl: env.DATABASE_URL,
  dataFile: env.DATA_FILE || path.join(__dirname, '..', 'data', 'toilets.json'),
});

const config = {
  accessCode,
  // 관리자 비밀번호(가입신청 확인용). 공개 저장소이므로 코드에 넣지 않고 환경변수로만 설정
  adminPassword: env.ADMIN_PASSWORD || '',
  sessionSecret,
  naverClientId: env.NAVER_MAP_CLIENT_ID || '',
  // 카카오 애드핏 광고 단위 ID (예: DAN-xxxxxxxx). 비워두면 광고 없음
  adfitUnit: /^DAN-[A-Za-z0-9]+$/.test(env.ADFIT_AD_UNIT || '') ? env.ADFIT_AD_UNIT : '',
  secureCookie: env.COOKIE_SECURE ? env.COOKIE_SECURE === 'true' : env.NODE_ENV === 'production',
  trustProxy: env.TRUST_PROXY !== 'false',
};

store
  .init()
  .then(() => {
    const port = Number(env.PORT) || 3000;
    createApp(config, store).listen(port, () => {
      console.log(`안양 과천 화장실맵 서버 실행 중: http://localhost:${port}`);
      console.log(env.DATABASE_URL ? '저장소: PostgreSQL (DATABASE_URL)' : '저장소: JSON 파일');
    });
  })
  .catch((err) => {
    console.error('저장소 연결 실패:', err.message);
    process.exit(1);
  });
