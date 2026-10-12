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
 * - accessCode(편집 코드): 보기 + 화장실 등록/수정/삭제
 * - viewCode(보기 코드): 보기만 가능 (없으면 보기 전용 접속 없음)
 * 코드를 바꾸면 그 코드로 받은 기존 세션은 무효가 된다(서명에 코드가 포함됨).
 */
function createAuth({ accessCode, viewCode, secret, secureCookie }) {
  const ROLES = { edit: accessCode };
  if (viewCode) ROLES.view = viewCode;
  const keyFor = (role) => `${secret}:${role}:${ROLES[role]}`;
  // 예전(역할 구분 전) 세션 쿠키는 편집 코드로만 발급됐으므로 편집 권한으로 인정
  const legacyKey = `${secret}:${accessCode}`;

  // 무차별 대입 방지: IP 당 실패 5회 → 10분 잠금
  const MAX_FAILS = 5;
  const LOCK_MS = 10 * 60 * 1000;
  const attempts = new Map();

  function issueToken(role) {
    const exp = Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000;
    const payload = `${exp}~${role}`;
    return `${payload}.${sign(payload, keyFor(role))}`;
  }

  /** 유효하면 'edit' | 'view', 아니면 null */
  function roleOf(token) {
    if (!token) return null;
    const [payload, sig] = token.split('.');
    if (!payload || !sig) return null;
    const [exp, role] = payload.split('~');
    if (!(Number(exp) > Date.now())) return null;
    if (role === undefined) return safeEqual(sig, sign(payload, legacyKey)) ? 'edit' : null;
    if (!Object.prototype.hasOwnProperty.call(ROLES, role)) return null;
    return safeEqual(sig, sign(payload, keyFor(role))) ? role : null;
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

  function roleFromReq(req) {
    return roleOf(parseCookies(req.headers.cookie)[COOKIE_NAME]);
  }

  function isAuthed(req) {
    return roleFromReq(req) !== null;
  }

  function canEdit(req) {
    return roleFromReq(req) === 'edit';
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
    const role = /^\d{4}$/.test(code)
      ? Object.keys(ROLES).find((r) => safeEqual(code, ROLES[r]))
      : undefined;
    if (!role) {
      rec.fails += 1;
      if (rec.fails >= MAX_FAILS) {
        rec.fails = 0;
        rec.lockedUntil = now + LOCK_MS;
      }
      attempts.set(ip, rec);
      return res.status(401).json({ error: '접속 코드가 올바르지 않습니다.' });
    }

    attempts.delete(ip);
    res.setHeader('Set-Cookie', cookieHeader(issueToken(role), SESSION_DAYS * 24 * 60 * 60));
    return res.json({ ok: true, canEdit: role === 'edit' });
  }

  function logout(req, res) {
    res.setHeader('Set-Cookie', cookieHeader('', 0));
    res.json({ ok: true });
  }

  function requireAuth(req, res, next) {
    if (isAuthed(req)) return next();
    return res.status(401).json({ error: '접속 코드를 먼저 입력해 주세요.' });
  }

  function requireEditor(req, res, next) {
    const role = roleFromReq(req);
    if (role === 'edit') return next();
    if (role) return res.status(403).json({ error: '보기 전용 접속입니다. 등록·수정은 편집 코드로 접속해 주세요.' });
    return res.status(401).json({ error: '접속 코드를 먼저 입력해 주세요.' });
  }

  return { login, logout, requireAuth, requireEditor, isAuthed, canEdit };
}

/**
 * 관리자 로그인 (가입신청 확인용). 비밀번호는 ADMIN_PASSWORD 환경변수로만 설정한다.
 * 비밀번호가 없으면 관리자 기능은 꺼진다. 멤버 세션과 별도의 쿠키(12시간)를 쓴다.
 */
function createAdminAuth({ password, secret, secureCookie }) {
  const ADMIN_COOKIE = 'tm_admin';
  const HOURS = 12;
  const key = `${secret}:admin:${password}`;
  const MAX_FAILS = 5;
  const LOCK_MS = 30 * 60 * 1000;
  const attempts = new Map();

  function cookie(value, maxAgeSec) {
    const parts = [`${ADMIN_COOKIE}=${encodeURIComponent(value)}`, 'Path=/api', 'HttpOnly', 'SameSite=Strict', `Max-Age=${maxAgeSec}`];
    if (secureCookie) parts.push('Secure');
    return parts.join('; ');
  }

  function isAdmin(req) {
    if (!password) return false;
    const token = parseCookies(req.headers.cookie)[ADMIN_COOKIE];
    if (!token) return false;
    const [exp, sig] = token.split('.');
    return !!exp && !!sig && Number(exp) > Date.now() && safeEqual(sig, sign(`admin:${exp}`, key));
  }

  function login(req, res) {
    if (!password) return res.status(503).json({ error: '관리자 비밀번호가 설정되지 않았습니다. (ADMIN_PASSWORD)' });
    const ip = req.ip || 'unknown';
    const now = Date.now();
    const rec = attempts.get(ip) || { fails: 0, lockedUntil: 0 };
    if (rec.lockedUntil > now) {
      const min = Math.ceil((rec.lockedUntil - now) / 60000);
      return res.status(429).json({ error: `시도가 너무 많습니다. ${min}분 후 다시 시도해 주세요.` });
    }
    const pw = String((req.body && req.body.password) || '');
    if (!safeEqual(pw, password)) {
      rec.fails += 1;
      if (rec.fails >= MAX_FAILS) {
        rec.fails = 0;
        rec.lockedUntil = now + LOCK_MS;
      }
      attempts.set(ip, rec);
      return res.status(401).json({ error: '관리자 비밀번호가 올바르지 않습니다.' });
    }
    attempts.delete(ip);
    const exp = String(now + HOURS * 60 * 60 * 1000);
    res.setHeader('Set-Cookie', cookie(`${exp}.${sign(`admin:${exp}`, key)}`, HOURS * 60 * 60));
    return res.json({ ok: true });
  }

  function logout(req, res) {
    res.setHeader('Set-Cookie', cookie('', 0));
    res.json({ ok: true });
  }

  function requireAdmin(req, res, next) {
    if (isAdmin(req)) return next();
    return res.status(401).json({ error: '관리자 로그인이 필요합니다.' });
  }

  return { enabled: !!password, isAdmin, login, logout, requireAdmin };
}

module.exports = { createAuth, createAdminAuth };
