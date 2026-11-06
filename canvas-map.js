// Canvas renderer for the main world map (#map) — the "?canvas" variant of the game.
//
// The game logic (d3 selections, click/hover handlers, colouring, zoom) is deliberately left
// untouched: renderMap() still builds its normal SVG tree. This file turns that tree into an
// invisible scene graph — the SVG is kept (visibility:hidden, so it costs no painting and still
// has layout for getScreenCTM/getBBox/d3.pointer) and a <canvas> behind it draws the same shapes
// instead, which is far cheaper than letting the browser repaint ~2500 SVG elements on every
// zoom/pan frame. Pointer events still land on the (transparent) <svg> root, are hit-tested here
// against the same shapes in paint order, and are re-dispatched to the original element, so every
// existing d3 handler (mouseover/mouseout/click) fires exactly as before.
(function(){
'use strict';
const TAU=Math.PI*2;
const SKIP=new Set(['defs','filter','style','title','desc','clipPath','linearGradient','radialGradient']);
const S={svg:null,canvas:null,ctx:null,hitCtx:null,mo:null,ro:null,cache:new WeakMap(),hover:null,
  lastEv:null,movePending:false,fontFamily:'sans-serif',cursor:'',
  liveProj:null,stats:{draws:0,lastMs:0,avgMs:0,maxMs:0}};
const tcache=new Map();

function mul(m,n){return[m[0]*n[0]+m[2]*n[1],m[1]*n[0]+m[3]*n[1],m[0]*n[2]+m[2]*n[3],m[1]*n[2]+m[3]*n[3],m[0]*n[4]+m[2]*n[5]+m[4],m[1]*n[4]+m[3]*n[5]+m[5]];}
function parseTransform(s){
  let m=tcache.get(s);if(m)return m;
  m=[1,0,0,1,0,0];
  const re=/(translate|scale|rotate|matrix)\(([^)]*)\)/g;let r;
  while((r=re.exec(s))){
    const v=r[2].split(/[\s,]+/).filter(Boolean).map(Number);let t;
    if(r[1]==='translate')t=[1,0,0,1,v[0]||0,v.length>1?v[1]:0];
    else if(r[1]==='scale')t=[v[0],0,0,v.length>1?v[1]:v[0],0,0];
    else if(r[1]==='rotate'){const a=(v[0]||0)*Math.PI/180,c=Math.cos(a),sn=Math.sin(a);t=[c,sn,-sn,c,0,0];
      if(v.length>=3)t=mul(mul([1,0,0,1,v[1],v[2]],t),[1,0,0,1,-v[1],-v[2]]);}
    else t=[v[0],v[1],v[2],v[3],v[4],v[5]];
    m=mul(m,t);
  }
  if(tcache.size>400)tcache.clear(); // zoom writes a new transform string every frame
  tcache.set(s,m);return m;
}
function det(m){return Math.abs(m[0]*m[3]-m[1]*m[2]);}
function inv(m){const d=m[0]*m[3]-m[1]*m[2];if(!d)return null;
  return[m[3]/d,-m[1]/d,-m[2]/d,m[0]/d,(m[2]*m[5]-m[3]*m[4])/d,(m[1]*m[4]-m[0]*m[5])/d];}
function num(el,name,def){const v=el.getAttribute(name);return v===null||v===''?def:+v;}
function paintOf(el,prop){const s=el.style[prop];return s?s:el.getAttribute(prop);}
function isNone(p){return p===null||p==='none'||p==='transparent'||p==='';}

// path geometry cache: Path2D + (lazy) bbox. Invalidated by the MutationObserver when 'd' changes.
function geom(el){
  let c=S.cache.get(el);
  if(!c){const d=el.getAttribute('d');c={p:d?new Path2D(d):null,bbox:undefined};S.cache.set(el,c);}
  return c;
}
// Shapes are display:none (see init), so there's no layout box to ask getBBox() — but d3-geo only
// ever emits absolute M/L/Z commands, so the bbox is just the min/max of the number pairs.
function bboxOf(el,c){
  if(c.bbox===undefined){
    const nums=(el.getAttribute('d')||'').match(/-?\d*\.?\d+(?:e[-+]?\d+)?/gi);
    if(!nums||nums.length<2)c.bbox=null;
    else{
      let x0=1e18,y0=1e18,x1=-1e18,y1=-1e18;
      for(let i=0;i+1<nums.length;i+=2){const x=+nums[i],y=+nums[i+1];
        if(x<x0)x0=x;if(x>x1)x1=x;if(y<y0)y0=y;if(y>y1)y1=y;}
      c.bbox={x:x0,y:y0,width:x1-x0,height:y1-y0};
    }
  }
  return c.bbox;
}
function offscreen(m,b,pad,vp){
  // true if the box (local coords) transformed by m lies fully outside the canvas
  const xs=[b.x,b.x+b.width,b.x,b.x+b.width],ys=[b.y,b.y,b.y+b.height,b.y+b.height];
  let x0=1e18,y0=1e18,x1=-1e18,y1=-1e18;
  for(let i=0;i<4;i++){const X=m[0]*xs[i]+m[2]*ys[i]+m[4],Y=m[1]*xs[i]+m[3]*ys[i]+m[5];
    if(X<x0)x0=X;if(X>x1)x1=X;if(Y<y0)y0=Y;if(Y>y1)y1=Y;}
  return x1<-pad||y1<-pad||x0>vp.w+pad||y0>vp.h+pad;
}

// ── painting ──
function draw(){
  const svg=S.svg;if(!svg||!svg.isConnected)return;
  const t0=performance.now();
  const rect=svg.getBoundingClientRect();
  const ctm=svg.getScreenCTM();
  const dpr=Math.min(window.devicePixelRatio||1,2);
  const w=Math.max(1,Math.round(rect.width*dpr)),h=Math.max(1,Math.round(rect.height*dpr));
  if(S.canvas.width!==w||S.canvas.height!==h){S.canvas.width=w;S.canvas.height=h;}
  const main=S.mainCtx;main.setTransform(1,0,0,1,0,0);main.clearRect(0,0,w,h);
  if(!ctm||rect.width<1||rect.height<1)return;
  const base=mul([dpr,0,0,dpr,0,0],mul([1,0,0,1,-rect.left,-rect.top],[ctm.a,ctm.b,ctm.c,ctm.d,ctm.e,ctm.f]));
  const wrapG=svg.querySelector(':scope > g'),dyn=wrapG&&wrapG.querySelector(':scope > .dyn');
  const wtr=wrapG&&wrapG.getAttribute('transform');
  const T=wtr?parseTransform(wtr):[1,0,0,1,0,0];
  // Pan cache: while only the zoom transform's translation changes (scale, size, map content all
  // unchanged), the finished map is just shifted — so it is rendered once into an offscreen layer
  // (with a margin around the viewport) and blitted at an integer device-pixel offset per frame,
  // pixel-exact and without any resampling. Anything else (zoom, a colour change, resize) falls
  // back to a full redraw. Dots/pins (the .dyn group) are always drawn live on top.
  const key=w+'x'+h+'|'+dpr+'|'+base.map(v=>v.toFixed(3)).join()+'|'+T[0].toFixed(6);
  const L=S.layer,lt=S.lastT;
  const panning=lt&&T[0]===lt[0]&&(T[4]!==lt[4]||T[5]!==lt[5]);
  S.lastT=T;
  let sx=0,sy=0,useLayer=false;
  if(L&&!S.layerDirty&&L.key===key){
    sx=Math.round(base[0]*(T[4]-L.T[4])+base[2]*(T[5]-L.T[5]));
    sy=Math.round(base[1]*(T[4]-L.T[4])+base[3]*(T[5]-L.T[5]));
    useLayer=Math.abs(sx)<=L.M&&Math.abs(sy)<=L.M;
  }
  if(S.exact){useLayer=false;S.exact=false;}
  else if(useLayer&&(sx||sy)){
    // blitted at a rounded offset (<0.5 device px off): once the pan settles, redraw exactly
    clearTimeout(S.idle);S.idle=setTimeout(()=>{S.exact=true;draw();},140);
  }
  if(!useLayer&&panning){
    const M=Math.round(0.25*Math.max(w,h)),lw=w+2*M,lh=h+2*M;
    if(!S.layerCanvas){S.layerCanvas=document.createElement('canvas');S.layerCtx=S.layerCanvas.getContext('2d');}
    if(S.layerCanvas.width!==lw||S.layerCanvas.height!==lh){S.layerCanvas.width=lw;S.layerCanvas.height=lh;}
    const lc=S.layerCtx;lc.setTransform(1,0,0,1,0,0);lc.clearRect(0,0,lw,lh);
    lc.miterLimit=4;lc.lineJoin='miter';lc.lineCap='butt';
    S.ctx=lc;S.vp={w:lw,h:lh,dpr};S.skip=dyn;
    const bl=mul([1,0,0,1,M,M],base);
    for(const ch of svg.children)paint(ch,bl,1);
    S.skip=null;
    S.layer={key,T:T.slice(),M};S.layerDirty=false;sx=0;sy=0;useLayer=true;
  }
  S.ctx=main;S.vp={w,h,dpr};
  main.miterLimit=4;main.lineJoin='miter';main.lineCap='butt';
  if(useLayer){
    main.drawImage(S.layerCanvas,-S.layer.M+sx,-S.layer.M+sy);
    if(dyn)paint(dyn,mul(base,T),1);
  }else{
    for(const ch of svg.children)paint(ch,base,1);
  }
  const ms=performance.now()-t0,st=S.stats;
  st.draws++;st.lastMs=ms;st.avgMs=st.avgMs?st.avgMs*0.9+ms*0.1:ms;if(ms>st.maxMs)st.maxMs=ms;
}
function paint(el,m,alpha){
  if(el===S.skip)return;
  const tag=el.localName;
  if(SKIP.has(tag))return;
  const st=el.style;
  if(st.display==='none'||el.getAttribute('display')==='none'||el.hasAttribute('data-away'))return;
  const tr=el.getAttribute('transform');if(tr)m=mul(m,parseTransform(tr));
  if(st.opacity!=='')alpha*=+st.opacity;
  if(tag==='rect'&&el.classList.contains('relief-under')){if(window.Relief){S.ctx.globalAlpha=alpha;window.Relief.draw(S.ctx,m,S.vp);S.ctx.globalAlpha=1;}return;}
  if(tag==='g'){for(const ch of el.children)paint(ch,m,alpha);return;}
  if(tag==='use'){
    const ref=S.svg.querySelector(el.getAttribute('href')||el.getAttribute('xlink:href')||'');if(!ref)return;
    const m2=mul(m,[1,0,0,1,num(el,'x',0),num(el,'y',0)]);
    // wrap tiles: skip a world copy that is entirely off-canvas
    if(offscreen(m2,{x:0,y:0,width:960,height:500},4,S.vp))return;
    paint(ref,m2,alpha);return;
  }
  shape(el,tag,m,alpha);
}
function shape(el,tag,m,alpha){
  const ctx=S.ctx,dpr=S.vp.dpr;
  let fill=paintOf(el,'fill');if(fill===null&&tag!=='line')fill='#000';
  const stroke=paintOf(el,'stroke');
  const doFill=!isNone(fill)&&tag!=='line',doStroke=!isNone(stroke);
  if(!doFill&&!doStroke)return;
  let p=null,c=null,live=false;
  if(tag==='path'){
    // Live-Modus (Globus beim Drehen): Geo-Formen werden aus ihrem GeoJSON direkt mit der aktuellen Projektion gezeichnet
    if(S.liveProj){const gd=el.__data__;if(!gd||!gd.type)return;live=true;}
    else{c=geom(el);p=c.p;if(!p)return;
      const b=bboxOf(el,c);if(b&&offscreen(m,b,6*dpr,S.vp))return;}
  }else if(S.liveProj&&!(tag==='rect'&&el.classList.contains('ocean')))return;
  ctx.setTransform(m[0],m[1],m[2],m[3],m[4],m[5]);
  if(tag==='text'){text(el,m,alpha,fill,stroke);return;}
  if(live){ctx.beginPath();d3.geoPath(S.liveProj,ctx)(el.__data__);}
  else if(tag!=='path'){
    ctx.beginPath();
    if(tag==='circle')ctx.arc(num(el,'cx',0),num(el,'cy',0),num(el,'r',0),0,TAU);
    else if(tag==='rect')ctx.rect(num(el,'x',0),num(el,'y',0),num(el,'width',0),num(el,'height',0));
    else if(tag==='line'){ctx.moveTo(num(el,'x1',0),num(el,'y1',0));ctx.lineTo(num(el,'x2',0),num(el,'y2',0));}
    else return;
  }
  if(doFill){
    ctx.globalAlpha=alpha*num(el,'fill-opacity',1);ctx.fillStyle=fill;
    const fr=el.getAttribute('fill-rule')==='evenodd'?'evenodd':'nonzero';
    if(p)ctx.fill(p,fr);else ctx.fill(fr);
  }
  if(doStroke){
    const sw=num(el,'stroke-width',1);
    const ns=(el.style.getPropertyValue('vector-effect')||el.getAttribute('vector-effect'))==='non-scaling-stroke';
    const k=Math.sqrt(det(m))||1,f=ns?dpr/k:1; // non-scaling: width/dashes are screen px, not user units
    ctx.globalAlpha=alpha*num(el,'stroke-opacity',1);ctx.strokeStyle=stroke;ctx.lineWidth=sw*f;
    const da=el.getAttribute('stroke-dasharray');
    ctx.setLineDash(da&&da!=='none'?da.split(/[\s,]+/).filter(Boolean).map(v=>+v*f):[]);
    const glow=(el.getAttribute('filter')||'').indexOf('url(')===0; // river hover glow
    if(glow){ctx.shadowColor=stroke;ctx.shadowBlur=6*dpr;}
    if(p)ctx.stroke(p);else ctx.stroke();
    if(glow){ctx.shadowColor='transparent';ctx.shadowBlur=0;}
    ctx.setLineDash([]);
  }
  ctx.globalAlpha=1;
}
function text(el,m,alpha,fill,stroke){
  const ctx=S.ctx,st=el.style;
  const size=parseFloat(el.getAttribute('font-size')||st.fontSize)||16;
  ctx.font=(el.getAttribute('font-weight')||'normal')+' '+size+'px '+S.fontFamily;
  const a=el.getAttribute('text-anchor');
  ctx.textAlign=a==='middle'?'center':a==='end'?'right':'left';ctx.textBaseline='alphabetic';
  const x=num(el,'x',0),y=num(el,'y',0),txt=el.textContent;
  ctx.globalAlpha=alpha;ctx.lineJoin='round';
  if(st.stroke&&st.stroke!=='none'){ctx.strokeStyle=st.stroke;ctx.lineWidth=parseFloat(st.strokeWidth)||1;ctx.strokeText(txt,x,y);}
  if(!isNone(fill)){ctx.fillStyle=fill;ctx.fillText(txt,x,y);}
  ctx.globalAlpha=1;ctx.lineJoin='miter';
}

// ── hit testing (same shapes, reverse paint order, SVG pointer-events semantics) ──
function hitTest(cx,cy){
  const svg=S.svg,ctm=svg.getScreenCTM();if(!ctm)return null;
  const im=inv([ctm.a,ctm.b,ctm.c,ctm.d,ctm.e,ctm.f]);if(!im)return null;
  const px=im[0]*cx+im[2]*cy+im[4],py=im[1]*cx+im[3]*cy+im[5];
  const k=Math.sqrt(det([ctm.a,ctm.b,ctm.c,ctm.d,ctm.e,ctm.f]))||1;
  const kids=svg.children;
  for(let i=kids.length-1;i>=0;i--){const r=hit(kids[i],px,py,k,'auto');if(r)return r;}
  return null;
}
function hit(el,px,py,k,pe){
  const tag=el.localName;
  if(SKIP.has(tag))return null;
  const st=el.style;
  if(st.display==='none'||el.getAttribute('display')==='none'||el.hasAttribute('data-away'))return null;
  const own=st.pointerEvents||el.getAttribute('pointer-events');if(own)pe=own;
  const tr=el.getAttribute('transform');
  if(tr){const t=parseTransform(tr),it=inv(t);if(!it)return null;
    const x=it[0]*px+it[2]*py+it[4],y=it[1]*px+it[3]*py+it[5];px=x;py=y;k*=Math.sqrt(det(t));}
  if(tag==='g'){
    for(let i=el.children.length-1;i>=0;i--){const r=hit(el.children[i],px,py,k,pe);if(r)return r;}
    return null;
  }
  if(tag==='use'){
    const ref=S.svg.querySelector(el.getAttribute('href')||el.getAttribute('xlink:href')||'');if(!ref)return null;
    return hit(ref,px-num(el,'x',0),py-num(el,'y',0),k,pe)?el:null;
  }
  if(pe==='none')return null;
  const fill=paintOf(el,'fill'),stroke=paintOf(el,'stroke');
  const fillHit=tag!=='line'&&(pe==='all'||(fill===null?tag!=='text':fill!=='none'));
  const strokeHit=pe==='all'||(stroke!==null&&stroke!=='none');
  if(!fillHit&&!strokeHit)return null;
  const sw=num(el,'stroke-width',1);
  const ns=(st.getPropertyValue('vector-effect')||el.getAttribute('vector-effect'))==='non-scaling-stroke';
  const lw=strokeHit?(ns?sw/k:sw):0;
  if(tag==='path'){
    const c=geom(el);if(!c.p)return null;
    const b=bboxOf(el,c);
    if(b){const pad=lw/2+1/k;if(px<b.x-pad||px>b.x+b.width+pad||py<b.y-pad||py>b.y+b.height+pad)return null;}
    const hc=S.hitCtx;
    if(fillHit&&hc.isPointInPath(c.p,px,py))return el;
    if(strokeHit){hc.lineWidth=lw||1/k;if(hc.isPointInStroke(c.p,px,py))return el;}
    return null;
  }
  if(tag==='circle'){
    const dx=px-num(el,'cx',0),dy=py-num(el,'cy',0),r=num(el,'r',0)+(strokeHit?lw/2:0);
    return dx*dx+dy*dy<=r*r?el:null;
  }
  if(tag==='rect'){
    const x=num(el,'x',0),y=num(el,'y',0);
    return px>=x&&px<=x+num(el,'width',0)&&py>=y&&py<=y+num(el,'height',0)?el:null;
  }
  if(tag==='line'&&strokeHit){
    const x1=num(el,'x1',0),y1=num(el,'y1',0),x2=num(el,'x2',0),y2=num(el,'y2',0);
    const dx=x2-x1,dy=y2-y1,l2=dx*dx+dy*dy;
    let t=l2?((px-x1)*dx+(py-y1)*dy)/l2:0;t=Math.max(0,Math.min(1,t));
    const ex=x1+t*dx-px,ey=y1+t*dy-py,r=lw/2;
    return ex*ex+ey*ey<=r*r?el:null;
  }
  return null;
}

// ── pointer forwarding ──
function fire(el,type,ev){
  el.dispatchEvent(new MouseEvent(type,{bubbles:false,cancelable:true,view:window,clientX:ev.clientX,clientY:ev.clientY}));
}
function setHover(target,ev){
  if(target===S.hover)return;
  const old=S.hover;S.hover=target;
  if(old&&old.isConnected)fire(old,'mouseout',ev);
  if(target)fire(target,'mouseover',ev);
  const cur=target?getComputedStyle(target).cursor:'';
  if(cur!==S.cursor){S.cursor=cur;S.svg.parentNode.style.cursor=cur==='auto'?'':cur;}
}
function onMove(ev){
  S.lastEv=ev;
  if(!S.movePending){S.movePending=true;requestAnimationFrame(()=>{S.movePending=false;if(S.lastEv)setHover(hitTest(S.lastEv.clientX,S.lastEv.clientY),S.lastEv);});}
}
function onClick(ev){const t=hitTest(ev.clientX,ev.clientY);if(t)fire(t,'click',ev);}
function onLeave(ev){setHover(null,ev);}

// ── lifecycle ──
function init(svg){
  S.svg=svg;
  const css=document.createElement('style');
  css.textContent='#map-bg>canvas.cm{position:absolute;left:0;top:0;width:100%;height:100%;pointer-events:none;}'+
    // tap-highlight off: the <svg> root is the click target now, and Chrome greys out the whole
    // tapped element on touch (a brief full-map flash) unless told not to.
    // The highlight colour is chosen from whichever element the browser treats as the tap target
    // (the svg, its container, or a wrapper once cursor:pointer is set on it), so switch it off on
    // the whole game screen, not just #map. Touch-only: a mouse click never shows it.
    '#game-screen,#game-screen *{-webkit-tap-highlight-color:transparent;-webkit-touch-callout:none;}'+
    '#map-bg,#map{outline:none;user-select:none;-webkit-user-select:none;}'+
    '#map{position:relative;z-index:1;}#map *{visibility:hidden;}'+
    // Leaves get no layout objects at all (the <g> containers stay rendered so getScreenCTM()/
    // d3.pointer still work). Handlers are reached through dispatchEvent, which needs no box.
    '#map path,#map circle,#map rect,#map line,#map text,#map use{display:none;}';
  document.head.appendChild(css);
  S.canvas=document.createElement('canvas');S.canvas.className='cm';
  svg.parentNode.insertBefore(S.canvas,svg);
  S.ctx=S.mainCtx=S.canvas.getContext('2d');
  S.hitCtx=document.createElement('canvas').getContext('2d');
  S.fontFamily=getComputedStyle(svg).fontFamily||'sans-serif';
  S.mo=new MutationObserver(recs=>{
    const wg=svg.querySelector(':scope > g'),dy=wg&&wg.querySelector(':scope > .dyn');
    let changed=false;
    for(const r of recs){
      const t=r.target;
      if(r.type==='attributes'){
        // The app re-sets many attributes to the value they already have (e.g. dot radii when a
        // gesture ends) — such a write changes nothing visible, so it must not cost a redraw.
        if(r.oldValue===t.getAttribute(r.attributeName))continue;
        changed=true;
        if(r.attributeName==='d')S.cache.delete(t);
        if(t===svg)continue;
        if(t===wg&&r.attributeName==='transform')continue; // pan/zoom: layer stays valid for pans
      }else changed=true;
      if(dy&&(t===dy||dy.contains(t)))continue; // dots/pins are drawn live, not part of the layer
      S.layerDirty=true;
    }
    if(changed)draw();
  });
  S.mo.observe(svg,{subtree:true,childList:true,attributes:true,attributeOldValue:true,characterData:true});
  S.ro=new ResizeObserver(()=>draw());S.ro.observe(svg);
  svg.addEventListener('mousemove',onMove);
  svg.addEventListener('mouseleave',onLeave);
  svg.addEventListener('click',onClick);
}
window.CanvasMap={
  attach(svg){
    if(!S.svg||S.svg!==svg)init(svg);
    S.hover=null;S.cursor='';svg.parentNode.style.cursor='';
    draw();
  },
  redraw:draw,
  invalidate(){S.layerDirty=true;draw();},
  setLive(proj){S.liveProj=proj||null;S.layerDirty=true;S.layer=null;},
  stats:S.stats
};
})();
