/* Presentation only. Every polygon displayed comes from geometry.js. */
(function () {
  'use strict';
  const G = TwoBodyGeometry, F = EllipsePhantom;
  const $ = id => document.getElementById(id);
  const color = { outer:'#b87914', inner:'#087d75', truth:'#687380', output:'#8150a1', ray:'#cb4d33', blue:'#326d96', ink:'#1d2b39', grid:'#e7ecef' };
  const names = ['製造資料','讀 sinogram','全域外框','分出兩體','弦長下界','建立內框','弦長上界','排除角落','交替更新','輸出與誤差'];
  const titles = ['先產生資料：線穿過多少長度？','Sinogram：把所有測量排成一張圖','端點：先把全部物體包住','分離投影：得到兩個外包絡','下界：這一段必須存在','凸性：把確定內部連成內包絡','上界：哪些點一定在外面？','凸性排除：裁掉不可能的角落','互相更新：內框變大，外框變小','輸出：輪廓和條件性誤差界'];
  let data, result, truth, step = 0, j = 0, k = 60, body = 0, round = 0, defaultLower;
  let reconstructing = false, downloadURL = null;
  const f = (x, digits = 4) => Number.isFinite(x) ? x.toFixed(digits).replace(/^-0\.0000$/, '0.0000') : '—';
  const deg = a => f(a * 180 / Math.PI, 1);
  const esc = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;');
  function el(tag, attrs = {}, content = '') { return `<${tag} ${Object.entries(attrs).map(([a,v])=>`${a}="${esc(v)}"`).join(' ')}>${content}</${tag}>`; }
  const text = (x,y,s,attrs={}) => el('text',{x,y,...attrs},esc(s));
  const line = (x1,y1,x2,y2,attrs={}) => el('line',{x1,y1,x2,y2,stroke:color.grid,...attrs});
  const rect = (x,y,width,height,attrs={}) => el('rect',{x,y,width,height,...attrs});
  const circle = (cx,cy,r,attrs={}) => el('circle',{cx,cy,r,...attrs});
  function polygon(p, map, attrs={}) {
    if (!p || p.length < 2) return '';
    return el('polygon',{points:p.map(v=>map(v).join(',')).join(' '),fill:'none',stroke:color.outer,'stroke-width':1.7,...attrs});
  }
  function polyline(p,map,attrs={}) {
    return el('polyline',{points:p.map(v=>map(v).join(',')).join(' '),fill:'none',stroke:color.blue,'stroke-width':1.7,...attrs});
  }
  function center(p) { return p.reduce((a,v)=>[a[0]+v[0]/p.length,a[1]+v[1]/p.length],[0,0]); }
  function pairState() {
    if (result.status !== 'ok') return { outer:result.init.outer || [], inner:[[],[]] };
    if(step===3) return {outer:result.init.outer,inner:[[],[]]};
    if(step===4) return {outer:result.init.outer,inner:[[],[]]};
    if(step===5) return {outer:result.init.outer,inner:result.seed.inner};
    if(step===6 || step===7) return result.event ? {outer:result.event.before,inner:result.event.inner} : result.states[0];
    return result.states[step===8 ? round : result.states.length-1];
  }
  function currentRay() {
    const state = pairState();
    if(state.outer.length !== 2) return null;
    return G.rayBounds(data,state.outer,state.inner,j,k);
  }
  function pickLower(i) {
    if(result.status !== 'ok') return null;
    let chosen=null,score=-Infinity;
    for(const segment of result.seed.segments[i]) {
      const r=G.rayBounds(data,result.init.outer,[[],[]],segment.j,segment.k);
      const value=(segment.mixed?10:0)+(segment.interval[1]-segment.interval[0]);
      if(value>score) {score=value;chosen={j:segment.j,k:segment.k};}
    }
    return chosen;
  }
  function chooseExample() {
    body=0;
    if(step===0 || step===1) {j=Math.floor(data.angles.length/2);k=Math.floor(data.detector.length/2);}
    else if(step===2 || step===3) {j=Math.max(0,result.init.anchor);k=Math.floor(data.detector.length/2);}
    else if(step===4 || step===5) {const a=defaultLower; if(a){j=a.j;k=a.k;}}
    else if((step===6 || step===7) && result.event) {j=result.event.ray.j;k=result.event.ray.k;body=result.event.i;}
    else if(defaultLower) {j=defaultLower.j;k=defaultLower.k;}
    $('angle').value=String(j);$('detector').value=String(k);$('body').value=String(body);
  }
  function updateLesson(ray) {
    const i=body, other=1-i, I=i+1, O=other+1, state=pairState();
    let explanation='', formula='', knowledge='從這一步開始，演算法只拿到總 sinogram、角度與 detector 位置；真值虛線只是對照。';
    if(step===0) {
      const lengths=truth.map(e=>F.radon(e,data.detector[k],data.angles[j]));
      explanation='紅線與兩個物體相交，儀器只回報在物體內的「總長度」。兩個物體彼此分離、密度都是 1，所以兩段長度可以直接相加。先移動右方的方向與射線位置，看看數字如何改變。';
      formula=`g = r₁ + r₂ ≈ ${f(lengths[0])} + ${f(lengths[1])} ≈ <strong>${f(data.total[j][k])}</strong>`;
      knowledge='這一步的 r₁、r₂ 由模擬器展示給你看；後續重建不會收到它們，也不會收到橢圓參數。';
    } else if(step===1) {
      explanation='固定一個角度，讓平行的紅線掃過所有 s，就得到右下方的一條測量曲線。把不同角度的曲線排成右上方的色塊圖，就是總 sinogram。亮度是長度，不是物體編號。';
      formula=`輸入矩陣：${data.angles.length} 個角度 × ${data.detector.length} 個 detector；目前 g = ${f(data.total[j][k])}`;
    } else if(step===2) {
      const runs=result.init.runs[j], lo=data.detector[runs[0][0]-1], hi=data.detector[runs.at(-1)[1]+1];
      explanation='每個方向，找第一個與最後一個正值，再往外各取一格。整個物體一定在這兩條平行線之間。把所有方向的條帶相交，就得到橘色全域外框 P。它會把兩體之間的空隙也包進去。';
      formula=`本方向的條帶：${f(lo,2)} ≤ x cos φ + y sin φ ≤ ${f(hi,2)}<br><span class="small">橘色多邊形 = 所有方向條帶 ∩ 已知視野；不是最後重建。</span>`;
    } else if(step===3) {
      const a=result.init.anchor, runs=result.init.runs[a], zeros=runs[1][0]-runs[0][1]-1;
      explanation='這個方向出現兩段正值，中間至少有兩個零取樣。凸體的投影不會斷成兩段，因此在「恰有兩個凸體，且每體都有被取樣」的假設下，兩段來自不同物體。各自往外擴一格，再與全域外框相交。';
      formula=`分離方向 φ = ${deg(data.angles[a])}°；中間有 ${zeros} 個零取樣<br><span class="small">P₁、P₂ 已有標籤；另有 ${result.init.assignments.length-1} 個方向完成唯一配對，${result.init.ambiguous.length} 個仍有歧義，先跳過。</span>`;
      knowledge='圖中已加入能唯一配對的其他分離方向。不拿真值判斷標籤；更不能把此方向的左右順序套到所有方向。';
    } else if(step===4 && ray) {
      explanation=`這條線的總長度是 g。另一個物體最多只能占滿自己的外框弦，長度為 c${O}。扣掉這個最大貢獻，物體 ${I} 至少要有 L${I} 這麼長。在本體外框弦 [a,b] 裡，所有長度至少 L${I} 的可能線段，都必須包含 [b−L${I}, a+L${I}]（若非空）。`;
      formula=`L${I} = max(0, g − c${O}) ≈ max(0, ${f(ray.g)} − ${f(ray.c[other])}) = <strong>${f(ray.lower[i])}</strong><br><span class="small">${ray.mandatory[i]?`必存區間 = [${f(ray.mandatory[i][0])}, ${f(ray.mandatory[i][1])}]`:'此射線沒有正長度的必存區間；不能硬加內部點。'}</span>`;
    } else if(step===5) {
      const counts=result.seed.segments.map(x=>x.length), mixed=result.seed.segments.flat().filter(x=>x.mixed).length;
      explanation='把上一個步驟對每條測量線、每個物體都做一次，收集所有必存線段。因為真實物體是凸的，連接這些內部點形成的凸包也一定在物體內。綠色區域就是內包絡 Q，不是猜出的輪廓。';
      formula=`Q₁ ⊆ D₁ ⊆ P₁，Q₂ ⊆ D₂ ⊆ P₂<br><span class="small">分別收集 ${counts[0]}、${counts[1]} 條必存線段，其中 ${mixed} 條的另一體外框弦長非零；無法排除是混合射線。</span>`;
      knowledge='內包絡至少要有三個不共線的點，後續二維裁切才啟動。線段端點不是橢圓真值取樣點。';
    } else if((step===6 || step===7) && ray && result.event) {
      const ev=result.event, [a,b]=ray.innerIntervals[i], U=ray.upper[i];
      if(step===6) explanation=`現在另一體已知至少貢獻 q${O}，所以本體的弦長最多是 U${I} = g − q${O}。本體又必須包含綠色內弦 [a,b]，因此整條真實弦只能落在 [b−U${I}, a+U${I}]。再往外一點的紅點 z，就確定不屬於物體 ${I}。`;
      else explanation=`若物體 ${I} 包含紅色陰影裡的某個點 x，又包含綠色內框，凸性就會迫使它包含已知外部點 z，造成矛盾。因此陰影是禁區。我們裁去禁區後再取凸包，保留一個安全的凸外框；這個操作可能恢復部分被刪區域，不保證每次都有進展。`;
      formula=`U${I} = g − q${O} ≈ ${f(ray.g)} − ${f(ray.q[other])} = <strong>${f(U)}</strong><br><span class="small">可容許弦範圍 [${f(b-U)}, ${f(a+U)}]；z 的 t 座標 ${f(ev.t,8)}（在範圍外加微小裕量）。</span>`;
      knowledge=`為展示混合弦長如何用於裁切，這裡跳到實際第 ${ev.round} 輪、物體 ${I} 的一筆事件；先前射線已更新過外框。此步鎖定射線，不是示意假切。`;
    } else if(step===8) {
      explanation='固定這一輪的內框，掃過全部射線做外部排除。外框縮小後，另一體的最大貢獻變少，就可能產生更多必存內部線段；再擴大內框。拖動下方輪數，觀察實際保存的每輪結果。';
      formula=`第 ${round} 輪：ε = <strong>${f(state.bound,6)}</strong><br><span class="small">外框只縮小，內框只擴大；這次更新沒有使用任何真值形狀。</span>`;
    } else if(step===9) {
      const bound=result.states.at(-1).bound;
      explanation='最後每個物體都有一個內框 Q 和外框 P。我們取所有「內框點與外框點的中點」，形成紫色凸多邊形，再把兩個多邊形取聯集。這不是把兩張影像平均，也不是擬合兩個橢圓。';
      formula=`D̂ᵢ = (Qᵢ + Pᵢ) / 2，D̂ = D̂₁ ∪ D̂₂<br>ε = ½ max{dH(P₁,Q₁), dH(P₂,Q₂)} = <strong>${f(bound,6)}</strong>`;
      knowledge='若 Qᵢ ⊆ Dᵢ ⊆ Pᵢ 確實成立，則 dH(D̂, D₁∪D₂) ≤ ε。浮點實作不是嚴格認證；中點輸出也不一定精確吻合全部 Radon 數值。';
    }
    $('stepCounter').textContent=`STEP ${String(step+1).padStart(2,'0')} / 10`;
    $('stepTitle').textContent=titles[step];$('explanation').textContent=explanation;$('formula').innerHTML=formula;$('knowledge').textContent=knowledge;
  }
  function drawObjects(ray) {
    const W=520,H=460, pad=38, ext=1.55, size=H-2*pad, left=(W-size)/2;
    const map=v=>[left+(v[0]+ext)/(2*ext)*size,H-pad-(v[1]+ext)/(2*ext)*size];
    let out=el('title',{},titles[step])+el('defs',{},el('clipPath',{id:'worldClip'},rect(left,pad,size,size)));
    for(const t of [-1.5,-1,-.5,0,.5,1,1.5]) {
      const [x]=map([t,0]), [,y]=map([0,t]);
      out+=line(x,pad,x,H-pad,{stroke:t===0?'#c2ccd3':color.grid})+line(left,y,left+size,y,{stroke:t===0?'#c2ccd3':color.grid});
      out+=text(x,H-pad+19,String(t),{'text-anchor':'middle'})+text(left-8,y+4,String(t),{'text-anchor':'end'});
    }
    out+=text(left+size+14,H-pad+3,'x')+text(left-5,pad-12,'y');
    let content='';
    if(step===2) {
      const runs=result.init.runs[j],lo=data.detector[runs[0][0]-1],hi=data.detector[runs.at(-1)[1]+1];
      const box=[[-2,-2],[2,-2],[2,2],[-2,2]], p=G.strip(box,lo,hi,data.angles[j]);
      content+=polygon(p,map,{fill:color.blue,'fill-opacity':.06,stroke:'none'});
      for(const s of [lo,hi]) {const a=map(G.pointOnLine(s,data.angles[j],-4)),b=map(G.pointOnLine(s,data.angles[j],4));content+=line(...a,...b,{stroke:color.blue,'stroke-dasharray':'5 4'});}
      content+=polygon(result.init.global,map,{fill:color.outer,'fill-opacity':.08,stroke:color.outer,'stroke-width':2});
    }
    const state=pairState();
    if(step>=3 && state.outer.length===2) state.outer.forEach((p,i)=>{
      content+=polygon(p,map,{fill:color.outer,'fill-opacity':.05,stroke:color.outer,'stroke-width':2});
      const c=map(center(p));content+=text(c[0],c[1]-8,`物體 ${i+1}`,{'text-anchor':'middle','font-weight':600});
    });
    if(step>=5) state.inner.forEach(q=>{content+=polygon(q,map,{fill:color.inner,'fill-opacity':.12,stroke:color.inner,'stroke-width':2});});
    if(step===5) result.seed.segments.flat().forEach(seg=>{content+=polyline(seg.endpoints,map,{stroke:color.inner,'stroke-width':.7,opacity:.13});});
    if(step===9) result.output.forEach(p=>{content+=polygon(p,map,{stroke:color.output,'stroke-width':2.5,fill:color.output,'fill-opacity':.04});});
    if(step<2 || $('truth').checked) truth.forEach((e,i)=>{
      content+=polygon(F.boundary(e),map,{stroke:color.truth,'stroke-width':1.4,'stroke-dasharray':'5 4',fill:step===0?color.truth:'none','fill-opacity':.05});
      if(step<2) {const c=map([e.cx,e.cy]);content+=text(c[0],c[1]-12,`模擬物體 ${i+1}`,{'text-anchor':'middle'});}
    });
    const s=data.detector[k],phi=data.angles[j],a=map(G.pointOnLine(s,phi,-4)),b=map(G.pointOnLine(s,phi,4));
    if(step!==3 && step!==5 && step!==8 && step!==9) {
      content+=line(...a,...b,{stroke:color.ray,'stroke-width':1.3,'stroke-dasharray':'5 3'});
      if(step<2) truth.forEach(e=>{
        const iv=F.chord(e,s,phi);if(iv) content+=polyline(iv.map(t=>G.pointOnLine(s,phi,t)),map,{stroke:color.ray,'stroke-width':5});
      });
      if(ray && step>=4) {
        ray.outerIntervals.forEach(iv=>{if(iv)content+=polyline(iv.map(t=>G.pointOnLine(s,phi,t)),map,{stroke:color.outer,'stroke-width':4});});
        if(step===4 && ray.mandatory[body]) content+=polyline(ray.mandatory[body].map(t=>G.pointOnLine(s,phi,t)),map,{stroke:color.inner,'stroke-width':7});
        if(step>=6) ray.innerIntervals.forEach(iv=>{if(iv)content+=polyline(iv.map(t=>G.pointOnLine(s,phi,t)),map,{stroke:color.inner,'stroke-width':5});});
      }
    }
    if(step===3 && result.init.anchor>=0) {
      const r=result.init.runs[result.init.anchor], lo=data.detector[r[0][1]+1],hi=data.detector[r[1][0]-1];
      const phi=data.angles[result.init.anchor],aa=map(G.pointOnLine((lo+hi)/2,phi,-4)),bb=map(G.pointOnLine((lo+hi)/2,phi,4));
      content+=line(...aa,...bb,{stroke:color.blue,'stroke-width':2,'stroke-dasharray':'6 4'});
    }
    if((step===6||step===7)&&result.event) {
      const ev=result.event,z=map(ev.witness);
      if(step===7) {
        const square=[[-2,-2],[2,-2],[2,2],[-2,2]];
        const cone=ev.cone.normals.reduce((p,n)=>G.clip(p,n.map(x=>-x),-G.dot(n,ev.witness)),square);
        content+=polygon(cone,map,{fill:color.ray,'fill-opacity':.13,stroke:color.ray,'stroke-width':1});
        content+=polygon(ev.after,map,{stroke:color.output,'stroke-width':2.3});
      }
      content+=circle(...z,4.5,{fill:color.ray,stroke:'#fff','stroke-width':1})+text(z[0]+8,z[1]-8,'z',{'font-weight':700});
    }
    out+=el('g',{'clip-path':'url(#worldClip)'},content);
    $('objects').innerHTML=out;
    $('outputLegend').textContent=step===7?'此次裁切後外框':'重建輪廓';
    $('objectSubtitle').textContent=step<2?'模擬器展示真值':step===9?'紫色：真正輸出':'橘色在外，綠色在內';
    $('objectNote').textContent=step<2?'φ 是紅線「法向量」的角度，不是紅線本身的角度；例如 φ = 90° 時紅線水平。s 決定平行線的位置。':step===3?'藍色虛線位於兩個外包絡之間；只代表這個方向的分離。':step===7?'紅色禁區朝向「遠離內框」的一側。紫色為此次裁切後外框；小差異請看局部放大。':step===9?'輸出是兩個凸多邊形的聯集，不是它們的整體凸包。':'座標使用任意長度單位；紅線的位置與右邊目前選取的 sinogram 樣本一致（有顯示紅線時）。';
    $('zoomPanel').hidden=step!==7;
    if(step===7) drawZoom();
  }
  function drawZoom() {
    const ev=result.event; if(!ev)return;
    const old=ev.before[ev.i];
    const vertex=old.reduce((best,p)=>G.pointDistance(p,ev.after)>G.pointDistance(best,ev.after)?p:best,old[0]);
    const dist=G.pointDistance(vertex,ev.after),r=Math.max(.006,dist*4);
    const map=p=>[210+(p[0]-vertex[0])/r*85,110-(p[1]-vertex[1])/r*85];
    const square=[[vertex[0]-r*3,vertex[1]-r*3],[vertex[0]+r*3,vertex[1]-r*3],[vertex[0]+r*3,vertex[1]+r*3],[vertex[0]-r*3,vertex[1]+r*3]];
    const cone=ev.cone.normals.reduce((p,n)=>G.clip(p,n.map(x=>-x),-G.dot(n,ev.witness)),square);
    $('cutZoom').innerHTML=el('defs',{},el('clipPath',{id:'zoomClip'},rect(10,12,400,185)))+
      el('g',{'clip-path':'url(#zoomClip)'},polygon(old,map,{fill:color.outer,'fill-opacity':.12,stroke:color.outer,'stroke-width':2})+
      polygon(cone,map,{fill:color.ray,'fill-opacity':.16,stroke:color.ray,'stroke-width':1})+
      polygon(ev.after,map,{stroke:color.output,'stroke-width':2.5})+circle(...map(vertex),4,{fill:color.outer}))+
      text(15,212,`橘點：被刪去的舊頂點；至新外框距離 ${f(dist,6)}`);
  }
  function heat(value,max) {
    const t=Math.max(0,Math.min(1,value/(max||1)));
    const a=t<.5?[244,247,249]:[62,145,165], b=t<.5?[62,145,165]:[32,49,94],u=t<.5?t*2:(t-.5)*2;
    return `rgb(${a.map((x,i)=>Math.round(x+(b[i]-x)*u)).join(',')})`;
  }
  function drawSinogram() {
    const W=420,H=235,L=44,R=12,T=12,B=41,cw=(W-L-R)/data.angles.length,ch=(H-T-B)/data.detector.length;
    const max=Math.max(...data.total.flat()); let out='';
    for(let a=0;a<data.angles.length;a++)for(let b=0;b<data.detector.length;b++)out+=rect(L+a*cw,T+(data.detector.length-1-b)*ch,cw+.2,ch+.2,{fill:heat(data.total[a][b],max)});
    const x=L+(j+.5)*cw,y=T+(data.detector.length-k-.5)*ch;
    out+=rect(L+j*cw,T,cw,H-T-B,{fill:'none',stroke:color.ray,'stroke-width':1.5})+circle(x,y,4,{fill:'none',stroke:color.ray,'stroke-width':2});
    const stride=data.angles.length>8?4:2;
    for(let a=0;a<data.angles.length;a+=stride)out+=text(L+(a+.5)*cw,H-B+17,`${deg(data.angles[a]).replace('.0','')}°`,{'text-anchor':'middle'});
    const sMin=data.detector[0],sMax=data.detector.at(-1);
    for(const s of [-1.5,0,1.5])out+=text(L-7,T+(sMax-s)/(sMax-sMin)*(H-T-B)+4,String(s),{'text-anchor':'end'});
    out+=text(10,15,'s')+text(W-10,H-5,'角度 φ',{'text-anchor':'end'})+text(L,H-5,`亮度：0 → ${f(max,2)}（總長度）`);
    $('sinogram').innerHTML=out;$('matrixSize').textContent=`${data.angles.length} × ${data.detector.length}`;
  }
  function drawProfile() {
    const W=420,H=180,L=44,R=12,T=20,B=38,max=Math.max(...data.total[j])*1.16||1,lo=data.detector[0],hi=data.detector.at(-1);
    const map=p=>[L+(p[0]-lo)/(hi-lo)*(W-L-R),H-B-p[1]/max*(H-T-B)];
    let out='';for(const y of [0,max/2,max]) {const yy=map([0,y])[1];out+=line(L,yy,W-R,yy)+text(L-6,yy+4,f(y,1),{'text-anchor':'end'});}
    if(step===3) result.init.runs[j].forEach(r=>{const x1=map([data.detector[r[0]-1],0])[0],x2=map([data.detector[r[1]+1],0])[0];out+=rect(x1,T,x2-x1,H-T-B,{fill:color.outer,'fill-opacity':.10});});
    out+=polyline(data.total[j].map((g,n)=>[data.detector[n],g]),map,{stroke:color.blue});
    if(step===2 || step===3) {
      const runs=step===2?[[result.init.runs[j][0][0],result.init.runs[j].at(-1)[1]]]:result.init.runs[j];
      runs.forEach(r=>[r[0]-1,r[1]+1].forEach(n=>{const x=map([data.detector[n],0])[0];out+=line(x,T,x,H-B,{stroke:color.outer,'stroke-dasharray':'4 3'})+circle(x,H-B,4,{fill:color.outer});}));
      data.total[j].forEach((g,n)=>{if(g>0)out+=circle(...map([data.detector[n],g]),2,{fill:color.blue});});
    }
    const pos=map([data.detector[k],data.total[j][k]]);out+=line(pos[0],T,pos[0],H-B,{stroke:color.ray,'stroke-dasharray':'4 3'})+circle(...pos,4,{fill:color.ray});
    for(const s of [-1.5,0,1.5])out+=text(map([s,0])[0],H-B+17,String(s),{'text-anchor':'middle'});
    out+=text(10,12,'g')+text(W-12,H-5,'s',{'text-anchor':'end'})+text(L,H-5,`φ = ${deg(data.angles[j])}°`);
    $('profile').innerHTML=out;
    $('dataNote').textContent=(step===2||step===3)?'橘色點是正值區塊外側的相鄰 detector。連線只是幫助讀圖，演算法使用的是離散樣本。':`目前紅點：s = ${f(data.detector[k],2)}，g = ${f(data.total[j][k])}。改變射線，只會改變解說選取，不會偷偷換資料。`;
  }
  function drawIntervals(ray) {
    const svg=$('intervals'),width=Math.max(300,svg.clientWidth),height=240;
    svg.setAttribute('viewBox',`0 0 ${width} ${height}`);
    const state=pairState(),i=body;let rows=[],note='',domain=[-1.55,1.55];
    if(step<2) {
      rows=truth.map((e,i)=>({name:`真物體 ${i+1}`,iv:F.chord(e,data.detector[k],data.angles[j]),c:color.truth}));
      note='這兩段的位置只在模擬展示時可見。測量只留下長度的和，不會告訴演算法每段的位置或各自長度。';
    } else if(ray && step===4) {
      const iv=ray.outerIntervals[i],L=ray.lower[i];
      rows=[{name:'外框 [a,b]',iv,c:color.outer},{name:'最靠左的弦',iv:iv&&L>0?[iv[0],iv[0]+L]:null,c:color.blue,dash:true},{name:'最靠右的弦',iv:iv&&L>0?[iv[1]-L,iv[1]]:null,c:color.blue,dash:true},{name:'共同必存部分',iv:ray.mandatory[i],c:color.inner}];
      note='藍線只演示「本條線上長度恰為 L 的極端放法」，不是完整形狀的可行解。任何更長的弦，也必須包含兩個極端放法的共同部分。';
    } else if(ray && (step===6||step===7)) {
      const iv=ray.innerIntervals[i],U=ray.upper[i];
      rows=[{name:'本體內弦',iv,c:color.inner},{name:'另一體內弦',iv:ray.innerIntervals[1-i],c:color.inner},{name:'本體容許範圍',iv:iv?[iv[1]-U,iv[0]+U]:null,c:color.blue},{name:'已知外點 z',dot:result.event.t,c:color.ray}];
      note='t 是沿紅色直線的位置，s 是直線到原點的帶符號距離，兩者不同。z 刻意比容許範圍再外移一個微小裕量；圖上可能幾乎重合。';
    } else if(ray) {
      rows=[{name:'外框弦',iv:ray.outerIntervals[i],c:color.outer},{name:'內框弦',iv:ray.innerIntervals[i],c:color.inner}];
      if(step===9)rows.push({name:'重建弦',iv:G.lineInterval(result.output[i],data.detector[k],data.angles[j]),c:color.output});
      note='這些是目前多邊形與同一條測量線的交集；空列表示沒有交到正長度線段。';
    } else {
      rows=[{name:'全域外框弦',iv:G.lineInterval(result.init.global,data.detector[k],data.angles[j]),c:color.outer}];
      note='注意：全域外框的弦長通常大於真實總長度，因為它把兩體間的空隙也包含進去。';
    }
    const values=rows.flatMap(r=>r.iv|| (Number.isFinite(r.dot)?[r.dot]:[]));
    if(values.length){const lo=Math.min(...values),hi=Math.max(...values),pad=Math.max(.08,(hi-lo)*.12);domain=[lo-pad,hi+pad];}
    const L=width<500?102:145,R=45,x=t=>L+(t-domain[0])/(domain[1]-domain[0])*(width-L-R),y0=35,dy=42;
    let out='';rows.forEach((r,n)=>{
      const y=y0+n*dy;out+=text(L-12,y+4,r.name,{'text-anchor':'end'})+line(L,y,width-R,y,{stroke:color.grid});
      if(r.iv) {const a=x(r.iv[0]),b=x(r.iv[1]);out+=line(a,y,b,y,{stroke:r.c,'stroke-width':5,'stroke-dasharray':r.dash?'6 4':'none'})+circle(a,y,3,{fill:r.c})+circle(b,y,3,{fill:r.c});}
      else if(Number.isFinite(r.dot))out+=circle(x(r.dot),y,5,{fill:r.c});
      else out+=text(L+5,y-7,'沒有正長度區間',{fill:color.truth});
    });
    const axisY=y0+(rows.length-1)*dy+28;out+=line(L,axisY,width-R,axisY,{stroke:'#b6c3cc'});
    for(let a=0;a<=3;a++){const t=domain[0]+a/3*(domain[1]-domain[0]),xx=x(t);out+=line(xx,axisY,xx,axisY+4,{stroke:'#b6c3cc'})+text(xx,axisY+19,f(t,2),{'text-anchor':'middle'});}
    out+=text(width-12,axisY+19,'t',{'text-anchor':'end'});svg.innerHTML=out;
    $('intervalNote').textContent=note;
    $('bodyControl').hidden=step<3;
  }
  function render() {
    if(!result)return;
    const fail=result.status!=='ok';
    $('failure').hidden=!fail;
    if(fail)$('failure').innerHTML=result.status==='no-anchor'?'<strong>停止：找不到可解析的分離投影。</strong><p>兩個物體確實不相交，但目前取樣沒有提供兩段足夠分離的正值區塊。這不表示數學上不可重建；只表示目前這個初始化規則不能啟動。後面步驟不會用真值補出來。</p>':'<strong>停止：內包絡尚未形成二維區域。</strong><p>目前取得的必存點不夠，不能啟動後續二維排除。</p>';
    if(fail&&step>2)step=2;
    const locked=step===3||step===6||step===7;
    $('angle').disabled=locked;$('detector').disabled=step===6||step===7;$('body').disabled=step===6||step===7;
    $('exampleRay').disabled=step===6||step===7;
    $('angle').value=String(j);$('detector').value=String(k);$('body').value=String(body);$('sValue').textContent=f(data.detector[k],2);
    const ray=currentRay();updateLesson(ray);drawObjects(ray);drawSinogram();drawProfile();drawIntervals(ray);
    [...$('steps').children].forEach((b,n)=>{b.setAttribute('aria-current',n===step?'step':'false');b.disabled=fail&&n>2;});
    $('previous').disabled=step===0;$('next').disabled=step===9||(fail&&step===2);
    $('previousBottom').disabled=$('previous').disabled;$('nextBottom').disabled=$('next').disabled;
    $('truth').disabled=step<2;if(step<2)$('truth').checked=true;$('roundPanel').hidden=step!==8;
    if(!fail){$('round').max=result.states.length-1;$('round').value=round;$('roundValue').value=round;
      $('history').innerHTML=result.states.map(s=>`<tr class="${s.round===round?'selected':''}"><td>${s.round}</td><td>${s.cuts}</td><td>${f(s.bound,6)}</td></tr>`).join('');}
  }
  function setStep(n) {step=n;chooseExample();render();document.querySelector('.lesson').scrollIntoView({block:'start'});}
  async function rebuild() {
    if(reconstructing)return;reconstructing=true;
    $('runStatus').textContent='正在由總 sinogram 重新計算全部幾何步驟…';$('exportPanel').hidden=true;
    $('preset').disabled=true;$('views').disabled=true;
    await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
    try {
      truth=($('preset').value==='demo'?F.demo:F.close).map(e=>({...e}));
      data=F.makeData(truth,Number($('views').value));
      const start=performance.now();result=G.reconstruct(data,{rounds:3});
      const elapsed=performance.now()-start;
      // Only presentation labels are ordered using truth; reconstruct() already finished.
      if(result.init.anchor>=0){const n=G.direction(data.angles[result.init.anchor]);truth.sort((a,b)=>a.cx*n[0]+a.cy*n[1]-b.cx*n[0]-b.cy*n[1]);}
      $('angle').innerHTML=data.angles.map((a,n)=>`<option value="${n}">${deg(a)}°</option>`).join('');
      $('detector').max=data.detector.length-1;
      defaultLower=pickLower(0);round=0;if(result.status!=='ok')step=0;chooseExample();render();
      $('runStatus').textContent=result.status==='ok'?`已由總資料計算 ${result.states.length-1} 輪。頁面示範運算 ${Math.round(elapsed)} ms（不是性能比較）。`:'已如實記錄初始化失敗；仍可查看資料與全域外包絡。';
    } catch(error) {
      $('runStatus').textContent=`計算停止：${error.message}`;console.error(error);
    } finally {$('preset').disabled=false;$('views').disabled=false;reconstructing=false;}
  }
  $('steps').innerHTML=names.map((name,n)=>`<button type="button" data-step="${n}" aria-current="${n===0?'step':'false'}"><span class="number">${String(n+1).padStart(2,'0')}</span>${name}</button>`).join('');
  $('steps').addEventListener('click',e=>{const b=e.target.closest('button');if(b&&!b.disabled)setStep(Number(b.dataset.step));});
  $('previous').addEventListener('click',()=>setStep(Math.max(0,step-1)));
  $('next').addEventListener('click',()=>setStep(Math.min(9,step+1)));
  $('previousBottom').addEventListener('click',()=>setStep(Math.max(0,step-1)));
  $('nextBottom').addEventListener('click',()=>setStep(Math.min(9,step+1)));
  $('preset').addEventListener('change',rebuild);$('views').addEventListener('change',rebuild);
  $('truth').addEventListener('change',render);
  $('angle').addEventListener('change',()=>{j=Number($('angle').value);render();});
  $('detector').addEventListener('input',()=>{k=Number($('detector').value);render();});
  $('body').addEventListener('change',()=>{body=Number($('body').value);if(step===4){const a=pickLower(body);if(a){j=a.j;k=a.k;}}render();});
  $('exampleRay').addEventListener('click',()=>{chooseExample();render();});
  $('round').addEventListener('input',()=>{round=Number($('round').value);render();});
  $('sinogram').addEventListener('click',e=>{
    if($('angle').disabled)return;
    const b=$('sinogram').getBoundingClientRect(),x=(e.clientX-b.left)/b.width*420,y=(e.clientY-b.top)/b.height*235;
    if(x<44||x>408||y<12||y>194)return;
    j=Math.min(data.angles.length-1,Math.floor((x-44)/364*data.angles.length));
    k=Math.max(0,Math.min(data.detector.length-1,data.detector.length-1-Math.floor((y-12)/182*data.detector.length)));render();
  });
  $('download').addEventListener('click',()=>{
    if(downloadURL)URL.revokeObjectURL(downloadURL);
    const payload={description:'Tutorial trace; no independent benchmark or rigorous floating-point certificate',input:data,assumptions:{components:2,disjoint:true,unitDensity:true,window:[-1.8,1.8],minimumProjectedWidthGreaterThanSpacing:true},result,simulationOnly:{ellipses:truth}};
    const json=JSON.stringify(payload,null,2);
    downloadURL=URL.createObjectURL(new Blob([json],{type:'application/json'}));
    $('saveJson').href=downloadURL;$('exportText').value=json;$('exportPanel').hidden=false;
    $('exportStatus').textContent=`已產生 ${json.length.toLocaleString()} 字元；包含總測量資料、中間包絡與獨立標記的模擬真值。`;
    $('exportPanel').scrollIntoView({block:'start'});
  });
  new ResizeObserver(()=>{if(result)drawIntervals(currentRay());}).observe($('intervalPanel'));
  rebuild();
})();
