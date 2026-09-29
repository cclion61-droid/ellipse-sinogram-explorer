(function () {
  'use strict';
  const $=id=>document.getElementById(id), NS='http://www.w3.org/2000/svg';
  const G=TwoBodyGeometry,P=LPhantom;
  let records=[],baselines=[],boxReports=[],chosen=null,worker=null,epoch=0;
  const percent=x=>Number.isFinite(x)?(x>0&&x<1e-5?(100*x).toExponential(2):(100*x).toFixed(4))+'%':'—';
  const fixed=x=>Number.isFinite(x)?x.toFixed(5):'—';
  function svg(parent,name,attributes={}) {
    const e=document.createElementNS(NS,name);
    for(const [k,v] of Object.entries(attributes))e.setAttribute(k,v);
    parent.append(e);return e;
  }
  function polygon(parent,p,fill,stroke,extra={}) {
    if(!p?.length)return;
    svg(parent,'polygon',{points:p.map(x=>[250+x[0]*120,216-x[1]*120].join(',')).join(' '),
      fill,stroke,'stroke-width':2,'stroke-linejoin':'round',...extra});
  }
  function drawShape(c) {
    const el=$('shapePlot');el.replaceChildren();
    for(const v of [-1,0,1]) {
      svg(el,'line',{x1:250+120*v,y1:25,x2:250+120*v,y2:405,stroke:'#e8edf0'});
      svg(el,'line',{x1:60,y1:216-120*v,x2:440,y2:216-120*v,stroke:'#e8edf0'});
    }
    const best=c.result.best;
    if(best) {
      best.output.forEach((p,i)=>polygon(el,p,i?'#8150a14d':'#207c964d',i?'#8150a1':'#207c96'));
      const n=G.direction(best.phi),t=[-n[1],n[0]],origin=n.map(v=>best.offset*v);
      const a=[250+120*(origin[0]-2.5*t[0]),216-120*(origin[1]-2.5*t[1])];
      const b=[250+120*(origin[0]+2.5*t[0]),216-120*(origin[1]+2.5*t[1])];
      const defs=svg(el,'defs'),clip=svg(defs,'clipPath',{id:'optimizationClip'});
      svg(clip,'rect',{x:60,y:25,width:380,height:380});
      svg(el,'line',{x1:a[0],y1:a[1],x2:b[0],y2:b[1],stroke:'#e2773c','stroke-width':2,'stroke-dasharray':'6 5','clip-path':'url(#optimizationClip)'});
    }
    if($('truth').checked)polygon(el,c.truth.outline,'none','#47525e',{'stroke-dasharray':'5 4','stroke-width':2.2});
    $('cutLabel').textContent=best?'φ = '+(best.phi*180/Math.PI).toFixed(2)+'° · s = '+best.offset.toFixed(3):'此網格沒有可用切法';
  }
  function drawData(c) {
    const el=$('sinogram');el.replaceChildren();
    const data=c.data,peak=Math.max(...data.total.flat());
    data.total.forEach((row,j)=>row.forEach((v,k)=>{
      const a=v/peak;
      svg(el,'rect',{x:45+j*365/data.angles.length,y:20+(row.length-1-k)*210/row.length,
        width:365/data.angles.length+.2,height:210/row.length+.2,
        fill:'hsl('+(216-45*a)+','+(15+50*a)+'%,'+(96-65*a)+'%)'});
    }));
    for(const [x,y,label] of [[45,255,'0°'],[370,255,'180°'],[13,35,'s'],[210,263,'量測法向量角度']]) {
      const t=svg(el,'text',{x,y});t.textContent=label;
    }
    $('matrixSize').textContent=data.angles.length+' × '+data.detector.length;
  }
  function renderTable() {
    const body=$('comparison');body.replaceChildren();
    for(const c of records) {
      const tr=document.createElement('tr');tr.dataset.selected=String(chosen?.id===c.id);
      const baseline=baselines.find(b=>b.id===c.id);
      for(const value of [c.label,percent(c.result.best?.score),percent(c.evaluation?.gridIoU),
        c.evaluation?(c.evaluation.trueCutConvexityPass?'通過':'未通過'):'—',percent(baseline?.residual)]) {
        const td=document.createElement('td');td.textContent=value;tr.append(td);
      }
      tr.style.cursor='pointer';tr.addEventListener('click',()=>{$('case').value=c.id;select(c.id);});body.append(tr);
    }
  }
  function select(id) {
    chosen=records.find(c=>c.id===id);if(!chosen)return;
    const c=chosen,r=c.result,e=c.evaluation;
    $('outcome').textContent=r.best?'找到候選':'無候選';
    $('error').textContent=percent(r.best?.score);
    $('iou').textContent=percent(e?.gridIoU);
    $('convexity').textContent=e?(e.trueCutConvexityPass?'通過':'未通過'):'—';
    $('convexity').className=e?.trueCutConvexityPass?'good':'bad';
    $('finding').textContent=!r.best?'此網格內沒有數值相容候選。這不證明全部連續切線不可行。':
      !e?.trueCutConvexityPass?'重建圖可能非常接近真值，但真實切後仍有非凸缺口；資料擬合與高 IoU 都不能補上這個幾何保證。':
      '此例通過事後真體凸性檢查；演算法本身仍只證明有限候選集合內的選擇最優。';
    const box=boxReports.find(item=>item.id===c.id);
    const values=[['格點切法總數',r.candidateCount??r.candidates.length],
      ['未發現數值矛盾',(r.counts||{}).compatible||0],['資料誤差最小值',percent(r.minimumResidual)],
      ['容許範圍內的候選',r.admissibleCount],['選中兩片周長和',fixed(r.best?.perimeter)],
      ['參數盒：整塊排除',box?box.excluded+' / '+box.boxes:'—'],
      ['參數盒：尚不能判定',box?.retained??'—'],
      ['單次執行時間',c.elapsedSeconds.toFixed(2)+' 秒']];
    $('record').replaceChildren(...values.map(([label,value])=>{
      const row=document.createElement('tr');for(const v of [label,value]){
        const td=document.createElement('td');td.textContent=v;row.append(td);}return row;
    }));
    $('shapeNote').textContent=r.best?'真值只在疊圖與上方評估中使用。外包絡漏出真值距離：'+fixed(e?.outerContainmentViolation)+'。':'請比較 T 型與平移 T 型：同一模型，切線移出網格後可能完全失敗。';
    drawShape(c);drawData(c);renderTable();
  }
  function stopWorker(){if(worker){worker.terminate();worker=null;}}
  function rerun() {
    if(!chosen)return;
    const id=chosen.id,data=chosen.data,truth=chosen.truth;
    stopWorker();const ticket=++epoch;
    $('run').disabled=true;$('case').disabled=true;$('status').textContent='從單一總 sinogram 枚舉 1,560 條切線…';
    worker=new Worker('optimization-worker.js');
    worker.onmessage=event=>{
      if(ticket!==epoch)return;
      const m=event.data;
      if(m.type==='progress')$('status').textContent='已評估 '+m.progress.tried+'/'+m.progress.total+' 條；未發現數值矛盾 '+m.progress.feasible+' 條。';
      if(m.type==='error'){$('status').textContent='計算失敗：'+m.message;$('run').disabled=false;$('case').disabled=false;stopWorker();}
      if(m.type==='result') {
        const result={...m.result,candidateCount:m.result.candidates.length,
          candidates:m.result.candidates.filter(row=>row.status==='compatible')};
        const index=records.findIndex(c=>c.id===id);
        records[index]={...records[index],result,evaluation:P.evaluate(truth,result),elapsedSeconds:m.elapsedSeconds};
        $('run').disabled=false;$('case').disabled=false;
        $('status').textContent='已在瀏覽器完成全格點枚舉：'+m.elapsedSeconds.toFixed(2)+' 秒；只用總資料選切法。';
        stopWorker();select(id);
      }
    };
    worker.onerror=event=>{$('status').textContent='背景計算失敗：'+event.message;$('run').disabled=false;$('case').disabled=false;stopWorker();};
    worker.postMessage({data});
  }
  $('case').onchange=()=>select($('case').value);
  $('truth').onchange=()=>{if(chosen)drawShape(chosen);};
  $('run').onclick=rerun;
  Promise.all([fetch('optimization-results.json').then(r=>{if(!r.ok)throw Error('實驗紀錄 HTTP '+r.status);return r.json();}),
    fetch('optimization-baselines.json').then(r=>r.ok?r.json():{cases:[]}),
    fetch('box-results.json').then(r=>r.ok?r.json():{cases:[]})]).then(([report,baseline,boxes])=>{
    records=report.cases;baselines=baseline.cases||[];boxReports=boxes.cases||[];
    $('case').replaceChildren(...records.map(c=>new Option(c.label,c.id)));
    $('status').textContent='六種形狀已用同一固定網格完成實測；可切換案例或在瀏覽器重新枚舉。';
    select(records[0].id);
  }).catch(error=>{$('status').textContent='讀取紀錄失敗：'+error.message;});
})();
