/**
 * 上传模块：支持全格式文件
 * - 图片：作为分格画面
 * - 文本(txt/md)：作为剧本或分镜描述
 * - JSON：载入工程
 * - 其他格式：记录为素材引用
 */
const Uploader = (function(){

  const IMG_EXTS=['png','jpg','jpeg','gif','webp','bmp','svg'];
  const TEXT_EXTS=['txt','md','text','markdown'];
  const JSON_EXTS=['json'];

  function getExt(name){return (name.split('.').pop()||'').toLowerCase()}

  function readAsDataURL(file){
    return new Promise((res,rej)=>{
      const r=new FileReader();
      r.onload=()=>res(r.result);
      r.onerror=rej;
      r.readAsDataURL(file);
    });
  }
  function readAsText(file){
    return new Promise((res,rej)=>{
      const r=new FileReader();
      r.onload=()=>res(r.result);
      r.onerror=rej;
      r.readAsText(file);
    });
  }

  /**
   * 处理单个文件，返回结构化结果
   * {type:'image'|'text'|'project'|'asset', data, name, ext}
   */
  async function handleFile(file){
    const ext=getExt(file.name);
    if(IMG_EXTS.includes(ext)){
      const data=await readAsDataURL(file);
      return {type:'image',data,name:file.name,ext};
    }
    if(JSON_EXTS.includes(ext)){
      const text=await readAsText(file);
      try{
        const obj=JSON.parse(text);
        return {type:'project',data:obj,name:file.name,ext};
      }catch(e){
        return {type:'text',data:text,name:file.name,ext};
      }
    }
    if(TEXT_EXTS.includes(ext)){
      const text=await readAsText(file);
      return {type:'text',data:text,name:file.name,ext};
    }
    // 其他格式（音频/视频/文档等）记录引用
    return {type:'asset',data:null,name:file.name,ext,size:file.size,fileType:file.type};
  }

  /**
   * 批量处理文件
   * @param {FileList} files
   * @param {function} onProgress(done,total,file)
   */
  async function handleFiles(files,onProgress){
    const arr=Array.from(files);
    const results=[];
    for(let i=0;i<arr.length;i++){
      try{
        const r=await handleFile(arr[i]);
        results.push(r);
        if(onProgress)onProgress(i+1,arr.length,arr[i]);
      }catch(e){
        console.error('文件处理失败',arr[i].name,e);
      }
    }
    return results;
  }

  /**
   * 将文本剧本解析为场景数组
   * 支持简单格式：每行一格，"角色：对白" 形式
   */
  function parseScriptText(text){
    const lines=text.split(/\r?\n/).map(l=>l.trim()).filter(Boolean);
    const scenes=[];
    let cur=null;
    for(const line of lines){
      // 分隔符：--- 或 ## 表示新场景
      if(/^#{1,3}\s|^-{3,}$/.test(line)){
        if(cur)scenes.push(cur);
        cur={title:line.replace(/^#{1,3}\s*|^-*$/g,'').trim()||`场景${scenes.length+1}`,bubbles:[]};
        continue;
      }
      if(!cur)cur={title:`场景${scenes.length+1}`,bubbles:[]};
      // 角色：对白
      const m=line.match(/^(.{1,6})[：:](.+)$/);
      if(m){
        cur.bubbles.push({type:'speech',text:`${m[1]}：${m[2]}`,x:60,y:60,w:200,h:50});
      }else{
        cur.bubbles.push({type:'narration',text:line,x:20,y:20,w:240,h:36});
      }
    }
    if(cur)scenes.push(cur);
    return scenes;
  }

  return {handleFile,handleFiles,parseScriptText,getExt,IMG_EXTS,TEXT_EXTS};
})();
