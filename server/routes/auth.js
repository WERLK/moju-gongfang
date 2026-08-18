/**
 * 认证路由：注册 / 登录 / 当前用户
 */
const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const { signToken, authRequired } = require('../middleware/auth');

const router = express.Router();

// 注册
router.post('/register', (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: '用户名和密码必填' });
  if (username.length < 2 || username.length > 20) return res.status(400).json({ error: '用户名长度需 2-20 位' });
  if (password.length < 6) return res.status(400).json({ error: '密码至少 6 位' });
  if (db.getUserByName(username)) return res.status(409).json({ error: '用户名已存在' });

  const hash = bcrypt.hashSync(password, 10);
  try { db.createUser(username, hash); }
  catch (e) { return res.status(409).json({ error: '用户名已存在' }); }
  const user = db.getUserByName(username);
  if (!user) return res.status(500).json({ error: '创建后回查失败' });
  const token = signToken({ id: user.id, username: user.username });
  res.json({ token, user: { id: user.id, username: user.username, created_at: user.created_at } });
});

// 登录
router.post('/login', (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: '用户名和密码必填' });
  const row = db.getUserByName(username);
  if (!row) return res.status(401).json({ error: '用户名或密码错误' });
  if (!bcrypt.compareSync(password, row.password_hash)) return res.status(401).json({ error: '用户名或密码错误' });

  const token = signToken({ id: row.id, username: row.username });
  res.json({ token, user: { id: row.id, username: row.username, created_at: row.created_at } });
});

// 当前用户
router.get('/me', authRequired, (req, res) => {
  res.json({ user: req.user });
});

module.exports = router;
