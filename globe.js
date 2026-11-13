// 3D-Globus (Projektion "globe" = d3.geoOrthographic): Ziehen dreht die Kugel, Mausrad/Pinch zoomt.
//
// Der Kartenbaum aus renderMap() bleibt unverändert die Grundlage für Spiellogik und Klicks. Zum Drehen gilt:
//   • Während des Ziehens zeichnet canvas-map.js alle Geo-Formen live neu (setLive → d3.geoPath direkt auf den
//     Canvas, ohne SVG-Pfadtexte), Punkte/Pins werden ausgeblendet.
//   • Beim Loslassen baut renderMap() die Szene mit der neuen Drehung sauber neu auf (Klickflächen, Punkte, Zonen).
// Der Zoom bleibt immer um die Kugelmitte; gezoomt wird nur mit Mausrad, Pinch und den Presets.
// Globale Variablen aus app.js: globeRot, currentProj, worldData, zoomBehavior, renderMap.
(function(){
'use strict';
const W=960,H=500,R0=235;
const G={k:1,tx:null,ty:null,drag:null,suppressUntil:0,apply:null,dotR:null,fly:null,bound:false};
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const gmax=()=>(typeof game!=='undefined'&&game&&game.pinMode)?40:12; // Drop a Pin: mehr Zoom erlaubt

// ── Live-Zeichnen beschleunigen ──
// Beim Drehen werden (1) Formen auf der Rückseite gar nicht erst berechnet und (2) die Umrisse mit Douglas-Peucker
// vereinfacht (Toleranz ~1 Bildschirmpixel, abhängig vom Zoom). Beides nur für die Live-Ansicht; beim Loslassen baut
// renderMap() mit den vollen Daten neu.
const INFO=new WeakMap(),SIMP=new WeakMap();
const tolFor=k=>k>=8?0.02:k>=4?0.04:k>=2?0.07:0.12; // Toleranz in Grad; live und statisch gleich, damit beim Neuaufbau nichts umspringt
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
  if(!g||d.type==='Sphere'||g.type==='GeometryCollection'||g.type==='MultiLineString'&&d.type!=='Feature'){i={r:Math.PI};}  // Netze/Kugel: überall
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
  return densify(out);
}
// Lange Stücke (z. B. der 49. Breitengrad zwischen USA und Kanada: in Länge/Breite gerade, also nach dem Vereinfachen nur
// zwei Punkte) in Schritten von höchstens 3° unterteilen. Die schnelle Kugelprojektion verbindet Stützpunkte gerade – ohne
// Zwischenpunkte würde aus dem Breitenkreis eine Sehne. Sprünge über die Datumsgrenze (>=180°) bleiben unangetastet.
const MAXSEG=3;
function densify(pts){
  let need=false;
  for(let i=1;i<pts.length;i++){const dx=Math.abs(pts[i][0]-pts[i-1][0]),dy=Math.abs(pts[i][1]-pts[i-1][1]);if((dx>MAXSEG||dy>MAXSEG)&&dx<180){need=true;break;}}
  if(!need)return pts;
  const out=[pts[0]];
  for(let i=1;i<pts.length;i++){
    const a=pts[i-1],b=pts[i],dx=b[0]-a[0],dy=b[1]-a[1],m=Math.max(Math.abs(dx),Math.abs(dy));
    if(m>MAXSEG&&Math.abs(dx)<180){const n=Math.ceil(m/MAXSEG);for(let j=1;j<n;j++)out.push([a[0]+dx*j/n,a[1]+dy*j/n]);}
    out.push(b);
  }
  return out;
}
function simpRing(r,tol){
  // Kleine Ringe (Inseln) bleiben unverändert: auf 4 Punkte gekürzt würden daraus flache Dreiecke/Splitter
  let x0=1e9,x1=-1e9,y0=1e9,y1=-1e9;
  for(let i=0;i<r.length;i++){const p=r[i];if(p[0]<x0)x0=p[0];if(p[0]>x1)x1=p[0];if(p[1]<y0)y0=p[1];if(p[1]>y1)y1=p[1];}
  if(Math.max(x1-x0,y1-y0)<tol*14)return r.length>=4?r:null;
  const o=dp(r,tol,true);return o.length>=4?o:null;
}
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
// Halber Öffnungswinkel des sichtbaren Kugelausschnitts beim Zoom k (die Kugel steht immer in der Bildmitte): bei Zoom 1 die
// ganze Vorderseite (90°), hineingezoomt nur noch ein kleiner Kegel. G.visR = halbe Bilddiagonale in Karteneinheiten bei Zoom 1.
function updateVis(){
  const node=document.getElementById('map');if(!node)return;
  const r=node.getBoundingClientRect(),sc=(Math.min(r.width,r.height)/480)||1;
  G.visR=Math.hypot(r.width,r.height)/2/sc;
}
function coneFor(k){
  const rv=(G.visR||400)/(k||1);
  return rv>=R0?Math.PI/2:Math.asin(rv/R0)+0.04; // +0.04 rad Reserve
}
// true = Form liegt ganz außerhalb des sichtbaren Ausschnitts (Rückseite oder neben dem Bild)
function hidden(i,k){
  if(!i.c)return false;
  return d3.geoDistance(i.c,[-globeRot[0],-globeRot[1]])>Math.min(Math.PI/2,coneFor(k))+i.r+0.03;
}
// Für canvas-map: liefert die zu zeichnende Geometrie oder null (= nicht zeichnen)
function liveGeom(d){
  if(hidden(info(d),G.k))return null;
  return simplifiedFor(d,tolFor(G.k)); // Toleranz folgt dem aktuellen Zoom (auch mitten im Hineinzoomen)
}
// ── Pfadtext für den Neuaufbau: dieselbe schnelle Projektion wie beim Live-Zeichnen ──
// Vorher rechnete d3.geoPath die Pfade des Kartenbaums (Drehung, Kreisbeschnitt, Kurvenunterteilung): 60–120 ms je Neuaufbau –
// das war das kurze Einfrieren nach jedem Drehen/Zoomen. Jetzt ~5–10× schneller, und weil es exakt dieselbe Rechnung ist wie
// beim Live-Zeichnen, springt beim Umschalten nichts mehr um.
const f2=v=>Math.round(v*100)/100;
const SC={s:'',moveTo(x,y){this.s+='M'+f2(x)+','+f2(y);},lineTo(x,y){this.s+='L'+f2(x)+','+f2(y);},closePath(){this.s+='Z';}};
function pathString(d){
  if(!d||d.type==='Sphere')return undefined; // Kugelumriss: d3
  if(hidden(info(d),G.k))return '';
  const g=simplifiedFor(d,tolFor(G.k));if(!g)return '';
  const p=prep(g);if(!p)return undefined;    // unbekannte Geometrie: d3
  const lc=-globeRot[0]*D2R,pc=-globeRot[1]*D2R,cL=Math.cos(lc),sL=Math.sin(lc),cP=Math.cos(pc),sP=Math.sin(pc),cx=W/2,cy=H/2;
  SC.s='';
  if(p.sphere){for(let a=0;a<120;a++){const t=a/120*2*Math.PI;(a?SC.lineTo:SC.moveTo).call(SC,cx+R0*Math.cos(t),cy+R0*Math.sin(t));}SC.closePath();} // Kugelscheibe als Vieleck (nur M/L/Z: canvas-map liest daraus die Ausdehnung)
  if(p.polys){for(const poly of p.polys)for(const r of poly)ringPath(SC,r,cL,sL,cP,sP,cx,cy);}
  else if(p.lines)for(const r of p.lines)linePath(SC,r,cL,sL,cP,sP,cx,cy);
  return SC.s;
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
    else if(geom.type==='GeometryCollection'){ // Kugel + Flächen
      const polys=[];let sphere=false,ok=true;
      for(const x of geom.geometries){if(!x)continue;if(x.type==='Sphere')sphere=true;else if(x.type==='Polygon')polys.push(x.coordinates.map(ringArr));else if(x.type==='MultiPolygon')x.coordinates.forEach(pl=>polys.push(pl.map(ringArr)));else ok=false;}
      if(ok)p={polys,sphere};
    }
  }
  PREP.set(g,p);return p;
}
let SX=new Float32Array(4096),SY=new Float32Array(4096),SZ=new Float32Array(4096);
// Projiziert einen Ring (Fläche) in den Pfad. Sichtbar = z>=0. Beim Übergang über den Horizont wird der genaue Schnittpunkt
// (lineare Mischung der 3D-Einheitsvektoren, auf den Rand normiert) eingefügt; verdeckte Punkte liegen auf dem Rand, größere
// Lücken dort füllt ein Bogen. Ringe ganz auf der Rückseite entfallen.
function ringPath(ctx,r,cL,sL,cP,sP,cx,cy){
  const n=r.n;if(n>SX.length){SX=new Float32Array(n*2);SY=new Float32Array(n*2);SZ=new Float32Array(n*2);}
  let vis=0;
  for(let i=0;i<n;i++){
    const dc=r.cl[i]*cL+r.sl[i]*sL,ds=r.sl[i]*cL-r.cl[i]*sL;
    SX[i]=r.cp[i]*ds;SY[i]=cP*r.sp[i]-sP*r.cp[i]*dc;const z=sP*r.sp[i]+cP*r.cp[i]*dc;SZ[i]=z;if(z>=0)vis++;
  }
  if(!vis)return;
  let started=false,lastRim=false,lastAng=0;
  const emit=(X,Y)=>{if(started)ctx.lineTo(X,Y);else{ctx.moveTo(X,Y);started=true;}};
  const rim=(x,y)=>{
    const h=Math.sqrt(x*x+y*y)||1;x/=h;y/=h;const ang=Math.atan2(y,x);
    if(lastRim){let d=ang-lastAng;while(d>Math.PI)d-=2*Math.PI;while(d<-Math.PI)d+=2*Math.PI;
      const steps=Math.floor(Math.abs(d)/0.1);for(let j=1;j<=steps;j++){const a2=lastAng+d*j/(steps+1);emit(cx+R0*Math.cos(a2),cy-R0*Math.sin(a2));}}
    emit(cx+R0*x,cy-R0*y);lastRim=true;lastAng=ang;
  };
  let pv=SZ[0]>=0;
  for(let i=0;i<n;i++){
    const x=SX[i],y=SY[i],z=SZ[i],v=z>=0;
    if(i>0&&v!==pv){const pz=SZ[i-1],t=pz/(pz-z);rim(SX[i-1]+(x-SX[i-1])*t,SY[i-1]+(y-SY[i-1])*t);}
    if(v){emit(cx+R0*x,cy-R0*y);lastRim=false;}else rim(x,y);
    pv=v;
  }
  ctx.closePath();
}
// Linie (Gradnetz, Fluss, Zone): sichtbare Stücke, jeweils bis zum genauen Horizontschnitt
function linePath(ctx,r,cL,sL,cP,sP,cx,cy){
  let pen=false,px=0,py=0,pz=0,pv=false;
  for(let i=0;i<r.n;i++){
    const dc=r.cl[i]*cL+r.sl[i]*sL,ds=r.sl[i]*cL-r.cl[i]*sL;
    const x=r.cp[i]*ds,y=cP*r.sp[i]-sP*r.cp[i]*dc,z=sP*r.sp[i]+cP*r.cp[i]*dc,v=z>=0;
    if(i>0&&v!==pv){
      const t=pz/(pz-z);let qx=px+(x-px)*t,qy=py+(y-py)*t;const h=Math.sqrt(qx*qx+qy*qy)||1;qx/=h;qy/=h;
      if(v){ctx.moveTo(cx+R0*qx,cy-R0*qy);pen=true;}else{ctx.lineTo(cx+R0*qx,cy-R0*qy);pen=false;}
    }
    if(v){const X=cx+R0*x,Y=cy-R0*y;if(pen)ctx.lineTo(X,Y);else{ctx.moveTo(X,Y);pen=true;}}
    px=x;py=y;pz=z;pv=v;
  }
}
function drawLive(ctx,g){
  if(g.type==='Sphere'){ctx.beginPath();ctx.arc(W/2,H/2,R0,0,Math.PI*2);return true;}
  const p=prep(g);if(!p)return false;
  const lc=-globeRot[0]*D2R,pc=-globeRot[1]*D2R,cL=Math.cos(lc),sL=Math.sin(lc),cP=Math.cos(pc),sP=Math.sin(pc),cx=W/2,cy=H/2;
  ctx.beginPath();
  if(p.sphere){ctx.moveTo(cx+R0,cy);ctx.arc(cx,cy,R0,0,Math.PI*2);ctx.closePath();}
  if(p.polys){for(const poly of p.polys)for(const r of poly)ringPath(ctx,r,cL,sL,cP,sP,cx,cy);}
  else for(const r of p.lines)linePath(ctx,r,cL,sL,cP,sP,cx,cy);
  return true;
}
// Position eines Punktes (Datum mit lon/lat oder Feature) in Projektionskoordinaten bei der aktuellen Drehung; null = Rückseite
function dotPos(d){
  let ll=null;
  if(d&&d.lon!==undefined)ll=[d.lon,d.lat];else if(d&&d.geometry)ll=info(d).c;
  if(!ll)return null;
  const lc=-globeRot[0]*D2R,pc=-globeRot[1]*D2R,l=ll[0]*D2R,p=ll[1]*D2R,dl=l-lc,cp=Math.cos(p);
  const z=Math.sin(pc)*Math.sin(p)+Math.cos(pc)*cp*Math.cos(dl);
  if(z<0.012)return null;
  return [W/2+R0*cp*Math.sin(dl)+(d.dx||0),H/2-R0*(Math.cos(pc)*Math.sin(p)-Math.sin(pc)*cp*Math.cos(dl))];
}
function liveCircle(el){
  if(el.getAttribute('fill')==='transparent')return null;
  const p=dotPos(el.__data__);if(!p)return null;
  return [p[0],p[1],(G.kBuilt||G.k)/G.k]; // Bildschirmgröße bleibt beim Zoomen gleich (r-Attribut gilt für kBuilt, die Ansicht ist mit G.k skaliert)
} // Trefferkreise (transparent) nicht zeichnen
// Nadel (Drop a Pin) beim Live-Zeichnen: Position aus Länge/Breite, Größe bleibt in Bildschirmpixeln
function livePin(d){
  if(!d||d.lon===undefined)return null;
  const p=dotPos(d);if(!p)return null;
  return [p[0],p[1],(G.kBuilt||G.k)/G.k];
}
// Punkte-Elemente (cx/cy/data-away) auf die aktuelle Drehung bringen, damit die Handler der Treffer-/Hover-Logik (nearestDot) stimmen
function syncDots(){
  const sig=globeRot[0]+','+globeRot[1]+','+G.k;if(G.dotSig===sig)return;G.dotSig=sig;
  d3.selectAll('#map .dyn circle').each(function(d){
    if(!(d&&(d.lon!==undefined||d.geometry)))return; // Kreise ohne Ortsdaten nicht anfassen
    const pos=dotPos(d);
    if(!pos){this.setAttribute('data-away','1');return;}
    this.removeAttribute('data-away');this.setAttribute('cx',pos[0]);this.setAttribute('cy',pos[1]);
  });
}
// Treffer-Suche im Live-Modus (kurz nach dem Loslassen, bis renderMap die Klickflächen neu aufgebaut hat): Zeigerposition
// → Länge/Breite → Land (erst grob über Umkreis, dann d3.geoContains). Während des Ziehens selbst kein Hover.
function hitLive(cx,cy){
  if(G.drag&&G.drag.moved)return null;
  const node=document.getElementById('map');if(!node||!currentProj||!G.apply||typeof countryPaths==='undefined'||!countryPaths)return null;
  const inv=node.getScreenCTM().inverse();
  const ux=inv.a*cx+inv.c*cy+inv.e,uy=inv.b*cx+inv.d*cy+inv.f;
  const px=(ux-G.tx)/G.k,py=(uy-G.ty)/G.k;
  if(Math.hypot(px-W/2,py-H/2)>=R0)return null;
  const ll=currentProj.invert([px,py]);if(!ll||!isFinite(ll[0])||!isFinite(ll[1]))return null;
  // 1) Drop-a-Pin: die Vollflächen-Klickfläche fängt alles ab (Klick wertet die Zeigerposition über currentProj.invert aus)
  const po=node.querySelector('.pin-overlay');if(po)return po;
  syncDots();
  // 2) Punkte: nächstgelegener Trefferkreis, in dem der Zeiger liegt
  let best=null,bd=Infinity;
  d3.selectAll('#map .dyn g[class$="-hit"] circle').each(function(d){
    if(this.style.display==='none')return;
    const pos=dotPos(d);if(!pos)return;
    const dd=Math.hypot(pos[0]-px,pos[1]-py);
    if(dd<=(+this.getAttribute('r')||0)*((G.kBuilt||G.k)/G.k)&&dd<bd){bd=dd;best=this;}
  });
  if(best)return best;
  // 3) Seen (nur im Seen-Quiz anklickbar)
  d3.selectAll('#map .lakes path').each(function(d){
    if(best||this.style.cursor!=='pointer'||!d||!d.type)return;
    const i=info(d);if(i.c&&d3.geoDistance(i.c,ll)>i.r+0.02)return;
    if(d3.geoContains(d,ll))best=this;
  });
  if(best)return best;
  // 4) Länder
  countryPaths.each(function(d){
    if(best||!d||!d.type)return;
    const i=info(d);if(i.c&&d3.geoDistance(i.c,ll)>i.r+0.02)return;
    if(d3.geoContains(d,ll))best=this;
  });
  if(best)return best;
  // 5) Inselzonen (über dem Meer): Ringe live projizieren, ebene Punkt-in-Fläche-Prüfung
  d3.selectAll('#map .iz-hits path').each(function(z){
    if(best||!z||!z.geometry)return;
    for(const ring of z.geometry.coordinates){
      const pts=[];for(const q of ring){const pp=dotPos({lon:q[0],lat:q[1]});if(pp)pts.push(pp);}
      if(pts.length>=3&&d3.polygonContains(pts,[px,py])){best=this;return;}
    }
  });
  return best;
}
// Punktgröße für Zoom k setzen und merken, für welchen Zoom die r-Attribute gelten; die Live-Zeichnung skaliert davon aus mit dem aktuellen Zoom
function dotsAt(k){if(G.dotR){G.dotR(k);G.kBuilt=k;}}
function setLive(on){
  if(on){if(currentProj)currentProj.precision(window.Globe.precision()*1.6);}
  if(window.CanvasMap)window.CanvasMap.setLive(on?currentProj:null,on?liveGeom:null,on?drawLive:null,on?hitLive:null,on?liveCircle:null,on?livePin:null);
}
function frame(){ // eine Zeichnung pro Animationsbild
  if(G.raf)return;
  G.raf=requestAnimationFrame(()=>{G.raf=0;if(window.Sky)window.Sky.rotate(globeRot);if(window.CanvasMap)window.CanvasMap.invalidate();});
}
let _touchN=0;
function rebuild(){
  if(_touchN>0){clearTimeout(G.rebuildT);G.rebuildT=setTimeout(rebuild,200);return;} // Finger liegen noch: nicht mitten in der Geste neu aufbauen (Ruckler)
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
  if(d.moved){G.suppressUntil=performance.now()+60;clearTimeout(G.rebuildT);G.rebuildT=setTimeout(rebuild,280);}
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
  const tols=[0.12,0.07,0.04,0.02];let ti=0,i=0;
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
  if(typeof projection==='undefined'||projection!=='globe')return; // nur im Globus-Modus zuständig
  ev.preventDefault();
  const dy=ev.deltaY*(ev.deltaMode===1?15:ev.deltaMode===2?300:1);
  const f=Math.pow(2,-dy*0.0022),k0=G.k,k1=clamp(k0*f,1,gmax());
  if(Math.abs(k1-k0)<1e-6||!currentProj||!G.apply)return;
  const inv=node.getScreenCTM().inverse();
  const ux=inv.a*ev.clientX+inv.c*ev.clientY+inv.e,uy=inv.b*ev.clientX+inv.d*ev.clientY+inv.f;
  const rotated=rotToward(ux,uy,k0,k1);
  const [tx,ty]=G.centred(k1);
  G.apply(k1,tx,ty);
  svg.property('__zoom',d3.zoomIdentity.translate(tx,ty).scale(k1)); // d3-Zoom (Pinch) kennt den neuen Stand
  afterRotate(rotated,k1);
}
// Dreht die Kugel beim Hineinzoomen zum Zeigepunkt (Cursor oder Mitte der zwei Finger); Kugel selbst bleibt zentriert
function rotToward(ux,uy,k0,k1,gain){
  gain=gain||1;
  if(!currentProj||k1<=k0)return false;
  const px=(ux-G.tx)/k0,py=(uy-G.ty)/k0;
  const ll=currentProj.invert([px,py]);
  const onGlobe=ll&&isFinite(ll[0])&&isFinite(ll[1])&&Math.hypot(px-W/2,py-H/2)<R0*0.985;
  let rotated=false;
  if(onGlobe){
    const c0=[-globeRot[0],-globeRot[1]],step=Math.min(0.6*gain,Math.log2(k1/k0)*0.9*gain);
    const nc=d3.geoInterpolate(c0,ll)(step);
    globeRot=[-nc[0],clamp(-nc[1],-90,90)];currentProj.rotate(globeRot);
    rotated=true;
  }
  return rotated;
}
function afterRotate(rotated,k1){
  if(rotated){
    if(!G.wheelLive){setLive(true);G.wheelLive=true;}
    if(window.Sky)window.Sky.rotate(globeRot);
    frame();
    clearTimeout(G.rebuildT);G.rebuildT=setTimeout(()=>{G.wheelLive=false;rebuild();},280);
  }else if(tolFor(k1)<G.builtTol||k1<(G.cullK||1)-1e-4){refine();}
  else if(!G.wheelLive){dotsAt(k1);}
}
function bindOnce(parent){
  if(G.bound)return;G.bound=true;
  window.addEventListener('pointermove',onMove);
  window.addEventListener('touchstart',e=>{_touchN=e.touches.length;},{passive:true});
  window.addEventListener('touchend',e=>{_touchN=e.touches.length;},{passive:true});
  window.addEventListener('touchcancel',()=>{_touchN=0;},{passive:true});
  // Fenster größer/gedreht: der Ausschnitt ändert sich → Kartenbaum neu beschneiden
  window.addEventListener('resize',()=>{
    if(typeof projection==='undefined'||projection!=='globe')return;
    const gs=document.getElementById('game-screen');if(!gs||gs.style.display==='none'||typeof game==='undefined'||!game||!Object.keys(game).length)return;
    updateVis();clearTimeout(G.rebuildT);G.rebuildT=setTimeout(rebuild,250);
  });
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
  behind(d){return hidden(info(d),G.k);},
  pathString,
  _test:{densify,dp}, // nur für test/perf.test.js
  get k(){return G.k;},
  // Wird von renderMap() nach dem Aufbau des Kartenbaums aufgerufen (nur im Globus-Modus)
  install(svg,wrapG,applyDotR){
    const node=svg.node(),cx=W/2,cy=H/2;
    G.dotR=applyDotR;updateVis();
    // Ansicht = translate(tx,ty) scale(k). Zoom richtet sich nach dem Cursor/den Fingern (wie bei den flachen Karten);
    // die Verschiebung ist so begrenzt, dass die Kugel beim Herauszoomen wieder in die Mitte zurückkehrt.
    const centred=k=>[cx*(1-k),cy*(1-k)];
    G.centred=centred;
    G.apply=(k,tx,ty)=>{
      if(tx==null){[tx,ty]=centred(k);}
      G.k=k;G.tx=tx;G.ty=ty;
      wrapG.attr('transform','translate('+tx.toFixed(3)+','+ty.toFixed(3)+') scale('+k+')');
    };
    G.k=clamp(G.k,1,gmax());G.builtTol=tolFor(G.k);G.cullK=G.k; // cullK: für diesen Zoom ist der Kartenbaum auf den Bildausschnitt beschnitten
    if(G.tx==null){[G.tx,G.ty]=centred(G.k);}
    G.apply(G.k,G.tx,G.ty);
    zoomBehavior=d3.zoom().scaleExtent([1,gmax()])
      .filter(ev=>ev.touches&&ev.touches.length>1) // Mausrad macht on('wheel.globe') unten
      .constrain(t=>{ // Versatz zur zentrierten Lage höchstens (k-1)*Radius: bei k=1 genau zentriert
        const k=t.k,[bx,by]=centred(k); // immer zentriert (Google-Maps-Verhalten)
        return d3.zoomIdentity.translate(bx,by).scale(k);})
      .on('zoom',ev=>{const t=ev.transform;if(Math.abs(t.k-G.k)>1e-4||Math.abs(t.x-G.tx)>0.01||Math.abs(t.y-G.ty)>0.01){const kc=Math.abs(t.k-G.k)>1e-4;
        // Zwei-Finger-Zoom: Kugel bleibt zentriert, dreht sich aber zur Mitte der Finger
        const se=ev.sourceEvent,tc=se&&se.touches;
        if(kc&&t.k>G.k&&tc&&tc.length>=2){const mx=(tc[0].clientX+tc[1].clientX)/2,my=(tc[0].clientY+tc[1].clientY)/2,inv=node.getScreenCTM().inverse();
          const ux=inv.a*mx+inv.c*my+inv.e,uy=inv.b*mx+inv.d*my+inv.f;
          const rot=rotToward(ux,uy,G.k,t.k,0.45);G.apply(t.k,t.x,t.y);afterRotate(rot,t.k);return;}
        G.apply(t.k,t.x,t.y);
        if(kc&&(tolFor(t.k)<G.builtTol||t.k<(G.cullK||1)-1e-4))refine(); // weiter hineingezoomt: Konturen feiner; herausgezoomt: größerer Ausschnitt (live, danach Neuaufbau)
        else if(kc&&G.dotR&&!G.wheelLive)dotsAt(t.k);}})
      .on('end',()=>{dotsAt(G.k);});
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
    dotsAt(G.k);
    prebuild();
  },
  // Punkte auf der abgewandten Seite ausblenden (canvas-map überspringt Elemente mit data-away)
  cull(){
    const c=[-globeRot[0],-globeRot[1]];
    d3.selectAll('#map .dyn circle').each(function(d){
      let ll=null;
      if(d&&d.lon!==undefined)ll=[d.lon,d.lat];else if(d&&d.geometry)ll=info(d).c;
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
