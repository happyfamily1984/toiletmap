'use strict';

const path = require('path');
const express = require('express');
const { createAuth } = require('./auth');
const { ToiletStore, validateToilet, REGION_BOUNDS } = require('./store');

function createApp(config) {
  const app = express();
  const store = new ToiletStore(config.dataFile);
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
      bounds: REGION_BOUNDS,
    });
  });

  app.get('/api/session', (req, res) => {
    res.json({ authed: auth.isAuthed(req) });
  });

  app.post('/api/login', auth.login);
  app.post('/api/logout', auth.logout);

  // ---- 로그인 필요 API ----
  app.get('/api/toilets', auth.requireAuth, (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.json({ toilets: store.list() });
  });

  app.post('/api/toilets', auth.requireAuth, (req, res) => {
    const { error, value } = validateToilet(req.body || {});
    if (error) return res.status(400).json({ error });
    res.status(201).json({ toilet: store.create(value) });
  });

  app.put('/api/toilets/:id', auth.requireAuth, (req, res) => {
    const { error, value } = validateToilet(req.body || {}, { partial: true });
    if (error) return res.status(400).json({ error });
    const toilet = store.update(req.params.id, value);
    if (!toilet) return res.status(404).json({ error: '화장실을 찾을 수 없습니다.' });
    res.json({ toilet });
  });

  app.delete('/api/toilets/:id', auth.requireAuth, (req, res) => {
    if (!store.remove(req.params.id)) {
      return res.status(404).json({ error: '화장실을 찾을 수 없습니다.' });
    }
    res.json({ ok: true });
  });

  app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));

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
