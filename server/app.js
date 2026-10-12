'use strict';

const path = require('path');
const express = require('express');
const { createAuth } = require('./auth');
const { validateToilet, REGION_BOUNDS } = require('./store');

// 비동기 라우트의 오류를 Express 오류 처리로 넘긴다
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

/** store 는 init() 이 끝난 저장소 (FileStore 또는 PgStore) */
function createApp(config, store) {
  const app = express();
  const auth = createAuth({
    accessCode: config.accessCode,
    secret: config.sessionSecret,
    secureCookie: config.secureCookie,
  });

  if (config.trustProxy) app.set('trust proxy', 1);
  app.disable('x-powered-by');
  app.use(express.json({ limit: '20kb' }));

  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'same-origin');
    next();
  });

  // ---- 공개 API ----
  app.get('/api/config', (req, res) => {
    res.json({
      naverClientId: config.naverClientId,
      adfitUnit: config.adfitUnit || '',
      bounds: REGION_BOUNDS,
    });
  });

  app.get('/api/session', (req, res) => {
    res.json({ authed: auth.isAuthed(req) });
  });

  app.post('/api/login', auth.login);
  app.post('/api/logout', auth.logout);

  // ---- 로그인 필요 API ----
  app.get('/api/toilets', auth.requireAuth, wrap(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.json({ toilets: await store.list() });
  }));

  app.post('/api/toilets', auth.requireAuth, wrap(async (req, res) => {
    const { error, value } = validateToilet(req.body || {});
    if (error) return res.status(400).json({ error });
    res.status(201).json({ toilet: await store.create(value) });
  }));

  app.put('/api/toilets/:id', auth.requireAuth, wrap(async (req, res) => {
    const { error, value } = validateToilet(req.body || {}, { partial: true });
    if (error) return res.status(400).json({ error });
    const toilet = await store.update(req.params.id, value);
    if (!toilet) return res.status(404).json({ error: '화장실을 찾을 수 없습니다.' });
    res.json({ toilet });
  }));

  app.delete('/api/toilets/:id', auth.requireAuth, wrap(async (req, res) => {
    if (!(await store.remove(req.params.id))) {
      return res.status(404).json({ error: '화장실을 찾을 수 없습니다.' });
    }
    res.json({ ok: true });
  }));

  // 프로모션 전단지 이미지 (접속 코드 입력한 멤버만)
  const PROMO_DIR = path.join(__dirname, 'promo');
  app.get('/api/promo/:file', auth.requireAuth, (req, res) => {
    const file = req.params.file;
    if (!/^[a-z0-9-]+\.(jpg|png)$/.test(file)) return res.status(404).json({ error: 'Not found' });
    res.setHeader('Cache-Control', 'private, max-age=600');
    res.sendFile(path.join(PROMO_DIR, file), (err) => {
      if (err && !res.headersSent) res.status(404).json({ error: 'Not found' });
    });
  });

  app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));

  // eslint-disable-next-line no-unused-vars
  app.use('/api', (err, req, res, next) => {
    console.error(err);
    res.status(500).json({ error: '서버 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.' });
  });

  // ---- 정적 파일 (모바일 웹) ----
  app.use(
    express.static(path.join(__dirname, '..', 'public'), {
      setHeaders(res, filePath) {
        if (filePath.endsWith('sw.js') || filePath.endsWith('.html')) {
          res.setHeader('Cache-Control', 'no-cache');
        }
      },
    })
  );

  return app;
}

module.exports = { createApp };
