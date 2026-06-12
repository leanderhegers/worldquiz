const REDIRECTS=new Map();

// Zoom presets per continent [x, y, scale]
const ZOOMS={world:[480,250,1],EU:[520,160,3.5],AF:[510,280,2.2],AS:[680,200,2],NA:[220,190,2.2],SA:[310,350,2.2],OC:[810,370,2.8]};

const THEMES={nacht:{bg:'#0b1829',sph:'#0f2040',grd:'#162d50',avail:'#3a5882',found:'#1D9E75',dim:'#0e1e38',hov:'#4e6fa0',wrong:'#C0432A',bar:'#1D9E75',dot:'rgba(255,255,255,0.75)',border:'#1a3a6a'},atlas:{bg:'#3a80b8',sph:'#4a90cc',grd:'#2a70a8',avail:'#e0d4b4',found:'#4a8a30',dim:'#a8c4d8',hov:'#ccc0a0',wrong:'#c03820',bar:'#4a8a30',dot:'rgba(0,0,0,0.85)',border:'#205090'},retro:{bg:'#9a8050',sph:'#aa9060',grd:'#8a7040',avail:'#e8d898',found:'#5a7830',dim:'#c0a878',hov:'#d8c880',wrong:'#b83020',bar:'#5a7830',dot:'rgba(80,50,10,0.7)',border:'#705828'},wald:{bg:'#0d1e12',sph:'#102018',grd:'#1a3020',avail:'#2a5a35',found:'#58c865',dim:'#0b1810',hov:'#3a6a45',wrong:'#c04020',bar:'#58c865',dot:'rgba(255,255,255,0.7)',border:'#1a4020'}};
const CONT_KEYS=['EU','AF','AS','NA','SA','OC'];
const MODES={world:{de:'Alle Länder',en:'All Countries',cnt:'~197'},EU:{de:'Europa',en:'Europe',cnt:'~40'},AF:{de:'Afrika',en:'Africa',cnt:'~56'},AS:{de:'Asien',en:'Asia',cnt:'~55'},NA:{de:'Nordamerika',en:'N. America',cnt:'~27'},SA:{de:'Südamerika',en:'S. America',cnt:'12'},OC:{de:'Ozeanien',en:'Oceania',cnt:'~18'},custom:{de:'Eigener Modus',en:'Custom Mode',cnt:'⚙'}};
const TX={
  de:{title:'Weltkarte Quiz',sub:'Ein Ländername erscheint — finde und klicke es auf der Karte.',find:'Finde dieses Land',load:'Karte wird geladen …',back:'← Menü',foundLbl:'gefunden',correctLbl:'richtig',wrongLbl:'falsch',remLbl:'verbleibend',resTitle:'Quiz abgeschlossen!',again:'Nochmal spielen',newgame:'Neues Spiel',langLbl:'Sprache',themeLbl:'Design',foundModeLabel:'Richtig geraten',keepOn:'Grün markiert',keepOff:'Ausgeblendet',countries:'Länder',zoomTip:'Zoom & Pan möglich',correctFb:n=>'✓ Richtig! '+n,wrongFb:n=>'✗ Das war '+n,res1:(a,b,c)=>`${a} von ${b} beim 1. Versuch (${c} %)`,res2:(a,b)=>`${a} richtig, ${b} daneben`,themes:{nacht:'Nacht',atlas:'Atlas',retro:'Retro',wald:'Wald'},cback:'← Zurück',ctitle:'Eigener Modus',clblCont:'Kontinente',clblCount:'Anzahl Länder',clblOf:'verfügbar',clblAll:'Alle Länder',clblCountries:'Länder wählen',cbtnAll:'Alle',cbtnNone:'Keine',cbtnStart:'Starten'},
  en:{title:'World Map Quiz',sub:'A country name appears — find and click it on the map.',find:'Find this country',load:'Loading map …',back:'← Menu',foundLbl:'found',correctLbl:'correct',wrongLbl:'wrong',remLbl:'remaining',resTitle:'Quiz complete!',again:'Play again',newgame:'New game',langLbl:'Language',themeLbl:'Theme',foundModeLabel:'Correct answers',keepOn:'Stay green',keepOff:'Fade out',countries:'countries',zoomTip:'Zoom & pan supported',correctFb:n=>'✓ Correct! '+n,wrongFb:n=>'That was '+n,res1:(a,b,c)=>`${a} of ${b} on first try (${c}%)`,res2:(a,b)=>`${a} correct, ${b} missed`,themes:{nacht:'Night',atlas:'Atlas',retro:'Retro',wald:'Forest'},cback:'← Back',ctitle:'Custom Mode',clblCont:'Continents',clblCount:'Number of countries',clblOf:'available',clblAll:'All countries',clblCountries:'Select countries',cbtnAll:'All',cbtnNone:'None',cbtnStart:'Start'}
};

let lang='de',theme='nacht',keepFound=true,game={};
let countryPaths=null,microstateDots=null,worldData=null,borderPath=null,zoomBehavior=null,gGroup=null;
let visibleIds=new Set(),lastMode='world',canClick=true,optsOpen=false,wrongFlash=null;
let customConts=new Set(['EU','AF','AS','NA','SA','OC']),customCountries=new Set();
const DOT_R=7;

function t(k){return TX[lang][k]||TX.de[k]||k;}
function cn(id){return C[id]?(C[id][lang]||C[id].de):'?';}
function $(id){return document.getElementById(id);}
function shuffle(a){const b=[...a];for(let i=b.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[b[i],b[j]]=[b[j],b[i]];}return b;}
function eff(id){return REDIRECTS.get(id)??id;}
function activeConts(){return game.activeContinents||null;}

function showScreen(id){['mode-screen','game-screen','result-screen','custom-screen'].forEach(s=>{const el=$(s);if(el)el.style.display=s===id?(s==='game-screen'?'flex':'block'):'none';});}
function setLang(l){lang=l;$('btn-lang-de').className='lb'+(l==='de'?' active':'');$('btn-lang-en').className='lb'+(l==='en'?' active':'');updateAllText();if($('custom-screen').style.display!=='none')renderCustom();}
function setTheme(v){theme=v;['nacht','atlas','retro','wald'].forEach(k=>{$('th-'+k).className='tp'+(k===v?' active':'');});applyTheme();}
function setKeepFound(v){keepFound=v;$('btn-found-on').className='lb'+(v?' active':'');$('btn-found-off').className='lb'+(!v?' active':'');updateColors();}
function applyTheme(){const h=THEMES[theme];$('map-bg').style.background=h.bg;$('prog-bar').style.background=h.bar;d3.select('#map rect.ocean').attr('fill',h.bg);d3.select('#map path.sphere').attr('fill',h.sph).attr('stroke',h.grd);d3.select('#map path.grat').attr('stroke',h.grd);if(borderPath)borderPath.attr('stroke',h.border);updateColors();}
function toggleOpts(){optsOpen=!optsOpen;$('opts-panel').style.display=optsOpen?'block':'none';}

function updateAllText(){
  renderModeScreen();$('btn-back').textContent=t('back');$('find-label').textContent=t('find');$('found-label').textContent=t('foundLbl');$('lbl-lang').textContent=t('langLbl');$('lbl-theme').textContent=t('themeLbl');$('lbl-c').textContent=t('correctLbl');$('lbl-w').textContent=t('wrongLbl');$('lbl-found-mode').textContent=t('foundModeLabel');$('btn-found-on').textContent=t('keepOn');$('btn-found-off').textContent=t('keepOff');$('tl-nacht').textContent=t('themes').nacht;$('tl-atlas').textContent=t('themes').atlas;$('tl-retro').textContent=t('themes').retro;$('tl-wald').textContent=t('themes').wald;$('res-title').textContent=t('resTitle');$('btn-again').textContent=t('again');$('btn-new').textContent=t('newgame');
  if(game.current&&C[game.current])$('target-name').textContent=cn(game.current);updateStats();
}

function renderModeScreen(){
  const ms=['world','EU','AF','AS','NA','SA','OC','custom'];
  $('mode-screen').innerHTML=`<div style="padding:1.5rem 1.25rem;"><h1 style="font-size:22px;font-weight:500;margin:0 0 .25rem;text-align:center;">${t('title')}</h1><p style="font-size:14px;color:#888;text-align:center;margin:0 0 1.5rem;">${t('sub')}</p><div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:10px;max-width:640px;margin:0 auto;">${ms.map(m=>`<button class="mode-btn" onclick="${m==='custom'?'openCustom()':'startGame(\''+m+'\')'}"><span style="display:block;font-weight:500;font-size:14px;">${MODES[m][lang]}</span><span style="display:block;font-size:12px;color:#888;margin-top:2px;">${MODES[m].cnt} ${m!=='custom'?t('countries'):''}</span></button>`).join('')}</div><p style="font-size:12px;color:#666;text-align:center;margin:1.25rem 0 0;">${t('zoomTip')}</p></div>`;
}

// ── CUSTOM MODE ──
function openCustom(){showScreen('custom-screen');renderCustom();}
function getCustomPool(){return Object.keys(C).map(Number).filter(id=>customConts.has(C[id].c));}

function renderCustom(){
  $('cback').textContent=t('cback');$('ctitle').textContent=t('ctitle');
  $('clbl-cont').textContent=t('clblCont');$('clbl-count').textContent=t('clblCount');
  $('clbl-countries').textContent=t('clblCountries');$('cbtn-all').textContent=t('cbtnAll');
  $('cbtn-none').textContent=t('cbtnNone');$('cbtn-start').textContent=t('cbtnStart');
  $('clbl-all').textContent=t('clblAll');
  $('cont-checks').innerHTML=CONT_KEYS.map(k=>`<label class="cb"><input type="checkbox" ${customConts.has(k)?'checked':''} onchange="toggleCont('${k}',this.checked)"><span>${MODES[k][lang]}</span></label>`).join('');
  updateCustomCountries();
}

function toggleCont(k,on){
  if(on)customConts.add(k);else customConts.delete(k);
  updateCustomCountries();
}

function updateCustomCountries(){
  const pool=getCustomPool();
  customCountries=new Set(pool);
  renderCountryTags();
  updateCustomInfo();
}

function renderCountryTags(){
  const pool=getCustomPool().sort((a,b)=>cn(a).localeCompare(cn(b)));
  $('country-tags').innerHTML=pool.map(id=>`<span class="ctag ${customCountries.has(id)?'on':''}" onclick="toggleC(${id})">${cn(id)}</span>`).join('');
  updateCustomInfo();
}

function toggleC(id){
  if(customCountries.has(id))customCountries.delete(id);else customCountries.add(id);
  const el=$('country-tags').querySelector(`[onclick="toggleC(${id})"]`);
  if(el)el.className='ctag '+(customCountries.has(id)?'on':'');
  updateCustomInfo();
}

function selAllC(on){
  const pool=getCustomPool();
  customCountries=on?new Set(pool):new Set();
  renderCountryTags();
}

function toggleAllCountries(){
  const cb=$('all-countries-cb');
  if(cb.checked){$('round-size').value=customCountries.size;}
  updateCustomInfo();
}

function updateCustomInfo(){
  const n=customCountries.size;
  $('clbl-of').textContent=`/ ${n} ${t('clblOf')}`;
  const allCb=$('all-countries-cb');
  if(allCb.checked)$('round-size').value=n;
  $('cbtn-start').disabled=n===0;
}

function startCustom(){
  const allCb=$('all-countries-cb');
  let pool=[...customCountries];
  let count=allCb.checked?pool.length:Math.min(parseInt($('round-size').value)||10,pool.length);
  if(count<1||pool.length===0)return;
  const q=shuffle(pool).slice(0,count);
  game={mode:'custom',activeContinents:new Set(customConts),customIds:new Set(q),queue:q,current:null,found:new Set(),correct:0,wrong:0,firstTry:0,total:q.length,wrongOnCurrent:false};
  canClick=true;optsOpen=false;
  showScreen('game-screen');$('opts-panel').style.display='none';
  $('target-name').textContent='';$('feedback').textContent=t('load');
  updateAllText();
  loadMap().then(()=>{
    game.queue=game.queue.filter(id=>(visibleIds.has(id)||MS_IDS.has(id))&&C[id]);
    game.total=game.queue.length;
    if(customConts.size===1){const z=ZOOMS[[...customConts][0]];if(z)zoomTo(z[0],z[1],z[2]);}
    else if(customConts.size<6){zoomTo(480,250,1.2);}
    nextCountry();
  });
}

// ── GAME ──
async function startGame(mode){
  lastMode=mode;canClick=true;optsOpen=false;
  const ids=Object.keys(C).map(Number);
  const filtered=mode==='world'?ids:ids.filter(id=>C[id].c===mode);
  const conts=mode==='world'?null:new Set([mode]);
  game={mode,activeContinents:conts,queue:shuffle(filtered),current:null,found:new Set(),correct:0,wrong:0,firstTry:0,total:0,wrongOnCurrent:false};
  showScreen('game-screen');$('opts-panel').style.display='none';
  $('target-name').textContent='';$('feedback').textContent=t('load');$('feedback').style.color='#888';
  updateAllText();await loadMap();
  game.queue=game.queue.filter(id=>(visibleIds.has(id)||MS_IDS.has(id))&&C[id]);
  game.total=game.queue.length;
  const z=ZOOMS[mode]||ZOOMS.world;
  zoomTo(z[0],z[1],z[2]);
  nextCountry();
}
function restart(){if(lastMode==='custom')startCustom();else startGame(lastMode);}
function back(){showScreen('mode-screen');}

function zoomTo(cx,cy,k){
  if(!zoomBehavior)return;
  const svg=d3.select('#map');
  const W=960,H=500;
  const tx=W/2-cx*k,ty=H/2-cy*k;
  svg.transition().duration(600).call(zoomBehavior.transform,d3.zoomIdentity.translate(tx,ty).scale(k));
}

async function loadMap(){if(worldData){renderMap(worldData);return;}try{worldData=await fetch('https://cdn.jsdelivr.net/npm/world-atlas@2/countries-50m.json').then(r=>r.json());renderMap(worldData);}catch(e){$('feedback').textContent='Error';}}

function isActive(id){
  if(game.mode==='custom')return game.customIds&&game.customIds.has(id);
  const ac=activeConts();
  if(!ac)return !!C[id];
  return C[id]&&ac.has(C[id].c);
}

function renderMap(world){
  const svg=d3.select('#map');svg.selectAll('*').remove();borderPath=null;gGroup=null;
  const th=THEMES[theme],W=960,H=500;
  const proj=d3.geoNaturalEarth1().scale(153).translate([W/2,H/2]);
  const gpath=d3.geoPath().projection(proj);
  svg.append('rect').attr('class','ocean').attr('width',W).attr('height',H).attr('fill',th.bg);
  const g=svg.append('g');gGroup=g;
  g.append('path').attr('class','sphere').datum({type:'Sphere'}).attr('d',gpath).attr('fill',th.sph).attr('stroke',th.grd).attr('stroke-width',1);
  g.append('path').attr('class','grat').datum(d3.geoGraticule()()).attr('d',gpath).attr('fill','none').attr('stroke',th.grd).attr('stroke-width',0.3);
  const countries=topojson.feature(world,world.objects.countries);
  // Assign unique synthetic negative IDs to features whose id coerces to NaN
  // so each gets its own slot in REDIRECTS instead of all colliding at NaN
  let _sid=-1;
  countries.features.forEach(f=>{if(isNaN(+f.id))f.id=_sid--;});
  visibleIds=new Set(countries.features.map(f=>+f.id));
  REDIRECTS.clear();
  // 304=Greenland, 10=Antarctica — non-clickable, no redirect
  const NO_REDIRECT=new Set([304,10]);
  const kc=countries.features.filter(f=>C[+f.id]).map(f=>({id:+f.id,ctr:d3.geoCentroid(f)}));
  countries.features.forEach(u=>{const uid=+u.id;if(C[uid])return;if(NO_REDIRECT.has(uid))return;const uc=d3.geoCentroid(u);let b=null,bd=Infinity;kc.forEach(({id,ctr})=>{const d=(uc[0]-ctr[0])**2+(uc[1]-ctr[1])**2;if(d<bd){bd=d;b=id;}});if(b!==null)REDIRECTS.set(uid,b);});
  // Geographic overrides for specific disputed/unrecognised territories
  countries.features.forEach(f=>{const uid=+f.id;if(uid>=0)return;const [lon,lat]=d3.geoCentroid(f);
    if(lon>43&&lon<50&&lat>7&&lat<13)REDIRECTS.set(uid,706); // Somaliland → Somalia
  });

  // Visually merge Somaliland into Somalia: one shape, no shared border
  const geoms=world.objects.countries.geometries;
  const somaliaIdx=countries.features.findIndex(f=>+f.id===706);
  const somalilandIdx=countries.features.findIndex(f=>+f.id<0&&REDIRECTS.get(+f.id)===706);
  const mergedPairs=[];
  let renderFeatures=countries.features;
  if(somaliaIdx>=0&&somalilandIdx>=0){
    const geom1=geoms[somaliaIdx],geom2=geoms[somalilandIdx];
    const mergedGeometry=topojson.merge(world,[geom1,geom2]);
    mergedPairs.push([geom1,geom2]);
    renderFeatures=countries.features
      .filter((_,i)=>i!==somalilandIdx)
      .map(f=>+f.id===706?{...f,geometry:mergedGeometry}:f);
  }

  countryPaths=g.selectAll('.ct').data(renderFeatures).enter().append('path').attr('class','ct').attr('d',gpath).attr('stroke','none')
    .on('mouseover',function(ev,d){const id=eff(+d.id);if(!game.found||game.found.has(id)||!C[id]||!isActive(id))return;d3.select(this).attr('fill',THEMES[theme].hov);})
    .on('mouseout',function(ev,d){d3.select(this).attr('fill',getColor(+d.id));})
    .on('click',(ev,d)=>handleClick(+d.id));

  // Border mesh excluding the merged Somalia–Somaliland boundary
  const borderMesh=topojson.mesh(world,world.objects.countries,(a,b)=>{
    for(const[g1,g2]of mergedPairs){if((a===g1&&b===g2)||(a===g2&&b===g1))return false;}
    return true;
  });
  borderPath=g.append('path').datum(borderMesh).attr('d',gpath).attr('fill','none').attr('stroke',th.border).attr('stroke-width',0.8).style('vector-effect','non-scaling-stroke').attr('pointer-events','none');

  const activeDots=MICROSTATES.filter(m=>isActive(m.id));
  microstateDots=g.selectAll('.ms').data(activeDots).enter().append('circle').attr('class','ms')
    .attr('cx',d=>proj([d.lon,d.lat])[0]).attr('cy',d=>proj([d.lon,d.lat])[1])
    .attr('r',DOT_R).attr('stroke-width',1.5).style('vector-effect','non-scaling-stroke').attr('cursor','pointer')
    .on('mouseover',function(ev,d){if(game.found&&game.found.has(d.id))return;d3.select(this).attr('fill',THEMES[theme].hov);})
    .on('mouseout',function(ev,d){d3.select(this).attr('fill',getMSColor(d.id));})
    .on('click',(ev,d)=>handleClick(d.id));

  const gNode=g.node();
  let _raf=null,_lastT=null,_pTimer=null;
  zoomBehavior=d3.zoom().scaleExtent([1,12]).on('zoom',ev=>{
    _lastT=ev.transform;
    // ONE write disables hit-testing for all children via CSS inheritance
    if(!_pTimer)gNode.style.pointerEvents='none';
    clearTimeout(_pTimer);
    _pTimer=setTimeout(()=>{gNode.style.pointerEvents='';_pTimer=null;},150);
    // Batch rendering to max 60fps
    if(!_raf)_raf=requestAnimationFrame(()=>{
      g.attr('transform',_lastT);
      if(microstateDots)microstateDots.attr('r',DOT_R/_lastT.k);
      _raf=null;
    });
  });
  svg.call(zoomBehavior);
  $('map-bg').style.background=th.bg;updateColors();
}

function getColor(rawId){const id=eff(rawId),th=THEMES[theme];if(!C[id])return th.dim;if(keepFound&&game.found&&game.found.has(id))return th.found;if(!isActive(id))return th.dim;return th.avail;}
function getMSColor(id){const th=THEMES[theme];if(keepFound&&game.found&&game.found.has(id))return th.found;if(!isActive(id))return th.dim;return th.avail;}
function updateColors(){if(!countryPaths)return;const th=THEMES[theme];countryPaths.attr('fill',d=>getColor(+d.id)).attr('cursor',d=>{const id=eff(+d.id);return isActive(id)?'pointer':'default';});if(microstateDots)microstateDots.attr('fill',d=>getMSColor(d.id)).attr('stroke',th.border).attr('cursor',d=>isActive(d.id)?'pointer':'default');}
function nextCountry(){canClick=true;if(!game.queue||game.queue.length===0){showResult();return;}game.current=game.queue.shift();game.wrongOnCurrent=false;$('target-name').textContent=cn(game.current);$('feedback').textContent='';updateStats();updateColors();}
function flashWrong(rawId){countryPaths&&countryPaths.filter(d=>+d.id===rawId).attr('fill',THEMES[theme].wrong);microstateDots&&microstateDots.filter(d=>d.id===rawId).attr('fill',THEMES[theme].wrong);if(wrongFlash)clearTimeout(wrongFlash);wrongFlash=setTimeout(updateColors,700);}
function handleClick(rawId){if(!canClick||!game||!game.current)return;const id=eff(rawId);const info=C[id];if(!info||!isActive(id))return;if(id===game.current){canClick=false;game.correct++;if(!game.wrongOnCurrent)game.firstTry++;game.found.add(id);$('feedback').textContent=t('correctFb')(cn(id));$('feedback').style.color=THEMES[theme].found;updateColors();updateStats();setTimeout(nextCountry,1100);}else{game.wrong++;game.wrongOnCurrent=true;$('feedback').textContent=t('wrongFb')(cn(id));$('feedback').style.color=THEMES[theme].wrong;flashWrong(rawId);updateStats();}}
function updateStats(){const dn=game.found?game.found.size:0,tot=game.total||1,rm=(game.queue?game.queue.length:0)+(game.current?1:0);$('score-disp').textContent=dn+'/'+tot;$('stat-c').textContent=game.correct||0;$('stat-w').textContent=game.wrong||0;$('stat-r').textContent=rm+' '+t('remLbl');$('prog-bar').style.width=Math.round((dn/tot)*100)+'%';}
function showResult(){game.current=null;showScreen('result-screen');const p=game.total>0?Math.round((game.firstTry/game.total)*100):0;$('res-emoji').textContent=p>=90?'🏆':p>=70?'🎉':p>=50?'👍':'📚';$('res-title').textContent=t('resTitle');$('res-l1').textContent=t('res1')(game.firstTry,game.total,p);$('res-l2').textContent=t('res2')(game.correct,game.wrong);$('btn-again').textContent=t('again');$('btn-new').textContent=t('newgame');}

renderModeScreen();updateAllText();
