// Relief-Hintergrund für das Theme "Relief" (Höhenfarben + Schummerung, wird beim Hineinzoomen schärfer).
//
// Die Kacheln (data/relief/{z}/{x}/{y}.png, Web-Mercator, z0–z5, gebaut von tools/build-relief-tiles.js) werden
// vom Canvas-Renderer (canvas-map.js) beim Zeichnen des Elements <rect class="relief-under"> abgerufen:
//   • Mercator: die Kacheln werden direkt gezeichnet (Standard-Kachelkarte; schnell und scharf).
//   • Natural Earth / Equal Earth / Globus: Die sichtbare Fläche wird als Raster aus den Kacheln in die jeweilige
//     Projektion umgerechnet (grobes Gitter über projection.invert, dazwischen linear interpoliert) und als Bitmap
//     gezeichnet. Beim Zoomen/Ziehen wird die alte Bitmap kurz mitgeführt und nach einer Pause neu berechnet.
// Meer ist transparent; die Küste schneidet das Spiel mit einer Vektormaske genau ab (renderMap, "ocean-mask").
// Fehlende Kacheln werden aus der nächstgröberen Stufe gezeichnet, bis die feinere geladen ist.
(function(){
'use strict';
const ZMAX=5,TS=256;
const R={index:null,tiles:new Map(),pending:new Set(),queue:[],active:0,redrawT:0,cache:new Map(),idleT:0,stats:{render:0,lastMs:0}};
const EMPTY={empty:true};

function loadIndex(){
  if(R.indexP)return R.indexP;
  R.indexP=fetch('data/relief/index.json').then(r=>r.json()).then(j=>{
    R.index={};for(let z=0;z<=ZMAX;z++)R.index[z]=new Set(j[z]||[]);
    for(let z=0;z<=2;z++){const N=1<<z;for(let x=0;x<N;x++)for(let y=0;y<N;y++)want(z,x,y);} // grobe Stufen sofort
  }).catch(()=>{R.index={};for(let z=0;z<=ZMAX;z++)R.index[z]=new Set();});
  return R.indexP;
}
function key(z,x,y){return z+'/'+x+'/'+y;}
// Kachel holen: Eintrag (geladen), EMPTY (Meer/leer) oder undefined (noch nicht da, wird angefordert)
function tile(z,x,y){
  const k=key(z,x,y),e=R.tiles.get(k);
  if(e){e.t=R.tick;return e;}
  if(!R.index)return undefined;
  if(!R.index[z].has(x+'_'+y)){R.tiles.set(k,EMPTY);return EMPTY;}
  want(z,x,y);return undefined;
}
function want(z,x,y){
  const k=key(z,x,y);
  if(R.tiles.has(k)||R.pending.has(k))return;
  R.pending.add(k);R.queue.push([z,x,y,k]);pump();
}
function pump(){
  while(R.active<6&&R.queue.length){
    const[z,x,y,k]=R.queue.pop(); // zuletzt angeforderte zuerst (aktuelle Ansicht)
    R.active++;
    const im=new Image();im.decoding='async';
    im.onload=()=>{
      const c=document.createElement('canvas');c.width=c.height=TS;const cx=c.getContext('2d',{willReadFrequently:true});cx.drawImage(im,0,0);
      R.tiles.set(k,{z,x,y,bmp:c,u32:null,t:R.tick});R.pending.delete(k);R.active--;trim();scheduleRedraw();pump();
    };
    im.onerror=()=>{R.tiles.set(k,EMPTY);R.pending.delete(k);R.active--;pump();};
    im.src='data/relief/'+z+'/'+x+'/'+y+'.png';
  }
}
R.tick=0;
function trim(){ // Speicher begrenzen: älteste Kacheln ab z3 verwerfen
  if(R.tiles.size<420)return;
  const arr=[...R.tiles.entries()].filter(([k,e])=>e!==EMPTY&&e.z>=3).sort((a,b)=>a[1].t-b[1].t);
  for(let i=0;i<arr.length-300;i++)R.tiles.delete(arr[i][0]);
}
function scheduleRedraw(){
  clearTimeout(R.redrawT);
  R.redrawT=setTimeout(()=>{R.cache.clear();if(window.CanvasMap)window.CanvasMap.invalidate();},50);
}
function u32(e){
  if(!e.u32)e.u32=new Uint32Array(e.bmp.getContext('2d',{willReadFrequently:true}).getImageData(0,0,TS,TS).data.buffer);
  return e.u32;
}
function inv(m){const d=m[0]*m[3]-m[1]*m[2];if(!d)return null;return[m[3]/d,-m[1]/d,-m[2]/d,m[0]/d,(m[2]*m[5]-m[3]*m[4])/d,(m[1]*m[4]-m[0]*m[5])/d];}

// ── Mercator: Kacheln direkt zeichnen ──
function drawMerc(ctx,m,vp,proj){
  const S=2*Math.PI*proj.scale(),tr=proj.translate();
  const X0=tr[0]-S/2,Y0=tr[1]-S/2;
  const kd=Math.sqrt(Math.abs(m[0]*m[3]-m[1]*m[2]));
  let z=Math.ceil(Math.log2(S*kd/(TS*1.4)));z=Math.max(0,Math.min(ZMAX,z));
  const im=inv(m);if(!im)return;
  const xs=[0,vp.w,0,vp.w],ys=[0,0,vp.h,vp.h];
  let x0=1e18,y0=1e18,x1=-1e18,y1=-1e18;
  for(let i=0;i<4;i++){const X=im[0]*xs[i]+im[2]*ys[i]+im[4],Y=im[1]*xs[i]+im[3]*ys[i]+im[5];if(X<x0)x0=X;if(X>x1)x1=X;if(Y<y0)y0=Y;if(Y>y1)y1=Y;}
  const N=1<<z,T=S/N;
  const tx0=Math.max(0,Math.floor((x0-X0)/T)),tx1=Math.min(N-1,Math.floor((x1-X0)/T));
  const ty0=Math.max(0,Math.floor((y0-Y0)/T)),ty1=Math.min(N-1,Math.floor((y1-Y0)/T));
  if(tx1<tx0||ty1<ty0)return;
  R.tick++;
  ctx.setTransform(m[0],m[1],m[2],m[3],m[4],m[5]);
  ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='medium';
  const pad=0.4/kd;
  for(let tx=tx0;tx<=tx1;tx++)for(let ty=ty0;ty<=ty1;ty++){
    let e=tile(z,tx,ty);
    if(e===EMPTY)continue;
    const dx=X0+T*tx,dy=Y0+T*ty;
    if(e&&e.bmp){ctx.drawImage(e.bmp,dx-pad,dy-pad,T+2*pad,T+2*pad);continue;}
    // noch nicht geladen: gröbere Stufe verwenden
    for(let zz=z-1;zz>=0;zz--){
      const sh=z-zz,ax=tx>>sh,ay=ty>>sh,a=tile(zz,ax,ay);
      if(a===EMPTY)break;
      if(a&&a.bmp){
        const f=TS/(1<<sh),sx=(tx-(ax<<sh))*f,sy=(ty-(ay<<sh))*f;
        ctx.drawImage(a.bmp,sx,sy,f,f,dx-pad,dy-pad,T+2*pad,T+2*pad);break;
      }
    }
  }
}

// ── andere Projektionen / Globus: Umrechnung per Gitter ──
const D2R=Math.PI/180,LAT_MAX=85.0511;
function merc(lon,lat,scale){ // Pixelkoordinaten im Mercator-Mosaik der Größe scale x scale
  const X=(lon+180)/360*scale;
  const s=Math.sin(Math.max(-LAT_MAX,Math.min(LAT_MAX,lat))*D2R);
  const Y=(0.5-Math.log((1+s)/(1-s))/(4*Math.PI))*scale;
  return[X,Y];
}
function render(m,vp,proj,roi){
  const t0=performance.now();
  const rx=roi.x,ry=roi.y,rw=roi.w,rh=roi.h; // zu berechnender Ausschnitt in Gerätepixeln
  const q=Math.min(R.live?0.3:1,Math.sqrt((R.live?260000:650000)/(rw*rh)));
  const ow=Math.max(2,Math.ceil(rw*q)),oh=Math.max(2,Math.ceil(rh*q)),G=8;
  const im=inv(m);if(!im)return null;
  const nx=Math.ceil(ow/G)+1,ny=Math.ceil(oh/G)+1;
  const M5=(1<<ZMAX)*TS;
  // Knoten: Länge/Breite → Mosaik-Pixel bei z5 (X,Y); ungültig = NaN
  const NX=new Float64Array(nx*ny).fill(NaN),NY=new Float64Array(nx*ny).fill(NaN);
  const pt=(i,j)=>{ // Ausgabe-Pixel (i,j) → [X,Y] bei z5 oder null
    const dx=rx+i/q,dy=ry+j/q;
    const px=im[0]*dx+im[2]*dy+im[4],py=im[1]*dx+im[3]*dy+im[5];
    const p=proj.invert([px,py]);
    if(!p||!isFinite(p[0])||!isFinite(p[1])||Math.abs(p[1])>LAT_MAX)return null;
    const f=proj(p);if(!f||Math.abs(f[0]-px)>0.6||Math.abs(f[1]-py)>0.6)return null; // außerhalb der Projektion
    return merc(p[0],p[1],M5);
  };
  for(let j=0;j<ny;j++)for(let i=0;i<nx;i++){const r=pt(Math.min(i*G,ow),Math.min(j*G,oh));if(r){NX[j*nx+i]=r[0];NY[j*nx+i]=r[1];}}
  // Zoomstufe aus der Pixeldichte in der Bildmitte wählen
  let dens=[];
  for(let j=0;j<ny-1;j+=2)for(let i=0;i<nx-1;i+=2){
    const a=j*nx+i,b=a+1;if(isNaN(NX[a])||isNaN(NX[b]))continue;
    let d=Math.abs(NX[b]-NX[a]);if(d>M5/2)continue;dens.push(d/G);
  }
  dens.sort((a,b)=>a-b);
  const d=dens.length?dens[dens.length>>1]:8;
  const z=Math.max(0,Math.min(ZMAX,ZMAX-Math.floor(Math.log2(Math.max(1,d)))));
  const sc=1/(1<<(ZMAX-z)),Mz=(1<<z)*TS;
  R.tick++;
  const out=document.createElement('canvas');out.width=ow;out.height=oh;
  const octx=out.getContext('2d'),img=octx.createImageData(ow,oh),o32=new Uint32Array(img.data.buffer);
  const last={k:-1,u:null};
  // Pixel aus dem Mosaik (Koordinaten bei Stufe z)
  function px(X,Y){
    if(Y<0||Y>=Mz)return 0;
    X=((X%Mz)+Mz)%Mz;
    const xi=X|0,yi=Y|0;let zz=z,tx=xi>>8,ty=yi>>8,lx=xi&255,ly=yi&255;
    for(;;){
      const k=(zz<<28)|(tx<<14)|ty;
      let u;
      if(k===last.k)u=last.u;
      else{
        const e=tile(zz,tx,ty);
        if(e===EMPTY)u=EMPTY;else if(e&&e.bmp)u=u32(e);else u=undefined;
        if(u!==undefined&&zz===z){last.k=k;last.u=u;}
      }
      if(u===EMPTY)return 0;
      if(u)return u[ly*TS+lx];
      if(zz===0)return 0;
      // gröbere Stufe
      lx=((tx&1)*TS+lx)>>1;ly=((ty&1)*TS+ly)>>1;tx>>=1;ty>>=1;zz--;
    }
  }
  for(let cj=0;cj<ny-1;cj++)for(let ci=0;ci<nx-1;ci++){
    const a=cj*nx+ci,b=a+1,c=a+nx,dd=c+1;
    const x0=ci*G,y0=cj*G,x1=Math.min(x0+G,ow),y1=Math.min(y0+G,oh);
    const ok=!(isNaN(NX[a])||isNaN(NX[b])||isNaN(NX[c])||isNaN(NX[dd]))&&Math.max(Math.abs(NX[a]-NX[b]),Math.abs(NX[a]-NX[c]),Math.abs(NX[b]-NX[dd]))<M5/3;
    if(ok){
      for(let y=y0;y<y1;y++){
        const fy=(y-y0+.5)/G;
        const lx0=NX[a]+(NX[c]-NX[a])*fy,lx1=NX[b]+(NX[dd]-NX[b])*fy,ly0=NY[a]+(NY[c]-NY[a])*fy,ly1=NY[b]+(NY[dd]-NY[b])*fy;
        for(let x=x0;x<x1;x++){
          const fx=(x-x0+.5)/G;
          o32[y*ow+x]=px((lx0+(lx1-lx0)*fx)*sc,(ly0+(ly1-ly0)*fx)*sc);
        }
      }
    }else{
      // Randzelle (Rand der Projektion, Naht): jedes Pixel einzeln
      for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++){
        const r=pt(x+.5,y+.5);o32[y*ow+x]=r?px(r[0]*sc,r[1]*sc):0;
      }
    }
  }
  octx.putImageData(img,0,0);
  R.stats.render++;R.stats.lastMs=performance.now()-t0;
  return{bmp:out,m:m.slice(),x:rx,y:ry,w:rw,h:rh,z};
}
function drawGeneric(ctx,m,vp,proj){
  const k=vp.w+'x'+vp.h,rot=proj.rotate().join();
  let c=R.cache.get(k);
  if(c&&c.rot!==rot){R.cache.delete(k);c=null;} // andere Drehung (Globus): alte Bitmap ist wertlos
  const same=c&&c.m.every((v,i)=>Math.abs(v-m[i])<1e-6);
  if(!same&&c){
    // Ansicht hat sich bewegt: alte Bitmap mitführen und nach einer Pause neu berechnen
    clearTimeout(R.idleT);R.idleT=setTimeout(()=>{R.cache.delete(k);if(window.CanvasMap)window.CanvasMap.invalidate();},140);
  }else if(!c){
    // Globus: nur die Kugel berechnen, nicht die ganze Fläche
    let roi={x:0,y:0,w:vp.w,h:vp.h};
    if(projection==='globe'){
      const tr=proj.translate(),r=proj.scale(),xs=[tr[0]-r,tr[0]+r,tr[0]-r,tr[0]+r],ys=[tr[1]-r,tr[1]-r,tr[1]+r,tr[1]+r];
      let x0=1e18,y0=1e18,x1=-1e18,y1=-1e18;
      for(let i=0;i<4;i++){const X=m[0]*xs[i]+m[2]*ys[i]+m[4],Y=m[1]*xs[i]+m[3]*ys[i]+m[5];if(X<x0)x0=X;if(X>x1)x1=X;if(Y<y0)y0=Y;if(Y>y1)y1=Y;}
      x0=Math.max(0,Math.floor(x0)-2);y0=Math.max(0,Math.floor(y0)-2);x1=Math.min(vp.w,Math.ceil(x1)+2);y1=Math.min(vp.h,Math.ceil(y1)+2);
      if(x1-x0<8||y1-y0<8)return;
      roi={x:x0,y:y0,w:x1-x0,h:y1-y0};
    }
    c=render(m,vp,proj,roi);if(!c)return;c.rot=rot;R.cache.set(k,c);
  }
  // Bitmap in aktuelle Lage bringen: alt-Gerätepixel → Projektion → neu-Gerätepixel
  const io=inv(c.m);
  const T=[m[0]*io[0]+m[2]*io[1],m[1]*io[0]+m[3]*io[1],m[0]*io[2]+m[2]*io[3],m[1]*io[2]+m[3]*io[3],
    m[0]*io[4]+m[2]*io[5]+m[4],m[1]*io[4]+m[3]*io[5]+m[5]];
  ctx.setTransform(T[0],T[1],T[2],T[3],T[4],T[5]);
  ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='low';
  ctx.drawImage(c.bmp,0,0,c.bmp.width,c.bmp.height,c.x,c.y,c.w,c.h);
}

window.Relief={
  draw(ctx,m,vp){
    if(typeof currentProj==='undefined'||!currentProj)return;
    if(!R.index){loadIndex().then(scheduleRedraw);return;}
    ctx.save();
    try{
      if(projection==='mercator')drawMerc(ctx,m,vp,currentProj);
      else drawGeneric(ctx,m,vp,currentProj);
    }finally{ctx.restore();}
  },
  init:loadIndex,
  live:false,
  stats:R.stats
};
})();
