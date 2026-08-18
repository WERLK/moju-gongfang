/**
 * 数据库：sql.js (SQLite WASM) 初始化、schema 迁移、全部查询方法
 * 表：users, projects(+is_public), likes, favorites, follows, collaborators
 */
const path = require('path');
const fs = require('fs');

const DATA_DIR = path.join(__dirname, '..', 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
const DB_PATH = path.join(DATA_DIR, 'comic.db');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  state_json TEXT NOT NULL,
  cover TEXT,
  is_public INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_projects_user ON projects(user_id);
CREATE TABLE IF NOT EXISTS likes (
  user_id INTEGER NOT NULL, project_id TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, project_id)
);
CREATE TABLE IF NOT EXISTS favorites (
  user_id INTEGER NOT NULL, project_id TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, project_id)
);
CREATE TABLE IF NOT EXISTS follows (
  follower_id INTEGER NOT NULL, followee_id INTEGER NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (follower_id, followee_id)
);
CREATE TABLE IF NOT EXISTS collaborators (
  project_id TEXT NOT NULL, user_id INTEGER NOT NULL,
  role TEXT DEFAULT 'editor',
  created_at TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (project_id, user_id)
);
`;

let _db = null;
let _ready = null;

async function init() {
  if (_ready) return _ready;
  _ready = (async () => {
    const initSqlJs = require('sql.js');
    const factory = await initSqlJs({ locateFile: f => path.join(__dirname, '..', 'node_modules', 'sql.js', 'dist', f) });
    if (fs.existsSync(DB_PATH)) _db = new factory.Database(new Uint8Array(fs.readFileSync(DB_PATH)));
    else { _db = new factory.Database(); }
    _db.run(SCHEMA);
    migrate();
    persist();
    return _db;
  })();
  return _ready;
}

// 软迁移：补列（兼容旧库）
function migrate() {
  const cols = queryAllRaw("PRAGMA table_info(projects)");
  const names = cols.map(c => c.name);
  if (!names.includes('is_public')) _db.run("ALTER TABLE projects ADD COLUMN is_public INTEGER DEFAULT 0");
}

function persist() {
  if (!_db) return;
  try { fs.writeFileSync(DB_PATH, Buffer.from(_db.export())); } catch (e) { console.error('DB persist 失败:', e); }
}

function queryOneRaw(sql, params = []) {
  const stmt = _db.prepare(sql);
  try { stmt.bind(params); return stmt.step() ? stmt.getAsObject() : null; }
  finally { stmt.free(); }
}
function queryAllRaw(sql, params = []) {
  const stmt = _db.prepare(sql);
  try { stmt.bind(params); const rows = []; while (stmt.step()) rows.push(stmt.getAsObject()); return rows; }
  finally { stmt.free(); }
}
function execRun(sql, params = []) {
  let changes = 0;
  const stmt = _db.prepare(sql);
  try { stmt.bind(params); stmt.step(); changes = _db.getRowsModified(); }
  catch(e){ stmt.free(); throw e; }
  stmt.free();
  persist();
  return changes;
}

/* ============ 业务方法 ============ */
const db = {
  init, persist, isReady: () => !!_db,

  // users
  createUser: (u, h) => { execRun('INSERT INTO users (username, password_hash) VALUES (?, ?)', [u, h]); return db.getUserByName(u); },
  getUserByName: (n) => queryOneRaw('SELECT * FROM users WHERE username = ?', [n]),
  getUserById: (id) => queryOneRaw('SELECT id, username, created_at FROM users WHERE id = ?', [id]),

  // projects
  createProject: (id, uid, title, stateJson, cover, isPublic) => execRun('INSERT INTO projects (id, user_id, title, state_json, cover, is_public) VALUES (?,?,?,?,?,?)', [id, uid, title||'未命名作品', stateJson, cover||null, isPublic?1:0]),
  getProject: (id) => queryOneRaw('SELECT * FROM projects WHERE id = ?', [id]),
  listProjects: (uid) => queryAllRaw('SELECT id, user_id, title, cover, is_public, created_at, updated_at FROM projects WHERE user_id = ? ORDER BY updated_at DESC', [uid]),
  updateProject: (title, stateJson, cover, id, uid) => execRun('UPDATE projects SET title=?, state_json=?, cover=?, updated_at=datetime(\'now\') WHERE id=? AND user_id=?', [title, stateJson, cover, id, uid]),
  setPublic: (id, uid, isPublic) => execRun('UPDATE projects SET is_public=?, updated_at=datetime(\'now\') WHERE id=? AND user_id=?', [isPublic?1:0, id, uid]),
  deleteProject: (id, uid) => execRun('DELETE FROM projects WHERE id=? AND user_id=?', [id, uid]),
  // 协作者可访问的作品（owner 或 collaborator）
  getProjectForUser: (id, uid) => {
    const p = db.getProject(id);
    if (!p) return null;
    if (p.user_id === uid) return { project: p, role: 'owner' };
    const c = db.getCollaborator(id, uid);
    if (c) return { project: p, role: c.role };
    if (p.is_public) return { project: p, role: 'viewer' };
    return null;
  },

  // gallery
  galleryProjects: (sort, limit, offset) => {
    const orderBy = sort === 'hot' ? 'likes_count DESC, p.updated_at DESC' : 'p.updated_at DESC';
    const sql = `SELECT p.id, p.user_id, p.title, p.cover, p.created_at, p.updated_at, u.username AS author,
      (SELECT COUNT(*) FROM likes l WHERE l.project_id=p.id) AS likes_count,
      (SELECT COUNT(*) FROM favorites f WHERE f.project_id=p.id) AS favorites_count
      FROM projects p JOIN users u ON u.id=p.user_id
      WHERE p.is_public=1 ORDER BY ${orderBy} LIMIT ? OFFSET ?`;
    return queryAllRaw(sql, [limit, offset]);
  },

  // likes
  toggleLike: (uid, pid) => {
    const exists = queryOneRaw('SELECT 1 FROM likes WHERE user_id=? AND project_id=?', [uid, pid]);
    if (exists) { execRun('DELETE FROM likes WHERE user_id=? AND project_id=?', [uid, pid]); return { liked: false }; }
    execRun('INSERT INTO likes (user_id, project_id) VALUES (?,?)', [uid, pid]);
    return { liked: true };
  },
  isLiked: (uid, pid) => !!queryOneRaw('SELECT 1 FROM likes WHERE user_id=? AND project_id=?', [uid, pid]),
  likeCount: (pid) => (queryOneRaw('SELECT COUNT(*) AS c FROM likes WHERE project_id=?', [pid]) || {}).c || 0,

  // favorites
  toggleFavorite: (uid, pid) => {
    const exists = queryOneRaw('SELECT 1 FROM favorites WHERE user_id=? AND project_id=?', [uid, pid]);
    if (exists) { execRun('DELETE FROM favorites WHERE user_id=? AND project_id=?', [uid, pid]); return { favorited: false }; }
    execRun('INSERT INTO favorites (user_id, project_id) VALUES (?,?)', [uid, pid]);
    return { favorited: true };
  },
  isFavorited: (uid, pid) => !!queryOneRaw('SELECT 1 FROM favorites WHERE user_id=? AND project_id=?', [uid, pid]),
  favoriteCount: (pid) => (queryOneRaw('SELECT COUNT(*) AS c FROM favorites WHERE project_id=?', [pid]) || {}).c || 0,
  userFavorites: (uid) => queryAllRaw('SELECT p.id, p.title, p.cover, p.updated_at, u.username AS author FROM favorites f JOIN projects p ON p.id=f.project_id JOIN users u ON u.id=p.user_id WHERE f.user_id=? ORDER BY f.created_at DESC', [uid]),

  // follows
  toggleFollow: (followerId, followeeId) => {
    if (followerId === followeeId) return { following: false };
    const exists = queryOneRaw('SELECT 1 FROM follows WHERE follower_id=? AND followee_id=?', [followerId, followeeId]);
    if (exists) { execRun('DELETE FROM follows WHERE follower_id=? AND followee_id=?', [followerId, followeeId]); return { following: false }; }
    execRun('INSERT INTO follows (follower_id, followee_id) VALUES (?,?)', [followerId, followeeId]);
    return { following: true };
  },
  isFollowing: (followerId, followeeId) => !!queryOneRaw('SELECT 1 FROM follows WHERE follower_id=? AND followee_id=?', [followerId, followeeId]),
  followCounts: (uid) => ({
    followers: (queryOneRaw('SELECT COUNT(*) AS c FROM follows WHERE followee_id=?', [uid]) || {}).c || 0,
    following: (queryOneRaw('SELECT COUNT(*) AS c FROM follows WHERE follower_id=?', [uid]) || {}).c || 0,
  }),
  followees: (uid) => queryAllRaw('SELECT followee_id AS id FROM follows WHERE follower_id=?', [uid]).map(r => r.id),

  // profile
  userPublicWorks: (uid) => queryAllRaw('SELECT id, title, cover, is_public, updated_at FROM projects WHERE user_id=? AND is_public=1 ORDER BY updated_at DESC', [uid]),
  userAllWorksCount: (uid) => (queryOneRaw('SELECT COUNT(*) AS c FROM projects WHERE user_id=?', [uid]) || {}).c || 0,
  userLikesReceived: (uid) => (queryOneRaw('SELECT COUNT(*) AS c FROM likes l JOIN projects p ON p.id=l.project_id WHERE p.user_id=?', [uid]) || {}).c || 0,

  // collaborators
  getCollaborator: (pid, uid) => queryOneRaw('SELECT * FROM collaborators WHERE project_id=? AND user_id=?', [pid, uid]),
  listCollaborators: (pid) => queryAllRaw('SELECT c.user_id, c.role, u.username FROM collaborators c JOIN users u ON u.id=c.user_id WHERE c.project_id=?', [pid]),
  addCollaborator: (pid, uid, role) => { execRun('INSERT OR IGNORE INTO collaborators (project_id, user_id, role) VALUES (?,?,?)', [pid, uid, role||'editor']); return db.getCollaborator(pid, uid); },
  removeCollaborator: (pid, uid) => execRun('DELETE FROM collaborators WHERE project_id=? AND user_id=?', [pid, uid]),
  userCollabProjects: (uid) => queryAllRaw('SELECT p.id, p.title, p.cover, p.updated_at, u.username AS author FROM collaborators c JOIN projects p ON p.id=c.project_id JOIN users u ON u.id=p.user_id WHERE c.user_id=? ORDER BY c.created_at DESC', [uid]),

  // 找用户 by name（用于邀请协作者）
  getUserByNamePublic: (n) => queryOneRaw('SELECT id, username, created_at FROM users WHERE username = ?', [n]),
};

module.exports = db;
