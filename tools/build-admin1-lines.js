// Baut data/admin1-lines.json: die Bundesländer-/Provinzgrenzen für Drop-a-Pin als fertige Linien,
// an den Länderumrissen der Karte (data/countries-50m.json) zugeschnitten.
//
// Warum: admin1-borders-10m.json ist feiner (10m) als die gezeichneten Länderumrisse (50m). Ohne
// Zuschneiden ragen innere Linien an Landesgrenzen ein Stück über die gezeigte Grenze hinaus (ins
// Nachbarland oder ins Meer). Hier wird jede Linie an den Umriss "ihres" Landes (das Land, in dem
// die meisten ihrer Punkte liegen) gekürzt; an den Schnittstellen endet sie genau auf dem Umriss.
// Länder, die den Antimeridian überspannen (Russland, Fidschi), bleiben ungekürzt.
//
// Aufruf (im Projektordner):  node tools/build-admin1-lines.js
// Danach CACHE_NAME in sw.js erhöhen und veröffentlichen.
const fs=require('fs'),path=require('path');
const root=path.join(__dirname,'..');
const d3=require(path.join(root,'vendor/d3.v7.min.js'));
const topojson=require(path.join(root,'vendor/topojson.v3.min.js'));
const admin1=JSON.parse(fs.readFileSync(path.join(root,'data/admin1-borders-10m.json'),'utf8'));
const world=JSON.parse(fs.readFileSync(path.join(root,'data/countries-50m.json'),'utf8'));

// Gleicher Filter wie früher zur Laufzeit: nur Linien zwischen verschiedenen Regionen desselben Landes.
const country=g=>g.slice(0,g.indexOf('||'));
const mesh=topojson.mesh(admin1,admin1.objects.admin1,(a,b)=>{
  const ga=a.properties.grp,gb=b.properties.grp;
  return ga!==gb&&country(ga)===country(gb);
});

function pipRing(ring,x,y){
  let c=false;
  for(let i=0,j=ring.length-1;i<ring.length;j=i++){
    const xi=ring[i][0],yi=ring[i][1],xj=ring[j][0],yj=ring[j][1];
    if((yi>y)!==(yj>y)&&x<(xj-xi)*(y-yi)/(yj-yi)+xi)c=!c;
  }
  return c;
}
const feats=topojson.feature(world,world.objects.countries).features;
const cs=[];
feats.forEach(f=>{
  const g=f.geometry;if(!g)return;
  const polys=g.type==='Polygon'?[g.coordinates]:g.type==='MultiPolygon'?g.coordinates:[];
  if(!polys.length)return;
  const b=d3.geoBounds(f);
  if(b[0][0]>b[1][0])return;
  const ps=polys.map(rings=>{
    let x0=1e9,y0=1e9,x1=-1e9,y1=-1e9;
    rings[0].forEach(p=>{if(p[0]<x0)x0=p[0];if(p[0]>x1)x1=p[0];if(p[1]<y0)y0=p[1];if(p[1]>y1)y1=p[1];});
    return {rings,x0,y0,x1,y1};
  });
  cs.push({bx0:b[0][0],by0:b[0][1],bx1:b[1][0],by1:b[1][1],ps});
});
function inCountry(c,x,y){
  if(x<c.bx0||x>c.bx1||y<c.by0||y>c.by1)return false;
  for(const p of c.ps){
    if(x<p.x0||x>p.x1||y<p.y0||y>p.y1)continue;
    let inside=false;
    for(const r of p.rings)if(pipRing(r,x,y))inside=!inside;
    if(inside)return true;
  }
  return false;
}
function segCut(c,a,b){
  let bestT=2;
  const dx=b[0]-a[0],dy=b[1]-a[1];
  for(const p of c.ps)for(const r of p.rings){
    for(let i=0,j=r.length-1;i<r.length;j=i++){
      const ex=r[i][0]-r[j][0],ey=r[i][1]-r[j][1];
      const den=dx*ey-dy*ex;if(!den)continue;
      const t=((r[j][0]-a[0])*ey-(r[j][1]-a[1])*ex)/den;
      const u=((r[j][0]-a[0])*dy-(r[j][1]-a[1])*dx)/den;
      if(t>=0&&t<=1&&u>=0&&u<=1&&t<bestT)bestT=t;
    }
  }
  return bestT<=1?[a[0]+dx*bestT,a[1]+dy*bestT]:null;
}
function ownerOf(pts){
  const votes=new Map(),step=Math.max(1,Math.floor(pts.length/10));
  for(let k=0;k<pts.length;k+=step)for(const c of cs){if(inCountry(c,pts[k][0],pts[k][1])){votes.set(c,(votes.get(c)||0)+1);break;}}
  let best=null,n=0;votes.forEach((v,c)=>{if(v>n){n=v;best=c;}});
  return best;
}

const out=[];let trimmed=0,unowned=0;
mesh.coordinates.forEach(pts=>{
  const c=ownerOf(pts);
  if(!c){out.push(pts);unowned++;return;}
  let run=null,prev=null;
  pts.forEach((p,k)=>{
    const inn=inCountry(c,p[0],p[1]);
    if(inn){
      if(!run){run=[];if(k>0&&prev){const cut=segCut(c,p,prev);if(cut)run.push(cut);}}
      run.push(p);
    }else{
      trimmed++;
      if(run){const cut=segCut(c,prev,p);if(cut)run.push(cut);if(run.length>1)out.push(run);run=null;}
    }
    prev=p;
  });
  if(run&&run.length>1)out.push(run);
});
const r=v=>Math.round(v*1000)/1000; // ~100 m, reicht für Linien und hält die Datei klein
const result={type:'MultiLineString',coordinates:out.map(l=>l.map(p=>[r(p[0]),r(p[1])]))};
fs.writeFileSync(path.join(root,'data/admin1-lines.json'),JSON.stringify(result));
const pts=a=>a.reduce((n,l)=>n+l.length,0);
console.log('Linien:',mesh.coordinates.length,'->',out.length,'| Punkte:',pts(mesh.coordinates),'->',pts(out),'| gekappt:',trimmed,'| ohne Land (unveraendert):',unowned);
