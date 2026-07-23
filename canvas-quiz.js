// ── Canvas-based rendering prototype — "Alle Länder" world map quiz ──
// Comparison version of the SVG/D3 quiz. Same geo data, but drawn on a <canvas>
// instead of as DOM <path> elements. Hit-testing (click/hover) uses an offscreen
// "picking buffer": every country is filled with a unique solid color on a hidden
// canvas; a click reads the pixel color there to know which country was hit —
// avoids per-country DOM hit-testing entirely.
//
// Scope note: this is a lean prototype for a rendering/performance comparison,
// not a full port. It skips disputed-territory redirects, Mercator infinite wrap,
// and themes — only the core "click the country" loop is reproduced.

const MAP_W=960,MAP_H=500;
const COL={bg:'#3a80b8',avail:'#e0d4b4',found:'#4a8a30',hov:'#ccc0a0',wrong:'#c03820',border:'#205090',dot:'#b0a080'};
const DOT_R=7,HIT_R=DOT_R+5;

const canvas=document.getElementById('map');
const ctx=canvas.getContext('2d');
const pickCanvas=document.createElement('canvas');
const pickCtx=pickCanvas.getContext('2d',{willReadFrequently:true});
const PICK_SCALE=2; // supersample the pick buffer so thin/small countries stay hit-testable

let cw=0,ch=0,dpr=Math.max(1,window.devicePixelRatio||1),scaleF=1,offsetX=0,offsetY=0;
let transform=d3.zoomIdentity;
let proj=null,gpath=null,pickPath=null;
let features=[],idToFeature=new Map(),pickIdToId=new Map();
let borderMesh=null,coastMesh=null;
let hoverId=null,wrongId=null,wrongTimer=null;

const game={pool:[],order:[],idx:0,found:new Set(),correct:0,wrong:0};

function buildProjection(){
  const p=d3.geoMercator().scale(152.8).translate([MAP_W/2,MAP_H/2]);
  const topY=p([0,83.5])[1];
  return p.clipExtent([[-80,topY],[MAP_W+80,MAP_H+260]]);
}

function resize(){
  const wrap=document.getElementById('map-wrap');
  cw=wrap.clientWidth;ch=wrap.clientHeight;
  dpr=Math.max(1,window.devicePixelRatio||1);
  canvas.width=cw*dpr;canvas.height=ch*dpr;
  canvas.style.width=cw+'px';canvas.style.height=ch+'px';
  scaleF=Math.min(cw/MAP_W,ch/MAP_H);
  offsetX=(cw-MAP_W*scaleF)/2;
  offsetY=(ch-MAP_H*scaleF)/2;
  draw();
}
new ResizeObserver(resize).observe(document.getElementById('map-wrap'));

function applyCtxTransform(c){
  c.setTransform(dpr,0,0,dpr,0,0);
  c.translate(transform.x,transform.y);
  c.scale(transform.k,transform.k);
  c.translate(offsetX,offsetY);
  c.scale(scaleF,scaleF);
}

function idColor(pickId){
  // Encode pickId (1..N) as an RGB triple — plenty of headroom for ~250 countries.
  const r=(pickId>>16)&255,g=(pickId>>8)&255,b=pickId&255;
  return `rgb(${r},${g},${b})`;
}

function buildPickBuffer(){
  pickCanvas.width=MAP_W*PICK_SCALE;pickCanvas.height=MAP_H*PICK_SCALE;
  pickCtx.setTransform(PICK_SCALE,0,0,PICK_SCALE,0,0);
  pickCtx.imageSmoothingEnabled=false;
  pickCtx.fillStyle='rgb(0,0,0)';
  pickCtx.fillRect(0,0,MAP_W,MAP_H);
  features.forEach((f,i)=>{
    const pickId=i+1;
    pickIdToId.set(pickId,+f.id);
    pickCtx.beginPath();pickPath(f);
    pickCtx.fillStyle=idColor(pickId);
    pickCtx.fill();
  });
}

function countryColor(id){
  if(game.found.has(id))return COL.found;
  if(id===wrongId)return COL.wrong;
  if(id===hoverId)return COL.hov;
  return COL.avail;
}

let frameCount=0;
function draw(){
  frameCount++;
  ctx.setTransform(dpr,0,0,dpr,0,0);
  ctx.clearRect(0,0,cw,ch);
  ctx.fillStyle=COL.bg;ctx.fillRect(0,0,cw,ch);
  applyCtxTransform(ctx);

  // Countries — colored by game state; only countries with a quiz entry (C[id]) are interactive,
  // everything else renders as a flat neutral land tone.
  features.forEach(f=>{
    const id=+f.id;
    const active=C[id];
    ctx.beginPath();gpath(f);
    ctx.fillStyle=active?countryColor(id):'#9fae8a';
    ctx.fill();
  });

  // Borders — lineWidth compensated so stroke stays a constant screen width across zoom/fit-scale.
  ctx.lineWidth=baseLen(0.8);ctx.strokeStyle=COL.border;ctx.lineJoin='round';
  ctx.beginPath();gpath(coastMesh);ctx.stroke();
  ctx.beginPath();gpath(borderMesh);ctx.stroke();

  // Microstate dots (Monaco, Singapore, Vatican, …) — radius compensated to stay ~constant on screen.
  const r=Math.max(1.2,baseLen(DOT_R));
  MICROSTATES.forEach(m=>{
    if(!isActive(m.id))return;
    const p=proj([m.lon,m.lat]);if(!p)return;
    ctx.beginPath();ctx.arc(p[0],p[1],r,0,Math.PI*2);
    ctx.fillStyle=countryColor(m.id);
    ctx.fill();ctx.lineWidth=baseLen(1.2);ctx.strokeStyle=COL.border;ctx.stroke();
  });
}
// Converts a desired constant *screen*-pixel length into the equivalent length in
// 960×500 geo-space at the current zoom/fit scale (so strokes/dots don't grow with zoom).
function baseLen(px){return px/(transform.k*scaleF);}
function requestDraw(){requestAnimationFrame(draw);}

function isActive(id){return !!C[id];}

// ── Hit testing ──
function screenToGeo(px,py){
  const cx=(px-transform.x)/transform.k;
  const cy=(py-transform.y)/transform.k;
  return[(cx-offsetX)/scaleF,(cy-offsetY)/scaleF];
}
function hitTest(px,py){
  const[gx,gy]=screenToGeo(px,py);
  const baseHitR=baseLen(HIT_R);
  let best=null,bestD=Infinity;
  for(const m of MICROSTATES){
    if(!isActive(m.id))continue;
    const p=proj([m.lon,m.lat]);if(!p)continue;
    const dx=gx-p[0],dy=gy-p[1],d=dx*dx+dy*dy;
    if(d<baseHitR*baseHitR&&d<bestD){bestD=d;best=m.id;}
  }
  if(best!==null)return best;
  const px2=Math.round(gx*PICK_SCALE),py2=Math.round(gy*PICK_SCALE);
  if(px2<0||py2<0||px2>=pickCanvas.width||py2>=pickCanvas.height)return null;
  const d=pickCtx.getImageData(px2,py2,1,1).data;
  const pickId=(d[0]<<16)|(d[1]<<8)|d[2];
  if(!pickId)return null;
  const rawId=pickIdToId.get(pickId);
  return C[rawId]?rawId:null;
}

// ── Game flow ──
function cn(id){return C[id]?C[id].de:'?';}
function shuffle(a){const b=[...a];for(let i=b.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[b[i],b[j]]=[b[j],b[i]];}return b;}

function startGame(){
  game.pool=Object.keys(C).map(Number);
  game.order=shuffle(game.pool);
  game.idx=0;game.found=new Set();game.correct=0;game.wrong=0;
  document.getElementById('s-total').textContent=game.pool.length;
  nextCountry();
}
function nextCountry(){
  updateStats();
  if(game.idx>=game.order.length){finishGame();return;}
  document.getElementById('target-name').textContent=cn(game.order[game.idx]);
}
function updateStats(){
  document.getElementById('s-found').textContent=game.found.size;
  document.getElementById('s-correct').textContent=game.correct;
  document.getElementById('s-wrong').textContent=game.wrong;
}
function finishGame(){
  document.getElementById('result').style.display='flex';
  const pct=Math.round(100*game.correct/game.pool.length);
  document.getElementById('result-sub').textContent=`${game.correct} von ${game.pool.length} richtig (${pct}%), ${game.wrong} Fehlversuche.`;
}
function showFeedback(text,color){
  const el=document.getElementById('feedback');
  el.textContent=text;el.style.color=color;el.style.opacity='1';
  clearTimeout(showFeedback._t);
  showFeedback._t=setTimeout(()=>{el.style.opacity='0';},1400);
}
function skipCountry(){
  game.idx++;requestDraw();nextCountry();
}
function handleClick(id){
  const target=game.order[game.idx];
  if(id===target){
    game.correct++;game.found.add(id);
    showFeedback('✓ Richtig! '+cn(id),'#7fd06a');
    requestDraw();
    setTimeout(()=>{game.idx++;requestDraw();nextCountry();},700);
  }else{
    game.wrong++;
    showFeedback('✗ Das war '+cn(target),'#e06a52');
    wrongId=id;requestDraw();
    if(wrongTimer)clearTimeout(wrongTimer);
    wrongTimer=setTimeout(()=>{wrongId=null;requestDraw();},650);
    updateStats();
  }
}

// ── Input wiring ──
function clientToCanvas(ev){
  const r=canvas.getBoundingClientRect();
  return[ev.clientX-r.left,ev.clientY-r.top];
}
let _hoverRaf=null;
canvas.addEventListener('mousemove',ev=>{
  if(_hoverRaf)return;
  _hoverRaf=requestAnimationFrame(()=>{
    _hoverRaf=null;
    const[px,py]=clientToCanvas(ev);
    const id=hitTest(px,py);
    const next=(id!=null&&!game.found.has(id))?id:null;
    if(next!==hoverId){hoverId=next;requestDraw();}
  });
});
canvas.addEventListener('mouseleave',()=>{if(hoverId!==null){hoverId=null;requestDraw();}});

const zoom=d3.zoom().scaleExtent([1,20]).on('zoom',ev=>{transform=ev.transform;requestDraw();});
d3.select(canvas).call(zoom).on('click',function(ev){
  // d3.zoom consumes drag gestures; a plain click (no drag) still fires here.
  const[px,py]=clientToCanvas(ev);
  const id=hitTest(px,py);
  if(id!=null&&!game.found.has(id))handleClick(id);
});

// ── FPS overlay — counts actual redraws/sec, so it reflects real work during pan/zoom ──
setInterval(()=>{
  document.getElementById('fps').textContent=frameCount+' FPS';
  frameCount=0;
},1000);

// ── Boot ──
fetch('https://cdn.jsdelivr.net/npm/world-atlas@2/countries-50m.json').then(r=>r.json()).then(world=>{
  proj=buildProjection();
  gpath=d3.geoPath().projection(proj).context(ctx);
  pickPath=d3.geoPath().projection(proj).context(pickCtx);
  const countries=topojson.feature(world,world.objects.countries);
  features=countries.features;
  coastMesh=topojson.mesh(world,world.objects.countries,(a,b)=>a===b);
  borderMesh=topojson.mesh(world,world.objects.countries,(a,b)=>a!==b);
  buildPickBuffer();
  resize();
  startGame();
}).catch(e=>{document.getElementById('target-name').textContent='Fehler beim Laden';console.error(e);});
