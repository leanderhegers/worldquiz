// Leistungsprüfung: misst Ruckler und Aufhänger der Karte direkt auf dem Gerät.
// Aufruf: Seite mit ?perf öffnen (z. B. https://geo-quiz.de/?perf) – oder in der Konsole PerfTest.run().
// Die Datei wird nur dann geladen (siehe Ende von app.js), sie gehört nicht zum normalen Spiel und nicht zum Offline-Cache.
//
// Gemessen wird je Kartenprojektion: Aufbau der Karte, Zoomen (Mausrad), Ziehen und Überfahren (Hover).
// Bewertet wird die Zeit zwischen zwei Bildern: bis ~17 ms ist flüssig (60 Bilder/s), über 50 ms ist ein sichtbarer Ruckler,
// über 200 ms ein Aufhänger. Nach jeder Geste läuft die Messung noch kurz weiter, damit auch der Neuaufbau danach erfasst wird.
(function(){
'use strict';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
// Nächstes Bild abwarten; im Hintergrund-Tab gibt es keine Bilder, dann nach 250 ms weiter (Messung wird als ungültig markiert)
let starved=0;
const raf=()=>new Promise(r=>{let done=false;const to=setTimeout(()=>{if(!done){done=true;starved++;r(performance.now());}},250);
  requestAnimationFrame(()=>{if(!done){done=true;clearTimeout(to);r(performance.now());}});});
const q=(a,p)=>{if(!a.length)return 0;const s=a.slice().sort((x,y)=>x-y);return s[Math.min(s.length-1,Math.floor(p*s.length))];};
function summarize(name,gaps,extra){
  return Object.assign({name,frames:gaps.length,median:+q(gaps,.5).toFixed(1),p95:+q(gaps,.95).toFixed(1),max:+Math.max(0,...gaps).toFixed(0),
    jank:gaps.filter(g=>g>50).length,hang:gaps.filter(g=>g>200).length},extra||{});
}
// Geste Bild für Bild ausführen und die Bildabstände sammeln; danach `settle` ms nachlaufen lassen
async function measure(name,steps,stepFn,settle){
  const st=window.CanvasMap&&CanvasMap.stats,d0=st?st.draws:0,s0=st?(st.sumMs||0):0;if(st)st.maxMs=0;
  const gaps=[];let last=await raf();
  for(let i=0;i<steps;i++){stepFn(i);const now=await raf();gaps.push(now-last);last=now;}
  const t0=performance.now();while(performance.now()-t0<(settle==null?900:settle)){const now=await raf();gaps.push(now-last);last=now;}
  // Rechenzeit des Zeichnens (unabhängig von der Bildwiederholrate): daran sieht man, wie viel Luft ein langsames Gerät hat
  const n=st?st.draws-d0:0;
  return summarize(name,gaps,{draws:n,drawAvg:n?+(((st.sumMs||0)-s0)/n).toFixed(1):0,drawMax:st?+st.maxMs.toFixed(1):0});
}
const svgEl=()=>document.getElementById('map');
function pt(fx,fy){const r=svgEl().getBoundingClientRect();return [r.left+r.width*fx,r.top+r.height*fy];}
function wheel(dy,fx,fy){const [x,y]=pt(fx,fy);svgEl().dispatchEvent(new WheelEvent('wheel',{deltaY:dy,clientX:x,clientY:y,bubbles:true,cancelable:true,view:window}));}
function mouse(type,x,y,target){(target||svgEl()).dispatchEvent(new MouseEvent(type,{clientX:x,clientY:y,bubbles:true,cancelable:true,view:window,button:0,buttons:type==='mouseup'?0:1}));}
function pointer(type,x,y,target){(target||svgEl()).dispatchEvent(new PointerEvent(type,{clientX:x,clientY:y,bubbles:true,cancelable:true,view:window,pointerId:7,pointerType:'mouse',isPrimary:true,button:0,buttons:type==='pointerup'?0:1}));}

async function scenarioSet(label,isGlobe){
  const rows=[];
  // Aufbau: dreimal neu aufbauen, mittlere Dauer
  const b=[];for(let i=0;i<3;i++){const t=performance.now();renderMap(worldData);b.push(performance.now()-t);await sleep(120);}
  rows.push({name:label+' · Aufbau',frames:3,median:+q(b,.5).toFixed(0),p95:+Math.max(...b).toFixed(0),max:+Math.max(...b).toFixed(0),jank:b.filter(x=>x>50).length,hang:b.filter(x=>x>200).length});
  await sleep(500);
  // Zoom hinein und wieder heraus, abseits der Mitte
  rows.push(await measure(label+' · Zoom',50,i=>wheel(i<25?-160:160,0.62,0.4)));
  // Hineinzoomen und dort ziehen
  for(let i=0;i<8;i++){wheel(-200,0.5,0.45);await raf();}
  await sleep(700);
  {
    const [x0,y0]=pt(0.5,0.5);
    if(isGlobe){pointer('pointerdown',x0,y0);rows.push(await measure(label+' · Ziehen',45,i=>pointer('pointermove',x0+Math.sin(i/7)*140,y0+Math.cos(i/9)*70-70,window),0));pointer('pointerup',x0,y0,window);}
    else{mouse('mousedown',x0,y0);rows.push(await measure(label+' · Ziehen',45,i=>mouse('mousemove',x0+Math.sin(i/7)*140,y0+Math.cos(i/9)*70-70,window),0));mouse('mouseup',x0,y0,window);}
    rows.push(await measure(label+' · nach dem Loslassen',0,()=>{},900));
  }
  // Überfahren (Hover) quer über die Karte
  rows.push(await measure(label+' · Hover',45,i=>{const [x,y]=pt(0.15+0.7*i/45,0.35+0.25*Math.sin(i/6));mouse('mousemove',x,y);},300));
  // wieder ganz heraus
  for(let i=0;i<14;i++){wheel(300,0.5,0.5);await raf();}
  await sleep(600);
  return rows;
}

async function run(opts){
  opts=opts||{};
  if(typeof worldData==='undefined'||!worldData){if(typeof loadMap==='function'){showScreen('game-screen');await loadMap();}}
  const keep={projection,theme};
  const rows=[];starved=0;
  const longTasks=[];let po=null;
  try{po=new PerformanceObserver(l=>{for(const e of l.getEntries())longTasks.push(Math.round(e.duration));});po.observe({entryTypes:['longtask']});}catch(e){}
  const projs=opts.projections||['mercator','natural','equal','globe'];
  const names={mercator:'Mercator',natural:'Natural Earth',equal:'Equal Earth',globe:'Globus'};
  for(const p of projs){
    status('Messe '+names[p]+' …');
    if(projection!==p)setProjection(p);
    startGame('world');await sleep(1600);
    rows.push(...await scenarioSet(names[p],p==='globe'));
  }
  if(!opts.quick){
    status('Messe Drop a Pin und Flüsse …');
    setProjection('mercator');
    await startPinGame('EU');await sleep(1600);
    rows.push(...(await scenarioSet('Drop a Pin (Mercator)',false)).filter(r=>/Zoom|Ziehen$/.test(r.name)));
    if(typeof startRiverGame==='function'){await startRiverGame('hard');await sleep(1600);
      rows.push(...(await scenarioSet('Flüsse (Mercator)',false)).filter(r=>/Zoom|Ziehen$|Hover/.test(r.name)));}
  }
  if(po)po.disconnect();
  if(projection!==keep.projection)setProjection(keep.projection);
  if(typeof back==='function')back();
  const res={build:typeof BUILD_ID!=='undefined'?BUILD_ID:'?',when:new Date().toISOString(),ua:navigator.userAgent,
    screen:innerWidth+'x'+innerHeight+' @'+(window.devicePixelRatio||1),valid:starved<5,starved,
    longTasks:{count:longTasks.length,max:longTasks.length?Math.max(...longTasks):0},rows};
  window.__perfResult=res;show(res);return res;
}

// ── Anzeige ──
let box=null;
function ensureBox(){
  if(box)return box;
  box=document.createElement('div');
  box.style.cssText='position:fixed;left:8px;right:8px;bottom:8px;max-height:70vh;overflow:auto;z-index:99999;background:rgba(10,14,22,.96);color:#e8eef5;font:12px/1.35 system-ui,sans-serif;border:1px solid #33415a;border-radius:10px;padding:10px;box-shadow:0 8px 30px rgba(0,0,0,.5)';
  document.body.appendChild(box);return box;
}
function status(txt){const b=ensureBox();b.innerHTML='<b>Leistungsprüfung läuft</b> – bitte nichts anfassen.<br>'+txt;}
function show(res){
  const b=ensureBox();
  const col=r=>r.hang?'#ff8a7a':r.jank>2?'#ffc66b':'#8be0a4';
  const txt=['Build '+res.build+' · '+res.screen+(res.valid?'':' · UNGÜLTIG (Tab im Hintergrund)'),
    ...res.rows.map(r=>r.name+': Mittel '+r.median+' ms, 95% '+r.p95+' ms, max '+r.max+' ms, Ruckler '+r.jank+', Aufhänger '+r.hang+(r.draws?', Zeichnen Ø '+r.drawAvg+' / max '+r.drawMax+' ms':'')),
    'Lange Aufgaben: '+res.longTasks.count+' (längste '+res.longTasks.max+' ms)',res.ua].join('\n');
  b.innerHTML='<div style="display:flex;gap:8px;align-items:center;margin-bottom:6px"><b style="flex:1">Leistungsprüfung · Build '+res.build+'</b>'+
    '<button id="pf-copy" style="padding:4px 10px">Kopieren</button><button id="pf-again" style="padding:4px 10px">Nochmal</button><button id="pf-close" style="padding:4px 10px">Schließen</button></div>'+
    (res.valid?'':'<div style="color:#ff8a7a">Messung ungültig: der Tab war nicht sichtbar.</div>')+
    '<table style="border-collapse:collapse;width:100%"><tr style="text-align:left;color:#9fb0c8"><th>Ablauf</th><th>Mittel</th><th>95 %</th><th>Max</th><th>Ruckler</th><th>Aufhänger</th><th>Zeichnen Ø/max</th></tr>'+
    res.rows.map(r=>'<tr style="color:'+col(r)+'"><td>'+r.name+'</td><td>'+r.median+'</td><td>'+r.p95+'</td><td>'+r.max+'</td><td>'+r.jank+'</td><td>'+r.hang+'</td><td>'+(r.draws?r.drawAvg+' / '+r.drawMax:'–')+'</td></tr>').join('')+'</table>'+
    '<div style="color:#9fb0c8;margin-top:6px">Angaben in ms je Bild. Ruckler: Bild länger als 50 ms · Aufhänger: länger als 200 ms. '+res.screen+'</div>';
  b.querySelector('#pf-close').onclick=()=>{b.remove();box=null;};
  b.querySelector('#pf-again').onclick=()=>run();
  b.querySelector('#pf-copy').onclick=()=>{try{navigator.clipboard.writeText(txt);}catch(e){}};
}
window.PerfTest={run,measure};
if(/[?&]perf\b/.test(location.search)){
  const b=ensureBox();
  b.innerHTML='<b>Leistungsprüfung</b><br>Misst Zoomen, Ziehen und Überfahren in allen Kartenansichten (ca. 1 Minute). Währenddessen bitte nichts anfassen.<br><button id="pf-go" style="margin-top:8px;padding:8px 16px;font-size:14px">Messung starten</button>';
  b.querySelector('#pf-go').onclick=()=>run();
}
})();
