/**
 * 广场路由：公开作品流 + 单个作品查看
 * 公开接口（authOptional）：登录可看到自己的点赞/收藏状态
 */
const express = require('express');
const db = require('../db');
const { authOptional } = require('../middleware/auth');

const router = express.Router();

// 公开作品流 ?sort=hot|new&limit=20&offset=0
router.get('/', authOptional, (req, res) => {
  const sort = req.query.sort === 'hot' ? 'hot' : 'new';
  const limit = Math.min(100, Math.max(1, +req.query.limit || 20));
  const offset = Math.max(0, +req.query.offset || 0);
  const list = db.galleryProjects(sort, limit, offset).map(p => {
    const o = {
      id: p.id, title: p.title, cover: p.cover, author: p.author,
      author_id: p.user_id, created_at: p.created_at, updated_at: p.updated_at,
      likes: p.likes_count, favorites: p.favorites_count,
    };
    if (req.user) {
      o.liked = db.isLiked(req.user.id, p.id);
      o.favorited = db.isFavorited(req.user.id, p.id);
    }
    return o;
  });
  res.json({ projects: list, sort });
});

// 查看单个公开作品（含完整 state）
router.get('/:id', authOptional, (req, res) => {
  const p = db.getProject(req.params.id);
  if (!p) return res.status(404).json({ error: '作品不存在' });
  if (!p.is_public && (!req.user || p.user_id !== req.user.id)) {
    const c = req.user ? db.getCollaborator(p.id, req.user.id) : null;
    if (!c) return res.status(403).json({ error: '该作品未公开' });
  }
  const author = db.getUserById(p.user_id);
  let state = {};
  try { state = JSON.parse(p.state_json); } catch (e) {}
  const out = {
    id: p.id, title: p.title, state, cover: p.cover, is_public: !!p.is_public,
    author: author ? author.username : '未知',
    author_id: p.user_id, created_at: p.created_at, updated_at: p.updated_at,
    likes: db.likeCount(p.id),
    favorites: db.favoriteCount(p.id),
  };
  if (req.user) {
    out.liked = db.isLiked(req.user.id, p.id);
    out.favorited = db.isFavorited(req.user.id, p.id);
    out.role = p.user_id === req.user.id ? 'owner' : (db.getCollaborator(p.id, req.user.id) ? 'editor' : 'viewer');
  } else {
    out.role = 'viewer';
  }
  res.json(out);
});

module.exports = router;
