/**
 * 视图模块：广场列表、作品只读查看器、个人主页
 */
const Views = (function(){
  let gallerySort = 'new';

  function esc(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
  function avatarChar(name){return (name||'?').slice(0,1).toUpperCase()}
  function relTime(t){if(!t)return'';const d=new Date((t||'').replace(' ','T'));const n=Date.now()-d.getTime();if(isNaN(n))return t;if(n<6e4)return'刚刚';if(n<36e5)return Math.floor(n/6e4)+'分钟前';if(n<864e5)return Math.floor(n/36e5)+'小时前';if(n<2592e6)return Math.floor(n/864e5)+'天前';return t.slice(0,10)}

  /* ============ 广场 ============ */
  async function renderGallery(sort){
    gallerySort = sort || gallerySort;
    const grid = document.getElementById('galleryGrid');
    if(!grid) return;
    grid.innerHTML = '<div class="gallery-empty-state">加载中…</div>';
    try{
      const data = await Auth.apiFetch('/api/gallery?sort='+gallerySort+'&limit=60');
      const list = data.projects || [];
      if(list.length===0){
        grid.innerHTML = '<div class="gallery-empty-state"><div class="empty-icon">📝</div><p>广场还没有公开作品</p><p style="font-size:12px">成为第一个发布作品的人吧</p></div>';
        return;
      }
      grid.innerHTML = list.map(p=>`
        <div class="gallery-card" data-id="${p.id}">
          <div class="gallery-cover">${p.cover?`<img src="${p.cover}" style="width:100%;height:100%;object-fit:cover">`:'<div class="gallery-empty">无封面</div>'}</div>
          <div class="gallery-card-body">
            <div class="gallery-card-title">${esc(p.title)}</div>
            <div class="gallery-card-meta">
              <div class="gallery-card-author"><span class="gallery-card-avatar">${avatarChar(p.author)}</span><span>${esc(p.author)}</span></div>
              <div class="gallery-card-stats">
                <span class="${p.liked?'liked':''}">♥ ${p.likes||0}</span>
                <span class="${p.favorited?'favorited':''}">★ ${p.favorites||0}</span>
              </div>
            </div>
          </div>
        </div>`).join('');
      grid.querySelectorAll('.gallery-card').forEach(card=>{
        card.onclick = ()=> App.navigate('#/view/'+card.dataset.id);
      });
    }catch(e){
      grid.innerHTML = '<div class="gallery-empty-state">'+esc(e.message)+'</div>';
    }
  }

  /* ============ 作品只读查看器 ============ */
  async function renderViewer(projectId){
    // 在 gallery 视图区显示查看器
    const view = document.getElementById('view-gallery');
    if(!view) return;
    view.innerHTML = '<div style="padding:40px;text-align:center;color:#9ca3af">加载作品中…</div>';
    try{
      const p = await Auth.apiFetch('/api/gallery/'+projectId);
      view.innerHTML = `
        <div class="viewer-bar">
          <div>
            <h2>${esc(p.title)}</h2>
            <div class="author">作者：<a href="#/profile/${p.author_id}" style="color:var(--primary)">${esc(p.author)}</a> · ${relTime(p.updated_at)}</div>
          </div>
          <div class="viewer-actions">
            <button class="icon-stat like ${p.liked?'active':''}" id="vLike">♥ <span>${p.likes||0}</span></button>
            <button class="icon-stat fav ${p.favorited?'active':''}" id="vFav">★ <span>${p.favorites||0}</span></button>
            ${p.role==='owner'?'<button class="btn btn-outline btn-sm" id="vEdit">编辑</button>':''}
            <button class="btn btn-ghost btn-sm" id="vBack">返回广场</button>
          </div>
        </div>
        <div style="padding:20px 0">
          <div class="viewer-stage" id="viewerStage"></div>
        </div>`;
      // 渲染只读画布
      const stage = document.getElementById('viewerStage');
      renderReadonlyStage(stage, p.state);
      // 交互
      document.getElementById('vLike').onclick = async (e)=>{
        if(!Auth.isLoggedIn()){Auth.showAuthModal('login');return}
        try{ const r = await Auth.apiFetch('/api/projects/'+projectId+'/like',{method:'POST'}); 
          const b=e.currentTarget; b.classList.toggle('active',r.liked); b.querySelector('span').textContent=r.likes;
        }catch(err){App.toast(err.message,'err')}
      };
      document.getElementById('vFav').onclick = async (e)=>{
        if(!Auth.isLoggedIn()){Auth.showAuthModal('login');return}
        try{ const r = await Auth.apiFetch('/api/projects/'+projectId+'/favorite',{method:'POST'});
          const b=e.currentTarget; b.classList.toggle('active',r.favorited); b.querySelector('span').textContent=r.favorites;
        }catch(err){App.toast(err.message,'err')}
      };
      const editBtn = document.getElementById('vEdit');
      if(editBtn) editBtn.onclick = ()=> App.navigate('#/editor/'+projectId);
      document.getElementById('vBack').onclick = ()=> App.navigate('#/gallery');
    }catch(e){
      view.innerHTML = '<div class="gallery-empty-state">'+esc(e.message)+'<br><button class="btn btn-primary" onclick="location.hash=\'#/gallery\'">返回广场</button></div>';
    }
  }

  function renderReadonlyStage(stage, st){
    if(!st || !st.scenes || st.scenes.length===0){ stage.innerHTML='<div class="gallery-empty-state">该作品暂无内容</div>'; return }
    stage.style.width = (st.canvasWidth||720)+'px';
    stage.style.background = st.bgColor||'#fff';
    st.scenes.forEach(sc=>{
      (sc.panels||[]).forEach(panel=>{
        const frame=document.createElement('div');frame.className='panel-frame';
        if(st.mode==='grid')stage.classList.add('grid');else stage.classList.add('vertical');
        const img=document.createElement('img');img.className='panel-image';
        if(panel.imageUrl){img.src=panel.imageUrl}else{img.classList.add('empty');img.alt='无画面'}
        frame.appendChild(img);
        (panel.bubbles||[]).forEach(b=>{
          const el=document.createElement('div');
          el.className='bubble bubble-'+b.type;el.textContent=b.text||'';
          el.style.left=(b.x||0)+'px';el.style.top=(b.y||0)+'px';
          if(b.w)el.style.width=b.w+'px';if(b.fontSize)el.style.fontSize=b.fontSize+'px';if(b.color)el.style.color=b.color;
          el.style.pointerEvents='none';
          frame.appendChild(el);
        });
        stage.appendChild(frame);
      });
    });
  }

  /* ============ 个人主页 ============ */
  let profileTab = 'works';
  let currentProfileId = null;

  async function renderProfile(userId){
    currentProfileId = userId;
    // 自己的主页默认进"我的创作"管理，他人主页默认"公开作品"
    const c = document.getElementById('profileContainer');
    if(!c) return;
    c.innerHTML = '<div style="padding:40px;text-align:center;color:#9ca3af">加载中…</div>';
    try{
      // 未传 id：用当前登录用户
      let uid = userId;
      if(!uid && Auth.isLoggedIn()){ const me = Auth.getUser(); uid = me.id; }
      if(!uid){ c.innerHTML = '<div class="gallery-empty-state">未登录</div>'; return }
      const p = await Auth.apiFetch('/api/users/'+uid+'/profile');
      const u = p.user;
      profileTab = p.is_self ? 'creations' : 'works';
      c.innerHTML = `
        <div class="profile-header">
          <div class="profile-avatar">${avatarChar(u.username)}</div>
          <div class="profile-info">
            <h2>${esc(u.username)}</h2>
            <div class="meta">加入于 ${relTime(u.created_at)}</div>
            <div class="profile-stats">
              <div class="profile-stat"><div class="num">${p.works_count}</div><div class="label">作品</div></div>
              <div class="profile-stat"><div class="num">${p.likes_received}</div><div class="label">获赞</div></div>
              <div class="profile-stat"><div class="num">${p.followers}</div><div class="label">粉丝</div></div>
              <div class="profile-stat"><div class="num">${p.following}</div><div class="label">关注</div></div>
            </div>
          </div>
          <div class="profile-follow-btn">
            ${p.is_self ? '<button class="btn btn-outline" onclick="location.hash=\'#/editor\'">去创作</button>'
              : Auth.isLoggedIn() ? `<button class="btn ${p.is_following?'btn-outline':'btn-primary'}" id="followBtn">${p.is_following?'已关注':'+ 关注'}</button>`
              : '<button class="btn btn-primary" onclick="Auth.showAuthModal(\'login\')">登录后关注</button>'}
          </div>
        </div>
        <div class="profile-tabs">
          ${p.is_self?'<button class="profile-tab active" data-pt="creations">我的创作</button>':''}
          <button class="profile-tab ${p.is_self?'':'active'}" data-pt="works">公开作品</button>
          ${p.is_self?'<button class="profile-tab" data-pt="favorites">我的收藏</button>':''}
          ${p.is_self?'<button class="profile-tab" data-pt="collab">参与协作</button>':''}
        </div>
        <div class="profile-tab-content" id="profileTabContent"></div>`;
      c.querySelectorAll('.profile-tab').forEach(t=>t.onclick=()=>{profileTab=t.dataset.pt; c.querySelectorAll('.profile-tab').forEach(x=>x.classList.toggle('active',x===t)); renderProfileTab(uid,p.is_self)});
      const fb = document.getElementById('followBtn');
      if(fb) fb.onclick = async ()=>{
        try{ const r = await Auth.apiFetch('/api/users/'+uid+'/follow',{method:'POST'});
          fb.textContent = r.following?'已关注':'+ 关注';
          fb.className = 'btn '+(r.following?'btn-outline':'btn-primary');
        }catch(e){App.toast(e.message,'err')}
      };
      renderProfileTab(uid, p.is_self);
    }catch(e){ c.innerHTML = '<div class="gallery-empty-state">'+esc(e.message)+'</div>' }
  }

  async function renderProfileTab(uid, isSelf){
    const box = document.getElementById('profileTabContent');
    if(!box) return;
    box.innerHTML = '<div style="text-align:center;color:#9ca3af;padding:30px">加载中…</div>';
    try{
      // 我的创作：本人全部作品（含草稿），带编辑/删除/发布操作
      if(profileTab==='creations'){
        const r = await Auth.apiFetch('/api/projects');
        const list = r.projects || [];
        if(list.length===0){
          box.innerHTML = '<div class="gallery-empty-state"><div class="empty-icon">✍</div><p>还没有作品</p><button class="btn btn-primary" onclick="location.hash=\'#/editor\'">开始创作</button></div>';
          return;
        }
        box.innerHTML = '<div class="gallery-grid">'+list.map(p=>`
          <div class="gallery-card my-work-card" data-id="${p.id}">
            <div class="gallery-cover">${p.cover?`<img src="${p.cover}" style="width:100%;height:100%;object-fit:cover">`:'<div class="gallery-empty">无封面</div>'}${p.is_public?'<span class="badge-published">已发布</span>':'<span class="badge-draft">草稿</span>'}</div>
            <div class="gallery-card-body">
              <div class="gallery-card-title">${esc(p.title)}</div>
              <div class="gallery-card-meta"><span>${relTime(p.updated_at)}</span></div>
              <div class="my-work-actions">
                <button class="btn btn-ghost btn-sm" data-act="edit">编辑</button>
                <button class="btn btn-ghost btn-sm" data-act="publish">${p.is_public?'取消发布':'发布'}</button>
                <button class="btn btn-ghost btn-sm" data-act="delete">删除</button>
              </div>
            </div>
          </div>`).join('')+'</div>';
        box.querySelectorAll('.my-work-card').forEach(card=>{
          const pid = card.dataset.id;
          card.querySelectorAll('[data-act]').forEach(btn=>{
            btn.onclick = async (e)=>{
              e.stopPropagation();
              const act = btn.dataset.act;
              if(act==='edit'){ App.navigate('#/editor/'+pid); }
              else if(act==='publish'){
                try{
                  const cur = list.find(x=>x.id===pid);
                  const r2 = await Auth.apiFetch('/api/projects/'+pid+'/publish',{method:'POST',body:{is_public:!cur.is_public}});
                  App.toast(r2.is_public?'已发布到广场':'已取消发布','ok');
                  renderProfileTab(uid,isSelf);
                }catch(err){App.toast(err.message,'err')}
              }else if(act==='delete'){
                if(!confirm('确认删除该作品？此操作不可恢复。')) return;
                try{
                  await Auth.apiFetch('/api/projects/'+pid,{method:'DELETE'});
                  App.toast('作品已删除','ok');
                  renderProfileTab(uid,isSelf);
                }catch(err){App.toast(err.message,'err')}
              }
            };
          });
          // 点击卡片空白处也可编辑
          card.querySelector('.gallery-cover').onclick = ()=> App.navigate('#/editor/'+pid);
          card.querySelector('.gallery-card-title').onclick = ()=> App.navigate('#/editor/'+pid);
        });
        return;
      }
      let items = [];
      if(profileTab==='works'){
        const p = await Auth.apiFetch('/api/users/'+uid+'/profile');
        items = p.works.map(w=>({...w,author:p.user.username,_pid:w.id}));
      }else if(profileTab==='favorites'){
        const r = await Auth.apiFetch('/api/me/favorites');
        items = r.favorites.map(f=>({...f,_pid:f.id}));
      }else if(profileTab==='collab'){
        const r = await Auth.apiFetch('/api/me/collab');
        items = r.collab.map(c=>({...c,_pid:c.id}));
      }
      if(items.length===0){ box.innerHTML = '<div class="gallery-empty-state">暂无内容</div>'; return }
      box.innerHTML = '<div class="gallery-grid">'+items.map(w=>`
        <div class="gallery-card" data-id="${w._pid}">
          <div class="gallery-cover">${w.cover?`<img src="${w.cover}" style="width:100%;height:100%;object-fit:cover">`:'<div class="gallery-empty">无封面</div>'}</div>
          <div class="gallery-card-body">
            <div class="gallery-card-title">${esc(w.title)}</div>
            <div class="gallery-card-meta"><div class="gallery-card-author"><span class="gallery-card-avatar">${avatarChar(w.author)}</span><span>${esc(w.author)}</span></div><span>${relTime(w.updated_at)}</span></div>
          </div>
        </div>`).join('')+'</div>';
      box.querySelectorAll('.gallery-card').forEach(card=>card.onclick=()=>App.navigate('#/view/'+card.dataset.id));
    }catch(e){ box.innerHTML = '<div class="gallery-empty-state">'+esc(e.message)+'</div>' }
  }

  return { renderGallery, renderViewer, renderProfile, getGallerySort:()=>gallerySort };
})();
