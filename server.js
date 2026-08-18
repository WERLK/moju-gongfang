/**
 * AI 漫剧工坊 - 服务入口
 * 启动 Express 应用，提供 API（认证/作品）+ 前端静态文件
 */
const app = require('./server/app');
const db = require('./server/db');

const PORT = process.env.PORT || 8765;

(async () => {
  try {
    await db.init();
    console.log('数据库已就绪 (SQLite/sql.js)');
  } catch (e) {
    console.error('数据库初始化失败:', e.message);
    process.exit(1);
  }

  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log('======================================');
    console.log('  AI 漫剧工坊 · 服务已启动');
    console.log('======================================');
    console.log('  本地访问: http://127.0.0.1:' + PORT);
    console.log('  API 前缀: /api/auth, /api/projects, /api/gallery, /api/users, /api/me');
    console.log('  WebSocket: ws://127.0.0.1:' + PORT + '/ws');
    console.log('  数据库:   ./data/comic.db (SQLite)');
    console.log('  按 Ctrl+C 停止');
    console.log('======================================');
  });

  // 挂载 WebSocket 协作服务
  require('./server/ws').attach(server);

  process.on('SIGINT', () => {
    console.log('\n正在关闭服务…');
    try { db.persist(); } catch (e) {}
    server.close(() => process.exit(0));
  });
})();
