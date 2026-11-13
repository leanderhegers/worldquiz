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
const ROUNDS=5,MIN_D=3,MAX_D=5;
const MICRO_EDGES=[[492,250],[20,250],[20,724],[674,380],[336,380],[438,756],[438,40]]; // Monaco, Andorra, San Marino, Vatikan, Liechtenstein
const COL_START='#4f8cff',COL_GOAL='#ff9f1c',BG='#0d1420';
let graph=null,boxTimer=0,nextT=0,prevProj=null;
const P=()=>game&&game.fillPath;
const L4=(de,en,es,fr)=>({de,en,es,fr}[typeof lang!=='undefined'&&{de:1,en:1,es:1,fr:1}[lang]?lang:'de']);

// ── Nachbarschaftsgraph ──
async function ensureGraph(){
  if(graph)return graph;
  if(!worldData)await loadMap();
  const feats=_topoCached(worldData,'countries').features;
  const nb=topojson.neighbors(worldData.objects.countries.geometries);
  const adj=new Map();
  const add=(a,b)=>{if(a===b||!C[a]||!C[b])return;(adj.get(a)||adj.set(a,new Set()).get(a)).add(b);(adj.get(b)||adj.set(b,new Set()).get(b)).add(a);};
  feats.forEach((f,i)=>{const a=+f.id;if(!(a>0)||!C[a])return;nb[i].forEach(j=>{const b=+feats[j].id;if(b>0&&C[b])add(a,b);});});
  MICRO_EDGES.forEach(([a,b])=>add(a,b));
  graph={adj};
  return graph;
}
function bfs(from,adj){const d=new Map([[from,0]]),prev=new Map(),q=[from];
  for(let i=0;i<q.length;i++){const u=q[i];for(const v of adj.get(u)||[])if(!d.has(v)){d.set(v,d.get(u)+1);prev.set(v,u);q.push(v);}}
  return {d,prev};}
function route(from,to,adj){const {prev}=bfs(from,adj);const r=[to];let u=to;while(u!==from){u=prev.get(u);if(u==null)return null;r.unshift(u);}return r;}
// bekannte Länder als Start/Ziel (sonst sind die Aufgaben unfair obskur)
function knownIds(){const s=new Set();[typeof FLAG_BEGINNER!=='undefined'?FLAG_BEGINNER:[],typeof FLAG_EASY!=='undefined'?FLAG_EASY:[],typeof FLAG_MEDIUM!=='undefined'?FLAG_MEDIUM:[]].forEach(x=>x.forEach(i=>s.add(i)));return s;}
// n Paare "a-b" ziehen (Entfernung 3 bis 5 Länder, ohne Wiederholung von Start oder Ziel)
async function makePairs(n){
  const {adj}=await ensureGraph(),known=knownIds(),nodes=[...adj.keys()].filter(i=>known.has(i)&&adj.get(i).size>0);
  const out=[],used=new Set();let guard=0;
  while(out.length<n&&guard++<500){
    const a=nodes[Math.floor(Math.random()*nodes.length)];if(used.has(a))continue;
    const {d}=bfs(a,adj);
    const cand=nodes.filter(b=>!used.has(b)&&d.get(b)>=MIN_D&&d.get(b)<=MAX_D);
    if(!cand.length)continue;
    const b=cand[Math.floor(Math.random()*cand.length)];
    out.push(a+'-'+b);used.add(a);used.add(b);
  }
  return out;
}

// ── Anzeige: nur gezeigte Länder sichtbar ──
function shownSet(){const p=P();return p?p.shown:new Set();}
function pathColor(rawId){
  const id=eff(rawId),p=P();if(!p)return 'transparent';
  if(!p.shown.has(id))return 'transparent';
  if(id===p.b&&!p.reached)return COL_GOAL;
  if(id===p.a)return COL_START;
  if(p.reached&&id===p.b)return COL_GOAL;
  return p.reveal&&p.reveal.has(id)?COL_GOAL:THEMES[theme].found;
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
  // Der Weg muss vom Start aus zusammenhängen: ein Land zählt nur, wenn es an den Start oder ein bereits eingetipptes Land grenzt (das Ziel allein reicht nicht)
  const inChain=n=>n===p.a||p.typed.includes(n);
  const valid=i=>adj.has(i)&&!p.shown.has(i)&&[...adj.get(i)].some(inChain);
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
  const touches=[...adj.get(id)].some(inChain);
  if(!touches){miss(cn(id)+' '+L4('grenzt nicht an den bisherigen Weg','does not touch the route so far','no limita con la ruta actual','ne touche pas le chemin actuel'));return;}
  // richtig
  p.shown.add(id);p.typed.push(id);p.lastMiss=null;inp.value='';
  const reached=adj.get(id).has(p.b);
  msg('✓ '+cn(id),'#4fd18b');
  if(reached){p.reached=true;endRound(false);}
  updateColors();fitShown();updatePathStats();
}
function hint(){
  const p=P();if(!p||p.roundDone)return;
  const {adj}=graph;
  // kürzester Weg von allen sichtbaren Ländern zum Ziel: der nächste Schritt wird verraten
  let best=null;
  for(const s of [p.a,...p.typed]){const r=route(s,p.b,adj);if(r&&(!best||r.length<best.length))best=r;}
  const nxt=best&&best.find(i=>!p.shown.has(i)&&i!==p.b);
  if(nxt==null)return;
  p.hints++;const n=cn(nxt);
  msg('💡 '+L4('Ein Land mit','A country starting with','Un país que empieza por','Un pays commençant par')+' <b>'+n[0].toUpperCase()+'</b> … ('+[...n].length+')','#ffd166');
  updatePathStats();const inp=document.getElementById('path-input');if(inp)inp.focus();
}

// ── Runden ──
function pts(p){const used=p.typed.length,opt=p.opt;return Math.max(0,100-20*Math.max(0,used-opt)-5*p.wrong-10*p.hints);}
function endRound(gaveUp){
  const p=P();if(!p||p.roundDone)return;
  p.roundDone=true;const adj=graph.adj;
  const r=route(p.a,p.b,adj)||[];
  const got=gaveUp?0:pts(p);p.total+=got;p.results.push({got,used:p.typed.length,opt:p.opt});
  if(gaveUp){p.reveal=new Set(r.slice(1,-1));r.forEach(i=>p.shown.add(i));}
  const names=r.map(cn).join(' → ');
  const row=document.getElementById('path-row');if(row)row.style.display='none';
  const last=p.round>=p.pairs.length-1;
  const head=gaveUp?'🏳️ '+L4('Aufgegeben','Gave up','Rendido','Abandon'):(p.typed.length<=p.opt?'🏆 '+L4('Kürzester Weg!','Shortest path!','¡Camino más corto!','Chemin le plus court !'):'✅ '+L4('Geschafft','Done','Hecho','Réussi'));
  msg('<div class="fill-done">'+head+' · +'+got+'</div><div style="font-size:13px;opacity:.85;margin-bottom:8px">'+L4('Kürzester Weg','Shortest path','Camino más corto','Chemin le plus court')+': '+names+'</div><button type="button" id="path-next">'+(last?L4('Ergebnis','Result','Resultado','Résultat'):L4('Weiter','Next','Siguiente','Suivant'))+'</button>','#fff');
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
  p.a=a;p.b=b;p.shown=new Set([a,b]);p.typed=[];p.wrong=0;p.hints=0;p.reached=false;p.roundDone=false;p.reveal=null;
  p.opt=(route(a,b,graph.adj)||[]).length-2;
  ensureBox();updateColors();fitShown();updatePathStats();
  const inp=document.getElementById('path-input');if(inp){inp.value='';if(!COARSE)setTimeout(()=>inp.focus(),50);}
}
function finishGame(){
  const p=P();if(!p)return;
  game.fillDone=true;
  const tot=p.pairs.length*100,pct=Math.round(p.total/tot*100);
  let note='';
  if(!p.duel&&typeof recordScore==='function'){const isBest=recordScore('fill:path',p.total,tot);if(isBest)note=' · 🏆 '+t('newRecord');else{const b=typeof bestScore==='function'?bestScore('fill:path'):null;if(b)note=' · '+t('bestLabel')+' '+b.pct+'%';}}
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
  $('find-label').textContent=L4('Kürzester Weg','Shortest path','Camino más corto','Chemin le plus court')+' · '+cn(p.a)+' → '+cn(p.b);
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
  game={mode:'fill:path',fillMode:true,fillKey:'path',fillArea:'world',found:new Set(),correct:0,wrong:0,firstTry:0,total:0,skipped:0,hints:0,fillWrong:0,fillStart:Date.now(),fillDone:false,ids:[],queue:[]};
  showScreen('game-screen');$('opts-panel').style.display='none';
  updateAllText();await loadMap();await ensureGraph();
  const pairs=opts.pairs&&opts.pairs.length?opts.pairs:await makePairs(ROUNDS);
  game.fillPath={pairs,round:0,total:0,results:[],duel:!!opts.duel,a:0,b:0,shown:new Set(),typed:[],wrong:0,hints:0};
  $('btn-skip').setAttribute('onclick','pathGiveUp()');
  clearFeedback&&clearFeedback();
  loadRound();
}
window.startPathGame=startPathGame;window.pathGiveUp=pathGiveUp;window.pathStop=pathStop;window.pathColor=pathColor;window.pathStyle=pathStyle;window.updatePathStats=updatePathStats;
window.pathMakePairs=makePairs;window.pathPairsText=a=>a;
})();
