// 3D-Globus (Projektion "globe" = d3.geoOrthographic): Ziehen dreht die Kugel, Mausrad/Pinch zoomt.
//
// Der Kartenbaum aus renderMap() bleibt unverändert die Grundlage für Spiellogik und Klicks. Zum Drehen gilt:
//   • Während des Ziehens zeichnet canvas-map.js alle Geo-Formen live neu (setLive → d3.geoPath direkt auf den
//     Canvas, ohne SVG-Pfadtexte), Punkte/Pins werden ausgeblendet, das Relief wird gröber gerechnet.
//   • Beim Loslassen baut renderMap() die Szene mit der neuen Drehung sauber neu auf (Klickflächen, Punkte, Zonen).
// Der Zoom bleibt immer um die Kugelmitte; gezoomt wird nur mit Mausrad, Pinch und den Presets.
// Globale Variablen aus app.js: globeRot, currentProj, worldData, zoomBehavior, renderMap.
(function(){
'use strict';
const W=960,H=500,R0=235;
const G={k:1,drag:null,suppressUntil:0,apply:null,dotR:null,fly:null,bound:false};
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));

// ── Live-Zeichnen beschleunigen ──
// Beim Drehen werden (1) Formen auf der Rückseite gar nicht erst berechnet und (2) die Umrisse mit Douglas-Peucker
// vereinfacht (Toleranz ~1 Bildschirmpixel, abhängig vom Zoom). Beides nur für die Live-Ansicht; beim Loslassen baut
// renderMap() mit den vollen Daten neu.
const INFO=new WeakMap(),SIMP=new WeakMap();
let TOL=0.3;
function ptsOf(g,out){ // alle Stützpunkte einer Geometrie (jeder 6. reicht für den Radius)
  const t=g.type,c=g.coordinates;
  if(t==='Polygon'||t==='MultiLineString')c.forEach(r=>{for(let i=0;i<r.length;i+=6)out.push(r[i]);});
  else if(t==='MultiPolygon')c.forEach(p=>p.forEach(r=>{for(let i=0;i<r.length;i+=6)out.push(r[i]);}));
  else if(t==='LineString')for(let i=0;i<c.length;i+=6)out.push(c[i]);
  else if(t==='GeometryCollection')g.geometries.forEach(x=>ptsOf(x,out));
}
function info(d){
  let i=INFO.get(d);if(i)return i;
  const g=d.type==='Feature'?d.geometry:d;
  if(!g||d.type==='Sphere'||g.type==='GeometryCollection'||g.type==='MultiLineString'&&!d.id){i={r:Math.PI};}  // Netze/Kugel: überall
  else{const c=d3.geoCentroid(d),p=[];ptsOf(g,p);let r=0;for(const q of p){const dd=d3.geoDistance(c,q);if(dd>r)r=dd;}i={c,r};}
  INFO.set(d,i);return i;
}
function dp(pts,tol,closed){
  const n=pts.length;if(n<=4)return pts;
  // Punkte an der Datumsgrenze (|lon|~180) und am Pol (|lat|~90) bleiben immer: sie schneiden die Flächen auf der Kugel
  // auf, ohne sie würde z. B. die Antarktis verkehrt herum gefüllt.
  const keep=new Uint8Array(n);keep[0]=keep[n-1]=1;
  const forced=[0];
  for(let i=1;i<n-1;i++){const p=pts[i];if(Math.abs(p[0])>=179.99||Math.abs(p[1])>=89.99){keep[i]=1;forced.push(i);}}
  forced.push(n-1);
  const st=[],t2=tol*tol;
  for(let f=0;f<forced.length-1;f++)if(forced[f+1]-forced[f]>1)st.push([forced[f],forced[f+1]]);
  while(st.length){
    const[a,b]=st.pop();let m=-1,md=t2;
    const ax=pts[a][0],ay=pts[a][1],dx=pts[b][0]-ax,dy=pts[b][1]-ay,l2=dx*dx+dy*dy;
    for(let i=a+1;i<b;i++){
      let x=pts[i][0]-ax,y=pts[i][1]-ay;
      if(l2>0){const u=Math.max(0,Math.min(1,(x*dx+y*dy)/l2));x-=u*dx;y-=u*dy;}
      const d2=x*x+y*y;if(d2>md){md=d2;m=i;}
    }
    if(m>=0){keep[m]=1;st.push([a,m],[m,b]);}
  }
  const out=[];for(let i=0;i<n;i++)if(keep[i])out.push(pts[i]);
  return out;
}
function simpRing(r,tol){const o=dp(r,tol,true);return o.length>=4?o:null;}
function simpGeom(g,tol){
  switch(g.type){
    case 'Polygon':{const rs=g.coordinates.map(r=>simpRing(r,tol)).filter(Boolean);return rs.length?{type:'Polygon',coordinates:rs}:null;}
    case 'MultiPolygon':{const ps=g.coordinates.map(p=>p.map(r=>simpRing(r,tol)).filter(Boolean)).filter(p=>p.length);return ps.length?{type:'MultiPolygon',coordinates:ps}:null;}
    case 'MultiLineString':return{type:'MultiLineString',coordinates:g.coordinates.map(l=>dp(l,tol,false)).filter(l=>l.length>=2)};
    case 'LineString':return{type:'LineString',coordinates:dp(g.coordinates,tol,false)};
    case 'GeometryCollection':return{type:'GeometryCollection',geometries:g.geometries.map(x=>x.type==='Sphere'?x:simpGeom(x,tol)).filter(Boolean)};
    default:return g;
  }
}
// Für canvas-map: liefert die zu zeichnende Geometrie oder null (= nicht zeichnen, Rückseite)
function liveGeom(d){
  const i=info(d);
  if(i.c){const c=[-globeRot[0],-globeRot[1]];if(d3.geoDistance(i.c,c)>Math.PI/2+i.r+0.03)return null;}
  return simplifiedFor(d,TOL);
}
function simplifiedFor(d,tol){
  if(d.type==='Sphere'||d.type==='FeatureCollection'||!tol)return d;
  let m=SIMP.get(d);if(!m){m=new Map();SIMP.set(d,m);}
  if(!m.has(tol)){
    const g=d.type==='Feature'?d.geometry:d;
    const wrap=sg=>sg?(d.type==='Feature'?{type:'Feature',id:d.id,properties:d.properties,geometry:sg}:sg):null;
    let res=null;
    if(!g)res=null;
    else if(g.type==='Polygon'||g.type==='MultiPolygon'){
      // Flächen prüfen: weicht die vereinfachte Fläche merklich ab (Selbstüberschneidung → d3 füllt das Komplement),
      // feinere Toleranz probieren, zuletzt das Original nehmen.
      const a0=d3.geoArea(d);let t=tol;
      for(let i=0;i<4;i++){
        const cand=wrap(simpGeom(g,t));
        if(!cand){res=null;break;}
        if(Math.abs(d3.geoArea(cand)-a0)<=0.02*a0+1e-5){res=cand;break;}
        t/=2;if(i===3)res=d;
      }
    }else res=wrap(simpGeom(g,tol));
    m.set(tol,res);
  }
  return m.get(tol);
}
function setLive(on){
  if(on){const k=G.k;TOL=k>=8?0.05:k>=4?0.1:k>=2?0.18:0.3;if(currentProj)currentProj.precision(window.Globe.precision()*1.6);}
  if(window.CanvasMap)window.CanvasMap.setLive(on?currentProj:null,on?liveGeom:null);
  if(window.Relief)window.Relief.live=!!on;
}
function frame(){ // eine Zeichnung pro Animationsbild
  if(G.raf)return;
  G.raf=requestAnimationFrame(()=>{G.raf=0;if(window.CanvasMap)window.CanvasMap.invalidate();});
}
function rebuild(){
  setLive(false);
  if(typeof renderMap==='function'&&worldData)renderMap(worldData);
}
function onMove(ev){
  const d=G.drag;if(!d||ev.pointerId!==d.id||d.cancel)return;
  const dx=ev.clientX-d.x,dy=ev.clientY-d.y;
  if(!d.moved){if(Math.hypot(dx,dy)<4)return;d.moved=true;clearTimeout(G.rebuildT);setLive(true);}
  const node=document.getElementById('map'),rect=node.getBoundingClientRect();
  const sc=(Math.min(rect.width,rect.height)/480)||1; // viewBox des Globus ist 480x480
  const sens=180/Math.PI/(R0*G.k*sc);
  globeRot=[d.r[0]+dx*sens,clamp(d.r[1]-dy*sens,-90,90)];
  currentProj.rotate(globeRot);
  frame();
}
function onUp(ev){
  const d=G.drag;if(!d||ev.pointerId!==d.id)return;
  G.drag=null;
  if(d.moved){G.suppressUntil=performance.now()+400;clearTimeout(G.rebuildT);G.rebuildT=setTimeout(rebuild,280);}
}
function bindOnce(parent){
  if(G.bound)return;G.bound=true;
  window.addEventListener('pointermove',onMove);
  window.addEventListener('pointerup',onUp);
  window.addEventListener('pointercancel',onUp);
  // Ein Klick direkt nach dem Ziehen darf kein Land anklicken
  parent.addEventListener('click',ev=>{if(performance.now()<G.suppressUntil){ev.stopImmediatePropagation();ev.preventDefault();}},true);
}

window.Globe={
  radius:R0,
  simplifiedTol(d,tol){return simplifiedFor(d,tol);},
  precision(){const k=G.k;return k>=8?0.3:k>=4?0.5:k>=2?0.8:1.2;}, // gröbere Kurvenunterteilung ist beim Herauszoomen unsichtbar, spart Rechenzeit
  simplified(d){const k=G.k,tol=k>=8?0:k>=4?0.03:k>=2?0.06:0.1;return simplifiedFor(d,tol)||d;},
  behind(d){const i=info(d);return !!(i.c&&d3.geoDistance(i.c,[-globeRot[0],-globeRot[1]])>Math.PI/2+i.r+0.03);},
  get k(){return G.k;},
  // Wird von renderMap() nach dem Aufbau des Kartenbaums aufgerufen (nur im Globus-Modus)
  install(svg,wrapG,applyDotR){
    const node=svg.node(),cx=W/2,cy=H/2;
    G.dotR=applyDotR;
    G.apply=k=>{G.k=k;wrapG.attr('transform','translate('+(cx*(1-k)).toFixed(3)+','+(cy*(1-k)).toFixed(3)+') scale('+k+')');};
    G.k=clamp(G.k,1,12);G.apply(G.k);
    zoomBehavior=d3.zoom().scaleExtent([1,12])
      .filter(ev=>ev.type==='wheel'||(ev.touches&&ev.touches.length>1))
      .on('zoom',ev=>{const k=ev.transform.k;if(Math.abs(k-G.k)>1e-4){G.apply(k);if(G.dotR)G.dotR(k);}})
      .on('end',()=>{if(G.dotR)G.dotR(G.k);});
    svg.call(zoomBehavior);svg.on('dblclick.zoom',null);
    zoomBehavior.transform&&svg.call(zoomBehavior.transform,d3.zoomIdentity.translate(cx*(1-G.k),cy*(1-G.k)).scale(G.k)); // internen Zustand angleichen
    svg.on('pointerdown.globe',ev=>{
      if(ev.pointerType==='mouse'&&ev.button!==0)return;
      if(G.drag&&G.drag.id!==ev.pointerId){G.drag.cancel=true;return;} // zweiter Finger = Pinch
      G.drag={id:ev.pointerId,x:ev.clientX,y:ev.clientY,r:globeRot.slice(),moved:false,cancel:false};
    });
    bindOnce(node.parentNode);
    this.cull();
    if(G.dotR)G.dotR(G.k);
  },
  // Punkte auf der abgewandten Seite ausblenden (canvas-map überspringt Elemente mit data-away)
  cull(){
    const c=[-globeRot[0],-globeRot[1]];
    d3.selectAll('#map .dyn circle').each(function(d){
      let ll=null;
      if(d&&d.lon!==undefined)ll=[d.lon,d.lat];else if(d&&d.geometry)ll=d3.geoCentroid(d);
      if(!ll)return;
      if(d3.geoDistance(ll,c)>1.5)this.setAttribute('data-away','1');else this.removeAttribute('data-away');
    });
  },
  // Sanft zu einem Ort drehen (Presets, Städte-Zoom, Start einer Runde)
  flyTo(lon,lat,k,ms){
    k=clamp(k||1,1,8);ms=ms==null?600:ms;
    const r0=globeRot.slice(),k0=G.k,r1=[-lon,clamp(-lat,-90,90)];
    const dl=((r1[0]-r0[0]+540)%360)-180;
    cancelAnimationFrame(G.fly);
    if(!currentProj||!G.apply||ms<=0){globeRot=[r0[0]+dl,r1[1]];G.k=k;rebuild();return;}
    setLive(true);
    const t0=performance.now();
    const step=now=>{
      const t=Math.min(1,(now-t0)/ms),e=t<.5?2*t*t:1-Math.pow(-2*t+2,2)/2;
      globeRot=[r0[0]+dl*e,r0[1]+(r1[1]-r0[1])*e];
      currentProj.rotate(globeRot);
      G.apply(k0+(k-k0)*e);
      if(window.CanvasMap)window.CanvasMap.invalidate();
      if(t<1)G.fly=requestAnimationFrame(step);else rebuild();
    };
    G.fly=requestAnimationFrame(step);
  }
};
})();
