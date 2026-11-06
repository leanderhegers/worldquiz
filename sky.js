// Sternenhimmel mit Milchstraße als Hintergrund des Globus (#map-bg), dreht sich mit der Kugel mit.
//
// Der Himmel wird einmal prozedural als breites (2.4:1), waagerecht NAHTLOS umlaufendes Panorama gezeichnet (festes
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
const TAU=Math.PI*2,ASPECT=2.4; // Panorama: Breite = 2.4 × Höhe

// Varianten des Himmels: stars = Anteil Sterne, pow = je höher, desto mehr schwache Sterne, glow = Schein um helle Sterne,
// grain = Körnung im Band, bandA = Helligkeit des Bandes, bandW = Breite, warm/cold = Farben von Kern und Rand, bg = Grundverlauf
const PRESETS={
  aktuell:{label:'Aktuell',stars:1,pow:4.4,glow:true,grain:1,bandA:.5,bandW:1,warm:[255,220,140],cold:[125,148,250],bg:['#01030a','#040916','#01030a']},
  dezent:{label:'Dezent',stars:.3,pow:5.4,glow:false,grain:.7,bandA:.5,bandW:1,warm:[255,220,140],cold:[125,148,250],bg:['#01030a','#040916','#01030a']},
  milchstrasse:{label:'Milchstraße im Fokus',stars:.12,pow:5,glow:false,grain:1.4,bandA:.78,bandW:1.3,warm:[255,214,150],cold:[120,150,255],bg:['#01030a','#050a18','#01030a']},
  // Milchstraße im Fokus mit schwärzerem Hintergrund: reines Schwarz als Grund, schwache Ausläufer des Bandes (Halo) dünner/ausgeblendet
  schwarz:{label:'Schwarz',stars:.12,pow:5,glow:false,grain:1.4,bandA:.78,bandW:1.3,warm:[255,214,150],cold:[120,150,255],bg:['#000','#000','#000']},
  kontrast:{label:'Schwarz, mehr Kontrast',stars:.12,pow:5,glow:false,grain:1.4,bandA:.88,bandW:1.3,gamma:1.9,halo:.55,warm:[255,214,150],cold:[120,150,255],bg:['#000','#000','#000']},
  tiefschwarz:{label:'Tiefschwarz',stars:.12,pow:5,glow:false,grain:1.3,bandA:.95,bandW:1.2,gamma:2.4,halo:.3,warm:[255,214,150],cold:[120,150,255],bg:['#000','#000','#000']},
  schwarzblau:{label:'Schwarz mit Blauhauch',stars:.09,pow:5,glow:false,grain:1.27,bandA:.9,bandW:1.3,gamma:2.0,halo:.46,warm:[255,214,150],cold:[120,150,255],bg:['#000','#01050c','#000']},
  nebel:{label:'Nebel (violett)',stars:.06,pow:5.5,glow:false,grain:.5,bandA:.66,bandW:1.5,warm:[255,170,190],cold:[110,110,230],bg:['#05030f','#0b0620','#04020c']},
  tiefblau:{label:'Tiefblau, minimal',stars:.14,pow:6,glow:false,grain:.25,bandA:.14,bandW:1.8,warm:[190,210,255],cold:[90,120,210],bg:['#030a1c','#06142e','#020612']},
  ruhig:{label:'Fast leer',stars:.05,pow:6,glow:false,grain:.2,bandA:.0,bandW:1,warm:[255,255,255],cold:[255,255,255],bg:['#02040b','#050a16','#02040b']}
};
let currentPreset='schwarzblau'; // gewählt: Schwarz, mehr Kontrast, Blauhauch
const tick=()=>new Promise(r=>setTimeout(r,0));
// Breites Panorama (Seitenverhältnis 2.4:1, nahtlos umlaufend). Läuft in Scheiben von ~10 ms mit Pausen dazwischen, damit das Spiel
// beim Erzeugen nicht ruckelt. Gibt ein Promise mit der JPEG-Daten-URL zurück.
async function build(w,pn,h){
  const o=PRESETS[pn||currentPreset]||PRESETS.aktuell;
  h=h||Math.round(w/ASPECT);
  const R=rng(20261106),nz=makeNoise(7),nz2=makeNoise(99);
  const c=document.createElement('canvas');c.width=w;c.height=h;
  const x=c.getContext('2d');
  const bg=x.createLinearGradient(0,0,0,h);bg.addColorStop(0,o.bg[0]);bg.addColorStop(.5,o.bg[1]);bg.addColorStop(1,o.bg[2]);
  x.fillStyle=bg;x.fillRect(0,0,w,h);
  // Band: Mittellinie, Breite und Helligkeit folgen weichem Zufallsrauschen (periodisch in u) statt Sinuswellen: das Band knickt
  // unregelmäßig ab, wird stellenweise schmal/dünn und reißt in dunklen Lücken fast ab. Je Spalte einmal vorberechnet.
  const nzB=makeNoise(31),nzC=makeNoise(53),nzD=makeNoise(77);
  const COLS=4096,vcA=new Float32Array(COLS+1),bwA=new Float32Array(COLS+1),enA=new Float32Array(COLS+1);
  for(let i=0;i<=COLS;i++){
    const u=i/COLS;
    vcA[i]=1.9*(nzB(u*2.6+1,0.5,3,2.6,u)-0.5)+0.5*(nzB(u*8+4,2.5,2,8,u)-0.5); // Rohwert, wird unten zentriert und auf feste Spannweite gebracht
    bwA[i]=0.5+1.3*nzC(u*8+2,1.5,3,8,u);                                                                      // Breite 0.65…1.55
    const e=0.6*nzD(u*7+9,3.1,3,7,u)+0.4*nzD(u*19+3,6.1,2,19,u);enA[i]=Math.min(1,Math.max(0.0,(e-0.39)*3.6)); // viele tiefe Lücken: das Band zerfällt in einzelne Wolken                            // Lücken: Helligkeit 0.1…1
  }
  {let mean=0,mx=0;for(let i=0;i<=COLS;i++)mean+=vcA[i];mean/=COLS+1;for(let i=0;i<=COLS;i++){vcA[i]-=mean;mx=Math.max(mx,Math.abs(vcA[i]));}
   for(let i=0;i<=COLS;i++)vcA[i]=0.46+0.2*(vcA[i]/(mx||1)); // Mitte 0.46 (Horizont der Kugel), Auslenkung bis ±0.24 → 0.22…0.70
  }
  const vc=u=>vcA[Math.min(COLS,Math.max(0,Math.round(u*COLS)))],bwAt=u=>bwA[Math.min(COLS,Math.max(0,Math.round(u*COLS)))],enAt=u=>enA[Math.min(COLS,Math.max(0,Math.round(u*COLS)))];
  const dist=(p,q)=>{const d=Math.abs(p-q)%1;return Math.min(d,1-d);};
  // Rauschfrequenzen so gewählt, dass die Strukturen in Breite und Höhe etwa gleich groß sind (Breite ist 2.4× die Höhe)
  const PER=22;
  let last=performance.now();
  const yieldNow=async()=>{if(performance.now()-last>10){await tick();last=performance.now();}};
  // 1) Leuchten des Bandes in reduzierter Auflösung (1/3), danach hochskaliert
  const gw=Math.round(w/2.5),gh=Math.round(h/2.5);
  const g=document.createElement('canvas');g.width=gw;g.height=gh;
  const gx=g.getContext('2d'),img=gx.createImageData(gw,gh),d=img.data;
  for(let j=0;j<gh;j++){
    const v=j/gh,vfade=v<0.7?1:v>0.88?0:1-(v-0.7)/0.18;
    for(let i=0;i<gw;i++){
      const u=i/gw,t=v-vc(u);
      const bw=o.bandW*bwAt(u),en=enAt(u);
      const core=Math.exp(-(t*t)/(2*0.044*0.044*bw*bw)),halo=Math.exp(-(t*t)/(2*0.125*0.125*bw*bw));
      const bulge=0.6+0.4*Math.exp(-Math.pow(dist(u,0.3),2)/(2*0.1*0.1))+0.1*Math.exp(-Math.pow(dist(u,0.72),2)/(2*0.06*0.06));
      const cloud=Math.min(1,Math.pow(nz(u*PER,v*9+2,5,PER,u),1.7)*2.4);
      const fine=nz(u*PER*4,v*30,3,PER*4,u);
      let lane=Math.max(0,nz2(u*PER*2.8+9,v*22,4,PER*2.8,u)-0.52)*3.2;
      lane*=Math.exp(-(t*t)/(2*0.06*0.06));
      let val=(core*bulge*(0.12+1.1*cloud)+halo*0.22*(o.halo==null?1:o.halo)*(0.3+cloud))*(0.55+0.7*fine);
      val*=Math.max(0,1-lane*1.15)*en; // en = Lücken im Band
      val*=vfade; // Leuchten blendet unten aus (nur der Dunst, Sterne laufen bis zum Bildrand weiter)
      val=Math.min(1,val*0.9);
      const warm=Math.min(1,core*bulge*1.1);
      const k=(j*gw+i)*4;
      d[k]=o.cold[0]+(o.warm[0]-o.cold[0])*warm;d[k+1]=o.cold[1]+(o.warm[1]-o.cold[1])*warm;d[k+2]=o.cold[2]+(o.warm[2]-o.cold[2])*warm;d[k+3]=Math.round(255*Math.pow(val,o.gamma||1.45)*o.bandA);
    }
    await yieldNow();
  }
  gx.putImageData(img,0,0);
  x.imageSmoothingEnabled=true;x.imageSmoothingQuality='high';
  x.globalCompositeOperation='lighter';
  x.drawImage(g,0,0,gw,gh,0,0,w,h);
  // 2) unaufgelöste Sterne im Band (Körnung)
  const nb=Math.round(w*h/36*o.grain);
  for(let n=0;n<nb;n++){
    const u=R(),v=R(),t=v-vc(u);
    const p=Math.exp(-(t*t)/(2*0.09*0.09*bwAt(u)*bwAt(u)))*enAt(u)*(0.45+0.55*nz(u*PER*2,v*18,2,PER*2,u));
    if(R()>p)continue;
    const m=R();x.globalAlpha=0.06+0.2*m;x.fillStyle=m>.6?'#fff4e2':'#cfe0ff';
    const r=0.8+R()*1.2,px=u*w;x.fillRect(px,v*h,r,r);if(px>w-2)x.fillRect(px-w,v*h,r,r);
    if((n&2047)===0)await yieldNow();
  }
  x.globalAlpha=1;
  // 3) Sterne: etwas größer und heller als vorher (schärfer); am Rand doppelt gezeichnet, damit das Panorama nahtlos bleibt
  x.globalCompositeOperation='source-over';
  const ns=Math.round(w*h/150*o.stars);
  for(let n=0;n<ns;n++){
    const u=R(),v=R(),t=v-vc(u);
    const dens=0.4+0.6*Math.exp(-(t*t)/(2*0.12*0.12));
    if(R()>dens)continue;
    const m=Math.pow(R(),o.pow),col=pickTemp(R);
    const px=u*w,py=v*h,rad=0.55+m*1.5,al=0.34+0.66*m;
    const draw=X=>{
      if(o.glow&&m>0.88){
        const gr=x.createRadialGradient(X,py,0,X,py,rad*4.5);
        gr.addColorStop(0,'rgba('+col+','+(0.32*al)+')');gr.addColorStop(1,'rgba('+col+',0)');
        x.fillStyle=gr;x.beginPath();x.arc(X,py,rad*4.5,0,TAU);x.fill();
      }
      x.fillStyle='rgba('+col+','+al+')';x.beginPath();x.arc(X,py,rad,0,TAU);x.fill();
    };
    draw(px);if(px<14)draw(px+w);else if(px>w-14)draw(px-w);
    if((n&1023)===0)await yieldNow();
  }
  await tick();
  return c.toDataURL('image/jpeg',0.92);
}

// Darstellungsgröße: Bildhöhe 2× Viewport-Höhe, Breite 2.4× Höhe; vertikal reicht der Überstand genau für ±90° Kippen.
// Der Himmel wandert beim Drehen mit ~0.55× dem Tempo der Oberfläche (ppd = Pixel je Grad Drehung); die Bildbreite (viele Bildschirm-
// breiten) ist unabhängig davon, deshalb wiederholt sich das Muster höchstens alle ~3-4 Bildschirmhöhen.
function layout(el){
  const r=el.getBoundingClientRect(),vw=r.width||innerWidth,vh=r.height||innerHeight;
  const surfPpd=0.49*Math.min(vw,vh)*Math.PI/180;       // Pixel je Grad am Kugelrand bei Zoom 1
  const ppd=0.55*surfPpd,Hd=Math.round(Math.min(Math.max(2.4*vh,vh+400),2600)),Wd=Math.round(Hd*ASPECT);
  const ppdV=(Hd-vh)/200; // ±100° Kippen = ±halber Überstand: an den Polen (±90°) bleibt noch 5 % Reserve bis zum Bildrand, damit nie eine Kante sichtbar wird
  geo={ppd,ppdV,Hd,Wd,vh,vw};
}
function place(rot){
  if(!layer||!geo)return;
  const slack=geo.Hd-geo.vh;
  const x=(rot?rot[0]:0)*geo.ppd,y=Math.max(-slack,Math.min(0,-slack/2-(rot?rot[1]:0)*geo.ppdV));
  layer.style.backgroundPosition=x.toFixed(1)+'px '+y.toFixed(1)+'px';
}
function ensureLayer(el){
  if(layer&&layer.parentNode===el)return;
  layer=document.createElement('div');layer.id='sky-layer';
  layer.style.cssText='position:absolute;inset:0;pointer-events:none;background-repeat:repeat-x;';
  el.insertBefore(layer,el.firstChild);
}

window.addEventListener('resize',()=>{if(layer&&layer.parentNode&&geo){layout(layer.parentNode);layer.style.backgroundSize=geo.Wd+'px '+geo.Hd+'px';place(typeof globeRot!=='undefined'?globeRot:null);}});
window.Sky={
  PRESETS,build,
  setPreset(name){if(PRESETS[name]&&name!==currentPreset){currentPreset=name;url=null;}},
  get preset(){return currentPreset;},
  apply(el){
    ensureLayer(el);layout(el);
    layer.style.backgroundSize=geo.Wd+'px '+geo.Hd+'px';
    if(url){layer.style.backgroundImage='url('+url+')';place(typeof globeRot!=='undefined'?globeRot:null);return;}
    if(building)return;building=true;
    const run=async()=>{
      try{
        const coarse=window.matchMedia&&window.matchMedia('(pointer:coarse)').matches;
        url=await build(coarse?3072:4800);
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
