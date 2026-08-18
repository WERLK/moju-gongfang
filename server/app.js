/**
 * Express 应用：CORS + JSON + 静态文件 + API 路由
 */
const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();

// base64 图片可能较大，放宽 body 限制（50MB）
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(cors());

// 健康检查
app.get('/api/health', (req, res) => res.json({ ok: true, service: 'ai-comic-studio', time: new Date().toISOString() }));

// API 路由
app.use('/api/auth', require('./routes/auth'));
app.use('/api/projects', require('./routes/projects'));
app.use('/api/gallery', require('./routes/gallery'));
app.use('/api', require('./routes/social')); // /api/users/:id/*, /api/me/*

// 静态文件（前端）
const ROOT = path.join(__dirname, '..');
app.use(express.static(ROOT, { index: 'index.html' }));

// SPA 兜底：非 /api 路径回退到 index.html
app.get(/^(?!\/api).*/, (req, res) => {
  res.sendFile(path.join(ROOT, 'index.html'));
});

module.exports = app;
