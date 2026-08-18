/**
 * AI 模块：剧本生成 + 图像生成
 * - 在线图像 API：https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image
 * - 本地剧本引擎：基于故事梗概的智能分镜模板
 * - 自定义 LLM / 图像 API 支持
 */
const AI = (function(){

  const ONLINE_IMG_API = 'https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image';

  /* ============ 通用工具 ============ */
  function hashStr(s){let h=0;for(let i=0;i<s.length;i++){h=(h*31+s.charCodeAt(i))|0}return Math.abs(h)}
  function pick(arr,seed){return arr[seed%arr.length]}
  function rand(arr){return arr[Math.floor(Math.random()*arr.length)]}

  /* ============ 剧本生成（本地智能模板）============ */
  // 中文人名/角色抽取启发式
  function extractCharacters(story){
    const chars=new Set();
    // 匹配常见中文姓名结构：2-3字 + 称谓
    const patterns=[
      /([一-龥]{2,3})(?:说|道|问|笑|哭|喊|答|想|看|走|跑|叫|怒|惊)/g,
      /(?:少女|少年|女孩|男孩|男人|女人|老人|老师|学生|骑士|公主|王子|将军|博士)([一-龥]{2,3})/g,
    ];
    patterns.forEach(p=>{
      let m;while((m=p.exec(story))){if(m[1]&&m[1].length<=3)chars.add(m[1])}
    });
    // 直接匹配常见角色词
    const roleWords=['少女','少年','主角','女孩','男孩','男人','女人','老人','老师','学生','骑士','公主','王子','将军','博士','猫','狗','机器人','精灵','巫师','剑客'];
    roleWords.forEach(w=>{if(story.includes(w))chars.add(w)});
    // 兜底：无角色时给默认名
    if(chars.size===0)chars.add('主角');
    return Array.from(chars).slice(0,5);
  }

  // 从故事切分为叙事节拍
  function splitBeats(story,count){
    const sentences=story.replace(/[。！？\n；]/g,'|').split('|').map(s=>s.trim()).filter(s=>s.length>2);
    const beats=[];
    if(sentences.length===0){
      beats.push({text:story.slice(0,40),hint:story});
    }else{
      // 节拍结构：开场 / 发展 / 冲突 / 高潮 / 收束
      const structure=[
        {key:'opening',label:'开场',desc:'引入背景与角色，建立氛围'},
        {key:'develop',label:'发展',desc:'推进情节，展现角色互动'},
        {key:'conflict',label:'冲突',desc:'矛盾爆发或转折出现'},
        {key:'climax',label:'高潮',desc:'情绪与画面最强点'},
        {key:'resolve',label:'收束',desc:'结果或悬念收尾'},
      ];
      const per=Math.max(1,Math.ceil(sentences.length/Math.min(count,5)));
      for(let i=0;i<sentences.length;i+=per){
        beats.push({text:sentences.slice(i,i+per).join('。'),hint:sentences[i]});
      }
    }
    // 补足到 count
    while(beats.length<count){
      const last=beats[beats.length-1];
      beats.push({text:last.hint+'（延续）',hint:last.hint});
    }
    return beats.slice(0,count);
  }

  // 风格化的场景描述词库
  const STYLE_LIB={
    '热血':['拳风激荡','烈焰升腾','碎石飞溅','目光如电','肌肉紧绷'],
    '校园':['阳光斑驳','樱花飘落','课桌错落','走廊空旷','制服飘扬'],
    '悬疑':['阴影低垂','雾气弥漫','灯光摇曳','脚步回响','雨幕昏黄'],
    '奇幻':['灵光环绕','云雾翻涌','古树参天','符文闪烁','星河倾泻'],
    '日常':['暖阳倾洒','街市喧嚣','咖啡氤氲','窗帘轻摆','生活气息'],
    '科幻':['霓虹闪烁','金属冷光','全息投影','雨夜都市','机甲剪影'],
  };
  const STYLE_WORD={
    '热血':'热血战斗','校园':'青春校园','悬疑':'悬疑暗调','奇幻':'东方奇幻','日常':'温馨日常','科幻':'未来科幻'
  };
  const ART_WORD={
    '日系动漫':'anime style, clean line, vibrant color',
    '国风彩绘':'chinese ink wash painting, traditional oriental',
    '黑白漫画':'black and white manga, screentone, high contrast',
    '水彩治愈':'soft watercolor, pastel, gentle',
    '赛博朋克':'cyberpunk, neon, dark futuristic',
    '像素风':'pixel art, 16-bit retro game',
  };

  // 单场景生成
  function buildScene(beat,style,chars,idx,total,artStyle){
    const seed=hashStr(beat.text+idx);
    const charNow=pick(chars,seed)||'主角';
    const styleWords=STYLE_LIB[style]||STYLE_LIB['日常'];
    const sw=STYLE_WORD[style]||'温馨日常';
    const aw=ART_WORD[artStyle]||ART_WORD['日系动漫'];

    // 对白模板
    const dialogTemplates=[
      `${charNow}：「${beat.hint.slice(0,14)}……」`,
      `${charNow}：「这事，没那么简单。」`,
      `${charNow}：「你来了。」`,
      `${charNow}：「我不会输的。」`,
      `${charNow}：「原来如此……」`,
    ];
    const narrationTemplates=[
      `第${idx+1}格 · ${beat.text.slice(0,30)}`,
      `时间仿佛停滞，${beat.hint.slice(0,16)}。`,
      `空气中弥漫着${pick(['紧张','温柔','肃杀','期待'],seed)}的气息。`,
    ];

    // 画面提示词（给图像生成用）
    const imagePrompt=`${beat.text.slice(0,50)}，${charNow}，${rand(styleWords)}，${sw}场景，${aw}，high quality, detailed, cinematic composition`;

    return {
      title:`第${idx+1}格`,
      description:beat.text.slice(0,60),
      imagePrompt,
      bubbles:[
        {type:'narration',text:narrationTemplates[idx%narrationTemplates.length]||narrationTemplates[0],x:20,y:20,w:240,h:36},
        {type:'speech',text:dialogTemplates[idx%dialogTemplates.length]||dialogTemplates[0],x:80,y:200,w:200,h:50},
      ].slice(0, idx===0?2: (idx%2===0?2:1)),
    };
  }

  /**
   * 生成分镜剧本
   * @param {string} story 故事梗概
   * @param {string} style 风格
   * @param {number} count 格数
   * @param {object} cfg {mode,customUrl,customModel,customKey}
   */
  async function genScript(story,style,count,cfg={}){
    if(!story||!story.trim())throw new Error('请输入故事梗概');
    if(cfg.mode==='custom'&&cfg.customUrl){
      return await genScriptByLLM(story,style,count,cfg);
    }
    // 本地智能生成
    const chars=extractCharacters(story);
    const beats=splitBeats(story,count);
    const scenes=beats.map((b,i)=>buildScene(b,style,chars,i,count,style));
    // 模拟思考延迟，提升真实感
    await new Promise(r=>setTimeout(r,600));
    return {scenes,characters:chars};
  }

  // 自定义 LLM 调用
  async function genScriptByLLM(story,style,count,cfg){
    const sys=`你是专业漫画编剧。根据用户故事生成分镜剧本，输出JSON：{"scenes":[{"title","description","imagePrompt","bubbles":[{"type":"speech|narration|sfx","text","x","y","w","h"}]}],"characters":[]}`;
    const user=`故事：${story}\n风格：${STYLE_WORD[style]||style}\n格数：${count}\n请生成。`;
    const res=await fetch(cfg.customUrl,{
      method:'POST',
      headers:{'Content-Type':'application/json','Authorization':`Bearer ${cfg.customKey}`},
      body:JSON.stringify({
        model:cfg.customModel||'gpt-4o-mini',
        messages:[{role:'system',content:sys},{role:'user',content:user}],
        temperature:0.8,
      })
    });
    if(!res.ok)throw new Error('LLM 请求失败：'+res.status);
    const data=await res.json();
    const content=data.choices?.[0]?.message?.content||'{}';
    const m=content.match(/\{[\s\S]*\}/);
    return m?JSON.parse(m[0]):{scenes:[],characters:[]};
  }

  /**
   * 生成图像
   * @param {string} prompt 画面描述
   * @param {string} artStyle 画风
   * @param {string} size 尺寸 portrait_16_9 等
   * @param {object} cfg {mode,customUrl,customKey}
   * @returns {Promise<string>} image data URL or URL
   */
  async function genImage(prompt,artStyle,size,cfg={}){
    const fullPrompt=buildImgPrompt(prompt,artStyle);
    if(cfg.mode==='custom'&&cfg.customUrl){
      return await genImageByCustom(fullPrompt,size,cfg);
    }
    // 在线 API：直接返回 URL，img 标签加载
    const url=`${ONLINE_IMG_API}?prompt=${encodeURIComponent(fullPrompt)}&image_size=${size}`;
    return url;
  }

  function buildImgPrompt(prompt,artStyle){
    const aw=ART_WORD[artStyle]||'';
    return `${prompt}，${aw}，highly detailed, cinematic, masterpiece`;
  }

  async function genImageByCustom(prompt,size,cfg){
    const res=await fetch(cfg.customUrl,{
      method:'POST',
      headers:{'Content-Type':'application/json','Authorization':`Bearer ${cfg.customKey}`},
      body:JSON.stringify({prompt,size})
    });
    if(!res.ok)throw new Error('图像 API 请求失败：'+res.status);
    const data=await res.json();
    return data.url||data.image||data.data?.[0]?.url||'';
  }

  return {genScript,genImage,extractCharacters,buildImgPrompt};
})();
