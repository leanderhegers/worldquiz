// Sternenhimmel mit Milchstraße als Hintergrund des Globus (#map-bg), dreht sich mit der Kugel mit.
//
// Der Himmel wird einmal prozedural als quadratisches, waagerecht NAHTLOS umlaufendes Panorama gezeichnet (festes
// Zufallsmuster, immer derselbe Himmel), als JPEG im Speicher gehalten und in einer eigenen Ebene hinter der Karte
// als Hintergrundbild gezeigt. Beim Drehen des Globus (Sky.rotate) wird nur die Hintergrundposition verschoben, etwas
// langsamer als die Oberfläche (Tiefeneindruck); das kostet nichts. Erzeugung ca. 150–300 ms, nur wenn der Globus
// zum ersten Mal gezeigt wird (verzögert). Es werden keine Dateien geladen.
//   • Milchstraße: ein welliges Band aus weichem Rauschen (fbm) in goldenem Kern und bläulichen Rändern, mit dunklen
//     Staubbahnen, plus viele kaum sichtbare Einzelsterne im Band.
//   • Sterne: tausende Punkte, Helligkeit nach Potenzgesetz, Farbtemperaturen von blauweiß bis orange; die hellsten
//     mit weichem Schein. Im Band stehen mehr Sterne.
(function(){
'use strict';
let url=null,building=false,layer=null,geo=null;
function rng(seed){return function(){seed|=0;seed=seed+0x6D2B79F5|0;let t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
function makeNoise(seed){
  const r=rng(seed),P=new Float32Array(256*256);for(let i=0;i<P.length;i++)P[i]=r();
  const at=(x,y)=>P[((y&255)<<8)|(x&255)];
  const sm=t=>t*t*(3-2*t);
  function n(x,y){const xi=Math.floor(x),yi=Math.floor(y),fx=sm(x-xi),fy=sm(y-yi);
    const a=at(xi,yi),b=at(xi+1,yi),c=at(xi,yi+1),d=at(xi+1,yi+1);
    return a+(b-a)*fx+(c-a)*fy+(a-b-c+d)*fx*fy;}
  const fbm=(x,y,o)=>{let s=0,a=.5,f=1;for(let i=0;i<o;i++){s+=a*n(x*f,y*f);a*=.5;f*=2;}return s/(1-Math.pow(.5,o));};
  // waagerecht periodisch (Periode PER Einheiten): Überblendung zweier um PER versetzter Proben
  return function(x,y,o,PER,u){return fbm(x,y,o)*(1-u)+fbm(x-PER,y,o)*u;};
}
const TEMPS=[[155,176,255],[190,205,255],[235,240,255],[248,247,255],[255,246,236],[255,236,210],[255,214,170],[255,188,140]];
const TW=[1,2,3,4,4,3,2,1];
function pickTemp(r){let t=r()*TW.reduce((a,b)=>a+b),i=0;while(t>TW[i]){t-=TW[i];i++;}return TEMPS[i];}
const TAU=Math.PI*2;

// Varianten des Himmels: stars = Anteil Sterne, pow = je höher, desto mehr schwache Sterne, glow = Schein um helle Sterne,
// grain = Körnung im Band, bandA = Helligkeit des Bandes, bandW = Breite, warm/cold = Farben von Kern und Rand, bg = Grundverlauf
const PRESETS={
  aktuell:{label:'Aktuell',stars:1,pow:4.4,glow:true,grain:1,bandA:.5,bandW:1,warm:[255,220,140],cold:[125,148,250],bg:['#01030a','#040916','#01030a']},
  dezent:{label:'Dezent',stars:.3,pow:5.4,glow:false,grain:.7,bandA:.5,bandW:1,warm:[255,220,140],cold:[125,148,250],bg:['#01030a','#040916','#01030a']},
  milchstrasse:{label:'Milchstraße im Fokus',stars:.12,pow:5,glow:false,grain:1.4,bandA:.78,bandW:1.3,warm:[255,214,150],cold:[120,150,255],bg:['#01030a','#050a18','#01030a']},
  nebel:{label:'Nebel (violett)',stars:.06,pow:5.5,glow:false,grain:.5,bandA:.66,bandW:1.5,warm:[255,170,190],cold:[110,110,230],bg:['#05030f','#0b0620','#04020c']},
  tiefblau:{label:'Tiefblau, minimal',stars:.14,pow:6,glow:false,grain:.25,bandA:.14,bandW:1.8,warm:[190,210,255],cold:[90,120,210],bg:['#030a1c','#06142e','#020612']},
  ruhig:{label:'Fast leer',stars:.05,pow:6,glow:false,grain:.2,bandA:.0,bandW:1,warm:[255,255,255],cold:[255,255,255],bg:['#02040b','#050a16','#02040b']}
};
let currentPreset='aktuell';
function build(w,pn){
  const o=PRESETS[pn||currentPreset]||PRESETS.aktuell;
  const h=w,R=rng(20261106),nz=makeNoise(7),nz2=makeNoise(99);
  const c=document.createElement('canvas');c.width=w;c.height=h;
  const x=c.getContext('2d');
  const bg=x.createLinearGradient(0,0,0,h);bg.addColorStop(0,o.bg[0]);bg.addColorStop(.5,o.bg[1]);bg.addColorStop(1,o.bg[2]);
  x.fillStyle=bg;x.fillRect(0,0,w,h);
  // Band: Mittellinie vc(u) wellt um die Mitte (periodisch in u), t = senkrechter Abstand in v-Einheiten
  const vc=u=>0.5+0.17*Math.sin(TAU*u+0.7)+0.04*Math.sin(TAU*2*u+2.1);
  const dist=(a,b)=>{const d=Math.abs(a-b)%1;return Math.min(d,1-d);};
  const PER=8; // Rauschperiode in Rauscheinheiten (u*PER)
  // 1) Leuchten in niedriger Auflösung
  const gw=Math.round(w/4),gh=Math.round(h/4);
  const g=document.createElement('canvas');g.width=gw;g.height=gh;
  const gx=g.getContext('2d'),img=gx.createImageData(gw,gh),d=img.data;
  for(let j=0;j<gh;j++)for(let i=0;i<gw;i++){
    const u=i/gw,v=j/gh,t=v-vc(u);
    const core=Math.exp(-(t*t)/(2*0.055*0.055*o.bandW*o.bandW)),halo=Math.exp(-(t*t)/(2*0.16*0.16*o.bandW*o.bandW));
    const bulge=0.6+0.4*Math.exp(-Math.pow(dist(u,0.3),2)/(2*0.13*0.13));    // galaktisches Zentrum bei u≈0.3
    const cloud=Math.min(1,Math.pow(nz(u*PER,v*9+2,5,PER,u),1.7)*2.4);
    const fine=nz(u*PER*4,v*30,3,PER*4,u);
    let lane=Math.max(0,nz2(u*PER*1.4+9,v*22,4,PER*1.4,u)-0.52)*3.2;
    lane*=Math.exp(-(t*t)/(2*0.06*0.06));
    let val=(core*bulge*(0.12+1.1*cloud)+halo*0.22*(0.3+cloud))*(0.55+0.7*fine);
    val*=Math.max(0,1-lane*1.15);
    val=Math.min(1,val*0.9);
    const warm=Math.min(1,core*bulge*1.1);
    const k=(j*gw+i)*4;
    d[k]=o.cold[0]+(o.warm[0]-o.cold[0])*warm;d[k+1]=o.cold[1]+(o.warm[1]-o.cold[1])*warm;d[k+2]=o.cold[2]+(o.warm[2]-o.cold[2])*warm;d[k+3]=Math.round(255*Math.pow(val,1.45)*o.bandA);
  }
  gx.putImageData(img,0,0);
  x.imageSmoothingEnabled=true;x.imageSmoothingQuality='high';
  x.globalCompositeOperation='lighter';
  x.drawImage(g,0,0,gw,gh,0,0,w,h);
  // 2) unaufgelöste Sterne im Band
  const nb=Math.round(w*h/36*o.grain);
  for(let n=0;n<nb;n++){
    const u=R(),v=R(),t=v-vc(u);
    const p=Math.exp(-(t*t)/(2*0.09*0.09))*(0.45+0.55*nz(u*PER*2,v*18,2,PER*2,u));
    if(R()>p)continue;
    const m=R();x.globalAlpha=0.05+0.16*m;x.fillStyle=m>.6?'#fff4e2':'#cfe0ff';
    const r=0.7+R()*1.1,px=u*w;x.fillRect(px,v*h,r,r);if(px>w-2)x.fillRect(px-w,v*h,r,r);
  }
  x.globalAlpha=1;
  // 3) Sterne (am Rand doppelt gezeichnet, damit das Panorama nahtlos bleibt)
  x.globalCompositeOperation='source-over';
  const ns=Math.round(w*h/150*o.stars);
  for(let n=0;n<ns;n++){
    const u=R(),v=R(),t=v-vc(u);
    const dens=0.4+0.6*Math.exp(-(t*t)/(2*0.12*0.12));
    if(R()>dens)continue;
    const m=Math.pow(R(),o.pow),col=pickTemp(R);
    const px=u*w,py=v*h,rad=0.4+m*1.5,al=0.25+0.75*m;
    const draw=X=>{
      if(o.glow&&m>0.88){
        const gr=x.createRadialGradient(X,py,0,X,py,rad*4.5);
        gr.addColorStop(0,'rgba('+col+','+(0.32*al)+')');gr.addColorStop(1,'rgba('+col+',0)');
        x.fillStyle=gr;x.beginPath();x.arc(X,py,rad*4.5,0,TAU);x.fill();
      }
      x.fillStyle='rgba('+col+','+al+')';x.beginPath();x.arc(X,py,rad,0,TAU);x.fill();
    };
    draw(px);if(px<14)draw(px+w);else if(px>w-14)draw(px-w);
  }
  return c.toDataURL('image/jpeg',0.9);
}

// Darstellungsgröße: Periode (= Bildbreite = -höhe) so, dass der Himmel ~0.55× so schnell wandert wie die Oberfläche,
// mindestens aber 1.3× Viewport-Höhe (damit senkrechtes Verschieben nie über den Rand läuft)
function layout(el){
  const r=el.getBoundingClientRect(),vw=r.width||innerWidth,vh=r.height||innerHeight;
  const surfPpd=0.49*Math.min(vw,vh)*Math.PI/180;       // Pixel je Grad am Kugelrand bei Zoom 1
  const ppd=Math.max(0.55*surfPpd,1.3*vh/360);
  geo={ppd,size:Math.round(ppd*360),vh,vw};
}
function place(rot){
  if(!layer||!geo)return;
  const slack=geo.size-geo.vh;
  const x=(rot?rot[0]:0)*geo.ppd,y=Math.max(-slack,Math.min(0,-slack/2-(rot?rot[1]:0)*geo.ppd));
  layer.style.backgroundPosition=x.toFixed(1)+'px '+y.toFixed(1)+'px';
}
function ensureLayer(el){
  if(layer&&layer.parentNode===el)return;
  layer=document.createElement('div');layer.id='sky-layer';
  layer.style.cssText='position:absolute;inset:0;pointer-events:none;background-repeat:repeat-x;';
  el.insertBefore(layer,el.firstChild);
}

window.Sky={
  PRESETS,build,
  setPreset(name){if(PRESETS[name]&&name!==currentPreset){currentPreset=name;url=null;}},
  get preset(){return currentPreset;},
  apply(el){
    ensureLayer(el);layout(el);
    layer.style.backgroundSize=geo.size+'px '+geo.size+'px';
    if(url){layer.style.backgroundImage='url('+url+')';place(typeof globeRot!=='undefined'?globeRot:null);return;}
    if(building)return;building=true;
    const run=()=>{
      try{
        const coarse=window.matchMedia&&window.matchMedia('(pointer:coarse)').matches;
        url=build(coarse?1024:1600);
      }catch(e){url=null;}
      building=false;
      if(url&&typeof projection!=='undefined'&&projection==='globe'){const m=document.getElementById('map-bg');if(m)window.Sky.apply(m);}
    };
    if(window.requestIdleCallback)window.requestIdleCallback(run,{timeout:400});else setTimeout(run,60);
  },
  rotate(rot){place(rot);},
  clear(){if(layer){layer.remove();layer=null;}}
};
})();
