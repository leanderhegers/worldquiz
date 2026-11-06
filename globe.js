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

function setLive(on){
  if(window.CanvasMap)window.CanvasMap.setLive(on?currentProj:null);
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
  if(!d.moved){if(Math.hypot(dx,dy)<4)return;d.moved=true;setLive(true);}
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
  if(d.moved){G.suppressUntil=performance.now()+400;setTimeout(rebuild,0);}
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
