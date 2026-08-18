/**
 * 主应用：SPA 路由 + 视图切换 + 后端 API + 编辑器编排 + 实时协作
 */
const App = (function(){
  let state = {
    mode: 'vertical', scenes: [], currentSceneId: null,
    canvasWidth: 720, panelGap: 12, bgColor: '#ffffff',
    settings: { imgMode:'online', customApiUrl:'', customApiKey:'', textMode:'local', customTextUrl:'', customTextModel:'', customTextKey:'' }
  };
  let dirty = false;
  let currentProjectId = null;
  let projectTitle = '未命名作品';
  let myRole = null;          // 当前作品我的角色 owner/editor/viewer
  let isPublic = false;
  let autoSaveTimer = null;

  /* ============ 工具 ============ */
  function uid(){ return 'id_'+Date.now().toString(36)+Math.random().toString(36).slice(2,6) }
  function genProjectId(){ return 'p_'+Date.now().toString(36)+Math.random().toString(36).slice(2,8) }
  function toast(msg, type){
    const t=document.createElement('div');
    t.className='toast'+(type?(' '+type):'');
    t.textContent=msg;
    document.body.appendChild(t);
    setTimeout(()=>{t.style.opacity='0';t.style.transition='.3s';setTimeout(()=>t.remove(),300)},2200);
  }
  function setStatus(s){const el=document.getElementById('statusInfo');if(el)el.textContent=s}
  function esc(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}

  /* ============ 数据访问 ============ */
  function getState(){return state}
  function getCurrentScene(){return state.scenes.find(s=>s.id===state.currentSceneId)||null}
  function getCurrentProjectId(){return currentProjectId}
  function isLoggedIn(){return Auth.isLoggedIn()}

  /* ============ 路由 / 视图 ============ */
  function navigate(hash){ if(location.hash !== hash) location.hash = hash; else router() }

  function showView(name){
    ['gallery','editor','profile'].forEach(v=>{
      const el = document.getElementById('view-'+v);
      if(el) el.hidden = (v !== name);
    });
    // 编辑器专属按钮仅在编辑器视图显示
    const editorBtns = ['btnNewProject','btnUpload','btnSave','btnExport'];
    editorBtns.forEach(id=>{ const b=document.getElementById(id); if(b) b.hidden = (name!=='editor') });
    const tb = document.getElementById('projectTitleBar'); if(tb) tb.hidden = (name!=='editor');
    // 导航高亮
    const map = { gallery:'#/gallery', editor:'#/editor', profile:'#/profile' };
    document.querySelectorAll('.nav-link').forEach(a=>{
      a.classList.toggle('active', a.dataset.nav === map[name]);
    });
  }

  function router(){
    const hash = location.hash.replace(/^#\/?/, '') || 'gallery';
    const parts = hash.split('/');
    const route = parts[0] || 'gallery';
    if(route === 'gallery'){
      showView('gallery');
      Views.renderGallery();
    }else if(route === 'view' && parts[1]){
      showView('gallery');
      Views.renderViewer(parts[1]);
    }else if(route === 'editor'){
      showView('editor');
      Collab.disconnect();
      if(parts[1] && parts[1] !== currentProjectId){
        openProject(parts[1], /*connectCollab*/true);
      }else{
        // 空白编辑器：若未登录提示
        if(!Auth.isLoggedIn() && state.scenes.length===0){
          // 允许匿名浏览编辑器，保存时再要求登录
        }
      }
    }else if(route === 'profile'){
      showView('profile');
      Views.renderProfile(parts[1]);
    }else{
      navigate('#/gallery');
    }
  }

  /* ============ 持久化 ============ */
  async function saveProject(){
    if(!Auth.isLoggedIn()){ Auth.showAuthModal('login'); return }
    setStatus('保存中…');
    try{
      const cover = await safeThumb();
      if(!currentProjectId){
        const pid = genProjectId();
        await Auth.apiFetch('/api/projects', { method:'POST', body:{ id:pid, title:projectTitle, state, cover, is_public:isPublic } });
        currentProjectId = pid;
        Collab.connect(pid);
        toast('作品已创建并保存','ok');
      }else{
        await Auth.apiFetch('/api/projects/'+currentProjectId, { method:'PUT', body:{ title:projectTitle, state, cover } });
        toast('已保存','ok');
      }
      dirty = false;
      updateTitleBar();
      setStatus('就绪');
    }catch(e){ toast('保存失败：'+e.message,'err'); setStatus('就绪') }
  }

  function scheduleAutoSave(){
    if(!Auth.isLoggedIn() || !currentProjectId) return;
    if(autoSaveTimer) clearTimeout(autoSaveTimer);
    autoSaveTimer = setTimeout(async ()=>{
      try{
        const cover = await safeThumb();
        await Auth.apiFetch('/api/projects/'+currentProjectId, { method:'PUT', body:{ title:projectTitle, state, cover } });
        dirty = false;
        setStatus('已自动保存 · '+new Date().toLocaleTimeString());
      }catch(e){ console.warn('自动保存失败', e) }
    }, 3000);
  }

  async function safeThumb(){ try{ return await Exporter.makeThumb() }catch(e){ return null } }

  function newProject(){
    if(dirty && !confirm('当前有未保存的修改，确认新建将丢失，是否继续？')) return;
    Collab.disconnect();
    state = { mode: state.mode, scenes:[], currentSceneId:null, canvasWidth: state.canvasWidth, panelGap: state.panelGap, bgColor: state.bgColor, settings: state.settings };
    currentProjectId = null; projectTitle = '未命名作品'; myRole = null; isPublic = false;
    dirty = false;
    const st = document.getElementById('sceneTitle'); if(st) st.value = '';
    renderAll(); updateTitleBar(); updatePublishBtn();
    navigate('#/editor');
    setStatus('新作品 · 编辑后保存');
  }

  async function openProject(pid, connectCollab){
    try{
      setStatus('载入作品…');
      const p = await Auth.apiFetch('/api/projects/'+pid);
      currentProjectId = p.id;
      projectTitle = p.title;
      myRole = p.role || 'owner';
      isPublic = !!p.is_public;
      if(p.state){ state = { ...state, ...p.state }; if(!state.settings) state.settings = { imgMode:'online' }; }
      const st = document.getElementById('sceneTitle'); if(st) st.value = projectTitle;
      renderAll(); updateTitleBar(); updatePublishBtn();
      dirty = false;
      setStatus('就绪');
      if(connectCollab) Collab.connect(pid);
      toast('已载入：'+projectTitle,'ok');
    }catch(e){ toast('载入失败：'+e.message,'err'); setStatus('就绪') }
  }

  async function deleteProjectRemote(pid){
    if(!confirm('确认删除该作品？此操作不可恢复。')) return;
    try{
      await Auth.apiFetch('/api/projects/'+pid, { method:'DELETE' });
      toast('作品已删除','ok');
      if(pid === currentProjectId) newProject();
      showGallery();
    }catch(e){ toast('删除失败：'+e.message,'err') }
  }

  function showGallery(){ navigate('#/gallery') }

  /* ============ 远端同步（协作）============ */
  function applyRemoteState(remoteState, role){
    if(!remoteState) return;
    // 保留本地 settings/画布设置，替换内容
    state = { ...state, ...remoteState };
    if(!state.settings) state.settings = { imgMode:'online' };
    if(role) myRole = role;
    renderAll();
  }

  /* ============ 发布 ============ */
  async function publishProject(){
    if(!currentProjectId){ toast('请先保存作品','err'); return }
    if(myRole && myRole !== 'owner'){ toast('仅作者可发布','err'); return }
    const next = !isPublic;
    try{
      const r = await Auth.apiFetch('/api/projects/'+currentProjectId+'/publish', { method:'POST', body:{ is_public: next } });
      isPublic = r.is_public;
      updatePublishBtn();
      toast(next?'已发布到广场':'已取消发布','ok');
    }catch(e){ toast('发布失败：'+e.message,'err') }
  }
  function updatePublishBtn(){
    const b = document.getElementById('btnPublish');
    if(b) b.textContent = isPublic ? '取消发布' : '发布到广场';
  }

  /* ============ 协作者管理弹窗 ============ */
  async function openCollabModal(){
    if(!currentProjectId){ toast('请先保存作品','err'); return }
    let modal = document.getElementById('collabModal');
    if(!modal){
      modal = document.createElement('div'); modal.id='collabModal'; modal.className='modal';
      modal.innerHTML = `
        <div class="modal-box" style="width:420px">
          <div class="modal-header"><h3>协作管理</h3><button class="icon-btn" id="collabClose">✕</button></div>
          <div class="modal-body" style="display:block">
            <div class="collab-box">
              ${myRole==='owner' ? `<div class="invite-row"><input type="text" id="inviteName" placeholder="输入用户名邀请"><button class="btn btn-primary" id="inviteBtn">邀请</button></div>`:''}
              <div id="collabMembers"></div>
            </div>
          </div>
        </div>`;
      document.body.appendChild(modal);
      modal.querySelector('#collabClose').onclick = ()=>modal.hidden=true;
      const ib = modal.querySelector('#inviteBtn');
      if(ib) ib.onclick = async ()=>{
        const name = modal.querySelector('#inviteName').value.trim();
        if(!name) return;
        try{ await Auth.apiFetch('/api/projects/'+currentProjectId+'/collaborators', { method:'POST', body:{ username:name } }); toast('已邀请 '+name,'ok'); modal.querySelector('#inviteName').value=''; renderCollabMembers() }catch(e){ toast(e.message,'err') }
      };
    }
    modal.hidden = false;
    renderCollabMembers();
  }
  async function renderCollabMembers(){
    const box = document.getElementById('collabMembers');
    if(!box) return;
    box.innerHTML = '<div style="text-align:center;color:#9ca3af;padding:12px">加载中…</div>';
    try{
      const r = await Auth.apiFetch('/api/projects/'+currentProjectId+'/collaborators');
      let html = '';
      if(r.author) html += `<div class="collab-member"><span><span class="gallery-card-avatar">${(r.author.username||'?').slice(0,1)}</span> ${esc(r.author.username)} <span class="badge-owner">作者</span></span></div>`;
      (r.collaborators||[]).forEach(c=>{
        html += `<div class="collab-member"><span><span class="gallery-card-avatar">${(c.username||'?').slice(0,1)}</span> ${esc(c.username)} <span style="font-size:11px;color:#9ca3af">协作者</span></span>${myRole==='owner'?`<button class="btn btn-ghost btn-sm" data-uid="${c.user_id}">移除</button>`:''}</div>`;
      });
      if(!r.author && (r.collaborators||[]).length===0) html = '<div style="text-align:center;color:#9ca3af;padding:12px">暂无其他协作者</div>';
      box.innerHTML = html;
      box.querySelectorAll('[data-uid]').forEach(b=>b.onclick=async()=>{
        try{ await Auth.apiFetch('/api/projects/'+currentProjectId+'/collaborators/'+b.dataset.uid, { method:'DELETE' }); toast('已移除','ok'); renderCollabMembers() }catch(e){ toast(e.message,'err') }
      });
    }catch(e){ box.innerHTML = '<div style="padding:12px;color:#ef4444">'+esc(e.message)+'</div>' }
  }

  /* ============ 场景/分格/气泡 CRUD（保留原逻辑）============ */
  function addScene(data){
    const scene={ id:uid(), title:(data&&data.title)||`场景${state.scenes.length+1}`, description:(data&&data.description)||'', panels:(data&&data.panels)||[{id:uid(),imageUrl:'',imagePrompt:'',bubbles:[]}] };
    state.scenes.push(scene); state.currentSceneId=scene.id;
    renderAll(); markDirty(); return scene;
  }
  function deleteScene(id){ const i=state.scenes.findIndex(s=>s.id===id); if(i<0)return; state.scenes.splice(i,1); if(state.currentSceneId===id) state.currentSceneId=state.scenes[0]?.id||null; renderAll(); markDirty() }
  function selectScene(id){ state.currentSceneId=id; const sc=getCurrentScene(); if(sc){ const t=document.getElementById('sceneTitle'); if(t)t.value=sc.title } renderAll() }
  function updateSceneTitle(title){ const sc=getCurrentScene(); if(!sc)return; sc.title=title; renderSceneList(); markDirty() }
  function addPanel(data){ const sc=getCurrentScene(); if(!sc){toast('请先创建场景','err');return null} const panel={id:uid(),imageUrl:(data&&data.imageUrl)||'',imagePrompt:(data&&data.imagePrompt)||'',bubbles:(data&&data.bubbles)||[]}; sc.panels.push(panel); renderAll(); markDirty(); return panel }
  function deletePanel(id){ const sc=getCurrentScene(); if(!sc)return; const i=sc.panels.findIndex(p=>p.id===id); if(i<0)return; sc.panels.splice(i,1); renderAll(); markDirty() }
  function selectPanel(id){ Editor.selectBubble(null); renderProps('panel',id) }
  function addBubble(panelId,type,x,y){ const sc=getCurrentScene(); if(!sc)return; const panel=sc.panels.find(p=>p.id===panelId); if(!panel)return; const text={speech:'点击编辑对白…',narration:'点击编辑旁白…',sfx:'咚！'}[type]||'文本'; const b={id:uid(),type,text,x:x||40,y:y||40,w:180,h:40}; if(!panel.bubbles)panel.bubbles=[]; panel.bubbles.push(b); Editor.selectBubble(b.id); renderProps('bubble',b.id); markDirty() }
  function updateBubble(id,patch){ const b=findBubble(id); if(!b)return; Object.assign(b,patch); Editor.render(); markDirty() }
  function deleteBubble(id){ const sc=getCurrentScene(); if(!sc)return; for(const p of sc.panels){ const i=(p.bubbles||[]).findIndex(b=>b.id===id); if(i>=0){p.bubbles.splice(i,1);break} } Editor.clearSelection(); renderProps(null); markDirty() }
  function selectBubble(id){ renderProps('bubble',id) }
  function findBubble(id){ for(const s of state.scenes){ for(const p of s.panels){ const b=(p.bubbles||[]).find(x=>x.id===id); if(b)return b } } return null }

  /* ============ 渲染 ============ */
  function renderAll(){ renderSceneList(); Editor.render() }
  function renderSceneList(){
    const el=document.getElementById('sceneList'); if(!el)return; el.innerHTML='';
    if(state.scenes.length===0){ el.innerHTML='<div style="text-align:center;color:#9ca3af;padding:20px;font-size:12px">暂无场景</div>'; return }
    state.scenes.forEach((s,i)=>{
      const item=document.createElement('div');
      item.className='scene-item'+(s.id===state.currentSceneId?' active':'');
      const thumbs=(s.panels||[]).slice(0,5).map(p=> p.imageUrl?`<div class="scene-thumb" style="background-image:url('${p.imageUrl}')"></div>`:`<div class="scene-thumb empty">${i+1}</div>`).join('');
      item.innerHTML=`<div class="scene-item-header"><span class="scene-item-num">${i+1}</span><span class="scene-item-title">${esc(s.title||'未命名')}</span></div><div class="scene-thumbs">${thumbs||'<div class="scene-thumb empty">空</div>'}</div><span class="scene-item-del" title="删除">✕</span>`;
      item.onclick=e=>{ if(e.target.classList.contains('scene-item-del')){e.stopPropagation();deleteScene(s.id)}else selectScene(s.id) };
      el.appendChild(item);
    });
  }
  function renderProps(kind,id){
    const empty=document.getElementById('propsEmpty'); const content=document.getElementById('propsContent');
    if(!kind){ empty.hidden=false; content.hidden=true; return }
    empty.hidden=true; content.hidden=false;
    if(kind==='bubble'){
      const b=findBubble(id); if(!b){renderProps(null);return}
      content.innerHTML=`<label class="field-label">类型</label><select id="pType"><option value="speech" ${b.type==='speech'?'selected':''}>对话气泡</option><option value="narration" ${b.type==='narration'?'selected':''}>旁白框</option><option value="sfx" ${b.type==='sfx'?'selected':''}>拟声词</option></select><label class="field-label">文本</label><textarea id="pText">${esc(b.text||'')}</textarea><label class="field-label">字号 (px)</label><input type="number" id="pFontSize" value="${b.fontSize||13}" min="8" max="80"><label class="field-label">颜色</label><input type="color" id="pColor" value="${b.color||'#1f2329'}"><label class="field-label">位置 X / Y</label><div style="display:flex;gap:6px"><input type="number" id="pX" value="${b.x||0}"><input type="number" id="pY" value="${b.y||0}"></div><button class="btn-del" id="pDel">删除此气泡</button>`;
      document.getElementById('pType').onchange=e=>updateBubble(b.id,{type:e.target.value});
      document.getElementById('pText').oninput=e=>updateBubble(b.id,{text:e.target.value});
      document.getElementById('pFontSize').oninput=e=>updateBubble(b.id,{fontSize:+e.target.value});
      document.getElementById('pColor').oninput=e=>updateBubble(b.id,{color:e.target.value});
      document.getElementById('pX').oninput=e=>updateBubble(b.id,{x:+e.target.value});
      document.getElementById('pY').oninput=e=>updateBubble(b.id,{y:+e.target.value});
      document.getElementById('pDel').onclick=()=>deleteBubble(b.id);
    }else if(kind==='panel'){
      const sc=getCurrentScene(); if(!sc){renderProps(null);return}
      const p=sc.panels.find(x=>x.id===id); if(!p){renderProps(null);return}
      content.innerHTML=`<label class="field-label">画面提示词</label><textarea id="pPrompt">${esc(p.imagePrompt||'')}</textarea><label class="field-label">图片地址</label><input type="text" id="pImgUrl" value="${esc(p.imageUrl||'')}" placeholder="可粘贴图片地址或点下方生成"><button class="btn btn-primary btn-block" id="pGen">生成此格画面</button><button class="btn btn-outline btn-block" id="pUpload">上传图片到此格</button><button class="btn-del" id="pDelPanel">删除此格</button>`;
      document.getElementById('pPrompt').oninput=e=>{p.imagePrompt=e.target.value;markDirty()};
      document.getElementById('pImgUrl').oninput=e=>{p.imageUrl=e.target.value;markDirty();Editor.render()};
      document.getElementById('pGen').onclick=()=>genImageForPanel(p);
      document.getElementById('pUpload').onclick=()=>triggerUploadToPanel(p);
      document.getElementById('pDelPanel').onclick=()=>deletePanel(p.id);
    }
  }

  /* ============ 模式 ============ */
  function setMode(m){ state.mode=m; document.querySelectorAll('.mode-btn').forEach(b=>b.classList.toggle('active',b.dataset.mode===m)); renderAll(); markDirty() }

  /* ============ AI ============ */
  async function generateScript(){
    const story=document.getElementById('storyInput').value.trim();
    const style=document.getElementById('storyStyle').value;
    const count=+document.getElementById('storyCount').value;
    if(!story){toast('请先输入故事梗概','err');return}
    setStatus('正在生成剧本…');
    const btn=document.getElementById('btnGenScript'); btn.disabled=true; btn.textContent='生成中…';
    try{
      const cfg=state.settings;
      const result=await AI.genScript(story,style,count,{mode:cfg.textMode,customUrl:cfg.customTextUrl,customModel:cfg.customTextModel,customKey:cfg.customTextKey});
      const scenes=result.scenes||[];
      if(scenes.length===0){toast('未生成有效剧本','err');return}
      scenes.forEach(s=>addScene(s));
      toast(`已生成 ${scenes.length} 个分镜`,'ok');
      setStatus('就绪');
    }catch(e){ toast('剧本生成失败：'+e.message,'err'); setStatus('就绪') }
    finally{ btn.disabled=false; btn.textContent='生成剧本' }
  }
  function genConfig(){ const s=state.settings; return {mode:s.imgMode,customUrl:s.customApiUrl,customKey:s.customApiKey} }
  async function genImageForPanel(panel){
    const prompt=panel.imagePrompt||document.getElementById('imagePrompt')?.value||'';
    const artStyle=document.getElementById('artStyle').value;
    const size=document.getElementById('imageSize').value;
    if(!prompt){toast('请填写画面描述','err');return}
    panel.imageUrl=''; Editor.render(); setStatus('生成画面中…');
    try{ const url=await AI.genImage(prompt,artStyle,size,genConfig()); panel.imageUrl=url; Editor.render(); renderSceneList(); markDirty(); setStatus('就绪') }
    catch(e){ toast('画面生成失败：'+e.message,'err'); setStatus('就绪'); Editor.render() }
  }
  async function genAllImages(){
    const sc=getCurrentScene(); if(!sc||sc.panels.length===0){toast('当前场景无分格','err');return}
    const artStyle=document.getElementById('artStyle').value; const size=document.getElementById('imageSize').value;
    const prog=document.getElementById('genProgress'); const fill=document.getElementById('genProgressFill'); const txt=document.getElementById('genProgressText');
    prog.hidden=false; let done=0; const total=sc.panels.filter(p=>p.imagePrompt).length;
    if(total===0){toast('请先在剧本中生成画面提示词','err');prog.hidden=true;return}
    for(const p of sc.panels){
      if(!p.imagePrompt)continue; done++; p.imageUrl=''; Editor.render();
      try{ const url=await AI.genImage(p.imagePrompt,artStyle,size,genConfig()); p.imageUrl=url }catch(e){console.error(e)}
      fill.style.width=(done/total*100)+'%'; txt.textContent=`生成中 ${done}/${total}`; Editor.render(); renderSceneList();
    }
    prog.hidden=true; toast('全部画面生成完成','ok'); setStatus('就绪'); markDirty();
  }

  /* ============ 上传 ============ */
  function triggerUpload(){ document.getElementById('fileInput').click() }
  function triggerUploadToPanel(panel){
    const inp=document.createElement('input'); inp.type='file'; inp.accept='image/*';
    inp.onchange=async()=>{ const f=inp.files[0]; if(!f)return; const r=await Uploader.handleFile(f); if(r.type==='image'){ panel.imageUrl=r.data; Editor.render(); markDirty(); toast('图片已插入','ok') } };
    inp.click();
  }
  async function handleUpload(files){
    setStatus('处理上传文件…');
    const results=await Uploader.handleFiles(files,(d,t,f)=>setStatus(`处理中 ${d}/${t}：${f.name}`));
    let imgCount=0, scriptLoaded=false;
    for(const r of results){
      if(r.type==='image'){ const sc=getCurrentScene()||addScene(); sc.panels.push({id:uid(),imageUrl:r.data,imagePrompt:'',bubbles:[]}); imgCount++ }
      else if(r.type==='text'){ const scenes=Uploader.parseScriptText(r.data); if(scenes.length){ scenes.forEach(s=>addScene(s)); scriptLoaded=true } else{ document.getElementById('storyInput').value=r.data.slice(0,500); toast('文本已填入故事框','ok') } }
    }
    renderAll(); setStatus('就绪');
    if(imgCount)toast(`已导入 ${imgCount} 张图片`,'ok');
    if(scriptLoaded)toast('已导入剧本','ok');
    if(results.length&&!imgCount&&!scriptLoaded)toast('文件已记录为素材','ok');
    markDirty();
  }

  /* ============ 导出 ============ */
  function openExport(){
    const modal=document.getElementById('exportModal'); modal.hidden=false;
    const preview=document.getElementById('exportPreview');
    preview.innerHTML='<div style="padding:20px;color:#9ca3af;text-align:center">生成预览中…</div>';
    setTimeout(async()=>{ try{ const thumb=await Exporter.makeThumb(); preview.innerHTML=`<img class="preview-thumb" src="${thumb}">` }catch(e){ preview.innerHTML='<div style="padding:20px;color:#9ca3af">预览生成失败</div>' } },100);
  }
  function closeExport(){ document.getElementById('exportModal').hidden=true }

  /* ============ Tab ============ */
  function switchTab(name){
    document.querySelectorAll('.tab-btn').forEach(b=>b.classList.toggle('active',b.dataset.tab===name));
    document.querySelectorAll('.tab-panel').forEach(p=>p.classList.toggle('active',p.id==='tab'+name.charAt(0).toUpperCase()+name.slice(1)));
  }

  /* ============ 设置 ============ */
  function syncSettingsFromUI(){
    const s=state.settings;
    s.imgMode=document.getElementById('imgMode').value; s.customApiUrl=document.getElementById('customApiUrl').value; s.customApiKey=document.getElementById('customApiKey').value;
    s.textMode=document.getElementById('textMode').value; s.customTextUrl=document.getElementById('customTextUrl').value; s.customTextModel=document.getElementById('customTextModel').value; s.customTextKey=document.getElementById('customTextKey').value;
    state.canvasWidth=+document.getElementById('canvasWidth').value; state.panelGap=+document.getElementById('panelGap').value; state.bgColor=document.getElementById('bgColor').value;
    markDirty();
  }
  function applySettingsToUI(){
    const s=state.settings;
    document.getElementById('imgMode').value=s.imgMode||'online'; document.getElementById('textMode').value=s.textMode||'local'; toggleCustomBoxes();
    document.getElementById('canvasWidth').value=state.canvasWidth||720; document.getElementById('panelGap').value=state.panelGap||12; document.getElementById('bgColor').value=state.bgColor||'#fff';
  }
  function toggleCustomBoxes(){
    document.getElementById('customApiBox').hidden=document.getElementById('imgMode').value!=='custom';
    document.getElementById('customTextApiBox').hidden=document.getElementById('textMode').value!=='custom';
  }

  function updateTitleBar(){ const el=document.getElementById('projectTitleBar'); if(el) el.textContent = projectTitle + (currentProjectId?'':'（未保存）') }
  function markDirty(){ dirty=true; scheduleAutoSave(); Collab.scheduleSend(state) }

  /* ============ 事件 ============ */
  function bindEvents(){
    // 导航
    document.querySelectorAll('[data-nav]').forEach(a=> a.onclick = ()=> navigate(a.dataset.nav));
    // 广场
    document.querySelectorAll('.sort-tab').forEach(b=> b.onclick=()=>{ document.querySelectorAll('.sort-tab').forEach(x=>x.classList.remove('active')); b.classList.add('active'); Views.renderGallery(b.dataset.sort) });
    document.getElementById('btnCreateWork').onclick = ()=>{ if(!Auth.isLoggedIn()){Auth.showAuthModal('login');return} newProject() };
    const heroCreate = document.getElementById('heroCreate');
    if(heroCreate) heroCreate.onclick = ()=>{ if(!Auth.isLoggedIn()){Auth.showAuthModal('login');return} newProject() };

    // 编辑器
    document.querySelectorAll('.mode-btn').forEach(b=>b.onclick=()=>setMode(b.dataset.mode));
    document.getElementById('btnAddScene').onclick=()=>addScene();
    document.getElementById('btnAIScript').onclick=()=>switchTab('ai');
    document.getElementById('btnGenScript').onclick=generateScript;
    document.getElementById('btnGenImage').onclick=()=>{ const sc=getCurrentScene(); if(!sc){toast('请先选择场景','err');return} const lastPanel=sc.panels[sc.panels.length-1]; if(!lastPanel){toast('当前场景无分格','err');return} const prompt=document.getElementById('imagePrompt').value; if(prompt)lastPanel.imagePrompt=prompt; genImageForPanel(lastPanel) };
    document.getElementById('btnGenAll').onclick=genAllImages;
    document.getElementById('sceneTitle').oninput=e=>{ projectTitle=e.target.value; updateTitleBar(); markDirty() };
    document.getElementById('btnNewProject').onclick=()=>newProject();
    document.getElementById('btnUpload').onclick=triggerUpload;
    document.getElementById('fileInput').onchange=e=>{ if(e.target.files.length)handleUpload(e.target.files); e.target.value='' };
    document.getElementById('btnSave').onclick=saveProject;
    document.getElementById('btnPublish').onclick=publishProject;
    document.getElementById('btnCollab').onclick=openCollabModal;
    document.getElementById('btnExport').onclick=openExport;
    document.getElementById('closeExport').onclick=closeExport;
    document.getElementById('exportLongImage').onclick=async()=>{setStatus('导出长图…');await Exporter.exportLongImage();setStatus('就绪');toast('长图已导出','ok')};
    document.getElementById('exportPdf').onclick=async()=>{setStatus('导出 PDF…');await Exporter.exportPDF();setStatus('就绪');toast('PDF 已导出','ok')};
    document.getElementById('exportJson').onclick=()=>{Exporter.exportJSON();toast('工程文件已导出','ok')};
    document.getElementById('copyShareLink').onclick=async()=>{const url=await Exporter.copyShareLink();toast(url?'链接已复制':'复制失败',url?'ok':'err')};

    document.querySelectorAll('.tab-btn').forEach(b=>b.onclick=()=>switchTab(b.dataset.tab));
    ['imgMode','textMode','customApiUrl','customApiKey','customTextUrl','customTextModel','customTextKey'].forEach(id=>{ const el=document.getElementById(id); if(el)el.onchange=()=>{syncSettingsFromUI();if(id==='imgMode'||id==='textMode')toggleCustomBoxes()} });
    ['canvasWidth','panelGap','bgColor'].forEach(id=>{ const el=document.getElementById(id); if(el)el.onchange=()=>{syncSettingsFromUI();Editor.render()} });

    window.addEventListener('keydown',e=>{ if((e.ctrlKey||e.metaKey)&&e.key==='s'){e.preventDefault();saveProject()} });
    window.addEventListener('hashchange', router);
    window.addEventListener('beforeunload',()=>{ Collab.disconnect() });
  }

  /* ============ 初始化 ============ */
  async function init(){
    bindEvents();
    applySettingsToUI();

    Auth.init((loggedIn, action)=>{
      if(action === 'openProjects'){ navigate('#/profile'); return }
      if(loggedIn){
        // 登录后停留在当前视图
      }else{
        Collab.disconnect(); currentProjectId = null; updateTitleBar();
      }
    });

    // 分享 hash 工程（兼容旧分享链接 #p=base64）
    const hashProject = Exporter.loadFromHash();
    if(hashProject && hashProject.scenes){
      state = { ...state, ...hashProject };
      currentProjectId = null; projectTitle = '分享作品'; isPublic = false;
      updateTitleBar(); updatePublishBtn();
      Editor.init(state, document.getElementById('canvasStage'));
      renderAll();
      showView('editor');
      Collab.disconnect();
      toast('已载入分享作品，可编辑后另存为自己的作品','ok');
      return;
    }
    updateTitleBar(); updatePublishBtn();
    Editor.init(state, document.getElementById('canvasStage'));
    renderAll();
    // 启动路由
    if(!location.hash) location.hash = '#/gallery';
    else router();
  }

  return {
    init, navigate, showView, applyRemoteState, saveProject, newProject, openProject, deleteProjectRemote, showGallery,
    publishProject, openCollabModal, openExport, closeExport, renderAll, renderProps, markDirty, toast, setStatus,
    addScene, deleteScene, selectScene, updateSceneTitle, addPanel, deletePanel, selectPanel,
    addBubble, updateBubble, deleteBubble, selectBubble, setMode, generateScript, genImageForPanel, genAllImages,
    handleUpload, state:getState, getCurrentScene, getCurrentProjectId, isLoggedIn
  };
})();

document.addEventListener('DOMContentLoaded', App.init);
