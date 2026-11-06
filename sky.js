// Sternenhimmel mit Milchstraße als Hintergrund des Globus (#map-bg).
//
// Wird einmal prozedural in ein Canvas gezeichnet (festes Zufallsmuster, immer derselbe Himmel), als JPEG im Speicher
// gehalten und als CSS-Hintergrundbild gesetzt: danach kostet er pro Bild nichts. Erzeugung ca. 100–250 ms, nur wenn der
// Globus zum ersten Mal gezeigt wird (verzögert, damit das Spiel nicht stockt). Es werden keine Dateien geladen.
//   • Milchstraße: ein schräges Band aus weichem Rauschen (fbm) in warmen Kernfarben und bläulichen Rändern, mit dunklen
//     Staubbahnen, plus tausende kaum sichtbare Einzelsterne im Band.
//   • Sterne: ~2600 Punkte, Helligkeit nach Potenzgesetz (viele schwache, wenige helle), Farbtemperaturen von blauweiß
//     bis orange; die hellsten bekommen einen weichen Schein. Im Band stehen mehr Sterne.
(function(){
'use strict';
let url=null,building=false;
function rng(seed){return function(){seed|=0;seed=seed+0x6D2B79F5|0;let t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
// Value-Noise + fbm (deterministisch)
function makeNoise(seed){
  const r=rng(seed),P=new Float32Array(256*256);for(let i=0;i<P.length;i++)P[i]=r();
  const at=(x,y)=>P[((y&255)<<8)|(x&255)];
  const sm=t=>t*t*(3-2*t);
  function n(x,y){const xi=Math.floor(x),yi=Math.floor(y),fx=sm(x-xi),fy=sm(y-yi);
    const a=at(xi,yi),b=at(xi+1,yi),c=at(xi,yi+1),d=at(xi+1,yi+1);
    return a+(b-a)*fx+(c-a)*fy+(a-b-c+d)*fx*fy;}
  return function fbm(x,y,o){let s=0,a=.5,f=1;for(let i=0;i<o;i++){s+=a*n(x*f,y*f);a*=.5;f*=2.03;}return s/(1-Math.pow(.5,o));};
}
const TEMPS=[[155,176,255],[190,205,255],[235,240,255],[248,247,255],[255,246,236],[255,236,210],[255,214,170],[255,188,140]];
const TW=[1,2,3,4,4,3,2,1];
function pickTemp(r){let t=r()*TW.reduce((a,b)=>a+b),i=0;while(t>TW[i]){t-=TW[i];i++;}return TEMPS[i];}

function build(w,h){
  const R=rng(20261106),fbm=makeNoise(7),fbm2=makeNoise(99);
  const c=document.createElement('canvas');c.width=w;c.height=h;
  const x=c.getContext('2d');
  // Grund: sehr dunkles Blau, zur Mitte minimal heller
  const bg=x.createRadialGradient(w/2,h/2,0,w/2,h/2,Math.hypot(w,h)/2);
  bg.addColorStop(0,'#050a17');bg.addColorStop(1,'#01030a');x.fillStyle=bg;x.fillRect(0,0,w,h);
  const A=-0.46,cA=Math.cos(A),sA=Math.sin(A),asp=w/h;
  const band=(u,v)=>{ // Lage im Band: s längs, t quer (mit leichter Biegung)
    const dx=(u-.5)*asp,dy=v-.5;
    const s=dx*cA+dy*sA,t=-dx*sA+dy*cA-0.07*Math.sin(s*2.1+1.2)+0.2; // +0.2: Band weicht aus der Mitte aus (dort liegt der Globus)
    return[s,t];
  };
  // 1) weiches Milchstraßen-Leuchten in niedriger Auflösung berechnen und hochskalieren
  const gw=Math.round(w/4),gh=Math.round(h/4);
  const g=document.createElement('canvas');g.width=gw;g.height=gh;
  const gx=g.getContext('2d'),img=gx.createImageData(gw,gh),d=img.data;
  for(let j=0;j<gh;j++)for(let i=0;i<gw;i++){
    const u=i/gw,v=j/gh,[s,t]=band(u,v);
    const core=Math.exp(-(t*t)/(2*0.1*0.1)),halo=Math.exp(-(t*t)/(2*0.3*0.3));
    const bulge=0.62+0.38*Math.exp(-(s*s)/(2*0.55*0.55));         // Mitte des Bandes heller (galaktisches Zentrum)
    const cloud=Math.min(1,Math.pow(fbm(s*3.2+5,t*7+2,5),1.7)*2.4);   // große Wolken, kontrastreich
    const fine=fbm(s*14,t*22,3);                                     // feine Struktur
    let lane=Math.max(0,fbm2(s*5.5+9,t*15,4)-0.52)*3.2;             // dunkle Staubbahnen
    lane*=Math.exp(-(t*t)/(2*0.1*0.1));
    let val=(core*bulge*(0.12+1.1*cloud)+halo*0.22*(0.3+cloud))*(0.55+0.7*fine);
    val*=Math.max(0,1-lane*1.15);
    val=Math.min(1,val*0.9);
    const warm=Math.min(1,core*bulge*1.1);                           // Kern warm, Ränder bläulich
    const k=(j*gw+i)*4;
    d[k]=125+130*warm;d[k+1]=148+72*warm;d[k+2]=250-115*warm;d[k+3]=Math.round(255*Math.pow(val,1.45)*0.5);
  }
  gx.putImageData(img,0,0);
  x.imageSmoothingEnabled=true;x.imageSmoothingQuality='high';
  x.globalCompositeOperation='lighter';
  x.drawImage(g,0,0,gw,gh,0,0,w,h);
  // 2) unaufgelöste Sterne im Band (Körnung)
  const nb=Math.round(w*h/36);
  for(let n=0;n<nb;n++){
    const u=R(),v=R(),[s,t]=band(u,v);
    const p=Math.exp(-(t*t)/(2*0.15*0.15))*(0.45+0.55*fbm(s*9,t*9,2));
    if(R()>p)continue;
    const m=R();x.globalAlpha=0.05+0.16*m;x.fillStyle=m>.6?'#fff4e2':'#cfe0ff';
    const r=0.5+R()*0.8;x.fillRect(u*w,v*h,r,r);
  }
  x.globalAlpha=1;
  // 3) Sterne
  x.globalCompositeOperation='source-over';
  const ns=Math.round(w*h/170);
  for(let n=0;n<ns;n++){
    const u=R(),v=R(),[s,t]=band(u,v);
    const dens=0.38+0.62*Math.exp(-(t*t)/(2*0.2*0.2));
    if(R()>dens)continue;
    const m=Math.pow(R(),4.4),col=pickTemp(R);
    const px=u*w,py=v*h,rad=0.3+m*1.2,al=0.25+0.75*m;
    if(m>0.88){
      const gr=x.createRadialGradient(px,py,0,px,py,rad*4.5);
      gr.addColorStop(0,'rgba('+col+','+(0.32*al)+')');gr.addColorStop(1,'rgba('+col+',0)');
      x.fillStyle=gr;x.beginPath();x.arc(px,py,rad*4.5,0,6.2832);x.fill();
    }
    x.fillStyle='rgba('+col+','+al+')';x.beginPath();x.arc(px,py,rad,0,6.2832);x.fill();
  }
  return c.toDataURL('image/jpeg',0.9);
}

window.Sky={
  // Setzt den Himmel als Hintergrund von el; erzeugt ihn beim ersten Mal verzögert
  apply(el){
    if(url){el.style.backgroundImage='url('+url+')';el.style.backgroundSize='cover';el.style.backgroundPosition='center';return;}
    if(building)return;building=true;
    const run=()=>{
      try{
        const coarse=window.matchMedia&&window.matchMedia('(pointer:coarse)').matches;
        url=build(coarse?1024:1600,coarse?640:900);
      }catch(e){url=null;}
      building=false;
      if(url&&typeof projection!=='undefined'&&projection==='globe'){const m=document.getElementById('map-bg');if(m)window.Sky.apply(m);}
    };
    if(window.requestIdleCallback)window.requestIdleCallback(run,{timeout:400});else setTimeout(run,60);
  },
  clear(el){el.style.backgroundImage='none';}
};
})();
