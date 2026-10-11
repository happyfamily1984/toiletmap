'use strict';

const path = require('path');
const crypto = require('crypto');
const { createApp } = require('./app');

const env = process.env;

// 기본 접속 코드는 6511 (ACCESS_CODE 환경변수로 변경 가능)
const DEFAULT_ACCESS_CODE = '6511';
const accessCode = env.ACCESS_CODE || DEFAULT_ACCESS_CODE;
if (!/^\d{4}$/.test(accessCode)) {
  console.error('ACCESS_CODE 는 4자리 숫자여야 합니다. (예: ACCESS_CODE=6511)');
  process.exit(1);
}

if (!env.NAVER_MAP_CLIENT_ID) {
  console.warn('경고: NAVER_MAP_CLIENT_ID 가 비어 있어 지도가 표시되지 않습니다.');
}

let sessionSecret = env.SESSION_SECRET;
if (!sessionSecret) {
  sessionSecret = crypto.randomBytes(32).toString('hex');
  console.warn('경고: SESSION_SECRET 이 없어 임시 값을 사용합니다. 서버를 재시작하면 모두 다시 로그인해야 합니다.');
}

const app = createApp({
  accessCode,
  sessionSecret,
  naverClientId: env.NAVER_MAP_CLIENT_ID || '',
  dataFile: env.DATA_FILE || path.join(__dirname, '..', 'data', 'toilets.json'),
  secureCookie: env.COOKIE_SECURE ? env.COOKIE_SECURE === 'true' : env.NODE_ENV === 'production',
  trustProxy: env.TRUST_PROXY !== 'false',
});

const port = Number(env.PORT) || 3000;
app.listen(port, () => {
  console.log(`살뜰 화장실맵 서버 실행 중: http://localhost:${port}`);
});
