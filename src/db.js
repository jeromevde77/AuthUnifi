import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const DB_PATH = process.env.DB_PATH || 'data/portal.db';
mkdirSync(dirname(DB_PATH), { recursive: true });

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS guests (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    email       TEXT NOT NULL,
    name        TEXT,
    method      TEXT NOT NULL DEFAULT 'email',
    mac         TEXT,
    ap_mac      TEXT,
    ssid        TEXT,
    liked       INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

// Migration : ajoute les colonnes name/method aux bases créées avant leur ajout.
const columns = db.prepare('PRAGMA table_info(guests)').all().map((c) => c.name);
if (!columns.includes('name')) db.exec('ALTER TABLE guests ADD COLUMN name TEXT');
if (!columns.includes('method')) {
  db.exec("ALTER TABLE guests ADD COLUMN method TEXT NOT NULL DEFAULT 'email'");
}

const insertStmt = db.prepare(`
  INSERT INTO guests (email, name, method, mac, ap_mac, ssid, liked)
  VALUES (@email, @name, @method, @mac, @ap_mac, @ssid, @liked)
`);

export function recordGuest({ email, name, method, mac, apMac, ssid, liked }) {
  return insertStmt.run({
    email,
    name: name || null,
    method: method || 'email',
    mac: mac || null,
    ap_mac: apMac || null,
    ssid: ssid || null,
    liked: liked ? 1 : 0,
  });
}

const allStmt = db.prepare('SELECT * FROM guests ORDER BY created_at DESC');

export function allGuests() {
  return allStmt.all();
}

// --- Réglages clé/valeur (ex. activation des méthodes depuis l'admin) ---

db.exec(`
  CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value TEXT
  );
`);

const getSettingStmt = db.prepare('SELECT value FROM settings WHERE key = ?');
const setSettingStmt = db.prepare(`
  INSERT INTO settings (key, value) VALUES (@key, @value)
  ON CONFLICT(key) DO UPDATE SET value = @value
`);

export function getSetting(key) {
  return getSettingStmt.get(key)?.value;
}

export function setSetting(key, value) {
  setSettingStmt.run({ key, value });
}

// --- Règles de durée par groupe (éditables depuis l'admin) ---

db.exec(`
  CREATE TABLE IF NOT EXISTS group_rules (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    provider  TEXT NOT NULL,
    group_key TEXT NOT NULL,
    minutes   INTEGER NOT NULL,
    UNIQUE(provider, group_key)
  );
`);

const listGroupRulesStmt = db.prepare(
  'SELECT * FROM group_rules ORDER BY provider, group_key'
);
const getGroupRulesStmt = db.prepare(
  'SELECT group_key, minutes FROM group_rules WHERE provider = ?'
);
const upsertGroupRuleStmt = db.prepare(`
  INSERT INTO group_rules (provider, group_key, minutes)
  VALUES (@provider, @group_key, @minutes)
  ON CONFLICT(provider, group_key) DO UPDATE SET minutes = @minutes
`);
const deleteGroupRuleStmt = db.prepare('DELETE FROM group_rules WHERE id = ?');
const countGroupRulesStmt = db.prepare('SELECT COUNT(*) AS n FROM group_rules');

export function listGroupRules() {
  return listGroupRulesStmt.all();
}
export function getGroupRules(provider) {
  const out = {};
  for (const r of getGroupRulesStmt.all(provider)) out[r.group_key] = r.minutes;
  return out;
}
export function upsertGroupRule({ provider, groupKey, minutes }) {
  return upsertGroupRuleStmt.run({ provider, group_key: groupKey, minutes });
}
export function deleteGroupRule(id) {
  return deleteGroupRuleStmt.run(id);
}
export function countGroupRules() {
  return countGroupRulesStmt.get().n;
}

const statsStmt = db.prepare(`
  SELECT
    COUNT(*) AS total,
    COUNT(DISTINCT email) AS unique_emails,
    SUM(CASE WHEN date(created_at) = date('now') THEN 1 ELSE 0 END) AS today
  FROM guests
`);

export function guestStats() {
  return statsStmt.get();
}
