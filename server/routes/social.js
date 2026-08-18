/**
 * 社交路由：用户主页、关注、我的收藏/协作/关注动态
 * 挂载于 /api，子路径：/users/:id/*、/me/*
 */
const express = require('express');
const db = require('../db');
const { authRequired, authOptional } = require('../middleware/auth');

const router = express.Router();

// 用户主页资料（公开）
router.get('/users/:id/profile', authOptional, (req, res) => {
  const uid = +req.params.id;
  const user = db.getUserById(uid);
  if (!user) return res.status(404).json({ error: '用户不存在' });
  const counts = db.followCounts(uid);
  const profile = {
    user: { id: user.id, username: user.username, created_at: user.created_at },
    works: db.userPublicWorks(uid).map(w => ({ id: w.id, title: w.title, cover: w.cover, updated_at: w.updated_at })),
    works_count: db.userAllWorksCount(uid),
    likes_received: db.userLikesReceived(uid),
    followers: counts.followers,
    following: counts.following,
  };
  if (req.user) {
    profile.is_following = db.isFollowing(req.user.id, uid);
    profile.is_self = req.user.id === uid;
  } else {
    profile.is_following = false;
    profile.is_self = false;
  }
  res.json(profile);
});

// 关注/取关（toggle）
router.post('/users/:id/follow', authRequired, (req, res) => {
  const target = +req.params.id;
  const u = db.getUserById(target);
  if (!u) return res.status(404).json({ error: '用户不存在' });
  const r = db.toggleFollow(req.user.id, target);
  res.json({ user_id: target, following: r.following, followers: db.followCounts(target).followers });
});

// 我的收藏
router.get('/me/favorites', authRequired, (req, res) => {
  const list = db.userFavorites(req.user.id).map(p => ({
    id: p.id, title: p.title, cover: p.cover, author: p.author, updated_at: p.updated_at
  }));
  res.json({ favorites: list });
});

// 我协作的作品
router.get('/me/collab', authRequired, (req, res) => {
  const list = db.userCollabProjects(req.user.id).map(p => ({
    id: p.id, title: p.title, cover: p.cover, author: p.author, updated_at: p.updated_at
  }));
  res.json({ collab: list });
});

// 关注动态（我关注的人的公开作品）
router.get('/me/feed', authRequired, (req, res) => {
  // 取我关注的人
  const followees = db.followees ? db.followees(req.user.id) : [];
  // 用 galleryProjects 不好按作者过滤，这里简单返回最近公开作品里我关注作者的
  const all = db.galleryProjects('new', 50, 0);
  const feed = all.filter(p => followees.includes(p.user_id)).map(p => ({
    id: p.id, title: p.title, cover: p.cover, author: p.author, author_id: p.user_id,
    updated_at: p.updated_at, likes: p.likes_count
  }));
  res.json({ feed });
});

module.exports = router;
