const Database = require('better-sqlite3');
const path = require('path');
const { dbDir } = require('./filePaths');

const db = new Database(path.join(dbDir, 'quepilot.db'));

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    login_id TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    password TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now', 'localtime'))
  );

  CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    duration INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now', 'localtime'))
  );

  CREATE TABLE IF NOT EXISTS rooms (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    project_id TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now', 'localtime')),
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS tracks (
    id TEXT PRIMARY KEY,
    room_id TEXT NOT NULL,
    name TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now', 'localtime'))
  );

  CREATE TABLE IF NOT EXISTS cues (
    id TEXT PRIMARY KEY,
    label TEXT DEFAULT '',
    comment TEXT DEFAULT '',
    color TEXT DEFAULT '',
    track_id TEXT NOT NULL,
    start_time INTEGER DEFAULT 0,
    duration INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now', 'localtime')),
    FOREIGN KEY (track_id) REFERENCES tracks(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS user_auth (
    id TEXT PRIMARY KEY,
    room_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now', 'localtime')),
    FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS message_personal (
    id TEXT PRIMARY KEY,
    from_user_id TEXT NOT NULL,
    to_user_id TEXT NOT NULL,
    message TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now', 'localtime'))
  );

  CREATE TABLE IF NOT EXISTS message_room (
    id TEXT PRIMARY KEY,
    room_id TEXT NOT NULL,
    from_user_id TEXT NOT NULL,
    message TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now', 'localtime')),
    FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE
  );

  -- 인덱스
  CREATE INDEX IF NOT EXISTS idx_rooms_project ON rooms(project_id);
  CREATE INDEX IF NOT EXISTS idx_tracks_room ON tracks(room_id);
  CREATE INDEX IF NOT EXISTS idx_cues_track ON cues(track_id);
  CREATE INDEX IF NOT EXISTS idx_user_auth_user ON user_auth(user_id);
  CREATE INDEX IF NOT EXISTS idx_user_auth_room ON user_auth(room_id);
  CREATE INDEX IF NOT EXISTS idx_msg_personal_from ON message_personal(from_user_id);
  CREATE INDEX IF NOT EXISTS idx_msg_personal_to ON message_personal(to_user_id);
  CREATE INDEX IF NOT EXISTS idx_msg_personal_date ON message_personal(created_at);
  CREATE INDEX IF NOT EXISTS idx_msg_room_room ON message_room(room_id);
  CREATE INDEX IF NOT EXISTS idx_msg_room_date ON message_room(created_at);
`);

// 마이그레이션: LATEST_VERSION 숫자만 올리면 됨
const LATEST_VERSION = 6;

const curVer = Number(db.pragma('user_version', { plain: true }));

if (curVer < LATEST_VERSION) {
  try { db.exec(`ALTER TABLE users ADD COLUMN created_at TEXT`); } catch (_) {}
}

db.pragma(`user_version = ${LATEST_VERSION}`);

module.exports = db;
