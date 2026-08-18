/**
 * JWT 认证中间件
 * 校验 Authorization: Bearer <token>，挂载 req.user = { id, username }
 */
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'ai-comic-studio-secret-2026';
const JWT_EXPIRES = '7d';

function signToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES });
}

function authRequired(req, res, next) {
  const header = req.headers.authorization || '';
  const m = header.match(/^Bearer\s+(.+)$/);
  if (!m) return res.status(401).json({ error: '未登录或令牌缺失' });
  try {
    const decoded = jwt.verify(m[1], JWT_SECRET);
    req.user = { id: decoded.id, username: decoded.username };
    next();
  } catch (e) {
    return res.status(401).json({ error: '令牌无效或已过期' });
  }
}

// 可选鉴权：有 token 则挂载 req.user，无 token 也放行（用于广场等公开接口）
function authOptional(req, res, next) {
  const header = req.headers.authorization || '';
  const m = header.match(/^Bearer\s+(.+)$/);
  if (m) {
    try {
      const decoded = jwt.verify(m[1], JWT_SECRET);
      req.user = { id: decoded.id, username: decoded.username };
    } catch (e) { /* 忽略，按匿名处理 */ }
  }
  next();
}

module.exports = { signToken, authRequired, authOptional, JWT_SECRET };
