'use strict';

const crypto = require('crypto');

const COOKIE_NAME = 'tm_session';
const SESSION_DAYS = 30;

function sign(payload, secret) {
  return crypto.createHmac('sha256', secret).update(payload).digest('base64url');
}

function safeEqual(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
}

function parseCookies(header) {
  const out = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx < 0) continue;
    out[part.slice(0, idx).trim()] = decodeURIComponent(part.slice(idx + 1).trim());
  }
  return out;
}

/**
 * 4자리 접속 코드 + 서명된 세션 쿠키.
 * 접속 코드를 바꾸면 기존 세션은 모두 무효가 된다(서명에 코드가 포함됨).
 */
function createAuth({ accessCode, secret, secureCookie }) {
  const signingKey = `${secret}:${accessCode}`;

  // 무차별 대입 방지: IP 당 실패 5회 → 10분 잠금
  const MAX_FAILS = 5;
  const LOCK_MS = 10 * 60 * 1000;
  const attempts = new Map();

  function issueToken() {
    const exp = Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000;
    const payload = String(exp);
    return `${payload}.${sign(payload, signingKey)}`;
  }

  function verifyToken(token) {
    if (!token) return false;
    const [payload, sig] = token.split('.');
    if (!payload || !sig) return false;
    if (!safeEqual(sig, sign(payload, signingKey))) return false;
    return Number(payload) > Date.now();
  }

  function cookieHeader(value, maxAgeSec) {
    const parts = [
      `${COOKIE_NAME}=${encodeURIComponent(value)}`,
      'Path=/',
      'HttpOnly',
      'SameSite=Lax',
      `Max-Age=${maxAgeSec}`,
    ];
    if (secureCookie) parts.push('Secure');
    return parts.join('; ');
  }

  function isAuthed(req) {
    return verifyToken(parseCookies(req.headers.cookie)[COOKIE_NAME]);
  }

  function login(req, res) {
    const ip = req.ip || 'unknown';
    const now = Date.now();
    const rec = attempts.get(ip) || { fails: 0, lockedUntil: 0 };

    if (rec.lockedUntil > now) {
      const min = Math.ceil((rec.lockedUntil - now) / 60000);
      return res.status(429).json({ error: `시도가 너무 많습니다. ${min}분 후 다시 시도해 주세요.` });
    }

    const code = String((req.body && req.body.code) || '');
    if (!/^\d{4}$/.test(code) || !safeEqual(code, accessCode)) {
      rec.fails += 1;
      if (rec.fails >= MAX_FAILS) {
        rec.fails = 0;
        rec.lockedUntil = now + LOCK_MS;
      }
      attempts.set(ip, rec);
      return res.status(401).json({ error: '접속 코드가 올바르지 않습니다.' });
    }

    attempts.delete(ip);
    res.setHeader('Set-Cookie', cookieHeader(issueToken(), SESSION_DAYS * 24 * 60 * 60));
    return res.json({ ok: true });
  }

  function logout(req, res) {
    res.setHeader('Set-Cookie', cookieHeader('', 0));
    res.json({ ok: true });
  }

  function requireAuth(req, res, next) {
    if (isAuthed(req)) return next();
    return res.status(401).json({ error: '접속 코드를 먼저 입력해 주세요.' });
  }

  return { login, logout, requireAuth, isAuthed };
}

module.exports = { createAuth };
