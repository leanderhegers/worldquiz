// Baut data/island-zones.json: die klickbaren Bereiche (Zonen) für Inselstaaten.
// Gleicher Ablauf wie die Demo tools/island-demo.html (Stil "freihand rund"), nur vorab gerechnet:
//   1. Aus den Inselpunkten eines Staates wird eine glatte Blob-Form gebildet (Radius-Funktion über
//      den Winkel, tiefpassgefiltert, mit Rand).
//   2. Pro Gitterzelle: innerhalb des Blobs UND nicht weiter als MAX_NEAR von den Inseln, nicht in
//      fremdem Land, und nur dort, wo kein Nachbarstaat "weiter innen" liegt (keine Überlappung).
//   3. Gauß-Glättung, Umriss bei 0 (d3.contours), zurück nach Längen-/Breitengrad.
// Ausgabe: je Staat eine Liste von Ringen in [lon,lat] (Längengrade bei Datumsgrenze fortlaufend,
// also auch > 180 möglich). Das Spiel projiziert die Ringe mit der gerade gewählten Karte.
//
// Aufruf (im Projektordner):  node tools/build-island-zones.js
// Danach CACHE_NAME in sw.js erhöhen und veröffentlichen. Die Form einzelner Staaten lässt sich über
// OVERRIDES unten gezielt anpassen (Rand, Abstand, Rundheit je Staat).
const fs=require('fs'),path=require('path'),vm=require('vm');
const root=path.join(__dirname,'..');
const d3=require(path.join(root,'vendor/d3.v7.min.js'));
const topojson=require(path.join(root,'vendor/topojson.v3.min.js'));
const ctx={};vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(root,'countries.js'),'utf8').replace(/\bconst\b/g,'var'),ctx);
const {C,MICROSTATES,ISLAND_ZONES}=ctx;
const world=JSON.parse(fs.readFileSync(path.join(root,'data/countries-50m.json'),'utf8'));
const land=topojson.feature(world,world.objects.countries);

// ── Voreinstellungen (wie Demo-Regler) und Ausnahmen je Staat ──
const DEFAULTS={margin:4,near:8,harm:2};
const OVERRIDES={
  // Beispiel: 584:{margin:3,near:6,harm:3}
};

const WW=960,H=0.5,SIGMA=1.8,NA=90,FOREIGN_BUFFER=2.0; // Abstand zu fremdem Land in Karteneinheiten (~85 km am Äquator)
const wproj=d3.geoMercator().scale(WW/(2*Math.PI)).translate([WW/2,250]);
const km=(a,b)=>{const R=6371,r=Math.PI/180,dl=(b[1]-a[1])*r,dn=(b[0]-a[0])*r;const x=Math.sin(dl/2)**2+Math.cos(a[1]*r)*Math.cos(b[1]*r)*Math.sin(dn/2)**2;return 2*R*Math.asin(Math.sqrt(x));};
function coordsOf(f){const out=[];(function walk(c){if(typeof c[0]==='number')out.push(c);else c.forEach(walk);})(f.geometry.coordinates);return out;}

// ── 1) Inselpunkte je Staat (Weltkarten-Einheiten, Datumsgrenze entrollt) ──
const NATIONS=ISLAND_ZONES.map(z=>({id:z.id,near:z.near,nearKm:z.nearKm,fb:z.fallbackLon!=null?[z.fallbackLon,z.fallbackLat]:null})).filter(n=>C[n.id]);
NATIONS.forEach(n=>{
  let ll=land.features.filter(f=>+f.id===n.id).flatMap(coordsOf);
  if(n.near)ll=ll.filter(p=>km(p,n.near)<=n.nearKm);
  if(!ll.length){const d=MICROSTATES.find(m=>m.id===n.id);const c=n.fb||(d&&[d.lon,d.lat]);ll=c?[c]:[];n.noOutline=true;}
  {const d0=MICROSTATES.find(m=>m.id===n.id);if(d0&&!n.noOutline)ll.push([d0.lon,d0.lat]);}
  let pts=ll.map(p=>wproj(p));
  const xs=pts.map(p=>p[0]).sort((a,b)=>a-b),med=xs[Math.floor(xs.length/2)];
  pts=pts.map(([x,y])=>[x-med>WW/2?x-WW:med-x>WW/2?x+WW:x,y]);
  const seen=new Set(),thin=[];
  pts.forEach(p=>{const k=Math.round(p[0]/0.5)+','+Math.round(p[1]/0.5);if(!seen.has(k)){seen.add(k);thin.push(p);}});
  n.pts=thin;
});

// ── 2) Blob-Form (Radius-Funktion über den Winkel) ──
function blobOf(pts,margin,Hm){
  let x0=1e9,y0=1e9,x1=-1e9,y1=-1e9;pts.forEach(p=>{x0=Math.min(x0,p[0]);x1=Math.max(x1,p[0]);y0=Math.min(y0,p[1]);y1=Math.max(y1,p[1]);});
  const c=[(x0+x1)/2,(y0+y1)/2];
  const hull=pts.length>=3?d3.polygonHull(pts):null;
  const base=new Array(NA).fill(0);
  for(let k=0;k<NA;k++){
    const t=k/NA*Math.PI*2,dx=Math.cos(t),dy=Math.sin(t);
    let best=0;
    if(hull){
      for(let i=0;i<hull.length;i++){
        const a=hull[i],b=hull[(i+1)%hull.length];
        const ex=b[0]-a[0],ey=b[1]-a[1],den=dx*ey-dy*ex;if(!den)continue;
        const tt=((a[0]-c[0])*ey-(a[1]-c[1])*ex)/den;
        const uu=((a[0]-c[0])*dy-(a[1]-c[1])*dx)/den;
        if(tt>0&&uu>=0&&uu<=1&&tt>best)best=tt;
      }
    }else pts.forEach(p=>{const d=Math.hypot(p[0]-c[0],p[1]-c[1]);if(d>best)best=d;});
    base[k]=best;
  }
  const sm=new Array(NA).fill(base.reduce((s,v)=>s+v,0)/NA);
  for(let m=1;m<=Hm;m++){
    let a=0,b=0;
    for(let k=0;k<NA;k++){const t=k/NA*Math.PI*2;a+=base[k]*Math.cos(m*t);b+=base[k]*Math.sin(m*t);}
    a*=2/NA;b*=2/NA;
    for(let k=0;k<NA;k++){const t=k/NA*Math.PI*2;sm[k]+=a*Math.cos(m*t)+b*Math.sin(m*t);}
  }
  let r=sm.map(v=>Math.max(v,0)+margin);
  const interp=(arr,ang)=>{const f=((ang%(Math.PI*2))+Math.PI*2)%(Math.PI*2)/(Math.PI*2)*NA,i=Math.floor(f)%NA,j=(i+1)%NA,w=f-Math.floor(f);return arr[i]*(1-w)+arr[j]*w;};
  let sc=1;pts.forEach(p=>{const d=Math.hypot(p[0]-c[0],p[1]-c[1]);if(d>1e-6){const need=d/interp(r,Math.atan2(p[1]-c[1],p[0]-c[0]));if(need>sc)sc=need;}});
  r=r.map(v=>v*Math.max(sc*1.04,1));
  return {c,at:ang=>interp(r,ang),rmax:Math.max(...r)};
}

// ── Fremdes Land: ist der Weltpunkt (x,y) Land eines anderen Staates? (Planar-PIP mit Rahmen-Vorfilter) ──
function pipRing(ring,x,y){let c=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){const xi=ring[i][0],yi=ring[i][1],xj=ring[j][0],yj=ring[j][1];if((yi>y)!==(yj>y)&&x<(xj-xi)*(y-yi)/(yj-yi)+xi)c=!c;}return c;}
const feats=land.features.map(ft=>{
  const g=ft.geometry;if(!g)return null;
  const polys=g.type==='Polygon'?[g.coordinates]:g.type==='MultiPolygon'?g.coordinates:[];
  const b=d3.geoBounds(ft);
  const wrap=b[0][0]>b[1][0];
  return {id:+ft.id,ft,b,wrap,polys:polys.map(rings=>{let x0=1e9,y0=1e9,x1=-1e9,y1=-1e9;rings[0].forEach(p=>{x0=Math.min(x0,p[0]);x1=Math.max(x1,p[0]);y0=Math.min(y0,p[1]);y1=Math.max(y1,p[1]);});return {rings,x0,y0,x1,y1};})};
}).filter(Boolean);
function isLandOf(f,lon,lat){
  if(f.wrap)return d3.geoContains(f.ft,[lon,lat]);
  if(lat<f.b[0][1]||lat>f.b[1][1]||lon<f.b[0][0]||lon>f.b[1][0])return false;
  for(const p of f.polys){
    if(lon<p.x0||lon>p.x1||lat<p.y0||lat>p.y1)continue;
    let ins=false;for(const r of p.rings)if(pipRing(r,lon,lat))ins=!ins;
    if(ins)return true;
  }
  return false;
}
function foreignAt(ownId,x,y){
  const q=wproj.invert([x,y]);const lon=((q[0]+540)%360)-180,lat=q[1];
  if(lat<-60)return false;
  for(const f of feats){if(f.id===ownId)continue;if(isLandOf(f,lon,lat))return true;}
  return false;
}

function gaussBlur(v,nx,ny,sigma){
  const R=Math.ceil(sigma*3),k=[];
  for(let i=-R;i<=R;i++)k.push(Math.exp(-(i*i)/(2*sigma*sigma)));
  const tmp=new Float64Array(v.length),out=new Float64Array(v.length);
  for(let j=0;j<ny;j++)for(let i=0;i<nx;i++){let s=0,ws=0;for(let t=-R;t<=R;t++){const x=i+t;if(x<0||x>=nx)continue;s+=v[j*nx+x]*k[t+R];ws+=k[t+R];}tmp[j*nx+i]=s/ws;}
  for(let j=0;j<ny;j++)for(let i=0;i<nx;i++){let s=0,ws=0;for(let t=-R;t<=R;t++){const y=j+t;if(y<0||y>=ny)continue;s+=tmp[y*nx+i]*k[t+R];ws+=k[t+R];}out[j*nx+i]=s/ws;}
  return out;
}

// ── 3) Zonen rechnen ──
// Durchgang 1: je Staat ein geglättetes Feld g (positiv = innerhalb der Form, nicht in fremdem Land).
// Durchgang 2: Überlappung entfällt, indem jede Zelle dem Staat gehört, dessen Feld dort am größten ist
// (val = g_eigen − max(0, g_Nachbar)); die Trennlinie ist dort, wo beide Felder gleich sind (weiche
// Kurve, keine Überlappung). Danach Umriss knapp über 0, damit sich Bereiche nicht berühren.
const par=n=>Object.assign({},DEFAULTS,OVERRIDES[n.id]||{});
const all=NATIONS.map(n=>{const p=par(n);return {n,p,bl:blobOf(n.pts,Math.max(p.margin,1.5),p.harm)};});
all.forEach(a=>{
  const {c,rmax}=a.bl,maxNear=a.p.near;
  const R=Math.min(rmax,Math.max(...a.n.pts.map(p=>Math.hypot(p[0]-c[0],p[1]-c[1])))+maxNear+2);
  const ext=Math.max(R,rmax)+1,bx0=c[0]-ext,by0=c[1]-ext,nx=Math.ceil(ext*2/H),ny=nx;
  // Wert vor Berücksichtigung fremden Landes: innerhalb der Freihandform UND nicht zu weit von den Inseln
  const f=new Float64Array(nx*ny);
  for(let j=0;j<ny;j++)for(let i=0;i<nx;i++){
    const x=bx0+(i+0.5)*H,y=by0+(j+0.5)*H;
    const dx=x-c[0],dy=y-c[1],rr=a.bl.at(Math.atan2(dy,dx)),q=Math.hypot(dx,dy)/rr;
    let dmin=1e9;for(const p of a.n.pts){const dd=Math.hypot(x-p[0],y-p[1]);if(dd<dmin)dmin=dd;}
    f[j*nx+i]=Math.min((1-q)*rr,maxNear-dmin);
  }
  // Fremdes Land samt Sicherheitsabstand (FOREIGN_BUFFER Karteneinheiten) ausschneiden. Der Abstand hält
  // den Bereich auch von kleinen fremden Inseln fern (z. B. Haitis Inseln nördlich der Bahamas).
  if(!a.n.noOutline){
    const rB=Math.ceil(FOREIGN_BUFFER/H),cand=new Uint8Array(nx*ny),fg=new Uint8Array(nx*ny);
    for(let j=0;j<ny;j++)for(let i=0;i<nx;i++)if(f[j*nx+i]>0)for(let dj=-rB;dj<=rB;dj++)for(let di=-rB;di<=rB;di++){
      const ii=i+di,jj=j+dj;if(ii>=0&&jj>=0&&ii<nx&&jj<ny)cand[jj*nx+ii]=1;
    }
    for(let j=0;j<ny;j++)for(let i=0;i<nx;i++)if(cand[j*nx+i])fg[j*nx+i]=foreignAt(a.n.id,bx0+(i+0.5)*H,by0+(j+0.5)*H)?1:0;
    for(let j=0;j<ny;j++)for(let i=0;i<nx;i++){
      if(f[j*nx+i]<=0)continue;
      let hit=false;
      for(let dj=-rB;dj<=rB&&!hit;dj++)for(let di=-rB;di<=rB;di++){
        if(di*di+dj*dj>rB*rB)continue;
        const ii=i+di,jj=j+dj;if(ii>=0&&jj>=0&&ii<nx&&jj<ny&&fg[jj*nx+ii]){hit=true;break;}
      }
      if(hit)f[j*nx+i]=-4;
    }
  }
  a.F={bx0,by0,nx,ny,d:gaussBlur(f,nx,ny,SIGMA)};
});
function sample(F,x,y){
  const gx=(x-F.bx0)/H-0.5,gy=(y-F.by0)/H-0.5,i=Math.floor(gx),j=Math.floor(gy);
  if(i<0||j<0||i>=F.nx-1||j>=F.ny-1)return 0;
  const fx=gx-i,fy=gy-j,A=F.d[j*F.nx+i],B=F.d[j*F.nx+i+1],Cc=F.d[(j+1)*F.nx+i],D=F.d[(j+1)*F.nx+i+1];
  return A*(1-fx)*(1-fy)+B*fx*(1-fy)+Cc*(1-fx)*fy+D*fx*fy;
}
const result=[];
all.forEach(a=>{
  const F=a.F,{bx0,by0,nx,ny}=F;
  const rivals=all.filter(o=>o!==a);
  const f2=new Float64Array(nx*ny);
  for(let j=0;j<ny;j++)for(let i=0;i<nx;i++){
    const idx=j*nx+i,ga=F.d[idx];
    if(ga<=0){f2[idx]=ga;continue;}
    const x=bx0+(i+0.5)*H,y=by0+(j+0.5)*H;
    let go=0;
    for(const o of rivals)for(const sh of [-WW,0,WW]){const v=sample(o.F,x+sh,y);if(v>go)go=v;}
    f2[idx]=ga-go-0.7*Math.min(1,go*4); // kleiner Abstand zum Nachbarn, damit sich nichts berührt
  }
  const geo=d3.contours().size([nx,ny]).thresholds([0.06]).smooth(true)(f2)[0];
  const r2=v=>Math.round(v*100)/100;
  const rings=[];
  geo.coordinates.forEach(poly=>poly.forEach((ring,ri)=>{
    const ll=ring.map(([gx,gy])=>{const q=wproj.invert([bx0+gx*H,by0+gy*H]);return [r2(q[0]),r2(q[1])];});
    if(ri===0&&ll.length>=4)rings.push(ll); // Löcher (Innenringe) werden ignoriert: kleine Löcher wären nur Rauschen
  }));
  result.push({id:a.n.id,name:C[a.n.id].de,rings});
  console.log(C[a.n.id].de.padEnd(14),'Ringe:',rings.length,'Punkte:',rings.reduce((t,r)=>t+r.length,0));
});
fs.writeFileSync(path.join(root,'data/island-zones.json'),JSON.stringify({zones:result.map(z=>({id:z.id,rings:z.rings}))}));
console.log('geschrieben:',fs.statSync(path.join(root,'data/island-zones.json')).size,'Bytes');
