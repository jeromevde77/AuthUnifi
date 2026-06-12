import crypto from 'node:crypto';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';

// Clé maître pour chiffrer les secrets stockés en base (mots de passe contrôleur,
// secrets OAuth) et signer les cookies de session admin.
// Priorité : variable MASTER_KEY, sinon fichier data/master.key (auto-généré au
// premier lancement, persistant dans le volume). Aucun secret en clair en base.
const DATA_DIR = dirname(process.env.DB_PATH || 'data/portal.db');
const KEY_FILE = join(DATA_DIR, 'master.key');

function loadKey() {
  if (process.env.MASTER_KEY) {
    return crypto.createHash('sha256').update(process.env.MASTER_KEY).digest();
  }
  mkdirSync(DATA_DIR, { recursive: true });
  if (existsSync(KEY_FILE)) {
    return Buffer.from(readFileSync(KEY_FILE, 'utf8').trim(), 'hex');
  }
  const key = crypto.randomBytes(32);
  writeFileSync(KEY_FILE, key.toString('hex'), { mode: 0o600 });
  return key;
}

const KEY = loadKey();

// AES-256-GCM. Format : "v1:<iv>:<tag>:<ciphertext>" (chaque partie en base64).
export function encrypt(plain) {
  if (plain == null || plain === '') return '';
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', KEY, iv);
  const ct = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString('base64')}:${tag.toString('base64')}:${ct.toString('base64')}`;
}

export function decrypt(token) {
  if (!token || typeof token !== 'string' || !token.startsWith('v1:')) return token || '';
  try {
    const [, ivB, tagB, ctB] = token.split(':');
    const decipher = crypto.createDecipheriv('aes-256-gcm', KEY, Buffer.from(ivB, 'base64'));
    decipher.setAuthTag(Buffer.from(tagB, 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(ctB, 'base64')), decipher.final()]).toString('utf8');
  } catch {
    return '';
  }
}

// Signe/vérifie une charge utile (cookie de session admin) avec la clé maître.
export function sign(payload) {
  const data = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', KEY).update(data).digest('base64url');
  return `${data}.${sig}`;
}

export function verify(token) {
  if (!token || !token.includes('.')) return null;
  const [data, sig] = token.split('.');
  const expected = crypto.createHmac('sha256', KEY).update(data).digest('base64url');
  if (sig.length !== expected.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  try {
    return JSON.parse(Buffer.from(data, 'base64url').toString());
  } catch {
    return null;
  }
}
