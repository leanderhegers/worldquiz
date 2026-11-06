// Baut die Relief-Kacheln für das Theme "Relief" (data/relief/{z}/{x}/{y}.png, Web-Mercator, z0–z5).
//
// Eingabe: Höhenkacheln im "Terrarium"-Format (R*256+G+B/256-32768 = Höhe in m), heruntergeladen von
//   https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png  (AWS Open Data "Terrain Tiles",
//   Quellen u. a. NASA SRTM, USGS GMTED — Quellenangabe siehe Impressum/Datenschutz im Spiel).
// Aufruf: node tools/build-relief-tiles.js <Ordner-mit-Terrarium-Kacheln "z_x_y.png">
//
// Ausgabe: je Kachel ein indiziertes 8-Bit-PNG (Palette = Höhenfarbe x Schummerung), Meer ist transparent
// (nur ein 3-Pixel-Saum um die Küste wird mit Landfarbe gefüllt; die genaue Küste zieht das Spiel selbst mit
// der Vektor-Landmaske). Komplett leere Kacheln werden nicht geschrieben; data/relief/index.json listet die
// vorhandenen Kacheln je Zoomstufe. Reine Node-Standardbibliothek (zlib), keine Abhängigkeiten.
'use strict';
const fs=require('fs'),path=require('path'),zlib=require('zlib');
const SRC=process.argv[2];if(!SRC){console.error('Aufruf: node tools/build-relief-tiles.js <dem-ordner>');process.exit(1);}
const OUT=path.join(__dirname,'..','data','relief');
const ZMAX=5,T=256;

// ── PNG lesen/schreiben ──
const CRC=(()=>{const t=new Uint32Array(256);for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;t[n]=c>>>0;}return t;})();
function crc32(b){let c=0xffffffff;for(let i=0;i<b.length;i++)c=CRC[(c^b[i])&255]^(c>>>8);return(c^0xffffffff)>>>0;}
function chunk(type,data){const len=Buffer.alloc(4);len.writeUInt32BE(data.length);const td=Buffer.concat([Buffer.from(type),data]);const crc=Buffer.alloc(4);crc.writeUInt32BE(crc32(td));return Buffer.concat([len,td,crc]);}
function decodePng(buf){
  let p=8,w=0,h=0,bd=0,ct=0,il=0;const idat=[];let plte=null;
  while(p<buf.length){const len=buf.readUInt32BE(p),type=buf.toString('latin1',p+4,p+8),d=buf.subarray(p+8,p+8+len);p+=12+len;
    if(type==='IHDR'){w=d.readUInt32BE(0);h=d.readUInt32BE(4);bd=d[8];ct=d[9];il=d[12];}
    else if(type==='PLTE')plte=d;else if(type==='IDAT')idat.push(d);else if(type==='IEND')break;}
  if(bd!==8||il!==0)throw new Error('nur 8 Bit, nicht interlaced');
  const ch={0:1,2:3,3:1,4:2,6:4}[ct];const raw=zlib.inflateSync(Buffer.concat(idat));
  const bpp=ch,stride=w*ch,out=Buffer.alloc(h*stride);
  for(let y=0;y<h;y++){const f=raw[y*(stride+1)];const rs=y*(stride+1)+1,os=y*stride;
    for(let x=0;x<stride;x++){const a=x>=bpp?out[os+x-bpp]:0,b=y?out[os-stride+x]:0,c=(x>=bpp&&y)?out[os-stride+x-bpp]:0;let v=raw[rs+x];
      if(f===1)v+=a;else if(f===2)v+=b;else if(f===3)v+=(a+b)>>1;else if(f===4){const pp=a+b-c,pa=Math.abs(pp-a),pb=Math.abs(pp-b),pc=Math.abs(pp-c);v+=(pa<=pb&&pa<=pc)?a:(pb<=pc?b:c);}
      out[os+x]=v&255;}}
  return{w,h,ch,data:out,plte};
}
function encodeIndexed(w,h,idx,palette,trans){
  const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(w,0);ihdr.writeUInt32BE(h,4);ihdr[8]=8;ihdr[9]=3;
  const raw=Buffer.alloc(h*(w+1));for(let y=0;y<h;y++){raw[y*(w+1)]=0;Buffer.from(idx.buffer,idx.byteOffset+y*w,w).copy(raw,y*(w+1)+1);}
  const plte=Buffer.from(palette.flat());const tr=Buffer.from(trans);
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',ihdr),chunk('PLTE',plte),chunk('tRNS',tr),chunk('IDAT',zlib.deflateSync(raw,{level:9})),chunk('IEND',Buffer.alloc(0))]);
}

// ── Farben: Höhenstufen x Schummerung → Palette (Index 0 = transparent) ──
const RAMP=[[0,[160,200,128]],[100,[190,214,138]],[300,[218,224,152]],[700,[236,222,160]],[1300,[222,196,138]],[2200,[200,164,118]],[3300,[176,140,108]],[4500,[200,184,172]],[6000,[238,236,234]],[8000,[255,255,255]]];
const LEVELS=[1,40,100,180,300,450,650,900,1200,1600,2100,2700,3400,4300,5400,7000]; // 16 Höhenstufen
const SH=15; // Schummerungsstufen (16 Höhenstufen x 15 + 1 transparent = 241 Palettenfarben)
const lerp=(a,b,t)=>a+(b-a)*t;
function rampAt(h){for(let i=1;i<RAMP.length;i++)if(h<=RAMP[i][0]){const[h0,c0]=RAMP[i-1],[h1,c1]=RAMP[i],t=(h-h0)/(h1-h0);return[0,1,2].map(k=>lerp(c0[k],c1[k],t));}return RAMP[RAMP.length-1][1];}
const shadeFactor=s=>0.62+0.62*s/(SH-1); // 0.62 … 1.24
const palette=[[0,0,0]],trans=[0];
for(let L=0;L<LEVELS.length;L++){const c=rampAt(LEVELS[L]);for(let s=0;s<SH;s++){const f=shadeFactor(s);palette.push(c.map(v=>Math.max(0,Math.min(255,Math.round(v*f)))));trans.push(255);}}
function levelOf(h){let L=0;while(L<LEVELS.length-1&&h>(LEVELS[L]+LEVELS[L+1])/2)L++;return L;}

// ── je Zoomstufe: Höhen-Mosaik → Schummerung → Kacheln ──
const index={};let totalBytes=0,count=0;
for(let z=0;z<=ZMAX;z++){
  const N=2**z,M=N*T,el=new Int16Array(M*M);
  for(let tx=0;tx<N;tx++)for(let ty=0;ty<N;ty++){
    const f=path.join(SRC,`${z}_${tx}_${ty}.png`),png=decodePng(fs.readFileSync(f));
    for(let y=0;y<T;y++)for(let x=0;x<T;x++){const i=(y*T+x)*png.ch;const h=png.data[i]*256+png.data[i+1]+png.data[i+2]/256-32768;el[(ty*T+y)*M+tx*T+x]=Math.max(-32000,Math.min(32000,Math.round(h)));}
  }
  // Land = Höhe > 0; Saum von 3 px ins Meer bekommt die Farbe des nächsten Landpixels (Küste wird später vom Vektor abgeschnitten)
  const land=new Uint8Array(M*M);for(let i=0;i<M*M;i++)land[i]=el[i]>0?1:0;
  let grow=land.slice(),elg=el.slice();
  for(let it=0;it<3;it++){const nl=grow.slice(),ne=elg.slice();
    for(let y=0;y<M;y++)for(let x=0;x<M;x++){const i=y*M+x;if(grow[i])continue;
      let best=-1;for(const[dx,dy]of[[1,0],[-1,0],[0,1],[0,-1]]){const xx=x+dx,yy=y+dy;if(xx<0||yy<0||xx>=M||yy>=M)continue;const j=yy*M+xx;if(grow[j]){best=j;break;}}
      if(best>=0){nl[i]=1;ne[i]=Math.max(1,elg[best]);}}
    grow=nl;elg=ne;}
  // Schummerung: Licht aus Nordwest, Überhöhung nimmt mit dem Zoom ab (gröbere Pixel = flachere Hänge)
  const exag=[9,8,7,6,5,4][z];
  // Höhen vor dem Schattieren glätten (2 Durchgänge 3x3-Mittel): ruhigere, einfachere Flächen statt Körnung
  let sm=elg;
  for(let it=0;it<2;it++){const b=sm.slice();for(let y=1;y<M-1;y++)for(let x=1;x<M-1;x++){const i=y*M+x;if(!grow[i])continue;let sum=0;for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)sum+=Math.max(0,sm[i+dy*M+dx]);b[i]=sum/9;}sm=b;}

  const mpp=lat=>156543.03/N/T*0+156543.03/N*Math.cos(lat*Math.PI/180)/1; // Meter je Kachel-Pixel (Breitenkreis)
  const shade=new Uint8Array(M*M);
  const az=315*Math.PI/180,alt=42*Math.PI/180,lx=Math.sin(az)*Math.cos(alt),ly=Math.cos(az)*Math.cos(alt),lz=Math.sin(alt);
  for(let y=0;y<M;y++){
    const lat=Math.atan(Math.sinh(Math.PI*(1-2*(y+.5)/M)))*180/Math.PI;
    const cell=156543.03*Math.cos(lat*Math.PI/180)/N/ (T/256) * (256/T); // Meter je Pixel (T=256)
    const px=156543.03*Math.cos(lat*Math.PI/180)/(N);
    for(let x=0;x<M;x++){
      const i=y*M+x;if(!grow[i]){shade[i]=SH>>1;continue;}
      const g=(xx,yy)=>{xx=Math.max(0,Math.min(M-1,xx));yy=Math.max(0,Math.min(M-1,yy));return Math.max(0,sm[yy*M+xx]);};
      const dzdx=((g(x+1,y-1)+2*g(x+1,y)+g(x+1,y+1))-(g(x-1,y-1)+2*g(x-1,y)+g(x-1,y+1)))/(8*px/ T *1);
      const dzdy=((g(x-1,y+1)+2*g(x,y+1)+g(x+1,y+1))-(g(x-1,y-1)+2*g(x,y-1)+g(x+1,y-1)))/(8*px/ T *1);
      const sx=-dzdx*exag,sy=dzdy*exag; // y wächst nach Süden
      const nz=1,len=Math.sqrt(sx*sx+sy*sy+nz*nz);
      const lit=(sx*lx+sy*ly+nz*lz)/len; // 0..1
      const flat=lz; // Helligkeit einer ebenen Fläche
      const s=Math.max(0,Math.min(1,0.5+(lit-flat)*1.35));
      shade[i]=Math.round(s*(SH-1));
    }
  }
  index[z]=[];
  for(let tx=0;tx<N;tx++)for(let ty=0;ty<N;ty++){
    const idx=new Uint8Array(T*T);let any=false;
    for(let y=0;y<T;y++)for(let x=0;x<T;x++){const i=(ty*T+y)*M+tx*T+x;
      if(!grow[i]){idx[y*T+x]=0;continue;}any=true;
      idx[y*T+x]=1+levelOf(elg[i])*SH+shade[i];}
    if(!any)continue;
    const dir=path.join(OUT,String(z),String(tx));fs.mkdirSync(dir,{recursive:true});
    const buf=encodeIndexed(T,T,idx,palette,trans);fs.writeFileSync(path.join(dir,ty+'.png'),buf);
    totalBytes+=buf.length;count++;index[z].push(tx+'_'+ty);
  }
  console.log('z'+z,index[z].length,'Kacheln',(totalBytes/1e6).toFixed(1)+' MB gesamt');
}
fs.writeFileSync(path.join(OUT,'index.json'),JSON.stringify(index));
console.log('fertig:',count,'Kacheln',(totalBytes/1e6).toFixed(1)+' MB');
