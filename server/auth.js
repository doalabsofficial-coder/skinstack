import crypto from 'node:crypto';
import { config } from './config.js';
import { db } from './db.js';
import { HttpError, parseCookies } from './http.js';

const sha256 = (s) => crypto.createHash('sha256').update(s).digest();
const hmac = (s) => crypto.createHmac('sha256', config.sessionSecret).update(s).digest('base64url');

/* ---------- 익명 사용자 토큰 (등록 요청 상태 조회용) ---------- */

export function issueUserToken() {
  const uid = crypto.randomUUID();
  return `${uid}.${hmac(uid)}`;
}

export function requireUser(req) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  const [uid, sig] = token.split('.');
  if (!uid || !sig) throw new HttpError(401, 'unauthorized');
  const expected = Buffer.from(hmac(uid));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !crypto.timingSafeEqual(expected, given)) {
    throw new HttpError(401, 'unauthorized');
  }
  return uid;
}

/* ---------- 관리자 세션 (서버에서 검증, HttpOnly 쿠키) ---------- */

const ADMIN_COOKIE = 'ss_admin';
const SESSION_MS = 8 * 60 * 60 * 1000;

export function adminEnabled() {
  return config.adminPassword.length > 0;
}

export function checkAdminPassword(password) {
  if (!adminEnabled()) throw new HttpError(403, 'admin_disabled');
  const ok = crypto.timingSafeEqual(sha256(String(password ?? '')), sha256(config.adminPassword));
  if (!ok) throw new HttpError(401, 'invalid_credentials');
}

export function createAdminSession() {
  const token = crypto.randomBytes(32).toString('base64url');
  db.prepare('DELETE FROM admin_sessions WHERE expires_at < ?').run(Date.now());
  db.prepare('INSERT INTO admin_sessions (token_hash, expires_at) VALUES (?, ?)')
    .run(sha256(token).toString('hex'), Date.now() + SESSION_MS);
  return `${ADMIN_COOKIE}=${token}; HttpOnly; SameSite=Strict; Path=/api; Max-Age=${SESSION_MS / 1000}`;
}

export function destroyAdminSession(req) {
  const token = parseCookies(req)[ADMIN_COOKIE];
  if (token) db.prepare('DELETE FROM admin_sessions WHERE token_hash = ?').run(sha256(token).toString('hex'));
  return `${ADMIN_COOKIE}=; HttpOnly; SameSite=Strict; Path=/api; Max-Age=0`;
}

export function isAdmin(req) {
  if (!adminEnabled()) return false;
  const token = parseCookies(req)[ADMIN_COOKIE];
  if (!token) return false;
  const row = db.prepare('SELECT expires_at FROM admin_sessions WHERE token_hash = ?')
    .get(sha256(token).toString('hex'));
  return Boolean(row && row.expires_at > Date.now());
}

export function requireAdmin(req) {
  if (!isAdmin(req)) throw new HttpError(403, 'forbidden');
}
