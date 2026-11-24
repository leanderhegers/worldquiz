// Spielmodus "Kürzester Weg": Auf der Karte sind nur ZWEI Länder zu sehen (Start und Ziel), die nicht nebeneinander liegen. Alles andere – Meer, Gradnetz,
// Nachbarländer – ist unsichtbar. Man tippt Länder ein, die an ein sichtbares Land grenzen; jede richtige Eingabe taucht auf der Karte auf. Erreicht ein
// eingetipptes Land das Ziel, ist die Runde geschafft. Gewertet wird, wie nah man am kürzesten Weg war.
//
// Läuft auf dem normalen Kartenbildschirm (game.fillMode + game.fillPath), damit Zurück/Neustart/Statistik/Bestwert der Karte-ausfüllen-Spiele mitlaufen
// (siehe Haken in app.js und fill.js). Die Namenserkennung (4 Sprachen, Tippfehler) kommt aus fill.js (window.fillResolve).
// Nachbarschaft: topojson.neighbors() auf den echten Grenzen der Karte; Mikrostaaten (ohne Fläche in den Daten) von Hand ergänzt.
// Mehrspieler (duel.js, Modus 'path'): alle bekommen dieselben Start/Ziel-Paare ("a-b" als Text, Firestore kennt keine verschachtelten Listen).
(function(){
'use strict';
const ROUNDS=5;
// Schwierigkeit = Länder insgesamt inkl. Start und Ziel: Leicht 4–6, Mittel 7–11, Schwer 12–20 (= 3–5, 6–10, 11–19 Grenzübergänge)
const DIFF={easy:[3,5],medium:[6,10],hard:[11,19]};
const MIX=['easy','easy','medium','medium','hard'];
// Mikrostaaten ohne eigene Fläche (Monaco, Andorra, San Marino, Vatikan, Liechtenstein …) kommen im Kürzester-Weg-Spiel nicht vor: Sie wären nur als kleine Kreise sichtbar.
// Frankreichs Fläche enthält Französisch-Guayana: die Grenzen zu Brasilien und Suriname sind keine Landgrenzen des Mutterlandes (sonst gäbe es eine Landbrücke Europa–Südamerika)
// Echte Landgrenzen, die in den vereinfachten Kartendaten fehlen (Nigeria–Tschad liegt mitten im Tschadsee)
const EXTRA_EDGES=[[566,148]];
const NO_EDGE=new Set(['250-76','76-250','250-740','740-250']);
const COL_START='#4f8cff',COL_GOAL='#ff9f1c',COL_DETOUR='#e8622c',BG='#0d1420';
let graph=null,boxTimer=0,nextT=0,prevProj=null;
const P=()=>game&&game.fillPath;
const L4=(de,en,es,fr)=>({de,en,es,fr}[typeof lang!=='undefined'&&{de:1,en:1,es:1,fr:1}[lang]?lang:'de']);

// ── Nachbarschaftsgraph ──
async function ensureGraph(){
  if(graph)return graph;
  if(!worldData)await loadMap();
  const feats=_topoCached(worldData,'countries').features;
  // Russland ohne Kaliningrad: sonst grenzen Polen und Litauen an Russland
  const geoms=worldData.objects.countries.geometries.map((g,i)=>{if(+feats[i].id!==643||g.type!=='MultiPolygon')return g;const keep=feats[i].geometry.coordinates.map(p=>!isKaliningradPoly(p));return {...g,arcs:g.arcs.filter((_,k)=>keep[k])};});
  const nb=topojson.neighbors(geoms);
  const adj=new Map();
  const msd=new Set((typeof MICROSTATES!=='undefined'?MICROSTATES:[]).map(m=>m.id));
  const add=(a,b)=>{if(a===b||!C[a]||!C[b]||msd.has(a)||msd.has(b)||NO_EDGE.has(a+'-'+b))return;(adj.get(a)||adj.set(a,new Set()).get(a)).add(b);(adj.get(b)||adj.set(b,new Set()).get(b)).add(a);};
  feats.forEach((f,i)=>{const a=+f.id;if(!(a>0)||!C[a])return;nb[i].forEach(j=>{const b=+feats[j].id;if(b>0&&C[b])add(a,b);});});
  EXTRA_EDGES.forEach(([a,b])=>add(a,b));
  const cent=new Map();
  feats.forEach(f=>{const id=+f.id;if(!(id>0)||!C[id])return;let g=f;
    if(f.geometry&&f.geometry.type==='MultiPolygon'){let best=null,ba=-1;f.geometry.coordinates.forEach(c=>{const pf={type:'Feature',geometry:{type:'Polygon',coordinates:c}};const ar=d3.geoArea(pf);if(ar>ba){ba=ar;best=pf;}});g=best||f;}
    cent.set(id,d3.geoCentroid(g));});
  (typeof MICROSTATES!=='undefined'?MICROSTATES:[]).forEach(m=>{if(!cent.has(m.id))cent.set(m.id,[m.lon,m.lat]);});
  graph={adj,cent};
  return graph;
}
function bfs(from,adj){const d=new Map([[from,0]]),prev=new Map(),q=[from];
  for(let i=0;i<q.length;i++){const u=q[i];for(const v of adj.get(u)||[])if(!d.has(v)){d.set(v,d.get(u)+1);prev.set(v,u);q.push(v);}}
  return {d,prev};}
function route(from,to,adj){const {prev}=bfs(from,adj);const r=[to];let u=to;while(u!==from){u=prev.get(u);if(u==null)return null;r.unshift(u);}return r;}
// bekannte Länder als Start/Ziel (sonst sind die Aufgaben unfair obskur)
function knownIds(){const s=new Set();[typeof FLAG_BEGINNER!=='undefined'?FLAG_BEGINNER:[],typeof FLAG_EASY!=='undefined'?FLAG_EASY:[],typeof FLAG_MEDIUM!=='undefined'?FLAG_MEDIUM:[]].forEach(x=>x.forEach(i=>s.add(i)));return s;}
// n Paare "a-b" ziehen. diff: easy | medium | hard | all (gemischt: 2 leicht, 2 mittel, 1 schwer). Start und Ziel wiederholen sich nicht.
async function makePairs(n,diff,km){
  const {adj}=await ensureGraph(),known=knownIds();
  const pool=[...adj.keys()].filter(i=>known.has(i)&&adj.get(i).size>0),all=[...adj.keys()].filter(i=>adj.get(i).size>0);
  const plan=[];for(let i=0;i<n;i++)plan.push(DIFF[diff]?diff:MIX[i%MIX.length]);
  const out=[],used=new Set();
  for(const df of plan){
    const [lo,hi]=DIFF[df];let got=null;
    for(const nodes of [pool,all]){ // erst bekannte Länder, notfalls alle
      for(let g=0;g<400&&!got;g++){
        const a=nodes[Math.floor(Math.random()*nodes.length)];if(used.has(a))continue;
        const d=km?(()=>{const m=new Map(),{d:kd}=kmFrom(a);for(const b of kd.keys()){if(b===a)continue;const r=kmRoute(a,b);if(r)m.set(b,r.length-1);}return m;})():bfs(a,adj).d;
        const cand=nodes.filter(b=>!used.has(b)&&d.get(b)>=lo&&d.get(b)<=hi);
        if(cand.length)got=a+'-'+cand[Math.floor(Math.random()*cand.length)];
      }
      if(got)break;
    }
    if(got){out.push(got);got.split('-').forEach(x=>used.add(+x));}
  }
  return out;
}
// Gibt es mehrere gleich kurze Wege (gleich viele Länder), ist der richtig, dessen Luftlinie – Summe der Strecken von Landesmitte zu Landesmitte – am kürzesten ist.
const gd=(u,v)=>d3.geoDistance(graph.cent.get(u),graph.cent.get(v))*6371;
const routeKm=r=>{let t=0;for(let i=1;i<r.length;i++)t+=gd(r[i-1],r[i]);return t;};
function bestRoute(a,b){
  const adj=graph.adj,da=distTo(a),db=distTo(b),D=da.get(b),best=new Map([[a,{c:0,prev:null}]]);
  const layers=[];for(const [n,d] of da)if(d>=1&&d<D&&d+db.get(n)===D)(layers[d]=layers[d]||[]).push(n);
  layers[D]=[b];
  for(let k=1;k<=D;k++)for(const n of layers[k]||[]){
    let bc=Infinity,bp=null;
    for(const p of adj.get(n))if(da.get(p)===k-1&&best.has(p)){const c=best.get(p).c+gd(p,n);if(c<bc){bc=c;bp=p;}}
    if(bp!=null)best.set(n,{c:bc,prev:bp});
  }
  const r=[b];let u=b;while(u!==a){u=best.get(u).prev;r.unshift(u);}
  return r;
}
// Modus Luftlinie: kürzester Weg nach Kilometern (Dijkstra über die Nachbarschaft, Strecke = Landesmitte zu Landesmitte)
const _kcache=new Map();
function kmFrom(a){let m=_kcache.get(a);if(m)return m;const d=new Map([[a,0]]),prev=new Map(),done=new Set();
  for(;;){let u=null,best=Infinity;for(const [n,v] of d)if(!done.has(n)&&v<best){best=v;u=n;}if(u==null)break;done.add(u);
    for(const v of graph.adj.get(u)||[]){const c=best+gd(u,v);if(!d.has(v)||c<d.get(v)-1e-9){d.set(v,c);prev.set(v,u);}}}
  m={d,prev};_kcache.set(a,m);return m;}
function kmRoute(a,b){const {prev}=kmFrom(a);const r=[b];let u=b;while(u!==a){u=prev.get(u);if(u==null)return null;r.unshift(u);}return r;}
const KM_TOL=1.002,KM_DETOUR=1.15; // KM_TOL: gleich kurz; KM_DETOUR: noch erlaubter Umweg
const _dcache=new Map();
function distTo(a){let m=_dcache.get(a);if(!m){m=bfs(a,graph.adj).d;_dcache.set(a,m);}return m;}

// ── Anzeige: nur gezeigte Länder sichtbar ──
function shownSet(){const p=P();return p?p.shown:new Set();}
function pathColor(rawId){
  const id=eff(rawId),p=P();if(!p)return 'transparent';
  if(!p.shown.has(id))return 'transparent';
  if(id===p.b&&!p.reached)return COL_GOAL;
  if(id===p.a)return COL_START;
  if(p.reached&&id===p.b)return COL_GOAL;
  if(p.reveal&&p.reveal.has(id))return COL_GOAL;
  return p.detour&&p.typed.includes(id)?COL_DETOUR:THEMES[theme].found; // zweitbester Weg (ein Land mehr): orange
}
function pathStyle(){ // nach jedem updateColors(): Meer, Gradnetz und Linien unsichtbar machen
  const p=P();if(!p)return;const th=THEMES[theme];
  d3.selectAll('#map .ocean,#map .sphere').attr('fill',BG).attr('stroke','none');
  d3.selectAll('#map .grat,#map path.coastline').style('display','none');
  if(typeof borderPath!=='undefined'&&borderPath)borderPath.style('display','none');
  d3.selectAll('#map .rivers,#map .lakes,#map .fgui-overlay,#map .iz-vis,#map .iz-hits').style('display','none');
  const bg=document.getElementById('map-bg');if(bg)bg.style.background=BG;
  if(countryPaths)countryPaths.attr('stroke',d=>shownSet().has(eff(+d.id))?'rgba(255,255,255,.8)':'none').attr('stroke-width',1.2).style('vector-effect','non-scaling-stroke');
  if(microstateDots)microstateDots.attr('fill',d=>shownSet().has(d.id)?pathColor(d.id):'transparent').attr('stroke',d=>shownSet().has(d.id)?'#fff':'none');
  drawArrow();
}
// ── Pfeil vom Start zum Ziel ──
// Ein kleiner Pfeil zwischen Start (blau) und Ziel (orange) zeigt die Richtung; nach der ersten richtigen Eingabe verschwindet er. Er liegt als Pfad in der dyn-Ebene der Karte (wird von
// der Canvas-Karte mitgemalt); die Pfeilspitze hat in Bildschirmpixeln immer dieselbe Größe (projPx), Neuzeichnen bei jedem Zoomschritt über applyDotR.
function arrowGeo(){
  const p=P();if(!p||!graph||typeof currentProj!=='function'||typeof projPx!=='function')return null;
  const S=graph.cent.get(p.a),G=graph.cent.get(p.b);if(!S||!G)return null;
  const s0=currentProj(S),g0=currentProj(G);if(!s0||!g0||!isFinite(s0[0])||!isFinite(g0[0]))return null;
  const dx=g0[0]-s0[0],dy=g0[1]-s0[1],len=Math.hypot(dx,dy);if(len<1e-6)return null;
  const ux=dx/len,uy=dy/len,nx=-uy,ny=ux,px=projPx(1),head=11*px,half=Math.min(15*px,len*.2);
  const mx=s0[0]+dx*.3,my=s0[1]+dy*.3; // näher am Startland, aber nicht zu nah
  const st=[mx-ux*half,my-uy*half],tip=[mx+ux*half,my+uy*half],bs=[tip[0]-ux*head,tip[1]-uy*head];
  return{line:'M'+st[0]+' '+st[1]+'L'+bs[0]+' '+bs[1],head:'M'+tip[0]+' '+tip[1]+'L'+(bs[0]+nx*head*.6)+' '+(bs[1]+ny*head*.6)+'L'+(bs[0]-nx*head*.6)+' '+(bs[1]-ny*head*.6)+'Z'};
}
function drawArrow(){
  const p=P(),old=d3.select('#map .dyn #path-arrow');
  if(!p||p.roundDone||p.reached||p.typed.length||projection==='globe'){old.remove();return;}
  const g=arrowGeo(),dyn=d3.select('#map .dyn');if(!g||dyn.empty()){old.remove();return;}
  let grp=old;
  if(grp.empty()){
    grp=dyn.append('g').attr('id','path-arrow').attr('pointer-events','none');
    grp.append('path').attr('class','pa-o').attr('fill','none').attr('stroke','rgba(0,0,0,.65)').attr('stroke-width',6.5).attr('stroke-linecap','round').style('vector-effect','non-scaling-stroke');
    grp.append('path').attr('class','pa-l').attr('fill','none').attr('stroke',COL_GOAL).attr('stroke-width',3).attr('stroke-linecap','round').style('vector-effect','non-scaling-stroke');
    grp.append('path').attr('class','pa-ho').attr('fill','rgba(0,0,0,.65)').attr('stroke','rgba(0,0,0,.65)').attr('stroke-width',3).attr('stroke-linejoin','round').style('vector-effect','non-scaling-stroke');
    grp.append('path').attr('class','pa-h').attr('fill',COL_GOAL).attr('stroke',COL_GOAL).attr('stroke-width',1).attr('stroke-linejoin','round').style('vector-effect','non-scaling-stroke');
  }
  grp.select('.pa-o').attr('d',g.line);grp.select('.pa-l').attr('d',g.line);grp.select('.pa-ho').attr('d',g.head);grp.select('.pa-h').attr('d',g.head);
}
// Ausschnitt auf alle gezeigten Länder
function fitShown(){
  if(!countryPaths||!P())return;
  const pts=[];
  countryPaths.each(function(d){if(!shownSet().has(eff(+d.id)))return;let b=d3.geoBounds(d);if(b[0][0]>b[1][0])b=[[b[0][0]-360,b[0][1]],b[1]];
    [[b[0][0],b[0][1]],[b[1][0],b[1][1]],[b[0][0],b[1][1]],[b[1][0],b[0][1]]].forEach(c=>pts.push({lon:Math.max(-179.9,Math.min(179.9,c[0])),lat:c[1]}));});
  (MICROSTATES||[]).forEach(m=>{if(shownSet().has(m.id)){pts.push({lon:m.lon-2,lat:m.lat-2});pts.push({lon:m.lon+2,lat:m.lat+2});}});
  if(!pts.length)return;
  const z=cityZoom(pts);if(z)zoomTo(z[0],z[1],Math.min(z[2],12));
}

// ── Eingabefeld (schwebend, wie bei Karte ausfüllen) ──
function msg(text,col){const el=document.getElementById('path-msg');if(!el)return;el.innerHTML=text;el.style.color=col||'#cfd8e3';el.style.opacity=text?1:0;clearTimeout(boxTimer);if(text&&!(P()&&P().roundDone))boxTimer=setTimeout(()=>{el.style.opacity=0;},2600);}
function shake(){const b=document.getElementById('path-box');if(!b)return;b.classList.remove('fill-shake');void b.offsetWidth;b.classList.add('fill-shake');}
function ensureBox(){
  const bg=document.getElementById('map-bg');if(!bg)return;
  let b=document.getElementById('path-box');
  if(!b){
    b=document.createElement('div');b.id='path-box';
    b.innerHTML='<div class="path-row" id="path-row"><input id="path-input" type="text" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" enterkeyhint="done"><button id="path-hint" type="button">💡</button></div><div id="path-msg"></div>';
    bg.appendChild(b);
    const inp=b.querySelector('#path-input');
    inp.addEventListener('input',onInput);
    inp.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();clearTimeout(pend);submit(true);}});
    b.querySelector('#path-hint').addEventListener('click',hint);
    b.addEventListener('pointerdown',e=>e.stopPropagation());
  }
  b.style.display='';b.querySelector('#path-row').style.display='';
  b.querySelector('#path-input').placeholder=L4('Land eingeben …','Type a country …','Escribe un país …','Tape un pays …');
  b.querySelector('#path-hint').title=L4('Tipp (−10 Punkte)','Hint (−10 points)','Pista (−10 puntos)','Indice (−10 points)');
  msg('');
}
let pend=0;
function onInput(){
  clearTimeout(pend);const inp=document.getElementById('path-input'),p=P();if(!inp||!p||p.roundDone)return;
  const s=norm(inp.value.trim());if(s.length<3)return;
  const id=window.fillResolve(inp.value,false);if(id==null)return;
  // „Niger“ vs. „Nigeria“: kurz warten, ob noch weitergetippt wird
  const longer=window.fillHasLonger&&window.fillHasLonger(s);
  if(longer){pend=setTimeout(()=>submit(false),750);return;}
  submit(false);
}
function submit(fuzzy){
  const p=P(),inp=document.getElementById('path-input');if(!p||!inp||p.roundDone)return;
  const v=inp.value;if(!v.trim())return;
  let id=window.fillResolve(v,fuzzy);
  const {adj}=graph;
  // Nur der kürzeste Weg zählt: ein Land gilt, wenn es auf einem kürzesten Weg Start → Ziel liegt UND der nächste Schritt nach dem bisherigen Ende ist
  // (Deutschland → Portugal: nur Frankreich, Spanien; Belgien wäre ein Umweg und damit falsch)
  const da=distTo(p.a),db=distTo(p.b),end=p.typed.length?p.typed[p.typed.length-1]:p.a;
  const onShortest=i=>p.km?kmFrom(p.a).d.has(i)&&kmFrom(p.b).d.has(i)&&kmFrom(p.a).d.get(i)+kmFrom(p.b).d.get(i)<=p.bestKm*KM_TOL:da.get(i)+db.get(i)===p.D;
  // Gesamtlänge des Weges, wenn i als Nächstes kommt (Länder bisher + i + kürzester Rest). Ein Land mehr als nötig (D+1) gilt als zweitbester Weg.
  const tot=i=>p.typed.length+1+db.get(i);
  const sofar=p.km?routeKm([p.a,...p.typed]):0,kmTot=i=>sofar+gd(end,i)+kmFrom(p.b).d.get(i); // Luftlinie: Länge des Weges über i bis zum Ziel
  const nextOk=i=>adj.has(i)&&adj.get(end).has(i)&&db.has(i)&&(p.km?kmTot(i)<=p.bestKm*KM_DETOUR:tot(i)<=p.D+1);
  const valid=i=>!p.shown.has(i)&&nextOk(i);
  if(id==null&&fuzzy){ // nur ein Wortteil getippt (z. B. "Kongo"): unter den möglichen Zügen gibt es oft genau einen Treffer
    const c=(window.fillCandidates?window.fillCandidates(v):[]).filter(valid);
    if(c.length===1)id=c[0];
    else if(c.length>1){msg(L4('Mehrdeutig – bitte genauer','Ambiguous – please be more specific','Ambiguo – sé más preciso','Ambigu – soyez plus précis')+': '+c.slice(0,3).map(cn).join(', '),'#e0b84a');inp.select();shake();return;}
  }
  const key=norm(v.trim());
  const miss=text=>{if(p.lastMiss!==key){p.wrong++;p.lastMiss=key;}msg(text,'#ff7a6a');inp.select();shake();updatePathStats();};
  if(id==null){if(fuzzy)miss(L4('Kein Land gefunden','No country found','País no encontrado','Aucun pays trouvé'));return;}
  if(p.shown.has(id)){msg(L4('Schon sichtbar','Already visible','Ya visible','Déjà visible')+': '+cn(id),'#e0b84a');inp.select();shake();return;}
  if(!adj.has(id)){miss(cn(id)+' – '+L4('keine Landgrenze zu einem anderen Land','no land border to another country','sin frontera terrestre','pas de frontière terrestre'));return;}
  const notShortest=cn(id)+' – '+L4('nicht auf dem kürzesten Weg','not on the shortest route','no está en el camino más corto','pas sur le chemin le plus court');
  if(!adj.get(end).has(id)){
    if(onShortest(id)){msg('↪ '+cn(id)+': '+L4('liegt auf dem kürzesten Weg, ist aber noch nicht dran – es grenzt nicht an','is on the shortest route but is not next yet – it does not touch','está en el camino más corto pero aún no toca – no limita con','est sur le chemin le plus court mais pas encore – ne touche pas')+' '+cn(end),'#e0b84a');inp.select();shake();}
    else miss(notShortest);
    return;
  }
  if(!nextOk(id)){miss(notShortest);return;}
  // richtig
  if(p.km){if(kmTot(id)>p.bestKm*KM_TOL)p.detour=true;}else if(tot(id)>p.D)p.detour=true; // zweitbester Weg
  p.shown.add(id);p.typed.push(id);p.lastMiss=null;inp.value='';
  const reached=adj.get(id).has(p.b);
  msg('✓ '+cn(id),'#4fd18b');
  if(reached){p.reached=true;endRound(false);}
  updateColors();fitShown();updatePathStats();
}
function hint(){
  const p=P();if(!p||p.roundDone)return;
  const {adj}=graph;
  // der nächste Schritt eines kürzesten Weges wird verraten (Anfangsbuchstabe)
  const da=distTo(p.a),db=distTo(p.b),end=p.typed.length?p.typed[p.typed.length-1]:p.a;
  const goal=p.D+(p.detour?1:0),sofar=p.km?routeKm([p.a,...p.typed]):0;
  const opts=[...adj.get(end)].filter(i=>i!==p.b&&!p.shown.has(i)&&db.has(i)&&(p.km?sofar+gd(end,i)+kmFrom(p.b).d.get(i)<=(p.detour?p.bestKm*KM_DETOUR:p.bestKm*KM_TOL):p.typed.length+1+db.get(i)===goal));
  const onBest=!p.detour&&p.typed.every((x,i)=>x===p.best[i+1]);
  const nxt=onBest?p.best[p.typed.length+1]:opts[Math.floor(Math.random()*opts.length)];
  if(nxt==null||nxt===p.b)return;
  p.hints++;const n=cn(nxt);
  msg('💡 '+L4('Ein Land mit','A country starting with','Un país que empieza por','Un pays commençant par')+' <b>'+n[0].toUpperCase()+'</b> … ('+[...n].length+')','#ffd166');
  updatePathStats();const inp=document.getElementById('path-input');if(inp)inp.focus();
}

// ── Runden ──
function pts(p,best,mineKm){if(p.km){const r=best?1:Math.min(1,p.bestKm/mineKm);return Math.max(0,Math.round(100*r*r)-5*p.wrong-10*p.hints);}return Math.max(0,(p.detour?40:best?100:60)-5*p.wrong-10*p.hints);} // 100 = kürzester Weg mit kürzester Luftlinie, 60 = gleich viele Länder, 40 = zweitbester Weg (ein Land mehr); Fehler −5, Tipp −10
function endRound(gaveUp){
  const p=P();if(!p||p.roundDone)return;
  p.roundDone=true;const adj=graph.adj;
  const r=p.best;
  const mine=[p.a,...p.typed,p.b],mineKm=routeKm(mine),same=!gaveUp&&(p.km?mineKm<=p.bestKm*KM_TOL:mine.length===r.length&&mine.every((x,i)=>x===r[i]));
  const got=gaveUp?0:pts(p,same,mineKm);p.total+=got;p.results.push({got,used:p.typed.length,opt:p.opt});
  if(gaveUp){p.reveal=new Set(r.slice(1,-1));r.forEach(i=>p.shown.add(i));}
  const names=r.map(cn).join(' → ');
  const row=document.getElementById('path-row');if(row)row.style.display='none';
  const last=p.round>=p.pairs.length-1;
  const head=(!gaveUp&&p.km&&!same)?'✅ '+L4('Gültiger Weg, aber länger','Valid route, but longer','Camino válido, pero más largo','Chemin valide, mais plus long'):(!gaveUp&&p.detour)?'🟠 '+L4('Zweitbester Weg','Second-best route','Segundo mejor camino','Deuxième meilleur chemin'):gaveUp?'🏳️ '+L4('Aufgegeben','Gave up','Rendido','Abandon'):(same?'🏆 '+L4('Kürzester Weg!','Shortest path!','¡Camino más corto!','Chemin le plus court !'):'✅ '+L4('Gleich viele Länder, aber längere Luftlinie','Same number of countries, but longer air distance','Mismo número de países, pero mayor distancia en línea recta','Même nombre de pays, mais distance à vol d’oiseau plus longue'));
  const kmTxt=(!gaveUp&&!same&&(p.km||!p.detour))?'<div style="font-size:12px;opacity:.8;margin-bottom:4px">'+Math.round(routeKm(mine))+' km '+L4('statt','instead of','en vez de','au lieu de')+' '+Math.round(p.bestKm)+' km</div>':'';
  msg('<div class="fill-done">'+head+' · +'+got+'</div>'+kmTxt+'<div style="font-size:13px;opacity:.85;margin-bottom:8px">'+L4('Beste Route','Best route','Mejor ruta','Meilleure route')+': '+names+'</div><button type="button" id="path-next">'+(last?L4('Ergebnis','Result','Resultado','Résultat'):L4('Weiter','Next','Siguiente','Suivant'))+'</button>','#fff');
  const nb=document.getElementById('path-next');if(nb)nb.addEventListener('click',nextRound);
  updateColors();fitShown();updatePathStats();
  if(p.duel&&typeof duelPathProgress==='function')duelPathProgress(p);
}
function nextRound(){
  const p=P();if(!p||!p.roundDone)return;
  if(p.round>=p.pairs.length-1){finishGame();return;}
  p.round++;loadRound();
}
function loadRound(){
  const p=P();const [a,b]=p.pairs[p.round].split('-').map(Number);
  p.a=a;p.b=b;p.shown=new Set([a,b]);p.typed=[];p.wrong=0;p.hints=0;p.reached=false;p.roundDone=false;p.reveal=null;p.detour=false;
  if(p.km){p.best=kmRoute(a,b);p.D=p.best.length-1;p.opt=p.D-1;p.bestKm=routeKm(p.best);}else{p.D=distTo(a).get(b);p.opt=p.D-1;p.best=bestRoute(a,b);p.bestKm=routeKm(p.best);}
  ensureBox();updateColors();fitShown();updatePathStats();
  const inp=document.getElementById('path-input');if(inp){inp.value='';if(!COARSE)setTimeout(()=>inp.focus(),50);}
}
function finishGame(){
  const p=P();if(!p)return;
  game.fillDone=true;
  const tot=p.pairs.length*100,pct=Math.round(p.total/tot*100);
  let note='';
  if(!p.duel&&typeof recordScore==='function'){const isBest=recordScore(gameScoreKey(),p.total,tot);if(isBest)note=' · 🏆 '+t('newRecord');else{const b=typeof bestScore==='function'?bestScore(gameScoreKey()):null;if(b)note=' · '+t('bestLabel')+' '+b.pct+'%';}}
  const box=document.getElementById('path-box');if(box)box.style.display='none';
  if(p.duel&&typeof duelPathFinish==='function'){duelPathFinish(p);return;}
  showScreen('result-screen');
  $('res-btn-back').textContent=t('back');
  $('res-emoji').textContent=pct>=85?'🏆':pct>=60?'🎉':pct>=35?'👍':'📚';
  $('res-title').textContent=L4('Kürzester Weg','Shortest path','Camino más corto','Chemin le plus court');
  $('res-l1').textContent=p.total+' / '+tot+' '+L4('Punkte','points','puntos','points')+' ('+pct+' %)';
  $('res-l2').textContent=p.results.map((r,i)=>(i+1)+': '+r.got).join(' · ')+note;
  $('btn-again').textContent=t('again');$('btn-new').textContent=t('newgame');$('btn-share').textContent=t('shareBtn');
  if(typeof checkAchievements==='function')checkAchievements();
}
function updatePathStats(){
  const p=P();if(!p)return;
  $('find-label').textContent=L4('Kürzester Weg','Shortest path','Camino más corto','Chemin le plus court')+(p.km?' ('+L4('Luftlinie','air distance','línea recta','à vol d’oiseau')+')':'')+' · '+cn(p.a)+' → '+cn(p.b);
  $('target-name').textContent=L4('Runde','Round','Ronda','Manche')+' '+(p.round+1)+' / '+p.pairs.length;
  const sk=$('btn-skip');if(sk){sk.style.display=(p.roundDone||game.fillDone)?'none':'';sk.textContent=L4('Aufgeben','Give up','Rendirse','Abandonner');}
  $('score-disp').textContent=p.total+(p.roundDone?'':'');$('found-label').textContent=L4('Punkte','Points','Puntos','Points');
  $('stat-c').textContent=p.typed.length;$('lbl-c').textContent=L4('Länder','Countries','Países','Pays');
  $('stat-w').textContent=p.wrong;$('lbl-w').textContent=L4('Fehler','Misses','Fallos','Erreurs');
  $('stat-s').textContent=p.hints;$('lbl-s').textContent=L4('Tipps','Hints','Pistas','Indices');
  $('stat-r').textContent=(p.pairs.length-p.round-(p.roundDone?1:0))+' '+L4('Runden übrig','rounds left','rondas restantes','manches restantes');
  $('prog-bar').style.width=Math.round((p.round+(p.roundDone?1:0))/p.pairs.length*100)+'%';
}
function pathGiveUp(){const p=P();if(p&&!p.roundDone&&!game.fillDone)endRound(true);}
function pathStop(){
  d3.select('#map .dyn #path-arrow').remove();
  clearTimeout(boxTimer);clearTimeout(pend);
  if(prevProj!==null){projection=prevProj;prevProj=null;}
  const b=document.getElementById('path-box');if(b)b.style.display='none';
  const bg=document.getElementById('map-bg');if(bg)bg.style.background='';
  const sk=document.getElementById('btn-skip');if(sk)sk.setAttribute('onclick','skip()');
}
async function startPathGame(opts){
  opts=opts||{};
  if(typeof fillStop==='function')fillStop();
  // Hochformat (Handy): die Mercator-Karte zeigt bei Zoom 1 nur einen schmalen Ausschnitt der Welt – Start und Ziel lägen oft außerhalb. Natural Earth passt
  // immer ganz ins Bild; die eingestellte Ansicht kommt beim Verlassen zurück.
  if(prevProj===null&&projection==='mercator'&&window.innerWidth/window.innerHeight<1.5){prevProj=projection;projection='natural';}
  lastMode='fill';canClick=false;optsOpen=false;
  const diff=DIFF[opts.diff]?opts.diff:'all',km=!!opts.km,pk=km?'pathkm:':'path:';
  game={mode:'fill:'+pk+diff,fillMode:true,fillKey:pk+diff,fillArea:'world',found:new Set(),correct:0,wrong:0,firstTry:0,total:0,skipped:0,hints:0,fillWrong:0,fillStart:Date.now(),fillDone:false,ids:[],queue:[]};
  showScreen('game-screen');$('opts-panel').style.display='none';
  updateAllText();await loadMap();await ensureGraph();
  const pairs=opts.pairs&&opts.pairs.length?opts.pairs:await makePairs(ROUNDS,diff,km);
  game.fillPath={km,pairs,round:0,total:0,results:[],duel:!!opts.duel,a:0,b:0,shown:new Set(),typed:[],wrong:0,hints:0};
  $('btn-skip').setAttribute('onclick','pathGiveUp()');
  clearFeedback&&clearFeedback();
  loadRound();
}
window.pathArrowUpdate=drawArrow;window.startPathGame=startPathGame;window.pathGiveUp=pathGiveUp;window.pathStop=pathStop;window.pathColor=pathColor;window.pathStyle=pathStyle;window.updatePathStats=updatePathStats;
window.pathMakePairs=makePairs;window.pathPairsText=a=>a;
})();
