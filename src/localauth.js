import crypto from 'node:crypto';
import {
  listLocalUsers, getLocalUser, upsertLocalUser, deleteLocalUser, countLocalUsers,
} from './db.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Hash scrypt stocké sous la forme "sel:hash" (hexadécimal).
function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const derived = crypto.scryptSync(password, salt, 32);
  return `${salt.toString('hex')}:${derived.toString('hex')}`;
}

// Comparaison à temps constant contre le hash stocké.
function verifyPassword(password, stored) {
  const [saltHex, hashHex] = (stored || '').split(':');
  if (!saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, 'hex');
  const derived = crypto.scryptSync(password, Buffer.from(saltHex, 'hex'), expected.length);
  return crypto.timingSafeEqual(derived, expected);
}

// Vérifie email + mot de passe ; renvoie la durée (minutes) ou null si invalide.
export function verifyLocalUser(email, password) {
  if (!email || !password) return null;
  const user = getLocalUser(email.trim().toLowerCase());
  if (!user || !verifyPassword(password, user.pass_hash)) return null;
  return user.minutes;
}

// --- Gestion depuis l'admin ---

export function listUsers() {
  return listLocalUsers();
}

// Crée ou met à jour un compte (mot de passe et durée). false si entrée invalide.
export function addUser(email, password, minutes) {
  const e = (email || '').trim().toLowerCase();
  const m = parseInt(minutes, 10);
  if (!EMAIL_RE.test(e) || !password || !Number.isFinite(m) || m <= 0) return false;
  upsertLocalUser({ email: e, passHash: hashPassword(password), minutes: m });
  return true;
}

export function removeUser(id) {
  deleteLocalUser(parseInt(id, 10));
}

export { countLocalUsers as countUsers };
