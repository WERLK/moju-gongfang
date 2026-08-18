/**
 * 认证客户端：登录/注册 UI、token 管理、带鉴权的 fetch 封装
 */
const Auth = (function(){
  const TOKEN_KEY = 'ai_comic_token';
  const USER_KEY = 'ai_comic_user';
  let onAuthChange = null;

  /* ============ 存储 ============ */
  function getToken(){ return localStorage.getItem(TOKEN_KEY) }
  function setToken(t){ localStorage.setItem(TOKEN_KEY, t) }
  function getUser(){ try { return JSON.parse(localStorage.getItem(USER_KEY) || 'null') } catch(e){ return null } }
  function setUser(u){ localStorage.setItem(USER_KEY, JSON.stringify(u||null)) }
  function clear(){ localStorage.removeItem(TOKEN_KEY); localStorage.removeItem(USER_KEY) }
  function isLoggedIn(){ return !!getToken() }

  /**
   * 带 token 的 fetch 封装
   * 401 时自动清理并提示登录
   */
  async function apiFetch(url, opts = {}) {
    const token = getToken();
    const headers = { ...(opts.headers || {}) };
    if (token) headers['Authorization'] = 'Bearer ' + token;
    if (opts.body && typeof opts.body === 'object' && !(opts.body instanceof FormData)) {
      headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(opts.body);
    }
    const res = await fetch(url, { ...opts, headers });
    let data = null;
    const ct = res.headers.get('content-type') || '';
    if (ct.includes('application/json')) data = await res.json();
    else data = { text: await res.text().catch(() => '') };
    if (!res.ok) {
      const msg = (data && data.error) || ('请求失败 ' + res.status);
      if (res.status === 401) {
        clear();
        updateAccountUI();
        if (onAuthChange) onAuthChange(false);
        throw new Error('登录已失效，请重新登录');
      }
      throw new Error(msg);
    }
    return data;
  }

  /* ============ 接口调用 ============ */
  async function register(username, password) {
    const data = await apiFetch('/api/auth/register', { method: 'POST', body: { username, password } });
    setToken(data.token); setUser(data.user);
    updateAccountUI();
    if (onAuthChange) onAuthChange(true);
    return data.user;
  }
  async function login(username, password) {
    const data = await apiFetch('/api/auth/login', { method: 'POST', body: { username, password } });
    setToken(data.token); setUser(data.user);
    updateAccountUI();
    if (onAuthChange) onAuthChange(true);
    return data.user;
  }
  async function me() {
    const data = await apiFetch('/api/auth/me');
    setUser(data.user);
    return data.user;
  }
  function logout() {
    clear();
    updateAccountUI();
    if (onAuthChange) onAuthChange(false);
  }

  /* ============ UI ============ */
  function updateAccountUI() {
    const el = document.getElementById('accountArea');
    if (!el) return;
    if (isLoggedIn()) {
      const u = getUser() || {};
      el.innerHTML = `
        <button class="btn btn-ghost" id="btnMyProjects">我的作品</button>
        <span class="user-chip">${escapeHtml(u.username || '用户')}</span>
        <button class="btn btn-ghost" id="btnLogout">退出</button>`;
      document.getElementById('btnMyProjects').onclick = () => { if (onAuthChange) onAuthChange(true, 'openProjects') };
      document.getElementById('btnLogout').onclick = () => { logout(); App.toast('已退出登录') };
    } else {
      el.innerHTML = `<button class="btn btn-primary" id="btnLogin">登录 / 注册</button>`;
      document.getElementById('btnLogin').onclick = () => showAuthModal('login');
    }
  }

  function showAuthModal(mode) {
    let modal = document.getElementById('authModal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'authModal';
      modal.className = 'modal';
      modal.innerHTML = `
        <div class="modal-box" style="width:380px">
          <div class="modal-header"><h3 id="authTitle">登录</h3><button class="icon-btn" id="authClose">✕</button></div>
          <div class="modal-body" style="display:block">
            <form id="authForm">
              <label class="field-label">用户名</label>
              <input type="text" id="authUsername" autocomplete="username" required minlength="2" maxlength="20" placeholder="2-20 位字符">
              <label class="field-label">密码</label>
              <input type="password" id="authPassword" autocomplete="current-password" required minlength="6" placeholder="至少 6 位">
              <div class="auth-error" id="authError" hidden></div>
              <button type="submit" class="btn btn-primary btn-block" id="authSubmit" style="margin-top:14px">登录</button>
              <div class="auth-switch" id="authSwitch">没有账号？<a href="#">去注册</a></div>
            </form>
          </div>
        </div>`;
      document.body.appendChild(modal);
      modal.querySelector('#authClose').onclick = () => modal.hidden = true;
      modal.querySelector('#authSwitch').onclick = (e) => {
        e.preventDefault();
        const cur = modal.dataset.mode;
        showAuthModal(cur === 'login' ? 'register' : 'login');
      };
      modal.querySelector('#authForm').onsubmit = async (e) => {
        e.preventDefault();
        const u = modal.querySelector('#authUsername').value.trim();
        const p = modal.querySelector('#authPassword').value;
        const errEl = modal.querySelector('#authError');
        const btn = modal.querySelector('#authSubmit');
        errEl.hidden = true; btn.disabled = true; btn.textContent = '处理中…';
        try {
          if (modal.dataset.mode === 'register') await register(u, p);
          else await login(u, p);
          modal.hidden = true;
          App.toast((modal.dataset.mode === 'register' ? '注册' : '登录') + '成功，欢迎 ' + u, 'ok');
        } catch (err) {
          errEl.textContent = err.message; errEl.hidden = false;
        } finally {
          btn.disabled = false; btn.textContent = modal.dataset.mode === 'register' ? '注册' : '登录';
        }
      };
    }
    modal.dataset.mode = mode;
    modal.querySelector('#authTitle').textContent = mode === 'register' ? '注册' : '登录';
    modal.querySelector('#authSubmit').textContent = mode === 'register' ? '注册' : '登录';
    modal.querySelector('#authSwitch').innerHTML = mode === 'register'
      ? '已有账号？<a href="#">去登录</a>'
      : '没有账号？<a href="#">去注册</a>';
    modal.querySelector('#authError').hidden = true;
    modal.hidden = false;
    setTimeout(() => modal.querySelector('#authUsername').focus(), 50);
  }

  function escapeHtml(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}

  function init(cb){ onAuthChange = cb; updateAccountUI() }

  return { getToken, getUser, isLoggedIn, apiFetch, register, login, me, logout, showAuthModal, updateAccountUI, init };
})();
