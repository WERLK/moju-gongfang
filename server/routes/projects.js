/**
 * 作品路由：CRUD + 发布 + 点赞 + 收藏 + 协作者管理
 * owner 可全权操作；collaborator(editor) 可读写内容；viewer/匿名只读公开作品（走 gallery）
 */
const express = require('express');
const db = require('../db');
const { authRequired } = require('../middleware/auth');

const router = express.Router();
router.use(authRequired);

// 校验归属：owner 返回 {project, role:'owner'}；collab 返回 {project, role};否则 null/forbidden
function access(id, uid, requireWrite) {
  const r = db.getProjectForUser(id, uid);
  if (!r) return null;
  if (r.role === 'viewer' && requireWrite) return { forbidden: true };
  return r;
}

// 列表（我的）
router.get('/', (req, res) => {
  const list = db.listProjects(req.user.id).map(p => ({
    id: p.id, title: p.title, cover: p.cover, is_public: !!p.is_public,
    created_at: p.created_at, updated_at: p.updated_at
  }));
  res.json({ projects: list });
});

// 创建
router.post('/', (req, res) => {
  const { id, title, state, cover, is_public } = req.body || {};
  if (!id) return res.status(400).json({ error: '缺少作品 id' });
  const stateJson = JSON.stringify(state || {});
  try {
    db.createProject(id, req.user.id, title || '未命名作品', stateJson, cover || null, !!is_public);
  } catch (e) { return res.status(409).json({ error: '作品 id 已存在' }); }
  res.json({ id, title, ok: true });
});

// 详情（owner / collaborator 可见完整 state）
router.get('/:id', (req, res) => {
  const r = access(req.params.id, req.user.id, false);
  if (!r) return res.status(404).json({ error: '作品不存在或无权访问' });
  if (r.forbidden) return res.status(403).json({ error: '无权访问' });
  const p = r.project;
  let state = {};
  try { state = JSON.parse(p.state_json); } catch (e) {}
  res.json({
    id: p.id, title: p.title, state, cover: p.cover, is_public: !!p.is_public,
    role: r.role, created_at: p.created_at, updated_at: p.updated_at,
    likes: db.likeCount(p.id), favorites: db.favoriteCount(p.id)
  });
});

// 更新（owner 或 editor）
router.put('/:id', (req, res) => {
  const r = access(req.params.id, req.user.id, true);
  if (!r) return res.status(404).json({ error: '作品不存在或无权访问' });
  if (r.forbidden) return res.status(403).json({ error: '无编辑权限' });
  const p = r.project;
  const { title, state, cover } = req.body || {};
  const stateJson = state ? JSON.stringify(state) : p.state_json;
  const newTitle = title !== undefined ? title : p.title;
  const newCover = cover !== undefined ? cover : p.cover;
  db.updateProject(newTitle, stateJson, newCover, p.id, p.user_id);
  res.json({ id: p.id, ok: true });
});

// 删除（仅 owner）
router.delete('/:id', (req, res) => {
  const p = db.getProject(req.params.id);
  if (!p) return res.status(404).json({ error: '作品不存在' });
  if (p.user_id !== req.user.id) return res.status(403).json({ error: '仅作者可删除' });
  db.deleteProject(p.id, req.user.id);
  res.json({ id: p.id, ok: true });
});

// 发布/取消发布（仅 owner）
router.post('/:id/publish', (req, res) => {
  const p = db.getProject(req.params.id);
  if (!p) return res.status(404).json({ error: '作品不存在' });
  if (p.user_id !== req.user.id) return res.status(403).json({ error: '仅作者可发布' });
  const isPublic = !!req.body.is_public;
  db.setPublic(p.id, req.user.id, isPublic);
  res.json({ id: p.id, is_public: isPublic, ok: true });
});

// 点赞（toggle，任意登录用户）
router.post('/:id/like', (req, res) => {
  const p = db.getProject(req.params.id);
  if (!p) return res.status(404).json({ error: '作品不存在' });
  const r = db.toggleLike(req.user.id, p.id);
  res.json({ id: p.id, liked: r.liked, likes: db.likeCount(p.id) });
});

// 收藏（toggle）
router.post('/:id/favorite', (req, res) => {
  const p = db.getProject(req.params.id);
  if (!p) return res.status(404).json({ error: '作品不存在' });
  const r = db.toggleFavorite(req.user.id, p.id);
  res.json({ id: p.id, favorited: r.favorited, favorites: db.favoriteCount(p.id) });
});

// 我的权限
router.get('/:id/permissions', (req, res) => {
  const r = db.getProjectForUser(req.params.id, req.user.id);
  if (!r) return res.status(404).json({ error: '无权访问' });
  res.json({ id: req.params.id, role: r.role, is_public: !!r.project.is_public });
});

// 协作者列表（owner / collaborator 可见）
router.get('/:id/collaborators', (req, res) => {
  const r = access(req.params.id, req.user.id, false);
  if (!r) return res.status(404).json({ error: '无权访问' });
  const list = db.listCollaborators(req.params.id).map(c => ({ user_id: c.user_id, username: c.username, role: c.role }));
  const author = db.getUserById(r.project.user_id);
  res.json({
    author: author ? { user_id: author.id, username: author.username, role: 'owner' } : null,
    collaborators: list
  });
});

// 添加协作者（仅 owner，按用户名邀请）
router.post('/:id/collaborators', (req, res) => {
  const p = db.getProject(req.params.id);
  if (!p) return res.status(404).json({ error: '作品不存在' });
  if (p.user_id !== req.user.id) return res.status(403).json({ error: '仅作者可邀请协作者' });
  const { username, role } = req.body || {};
  const u = db.getUserByNamePublic(username);
  if (!u) return res.status(404).json({ error: '用户不存在' });
  if (u.id === p.user_id) return res.status(400).json({ error: '不能邀请作者自己' });
  const c = db.addCollaborator(p.id, u.id, role || 'editor');
  res.json({ user_id: u.id, username: u.username, role: c ? c.role : 'editor', ok: true });
});

// 移除协作者（仅 owner）
router.delete('/:id/collaborators/:userId', (req, res) => {
  const p = db.getProject(req.params.id);
  if (!p) return res.status(404).json({ error: '作品不存在' });
  if (p.user_id !== req.user.id) return res.status(403).json({ error: '仅作者可移除协作者' });
  db.removeCollaborator(p.id, +req.params.userId);
  res.json({ ok: true });
});

module.exports = router;
