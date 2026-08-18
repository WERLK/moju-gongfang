/**
 * 导出模块：长图 / PDF / JSON / 分享链接
 * 依赖 html2canvas、jspdf（CDN 引入）
 */
const Exporter = (function(){

  /** 导出长图 PNG */
  async function exportLongImage(){
    const stage=document.getElementById('canvasStage');
    const canvas=await html2canvas(stage,{
      backgroundColor:App.state.bgColor||'#ffffff',
      scale:2,useCORS:true,allowTaint:true,logging:false
    });
    const link=document.createElement('a');
    link.download=`漫剧_${dateStr()}.png`;
    link.href=canvas.toDataURL('image/png');
    link.click();
    return canvas;
  }

  /** 导出 PDF（按场景多页） */
  async function exportPDF(){
    const {jsPDF}=window.jspdf;
    const scenes=App.state.scenes||[];
    if(scenes.length===0){App.toast('没有可导出的场景','err');return}
    const stage=document.getElementById('canvasStage');
    const pdf=new jsPDF('p','mm','a4');
    const pw=210,ph=297;
    let first=true;
    for(let i=0;i<scenes.length;i++){
      App.selectScene(scenes[i].id);
      await new Promise(r=>setTimeout(r,150));
      const canvas=await html2canvas(stage,{backgroundColor:App.state.bgColor||'#fff',scale:2,useCORS:true,allowTaint:true,logging:false});
      const img=canvas.toDataURL('image/jpeg',0.85);
      const iw=pw,ih=canvas.height*pw/canvas.width;
      if(!first)pdf.addPage();
      first=false;
      pdf.addImage(img,'JPEG',0,0,iw,Math.min(ih,ph));
    }
    pdf.save(`漫剧_${dateStr()}.pdf`);
  }

  /** 导出 JSON 工程 */
  function exportJSON(){
    const project={
      version:'1.0',
      type:'ai-comic-project',
      createdAt:new Date().toISOString(),
      state:App.state
    };
    const blob=new Blob([JSON.stringify(project,null,2)],{type:'application/json'});
    const link=document.createElement('a');
    link.download=`漫剧工程_${dateStr()}.json`;
    link.href=URL.createObjectURL(blob);
    link.click();
    URL.revokeObjectURL(link.href);
  }

  /** 复制分享链接（基于 localStorage） */
  async function copyShareLink(){
    const data=JSON.stringify(App.state);
    // 数据量小时用 hash 引用；这里直接 base64 内嵌
    try{
      const b64=btoa(unescape(encodeURIComponent(data)));
      const url=`${location.origin}${location.pathname}#p=${b64}`;
      if(navigator.clipboard&&navigator.clipboard.writeText){
        await navigator.clipboard.writeText(url);
      }else{
        const ta=document.createElement('textarea');ta.value=url;document.body.appendChild(ta);ta.select();document.execCommand('copy');ta.remove();
      }
      return url;
    }catch(e){
      return null;
    }
  }

  /** 从 URL hash 载入工程 */
  function loadFromHash(){
    const m=location.hash.match(/p=([^&]+)/);
    if(!m)return null;
    try{
      const json=decodeURIComponent(escape(atob(m[1])));
      return JSON.parse(json);
    }catch(e){return null}
  }

  /** 生成预览缩略图 */
  async function makeThumb(){
    const stage=document.getElementById('canvasStage');
    const canvas=await html2canvas(stage,{backgroundColor:App.state.bgColor||'#fff',scale:1,useCORS:true,allowTaint:true,logging:false});
    return canvas.toDataURL('image/png');
  }

  function dateStr(){
    const d=new Date();
    const p=n=>String(n).padStart(2,'0');
    return `${d.getFullYear()}${p(d.getMonth()+1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}`;
  }

  return {exportLongImage,exportPDF,exportJSON,copyShareLink,loadFromHash,makeThumb};
})();
