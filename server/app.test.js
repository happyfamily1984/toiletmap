'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createApp } = require('./app');
const { createStore } = require('./store');

// TEST_DATABASE_URL 이 있으면 PostgreSQL 저장소로도 같은 테스트를 돌린다
const BACKENDS = ['file'];
if (process.env.TEST_DATABASE_URL) BACKENDS.push('postgres');

async function startServer(backend, extra = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'toiletmap-'));
  const store = createStore({
    databaseUrl: backend === 'postgres' ? process.env.TEST_DATABASE_URL : '',
    dataFile: path.join(dir, 'toilets.json'),
  });
  await store.init();
  if (backend === 'postgres') {
    await store.pool.query('DELETE FROM toilets');
    await store.pool.query('DELETE FROM applications');
  }
  const app = createApp({
    accessCode: '4821',
    sessionSecret: 'test-secret',
    naverClientId: 'test-client',
    secureCookie: false,
    trustProxy: false,
    adminPassword: '794613',
    ...extra,
  }, store);
  const listener = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  const server = {
    address: () => listener.address(),
    close: () => {
      listener.close();
      if (store.close) store.close();
    },
  };
  const base = `http://127.0.0.1:${server.address().port}`;
  let cookie = '';
  const call = async (method, url, body) => {
    const res = await fetch(base + url, {
      method,
      headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const setCookie = res.headers.get('set-cookie');
    if (setCookie) cookie = setCookie.split(';')[0];
    return { status: res.status, body: await res.json().catch(() => null) };
  };
  return { server, call };
}

const sample = {
  name: '과천시청 화장실',
  address: '경기도 과천시 관문로 69',
  lat: 37.4292,
  lng: 126.9876,
  description: '1층 로비 왼쪽',
  password: '1234*',
};

for (const backend of BACKENDS) {
  test(`[${backend}] 코드 없이도 보기 가능, 등록은 편집 코드 필요`, async () => {
    const { server, call } = await startServer(backend);
    try {
      const res = await call('GET', '/api/toilets');
      assert.strictEqual(res.status, 200);
      assert.deepStrictEqual((await call('GET', '/api/session')).body, { authed: false, canEdit: false });
      assert.strictEqual((await call('GET', '/api/promo/gwacheon-b.jpg')).status, 200);
      assert.strictEqual((await call('POST', '/api/toilets', sample)).status, 401);
      // AdMob 광고 판매자 확인 파일
      const adsTxt = await fetch(`http://127.0.0.1:${server.address().port}/app-ads.txt`).then((r) => r.text());
      assert.match(adsTxt, /google\.com, pub-\d+, DIRECT/);
      const cfg = await call('GET', '/api/config');
      assert.strictEqual(cfg.body.naverClientId, 'test-client');
    } finally {
      server.close();
    }
  });

  test(`[${backend}] 잘못된 코드 5회면 잠금`, async () => {
    const { server, call } = await startServer(backend);
    try {
      for (let i = 0; i < 5; i++) {
        assert.strictEqual((await call('POST', '/api/login', { code: '1111' })).status, 401);
      }
      assert.strictEqual((await call('POST', '/api/login', { code: '4821' })).status, 429);
    } finally {
      server.close();
    }
  });

  test(`[${backend}] 로그인 후 등록/수정/삭제`, async () => {
    const { server, call } = await startServer(backend);
    try {
      assert.strictEqual((await call('POST', '/api/login', { code: '4821' })).status, 200);
      assert.strictEqual((await call('GET', '/api/session')).body.authed, true);
      assert.strictEqual((await call('GET', '/api/promo/gwacheon-b.jpg')).status, 200);
      assert.strictEqual((await call('GET', '/api/promo/dongan-a.jpg')).status, 200);
      assert.strictEqual((await call('GET', '/api/promo/..%2Fapp.js')).status, 404);
      assert.strictEqual((await call('GET', '/api/promo/none.jpg')).status, 404);

      const created = await call('POST', '/api/toilets', sample);
      assert.strictEqual(created.status, 201);
      const id = created.body.toilet.id;
      assert.strictEqual(created.body.toilet.password, '1234*');

      const updated = await call('PUT', `/api/toilets/${id}`, { password: '5678#' });
      assert.strictEqual(updated.body.toilet.password, '5678#');
      assert.strictEqual(updated.body.toilet.name, sample.name);

      const list = await call('GET', '/api/toilets');
      assert.strictEqual(list.body.toilets.length, 1);
      assert.strictEqual(list.body.toilets[0].password, '5678#');
      assert.strictEqual((await call('PUT', '/api/toilets/not-a-real-id', { name: 'x' })).status, 404);

      assert.strictEqual((await call('DELETE', `/api/toilets/${id}`)).status, 200);
      assert.strictEqual((await call('GET', '/api/toilets')).body.toilets.length, 0);
    } finally {
      server.close();
    }
  });

  test(`[${backend}] 과천·안양·의왕 밖 위치는 거부, 이름이 비면 '화장실'`, async () => {
    const { server, call } = await startServer(backend);
    try {
      await call('POST', '/api/login', { code: '4821' });
      // 서울시청
      const seoul = await call('POST', '/api/toilets', { ...sample, lat: 37.5665, lng: 126.978 });
      assert.strictEqual(seoul.status, 400);
      // 의왕시청
      const uiwang = await call('POST', '/api/toilets', { ...sample, lat: 37.3447, lng: 126.9683 });
      assert.strictEqual(uiwang.status, 201);
      const noName = await call('POST', '/api/toilets', { ...sample, name: '  ' });
      assert.strictEqual(noName.status, 201);
      assert.strictEqual(noName.body.toilet.name, '화장실');
      const cleared = await call('PUT', `/api/toilets/${noName.body.toilet.id}`, { name: '' });
      assert.strictEqual(cleared.body.toilet.name, '화장실');
    } finally {
      server.close();
    }
  });

  test(`[${backend}] 편집 코드 없으면 수정·삭제 불가 (예전 보기 코드 0000 도 불가)`, async () => {
    const { server, call } = await startServer(backend);
    try {
      const login = await call('POST', '/api/login', { code: '4821' });
      assert.strictEqual(login.body.canEdit, true);
      assert.strictEqual((await call('GET', '/api/session')).body.canEdit, true);
      const id = (await call('POST', '/api/toilets', sample)).body.toilet.id;
      await call('POST', '/api/logout');
      assert.strictEqual((await call('POST', '/api/login', { code: '0000' })).status, 401);
      assert.deepStrictEqual((await call('GET', '/api/session')).body, { authed: false, canEdit: false });
      assert.strictEqual((await call('GET', '/api/toilets')).body.toilets.length, 1);
      assert.strictEqual((await call('POST', '/api/toilets', sample)).status, 401);
      assert.strictEqual((await call('PUT', `/api/toilets/${id}`, { rating: 5 })).status, 401);
      assert.strictEqual((await call('DELETE', `/api/toilets/${id}`)).status, 401);
      assert.strictEqual((await call('GET', '/api/toilets')).body.toilets[0].rating, 3);
    } finally {
      server.close();
    }
  });

  test(`[${backend}] 여러 IP 로 나눠 시도해도 전체 실패 30회면 잠금`, async () => {
    const { server } = await startServer(backend, { trustProxy: true });
    try {
      const base = `http://127.0.0.1:${server.address().port}`;
      const login = (code, ip) => fetch(base + '/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': ip },
        body: JSON.stringify({ code }),
      }).then((r) => r.status);
      for (let i = 0; i < 30; i++) assert.strictEqual(await login('1111', `10.0.${i}.1`), 401);
      assert.strictEqual(await login('4821', '10.9.9.9'), 429);
    } finally {
      server.close();
    }
  });

  test(`[${backend}] 가입신청 제출과 관리자 확인`, async () => {
    const { server, call } = await startServer(backend);
    try {
      const form = { name: '홍길동', phone: '010-1234-5678', zone: '동안A', weeklyCount: '250', message: '주말 위주' };
      // 로그인 없이 누구나 제출 가능
      assert.strictEqual((await call('POST', '/api/applications', { ...form, name: '' })).status, 400);
      assert.strictEqual((await call('POST', '/api/applications', { ...form, phone: '12' })).status, 400);
      assert.strictEqual((await call('POST', '/api/applications', { ...form, zone: '서울' })).status, 400);
      assert.strictEqual((await call('POST', '/api/applications', { ...form, weeklyCount: 'abc' })).status, 400);
      assert.strictEqual((await call('POST', '/api/applications', form)).status, 201);
      // 주 평균 수행 건수는 비워도 됨
      assert.strictEqual((await call('POST', '/api/applications', { ...form, name: '김철수', zone: '과천B', weeklyCount: '' })).status, 201);

      // 관리자 로그인 전에는 목록 불가
      assert.deepStrictEqual((await call('GET', '/api/admin/session')).body, { enabled: true, admin: false });
      assert.strictEqual((await call('GET', '/api/admin/applications')).status, 401);
      assert.strictEqual((await call('POST', '/api/admin/login', { password: '000000' })).status, 401);
      assert.strictEqual((await call('POST', '/api/admin/login', { password: '794613' })).status, 200);
      const list = (await call('GET', '/api/admin/applications')).body.applications;
      assert.deepStrictEqual(list.map((a) => a.name), ['김철수', '홍길동']); // 최신순
      assert.strictEqual(list[0].weeklyCount, null);
      assert.strictEqual(list[1].phone, '01012345678');
      assert.strictEqual(list[1].weeklyCount, 250);
      assert.strictEqual(list[1].zone, '동안A');
      assert.strictEqual((await call('DELETE', `/api/admin/applications/${list[0].id}`)).status, 200);
      assert.strictEqual((await call('GET', '/api/admin/applications')).body.applications.length, 1);
      await call('POST', '/api/admin/logout');
      assert.strictEqual((await call('GET', '/api/admin/applications')).status, 401);
    } finally {
      server.close();
    }
  });

  test(`[${backend}] ADMIN_PASSWORD 없으면 관리자 기능 꺼짐`, async () => {
    const { server, call } = await startServer(backend, { adminPassword: '' });
    try {
      assert.deepStrictEqual((await call('GET', '/api/admin/session')).body, { enabled: false, admin: false });
      assert.strictEqual((await call('POST', '/api/admin/login', { password: '' })).status, 503);
      assert.strictEqual((await call('GET', '/api/admin/applications')).status, 401);
    } finally {
      server.close();
    }
  });

  test(`[${backend}] 별점: 기본 3점, 1~5만 허용, 수정 가능`, async () => {
    const { server, call } = await startServer(backend);
    try {
      await call('POST', '/api/login', { code: '4821' });
      const plain = await call('POST', '/api/toilets', sample);
      assert.strictEqual(plain.body.toilet.rating, 3);
      const five = await call('POST', '/api/toilets', { ...sample, rating: 5 });
      assert.strictEqual(five.body.toilet.rating, 5);
      assert.strictEqual((await call('POST', '/api/toilets', { ...sample, rating: 6 })).status, 400);
      assert.strictEqual((await call('POST', '/api/toilets', { ...sample, rating: 2.5 })).status, 400);
      const one = await call('PUT', `/api/toilets/${plain.body.toilet.id}`, { rating: 1 });
      assert.strictEqual(one.body.toilet.rating, 1);
      const kept = await call('PUT', `/api/toilets/${plain.body.toilet.id}`, { password: '0000' });
      assert.strictEqual(kept.body.toilet.rating, 1);
      const list = await call('GET', '/api/toilets');
      assert.deepStrictEqual(list.body.toilets.map((t) => t.rating).sort(), [1, 5]);
    } finally {
      server.close();
    }
  });
}
