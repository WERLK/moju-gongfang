/**
 * WebSocket 实时协作服务
 * 连接：ws://host/ws?project=ID&token=JWT
 * 消息：{type:'sync',state} / {type:'presence'} / {type:'cursor',...}
 * 权限：owner/editor 可 sync；viewer 只收不发
 */
const { WebSocketServer } = require('ws');
const jwt = require('jsonwebtoken');
const db = require('./db');

const JWT_SECRET = process.env.JWT_SECRET || 'ai-comic-studio-secret-2026';

// rooms: Map<projectId, Map<wsId, {ws, user}>>
const rooms = new Map();

function attach(server) {
  const wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (ws, req) => {
    const url = new URL(req.url, 'http://localhost');
    const projectId = url.searchParams.get('project');
    const token = url.searchParams.get('token');
    if (!projectId || !token) { ws.close(4001, '缺少参数'); return; }

    let payload;
    try { payload = jwt.verify(token, JWT_SECRET); }
    catch (e) { ws.close(4003, '令牌无效'); return; }
    const user = { id: payload.id, username: payload.username };

    // 校验访问权限
    const access = db.getProjectForUser(projectId, user.id);
    if (!access) { ws.close(4004, '无权访问该作品'); return; }

    ws._projectId = projectId;
    ws._user = user;
    ws._role = access.role;
    ws._id = 'c_' + Math.random().toString(36).slice(2, 8);

    if (!rooms.has(projectId)) rooms.set(projectId, new Map());
    const room = rooms.get(projectId);
    room.set(ws._id, { ws, user, role: ws._role });

    // 上线通知
    broadcastPresence(projectId);
    // 发送当前服务器快照（DB 中的 state）
    try {
      const p = db.getProject(projectId);
      if (p) {
        let st = {}; try { st = JSON.parse(p.state_json); } catch (e) {}
        ws.send(JSON.stringify({ type: 'snapshot', state: st, role: ws._role }));
      }
    } catch (e) {}

    ws.on('message', (raw) => {
      let msg;
      try { msg = JSON.parse(raw.toString()); } catch (e) { return; }
      if (msg.type === 'sync') {
        // 仅 owner/editor 可写
        if (ws._role !== 'owner' && ws._role !== 'editor') return;
        // 落库
        try {
          const p = db.getProject(projectId);
          if (p) db.updateProject(p.title, JSON.stringify(msg.state), p.cover, projectId, p.user_id);
        } catch (e) {}
        // 广播给房间内其他人
        broadcast(projectId, { type: 'sync', state: msg.state, from: ws._user, fromId: ws._id }, ws._id);
      } else if (msg.type === 'presence') {
        broadcastPresence(projectId);
      } else if (msg.type === 'cursor' || msg.type === 'select') {
        broadcast(projectId, { ...msg, from: ws._user, fromId: ws._id }, ws._id);
      }
    });

    ws.on('close', () => {
      const r = rooms.get(projectId);
      if (r) {
        r.delete(ws._id);
        if (r.size === 0) rooms.delete(projectId);
        broadcastPresence(projectId);
      }
    });
  });

  console.log('WebSocket 协作服务已挂载 /ws');
}

function broadcast(projectId, data, exceptId) {
  const room = rooms.get(projectId);
  if (!room) return;
  const payload = JSON.stringify(data);
  for (const [id, entry] of room) {
    if (exceptId && id === exceptId) continue;
    try { entry.ws.send(payload); } catch (e) {}
  }
}

function broadcastPresence(projectId) {
  const room = rooms.get(projectId);
  const users = room ? Array.from(room.values()).map(e => ({ id: e.user.id, username: e.user.username, role: e.role })) : [];
  broadcast(projectId, { type: 'presence', users });
}

module.exports = { attach };
