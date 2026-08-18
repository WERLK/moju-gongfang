/**
 * 实时协作客户端：WebSocket 连接、状态同步、在线名单
 */
const Collab = (function(){
  let ws = null;
  let projectId = null;
  let sendTimer = null;
  let applyingRemote = false;  // 防止远端同步触发本地再广播
  let reconnectTimer = null;
  let onlineUsers = [];

  function wsUrl(pid){
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const token = Auth.getToken() || '';
    return `${proto}//${location.host}/ws?project=${encodeURIComponent(pid)}&token=${encodeURIComponent(token)}`;
  }

  function connect(pid){
    if(!Auth.isLoggedIn()) return;
    if(projectId === pid && ws && ws.readyState <= 1) return;
    disconnect();
    projectId = pid;
    try{
      ws = new WebSocket(wsUrl(pid));
    }catch(e){ console.warn('WS 连接失败', e); return }
    ws.onopen = ()=>{ console.log('协作已连接', pid); };
    ws.onmessage = (ev)=>{
      let msg; try{ msg = JSON.parse(ev.data) }catch(e){return}
      if(msg.type === 'snapshot'){
        applyingRemote = true;
        App.applyRemoteState(msg.state, msg.role);
        applyingRemote = false;
      }else if(msg.type === 'sync'){
        applyingRemote = true;
        App.applyRemoteState(msg.state);
        applyingRemote = false;
        App.toast(msg.from ? (msg.from.username+' 更新了内容') : '协作方更新了内容');
      }else if(msg.type === 'presence'){
        onlineUsers = msg.users || [];
        renderPresence();
      }
    };
    ws.onclose = ()=>{
      ws = null;
      renderPresence();
      // 非主动断开时尝试重连
      if(projectId && !applyingRemote===false){
        // 3 秒后重连
        clearTimeout(reconnectTimer);
        reconnectTimer = setTimeout(()=>{ if(projectId) connect(projectId) }, 3000);
      }
    };
    ws.onerror = ()=>{ /* onclose 会处理 */ };
  }

  function disconnect(){
    projectId = null;
    clearTimeout(reconnectTimer);
    if(ws){ try{ ws.close() }catch(e){} ws = null }
    onlineUsers = [];
    renderPresence();
  }

  // 本地编辑后调用（防抖）
  function scheduleSend(state){
    if(applyingRemote) return;            // 远端同步来的，不再广播
    if(!ws || ws.readyState !== 1) return; // 未连接/未就绪
    if(sendTimer) clearTimeout(sendTimer);
    sendTimer = setTimeout(()=>{
      if(ws && ws.readyState === 1){
        ws.send(JSON.stringify({ type:'sync', state }));
      }
    }, 400);
  }

  function renderPresence(){
    const el = document.getElementById('collabPresence');
    if(!el) return;
    if(onlineUsers.length === 0){ el.innerHTML = ''; return }
    el.innerHTML = onlineUsers.map(u=>`<div class="collab-avatar" title="${u.username}（${u.role}）">${(u.username||'?').slice(0,1).toUpperCase()}</div>`).join('');
  }

  function isOnline(){ return onlineUsers }
  function isConnected(){ return !!(ws && ws.readyState === 1) }

  return { connect, disconnect, scheduleSend, renderPresence, isOnline, isConnected };
})();
