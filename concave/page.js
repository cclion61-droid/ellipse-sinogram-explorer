(function(){
  'use strict';
  const G=TwoBodyGeometry,C=ConcaveGeometry,P=LPhantom,$=id=>document.getElementById(id);
  const NS='http://www.w3.org/2000/svg', colors=['#207c96','#8150a1'];
  let artifact=null,selected=null,step=4,worker=null,epoch=0,downloadUrl=null;
  const cache=new Map();
  const statusNames={compatible:'未發現數值矛盾',contradiction:'出現弦長／包含關係矛盾',unresolved:'無法形成兩個內包絡',degenerate:'切出退化區域','boundary-ray':'切線重合量測射線：略過','numerical-error':'數值運算失敗'};
  const lessons=[
    ['01 總資料','先只留下總 sinogram','灰色 L 型只用來製造與評估資料。量測只知道每條線穿過物體的總長度，不知道兩片分別貢獻多少。','g = 穿過整個 L 型的總長度'],
    ['02 猜切法','切線可以穿過物體','L 型連在一起，沒有兩個分離正值區塊可用。先用總投影端點得到外框，再試切線，把外框分成兩個候選凸片區域。','候選切線：x cos φ + y sin φ = s'],
    ['03 建內框','其他片最多能給多少？','外框在一條射線上能提供的最大長度已知。從總長度扣掉另一片最多能提供的長度，得到本片至少必須存在的長度，再收集必存線段形成內框。','本片下界 Lᵢ = max(0, g − 另一片外弦長)'],
    ['04 夾住形狀','用內框反過來縮外框','有了另一片的內框，就知道它至少貢獻多少。本片剩餘長度有了上限，再利用凸性裁去不可能的角落。可拖動輪數查看實際更新。','本片上界 Uᵢ = g − 另一片內弦長'],
    ['05 核對結果','重新投影，再檢查真值','在未發現矛盾的候選中，選中點輸出的總 sinogram 誤差最小者。這項選擇完全不用真值；真值只在最後檢查 IoU、切後凸性與包含關係。','輸出 = 兩個內外包絡的 Minkowski 中點之聯集']
  ];
  function svg(tag,attrs={},parent){
    const e=document.createElementNS(NS,tag);Object.entries(attrs).forEach(([k,v])=>e.setAttribute(k,v));if(parent)parent.appendChild(e);return e;
  }
  function text(parent,x,y,value,attrs={}){const e=svg('text',{x,y,...attrs},parent);e.textContent=value;return e;}
  const format=x=>Number.isFinite(x)?x.toFixed(5):'—';
  const percent=x=>Number.isFinite(x)?(x>0&&x<1e-5?(100*x).toExponential(2):(100*x).toFixed(4))+'%':'—';
  const phaseName=p=>p==='coarse'?'固定粗網格':p==='subset-recheck'?'子集起點：全資料重驗':p==='subset-seeds'?'子集搜尋':p==='complete'?'完成':p.replace('refine-','細化第 ')+' 層';
  function drawObjects(){
    const el=$('objects');el.replaceChildren();
    const px=p=>[250+p[0]*105,224-p[1]*105];
    for(const z of [-1.5,-1,-.5,0,.5,1,1.5]){
      const [x,y]=px([z,z]);svg('line',{x1:x,y1:35,x2:x,y2:413,stroke:'#e8edf0'},el);svg('line',{x1:61,y1:y,x2:439,y2:y,stroke:'#e8edf0'},el);
      text(el,x,432,z,{'text-anchor':'middle',fill:'#6b7780','font-size':10});
    }
    text(el,446,228,'x');text(el,251,26,'y');
    function polygon(p,stroke,fill='none',dash=''){
      if(!p?.length)return;
      svg('polygon',{points:p.map(v=>px(v).join(',')).join(' '),fill,stroke,'stroke-width':2,'stroke-dasharray':dash,'stroke-linejoin':'round'},el);
    }
    const result=artifact.result, round=Math.min(step===2?0:Number($('round').value),Math.max(0,(selected?.states?.length||1)-1));
    const state=selected?.states?.[round];
    if(step>0)polygon(result.global,'#a9b4bd','#f0f3f5','4 5');
    if(selected&&step>0){
      const polygons=step===1?selected.initialOuter:state?.outer||selected.outer||selected.initialOuter;
      polygons?.forEach((p,i)=>polygon(p,colors[i],colors[i]+'0d'));
      if(step>=2)(state?.inner||selected.inner)?.forEach((p,i)=>polygon(p,colors[i],colors[i]+'35'));
      if(step===4)state?.output?.forEach((p,i)=>polygon(p,colors[i],colors[i]+'4d'));
      const n=G.direction(selected.phi),t=[-n[1],n[0]],base=n.map(v=>v*selected.offset);
      const a=px([base[0]-2.5*t[0],base[1]-2.5*t[1]]),b=px([base[0]+2.5*t[0],base[1]+2.5*t[1]]);
      const clip=svg('clipPath',{id:'plotClip'},svg('defs',{},el));svg('rect',{x:61,y:35,width:378,height:378},clip);
      svg('line',{x1:a[0],y1:a[1],x2:b[0],y2:b[1],stroke:'#e2773c','stroke-width':2,'stroke-dasharray':'6 4','clip-path':'url(#plotClip)'},el);
    }
    if($('truth').checked)polygon(artifact.truth.outline,'#3b454d','none','4 4');
    $('roundValue').textContent=String(state?.round??0);
    $('cutLabel').textContent=selected?'φ = '+(selected.phi*180/Math.PI).toFixed(2)+'° · s = '+selected.offset.toFixed(4):'尚無可用切法';
    $('geometryNote').textContent=step===0?'灰色真值只供製造資料與最後評估，重建引擎讀不到它。':step===1?'此步顯示候選切線與兩個初始外包絡；尚未畫內框。':state?'本輪總投影誤差 '+percent(state.residual)+'；內外距離半值 '+format(state.bound)+'。目前選切法尚無真體凸性保證，此數值不是已成立的誤差界。':'本候選沒有完成包絡更新；只顯示可取得的狀態。';
  }
  function drawData(){
    const data=artifact.data,el=$('sinogram');el.replaceChildren();
    const peak=Math.max(...data.total.flat()),j=Number($('angle').value)||0;
    data.total.forEach((row,a)=>row.forEach((v,k)=>{
      const intensity=v/peak;
      svg('rect',{x:45+a*365/data.angles.length,y:15+(row.length-1-k)*180/row.length,width:365/data.angles.length+.2,height:180/row.length+.2,fill:'hsl('+(216-intensity*45)+', '+(15+intensity*50)+'%, '+(96-intensity*65)+'%)'},el);
    }));
    svg('rect',{x:45+j*365/data.angles.length,y:15,width:365/data.angles.length,height:180,fill:'none',stroke:'#d3763f','stroke-width':2},el);
    text(el,19,23,'s');text(el,18,47,'+');text(el,18,189,'−');text(el,45,216,'0°');text(el,367,216,'180°');text(el,197,235,'量測法向量角度');
    const profile=$('profile');profile.replaceChildren();
    const pred=step>=2&&selected?.states?.length?C.forward(selected.states[Math.min(step===2?0:Number($('round').value),selected.states.length-1)].output,data)[j]:null;
    const X=k=>42+k*370/(data.detector.length-1),Y=v=>165-v/peak*140;
    svg('line',{x1:42,y1:165,x2:412,y2:165,stroke:'#aebbc4'},profile);
    function line(row,color,width){svg('polyline',{points:row.map((v,k)=>[X(k),Y(v)].join(',')).join(' '),fill:'none',stroke:color,'stroke-width':width},profile);}
    line(data.total[j],'#647781',2.5);if(pred)line(pred,'#8150a1',1.5);
    text(profile,8,25,'g');text(profile,40,188,data.detector[0].toFixed(2));text(profile,374,188,data.detector.at(-1).toFixed(2));text(profile,216,201,'s');
  }
  function drawSearch(){
    const el=$('searchMap');el.replaceChildren();
    const X=p=>45+p/Math.PI*425,Y=s=>120-s/1.8*93;
    for(const deg of [0,45,90,135,180]){const x=X(deg*Math.PI/180);svg('line',{x1:x,y1:20,x2:x,y2:220,stroke:'#e6ecef'},el);text(el,x,240,deg+'°',{'text-anchor':'middle'});}
    for(const s of [-1.5,0,1.5]){svg('line',{x1:45,y1:Y(s),x2:470,y2:Y(s),stroke:'#e6ecef'},el);text(el,8,Y(s)+4,s.toFixed(1));}
    artifact.result.candidates.forEach(c=>{
      const color=c.status==='compatible'?'#087d75':c.status==='contradiction'?'#c86b62':'#9aabb4';
      const e=svg('circle',{cx:X(c.phi),cy:Y(c.offset),r:selected?.id===c.id?6:3.5,fill:color,opacity:.8,stroke:selected?.id===c.id?'#142f42':'none','stroke-width':2,style:'cursor:pointer'},el);
      const title=svg('title',{},e);title.textContent='#'+c.id+' '+statusNames[c.status];e.addEventListener('click',()=>inspect(c.id));
    });
    text(el,178,264,'切線法向量角度 φ');text(el,7,15,'s');
  }
  function render(){
    if(!artifact)return;
    const r=artifact.result,e=artifact.evaluation;
    $('residual').textContent=percent(r.best?.score);$('iou').textContent=percent(e?.gridIoU);
    $('count').textContent=r.candidates.length;$('countNote').textContent=(r.counts.compatible||0)+' 個未發現矛盾'+(r.seedSearch?'；子集另測 '+r.seedSearch.tried+' 次':'');
    $('convexity').textContent=e?(e.trueCutConvexityPass?'通過':'未通過'):'未重建';
    $('convexity').className=e?.trueCutConvexityPass?'good':'bad';
    $('finding').textContent=r.best?(e?.trueCutConvexityPass?'此例找到可用候選。下列精度與凸性檢查由真值事後評估；浮點計算尚非嚴格機器認證。':'此例能得到接近 L 型的重建；但選中切法的真實凸分解檢查未通過，不能套用原先的條件性誤差保證。請同時看精度與這項限制。'):'本次搜尋預算內找不到通過檢查的候選。這不等於資料無法重建，也不會補入真實切線當答案。';
    const reason={'residual-target':'已達資料誤差目標','candidate-budget':'已達候選預算','resolution-limit':'已完成可用的細化層數'};
    $('searchSummary').textContent=(reason[r.termination]||'舊版紀錄')+'。全資料評估 '+r.candidates.length+' 次'+(r.seedSearch?'；子集另評估 '+r.seedSearch.tried+' 次，子集分數不參與最終排名':'')+'。保留歷來最佳答案，不因後續候選變差而退步。';
    $('searchStages').replaceChildren(...(r.stages||[]).map(s=>{const tr=document.createElement('tr');for(const v of [phaseName(s.phase),s.tried,s.compatible,percent(s.best)]){const td=document.createElement('td');td.textContent=v;tr.append(td);}return tr;}));
    document.querySelectorAll('#steps button').forEach((b,i)=>b.setAttribute('aria-current',i===step?'step':'false'));
    $('stepTitle').textContent=lessons[step][1];$('explanation').textContent=lessons[step][2];$('formula').textContent=lessons[step][3];
    $('previous').disabled=step===0;$('next').disabled=step===4;
    $('round').max=Math.max(0,(selected?.states?.length||1)-1);$('round').disabled=step<3||!selected?.states?.length;
    $('matrixSize').textContent=artifact.data.angles.length+' × '+artifact.data.detector.length;
    $('candidateNote').textContent=selected?'#'+selected.id+'：'+statusNames[selected.status]+(selected.check?.violation?'；數值矛盾量 '+format(selected.check.violation):''):'可點選散點，檢視被排除的候選。';
    const checks=[
      ['搜尋讀取真值？','否；只讀總資料'],
      ['形狀邊界距離（取樣估計）',format(e?.sampledBoundaryDistance)],
      ['切後凸性缺口面積',e?e.trueCutConvexityDefectArea.map(format).join(' / '):'—'],
      ['外包絡漏出真值的距離',format(e?.outerContainmentViolation)],
      ['內外距離半值（未認證）',format(r.best?.bound)]
    ];
    $('checks').replaceChildren(...checks.map(([a,b])=>{const tr=document.createElement('tr');for(const v of [a,b]){const td=document.createElement('td');td.textContent=v;tr.append(td);}return tr;}));
    drawObjects();drawData();drawSearch();
  }
  function accept(a,message){
    artifact=a;selected=a.result.best;$('round').max=Math.max(0,(selected?.states?.length||1)-1);$('round').value=$('round').max;
    $('candidate').max=a.result.candidates.length-1;$('candidate').value=selected?.id??0;
    $('angle').replaceChildren(...a.data.angles.map((p,j)=>new Option((p*180/Math.PI).toFixed(1)+'°',j)));
    $('status').textContent=message;$('run').disabled=false;render();
  }
  function stopWorker(){if(worker){worker.terminate();worker=null;}}
  async function loadCase(){
    const ticket=++epoch;stopWorker();$('run').disabled=true;$('status').textContent='讀取已執行的實驗…';
    try{
      const key=$('case').value;
      if(!cache.has(key)){const response=await fetch('result-'+key+'.json');if(!response.ok)throw Error('HTTP '+response.status);cache.set(key,await response.json());}
      if(ticket!==epoch)return;
      const a=cache.get(key);
      accept(a,'已載入可重現的實測紀錄。搜尋 '+a.result.candidates.length+' 個切法；原始執行約 '+a.protocol.elapsedSeconds.toFixed(2)+' 秒。可按「重新搜尋」在此瀏覽器重算。');
    }catch(error){if(ticket!==epoch)return;$('run').disabled=false;$('status').textContent='無法讀取紀錄：'+error.message+'。可按重新搜尋。';}
  }
  function runSearch(){
    ++epoch;stopWorker();const [views,rotation]=$('case').value.split('-').map(Number),truth=P.shape(rotation*Math.PI/180),data=P.makeData(truth,views);
    $('run').disabled=true;$('status').textContent='只用總資料搜尋候選切線…';
    try{worker=new Worker('worker.js');}catch(error){$('status').textContent='背景計算無法啟動，請使用網站或本機伺服器開啟。';$('run').disabled=false;return;}
    worker.onmessage=event=>{
      const m=event.data;
      if(m.type==='progress')$('status').textContent=phaseName(m.progress.phase)+'：全資料已測 '+m.progress.tried+' 個切法'+(m.progress.seedTried?'，子集另測 '+m.progress.seedTried+' 個':'')+'；最佳全資料誤差 '+percent(m.progress.best);
      if(m.type==='error'){$('status').textContent='計算失敗：'+m.message;$('run').disabled=false;stopWorker();}
      if(m.type==='result'){
        const a={protocol:{views,rotationDegrees:rotation,spacing:.04,noise:0,elapsedSeconds:m.elapsedSeconds,truthAccess:'Only simulator and evaluation.'},data,truth,result:m.result,evaluation:P.evaluate(truth,m.result)};
        cache.set($('case').value,a);accept(a,'本次即時計算完成：'+m.elapsedSeconds.toFixed(2)+' 秒。選切線使用總資料誤差；真值僅作事後評估。');stopWorker();
      }
    };
    worker.onerror=event=>{$('status').textContent='背景計算失敗：'+event.message;$('run').disabled=false;stopWorker();};
    worker.postMessage({type:'search',data,options:{}});
  }
  function inspect(id){
    if(!artifact||$('run').disabled)return;
    const c=artifact.result.candidates[id];if(!c)return;
    selected={...C.cutCandidate(artifact.data,artifact.result.global,c.phi,c.offset,artifact.result.config.rounds),id};
    $('candidate').value=id;$('round').max=Math.max(0,(selected.states?.length||1)-1);$('round').value=$('round').max;render();
  }
  lessons.forEach((lesson,i)=>{const b=document.createElement('button');b.textContent=lesson[0];b.addEventListener('click',()=>{step=i;render();});$('steps').append(b);});
  $('previous').onclick=()=>{step=Math.max(0,step-1);render();};$('next').onclick=()=>{step=Math.min(4,step+1);render();};
  $('case').onchange=loadCase;$('run').onclick=runSearch;$('truth').onchange=render;$('round').oninput=render;$('angle').onchange=drawData;
  $('inspect').onclick=()=>inspect(Number($('candidate').value));$('best').onclick=()=>{if(artifact?.result.best)inspect(artifact.result.best.id);};
  $('export').onclick=()=>{
    if(!artifact)return;const content=JSON.stringify(artifact,null,2);$('exportText').value=content;$('exportPanel').hidden=false;
    if(downloadUrl)URL.revokeObjectURL(downloadUrl);downloadUrl=URL.createObjectURL(new Blob([content],{type:'application/json'}));$('download').href=downloadUrl;
  };
  for(const key of ['4-0','8-0','8-22.5','16-0']){
    const tr=document.createElement('tr');$('comparison').append(tr);
    fetch('result-'+key+'.json').then(r=>{if(!r.ok)throw Error('HTTP '+r.status);return r.json();}).then(a=>{
      cache.set(key,a);const values=[key==='8-22.5'?'旋轉 L／8 角度':'L／'+key.split('-')[0]+' 角度',percent(a.result.best?.score),percent(a.evaluation?.gridIoU),a.result.best?'找到候選':'無候選',a.evaluation?(a.evaluation.trueCutConvexityPass?'通過':'未通過'):'—'];
      values.forEach(v=>{const td=document.createElement('td');td.textContent=v;tr.append(td);});
    }).catch(()=>{const td=document.createElement('td');td.colSpan=5;td.textContent=key+'：紀錄無法讀取';tr.append(td);});
  }
  fetch('search-comparison.json').then(r=>{if(!r.ok)throw Error('HTTP '+r.status);return r.json();}).then(report=>{
    $('beforeAfter').replaceChildren(...report.cases.map(c=>{const tr=document.createElement('tr');
      for(const v of [(c.rotation?'旋轉 '+c.rotation+'°／':'L／')+c.views+' 角度',percent(c.legacy.residual),percent(c.adaptive.residual),percent(c.legacy.gridIoU),percent(c.adaptive.gridIoU)]){const td=document.createElement('td');td.textContent=v;tr.append(td);}return tr;}));
  }).catch(()=>{$('beforeAfter').textContent='新舊比較紀錄尚未載入。';});
  loadCase();
})();
