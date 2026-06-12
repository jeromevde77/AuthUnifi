import crypto from 'node:crypto';
import { getSetting, setSetting } from './db.js';
import { sign, verify } from './secrets.js';

const COOKIE = 'admin_session';
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 jours

// --- Mot de passe admin (haché scrypt en base, clé admin_password_hash) -------

function hash(password) {
  const salt = crypto.randomBytes(16);
  const derived = crypto.scryptSync(password, salt, 32);
  return `${salt.toString('hex')}:${derived.toString('hex')}`;
}

export function hasAdminPassword() {
  return Boolean(getSetting('admin_password_hash'));
}

export function setAdminPassword(password) {
  if (!password || password.length < 6) return false;
  setSetting('admin_password_hash', hash(password));
  return true;
}

export function verifyAdminPassword(password) {
  const stored = getSetting('admin_password_hash');
  const [saltHex, hashHex] = (stored || '').split(':');
  if (!saltHex || !hashHex || !password) return false;
  const expected = Buffer.from(hashHex, 'hex');
  const derived = crypto.scryptSync(password, Buffer.from(saltHex, 'hex'), expected.length);
  return crypto.timingSafeEqual(derived, expected);
}

// --- Session par cookie signé -------------------------------------------------

function parseCookie(header, name) {
  if (!header) return null;
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i === -1) continue;
    if (part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return null;
}

export function issueSession(req, res) {
  const token = sign({ iat: Date.now() });
  res.cookie(COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: Boolean(req.secure),
    maxAge: MAX_AGE_MS,
    path: '/',
  });
}

export function clearSession(res) {
  res.clearCookie(COOKIE, { path: '/' });
}

export function hasValidSession(req) {
  const payload = verify(parseCookie(req.headers.cookie, COOKIE));
  if (!payload || !payload.iat) return false;
  return Date.now() - payload.iat < MAX_AGE_MS;
}
