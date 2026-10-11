'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createApp } = require('./app');

async function startServer() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'toiletmap-'));
  const app = createApp({
    accessCode: '4821',
    sessionSecret: 'test-secret',
    naverClientId: 'test-client',
    dataFile: path.join(dir, 'toilets.json'),
    secureCookie: false,
    trustProxy: false,
  });
  const server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
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
  return { server, call, dataFile: path.join(dir, 'toilets.json') };
}

const sample = {
  name: '과천시청 화장실',
  address: '경기도 과천시 관문로 69',
  lat: 37.4292,
  lng: 126.9876,
  description: '1층 로비 왼쪽',
  password: '1234*',
};

test('접속 코드 없이 화장실 목록 조회 불가', async () => {
  const { server, call } = await startServer();
  try {
    const res = await call('GET', '/api/toilets');
    assert.strictEqual(res.status, 401);
    const cfg = await call('GET', '/api/config');
    assert.strictEqual(cfg.body.naverClientId, 'test-client');
  } finally {
    server.close();
  }
});

test('잘못된 코드 5회면 잠금', async () => {
  const { server, call } = await startServer();
  try {
    for (let i = 0; i < 5; i++) {
      assert.strictEqual((await call('POST', '/api/login', { code: '0000' })).status, 401);
    }
    assert.strictEqual((await call('POST', '/api/login', { code: '4821' })).status, 429);
  } finally {
    server.close();
  }
});

test('로그인 후 등록/수정/삭제', async () => {
  const { server, call, dataFile } = await startServer();
  try {
    assert.strictEqual((await call('POST', '/api/login', { code: '4821' })).status, 200);
    assert.strictEqual((await call('GET', '/api/session')).body.authed, true);

    const created = await call('POST', '/api/toilets', sample);
    assert.strictEqual(created.status, 201);
    const id = created.body.toilet.id;
    assert.strictEqual(created.body.toilet.password, '1234*');

    const updated = await call('PUT', `/api/toilets/${id}`, { password: '5678#' });
    assert.strictEqual(updated.body.toilet.password, '5678#');
    assert.strictEqual(updated.body.toilet.name, sample.name);

    const list = await call('GET', '/api/toilets');
    assert.strictEqual(list.body.toilets.length, 1);
    assert.ok(fs.readFileSync(dataFile, 'utf8').includes('5678#'));

    assert.strictEqual((await call('DELETE', `/api/toilets/${id}`)).status, 200);
    assert.strictEqual((await call('GET', '/api/toilets')).body.toilets.length, 0);
  } finally {
    server.close();
  }
});

test('과천·안양 밖 위치와 이름 누락은 거부', async () => {
  const { server, call } = await startServer();
  try {
    await call('POST', '/api/login', { code: '4821' });
    // 서울시청
    const seoul = await call('POST', '/api/toilets', { ...sample, lat: 37.5665, lng: 126.978 });
    assert.strictEqual(seoul.status, 400);
    const noName = await call('POST', '/api/toilets', { ...sample, name: '  ' });
    assert.strictEqual(noName.status, 400);
  } finally {
    server.close();
  }
});
