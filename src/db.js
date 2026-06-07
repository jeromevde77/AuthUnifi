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
    mac         TEXT,
    ap_mac      TEXT,
    ssid        TEXT,
    liked       INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

const insertStmt = db.prepare(`
  INSERT INTO guests (email, mac, ap_mac, ssid, liked)
  VALUES (@email, @mac, @ap_mac, @ssid, @liked)
`);

export function recordGuest({ email, mac, apMac, ssid, liked }) {
  return insertStmt.run({
    email,
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
