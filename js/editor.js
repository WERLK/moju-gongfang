/**
 * 编辑器模块：画布渲染、分格、气泡的创建/拖拽/编辑
 * 依赖 App.state（只读引用 + App 方法调用）
 */
const Editor = (function(){
  let state=null;
  let stageEl=null;
  let currentTool='select';
  let selectedBubbleId=null;
  let selectedPanelId=null;
  let drag=null; // {type:'move'|'resize', el, startX, startY, origX, origY, origW, origH}

  function init(st,el){
    state=st;
    stageEl=el;
    bindStageEvents();
    bindToolEvents();
  }

  function setTool(t){currentTool=t;document.querySelectorAll('.tool-btn').forEach(b=>b.classList.toggle('active',b.dataset.tool===t))}

  /* ============ 渲染 ============ */
  function render(){
    if(!stageEl)return;
    const scene=App.getCurrentScene();
    stageEl.className='canvas-stage '+(state.mode||'vertical');
    stageEl.innerHTML='';
    stageEl.style.width=(state.canvasWidth||720)+'px';
    stageEl.style.background=state.bgColor||'#fff';

    const hint=document.getElementById('emptyHint');
    if(!scene||!scene.panels||scene.panels.length===0){
      stageEl.appendChild(hint||(function(){
        const d=document.createElement('div');d.className='empty-hint';d.id='emptyHint';
        d.innerHTML='<div class="empty-icon">墨</div><p>当前没有内容</p><p class="empty-tip">点击左下"AI 生成分镜"或工具栏"分格"开始</p>';
        return d;
      })());
      return;
    }

    scene.panels.forEach(panel=>stageEl.appendChild(renderPanel(panel,scene)));

    // 多格模式：添加新格区域
    if(state.mode==='grid'){
      const add=document.createElement('div');
      add.className='panel-add-zone';
      add.textContent='+ 添加分格';
      add.onclick=()=>App.addPanel();
      stageEl.appendChild(add);
    }
  }

  function renderPanel(panel,scene){
    const frame=document.createElement('div');
    frame.className='panel-frame';
    frame.dataset.panelId=panel.id;

    const img=document.createElement('img');
    img.className='panel-image';
    if(panel.imageUrl){
      img.classList.add('loading');
      img.src=panel.imageUrl;
      img.onload=()=>img.classList.remove('loading');
      img.onerror=()=>{img.classList.remove('loading');img.classList.add('empty');img.alt='加载失败'};
    }else{
      img.classList.add('empty');
      img.alt='未生成画面';
    }
    img.onclick=()=>{selectedPanelId=panel.id;App.selectPanel(panel.id)};
    frame.appendChild(img);

    // 气泡
    (panel.bubbles||[]).forEach(b=>{
      const el=renderBubble(b,panel);
      frame.appendChild(el);
    });

    return frame;
  }

  function renderBubble(b,panel){
    const el=document.createElement('div');
    el.className=`bubble bubble-${b.type} ${selectedBubbleId===b.id?'selected':''}`;
    el.dataset.bubbleId=b.id;
    el.textContent=b.text||'';
    el.style.left=(b.x||0)+'px';
    el.style.top=(b.y||0)+'px';
    if(b.w)el.style.width=b.w+'px';
    if(b.h)el.style.minHeight=b.h+'px';
    if(b.fontSize)el.style.fontSize=b.fontSize+'px';
    if(b.color)el.style.color=b.color;

    el.onmousedown=e=>onBubbleDown(e,b,panel,el);
    el.ondblclick=()=>editBubbleText(b,el);
    return el;
  }

  /* ============ 拖拽 ============ */
  function onBubbleDown(e,b,panel,el){
    e.stopPropagation();
    if(currentTool!=='select'){
      // 当前是绘制工具，不进入拖拽
      return;
    }
    selectedBubbleId=b.id;
    selectedPanelId=panel.id;
    App.selectPanel(panel.id);
    App.selectBubble(b.id);
    render();
    const target=e.target;
    const isResize=target.classList&&target.classList.contains('resize-handle');
    drag={
      type:isResize?'resize':'move',
      startX:e.clientX,startY:e.clientY,
      origX:b.x||0,origY:b.y||0,origW:b.w||0,origH:b.h||0,
      bubble:b,panel
    };
    if(isResize){
      const handle=document.createElement('div');
      handle.className='resize-handle';
      el.appendChild(handle);
    }
    document.addEventListener('mousemove',onMove);
    document.addEventListener('mouseup',onUp);
  }

  function onMove(e){
    if(!drag)return;
    const dx=e.clientX-drag.startX;
    const dy=e.clientY-drag.startY;
    if(drag.type==='move'){
      drag.bubble.x=Math.max(0,drag.origX+dx);
      drag.bubble.y=Math.max(0,drag.origY+dy);
    }else{
      drag.bubble.w=Math.max(40,drag.origW+dx);
      drag.bubble.h=Math.max(24,drag.origH+dy);
    }
    App.markDirty();
    render();
  }

  function onUp(){
    drag=null;
    document.removeEventListener('mousemove',onMove);
    document.removeEventListener('mouseup',onUp);
  }

  /* ============ 文本编辑 ============ */
  function editBubbleText(b,el){
    el.setAttribute('contenteditable','true');
    el.focus();
    const range=document.createRange();
    range.selectNodeContents(el);
    const sel=window.getSelection();
    sel.removeAllRanges();sel.addRange(range);
    const finish=()=>{
      el.removeAttribute('contenteditable');
      b.text=el.textContent;
      App.markDirty();
      el.removeEventListener('blur',finish);
    };
    el.addEventListener('blur',finish);
  }

  /* ============ 画布点击：创建气泡/分格 ============ */
  function bindStageEvents(){
    if(!stageEl)return;
    stageEl.addEventListener('click',e=>{
      if(currentTool==='panel'){
        App.addPanel();
        return;
      }
      if(['speech','narration','sfx'].includes(currentTool)){
        const frame=e.target.closest('.panel-frame');
        if(!frame)return;
        const panel=App.getCurrentScene().panels.find(p=>p.id===frame.dataset.panelId);
        const rect=frame.getBoundingClientRect();
        const x=Math.max(0,e.clientX-rect.left-50);
        const y=Math.max(0,e.clientY-rect.top-12);
        App.addBubble(panel.id,currentTool,x,y);
        setTool('select');
      }
    });
  }

  function bindToolEvents(){
    document.querySelectorAll('.tool-btn').forEach(btn=>{
      btn.onclick=()=>setTool(btn.dataset.tool);
    });
  }

  function selectBubble(id){selectedBubbleId=id;render()}
  function clearSelection(){selectedBubbleId=null;selectedPanelId=null;render()}

  return {init,render,setTool,selectBubble,clearSelection};
})();
