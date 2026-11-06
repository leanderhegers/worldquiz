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
const G={k:1,tx:null,ty:null,drag:null,suppressUntil:0,apply:null,dotR:null,fly:null,bound:false};
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));

// ── Live-Zeichnen beschleunigen ──
// Beim Drehen werden (1) Formen auf der Rückseite gar nicht erst berechnet und (2) die Umrisse mit Douglas-Peucker
// vereinfacht (Toleranz ~1 Bildschirmpixel, abhängig vom Zoom). Beides nur für die Live-Ansicht; beim Loslassen baut
// renderMap() mit den vollen Daten neu.
const INFO=new WeakMap(),SIMP=new WeakMap();
const tolFor=k=>k>=8?0.03:k>=4?0.05:k>=2?0.09:0.15; // Toleranz in Grad; live und statisch gleich, damit beim Neuaufbau nichts umspringt
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
  return simplifiedFor(d,tolFor(G.k)); // Toleranz folgt dem aktuellen Zoom (auch mitten im Hineinzoomen)
}
function simplifiedFor(d,tol){
  if(d.type==='Sphere'||d.type==='FeatureCollection'||d.noSimp||!tol)return d;
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
// ── Eigene schnelle Kugelprojektion fürs Live-Zeichnen ──
// d3.geoPath (Drehung + Kreisbeschnitt + Unterteilung) war mit ~2 µs je Punkt der größte Posten pro Bild. Hier werden die
// Punkte einmal in Bogenmaß/Sinus/Kosinus vorberechnet und pro Bild nur noch mit ~10 Multiplikationen projiziert.
// Punkte auf der Rückseite werden radial an den Kugelrand gesetzt (Flächen) bzw. unterbrechen die Linie.
const D2R=Math.PI/180,PREP=new WeakMap();
function ringArr(c){const n=c.length,o={n,cl:new Float32Array(n),sl:new Float32Array(n),cp:new Float32Array(n),sp:new Float32Array(n)};
  for(let i=0;i<n;i++){const l=c[i][0]*D2R,p=c[i][1]*D2R;o.cl[i]=Math.cos(l);o.sl[i]=Math.sin(l);o.cp[i]=Math.cos(p);o.sp[i]=Math.sin(p);}return o;}
function prep(g){
  let p=PREP.get(g);if(p!==undefined)return p;
  const geom=g.type==='Feature'?g.geometry:g;p=null;
  if(geom){
    if(geom.type==='Polygon')p={polys:[geom.coordinates.map(ringArr)]};
    else if(geom.type==='MultiPolygon')p={polys:geom.coordinates.map(poly=>poly.map(ringArr))};
    else if(geom.type==='LineString')p={lines:[ringArr(geom.coordinates)]};
    else if(geom.type==='MultiLineString')p={lines:geom.coordinates.map(ringArr)};
  }
  PREP.set(g,p);return p;
}
let TX=new Float32Array(4096),TY=new Float32Array(4096);
function drawLive(ctx,g){
  if(g.type==='Sphere'){ctx.beginPath();ctx.arc(W/2,H/2,R0,0,Math.PI*2);return true;}
  const p=prep(g);if(!p)return false;
  const lc=-globeRot[0]*D2R,pc=-globeRot[1]*D2R,cL=Math.cos(lc),sL=Math.sin(lc),cP=Math.cos(pc),sP=Math.sin(pc),cx=W/2,cy=H/2;
  ctx.beginPath();
  if(p.polys){
    for(const poly of p.polys)for(const r of poly){
      const n=r.n;if(n>TX.length){TX=new Float32Array(n*2);TY=new Float32Array(n*2);}
      let vis=0;
      for(let i=0;i<n;i++){
        const dc=r.cl[i]*cL+r.sl[i]*sL,ds=r.sl[i]*cL-r.cl[i]*sL;
        let x=r.cp[i]*ds,y=cP*r.sp[i]-sP*r.cp[i]*dc;
        if(sP*r.sp[i]+cP*r.cp[i]*dc>=0)vis++;else{const h=Math.sqrt(x*x+y*y)||1;x/=h;y/=h;}
        TX[i]=cx+R0*x;TY[i]=cy-R0*y;
      }
      if(!vis)continue;
      ctx.moveTo(TX[0],TY[0]);for(let i=1;i<n;i++)ctx.lineTo(TX[i],TY[i]);ctx.closePath();
    }
  }else{
    for(const r of p.lines){
      let pen=false;
      for(let i=0;i<r.n;i++){
        const dc=r.cl[i]*cL+r.sl[i]*sL,ds=r.sl[i]*cL-r.cl[i]*sL;
        if(sP*r.sp[i]+cP*r.cp[i]*dc<0){pen=false;continue;}
        const x=cx+R0*r.cp[i]*ds,y=cy-R0*(cP*r.sp[i]-sP*r.cp[i]*dc);
        if(pen)ctx.lineTo(x,y);else{ctx.moveTo(x,y);pen=true;}
      }
    }
  }
  return true;
}
function setLive(on){
  if(on){if(currentProj)currentProj.precision(window.Globe.precision()*1.6);}
  if(window.CanvasMap)window.CanvasMap.setLive(on?currentProj:null,on?liveGeom:null,on?drawLive:null);
  if(window.Relief)window.Relief.live=!!on;
}
function frame(){ // eine Zeichnung pro Animationsbild
  if(G.raf)return;
  G.raf=requestAnimationFrame(()=>{G.raf=0;if(window.Sky)window.Sky.rotate(globeRot);if(window.CanvasMap)window.CanvasMap.invalidate();});
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
  frame(); // Zeichnen und Sternenhimmel einmal pro Bild
}
function onUp(ev){
  const d=G.drag;if(!d||ev.pointerId!==d.id)return;
  G.drag=null;
  if(d.moved){G.suppressUntil=performance.now()+400;clearTimeout(G.rebuildT);G.rebuildT=setTimeout(rebuild,280);}
}
// Feinere Konturen nach dem Hineinzoomen: sofort live (Toleranz folgt dem Zoom), 280 ms später Neuaufbau mit feinen Pfaden
function refine(){
  if(!G.wheelLive){setLive(true);G.wheelLive=true;}
  frame();clearTimeout(G.rebuildT);G.rebuildT=setTimeout(()=>{G.wheelLive=false;rebuild();},280);
}
// Alle Toleranzstufen im Leerlauf vorberechnen, damit schnelles Hineinzoomen nicht stockt
function prebuild(){
  if(G.prebuilt)return;G.prebuilt=true;
  const items=[];d3.selectAll('#map path').each(function(d){if(d&&d.type&&!d.noSimp&&d.type!=='Sphere'&&d.type!=='FeatureCollection'&&!this.hasAttribute('data-away')&&!(d.type==='GeometryCollection'))items.push(d);});
  const tols=[0.15,0.09,0.05,0.03];let ti=0,i=0;
  const step=()=>{
    const t0=performance.now();
    while(ti<tols.length&&performance.now()-t0<12){const d=items[i];const s=simplifiedFor(d,tols[ti]);if(s)prep(s);if(++i>=items.length){i=0;ti++;}}
    if(ti<tols.length)setTimeout(step,30);
  };
  setTimeout(step,400);
}
// Mausrad: Zoom zum Cursor. Beim Hineinzoomen dreht sich die Kugel dabei so, dass der Punkt unter dem Cursor zur Mitte hin
// wandert (man schaut nicht schräg von der Seite auf die Stelle); der Punkt bleibt dabei unter dem Cursor.
function wheel(ev,svg,node){
  ev.preventDefault();
  const dy=ev.deltaY*(ev.deltaMode===1?15:ev.deltaMode===2?300:1);
  const f=Math.pow(2,-dy*0.0022),k0=G.k,k1=clamp(k0*f,1,12);
  if(Math.abs(k1-k0)<1e-6||!currentProj||!G.apply)return;
  const inv=node.getScreenCTM().inverse();
  const ux=inv.a*ev.clientX+inv.c*ev.clientY+inv.e,uy=inv.b*ev.clientX+inv.d*ev.clientY+inv.f;
  const px=(ux-G.tx)/k0,py=(uy-G.ty)/k0;
  const ll=currentProj.invert([px,py]);
  const onGlobe=ll&&isFinite(ll[0])&&isFinite(ll[1])&&Math.hypot(px-W/2,py-H/2)<R0*0.985;
  let rotated=false,p2=[px,py];
  if(onGlobe&&k1>k0){
    const c0=[-globeRot[0],-globeRot[1]],step=Math.min(0.6,Math.log2(k1/k0)*0.9);
    const nc=d3.geoInterpolate(c0,ll)(step);
    globeRot=[-nc[0],clamp(-nc[1],-90,90)];currentProj.rotate(globeRot);
    const q=currentProj(ll);if(q&&isFinite(q[0])){p2=q;rotated=true;}
  }
  let tx=ux-p2[0]*k1,ty=uy-p2[1]*k1;
  const bx=W/2*(1-k1),by=H/2*(1-k1),lim=(k1-1)*R0;let dx=tx-bx,dyy=ty-by;const l=Math.hypot(dx,dyy);
  if(l>lim){dx*=lim/(l||1);dyy*=lim/(l||1);}
  tx=bx+dx;ty=by+dyy;
  G.apply(k1,tx,ty);
  svg.property('__zoom',d3.zoomIdentity.translate(tx,ty).scale(k1)); // d3-Zoom (Pinch) kennt den neuen Stand
  if(rotated){
    if(!G.wheelLive){setLive(true);G.wheelLive=true;}
    if(window.Sky)window.Sky.rotate(globeRot);
    frame();
    clearTimeout(G.rebuildT);G.rebuildT=setTimeout(()=>{G.wheelLive=false;rebuild();},280);
  }else if(tolFor(k1)<G.builtTol){refine();}
  else if(G.dotR&&!G.wheelLive){G.dotR(k1);}
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
  simplified(d){return simplifiedFor(d,tolFor(G.k))||d;},
  behind(d){const i=info(d);return !!(i.c&&d3.geoDistance(i.c,[-globeRot[0],-globeRot[1]])>Math.PI/2+i.r+0.03);},
  get k(){return G.k;},
  // Wird von renderMap() nach dem Aufbau des Kartenbaums aufgerufen (nur im Globus-Modus)
  install(svg,wrapG,applyDotR){
    const node=svg.node(),cx=W/2,cy=H/2;
    G.dotR=applyDotR;
    // Ansicht = translate(tx,ty) scale(k). Zoom richtet sich nach dem Cursor/den Fingern (wie bei den flachen Karten);
    // die Verschiebung ist so begrenzt, dass die Kugel beim Herauszoomen wieder in die Mitte zurückkehrt.
    const centred=k=>[cx*(1-k),cy*(1-k)];
    G.centred=centred;
    G.apply=(k,tx,ty)=>{
      if(tx==null){[tx,ty]=centred(k);}
      G.k=k;G.tx=tx;G.ty=ty;
      wrapG.attr('transform','translate('+tx.toFixed(3)+','+ty.toFixed(3)+') scale('+k+')');
    };
    G.k=clamp(G.k,1,12);G.builtTol=tolFor(G.k);
    if(G.tx==null){[G.tx,G.ty]=centred(G.k);}
    G.apply(G.k,G.tx,G.ty);
    zoomBehavior=d3.zoom().scaleExtent([1,12])
      .filter(ev=>ev.touches&&ev.touches.length>1) // Mausrad macht on('wheel.globe') unten
      .constrain(t=>{ // Versatz zur zentrierten Lage höchstens (k-1)*Radius: bei k=1 genau zentriert
        const k=t.k,[bx,by]=centred(k),lim=(k-1)*R0;let dx=t.x-bx,dy=t.y-by;const l=Math.hypot(dx,dy);
        if(l>lim){dx*=lim/(l||1);dy*=lim/(l||1);}
        return d3.zoomIdentity.translate(bx+dx,by+dy).scale(k);})
      .on('zoom',ev=>{const t=ev.transform;if(Math.abs(t.k-G.k)>1e-4||Math.abs(t.x-G.tx)>0.01||Math.abs(t.y-G.ty)>0.01){const kc=Math.abs(t.k-G.k)>1e-4;G.apply(t.k,t.x,t.y);
        if(kc&&tolFor(t.k)<G.builtTol)refine(); // weiter hineingezoomt: Konturen feiner (live, danach Neuaufbau)
        else if(kc&&G.dotR&&!G.wheelLive)G.dotR(t.k);}})
      .on('end',()=>{if(G.dotR)G.dotR(G.k);});
    svg.call(zoomBehavior);svg.on('dblclick.zoom',null);
    zoomBehavior.transform&&svg.call(zoomBehavior.transform,d3.zoomIdentity.translate(G.tx,G.ty).scale(G.k)); // internen Zustand angleichen
    svg.on('wheel.zoom',null);
    svg.on('wheel.globe',ev=>wheel(ev,svg,node));
    svg.on('pointerdown.globe',ev=>{
      if(ev.pointerType==='mouse'&&ev.button!==0)return;
      if(G.drag&&G.drag.id!==ev.pointerId){G.drag.cancel=true;return;} // zweiter Finger = Pinch
      G.drag={id:ev.pointerId,x:ev.clientX,y:ev.clientY,r:globeRot.slice(),moved:false,cancel:false};
    });
    bindOnce(node.parentNode);
    if(window.Sky)window.Sky.rotate(globeRot);
    this.cull();
    if(G.dotR)G.dotR(G.k);
    prebuild();
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
    const r0=globeRot.slice(),k0=G.k,tx0=G.tx,ty0=G.ty,r1=[-lon,clamp(-lat,-90,90)];
    const dl=((r1[0]-r0[0]+540)%360)-180;
    cancelAnimationFrame(G.fly);
    if(!currentProj||!G.apply||ms<=0){globeRot=[r0[0]+dl,r1[1]];G.k=k;G.tx=null;G.ty=null;rebuild();return;}
    setLive(true);
    const t0=performance.now();
    const step=now=>{
      const t=Math.min(1,(now-t0)/ms),e=t<.5?2*t*t:1-Math.pow(-2*t+2,2)/2;
      globeRot=[r0[0]+dl*e,r0[1]+(r1[1]-r0[1])*e];
      currentProj.rotate(globeRot);
      if(window.Sky)window.Sky.rotate(globeRot);
      {const kk=k0+(k-k0)*e,ce=G.centred(k);G.apply(kk,tx0+(ce[0]-tx0)*e,ty0+(ce[1]-ty0)*e);}
      if(window.CanvasMap)window.CanvasMap.invalidate();
      if(t<1)G.fly=requestAnimationFrame(step);else rebuild();
    };
    G.fly=requestAnimationFrame(step);
  }
};
})();
