const REDIRECTS=new Map();

// Zoom presets per continent [x, y, scale]
const ZOOMS={world:[480,250,1],EU:[520,160,3.5],AF:[510,280,2.2],AS:[680,200,2],NA:[220,190,2.2],SA:[310,350,2.2],OC:[810,370,2.8]};

const THEMES={atlas:{bg:'#3a80b8',sph:'#4a90cc',grd:'#2a70a8',avail:'#e0d4b4',found:'#4a8a30',dim:'#a8c4d8',hov:'#ccc0a0',wrong:'#c03820',bar:'#4a8a30',dot:'rgba(0,0,0,0.85)',border:'#205090'},neon:{bg:'#0a0420',sph:'#0e0838',grd:'#2a1550',avail:'#4a2a6a',found:'#05d9e8',dim:'#1a0e30',hov:'#ff2a6d',wrong:'#ff1f4f',bar:'#05d9e8',dot:'rgba(5,217,232,0.9)',border:'#c030e0'},ember:{bg:'#181210',sph:'#221812',grd:'#3a281a',avail:'#d98a3d',found:'#52d9a0',dim:'#241a14',hov:'#f0b860',wrong:'#e23a2a',bar:'#52d9a0',dot:'rgba(255,240,220,0.85)',border:'#7a4a20'},aurora:{bg:'#06121a',sph:'#0a1f2a',grd:'#123040',avail:'#3ad9a0',found:'#b070ff',dim:'#0a1a22',hov:'#7affd0',wrong:'#ff4a6a',bar:'#b070ff',dot:'rgba(255,255,255,0.85)',border:'#0d4555'}};
const CONT_KEYS=['EU','AF','AS','NA','SA','OC'];
const THEME_DOT={atlas:'#b0a080',neon:'#ff2a6d',ember:'#d98a3d',aurora:'#3ad9a0'};
const ISO2={4:'af',8:'al',12:'dz',20:'ad',24:'ao',28:'ag',31:'az',32:'ar',36:'au',40:'at',44:'bs',48:'bh',50:'bd',51:'am',52:'bb',56:'be',64:'bt',68:'bo',70:'ba',72:'bw',76:'br',84:'bz',90:'sb',96:'bn',100:'bg',104:'mm',108:'bi',112:'by',116:'kh',120:'cm',124:'ca',132:'cv',140:'cf',144:'lk',148:'td',152:'cl',156:'cn',158:'tw',170:'co',174:'km',178:'cg',180:'cd',188:'cr',191:'hr',192:'cu',196:'cy',203:'cz',204:'bj',208:'dk',212:'dm',214:'do',218:'ec',222:'sv',226:'gq',231:'et',232:'er',233:'ee',242:'fj',246:'fi',250:'fr',262:'dj',266:'ga',268:'ge',270:'gm',275:'ps',276:'de',288:'gh',296:'ki',300:'gr',308:'gd',320:'gt',324:'gn',328:'gy',332:'ht',336:'va',340:'hn',348:'hu',352:'is',356:'in',360:'id',364:'ir',368:'iq',372:'ie',376:'il',380:'it',383:'xk',384:'ci',388:'jm',392:'jp',398:'kz',400:'jo',404:'ke',408:'kp',410:'kr',414:'kw',417:'kg',418:'la',422:'lb',426:'ls',428:'lv',430:'lr',434:'ly',438:'li',440:'lt',442:'lu',450:'mg',454:'mw',458:'my',462:'mv',466:'ml',470:'mt',478:'mr',480:'mu',484:'mx',492:'mc',496:'mn',498:'md',499:'me',504:'ma',508:'mz',512:'om',516:'na',520:'nr',524:'np',528:'nl',548:'vu',554:'nz',558:'ni',562:'ne',566:'ng',578:'no',583:'fm',584:'mh',585:'pw',586:'pk',591:'pa',598:'pg',600:'py',604:'pe',608:'ph',616:'pl',620:'pt',624:'gw',626:'tl',634:'qa',642:'ro',643:'ru',646:'rw',659:'kn',662:'lc',670:'vc',674:'sm',678:'st',682:'sa',686:'sn',688:'rs',690:'sc',694:'sl',702:'sg',703:'sk',704:'vn',705:'si',706:'so',710:'za',716:'zw',724:'es',728:'ss',729:'sd',740:'sr',748:'sz',752:'se',756:'ch',760:'sy',762:'tj',764:'th',768:'tg',776:'to',780:'tt',784:'ae',788:'tn',792:'tr',795:'tm',798:'tv',800:'ug',804:'ua',807:'mk',818:'eg',826:'gb',834:'tz',840:'us',854:'bf',858:'uy',860:'uz',862:'ve',882:'ws',887:'ye',894:'zm'};
const _cc=k=>Object.values(C).filter(v=>k==='world'||v.c===k).length;
const MODES={world:{de:'Alle Länder',en:'All Countries',cnt:_cc('world')},EU:{de:'Europa',en:'Europe',cnt:_cc('EU')},AF:{de:'Afrika',en:'Africa',cnt:_cc('AF')},AS:{de:'Asien',en:'Asia',cnt:_cc('AS')},NA:{de:'Nordamerika',en:'N. America',cnt:_cc('NA')},SA:{de:'Südamerika',en:'S. America',cnt:_cc('SA')},OC:{de:'Ozeanien',en:'Oceania',cnt:_cc('OC')},custom:{de:'Eigener Modus',en:'Custom Mode',cnt:'⚙'}};
const TX={
  de:{title:'Weltkarte Quiz',sub:'Ein Ländername erscheint — finde und klicke es auf der Karte.',find:'Finde dieses Land',findLake:'Finde diesen See',findRiver:'Finde diesen Fluss',lakeQuiz:'Seen-Quiz',lakeSub:'Ein See erscheint — finde und klicke ihn auf der Karte.',lakeDiffs:[{key:'beginner',label:'Anfänger',count:13},{key:'easy',label:'Einfach',count:44},{key:'medium',label:'Mittel',count:76},{key:'hard',label:'Schwer',count:144},{key:'extreme',label:'Extrem',count:321}],lakes:'Seen',riverQuiz:'Fluss-Quiz',riverSub:'Ein Flussname erscheint — finde und klicke ihn auf der Karte.',riverDiffs:[{key:'beginner',label:'Anfänger',count:13},{key:'easy',label:'Einfach',count:44},{key:'medium',label:'Mittel',count:76},{key:'hard',label:'Schwer',count:144},{key:'extreme',label:'Extrem',count:214}],rivers:'Flüsse',flagQuiz:'Flaggen Quiz',flagSub:'Eine Flagge erscheint — tippe den Ländernamen ein.',flagPlaceholder:'Land eingeben …',flagWorld:'Weltweit',homeTitle:'Geografie-Spiele',homeSub:'Teste dein Wissen über die Welt — Länder, Seen, Flüsse und Flaggen.',playBtn:'Spielen',optionsLbl:'Optionen',homeBtn:'← Start',scrollHint:'Scrollen für mehr',mapQuiz:'Weltkarte',load:'Karte wird geladen …',back:'← Menü',foundLbl:'gefunden',correctLbl:'richtig',wrongLbl:'falsch',remLbl:'verbleibend',resTitle:'Quiz abgeschlossen!',again:'Nochmal spielen',newgame:'Neues Spiel',langLbl:'Sprache',themeLbl:'Design',foundModeLabel:'Richtig geraten',keepOn:'Grün markiert',keepOff:'Ausgeblendet',wrongHintLabel:'Hinweise',wrongHintOn:'Anzeigen',wrongHintOff:'Ausblenden',countries:'Länder',zoomTip:'Zoom & Pan möglich',skipLbl:'Überspringen',skippedLbl:'übersprungen',correctFb:n=>'✓ Richtig! '+n,wrongFb:n=>'✗ Das war '+n,res1:(a,b,c)=>`${a} von ${b} beim 1. Versuch (${c} %)`,res2:(a,b)=>`${a} richtig, ${b} daneben`,themes:{atlas:'Atlas',neon:'Cyberpunk',ember:'Vulkan',aurora:'Polarlicht'},cback:'← Zurück',ctitle:'Eigener Modus',clblCont:'Kontinente',clblCount:'Anzahl Länder',clblOf:'verfügbar',clblAll:'Alle Länder',clblCountries:'Länder wählen',cbtnAll:'Alle',cbtnNone:'Keine',cbtnStart:'Starten'},
  en:{title:'World Map Quiz',sub:'A country name appears — find and click it on the map.',find:'Find this country',findLake:'Find this lake',findRiver:'Find this river',lakeQuiz:'Lake Quiz',lakeSub:'A lake name appears — find and click it on the map.',lakeDiffs:[{key:'beginner',label:'Beginner',count:13},{key:'easy',label:'Easy',count:44},{key:'medium',label:'Medium',count:76},{key:'hard',label:'Hard',count:144},{key:'extreme',label:'Extreme',count:321}],lakes:'Lakes',riverQuiz:'River Quiz',riverSub:'A river name appears — find and click it on the map.',riverDiffs:[{key:'beginner',label:'Beginner',count:13},{key:'easy',label:'Easy',count:44},{key:'medium',label:'Medium',count:76},{key:'hard',label:'Hard',count:144},{key:'extreme',label:'Extreme',count:214}],rivers:'Rivers',flagQuiz:'Flag Quiz',flagSub:'A flag appears — type the country name.',flagPlaceholder:'Enter country …',flagWorld:'Worldwide',homeTitle:'World Geography Games',homeSub:'Test your knowledge of the world — countries, lakes, rivers and flags.',playBtn:'Play',optionsLbl:'Options',homeBtn:'← Home',scrollHint:'Scroll for more',mapQuiz:'World Map',load:'Loading map …',back:'← Menu',foundLbl:'found',correctLbl:'correct',wrongLbl:'wrong',remLbl:'remaining',resTitle:'Quiz complete!',again:'Play again',newgame:'New game',langLbl:'Language',themeLbl:'Theme',foundModeLabel:'Correct answers',keepOn:'Stay green',keepOff:'Fade out',wrongHintLabel:'Hints',wrongHintOn:'Show',wrongHintOff:'Hide',countries:'countries',zoomTip:'Zoom & pan supported',skipLbl:'Skip',skippedLbl:'skipped',correctFb:n=>'✓ Correct! '+n,wrongFb:n=>'That was '+n,res1:(a,b,c)=>`${a} of ${b} on first try (${c}%)`,res2:(a,b)=>`${a} correct, ${b} missed`,themes:{atlas:'Atlas',neon:'Cyberpunk',ember:'Ember',aurora:'Aurora'},cback:'← Back',ctitle:'Custom Mode',clblCont:'Continents',clblCount:'Number of countries',clblOf:'available',clblAll:'All countries',clblCountries:'Select countries',cbtnAll:'All',cbtnNone:'None',cbtnStart:'Start'}
};

let lang='de',theme='atlas',keepFound=true,showWrongHint=true,game={};
let countryPaths=null,microstateDots=null,lakePaths=null,lakeDots=null,riverPaths=null,riverHitboxes=null,worldData=null,borderPath=null,zoomBehavior=null,gGroup=null;
let visibleIds=new Set(),lastMode='world',canClick=true,optsOpen=false,wrongFlash=null,_fbTimer=null;

function showFeedback(text,color){
  const el=$('feedback');
  if(!el)return;
  el.textContent=text;
  el.style.color=color||'#eee';
  el.style.opacity='1';
  if(_fbTimer)clearTimeout(_fbTimer);
  _fbTimer=setTimeout(()=>{el.style.opacity='0';},2000);
}
function clearFeedback(){const el=$('feedback');if(el){el.style.opacity='0';el.textContent='';}}
let customConts=new Set(['EU','AF','AS','NA','SA','OC']),customCountries=new Set();
const DOT_R=6; // target radius in screen pixels
const COARSE=(typeof window!=='undefined'&&window.matchMedia)?window.matchMedia('(pointer:coarse)').matches:false;
const HIT_R=COARSE?22:DOT_R+5; // invisible touch-target radius in screen px (~44px on touch devices)
const MS_HIT_OVERRIDE={438:14}; // per-microstate hit radius override (Liechtenstein: small so taps fall through to Switzerland)
const msHitR=id=>MS_HIT_OVERRIDE[id]||HIT_R;

function t(k){return TX[lang][k]||TX.de[k]||k;}
function cn(id){return C[id]?(C[id][lang]||C[id].de):'?';}
function $(id){return document.getElementById(id);}
function shuffle(a){const b=[...a];for(let i=b.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[b[i],b[j]]=[b[j],b[i]];}return b;}
function eff(id){return REDIRECTS.get(id)??id;}
function activeConts(){return game.activeContinents||null;}

const SCREENS=['home-screen','mode-screen','game-screen','result-screen','custom-screen','flag-screen'];
function showScreen(id){SCREENS.forEach(s=>{const el=$(s);if(el)el.style.display=s===id?(s==='game-screen'||s==='flag-screen'||s==='home-screen'?'flex':'block'):'none';});}
function goHome(){showScreen('home-screen');renderHome();}
function goToGames(section){showScreen('mode-screen');renderModeScreen();const el=$('mode-screen');if(!el)return;const sec=section||0;const apply=()=>{const prev=el.style.scrollBehavior;el.style.scrollBehavior='auto';el.scrollTo(0,sec*el.clientHeight);el.style.scrollBehavior=prev;updateSectionNav();};requestAnimationFrame(apply);setTimeout(apply,60);}

function optLangHTML(){
  return `
    <div class="opt-group">
      <div class="opt-label">${t('langLbl')}</div>
      <div class="opt-row">
        <button class="lb${lang==='de'?' active':''}" onclick="setLang('de')">DE</button>
        <button class="lb${lang==='en'?' active':''}" onclick="setLang('en')">EN</button>
      </div>
    </div>`;
}
function optRestHTML(){
  return `
    <div class="opt-group">
      <div class="opt-label">${t('themeLbl')}</div>
      <div class="opt-row">
        ${['atlas','neon','ember','aurora'].map(k=>`<button class="tp${theme===k?' active':''}" onclick="setTheme('${k}')"><span class="dot" style="background:${THEME_DOT[k]};"></span><span>${t('themes')[k]}</span></button>`).join('')}
      </div>
    </div>
    <div class="opt-group">
      <div class="opt-label">${t('foundModeLabel')}</div>
      <div class="opt-row">
        <button class="lb${keepFound?' active':''}" onclick="setKeepFound(true)">${t('keepOn')}</button>
        <button class="lb${!keepFound?' active':''}" onclick="setKeepFound(false)">${t('keepOff')}</button>
      </div>
    </div>
    <div class="opt-group">
      <div class="opt-label">${t('wrongHintLabel')}</div>
      <div class="opt-row">
        <button class="lb${showWrongHint?' active':''}" onclick="setWrongHint(true)">${t('wrongHintOn')}</button>
        <button class="lb${!showWrongHint?' active':''}" onclick="setWrongHint(false)">${t('wrongHintOff')}</button>
      </div>
    </div>`;
}
function renderOptions(){const h=$('home-options');if(h)h.innerHTML=optLangHTML();const g=$('opts-content');if(g)g.innerHTML=optLangHTML()+optRestHTML();}

function setLang(l){lang=l;updateAllText();renderOptions();if($('custom-screen').style.display!=='none')renderCustom();}
function setTheme(v){theme=v;applyTheme();renderOptions();}
function setKeepFound(v){keepFound=v;updateColors();renderOptions();}
function setWrongHint(v){showWrongHint=v;renderOptions();}
function applyTheme(){const h=THEMES[theme];$('map-bg').style.background=h.bg;$('prog-bar').style.background=h.bar;d3.select('#map rect.ocean').attr('fill',h.bg);d3.select('#map path.sphere').attr('fill',h.sph).attr('stroke',h.grd);d3.select('#map path.grat').attr('stroke',h.grd);if(borderPath)borderPath.attr('stroke',h.border);d3.select('#map path.coastline').attr('stroke',h.border);d3.select('#map g.lakes').selectAll('path').attr('fill',h.sph).attr('stroke',h.border);updateColors();}
function toggleOpts(){optsOpen=!optsOpen;$('opts-panel').style.display=optsOpen?'block':'none';}

function setTxt(id,v){const e=$(id);if(e)e.textContent=v;}
function renderHome(){
  setTxt('home-title',t('homeTitle'));setTxt('home-sub',t('homeSub'));
  setTxt('home-play',t('playBtn'));setTxt('home-opt-lbl',t('optionsLbl'));
  renderOptions();
}
function updateAllText(){
  renderHome();
  if($('mode-screen').style.display!=='none')renderModeScreen();
  setTxt('btn-back',t('back'));setTxt('find-label',game.riverMode?t('findRiver'):game.lakeMode?t('findLake'):t('find'));setTxt('found-label',t('foundLbl'));setTxt('lbl-c',t('correctLbl'));setTxt('lbl-w',t('wrongLbl'));setTxt('btn-skip',t('skipLbl'));setTxt('res-title',t('resTitle'));setTxt('btn-again',t('again'));setTxt('btn-new',t('newgame'));setTxt('opts-title',t('optionsLbl'));setTxt('flag-btn-back',t('back'));setTxt('flag-lbl-c',t('correctLbl'));setTxt('flag-lbl-w',t('wrongLbl'));
  if(game.current&&C[game.current])$('target-name').textContent=cn(game.current);updateStats();
}

const SECTIONS=['map','lake','river','flag'];
function gsCard(onclick,title,sub){
  return `<button class="gs-card" onclick="${onclick}"><span class="gs-card-t">${title}</span><span class="gs-card-s">${sub}</span></button>`;
}
function sectionInner(key){
  if(key==='map'){
    const ms=['world','EU','AF','AS','NA','SA','OC','custom'];
    return ms.map(m=>gsCard(m==='custom'?'openCustom()':"startGame('"+m+"')",MODES[m][lang],m==='custom'?'⚙':MODES[m].cnt+' '+t('countries'))).join('');
  }
  if(key==='lake')return TX[lang].lakeDiffs.map(d=>gsCard("startLakeGame('"+d.key+"')",d.label,d.count+' '+t('lakes'))).join('');
  if(key==='river')return TX[lang].riverDiffs.map(d=>gsCard("startRiverGame('"+d.key+"')",d.label,d.count+' '+t('rivers'))).join('');
  if(key==='flag')return ['world','EU','AF','AS','NA','SA','OC'].map(m=>gsCard("startFlagQuiz('"+m+"')",m==='world'?t('flagWorld'):MODES[m][lang],_cc(m)+' '+t('countries'))).join('');
  return '';
}
const SECTION_META={
  map:{icon:'🗺️',head:()=>t('mapQuiz'),sub:()=>t('sub')},
  lake:{icon:'💧',head:()=>t('lakeQuiz'),sub:()=>t('lakeSub')},
  river:{icon:'🌊',head:()=>t('riverQuiz'),sub:()=>t('riverSub')},
  flag:{icon:'🚩',head:()=>t('flagQuiz'),sub:()=>t('flagSub')}
};
function renderModeScreen(){
  const nav=SECTIONS.map((k,i)=>`<button class="gs-dot" data-sec="${i}" onclick="scrollToSection(${i})" title="${SECTION_META[k].head()}"></button>`).join('');
  const sections=SECTIONS.map((k,i)=>{
    const m=SECTION_META[k];
    return `<section class="game-section gs-${k}" data-idx="${i}">
      <div class="gs-bg gs-bg-${k}"></div>
      <div class="gs-content">
        <div class="gs-icon">${m.icon}</div>
        <h2 class="gs-head">${m.head()}</h2>
        <p class="gs-sub">${m.sub()}</p>
        <div class="gs-grid gs-grid-${k}">${sectionInner(k)}</div>
      </div>
      ${i<SECTIONS.length-1?`<div class="gs-scroll-hint">${t('scrollHint')} ↓</div>`:''}
    </section>`;
  }).join('');
  $('mode-screen').innerHTML=`
    <div class="gs-topbar">
      <button class="gs-home-btn" onclick="goHome()">${t('homeBtn')}</button>
    </div>
    <div class="gs-nav">${nav}</div>
    ${sections}`;
  const sc=$('mode-screen');
  sc.onscroll=updateSectionNav;
  updateSectionNav();
}
function updateSectionNav(){
  const sc=$('mode-screen');if(!sc)return;
  const idx=Math.round(sc.scrollTop/sc.clientHeight);
  document.querySelectorAll('.gs-dot').forEach((d,i)=>d.classList.toggle('active',i===idx));
}
function scrollToSection(i){const sc=$('mode-screen');if(sc)sc.scrollTo({top:i*sc.clientHeight,behavior:'smooth'});}
document.addEventListener('keydown',e=>{
  const sc=$('mode-screen');
  if(!sc||sc.style.display==='none')return;
  if(e.key!=='ArrowDown'&&e.key!=='ArrowUp')return;
  e.preventDefault();
  const idx=Math.round(sc.scrollTop/sc.clientHeight);
  const next=e.key==='ArrowDown'?Math.min(idx+1,SECTIONS.length-1):Math.max(idx-1,0);
  scrollToSection(next);
});

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
  $('target-name').textContent='';showFeedback(t('load'),'#888');
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
  game={mode,activeContinents:conts,queue:shuffle(filtered),current:null,found:new Set(),correct:0,wrong:0,firstTry:0,total:0,wrongOnCurrent:false,skipped:0};
  showScreen('game-screen');$('opts-panel').style.display='none';
  $('target-name').textContent='';showFeedback(t('load'),'#888');$('feedback').style.color='#888';
  updateAllText();await loadMap();
  game.queue=game.queue.filter(id=>(visibleIds.has(id)||MS_IDS.has(id))&&C[id]);
  game.total=game.queue.length;
  const z=ZOOMS[mode]||ZOOMS.world;
  zoomTo(z[0],z[1],z[2]);
  nextCountry();
}
function restart(){if(game.flagMode)startFlagQuiz(game.continent||'world');else if(game.riverMode)startRiverGame(game.difficulty);else if(game.lakeMode)startLakeGame(game.difficulty);else if(lastMode==='custom')startCustom();else startGame(lastMode);}
function back(){const sec=game.flagMode?3:game.riverMode?2:game.lakeMode?1:0;game={};goToGames(sec);}
function skip(){if(!canClick||!game||game.current===null||game.current===undefined)return;game.skipped=(game.skipped||0)+1;clearFeedback();updateStats();nextCountry();}

function lakeDisplayName(feat){const p=feat.properties;return(lang==='de'?p.name_de:p.name_en)||p.name||'?';}
const BEGINNER_LAKES=new Set(['Lake Baikal','Lake Victoria','Lake Superior','Lake Huron','Lake Michigan','Lake Erie','Lake Ontario','Lago Titicaca','Lake Tanganyika','Dead Sea','Lake Geneva','Bodensee','Lake Balaton']);
function getLakeFeatures(diff){
  if(!lakesData)return[];
  const named=lakesData.features.filter(f=>f.properties.name);
  if(diff==='beginner')return named.filter(f=>BEGINNER_LAKES.has(f.properties.name));
  const maxZoom={easy:2,medium:3,hard:4,extreme:99};
  return named.filter(f=>f.properties.min_zoom<=(maxZoom[diff]??99));
}
function getLakeColor(idx){
  const th=THEMES[theme];
  if(!game.lakeMode)return th.sph;
  if(game.found&&game.lakeRep){const rep=game.lakeRep[lakeDisplayName(game.lakeFeatures[idx])];if(game.found.has(rep))return th.found;}
  return th.sph;
}
function updateLakeColors(){
  if(!lakePaths)return;
  const th=THEMES[theme];
  lakePaths.attr('fill',d=>getLakeColor(d._i)).attr('stroke',th.border);
  if(lakeDots)lakeDots.attr('fill',d=>getLakeColor(d._i)).attr('stroke',th.border);
}

function riverDisplayName(feat){const p=feat.properties;return(lang==='de'?p.name_de:p.name_en)||p.name||'?';}
function getRiverFeatures(diff){
  if(!riversData)return[];
  const named=riversData.features.filter(f=>f.properties.name&&f.properties.featurecla!=='Lake Centerline');
  const counts={beginner:13,easy:44,medium:76,hard:144,extreme:214};
  const n=counts[diff]??named.length;
  const sorted=named.slice().sort((a,b)=>(a.properties.scalerank||99)-(b.properties.scalerank||99));
  return sorted.slice(0,n);
}
function getRiverColor(idx){const th=THEMES[theme];if(game.found&&game.found.has(idx))return th.found;return th.sph;}
function updateRiverColors(){if(!riverPaths)return;riverPaths.attr('stroke',d=>getRiverColor(d._i));}

async function startRiverGame(diff){
  if(!riversData){showFeedback(t('load'),'#888');await loadMap();}
  const feats=getRiverFeatures(diff);
  const indexed=feats.map((f,i)=>({...f,_i:i}));
  game={mode:'river',riverMode:true,difficulty:diff,
    riverFeatures:feats,
    queue:shuffle(feats.map((_,i)=>i)),
    current:null,found:new Set(),correct:0,wrong:0,firstTry:0,
    total:feats.length,wrongOnCurrent:false,skipped:0,_indexed:indexed};
  lastMode='river';canClick=true;optsOpen=false;
  showScreen('game-screen');$('opts-panel').style.display='none';
  $('target-name').textContent='';showFeedback(t('load'),'#888');
  updateAllText();
  if(worldData)renderMap(worldData);else await loadMap();
  nextCountry();
}

function handleRiverClick(idx){
  if(!canClick||!game||game.current===null||game.current===undefined)return;
  if(game.found.has(idx))return;
  const feat=game.riverFeatures[idx];
  const name=riverDisplayName(feat);
  if(idx===game.current){
    canClick=false;game.correct++;
    if(!game.wrongOnCurrent)game.firstTry++;
    game.found.add(idx);
    if(showWrongHint)showFeedback(t('correctFb')(name),THEMES[theme].found);
    updateRiverColors();updateStats();
    setTimeout(nextCountry,1100);
  }else{
    game.wrong++;game.wrongOnCurrent=true;
    if(showWrongHint)showFeedback(t('wrongFb')(name),THEMES[theme].wrong);
    riverPaths&&riverPaths.filter(d=>d._i===idx).attr('stroke',THEMES[theme].wrong);
    if(wrongFlash)clearTimeout(wrongFlash);
    wrongFlash=setTimeout(updateRiverColors,700);
    updateStats();
  }
}

async function startLakeGame(diff){
  if(!lakesData){showFeedback('Seen werden geladen …','#888');await loadMap();}
  const feats=getLakeFeatures(diff);
  const indexed=feats.map((f,i)=>({...f,_i:i}));
  const lakeRep={};const order=[];
  feats.forEach((f,i)=>{const n=lakeDisplayName(f);if(!(n in lakeRep)){lakeRep[n]=i;order.push(i);}});
  game={mode:'lake',lakeMode:true,difficulty:diff,
    lakeFeatures:feats,lakeRep,
    queue:shuffle(order),
    current:null,found:new Set(),correct:0,wrong:0,firstTry:0,
    total:order.length,wrongOnCurrent:false,skipped:0,_indexed:indexed};
  lastMode='lake';canClick=true;optsOpen=false;
  showScreen('game-screen');$('opts-panel').style.display='none';
  $('target-name').textContent='';showFeedback(t('load'),'#888');
  updateAllText();
  if(worldData)renderMap(worldData);else await loadMap();
  nextCountry();
}

function handleLakeClick(idx){
  if(!canClick||!game||game.current===null||game.current===undefined)return;
  const feat=game.lakeFeatures[idx];
  const name=lakeDisplayName(feat);
  const rep=game.lakeRep[name];
  if(game.found.has(rep))return;
  if(name===lakeDisplayName(game.lakeFeatures[game.current])){
    canClick=false;game.correct++;
    if(!game.wrongOnCurrent)game.firstTry++;
    game.found.add(rep);
    if(showWrongHint)showFeedback(t('correctFb')(name),THEMES[theme].found);
    updateLakeColors();updateStats();
    setTimeout(nextCountry,1100);
  }else{
    game.wrong++;game.wrongOnCurrent=true;
    if(showWrongHint)showFeedback(t('wrongFb')(name),THEMES[theme].wrong);
    lakePaths&&lakePaths.filter(d=>d._i===idx).attr('fill',THEMES[theme].wrong);
    lakeDots&&lakeDots.filter(d=>d._i===idx).attr('fill',THEMES[theme].wrong);
    if(wrongFlash)clearTimeout(wrongFlash);
    wrongFlash=setTimeout(updateLakeColors,700);
    updateStats();
  }
}

function zoomTo(cx,cy,k){
  if(!zoomBehavior)return;
  const svg=d3.select('#map');
  const W=960,H=500;
  const tx=W/2-cx*k,ty=H/2-cy*k;
  svg.transition().duration(600).call(zoomBehavior.transform,d3.zoomIdentity.translate(tx,ty).scale(k));
}

let lakesData=null,riversData=null;
async function loadMap(){
  if(worldData){renderMap(worldData);return;}
  try{
    [worldData,lakesData,riversData]=await Promise.all([
      fetch('https://cdn.jsdelivr.net/npm/world-atlas@2/countries-50m.json').then(r=>r.json()),
      fetch('https://cdn.jsdelivr.net/gh/nvkelso/natural-earth-vector@master/geojson/ne_50m_lakes.geojson').then(r=>r.json()).catch(()=>null),
      fetch('https://cdn.jsdelivr.net/gh/nvkelso/natural-earth-vector@master/geojson/ne_50m_rivers_lake_centerlines.geojson').then(r=>r.json()).catch(()=>null)
    ]);
    // Normalize known river sections to their common names, then merge same-named segments
    const RIVER_ALIASES={
      'Chang Jiang':'Yangtze','Jinsha':'Yangtze','Tongtian':'Yangtze','Tuotuo':'Yangtze',
      'Dihang':'Brahmaputra','Yarlung':'Brahmaputra','Maquan':'Brahmaputra',
      'Lancang':'Mekong',
      'Lualaba':'Congo',
      'Donau':'Danube','Borcea':'Danube','Bratul Chillia':'Danube','Bratul Sfintu Gheorghe':'Danube','Bratul Sulina':'Danube',
      'Bykovskaya Protoka':'Lena','Olenekskaya Protoka':'Lena',
      'Amazonas':'Amazon',
      'Ayeyarwady':'Irrawaddy','Nmai':'Irrawaddy','Irrawaddy Delta':'Irrawaddy',
      'Heilong Jiang':'Amur',"Argun'":'Amur','Hailar':'Amur',
      'El Bahr el Abyad':'Nile','Bahr el Jebel':'Nile','Kagera':'Nile','Damietta Branch':'Nile','Rosetta Branch':'Nile',
      'Ertix':'Irtysh',
      'Selenge (Selenga)':'Selenga',
      'Shiquan':'Indus',
      'Ucayali':'Amazon',
    };
    if(riversData){
      const byName={};
      riversData.features.forEach(f=>{
        const raw=f.properties.name;if(!raw)return;
        const n=RIVER_ALIASES[raw]||raw;
        (byName[n]=byName[n]||[]).push({...f,properties:{...f.properties,name:n}});
      });
      const merged=[];
      Object.values(byName).forEach(feats=>{
        if(feats.length===1){merged.push(feats[0]);return;}
        const lines=[];
        feats.forEach(f=>{if(f.geometry.type==='LineString')lines.push(f.geometry.coordinates);else if(f.geometry.type==='MultiLineString')lines.push(...f.geometry.coordinates);});
        const minSr=Math.min(...feats.map(f=>f.properties.scalerank||99));
        merged.push({type:'Feature',properties:{...feats[0].properties,scalerank:minSr},geometry:{type:'MultiLineString',coordinates:lines}});
      });
      riversData={...riversData,features:merged.concat(riversData.features.filter(f=>!f.properties.name))};
    }
    renderMap(worldData);
  }catch(e){showFeedback('Error','#C0432A');}
}

function isActive(id){
  if(game.lakeMode||game.riverMode)return false;
  if(game.mode==='custom')return game.customIds&&game.customIds.has(id);
  const ac=activeConts();
  if(!ac)return !!C[id];
  return C[id]&&ac.has(C[id].c);
}

function renderMap(world){
  const svg=d3.select('#map');svg.selectAll('*').remove();borderPath=null;gGroup=null;
  const th=THEMES[theme],W=960,H=500;
  const proj=d3.geoNaturalEarth1().scale(153).translate([W/2,H/2]).rotate([-8,0]);
  const gpath=d3.geoPath().projection(proj);
  svg.append('defs').html('<filter id="rv-glow" x="-80%" y="-80%" width="260%" height="260%"><feGaussianBlur in="SourceGraphic" stdDeviation="2.5" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter>');
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
  const NO_REDIRECT=new Set([304,10,540]); // 540=Neukaledonien
  // Dynamically block territories by centroid bounds (e.g. Französisch-Guayana)
  const GEO_NO_REDIRECT=[[[-56,-50],[1,7]]]; // [lonRange, latRange]
  countries.features.forEach(f=>{const [lo,la]=d3.geoCentroid(f);if(GEO_NO_REDIRECT.some(([[l0,l1],[a0,a1]])=>lo>=l0&&lo<=l1&&la>=a0&&la<=a1))NO_REDIRECT.add(+f.id);});
  const kc=countries.features.filter(f=>C[+f.id]).map(f=>({id:+f.id,ctr:d3.geoCentroid(f)}));
  countries.features.forEach(u=>{const uid=+u.id;if(C[uid])return;if(NO_REDIRECT.has(uid))return;const uc=d3.geoCentroid(u);let b=null,bd=Infinity;kc.forEach(({id,ctr})=>{const d=(uc[0]-ctr[0])**2+(uc[1]-ctr[1])**2;if(d<bd){bd=d;b=id;}});if(b!==null)REDIRECTS.set(uid,b);});
  // Geographic overrides for specific disputed/unrecognised territories
  countries.features.forEach(f=>{const uid=+f.id;if(uid>=0)return;const [lon,lat]=d3.geoCentroid(f);
    if(lon>43&&lon<50&&lat>7&&lat<13)REDIRECTS.set(uid,706); // Somaliland → Somalia
    if(lon>32&&lon<35&&lat>34&&lat<36)REDIRECTS.set(uid,196); // Nord-Zypern → Zypern
  });

  // Visually merge disputed territories into their parent country (no shared border)
  const geoms=world.objects.countries.geometries;
  const mergedPairs=[];
  let renderFeatures=countries.features;

  function mergeInto(parentId){
    const parentIdx=renderFeatures.findIndex(f=>+f.id===parentId);
    const childIdx=renderFeatures.findIndex(f=>+f.id<0&&REDIRECTS.get(+f.id)===parentId);
    if(parentIdx<0||childIdx<0)return;
    const gi=geoms[countries.features.indexOf(renderFeatures[parentIdx])];
    const gj=geoms[countries.features.indexOf(renderFeatures[childIdx])];
    if(!gi||!gj)return;
    const merged=topojson.merge(world,[gi,gj]);
    mergedPairs.push([gi,gj]);
    renderFeatures=renderFeatures
      .filter((_,i)=>i!==childIdx)
      .map(f=>+f.id===parentId?{...f,geometry:merged}:f);
  }

  mergeInto(706); // Somaliland → Somalia
  mergeInto(196); // Nord-Zypern → Zypern

  countryPaths=g.selectAll('.ct').data(renderFeatures).enter().append('path').attr('class','ct').attr('d',gpath).attr('stroke','none')
    .on('mouseover',function(ev,d){const id=eff(+d.id);if(!game.found||game.found.has(id)||!C[id]||!isActive(id))return;d3.select(this).attr('fill',THEMES[theme].hov);})
    .on('mouseout',function(ev,d){d3.select(this).attr('fill',getColor(+d.id));})
    .on('click',(ev,d)=>handleClick(+d.id));

  // Overlay dim paths for overseas territories embedded in parent-country MultiPolygons
  function overlayParts(parentId,indices){
    const feat=renderFeatures.find(f=>+f.id===parentId);
    if(!feat||feat.geometry.type!=='MultiPolygon')return;
    indices.forEach(idx=>{
      const coords=feat.geometry.coordinates[idx];
      if(coords){
        const f={type:'Feature',geometry:{type:'Polygon',coordinates:coords}};
        g.append('path').attr('class','fgui-overlay').datum(f).attr('d',gpath).attr('fill',th.dim).attr('stroke','none')
          .style('cursor','default').on('mouseover',()=>{}).on('click',()=>{});
      }
    });
  }
  // France: 3=Mayotte, 4=Réunion, 5=Martinique, 6/7/8=Guadeloupe, 9=Französisch-Guayana
  overlayParts(250,[3,4,5,6,7,8,9]);
  // Netherlands: 9=Curaçao, 10/11=Sint Maarten
  overlayParts(528,[9,10,11]);

  // Internal borders (country–country), hidden in lake mode
  const borderMesh=topojson.mesh(world,world.objects.countries,(a,b)=>{
    if(a===b)return false;
    for(const[g1,g2]of mergedPairs){if((a===g1&&b===g2)||(a===g2&&b===g1))return false;}
    return true;
  });
  borderPath=g.append('path').datum(borderMesh).attr('d',gpath).attr('fill','none').attr('stroke',th.border).attr('stroke-width',0.8).style('vector-effect','non-scaling-stroke').attr('pointer-events','none');

  // Coastlines (land–ocean boundary), always visible
  const coastMesh=topojson.mesh(world,world.objects.countries,(a,b)=>a===b);
  g.append('path').attr('class','coastline').datum(coastMesh).attr('d',gpath).attr('fill','none').attr('stroke',th.border).attr('stroke-width',0.8).style('vector-effect','non-scaling-stroke').attr('pointer-events','none');

  // Rivers — rendered before lakes so lakes appear on top; hidden in lake mode (they distract)
  riverPaths=null;riverHitboxes=null;
  if(riversData&&!game.lakeMode){
    const riverMode=game.riverMode||false;
    const allRivers=riversData.features.filter(f=>f.properties.name&&f.properties.featurecla!=='Lake Centerline');
    const visFeats=riverMode ? getRiverFeatures(game.difficulty) : allRivers.filter(f=>(f.properties.scalerank||9)<=3);
    const indexed=visFeats.map((f,i)=>({...f,_i:i}));
    riverPaths=g.append('g').attr('class','rivers').selectAll('path').data(indexed).enter().append('path')
      .attr('d',gpath).attr('fill','none').attr('stroke',th.sph).attr('stroke-width',riverMode?1.2:0.7)
      .style('vector-effect','non-scaling-stroke').style('pointer-events','none');
    if(riverMode){
      riverHitboxes=g.append('g').attr('class','river-hitboxes').selectAll('path').data(indexed).enter().append('path')
        .attr('d',gpath).attr('fill','none').attr('stroke','transparent').attr('stroke-width',10)
        .style('vector-effect','non-scaling-stroke').style('cursor','pointer')
        .on('mouseover',function(ev,d){
          if(game.found&&game.found.has(d._i))return;
          riverPaths.filter(r=>r._i===d._i).attr('stroke-width',2).attr('filter','url(#rv-glow)');
        })
        .on('mouseout',function(ev,d){riverPaths.filter(r=>r._i===d._i).attr('stroke-width',1.2).attr('filter',null);})
        .on('click',(ev,d)=>handleRiverClick(d._i));
    }
  }

  // Lakes — rendered after borders so fill covers borders inside lakes; stroke draws lake outline
  lakePaths=null;lakeDots=null;
  let lakeHit=null,microstateHit=null;
  if(lakesData){
    const lakeMode=game.lakeMode||false;
    const riverMode=game.riverMode||false;
    const named=lakesData.features.filter(f=>f.properties.name);
    const visFeats=lakeMode
      ? getLakeFeatures(game.difficulty)
      : riverMode
        ? getLakeFeatures('beginner')
        : named.filter(f=>f.properties.min_zoom<=3);
    const indexed=visFeats.map((f,i)=>({...f,_i:i}));
    lakePaths=g.append('g').attr('class','lakes').selectAll('path').data(indexed).enter().append('path')
      .attr('d',gpath).attr('fill',th.sph).attr('stroke',th.border).attr('stroke-width',0.6)
      .style('vector-effect','non-scaling-stroke');
    if(lakeMode){
      lakePaths.style('cursor','pointer')
        .on('mouseover',function(ev,d){if(game.found&&game.found.has(d._i))return;d3.select(this).attr('fill',th.hov);})
        .on('mouseout',function(ev,d){d3.select(this).attr('fill',getLakeColor(d._i));})
        .on('click',(ev,d)=>handleLakeClick(d._i));
    }else{
      lakePaths.style('cursor','default').on('mouseover',()=>{}).on('click',()=>{});
    }

    // Dots for small lakes (min_zoom > 1, i.e. small at world view): visible when zoomed out, hidden once polygon is big enough
    if(lakeMode){
      const smallFeats=indexed.filter(f=>(f.properties.min_zoom||4)>1);
      if(smallFeats.length>0){
        lakeDots=g.append('g').attr('class','lake-dots').selectAll('circle').data(smallFeats).enter().append('circle')
          .attr('cx',d=>gpath.centroid(d)[0]).attr('cy',d=>gpath.centroid(d)[1])
          .attr('r',DOT_R).attr('fill',d=>getLakeColor(d._i)).attr('stroke',th.border).attr('stroke-width',1.5)
          .style('vector-effect','non-scaling-stroke').style('pointer-events','none');
        lakeHit=g.append('g').attr('class','lake-hit').selectAll('circle').data(smallFeats).enter().append('circle')
          .attr('cx',d=>gpath.centroid(d)[0]).attr('cy',d=>gpath.centroid(d)[1])
          .attr('r',HIT_R).attr('fill','transparent').style('cursor','pointer')
          .on('mouseover',function(ev,d){const t=nearestDot(ev,lakeHit)||d;if(game.found&&game.found.has(t._i))return;lakeDots.filter(x=>x._i===t._i).attr('fill',th.hov);})
          .on('mouseout',function(){lakeDots.attr('fill',x=>getLakeColor(x._i));})
          .on('click',function(ev,d){const t=nearestDot(ev,lakeHit)||d;handleLakeClick(t._i);});
      }
    }
  }

  const activeDots=MICROSTATES.filter(m=>isActive(m.id));
  microstateDots=g.selectAll('.ms').data(activeDots).enter().append('circle').attr('class','ms')
    .attr('cx',d=>proj([d.lon,d.lat])[0]).attr('cy',d=>proj([d.lon,d.lat])[1])
    .attr('r',DOT_R).attr('stroke-width',1.5).style('vector-effect','non-scaling-stroke').style('pointer-events','none');
  microstateHit=g.append('g').attr('class','ms-hit').selectAll('circle').data(activeDots).enter().append('circle')
    .attr('cx',d=>proj([d.lon,d.lat])[0]).attr('cy',d=>proj([d.lon,d.lat])[1])
    .attr('r',d=>msHitR(d.id)).attr('fill','transparent').style('cursor','pointer')
    .on('mouseover',function(ev,d){const t=nearestDot(ev,microstateHit)||d;if(game.found&&game.found.has(t.id))return;microstateDots.filter(x=>x.id===t.id).attr('fill',THEMES[theme].hov);})
    .on('mouseout',function(){microstateDots.attr('fill',x=>getMSColor(x.id));})
    .on('click',function(ev,d){const t=nearestDot(ev,microstateHit)||d;handleClick(t.id);});

  // Returns dot radius in SVG units so it stays DOT_R screen-pixels regardless of window size or zoom
  function svgScale(){const r=svg.node().getBoundingClientRect();return r.width/960;}
  function dotR(zoomK=1){return DOT_R/svgScale()/zoomK;}
  function hitR(zoomK=1){return HIT_R/svgScale()/zoomK;}
  // Among a hit-circle selection, return the datum whose centre is nearest the pointer (nearest-wins on overlap)
  function nearestDot(ev,sel){
    const p=d3.pointer(ev,g.node());let best=null,bestD=Infinity;
    sel.each(function(d){if(this.style.display==='none')return;const dx=(+this.getAttribute('cx'))-p[0],dy=(+this.getAttribute('cy'))-p[1],dd=dx*dx+dy*dy;if(dd<bestD){bestD=dd;best=d;}});
    return best;
  }

  function applyDotR(zoomK=1){
    const msDisp=d=>((d.id===20||d.id===470)&&zoomK>=5)||(d.id===442&&zoomK>=4)||(d.id===780&&zoomK>=3)||((d.id===548||d.id===90||d.id===270||d.id===388)&&zoomK>=2)?'none':'';
    const lkDisp=d=>zoomK>=(d.properties.min_zoom||4)?'none':'';
    if(microstateDots)microstateDots.attr('r',dotR(zoomK)).style('display',msDisp);
    if(microstateHit)microstateHit.attr('r',d=>msHitR(d.id)/svgScale()/zoomK).style('display',msDisp);
    if(lakeDots)lakeDots.attr('r',dotR(zoomK)).style('display',lkDisp);
    if(lakeHit)lakeHit.attr('r',hitR(zoomK)).style('display',lkDisp);
  }
  applyDotR();

  // Update dots on window resize (SVG scale changes)
  const _ro=new ResizeObserver(()=>applyDotR(_lastT?_lastT.k:1));
  _ro.observe(svg.node());

  const gNode=g.node();
  let _raf=null,_lastT=null,_pTimer=null;
  zoomBehavior=d3.zoom().scaleExtent([1,12]).on('zoom',ev=>{
    _lastT=ev.transform;
    if(!_pTimer)gNode.style.pointerEvents='none';
    clearTimeout(_pTimer);
    _pTimer=setTimeout(()=>{gNode.style.pointerEvents='';_pTimer=null;},150);
    if(!_raf)_raf=requestAnimationFrame(()=>{
      g.attr('transform',_lastT);
      applyDotR(_lastT.k);
      _raf=null;
    });
  });
  svg.call(zoomBehavior);
  $('map-bg').style.background=th.bg;updateColors();
}

function getColor(rawId){const id=eff(rawId),th=THEMES[theme];if(game.lakeMode||game.riverMode)return th.avail;if(!C[id])return th.dim;if(keepFound&&game.found&&game.found.has(id))return th.found;if(!isActive(id))return th.dim;return th.avail;}
function getMSColor(id){const th=THEMES[theme];if(keepFound&&game.found&&game.found.has(id))return th.found;if(!isActive(id))return th.dim;return th.avail;}
function updateColors(){if(!countryPaths)return;const th=THEMES[theme];
  if(game.lakeMode||game.riverMode){
    countryPaths.attr('fill',th.avail).attr('cursor','default');
    if(microstateDots)microstateDots.attr('fill',th.avail).attr('cursor','default');
    if(borderPath)borderPath.style('display','none');
    d3.select('#map path.coastline').style('display','none');
  }else{
    countryPaths.attr('fill',d=>getColor(+d.id)).attr('cursor',d=>{const id=eff(+d.id);return isActive(id)?'pointer':'default';});
    if(microstateDots)microstateDots.attr('fill',d=>getMSColor(d.id)).attr('stroke',th.border).attr('cursor',d=>isActive(d.id)?'pointer':'default');
    if(borderPath)borderPath.style('display','');
    d3.select('#map path.coastline').style('display','');
  }
  d3.selectAll('.fgui-overlay').attr('fill',(game.lakeMode||game.riverMode)?th.avail:th.dim);
  updateLakeColors();
  updateRiverColors();
}
function nextCountry(){canClick=true;if(game.queue&&game.found){while(game.queue.length&&game.found.has(game.queue[0]))game.queue.shift();}if(!game.queue||game.queue.length===0){showResult();return;}game.current=game.queue.shift();game.wrongOnCurrent=false;if(game.riverMode){const f=game.riverFeatures[game.current];$('target-name').textContent=f?riverDisplayName(f):'?';}else if(game.lakeMode){const f=game.lakeFeatures[game.current];$('target-name').textContent=f?lakeDisplayName(f):'?';}else{$('target-name').textContent=cn(game.current);}clearFeedback();updateStats();updateColors();}
function flashWrong(rawId){countryPaths&&countryPaths.filter(d=>+d.id===rawId).attr('fill',THEMES[theme].wrong);microstateDots&&microstateDots.filter(d=>d.id===rawId).attr('fill',THEMES[theme].wrong);if(wrongFlash)clearTimeout(wrongFlash);wrongFlash=setTimeout(updateColors,700);}
function handleClick(rawId){if(!canClick||!game||!game.current)return;const id=eff(rawId);const info=C[id];if(!info||!isActive(id)||game.found.has(id))return;if(id===game.current){canClick=false;game.correct++;if(!game.wrongOnCurrent)game.firstTry++;game.found.add(id);if(showWrongHint)showFeedback(t('correctFb')(cn(id)),THEMES[theme].found);updateColors();updateStats();setTimeout(nextCountry,1100);}else{game.wrong++;game.wrongOnCurrent=true;if(showWrongHint)showFeedback(t('wrongFb')(cn(id)),THEMES[theme].wrong);flashWrong(rawId);updateStats();}}
function updateStats(){const dn=game.found?game.found.size:0,tot=game.total||1,rm=(game.queue?game.queue.length:0)+(game.current?1:0);$('score-disp').textContent=dn+'/'+tot;$('stat-c').textContent=game.correct||0;$('stat-w').textContent=game.wrong||0;$('stat-s').textContent=game.skipped||0;$('lbl-s').textContent=t('skippedLbl');$('stat-r').textContent=rm+' '+t('remLbl');$('prog-bar').style.width=Math.round((dn/tot)*100)+'%';}
function showResult(){game.current=null;showScreen('result-screen');const p=game.total>0?Math.round((game.firstTry/game.total)*100):0;$('res-emoji').textContent=p>=90?'🏆':p>=70?'🎉':p>=50?'👍':'📚';$('res-title').textContent=t('resTitle');$('res-l1').textContent=t('res1')(game.firstTry,game.total,p);const sk=game.skipped||0;$('res-l2').textContent=t('res2')(game.correct,game.wrong)+(sk>0?', '+sk+' '+t('skippedLbl'):'');$('btn-again').textContent=t('again');$('btn-new').textContent=t('newgame');}

// ── FLAG QUIZ ──
let _fMatches=[],_fDdIdx=0;

function startFlagQuiz(cont){
  const ids=Object.keys(C).map(Number).filter(id=>ISO2[id]&&(cont==='world'||C[id].c===cont));
  for(let i=ids.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[ids[i],ids[j]]=[ids[j],ids[i]];}
  game={flagMode:true,flagQueue:ids.slice(),flagCorrect:0,flagWrong:0,flagTotal:ids.length,flagFound:new Set(),continent:cont};
  showScreen('flag-screen');
  $('flag-btn-back').textContent=t('back');
  $('flag-lbl-c').textContent=t('correctLbl');
  $('flag-lbl-w').textContent=t('wrongLbl');
  nextFlag();
}

function nextFlag(){
  if(!game.flagQueue||game.flagQueue.length===0){showFlagResult();return;}
  game.flagCurrent=game.flagQueue.shift();
  $('flag-img').src='https://flagcdn.com/w320/'+ISO2[game.flagCurrent]+'.png';
  const inp=$('flag-input');
  inp.value='';inp.placeholder=t('flagPlaceholder');
  $('flag-dropdown').style.display='none';
  _fMatches=[];_fDdIdx=0;
  updateFlagStats();
  setTimeout(()=>inp.focus(),50);
}

function handleFlagInput(val){
  const v=val.trim().toLowerCase();
  if(!v){$('flag-dropdown').style.display='none';_fMatches=[];return;}
  _fMatches=Object.keys(C).map(Number).filter(id=>ISO2[id]&&((lang==='de'?C[id].de:C[id].en).toLowerCase().includes(v)))
    .sort((a,b)=>{
      const na=(lang==='de'?C[a].de:C[a].en).toLowerCase();
      const nb=(lang==='de'?C[b].de:C[b].en).toLowerCase();
      return (na.startsWith(v)?0:1)-(nb.startsWith(v)?0:1)||na.localeCompare(nb);
    }).slice(0,6);
  _fDdIdx=0;
  renderFlagDropdown();
}

function renderFlagDropdown(){
  const dd=$('flag-dropdown');
  if(!_fMatches.length){dd.style.display='none';return;}
  dd.innerHTML=_fMatches.map((id,i)=>`<div onclick="selectFlagItem(${i})" style="padding:8px 14px;cursor:pointer;font-size:14px;${i===_fDdIdx?'background:#2a2a2a;color:#eee;':'color:#ccc;'}">${lang==='de'?C[id].de:C[id].en}</div>`).join('');
  dd.style.display='block';
}

function selectFlagItem(i){
  $('flag-input').value=lang==='de'?C[_fMatches[i]].de:C[_fMatches[i]].en;
  $('flag-dropdown').style.display='none';_fMatches=[];
  submitFlag();
}

let _flagFbTimer=null;
function showFlagFb(text,color){
  const el=$('flag-fb');if(!el)return;
  el.textContent=text;el.style.color=color;el.style.opacity='1';
  if(_flagFbTimer)clearTimeout(_flagFbTimer);
  _flagFbTimer=setTimeout(()=>{el.style.opacity='0';},2000);
}

function submitFlag(){
  const val=$('flag-input').value.trim().toLowerCase();
  if(!val||!game.flagCurrent)return;
  const id=game.flagCurrent;
  if(val===C[id].de.toLowerCase()||val===C[id].en.toLowerCase()){
    game.flagCorrect++;game.flagFound.add(id);
    showFlagFb('✓ '+(lang==='de'?C[id].de:C[id].en),'#1D9E75');
    updateFlagStats();
    setTimeout(nextFlag,500);
  }else{
    game.flagWrong++;
    showFlagFb('✗ '+(lang==='de'?'Falsch!':'Wrong!'),'#D85A30');
    $('flag-input').value='';
    updateFlagStats();
  }
}

function updateFlagStats(){
  const found=game.flagFound?game.flagFound.size:0,tot=game.flagTotal||1;
  $('flag-score').textContent=found+'/'+tot;
  $('flag-stat-c').textContent=game.flagCorrect||0;
  $('flag-stat-w').textContent=game.flagWrong||0;
  $('flag-stat-r').textContent=(game.flagQueue?game.flagQueue.length:0)+' '+t('remLbl');
  $('flag-prog').style.width=Math.round((found/tot)*100)+'%';
}

function showFlagResult(){
  game.flagCurrent=null;
  const p=game.flagTotal>0?Math.round((game.flagCorrect/game.flagTotal)*100):0;
  $('res-emoji').textContent=p>=90?'🏆':p>=70?'🎉':p>=50?'👍':'📚';
  $('res-title').textContent=t('resTitle');
  $('res-l1').textContent=t('res1')(game.flagCorrect,game.flagTotal,p);
  $('res-l2').textContent=t('res2')(game.flagCorrect,game.flagWrong);
  $('btn-again').textContent=t('again');$('btn-new').textContent=t('newgame');
  showScreen('result-screen');
}

// Flag quiz keyboard handling
(function(){
  const inp=$('flag-input');
  if(!inp)return;
  inp.addEventListener('keydown',function(e){
    if(e.key==='Tab'){
      e.preventDefault();
      if(_fMatches.length>0){
        $('flag-input').value=lang==='de'?C[_fMatches[_fDdIdx]].de:C[_fMatches[_fDdIdx]].en;
        $('flag-dropdown').style.display='none';_fMatches=[];
      }
    }else if(e.key==='Enter'){
      e.preventDefault();
      if(_fMatches.length>0&&$('flag-dropdown').style.display!=='none'){
        $('flag-input').value=lang==='de'?C[_fMatches[_fDdIdx]].de:C[_fMatches[_fDdIdx]].en;
        $('flag-dropdown').style.display='none';_fMatches=[];
      }
      submitFlag();
    }else if(e.key==='ArrowDown'){
      e.preventDefault();
      if(_fMatches.length>0){_fDdIdx=Math.min(_fDdIdx+1,_fMatches.length-1);renderFlagDropdown();}
    }else if(e.key==='ArrowUp'){
      e.preventDefault();
      if(_fMatches.length>0){_fDdIdx=Math.max(_fDdIdx-1,0);renderFlagDropdown();}
    }else if(e.key==='Escape'){
      $('flag-dropdown').style.display='none';_fMatches=[];
    }
  });
})();

renderHome();updateAllText();showScreen('home-screen');
